import { useNavigate, Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAdminOverview, type PeriodChoice } from '@/hooks/useAdminOverview';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { clientHubLink } from '@/lib/salesLinks';
import { londonDay } from '@/lib/reportingPeriod';
import { cn } from '@/lib/utils';
import { PageHeader, Segmented, ago } from '@/components/salesDash/ui';
import { ChannelsPanel, CostPanel, Section } from '@/components/admin/controlCentre';
import { MoneyPanel, TeamPerformanceTable } from '@/components/admin/teamControl';
import { usePaidClientList, useTeamLastActivity } from '@/hooks/useAdminTeamControl';
import { useEarnings } from '@/hooks/useEarnings';
import { handoffClients } from '@/lib/adminControl';
import { BottlenecksPanel, FeatureUsagePanel, NichesPanel, TemplatesPanel } from '@/components/admin/intelligence';
import { LostReasonsPanel } from '@/components/admin/lostReasons';
import { ClientHealthPanel } from '@/components/admin/clientHealth';
import { FindableFunnelPanel } from '@/components/admin/traffic';
import { BusinessSummaryPanel } from '@/components/admin/businessSummary';
import { HIDE_MY_ACTIVITY_KEY, PICKER, validChoice } from '@/lib/adminPeriod';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TEAM, INSIGHTS AND COSTS (Concept A, Paul 2026-10-26). The panels that used to sit under the admin home, moved here
   unchanged and linked from the home page: Sales team, Money, Sales intelligence, Clients in delivery, findable.live
   traffic, feature usage and API costs. ⛔ "Client websites · Google search" is NOT here: Google Search Console was never
   connected (0 connections; the sync reports not_configured), so the panel only ever said "Not connected". The component
   stays in traffic.tsx for when it is set up. Admin only (access.ts: not a sales route).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const AdminInsights = () => {
  const { isLoading: roleLoading, isAdmin } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [choice, setChoice] = usePersistedState<PeriodChoice>('admin.period', { key: '30d' }, { tier: 'local', scope: user?.id ?? null, validate: validChoice });
  const [hideMine, setHideMine] = usePersistedState<boolean>(HIDE_MY_ACTIVITY_KEY, false, { tier: 'local', scope: user?.id ?? null });
  const q = useAdminOverview(choice, isAdmin, hideMine);
  const o = q.data;
  const today = londonDay(Date.now());
  const clientsQ = usePaidClientList(isAdmin);
  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data]);
  const earn = useEarnings('all', isAdmin);
  const scoped = !!o?.activityScope;
  const teamRows = useMemo(() => (o?.team ?? []).filter((r) => scoped || !(hideMine && (r.role === 'admin' || r.userId === user?.id))), [o?.team, scoped, hideMine, user?.id]);
  const lastActivity = useTeamLastActivity(teamRows.map((r) => r.userId), isAdmin);
  const handoffIds = useMemo(() => new Set(handoffClients(clients, Date.now()).map((c) => c.id)), [clients]);

  if (roleLoading) return <div className="flex h-full items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-8">
      <SEOHead title="Team, insights and costs | LeadFinder Pro" description="The team, money, what works, clients in delivery, traffic and costs." canonical="/admin/insights" noindex />
      <PageHeader eyebrow="Admin"
        title="Team, insights and costs" subtitle="The panels that used to sit under your dashboard: the team, money, what works, clients in delivery, traffic and costs."
        actions={<>
          {o && <span className="hidden text-xs text-muted-foreground sm:inline">Updated {ago(o.generatedAt)}</span>}
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 rounded-full"><Link to="/"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Dashboard</span></Link></Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full" onClick={() => void q.refetch()} disabled={q.isFetching} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', q.isFetching && 'animate-spin')} /><span className="hidden sm:inline">Refresh</span>
          </Button>
        </>} />

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
        {o && <span className="text-xs text-muted-foreground">{o.period.fromDay ? `${o.period.fromDay} → ${o.period.toDay}` : 'Everything recorded'} · UK time</span>}
        <button type="button" onClick={() => setHideMine(!hideMine)} aria-pressed={hideMine} data-testid="hide-my-activity"
          title="Your own outreach in the Sales team table and Sales intelligence."
          className={cn('ml-auto rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition', hideMine ? 'bg-muted/60 text-foreground ring-border' : 'bg-blue-500/15 text-blue-700 ring-blue-400/30 dark:text-blue-200')}>
          {hideMine ? 'My activity: hidden' : 'My activity: included'}
        </button>
      </div>

      {q.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load: {edgeErrorMessage(q.error)}
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      )}
      {q.isLoading && <p className="flex items-center gap-2 rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Adding up the business…</p>}

      {o && (
        <>
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
          <Section title="Clients in delivery" tone="blue" hint="How clients in delivery are doing.">
            <ClientHealthPanel o={o} exclude={handoffIds} onOpen={(id, section) => navigate(clientHubLink(id, section))} />
          </Section>
          <Section title="Website & system" tone="grey" hint="findable.live visitors, what the app is used for and what it costs to run.">
            <FindableFunnelPanel o={o} />
            <FeatureUsagePanel o={o} />
            <CostPanel o={o} onDetail={() => navigate('/admin/api-usage')} />
          </Section>
        </>
      )}
      {o && <p className="px-1 text-[11px] text-muted-foreground">{o.exclusionNote} Figures are server totals ({o.ms} ms, {o.build}).</p>}
    </div>
  );
};

export default AdminInsights;
