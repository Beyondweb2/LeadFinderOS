import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Clipboard, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { toRebuildPromptInput, type RebuildContextPayload } from '@/lib/rebuildContext';
import {
  BUILD_ROUTE_LABELS, BUILD_ROUTES, CAPTURE_STATUS_LABELS, CAPTURE_STATUSES, COMPARE_STATUS_LABELS, COMPARE_STATUSES,
  COPY_OWNERSHIP_LABELS, COPY_OWNERSHIPS, CUSTOM_DOMAIN_STATUS_LABELS, CUSTOM_DOMAIN_STATUSES, DEFAULT_COMPARE_WIDTHS, FACT_STATUS_LABELS,
  mayPreserveCopy, PAGE_ACTION_LABELS, PAGE_ACTIONS, PAGE_FAMILIES, PAGE_FAMILY_LABELS, parseCompareReply, parseWebsiteBuild,
  ASSET_APPROVAL_LABELS, openReconReview, RECON_STATUS_LABELS, reconStatus, type AssetApproval, type ReconReviewItem, type ReconStatus,
  PREVIEW_STATUS_LABELS, PREVIEW_STATUSES, PRODUCTION_STATUS_LABELS, PRODUCTION_STATUSES, QA_ITEMS, REBUILD_STYLE_LABELS, REBUILD_STYLES,
  SITE_LIVE_LABELS, SITE_LIVE_STATES, STAGE_LABELS, STAGES, WWW_REDIRECT_STATUS_LABELS, WWW_REDIRECT_STATUSES,
  captureApplies, compareFamilies, websiteBuildStages,
  type ArchPage, type BuildFact, type BuildRoute, type CompareStatus, type FactStatus, type Stage, type StoredFactStatus, type WebsiteBuildState,
} from '@/lib/websiteBuildState';
import { CORE_BUILD_MODEL, type FieldGroup } from '@/lib/websiteTemplates';
import { WEBSITE_TEMPLATES, recommendedRoute, recommendedTemplates, templateById, templateOptionalFacts, templatePageTypes, templateRequiredFacts, tradeFit } from '@/lib/websiteTemplates';
import { annotate, candidateFacts, CLAIM_VERDICT_LABELS, decide, editFact, factsSummary, storedFact, mapTemplateClaims, mergeFacts, parseFactLines, type FactRow } from '@/lib/buildFacts';
import { applyAction, checkArchitecture, newPageId, parsePageLines, parseRedirectText, redirectsFromPages, redirectsToText, seedFromCited, seedFromCrawl, seedFromTemplate } from '@/lib/buildArchitecture';
import { buildPack, codeConfig, setupProblems, suggestCloudflareProject, suggestRepoName, type PackItem, type PackItemId } from '@/lib/buildPack';
import { stagePrompts, type StagePrompt, type StagePromptId } from '@/lib/stagePrompts';
import { applyRecon, parseReconText, safeUrl, type ReconParse } from '@/lib/recon';
import { pageFamilyGroups } from '@/lib/manifestSummary';
import { applyBuildResult, builtCoverage, configVersion, executionBlockers, parseBuildResult, projectConflicts, retryPrompt, reviewPrompt, type BuildResultParse } from '@/lib/buildExecution';
import { BUILD_EXEC_STATUS_LABELS, BUILD_QA_KEYS, BUILD_QA_LABELS, buildExecutionStatus, previewGateProblems, type BuildExecStatus, type BuildExecution } from '@/lib/websiteBuildState';
import type { BuildPackInput } from '@/lib/buildPack';
import { autoAssign, computeMapping, MAP_STATUS_LABELS, SERVICE_STATUS_LABELS, URL_DECISION_LABELS, urlDecisions, type MappedField, type Mapping, type UrlDecision } from '@/lib/templateMapping';
import { checkId, ROUTE_INFO, ROUTE_STAGE_FOCUS, routeChecks } from '@/lib/buildRoutes';
import { CrawlEvidenceDetails, CrawlInventory, LeadCrawlPanel, type InventoryRow } from '@/components/LeadCrawlPanel';
import { MAX_PAGES } from '@/lib/websiteBuildState';
import { createSaveQueue, type SaveQueue, type SaveStatus } from '@/lib/saveQueue';
import { cloudflareBranches, cloudflareModeProblem, stablePreviewUrl } from '@/lib/cloudflareDeploy';
import { AREA_STATUS_LABELS, serviceAreaView, withAreas, withServes, type AreaStatus } from '@/lib/serviceAreaCandidates';
import { CLOUDFLARE_MODE_LABELS, CLOUDFLARE_MODES } from '@/lib/websiteBuildState';
import { crawlOldUrls, summariseLeadCrawl } from '@/lib/leadCrawlSummary';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE BUILD COMMAND CENTRE (V2) — /paid-clients/:leadId/website-build

   A workflow and prompt/command generator, NOT a website builder. It turns what Findable already
   knows about one paid client, plus Paul's decisions, into stage-by-stage Claude Code prompts and
   the exact commands, for one of three BUILD ROUTES (faithful rebuild · template rebuild · bespoke).
   The seven stages are unchanged; what each stage asks for changes with the route (buildRoutes.ts).

   ⛔ OPENING THIS PAGE SPENDS NOTHING AND SENDS NOTHING. The one read is paid-client-hub
   `rebuild_context` (stored rows only — no audit, no crawl, no model). The one write is
   `save_website_build`, which touches outreach_leads.website_build on this operator's row and nothing
   else. No message, no email, no prospect contact exists on this screen.
   ⛔ SAVING IS AUTOMATIC and debounced; the header says Saved / Saving / Not saved, so a failed save
   is never silent.
   ⛔ THE ROUTE IS ONLY EVER SET BY A CLICK. The Template card may say "recommended"; nothing selects it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const call = (body: Record<string, unknown>) => invokeEdge<Record<string, any>>('paid-client-hub', body);
const SAVE_DEBOUNCE_MS = 900;

type SaveState = SaveStatus;
type SetFn = <K extends keyof WebsiteBuildState>(k: K, v: WebsiteBuildState[K]) => void;
type UpdateFn = (fn: (s: WebsiteBuildState) => WebsiteBuildState) => void;

const sel = 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs';

function StatusDot({ done, applicable = true }: { done: boolean; applicable?: boolean }) {
  if (!applicable) return <Circle className="h-4 w-4 text-muted-foreground/40" />;
  return done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />;
}

const FACT_TONE: Record<FactStatus, string> = {
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  detected: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  missing: 'bg-muted text-muted-foreground',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  not_applicable: 'bg-muted text-muted-foreground',
};

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2"><CardTitle className="text-base">{title}</CardTitle>{right}</CardHeader><CardContent className="space-y-3 text-sm">{children}</CardContent></Card>;
}

