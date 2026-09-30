import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, Filter, Info, Loader2, Megaphone, MessageCircleReply, PhoneCall, PoundSterling, Radio,
  RefreshCw, Sprout, Star, Target, Trophy, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { useWhatsAppUnread } from '@/hooks/useWhatsAppUnread';
import { useEarnings } from '@/hooks/useEarnings';
import { WeeklyTierTracker } from '@/components/salesDash/WeeklyTracker';
import { EarnedCelebration } from '@/components/salesDash/EarnedCelebration';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { CALL_OUTCOMES } from '@/lib/salesCrm';
import { templateLabel, WHATSAPP_TEMPLATES } from '@/types/outreach';
import { STALE_OFFER_TEMPLATES } from '@/lib/findableOffer';
import {
  CHANNEL_LABELS, PERIODS, leadSourceLabel, rate,
  type CampaignRow, type FunnelCounts, type SalesPerformance, type TemplateRow,
} from '@/lib/salesPerformance';
import { parseTargets, type FollowUpGroup, type SalesWorkspace, type StageKey, type TargetInput, type Warmth } from '@/lib/salesWorkspace';
import { leadTarget, type LeadLink } from '@/lib/salesLinks';
import { writeCampaignFilter } from '@/lib/outreachPrefs';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { SlidersHorizontal } from 'lucide-react';
import { useDashboardPrefs } from '@/hooks/useDashboardPrefs';
import { campaignKey, templateKey, visibleRows, toggleHidden, inactiveKeys, INACTIVE_DAYS } from '@/lib/dashboardVisibility';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Empty, KpiCard, Panel, TONE, gbp } from '@/components/salesDash/ui';
import { TeamBoard } from '@/components/team/TeamBoard';
import {
  ActivityFeed, FollowUpQueue, HealthPanel, LeadListSheet, MilestonesPanel, NextActions, PipelineStrip, RecapPanel,
  TargetsDialog, TargetsPanel, TodayStrip, TrendsPanel, WaitingPanel, WarmthPanel, WARMTH, FOLLOW_UP_GROUPS,
} from '@/components/salesDash/sections';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALES DASHBOARD (2026-09-28; redesigned in the Sales Experience pass the same day).
   Both roles, one page. A salesperson sees their own leads only — decided by the server
   (fn sales-performance), never by this page. The admin can pick a person or everyone.
   The numbers' rules live in src/lib/salesPerformance.ts (the funnel, campaigns, templates) and
   src/lib/salesWorkspace.ts (Today, pipeline, next actions, follow-ups, temperature, feed, health,
   trends, milestones, targets); the page only draws them. Colours: src/components/salesDash/ui.tsx.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

type Perf = SalesPerformance & { ok: true; scope: { person: string | null; self: boolean; role: string }; ms: number; workspace: SalesWorkspace };

const pct = (n: number, d: number) => { const r = rate(n, d); return r === null ? '—' : `${r}%`; };

