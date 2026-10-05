import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Clipboard, ClipboardEdit, ExternalLink, FileCode2, FileText, Loader2, Lock, Play, RefreshCw, Save } from 'lucide-react';
import { invokePaidBaseline, type PaidBaseline } from '@/lib/paidBaseline';
import { EdgeAuthError, edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cleanAuditQuestions } from '@/components/AuditQuestionEditor';
import { useToast } from '@/hooks/use-toast';
import { remeasureStatus } from '@/lib/deliveryCockpit';
import { REPORT_PUBLIC_ORIGIN, serviceRouteFromRow } from '@/lib/findableOffer';
import { formatBaselineProgress } from '@/lib/baselineProgress';
import { BASELINE_QUESTIONS, BASELINE_RUNS } from '@/lib/auditQuestionCounts';
import { hubBaselineStatus, isFrozenBaselineStatus, isStartedBaselineStatus, paidBaselineStatusLabel } from '@/lib/paidBaselineState';
import { approveAndStart, createSingleFlight, startApproved, type ApproveAndStartResult } from '@/lib/paidBaselineFlow';
import { welcomePackReadiness, welcomePackUrl } from '@/lib/welcomePackData';
import { downloadHtmlDocAsPdf } from '@/lib/aiAuditReportDownload';
import { BUILD_ROUTE_LABELS, parseWebsiteBuild, QA_ITEMS, REBUILD_STYLE_LABELS } from '@/lib/websiteBuildState';
import { templateById } from '@/lib/websiteTemplates';
import { resolveClientFacts, clientConfirmationsNeeded } from '@/lib/clientFacts';
import { LeadCrawlPanel } from '@/components/LeadCrawlPanel';
import { ClientHandoffCard, type ClientHandoff } from '@/components/ClientHandoffCard';
import { ClientSetupCard, type SetupHandoff } from '@/components/ClientSetupCard';
import { DISCOVERY_PLAN_RUNS, DiscoverySection, HookAuditStep, nearDuplicateCount, RecommendationStep, useDiscoveryPoll } from '@/components/BaselineDiscovery';
import { OfficialBaseline, qualityOverridesOf, unresolvedQuality } from '@/components/OfficialBaseline';
import { MeasurementHealthPanel } from '@/components/MeasurementHealthPanel';
import { OpportunityBacklog, useOpportunities } from '@/components/OpportunityBacklog';
import { MonthlyUpdatePanel } from '@/components/MonthlyUpdatePanel';
import { EndEngagementButton, EngagementEndedCard } from '@/components/EngagementEnd';
import { serviceEndView } from '@/lib/serviceEnd';
import { CollapsibleBlock } from '@/components/CollapsibleSection';
import { hookProtection } from '@/lib/baselineRecommendation';
import { backlogCounts } from '@/lib/opportunityBacklog';
import { discoveryPlan } from '@/lib/discoveryProgress';
import { ManualOnboardingDialog } from '@/components/ManualOnboardingDialog';
import { onboardingStatus } from '@/lib/manualOnboarding';
import { baselineReadiness } from '@/lib/baselineReadiness';
import type { LeadCrawlSummary } from '@/lib/leadCrawlSummary';
import { WORK_LABEL, type ClientContract } from '@/lib/clientContract';

type AnyRecord = Record<string, any>;
type Baseline = PaidBaseline;
type Hub = { lead: AnyRecord; onboarding: AnyRecord | null; onboarding_unpaid?: { id: string; status: string | null } | null; audit: AnyRecord | null; runs: AnyRecord[]; pages: AnyRecord[]; crawl: LeadCrawlSummary; handoff?: ClientHandoff; contract?: ClientContract;
  /** The official baseline's named count (paid-client-hub, the report's ruler): answers naming the business. */
  baseline_visibility?: { named: number; answered: number; expected: number } | null };

/* THE ONE HUB POLLER. (The Prepare Baseline dialog has its own read-only Discovery poller while a
   Discovery job runs — useDiscoveryPoll in BaselineDiscovery.tsx.) The hub re-reads itself on this interval only while the baseline is `starting`
   or `running`, and stops on its own at every other status. Nothing else on this page polls, and
   the poll is a READ of paid-client-hub — it can never start, approve or create anything. */
export const HUB_POLL_MS = 15_000;

/* Through invokeEdge: a real session first, explicit Authorization, one refresh-and-retry on 401,
   never the anon key (src/lib/edgeInvoke.ts). */
const call = (body: Record<string, unknown>) => invokeEdge<Record<string, any>>('paid-client-hub', body);
/* Every hub stage folds away with the shared control (src/components/CollapsibleSection.tsx), remembered
   per person: collapse almost everything and the summary at the top still says where the client is. */
/* ?section=<k> (2026-09-30): a dashboard item opens the hub AT the stage where its work is done — the
   stage is opened (whatever was remembered) and scrolled into view. */
const HubSection = createContext<string | null>(null);
const Stage = ({ title, k, summary, children }: { title: string; k: string; summary?: ReactNode; children: ReactNode }) => {
  const focused = useContext(HubSection) === k;
  return <Card className={focused ? 'ring-2 ring-primary/50' : undefined}><CardContent className="p-4">
    <CollapsibleBlock id={`hub-${k}`} forceOpen={focused} persistKey={`hub.${k}`} title={title} titleClassName="text-base font-semibold" summary={summary}><div className="space-y-2 text-sm">{children}</div></CollapsibleBlock>
  </CardContent></Card>;
};
const values = (v: unknown) => Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v || '—');
const copy = async (value: string) => { if (value) await navigator.clipboard.writeText(value); };
const Spinner = ({ className = 'h-6 w-6' }: { className?: string }) => <Loader2 className={`${className} animate-spin text-primary`} />;

