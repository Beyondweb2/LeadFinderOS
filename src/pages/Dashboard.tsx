import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Archive, ArrowRight, BarChart3, Loader2, RefreshCw, Send, Signal, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAdminOverview, type PeriodChoice } from '@/hooks/useAdminOverview';
import { useAdminHomeActions, useAdminHomeNeeds, useAdminHomeNumbers, useLeadContacts, type HomeNumbers } from '@/hooks/useAdminHome';
import { prospectOnlyLead } from '@/lib/prospectOnly';
import { edgeErrorMessage } from '@/lib/edgeInvoke';
import { attentionPath, clientHubLink, whatsAppLinkForLead } from '@/lib/salesLinks';
import { londonDay } from '@/lib/reportingPeriod';
import { HIDE_MY_ACTIVITY_KEY, PICKER, periodDays, validChoice } from '@/lib/adminPeriod';
import { cn } from '@/lib/utils';
import { PageHeader, Panel, SectionHeading, Segmented, KpiCard, TONE, ago } from '@/components/salesDash/ui';
import { DashboardSection } from '@/components/dashboard/DashboardSection';
import { SubmissionsCard } from '@/components/dashboard/SubmissionsCard';
import { FreeCheckProgressCard } from '@/components/dashboard/FreeCheckProgressCard';
import { BusinessGlance } from '@/components/admin/teamControl';
import { NeedsMeList, ArchivedList, CardMarkMenu, type MarkFn } from '@/components/admin/NeedsMeList';
import { QuestionnaireLog } from '@/components/admin/QuestionnaireLog';
import { usePaidClientList } from '@/hooks/useAdminTeamControl';
import { needsYouItems } from '@/lib/adminControl';
import { buildNeedsRows, hiddenByMark, splitByMarks, type NeedsMark, type NeedsRow } from '@/lib/needsMe';
import { effectivePace } from '@/lib/whatsappPace';
import { healthLimitedCap, healthVerdict } from '@/lib/whatsappNumberHealth';
import { TeamComposer, type ComposerSeed } from '@/components/team/TeamComposer';
import { TradeAutofixDialog } from '@/components/admin/TradeAutofixDialog';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ADMIN HOME (Concept A, Paul 2026-10-26: "my dashboard looks good as it is, it's just full of junk").
   docs/design/admin-dashboard/README.md. Same look and order as before, the junk moved out:
   Business at a glance → What needs you → Key numbers → Questionnaires → the sign-up desk.
   ⛔ MOVED, not deleted, to /admin/insights (AdminInsights.tsx): Sales team, Money, Sales intelligence, Clients in
   delivery, findable.live traffic, feature usage, API costs. "Client websites · Google search" is not shown anywhere
   (never connected). ⛔ No replies or drafts on this page: they live in the Inbox (Paul, 2026-10-26).
   ⛔ "My activity" is INCLUDED by default (Paul, 2026-10-26) — a new storage key, so an old "hidden" choice does not stick.
   Every row and card has snooze / dismiss / archive (admin_home_marks); nothing is ever deleted, every hide has an undo.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(now));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const CARD_LABEL: Record<string, string> = { 'card:glance': 'Card: Business at a glance', 'card:needs': 'Card: What needs you', 'card:numbers': 'Card: Key numbers', 'card:questionnaires': 'Card: Questionnaires', 'card:desk': 'Card: Sign-ups & free checks' };

