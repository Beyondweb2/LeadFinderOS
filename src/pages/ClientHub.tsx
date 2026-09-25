import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Clipboard, ClipboardEdit, ExternalLink, FileCode2, FileText, Loader2, Lock, MessageSquareQuote, Play, RefreshCw, Save } from 'lucide-react';
import { invokePaidBaseline, type PaidBaseline } from '@/lib/paidBaseline';
import { EdgeAuthError, edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuditQuestionEditor, cleanAuditQuestions } from '@/components/AuditQuestionEditor';
import { useToast } from '@/hooks/use-toast';
import { remeasureStatus } from '@/lib/deliveryCockpit';
import { REPORT_PUBLIC_ORIGIN } from '@/lib/findableOffer';
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
import { CoveragePanel, DISCOVERY_PLAN_RUNS, DiscoverySection, nearDuplicateCount, useDiscoveryPoll } from '@/components/BaselineDiscovery';
import { discoveryPlan } from '@/lib/discoveryProgress';
import { ManualOnboardingDialog } from '@/components/ManualOnboardingDialog';
import { onboardingStatus } from '@/lib/manualOnboarding';
import { baselineReadiness } from '@/lib/baselineReadiness';
import type { LeadCrawlSummary } from '@/lib/leadCrawlSummary';

type AnyRecord = Record<string, any>;
type Baseline = PaidBaseline;
type Hub = { lead: AnyRecord; onboarding: AnyRecord | null; onboarding_unpaid?: { id: string; status: string | null } | null; audit: AnyRecord | null; runs: AnyRecord[]; pages: AnyRecord[]; crawl: LeadCrawlSummary };

/* THE ONE HUB POLLER. (The Prepare Baseline dialog has its own read-only Discovery poller while a
   Discovery job runs — useDiscoveryPoll in BaselineDiscovery.tsx.) The hub re-reads itself on this interval only while the baseline is `starting`
   or `running`, and stops on its own at every other status. Nothing else on this page polls, and
   the poll is a READ of paid-client-hub — it can never start, approve or create anything. */
export const HUB_POLL_MS = 15_000;

/* Through invokeEdge: a real session first, explicit Authorization, one refresh-and-retry on 401,
   never the anon key (src/lib/edgeInvoke.ts). */