/** What they bought (src/lib/clientContract.ts): Findable Build / Optimise, payments made and left, next charge. */
function ContractSummary({ c }: { c: ClientContract }) {
  const next = c.nextPaymentAt ? new Date(c.nextPaymentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null;
  return <div className="mt-1 rounded-md border px-2 py-1 text-left text-xs" data-testid="client-contract">
    <div className="font-semibold">{c.name ? `${c.name} · ${c.totalPayments} payments` : 'Payment term not recorded'}</div>
    <div>{c.paymentsMade} paid{c.paymentsRemaining !== null ? ` · ${c.paymentsRemaining} remaining` : ''}{next ? ` · next ${next}` : ''}</div>
    <div className="text-muted-foreground">{WORK_LABEL[c.work]}</div>
    {c.note && <div className="text-amber-600">{c.note}</div>}
  </div>;
}

function ClientDetailsDialog({ lead, onboarding }: { lead: AnyRecord; onboarding: AnyRecord | null }) {
  const f = (label: string, value: unknown) => <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words">{String(value || '—')}</dd></div>;
  const notes = [lead.notes, lead.delivery_notes, lead.project_overview, onboarding?.standout, onboarding?.accreditations].filter(Boolean);
  return <Dialog><DialogTrigger asChild><Button variant="outline" size="sm">Client details</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Client details</DialogTitle></DialogHeader><div className="grid gap-4 text-sm sm:grid-cols-2">
    {f('Business name', lead.business_name)}{f('Connected lead ID', lead.id)}
    {f('Contact name', lead.contact_name)}<div><dt className="text-xs text-muted-foreground">Email</dt><dd className="flex items-center gap-2 break-all">{lead.email || onboarding?.contact_email || '—'}{(lead.email || onboarding?.contact_email) && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void copy(lead.email || onboarding?.contact_email)}><Clipboard className="h-3.5 w-3.5"/></Button>}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Phone / WhatsApp</dt><dd className="flex items-center gap-2">{lead.phone || '—'}{lead.phone && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void copy(lead.phone)}><Clipboard className="h-3.5 w-3.5"/></Button>}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Website</dt><dd>{lead.website ? <a className="text-primary underline" href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a> : '—'}</dd></div>
    {f('Primary location', onboarding?.confirmed_location || lead.derived_town || lead.search_location || lead.address)}{f('Business specialism / category', lead.category || lead.search_keyword)}
    {f('Services', values(onboarding?.services_list) !== '—' ? values(onboarding?.services_list) : onboarding?.services || values(lead.services_included))}{f('Service areas', values(onboarding?.areas_list) !== '—' ? values(onboarding?.areas_list) : onboarding?.areas_wanted)}
    {f('Onboarding source', onboarding?.client_source || 'onboarding')}{f('Payment', lead.amount_paid ? `Paid ${lead.amount_paid}${lead.payment_date ? ` · ${lead.payment_date}` : ''}` : '—')}
    {f('Website route', onboarding?.website_route?.replaceAll('_', ' '))}{f('Domain', onboarding?.domain_status)}
    {f('Website manager / access', onboarding?.access_status)}{f('Baseline status', paidBaselineStatusLabel(onboarding?.baseline_status))}
    {f('Baseline audit ID', lead.baseline_audit_id || onboarding?.audit_id)}{f('Remeasure date', lead.remeasure_due_date)}
    {f('GBP consent / manager', [onboarding?.gbp_consent, onboarding?.gbp_manager_email].filter(Boolean).join(' · '))}{f('Project status', lead.project_status || lead.status)}
  </div>{notes.length > 0 && <div><p className="mb-1 text-xs text-muted-foreground">Saved notes / onboarding details</p><div className="space-y-2 rounded-md border p-3 text-sm">{notes.map((note, i) => <p key={i} className="whitespace-pre-wrap">{note}</p>)}</div></div>}<p className="text-xs text-muted-foreground">Read-only here. Existing lead and onboarding records remain the source of truth.</p></DialogContent></Dialog>;
}

type Busy = null | 'load' | 'save_context' | 'generate' | 'discovery' | 'discovery_run' | 'save' | 'approving' | 'starting';
const BUSY_TEXT: Record<Exclude<Busy, null>, string> = {
  load: 'Loading baseline setup…',
  save_context: 'Saving client context…',
  generate: 'Building a balanced baseline…',
  discovery: 'Writing Discovery questions for every approved town…',
  discovery_run: 'Starting Discovery…',
  save: 'Saving draft…',
  approving: 'Approving questions…',
  starting: 'Starting baseline…',
};
/* services_not_offered / top_requests (2026-10-04, fix/04): the client's negatives and what they are
   called for most — saved with section A, read by Discovery and the final-20 checks. */
