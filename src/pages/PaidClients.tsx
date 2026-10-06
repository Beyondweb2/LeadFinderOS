import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Plus, Loader2, RefreshCw, UsersRound, Layers, FileCode2, MessageSquareQuote, CalendarClock, BellRing, ChevronRight, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { remeasureStatus } from '@/lib/deliveryCockpit';
import { nextActionText, nextActionViewOf } from '@/lib/nextActionView';
import { useAuth } from '@/hooks/useAuth';
import { EdgeAuthError, edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import type { ClientContract } from '@/lib/clientContract';
import { usePersistedState } from '@/hooks/usePersistedState';
import { matchesFilter, type ClientFilter } from '@/lib/deliveryStage';
import { STATE_EDGE, type SetupView } from '@/components/ClientSetupCard';
import { cn } from '@/lib/utils';
import { Callout, DialogHero, EDGE, Empty, PageHeader, Segmented, SURFACE, ToneChip, type Tone } from '@/components/operator/ui';
import { Panel } from '@/components/salesDash/ui';
import { PAID_CLIENT_TOOL_LABEL, toolOf, type PaidClientTool } from '@/lib/paidClientTools';
import { PagePlanTool } from '@/components/clientTools/PagePlanTool';
import { PageGeneratorTool } from '@/components/clientTools/PageGeneratorTool';
import { ReviewReplyTool } from '@/components/clientTools/ReviewReplyTool';
import { intakeStatusLine, type IntakeStatus, type IntakeSummary } from '@/lib/clientIntake';
import { outreachLeadLink } from '@/lib/salesLinks';

type Client = { id: string; business_name: string; address?: string | null; search_location?: string | null; derived_town?: string | null; website?: string | null; amount_paid?: number | null; payment_date?: string | null; next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null; baseline_audit_id?: string | null; remeasure_audit_id?: string | null; remeasure_due_date?: string | null; delivery_checklist?: Record<string, boolean> | null; payment_source?: 'recorded' | 'marked_paid' | null;
  /* The handoff (paid-client-hub list, src/lib/handoffReadiness.ts) and who sold it. */
  handoff?: SetupView | null; sold_by_name?: string | null; seller_pending?: 'awaiting_attribution' | 'not_credited' | null;
  contract?: ClientContract | null;
  /* Paid client auto-intake (2026-10-06): the run state and its counts. */
  intake?: { status: IntakeStatus; summary: IntakeSummary | null } | null };
/* A handoff a salesperson SENT for a client who has not paid yet (paid-client-hub list). */
type AwaitingHandoff = { lead_id: string; business_name: string | null; sent_at: string; sent_by: string | null; lines: string[] };
/* Every request goes through invokeEdge: a real session first, an explicit Authorization header,
   one refresh-and-retry on 401, and a genuine sign-out routed to /auth. Never the anon key. */
const call = <T = Record<string, unknown>>(body: Record<string, unknown>) => invokeEdge<T>('paid-client-hub', body);

function ManualClient({ done }: { done: (id: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [matches, setMatches] = useState<Array<{id:string;business_name:string;website?:string|null;search_location?:string|null}>>([]); const [form, setForm] = useState<Record<string, string>>({ amount_paid: '49.99', website_route: 'optimise_existing', domain_status: 'existing' });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const save = async () => { setBusy(true); setError(null); try { const r = await call<{ lead_id: string }>({ action: 'create_manual', ...form, services: form.services?.split(',') ?? [], service_areas: form.service_areas?.split(',') ?? [] }); done(r.lead_id); } catch (e) { setError(edgeErrorMessage(e, 'Could not save the client')); } finally { setBusy(false); } };
  const findMatches = async () => { if ((form.business_name ?? '').trim().length < 2) return; try { setMatches((await call<{ leads: typeof matches }>({ action: 'matches', query: form.business_name })).leads); } catch (e) { setError(edgeErrorMessage(e, 'Could not search leads')); } };
  return <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHero icon={UsersRound} tone="green" title="Add paid client manually" subtitle="This creates the same paid onboarding record used by checkout clients." /><div className="grid gap-3 sm:grid-cols-2">
    {[['business_name','Business name'],['contact_name','Contact name'],['email','Email'],['phone','Phone / WhatsApp'],['website','Website'],['location','Primary location'],['services','Services (comma separated)'],['service_areas','Service areas (comma separated)'],['amount_paid','Amount paid'],['payment_date','Payment date (YYYY-MM-DD)'],['access_status','Website manager / access status']].map(([key,label]) => <div key={key} className={key === 'access_status' ? 'sm:col-span-2' : ''}><Label>{label}</Label><Input value={form[key] ?? ''} onChange={(e) => set(key,e.target.value)} /></div>)}
    <div><Label>Website route</Label><select className="w-full rounded-md border bg-background p-2 text-sm" value={form.website_route} onChange={(e) => set('website_route',e.target.value)}><option value="optimise_existing">Optimise existing site</option><option value="rebuild_existing">Rebuild existing site</option><option value="new_site">New site</option></select></div>
    <div><Label>Domain</Label><select className="w-full rounded-md border bg-background p-2 text-sm" value={form.domain_status} onChange={(e) => set('domain_status',e.target.value)}><option value="existing">Existing domain</option><option value="new">New domain</option></select></div>
  </div><div className="rounded-xl bg-muted/40 p-3 text-sm ring-1 ring-inset ring-border/50"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Already an outreach lead?</span><Button type="button" size="sm" variant="outline" onClick={() => void findMatches()}>Find matching business</Button></div>{matches.length > 0 && <div className="mt-2 space-y-1">{matches.map((m) => <button key={m.id} type="button" className="block w-full rounded-lg border bg-card p-2 text-left hover:bg-muted" onClick={() => { set('lead_id',m.id); set('business_name',m.business_name); if (m.website) set('website',m.website); if (m.search_location) set('location',m.search_location); setMatches([]); }}><span className="font-medium">{m.business_name}</span><span className="ml-2 text-muted-foreground">{m.search_location || m.website || m.id}</span></button>)}</div>}{form.lead_id && <p className="mt-2 text-teal-600 dark:text-teal-300">Matched existing outreach lead — no duplicate lead will be created.</p>}</div>{error && <Callout tone="red" icon={AlertCircle}>{error}</Callout>}<div className="flex justify-end"><Button disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save client</Button></div></DialogContent>;
}

/* ⛔ A FAILED LOAD IS NEVER "No paid clients yet." The list has three states — loading, error,
   loaded — and the empty card belongs to the third only. The fetch waits for the auth session
   (ProtectedRoute already guarantees a user; this makes the dependency explicit), runs once per
   user, and a genuine sign-out is handled by invokeEdge + ProtectedRoute, not by this page. */
/* ══ THE DELIVERY COMMAND CENTRE (2026-10-02, docs/paid-client-automation.md) ═════════════════════════
   Who needs attention, what is missing, and the ONE next step — per client, from paid-client-hub
   (_shared/client-setup.ts). Filters are how the page is configured (usePersistedState), never the URL. */
const FILTERS: { value: ClientFilter; label: string; tone: Tone }[] = [
  { value: 'attention', label: 'Needs attention', tone: 'amber' }, { value: 'ready_to_submit', label: 'Ready to submit', tone: 'green' }, { value: 'ready', label: 'Ready for delivery', tone: 'green' }, { value: 'in_delivery', label: 'In delivery', tone: 'purple' }, { value: 'all', label: 'All', tone: 'grey' },
];

/* ══ THE TOOLS (2026-10-06, src/lib/paidClientTools.ts) ═════════════════════════════════════════════
   The page plan, page generator and review replies — once three admin pages — are the Tools of Paid
   Clients. WHICH tool is open is what you are looking at, so it is the URL (?tool=); the old pages
   redirect here. Each client's own page carries the same three, scoped to them. */
const TOOL_META: Record<PaidClientTool, { icon: typeof Layers; tone: Tone; hint: string }> = {
  'page-plan': { icon: Layers, tone: 'blue', hint: 'Measured questions clustered into pages, scored and released in waves — per client' },
  'page-generator': { icon: FileCode2, tone: 'purple', hint: 'Service + area pages and Q&A articles aimed at the measured queries — paste-ready' },
  'review-replies': { icon: MessageSquareQuote, tone: 'blue', hint: 'Paste a Google review in, copy a reply out — or a "don\'t reply" verdict' },
};

function paymentLine(c: Client): string {
  const paid = (c.amount_paid ?? 0) > 0 ? 'Paid' + (c.payment_date ? ' · ' + c.payment_date : '') : c.payment_source === 'marked_paid' ? 'Marked paid · no amount recorded' : 'Needs payment';
  return paid + (c.remeasure_due_date ? ' · remeasure ' + remeasureStatus(c.remeasure_due_date, Date.now()).label : '');
}

function ClientCard({ c }: { c: Client }) {
  const s = c.handoff;
  const tone: Tone = s ? STATE_EDGE[s.state] : 'grey';
  const pkg = c.contract?.name ? c.contract.name + ' · ' + c.contract.paymentsMade + ' of ' + c.contract.totalPayments + ' paid' : 'Term not recorded';
  const na = nextActionViewOf(c.next_action, c.next_action_date, null, undefined, c.next_action_time);
  return (
    <Link to={'/paid-clients/' + c.id} className="group block min-w-0 rounded-[1.25rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <div className={cn(SURFACE, EDGE[tone], 'grid min-w-0 gap-3 p-4 text-sm transition group-hover:border-primary/50 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-center')}>
        <div className="min-w-0">
          <div className="truncate text-base font-bold tracking-tight">{c.business_name}</div>
          <div className="truncate text-muted-foreground">{c.derived_town || c.search_location || c.address || 'Location needed'}</div>
          <div className={cn('text-xs font-medium', !c.contract?.name && 'text-amber-600 dark:text-amber-300')} data-testid="paid-client-contract">{pkg}</div>
          {c.seller_pending ? <div className="text-xs text-amber-700 dark:text-amber-400">{c.seller_pending === 'awaiting_attribution' ? 'Seller awaiting attribution review' : 'Not credited to a salesperson'}</div>
            : c.sold_by_name && <div className="text-xs text-muted-foreground">Sold by {c.sold_by_name}</div>}
        </div>
        <div className="min-w-0 space-y-1">
          {s && <ToneChip tone={tone} dot testId="paid-client-handoff" className="whitespace-normal text-left">{s.state_label}</ToneChip>}
          {s && <div className="text-xs text-muted-foreground">{s.state === 'ended' ? s.stage_label : `Setup ${s.done}/${s.total} · ${s.stage_label}`}</div>}
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="h-3 w-3 shrink-0" />{paymentLine(c)}</div>
          {c.intake && <div className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="paid-client-intake"><Search className="h-3 w-3 shrink-0" />Intake: {intakeStatusLine(c.intake.status, c.intake.summary)}</div>}
        </div>
        <div className="min-w-0" data-testid="paid-client-next">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next step</div>
          <div className={cn('break-words font-semibold', s?.next.action ? 'text-foreground' : 'text-muted-foreground')}>{s?.next.label ?? '—'}</div>
          {s && s.stage === 'setup' && s.missing.length > 0 && <div className="break-words text-xs text-amber-700 dark:text-amber-300">Missing: {s.missing.join(' · ')}</div>}
          {/* A reminder Paul set by hand (the human Next Action) is his own note, never replaced by the derived step. */}
          {na && <div className="mt-1.5 flex items-start gap-1 text-xs text-muted-foreground"><BellRing className="mt-0.5 h-3 w-3 shrink-0" /><span><span className="text-muted-foreground/80">Your reminder: </span>{nextActionText(na)}</span></div>}
        </div>
        <ChevronRight className="hidden h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground md:block" aria-hidden />
      </div>
    </Link>
  );
}

/* ══ HANDOFFS SENT BEFORE PAYMENT (2026-10-06, Send to Paul) ═══════════════════════════════════════════
   A salesperson may send the handoff before the client pays. Paul sees it here as "Awaiting payment"; the
   moment payment lands the client moves into the list below and the automatic intake merges this handoff. */
function AwaitingPayment({ items, highlight }: { items: AwaitingHandoff[]; highlight: string | null }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2" data-testid="handoffs-awaiting-payment">
      <h2 className="flex items-center gap-2 px-1 text-sm font-bold"><Send className="h-4 w-4 text-blue-500" />New client handoffs · awaiting payment <span className="font-normal text-muted-foreground">({items.length})</span></h2>
      {items.map((h) => (
        <details key={h.lead_id} open={highlight === h.lead_id} className={cn(SURFACE, EDGE.blue, 'p-3 text-sm', highlight === h.lead_id && 'ring-2 ring-primary/50')}>
          <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2">
            <span className="min-w-0"><span className="font-bold">{h.business_name ?? 'A client'}</span><span className="text-muted-foreground"> · from {h.sent_by ?? 'the salesperson'} · {new Date(h.sent_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}</span></span>
            <ToneChip tone="amber" dot>Awaiting payment</ToneChip>
          </summary>
          <ul className="mt-2 space-y-0.5">{h.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <Link to={outreachLeadLink(h.lead_id)} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Open the lead →</Link>
        </details>
      ))}
    </section>
  );
}

export default function PaidClients() {
  const { user, isLoading: authLoading } = useAuth();
  const [filter, setFilter] = usePersistedState<ClientFilter>('paidClients.filter', 'attention', { tier: 'local', validate: (v: unknown) => FILTERS.find((x) => x.value === v)?.value ?? null });
  const [searchParams, setSearchParams] = useSearchParams();
  const tool = toolOf(searchParams.get('tool'));
  const openTool = (t: PaidClientTool | null) => setSearchParams((p) => { const n = new URLSearchParams(p); if (t) n.set('tool', t); else n.delete('tool'); return n; });
  const [clients, setClients] = useState<Client[] | null>(null);
  const [awaiting, setAwaiting] = useState<AwaitingHandoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  /* The bell's "NEW CLIENT HANDOFF" link for a client who has not paid yet opens this list on that handoff. */
  const handoffParam = searchParams.get('handoff');
  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true); setError(null);
    try {
      const r = await call<{ clients: Client[]; handoffs_awaiting_payment?: AwaitingHandoff[] }>({ action: 'list' });
      setClients(r.clients ?? []); setAwaiting(r.handoffs_awaiting_payment ?? []);
    }
    catch (e) {
      if (e instanceof EdgeAuthError && !e.transient) return; // the sign-in flow is taking over
      setClients(null);
      setError(edgeErrorMessage(e, 'Could not load paid clients'));
    } finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => { if (!authLoading && user?.id) void load(); }, [authLoading, user?.id, load]);
  const showSpinner = authLoading || loading;
  const shown = (clients ?? []).filter((c) => filter === 'all' || (c.handoff && matchesFilter(c.handoff, filter)));
  type View = 'clients' | PaidClientTool;
  const view: View = tool ?? 'clients';
  return <div className="mx-auto max-w-7xl space-y-5 py-6">
    <PageHeader eyebrow="Fulfilment" title="Paid Clients" subtitle="One hub for every paying customer — their setup, pages and reviews."
      actions={<Dialog><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4"/>Add Client Manually</Button></DialogTrigger><ManualClient done={(id) => navigate(`/paid-clients/${id}`)} /></Dialog>} />
    <Segmented<View> label="Paid clients view" value={view} onChange={(k) => openTool(k === 'clients' ? null : k)} wrapOnPhone
      options={[
        { key: 'clients', label: <span className="flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5" />Clients</span>, count: clients?.length, tone: 'green' },
        ...(['page-plan', 'page-generator', 'review-replies'] as const).map((t) => { const M = TOOL_META[t]; return { key: t, label: <span className="flex items-center gap-1.5"><M.icon className="h-3.5 w-3.5" />{PAID_CLIENT_TOOL_LABEL[t]}</span>, tone: M.tone }; }),
      ]} />

    {tool && <Panel title={PAID_CLIENT_TOOL_LABEL[tool]} icon={TOOL_META[tool].icon} tone={TOOL_META[tool].tone} hint={TOOL_META[tool].hint} className="overflow-hidden">
      <div data-testid={`paid-clients-tool-${tool}`}>
        {tool === 'page-plan' && <PagePlanTool />}
        {tool === 'page-generator' && <PageGeneratorTool />}
        {tool === 'review-replies' && <ReviewReplyTool />}
      </div>
    </Panel>}

    {!tool && <>
      {showSpinner && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>}
      {!showSpinner && error && <Callout tone="red" icon={AlertCircle} title="Could not load paid clients" action={<Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-4 w-4"/>Try again</Button>}>{error}</Callout>}
      {!showSpinner && !error && clients && <div className="space-y-3">
        <AwaitingPayment items={awaiting} highlight={handoffParam} />
        <Segmented<ClientFilter> label="Filter clients" value={filter} onChange={setFilter} wrapOnPhone
          options={FILTERS.map((x) => ({ key: x.value, label: x.label, tone: x.tone, count: x.value === 'all' ? clients.length : clients.filter((c) => c.handoff && matchesFilter(c.handoff, x.value)).length }))} />
        <div className="grid gap-3">{shown.map((c) => <ClientCard key={c.id} c={c} />)}</div>
        {clients.length === 0 && <Empty icon={UsersRound}>No paid clients yet.</Empty>}
        {clients.length > 0 && shown.length === 0 && <Empty icon={UsersRound}>Nothing in this list — every client is in another one.</Empty>}
      </div>}
    </>}
  </div>;
}
