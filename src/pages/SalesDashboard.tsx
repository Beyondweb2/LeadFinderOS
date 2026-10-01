import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Layers, Loader2, Megaphone, MessageCircleReply, PhoneCall, Radio, RefreshCw, Sprout, Target, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { useEarnings } from '@/hooks/useEarnings';
import { EarnedCelebration } from '@/components/salesDash/EarnedCelebration';
import { MonthlyLadder } from '@/components/salesDash/MonthlyLadder';
import { BySellerTable, CommissionExplainer, PaymentsTable, PayoutDialog, RecentWins, SalesByWeek } from '@/components/salesDash/earningsParts';
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
import { KpiCard, Panel } from '@/components/salesDash/ui';
import { TeamBoard } from '@/components/team/TeamBoard';
import { FollowUpQueue, NextActions, FOLLOW_UP_GROUPS } from '@/components/salesDash/sections';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES — ONE PAGE (2026-10-01; the Sales dashboard and the Earnings page merged).
   It answers, in this order: how many sales this month and what the next one earns (the ladder), what
   was earned, how the work is going (calls, people reached, contacted → sale), what to do next, the
   recent wins, and how commission is worked out. Each fact is drawn ONCE. Both roles; a salesperson
   sees their own numbers only — decided by the servers (fn sales-performance, fn sales-earnings),
   never by this page. The admin picks a person (or everyone) and records payouts.
   ⛔ Removed in the merge (each repeated another card or helped no decision): the KPI row, Today strip,
   pipeline strip, waiting / warmth / health panels, activity feed, recap, targets, milestones, trends,
   the conversion funnel, the calls and won panels, the clients cards, the weekly tier and its audit.
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

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-6">
      <EarnedCelebration lines={e?.lines} enabled={viewingSelf && !!e?.commissionable} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{greeting()}{personName ? `, ${personName}` : ''}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Sales</h1>
          {isAdmin && <p className="mt-0.5 text-sm text-muted-foreground">Showing: {scopeLabel}.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="h-9 w-44" aria-label="Whose numbers"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="me">Me</SelectItem>
                {(team.data ?? []).filter((m) => m.status === 'active' && m.user_id !== user?.id).map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isAdmin && <Button size="sm" variant="outline" className="h-9" onClick={() => setPayoutOpen(true)}>Record a payout</Button>}
          <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => { void q.refetch(); void earn.refetch(); }} disabled={q.isFetching || earn.isFetching} aria-label="Refresh">
            <RefreshCw className={cn('h-4 w-4', (q.isFetching || earn.isFetching) && 'animate-spin')} /><span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      {(q.isError || earn.isError) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load {q.isError ? 'your numbers' : 'your earnings'}: {edgeErrorMessage(q.error ?? earn.error)}
          <Button size="sm" variant="outline" onClick={() => { void q.refetch(); void earn.refetch(); }}>Try again</Button>
        </div>
      )}

      {/* The Team board (2026-10-01): what Paul sent THIS salesperson — their own, never another's. */}
      {role === 'sales' && <TeamBoard />}

      {/* ── 1. The month: sales, the next sale's rate, what was earned ── */}
      {earn.isLoading && <div className="h-56 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" aria-busy="true" />}
      {e && oneSeller && e.commissionable && <MonthlyLadder lines={e.lines} clients={e.clients} totals={e.totals} />}
      {e && oneSeller && !e.commissionable && <p className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Commission is paid to salespeople. Clients you sell yourself show here at £0.</p>}
      {e && !oneSeller && <p className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Pick a salesperson to see their month and commission. The table below has everyone's.</p>}

      {/* ── 2. The work this month: three numbers, each with its base ── */}
      {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Counting…</p>}
      {d && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="work-numbers">
          <KpiCard label="Calls made" icon={PhoneCall} tone="blue" value={d.calls.total} sub="Logged this month" />
          <KpiCard label="People reached" icon={Users} tone="blue" value={reached} sub="Calls where you spoke to someone" />
          <KpiCard label="Contacted → sale" icon={Target} tone="green" value={conversion === null ? '—' : `${conversion}%`}
            sub={d.funnel.contacted ? `${d.funnel.won} sale${d.funnel.won === 1 ? '' : 's'} from ${d.funnel.contacted} people first contacted this month` : 'Nobody contacted this month yet'} />
        </div>
      )}

      {/* ── 3. What to do next (the ranked list, and the lists Focus Mode used to hold) ── */}
      {w && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3"><NextActions items={w.nextActions} go={go} title="What to do next" /></div>
          <div className="min-w-0 lg:col-span-2"><FollowUpQueue fu={w.followUps} go={go} group={fuGroup ?? fuDefault} setGroup={setFuGroup} /></div>
        </div>
      )}

      {/* ── 4. Wins and the month's shape ── */}
      {e && oneSeller && e.commissionable && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <RecentWins lines={e.lines} clients={e.clients} />
          <SalesByWeek lines={e.lines} />
        </div>
      )}

      {/* ── 5. Commission, explained; the payments behind it ── */}
      {e && oneSeller && e.commissionable && <CommissionExplainer lines={e.lines} totals={e.totals} />}
      {e && isAdmin && person === 'all' && <BySellerTable rows={e.bySeller} nameOf={(id) => nameOf.get(id) ?? 'Salesperson'} />}
      {e && <PaymentsTable lines={e.lines} bizOf={bizOf} sellerOf={isAdmin ? (id) => (id ? nameOf.get(id) ?? 'Former member' : '—') : undefined} />}

      {/* ── 6. More numbers, folded: which campaigns, messages, channels and sources work ── */}
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
