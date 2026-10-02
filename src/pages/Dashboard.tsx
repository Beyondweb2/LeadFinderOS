import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw, Send } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAdminOverview, type PeriodChoice } from '@/hooks/useAdminOverview';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { attentionPath, clientHubLink } from '@/lib/salesLinks';
import { PERIOD_KEYS, PERIOD_LABEL, londonDay, type PeriodKey } from '@/lib/reportingPeriod';
import type { AttentionItem } from '@/lib/adminMetrics';
import { cn } from '@/lib/utils';
import { PageHeader, Segmented, ago } from '@/components/salesDash/ui';
import { DashboardSection } from '@/components/dashboard/DashboardSection';
import { SubmissionsCard } from '@/components/dashboard/SubmissionsCard';
import { FreeCheckProgressCard } from '@/components/dashboard/FreeCheckProgressCard';
import { AttentionQueue, ChannelsPanel, CostPanel, Section } from '@/components/admin/controlCentre';
import { BusinessGlance, HandoffsPanel, MoneyPanel, TeamPerformanceTable } from '@/components/admin/teamControl';
import { usePaidClientList, useTeamLastActivity } from '@/hooks/useAdminTeamControl';
import { useEarnings } from '@/hooks/useEarnings';
import { handoffClients, needsYouItems } from '@/lib/adminControl';
import { BottlenecksPanel, FeatureUsagePanel, NichesPanel, TemplatesPanel } from '@/components/admin/intelligence';
import { LostReasonsPanel } from '@/components/admin/lostReasons';
import { ClientHealthPanel } from '@/components/admin/clientHealth';
import { ClientSearchPanel, FindableFunnelPanel } from '@/components/admin/traffic';
import { BusinessSummaryPanel } from '@/components/admin/businessSummary';
import { TeamComposer, type ComposerSeed } from '@/components/team/TeamComposer';
import { TradeAutofixDialog } from '@/components/admin/TradeAutofixDialog';
import { useMemo, useState } from 'react';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ADMIN CONTROL CENTRE (rebuilt 2026-09-30, Paul: "my daily business control centre — not a
   notification feed, not a pile of cards, not a list of every event"). docs/admin-control-centre.md.
   ⛔ Every number is folded on the server (fn admin-overview, src/lib/adminMetrics.ts) — this page
   never loads the book. The old page pulled every lead and every WhatsApp message into the browser
   twice per visit.
   ⛔ REMOVED 2026-09-30 (the audit is in the doc): the four headline tiles (replaced by Today and
   Needs your attention); Next best actions, the follow-up queue and Waiting on a reply (salesperson
   work lists — they stay on the Sales dashboard and Focus); Team activity (an event feed); the audit
   funnel (replaced by the sales funnel); the Clients delivery card (the ticks live on the client hub);
   the footer links. The "Needs you" tasks are rebuilt server-side inside Needs your attention, with
   the refunded-client bug fixed and no browser write.
   Order: what needs me → today → team → money → clients → the sign-up desk. Only the top two, revenue
   and clients open by default; every section remembers Paul's open/closed choice.
   2026-10-02 (the dashboards redesign): drawn from the same design system as the Sales dashboard
   (components/salesDash/ui.tsx) — the same page header, section headings, panels, figures and colours,
   so the two read as one product. Traffic and System merged into one "Website & usage" section (System
   held one panel).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(now));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const PICKER: PeriodKey[] = PERIOD_KEYS.filter((k) => k !== 'yesterday');
/** A stored choice with an unknown period is ignored (null), so an old shape can never crash the page. */
const validChoice = (v: unknown): PeriodChoice | null =>
  !!v && typeof v === 'object' && (PERIOD_KEYS as readonly string[]).includes(String((v as PeriodChoice).key)) ? (v as PeriodChoice) : null;

