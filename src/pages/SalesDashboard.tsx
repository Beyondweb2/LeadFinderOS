import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, Layers, Megaphone, MessageCircleReply, PhoneCall, Radio, RefreshCw, Sprout, Target, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { useEarnings } from '@/hooks/useEarnings';
import { EarnedCelebration } from '@/components/salesDash/EarnedCelebration';
import { MonthlyLadder } from '@/components/salesDash/MonthlyLadder';
import { CommissionForecastCard, EarningsStats } from '@/components/salesDash/CommissionForecastCard';
import { BySellerTable, CommissionExplainer, PaymentsTable, PayoutDialog, RecentWins } from '@/components/salesDash/earningsParts';
import { CampaignCards, ChannelBars, ManageRows, SimpleTable, TemplateTable } from '@/components/salesDash/breakdown';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { templateLabel } from '@/types/outreach';
import { leadSourceLabel, rate, type CampaignRow, type SalesPerformance, type TemplateRow } from '@/lib/salesPerformance';
import { type FollowUpGroup, type SalesWorkspace } from '@/lib/salesWorkspace';
import { CONVERSATION_OUTCOMES } from '@/lib/leadState';
import { leadTarget, type LeadLink } from '@/lib/salesLinks';
import { writeCampaignFilter } from '@/lib/outreachPrefs';
import { cn } from '@/lib/utils';
import { useDashboardPrefs } from '@/hooks/useDashboardPrefs';
import { campaignKey, templateKey, visibleRows } from '@/lib/dashboardVisibility';
import { KpiCard, PageHeader, Panel } from '@/components/salesDash/ui';
import { TeamBoard } from '@/components/team/TeamBoard';
import { MyHandoffs } from '@/components/salesDash/MyHandoffs';
import { FollowUpQueue, NextActions, FOLLOW_UP_GROUPS } from '@/components/salesDash/sections';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALES DASHBOARD — ONE PAGE (2026-10-01, Sales + Earnings merged; redesigned 2026-10-02).
   A salesperson's home: it is first in their menu and where they land after sign-in. It answers, in this
   order: how the month is going and what the next sale earns (the hero ladder), how the work is going
   (calls, people reached, contacted → sale), what to do next, the money (earned to date, this month,
   the next six months), the recent wins and the commission rules. Each fact is drawn ONCE.
   Drawn entirely from the shared dashboard design system (components/salesDash/ui.tsx), the same one
   the Admin dashboard uses — the two pages are one product, built for two jobs. Both roles; a salesperson
   sees their own numbers only — decided by the servers (fn sales-performance, fn sales-earnings),
   never by this page. The admin picks a person (or everyone) and records payouts.
   ⛔ Removed in the merge (each repeated another card or helped no decision): the KPI row, Today strip,
   pipeline strip, waiting / warmth / health panels, activity feed, recap, targets, milestones, trends,
   the conversion funnel, the calls and won panels, the clients cards, the weekly tier and its audit.
   ⛔ Removed 2026-10-02 (Paul): "This month, week by week" (a chart of a count the hero already shows),
   and the commission card's repeat of the rate, tiers and totals (the hero and Your earnings hold them).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

type Perf = SalesPerformance & { ok: true; scope: { person: string | null; self: boolean; role: string }; ms: number; workspace: SalesWorkspace };