const call = (body: Record<string, unknown>) => invokeEdge<Record<string, any>>('paid-client-hub', body);
const Stage = ({ title, children }: { title: string; children: ReactNode }) => <Card><CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{children}</CardContent></Card>;
const values = (v: unknown) => Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v || '—');
const copy = async (value: string) => { if (value) await navigator.clipboard.writeText(value); };
const Spinner = ({ className = 'h-6 w-6' }: { className?: string }) => <Loader2 className={`${className} animate-spin text-primary`} />;

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
const contextOf = (b: Baseline) => ({ location: b.location, services: b.services, services_list: b.services_list, areas_list: b.areas_list, business_type: b.business_type, website: b.website });

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
  /** Questions Paul added from Discovery this session — kept first by the balanced generator. */
  const [added, setAdded] = useState<string[]>([]);
  const [acceptDuplicates, setAcceptDuplicates] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy('load'); setError(null);
    invokePaidBaseline('get', leadId)
      .then((next) => { if (cancelled) return; setData(next); setLoaded(next); setQuestions(next.questions); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load baseline setup'); })
      .finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
  }, [open, leadId, reloadKey]);

  /* The approval carries Paul's explicit "approve anyway" when near-duplicates remain (the server
     refuses them otherwise). */
  const invoke = useCallback((action: string, extra: Record<string, unknown> = {}) => invokePaidBaseline(action, leadId, action === 'approve' && acceptDuplicates ? { ...extra, accept_duplicates: true } : extra), [leadId, acceptDuplicates]);
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
  /* GENERATE = the balanced baseline from the Discovery pool (the server writes the pool first if
     there is none), keeping the questions Paul added from Discovery. A draft, never a freeze. */
  const generate = () => data && act('generate', 'generate', { ...contextOf(data), keep_current: added.length > 0, questions: added });
  const generateDiscovery = () => data && act('discovery', 'discovery_generate');
  const runDiscovery = () => {
    if (!data?.discovery) return;
    const plan = discoveryPlan(data.discovery.pool.length, DISCOVERY_PLAN_RUNS);
    const ok = window.confirm(`Run Discovery: ${plan.questions} questions × ${plan.engines} engines (ChatGPT and Gemini) × ${plan.runs} runs = ${plan.measurements} measurements, about ${data.discovery.estimate_usd.toFixed(2)}. It runs on the server — you can close this and come back. Nothing is frozen and the paid baseline does not start. Continue?`);
    if (ok) void act('discovery_run', 'discovery_run', { confirm_cost: true });
  };
  const addFromDiscovery = (q: string) => { setQuestions((cur) => [...cur.filter((x) => x.trim()), q]); setAdded((cur) => (cur.includes(q) ? cur : [...cur, q])); };
  const duplicates = data ? nearDuplicateCount(data, cleanAuditQuestions(questions)) : 0;
  /* Discovery runs on the server; while it runs, re-read its stored progress (discovery block only). */
  useDiscoveryPoll(leadId, open, data, !!busy, (discovery) => {
    setData((cur) => (cur ? { ...cur, discovery } : cur));
    setLoaded((cur) => (cur ? { ...cur, discovery } : cur));
  });

  const frozen = !!data && isFrozenBaselineStatus(data.status);
  const started = !!data && isStartedBaselineStatus(data.status);
  const count = cleanAuditQuestions(questions).length;
  const statusText = busy ? BUSY_TEXT[busy] : data ? paidBaselineStatusLabel(data.status) : '';
  const sources = (map: Record<string, string[]> | undefined, empty: string) => Object.entries(map ?? {}).map(([name, s]) => `${name} (${s.join(', ')})`).join(' · ') || empty;

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Prepare baseline</DialogTitle></DialogHeader>
    {!data && busy === 'load' && <div className="flex justify-center py-12"><Spinner/></div>}
    {!data && busy !== 'load' && error && <div className="space-y-3 py-6"><div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div><Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>Retry</Button></div>}
    {data && <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm" aria-live="polite"><span className="font-medium">Status:</span><span>{statusText}</span>{busy && <Spinner className="h-4 w-4"/>}</div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
      <p className="text-sm text-muted-foreground">Review context and questions before approval. Only the approved wording and order is queued and later replayed for remeasure.</p>
      <section className="rounded-md border p-3"><h3 className="mb-3 font-medium">A. Client / business context</h3>
        <p className="mb-3 text-xs text-muted-foreground">Prefilled from the client record, the onboarding answers{data.discovery_context ? `, the Discovery scan of ${data.discovery_context.created_at ? new Date(data.discovery_context.created_at).toLocaleDateString('en-GB') : 'this lead'}` : ''}{data.crawl_context_at ? ' and the website crawl' : ''}. Nothing is invented: a blank field has no verified source yet.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Business</Label><Input value={data.business_name} disabled/></div>
          <div><Label>Specialism / category</Label><Input value={data.business_type} disabled={started || !!busy} onChange={(e) => setData({ ...data, business_type: e.target.value })}/></div>
          <div><Label>Website</Label><Input value={data.website} disabled={started || !!busy} onChange={(e) => setData({ ...data, website: e.target.value })}/></div>
          <div><Label>Primary location</Label><Input value={data.location} disabled={started || !!busy} onChange={(e) => setData({ ...data, location: e.target.value })}/></div>
          <div className="sm:col-span-2"><Label>Services (comma separated)</Label><Input value={data.services} disabled={started || !!busy} onChange={(e) => setData({ ...data, services: e.target.value })}/><p className="mt-1 text-xs text-muted-foreground">{sources(data.context_sources?.service_sources, 'No service facts found yet — type them to record what the baseline measures')}</p></div>
          <div className="sm:col-span-2"><Label>Service areas (comma separated)</Label><Input value={data.areas_list.join(', ')} disabled={started || !!busy} onChange={(e) => setData({ ...data, areas_list: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}/><p className="mt-1 text-xs text-muted-foreground">{sources(data.context_sources?.area_sources, 'No service-area facts found yet')}</p></div>
          {!started && ((data.detected?.services.length ?? 0) > 0 || (data.detected?.areas.length ?? 0) > 0) && <div className="sm:col-span-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            <p><b>Detected on the website — not included.</b> The baseline measures only approved services and towns. Add one here only if the client genuinely offers or serves it.</p>
            {(data.detected?.services.length ?? 0) > 0 && <p className="mt-1">Services: {data.detected!.services.join(', ')}</p>}
            {(data.detected?.areas.length ?? 0) > 0 && <p className="mt-1">Towns: {data.detected!.areas.join(', ')}</p>}
          </div>}
          <div className="sm:col-span-2"><Label>Services list (comma separated)</Label><Input value={data.services_list.join(', ')} disabled={started || !!busy} onChange={(e) => setData({ ...data, services_list: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}/></div>
        </div>
        {data.crawl_context_at && <p className="mt-2 text-xs text-muted-foreground">Website context last refreshed {new Date(data.crawl_context_at).toLocaleString()}.</p>}
        {!started && <Button className="mt-3" size="sm" variant="outline" disabled={!!busy || !contextDirty} onClick={() => data && void act('save_context', 'save_context', contextOf(data))}><Save className="mr-1 h-4 w-4"/>Save client context</Button>}
      </section>
      <DiscoverySection data={data} questions={questions} busy={!!busy} frozen={frozen} onGenerate={() => void generateDiscovery()} onRun={runDiscovery} onAdd={addFromDiscovery}/>
      <section className="rounded-md border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">C. Question setup ({count})</h3><p className="text-sm text-muted-foreground">Edit, remove, add, paste, or regenerate before approval.</p></div>{frozen ? <span className="flex items-center gap-1 text-xs text-emerald-600"><Lock className="h-3.5 w-3.5"/>Frozen</span> : <div className="flex gap-2"><Button size="sm" variant={questions.length ? 'outline' : 'default'} disabled={!!busy} onClick={() => void generate()} title="20 questions balanced across the approved services, the home town and the approved areas, and intent types — from the Discovery pool, keeping any you added. Winnability is not used to choose.">
            <RefreshCw className="mr-1 h-4 w-4"/>Generate balanced baseline{added.length ? ` (keeps ${added.length} added)` : ''}</Button></div>}</div>
        <div className="mt-3"><AuditQuestionEditor questions={questions} onChange={setQuestions} disabled={frozen} busy={!!busy}/></div>
        <CoveragePanel data={data} questions={cleanAuditQuestions(questions)}/>
        {!frozen && <Button className="mt-3" size="sm" variant="outline" disabled={!!busy || count === 0} onClick={() => void act('save', 'save', { questions: cleanAuditQuestions(questions) })}><Save className="mr-1 h-4 w-4"/>Save draft</Button>}
      </section>
      <section className="rounded-md border border-primary/30 bg-primary/5 p-3"><h3 className="font-medium">D. Approval + start</h3><p className="mt-1 text-sm text-muted-foreground">Approval freezes the exact text and order. The server queues that frozen set × {BASELINE_RUNS}.</p>
        {!frozen && <>
          <p className="mt-2 text-sm">{count === BASELINE_QUESTIONS ? `Exactly ${BASELINE_QUESTIONS} questions — ready to approve.` : `Approval needs exactly ${BASELINE_QUESTIONS} questions (currently ${count}).`}</p>
          <p className="mt-1 text-xs text-muted-foreground">The refund is judged on all {BASELINE_QUESTIONS} approved questions — home town and approved areas — asked again, word for word, at re-measure.</p>
          {duplicates > 0 && <label className="mt-2 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300"><input type="checkbox" className="mt-1" checked={acceptDuplicates} onChange={(e) => setAcceptDuplicates(e.target.checked)}/>
            <span>{duplicates} near-duplicate pair{duplicates === 1 ? '' : 's'} flagged above. Approve anyway — I have checked they are genuinely different questions.</span></label>}
          <Button className="mt-3" disabled={!!busy || count !== BASELINE_QUESTIONS || (duplicates > 0 && !acceptDuplicates)} onClick={() => void approveAndRun()}>{busy === 'approving' || busy === 'starting' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Play className="mr-1 h-4 w-4"/>}Approve &amp; start baseline</Button>
        </>}
        {data.status === 'approved' && <>
          <p className="mt-2 text-sm">The question set is frozen. Complete section A if anything is missing, then start.</p>
          <Button className="mt-3" disabled={!!busy} onClick={() => void startOnly()}>{busy === 'starting' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Play className="mr-1 h-4 w-4"/>}Start baseline</Button>
        </>}
        {started && <p className="mt-2 text-sm">{paidBaselineStatusLabel(data.status)}. Close this dialog; the hub tracks the runs.</p>}
      </section>
    </div>}
  </DialogContent></Dialog>;
}

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
  return <Stage title="2. Welcome Pack">
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
  return <Stage title="Onboarding">
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

  return <Stage title="5. Website Build">
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

export default function ClientHub() {
  const { leadId = '' } = useParams();
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
  const retry = () => { setPageError(null); setReloadKey((k) => k + 1); };
  const bs = hubBaselineStatus(hub?.onboarding, hub?.audit);
  useEffect(() => {
    if (!(bs === 'starting' || bs === 'running')) return;
    const id = window.setInterval(() => { void refresh(); }, HUB_POLL_MS);
    return () => window.clearInterval(id);
  }, [bs, refresh]);
  const runs = hub?.runs ?? [];
  const progress = useMemo(() => formatBaselineProgress(runs, BASELINE_RUNS), [runs]);

  if (loading) return <div className="flex justify-center py-16"><Spinner className="h-8 w-8"/></div>;
  const errorPanel = pageError && <Card><CardContent className="space-y-3 p-6 text-sm"><div role="alert" className="flex items-start gap-2 text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{pageError}</span></div><Button size="sm" variant="outline" onClick={retry}><RefreshCw className="mr-1 h-4 w-4"/>Try again</Button></CardContent></Card>;
  if (!hub) return <div className="mx-auto max-w-7xl space-y-4 py-6"><Link to="/paid-clients" className="text-xs text-muted-foreground">← Paid clients</Link>{errorPanel || <Card><CardContent className="p-6 text-sm text-muted-foreground">This client is not in your paid-client list.</CardContent></Card>}</div>;
  const { lead, onboarding, audit, pages } = hub; const rm = remeasureStatus(lead.remeasure_due_date, Date.now()); const reportUrl = audit ? `${REPORT_PUBLIC_ORIGIN}/report/${audit.id}` : '';
  const setupLabel = bs === 'needs_questions' ? 'Prepare Baseline' : bs === 'approved' ? 'Start baseline' : 'Continue baseline setup';
  return <div className="mx-auto max-w-7xl space-y-4 py-6"><Link to="/paid-clients" className="text-xs text-muted-foreground">← Paid clients</Link>
  {errorPanel}
  <Card><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">{lead.business_name}</h1><p className="text-sm text-muted-foreground">{onboarding?.confirmed_location || lead.derived_town || lead.search_location} · {lead.website || 'No website recorded'}</p><p className="mt-2 text-sm">{lead.contact_name || 'No contact name'} · {lead.email || onboarding?.contact_email || 'No email'} · {lead.phone || 'No phone'}</p></div><div className="text-right text-sm"><div>Paid {lead.payment_date || 'date not recorded'}</div><div>{onboarding?.website_route?.replaceAll('_',' ') || 'Website route not set'}</div><div className="font-medium">Remeasure: {lead.remeasure_due_date || 'after baseline'} · {rm.label}</div></div></div><div className="mt-4 flex flex-wrap gap-2">{lead.website && <Button asChild variant="outline" size="sm"><a href={lead.website} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-4 w-4"/>Open website</a></Button>}<ClientDetailsDialog lead={lead} onboarding={onboarding}/>{audit && <Dialog><DialogTrigger asChild><Button size="sm"><FileText className="mr-1 h-4 w-4"/>View Baseline Report</Button></DialogTrigger><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Baseline report</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Client URL contains the client-safe report only. Internal report remains operator-only.</p><div className="flex flex-wrap gap-2"><Button asChild size="sm"><a href={reportUrl} target="_blank" rel="noreferrer">Client view</a></Button><Button asChild size="sm" variant="outline"><Link to={`/baseline/${audit.id}`}>Internal view / download</Link></Button><Button size="sm" variant="outline" onClick={() => void copy(reportUrl)}>Copy client URL</Button></div></DialogContent></Dialog>}</div></CardContent></Card>
  <BaselineSetupDialog leadId={lead.id} open={baselineOpen} onOpenChange={setBaselineOpen} onChanged={refresh}/>
  <ManualOnboardingDialog leadId={lead.id} open={onboardingOpen} onOpenChange={setOnboardingOpen} onSaved={refresh}/>
  <div className="grid gap-4 lg:grid-cols-2">
    <OnboardingStage onboarding={onboarding} unpaid={hub.onboarding_unpaid} onOpen={() => setOnboardingOpen(true)}/>
    <Stage title="Website evidence">
      {/* The lead's ONE crawl row — the same one the Outreach and Inbox Crawl site buttons write. */}
      <LeadCrawlPanel leadId={lead.id} website={onboarding?.business_website || lead.website} summary={hub.crawl} from="paid_client" onDone={refresh}/>
    </Stage>
    <Stage title="1. Baseline">
      <p className="flex items-center gap-2 font-medium">{paidBaselineStatusLabel(bs)}{(bs === 'starting' || bs === 'running') && <Spinner className="h-4 w-4"/>}</p>
      {(bs === 'needs_questions' || bs === 'needs_approval' || bs === 'failed') && <ReadinessList lead={lead} onboarding={onboarding} onFix={() => setOnboardingOpen(true)}/>}
      {(bs === 'needs_questions' || bs === 'needs_approval' || bs === 'approved' || bs === 'failed') && <Button disabled={!onboarding} title={onboarding ? undefined : 'Complete onboarding first — the baseline is built from it.'} onClick={() => setBaselineOpen(true)}><RefreshCw className="mr-1 h-4 w-4"/>{setupLabel}</Button>}
      {bs === 'starting' && <p className="text-muted-foreground">The server is creating the persisted queue for the approved set × {BASELINE_RUNS} runs. This page refreshes itself.</p>}
      {(bs === 'running' || bs === 'complete') && <><p>{onboarding?.baseline_questions?.length || 'Saved'} questions × {BASELINE_RUNS} runs</p><p className="text-muted-foreground">{progress}</p>{audit && <Button asChild variant="outline"><Link to={`/baseline/${audit.id}`}>Open internal baseline</Link></Button>}</>}
    </Stage>
    <WelcomePackStage lead={lead} audit={audit}/>
    <Stage title="3. Action Plan">{audit?.baseline_completed_at ? <><p>Derived from the completed baseline; no second audit is run.</p><Button asChild variant="outline"><Link to={`/playbook/${audit.id}`}>Open action plan</Link></Button></> : <p>Available when the baseline completes.</p>}</Stage>
    <Stage title="4. Directories"><p>Directory opportunities are intentionally unverified until checked.</p><Button variant="outline" disabled>Directory catalogue integration</Button></Stage>
    <WebsiteBuildStage lead={lead} onboarding={onboarding} audit={audit} pages={pages}/>
    <Stage title="6. Review Replies"><Button asChild variant="outline"><Link to="/review-replies"><MessageSquareQuote className="mr-1 h-4 w-4"/>Open Review Reply Setup</Link></Button></Stage>
    <Stage title="7. Remeasure"><p>Due: {lead.remeasure_due_date || 'scheduled after baseline'} · {rm.label}</p><p className="text-xs text-muted-foreground">The server replays the frozen baseline queue questions exactly; it never regenerates a remeasure set.</p>{lead.remeasure_audit_id ? <Button asChild variant="outline"><Link to={`/compare/${lead.remeasure_audit_id}`}>View Comparison</Link></Button> : <Button variant="outline" disabled>Runs automatically when due</Button>}</Stage>
    <Stage title="8. Results">{lead.remeasure_audit_id ? <Button asChild><Link to={`/compare/${lead.remeasure_audit_id}`}>View final comparison</Link></Button> : <p>Available after remeasure.</p>}</Stage>
  </div></div>;
}