// user_preferences is not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(now));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** The person's own targets (their own row — RLS). Sent to the server only for their own numbers. */
function useMyTargets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ['sales-targets', user?.id] as const;
  const q = useQuery({
    queryKey: key, enabled: !!user?.id, staleTime: 5 * 60_000,
    queryFn: async (): Promise<TargetInput | null> => {
      const { data, error } = await sb.from('user_preferences').select('sales_targets').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return parseTargets(data?.sales_targets);
    },
  });
  const save = useMutation({
    mutationFn: async (next: TargetInput | null) => {
      const { error } = await sb.from('user_preferences').upsert({ user_id: user!.id, sales_targets: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => { qc.setQueryData(key, parseTargets(next)); void qc.invalidateQueries({ queryKey: ['sales-performance'] }); toast({ title: next ? 'Targets saved' : 'Targets cleared' }); },
    onError: () => toast({ title: 'Could not save your targets', description: 'Nothing was changed. Try again.', variant: 'destructive' }),
  });
  return { targets: q.data ?? null, loaded: q.isFetched, save: save.mutate, saving: save.isPending };
}

/** Meta's state for a template, from the one sendable registry (a name there is registered and
 *  approved at Meta — CLAUDE.md §6); a blocked offer body and a retired name say so. */
function metaStatus(t: string): { label: string; tone: 'green' | 'red' | 'grey' } {
  if (STALE_OFFER_TEMPLATES.has(t)) return { label: 'Blocked', tone: 'red' };
  if (WHATSAPP_TEMPLATES.some((x) => x.value === t)) return { label: 'Approved', tone: 'green' };
  return { label: 'Retired', tone: 'grey' };
}

export default function SalesDashboard() {
  const { role } = useSubscription();
  const { user } = useAuth();
  const team = useTeamDirectory();
  const navigate = useNavigate();
  const isAdmin = role === 'admin';
  const [period, setPeriod] = useState<string>('all');
  /* ?person=<userId> (2026-09-30): the admin dashboard's Team comparison opens one salesperson's view
     here. Admin only — a salesperson's page is always their own, whatever the URL says. */
  const [searchParams] = useSearchParams();
  const linkedPerson = searchParams.get('person');
  const [person, setPerson] = useState<string>(isAdmin ? (linkedPerson ? (linkedPerson === user?.id ? 'me' : linkedPerson) : 'all') : 'me');
  const mine = useMyTargets();
  const viewingSelf = !isAdmin || person === 'me';
  const q = useQuery({
    queryKey: ['sales-performance', role, isAdmin ? person : 'me', period, viewingSelf ? mine.targets : null],
    enabled: !!role && mine.loaded,
    staleTime: 60_000,
    queryFn: () => invokeEdge<Perf>('sales-performance', { period, person: isAdmin ? person : 'me', targets: viewingSelf ? mine.targets : null }),
  });
  const d = q.data;
  const w = d?.workspace;
  const unread = useWhatsAppUnread();
  /* Commission: the payment ledger through fn sales-earnings — the same numbers as the Earnings page. */
  const earn = useEarnings(isAdmin ? person : 'me');
  const et = earn.data?.totals;
  /* ⛔ DISPLAY ONLY: which campaign / template rows THIS person sees. Every number is computed on the
     server exactly as before; the funnel and totals include hidden rows (src/lib/dashboardVisibility.ts). */
  const prefs = useDashboardPrefs();
  const campaigns = d ? visibleRows<CampaignRow>(d.campaigns, prefs.hidden.campaigns, campaignKey) : [];
  const templates = d ? visibleRows<TemplateRow>(d.templates, prefs.hidden.templates, templateKey) : [];

  const go = (link: LeadLink, leadId: string) => { const [path, state] = leadTarget(link, leadId); navigate(path, state ? { state } : undefined); };
  const [sheet, setSheet] = useState<{ title: string; description?: string; leads: SalesWorkspace['pipeline'][number]['leads']; link: LeadLink } | null>(null);
  const [fuGroup, setFuGroup] = useState<FollowUpGroup>('overdue');
  const [targetsOpen, setTargetsOpen] = useState(false);
  const openStage = (k: StageKey) => { const p = w?.pipeline.find((x) => x.key === k); if (p) setSheet({ title: `${p.label} · ${p.count}`, description: 'Your leads at this stage now, most recently active first.', leads: p.leads, link: k === 'replied' || k === 'interested' || k === 'signup_sent' ? 'whatsapp' : 'lead' }); };
  const openWarmth = (k: Warmth) => {
    if (!w) return;
    const leads = w.pipeline.flatMap((p) => p.leads).filter((l) => l.warmth === k);
    setSheet({ title: `${WARMTH[k].label} · ${leads.length}`, description: WARMTH[k].rule, leads, link: 'whatsapp' });
  };
  const showGroup = (g: FollowUpGroup) => { setFuGroup(g); document.getElementById('follow-ups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const firstUnread = unread.rows[0]?.lead_id ?? null;
  const personName = (team.data ?? []).find((m) => m.user_id === user?.id)?.display_name?.split(' ')[0];
  const scopeLabel = isAdmin ? (person === 'all' ? 'Everyone' : person === 'me' ? 'You' : (team.data ?? []).find((m) => m.user_id === person)?.display_name ?? 'One person') : null;
  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? '';
  const fuDefault = useMemo(() => {
    if (!w) return 'overdue' as FollowUpGroup;
    return (FOLLOW_UP_GROUPS.find((g) => w.followUps[g.key].length > 0)?.key ?? 'overdue') as FollowUpGroup;
  }, [w]);
  const [fuTouched, setFuTouched] = useState(false);

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-6">
      <EarnedCelebration lines={earn.data?.lines} enabled={viewingSelf && !!earn.data?.commissionable} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{greeting()}{personName ? `, ${personName}` : ''}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sales dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{isAdmin ? `Showing: ${scopeLabel}.` : 'Your leads, your numbers.'} {periodLabel && period !== 'all' ? `Totals for ${periodLabel.toLowerCase()}.` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="h-9 w-44 text-xs" aria-label="Whose numbers"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone (whole book)</SelectItem>
                <SelectItem value="me">Me</SelectItem>
                {(team.data ?? []).filter((m) => m.status === 'active' && m.user_id !== user?.id).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-9 w-36 text-xs" aria-label="Period"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', q.isFetching && 'animate-spin')} />Refresh
          </Button>
        </div>
      </header>

      {q.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />)}
          <p className="col-span-full flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Counting…</p>
        </div>
      )}
      {q.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load the numbers: {edgeErrorMessage(q.error)}
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      )}

      {/* The Team board (2026-10-01): what Paul sent THIS salesperson — their own, never another's. It loads on
          its own, so a slow numbers read never hides a task. The admin's view of it is on the Admin dashboard. */}
      {role === 'sales' && <TeamBoard />}

      {d && w && (
        <>
          {/* ── The four headline numbers. Money is the strongest surface. ── */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
            <div className="col-span-3 lg:col-span-1">
              <KpiCard hero label="Commission earned" icon={Wallet} tone="green" value={et ? gbp(et.earned) : earn.isError ? '—' : '…'}
                sub={et ? `${gbp(et.due)} due ${new Date(`${et.nextPayoutDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${et.projected ? ` · ${gbp(et.projected)} projected` : ''}` : earn.isError ? 'Could not load earnings.' : 'Adding it up…'}
                onClick={() => navigate('/earnings')} />
            </div>
            <KpiCard label="Replies" icon={MessageCircleReply} tone="blue" value={d.funnel.responded} sub={d.funnel.contacted ? `${pct(d.funnel.responded, d.funnel.contacted)} of ${d.funnel.contacted} contacted · ${w.today.replies} today` : "Nobody contacted yet"} onClick={() => navigate('/inbox')} />
            <KpiCard label="Interested" icon={Star} tone="green" value={d.funnel.interested} sub={`${w.today.interested} today · ${d.funnel.notInterested} not interested`} onClick={() => openStage('interested')} />
            <KpiCard label="Clients won" icon={Trophy} tone="green" value={d.funnel.won} sub={d.funnel.won ? `${pct(d.funnel.won, d.funnel.contacted)} of contacted` : 'Your first win shows here'} onClick={() => openStage('paid')} />
          </div>

          {/* The weekly commission tier (2026-09-29): one salesperson's week — never a mix of sellers. */}
          {earn.data?.commissionable && person !== 'all' && <WeeklyTierTracker lines={earn.data.lines} />}

          <TodayStrip t={w.today} unread={viewingSelf ? unread.count : null} earnedToday={et ? et.earnedToday : null}
            onUnread={() => (firstUnread ? go('whatsapp', firstUnread) : navigate('/inbox'))} onFollowUps={() => showGroup(w.followUps.overdue.length ? 'overdue' : 'dueToday')} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-3"><NextActions items={w.nextActions} go={go} onFocus={viewingSelf ? () => navigate('/focus') : undefined} /></div>
            <div className="min-w-0 lg:col-span-2"><FollowUpQueue fu={w.followUps} go={go} group={fuTouched ? fuGroup : fuDefault} setGroup={(g) => { setFuTouched(true); setFuGroup(g); }} /></div>
          </div>

          <PipelineStrip pipeline={w.pipeline} notInterested={w.notInterested} onOpen={openStage} />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <WaitingPanel waiting={w.waiting} go={go} />
            <WarmthPanel warmth={w.warmth} onOpen={openWarmth} />
            <div className="min-w-0 md:col-span-2 xl:col-span-1"><HealthPanel health={w.health} onGroup={(g) => { setFuTouched(true); showGroup(g); }} /></div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2"><ActivityFeed items={w.activity} go={go} /></div>
            <div className="min-w-0 space-y-5">
              <RecapPanel r={w.recap} earnedToday={et ? et.earnedToday : null} />
              {viewingSelf && <TargetsPanel targets={w.targets} canEdit={viewingSelf} onEdit={() => setTargetsOpen(true)} />}
            </div>
          </div>

          {viewingSelf && <MilestonesPanel items={w.milestones} />}
          <TrendsPanel trends={w.trends} />

          <Panel collapseKey="sales.conversion" title="Conversion" icon={Filter} tone="blue" hint="From contacted to won. The small grey figure is the rate.">
            <Funnel f={d.funnel} />
            <Focus d={d} templates={templates} />
          </Panel>

          <Panel collapseKey="sales.campaigns" title="Campaigns" icon={Megaphone} tone="blue" hint="Which campaign is working. Tap one to open its leads in Outreach." action={<ManageRows kind="campaigns" all={d.campaigns.map((r) => ({ key: campaignKey(r), label: r.name, lastActivityAt: r.lastActivityAt }))} hidden={prefs.hidden.campaigns} onChange={(next) => prefs.setHidden({ ...prefs.hidden, campaigns: next })} />}>
            <CampaignCards rows={campaigns} onOpen={(id) => { writeCampaignFilter(user?.id, id); navigate('/outreach'); }} />
          </Panel>
          <Panel collapseKey="sales.templates" title="Templates" icon={MessageCircleReply} tone="blue" hint="Which message gets replies. A reply counts for the last template sent before it; “Unclear” means two different templates went out before they replied. Interested, link and won count the people whose reply that template earned." action={<ManageRows kind="templates" all={d.templates.map((r) => ({ key: templateKey(r), label: templateLabel(r.template), lastActivityAt: r.lastActivityAt }))} hidden={prefs.hidden.templates} onChange={(next) => prefs.setHidden({ ...prefs.hidden, templates: next })} />}>
            <TemplateTable rows={templates} />
          </Panel>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Panel collapseKey="sales.channels" title="Channels" icon={Radio} tone="blue" hint="A lead counts once per channel. Calls, LinkedIn, email and in person come from what you logged on the lead.">
              <ChannelBars rows={d.channels} />
            </Panel>
            <Panel collapseKey="sales.sources" title="Where leads came from" icon={Sprout} tone="green" hint="App search, or where you found a lead you added by hand.">
              <SimpleTable head={['Source', 'Leads', 'Contacted', 'Replied', 'Interested', 'Won']}
                rows={d.sources.map((s) => [leadSourceLabel(s.source), s.leads, s.contacted, s.responded, s.interested, s.won])} empty="No leads yet." />
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Panel collapseKey="sales.calls" title="Calls" icon={PhoneCall} tone="grey" hint={`Logged call outcomes${period === 'all' ? '' : ' in this period'}.`}>
              <p className="mb-2 text-3xl font-bold tabular-nums">{d.calls.total}</p>
              <div className="flex flex-wrap gap-1.5">
                {CALL_OUTCOMES.filter((o) => d.calls.byOutcome[o.value]).map((o) => (
                  <span key={o.value} className="rounded-full border border-border/60 px-2.5 py-1 text-xs">{o.label} <span className="font-semibold">{d.calls.byOutcome[o.value]}</span></span>
                ))}
                {d.calls.total === 0 && <span className="text-xs text-muted-foreground">No calls logged yet. Log one from the lead's Work tab.</span>}
              </div>
            </Panel>
            <Panel collapseKey="sales.won" title="Won" icon={Trophy} tone="green" hint="Leads that became paying clients.">
              {d.won.length === 0 ? <Empty icon={Trophy}>None yet — your first client will be listed here.</Empty> : (
                <ul className="space-y-1.5 text-sm">{d.won.map((x, i) => <li key={i} className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2"><Trophy className="h-4 w-4 text-emerald-600" /><span className="font-medium">{x.name}</span><span className="text-xs text-muted-foreground">· {x.campaign}</span></li>)}</ul>
              )}
            </Panel>
          </div>
          <HowCounted d={d} />
        </>
      )}

      <LeadListSheet open={!!sheet} onOpenChange={(v) => { if (!v) setSheet(null); }} title={sheet?.title ?? ''} description={sheet?.description} leads={sheet?.leads ?? []} go={(l, id) => { setSheet(null); go(l, id); }} defaultLink={sheet?.link} />
      <TargetsDialog open={targetsOpen} onOpenChange={setTargetsOpen} initial={mine.targets} saving={mine.saving} onSave={(t) => { mine.save(t && Object.keys(t).length > 1 ? t : null); setTargetsOpen(false); }} />
    </div>
  );
}

function Funnel({ f }: { f: FunnelCounts }) {
  const steps: { label: string; value: number; sub: string }[] = [
    { label: 'Contacted', value: f.contacted, sub: `${f.leads} leads` },
    { label: 'Replied', value: f.responded, sub: `${pct(f.responded, f.contacted)} of contacted` },
    { label: 'Interested', value: f.interested, sub: `${pct(f.interested, f.contacted)} of contacted` },
    { label: 'Sign-up link sent', value: f.onboardingSent, sub: `${pct(f.onboardingSent, f.interested)} of interested` },
    { label: 'Link opened', value: f.onboardingOpened, sub: `${pct(f.onboardingOpened, f.onboardingSent)} of sent` },
    { label: 'Won', value: f.won, sub: `${pct(f.won, f.onboardingSent)} of sent` },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-6" data-testid="sales-funnel">
      {steps.map((s, i) => (
        <div key={s.label} className="relative rounded-xl bg-muted/40 p-2.5 sm:p-3">
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-muted-foreground sm:text-[11px]">{s.label}</p>
          <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{s.value}</p>
          <p className="text-[11px] text-muted-foreground">{s.sub}</p>
          {i < steps.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/40 lg:block" />}
        </div>
      ))}
      <p className="col-span-full text-[11px] text-muted-foreground">Not interested now: <span className="font-semibold text-foreground">{f.notInterested}</span> · Followed up (two or more contacts): <span className="font-semibold text-foreground">{f.followedUp}</span></p>
    </div>
  );
}

/** Plain, actionable pointers from counts that exist. Nothing is suggested from a sample too small to mean anything. */
function Focus({ d, templates }: { d: SalesPerformance; templates: TemplateRow[] }) {
  const MIN = 10;
  const t = templates.filter((r) => r.leadsSent >= MIN).map((r) => ({ r, rate: (r.replies / r.leadsSent) }));
  const best = t.length > 1 ? t.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;
  const worst = t.length > 1 ? t.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
  const items: string[] = [];
  if (d.focus.interestedNoLink > 0) items.push(`${d.focus.interestedNoLink} interested lead${d.focus.interestedNoLink === 1 ? ' has' : 's have'} not been sent the sign-up link yet.`);
  if (d.focus.openedNotWon > 0) items.push(`${d.focus.openedNotWon} opened the sign-up page but ${d.focus.openedNotWon === 1 ? 'has' : 'have'} not paid. Worth a call.`);
  if (best && worst && best !== worst) items.push(`Best reply rate: ${templateLabel(best.r.template)} (${Math.round(best.rate * 100)}% of ${best.r.leadsSent}). Lowest: ${templateLabel(worst.r.template)} (${Math.round(worst.rate * 100)}% of ${worst.r.leadsSent}).`);
  if (items.length === 0) return null;
  return (
    <div className="mt-3 rounded-xl border border-blue-500/25 bg-blue-500/[0.06] p-3" data-testid="sales-focus">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Target className="h-4 w-4 text-blue-600" />Where to focus</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Template comparisons only use templates sent to at least {MIN} leads.</p>
    </div>
  );
}

/* A cell: the number, with its rate small and grey underneath; `wide` columns hide below md. */
type Cell = { v: string | number | JSX.Element; sub?: string; wide?: boolean; key?: string };
const MIN_FOR_RANK = 10;

/** Which row is best / lowest on a rate, among rows with enough behind them to mean anything. */
function rank<T>(rows: T[], num: (r: T) => number, den: (r: T) => number): { best: T | null; worst: T | null } {
  const eligible = rows.filter((r) => den(r) >= MIN_FOR_RANK);
  if (eligible.length < 2) return { best: null, worst: null };
  const by = (r: T) => num(r) / den(r);
  const best = eligible.reduce((a, b) => (by(b) > by(a) ? b : a));
  const worst = eligible.reduce((a, b) => (by(b) < by(a) ? b : a));
  return best === worst ? { best: null, worst: null } : { best, worst };
}

/** Campaigns as cards: the reply rate as a bar, "best / lowest" only with 10+ contacted behind it. */
function CampaignCards({ rows, onOpen }: { rows: CampaignRow[]; onOpen: (campaignId: string | null) => void }) {
  const { best, worst } = rank(rows, (r) => r.responded, (r) => r.contacted);
  if (rows.length === 0) return <Empty icon={Megaphone}>No campaign activity yet.</Empty>;
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const rr = rate(r.responded, r.contacted);
          const tag = r === best ? 'best' : r === worst ? 'lowest' : null;
          return (
            <li key={campaignKey(r)}>
              <button type="button" onClick={() => onOpen(r.campaignId)} disabled={!r.campaignId}
                className={cn('flex h-full w-full flex-col gap-2.5 rounded-xl border p-3.5 text-left transition',
                  tag === 'best' ? 'border-emerald-500/40 bg-emerald-500/[0.05]' : 'border-border/60',
                  r.campaignId && 'hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary')}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold" title={r.name}>{r.name}</span><span className="text-[11px] text-muted-foreground">{r.leads} {r.leads === 1 ? "lead" : "leads"} · {r.contacted} contacted</span></span>
                  {tag && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', tag === 'best' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/10 text-red-700 dark:text-red-300')}>{tag === 'best' ? 'Best reply rate' : 'Lowest reply rate'}</span>}
                </span>
                <span>
                  <span className="mb-1 flex items-baseline justify-between text-xs"><span className="text-muted-foreground">Reply rate</span><span className="font-semibold tabular-nums text-blue-700 dark:text-blue-300">{rr === null ? '—' : `${rr}%`}</span></span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-blue-500" style={{ width: `${rr ?? 0}%` }} /></span>
                </span>
                <span className="grid grid-cols-4 gap-1 text-center">
                  {([['Replied', r.responded, 'blue'], ['Interested', r.interested, 'green'], ['Link', r.onboardingSent, 'amber'], ['Won', r.won, 'green']] as const).map(([k, v, tone]) => (
                    <span key={k} className="rounded-lg bg-muted/40 px-1 py-1.5"><span className={cn('block text-sm font-bold tabular-nums', v ? TONE[tone].text : 'text-muted-foreground/60')}>{v}</span><span className="block text-[10px] text-muted-foreground">{k}</span></span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">Best / lowest only among campaigns with at least {MIN_FOR_RANK} leads contacted.</p>
    </>
  );
}

function ChannelBars({ rows }: { rows: SalesPerformance['channels'] }) {
  if (rows.length === 0) return <Empty>No contact recorded yet.</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.contacted));
  return (
    <ul className="space-y-2.5">
      {rows.map((c) => (
        <li key={c.channel}>
          <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-medium">{CHANNEL_LABELS[c.channel]}</span><span className="text-xs tabular-nums text-muted-foreground">{c.contacted} contacted · {c.responded} replied · <span className="font-semibold text-blue-700 dark:text-blue-300">{pct(c.responded, c.contacted)}</span></span></div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/30" style={{ width: `${(c.contacted / max) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500" style={{ width: `${(c.responded / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "Manage campaigns / templates": tick what shows on YOUR dashboard. Nothing is deleted or re-counted. */
function ManageRows({ kind, all, hidden, onChange }: {
  kind: 'campaigns' | 'templates';
  all: { key: string; label: string; lastActivityAt: string | null }[];
  hidden: string[];
  onChange: (next: string[]) => void;
}) {
  const h = new Set(hidden);
  const hiddenHere = all.filter((r) => h.has(r.key)).length;
  const stale = inactiveKeys(all, (r) => r.key);
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : 'no activity');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground" data-testid={`manage-${kind}`}>
          <SlidersHorizontal className="h-3.5 w-3.5" />Manage {kind}{hiddenHere ? ` (${hiddenHere} hidden)` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <p className="text-xs font-semibold">Show on my dashboard</p>
        <p className="mb-2 text-[11px] text-muted-foreground">Only changes what you see. Totals above still include everything, and nothing is deleted.</p>
        <div className="mb-2 flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={hiddenHere === 0} onClick={() => onChange(hidden.filter((k) => !all.some((r) => r.key === k)))}>Show all</Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={stale.every((k) => h.has(k))} onClick={() => onChange([...new Set([...hidden, ...stale])])} title={`Hides anything with nothing sent or logged in ${INACTIVE_DAYS} days`}>Hide inactive ({INACTIVE_DAYS}+ days)</Button>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 thin-scrollbar">
          {all.map((r) => (
            <li key={r.key}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
                <Checkbox checked={!h.has(r.key)} onCheckedChange={(v) => onChange(toggleHidden(hidden, r.key, v !== true))} className="mt-0.5" />
                <span className="min-w-0 flex-1"><span className="block truncate">{r.label}</span><span className="text-[10px] text-muted-foreground">Last active: {day(r.lastActivityAt)}</span></span>
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function TemplateTable({ rows }: { rows: TemplateRow[] }) {
  const { best, worst } = rank(rows, (r) => r.replies, (r) => r.leadsSent);
  return (
    <DataTable
      head={[{ v: 'Template' }, { v: 'Meta', wide: true }, { v: 'Sent to' }, { v: 'Sends', wide: true }, { v: 'Replies' }, { v: 'Unclear', wide: true }, { v: 'Interested' }, { v: 'Not int.', wide: true }, { v: 'Link sent' }, { v: 'Opened' }, { v: 'Won' }]}
      rows={rows.map((r) => ({
        tag: r === best ? 'best' : r === worst ? 'lowest' : null,
        cells: [
          { v: templateLabel(r.template) }, { v: <MetaBadge t={r.template} />, wide: true, key: metaStatus(r.template).label }, { v: r.leadsSent }, { v: r.sends, wide: true },
          { v: r.replies, sub: pct(r.replies, r.leadsSent) }, { v: r.repliesContested, wide: true },
          { v: r.interested }, { v: r.notInterested, wide: true }, { v: r.onboardingSent }, { v: r.onboardingOpened }, { v: r.won },
        ],
      }))}
      rankNote="by reply rate"
      empty="No template sends yet."
    />
  );
}

function DataTable({ head, rows, empty, rankNote }: { head: Cell[]; rows: { tag: 'best' | 'lowest' | null; cells: Cell[] }[]; empty: string; rankNote?: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  const hide = (c: Cell) => (c.wide ? 'hidden md:table-cell' : '');
  return (
    <div className="-mx-1 overflow-x-auto thin-scrollbar">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => <th key={h.key ?? String(h.v)} className={cn('px-1.5 py-1.5 font-semibold', i > 0 && 'text-right', hide(h))}>{h.v}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={cn('border-b border-border/30 last:border-0', r.tag === 'best' && 'bg-emerald-500/[0.07]', r.tag === 'lowest' && 'bg-rose-500/[0.05]')}>
              {r.cells.map((c, ci) => (
                <td key={ci} className={cn('px-1.5 py-1.5 align-top', ci === 0 ? 'max-w-[13rem] font-medium' : 'text-right tabular-nums', hide(c))} title={ci === 0 ? String(c.v) : undefined}>
                  {ci === 0 ? (
                    <div className="min-w-0">
                      <div className="truncate">{c.v}</div>
                      {r.tag && <div className={cn('text-[10px] font-semibold', r.tag === 'best' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{r.tag === 'best' ? 'Best' : 'Lowest'} {rankNote}</div>}
                    </div>
                  ) : (
                    <>
                      <div className={cn(c.v === 0 && 'text-muted-foreground/60')}>{c.v}</div>
                      {c.sub && c.sub !== '—' && <div className="text-[10px] text-muted-foreground">{c.sub}</div>}
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rankNote && <p className="mt-1.5 text-[10px] text-muted-foreground">Best / lowest only among rows with at least {MIN_FOR_RANK} behind them.</p>}
    </div>
  );
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="-mx-1 overflow-x-auto thin-scrollbar">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => <th key={h} className={cn('px-1.5 py-1.5 font-semibold', i > 0 && 'text-right')}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/30 last:border-0">
              {r.map((c, ci) => <td key={ci} className={cn('px-1.5 py-1.5', ci === 0 ? 'max-w-[14rem] truncate font-medium' : 'text-right tabular-nums')} title={ci === 0 ? String(c) : undefined}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HowCounted({ d }: { d: Perf }) {
  return (
    <details className="rounded-xl border border-border/60 bg-card/40 p-3.5 text-xs text-muted-foreground" data-testid="how-counted">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 font-semibold text-foreground"><Info className="h-3.5 w-3.5" />How these numbers are counted</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
        <li><b>Your leads</b> are the leads assigned to you now. A message the queue sent for you counts as yours; a message somebody else sent by hand does not.</li>
        <li><b>Contacted</b>: a WhatsApp message that was actually delivered to WhatsApp, or a call / LinkedIn / email / in-person contact you logged (a "no answer" counts: you tried).</li>
        <li><b>Replied</b>: a real reply on WhatsApp after your first message (auto-replies are ignored), or a logged contact where you actually spoke.</li>
        <li><b>Interested</b>: starred, marked interested or quoted, a logged "interested" or "meeting booked", or won. <b>Not interested</b> is how they stand now.</li>
        <li><b>Sign-up link sent</b>: a WhatsApp message carrying their own link (recorded automatically), or "Sent another way" on the lead. Copying the link does not count.</li>
        <li><b>Opened</b>: their sign-up page was loaded after the link was first sent. Your own "Preview" and links opened from the Inbox are never counted.</li>
        <li><b>Won</b>: they became a paying client. No amounts are shown.</li>
        <li><b>Not recorded before</b>: page opens since {d.tracking.opensSince}; logged calls and who-sent-what since {d.tracking.contactLogSince}. Older activity is not reconstructed.</li>
      </ul>
      <p className="mt-2 text-[10px]">Loaded in {(d.ms / 1000).toFixed(1)} s.</p>
    </details>
  );
}

function MetaBadge({ t }: { t: string }) {
  const m = metaStatus(t);
  return <span className={cn('inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold', TONE[m.tone].soft, TONE[m.tone].text)} title="Meta's state for this template name">{m.label}</span>;
}
