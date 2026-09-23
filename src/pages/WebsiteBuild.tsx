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
  BUILD_MODE_LABELS, BUILD_MODES, CAPTURE_STATUS_LABELS, CAPTURE_STATUSES, COPY_OWNERSHIP_LABELS, COPY_OWNERSHIPS,
  DEPLOY_STATUS_LABELS, DEPLOY_STATUSES, FACT_STATUS_LABELS, mayPreserveCopy, PAGE_ACTION_LABELS, PAGE_ACTIONS,
  PAGE_FAMILIES, PAGE_FAMILY_LABELS, parseWebsiteBuild, QA_ITEMS, REBUILD_STYLE_LABELS, REBUILD_STYLES, STAGE_LABELS,
  STAGES, captureApplies, websiteBuildStages,
  type ArchPage, type BuildFact, type FactStatus, type Stage, type StoredFactStatus, type WebsiteBuildState,
} from '@/lib/websiteBuildState';
import { WEBSITE_TEMPLATES, templateById } from '@/lib/websiteTemplates';
import { candidateFacts, CLAIM_VERDICT_LABELS, decide, factsSummary, mapTemplateClaims, mergeFacts, parseFactLines, type FactRow } from '@/lib/buildFacts';
import { applyAction, checkArchitecture, newPageId, parsePageLines, parseRedirectText, redirectsFromPages, redirectsToText, seedFromCited, seedFromCrawl, seedFromTemplate } from '@/lib/buildArchitecture';
import { buildPack, setupProblems, suggestCloudflareProject, suggestRepoName, type PackItem, type PackItemId } from '@/lib/buildPack';
import { CrawlEvidenceDetails, LeadCrawlPanel } from '@/components/LeadCrawlPanel';
import { crawlOldUrls, summariseLeadCrawl } from '@/lib/leadCrawlSummary';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE BUILD COMMAND CENTRE — /paid-clients/:leadId/website-build

   A workflow and prompt/command generator, NOT a website builder. It turns what Findable already
   knows about one paid client, plus Paul's decisions, into a Build Pack of exact commands and
   Claude Code prompts.

   ⛔ OPENING THIS PAGE SPENDS NOTHING AND SENDS NOTHING. The one read is paid-client-hub
   `rebuild_context` (stored rows only — no audit, no crawl, no model). The one write is
   `save_website_build`, which touches outreach_leads.website_build on this operator's row and nothing
   else. No WhatsApp, no email, no prospect contact exists on this screen.
   ⛔ SAVING IS AUTOMATIC and debounced; the header says Saved / Saving / Not saved, so a failed save
   is never silent.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const call = (body: Record<string, unknown>) => invokeEdge<Record<string, any>>('paid-client-hub', body);