const Dashboard = () => {
  const { isLoading: roleLoading, isAdmin } = useSubscription();
  const { user } = useAuth();
  const team = useTeamDirectory();
  const navigate = useNavigate();
  // HOW the page is configured (not what is being looked at): persisted per person on this device.
  const [choice, setChoice] = usePersistedState<PeriodChoice>('admin.period', { key: '30d' }, { tier: 'local', scope: user?.id ?? null, validate: validChoice });
  /* HIDE MY ACTIVITY (Paul, 2026-10-02: "hide my personal sales/outreach activity from team performance and
     sales intelligence"). Default hidden; remembered per person on this device. ONE toggle, one meaning:
     it is sent to fn admin-overview, which leaves your (and every admin account's) outreach out of the team
     table, why prospects say no, templates, channels, niches, bottlenecks and the cohort rates — recomputed
     at the source, never subtracted here. Money, clients, delivery, What needs you, costs and the website
     never change with it. */
  const [hideMine, setHideMine] = usePersistedState<boolean>('admin.hideMyActivity', true, { tier: 'local', scope: user?.id ?? null });
  const q = useAdminOverview(choice, isAdmin, hideMine);
  const o = q.data;
  const firstName = (team.data ?? []).find((m) => m.user_id === user?.id)?.display_name?.split(' ')[0];
  const today = londonDay(Date.now());
  /* The one Send to sales team composer (2026-10-01): the header button, a draft or clarification from the
     team board panel, and Assign on a Needs your attention item all open it. */
  const [compose, setCompose] = useState<ComposerSeed | null>(null);
  const [fixTrades, setFixTrades] = useState(false);
  const clientsQ = usePaidClientList(isAdmin);
  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data]);
  const earn = useEarnings('all', isAdmin);
  /* The server already left the hidden rows out. ⛔ The filter below is ONLY for an older admin-overview
     deploy that does not know the setting (no activityScope) — never a second rule. */
  const scoped = !!o?.activityScope;
  const teamRows = useMemo(() => (o?.team ?? []).filter((r) => scoped || !(hideMine && (r.role === 'admin' || r.userId === user?.id))), [o?.team, scoped, hideMine, user?.id]);
  const lastActivity = useTeamLastActivity(teamRows.map((r) => r.userId), isAdmin);
  const needs = useMemo(() => (o ? needsYouItems(o.attention, clients, Date.now()) : []), [o, clients]);
  const handoffIds = useMemo(() => new Set(handoffClients(clients, Date.now()).map((c) => c.id)), [clients]);
  const routeOf = (id: string) => o?.clients.find((c) => c.leadId === id)?.route ?? null;

  /* ⛔ Every item opens WHERE ITS ACTION IS DONE (2026-09-30, docs/sales-workflow-nav.md has the audit):
     a WhatsApp chase → that Inbox conversation; a client task → the hub at its stage; a list problem →
     Outreach showing that list; a lead → its workspace. All are URLs, so Back and a refresh work. */
  const openItem = (i: AttentionItem) => {
    if (i.open === 'signups') document.getElementById('signup-desk')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (i.kind === 'handoffs_ready') document.getElementById('new-sales')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else navigate(attentionPath(i));
  };

  if (roleLoading) return <div className="flex h-full items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-8">
      <SEOHead title="Dashboard | LeadFinder Pro" description="The business at a glance: what needs you, what is working, what it costs, what it makes." canonical="/" noindex />
      <PageHeader
        eyebrow={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        title="Admin dashboard"
        subtitle="What needs you, what is working, what it costs and what it makes."
        actions={<>
          {o && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {ago(o.generatedAt)}</span>}
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => void q.refetch()} disabled={q.isFetching} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} /><span className="hidden sm:inline">Refresh</span>
          </Button>
          {isAdmin && <Button size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => setCompose({})}><Send className="h-4 w-4" />Send to sales team</Button>}
        </>}
      />

      {/* The one period for Team, Sales and Money. Today / yesterday always show beside it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented label="Period" value={choice.key} options={PICKER.map((k) => ({ key: k, label: PERIOD_LABEL[k] }))}
          onChange={(k) => setChoice(k === 'custom' ? { key: 'custom', from: choice.from ?? today, to: choice.to ?? today } : { key: k })} />
        {choice.key === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs">
            <Input type="date" className="h-8 w-[9.5rem] rounded-full text-xs" max={today} value={choice.from ?? ''} onChange={(e) => setChoice({ ...choice, from: e.target.value })} aria-label="From" />
            <span className="text-muted-foreground">to</span>
            <Input type="date" className="h-8 w-[9.5rem] rounded-full text-xs" max={today} value={choice.to ?? ''} onChange={(e) => setChoice({ ...choice, to: e.target.value })} aria-label="To" />
          </div>
        )}
        {o && <span className="text-xs text-muted-foreground">{o.period.fromDay ? `${o.period.fromDay} → ${o.period.toDay}` : 'Everything recorded'} · UK time</span>}
        <button type="button" onClick={() => setHideMine(!hideMine)} aria-pressed={hideMine} data-testid="hide-my-activity"
          title="Your own outreach in the Sales team table and Sales intelligence (reasons, templates, channels, niches). Money, clients and your actions always show."
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

      {o && (
        <>
          {/* 1. The four figures, each with one home on this page. */}
          <Section title="Business at a glance" tone="green" hint="This month's money and clients, what needs you, and the next commission payout.">
            <BusinessGlance o={o} clients={clients} needs={needs.length} urgent={needs.filter((i) => i.group === 'urgent').length} meId={user?.id ?? null}
              onNeeds={() => document.getElementById('needs-you')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
          </Section>

          {/* 2. Paul's own actions: the server's list (minus the two client kinds the canonical delivery view
              replaces) + his in-delivery client steps + handoffs a salesperson has left too long. */}
          <div id="needs-you">
            <Section title="What needs you" tone="amber" hint="Only things that need your action — one line each, most urgent first.">
              <AttentionQueue items={needs} onOpen={openItem} triage={o.triage} period={o.period.label}
                sorter={o.jobs?.find((j) => j.job === 'conversation-triage') ?? null} waitingInInbox={o.triageWaitingInInbox}
                delegated={o.delegated ?? null}
                onAssign={(i) => setCompose({ kind: 'lead_assignment', lead: { id: i.leadId!, name: i.business }, reason: i.why })}
                onFixTrades={() => setFixTrades(true)}
                onSuppress={async (id) => { await invokeEdge('conversation-triage', { action: 'suppress', id }); await q.refetch(); }}
                onResolve={async (id) => { await invokeEdge('conversation-triage', { action: 'resolve', id }); await q.refetch(); }} />
            </Section>
          </div>

          {/* 3. New sales and handoffs: a view INTO the Paid Clients workflow (paid-client-hub list). */}
          <Section title="Clients" tone="blue" hint="New sales being handed over to you, and how clients in delivery are doing.">
            {clientsQ.isError && <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">Could not load the paid clients: {edgeErrorMessage(clientsQ.error)}</p>}
            <HandoffsPanel clients={clients} routeOf={routeOf} onOpen={(id, section) => navigate(clientHubLink(id, section))} />
            <ClientHealthPanel o={o} exclude={handoffIds} onOpen={(id, section) => navigate(clientHubLink(id, section))} />
          </Section>

          {/* 4. The team: one salesperson per row (replaces Team comparison, the funnel, the calls panel and the
              team-status idea). ⛔ The old Sales team board panel is REMOVED (Paul, 2026-10-02: "a wasted
              feature"); Send to sales team stays in the header and Assign stays on Your actions. */}
          <Section title="Sales team" tone="purple" hint="How each salesperson is doing.">
            <TeamPerformanceTable o={o} rows={teamRows} lines={earn.data?.lines ?? null} lastActivity={lastActivity.data ?? {}} hidden={hideMine}
              onOpenPerson={(id) => navigate(`/sales-dashboard?person=${encodeURIComponent(id)}`)} />
          </Section>

          <Section title="Money" tone="green" hint="What came in, what went back, and what commission it added.">
            <MoneyPanel o={o} />
          </Section>

          <Section title="Sales intelligence" tone="purple" hint="Why prospects say no, and which messages, channels and niches work.">
            {o.activityScope?.hidden && <p className="px-1 text-xs text-muted-foreground" data-testid="intel-scope">Your own outreach is left out of these figures (My activity: hidden).</p>}
            <LostReasonsPanel o={o} />
            <TemplatesPanel o={o} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChannelsPanel o={o} />
              <NichesPanel o={o} />
            </div>
            <BottlenecksPanel o={o} />
            <BusinessSummaryPanel o={o} onRefresh={async () => {
              const r = await invokeEdge<{ ok: boolean; skipped?: string; status?: string; detail?: string }>('business-summary', {});
              await q.refetch();
              return r.skipped ?? r.detail ?? (r.status === 'rejected' ? 'The draft used a figure not in the data, so it was not shown.' : null);
            }} />
          </Section>

          <Section title="Website & system" tone="grey" hint="findable.live visitors, client search traffic, what the app is used for and what it costs to run.">
            <FindableFunnelPanel o={o} />
            <ClientSearchPanel o={o} />
            <FeatureUsagePanel o={o} />
            <CostPanel o={o} onDetail={() => navigate('/admin/api-usage')} />
          </Section>
        </>
      )}
      {/* The sign-up desk: the two working cards kept from the old page (their buttons act). Folded. */}
      <div id="signup-desk">
        <Section title="Sign-ups & free checks" tone="grey" hint="The two working desks: new sign-ups and free checks in progress.">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 [&>div>section>div]:rounded-[1.25rem] [&>div>section>div]:border-border/70 [&>div>section>div]:shadow-sm">
            <div className="min-w-0"><DashboardSection storageKey="submissions" title="Sign-ups" defaultOpen={false}><SubmissionsCard /></DashboardSection></div>
            <div className="min-w-0"><DashboardSection storageKey="free-checks" title="Free checks" defaultOpen={false}><FreeCheckProgressCard /></DashboardSection></div>
          </div>
        </Section>
      </div>

      <TradeAutofixDialog open={fixTrades} onOpenChange={setFixTrades} onDone={() => void q.refetch()} />
      <TeamComposer open={!!compose} onOpenChange={(v) => { if (!v) { setCompose(null); void q.refetch(); } }} seed={compose} />
      {o && <p className="px-1 text-[11px] text-muted-foreground">{o.exclusionNote} Figures are server totals ({o.ms} ms, {o.build}).</p>}
    </div>
  );
};

export default Dashboard;
