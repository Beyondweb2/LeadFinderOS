import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAdminOverview, type PeriodChoice } from '@/hooks/useAdminOverview';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { leadLaunchState } from '@/lib/salesLinks';
import { PERIOD_KEYS, PERIOD_LABEL, londonDay, type PeriodKey } from '@/lib/reportingPeriod';
import type { AttentionItem } from '@/lib/adminMetrics';
import { cn } from '@/lib/utils';
import { ago } from '@/components/salesDash/ui';
import { DashboardSection } from '@/components/dashboard/DashboardSection';
import { SubmissionsCard } from '@/components/dashboard/SubmissionsCard';
import { FreeCheckProgressCard } from '@/components/dashboard/FreeCheckProgressCard';
import {
  AttentionQueue, CallsPanel, ChannelsPanel, CommissionPanel, ContributionPanel, CostPanel,
  FunnelPanel, RevenuePanel, Section, SinceYesterday, TeamComparison,
} from '@/components/admin/controlCentre';
import { BottlenecksPanel, FeatureUsagePanel, NichesPanel, TemplatesPanel } from '@/components/admin/intelligence';
import { ClientHealthPanel } from '@/components/admin/clientHealth';
import { ClientSearchPanel, FindableFunnelPanel } from '@/components/admin/traffic';
import { BusinessSummaryPanel } from '@/components/admin/businessSummary';

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
  const q = useAdminOverview(choice, isAdmin);
  const o = q.data;
  const firstName = (team.data ?? []).find((m) => m.user_id === user?.id)?.display_name?.split(' ')[0];
  const today = londonDay(Date.now());

  const openItem = (i: AttentionItem) => {
    if (i.open === 'client' && i.leadId) navigate(`/paid-clients/${i.leadId}`);
    else if (i.open === 'lead' && i.leadId) navigate('/outreach', { state: leadLaunchState(i.leadId) });
    else if (i.open === 'inbox') navigate(i.leadId ? `/inbox?lead=${i.leadId}` : '/inbox');
    else if (i.open === 'signups') document.getElementById('signup-desk')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else navigate('/outreach');
  };

  if (roleLoading) return <div className="flex h-full items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8">
      <SEOHead title="Dashboard | LeadFinder Pro" description="The business at a glance: what needs you, what is working, what it costs, what it makes." canonical="/" noindex />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">What needs you, what is working, what it costs and what it makes.</p>
        </div>
        <div className="flex items-center gap-2">
          {o && <span className="text-xs text-muted-foreground">Updated {ago(o.generatedAt)}</span>}
          <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', q.isFetching && 'animate-spin')} />Refresh
          </Button>
        </div>
      </header>

      {/* The one period for Team, Sales and Money. Today / yesterday always show beside it. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1" role="group" aria-label="Period">
          {PICKER.map((k) => (
            <button key={k} type="button" onClick={() => setChoice(k === 'custom' ? { key: 'custom', from: choice.from ?? today, to: choice.to ?? today } : { key: k })}
              className={cn('rounded-lg px-2.5 py-1.5 text-xs font-medium transition', choice.key === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              aria-pressed={choice.key === k}>{PERIOD_LABEL[k]}</button>
          ))}
        </div>
        {choice.key === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs">
            <Input type="date" className="h-8 w-[9.5rem] text-xs" max={today} value={choice.from ?? ''} onChange={(e) => setChoice({ ...choice, from: e.target.value })} aria-label="From" />
            <span className="text-muted-foreground">to</span>
            <Input type="date" className="h-8 w-[9.5rem] text-xs" max={today} value={choice.to ?? ''} onChange={(e) => setChoice({ ...choice, to: e.target.value })} aria-label="To" />
          </div>
        )}
        {o && <span className="text-xs text-muted-foreground">{o.period.fromDay ? `${o.period.fromDay} → ${o.period.toDay}` : 'Everything recorded'} · UK time</span>}
      </div>

      {q.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load the dashboard: {edgeErrorMessage(q.error)}
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      )}
      {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Adding up the business…</p>}

      {o && (
        <>
          <Section title="Now">
            <AttentionQueue items={o.attention} onOpen={openItem} triage={o.triage} period={o.period.label}
              sorter={o.jobs?.find((j) => j.job === 'conversation-triage') ?? null} waitingInInbox={o.triageWaitingInInbox}
              onSuppress={async (id) => { await invokeEdge('conversation-triage', { action: 'suppress', id }); await q.refetch(); }}
              onResolve={async (id) => { await invokeEdge('conversation-triage', { action: 'resolve', id }); await q.refetch(); }} />
            <SinceYesterday o={o} attention={o.attention.length} />
            <BusinessSummaryPanel o={o} onRefresh={async () => {
              const r = await invokeEdge<{ ok: boolean; skipped?: string; status?: string; detail?: string }>('business-summary', {});
              await q.refetch();
              return r.skipped ?? r.detail ?? (r.status === 'rejected' ? 'The draft used a figure not in the data, so it was not shown.' : null);
            }} />
          </Section>

          <Section title="Team">
            <TeamComparison o={o} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <FunnelPanel o={o} />
              <ChannelsPanel o={o} />
            </div>
            <CallsPanel o={o} />
          </Section>

          <Section title="Sales intelligence">
            <BottlenecksPanel o={o} />
            <TemplatesPanel o={o} />
            <NichesPanel o={o} />
          </Section>

          <Section title="Money">
            <RevenuePanel o={o} />
            <ContributionPanel o={o} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <CommissionPanel o={o} />
              <CostPanel o={o} onDetail={() => navigate('/admin/api-usage')} />
            </div>
          </Section>

          <Section title="Clients">
            <ClientHealthPanel o={o} onOpen={(id) => navigate(`/paid-clients/${id}`)} />
          </Section>

          <Section title="Traffic">
            <FindableFunnelPanel o={o} />
            <ClientSearchPanel o={o} />
          </Section>

          <Section title="System">
            <FeatureUsagePanel o={o} />
          </Section>
        </>
      )}

      {/* The sign-up desk: the two working cards kept from the old page (their buttons act). Folded. */}
      <div id="signup-desk">
        <Section title="Sign-ups & free checks">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 [&>div>section>div]:rounded-2xl [&>div>section>div]:border-border/60 [&>div>section>div]:shadow-sm">
            <div className="min-w-0"><DashboardSection storageKey="submissions" title="Sign-ups" defaultOpen={false}><SubmissionsCard /></DashboardSection></div>
            <div className="min-w-0"><DashboardSection storageKey="free-checks" title="Free checks" defaultOpen={false}><FreeCheckProgressCard /></DashboardSection></div>
          </div>
        </Section>
      </div>

      {o && <p className="text-[11px] text-muted-foreground">{o.exclusionNote} Figures are server totals ({o.ms} ms, {o.build}).</p>}
    </div>
  );
};

export default Dashboard;
