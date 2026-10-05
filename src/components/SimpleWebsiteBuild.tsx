import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Clipboard, ExternalLink, Loader2, Rocket, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { useToast } from '@/hooks/use-toast';
import type { BuildFact, WebsiteBuildState } from '@/lib/websiteBuildState';
import { GATE_ANSWERED_QA, SIMPLE_REVIEW_ITEMS, reviewItemDone } from '@/lib/websiteBuildState';
import type { BuildPackInput } from '@/lib/buildPack';
import { PRODUCTION_GATE_REPORT_FILE } from '@/lib/buildPack';
import type { StagePrompt } from '@/lib/stagePrompts';
import { applyBuildResult, correctionPrompt, parseBuildResult } from '@/lib/buildExecution';
import { readSiteGateReport } from '@/lib/siteGate';
import { productionGateProblems } from '@/lib/websiteLaunch';
import { WEBSITE_TEMPLATES, tradeFit } from '@/lib/websiteTemplates';
import type { LeadCrawlSummary } from '@/lib/leadCrawlSummary';
import { startFullLeadCrawl, useCrawlJobWatch } from '@/components/LeadCrawlPanel';
import { edgeErrorMessage } from '@/lib/edgeInvoke';
import {
  BUILD_TYPE_INFO, BUILD_TYPES, SIMPLE_STEP_LABELS, SIMPLE_STEPS, applyBuildType, blockers, clientServices, cloudflareOneTimeSteps,
  correctionsWithFailures, launchLines, masterBuildPrompt, openClaudeCommand, prepareWebsite, recommendedBuildType, resolveBuildType,
  setReviewItem, simpleIssues, simpleProgress, technicalCheck, terminalSteps, trustedPack, type BuildIssue, type BuildType, type IssueFix, type SimpleInput,
} from '@/lib/simpleBuild';
import { isPublishable } from '@/lib/buildFacts';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE BUILD — THE SIMPLE SCREEN (2026-10-05). /paid-clients/:leadId/website-build

   CHOOSE BUILD TYPE → PREPARE WEBSITE → COPY MASTER BUILD PROMPT → (Claude builds the preview)
     → REVIEW THE RESULT → CORRECTIONS → LAUNCH.
   Every rule lives in src/lib/simpleBuild.ts and the V2 modules under it; this file only shows it.
   The whole command centre is still one click away (View build details → ?view=advanced).

   ⛔ OPENING THIS SCREEN SPENDS NOTHING. "Prepare Website" may start the lead's crawl (our own crawler,
      the same job every Crawl site button starts — no paid API) and saves the record; nothing is sent.
   ⛔ Saving is the parent's queue (WebsiteBuild.tsx): one save at a time, the header says when it failed.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

type UpdateFn = (fn: (s: WebsiteBuildState) => WebsiteBuildState) => void;
type Toast = ReturnType<typeof useToast>['toast'];

export interface SimpleWebsiteBuildProps {
  leadId: string;
  state: WebsiteBuildState;
  update: UpdateFn;
  pack: BuildPackInput;
  onboarding: Record<string, unknown> | null;
  oldUrls: ReadonlyArray<{ url: string; kind?: string }>;
  domain: { applies: boolean; ready: boolean; reasons: string[] } | null;
  ended: boolean;
  launch: string[];
  productionPrompt: StagePrompt | undefined;
  crawl: LeadCrawlSummary;
  saveLabel: ReactNode;
  onReload: () => Promise<void> | void;
  onAdvanced: () => void;
  copy: (title: string, text: string) => Promise<boolean>;
  toast: Toast;
}

const tone = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
  warn: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
  bad: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100',
};