function KeyNumbers({ n, hideMine, meId, menu }: { n: HomeNumbers | undefined; hideMine: boolean; meId: string | null; menu: React.ReactNode }) {
  if (!n) return null;
  const f = n.funnel;
  const steps: [string, number][] = [['Sent', f.sent], ['Delivered', f.delivered], ['Real replies', f.real_replies], ['Interested', f.interested], ['Questionnaire started', f.questionnaire], ['Reached payment', f.reached_payment], ['Paid', f.paid]];
  const h = n.health;
  /* THE health rule (whatsappNumberHealth.ts): a rating older than its stale window reads as unknown, never as the old colour. */
  const verdict = healthVerdict({ meta_quality_rating: h?.rating ?? null, meta_messaging_tier: h?.tier ?? null, meta_health_checked_at: h?.checked_at ?? null, meta_health_ok_at: h?.ok_at ?? null });
  const cap = healthLimitedCap(effectivePace(h ?? null).dailyCap, verdict);
  const team = n.team.filter((t) => !(hideMine && t.user_id === meId));
  const teamTotal = team.reduce((s, t) => s + t.messages, 0);
  const ratingTone = verdict.state === 'green' ? 'green' : verdict.state === 'yellow' ? 'amber' : 'red';
  return (
    <div className="space-y-3">
      <SectionHeading title="Key numbers" tone="blue" />
      <Panel title={`Funnel · last ${n.days} day${n.days === 1 ? '' : 's'}`} icon={BarChart3} tone="blue" action={menu}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="home-funnel">
          {steps.map(([k, v], i) => (
            <div key={k} className="rounded-xl border border-border/60 bg-muted/10 p-2.5">
              <p className="text-[11px] text-muted-foreground">{k}</p>
              <p className="text-xl font-extrabold tabular-nums">{v}</p>
              <p className="text-[10px] text-muted-foreground">{i ? `${Math.round((100 * v) / (steps[i - 1][1] || 1))}% of previous` : 'opener sent'}</p>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard tone={ratingTone} icon={Signal} label="WhatsApp number rating" value={verdict.rating === 'UNKNOWN' ? '—' : verdict.rating} sub={`${h?.tier ? h.tier.replace('TIER_', 'Tier ') : 'Tier unknown'}${h?.checked_at ? ` · checked ${ago(h.checked_at)}` : ''}`} />
        <KpiCard tone="blue" icon={Send} label="Sent today / daily cap" value={`${h?.sent_today ?? 0} / ${cap}`} sub={verdict.halveCap ? 'Cap halved while the rating is not green' : h?.paused ? 'Sending is paused' : 'All WhatsApp sends today'} />
        <KpiCard tone="amber" icon={AlertTriangle} label="Failed today" value={h?.failed_today ?? 0} sub={h?.sent_today ? `${Math.round((100 * (h.failed_today ?? 0)) / h.sent_today)}% of sends` : 'No sends yet today'} />
        <KpiCard tone="purple" icon={Users} label="Team this week" value={teamTotal} sub={team.length ? team.slice(0, 4).map((t) => `${t.name.split(' ')[0]} ${t.messages}`).join(' · ') : 'No messages this week'} />
      </div>
    </div>
  );
}

const Dashboard = () => {
  const { isLoading: roleLoading, isAdmin } = useSubscription();
  const { user } = useAuth();
  const team = useTeamDirectory();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const highlight = params.get('row');
  const [choice, setChoice] = usePersistedState<PeriodChoice>('admin.period', { key: '30d' }, { tier: 'local', scope: user?.id ?? null, validate: validChoice });
  const [hideMine, setHideMine] = usePersistedState<boolean>(HIDE_MY_ACTIVITY_KEY, false, { tier: 'local', scope: user?.id ?? null });
  const q = useAdminOverview(choice, isAdmin, hideMine);
  const o = q.data;
  const needsQ = useAdminHomeNeeds();
  const numbersQ = useAdminHomeNumbers(periodDays(choice));
  const actions = useAdminHomeActions();
  const firstName = (team.data ?? []).find((m) => m.user_id === user?.id)?.display_name?.split(' ')[0];
  const today = londonDay(Date.now());
  const [compose, setCompose] = useState<ComposerSeed | null>(null);
  const [fixTrades, setFixTrades] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [lastMark, setLastMark] = useState<{ label: string; mark: NeedsMark } | null>(null);
  const clientsQ = usePaidClientList(isAdmin);
  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data]);
  const nowMs = Date.now();
  const marks = useMemo(() => needsQ.data?.marks ?? [], [needsQ.data]);
  const baseRows = useMemo(() => (o && needsQ.data
    ? buildNeedsRows({ facts: needsQ.data, attention: needsYouItems(o.attention, clients, Date.now()), clients, nowMs: Date.now() })
    : []), [o, needsQ.data, clients]);
  /* A row that arrives without the lead's number (new clients, server items) gets it here: a send needs it. */
  const contactsQ = useLeadContacts(baseRows.filter((r) => r.leadId && !r.phone).map((r) => r.leadId!));
  const rows = useMemo(() => baseRows.map((r) => {
    const c = r.leadId && !r.phone ? contactsQ.data?.[r.leadId] : undefined;
    return c ? { ...r, phone: c.phone, country: c.country, firstName: r.firstName ?? ((c.contact_name ?? '').trim().split(/\s+/)[0] || null), prospectOnly: prospectOnlyLead({ country: c.country }) } : r;
  }), [baseRows, contactsQ.data]);
  const { visible, hidden } = useMemo(() => splitByMarks(rows, marks, nowMs), [rows, marks, nowMs]);
  const cardHidden = (key: string) => !!hiddenByMark({ key, sinceIso: null }, marks, nowMs);
  const hiddenCards = Object.keys(CARD_LABEL).flatMap((key) => { const m = hiddenByMark({ key, sinceIso: null }, marks, nowMs); return m ? [{ label: CARD_LABEL[key], mark: m }] : []; });
  const archivedItems = [...hidden.map((h) => ({ label: h.row.business, mark: h.mark })), ...hiddenCards];

  /* The alert email links to ?row=<key>: scroll to it once the list is drawn. */
  useEffect(() => {
    if (!highlight || !visible.length) return;
    document.getElementById(`row-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight, visible.length]);

  const onMark: MarkFn = async (itemKey, action, until) => {
    await actions.mark.mutateAsync({ itemKey, action, until });
    const label = rows.find((r) => r.key === itemKey)?.business ?? CARD_LABEL[itemKey] ?? 'it';
    /* The undo needs the new mark's id: the list refetch brings it; take the newest mark for this key. */
    const fresh = (await needsQ.refetch()).data?.marks.filter((m) => m.item_key === itemKey).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (fresh) setLastMark({ label, mark: fresh });
  };
  const onUndo = (markId: string) => { void actions.undo.mutateAsync(markId); setLastMark(null); };

  /* ⛔ Every row opens WHERE ITS ACTION IS DONE: a client → the hub; a server item → its own path; a lead → their
     conversation in the Inbox (Paul, 2026-10-26: "clicking to message someone must open their conversation in the inbox,
     not the outreach page"). */
  const openRow = (r: NeedsRow) => {
    const a = r.open.attention;
    if (a?.kind === 'no_trade') { setFixTrades(true); return; }
    if (a) { navigate(attentionPath(a)); return; }
    if (r.open.kind === 'client' && r.leadId) { navigate(clientHubLink(r.leadId)); return; }
    if (r.leadId) navigate(whatsAppLinkForLead(r.leadId));
  };

  if (roleLoading) return <div className="flex h-full items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-8">
      <SEOHead title="Dashboard | LeadFinder Pro" description="What needs you today, and the few numbers that matter." canonical="/" noindex />
      <PageHeader
        eyebrow={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        title="Admin dashboard"
        subtitle="What needs you today, and the few numbers that matter."
        actions={<>
          {o && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {ago(o.generatedAt)}</span>}
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => setShowArchived(true)} data-testid="archived-button">
            <Archive className="h-4 w-4" /><span className="hidden sm:inline">Archived ({archivedItems.length})</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => { void q.refetch(); void needsQ.refetch(); void numbersQ.refetch(); }} disabled={q.isFetching} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} /><span className="hidden sm:inline">Refresh</span>
          </Button>
          {isAdmin && <Button size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => setCompose({})}><Send className="h-4 w-4" /><span className="hidden sm:inline">Send to sales team</span></Button>}
        </>}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented label="Period" value={choice.key} options={PICKER}
          onChange={(k) => setChoice(k === 'custom' ? { key: 'custom', from: choice.from ?? today, to: choice.to ?? today } : { key: k })} />
        {choice.key === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs">
            <Input type="date" className="h-8 w-[9.5rem] rounded-full text-xs" max={today} value={choice.from ?? ''} onChange={(e) => setChoice({ ...choice, from: e.target.value })} aria-label="From" />
            <span className="text-muted-foreground">to</span>
            <Input type="date" className="h-8 w-[9.5rem] rounded-full text-xs" max={today} value={choice.to ?? ''} onChange={(e) => setChoice({ ...choice, to: e.target.value })} aria-label="To" />
          </div>
        )}
        <button type="button" onClick={() => setHideMine(!hideMine)} aria-pressed={hideMine} data-testid="hide-my-activity"
          title="Your own messages in Team this week (and on the Team, insights and costs page)."
          className={cn('ml-auto rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition', hideMine ? 'bg-muted/60 text-foreground ring-border' : 'bg-blue-500/15 text-blue-700 ring-blue-400/30 dark:text-blue-200')}>
          {hideMine ? 'My activity: hidden' : 'My activity: included'}
        </button>
      </div>

      {q.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load the dashboard: {edgeErrorMessage(q.error)}
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      )}
      {q.isLoading && <p className="flex items-center gap-2 rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Adding up the business…</p>}

      {o && !cardHidden('card:glance') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><SectionHeading title="Business at a glance" tone="green" /><CardMarkMenu itemKey="card:glance" onMark={onMark} /></div>
          <BusinessGlance o={o} clients={clients} needs={visible.length} urgent={visible.filter((r) => r.group === 'urgent').length} meId={user?.id ?? null}
            onNeeds={() => document.getElementById('needs-you')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        </div>
      )}

      {!cardHidden('card:needs') && (
        <div id="needs-you">
          <NeedsMeList rows={visible} highlightKey={highlight}
            onOpen={openRow} onMark={onMark} lastArchived={lastMark} onUndo={onUndo}
            onAssign={(i) => setCompose({ kind: 'lead_assignment', lead: { id: i.leadId!, name: i.business }, reason: i.why })}
            onOutcome={async (onboardingId, reason, note) => { await actions.outcome.mutateAsync({ onboardingId, lostReason: reason, note }); }}
            loading={needsQ.isLoading || q.isLoading} error={needsQ.isError ? edgeErrorMessage(needsQ.error) : null} onRetry={() => void needsQ.refetch()}
            cardMenu={<CardMarkMenu itemKey="card:needs" onMark={onMark} />} />
        </div>
      )}

      {!cardHidden('card:numbers') && <KeyNumbers n={numbersQ.data} hideMine={hideMine} meId={user?.id ?? null} menu={<CardMarkMenu itemKey="card:numbers" onMark={onMark} />} />}
      {numbersQ.isError && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">Could not load the key numbers: {edgeErrorMessage(numbersQ.error)} <button type="button" className="ml-2 underline" onClick={() => void numbersQ.refetch()}>Try again</button></p>}

      {!cardHidden('card:questionnaires') && needsQ.data && (
        <QuestionnaireLog facts={needsQ.data.questionnaires} nowMs={nowMs} menu={<CardMarkMenu itemKey="card:questionnaires" onMark={onMark} />}
          onOpen={(leadId) => navigate(whatsAppLinkForLead(leadId))} />
      )}

      <Link to="/admin/insights" className={cn('flex items-center justify-between gap-3 rounded-[1.25rem] border border-border/60 bg-muted/10 px-4 py-3 text-sm transition hover:bg-muted/30')} data-testid="insights-link">
        <span><span className="font-semibold">Team, insights and costs</span><span className="ml-2 text-xs text-muted-foreground">Sales team, money, what works, clients in delivery, traffic and API costs</span></span>
        <ArrowRight className={cn('h-4 w-4', TONE.blue.text)} />
      </Link>

      {/* The sign-up desk: the two working cards kept from the old page (their buttons act). Folded. */}
      {!cardHidden('card:desk') && (
        <div id="signup-desk" className="space-y-3">
          <div className="flex items-center justify-between"><SectionHeading title="Sign-ups & free checks" tone="grey" hint="The two working desks: new sign-ups and free checks in progress." /><CardMarkMenu itemKey="card:desk" onMark={onMark} /></div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 [&>div>section>div]:rounded-[1.25rem] [&>div>section>div]:border-border/70 [&>div>section>div]:shadow-sm">
            <div className="min-w-0"><DashboardSection storageKey="submissions" title="Sign-ups" defaultOpen={false}><SubmissionsCard /></DashboardSection></div>
            <div className="min-w-0"><DashboardSection storageKey="free-checks" title="Free checks" defaultOpen={false}><FreeCheckProgressCard /></DashboardSection></div>
          </div>
        </div>
      )}

      <Dialog open={showArchived} onOpenChange={setShowArchived}>
        <DialogContent>
          <DialogHeader><DialogTitle>Archived, snoozed and dismissed</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Nothing here is deleted. Restore brings it back.</p>
          <ArchivedList items={archivedItems} onUndo={(id) => onUndo(id)} />
        </DialogContent>
      </Dialog>
      <TradeAutofixDialog open={fixTrades} onOpenChange={setFixTrades} onDone={() => void q.refetch()} />
      <TeamComposer open={!!compose} onOpenChange={(v) => { if (!v) { setCompose(null); void q.refetch(); } }} seed={compose} />
      {o && <p className="px-1 text-[11px] text-muted-foreground">{o.exclusionNote} Figures are server totals ({o.ms} ms, {o.build}).</p>}
    </div>
  );
};

export default Dashboard;