function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(now));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function SalesDashboard() {
  const { role } = useSubscription();
  const { user } = useAuth();
  const team = useTeamDirectory();
  const navigate = useNavigate();
  const isAdmin = role === 'admin';
  /* ?person=<userId> (2026-09-30): the admin dashboard's Team comparison opens one salesperson's view
     here. Admin only — a salesperson's page is always their own, whatever the URL says. */
  const [searchParams] = useSearchParams();
  const linkedPerson = searchParams.get('person');
  const [person, setPerson] = useState<string>(isAdmin ? (linkedPerson ? (linkedPerson === user?.id ? 'me' : linkedPerson) : 'all') : 'me');
  const viewingSelf = !isAdmin || person === 'me';
  /* The work numbers are this calendar month (London) — the same month the commission ladder counts. */
  const q = useQuery({
    queryKey: ['sales-performance', role, isAdmin ? person : 'me', 'month'],
    enabled: !!role,
    staleTime: 60_000,
    queryFn: () => invokeEdge<Perf>('sales-performance', { period: 'month', person: isAdmin ? person : 'me', targets: null }),
  });
  const d = q.data;
  const w = d?.workspace;
  const earn = useEarnings(isAdmin ? person : 'me');
  const e = earn.data;
  const prefs = useDashboardPrefs();
  const campaigns = d ? visibleRows<CampaignRow>(d.campaigns, prefs.hidden.campaigns, campaignKey) : [];
  const templates = d ? visibleRows<TemplateRow>(d.templates, prefs.hidden.templates, templateKey) : [];
  const [payoutOpen, setPayoutOpen] = useState(false);
  const nameOf = useMemo(() => new Map((team.data ?? []).map((m) => [m.user_id, m.display_name])), [team.data]);
  const bizOf = useMemo(() => new Map((e?.clients ?? []).map((c) => [c.leadId, c.business])), [e?.clients]);

  const go = (link: LeadLink, leadId: string) => { const [path, state] = leadTarget(link, leadId); navigate(path, state ? { state } : undefined); };
  const [fuGroup, setFuGroup] = useState<FollowUpGroup | null>(null);
  const fuDefault = useMemo(() => (w ? (FOLLOW_UP_GROUPS.find((g) => w.followUps[g.key].length > 0)?.key ?? 'overdue') : 'overdue') as FollowUpGroup, [w]);
  const personName = (team.data ?? []).find((m) => m.user_id === user?.id)?.display_name?.split(' ')[0];
  const scopeLabel = isAdmin ? (person === 'all' ? 'Everyone' : person === 'me' ? 'You' : nameOf.get(person) ?? 'One person') : null;
  /* People reached = logged contacts where they actually spoke to someone (the conversation outcomes). */
  const reached = d ? Object.entries(d.calls.byOutcome).filter(([k]) => CONVERSATION_OUTCOMES.has(k)).reduce((s, [, n]) => s + n, 0) : 0;
  const conversion = d ? rate(d.funnel.won, d.funnel.contacted) : null;
  const oneSeller = !isAdmin || person !== 'all';
  /* ⛔ WHAT TO DO NEXT COMES FIRST FOR A SALESPERSON (fix workstream 5, 2026-10-04; Session A A-18): on a phone it
     sat ~1,600 px down, under the commission ladder. The admin's overview keeps its order. */
  const todoFirst = role === 'sales';
  const todo = w ? (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5" data-testid="what-to-do-next">
      <div className="min-w-0 lg:col-span-3"><NextActions items={w.nextActions} go={go} title="What to do next" hint="Calls and follow-ups due first. Tap a lead to open it." /></div>
      <div className="min-w-0 lg:col-span-2"><FollowUpQueue fu={w.followUps} go={go} group={fuGroup ?? fuDefault} setGroup={setFuGroup} /></div>
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <EarnedCelebration lines={e?.lines} enabled={viewingSelf && !!e?.commissionable} />
      <PageHeader
        eyebrow={`${greeting()}${personName ? `, ${personName}` : ''}`}
        title="Sales dashboard"
        subtitle={isAdmin ? <>Showing <span className="font-semibold text-foreground">{scopeLabel}</span> · this month, UK time</> : 'Your month, your money and what to do next.'}
        actions={<>
          {isAdmin && (
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="h-9 w-44 rounded-full" aria-label="Whose numbers"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="me">Me</SelectItem>
                {/* Ended salespeople stay pickable (2026-10-02): what they earned is still theirs, and payable. */}
                {(team.data ?? []).filter((m) => m.user_id !== user?.id && (m.status === 'active' || m.status === 'disabled')).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}{m.status === 'disabled' ? ' (ended)' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isAdmin && <Button size="sm" variant="outline" className="h-9 rounded-full" onClick={() => setPayoutOpen(true)}>Record a payout</Button>}
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => { void q.refetch(); void earn.refetch(); }} disabled={q.isFetching || earn.isFetching} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', (q.isFetching || earn.isFetching) && 'animate-spin')} /><span className="hidden sm:inline">Refresh</span>
          </Button>
        </>}
      />

      {(q.isError || earn.isError) && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load {q.isError ? 'your numbers' : 'your earnings'}: {edgeErrorMessage(q.error ?? earn.error)}
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => { void q.refetch(); void earn.refetch(); }}>Try again</Button>
        </div>
      )}

      {todoFirst && todo}

      {/* ── 1. The month: the ladder (sales, the progress line, the rates) with the three money figures beside it ── */}
      {earn.isLoading && <div className="h-72 animate-pulse rounded-[1.25rem] bg-muted/50 motion-reduce:animate-none" aria-busy="true" />}
      {e && oneSeller && e.commissionable && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2"><MonthlyLadder lines={e.lines} clients={e.clients} /></div>
          <EarningsStats totals={e.totals} forecast={e.forecast ?? null} />
        </div>
      )}
      {e && oneSeller && !e.commissionable && <Notice>Commission is paid to salespeople. Clients you sell yourself show here at £0.</Notice>}
      {e && !oneSeller && <Notice>Pick a salesperson at the top to see their month and commission. The table below has everyone's.</Notice>}

      {/* Under the month (2026-10-02): what Paul sent and any handoff owed. The Team board (2026-10-01): what Paul sent THIS salesperson — their own, never another's. */}
      {role === 'sales' && <TeamBoard />}
      {/* Their own paid sales that still owe the handoff (2026-10-02). */}
      {role === 'sales' && <MyHandoffs />}

      {/* ── 2. What to do next (the ranked list, and the lists Focus Mode used to hold) — here for the admin ── */}
      {!todoFirst && todo}

      {/* ── 3. The work this month: three numbers, each with its base ── */}
      {q.isLoading && <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-24 sm:h-32 animate-pulse rounded-[1.25rem] bg-muted/60 motion-reduce:animate-none" />)}</div>}
      {/* Phone (2026-10-02): the three stay in one compact row (KpiCard drops its icon and sub-line below sm). */}
      {d && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="work-numbers">
          <KpiCard label="Calls made" icon={PhoneCall} tone="blue" value={d.calls.total} sub="Logged this month" />
          <KpiCard label="People reached" icon={Users} tone="purple" value={reached} sub="Calls where you spoke to someone" />
          <KpiCard label="Contacted → sale" icon={Target} tone="amber" value={conversion === null ? '—' : `${conversion}%`}
            sub={d.funnel.contacted ? `${d.funnel.won} sale${d.funnel.won === 1 ? '' : 's'} from ${d.funnel.contacted} people first contacted this month` : 'Nobody contacted this month yet'} />
        </div>
      )}

      {/* ── 4. The next six months, beside the recent wins ── */}
      {e && oneSeller && e.commissionable && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {e.forecast && <div className="min-w-0 lg:col-span-2"><CommissionForecastCard forecast={e.forecast} engagement={e.engagement ?? null} /></div>}
          <div className={cn('min-w-0', !e.forecast && 'lg:col-span-3')}><RecentWins lines={e.lines} clients={e.clients} /></div>
        </div>
      )}

      {/* ── 5. The detail, folded: the commission rules, every payment, everyone's commission, the outreach numbers ── */}
      {e && oneSeller && e.commissionable && <CommissionExplainer />}
      {e && isAdmin && person === 'all' && <BySellerTable rows={e.bySeller} nameOf={(id) => nameOf.get(id) ?? 'Salesperson'} />}
      {e && <PaymentsTable lines={e.lines} bizOf={bizOf} sellerOf={isAdmin ? (id) => (id ? nameOf.get(id) ?? 'Former member' : '—') : undefined} />}
      {d && (
        <Panel collapseKey="sales.more" defaultOpen={false} title="More numbers" icon={Layers} tone="grey" hint="This month: campaigns, WhatsApp messages, channels and where leads came from.">
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold"><span className="flex items-center gap-1.5"><Megaphone className="h-4 w-4 text-muted-foreground" />Campaigns</span>
                <ManageRows kind="campaigns" all={d.campaigns.map((r) => ({ key: campaignKey(r), label: r.name, lastActivityAt: r.lastActivityAt }))} hidden={prefs.hidden.campaigns} onChange={(next) => prefs.setHidden({ ...prefs.hidden, campaigns: next })} /></h3>
              <CampaignCards rows={campaigns} onOpen={(id) => { writeCampaignFilter(user?.id, id); navigate('/outreach'); }} />
            </section>
            <section>
              <h3 className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold"><span className="flex items-center gap-1.5"><MessageCircleReply className="h-4 w-4 text-muted-foreground" />WhatsApp messages</span>
                <ManageRows kind="templates" all={d.templates.map((r) => ({ key: templateKey(r), label: templateLabel(r.template), lastActivityAt: r.lastActivityAt }))} hidden={prefs.hidden.templates} onChange={(next) => prefs.setHidden({ ...prefs.hidden, templates: next })} /></h3>
              <TemplateTable rows={templates} />
            </section>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <section><h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Radio className="h-4 w-4 text-muted-foreground" />Channels</h3><ChannelBars rows={d.channels} /></section>
              <section><h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Sprout className="h-4 w-4 text-muted-foreground" />Where leads came from</h3>
                <SimpleTable head={['Source', 'Leads', 'Contacted', 'Replied', 'Interested', 'Won']}
                  rows={d.sources.map((s) => [leadSourceLabel(s.source), s.leads, s.contacted, s.responded, s.interested, s.won])} empty="No leads yet." /></section>
            </div>
          </div>
        </Panel>
      )}

      {isAdmin && <PayoutDialog open={payoutOpen} onOpenChange={setPayoutOpen} sellers={(team.data ?? []).filter((m) => m.user_id !== user?.id).map((m) => ({ id: m.user_id, name: m.display_name }))} />}
    </div>
  );
}

/** A quiet one-line note where a card would otherwise be (admin viewing everyone; a non-earning seller). */
function Notice({ children }: { children: ReactNode }) {
  return <p className="flex items-center gap-2.5 rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground ring-1 ring-inset ring-border/60"><Info className="h-4 w-4 shrink-0" />{children}</p>;
}