function Choice<T extends string>({ value, options, labels, onChange, name }: { value: T | ''; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void; name: string }) {
  return <div className="grid gap-2 sm:grid-cols-2">{options.map((o) =>
    <label key={o} className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${value === o ? 'border-primary bg-primary/5' : ''}`}>
      <input type="radio" name={name} value={o} aria-label={labels[o]} className="mt-1" checked={value === o} onChange={() => onChange(o)} />
      <span>{labels[o]}</span>
    </label>)}</div>;
}

function Pick<T extends string>({ label, value, options, labels, onChange }: { label: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return <div><Label className="text-xs">{label}</Label><select aria-label={label} className={sel} value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((o) => <option key={o} value={o}>{labels[o]}</option>)}</select></div>;
}

function PackCard({ item, onCopy }: { item: PackItem; onCopy: (item: PackItem) => void }) {
  const [open, setOpen] = useState(false);
  const refusing = item.id === 'production' && item.blockedBy.length > 0;
  return <div className="rounded-md border p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{item.title} <span className="ml-1 text-xs font-normal text-muted-foreground">{item.kind === 'commands' ? 'PowerShell' : 'Claude Code prompt'}</span></p>
        <p className="text-xs text-muted-foreground">{item.help}</p>
        {item.expect && <p className="mt-1 text-xs"><b>Then:</b> {item.expect}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}{open ? 'Hide' : 'Show'}</Button>
        <Button size="sm" disabled={refusing} onClick={() => onCopy(item)}><Clipboard className="mr-1 h-4 w-4" />Copy</Button>
      </div>
    </div>
    {item.blockedBy.length > 0 && <div className="mt-2 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{refusing ? 'Not generated until you record: ' : 'Fill in first (the text shows a REQUIRED marker where it is missing): '}{item.blockedBy.join(' · ')}</span></div>}
    {open && <pre className="mt-2 max-h-[480px] overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-[11px] leading-relaxed">{item.text}</pre>}
  </div>;
}

/** A stage prompt: one line, a Copy button, the text on demand. */
function PromptCard({ p, onCopy }: { p: StagePrompt; onCopy: (p: StagePrompt) => void }) {
  const [open, setOpen] = useState(false);
  const refusing = p.id === 'production_deploy' && p.blockedBy.length > 0;
  return <div className="rounded-md border border-primary/30 bg-primary/[0.03] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1"><p className="font-medium">{p.label.replace(/^Copy /, '')}</p><p className="text-xs text-muted-foreground">{p.help}</p></div>
      <div className="flex max-w-full flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</Button>
        <Button size="sm" className="h-auto min-h-9 max-w-full whitespace-normal text-left" disabled={refusing} onClick={() => onCopy(p)}><Clipboard className="mr-1 h-4 w-4 shrink-0" />{p.label}</Button>
      </div>
    </div>
    {p.blockedBy.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{refusing ? 'Not generated until you record: ' : 'Missing (shown as REQUIRED in the text): '}{p.blockedBy.join(' · ')}</p>}
    {open && <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-[11px] leading-relaxed">{p.text}</pre>}
  </div>;
}

/** What this stage is for on the chosen route, and its ticks. */
function RouteGuide({ state, stage, update }: { state: WebsiteBuildState; stage: Stage; update: UpdateFn }) {
  const route = state.route;
  if (!route) return null;
  const items = routeChecks(route, stage);
  const focus = ROUTE_STAGE_FOCUS[route][stage];
  if (!items.length && !focus) return null;
  const done = items.filter((c) => state.checks[checkId(route, stage, c.key)]).length;
  const toggle = (id: string, on: boolean) => update((s) => { const next = { ...s.checks }; if (on) next[id] = true; else delete next[id]; return { ...s, checks: next }; });
  return <div className="rounded-md border bg-muted/40 p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{BUILD_ROUTE_LABELS[route]} — {STAGE_LABELS[stage]}</p>{items.length > 0 && <span className="text-muted-foreground">{done} of {items.length}</span>}</div>
    {focus && <p className="mt-1 text-muted-foreground">{focus}</p>}
    {items.length > 0 && <div className="mt-2 grid gap-1 sm:grid-cols-2">{items.map((c) => { const id = checkId(route, stage, c.key);
      return <label key={id} className="flex cursor-pointer items-start gap-2"><input type="checkbox" aria-label={c.label} className="mt-0.5" checked={state.checks[id] === true} onChange={(e) => toggle(id, e.target.checked)} /><span>{c.label}</span></label>; })}</div>}
  </div>;
}

export default function WebsiteBuild() {
  const { leadId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const [payload, setPayload] = useState<RebuildContextPayload | null>(null);
  const [state, setState] = useState<WebsiteBuildState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const loadedRef = useRef(false);
  const timer = useRef<number | null>(null);
  /* ONE save at a time, "Saved" only when the newest state is on the server (saveQueue.ts). Two saves
     in flight used to be able to land out of order under a Saved label (BS4 pilot, F13). The queue
     also remembers an edit not yet sent: the debounce timer dies with the page, so leaving by an
     in-app link within SAVE_DEBOUNCE_MS used to drop the last edit (production run, 2026-09-23). */
  const queue = useRef<SaveQueue<WebsiteBuildState> | null>(null);
  if (!queue.current) queue.current = createSaveQueue<WebsiteBuildState>(
    (s) => call({ action: 'save_website_build', lead_id: leadId, website_build: s }),
    (st, e) => { setSave(st); setSaveError(st === 'error' ? edgeErrorMessage(e, 'Save failed') : ''); });

  const step = (STAGES as readonly string[]).includes(params.get('step') ?? '') ? params.get('step') as Stage : 'intake';
  const goStep = (s: Stage) => { const next = new URLSearchParams(params); next.set('step', s); setParams(next, { replace: true }); window.scrollTo({ top: 0 }); };

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    setLoadError(null);
    call({ action: 'rebuild_context', lead_id: leadId })
      .then((res) => {
        if (cancelled) return;
        const ctx = res.context as RebuildContextPayload;
        setPayload(ctx);
        const loaded = parseWebsiteBuild((ctx.lead as { website_build?: unknown } | null)?.website_build);
        setState(loaded);
        queue.current!.reset(loaded);
        loadedRef.current = true;
      })
      .catch((e) => { if (!cancelled) setLoadError(edgeErrorMessage(e, 'Could not load this client')); });
    return () => { cancelled = true; };
  }, [leadId, reloadKey]);

  const flush = useCallback(async () => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    await queue.current!.flush();
  }, []);

  const update = useCallback((fn: (s: WebsiteBuildState) => WebsiteBuildState) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (loadedRef.current) queue.current!.change(next);
      return next;
    });
    if (!loadedRef.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  /* Send a pending edit NOW when the page is left (in-app navigation unmounts it) or hidden. */
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden' && queue.current!.pending()) void flush(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); if (queue.current!.pending()) void flush(); };
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === 'dirty' || save === 'saving') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  const set: SetFn = (k, v) => update((s) => ({ ...s, [k]: v }));

  /* ── derived — everything recomputed from the payload + state, nothing cached ───────────────── */
  const template = state?.route === 'template_rebuild' ? templateById(state.template_id) : null;
  const evidence = useMemo(() => payload ? toRebuildPromptInput(payload) : null, [payload]);
  const candidates = useMemo(() => payload ? candidateFacts(payload as never, state?.canonical_domain ?? '') : [], [payload, state?.canonical_domain]);
  const rows = useMemo(() => state ? mergeFacts(candidates, state.facts, template) : [], [candidates, state, template]);
  const summary = useMemo(() => factsSummary(rows), [rows]);
  const websiteRow = rows.find((r) => r.key === 'website');
  const factSiteUrl = websiteRow && websiteRow.status !== 'rejected' && websiteRow.status !== 'not_applicable' ? websiteRow.value : '';
  /* The source website: what Paul typed in Project Details, else the Current website fact. */
  const existingSiteUrl = state?.source_site_url || factSiteUrl;
  const tradeRow = rows.find((r) => r.key === 'trade');
  const issues = useMemo(() => state ? checkArchitecture(state.pages, state.redirects) : [], [state]);
  const archErrors = issues.filter((i) => i.level === 'error').length;
  const businessName = rows.find((r) => r.key === 'business_name')?.value || String((payload?.lead as { business_name?: string } | null)?.business_name ?? '');
  const packInput = useMemo(() => (state && evidence) ? {
    state, template, facts: rows, evidence, businessName, existingSiteUrl, mustNotSay: evidence.facts.mustNotSay.value ?? '',
  } : null, [state, template, rows, evidence, businessName, existingSiteUrl]);
  const pack = useMemo(() => packInput ? buildPack(packInput) : [], [packInput]);
  const prompts = useMemo(() => packInput ? stagePrompts(packInput) : [], [packInput]);
  const packById = (id: PackItemId) => pack.find((p) => p.id === id)!;
  const promptById = (id: StagePromptId) => prompts.find((p) => p.id === id)!;
  const mapping = useMemo(() => state ? computeMapping(state, template, rows, businessName) : null, [state, template, rows, businessName]);
  /* ⛔ THE readiness: the same blockers gate the prompt, the Build pack stage and the Ready badge (F14). */
  const buildBlockers = useMemo(() => packInput && mapping ? executionBlockers(packInput, mapping) : undefined, [packInput, mapping]);
  const stages = useMemo(() => state ? websiteBuildStages({
    state, hasExistingSite: !!existingSiteUrl, factsAwaiting: summary.awaiting, architectureErrors: archErrors,
    setupMissing: setupProblems(state).map((p) => p.label),
    buildBlockers,
  }) : [], [state, existingSiteUrl, summary.awaiting, archErrors, buildBlockers]);

  const copyText = async (title: string, text: string, missing: string[]): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${title} copied`, description: missing.length ? `Still missing: ${missing.join(', ')}` : `${text.length.toLocaleString()} characters.` });
      return true;
    } catch { toast({ title: 'Could not copy', description: 'Open "Show" and copy the text by hand.', variant: 'destructive' }); return false; }
  };
  const copyItem = (item: PackItem) => copyText(item.title.replace(/^\d+\.\s*/, ''), item.text, item.blockedBy);
  const copyPrompt = async (p: StagePrompt) => {
    const done = await copyText(p.label.replace(/^Copy /, ''), p.text, p.blockedBy);
    if (done && p.id === 'recon') update((s) => ({ ...s, recon: { ...s.recon, prompt_copied_at: new Date().toISOString() } }));
    /* Copying the Build Execution prompt records the start and the config it was built from. */
    if (done && p.id === 'build_execution' && p.label === 'Copy Build Execution Prompt' && mapping) {
      const ver = configVersion(mapping);
      update((s) => ({ ...s, build_execution: { ...s.build_execution, started_at: new Date().toISOString(), config_version: ver, template_id: s.route === 'template_rebuild' ? s.template_id : '' } }));
    }
  };

  if (loadError) return <div className="mx-auto max-w-6xl space-y-4 py-6"><Link to={`/paid-clients/${leadId}`} className="text-xs text-muted-foreground">← Client hub</Link>
    <Card><CardContent className="space-y-3 p-6 text-sm"><div role="alert" className="flex items-start gap-2 text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{loadError}</span></div><Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}><RefreshCw className="mr-1 h-4 w-4" />Try again</Button></CardContent></Card></div>;
  if (!state || !payload || !evidence) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  /* ── fact actions ───────────────────────────────────────────────────────────────────────────── */
  const putFact = (f: BuildFact) => update((s) => ({ ...s, facts: [...s.facts.filter((x) => x.key !== f.key), f] }));
  const decideRow = (r: FactRow, status: StoredFactStatus, value?: string) => putFact(decide(r, status, value ?? r.value));
  /* An edit is SAVED like any other change (as needs-approval), never held only in the row. */
  const editRow = (r: FactRow, value: string) => putFact(editFact(r, value));
  const resetFact = (key: string) => update((s) => ({ ...s, facts: s.facts.filter((x) => x.key !== key) }));

  const saveLabel = save === 'saved' ? 'Saved' : save === 'saving' ? 'Saving…' : save === 'dirty' ? 'Unsaved changes…' : 'Not saved — your edits are kept on this screen';
  const cur = stages.find((s) => s.stage === step);
  const captureOn = captureApplies(state, !!existingSiteUrl);
  const crawl = summariseLeadCrawl(payload.crawl, payload.crawl_job);
  const faithful = state.route === 'faithful_rebuild';

  return <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-0">
    <Link to={`/paid-clients/${leadId}`} className="text-xs text-muted-foreground">← Client hub</Link>
    <Card><CardContent className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="text-xl font-semibold sm:text-2xl">Website Build — {businessName || 'client'}</h1>
          <p className="text-sm text-muted-foreground">{state.route ? BUILD_ROUTE_LABELS[state.route] : 'Build route not chosen yet'}{template ? ` · ${template.name} v${template.version}` : ''}{faithful && state.rebuild_style ? ` · ${REBUILD_STYLE_LABELS[state.rebuild_style]}` : ''}</p></div>
        <div className={`flex items-center gap-2 text-xs ${save === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} aria-live="polite">
          {save === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{save === 'saved' && <Check className="h-3.5 w-3.5 text-emerald-600" />}{saveLabel}
          {save === 'error' && <><span>— {saveError}</span><Button size="sm" variant="outline" onClick={() => void flush()}>Retry save</Button></>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stages.map((s) => <button key={s.stage} type="button" onClick={() => goStep(s.stage)}
          className={`rounded-md border p-2 text-left text-xs transition ${step === s.stage ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'} ${!s.applicable ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-1.5 font-medium"><StatusDot done={s.done} applicable={s.applicable} />{STAGE_LABELS[s.stage]}</div>
          <div className="mt-1 line-clamp-2 break-all text-muted-foreground">{s.stage === 'intake' ? `${summary.verified} verified · ${summary.awaiting} to confirm` : s.stage === 'capture' && !state.route ? 'Choose the build route first' : s.stage === 'capture' && captureOn && state.capture.url_count != null ? `${state.capture.url_count} URLs · ${state.capture.asset_count ?? 0} assets` : s.detail}</div>
        </button>)}
      </div>
      {/* The eight Claude tasks, one click each. Each prompt carries only its stage's context. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
        <span className="mr-1 text-xs text-muted-foreground">Claude tasks:</span>
        {prompts.map((p) => { const refusing = p.id === 'production_deploy' && p.blockedBy.length > 0;
          return <Button key={p.id} size="sm" variant={p.stage === step ? 'default' : 'outline'} className="h-7 px-2 text-xs" disabled={refusing}
            title={p.blockedBy.length ? `${p.label} — missing: ${p.blockedBy.join(', ')}` : p.label} aria-label={p.label} onClick={() => void copyPrompt(p)}>
            <Clipboard className="mr-1 h-3 w-3" />{p.short}{p.blockedBy.length > 0 && !refusing && <span className="ml-1 text-amber-500">•</span>}</Button>; })}
      </div>
    </CardContent></Card>

    <ProjectDetails key={step === 'build_pack' ? 'open' : 'closed'} defaultOpen={step === 'build_pack'} state={state} set={set} businessName={businessName}
      template={template} existingSiteUrl={existingSiteUrl} factSiteUrl={factSiteUrl} tradeRow={tradeRow} crawlLabel={crawl.label} crawledAt={crawl.crawledAt} />

    {cur && <p className="text-xs text-muted-foreground">{STAGE_LABELS[cur.stage]}: {cur.detail}</p>}

    {/* ══ INTAKE ═══════════════════════════════════════════════════════════════════════════ */}
    {step === 'intake' && <>
      <Section title="Build route">
        <RouteSelector state={state} update={update} trade={tradeRow?.value ?? ''} />
        {state.route === 'template_rebuild' && <TemplatePicker state={state} set={set} template={template} />}
        {faithful && <div className="space-y-3">
          <div><Label>How close to the original?</Label><div className="mt-1"><Choice name="style" value={state.rebuild_style} options={REBUILD_STYLES} labels={REBUILD_STYLE_LABELS} onChange={(v) => set('rebuild_style', v)} /></div></div>
          <div><Label>Who owns / supplied the current website copy &amp; design?</Label><div className="mt-1"><Choice name="own" value={state.copy_ownership} options={COPY_OWNERSHIPS} labels={COPY_OWNERSHIP_LABELS} onChange={(v) => set('copy_ownership', v)} /></div>
            {state.copy_ownership && <p className={`mt-2 rounded p-2 text-xs ${mayPreserveCopy(state.copy_ownership) ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'}`}>
              {mayPreserveCopy(state.copy_ownership) ? 'The existing wording may be kept where it is accurate.' : 'Facts and the visual requirements are kept; the marketing wording is rewritten freshly, never copied. Only genuine client-owned assets are reused.'}</p>}
          </div>
          {!existingSiteUrl && <p className="flex items-start gap-2 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5" />No current website is recorded for this client. A faithful rebuild needs one — add it in Project details or under Client Build Facts.</p>}
        </div>}
        {state.route === 'bespoke' && <div className="space-y-2">
          <Label className="text-xs">Design references (existing Findable sites / templates to take the look from)</Label>
          <Textarea rows={2} className="text-xs" value={state.design_references} placeholder="e.g. MCL Local Trades Template for the card system; findable.live for the typography" onChange={(e) => set('design_references', e.target.value)} />
          <p className="text-xs text-muted-foreground">When this build is finished it can be marked as a template candidate on the Live step.</p>
        </div>}
        <RouteGuide state={state} stage="intake" update={update} />
      </Section>

      <Section title="Website evidence (latest crawl)">
        {/* The lead's ONE crawl row. A crawl started on Outreach, the Inbox or Paid Clients is this
            same row; Re-crawl here writes it too. Everything read is DETECTED — it reaches the build
            only as a fact Paul approves below. */}
        <LeadCrawlPanel leadId={leadId} website={existingSiteUrl || String((payload.lead as { website?: string } | null)?.website ?? '')}
          summary={crawl} from="website_build"
          onDone={async () => {
            if (queue.current!.pending()) await flush();
            /* ⛔ Never reload over an edit the server has not got — the reload would silently replace it. */
            if (queue.current!.pending()) { toast({ title: 'Not reloaded', description: 'Your last edit is not saved yet. Retry the save, then reload.', variant: 'destructive' }); return; }
            setReloadKey((k) => k + 1);
          }} />
        <CrawlEvidenceDetails full={payload.crawl?.mode === 'full' ? payload.crawl.full_evidence : null} />
      </Section>

      <FactsSection rows={rows} template={template} onDecide={decideRow} onReset={resetFact} onPut={putFact} onEdit={editRow}
        onPaste={(text) => { const add = parseFactLines(text, template, 'pasted from capture'); update((s) => ({ ...s, facts: [...s.facts.filter((f) => !add.some((a) => a.key === f.key)), ...add] })); toast({ title: `${add.length} fact(s) added`, description: 'They are marked "Needs approval".' }); }} />

      {state.recon.towns.length > 0 && <ServiceAreaPanel state={state} rows={rows} update={update} />}

      {template && <Section title={`Template fact mapping — ${template.name}`}>
        <p className="text-xs text-muted-foreground">Every client-specific claim in the template, and whether this client has a verified fact to replace it. Anything not verified is removed from the build, never adapted.</p>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 pr-2">Template claim</th><th className="py-1 pr-2">In the template</th><th className="py-1">For this client</th></tr></thead>
          <tbody>{mapTemplateClaims(template, rows).map((m) => <tr key={m.id} className="border-b align-top"><td className="py-1.5 pr-2 font-medium">{m.label}</td><td className="py-1.5 pr-2 text-muted-foreground">{m.sourceExample}</td>
            <td className={`py-1.5 ${m.verdict === 'verified' ? 'text-emerald-700 dark:text-emerald-300' : m.verdict === 'needs_approval' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{CLAIM_VERDICT_LABELS[m.verdict]}{m.clientValue ? `: ${m.clientValue}` : ''}</td></tr>)}</tbody></table></div>
      </Section>}

      <Section title="Operator notes"><Textarea rows={3} className="text-xs" value={state.notes} placeholder="Anything Claude should know that is not a client fact (e.g. the client wants a green colour scheme)." onChange={(e) => set('notes', e.target.value)} /></Section>
      <div className="flex justify-end"><Button onClick={() => goStep(captureOn ? 'capture' : 'architecture')}>Next: {captureOn ? 'Capture' : 'Architecture'}</Button></div>
    </>}

    {/* ══ CAPTURE ══════════════════════════════════════════════════════════════════════════ */}
    {step === 'capture' && <>
      {!state.route ? <Section title="Source website"><p className="text-muted-foreground">Choose the build route first.</p></Section> : <>
        <ReconPanel state={state} update={update} rows={rows} candidates={candidates} template={template} existingSiteUrl={existingSiteUrl} factSiteUrl={factSiteUrl}
          set={set} prompt={promptById('recon')} onCopy={copyPrompt} factsAwaiting={summary.awaiting} toast={toast} />
        {state.recon.imported_at && <NeedsReviewPanel state={state} update={update} rows={rows} onDecide={decideRow} onReset={resetFact} onPut={putFact} onEdit={editRow} />}
        {state.manifest.pages.length > 0 && <PageFamiliesPanel manifest={state.manifest} />}
        {state.manifest.assets.length > 0 && <AssetInventory state={state} update={update} />}
        <RouteGuide state={state} stage="capture" update={update} />
        {captureOn && <details className="rounded-lg border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Local capture — downloads, screenshots, design &amp; SEO notes <span className="text-xs font-normal text-muted-foreground">(after the recon)</span></summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">Run the <b>Project setup</b> commands first so the client folder exists. The capture prompt saves the site locally in a <code>capture</code> folder and updates <code>capture/recon.json</code> — import it again above.</p>
            <PackCard item={packById('setup')} onCopy={copyItem} />
            <PromptCard p={promptById('capture')} onCopy={copyPrompt} />
            <div className="grid gap-3 sm:grid-cols-4">
              <div><Label className="text-xs">Capture status</Label><select aria-label="Capture status" className={sel} value={state.capture.status} onChange={(e) => set('capture', { ...state.capture, status: e.target.value as typeof state.capture.status })}>{CAPTURE_STATUSES.map((c) => <option key={c} value={c}>{CAPTURE_STATUS_LABELS[c]}</option>)}</select></div>
              <div><Label className="text-xs">URLs captured</Label><Input className="h-8 text-xs" inputMode="numeric" value={state.capture.url_count ?? ''} onChange={(e) => set('capture', { ...state.capture, url_count: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></div>
              <div><Label className="text-xs">Assets captured</Label><Input className="h-8 text-xs" inputMode="numeric" value={state.capture.asset_count ?? ''} onChange={(e) => set('capture', { ...state.capture, asset_count: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></div>
              <div><Label className="text-xs">Last captured</Label><Input type="date" className="h-8 text-xs" value={state.last_captured_at} onChange={(e) => set('last_captured_at', e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">Capture notes</Label><Textarea rows={2} className="text-xs" value={state.capture.notes} placeholder="Anything notable Claude reported (e.g. the gallery is on Facebook, not the site)." onChange={(e) => set('capture', { ...state.capture, notes: e.target.value })} /></div>
            <DesignSeoNotes state={state} update={update} />
          </div>
        </details>}
      </>}
      <div className="flex justify-between"><Button variant="outline" onClick={() => goStep('intake')}>Back</Button><Button onClick={() => goStep('architecture')}>Next: Architecture</Button></div>
    </>}

    {/* ══ ARCHITECTURE ═════════════════════════════════════════════════════════════════════ */}
    {step === 'architecture' && <>
      {state.route && <Section title="Architecture — route guidance"><RouteGuide state={state} stage="architecture" update={update} /><PromptCard p={promptById('architecture')} onCopy={copyPrompt} /></Section>}
      <ArchitectureSection state={state} template={template} rows={rows} issues={issues}
        checkedPages={crawlOldUrls(payload.crawl)} cited={evidence.signals} update={update} goStep={goStep} toast={toast} leadId={leadId} />
      <UrlDecisionsPanel state={state} />
    </>}

    {/* ══ BUILD PACK ═══════════════════════════════════════════════════════════════════════ */}
    {step === 'build_pack' && <>
      {state.route && mapping && packInput && <BuildExecutionPanel state={state} update={update} mapping={mapping} input={packInput}
        execPrompt={promptById('build_execution')} onCopy={copyPrompt} toast={toast} />}
      {state.route && mapping && <MappingPanel mapping={mapping} buildBlockers={buildBlockers ?? []} state={state} update={update} set={set} rows={rows} onDecide={decideRow} onEdit={editRow} template={template}
        assetPrompt={promptById('asset_download')} onCopy={copyPrompt} />}
      <Section title="Claude tasks — one prompt per stage" right={<span className="text-xs text-muted-foreground">Generated from the saved decisions — always current.</span>}>
        <p className="text-xs text-muted-foreground">Open Claude Code on the client folder{state.local_repo_path ? <> (<code>{state.local_repo_path}</code>)</> : ''} and paste one prompt at a time, in order. Each carries only what its stage needs.</p>
        {prompts.map((p) => <PromptCard key={p.id} p={p} onCopy={copyPrompt} />)}
      </Section>
      <Section title="Commands (PowerShell)">
        <div className="rounded bg-muted p-3 text-xs"><p className="font-medium">Paste one block at a time and read what it prints. Paste back what each step asks for (repository URL, preview URL) — this page saves as you type.</p></div>
        {pack.filter((p) => p.applicable && p.kind === 'commands').map((p) => <PackCard key={p.id} item={p} onCopy={copyItem} />)}
      </Section>
      <details className="rounded-md border p-3 text-sm"><summary className="cursor-pointer text-xs font-medium">Full brief (V1: every stage in one prompt, plus the separate V1 QA prompts)</summary>
        <div className="mt-3 space-y-2">{pack.filter((p) => p.applicable && p.kind === 'prompt' && p.id !== 'capture').map((p) => <PackCard key={p.id} item={p} onCopy={copyItem} />)}</div>
      </details>
      <div className="flex justify-between"><Button variant="outline" onClick={() => goStep('architecture')}>Back</Button><Button onClick={() => goStep('preview')}>Next: Preview</Button></div>
    </>}

    {/* ══ PREVIEW ══════════════════════════════════════════════════════════════════════════ */}
    {step === 'preview' && <>
      {packInput && <PreviewResultPanel state={state} input={packInput} existingSiteUrl={existingSiteUrl} prompts={prompts} onCopy={copyPrompt} />}
      <Section title="Preview">
        <RouteGuide state={state} stage="preview" update={update} />
        <p className="rounded bg-muted p-2 text-xs"><b>Localhost is for development.</b> The <b>Cloudflare Pages preview</b> is the stable review version used for full-site comparison before the client domain is connected.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="min-w-0 space-y-2 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Local preview</p>
            <Field label="Local folder" value={state.local_repo_path} placeholder="C:\Users\paulj\ClientName" onChange={(v) => set('local_repo_path', v.trim())} />
            <Field label="Dev command" value={state.dev_command} placeholder={codeConfig(state, template).devCommand} onChange={(v) => set('dev_command', v)} />
            <Field label="Localhost URL" value={state.dev_url} placeholder={codeConfig(state, template).devUrl} onChange={(v) => set('dev_url', v.trim())} />
            <PackCard item={packById('local')} onCopy={copyItem} />
          </div>
          <div className="min-w-0 space-y-2 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cloudflare Pages preview</p>
            <Field label="Cloudflare project" value={state.cloudflare_project} placeholder="lowercase-with-dashes" onChange={(v) => set('cloudflare_project', v.trim().toLowerCase())} />
            <CloudflareModeFields state={state} set={set} />
            <Field label="pages.dev preview URL" value={state.preview_url} placeholder={state.cloudflare_project ? stablePreviewUrl(state) : 'paste from the preview deploy'} onChange={(v) => set('preview_url', v.trim())} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Pick label="Deployment status" value={state.preview_status} options={PREVIEW_STATUSES} labels={PREVIEW_STATUS_LABELS} onChange={(v) => set('preview_status', v)} />
              <label className="flex items-end gap-2 pb-1 text-xs"><input type="checkbox" aria-label="Noindex confirmed on the preview" checked={state.preview_noindex_confirmed} onChange={(e) => set('preview_noindex_confirmed', e.target.checked)} />Noindex confirmed</label>
            </div>
            {state.preview_url && <a href={state.preview_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open preview</a>}
            <PromptCard p={promptById('preview_deploy')} onCopy={copyPrompt} />
            <PackCard item={packById('preview')} onCopy={copyItem} />
          </div>
        </div>
      </Section>
      {faithful ? <VisualComparison state={state} update={update} existingSiteUrl={existingSiteUrl} prompt={promptById('visual_compare')} onCopy={copyPrompt} toast={toast} />
        : <Section title="Visual check"><PromptCard p={promptById('visual_compare')} onCopy={copyPrompt} /></Section>}
      <div className="flex justify-between"><Button variant="outline" onClick={() => goStep('build_pack')}>Back</Button><Button onClick={() => goStep('qa')}>Next: QA</Button></div>
    </>}

    {/* ══ QA ═══════════════════════════════════════════════════════════════════════════════ */}
    {step === 'qa' && <>
      <Section title="QA prompts"><PromptCard p={promptById('qa')} onCopy={copyPrompt} /><PackCard item={packById('visual_qa')} onCopy={copyItem} /></Section>
      <Checklist state={state} group="preview" set={set} title="Definition of done — before production" />
      <div className="flex justify-between"><Button variant="outline" onClick={() => goStep('preview')}>Back</Button><Button onClick={() => goStep('live')}>Next: Live</Button></div>
    </>}

    {/* ══ LIVE ═════════════════════════════════════════════════════════════════════════════ */}
    {step === 'live' && <>
      <Section title="Production">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Production URL" value={state.production_url} placeholder={state.canonical_domain ? `https://${state.canonical_domain}` : 'https://…'} onChange={(v) => set('production_url', v.trim())} />
          <Field label="Latest commit" value={state.latest_commit} placeholder="output of: git log -1 --format=&quot;%h %s&quot;" onChange={(v) => set('latest_commit', v)} />
          <Pick label="Production status" value={state.production_status} options={PRODUCTION_STATUSES} labels={PRODUCTION_STATUS_LABELS} onChange={(v) => set('production_status', v)} />
          <Pick label="Custom domain" value={state.custom_domain_status} options={CUSTOM_DOMAIN_STATUSES} labels={CUSTOM_DOMAIN_STATUS_LABELS} onChange={(v) => set('custom_domain_status', v)} />
          <Pick label="www redirect" value={state.www_redirect_status} options={WWW_REDIRECT_STATUSES} labels={WWW_REDIRECT_STATUS_LABELS} onChange={(v) => set('www_redirect_status', v)} />
          <Field label="GitHub repository URL" value={state.repo_url} placeholder="https://github.com/…" onChange={(v) => set('repo_url', v.trim())} />
        </div>
        {state.production_url && <a href={state.production_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open production site</a>}
        <PromptCard p={promptById('production_deploy')} onCopy={copyPrompt} />
        <PackCard item={packById('production')} onCopy={copyItem} />
        <PackCard item={packById('final_qa')} onCopy={copyItem} />
      </Section>
      <Checklist state={state} group="live" set={set} title="Live checks" />
      {state.route === 'bespoke' && <PromotionPanel state={state} update={update} />}
      <div className="flex justify-start"><Button variant="outline" onClick={() => goStep('qa')}>Back</Button></div>
    </>}
  </div>;
}

/* ── small pieces ─────────────────────────────────────────────────────────────────────────────── */

function Field({ label, value, placeholder, onChange, action }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void; action?: ReactNode }) {
  return <div><div className="flex items-center justify-between gap-2"><Label className="text-xs">{label}</Label>{action}</div><Input aria-label={label} className="h-8 text-xs" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}

/** F17: how the Cloudflare Pages project deploys. Names and labels only — never a credential. */
function CloudflareModeFields({ state, set }: { state: WebsiteBuildState; set: SetFn }) {
  const b = cloudflareBranches(state);
  const problem = state.cloudflare_project ? cloudflareModeProblem(state) : '';
  return <div className="space-y-2 sm:col-span-2">
    <div className="grid gap-2 sm:grid-cols-2">
      <div><Label className="text-xs">Cloudflare deployment</Label>
        <select aria-label="Cloudflare deployment" className={sel} value={state.cloudflare_mode} onChange={(e) => set('cloudflare_mode', e.target.value as WebsiteBuildState['cloudflare_mode'])}>
          <option value="">Not chosen</option>{CLOUDFLARE_MODES.map((m) => <option key={m} value={m}>{CLOUDFLARE_MODE_LABELS[m]}</option>)}</select></div>
      <Field label="Cloudflare account (label)" value={state.cloudflare_account} placeholder="e.g. beyondwebcraft" onChange={(v) => set('cloudflare_account', v)} />
      <Field label="Production branch" value={state.cloudflare_production_branch} placeholder={b.production} onChange={(v) => set('cloudflare_production_branch', v.trim())} />
      <Field label="Preview branch" value={state.cloudflare_preview_branch} placeholder={b.preview} onChange={(v) => set('cloudflare_preview_branch', v.trim())} />
    </div>
    {state.cloudflare_mode === 'git_connected' && <p className="text-[11px] text-muted-foreground">Git-connected: you link the project to the client's GitHub repo in the Cloudflare dashboard once; after that a push deploys. No Wrangler sign-in is needed. The production branch ({b.production}) stays a placeholder until go-live.</p>}
    {problem && <p className="break-words text-[11px] text-amber-700 dark:text-amber-300">{problem}</p>}
  </div>;
}

function Checklist({ state, group, set, title }: { state: WebsiteBuildState; group: 'preview' | 'live'; set: SetFn; title: string }) {
  const items = QA_ITEMS.filter((q) => q.group === group);
  const done = items.filter((q) => state.qa[q.key]).length;
  return <Section title={title} right={<span className="text-xs text-muted-foreground">{done} of {items.length}</span>}>
    <div className="grid gap-1.5 sm:grid-cols-2">{items.map((q) => <label key={q.key} className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" aria-label={q.label} className="mt-1" checked={state.qa[q.key] === true} onChange={(e) => set('qa', { ...state.qa, [q.key]: e.target.checked })} /><span>{q.label}</span></label>)}</div>
    <p className="text-xs text-muted-foreground">Tick only what the QA prompts reported as PASS, or what you checked yourself.</p>
  </Section>;
}

function RouteSelector({ state, update, trade }: { state: WebsiteBuildState; update: UpdateFn; trade: string }) {
  /* ⛔ One rule decides "recommended": the template's primary / supported TRADES (tradeFit). The
     descriptive "could be adapted for" list never recommends (F1, BS4 pilot). */
  const suits = recommendedTemplates(trade);
  const recRoute = recommendedRoute(trade);
  const chosenTpl = state.route === 'template_rebuild' ? templateById(state.template_id) : null;
  const weakChoice = chosenTpl && trade && tradeFit(trade, chosenTpl) === 'weak';
  const choose = (r: BuildRoute) => update((s) => ({ ...s, route: r,
    /* Choosing Template picks a template only if none is chosen — the V1 behaviour. */
    template_id: r === 'template_rebuild' ? (s.template_id || suits[0]?.id || WEBSITE_TEMPLATES[0].id) : s.template_id }));
  return <div className="space-y-2">
    <div className="grid gap-2 md:grid-cols-3">{BUILD_ROUTES.map((r) => {
      const recommended = r === recRoute;
      return <label key={r} className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm ${state.route === r ? 'border-primary bg-primary/5' : ''}`}>
        <span className="flex items-center gap-2"><input type="radio" name="route" value={r} aria-label={ROUTE_INFO[r].label} checked={state.route === r} onChange={() => choose(r)} />
          <span className="font-medium">{ROUTE_INFO[r].label}</span>
          {recommended && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Recommended</span>}</span>
        <span className="text-xs text-muted-foreground">{ROUTE_INFO[r].description}</span>
      </label>; })}</div>
    <p className="text-xs text-muted-foreground">{suits.length ? `A Findable template is built for this trade (${suits.map((t) => t.name).join(', ')}), so Template rebuild is recommended.` : trade ? `No Findable template is built for "${trade}" yet, so Bespoke / new trade is recommended.` : 'Verify the trade fact to see whether a template is built for it.'} Changing the route keeps everything already entered.</p>
    {weakChoice && <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{chosenTpl!.name} is built for {chosenTpl!.primaryTrade}s, not "{trade}" — a weak match. You can still use it deliberately; every trade-specific section, service and claim will need replacing.</span></p>}
  </div>;
}

function TemplatePicker({ state, set, template }: { state: WebsiteBuildState; set: SetFn; template: ReturnType<typeof templateById> }) {
  return <div className="space-y-2">
    <Label>Template</Label>
    {WEBSITE_TEMPLATES.map((t) => <label key={t.id} className={`block cursor-pointer rounded-md border p-3 ${state.template_id === t.id ? 'border-primary bg-primary/5' : ''}`}>
      <div className="flex items-start gap-2"><input type="radio" name="tpl" value={t.id} aria-label={t.name} className="mt-1" checked={state.template_id === t.id} onChange={() => set('template_id', t.id)} />
        <div className="min-w-0"><p className="font-medium">{t.name} <span className="text-xs font-normal text-muted-foreground">v{t.version} · {t.trade}</span></p><p className="text-xs text-muted-foreground">{t.description}</p>
          <details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">Template profile</summary>
            <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Source repo</dt><dd className="break-all">{t.sourceRepoUrl} ({t.sourceRepoPrivate ? 'private' : 'public'})</dd></div>
              <div><dt className="text-muted-foreground">Framework</dt><dd>{t.framework} · Node {t.nodeVersion}</dd></div>
              <div><dt className="text-muted-foreground">Dev</dt><dd>{t.devCommand} → {t.devUrl}</dd></div>
              <div><dt className="text-muted-foreground">Build</dt><dd>{t.buildCommand} → {t.buildOutputDir}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Template preview</dt><dd>{t.previewUrl || 'None deployed yet'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Cloudflare</dt><dd>{t.cloudflare}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Page types</dt><dd>{templatePageTypes(t).map((f) => PAGE_FAMILY_LABELS[f]).join(' · ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Optional sections</dt><dd>{t.optionalSections.map((x) => x.label).join(' · ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Reusable components</dt><dd>{t.reusableComponents.join(' · ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Visual style</dt><dd>{t.visualStyle.join(' · ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Built for</dt><dd>{t.supportedTrades.join(', ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Could be adapted for (never a recommendation)</dt><dd>{t.supportedBusinessTypes.join(', ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Required facts</dt><dd>{templateRequiredFacts(t).map((f) => f.label).join(', ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Optional facts</dt><dd>{templateOptionalFacts(t).map((f) => f.label).join(', ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Images the client supplies</dt><dd>{t.imageRequirements.map((x) => `${x.label}${x.required ? ' *' : ''}`).join(' · ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Never carried over ({t.sourceClient})</dt><dd>{t.claims.map((c) => c.label).join(' · ')}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground">Forbidden seed-client values ({t.forbiddenSeedValues.length})</dt><dd>{t.forbiddenSeedValues.map((v) => v.value).join(' · ')}</dd></div>
            </dl></details></div></div>
    </label>)}
    <p className="text-xs text-muted-foreground">Template reuse means structure and design only. Every {template?.sourceClient ?? 'source-client'} claim is checked against this client's verified facts below and removed if there is no match.</p>
  </div>;
}

function ProjectDetails({ defaultOpen, state, set, businessName, template, existingSiteUrl, factSiteUrl, tradeRow, crawlLabel, crawledAt }: {
  defaultOpen: boolean; state: WebsiteBuildState; set: SetFn; businessName: string; template: ReturnType<typeof templateById>;
  existingSiteUrl: string; factSiteUrl: string; tradeRow: FactRow | undefined; crawlLabel: string; crawledAt: string | null;
}) {
  const repoSuggestion = suggestRepoName(businessName);
  const problems = setupProblems(state);
  const cfg = codeConfig(state, template);
  const domainFromSite = (() => { try { return existingSiteUrl ? new URL(existingSiteUrl).hostname.replace(/^www\./, '') : ''; } catch { return ''; } })();
  const Sugg = ({ label, onClick }: { label: string; onClick: () => void }) => <button type="button" className="truncate text-[11px] text-primary underline" onClick={onClick}>{label}</button>;
  const G = ({ title, children }: { title: string; children: ReactNode }) => <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p><div className="grid gap-3 sm:grid-cols-2">{children}</div></div>;
  const summaryLine = [state.repo_name || 'no repo', state.cloudflare_project || 'no Cloudflare project', state.canonical_domain || 'no domain'].join(' · ');
  return <details open={defaultOpen} className="rounded-lg border bg-card p-4 text-sm">
    <summary className="cursor-pointer"><span className="font-semibold">Project details</span> <span className="text-xs text-muted-foreground">— {summaryLine}{problems.length ? ` · setup needs ${problems.length} value(s)` : ''}</span></summary>
    <div className="mt-4 space-y-5">
      <G title="Source website">
        <Field label="Existing site URL" value={state.source_site_url} placeholder={factSiteUrl || 'https://…'} onChange={(v) => set('source_site_url', v.trim())} />
        <Pick label="Original site still live?" value={state.source_still_live} options={SITE_LIVE_STATES} labels={SITE_LIVE_LABELS} onChange={(v) => set('source_still_live', v)} />
        <Field label="Source platform" value={state.source_platform} placeholder="WordPress, Wix, hand-coded… (from the recon)" onChange={(v) => set('source_platform', v)} />
        <div><Label className="text-xs">Crawl status</Label><p className="h-8 truncate py-1.5 text-xs">{crawlLabel}{crawledAt ? ` · ${new Date(crawledAt).toLocaleDateString('en-GB')}` : ''}</p></div>
        <div><Label className="text-xs">Last captured</Label><Input type="date" aria-label="Last captured" className="h-8 text-xs" value={state.last_captured_at} onChange={(e) => set('last_captured_at', e.target.value)} /></div>
      </G>
      {!state.source_site_url && factSiteUrl && <p className="-mt-3 text-[11px] text-muted-foreground">Blank uses the Current website fact: {factSiteUrl}</p>}
      <G title="Target">
        <Field label="Target domain (canonical)" value={state.canonical_domain} placeholder="example.co.uk" onChange={(v) => set('canonical_domain', v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))}
          action={domainFromSite && state.canonical_domain !== domainFromSite ? <Sugg label={`Use ${domainFromSite}`} onClick={() => set('canonical_domain', domainFromSite)} /> : undefined} />
        <div><Label className="text-xs">Trade / category</Label><p className="flex h-8 items-center gap-2 text-xs">{tradeRow?.value || '—'}{tradeRow && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${FACT_TONE[tradeRow.status]}`}>{FACT_STATUS_LABELS[tradeRow.status]}</span>}<span className="text-muted-foreground">(a fact — edit in Client Build Facts)</span></p></div>
      </G>
      <G title="Code">
        <Field label="Repository name" value={state.repo_name} placeholder={repoSuggestion || 'ClientName'} onChange={(v) => set('repo_name', v.trim())}
          action={repoSuggestion && state.repo_name !== repoSuggestion ? <Sugg label={`Use ${repoSuggestion}`} onClick={() => set('repo_name', repoSuggestion)} /> : undefined} />
        <Field label="GitHub account (owner)" value={state.github_owner} placeholder="your GitHub username" onChange={(v) => set('github_owner', v.trim())}
          action={template && state.github_owner !== template.sourceRepoOwner ? <Sugg label={`Use ${template.sourceRepoOwner}`} onClick={() => set('github_owner', template.sourceRepoOwner)} /> : undefined} />
        <Field label="Repository URL" value={state.repo_url} placeholder={state.github_owner && state.repo_name ? `https://github.com/${state.github_owner}/${state.repo_name}` : 'https://github.com/…'} onChange={(v) => set('repo_url', v.trim())} />
        <Field label="Local folder" value={state.local_repo_path} placeholder="C:\Users\paulj\ClientName" onChange={(v) => set('local_repo_path', v.trim())}
          action={state.repo_name && !state.local_repo_path ? <Sugg label={`Use C:\\Users\\paulj\\${state.repo_name}`} onClick={() => set('local_repo_path', `C:\\Users\\paulj\\${state.repo_name}`)} /> : undefined} />
        <Field label="Dev command" value={state.dev_command} placeholder={cfg.devCommand} onChange={(v) => set('dev_command', v)} />
        <Field label="Build command" value={state.build_command} placeholder={cfg.buildCommand} onChange={(v) => set('build_command', v)} />
        <Field label="Build output directory" value={state.build_output_dir} placeholder={cfg.outputDir} onChange={(v) => set('build_output_dir', v.trim())} />
      </G>
      <G title="Preview">
        <Field label="Cloudflare project name" value={state.cloudflare_project} placeholder="lowercase-with-dashes" onChange={(v) => set('cloudflare_project', v.trim().toLowerCase())}
          action={state.repo_name && !state.cloudflare_project ? <Sugg label={`Use ${suggestCloudflareProject(state.repo_name)}`} onClick={() => set('cloudflare_project', suggestCloudflareProject(state.repo_name))} /> : undefined} />
        <CloudflareModeFields state={state} set={set} />
        <Field label="Preview URL" value={state.preview_url} placeholder={state.cloudflare_project ? stablePreviewUrl(state) : 'https://preview.….pages.dev'} onChange={(v) => set('preview_url', v.trim())} />
        <Pick label="Preview status" value={state.preview_status} options={PREVIEW_STATUSES} labels={PREVIEW_STATUS_LABELS} onChange={(v) => set('preview_status', v)} />
        <label className="flex items-end gap-2 pb-1 text-xs"><input type="checkbox" aria-label="Preview noindex confirmed" checked={state.preview_noindex_confirmed} onChange={(e) => set('preview_noindex_confirmed', e.target.checked)} />Preview noindex confirmed</label>
      </G>
      <G title="Production">
        <Field label="Production URL" value={state.production_url} placeholder={state.canonical_domain ? `https://${state.canonical_domain}` : 'https://…'} onChange={(v) => set('production_url', v.trim())} />
        <Pick label="Production status" value={state.production_status} options={PRODUCTION_STATUSES} labels={PRODUCTION_STATUS_LABELS} onChange={(v) => set('production_status', v)} />
        <Pick label="Custom domain status" value={state.custom_domain_status} options={CUSTOM_DOMAIN_STATUSES} labels={CUSTOM_DOMAIN_STATUS_LABELS} onChange={(v) => set('custom_domain_status', v)} />
        <Pick label="www redirect status" value={state.www_redirect_status} options={WWW_REDIRECT_STATUSES} labels={WWW_REDIRECT_STATUS_LABELS} onChange={(v) => set('www_redirect_status', v)} />
      </G>
      {problems.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Setup commands need: {problems.map((p) => `${p.label} (${p.problem})`).join(' · ')}</p>}
      <p className="text-xs text-muted-foreground">Suggestions are only filled in when you click them. Blank commands use the {template ? 'template\u2019s' : 'Astro'} defaults shown. A Git-connected Cloudflare project is linked by you in the dashboard (the build prompt prints the exact steps); nothing is created automatically.</p>
    </div>
  </details>;
}

function DesignSeoNotes({ state, update }: { state: WebsiteBuildState; update: UpdateFn }) {
  const m = state.manifest;
  const setM = (fn: (x: WebsiteBuildState['manifest']) => WebsiteBuildState['manifest']) => update((s) => ({ ...s, manifest: fn(s.manifest) }));
  const D = m.design, S = m.seo;
  return <details className="text-xs"><summary className="cursor-pointer font-medium">Design, interactions and SEO ({m.interactions.length} interaction(s))</summary>
    {m.interactions.length > 0 && <ul className="mt-2 space-y-1">{m.interactions.map((it, n) => <li key={n} className="break-words"><b>{it.kind.replace('_', ' ')}</b> — {it.where}{it.notes ? `: ${it.notes}` : ''}</li>)}</ul>}
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {([['fonts', 'Fonts'], ['colours', 'Colours'], ['layout_notes', 'Layout notes'], ['component_notes', 'Component notes']] as const).map(([k, l]) =>
        <div key={k}><Label className="text-xs">{l}</Label><Textarea rows={2} className="text-xs" value={D[k]} onChange={(e) => setM((x) => ({ ...x, design: { ...x.design, [k]: e.target.value } }))} /></div>)}
      {([['metadata', 'Metadata'], ['canonical', 'Canonical'], ['schema', 'Schema'], ['sitemap', 'Sitemap'], ['robots', 'Robots'], ['tracking', 'Tracking']] as const).map(([k, l]) =>
        <div key={k}><Label className="text-xs">SEO — {l}</Label><Textarea rows={2} className="text-xs" value={S[k]} onChange={(e) => setM((x) => ({ ...x, seo: { ...x.seo, [k]: e.target.value } }))} /></div>)}
    </div></details>;
}

/* ══ PHASE 2 — SOURCE SITE RECON ═══════════════════════════════════════════════════════════════
   URL → Copy Recon Prompt → Claude Code crawls → Import Recon Result (checked, summarised, then
   merged) → Needs Review. Everything imported is untrusted text: rendered as text only, links only
   for http(s) URLs (safeUrl), never markup. */

const RECON_TONE: Record<ReconStatus, string> = {
  not_started: 'bg-muted text-muted-foreground', prompt_copied: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  imported: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100', needs_review: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  complete: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
};
const when = (iso: string) => { const d = new Date(iso); return iso && !Number.isNaN(d.getTime()) ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''; };
const factOpen = (rows: FactRow[]) => (key: string) => { const r = rows.find((x) => x.key === key); return !r || r.status === 'detected' || r.status === 'missing'; };

function ReconPanel({ state, update, rows, candidates, template, existingSiteUrl, factSiteUrl, set, prompt, onCopy, factsAwaiting, toast }: {
  state: WebsiteBuildState; update: UpdateFn; rows: FactRow[]; candidates: ReturnType<typeof candidateFacts>; template: ReturnType<typeof templateById>;
  existingSiteUrl: string; factSiteUrl: string; set: SetFn; prompt: StagePrompt; onCopy: (p: StagePrompt) => void | Promise<void>;
  factsAwaiting: number; toast: ReturnType<typeof useToast>['toast'];
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ReconParse | null>(null);
  const openReview = openReconReview(state, factOpen(rows)).length;
  const status = reconStatus(state, { hasExistingSite: !!existingSiteUrl, factsAwaiting, openReview });
  const href = safeUrl(existingSiteUrl);
  const doImport = () => {
    if (!parsed || !('result' in parsed)) return;
    /* Merged against the ledger exactly as it stands, then saved through the normal autosave. */
    const out = applyRecon(state, parsed.result, mergeFacts(candidates, state.facts, template), new Date().toISOString());
    update(() => out.state);
    setText(''); setParsed(null); setImportOpen(false);
    const r = out.report;
    toast({ title: 'Recon imported', description: `${r.verified} fact(s) verified from the site · ${r.needsApproval} need approval · ${r.conflicts} conflict(s) · ${r.keptVerified} already-verified fact(s) kept${r.factsDropped ? ` · ${r.factsDropped} not stored (fact limit)` : ''}.` });
  };
  const sum = parsed && 'summary' in parsed ? parsed.summary : null;
  return <Section title="Source website" right={<span className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase ${RECON_TONE[status]}`}>Recon: {RECON_STATUS_LABELS[status]}</span>}>
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1"><Field label="Existing website URL" value={state.source_site_url} placeholder={factSiteUrl || 'https://…'} onChange={(v) => set('source_site_url', v.trim())} /></div>
      {href ? <Button asChild size="sm" variant="outline"><a href={href} target="_blank" rel="noopener noreferrer">Open source website</a></Button>
        : <Button size="sm" variant="outline" disabled>Open source website</Button>}
      <Button size="sm" disabled={!state.route} onClick={() => void onCopy(prompt)}><Clipboard className="mr-1 h-4 w-4" />Copy Recon Prompt</Button>
      <Button size="sm" variant={importOpen ? 'secondary' : 'outline'} onClick={() => { setImportOpen((o) => !o); setParsed(null); }}>Import Recon Result</Button>
    </div>
    {!state.source_site_url && factSiteUrl && <p className="text-[11px] text-muted-foreground">Using the Current website fact: {factSiteUrl}</p>}
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
      <div><dt className="text-muted-foreground">Last recon</dt><dd>{when(state.recon.imported_at) || '—'}</dd></div>
      <div><dt className="text-muted-foreground">Pages discovered</dt><dd>{state.recon.imported_at ? state.manifest.pages.length + (state.recon.pages_total && state.recon.pages_total > state.manifest.pages.length ? ` (of ${state.recon.pages_total})` : '') : '—'}</dd></div>
      <div><dt className="text-muted-foreground">Assets discovered</dt><dd>{state.recon.imported_at ? state.manifest.assets.length : '—'}</dd></div>
      <div><dt className="text-muted-foreground">Facts needing approval</dt><dd>{factsAwaiting}</dd></div>
    </dl>
    {prompt.blockedBy.length > 0 && <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Recon prompt is missing: {prompt.blockedBy.join(' · ')}</p>}
    <button type="button" className="text-xs text-primary underline" onClick={() => setShowPrompt((o) => !o)}>{showPrompt ? 'Hide the recon prompt' : 'Show the recon prompt'}</button>
    {showPrompt && <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-[11px] leading-relaxed">{prompt.text}</pre>}
    {importOpen && <div className="min-w-0 space-y-2 rounded-md border p-3">
      <Label className="text-xs">Paste Claude's recon result — the whole reply, or just the JSON</Label>
      <Textarea aria-label="Recon result" rows={6} className="font-mono text-xs" value={text} placeholder={'…Claude’s summary…\n```json\n{ "reconVersion": 1, "sourceUrl": "https://…", "pages": [ … ], "facts": [ … ] }\n```'} onChange={(e) => { setText(e.target.value); setParsed(null); }} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!text.trim()} onClick={() => setParsed(parseReconText(text))}>Check</Button>
        <Button size="sm" variant="ghost" onClick={() => { setImportOpen(false); setText(''); setParsed(null); }}>Cancel</Button>
      </div>
      {parsed && 'error' in parsed && <div role="alert" className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{parsed.error}</span></div>}
      {sum && <div className="space-y-2 rounded bg-muted p-3 text-xs">
        <p className="font-medium">Ready to import{parsed && 'result' in parsed && parsed.result.sourceUrl ? ` — ${parsed.result.sourceUrl}` : ''}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{([['Pages', sum.pages], ['Facts', sum.facts], ['Assets', sum.assets], ['Unknowns', sum.unknowns], ['Warnings', sum.warnings], ['Interactions', sum.interactions]] as const).map(([l, n]) =>
          <div key={l} className="rounded border bg-background p-2"><div className="text-muted-foreground">{l}</div><div className="text-base font-semibold">{n}</div></div>)}</div>
        {sum.families.length > 0 && <p><b>Page families:</b> {sum.families.map((f) => `${PAGE_FAMILY_LABELS[f.family]} ${f.count}`).join(' · ')}</p>}
        {sum.dropped.length > 0 && <p className="text-amber-800 dark:text-amber-200"><b>Not imported:</b> {sum.dropped.join(' · ')}</p>}
        {sum.ignoredKeys.length > 0 && <p className="text-amber-800 dark:text-amber-200"><b>Fields LeadFinderOS does not store:</b> {sum.ignoredKeys.join(', ')}</p>}
        {sum.notes.map((n, k) => <p key={k} className="text-muted-foreground">{n}</p>)}
        <p className="text-muted-foreground">Import MERGES: pages and assets are added or updated by URL, facts go to the ledger (verified only when the site states them clearly and nothing disagrees), and the route, project details, page plan, redirects, QA and preview are left alone.</p>
        <div className="flex gap-2"><Button size="sm" onClick={doImport}>Import</Button><Button size="sm" variant="ghost" onClick={() => setParsed(null)}>Cancel</Button></div>
      </div>}
    </div>}
  </Section>;
}

function NeedsReviewPanel({ state, update, rows, onDecide, onReset, onPut, onEdit }: {
  state: WebsiteBuildState; update: UpdateFn; rows: FactRow[];
  onDecide: (r: FactRow, s: StoredFactStatus, value?: string) => void; onReset: (key: string) => void; onPut: (f: BuildFact) => void; onEdit: (r: FactRow, value: string) => void;
}) {
  const [all, setAll] = useState(false);
  const items = openReconReview(state, factOpen(rows));
  const keyed = new Set(items.filter((i) => i.key).map((i) => i.key));
  const awaiting = rows.filter((r) => r.status === 'detected' && !keyed.has(r.key));
  const requiredMissing = factsSummary(rows).requiredMissing;
  const dismiss = (it: ReconReviewItem) => update((s) => ({ ...s, recon: { ...s.recon, review: s.recon.review.map((x) =>
    x.kind === it.kind && x.key === it.key && x.detail === it.detail ? { ...x, resolved: true } : x) } }));
  const total = items.length + awaiting.length;
  const shown = all ? items : items.slice(0, 25);
  const KIND_LABEL: Record<ReconReviewItem['kind'], string> = { conflict: 'Conflict', unknown: 'Unknown', warning: 'Check' };
  return <Section title="Needs review" right={<span className="text-xs text-muted-foreground">{total} open</span>}>
    {total === 0 ? <p className="text-xs text-muted-foreground">Nothing from the recon needs a decision. Unknowns you set aside can wait for the client.</p> : <>
      <p className="text-xs text-muted-foreground">Contradictions, uncertain facts and gaps from the recon. Approve, reject or edit here — it is the same fact ledger as Intake. A conflict clears once its fact is decided; an unknown can wait for the client.</p>
      <div className="space-y-2">{shown.map((it, n) => {
        const row = it.key ? rows.find((r) => r.key === it.key) : undefined;
        const chip = <span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${it.kind === 'conflict' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'}`}>{KIND_LABEL[it.kind]}</span>;
        const dismissBtn = it.kind !== 'conflict' && <Button size="sm" variant="ghost" onClick={() => dismiss(it)}>{it.kind === 'unknown' ? 'Wait for client' : 'Dismiss'}</Button>;
        return row ? <div key={n} className="space-y-1">
          <FactRowEditor row={row} onDecide={onDecide} onReset={onReset} onPut={onPut} onEdit={onEdit} detail={KIND_LABEL[it.kind] + ': ' + it.detail} />
          {dismissBtn && <div className="flex justify-end">{dismissBtn}</div>}
        </div> : <div key={n} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2 text-xs">
          <p className="min-w-0 flex-1 break-words">{chip}<b>{it.label}</b> — {it.detail}</p>{dismissBtn}
        </div>;
      })}</div>
      {items.length > 25 && <button type="button" className="text-xs text-primary underline" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
      {awaiting.length > 0 && <details className="text-xs" open={items.length === 0}><summary className="cursor-pointer font-medium">Other facts needing approval ({awaiting.length})</summary>
        <div className="mt-2 space-y-2">{awaiting.map((r) => <FactRowEditor key={r.key} row={r} onDecide={onDecide} onReset={onReset} onPut={onPut} onEdit={onEdit} />)}</div></details>}
    </>}
    {requiredMissing.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Required and not verified yet: {requiredMissing.join(', ')} — these can wait for the client; the build leaves out whatever needs them.</p>}
  </Section>;
}

function PageFamiliesPanel({ manifest }: { manifest: WebsiteBuildState['manifest'] }) {
  const groups = pageFamilyGroups(manifest);
  return <Section title="Page families" right={<span className="text-xs text-muted-foreground">{manifest.pages.length} page(s)</span>}>
    <div className="grid gap-1 sm:grid-cols-2">{groups.map((g) => <details key={g.family} className="rounded border px-2 py-1 text-xs">
      <summary className="cursor-pointer"><b>{g.label}</b> — {g.count}</summary>
      <ul className="mt-1 max-h-64 space-y-0.5 overflow-auto">{manifest.pages.filter((p) => p.type === g.family).slice(0, 300).map((p) => { const href = safeUrl(p.url);
        return <li key={p.url} className="break-all">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{p.url}</a> : p.url}
          {p.status_code && p.status_code !== 200 ? <span className="ml-1 text-amber-700">[{p.status_code}]</span> : null}{p.title ? <span className="text-muted-foreground"> — {p.title}</span> : null}</li>; })}</ul>
    </details>)}</div>
  </Section>;
}

const IMAGE_TYPES = new Set(['logo', 'photo', 'icon', 'badge', 'brand_logo', 'favicon']);
function AssetInventory({ state, update }: { state: WebsiteBuildState; update: UpdateFn }) {
  const [filter, setFilter] = useState<'all' | AssetApproval>('all');
  const [thumbs, setThumbs] = useState(true);
  const [all, setAll] = useState(false);
  const assets = state.manifest.assets;
  const shown = assets.map((a, i) => ({ a, i })).filter(({ a }) => filter === 'all' || a.approval === filter);
  const visible = all ? shown : shown.slice(0, 60);
  const setApproval = (i: number, approval: AssetApproval) => update((s) => ({ ...s, manifest: { ...s.manifest, assets: s.manifest.assets.map((x, k) => (k === i ? { ...x, approval } : x)) } }));
  const n = (k: AssetApproval) => assets.filter((a) => a.approval === k).length;
  return <Section title="Asset inventory" right={<div className="flex flex-wrap gap-1 text-xs">{(['all', 'approved', 'pending', 'rejected'] as const).map((k) =>
    <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-2 py-0.5 ${filter === k ? 'border-primary bg-primary/10' : ''}`}>{k === 'all' ? `All ${assets.length}` : `${ASSET_APPROVAL_LABELS[k]} ${n(k)}`}</button>)}</div>}>
    <p className="text-xs text-muted-foreground">Recorded, not downloaded. Mark each <b>USE</b>, <b>REVIEW</b> or <b>IGNORE</b>; only USE assets reach the build prompts (downloaded locally then — never hotlinked). <button type="button" className="text-primary underline" onClick={() => setThumbs((t) => !t)}>{thumbs ? 'Hide thumbnails' : 'Show thumbnails'}</button></p>
    <div className="space-y-1">{visible.map(({ a, i }) => { const href = safeUrl(a.source_url);
      return <div key={a.source_url || i} className="flex flex-wrap items-center gap-2 rounded border p-1.5 text-xs">
        {thumbs && href && IMAGE_TYPES.has(a.type) ? <img src={href} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded bg-muted object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} /> : <span className="h-10 w-10 shrink-0 rounded bg-muted" />}
        <div className="min-w-0 flex-1">
          <p className="truncate">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{a.source_url}</a> : a.source_url}</p>
          <p className="truncate text-muted-foreground">{a.type}{a.purpose ? ` · ${a.purpose}` : ''}{a.page_url ? ` · on ${a.page_url.replace(/^https?:\/\/[^/]+/, '') || '/'}` : ''}{a.suggested_filename ? ` · → ${a.suggested_filename}` : ''}{a.ownership !== 'unknown' ? ` · ${a.ownership.replace('_', ' ')}` : ''}</p>
        </div>
        <select aria-label={`Status for ${a.source_url}`} className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={a.approval} onChange={(e) => setApproval(i, e.target.value as AssetApproval)}>
          {(['approved', 'pending', 'rejected'] as const).map((k) => <option key={k} value={k}>{ASSET_APPROVAL_LABELS[k]}</option>)}</select>
      </div>; })}</div>
    {shown.length > 60 && <button type="button" className="text-xs text-primary underline" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${shown.length}`}</button>}
  </Section>;
}

/* ══ PHASE 3 — TEMPLATE MAPPING / BUILD PREPARATION ════════════════════════════════════════════
   The mapping is DERIVED (templateMapping.ts computeMapping) from the ledger, the recon and Paul's
   decisions. Editing a value here writes the FACT LEDGER (approved by Paul) — one approval system;
   include / serve / page / slot choices go to website_build.mapping. */

const MAP_TONE: Record<string, string> = {
  ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  preselected: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  needs_approval: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  needs_review: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  missing: 'bg-muted text-muted-foreground', not_found: 'bg-muted text-muted-foreground',
  omitted: 'bg-muted text-muted-foreground', excluded: 'bg-muted text-muted-foreground',
};
/* F11 — the recon's towns as SERVICE-AREA CANDIDATES for the canonical Service areas fact. Found is
   never verified: Add proposes (list not verified), Approve adds to a verified list, Ignore = does not
   serve. Serving an area is wording only — no page is created here (serviceAreaCandidates.ts). */
const AREA_TONE: Record<AreaStatus, string> = { verified: 'ready', listed: 'needs_approval', base: 'preselected', ignored: 'omitted', candidate: 'needs_review' };
function ServiceAreaPanel({ state, rows, update }: { state: WebsiteBuildState; rows: FactRow[]; update: UpdateFn }) {
  const v = serviceAreaView(state, rows);
  const fact = rows.find((r) => r.key === 'service_areas');
  const open = v.candidates.filter((c) => c.status === 'candidate');
  const act = (names: string[], keys: string[]) => update((s) => {
    /* read the fact from the state being updated, not the rendered rows — two quick clicks must both land */
    const stored = s.facts.find((x) => x.key === 'service_areas');
    const current: FactRow | undefined = stored ? { ...(fact ?? { key: 'service_areas', label: 'Service areas', note: '', decided: true, required: false }), ...stored, decided: true } as FactRow : fact;
    const next = withAreas(current, names, current?.status === 'verified' ? 'approve' : 'add');
    if (!next) return s;
    return withServes({ ...s, facts: [...s.facts.filter((x) => x.key !== 'service_areas'), next] }, keys, undefined);
  });
  const ignore = (keys: string[], on: boolean) => update((s) => withServes(s, keys, on ? false : undefined));
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? v.candidates : v.candidates.filter((c) => c.status === 'candidate' || c.status === 'listed').slice(0, 40);
  return <Section title="Service areas — recon candidates" right={<span className="text-xs text-muted-foreground">{v.verified.length} verified · {v.listed.length} listed · {open.length} candidate(s)</span>}>
    <p className="text-xs text-muted-foreground">Towns the source-site recon found. <b>None is verified by being found.</b> {v.action === 'add'
      ? 'The Service areas list is not approved yet: Add puts a town in the proposed list, then approve the list in Client Build Facts.'
      : 'The Service areas list is verified: Approve adds one town to it (the towns already verified stay as they are).'} Serving an area is wording and schema only — dedicated town pages are planned separately in Architecture.</p>
    {v.verified.length > 0 && <p className="break-words text-xs"><span className="font-medium">Verified areas:</span> {v.verified.join(', ')}</p>}
    {v.listed.length > 0 && <p className="break-words text-xs"><span className="font-medium">In the list, needs approval:</span> {v.listed.join(', ')}</p>}
    {open.length > 1 && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => act(open.map((c) => c.name), open.map((c) => c.key))}>{v.action === 'add' ? `Add all ${open.length} candidates` : `Approve all ${open.length} candidates`}</Button></div>}
    <div className="space-y-1">{shown.map((c) => <div key={c.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b py-1.5 text-xs last:border-0">
      <span className="min-w-[110px] flex-1 font-medium">{c.name}</span><Chip tone={AREA_TONE[c.status]}>{AREA_STATUS_LABELS[c.status]}</Chip>
      {c.status === 'candidate' && <><Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => act([c.name], [c.key])}>{v.action === 'add' ? <><Plus className="mr-1 h-3 w-3" />Add</> : <><Check className="mr-1 h-3 w-3" />Approve</>}</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => ignore([c.key], true)}>Ignore</Button></>}
      {c.status === 'ignored' && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => ignore([c.key], false)}>Undo ignore</Button>}
      <span className="w-full break-words text-[11px] text-muted-foreground">{c.context || 'named on the source site'}{c.source_url ? ' · ' + c.source_url : ''}</span>
    </div>)}</div>
    {v.candidates.length > shown.length && <button type="button" className="text-xs text-primary underline" onClick={() => setShowAll(true)}>Show all {v.candidates.length} (verified, base and ignored too)</button>}
  </Section>;
}
const Chip = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${MAP_TONE[tone] ?? 'bg-muted'}`}>{children}</span>;
const REQ_LABEL: Record<string, string> = { required: 'Req', optional: 'Opt', conditional: 'Cond' };
const GROUPS: Array<{ id: string; label: string; groups: FieldGroup[] }> = [
  { id: 'business', label: 'Business', groups: ['identity', 'business'] },
  { id: 'proof', label: 'Proof', groups: ['proof'] },
  { id: 'pricing', label: 'Pricing', groups: ['commerce'] },
  { id: 'tracking', label: 'Tracking', groups: ['tracking'] },
];

function MappedFieldRow({ m, rows, onDecide, onEdit, set, update }: {
  m: MappedField; rows: FactRow[]; onDecide: (r: FactRow, s: StoredFactStatus, value?: string) => void; onEdit: (r: FactRow, value: string) => void; set: SetFn; update: UpdateFn;
}) {
  /* Only the PROJECT field (the domain) keeps a draft + Save button; a fact-backed field is saved as
     it is typed (needs approval) — the same rule as the fact list, so nothing is held only here (F13). */
  const [draft, setDraft] = useState<string | null>(null);
  const f = m.field;
  const isProject = 'project' in f.source;
  const value = isProject ? (draft ?? m.value) : m.value;
  const row: FactRow | undefined = m.factKey ? (rows.find((r) => r.key === m.factKey) ?? { key: m.factKey, label: f.label, value: '', status: 'missing', source: '', note: '', decided: false, required: false, source_url: '', notes: '', basis: '' }) : undefined;
  const save = () => {
    if ('project' in f.source) set('canonical_domain', value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
    else if (row) onDecide(row, 'verified', value);
    setDraft(null);
  };
  const tone = m.status === 'missing' && !m.required ? 'omitted' : m.status;
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b py-1.5 text-xs last:border-0">
    <div className="w-full min-w-0 sm:w-48"><span className="font-medium">{f.label}</span> <span className="text-[10px] text-muted-foreground">{m.required ? 'REQUIRED' : REQ_LABEL[f.requirement] === 'Cond' ? 'if needed' : 'optional'}</span></div>
    {'choice' in f.source
      ? <select aria-label={f.label} className="h-8 min-w-[140px] flex-1 rounded-md border border-input bg-background px-2 text-xs" value={m.value}
          onChange={(e) => update((s) => ({ ...s, mapping: { ...s.mapping, fields: { ...s.mapping.fields, [f.id]: e.target.value } } }))}>
          <option value="">Choose…</option>{f.source.choice.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      : <Input aria-label={f.label} className="h-8 min-w-[140px] flex-1 text-xs" value={value} placeholder={f.hint ?? 'Not found'} onChange={(e) => { if (isProject) setDraft(e.target.value); else if (row) onEdit(row, e.target.value); }} />}
    <Chip tone={tone}>{m.status === 'missing' && !m.required ? 'Omitted' : MAP_STATUS_LABELS[m.status]}</Chip>
    {isProject && draft !== null && draft !== m.value && <Button size="sm" className="h-7 px-2 text-xs" disabled={!draft.trim()} onClick={save}>Save</Button>}
    {!isProject && m.status === 'needs_approval' && row && m.value.trim() !== '' && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onDecide(row, 'verified', m.value)}><Check className="mr-1 h-3 w-3" />Approve</Button>}
    {m.source && <span className="w-full text-[11px] text-muted-foreground sm:w-auto">{m.source}</span>}
  </div>;
}

function groupCounts(ms: MappedField[]) {
  const ready = ms.filter((m) => m.status === 'ready').length;
  const appr = ms.filter((m) => m.status === 'needs_approval').length;
  const miss = ms.filter((m) => m.status === 'missing' && m.required).length;
  return { ready, appr, miss, line: [ready && `${ready} ready`, appr && `${appr} need approval`, miss && `${miss} missing`].filter(Boolean).join(' · ') || 'nothing mapped' };
}

function MappingPanel({ mapping, buildBlockers, state, update, set, rows, onDecide, onEdit, template, assetPrompt, onCopy }: {
  mapping: Mapping; buildBlockers: string[]; state: WebsiteBuildState; update: UpdateFn; set: SetFn; rows: FactRow[];
  onDecide: (r: FactRow, s: StoredFactStatus, value?: string) => void; onEdit: (r: FactRow, value: string) => void; template: ReturnType<typeof templateById>;
  assetPrompt: StagePrompt; onCopy: (p: StagePrompt) => void | Promise<void>;
}) {
  const r = mapping.readiness;
  const t = mapping.isTemplate ? template : null;
  const setMap = (fn: (m: WebsiteBuildState['mapping']) => WebsiteBuildState['mapping']) => update((s) => ({ ...s, mapping: fn(s.mapping) }));
  const useAssets = state.manifest.assets.filter((a) => a.approval === 'approved');
  const assign = (slot: string, url: string, multiple: boolean) => setMap((m) => ({ ...m, assets: { ...m.assets, [slot]: multiple ? [...new Set([...(m.assets[slot] ?? []), url])] : [url] } }));
  const unassign = (slot: string, url: string) => setMap((m) => { const left = (m.assets[slot] ?? []).filter((u) => u !== url); const next = { ...m.assets }; if (left.length) next[slot] = left; else delete next[slot]; return { ...m, assets: next }; });
  const svcCounts = { inc: mapping.services.filter((x) => x.include).length, rev: mapping.services.filter((x) => x.status === 'needs_review').length + mapping.unmapped.filter((x) => !x.byOperator).length };
  const townRev = mapping.towns.filter((x) => x.status === 'needs_review').length;
  const blockingHits = mapping.guard.hits.filter((h) => h.blocking);

  /* The badge and the blocker list are THE build blockers (executionBlockers) — never the mapping's
     own subset, so this card cannot say Ready while the build is blocked, or the reverse (F14). */
  const ready = buildBlockers.length === 0;
  return <Section title={t ? 'Template mapping' : 'Build preparation'} right={<span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${ready ? MAP_TONE.ready : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'}`}>{ready ? 'Ready to build' : 'Not ready to build'}</span>}>
    {t ? <p className="text-xs"><b>{t.name}</b> <span className="text-muted-foreground">v{t.version} · {t.trade}</span></p>
      : <p className="text-xs text-muted-foreground">{state.route === 'faithful_rebuild' ? 'Faithful rebuild' : 'Bespoke build'} — no template: the core business data and asset slots every Findable build needs.</p>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([['Ready', r.ready, 'ready'], ['Needs approval', r.needsApproval, 'needs_approval'], ['Missing required', r.missingRequired, r.missingRequired ? 'bad' : 'missing'], ['Optional missing', r.optionalMissing, 'missing']] as const).map(([l, n, tone]) =>
      <div key={l} className={`rounded border p-2 text-xs ${tone === 'bad' ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30' : ''}`}><div className="text-muted-foreground">{l}</div><div className="text-lg font-semibold">{n}</div></div>)}</div>
    {buildBlockers.length > 0 && <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"><p className="font-medium">Blocking the build:</p><ul className="mt-1 list-disc pl-4">{buildBlockers.map((b, n) => <li key={n} className="break-words">{b}</li>)}</ul></div>}
    {mapping.guard.skipped && <p className="text-xs text-muted-foreground">{mapping.guard.skipped}</p>}
    {blockingHits.length > 0 && <p className="text-xs text-red-700 dark:text-red-300">Seed-client value(s) found in the generated config: {blockingHits.map((h) => `"${h.value.value}"`).join(', ')} — fix the fact that carries it.</p>}
    {r.notes.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{r.notes.length} note(s) — optional items left out, warnings</summary><ul className="mt-1 list-disc pl-4 text-muted-foreground">{r.notes.map((x, n) => <li key={n} className="break-words">{x}</li>)}</ul></details>}

    {GROUPS.filter((g) => g.id !== 'tracking').map((g) => { const ms = mapping.fields.filter((m) => g.groups.includes(m.field.group)); if (!ms.length) return null; const c = groupCounts(ms);
      return <details key={g.id} className="rounded-md border px-2 py-1" open={c.appr > 0 || c.miss > 0}><summary className="cursor-pointer text-sm font-medium">{g.label} <span className="text-xs font-normal text-muted-foreground">— {c.line}</span></summary>
        <div className="mt-1">{ms.map((m) => <MappedFieldRow key={m.field.id} m={m} rows={rows} onDecide={onDecide} onEdit={onEdit} set={set} update={update} />)}</div></details>; })}

    {t && <details className="rounded-md border px-2 py-1" open={svcCounts.inc === 0 || svcCounts.rev > 0}><summary className="cursor-pointer text-sm font-medium">Services <span className="text-xs font-normal text-muted-foreground">— {svcCounts.inc} included{svcCounts.rev ? ` · ${svcCounts.rev} to review` : ''}</span></summary>
      <p className="mt-1 text-[11px] text-muted-foreground">The template's service catalogue, matched against the client's verified services and the services the source site names. Only ticked services are built. A service nobody names stays unticked unless you tick it.</p>
      <div className="mt-1">{mapping.services.map((x) => <label key={x.service.id} className="flex cursor-pointer flex-wrap items-center gap-2 border-b py-1.5 text-xs last:border-0">
        <input type="checkbox" aria-label={`Include ${x.service.name}`} checked={x.include} onChange={(e) => setMap((m) => ({ ...m, services: { ...m.services, [x.service.id]: e.target.checked } }))} />
        <span className="font-medium">{x.service.name}</span><Chip tone={x.status}>{SERVICE_STATUS_LABELS[x.status]}</Chip>
        {x.confidence !== 'none' && !x.decided && <span className="text-[10px] uppercase text-muted-foreground">{x.confidence} confidence</span>}
        <span className="w-full break-words text-[11px] text-muted-foreground sm:w-auto">{x.matches.length ? 'from ' + x.matches.map((mm) => `"${mm.candidate.name}" (${mm.candidate.origin === 'verified' ? 'verified' : 'source site'})`).join(', ') : 'not found on the site or in the facts'}</span>
      </label>)}</div>
      {mapping.unmapped.length > 0 && <div className="mt-2 space-y-1"><p className="text-xs font-medium">Source services that match nothing in the template ({mapping.unmapped.length})</p>
        {mapping.unmapped.map((u) => <div key={u.candidate.name} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 break-words">"{u.candidate.name}" <span className="text-muted-foreground">({u.candidate.origin === 'verified' ? 'verified' : u.candidate.context || 'source site'})</span></span>
          <select aria-label={`Map ${u.candidate.name}`} className="h-8 max-w-full rounded-md border border-input bg-background px-2 text-xs" value={state.mapping.candidate_map[u.candidate.name.toLowerCase()] ?? ''}
            onChange={(e) => setMap((m) => { const cm = { ...m.candidate_map }; if (e.target.value) cm[u.candidate.name.toLowerCase()] = e.target.value; else delete cm[u.candidate.name.toLowerCase()]; return { ...m, candidate_map: cm }; })}>
            <option value="">Needs review — map to…</option>{t.serviceCatalogue.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}<option value="ignore">Ignore (not offered)</option></select>
        </div>)}</div>}
    </details>}

    {t && <details className="rounded-md border px-2 py-1" open={townRev > 0}><summary className="cursor-pointer text-sm font-medium">Locations <span className="text-xs font-normal text-muted-foreground">— {mapping.towns.filter((x) => x.serves).length} served · {mapping.towns.filter((x) => x.page).length} dedicated page(s){townRev ? ` · ${townRev} to review` : ''}</span></summary>
      <p className="mt-1 text-[11px] text-muted-foreground"><b>Serves this area</b> is coverage (named in the service-area wording and schema). <b>Dedicated page</b> is a separate, genuinely local page — off unless you turn it on (no cloned town pages).</p>
      <div className="mt-1">{mapping.towns.length === 0 ? <p className="py-1 text-xs text-muted-foreground">No base location or areas yet.</p> : mapping.towns.map((x) => <div key={x.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-1.5 text-xs last:border-0">
        <span className="min-w-[120px] flex-1 font-medium">{x.name}{x.isBase && <span className="ml-1 text-[10px] font-normal uppercase text-muted-foreground">base</span>}</span>
        <label className="flex items-center gap-1"><input type="checkbox" aria-label={`Serves ${x.name}`} checked={x.serves} onChange={(e) => setMap((m) => ({ ...m, locations: { ...m.locations, [x.key]: { ...m.locations[x.key], serves: e.target.checked } } }))} />Serves this area</label>
        <label className={`flex items-center gap-1 ${x.serves ? '' : 'opacity-50'}`}><input type="checkbox" aria-label={`Dedicated page for ${x.name}`} disabled={!x.serves} checked={x.page} onChange={(e) => setMap((m) => ({ ...m, locations: { ...m.locations, [x.key]: { ...m.locations[x.key], page: e.target.checked } } }))} />Dedicated page</label>
        {x.status === 'needs_review' && <Chip tone="needs_review">Needs review</Chip>}
        <span className="w-full text-[11px] text-muted-foreground">{x.evidence}</span>
      </div>)}</div>
    </details>}

    <details className="rounded-md border px-2 py-1" open={mapping.slots.some((x) => x.slot.requirement === 'required' && !x.publishable.length)}><summary className="cursor-pointer text-sm font-medium">Assets <span className="text-xs font-normal text-muted-foreground">— {mapping.slots.filter((x) => x.publishable.length).length} of {mapping.slots.length} slot(s) filled</span></summary>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 flex-1">Only assets marked USE (Capture → Asset inventory) can be published. Suggestions come from each asset's type and purpose.</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!useAssets.length} onClick={() => setMap((m) => ({ ...m, assets: autoAssign(t ? t.assetSlots : CORE_BUILD_MODEL.assetSlots, state) }))}>Auto-assign suggestions</Button>
      </div>
      <div className="mt-1">{mapping.slots.map((st) => <div key={st.slot.id} className="border-b py-1.5 text-xs last:border-0">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{st.slot.label}</span><span className="text-[10px] text-muted-foreground">{st.slot.requirement === 'required' ? 'REQUIRED' : 'optional'}{st.slot.multiple ? ' · several' : ''}</span>
          {!st.publishable.length && <Chip tone={st.slot.requirement === 'required' ? 'needs_approval' : 'omitted'}>{st.slot.requirement === 'required' ? 'Missing' : 'Omitted'}</Chip>}
          <select aria-label={`Assign an asset to ${st.slot.label}`} className="h-7 max-w-full rounded-md border border-input bg-background px-1 text-[11px]" value="" onChange={(e) => e.target.value && assign(st.slot.id, e.target.value, st.slot.multiple)}>
            <option value="">Assign a USE asset…</option>{useAssets.filter((a) => !st.assigned.some((x) => x.source_url === a.source_url)).map((a) => <option key={a.source_url} value={a.source_url}>{a.suggested_filename || a.source_url.split('/').pop()}{a.purpose ? ' — ' + a.purpose.slice(0, 40) : ''}</option>)}</select>
        </div>
        {st.assigned.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{st.assigned.map((a) => <span key={a.source_url} className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 ${a.approval === 'approved' ? '' : 'border-amber-400 text-amber-800 dark:text-amber-200'}`}>
          <span className="truncate">{a.suggested_filename || a.source_url.split('/').pop()}</span>{a.approval !== 'approved' && <span className="text-[10px]">(not USE — held back)</span>}
          <button type="button" aria-label={`Unassign ${a.suggested_filename || a.source_url}`} className="text-muted-foreground hover:text-foreground" onClick={() => unassign(st.slot.id, a.source_url)}><X className="h-3 w-3" /></button></span>)}</div>}
        {st.suggestions.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]"><span className="text-muted-foreground">Suggested:</span>{st.suggestions.slice(0, st.slot.multiple ? 6 : 3).map((a) =>
          <button key={a.source_url} type="button" disabled={a.approval !== 'approved'} title={a.approval === 'approved' ? 'Assign' : 'Mark it USE in the asset inventory first'} onClick={() => assign(st.slot.id, a.source_url, st.slot.multiple)}
            className="max-w-full truncate rounded-full border px-2 py-0.5 hover:bg-muted disabled:opacity-50">+ {a.suggested_filename || a.source_url.split('/').pop()}{a.approval !== 'approved' ? ' (REVIEW)' : ''}</button>)}</div>}
      </div>)}</div>
      <div className="mt-2"><PromptCard p={assetPrompt} onCopy={onCopy} /></div>
    </details>

    {(() => { const g = GROUPS.find((x) => x.id === 'tracking')!; const ms = mapping.fields.filter((m) => g.groups.includes(m.field.group)); if (!ms.length) return null; const c = groupCounts(ms);
      return <details className="rounded-md border px-2 py-1" open={c.miss > 0}><summary className="cursor-pointer text-sm font-medium">Tracking <span className="text-xs font-normal text-muted-foreground">— {c.line}</span></summary>
        <div className="mt-1">{ms.map((m) => <MappedFieldRow key={m.field.id} m={m} rows={rows} onDecide={onDecide} onEdit={onEdit} set={set} update={update} />)}</div></details>; })()}

    <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">View generated config (read-only{mapping.omitted.length ? ` · ${mapping.omitted.length} item(s) left out` : ''})</summary>
      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono text-[11px]">{JSON.stringify(mapping.config, null, 2)}</pre>
      {mapping.omitted.length > 0 && <ul className="mt-1 list-disc pl-4 text-muted-foreground">{mapping.omitted.map((o, n) => <li key={n}>{o}</li>)}</ul>}
    </details>
  </Section>;
}

function UrlDecisionsPanel({ state }: { state: WebsiteBuildState }) {
  const d = urlDecisions(state);
  const [filter, setFilter] = useState<'all' | UrlDecision>('all');
  const [all, setAll] = useState(false);
  if (!d.rows.length) return null;
  const shown = d.rows.filter((r) => filter === 'all' || r.decision === filter);
  const visible = all ? shown : shown.slice(0, 60);
  const TONE: Record<UrlDecision, string> = { kept: 'ready', redirected: 'preselected', retired: 'omitted', unresolved: 'needs_review' };
  return <Section title="Old URL decisions" right={<div className="flex flex-wrap gap-1 text-xs">{(['all', 'unresolved', 'kept', 'redirected', 'retired'] as const).map((k) =>
    <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-2 py-0.5 ${filter === k ? 'border-primary bg-primary/10' : ''}`}>{k === 'all' ? `All ${d.rows.length}` : `${URL_DECISION_LABELS[k]} ${d.counts[k]}`}</button>)}</div>}>
    <p className="text-xs text-muted-foreground">Every old URL (recon + page plan) against the page plan and the redirect map. Read-only — decide in the page plan above or the redirect map; nothing is redirected automatically.</p>
    {d.issues.map((x, n) => <p key={n} className="flex items-start gap-2 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{x}</p>)}
    <div className="space-y-1">{visible.map((r) => <div key={r.url} className="rounded border px-2 py-1 text-xs">
      <div className="flex flex-wrap items-center gap-2"><Chip tone={TONE[r.decision]}>{URL_DECISION_LABELS[r.decision]}</Chip><span className="min-w-0 flex-1 break-all">{r.path}</span><span className="text-[11px] text-muted-foreground">{PAGE_FAMILY_LABELS[r.family]}</span></div>
      {r.target && r.decision !== 'kept' && <p className="break-all text-[11px] text-muted-foreground">→ {r.target}</p>}
      {r.flags.map((fl, n) => <p key={n} className="text-[11px] text-amber-700 dark:text-amber-300">⚠ {fl}</p>)}
    </div>)}</div>
    {shown.length > 60 && <button type="button" className="text-xs text-primary underline" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${shown.length}`}</button>}
  </Section>;
}

/* ══ PHASE 4 — BUILD EXECUTION + PREVIEW ═══════════════════════════════════════════════════════
   Ready to Build → Copy Build Execution Prompt → Claude Code → Import Build Result → Open Preview.
   The status is DERIVED (buildExecutionStatus); an imported result is checked and summarised before
   it is merged (applyBuildResult), and a conflicting project value is only replaced if Paul ticks it. */

const EXEC_TONE: Record<BuildExecStatus, string> = {
  not_started: 'bg-muted text-muted-foreground', prompt_ready: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  building: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100', result_ready: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  needs_attention: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100', preview_ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};
const QaChips = ({ qa }: { qa: BuildExecution['qa'] }) => <div className="flex flex-wrap gap-1">{BUILD_QA_KEYS.map((k) =>
  <span key={k} className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${qa[k] === true ? MAP_TONE.ready : qa[k] === false ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' : 'bg-muted text-muted-foreground'}`}>{BUILD_QA_LABELS[k]} {qa[k] === true ? '✓' : qa[k] === false ? '✗' : '?'}</span>)}</div>;
const ExtLink = ({ url, children }: { url: string; children: ReactNode }) => { const h = safeUrl(url); return h ? <a href={h} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{children}</a> : <span className="text-muted-foreground">—</span>; };

function BuildExecutionPanel({ state, update, mapping, input, execPrompt, onCopy, toast }: {
  state: WebsiteBuildState; update: UpdateFn; mapping: Mapping; input: BuildPackInput; execPrompt: StagePrompt;
  onCopy: (p: StagePrompt) => void | Promise<void>; toast: ReturnType<typeof useToast>['toast'];
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<BuildResultParse | null>(null);
  const [accept, setAccept] = useState(false);
  const b = state.build_execution;
  const blocked = execPrompt.blockedBy.length > 0;
  const status = buildExecutionStatus(state, !blocked);
  const gate = previewGateProblems(b);
  const urls = urlDecisions(state);
  const cov = builtCoverage(state);
  const retry = retryPrompt(input);
  const changed = !!b.config_version && b.config_version !== configVersion(mapping);
  const t = mapping.isTemplate ? input.template : null;
  const res = parsed && 'result' in parsed ? parsed : null;
  const conflicts = res ? projectConflicts(state, res.result) : [];
  const doImport = () => {
    if (!res) return;
    const out = applyBuildResult(state, res.result, { now: new Date().toISOString(), acceptConflicts: accept });
    update(() => out.state);
    setText(''); setParsed(null); setImportOpen(false); setAccept(false);
    toast({ title: 'Build result imported', description: `${res.result.status.replace('_', ' ')} · ${res.result.build.pages.length} page(s)${out.conflicts.length && !accept ? ` · kept ${out.conflicts.length} of your project value(s)` : ''}.` });
  };
  const row = (label: string, value: ReactNode) => <div className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>;
  const retryCard: StagePrompt = { id: 'build_execution', label: 'Copy Retry Prompt', short: 'Retry', stage: 'build_pack', blockedBy: retry.blockedBy, help: 'Only the failure, the current config and the fix — the site is not rebuilt from scratch.', text: retry.text };

  return <Section title="Build website" right={<span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${EXEC_TONE[status]}`}>{BUILD_EXEC_STATUS_LABELS[status]}</span>}>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
      {row('Route', state.route ? BUILD_ROUTE_LABELS[state.route] : '—')}
      {row('Template', t ? `${t.name} v${t.version}` : '—')}
      {row('Business', input.businessName || '—')}
      {row('Target domain', state.canonical_domain || '—')}
      {t ? row('Services selected', `${mapping.config.services.length}${mapping.config.services.length ? ' — ' + mapping.config.services.map((x) => x.name).join(', ') : ''}`) : row('Pages planned', String(state.pages.filter((p) => p.action === 'keep' || p.action === 'create').length))}
      {t ? row('Location pages', ((mapping.config.locations.pages as string[]) ?? []).join(', ') || 'none') : row('Old URLs', String(urls.rows.length))}
      {row('Assets assigned', `${mapping.slots.reduce((n, st) => n + st.publishable.length, 0)} USE${t && mapping.config.brand.mark === 'text_wordmark' ? ' · text wordmark' : ''}`)}
      {row('Redirect decisions', `${urls.counts.kept} kept · ${urls.counts.redirected} redirected · ${urls.counts.retired} retired · ${urls.counts.unresolved} unresolved`)}
    </dl>
    {blocked ? <div className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100"><p className="font-medium">Not ready to build — no build prompt until these are fixed:</p><ul className="mt-1 list-disc pl-4">{execPrompt.blockedBy.map((x, n) => <li key={n} className="break-words">{x}</li>)}</ul></div>
      : <p className="text-xs text-muted-foreground">Copy the prompt, run it in Claude Code, then paste Claude's final JSON with Import Build Result.</p>}
    {changed && <p className="text-xs text-amber-700 dark:text-amber-300">The client config has changed since the build prompt was copied — copy it again before the next run.</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="h-auto min-h-9 max-w-full whitespace-normal" disabled={blocked} onClick={() => void onCopy(execPrompt)}><Clipboard className="mr-1 h-4 w-4 shrink-0" />Copy Build Execution Prompt</Button>
      <Button size="sm" variant={importOpen ? 'secondary' : 'outline'} onClick={() => { setImportOpen((o) => !o); setParsed(null); }}>Import Build Result</Button>
      <Button size="sm" variant="ghost" onClick={() => setShowPrompt((o) => !o)}>{showPrompt ? 'Hide prompt' : 'Show prompt'}</Button>
    </div>
    {showPrompt && <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded bg-muted p-3 font-mono text-[11px] leading-relaxed">{execPrompt.text}</pre>}

    {importOpen && <div className="min-w-0 space-y-2 rounded-md border p-3">
      <Label className="text-xs">Paste Claude's build result — the whole reply, or just the JSON</Label>
      <Textarea aria-label="Build result" rows={6} className="font-mono text-xs" value={text} placeholder={'…Claude’s report…\n```json\n{ "buildResultVersion": 1, "status": "preview_ready", … }\n```'} onChange={(e) => { setText(e.target.value); setParsed(null); }} />
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!text.trim()} onClick={() => setParsed(parseBuildResult(text))}>Check</Button><Button size="sm" variant="ghost" onClick={() => { setImportOpen(false); setText(''); setParsed(null); }}>Cancel</Button></div>
      {parsed && 'error' in parsed && <div role="alert" className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{parsed.error}</span></div>}
      {res && <div className="space-y-2 rounded bg-muted p-3 text-xs">
        <p className="font-medium">Ready to import — status <b>{res.result.status.replace('_', ' ').toUpperCase()}</b></p>
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {row('Repository', <ExtLink url={res.result.repository.url}>{res.result.repository.url || '—'}</ExtLink>)}
          {row('Commit', res.result.repository.commitHash || '—')}
          {row('Pages built', String(res.result.build.pages.length))}
          {row('Services', res.result.build.services.join(', ') || '—')}
          {row('Locations', res.result.build.locations.join(', ') || '—')}
          {row('Redirects', `${res.result.redirects.kept ?? '?'} kept · ${res.result.redirects.redirected ?? '?'} redirected · ${res.result.redirects.retired ?? '?'} retired · ${res.result.redirects.unresolved.length} unresolved`)}
          {row('Cloudflare preview', <><ExtLink url={res.result.cloudflare.previewUrl}>{res.result.cloudflare.previewUrl || '—'}</ExtLink>{res.result.cloudflare.previewUrl && <span className="ml-1">· noindex {res.result.cloudflare.noindexConfirmed === true ? 'confirmed' : 'NOT confirmed'}</span>}</>)}
          {row('QA', <QaChips qa={res.result.qa} />)}
        </dl>
        {res.result.seedHits.length > 0 && <p className="text-red-700 dark:text-red-300"><b>Seed-client values found:</b> {res.result.seedHits.join(', ')} — this cannot be preview ready.</p>}
        {res.result.errors.length > 0 && <div className="text-red-700 dark:text-red-300"><b>Errors ({res.result.errors.length}):</b><ul className="list-disc pl-4">{res.result.errors.slice(0, 10).map((e, n) => <li key={n} className="break-words">{e}</li>)}</ul></div>}
        {res.result.warnings.length > 0 && <details><summary className="cursor-pointer">Warnings ({res.result.warnings.length})</summary><ul className="list-disc pl-4">{res.result.warnings.map((w, n) => <li key={n} className="break-words">{w}</li>)}</ul></details>}
        {[...res.summary.dropped, ...res.summary.notes].map((d, n) => <p key={n} className="text-amber-800 dark:text-amber-200">{d}</p>)}
        {res.summary.ignoredKeys.length > 0 && <p className="text-amber-800 dark:text-amber-200">Fields LeadFinderOS does not store: {res.summary.ignoredKeys.join(', ')}</p>}
        {conflicts.length > 0 && <div className="rounded border border-amber-400 p-2"><p className="font-medium">The build reported different project values:</p>
          <ul className="list-disc pl-4">{conflicts.map((c) => <li key={c.field} className="break-words">{c.label}: yours "{c.current}" — build "{c.imported}"</li>)}</ul>
          <label className="mt-1 flex items-center gap-2"><input type="checkbox" aria-label="Replace my project values with the imported ones" checked={accept} onChange={(e) => setAccept(e.target.checked)} />Replace my values with the imported ones (otherwise yours are kept)</label></div>}
        <p className="text-muted-foreground">Import updates the project, preview and build record only — facts, mapping, route, page plan, redirects and QA ticks stay as they are.{res.result.status === 'failed' ? ' A failed build keeps the previous preview and commit.' : ''}</p>
        <div className="flex gap-2"><Button size="sm" onClick={doImport}>Import</Button><Button size="sm" variant="ghost" onClick={() => setParsed(null)}>Cancel</Button></div>
      </div>}
    </div>}

    {b.result_imported_at && <div className="space-y-2 rounded-md border p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Last build</span><span className="text-muted-foreground">{new Date(b.result_imported_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span><QaChips qa={b.qa} /></div>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
        {row('Preview', <ExtLink url={b.preview_url}>{b.preview_url || '—'}</ExtLink>)}
        {row('Repository', <ExtLink url={b.repository_url}>{b.repository_url || '—'}</ExtLink>)}
        {row('Commit', b.commit_hash || '—')}
      </dl>
      {status === 'failed' && b.previous && <p className="text-muted-foreground">Previous good build kept: {b.previous.commit_hash || '—'}{b.previous.preview_url ? ' · ' + b.previous.preview_url : ''}</p>}
      {gate.length > 0 && <p className="text-amber-700 dark:text-amber-300">Not preview ready: {gate.join(' · ')}</p>}
      {b.errors.length > 0 && <ul className="list-disc pl-4 text-red-700 dark:text-red-300">{b.errors.map((e, n) => <li key={n} className="break-words">{e}</li>)}</ul>}
      {(status === 'failed' || status === 'needs_attention') && <PromptCard p={retryCard} onCopy={onCopy} />}
      {cov.assessed && <details><summary className="cursor-pointer">Old URL coverage on the REAL build — {cov.counts.kept} kept · {cov.counts.redirected} redirected · {cov.counts.retired} retired · {cov.counts.unresolved} unresolved</summary>
        <div className="mt-1 space-y-1">{cov.rows.filter((r) => r.flags.length).slice(0, 80).map((r) => <p key={r.path} className="break-all"><b>{r.path}</b> <span className="text-muted-foreground">({r.decision}{r.target ? ' → ' + r.target : ''})</span> — <span className="text-amber-700 dark:text-amber-300">{r.flags.join('; ')}</span></p>)}
          {!cov.rows.some((r) => r.flags.length) && <p className="text-muted-foreground">Every source URL is kept or redirected to a built page.</p>}</div></details>}
      <details><summary className="cursor-pointer text-muted-foreground">Build details</summary>
        <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-3">
          {row('Branch', b.branch || '—')}{row('Deployment', `${b.deployment_id || '—'}${b.deployment_status ? ' · ' + b.deployment_status : ''}`)}{row('Noindex', b.noindex_confirmed === true ? 'confirmed' : b.noindex_confirmed === false ? 'NOT confirmed' : 'not reported')}
          {row('Output', b.output_dir || '—')}{row('Local folder', b.local_path || '—')}{row('Cloudflare project', b.cloudflare_project || '—')}
        </dl>
        {b.pages.length > 0 && <p className="mt-1 break-words text-muted-foreground">Pages: {b.pages.join('  ')}</p>}
        {b.warnings.length > 0 && <ul className="mt-1 list-disc pl-4 text-muted-foreground">{b.warnings.map((w, n) => <li key={n} className="break-words">{w}</li>)}</ul>}
      </details>
    </div>}
  </Section>;
}

function PreviewResultPanel({ state, input, existingSiteUrl, prompts, onCopy }: {
  state: WebsiteBuildState; input: BuildPackInput; existingSiteUrl: string; prompts: StagePrompt[]; onCopy: (p: StagePrompt) => void | Promise<void>;
}) {
  const b = state.build_execution;
  if (!b.result_imported_at) return null;
  const status = buildExecutionStatus(state, true);
  const gate = previewGateProblems(b);
  const rv = reviewPrompt(input);
  const next: StagePrompt = state.route === 'faithful_rebuild' ? prompts.find((p) => p.id === 'visual_compare')!
    : { id: 'visual_compare', label: rv.kind === 'template' ? 'Copy Template Review Prompt' : 'Copy Design Review Prompt', short: 'Review', stage: 'preview', blockedBy: rv.blockedBy,
        help: rv.kind === 'template' ? 'Checks the deployed preview for the right client, services, locations, proof, images, no template leftovers and quality — no redesign for taste.' : 'Checks the deployed preview against the design references and the approved content.', text: rv.text };
  return <Section title="Build preview" right={<span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${EXEC_TONE[status]}`}>{BUILD_EXEC_STATUS_LABELS[status]}</span>}>
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded border p-2 text-xs"><p className="font-medium">Source site</p>{existingSiteUrl ? <ExtLink url={existingSiteUrl}>Open {existingSiteUrl}</ExtLink> : <p className="text-muted-foreground">No existing site</p>}</div>
      <div className="rounded border p-2 text-xs"><p className="font-medium">New preview</p><ExtLink url={b.preview_url}>{b.preview_url ? 'Open ' + b.preview_url : '—'}</ExtLink>{b.noindex_confirmed === true && <span className="ml-1 text-muted-foreground">· noindex</span>}</div>
    </div>
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
      <div className="min-w-0"><dt className="text-muted-foreground">Repository</dt><dd className="break-all"><ExtLink url={b.repository_url}>{b.repository_url || '—'}</ExtLink></dd></div>
      <div><dt className="text-muted-foreground">Commit</dt><dd>{b.commit_hash || '—'}</dd></div>
      <div><dt className="text-muted-foreground">Deployment</dt><dd className="break-all">{b.deployment_id || '—'}{b.deployment_status ? ' · ' + b.deployment_status : ''}</dd></div>
    </dl>
    <QaChips qa={b.qa} />
    {gate.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Not preview ready: {gate.join(' · ')} — fix it from Build Pack (Copy Retry Prompt).</p>}
    {status === 'preview_ready' && <PromptCard p={next} onCopy={onCopy} />}
  </Section>;
}

function VisualComparison({ state, update, existingSiteUrl, prompt, onCopy, toast }: {
  state: WebsiteBuildState; update: UpdateFn; existingSiteUrl: string; prompt: StagePrompt; onCopy: (p: StagePrompt) => void; toast: ReturnType<typeof useToast>['toast'];
}) {
  const v = state.visual;
  const [widthText, setWidthText] = useState(v.widths.join(', '));
  const [reply, setReply] = useState('');
  const setV = (over: Partial<WebsiteBuildState['visual']>) => update((s) => ({ ...s, visual: { ...s.visual, ...over } }));
  const fams = compareFamilies(state);
  const result = (f: (typeof fams)[number]) => v.results.find((r) => r.family === f) ?? { family: f, status: 'not_checked' as CompareStatus, notes: '' };
  const putResult = (f: (typeof fams)[number], over: Partial<{ status: CompareStatus; notes: string }>) =>
    setV({ results: [...v.results.filter((r) => r.family !== f), { ...result(f), ...over }] });
  const approved = fams.filter((f) => result(f).status === 'approved').length;
  return <Section title="Visual comparison — source vs preview" right={<span className="text-xs text-muted-foreground">{approved} of {fams.length} page families approved</span>}>
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Source URL" value={v.source_url} placeholder={existingSiteUrl || 'https://…'} onChange={(x) => setV({ source_url: x.trim() })} />
      <Field label="Preview URL" value={v.preview_url} placeholder={state.preview_url || 'https://preview.….pages.dev'} onChange={(x) => setV({ preview_url: x.trim() })} />
      <div><Label className="text-xs">Viewport widths (px)</Label><Input aria-label="Viewport widths" className="h-8 text-xs" value={widthText} onChange={(e) => setWidthText(e.target.value)}
        onBlur={() => { const w = widthText.split(/[^0-9]+/).map(Number).filter((n) => n >= 240 && n <= 3840); const next = w.length ? [...new Set(w)].slice(0, 8) : [...DEFAULT_COMPARE_WIDTHS]; setV({ widths: next }); setWidthText(next.join(', ')); }} /></div>
    </div>
    <PromptCard p={prompt} onCopy={onCopy} />
    {fams.length === 0 ? <p className="text-xs text-muted-foreground">No page families yet — they come from the pages being kept or created in Architecture (or the manifest).</p> :
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 pr-2">Page family</th><th className="py-1 pr-2">Result</th><th className="py-1">Notes</th></tr></thead>
        <tbody>{fams.map((f) => { const r = result(f); return <tr key={f} className="border-b align-top">
          <td className="py-1 pr-2 font-medium">{PAGE_FAMILY_LABELS[f]}</td>
          <td className="py-1 pr-2"><select aria-label={`Comparison result for ${PAGE_FAMILY_LABELS[f]}`} className={sel} value={r.status} onChange={(e) => putResult(f, { status: e.target.value as CompareStatus })}>{COMPARE_STATUSES.map((c) => <option key={c} value={c}>{COMPARE_STATUS_LABELS[c]}</option>)}</select></td>
          <td className="py-1"><Input aria-label={`Comparison notes for ${PAGE_FAMILY_LABELS[f]}`} className="h-8 text-xs" value={r.notes} onChange={(e) => putResult(f, { notes: e.target.value })} /></td></tr>; })}</tbody></table></div>}
    <div className="flex flex-wrap items-end gap-2">
      <Textarea rows={2} className="min-w-[240px] flex-1 font-mono text-xs" value={reply} placeholder={'Paste Claude\u2019s reply lines:\nhomepage: approved\nservice: differences — card spacing'} onChange={(e) => setReply(e.target.value)} />
      <Button size="sm" variant="outline" disabled={!reply.trim()} onClick={() => { const next = parseCompareReply(reply, v.results); setV({ results: next }); setReply(''); toast({ title: 'Comparison results recorded' }); }}>Record results</Button>
    </div>
    <p className="text-xs text-muted-foreground">No automatic image comparison runs — Claude screenshots and compares; you record the result here.</p>
  </Section>;
}

function PromotionPanel({ state, update }: { state: WebsiteBuildState; update: UpdateFn }) {
  const p = state.promotion;
  const setP = (over: Partial<WebsiteBuildState['promotion']>) => update((s) => ({ ...s, promotion: { ...s.promotion, ...over } }));
  return <Section title="Promote to template (later)">
    <p className="text-xs text-muted-foreground">A successful bespoke / new-trade build can become a reusable trade template: client-specific values removed, the structure saved to the Template Library. Template extraction is not built yet — record the intent here so it is ready when it is.</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="Template candidate" checked={p.candidate} onChange={(e) => setP({ candidate: e.target.checked })} />This build is a template candidate</label>
    {p.candidate && <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Proposed template name" value={p.proposed_name} placeholder="e.g. Findable Shoe Repair Template" onChange={(v) => setP({ proposed_name: v })} />
      <Field label="Trade it would serve" value={p.proposed_trade} placeholder="e.g. Cobblers / key cutting" onChange={(v) => setP({ proposed_trade: v })} />
      <div className="sm:col-span-2"><Label className="text-xs">Notes (what is reusable, what is client-specific)</Label><Textarea rows={2} className="text-xs" value={p.notes} onChange={(e) => setP({ notes: e.target.value })} /></div>
    </div>}
    <Button size="sm" variant="outline" disabled title="Template extraction is a later piece of work">Promote to template — coming later</Button>
  </Section>;
}

/** ONE fact row — Approve / Reject / N/A / Edit / Source & notes. The same control everywhere a fact
 *  is decided (Client Build Facts and the recon's Needs Review), so there is one approval system. */
function FactRowEditor({ row: r, onDecide, onReset, onPut, onEdit, detail }: {
  row: FactRow; onDecide: (r: FactRow, s: StoredFactStatus, value?: string) => void; onReset: (key: string) => void;
  onPut: (f: BuildFact) => void; onEdit: (r: FactRow, value: string) => void; detail?: string;
}) {
  /* ⛔ NO LOCAL DRAFT. The input shows the STORED value and every keystroke is saved (as needs
     approval), so Saved means the edit is on the server and Approve approves exactly what is shown
     (BS4 pilot F13). `before` only remembers what the row was, so Undo can put it back. */
  const [before, setBefore] = useState<{ fact: BuildFact | null } | null>(null);
  const [open, setOpen] = useState(false);
  const value = r.value; const changed = before !== null;
  const edit = (v: string) => { if (!before) setBefore({ fact: r.decided ? storedFact(r) : null }); onEdit(r, v); };
  const undo = () => { if (!before) return; if (before.fact) onPut(before.fact); else onReset(r.key); setBefore(null); };
  const commit = (status: StoredFactStatus) => { onDecide(r, status, value); setBefore(null); };
  return <div className="rounded-md border p-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium">{r.label}{r.required && <span className="text-destructive"> *</span>}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${FACT_TONE[r.status]}`}>{FACT_STATUS_LABELS[r.status]}</span>
      {r.source && <span className="text-[11px] text-muted-foreground">from {r.source}</span>}
      {r.source_url && <span className="max-w-[240px] truncate text-[11px] text-muted-foreground">· {r.source_url}</span>}
      {r.notes && <span className="text-[11px] text-muted-foreground">· note</span>}
    </div>
    {detail && <p className="mt-1 break-words text-[11px] text-amber-700 dark:text-amber-300">{detail}</p>}
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Input aria-label={`Value for ${r.label}`} className="h-8 min-w-[180px] flex-1 text-xs" value={value} placeholder="No value — type one only if the client has confirmed it" onChange={(e) => edit(e.target.value)} />
      <Button size="sm" variant={r.status === 'verified' && !changed ? 'secondary' : 'default'} disabled={!value.trim() || (r.status === 'verified' && !changed)} onClick={() => commit('verified')}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button>
      <Button size="sm" variant="outline" disabled={r.status === 'rejected' && !changed} onClick={() => commit('rejected')}><X className="mr-1 h-3.5 w-3.5" />Reject</Button>
      <Button size="sm" variant="outline" disabled={r.status === 'not_applicable'} onClick={() => commit('not_applicable')}>N/A</Button>
      <Button size="sm" variant="ghost" aria-label={`Source and notes for ${r.label}`} onClick={() => setOpen((o) => !o)}>{open ? 'Hide source' : 'Source / notes'}</Button>
      {changed && <Button size="sm" variant="ghost" onClick={undo}>Undo edit</Button>}
      {changed && r.status === 'detected' && <span className="text-[11px] text-amber-700 dark:text-amber-300">Edited — saved as needs approval</span>}
      {r.decided && !changed && <Button size="sm" variant="ghost" onClick={() => onReset(r.key)} title="Forget your decision and go back to what the records say">Reset</Button>}
    </div>
    {open && <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <Field label="Source URL / context" value={r.source_url} placeholder="https://… or 'phone call 24 Sep'" onChange={(v) => onPut(annotate(r, { source_url: v }))} />
      <div><Label className="text-xs">Notes (never published)</Label><Textarea aria-label="Notes (never published)" rows={2} className="text-xs" value={r.notes} placeholder="e.g. client confirmed on the call" onChange={(e) => onPut(annotate(r, { notes: e.target.value }))} /></div>
    </div>}
    {r.note && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{r.note}</p>}
  </div>;
}

function FactsSection({ rows, template, onDecide, onReset, onPut, onEdit, onPaste }: {
  rows: FactRow[]; template: ReturnType<typeof templateById>;
  onDecide: (r: FactRow, s: StoredFactStatus, value?: string) => void; onReset: (key: string) => void;
  onPut: (f: BuildFact) => void; onEdit: (r: FactRow, value: string) => void; onPaste: (text: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'detected' | 'missing' | 'verified'>('all');
  /* Editing a verified row makes it needs-approval, which would re-sort it (or drop it out of the
     Verified filter) mid-keystroke. Rows keep the order they first appeared in, and a row edited in
     this visit stays in whatever filter is open. */
  const order = useRef(new Map<string, number>());
  const touched = useRef(new Set<string>());
  for (const r of rows) if (!order.current.has(r.key)) order.current.set(r.key, order.current.size);
  const editTracked = (r: FactRow, v: string) => { touched.current.add(r.key); onEdit(r, v); };
  const [newLabel, setNewLabel] = useState(''); const [newValue, setNewValue] = useState('');
  const [paste, setPaste] = useState(''); const [pasteOpen, setPasteOpen] = useState(false);
  const s = factsSummary(rows);
  const shown = rows.filter((r) => filter === 'all' || r.status === filter || touched.current.has(r.key))
    .sort((a, b) => order.current.get(a.key)! - order.current.get(b.key)!);
  return <Section title="Client Build Facts" right={<div className="flex flex-wrap gap-1 text-xs">{(['all', 'detected', 'missing', 'verified'] as const).map((f) =>
    <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-2 py-0.5 ${filter === f ? 'border-primary bg-primary/10' : ''}`}>{f === 'all' ? `All ${rows.length}` : f === 'detected' ? `Need approval ${s.awaiting}` : f === 'missing' ? `Missing ${s.missing}` : `Verified ${s.verified}`}</button>)}</div>}>
    <p className="rounded bg-muted p-2 text-xs"><b>Verified facts may be used. Unverified facts must not be published.</b> Preloaded from onboarding, the client record, the baseline and the stored crawl — nothing was fetched. Edit a value, then Approve it. Prompts never present a "Needs approval" value as confirmed.</p>
    {s.requiredMissing.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Required for {template ? 'the template' : 'any build'} and not verified yet (marked *): {s.requiredMissing.join(', ')}</p>}
    <div className="space-y-2">{shown.map((r) => <FactRowEditor key={r.key} row={r} onDecide={onDecide} onReset={onReset} onPut={onPut} onEdit={editTracked} />)}
      {shown.length === 0 && <p className="text-xs text-muted-foreground">Nothing in this filter.</p>}</div>
    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
      <div className="min-w-[160px]"><Label className="text-xs">Add a fact the client confirmed</Label><Input className="h-8 text-xs" value={newLabel} placeholder="e.g. Gas Safe number" onChange={(e) => setNewLabel(e.target.value)} /></div>
      <div className="min-w-[200px] flex-1"><Label className="text-xs">Value</Label><Input className="h-8 text-xs" value={newValue} placeholder="e.g. 123456" onChange={(e) => setNewValue(e.target.value)} /></div>
      <Button size="sm" disabled={!newLabel.trim() || !newValue.trim()} onClick={() => {
        const spec = template?.facts.find((f) => f.label.toLowerCase() === newLabel.trim().toLowerCase());
        onPut({ key: spec?.key ?? ('custom_' + newLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).slice(0, 80), label: spec?.label ?? newLabel.trim(), value: newValue.trim(), status: 'verified', source: 'added by Paul', source_url: '', notes: '', basis: 'operator' });
        setNewLabel(''); setNewValue('');
      }}><Plus className="mr-1 h-3.5 w-3.5" />Add as verified</Button>
      <Button size="sm" variant="outline" onClick={() => setPasteOpen((o) => !o)}>Paste facts from capture</Button>
    </div>
    {pasteOpen && <div className="space-y-2"><Textarea rows={5} className="font-mono text-xs" value={paste} placeholder={'One per line, "Label: value"\nServices: Boiler repair, Boiler servicing\nOwner / person customers deal with: Steve'} onChange={(e) => setPaste(e.target.value)} />
      <Button size="sm" disabled={!paste.trim()} onClick={() => { onPaste(paste); setPaste(''); setPasteOpen(false); }}>Add as "needs approval"</Button></div>}
  </Section>;
}