const contextOf = (b: Baseline) => ({ location: b.location, services: b.services, services_list: b.services_list, areas_list: b.areas_list, business_type: b.business_type, website: b.website, services_not_offered: (b.services_not_offered ?? []).join(', '), top_requests: b.top_requests ?? '' });

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PREPARE BASELINE. One state transition at a time:

     needs_questions → needs_approval → approved → starting → running → complete

   🔴 WHAT WAS WRONG HERE (2026-09-22). Every server action ended with `await onChanged()`, and the
   parent's reload flipped its page-level `loading`, which replaced the whole page with a spinner
   and UNMOUNTED this dialog mid-chain; on remount it fetched the row again (spinner), while the
   detached save→approve→run chain carried on with no screen attached. Three flickers per click,
   and a refusal on the run step left the frozen questions on screen with no explanation.

   Now: one single-flight guard (a second click while busy does nothing), the chain lives in
   paidBaselineFlow.ts, the parent is refreshed ONCE and without unmounting anything, every server
   refusal is shown inline in the server's own words, and the status line names exactly one state.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function BaselineSetupDialog({ leadId, open, onOpenChange, onChanged }: { leadId: string; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const flight = useRef(createSingleFlight());
  const [data, setData] = useState<Baseline | null>(null);
  const [loaded, setLoaded] = useState<Baseline | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [acceptDuplicates, setAcceptDuplicates] = useState(false);
  /** Hook Audit questions Paul replaced, with the reason (sent with the approval, kept on the row). */
  const [hookReasons, setHookReasons] = useState<Record<string, string>>({});
  /** Written reasons for the blocking final-20 checks (OfficialBaseline, baselineQuality.ts). */
  const [qualityReasons, setQualityReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy('load'); setError(null); setHookReasons({}); setQualityReasons({});
    invokePaidBaseline('get', leadId)
      .then((next) => { if (cancelled) return; setData(next); setLoaded(next); setQuestions(next.questions); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load baseline setup'); })
      .finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
  }, [open, leadId, reloadKey]);

  /* The approval carries Paul's explicit "approve anyway" when near-duplicates remain, and the reason
     for every Hook Audit question he replaced (the server refuses either otherwise). */
  const invoke = useCallback((action: string, extra: Record<string, unknown> = {}) => invokePaidBaseline(action, leadId, action === 'approve'
    ? { ...extra, ...(acceptDuplicates ? { accept_duplicates: true } : {}), hook_replacements: Object.entries(hookReasons).map(([question, reason]) => ({ question, reason })), quality_overrides: qualityOverridesOf(qualityReasons) }
    : extra), [leadId, acceptDuplicates, hookReasons, qualityReasons]);
  const accept = (next: Baseline) => { setData(next); setLoaded(next); setQuestions(next.questions); };
  const fail = (title: string, message: string) => { setError(message); toast({ title, description: message, variant: 'destructive' }); };

  const act = (label: Exclude<Busy, null>, action: string, extra: Record<string, unknown> = {}) => flight.current.run(async () => {
    setBusy(label); setError(null);
    try { const next = await invoke(action, extra); accept(next); return next; }
    catch (e) { fail('Could not update baseline', e instanceof Error ? e.message : 'Try again'); return null; }
    finally { setBusy(null); }
  });

  const contextDirty = !!data && !!loaded && JSON.stringify(contextOf(data)) !== JSON.stringify(contextOf(loaded));
  const saveContextIfDirty = async (current: Baseline) => {
    if (!contextDirty) return current;
    setBusy('save_context');
    const saved = await invoke('save_context', contextOf(current));
    accept(saved);
    return saved;
  };
  const finish = async (result: ApproveAndStartResult) => {
    if (result.baseline) accept(result.baseline as Baseline);
    if (result.baseline) await onChanged();
    if (result.ok === false) { fail(result.step === 'approve' ? 'Approval refused' : 'Baseline did not start', result.error); return; }
    toast({ title: paidBaselineStatusLabel(result.baseline.status), description: 'It continues on the server; the hub tracks the runs.' });
    onOpenChange(false);
  };
  const onStep = (step: 'approving' | 'starting', b: unknown) => { setBusy(step); if (b) accept(b as Baseline); };

  /** Approve the set on screen (exactly BASELINE_QUESTIONS), then start. Approve once, start once. */
  const approveAndRun = () => flight.current.run(async () => {
    if (!data) return;
    setError(null);
    try {
      await saveContextIfDirty(data);
      await finish(await approveAndStart(invoke, cleanAuditQuestions(questions), onStep));
    } catch (e) { fail('Could not update baseline', e instanceof Error ? e.message : 'Try again'); }
    finally { setBusy(null); }
  });
  /** An already-approved row: the questions are frozen, only the start is owed. */
  const startOnly = () => flight.current.run(async () => {
    if (!data) return;
    setError(null);
    try {
      const current = await saveContextIfDirty(data);
      await finish(await startApproved(invoke, current, onStep));
    } catch (e) { fail('Could not start baseline', e instanceof Error ? e.message : 'Try again'); }
    finally { setBusy(null); }
  });
  /* GENERATE = the RECOMMENDED baseline: the Hook Audit's questions locked in, the rest balanced from
     the Discovery pool (the server writes the pool first if there is none). A draft, never a freeze. */
  const generate = () => {
    if (!data) return;
    if (cleanAuditQuestions(questions).length && !window.confirm('Replace the draft on screen with the recommended baseline? Nothing is frozen until you approve.')) return;
    setHookReasons({});
    void act('generate', 'generate', contextOf(data));
  };
  const generateDiscovery = () => data && act('discovery', 'discovery_generate');
  const runDiscovery = () => {
    if (!data?.discovery) return;
    const plan = discoveryPlan(data.discovery.pool.length, DISCOVERY_PLAN_RUNS);
    const ok = window.confirm(`Run Discovery: ${plan.questions} questions × ${plan.engines} engines (ChatGPT and Gemini) × ${plan.runs} runs = ${plan.measurements} measurements, about ${data.discovery.estimate_usd.toFixed(2)}. It runs on the server — you can close this and come back. Nothing is frozen and the paid baseline does not start. Continue?`);
    if (ok) void act('discovery_run', 'discovery_run', { confirm_cost: true });
  };
  /** Override the recommendation: put a Discovery question into the draft by hand. */
  const addFromDiscovery = (q: string) => { setQuestions((cur) => [...cur.filter((x) => x.trim()), q]); };
  /** Exceptional correction: an APPROVED set that has not started, reopened with a written reason. */
  const reopen = () => {
    const reason = window.prompt('Reopen the approved baseline for correction.\n\nOnly for a genuine factual or business error. The reason is kept in the baseline history. Why?');
    if (reason === null) return;
    void act('save', 'reopen_approved', { reason });
  };
  const duplicates = data ? nearDuplicateCount(data, cleanAuditQuestions(questions)) : 0;
  const qualityUnresolved = data ? unresolvedQuality(data, cleanAuditQuestions(questions), qualityReasons) : 0;
  /* Discovery runs on the server; while it runs, re-read its stored progress (discovery block and the
     recommendation built from it — the draft on screen is untouched). */
  useDiscoveryPoll(leadId, open, data, !!busy, (discovery, recommendation) => {
    setData((cur) => (cur ? { ...cur, discovery, recommendation } : cur));
    setLoaded((cur) => (cur ? { ...cur, discovery, recommendation } : cur));
  });

  const frozen = !!data && isFrozenBaselineStatus(data.status);
  const started = !!data && isStartedBaselineStatus(data.status);
  const count = cleanAuditQuestions(questions).length;
  const statusText = busy ? BUSY_TEXT[busy] : data ? paidBaselineStatusLabel(data.status) : '';
  const sources = (map: Record<string, string[]> | undefined, empty: string) => Object.entries(map ?? {}).map(([name, s]) => `${name} (${s.join(', ')})`).join(' · ') || empty;
  const hook = data ? hookProtection(cleanAuditQuestions(questions), data.hook?.questions ?? [], Object.entries(hookReasons).map(([question, reason]) => ({ question, reason }))) : null;
  const recQs = data?.recommendation?.questions.map((r) => r.question) ?? [];
  const draftIsRecommendation = recQs.length > 0 && JSON.stringify(recQs) === JSON.stringify(cleanAuditQuestions(questions));
  const contextMissing = !!data && (!data.location || !data.business_type || !data.services_list.length);
  const step = !data ? 0 : started ? 5 : frozen ? 5 : count ? 4 : data.discovery?.pool.length ? 3 : 2;

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto p-4 sm:p-6"><DialogHeader><DialogTitle>Prepare baseline</DialogTitle></DialogHeader>
    {!data && busy === 'load' && <div className="flex justify-center py-12"><Spinner/></div>}
    {!data && busy !== 'load' && error && <div className="space-y-3 py-6"><div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div><Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button></div>}
    {data && <div className="space-y-3">
      <ol className="flex flex-wrap gap-1 text-[11px]" aria-label="Baseline steps">{STEPS.map((s, i) => <li key={s} className={`rounded-full border px-2 py-0.5 ${i + 1 === step ? 'border-primary bg-primary/10 font-semibold text-primary' : i + 1 < step ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-muted-foreground'}`}>{i + 1}. {s}</li>)}</ol>
      <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm" aria-live="polite"><span className="font-medium">Status:</span><span>{statusText}</span>{frozen && <span className="flex items-center gap-1 text-xs font-semibold uppercase text-emerald-600"><Lock className="h-3.5 w-3.5"/>Frozen</span>}{busy && <Spinner className="h-4 w-4"/>}</div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
      <CollapsibleBlock as="section" className="rounded-md border p-3" defaultOpen={contextMissing} title="Client context"
        summary={contextMissing ? 'incomplete — fill in before approving' : `${data.business_type} · ${data.location} · ${data.services_list.length} services · ${data.areas_list.length} areas`}>
        <p className="mb-3 text-xs text-muted-foreground">From the client record and onboarding{data.discovery_context ? ', and an earlier Discovery scan' : ''}{data.crawl_context_at ? ' and the website crawl' : ''}. A blank field has no verified source yet.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Business</Label><Input value={data.business_name} disabled/></div>
          <div><Label>Specialism / category</Label><Input value={data.business_type} disabled={started || !!busy} onChange={(e) => setData({ ...data, business_type: e.target.value })}/></div>
          <div><Label>Website</Label><Input value={data.website} disabled={started || !!busy} onChange={(e) => setData({ ...data, website: e.target.value })}/></div>
          <div><Label>Primary location</Label><Input value={data.location} disabled={started || !!busy} onChange={(e) => setData({ ...data, location: e.target.value })}/></div>
          <div className="sm:col-span-2"><Label>Services (comma separated)</Label><Input value={data.services} disabled={started || !!busy} onChange={(e) => setData({ ...data, services: e.target.value })}/><p className="mt-1 text-xs text-muted-foreground">{sources(data.context_sources?.service_sources, 'No service facts found yet — type them to record what the baseline measures')}</p></div>
          <div className="sm:col-span-2"><Label>Service areas (comma separated)</Label><Input value={data.areas_list.join(', ')} disabled={started || !!busy} onChange={(e) => setData({ ...data, areas_list: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}/><p className="mt-1 text-xs text-muted-foreground">{sources(data.context_sources?.area_sources, 'No service-area facts found yet')}</p></div>
          {!started && ((data.detected?.services.length ?? 0) > 0 || (data.detected?.areas.length ?? 0) > 0) && <div className="sm:col-span-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            <p><b>Detected on the website — not included.</b> Add one only if the client genuinely offers or serves it.</p>
            {(data.detected?.services.length ?? 0) > 0 && <p className="mt-1">Services: {data.detected!.services.join(', ')}</p>}
            {(data.detected?.areas.length ?? 0) > 0 && <p className="mt-1">Towns: {data.detected!.areas.join(', ')}</p>}
          </div>}
          <div className="sm:col-span-2"><Label>Services list (comma separated)</Label><Input value={data.services_list.join(', ')} disabled={started || !!busy} onChange={(e) => setData({ ...data, services_list: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}/>
            {data.services_client_confirmed === false && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">These come from what Sales recorded, not from the client — confirm them before freezing.</p>}
            {(data.unconfirmed?.services.length ?? 0) > 0 && <p className="mt-1 text-xs text-muted-foreground">Also mentioned elsewhere, NOT included: {data.unconfirmed!.services.join(', ')}. Add one only if the client confirms it.</p>}</div>
          {/* 2026-10-04 (fix/04): the client's own negatives — a hard exclusion for Discovery, the 20 and the backlog. */}
          <div className="sm:col-span-2"><Label>Services they do NOT offer (comma separated)</Label><Input value={(data.services_not_offered ?? []).join(', ')} disabled={started || !!busy} placeholder="e.g. car keys, glass replacement" onChange={(e) => setData({ ...data, services_not_offered: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}/></div>
          <div className="sm:col-span-2"><Label>What customers contact them for most</Label><Input value={data.top_requests ?? ''} disabled={started || !!busy} onChange={(e) => setData({ ...data, top_requests: e.target.value })}/></div>
        </div>
        {!started && <Button className="mt-3" size="sm" variant="outline" disabled={!!busy || !contextDirty} onClick={() => data && void act('save_context', 'save_context', contextOf(data))}><Save className="mr-1 h-4 w-4"/>Save client context</Button>}
      </CollapsibleBlock>
      <HookAuditStep data={data}/>
      <DiscoverySection data={data} questions={questions} busy={!!busy} frozen={frozen} onGenerate={() => void generateDiscovery()} onRun={runDiscovery} onAdd={addFromDiscovery}/>
      {!frozen && <RecommendationStep data={data} busy={!!busy} frozen={frozen} draftIsRecommendation={draftIsRecommendation} onUse={generate}/>}
      <OfficialBaseline data={data} questions={questions} onChange={setQuestions} frozen={frozen} busy={!!busy} hookReasons={hookReasons}
        onHookReason={(q, reason) => setHookReasons((cur) => ({ ...cur, [q]: reason }))}
        qualityReasons={qualityReasons} onQualityReason={(key, reason) => setQualityReasons((cur) => ({ ...cur, [key]: reason }))}/>
      {!frozen && count > 0 && <div className="flex justify-end"><Button size="sm" variant="outline" disabled={!!busy || count === 0} onClick={() => void act('save', 'save', { questions: cleanAuditQuestions(questions) })}><Save className="mr-1 h-4 w-4"/>Save draft</Button></div>}
      <section className="rounded-md border border-primary/30 bg-primary/5 p-3"><h3 className="font-medium">5. Freeze + run</h3>
        {!frozen && <>
          <p className="mt-1 text-sm">{count === BASELINE_QUESTIONS ? `Exactly ${BASELINE_QUESTIONS} questions — ready to approve.` : `Approval needs exactly ${BASELINE_QUESTIONS} questions (currently ${count}).`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Approving freezes the exact wording and order, then runs them × {BASELINE_RUNS} on ChatGPT + Gemini. The re-measure asks the same {BASELINE_QUESTIONS}, word for word; the refund is judged on them.</p>
          {hook && hook.unexplained.length > 0 && <div className="mt-2 space-y-1 rounded border border-amber-400/50 bg-amber-500/10 p-2 text-xs" role="alert">
            <p className="font-medium">Hook Audit question{hook.unexplained.length === 1 ? '' : 's'} missing from the set. Put {hook.unexplained.length === 1 ? 'it' : 'them'} back, or say why {hook.unexplained.length === 1 ? 'it is' : 'each is'} wrong:</p>
            {hook.unexplained.map((q) => <label key={q} className="block"><span className="block">“{q}”</span>
              <Input className="mt-1 h-8" placeholder="Reason (a factual or business error)" value={hookReasons[q] ?? ''} onChange={(e) => setHookReasons((cur) => ({ ...cur, [q]: e.target.value }))}/></label>)}
          </div>}
          {duplicates > 0 && <label className="mt-2 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300"><input type="checkbox" className="mt-1" checked={acceptDuplicates} onChange={(e) => setAcceptDuplicates(e.target.checked)}/>
            <span>{duplicates} near-duplicate pair{duplicates === 1 ? '' : 's'} flagged above. Approve anyway — I have checked they are genuinely different questions.</span></label>}
          {qualityUnresolved > 0 && <p className="mt-2 text-sm text-destructive" role="alert">{qualityUnresolved} check{qualityUnresolved === 1 ? '' : 's'} above must be fixed or explained before freezing.</p>}
          <Button className="mt-3" disabled={!!busy || count !== BASELINE_QUESTIONS || (duplicates > 0 && !acceptDuplicates) || !!hook?.unexplained.length || qualityUnresolved > 0} onClick={() => void approveAndRun()}>{busy === 'approving' || busy === 'starting' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Play className="mr-1 h-4 w-4"/>}Approve, freeze &amp; start baseline</Button>
        </>}
        {data.status === 'approved' && <>
          <p className="mt-2 text-sm">Frozen. Complete the client context if anything is missing, then start.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={!!busy} onClick={() => void startOnly()}>{busy === 'starting' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Play className="mr-1 h-4 w-4"/>}Start baseline</Button>
            <Button variant="ghost" size="sm" disabled={!!busy} onClick={reopen} title="Only for a genuine error. Needs a written reason; kept in the history.">Reopen for correction…</Button>
          </div>
        </>}
        {started && <p className="mt-2 text-sm">{paidBaselineStatusLabel(data.status)}. The frozen {BASELINE_QUESTIONS} can no longer change — the re-measure repeats them exactly. The hub tracks the runs.</p>}
        {started && <MeasurementHealthPanel data={data} leadId={leadId} onChanged={accept}/>}
        {(data.meta?.corrections?.length ?? 0) > 0 && <p className="mt-2 text-xs text-muted-foreground">Correction history: {data.meta!.corrections!.map((c) => `${new Date(c.at).toLocaleDateString('en-GB')} — ${c.reason}`).join(' · ')}</p>}
      </section>
    </div>}
  </DialogContent></Dialog>;
}

const STEPS = ['Hook Audit', 'Discovery', 'Recommendation', 'Review', 'Freeze + run'];

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   STAGE 2 — WELCOME PACK.

   🔴 WHAT WAS WRONG HERE. This stage was a disabled button reading "Preview / send integration".
   The only working Welcome Pack button lived on the Outreach lead modal and the Inbox thread, and
   it resolved its audit as "the newest non-market audit with a completed run" — which for
   MCLocksmiths (one baseline, two Discovery scans) was the right audit only by accident of ordering.

   ⛔ READINESS IS THE SHARED RULE, NOT A LOCAL CONDITION. welcomePackReadiness() is the same
   function the public route runs, so this pill and that page can never disagree about whether a
   pack exists. It becomes Ready on its own the moment the paid baseline completes — the hub already
   polls itself while a baseline runs, and nothing has to be regenerated by hand.
   ⛔ THE DOWNLOAD IS THE PUBLIC DOCUMENT. It asks the hub for the HTML that
   _shared/welcome-pack-render.ts produced and prints that; there is no second builder to drift.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
/* ══ CLIENT SERVICE AGREEMENT (Paul, 2026-10-02) ═══════════════════════════════════════════════════
   Whether the client has accepted, when, by whom and how; the Build / Optimise route the agreement
   page shows (the page refuses until it is set); Copy and Resend the client's own link.
   ⛔ Read and set through paid-client-hub only — the agreement tables are server-only. */
type AgreementView = {
  url: string | null; route: 'build' | 'optimise' | null; route_source: 'set' | 'checkout' | null;
  /* pre-sales fix 03 (src/lib/agreementRoute.ts): fixed once they paid on a route or accepted it. */
  route_locked?: boolean; route_lock_reason?: string | null;
  last_sent_at: string | null; last_sent_to: string | null;
  acceptances: Array<{ method: string; accepted_at: string; typed_name: string | null; typed_role: string | null; email: string | null; agreement_version: string }>;
};
const ukWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

/* `ended` (serviceEnd.ts): nothing more is asked of the client — no route to choose, no link to copy or send; an
   agreement they DID accept is still shown with its PDF (2026-10-03). */
function AgreementStage({ lead, ended = false }: { lead: AnyRecord; ended?: boolean }) {
  const { toast } = useToast();
  const [view, setView] = useState<AgreementView | null>(null);
  const [busy, setBusy] = useState<string>('');
  const run = useCallback(async (body: Record<string, unknown>, done?: string) => {
    setBusy(String(body.action));
    try {
      const res = await call({ ...body, lead_id: lead.id });
      setView(res.agreement as AgreementView);
      if (done) toast({ title: done });
    } catch (e) {
      toast({ title: 'Agreement', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(''); }
  }, [lead.id, toast]);
  useEffect(() => { void run({ action: 'agreement_status' }); }, [run]);

  const signed = view?.acceptances.find((a) => a.method === 'agree_page') ?? null;
  const checkout = view?.acceptances.find((a) => a.method === 'checkout') ?? null;
  /* The signed PDF, rebuilt server-side from the stored record (the same builder the emailed copy used). */
  const downloadPdf = async () => {
    setBusy('agreement_pdf');
    try {
      const res = await call({ action: 'agreement_pdf', lead_id: lead.id });
      const bytes = Uint8Array.from(atob(String(res.pdf_base64 ?? '')), (c) => c.charCodeAt(0));
      if (!bytes.length) throw new Error('The server returned no PDF.');
      const href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = href; a.download = String(res.filename ?? 'Findable Client Service Agreement.pdf');
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch (e) {
      toast({ title: 'Could not download the agreement', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(''); }
  };
  const summary = !view ? 'Loading' : signed ? 'Signed' : checkout ? 'Accepted at checkout' : ended ? 'Not needed (engagement ended)' : 'Not accepted yet';
  return <Stage k="agreement" title="Client Service Agreement" summary={summary}>
    {!view ? <p className="text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin"/>Loading…</p> : <>
      {signed
        ? <p className="font-medium text-emerald-600">Signed on the agreement page on {ukWhen(signed.accepted_at)} by {signed.typed_name}{signed.typed_role ? `, ${signed.typed_role}` : ''}{signed.email ? ` (${signed.email})` : ''}. Version {signed.agreement_version}.</p>
        : <p className="font-medium text-muted-foreground">{ended ? 'Not needed: the engagement has ended.' : 'Not signed on the agreement page yet.'}</p>}
      {checkout && <p className="text-sm">Accepted at checkout on {ukWhen(checkout.accepted_at)}{checkout.typed_name ? ` by ${checkout.typed_name}` : ''}{checkout.email ? ` (${checkout.email})` : ''}. Binding on its own.</p>}
      {(signed || checkout) && <div className="pt-1">
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void downloadPdf()}>
          {busy === 'agreement_pdf' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <FileText className="mr-1 h-4 w-4"/>}Download signed PDF
        </Button>
      </div>}
      {!ended && <><div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-sm text-muted-foreground">Service:</span>
        {(['build', 'optimise'] as const).map((r) => (
          <Button key={r} size="sm" variant={view.route === r ? 'default' : 'outline'} disabled={!!busy || ((!!signed || !!view.route_locked) && view.route !== r)}
            onClick={() => void run({ action: 'agreement_set_route', route: r }, r === 'build' ? 'Route set to Build' : 'Route set to Optimise')}>
            {r === 'build' ? 'Build' : 'Optimise'}
          </Button>
        ))}
        {!view.route && <span className="text-xs text-amber-600">Set the route first: the agreement page will not open until it is set.</span>}
        {!view.route && <p className="w-full text-xs text-muted-foreground">Choosing Build or Optimise puts this client on the current agreement (£99 to start, then £99 a month, 12 or 6 payments). Only choose it for a client on those terms; until then their pack and agreement page show no prices.</p>}
        {view.route_source === 'checkout' && <span className="text-xs text-muted-foreground">(from their checkout)</span>}
        {view.route_locked && view.route_lock_reason && <p className="w-full text-xs text-muted-foreground">{view.route_lock_reason}</p>}
      </div>
      {view.url && <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => { void copy(view.url!); toast({ title: 'Agreement link copied' }); }}><Clipboard className="mr-1 h-4 w-4"/>Copy agreement link</Button>
        <Button size="sm" disabled={!!busy || !view.route} onClick={() => void run({ action: 'agreement_send_link' }, 'Agreement link sent')}>
          {busy === 'agreement_send_link' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <ExternalLink className="mr-1 h-4 w-4"/>}{view.last_sent_at ? 'Resend agreement link' : 'Send agreement link'}
        </Button>
      </div>}
      {view.last_sent_at && <p className="text-xs text-muted-foreground">Last sent {ukWhen(view.last_sent_at)} to {view.last_sent_to}.</p>}
      {view.url && <p className="break-all text-xs text-muted-foreground">{view.url}</p>}</>}
    </>}
  </Stage>;
}

function WelcomePackStage({ lead, audit }: { lead: AnyRecord; audit: AnyRecord | null }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const ready = welcomePackReadiness(lead as { baseline_audit_id?: string | null }, audit);
  const url = ready.canShare && ready.shortCode ? welcomePackUrl(ready.shortCode) : '';

  const download = async () => {
    setBusy(true);
    try {
      const res = await call({ action: 'welcome_pack_html', lead_id: lead.id });
      const html = String(res.html ?? '');
      if (!html) throw new Error('The server returned no document.');
      downloadHtmlDocAsPdf(html, String(lead.business_name ?? 'Client'), 'Findable-Welcome-Pack');
    } catch (e) {
      toast({ title: 'Could not build the welcome pack', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const tone = ready.state === 'ready' ? 'text-emerald-600' : ready.state === 'error' ? 'text-destructive' : 'text-muted-foreground';
  return <Stage k="welcome" title="2. Welcome Pack" summary={ready.state === 'ready' ? 'Ready' : ready.state === 'waiting' ? 'Waiting for baseline' : 'Error'}>
    <p className={`font-medium ${tone}`}>
      {ready.state === 'ready' ? 'Ready' : ready.state === 'waiting' ? 'Waiting for baseline' : 'Error'}
    </p>
    <p className="text-muted-foreground">{ready.reason}</p>
    {ready.missing.length > 0 && <p className="text-xs text-muted-foreground">Missing: {ready.missing.join(', ')}.</p>}
    {ready.state === 'ready' && <div className="flex flex-wrap gap-2 pt-1">
      <Button asChild size="sm" variant="outline" disabled={!url}>
        <a href={url || '#'} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-4 w-4"/>Preview Welcome Pack</a>
      </Button>
      <Button size="sm" variant="outline" disabled={!url} onClick={() => { void copy(url); toast({ title: 'Welcome pack link copied' }); }}>
        <Clipboard className="mr-1 h-4 w-4"/>Copy Welcome Pack Link
      </Button>
      <Button size="sm" disabled={busy} onClick={() => void download()}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <FileText className="mr-1 h-4 w-4"/>}Download Welcome Pack
      </Button>
    </div>}
    {ready.state === 'ready' && url && <p className="break-all text-xs text-muted-foreground">{url}</p>}
  </Stage>;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONBOARDING — the client's answers, and the manual route when they have not filled it in.
   ⛔ NEVER BLOCKS THE HUB. Missing answers are named, and the fix is one button away.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function OnboardingStage({ onboarding, unpaid, onOpen }: { onboarding: AnyRecord | null; unpaid: { id: string; status: string | null } | null | undefined; onOpen: () => void }) {
  const st = onboardingStatus(onboarding);
  const tone = st.state === 'complete' || st.state === 'completed_manually' ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-300';
  const services = values(onboarding?.services_list) !== '—' ? values(onboarding?.services_list) : (onboarding?.services || '—');
  const areas = values(onboarding?.areas_list) !== '—' ? values(onboarding?.areas_list) : (onboarding?.areas_wanted || '—');
  return <Stage k="onboarding" title="Onboarding" summary={st.label}>
    <p className={`flex items-center gap-1.5 font-medium ${tone}`}>{st.state === 'complete' || st.state === 'completed_manually' ? <CheckCircle2 className="h-4 w-4"/> : <AlertTriangle className="h-4 w-4"/>}{st.label}</p>
    {unpaid && !onboarding && <p className="text-xs text-muted-foreground">The client started onboarding (status “{unpaid.status}”) but it was never marked paid. The manual form adopts that record — nothing is duplicated.</p>}
    {onboarding && <div className="grid gap-2 text-xs sm:grid-cols-2">
      <div><span className="text-muted-foreground">Primary town: </span>{onboarding.confirmed_location || '—'}</div>
      <div><span className="text-muted-foreground">Domain: </span>{onboarding.domain_status || '—'} · <span className="text-muted-foreground">route: </span>{onboarding.website_route?.replaceAll('_', ' ') || (onboarding.plan_tier ? `plan ${onboarding.plan_tier}` : '—')}</div>
      <div className="sm:col-span-2"><span className="text-muted-foreground">Services: </span>{services}</div>
      <div className="sm:col-span-2"><span className="text-muted-foreground">Service areas: </span>{areas}</div>
      {onboarding.operator_edited_at && <div className="sm:col-span-2 text-muted-foreground">Answers entered/edited by operator {new Date(onboarding.operator_edited_at).toLocaleString('en-GB')}.</div>}
    </div>}
    <Button size="sm" variant={st.state === 'complete' || st.state === 'completed_manually' ? 'outline' : 'default'} onClick={onOpen}>
      <ClipboardEdit className="mr-1 h-4 w-4"/>{onboarding ? 'Edit onboarding answers' : 'Complete onboarding manually'}
    </Button>
  </Stage>;
}

/* BASELINE READINESS — the server's own gate, shown before it refuses (src/lib/baselineReadiness.ts). */
function ReadinessList({ lead, onboarding, onFix }: { lead: AnyRecord; onboarding: AnyRecord | null; onFix: () => void }) {
  const r = baselineReadiness(lead, onboarding);
  return <div className="rounded-md border p-2 text-xs">
    <p className="mb-1 font-medium">{r.ready ? 'Ready to prepare the baseline' : 'Needs attention before the baseline'}</p>
    <ul className="space-y-0.5">{r.items.map((i) => <li key={i.key} className="flex items-start gap-1.5">
      {i.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"/> : <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${i.required ? 'text-destructive' : 'text-amber-600'}`}/>}
      <span><b>{i.label}</b>{i.ok ? '' : i.required ? ' (required)' : ''} — <span className="text-muted-foreground">{i.detail}</span></span>
    </li>)}</ul>
    {r.attention.length > 0 && <Button size="sm" variant="outline" className="mt-2" onClick={onFix}><ClipboardEdit className="mr-1 h-4 w-4"/>Fix in onboarding</Button>}
  </div>;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   STAGE 5 — WEBSITE BUILD (summary). The work happens on its own page, /paid-clients/:id/website-build
   (src/pages/WebsiteBuild.tsx): build mode, client build facts, capture, architecture, the Build Pack
   of commands and prompts, preview, QA and live. This card only says where the build stands.

   The planned-pages list and the page generator link stay here — they belong to the website work.
   ⛔ READ ONLY. Nothing on this card writes; the summary is parsed from the row the hub already read.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function WebsiteBuildStage({ lead, onboarding, audit, pages }: {
  lead: AnyRecord; onboarding: AnyRecord | null; audit: AnyRecord | null; pages: AnyRecord[];
}) {
  const build = useMemo(() => parseWebsiteBuild(lead.website_build), [lead.website_build]);
  const facts = useMemo(() => resolveClientFacts({
    lead: lead as never, onboarding: onboarding as never, baselineAudit: audit as never,
    savedCanonicalDomain: build.canonical_domain || null,
  }), [lead, onboarding, audit, build.canonical_domain]);
  const confirmations = useMemo(() => clientConfirmationsNeeded(facts), [facts]);
  const template = build.route === 'template_rebuild' ? templateById(build.template_id) : null;
  const qaTotal = QA_ITEMS.length;
  const qaDone = QA_ITEMS.filter((q) => build.qa[q.key]).length;
  const ro = (label: string, value: string) => <div><div className="text-xs text-muted-foreground">{label}</div><div className="break-words">{value || '—'}</div></div>;
  const route = build.route
    ? BUILD_ROUTE_LABELS[build.route] + (template ? ' · ' + template.name : '') + (build.route === 'faithful_rebuild' && build.rebuild_style ? ' · ' + REBUILD_STYLE_LABELS[build.rebuild_style] : '')
    : 'Not chosen yet';

  return <Stage k="build" title="4. Website Build" summary={route}>
    <div className="grid gap-3 sm:grid-cols-2">
      {ro('Build route', route)}
      {ro('Live website', facts.website.value || '')}
      {ro('Facts you approved', String(build.facts.filter((f) => f.status === 'verified').length))}
      {ro('Architecture', build.pages.length + ' page(s) · ' + build.redirects.length + ' redirect(s)')}
      {ro('Preview', build.preview_url)}
      {ro('Production', build.production_url)}
      {ro('QA', qaDone + ' of ' + qaTotal + ' checks')}
      {ro('Baseline', audit?.baseline_completed_at ? `Completed ${new Date(audit.baseline_completed_at).toLocaleDateString('en-GB', { timeZone: 'UTC' })}` : 'Not completed yet')}
    </div>
    {confirmations.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{confirmations.length} client confirmation(s) needed — resolved in Client Build Facts.</p>}
    <Button asChild size="sm"><Link to={`/paid-clients/${lead.id}/website-build`}><FileCode2 className="mr-1 h-4 w-4"/>Open Website Build</Link></Button>

    <div className="rounded-md border p-2">
      <p className="text-xs font-medium text-muted-foreground">Planned pages</p>
      {pages.length
        ? <div className="mt-1 space-y-1">{pages.map((p) => <div key={p.id} className="rounded border p-2 text-xs">{p.service || 'Page'} · {p.town || ''} — {p.status}</div>)}</div>
        : <p className="text-xs text-muted-foreground">No planned pages yet.</p>}
      <Button asChild variant="outline" size="sm" className="mt-2"><Link to="/page-generator"><FileCode2 className="mr-1 h-4 w-4"/>Open page generator</Link></Button>
    </div>
  </Stage>;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CLIENT AT A GLANCE (2026-09-30): the official baseline, how visible they were in it, the
   re-measure date, and the ongoing work — before any section is opened. Every figure is read, never
   stored: the baseline visibility is counted by paid-client-hub with the report's named ruler.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
function ClientSummary({ hub, bs, remeasure, opps }: { hub: Hub; bs: string; remeasure: string; opps: ReturnType<typeof backlogCounts> | null }) {
  const v = hub.baseline_visibility;
  const n = hub.onboarding?.baseline_questions?.length ?? 0;
  const tile = (label: string, value: ReactNode, sub?: ReactNode) => <div className="rounded-md border px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-lg font-semibold leading-tight">{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>;
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="client-summary">
    {tile('Official baseline', n ? `${n} questions` : '—', paidBaselineStatusLabel(bs))}
    {tile('Baseline visibility', v ? `${v.named} / ${v.expected}` : '—', v ? `named${v.answered < v.expected ? ` · ${v.answered} answered` : ''}` : 'after the baseline completes')}
    {tile('Remeasure', remeasure)}
    {tile('Opportunities', opps ? opps.total : '…', 'in the backlog')}
    {tile('Active improvements', opps ? opps.active : '…')}
    {tile('Waiting for recheck', opps ? opps.waiting : '…')}
  </div>;
}

export default function ClientHub() {
  const { leadId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const section = searchParams.get('section');
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const fetchHub = useCallback(async () => (await call({ action: 'get', lead_id: leadId })).client as Hub, [leadId]);
  /* The first load shows the page spinner. Every later read is `refresh`: silent, in place, and it
     never touches `loading` — flipping it is what unmounted the dialog mid-chain. */
  /* ⛔ NEVER THE RAW TOKEN. A failed load is a sentence (edgeErrorMessage: the server's detail, then
     the known-token map, never a bare `server_error`) in an error panel with Try again. A genuine
     sign-out is left to the sign-in flow, which invokeEdge has already started. */
  const describe = (e: unknown, fallback: string) => (e instanceof EdgeAuthError && !e.transient) ? null : edgeErrorMessage(e, fallback);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHub().then((h) => { if (!cancelled) { setHub(h); setPageError(null); } })
      .catch((e) => { if (!cancelled) setPageError(describe(e, 'Could not load this client')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchHub, reloadKey]);
  const refresh = useCallback(async () => {
    try { setHub(await fetchHub()); setPageError(null); }
    catch (e) { setPageError(describe(e, 'Could not refresh this client')); }
  }, [fetchHub]);
  /* The baseline poller: the moving part only. The handoff does not change while a run drains, so it
     is not re-read every tick (handoff:false) and the one already on screen is kept. */
  const poll = useCallback(async () => {
    try {
      const next = (await call({ action: 'get', lead_id: leadId, handoff: false })).client as Hub;
      setHub((prev) => ({ ...next, handoff: prev?.handoff, baseline_visibility: next.baseline_visibility ?? prev?.baseline_visibility })); setPageError(null);
    } catch (e) { setPageError(describe(e, 'Could not refresh this client')); }
  }, [leadId]);
  const retry = () => { setPageError(null); setReloadKey((k) => k + 1); };
  const bs = hubBaselineStatus(hub?.onboarding, hub?.audit);
  useEffect(() => {
    if (!(bs === 'starting' || bs === 'running')) return;
    const id = window.setInterval(() => { void poll(); }, HUB_POLL_MS);
    return () => window.clearInterval(id);
  }, [bs, poll]);
  const runs = hub?.runs ?? [];
  const progress = useMemo(() => formatBaselineProgress(runs, BASELINE_RUNS), [runs]);
  /* The Opportunity Backlog, read once per visit (not polled) — the summary strip and its stage share it. */
  const opps = useOpportunities(leadId, !!hub?.onboarding);
  const oppCounts = backlogCounts(opps.data?.opportunities ?? []);
  /* Scroll the linked stage into view once the page is drawn ('payment' is the header card: the plan,
     payments made and the next charge). */
  const hubReady = !loading && !!hub;
  useEffect(() => {
    if (!hubReady || !section) return;
    const id = window.setTimeout(() => document.getElementById(`hub-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => window.clearTimeout(id);
  }, [hubReady, section]);

  if (loading) return <div className="flex justify-center py-16"><Spinner className="h-8 w-8"/></div>;
  const errorPanel = pageError && <Card><CardContent className="space-y-3 p-6 text-sm"><div role="alert" className="flex items-start gap-2 text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{pageError}</span></div><Button size="sm" variant="outline" onClick={retry}><RefreshCw className="mr-1 h-4 w-4"/>Try again</Button></CardContent></Card>;
  if (!hub) return <div className="mx-auto max-w-7xl space-y-4 py-6"><Link to="/paid-clients" className="text-xs text-muted-foreground">← Paid clients</Link>{errorPanel || <Card><CardContent className="p-6 text-sm text-muted-foreground">This client is not in your paid-client list.</CardContent></Card>}</div>;
  const { lead, onboarding, audit, pages } = hub; const rm = remeasureStatus(lead.remeasure_due_date, Date.now());
  /* An ended engagement (serviceEnd.ts): one card says so; nothing below is offered as work to do. The stored
     re-measure date is kept as it was, but it is no longer a date anything runs on. */
  const ended = serviceEndView(lead);
  const remeasureLine = ended ? 'not scheduled (engagement ended)' : `${lead.remeasure_due_date || 'after baseline'}${lead.remeasure_due_date ? ` · ${rm.label}` : ''}`; const reportUrl = audit ? `${REPORT_PUBLIC_ORIGIN}/report/${audit.id}` : '';
  const setupLabel = bs === 'needs_questions' ? 'Prepare Baseline' : bs === 'approved' ? 'Start baseline' : 'Continue baseline setup';
  return <HubSection.Provider value={section}><div className="mx-auto max-w-7xl space-y-4 py-6"><Link to="/paid-clients" className="text-xs text-muted-foreground">← Paid clients</Link>
  {errorPanel}
  <Card id="hub-payment" className={section === 'payment' ? 'ring-2 ring-primary/50' : undefined}><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{lead.business_name}</h1><p className="text-sm text-muted-foreground">{onboarding?.confirmed_location || lead.derived_town || lead.search_location} · {lead.website || 'No website recorded'}</p><p className="mt-2 text-sm">{lead.contact_name || 'No contact name'} · {lead.email || onboarding?.contact_email || 'No email'} · {lead.phone || 'No phone'}</p></div><div className="text-right text-sm"><div>Paid {lead.payment_date || 'date not recorded'}</div><div>{onboarding?.website_route?.replaceAll('_',' ') || 'Website route not set'}</div>{hub.contract && <ContractSummary c={hub.contract}/>}<div className="font-medium">Remeasure: {remeasureLine}</div></div></div><div className="mt-4 flex flex-wrap gap-2">{lead.website && <Button asChild variant="outline" size="sm"><a href={lead.website} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-4 w-4"/>Open website</a></Button>}<ClientDetailsDialog lead={lead} onboarding={onboarding}/>{audit && <Dialog><DialogTrigger asChild><Button size="sm"><FileText className="mr-1 h-4 w-4"/>View Baseline Report</Button></DialogTrigger><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Baseline report</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Client URL contains the client-safe report only. Internal report remains operator-only.</p><div className="flex flex-wrap gap-2"><Button asChild size="sm"><a href={reportUrl} target="_blank" rel="noreferrer">Client view</a></Button><Button asChild size="sm" variant="outline"><Link to={`/baseline/${audit.id}`}>Internal view / download</Link></Button><Button size="sm" variant="outline" onClick={() => void copy(reportUrl)}>Copy client URL</Button></div></DialogContent></Dialog>}</div></CardContent></Card>
  {ended
    ? <EngagementEndedCard view={ended} at={lead.service_terminated_at} note={lead.service_termination_note}/>
    : hub.handoff?.setup && <ClientSetupCard leadId={lead.id} businessName={lead.business_name ?? null} h={hub.handoff as SetupHandoff} route={serviceRouteFromRow(onboarding)} onChanged={() => void refresh()} onOpenBaseline={() => setBaselineOpen(true)}/>}
  {!ended && <div className="flex justify-end"><EndEngagementButton leadId={lead.id} onChanged={() => void refresh()}/></div>}
  <ClientSummary hub={hub} bs={bs} remeasure={remeasureLine} opps={opps.data ? oppCounts : null}/>
  {hub.handoff && <ClientHandoffCard handoff={hub.handoff} leadId={lead.id} onChanged={refresh}/>}
  <BaselineSetupDialog leadId={lead.id} open={baselineOpen} onOpenChange={setBaselineOpen} onChanged={refresh}/>
  <ManualOnboardingDialog leadId={lead.id} open={onboardingOpen} onOpenChange={setOnboardingOpen} onSaved={refresh}/>
  <div className="grid gap-4 lg:grid-cols-2">
    <OnboardingStage onboarding={onboarding} unpaid={hub.onboarding_unpaid} onOpen={() => setOnboardingOpen(true)}/>
    <Stage k="evidence" title="Website evidence">
      {/* The lead's ONE crawl row — the same one the Outreach and Inbox Crawl site buttons write. */}
      <LeadCrawlPanel leadId={lead.id} website={onboarding?.business_website || lead.website} summary={hub.crawl} from="paid_client" onDone={refresh}/>
    </Stage>
    <Stage k="baseline" title="1. Official baseline" summary={paidBaselineStatusLabel(bs)}>
      <p className="flex items-center gap-2 font-medium">{paidBaselineStatusLabel(bs)}{(bs === 'starting' || bs === 'running') && <Spinner className="h-4 w-4"/>}</p>
      {(bs === 'needs_questions' || bs === 'needs_approval' || bs === 'failed') && <ReadinessList lead={lead} onboarding={onboarding} onFix={() => setOnboardingOpen(true)}/>}
      {(bs === 'needs_questions' || bs === 'needs_approval' || bs === 'approved' || bs === 'failed') && <Button disabled={!onboarding} title={onboarding ? undefined : 'Complete onboarding first — the baseline is built from it.'} onClick={() => setBaselineOpen(true)}><RefreshCw className="mr-1 h-4 w-4"/>{setupLabel}</Button>}
      {bs === 'starting' && <p className="text-muted-foreground">The server is creating the persisted queue for the approved set × {BASELINE_RUNS} runs. This page refreshes itself.</p>}
      {(bs === 'running' || bs === 'complete') && <><p>{onboarding?.baseline_questions?.length || 'Saved'} frozen questions × {BASELINE_RUNS} runs · ChatGPT + Gemini</p><p className="text-muted-foreground">{progress}</p>{audit && <Button asChild variant="outline"><Link to={`/baseline/${audit.id}`}>Open internal baseline</Link></Button>}</>}
    </Stage>
    <WelcomePackStage lead={lead} audit={audit}/>
    <AgreementStage lead={lead} ended={!!ended}/>
    {/* ⛔ REMOVED 2026-09-29 (Paul): "3. Action Plan" — a link into the deprecated Playbook, the last one. Stages renumbered. */}
    <Stage k="directories" title="3. Directories"><p>Directory opportunities are intentionally unverified until checked.</p>{/* REMOVED 2026-09-29 (UI cleanup): a permanently disabled "Directory catalogue integration" button — it could never be pressed. */}</Stage>
    <WebsiteBuildStage lead={lead} onboarding={onboarding} audit={audit} pages={pages}/>
    {/* ⛔ REMOVED 2026-10-02 (closeout): "5. Review Replies". Review replies are NOT a Findable deliverable (Paul,
        2026-09-28) and the delivery stages are the deliverables. The admin drafting tool stays in the sidebar. */}
    {ended ? <Stage k="remeasure" title="5. Remeasure" summary="not scheduled"><p>Not scheduled: the engagement has ended, so there is no re-measure to run.</p></Stage> : <Stage k="remeasure" title="5. Remeasure" summary={lead.remeasure_due_date ? `due ${lead.remeasure_due_date}` : 'after baseline'}><p>Due: {lead.remeasure_due_date || 'scheduled after baseline'} · {rm.label}</p><p className="text-xs text-muted-foreground">The server replays the frozen baseline queue questions exactly; it never regenerates a remeasure set.</p>{lead.remeasure_audit_id ? <Button asChild variant="outline"><Link to={`/compare/${lead.remeasure_audit_id}`}>View Comparison</Link></Button> : <p className="text-muted-foreground">Runs automatically when due.</p>}</Stage>}
    <Stage k="results" title="6. Results">{lead.remeasure_audit_id ? <Button asChild><Link to={`/compare/${lead.remeasure_audit_id}`}>View final comparison</Link></Button> : <p>Available after remeasure.</p>}</Stage>
    <div className="lg:col-span-2"><Stage k="opportunities" title="7. Ongoing opportunities" summary={opps.data ? `${oppCounts.total} open · ${oppCounts.active} active · ${oppCounts.waiting} waiting for recheck` : undefined}>
      {hub.onboarding ? <OpportunityBacklog leadId={lead.id} state={opps}/> : <p className="text-muted-foreground">Available once onboarding exists.</p>}
    </Stage></div>
    {/* The monthly update findable.live/terms promises, prepared and sent by hand (closeout 2026-10-02). */}
    <div className="lg:col-span-2"><Stage k="monthly" title="8. Monthly update">{ended ? <p className="text-muted-foreground">No monthly updates: the engagement has ended.</p> : <MonthlyUpdatePanel leadId={lead.id} contactName={lead.contact_name ?? null} paymentDate={lead.payment_date ?? null}/>}</Stage></div>
  </div></div></HubSection.Provider>;
}