function Block({ n, title, done, right, children }: { n?: number; title: string; done?: boolean; right?: ReactNode; children: ReactNode }) {
  return <Card><CardContent className="space-y-3 p-4 text-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
        {n != null && <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${done ? 'bg-emerald-600 text-white' : 'bg-primary/10 text-primary'}`}>{done ? <Check className="h-3.5 w-3.5" /> : n}</span>}
        <span className="min-w-0 break-words">{title}</span></h2>
      {right}
    </div>
    {children}
  </CardContent></Card>;
}

function CommandBox({ command, onCopy }: { command: string; onCopy: () => void }) {
  return <div className="flex min-w-0 items-start gap-2 rounded-md bg-muted p-2">
    <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">{command}</code>
    <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={onCopy}><Clipboard className="mr-1 h-3 w-3" />Copy</Button>
  </div>;
}

const normDomain = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');

export default function SimpleWebsiteBuild(p: SimpleWebsiteBuildProps) {
  const { state, update, leadId, toast } = p;
  /* The current website as the simple flow trusts it (never a Discovery-only URL) — simpleBuild.trustedPack. */
  const pack = useMemo(() => trustedPack(p.pack), [p.pack]);
  const [changeType, setChangeType] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [crawlJob, setCrawlJob] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [resultText, setResultText] = useState('');
  const [liveText, setLiveText] = useState('');
  /* Prepare runs again on the NEXT render (when the facts / payload it reads have caught up): after the crawl
     finishes, and after Paul answers a "Needs you" item. The string is the toast to show ('' = none). */
  const pendingPrepare = useRef<string | null>(null);

  const type = resolveBuildType(state);
  const hasOld = !!pack.existingSiteUrl;
  const input: SimpleInput = useMemo(() => ({ pack, onboarding: p.onboarding, leadId, oldUrls: p.oldUrls, domain: p.domain, ended: p.ended }), [pack, p.onboarding, leadId, p.oldUrls, p.domain, p.ended]);
  const issues = useMemo(() => simpleIssues(input), [input]);
  const stops = blockers(issues);
  const progress = useMemo(() => simpleProgress(input, p.launch), [input, p.launch]);
  const master = useMemo(() => masterBuildPrompt(input), [input]);
  const steps = useMemo(() => terminalSteps(input), [input]);
  const tech = useMemo(() => technicalCheck(state, hasOld || !!state.source_site_url), [state, hasOld]);
  const svc = useMemo(() => clientServices(pack), [pack]);
  const optimiseClient = pack.serviceRoute === 'optimise';
  const b = state.build_execution;
  const previewUrl = state.preview_url || b.preview_url;
  const businessName = pack.businessName || 'this client';

  /* A crawl started by Prepare: watch it, reload the record, then prepare again with what it read. */
  useCrawlJobWatch(crawlJob, async () => { setCrawlJob(null); pendingPrepare.current = 'Current website read — prepared again with what the crawl found.'; await p.onReload(); });
  useEffect(() => {
    const msg = pendingPrepare.current;
    if (msg === null) return;
    pendingPrepare.current = null;
    runPrepare(false);
    if (msg) toast({ title: msg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack]);

  const runPrepare = (announce = true) => {
    let changes: string[] = [];
    update((s) => { const r = prepareWebsite({ pack: { ...pack, state: s }, onboarding: p.onboarding, active: !p.ended }); changes = r.changes; return r.state; });
    if (announce) toast({ title: 'Website prepared', description: changes.length ? changes.slice(0, 4).join(' · ') + (changes.length > 4 ? ' …' : '') : 'Everything was already in place.' });
  };

  const prepare = async () => {
    setPreparing(true);
    try {
      runPrepare();
      const site = pack.existingSiteUrl;
      if (site && p.crawl.status === 'none' && !crawlJob) {
        const res = await startFullLeadCrawl(leadId, 'website_build');
        const id = String(res?.job_id ?? '');
        if (id) {
          setCrawlJob(id);
          toast({ title: 'Reading their current website', description: 'This runs on the server; you can leave the page. LeadFinder prepares again when it finishes.' });
        } else {
          /* The homepage could not be read: the check recorded why on the lead — reload to show it. */
          toast({ title: 'Their website could not be read', description: 'Prepared from the records we have. The reason is saved on the lead.' });
          await p.onReload();
        }
      }
    } catch (e) {
      toast({ title: 'Could not start the website read', description: edgeErrorMessage(e, 'The crawl did not start') + ' — the rest is prepared.', variant: 'destructive' });
    } finally { setPreparing(false); }
  };

  const putFact = (key: string, label: string, value: string) => {
    const v = value.trim();
    if (!v) return;
    const f: BuildFact = { key, label, value: v, status: 'verified', source: 'confirmed by Paul (Website Build)', source_url: '', notes: '', basis: 'operator' };
    update((s) => ({ ...s, facts: [...s.facts.filter((x) => x.key !== key), f] }));
    pendingPrepare.current = '';
  };
  const chooseType = (t: BuildType) => {
    setChangeType(false);
    if (t === 'optimise') { toast({ title: 'Improve existing site = Findable Optimise', description: 'That is not a new-site build. Use the page generator for their pages.' }); return; }
    update((s) => applyBuildType(s, t, p.onboarding));
    if (state.repo_name) pendingPrepare.current = '';
  };

  const copyMaster = async () => {
    if (master.blockedBy.length) return;
    const done = await p.copy('Master Build Prompt', master.text);
    if (done) update((s) => ({ ...s, build_execution: { ...s.build_execution, started_at: s.build_execution.started_at || new Date().toISOString(), config_version: master.configVersion, template_id: s.route === 'template_rebuild' ? s.template_id : '' } }));
  };

  const importResult = () => {
    const r = parseBuildResult(resultText);
    if (r.ok === false) { toast({ title: 'Not a build result', description: r.error, variant: 'destructive' }); return; }
    const result = r.result;
    update((s) => applyBuildResult(s, result, { now: new Date().toISOString() }).state);
    setResultText('');
    toast({ title: 'Result imported — ' + result.status.replace('_', ' '), description: 'The technical check below has run.' });
  };

  const importLive = () => {
    let v: unknown;
    try { v = JSON.parse(liveText.slice(liveText.indexOf('{'), liveText.lastIndexOf('}') + 1)); } catch { toast({ title: 'Not a live check', description: 'Paste the whole of ' + PRODUCTION_GATE_REPORT_FILE + ' (one JSON object).', variant: 'destructive' }); return; }
    const r = readSiteGateReport(v);
    if (!r.reported) { toast({ title: 'Not a live check', description: 'That JSON has no site gate checks in it.', variant: 'destructive' }); return; }
    const gate = { imported_at: new Date().toISOString(), version: r.version, domain: r.domain, mode: r.mode, preview: r.preview, passed: r.passed,
      fails: r.checks.filter((c) => c.level === 'fail').map((c) => c.label + (c.details[0] ? ' (' + c.details[0] + ')' : '')).slice(0, 40),
      warns: r.checks.filter((c) => c.level === 'warn').map((c) => c.label).slice(0, 40) };
    const passes = productionGateProblems(gate, state.canonical_domain).length === 0;
    update((s) => passes
      ? { ...s, production_gate: gate, production_url: s.production_url || 'https://' + s.canonical_domain, production_status: 'verified', custom_domain_status: 'active', qa: { ...s.qa, production_deployed: true, production_checked: true } }
      : { ...s, production_gate: gate });
    setLiveText('');
    toast({ title: passes ? 'Live — the live check passed' : 'The live check did not pass', description: passes ? 'https://' + state.canonical_domain : gate.fails.slice(0, 3).join('; '), variant: passes ? undefined : 'destructive' });
  };

  const sideBySide = () => {
    const w = Math.floor(window.screen.availWidth / 2), h = window.screen.availHeight;
    const a = window.open(pack.existingSiteUrl, 'findable-old-site', 'left=0,top=0,width=' + w + ',height=' + h);
    const c = window.open(previewUrl, 'findable-preview', 'left=' + w + ',top=0,width=' + w + ',height=' + h);
    if (!a || !c) toast({ title: 'Your browser opened only one window', description: 'Press Open old site and Open preview, then Windows key + ← and Windows key + →.' });
  };

  /* ── Optimise client: not a new-site build at all ─────────────────────────────────────────────── */
  const header = <Card><CardContent className="space-y-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="break-words text-xl font-semibold sm:text-2xl">Website — {businessName}</h1></div>
      <div className="text-xs text-muted-foreground" aria-live="polite">{p.saveLabel}</div>
    </div>
    <div className="grid gap-2 text-xs sm:grid-cols-3">
      <div className="min-w-0 rounded-md border p-2"><div className="text-muted-foreground">CLIENT</div><div className="break-words font-medium">{businessName}</div></div>
      <div className="min-w-0 rounded-md border p-2"><div className="text-muted-foreground">BUILD TYPE</div><div className="break-words font-medium">{optimiseClient ? 'Optimise (their own site)' : type ? BUILD_TYPE_INFO[type].label : 'Not chosen'}</div></div>
      <div className="min-w-0 rounded-md border p-2"><div className="text-muted-foreground">STATUS</div><div className="break-words font-medium">{optimiseClient ? 'Not a new-site build' : progress.status}</div></div>
    </div>
    {!optimiseClient && <ol className="grid grid-cols-5 gap-1" aria-label="Progress">
      {SIMPLE_STEPS.map((k, n) => { const cur = progress.current === k; const d = progress.done[k];
        return <li key={k} className={`min-w-0 rounded-md border px-1 py-1.5 text-center text-[11px] sm:text-xs ${cur ? 'border-primary bg-primary/5 font-semibold' : ''} ${d ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
          <span className="inline-flex items-center gap-1">{d ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 shrink-0" />}<span className="truncate">{n + 1}. {SIMPLE_STEP_LABELS[k]}</span></span></li>; })}
    </ol>}
  </CardContent></Card>;

  const advancedLink = <div className="flex justify-center"><Button variant="ghost" size="sm" className="h-auto max-w-full whitespace-normal py-2 text-center text-xs text-muted-foreground" onClick={p.onAdvanced}>Advanced — view build details (page plan, facts, gates, every prompt) <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div>;

  if (optimiseClient) return <div className="space-y-4">{header}
    <Block title="Improve their existing site (Findable Optimise)">
      <p>This client keeps their own website. Findable never replaces, deploys over or takes it down — we improve it with new pages. That happens in the page generator, not here.</p>
      <p className="text-xs text-muted-foreground">Route from {pack.routeSource || 'their records'}.</p>
      <div className="flex flex-wrap gap-2"><Button asChild><Link to={'/page-generator?mode=service&client=' + encodeURIComponent(leadId)}>Open the page generator <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        <Button asChild variant="outline"><Link to={'/paid-clients/' + leadId}>Client page</Link></Button></div>
    </Block>{advancedLink}</div>;

  /* ── 1. what are we building ──────────────────────────────────────────────────────────────────── */
  const recommended = recommendedBuildType(hasOld);
  const typeCards = <div className="grid gap-2 sm:grid-cols-2">{BUILD_TYPES.map((t) => { const info = BUILD_TYPE_INFO[t]; const on = type === t;
    return <button key={t} type="button" onClick={() => chooseType(t)} aria-pressed={on}
      className={`min-w-0 rounded-lg border p-3 text-left transition hover:bg-muted/50 ${on ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}>
      <div className="flex flex-wrap items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{info.letter}</span>
        <span className="min-w-0 break-words font-semibold">{info.label}</span>
        {t === recommended && !on && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Suggested</span>}
        {on && <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">Chosen</span>}</div>
      <p className="mt-1 text-xs text-muted-foreground">{info.description}</p>
      {info.needsOldSite && !hasOld && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">No current website on record.</p>}
    </button>; })}</div>;

  const trade = pack.facts.find((f) => f.key === 'trade')?.value ?? '';
  const templatePicker = type === 'template' && <div className="space-y-2">
    <p className="text-xs font-medium">Template</p>
    <div className="grid gap-2 sm:grid-cols-2">{WEBSITE_TEMPLATES.map((t) => { const on = state.template_id === t.id; const fit = tradeFit(trade, t);
      return <button key={t.id} type="button" aria-pressed={on} onClick={() => update((s) => ({ ...s, template_id: t.id }))}
        className={`min-w-0 rounded-lg border p-3 text-left hover:bg-muted/50 ${on ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}>
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{t.name}</span><span className="text-xs text-muted-foreground">v{t.version}</span>
          {fit === 'compatible' && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Fits {trade}</span>}
          {fit === 'weak' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Built for {t.primaryTrade}s</span>}</div>
        <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
      </button>; })}</div>
  </div>;

  /* ── the problems list ───────────────────────────────────────────────────────────────────────── */
  const shown = issues.filter((x) => x.level !== 'launch');

  /* ── the facts that were gathered, as a compact line — not a checklist ───────────────────────── */
  const pub = (k: string) => pack.facts.find((f) => f.key === k && isPublishable(f))?.value ?? '';
  const gathered: Array<[string, string]> = [
    ['Business', pub('business_name')], ['Trade', pub('trade')], ['Phone', pub('phone')], ['Email', pub('email')], ['Home town', pub('primary_town')],
    ['Services', svc.services.length ? svc.services.length + (svc.clientConfirmed ? ' confirmed' : ' from sales notes') : ''],
    ['Not offered', svc.notOffered.length ? String(svc.notOffered.length) : ''],
    ['Areas', pub('service_areas') ? String(pub('service_areas').split(/[,;\n]/).filter((x) => x.trim()).length) : ''],
    ['Website', pack.existingSiteUrl], ['Web address', state.canonical_domain],
    ['Baseline questions', pack.evidence.frozenQuestions?.length ? String(pack.evidence.frozenQuestions.length) : ''],
    ['Current site read', p.crawl.status === 'none' ? '' : p.crawl.label],
  ];
  const crawling = !!crawlJob || p.crawl.status === 'crawling';

  return <div className="space-y-4">
    {header}

    {/* 1 — WHAT ARE WE BUILDING */}
    <Block n={1} title="What are we building?" done={!!type && !changeType}
      right={type && !changeType ? <Button size="sm" variant="outline" onClick={() => setChangeType(true)}>Change</Button> : undefined}>
      {(!type || changeType || type === 'legacy_bespoke') ? typeCards : <p className="text-sm">{BUILD_TYPE_INFO[type].description}</p>}
      {type === 'legacy_bespoke' && !changeType && <p className={`rounded-md border p-2 text-xs ${tone.warn}`}>{BUILD_TYPE_INFO.legacy_bespoke.description}</p>}
      {templatePicker}
    </Block>

    {type && <>
      {/* 2 — GATHER + PREPARE */}
      <Block n={2} title="Prepare website" done={progress.done.prepare}>
        <p className="text-xs text-muted-foreground">LeadFinder gathers what it already knows — client-confirmed facts first, then onboarding and sales, then their public website. Guesses and Discovery never become facts. You only see what needs a decision.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="lg" onClick={() => void prepare()} disabled={preparing}>{preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}{progress.done.gather ? 'Prepare again' : 'PREPARE WEBSITE'}</Button>
          {crawling && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading their current website…</span>}
        </div>
        {progress.done.gather && <div className="flex flex-wrap gap-1.5 text-[11px]">{gathered.filter(([, v]) => v).map(([k, v]) => <span key={k} className="max-w-full break-words rounded-full border px-2 py-0.5"><span className="text-muted-foreground">{k}:</span> {v}</span>)}</div>}
        {progress.done.gather && (shown.length
          ? <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide">Needs you</p>{shown.map((x) => <IssueCard key={x.id} issue={x} onFact={putFact} onType={chooseType} update={update} />)}</div>
          : <p className={`flex items-center gap-2 rounded-md border p-2 text-xs ${tone.ok}`}><CheckCircle2 className="h-4 w-4" />Nothing needs you. Everything else is decided automatically.</p>)}
        {!progress.done.gather && stops.length > 0 && stops.some((s) => s.id === 'route') && <IssueCard issue={stops.find((s) => s.id === 'route')!} onFact={putFact} onType={chooseType} update={update} />}
      </Block>

      {/* 3 — BUILD */}
      <Block n={3} title="Build the site with Claude" done={progress.done.build}>
        {!progress.done.gather ? <p className="text-xs text-muted-foreground">Press Prepare website first.</p>
          : master.blockedBy.length ? <p className={`rounded-md border p-2 text-xs ${tone.warn}`}><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />Sort {master.blockedBy.length === 1 ? 'the one thing' : 'the ' + master.blockedBy.length + ' things'} under Prepare first: {master.blockedBy.join(' · ')}</p>
          : <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" onClick={() => void copyMaster()}><Clipboard className="mr-2 h-4 w-4" />COPY MASTER BUILD PROMPT</Button>
              <Button variant="outline" size="sm" onClick={() => setShowPrompt((o) => !o)}>{showPrompt ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}{showPrompt ? 'Hide' : 'Show'} prompt</Button>
              <span className="text-xs text-muted-foreground">{master.text.length.toLocaleString()} characters · everything Claude needs, in one paste</span>
            </div>
            {showPrompt && <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 font-mono text-[11px] leading-relaxed">{master.text}</pre>}
          </>}
        {progress.done.gather && <details open={!b.result_imported_at} className="space-y-2 rounded-md border p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">What to do{b.result_imported_at ? ' (the build has run — open to see the steps again)' : ''}</summary>
          <ol className="space-y-3">{steps.map((st, n) => <li key={st.title} className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{n + 1}</span>
            <div className="min-w-0 flex-1 space-y-1"><p className="font-medium">{st.title}</p><p className="text-xs text-muted-foreground">{st.detail}</p>
              {st.command && <CommandBox command={st.command} onCopy={() => void p.copy('PowerShell command', st.command!)} />}
              {st.link && <a href={st.link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">{st.link.label}<ExternalLink className="h-3 w-3" /></a>}</div>
          </li>)}</ol>
          {cloudflareOneTimeSteps(pack).length > 0 && <details className="text-xs"><summary className="cursor-pointer font-medium">Cloudflare one-time setup (only if Claude says the project is not connected)</summary>
            <ol className="mt-2 list-none space-y-1 pl-1">{cloudflareOneTimeSteps(pack).map((l) => <li key={l} className="break-words">{l}</li>)}</ol></details>}
        </details>}
        {progress.done.gather && <div className="space-y-2">
          <p className="text-xs font-medium">Paste Claude’s result (its whole last message — LeadFinder finds the JSON)</p>
          <Textarea aria-label="Paste Claude's result" rows={3} className="font-mono text-xs" value={resultText} placeholder={'{ "buildResultVersion": 1, "status": "preview_ready", … }'} onChange={(e) => setResultText(e.target.value)} />
          <Button size="sm" disabled={!resultText.trim()} onClick={importResult}>Import result</Button>
        </div>}
      </Block>

      {/* 4 — REVIEW */}
      <Block n={4} title="Review the preview" done={progress.done.review}>
        {!b.result_imported_at ? <p className="text-xs text-muted-foreground">Appears once Claude’s result is imported. You check the real site — not a list of settings.</p> : <>
          <div className="flex flex-wrap gap-2">
            {pack.existingSiteUrl && <Button asChild variant="outline"><a href={pack.existingSiteUrl} target="_blank" rel="noreferrer">OPEN OLD SITE <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button>}
            {previewUrl ? <Button asChild><a href={previewUrl} target="_blank" rel="noreferrer">OPEN PREVIEW <ExternalLink className="ml-1 h-3.5 w-3.5" /></a></Button> : <span className="text-xs text-muted-foreground">No preview address reported yet.</span>}
            {pack.existingSiteUrl && previewUrl && <Button variant="outline" onClick={sideBySide}>REVIEW SIDE BY SIDE</Button>}
          </div>
          {pack.existingSiteUrl && previewUrl && <p className="text-xs text-muted-foreground">Side by side: the button opens both. If only one opens, open the other too, then press Windows key + ← on one and Windows key + → on the other.</p>}

          <div className={`rounded-md border p-3 ${tech.state === 'passed' ? tone.ok : tone.bad}`}>
            <p className="font-semibold">TECHNICAL CHECK {tech.state === 'passed' ? <span>✓ Passed</span> : <span>— {tech.failures.length} thing{tech.failures.length === 1 ? '' : 's'} need{tech.failures.length === 1 ? 's' : ''} fixing</span>}</p>
            {tech.state === 'failed' && <ul className="mt-1 list-disc space-y-0.5 break-words pl-5 text-xs">{tech.failures.slice(0, 12).map((f) => <li key={f}>{f}</li>)}</ul>}
            {tech.state === 'failed' && <p className="mt-1 text-xs">The correction prompt below already includes these.</p>}
            <details className="mt-2 text-xs"><summary className="cursor-pointer">View technical details</summary>
              <div className="mt-2 space-y-1 break-words">
                <p>Result: {b.result_status.replace('_', ' ')} · imported {b.result_imported_at.slice(0, 16).replace('T', ' ')}{b.commit_hash ? ' · commit ' + b.commit_hash : ''}</p>
                <p>Answered by the automatic gate: {Object.values(GATE_ANSWERED_QA).join(' · ')}</p>
                {tech.warnings.length > 0 && <><p className="font-medium">Warnings</p><ul className="list-disc pl-5">{tech.warnings.slice(0, 20).map((w) => <li key={w}>{w}</li>)}</ul></>}
                <button type="button" className="text-primary underline" onClick={p.onAdvanced}>Open the full rule engine (Advanced)</button>
              </div></details>
          </div>

          {(tech.assetChecks.length > 0 || tech.factChecks.length > 0) && <div className={`rounded-md border p-3 text-xs ${tone.warn}`}>
            {tech.factChecks.length > 0 && <><p className="font-semibold">Claims Claude left out until you confirm</p><ul className="list-disc pl-5">{tech.factChecks.slice(0, 15).map((x) => <li key={x}>{x}</li>)}</ul></>}
            {tech.assetChecks.length > 0 && <><p className="mt-1 font-semibold">Images Claude did not use (ownership unclear)</p><ul className="list-disc break-all pl-5">{tech.assetChecks.slice(0, 15).map((x) => <li key={x}>{x}</li>)}</ul></>}
            <p className="mt-1">If one is genuinely theirs, say so in Make changes (e.g. “the van photo is theirs — use it”).</p>
          </div>}

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide">Your review</p>
            {SIMPLE_REVIEW_ITEMS.map((it) => { const on = reviewItemDone(state, it, hasOld);
              return <label key={it.key} className="flex cursor-pointer items-start gap-2 rounded-md border p-2">
                <input type="checkbox" className="mt-1" aria-label={it.label} checked={on} onChange={(e) => update((s) => setReviewItem(s, it.key, e.target.checked, hasOld))} />
                <span className="min-w-0"><span className="font-medium">{it.label}</span><span className="block text-xs text-muted-foreground">{it.help}</span></span></label>; })}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="font-semibold">Make changes</p>
            <p className="text-xs text-muted-foreground">One change per line, in plain words: “Change the hero wording to …”, “Remove the Canterbury page”, “Use the older logo”, “Make the header darker”, “Service X shouldn’t be listed”.</p>
            <Textarea aria-label="Changes" rows={4} className="text-xs" value={state.corrections} onChange={(e) => update((s) => ({ ...s, corrections: e.target.value }))} placeholder={'- Remove the Canterbury page\n- Use the older logo'} />
            <Input aria-label="Main call to action" className="h-8 text-xs" value={state.primary_cta} placeholder="Main call to action on every page (optional), e.g. Call Gareth on 01632 960471" onChange={(e) => update((s) => ({ ...s, primary_cta: e.target.value }))} />
            {(() => { const cp = correctionPrompt({ ...pack, state: correctionsWithFailures(state, tech) });
              return <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={cp.blockedBy.length > 0} onClick={() => void p.copy('Correction prompt', cp.text)}><Clipboard className="mr-1 h-4 w-4" />COPY CORRECTION PROMPT</Button>
                <span className="text-xs text-muted-foreground">{cp.blockedBy.length ? cp.blockedBy.join(' · ') : 'Paste it into the same Claude window; it redeploys the preview and ends with a new result to paste above.'}</span>
              </div>; })()}
          </div>
        </>}
      </Block>

      {/* 5 — LAUNCH */}
      <Block n={5} title="Launch" done={progress.done.launch}>
        {issues.filter((x) => x.level === 'launch').map((x) => <IssueCard key={x.id} issue={x} onFact={putFact} onType={chooseType} update={update} />)}
        {progress.done.launch ? <p className={`flex items-center gap-2 rounded-md border p-2 ${tone.ok}`}><Rocket className="h-4 w-4" />Live at <a className="underline" href={state.production_url} target="_blank" rel="noreferrer">{state.production_url}</a> — the live check passed.</p>
          : p.launch.length ? <div className="text-xs"><p className="font-medium">Before launch:</p><ul className="mt-1 list-disc space-y-0.5 break-words pl-5">{launchLines(p.launch).slice(0, 10).map((l) => <li key={l}>{l}</li>)}</ul></div>
          : <div className="space-y-3">
            <p className={`rounded-md border p-2 font-semibold ${tone.ok}`}><Rocket className="mr-1 inline h-4 w-4" />READY TO LAUNCH</p>
            <ol className="space-y-3 text-xs">
              <li><b>1.</b> Open PowerShell and start Claude in the client’s folder: <CommandBox command={openClaudeCommand(state)} onCopy={() => void p.copy('PowerShell command', openClaudeCommand(state))} /></li>
              <li><b>2.</b> <Button size="sm" disabled={!p.productionPrompt || p.productionPrompt.blockedBy.length > 0} onClick={() => p.productionPrompt && void p.copy('Launch prompt', p.productionPrompt.text)}><Clipboard className="mr-1 h-4 w-4" />COPY LAUNCH PROMPT</Button> — paste it into Claude. It asks you before it publishes; say yes.</li>
              <li><b>3.</b> When it finishes it pastes the live check ({PRODUCTION_GATE_REPORT_FILE}). Paste it here:</li>
            </ol>
          </div>}
        {!progress.done.launch && p.launch.length === 0 && <div className="space-y-2">
          <Textarea aria-label="Paste the live check" rows={3} className="font-mono text-xs" value={liveText} placeholder={'{ "siteGateVersion": 1, "domain": "…", "mode": "url", … }'} onChange={(e) => setLiveText(e.target.value)} />
          <Button size="sm" disabled={!liveText.trim()} onClick={importLive}>Import live check</Button>
          {state.production_gate.imported_at && state.production_gate.passed !== true && <p className="text-xs text-red-700 dark:text-red-300">Last live check failed: {state.production_gate.fails.slice(0, 5).join('; ') || 'see Advanced'}</p>}
        </div>}
      </Block>
    </>}

    {advancedLink}
  </div>;
}

/* ── one problem, with its own fix ──────────────────────────────────────────────────────────────── */

function IssueCard({ issue, onFact, onType, update }: { issue: BuildIssue; onFact: (key: string, label: string, value: string) => void; onType: (t: BuildType) => void; update: UpdateFn }) {
  const cls = issue.level === 'blocker' ? tone.bad : tone.warn;
  return <div className={`space-y-2 rounded-md border p-3 ${cls}`}>
    <p className="flex items-start gap-2 font-medium">{issue.level === 'blocker' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}<span className="min-w-0 break-words">{issue.title}{issue.level === 'decide' && <span className="ml-1 text-xs font-normal">(does not stop the preview)</span>}</span></p>
    {issue.detail && <p className="break-words text-xs">{issue.detail}</p>}
    {issue.fixes.length > 0 && <div className="flex flex-wrap items-center gap-2">{issue.fixes.map((f, n) => <Fix key={n} fix={f} onFact={onFact} onType={onType} update={update} />)}</div>}
  </div>;
}

function Fix({ fix, onFact, onType, update }: { fix: IssueFix; onFact: (key: string, label: string, value: string) => void; onType: (t: BuildType) => void; update: UpdateFn }) {
  const [v, setV] = useState('');
  if (fix.kind === 'link') return <Button asChild size="sm" variant="outline" className="border-current bg-transparent text-inherit hover:bg-black/5"><Link to={fix.href}>{fix.label}</Link></Button>;
  if (fix.kind === 'switch_type') return <Button size="sm" variant="outline" className="border-current bg-transparent text-inherit hover:bg-black/5" onClick={() => onType(fix.to)}>{fix.label}</Button>;
  if (fix.kind === 'confirm_rights') return <Button size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal border-current bg-transparent text-inherit hover:bg-black/5 text-left" onClick={() => update((s) => ({ ...s, copy_ownership: 'client_permission' }))}>The client has confirmed they own / may reuse it</Button>;
  if (fix.kind === 'premises') return <><Button size="sm" variant="outline" className="border-current bg-transparent text-inherit hover:bg-black/5" onClick={() => update((s) => ({ ...s, mapping: { ...s.mapping, fields: { ...s.mapping.fields, mobile_or_premises: 'premises' } } }))}>Yes — show the address</Button>
    <Button size="sm" variant="outline" className="border-current bg-transparent text-inherit hover:bg-black/5" onClick={() => update((s) => ({ ...s, mapping: { ...s.mapping, fields: { ...s.mapping.fields, mobile_or_premises: 'mobile' } } }))}>No — mobile business</Button></>;
  if (fix.kind === 'domain') return <div className="flex w-full min-w-0 flex-wrap gap-2"><Input aria-label="Web address" className="h-8 min-w-0 flex-1 border-current bg-transparent text-inherit hover:bg-black/5 text-xs" value={v} placeholder="theirbusiness.co.uk" onChange={(e) => setV(e.target.value)} />
    <Button size="sm" disabled={!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(normDomain(v))} onClick={() => update((s) => ({ ...s, canonical_domain: normDomain(v) }))}>Save</Button></div>;
  return <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
    {fix.options.map((o) => <Button key={o} size="sm" variant="outline" className="h-auto min-h-8 max-w-full whitespace-normal break-words border-current bg-transparent text-inherit hover:bg-black/5 text-left" onClick={() => onFact(fix.key, fix.label, o)}>{fix.input ? 'Use ' : 'Confirm '}“{o.length > 80 ? o.slice(0, 80) + '…' : o}”</Button>)}
    {fix.input && <><Input aria-label={fix.label} className="h-8 min-w-0 flex-1 border-current bg-transparent text-inherit hover:bg-black/5 text-xs" value={v} placeholder={'Type the correct ' + fix.label.toLowerCase()} onChange={(e) => setV(e.target.value)} />
      <Button size="sm" disabled={!v.trim()} onClick={() => onFact(fix.key, fix.label, v)}>Save</Button></>}
  </div>;
}
