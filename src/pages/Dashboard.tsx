import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, CalendarClock, ClipboardCheck, FlaskConical, Inbox, Loader2, MessageCircleReply, PackageCheck, RefreshCw, Star, Users } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { useWhatsAppUnread } from '@/hooks/useWhatsAppUnread';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { isPaidLead } from '@/lib/leadPayment';
import { leadTarget, type LeadLink } from '@/lib/salesLinks';
import type { FollowUpGroup, SalesWorkspace } from '@/lib/salesWorkspace';
import { cn } from '@/lib/utils';
import { KpiCard, Panel } from '@/components/salesDash/ui';
import { ActivityFeed, FollowUpQueue, NextActions, WaitingPanel, FOLLOW_UP_GROUPS } from '@/components/salesDash/sections';
import { NextActionsCard } from '@/components/dashboard/NextActionsCard';
import { ClientDeliveryCard } from '@/components/dashboard/ClientDeliveryCard';
import { SubmissionsCard } from '@/components/dashboard/SubmissionsCard';
import { FreeCheckProgressCard } from '@/components/dashboard/FreeCheckProgressCard';
import { AuditFunnelCard } from '@/components/dashboard/AuditFunnelCard';
import { DashboardSection } from '@/components/dashboard/DashboardSection';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ADMIN DASHBOARD (rebuilt in the UI cleanup pass, 2026-09-29 — Paul: "cleaner, calmer, more
   focused… I much prefer the design and clarity of the current Sales dashboard").
   The same visual language as the Sales dashboard (src/components/salesDash/ui.tsx), its own content:
     1. four numbers — paying clients, replies waiting, follow-ups due, interested;
     2. the WHOLE BOOK's next best actions and follow-up queue (fn sales-performance, person 'all' —
        the admin's own outreach and the team's, one list, so nothing waits unseen);
     3. what only the admin can do: deliver to a paying client, chase an unpaid sign-up, a quote gone
        quiet, leads with no trade (the derived tasks, lib/dashboardTasks.ts) — beside replies waiting;
     4. the clients' delivery checklist, free checks in flight, questionnaire submissions;
     5. team activity; the audit funnel folded away as reference.
   ⛔ REMOVED 2026-09-29, each one a duplicate, a dead end or legacy (docs/ui-cleanup-pass.md):
     the rotating tip bar (the old web-design pitch); channel performance and the 21-row pipeline
     (the Sales dashboard's Channels and Pipeline are better, one click away); per-campaign funnels
     (the Sales dashboard's Campaigns); the Admin zone (four links to routes that no longer exist,
     multi-tenant user tables with a hard-delete, vanity totals — the Team page manages people); the
     quick links (the sidebar has them); "Clear all stored tasks" (Next Actions are set and cleared
     by a person on the lead, and the follow-up queue shows them).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

type Perf = { ok: true; workspace: SalesWorkspace };

/** The derived tasks only the admin acts on. Replies and stored Next Actions are in the whole-book
 *  lists above (Waiting on a reply, the follow-up queue), so they are not repeated here. */
const ADMIN_TASK_KINDS = new Set(['deliver', 'chase', 'quoted', 'fix_trades']);

function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(now));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const Dashboard = () => {
  const { isLoading: isSubscriptionLoading, isAdmin, role } = useSubscription();
  const { metrics, isLoading, refetch } = useDashboardMetrics(isAdmin);
  const { user } = useAuth();
  const team = useTeamDirectory();
  const navigate = useNavigate();
  const { toast } = useToast();
  const unread = useWhatsAppUnread();
  const ws = useQuery({
    queryKey: ['sales-performance', role, 'all', 'all', null],
    enabled: !!role,
    staleTime: 60_000,
    queryFn: () => invokeEdge<Perf>('sales-performance', { period: 'all', person: 'all', targets: null }),
  });
  const w = ws.data?.workspace;
  const [fuGroup, setFuGroup] = useState<FollowUpGroup | null>(null);
  const fuDefault = useMemo<FollowUpGroup>(() => (w ? (FOLLOW_UP_GROUPS.find((g) => w.followUps[g.key].length > 0)?.key ?? 'overdue') : 'overdue'), [w]);

  const go = (link: LeadLink, leadId: string) => { const [path, state] = leadTarget(link, leadId); navigate(path, state ? { state } : undefined); };
  const showGroup = (g: FollowUpGroup) => { setFuGroup(g); document.getElementById('follow-ups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  /* Dismiss a derived task = mark the lead closed (a DEAD status in dashboardTasks.ts, so the chase /
     quoted rules stop firing for it). The card confirms first. */
  const handleDismissTask = async (leadId: string): Promise<void> => {
    const { error } = await supabase.from('outreach_leads').update({ status: 'closed' }).eq('id', leadId);
    if (error) { toast({ title: 'Could not close the lead', description: error.message, variant: 'destructive' }); return; }
    refetch();
  };

  const paid = useMemo(() => metrics.allLeads.filter((l) => isPaidLead(l)), [metrics.allLeads]);
  const adminTasks = useMemo(() => metrics.dashTasks.filter((t) => ADMIN_TASK_KINDS.has(t.kind)), [metrics.dashTasks]);
  const toDeliver = adminTasks.filter((t) => t.kind === 'deliver').length;
  const firstName = (team.data ?? []).find((m) => m.user_id === user?.id)?.display_name?.split(' ')[0];

  if (isLoading || isSubscriptionLoading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const overdue = w?.followUps.overdue.length ?? 0;
  const dueToday = w?.followUps.dueToday.length ?? 0;
  const replied = w?.followUps.repliedUnanswered.length ?? 0;
  const interested = w?.pipeline.find((p) => p.key === 'interested')?.count ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-6">
      <SEOHead title="Dashboard | LeadFinder Pro" description="What needs you today, across the whole book." canonical="/" noindex />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{greeting()}{firstName ? `, ${firstName}` : ''}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">What needs you today, across the whole book — yours and the team's.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => navigate('/sales-dashboard')}>
            <BarChart3 className="h-3.5 w-3.5" />Team numbers
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => { void ws.refetch(); refetch(); }} disabled={ws.isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', ws.isFetching && 'animate-spin')} />Refresh
          </Button>
        </div>
      </header>

      {/* ── The four numbers. Money is the strongest surface. ── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
        <div className="col-span-3 lg:col-span-1">
          <KpiCard hero label="Paying clients" icon={PackageCheck} tone="green" value={paid.length}
            sub={toDeliver ? `${toDeliver} waiting for delivery to start` : 'Every paid client has started'} onClick={() => navigate('/paid-clients')} />
        </div>
        <KpiCard label="Replies waiting" icon={MessageCircleReply} tone="blue" value={w ? replied : '…'}
          sub={unread.count ? `${unread.count} unread in your Inbox` : 'Replied, not yet answered'} onClick={() => navigate('/inbox')} />
        <KpiCard label="Follow-ups due" icon={CalendarClock} tone={overdue ? 'red' : 'amber'} value={w ? overdue + dueToday : '…'}
          sub={overdue ? `${overdue} overdue · ${dueToday} today` : `${dueToday} today`} onClick={() => w && showGroup(overdue ? 'overdue' : 'dueToday')} />
        <KpiCard label="Interested" icon={Star} tone="green" value={w ? interested : '…'}
          sub={w ? `${w.today.interested} today · ${w.today.replies} replies today` : 'Counting…'} onClick={() => navigate('/outreach')} />
      </div>

      {ws.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load the whole-book lists: {edgeErrorMessage(ws.error)}
          <Button size="sm" variant="outline" onClick={() => void ws.refetch()}>Try again</Button>
        </div>
      )}
      {ws.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lining up what needs you…</p>}

      {w && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3">
            <NextActions collapseKey="admin.next-actions" items={w.nextActions} go={go} onFocus={() => navigate('/focus')} title="Next best actions"
              hint="Across the whole book, most urgent first — replies, due follow-ups, warm leads, Quick Close reviews. Tap to open." />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <FollowUpQueue collapseKey="admin.follow-ups" fu={w.followUps} go={go} group={fuGroup ?? fuDefault} setGroup={setFuGroup}
              hint="Next Actions as people set them, and the conversations that need one." />
          </div>
        </div>
      )}

      {/* What only the admin does, beside the replies nobody has answered. The derived cards keep
          their own rules and buttons; the wrapper only gives them the Sales dashboard's surface. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3 [&>section>div]:rounded-2xl [&>section>div]:border-border/60 [&>section>div]:shadow-sm">
          {adminTasks.length > 0 ? <DashboardSection storageKey="admin-tasks" title="Needs you" defaultOpen collapsedHint={`${adminTasks.length} task${adminTasks.length === 1 ? '' : 's'}`}><NextActionsCard tasks={adminTasks} onDismiss={handleDismissTask} /></DashboardSection> : (
            <Panel collapseKey="admin.needs-you" title="Needs you" icon={ClipboardCheck} tone="green" hint="Delivery to start, unpaid sign-ups, quotes gone quiet.">
              <p className="text-xs text-muted-foreground">Nothing waiting on you: every paid client has started, and no sign-up or quote is going cold.</p>
            </Panel>
          )}
        </div>
        <div className="min-w-0 lg:col-span-2">{w && <WaitingPanel collapseKey="admin.waiting" waiting={w.waiting} go={go} title="Waiting on a reply" />}</div>
      </div>

      <Panel collapseKey="admin.clients" summary={`${paid.length} paying client${paid.length === 1 ? '' : 's'}`} title="Clients" icon={PackageCheck} tone="green" hint="What each paying client needs next: baseline, checklist, pages." className="[&_.rounded-lg.border]:border-border/60">
        <ClientDeliveryCard leads={metrics.allLeads} onChanged={refetch} />
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 [&>div>section>div]:rounded-2xl [&>div>section>div]:border-border/60 [&>div>section>div]:shadow-sm">
        {/* Open by default (2026-09-07: it answers "where has my test got to"); the shared collapse
            since 2026-09-30 lets Paul fold it once he has looked. */}
        <div className="min-w-0"><DashboardSection storageKey="free-checks" title="Free checks" defaultOpen><FreeCheckProgressCard /></DashboardSection></div>
        <div className="min-w-0"><DashboardSection storageKey="submissions" title="Sign-ups" defaultOpen><SubmissionsCard /></DashboardSection></div>
      </div>

      {w && (
        <ActivityFeed collapseKey="admin.activity" items={w.activity} go={go} title="Team activity" hint="What happened across the book in the last 14 days, and who did it." />
      )}

      <DashboardSection storageKey="audit-funnel" title="Audit funnel" defaultOpen={false} collapsedHint="contacted → pitched → paid, founder places">
        <AuditFunnelCard funnel={metrics.auditFunnel} />
      </DashboardSection>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />Campaigns, templates, channels and conversion are on <button type="button" className="text-primary hover:underline" onClick={() => navigate('/sales-dashboard')}>Team numbers</button>.</span>
        <span className="inline-flex items-center gap-1"><Inbox className="h-3.5 w-3.5" /><button type="button" className="text-primary hover:underline" onClick={() => navigate('/inbox')}>Inbox</button></span>
        <span className="inline-flex items-center gap-1"><FlaskConical className="h-3.5 w-3.5" /><button type="button" className="text-primary hover:underline" onClick={() => navigate('/admin/api-usage')}>API usage</button></span>
      </p>
    </div>
  );
};

export default Dashboard;