const SAVE_DEBOUNCE_MS = 900;

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

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
  const latest = useRef<WebsiteBuildState | null>(null);
  /* An edit not yet sent. The debounce timer dies with the page, so leaving by an in-app link within
     SAVE_DEBOUNCE_MS used to drop the last edit (found on the production run, 2026-09-23). */
  const pending = useRef(false);

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
        setState(parseWebsiteBuild((ctx.lead as { website_build?: unknown } | null)?.website_build));
        setSave('saved');
        loadedRef.current = true;
      })
      .catch((e) => { if (!cancelled) setLoadError(edgeErrorMessage(e, 'Could not load this client')); });
    return () => { cancelled = true; };
  }, [leadId, reloadKey]);

  const flush = useCallback(async () => {
    const s = latest.current;
    if (!s) return;
    pending.current = false;
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    setSave('saving');
    try {
      await call({ action: 'save_website_build', lead_id: leadId, website_build: s });
      if (latest.current === s) setSave('saved');
      setSaveError('');
    } catch (e) {
      pending.current = true;
      setSave('error');
      setSaveError(edgeErrorMessage(e, 'Save failed'));
    }
  }, [leadId]);

  const update = useCallback((fn: (s: WebsiteBuildState) => WebsiteBuildState) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      latest.current = next;
      return next;
    });
    if (!loadedRef.current) return;
    pending.current = true;
    setSave('dirty');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  /* Send a pending edit NOW when the page is left (in-app navigation unmounts it) or hidden. */
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden' && pending.current) void flush(); };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); if (pending.current) void flush(); };
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === 'dirty' || save === 'saving') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  const set = <K extends keyof WebsiteBuildState>(k: K, v: WebsiteBuildState[K]) => update((s) => ({ ...s, [k]: v }));

  /* ── derived — everything recomputed from the payload + state, nothing cached ───────────────── */
  const template = state?.build_mode === 'template' ? templateById(state.template_id) : null;
  const evidence = useMemo(() => payload ? toRebuildPromptInput(payload) : null, [payload]);
  const candidates = useMemo(() => payload ? candidateFacts(payload as never, state?.canonical_domain ?? '') : [], [payload, state?.canonical_domain]);
  const rows = useMemo(() => state ? mergeFacts(candidates, state.facts, template) : [], [candidates, state, template]);
  const summary = useMemo(() => factsSummary(rows), [rows]);
  const websiteRow = rows.find((r) => r.key === 'website');
  const existingSiteUrl = websiteRow && websiteRow.status !== 'rejected' && websiteRow.status !== 'not_applicable' ? websiteRow.value : '';
  const issues = useMemo(() => state ? checkArchitecture(state.pages, state.redirects) : [], [state]);
  const archErrors = issues.filter((i) => i.level === 'error').length;
  const businessName = rows.find((r) => r.key === 'business_name')?.value || String((payload?.lead as { business_name?: string } | null)?.business_name ?? '');
  const pack = useMemo(() => (state && evidence) ? buildPack({
    state, template, facts: rows, evidence, businessName, existingSiteUrl, mustNotSay: evidence.facts.mustNotSay.value ?? '',
  }) : [], [state, template, rows, evidence, businessName, existingSiteUrl]);
  const packById = (id: PackItemId) => pack.find((p) => p.id === id)!;
  const stages = useMemo(() => state ? websiteBuildStages({
    state, hasExistingSite: !!existingSiteUrl, factsAwaiting: summary.awaiting, architectureErrors: archErrors,
    setupMissing: setupProblems(state).map((p) => p.label),
  }) : [], [state, existingSiteUrl, summary.awaiting, archErrors]);

  const copyItem = async (item: PackItem) => {
    try {
      await navigator.clipboard.writeText(item.text);
      toast({ title: `${item.title.replace(/^\d+\.\s*/, '')} copied`, description: item.blockedBy.length ? `Still missing: ${item.blockedBy.join(', ')}` : `${item.text.length.toLocaleString()} characters.` });
    } catch { toast({ title: 'Could not copy', description: 'Open "Show" and copy the text by hand.', variant: 'destructive' }); }
  };

  if (loadError) return <div className="mx-auto max-w-6xl space-y-4 py-6"><Link to={`/paid-clients/${leadId}`} className="text-xs text-muted-foreground">← Client hub</Link>
    <Card><CardContent className="space-y-3 p-6 text-sm"><div role="alert" className="flex items-start gap-2 text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{loadError}</span></div><Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}><RefreshCw className="mr-1 h-4 w-4" />Try again</Button></CardContent></Card></div>;
  if (!state || !payload || !evidence) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  /* ── fact actions ───────────────────────────────────────────────────────────────────────────── */
  const putFact = (f: BuildFact) => update((s) => ({ ...s, facts: [...s.facts.filter((x) => x.key !== f.key), f] }));
  const decideRow = (r: FactRow, status: StoredFactStatus, value?: string) => putFact(decide(r, status, value ?? r.value));
  const resetFact = (key: string) => update((s) => ({ ...s, facts: s.facts.filter((x) => x.key !== key) }));

  const saveLabel = save === 'saved' ? 'Saved' : save === 'saving' ? 'Saving…' : save === 'dirty' ? 'Unsaved changes…' : 'Not saved';
  const cur = stages.find((s) => s.stage === step);
  const captureOn = captureApplies(state, !!existingSiteUrl);

  return <div className="mx-auto max-w-6xl space-y-4 py-6">
    <Link to={`/paid-clients/${leadId}`} className="text-xs text-muted-foreground">← Client hub</Link>
    <Card><CardContent className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Website Build — {businessName || 'client'}</h1>
          <p className="text-sm text-muted-foreground">{state.build_mode ? BUILD_MODE_LABELS[state.build_mode] : 'Build route not chosen yet'}{template ? ` · ${template.name}` : ''}{state.build_mode === 'rebuild' && state.rebuild_style ? ` · ${REBUILD_STYLE_LABELS[state.rebuild_style]}` : ''}</p></div>
        <div className={`flex items-center gap-2 text-xs ${save === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} aria-live="polite">
          {save === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{save === 'saved' && <Check className="h-3.5 w-3.5 text-emerald-600" />}{saveLabel}
          {save === 'error' && <><span>— {saveError}</span><Button size="sm" variant="outline" onClick={() => void flush()}>Retry save</Button></>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stages.map((s) => <button key={s.stage} type="button" onClick={() => goStep(s.stage)}
          className={`rounded-md border p-2 text-left text-xs transition ${step === s.stage ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'} ${!s.applicable ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-1.5 font-medium"><StatusDot done={s.done} applicable={s.applicable} />{STAGE_LABELS[s.stage]}</div>
          <div className="mt-1 line-clamp-2 break-all text-muted-foreground">{s.stage === 'intake' ? `${summary.verified} verified · ${summary.awaiting} to confirm` : s.stage === 'capture' && !state.build_mode ? 'Choose the build route first' : s.stage === 'capture' && captureOn && state.capture.url_count != null ? `${state.capture.url_count} URLs · ${state.capture.asset_count ?? 0} assets` : s.detail}</div>
        </button>)}
      </div>
    </CardContent></Card>

    {cur && <p className="text-xs text-muted-foreground">{STAGE_LABELS[cur.stage]}: {cur.detail}</p>}

    {/* ══ INTAKE ═══════════════════════════════════════════════════════════════════════════ */}
    {step === 'intake' && <>
      <Section title="How are we building this website?">
        <Choice name="mode" value={state.build_mode} options={BUILD_MODES} labels={BUILD_MODE_LABELS} onChange={(v) => update((s) => ({ ...s, build_mode: v, template_id: v === 'template' ? (s.template_id || WEBSITE_TEMPLATES[0].id) : s.template_id }))} />
        {state.build_mode === 'template' && <div className="space-y-2">
          <Label>Template</Label>
          {WEBSITE_TEMPLATES.map((t) => <label key={t.id} className={`block cursor-pointer rounded-md border p-3 ${state.template_id === t.id ? 'border-primary bg-primary/5' : ''}`}>
            <div className="flex items-start gap-2"><input type="radio" name="tpl" value={t.id} aria-label={t.name} className="mt-1" checked={state.template_id === t.id} onChange={() => set('template_id', t.id)} />
              <div className="min-w-0"><p className="font-medium">{t.name}</p><p className="text-xs text-muted-foreground">{t.description}</p>
                <details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">Template profile</summary>
                  <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">Source repo</dt><dd className="break-all">{t.sourceRepoUrl} ({t.sourceRepoPrivate ? 'private' : 'public'})</dd></div>
                    <div><dt className="text-muted-foreground">Framework</dt><dd>{t.framework} · Node {t.nodeVersion}</dd></div>
                    <div><dt className="text-muted-foreground">Dev</dt><dd>{t.devCommand} → {t.devUrl}</dd></div>
                    <div><dt className="text-muted-foreground">Build</dt><dd>{t.buildCommand} → {t.buildOutputDir}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-muted-foreground">Cloudflare</dt><dd>{t.cloudflare}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-muted-foreground">Page families</dt><dd>{t.defaultPageFamilies.map((f) => f.title).join(' · ')}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-muted-foreground">Reusable components</dt><dd>{t.reusableComponents.join(' · ')}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-muted-foreground">Visual style</dt><dd>{t.visualStyle.join(' · ')}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-muted-foreground">Suits</dt><dd>{t.supportedBusinessTypes.join(', ')}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-muted-foreground">Required facts</dt><dd>{t.facts.filter((f) => f.required).map((f) => f.label).join(', ')}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-muted-foreground">Never carried over ({t.sourceClient})</dt><dd>{t.claims.map((c) => c.label).join(' · ')}</dd></div>
                  </dl></details></div></div>
          </label>)}
          <p className="text-xs text-muted-foreground">Template reuse means structure and design only. Every {template?.sourceClient ?? 'source-client'} claim is checked against this client's verified facts below and removed if there is no match.</p>
        </div>}
        {state.build_mode === 'rebuild' && <div className="space-y-3">
          <div><Label>Rebuild style</Label><div className="mt-1"><Choice name="style" value={state.rebuild_style} options={REBUILD_STYLES} labels={REBUILD_STYLE_LABELS} onChange={(v) => set('rebuild_style', v)} /></div></div>
          <div><Label>Who owns / supplied the current website copy &amp; design?</Label><div className="mt-1"><Choice name="own" value={state.copy_ownership} options={COPY_OWNERSHIPS} labels={COPY_OWNERSHIP_LABELS} onChange={(v) => set('copy_ownership', v)} /></div>
            {state.copy_ownership && <p className={`mt-2 rounded p-2 text-xs ${mayPreserveCopy(state.copy_ownership) ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'}`}>
              {mayPreserveCopy(state.copy_ownership) ? 'The existing wording may be kept where it is accurate.' : 'Facts and the visual requirements are kept; the marketing wording is rewritten freshly, never copied. Only genuine client-owned assets are reused.'}</p>}
          </div>
          {!existingSiteUrl && <p className="flex items-start gap-2 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5" />No current website is recorded for this client. A rebuild needs one — add it under Client Build Facts.</p>}
        </div>}
      </Section>

      <Section title="Website evidence (latest crawl)">
        {/* The lead's ONE crawl row. A crawl started on Outreach, the Inbox or Paid Clients is this
            same row; Re-crawl here writes it too. Everything read is DETECTED — it reaches the build
            only as a fact Paul approves below. */}
        <LeadCrawlPanel leadId={leadId} website={existingSiteUrl || String((payload.lead as { website?: string } | null)?.website ?? '')}
          summary={summariseLeadCrawl(payload.crawl)} from="website_build"
          onDone={async () => { if (pending.current) await flush(); setReloadKey((k) => k + 1); }} />
        <CrawlEvidenceDetails full={payload.crawl?.mode === 'full' ? payload.crawl.full_evidence : null} />
      </Section>

      <FactsSection rows={rows} template={template} onDecide={decideRow} onReset={resetFact} onPut={putFact}
        onPaste={(text) => { const add = parseFactLines(text, template, 'pasted from capture'); update((s) => ({ ...s, facts: [...s.facts.filter((f) => !add.some((a) => a.key === f.key)), ...add] })); toast({ title: `${add.length} fact(s) added`, description: 'They are marked "Needs approval".' }); }} />

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
      {!captureOn ? <Section title="Existing site capture"><p className="text-muted-foreground">{state.build_mode ? 'No current website is recorded, so there is nothing to capture.' : 'Choose the build route first.'}</p></Section> : <>
        <Section title="Existing site capture">
          <p className="text-xs text-muted-foreground">Run the <b>Project setup</b> commands (Build Pack, item 1) first so the client folder exists. Then open Claude Code in that folder and paste the capture prompt. It saves the old site locally in a <code>capture</code> folder and replies with counts, a page list, redirects and facts — paste those into this screen.</p>
          <PackCard item={packById('setup')} onCopy={copyItem} />
          <PackCard item={packById('capture')} onCopy={copyItem} />
        </Section>
        <Section title="Capture results">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs">Status</Label><select className={sel} value={state.capture.status} onChange={(e) => set('capture', { ...state.capture, status: e.target.value as typeof state.capture.status })}>{CAPTURE_STATUSES.map((c) => <option key={c} value={c}>{CAPTURE_STATUS_LABELS[c]}</option>)}</select></div>
            <div><Label className="text-xs">URLs captured</Label><Input className="h-8 text-xs" inputMode="numeric" value={state.capture.url_count ?? ''} onChange={(e) => set('capture', { ...state.capture, url_count: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></div>
            <div><Label className="text-xs">Assets captured</Label><Input className="h-8 text-xs" inputMode="numeric" value={state.capture.asset_count ?? ''} onChange={(e) => set('capture', { ...state.capture, asset_count: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></div>
          </div>
          <div><Label className="text-xs">Capture notes</Label><Textarea rows={3} className="text-xs" value={state.capture.notes} placeholder="Anything notable Claude reported (e.g. the gallery is on Facebook, not the site)." onChange={(e) => set('capture', { ...state.capture, notes: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">Paste the capture's <b>facts</b> in Intake → Client Build Facts, and its <b>page list</b> and <b>redirects</b> in Architecture.</p>
        </Section>
      </>}
      <div className="flex justify-between"><Button variant="outline" onClick={() => goStep('intake')}>Back</Button><Button onClick={() => goStep('architecture')}>Next: Architecture</Button></div>
    </>}

    {/* ══ ARCHITECTURE ═════════════════════════════════════════════════════════════════════ */}
    {step === 'architecture' && <ArchitectureSection state={state} template={template} rows={rows} issues={issues}
      checkedPages={crawlOldUrls(payload.crawl)} cited={evidence.signals} update={update} goStep={goStep} toast={toast} />}

    {/* ══ BUILD PACK ═══════════════════════════════════════════════════════════════════════ */}
    {step === 'build_pack' && <>
      <ProjectDetails state={state} set={set} businessName={businessName} template={template} existingSiteUrl={existingSiteUrl} />
      <Section title="Build Pack" right={<span className="text-xs text-muted-foreground">Generated from the saved decisions — nothing is stored, so it is always current.</span>}>
        <div className="rounded bg-muted p-3 text-xs"><p className="font-medium">Work down the list, in order.</p><ul className="mt-1 list-disc space-y-0.5 pl-4"><li><b>PowerShell</b> items: open PowerShell, paste one block at a time, read what it prints.</li><li><b>Claude Code prompt</b> items: open Claude Code on the client folder{state.local_repo_path ? <> (<code>{state.local_repo_path}</code>)</> : ''} — desktop app → Code → choose that folder — then paste the prompt.</li><li>Paste back what each step tells you to (repository URL, preview URL, capture counts) — this page saves as you type.</li></ul></div>
        {pack.filter((p) => p.applicable).map((p) => <PackCard key={p.id} item={p} onCopy={copyItem} />)}
        {pack.filter((p) => !p.applicable).map((p) => <p key={p.id} className="text-xs text-muted-foreground">{p.title} — not needed for this build.</p>)}
      </Section>
      <div className="flex justify-between"><Button variant="outline" onClick={() => goStep('architecture')}>Back</Button><Button onClick={() => goStep('preview')}>Next: Preview</Button></div>
    </>}

    {/* ══ PREVIEW ══════════════════════════════════════════════════════════════════════════ */}
    {step === 'preview' && <>
      <Section title="Preview">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dev URL (local)" value={state.dev_url} placeholder={template?.devUrl ?? 'http://localhost:4321'} onChange={(v) => set('dev_url', v)} />
          <Field label="Cloudflare project" value={state.cloudflare_project} placeholder="lowercase-with-dashes" onChange={(v) => set('cloudflare_project', v.trim().toLowerCase())} />
          <Field label="Preview URL" value={state.preview_url} placeholder={state.cloudflare_project ? `https://preview.${state.cloudflare_project}.pages.dev` : 'paste from the preview command output'} onChange={(v) => set('preview_url', v.trim())} />
          <div><Label className="text-xs">Deployment status</Label><select className={sel} value={state.deploy_status} onChange={(e) => set('deploy_status', e.target.value as typeof state.deploy_status)}>{DEPLOY_STATUSES.map((d) => <option key={d} value={d}>{DEPLOY_STATUS_LABELS[d]}</option>)}</select></div>
        </div>
        {state.preview_url && <a href={state.preview_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open preview</a>}
        <PackCard item={packById('local')} onCopy={copyItem} />
        <PackCard item={packById('preview')} onCopy={copyItem} />
      </Section>
      <div className="flex justify-between"><Button variant="outline" onClick={() => goStep('build_pack')}>Back</Button><Button onClick={() => goStep('qa')}>Next: QA</Button></div>
    </>}

    {/* ══ QA ═══════════════════════════════════════════════════════════════════════════════ */}
    {step === 'qa' && <>
      <Section title="QA prompts"><PackCard item={packById('visual_qa')} onCopy={copyItem} /><PackCard item={packById('seo_qa')} onCopy={copyItem} /></Section>
      <Checklist state={state} group="preview" set={set} title="Definition of done — before production" />
      <div className="flex justify-between"><Button variant="outline" onClick={() => goStep('preview')}>Back</Button><Button onClick={() => goStep('live')}>Next: Live</Button></div>
    </>}

    {/* ══ LIVE ═════════════════════════════════════════════════════════════════════════════ */}
    {step === 'live' && <>
      <Section title="Production">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Production URL" value={state.production_url} placeholder={state.canonical_domain ? `https://${state.canonical_domain}` : 'https://…'} onChange={(v) => set('production_url', v.trim())} />
          <Field label="Latest commit" value={state.latest_commit} placeholder="output of: git log -1 --format=&quot;%h %s&quot;" onChange={(v) => set('latest_commit', v)} />
          <Field label="GitHub repository URL" value={state.repo_url} placeholder="https://github.com/…" onChange={(v) => set('repo_url', v.trim())} />
          <div><Label className="text-xs">Deployment status</Label><select className={sel} value={state.deploy_status} onChange={(e) => set('deploy_status', e.target.value as typeof state.deploy_status)}>{DEPLOY_STATUSES.map((d) => <option key={d} value={d}>{DEPLOY_STATUS_LABELS[d]}</option>)}</select></div>
        </div>
        {state.production_url && <a href={state.production_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open production site</a>}
        <PackCard item={packById('production')} onCopy={copyItem} />
        <PackCard item={packById('final_qa')} onCopy={copyItem} />
      </Section>
      <Checklist state={state} group="live" set={set} title="Live checks" />
      <div className="flex justify-start"><Button variant="outline" onClick={() => goStep('qa')}>Back</Button></div>
    </>}
  </div>;
}

/* ── small pieces ─────────────────────────────────────────────────────────────────────────────── */

function Field({ label, value, placeholder, onChange, action }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void; action?: ReactNode }) {
  return <div><div className="flex items-center justify-between"><Label className="text-xs">{label}</Label>{action}</div><Input className="h-8 text-xs" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}

function Checklist({ state, group, set, title }: { state: WebsiteBuildState; group: 'preview' | 'live'; set: <K extends keyof WebsiteBuildState>(k: K, v: WebsiteBuildState[K]) => void; title: string }) {
  const items = QA_ITEMS.filter((q) => q.group === group);
  const done = items.filter((q) => state.qa[q.key]).length;
  return <Section title={title} right={<span className="text-xs text-muted-foreground">{done} of {items.length}</span>}>
    <div className="grid gap-1.5 sm:grid-cols-2">{items.map((q) => <label key={q.key} className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" aria-label={q.label} className="mt-1" checked={state.qa[q.key] === true} onChange={(e) => set('qa', { ...state.qa, [q.key]: e.target.checked })} /><span>{q.label}</span></label>)}</div>
    <p className="text-xs text-muted-foreground">Tick only what the QA prompts reported as PASS, or what you checked yourself.</p>
  </Section>;
}

function ProjectDetails({ state, set, businessName, template, existingSiteUrl }: {
  state: WebsiteBuildState; set: <K extends keyof WebsiteBuildState>(k: K, v: WebsiteBuildState[K]) => void;
  businessName: string; template: ReturnType<typeof templateById>; existingSiteUrl: string;
}) {
  const repoSuggestion = suggestRepoName(businessName);
  const problems = setupProblems(state);
  const domainFromSite = (() => { try { return existingSiteUrl ? new URL(existingSiteUrl).hostname.replace(/^www\./, '') : ''; } catch { return ''; } })();
  const Sugg = ({ label, onClick }: { label: string; onClick: () => void }) => <button type="button" className="text-[11px] text-primary underline" onClick={onClick}>{label}</button>;
  return <Section title="Project details — used in every command">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Repository name" value={state.repo_name} placeholder={repoSuggestion || 'ClientName'} onChange={(v) => set('repo_name', v.trim())}
        action={repoSuggestion && state.repo_name !== repoSuggestion ? <Sugg label={`Use ${repoSuggestion}`} onClick={() => set('repo_name', repoSuggestion)} /> : undefined} />
      <Field label="GitHub account (owner)" value={state.github_owner} placeholder="your GitHub username" onChange={(v) => set('github_owner', v.trim())}
        action={template && state.github_owner !== template.sourceRepoOwner ? <Sugg label={`Use ${template.sourceRepoOwner} (where the template lives)`} onClick={() => set('github_owner', template.sourceRepoOwner)} /> : undefined} />
      <Field label="Local folder" value={state.local_repo_path} placeholder="C:\Users\paulj\ClientName" onChange={(v) => set('local_repo_path', v.trim())}
        action={state.repo_name && !state.local_repo_path ? <Sugg label={`Use C:\\Users\\paulj\\${state.repo_name}`} onClick={() => set('local_repo_path', `C:\\Users\\paulj\\${state.repo_name}`)} /> : undefined} />
      <Field label="Cloudflare project name" value={state.cloudflare_project} placeholder="lowercase-with-dashes" onChange={(v) => set('cloudflare_project', v.trim().toLowerCase())}
        action={state.repo_name && !state.cloudflare_project ? <Sugg label={`Use ${suggestCloudflareProject(state.repo_name)}`} onClick={() => set('cloudflare_project', suggestCloudflareProject(state.repo_name))} /> : undefined} />
      <Field label="Domain the new site will live on (canonical)" value={state.canonical_domain} placeholder="example.co.uk" onChange={(v) => set('canonical_domain', v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))}
        action={domainFromSite && state.canonical_domain !== domainFromSite ? <Sugg label={`Use ${domainFromSite}`} onClick={() => set('canonical_domain', domainFromSite)} /> : undefined} />
      <Field label="GitHub repository URL (after setup step 5)" value={state.repo_url} placeholder={state.github_owner && state.repo_name ? `https://github.com/${state.github_owner}/${state.repo_name}` : 'https://github.com/…'} onChange={(v) => set('repo_url', v.trim())} />
    </div>
    {problems.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Setup commands need: {problems.map((p) => `${p.label} (${p.problem})`).join(' · ')}</p>}
    <p className="text-xs text-muted-foreground">Suggestions are only filled in when you click them. The Cloudflare project is created by the preview commands in your own Cloudflare account.</p>
  </Section>;
}

function FactsSection({ rows, template, onDecide, onReset, onPut, onPaste }: {
  rows: FactRow[]; template: ReturnType<typeof templateById>;
  onDecide: (r: FactRow, s: StoredFactStatus, value?: string) => void; onReset: (key: string) => void;
  onPut: (f: BuildFact) => void; onPaste: (text: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'detected' | 'missing' | 'verified'>('all');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState(''); const [newValue, setNewValue] = useState('');
  const [paste, setPaste] = useState(''); const [pasteOpen, setPasteOpen] = useState(false);
  const s = factsSummary(rows);
  const shown = rows.filter((r) => filter === 'all' || r.status === filter);
  const valueOf = (r: FactRow) => drafts[r.key] ?? r.value;
  const commit = (r: FactRow, status: StoredFactStatus) => { onDecide(r, status, valueOf(r)); setDrafts((d) => { const n = { ...d }; delete n[r.key]; return n; }); };
  return <Section title="Client Build Facts" right={<div className="flex flex-wrap gap-1 text-xs">{(['all', 'detected', 'missing', 'verified'] as const).map((f) =>
    <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full border px-2 py-0.5 ${filter === f ? 'border-primary bg-primary/10' : ''}`}>{f === 'all' ? `All ${rows.length}` : f === 'detected' ? `Need approval ${s.awaiting}` : f === 'missing' ? `Missing ${s.missing}` : `Verified ${s.verified}`}</button>)}</div>}>
    <p className="rounded bg-muted p-2 text-xs"><b>Verified facts may be used. Unverified facts must not be published.</b> Preloaded from onboarding, the client record, the baseline and the stored crawl — nothing was fetched. Edit a value, then Approve it.</p>
    {s.requiredMissing.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Required for {template ? 'the template' : 'any build'} and not verified yet (marked *): {s.requiredMissing.join(', ')}</p>}
    <div className="space-y-2">{shown.map((r) => {
      const draft = valueOf(r); const changed = draft !== r.value;
      return <div key={r.key} className="rounded-md border p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">{r.label}{r.required && <span className="text-destructive"> *</span>}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${FACT_TONE[r.status]}`}>{FACT_STATUS_LABELS[r.status]}</span>
          {r.source && <span className="text-[11px] text-muted-foreground">from {r.source}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Input aria-label={`Value for ${r.label}`} className="h-8 min-w-[240px] flex-1 text-xs" value={draft} placeholder="No value — type one only if the client has confirmed it" onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))} />
          <Button size="sm" variant={r.status === 'verified' && !changed ? 'secondary' : 'default'} disabled={!draft.trim() || (r.status === 'verified' && !changed)} onClick={() => commit(r, 'verified')}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button>
          <Button size="sm" variant="outline" disabled={r.status === 'rejected' && !changed} onClick={() => commit(r, 'rejected')}><X className="mr-1 h-3.5 w-3.5" />Reject</Button>
          <Button size="sm" variant="outline" disabled={r.status === 'not_applicable'} onClick={() => commit(r, 'not_applicable')}>N/A</Button>
          {changed && <Button size="sm" variant="ghost" onClick={() => setDrafts((d) => { const n = { ...d }; delete n[r.key]; return n; })}>Undo edit</Button>}
          {r.decided && !changed && <Button size="sm" variant="ghost" onClick={() => onReset(r.key)} title="Forget your decision and go back to what the records say">Reset</Button>}
        </div>
        {r.note && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{r.note}</p>}
      </div>;
    })}{shown.length === 0 && <p className="text-xs text-muted-foreground">Nothing in this filter.</p>}</div>
    <div className="flex flex-wrap items-end gap-2 border-t pt-3">
      <div className="min-w-[160px]"><Label className="text-xs">Add a fact the client confirmed</Label><Input className="h-8 text-xs" value={newLabel} placeholder="e.g. Gas Safe number" onChange={(e) => setNewLabel(e.target.value)} /></div>
      <div className="min-w-[200px] flex-1"><Label className="text-xs">Value</Label><Input className="h-8 text-xs" value={newValue} placeholder="e.g. 123456" onChange={(e) => setNewValue(e.target.value)} /></div>
      <Button size="sm" disabled={!newLabel.trim() || !newValue.trim()} onClick={() => {
        const spec = template?.facts.find((f) => f.label.toLowerCase() === newLabel.trim().toLowerCase());
        onPut({ key: spec?.key ?? ('custom_' + newLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).slice(0, 80), label: spec?.label ?? newLabel.trim(), value: newValue.trim(), status: 'verified', source: 'added by Paul' });
        setNewLabel(''); setNewValue('');
      }}><Plus className="mr-1 h-3.5 w-3.5" />Add as verified</Button>
      <Button size="sm" variant="outline" onClick={() => setPasteOpen((o) => !o)}>Paste facts from capture</Button>
    </div>
    {pasteOpen && <div className="space-y-2"><Textarea rows={5} className="font-mono text-xs" value={paste} placeholder={'One per line, "Label: value"\nServices: Boiler repair, Boiler servicing\nOwner / person customers deal with: Steve'} onChange={(e) => setPaste(e.target.value)} />
      <Button size="sm" disabled={!paste.trim()} onClick={() => { onPaste(paste); setPaste(''); setPasteOpen(false); }}>Add as "needs approval"</Button></div>}
  </Section>;
}

function ArchitectureSection({ state, template, rows, issues, checkedPages, cited, update, goStep, toast }: {
  state: WebsiteBuildState; template: ReturnType<typeof templateById>; rows: FactRow[];
  issues: ReturnType<typeof checkArchitecture>; checkedPages: Array<{ url: string; kind?: string }>; cited: Array<{ url: string; questions: string[] }>;
  update: (fn: (s: WebsiteBuildState) => WebsiteBuildState) => void; goStep: (s: Stage) => void;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const [redirectText, setRedirectText] = useState(() => redirectsToText(state.redirects));
  const [pageText, setPageText] = useState(''); const [pasteOpen, setPasteOpen] = useState(false);
  const setPages = (fn: (p: ArchPage[]) => ArchPage[]) => update((s) => ({ ...s, pages: fn(s.pages) }));
  const patch = (id: string, over: Partial<ArchPage>) => setPages((ps) => ps.map((p) => p.id === id ? { ...p, ...over } : p));
  const addPages = (add: ArchPage[], what: string) => { setPages((ps) => [...ps, ...add]); toast({ title: `${add.length} page(s) added`, description: what }); };
  const applyRedirects = (text: string) => { setRedirectText(text); update((s) => ({ ...s, redirects: parseRedirectText(text) })); };
  const errors = issues.filter((i) => i.level === 'error'); const warnings = issues.filter((i) => i.level === 'warning');
  const counts = PAGE_ACTIONS.map((a) => [a, state.pages.filter((p) => p.action === a).length] as const).filter(([, n]) => n > 0);

  return <>
    <Section title="Page architecture" right={<span className="text-xs text-muted-foreground">{state.pages.length} page(s){counts.length ? ' · ' + counts.map(([a, n]) => `${n} ${PAGE_ACTION_LABELS[a].toLowerCase().replace('…', '')}`).join(' · ') : ''}</span>}>
      <p className="text-xs text-muted-foreground">One primary page per important intent. For every old page or intent choose keep, create, consolidate, redirect or remove. Location pages only where there is genuinely local content — never cloned town pages.{cited.length > 0 ? ' Start with the URLs AI engines cited — they are the old pages most worth keeping or redirecting carefully.' : ''}</p>
      <div className="flex flex-wrap gap-2">
        {template && <Button size="sm" variant="outline" onClick={() => addPages(seedFromTemplate(template, rows).filter((n) => !state.pages.some((p) => p.path && p.path === n.path)), 'From the template, for verified services only.')}>Add template pages (verified services only)</Button>}
        {cited.length > 0 && <Button size="sm" variant="outline" onClick={() => addPages(seedFromCited(cited, state.pages), 'Old URLs AI engines cited in the baseline — decide each one.')}>Add URLs AI engines cited ({cited.length})</Button>}
        {checkedPages.length > 0 && <Button size="sm" variant="outline" onClick={() => addPages(seedFromCrawl(checkedPages, state.pages), 'Old URLs from the stored crawl — decide each one.')}>Add old URLs from stored crawl ({checkedPages.length})</Button>}
        <Button size="sm" variant="outline" onClick={() => setPasteOpen((o) => !o)}>Paste page list from capture</Button>
        <Button size="sm" variant="outline" onClick={() => setPages((ps) => [...ps, { id: newPageId(), family: 'other', title: '', path: '', action: 'undecided', old_url: '', target: '', notes: '' }])}><Plus className="mr-1 h-3.5 w-3.5" />Add page</Button>
      </div>
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
        <Button size="sm" variant="outline" onClick={() => { const add = redirectsFromPages(state.pages, state.redirects); if (!add.length) { toast({ title: 'Nothing to add', description: 'No consolidated / redirected page with an old URL and a destination is missing from the map.' }); return; } applyRedirects([redirectText.trim(), redirectsToText(add)].filter(Boolean).join('\n')); toast({ title: `${add.length} redirect(s) added from the page plan` }); }}>Add redirects from consolidated / redirected pages</Button>
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