function ArchitectureSection({ state, template, rows, issues, checkedPages, cited, update, goStep, toast, leadId }: {
  state: WebsiteBuildState; template: ReturnType<typeof templateById>; rows: FactRow[];
  issues: ReturnType<typeof checkArchitecture>; checkedPages: Array<{ url: string; kind?: string }>; cited: Array<{ url: string; questions: string[] }>;
  update: UpdateFn; goStep: (s: Stage) => void;
  toast: ReturnType<typeof useToast>['toast']; leadId: string;
}) {
  const [redirectText, setRedirectText] = useState(() => redirectsToText(state.redirects));
  const [pageText, setPageText] = useState(''); const [pasteOpen, setPasteOpen] = useState(false);
  const setPages = (fn: (p: ArchPage[]) => ArchPage[]) => update((s) => ({ ...s, pages: fn(s.pages) }));
  const patch = (id: string, over: Partial<ArchPage>) => setPages((ps) => ps.map((p) => p.id === id ? { ...p, ...over } : p));
  const addPages = (add: ArchPage[], what: string) => { setPages((ps) => [...ps, ...add]); toast({ title: `${add.length} page(s) added`, description: what }); };
  const applyRedirects = (text: string) => { setRedirectText(text); update((s) => ({ ...s, redirects: parseRedirectText(text) })); };
  const errors = issues.filter((i) => i.level === 'error'); const warnings = issues.filter((i) => i.level === 'warning');
  const counts = PAGE_ACTIONS.map((a) => [a, state.pages.filter((p) => p.action === a).length] as const).filter(([, n]) => n > 0);
  const manifestPages = state.manifest.pages;

  return <>
    <Section title="Page architecture" right={<span className="text-xs text-muted-foreground">{state.pages.length} page(s){counts.length ? ' · ' + counts.map(([a, n]) => `${n} ${PAGE_ACTION_LABELS[a].toLowerCase().replace('…', '')}`).join(' · ') : ''}</span>}>
      <p className="text-xs text-muted-foreground">One primary page per important intent. For every old page or intent choose keep, create, consolidate, redirect or remove. Location pages only where there is genuinely local content — never cloned town pages.{cited.length > 0 ? ' Start with the URLs AI engines cited — they are the old pages most worth keeping or redirecting carefully.' : ''}</p>
      <div className="flex flex-wrap gap-2">
        {template && <Button size="sm" variant="outline" onClick={() => addPages(seedFromTemplate(template, rows).filter((n) => !state.pages.some((p) => p.path && p.path === n.path)), 'From the template, for verified services only.')}>Add template pages (verified services only)</Button>}
        {cited.length > 0 && <Button size="sm" variant="outline" onClick={() => addPages(seedFromCited(cited, state.pages), 'Old URLs AI engines cited in the baseline — decide each one.')}>Add URLs AI engines cited ({cited.length})</Button>}
        {checkedPages.length > 0 && <Button size="sm" variant="outline" onClick={() => addPages(seedFromCrawl(checkedPages, state.pages), 'Old URLs from the stored crawl — decide each one.')}>Add old URLs from stored crawl ({checkedPages.length})</Button>}
        {manifestPages.length > 0 && <Button size="sm" variant="outline" onClick={() => addPages(seedFromCrawl(manifestPages.map((p) => ({ url: p.url, kind: p.type })), state.pages).slice(0, Math.max(0, MAX_PAGES - state.pages.length)), 'Pages from the source site manifest — decide each one.')}>Add pages from manifest ({manifestPages.length})</Button>}
        <Button size="sm" variant="outline" onClick={() => setPasteOpen((o) => !o)}>Paste page list from capture</Button>
        <Button size="sm" variant="outline" onClick={() => setPages((ps) => [...ps, { id: newPageId(), family: 'other', title: '', path: '', action: 'undecided', old_url: '', target: '', notes: '' }])}><Plus className="mr-1 h-3.5 w-3.5" />Add page</Button>
      </div>
      {/* THE COMPLETE OLD-SITE INVENTORY from the exhaustive crawl — every URL, paged and searchable,
          exportable as CSV. Adding to the architecture is Paul's choice, filtered; the architecture
          itself holds at most MAX_PAGES planned pages, and the toast says exactly what did not fit. */}
      <CrawlInventory leadId={leadId} addRoom={Math.max(0, MAX_PAGES - state.pages.length)} onAdd={(inv: InventoryRow[]) => {
        const seeded = seedFromCrawl(inv.map((r) => ({ url: r.final_url || r.url, kind: r.family ?? undefined })), state.pages);
        const room = Math.max(0, MAX_PAGES - state.pages.length);
        addPages(seeded.slice(0, room), seeded.length > room
          ? `${seeded.length - room} more did not fit the ${MAX_PAGES}-page architecture — narrow the filter (e.g. one family) and add those you will keep, or handle them in the redirect map.`
          : 'Old URLs from the full crawl — decide each one.');
      }} />
      {pasteOpen && <div className="space-y-2"><Textarea rows={6} className="font-mono text-xs" value={pageText} placeholder={'action | family | /new-path/ | Title | old url | redirect target | note\nkeep | service | /services/boiler-repair/ | Boiler repair | https://old.co.uk/boiler-repair | | '} onChange={(e) => setPageText(e.target.value)} />
        <Button size="sm" disabled={!pageText.trim()} onClick={() => { addPages(parsePageLines(pageText, PAGE_ACTIONS, PAGE_FAMILIES), 'Pasted from the capture.'); setPageText(''); setPasteOpen(false); }}>Add pages</Button></div>}
      {state.pages.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1 pr-1">Action</th><th className="py-1 pr-1">Family</th><th className="py-1 pr-1">New path</th><th className="py-1 pr-1">Title</th><th className="py-1 pr-1">Old URL</th><th className="py-1 pr-1">Goes to (consolidate / redirect)</th><th className="py-1 pr-1">Notes</th><th /></tr></thead>
        <tbody>{state.pages.map((p) => <tr key={p.id} className={`border-b align-top ${p.action === 'undecided' ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
          <td className="py-1 pr-1"><select aria-label={`Action for ${p.old_url || p.path || p.title || 'page'}`} className={sel} value={p.action} onChange={(e) => setPages((ps) => ps.map((x) => x.id === p.id ? applyAction(x, e.target.value as ArchPage['action']) : x))}>{PAGE_ACTIONS.map((a) => <option key={a} value={a}>{PAGE_ACTION_LABELS[a]}</option>)}</select></td>
          <td className="py-1 pr-1"><select aria-label={`Page family for ${p.old_url || p.path || p.title || 'page'}`} className={sel} value={p.family} onChange={(e) => patch(p.id, { family: e.target.value as ArchPage['family'] })}>{PAGE_FAMILIES.map((f) => <option key={f} value={f}>{PAGE_FAMILY_LABELS[f]}</option>)}</select></td>
          <td className="py-1 pr-1"><Input aria-label={`New path for ${p.old_url || p.title || 'page'}`} className="h-8 text-xs" value={p.path} placeholder="/services/…/" disabled={p.action === 'remove'} onChange={(e) => patch(p.id, { path: e.target.value })} /></td>
          <td className="py-1 pr-1"><Input aria-label={`Title for ${p.old_url || p.path || 'page'}`} className="h-8 text-xs" value={p.title} onChange={(e) => patch(p.id, { title: e.target.value })} /></td>
          <td className="py-1 pr-1"><Input aria-label={`Old URL ${p.old_url}`} className="h-8 text-xs" value={p.old_url} placeholder="—" onChange={(e) => patch(p.id, { old_url: e.target.value })} /></td>
          <td className="py-1 pr-1"><Input aria-label={`Goes to, for ${p.old_url || p.path || p.title || 'page'}`} className="h-8 text-xs" value={p.target} placeholder={p.action === 'redirect' || p.action === 'consolidate' ? '/new-page/' : '—'} disabled={!(p.action === 'redirect' || p.action === 'consolidate')} onChange={(e) => patch(p.id, { target: e.target.value })} /></td>
          <td className="py-1 pr-1"><Input aria-label={`Notes for ${p.old_url || p.path || p.title || 'page'}`} className="h-8 text-xs" value={p.notes} onChange={(e) => patch(p.id, { notes: e.target.value })} /></td>
          <td className="py-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))} title="Delete row"><Trash2 className="h-3.5 w-3.5" /></Button></td>
        </tr>)}</tbody></table></div>}
    </Section>

    <Section title="Redirect map" right={<span className="text-xs text-muted-foreground">{state.redirects.length} redirect(s)</span>}>
      <p className="text-xs text-muted-foreground">One line per old URL that will not exist at the same path: <code>/old-path -&gt; /new-path/ | reason</code>. One hop each, no chains, not everything to the homepage.</p>
      <div className="flex flex-wrap gap-2">
        {state.manifest.redirect_candidates.length > 0 && <Button size="sm" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal text-left" onClick={() => {
          const have = new Set(state.redirects.map((r) => r.from.toLowerCase()));
          const add = state.manifest.redirect_candidates.filter((r) => r.to && !have.has(r.from.toLowerCase()));
          const noTarget = state.manifest.redirect_candidates.filter((r) => !r.to && !have.has(r.from.toLowerCase())).length;
          if (add.length) applyRedirects([redirectText.trim(), redirectsToText(add)].filter(Boolean).join('\n'));
          toast({ title: add.length ? `${add.length} redirect(s) added from the recon` : 'Nothing to add', description: noTarget ? `${noTarget} candidate(s) have no target yet — decide those in the page plan.` : undefined });
        }}>Add recon redirect candidates ({state.manifest.redirect_candidates.length})</Button>}
        <Button size="sm" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal text-left" onClick={() => { const add = redirectsFromPages(state.pages, state.redirects); if (!add.length) { toast({ title: 'Nothing to add', description: 'No consolidated / redirected page with an old URL and a destination is missing from the map.' }); return; } applyRedirects([redirectText.trim(), redirectsToText(add)].filter(Boolean).join('\n')); toast({ title: `${add.length} redirect(s) added from the page plan` }); }}>Add redirects from consolidated / redirected pages</Button>
      </div>
      <Textarea rows={10} className="font-mono text-xs" value={redirectText} placeholder={'/old-page -> /services/new-page/ | merged into the service page'} onChange={(e) => applyRedirects(e.target.value)} />
    </Section>

    {(errors.length > 0 || warnings.length > 0) && <Section title="Plan checks">
      {errors.map((i, n) => <p key={`e${n}`} className="flex items-start gap-2 text-xs text-destructive"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{i.message}</p>)}
      {warnings.map((i, n) => <p key={`w${n}`} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{i.message}</p>)}
    </Section>}
    <div className="flex justify-between"><Button variant="outline" onClick={() => goStep('capture')}>Back</Button><Button onClick={() => goStep('build_pack')}>Next: Build Pack</Button></div>
  </>;
}
