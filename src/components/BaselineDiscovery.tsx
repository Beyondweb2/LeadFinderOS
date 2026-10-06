import { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CollapsibleBlock } from '@/components/CollapsibleSection';
import { invokePaidBaseline, type PaidBaseline } from '@/lib/paidBaseline';
import { canonicalServices, coverageReport, sameIntent } from '@/lib/baselineMix';
import { OPPORTUNITY_GROUP_LABELS, type EngineTally, type OpportunityClass } from '@/lib/discoveryOpportunity';
import { measurementsLine, namedLine, REC_LABELS, type RecInput, type RecVerdict, type RecommendArgs } from '@/lib/baselineRecommendation';
import { BASELINE_QUESTIONS, BASELINE_RUNS } from '@/lib/auditQuestionCounts';
import { DISCOVERY_JOB_LABELS, DISCOVERY_ENGINES, ENGINE_LABELS, discoveryPlan, discoveryView, type DiscoveryProgress } from '@/lib/discoveryProgress';
import { buildServiceScope } from '@/lib/serviceScope';
import { TONE } from '@/components/operator/ui';
import { cn } from '@/lib/utils';

/* The operator look (components/operator/ui): a step is a soft wash, not another bordered box; a row is a light card. */
const STEP_BOX = 'rounded-2xl bg-muted/25 p-3 ring-1 ring-inset ring-border/50';
const ROW = 'rounded-xl bg-card ring-1 ring-inset ring-border/50';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DISCOVERY → THE RECOMMENDED OFFICIAL BASELINE (Paid Clients; rebuilt 2026-09-30, Paul).

   Discovery answers ONE question: "which questions should go into the official baseline?" Every
   Discovery question carries one plain verdict — RECOMMENDED FOR BASELINE / KEEP AS FUTURE
   OPPORTUNITY / NOT RECOMMENDED — with a one-line reason (src/lib/baselineRecommendation.ts). The
   classifier's Winnable / Possible / Already named / Weak is still computed and still shown, but
   under "Advanced", collapsed: it explains a question, it is not the decision.

   ⛔ MEASUREMENTS AND NAMINGS ARE TWO LINES, ALWAYS. "3/3" alone read as "named 3 of 3" when it meant
      "3 of 3 answers received": MEASUREMENTS ChatGPT 3/3 complete · Gemini 3/3 complete, then
      NAMED ChatGPT 0/3 · Gemini 0/3, then the opportunity.
   ⛔ Opening this spends nothing. "Generate Discovery questions" writes questions (no AI engine is
      asked). "Run Discovery" asks ChatGPT and Gemini and says its price on the button.
   ⛔ DISCOVERY IS A SERVER-SIDE JOB. This screen only READS its stored progress — in measurements,
      question × engine × run — and re-reads it while it runs.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const GROUP_ORDER: Array<OpportunityClass | 'unmeasured'> = ['winnable', 'possible', 'named', 'low', 'unmeasured'];
const GROUP_TONE: Record<OpportunityClass | 'unmeasured', string> = {
  winnable: TONE.green.text, possible: TONE.blue.text,
  named: TONE.purple.text, low: 'text-muted-foreground', unmeasured: 'text-muted-foreground',
};
const VERDICT_TONE: Record<RecVerdict, string> = {
  recommended: cn(TONE.green.soft, TONE.green.text, TONE.green.ring),
  future: cn(TONE.blue.soft, TONE.blue.text, TONE.blue.ring),
  not_recommended: cn(TONE.grey.soft, TONE.grey.text, TONE.grey.ring),
};

/** = _shared/baseline-discovery.ts DISCOVERY_RUNS (the server decides; this only prices the button). */
export const DISCOVERY_PLAN_RUNS = 3;

const hhmm = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmt = (n: number) => n.toLocaleString('en-GB');

/** MEASUREMENTS / NAMED / OPPORTUNITY — the three facts, labelled, never one bare "3/3". */
export function EngineLines({ engines, target, opportunity, compact = false }: { engines: EngineTally[] | null | undefined; target: number; opportunity?: string | null; compact?: boolean }) {
  const label = 'mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground';
  if (!engines?.some((e) => e.complete > 0)) return <p className="text-xs text-muted-foreground"><span className={label}>Measurements</span>not measured yet</p>;
  return <div className={`text-xs ${compact ? 'flex flex-wrap gap-x-3' : 'space-y-0.5'}`}>
    <p><span className={label}>Measurements</span>{measurementsLine(engines, target)}</p>
    <p><span className={label}>Named</span><span className="font-medium">{namedLine(engines)}</span></p>
    {opportunity && <p><span className={label}>Opportunity</span>{opportunity}</p>}
  </div>;
}

/** The job header: one progress bar, measurements first, then questions and engines. */
export function DiscoveryProgressPanel({ progress }: { progress: Omit<DiscoveryProgress, 'by_question'> }) {
  const p = progress;
  const tone = p.status === 'complete' ? TONE.green.text
    : p.status === 'running' ? TONE.blue.text
    : TONE.amber.text;
  return <div className={cn('mt-3 space-y-2 p-3 text-sm', ROW)} aria-live="polite">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{p.status === 'needs_attention' && p.done === 0 ? 'Discovery failed — needs attention' : DISCOVERY_JOB_LABELS[p.status]}</p>
      <p className="text-xs text-muted-foreground">Started {hhmm(p.started_at)} · last update {hhmm(p.updated_at)}{p.completed_at ? ` · finished ${hhmm(p.completed_at)}` : ''}</p>
    </div>
    <p><span className="text-lg font-semibold">{fmt(p.done)} / {fmt(p.total)}</span> measurements complete · {p.percent}%</p>
    <Progress value={p.percent} className="h-2" aria-label={`${p.done} of ${p.total} measurements complete`}/>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span>{fmt(p.questions_complete)} / {fmt(p.questions)} questions fully measured</span>
      {p.by_engine.map((e) => <span key={e.engine}>{ENGINE_LABELS[e.engine] ?? e.engine} {fmt(e.done)} / {fmt(e.total)} complete</span>)}
      {p.failed > 0 && <span className={TONE.amber.text}>Failed: {fmt(p.failed)}</span>}
    </div>
    {p.status === 'running' && <p className="text-xs text-muted-foreground">Runs on the server — you can close this and come back.</p>}
    {p.stalled && <p className={cn('flex items-start gap-1.5 text-xs', TONE.amber.text)}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>No new answers for over 20 minutes — the audit queue may be stuck.</p>}
    {p.status === 'needs_attention' && <p className={cn('flex items-start gap-1.5 text-xs', TONE.amber.text)}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{p.error ? `The run chain stopped: ${p.error}. ` : 'Nothing has moved for a while and no more runs are due. '}The answers so far are kept. Regenerate the Discovery questions to start a fresh Discovery.</p>}
    {p.status === 'complete_with_failures' && <p className="text-xs text-muted-foreground">{fmt(p.failed)} measurement{p.failed === 1 ? '' : 's'} failed after the queue's own retries; every successful answer is kept and used below.</p>}
  </div>;
}

/* THE DISCOVERY POLLER. While the pool's job is starting or running, re-read the STORED state
   (paid-baseline "get" — read-only: it asks no engine and writes nothing) and hand back ONLY the
   discovery block (and the recommendation built from it), so the draft questions and context being
   edited on screen are never overwritten. It stops by itself once the job is finished, and a read
   that lands while an action is in flight is dropped. Closing the dialog stops the poll, not the job. */
export const DISCOVERY_POLL_MS = 10_000;
export function useDiscoveryPoll(leadId: string, open: boolean, data: PaidBaseline | null, busy: boolean, onDiscovery: (d: PaidBaseline['discovery'], rec: PaidBaseline['recommendation']) => void) {
  const d = data?.discovery;
  const live = !!d && discoveryView({ poolSize: d.pool.length, starting: d.starting, audit: d.audit ?? null }, '').poll;
  const busyRef = useRef(busy); busyRef.current = busy;
  const cb = useRef(onDiscovery); cb.current = onDiscovery;
  useEffect(() => {
    if (!open || !live) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      if (busyRef.current) return;
      invokePaidBaseline('get', leadId)
        .then((next) => { if (!cancelled && !busyRef.current) cb.current(next.discovery, next.recommendation); })
        .catch(() => { /* a missed read is retried on the next tick; the job itself is unaffected */ });
    }, DISCOVERY_POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [open, live, leadId]);
}

export function mixContextOf(data: PaidBaseline) {
  const areas = (data.areas_list ?? []).filter((a) => a.trim().toLowerCase() !== (data.location ?? '').trim().toLowerCase());
  const towns = [data.location, ...areas].filter(Boolean);
  return { primaryTown: data.location ?? '', areas, services: canonicalServices(data.canonical_services?.length ? data.canonical_services : (data.services_list ?? []), towns) };
}

/** The recommendation inputs from what the server sent — the same shape paid-baseline builds. */
export function recArgsOf(data: PaidBaseline): Omit<RecommendArgs, 'target'> {
  const pool: RecInput[] = (data.discovery?.pool ?? []).map((p) => ({ question: p.question, engines: p.opportunity?.engines ?? null, verdict: p.opportunity?.verdict ?? null }));
  /* The same service scope and core questions the server uses (serviceScope.ts, 2026-10-04), so the
     screen's row reasons and the server's checks cannot disagree. */
  const scope = buildServiceScope({
    services: data.services_list ?? [], notOffered: data.services_not_offered ?? [], trade: data.business_type ?? '',
    towns: [data.location, ...(data.areas_list ?? [])].filter(Boolean),
  });
  return { hook: data.hook?.questions ?? [], pool, hookMeasures: data.hook?.measures ?? [], ctx: mixContextOf(data), trade: data.business_type ?? '', scope, core: data.core_questions ?? [] };
}
/** How many runs a question's tallies are out of: the Discovery job's target, or 1 for the Hook Audit. */
export function tallyTarget(data: PaidBaseline, question: string): number {
  const inPool = data.discovery?.pool.some((p) => p.question.trim().toLowerCase() === question.trim().toLowerCase() && p.opportunity);
  return inPool ? (data.discovery?.audit?.runs_target ?? DISCOVERY_PLAN_RUNS) : 1;
}

/** STEP 1 — the Hook Audit's questions: LOCKED IN. */
export function HookAuditStep({ data }: { data: PaidBaseline }) {
  const h = data.hook;
  const qs = h?.questions ?? [];
  return <CollapsibleBlock as="section" className={STEP_BOX} title="1. Hook Audit"
    summary={qs.length ? `${qs.length} original question${qs.length === 1 ? '' : 's'} · locked into the baseline` : 'No Hook Audit on record'}>
    {qs.length === 0
      ? <p className="text-sm text-muted-foreground">No Hook Audit is recorded for this client, so all {BASELINE_QUESTIONS} baseline questions come from Discovery.</p>
      : <ul className="space-y-1.5">{qs.map((q) => {
        const m = h?.measures.find((x) => x.question === q);
        return <li key={q} className={cn('px-2.5 py-1.5 text-sm', ROW)}>
          <div className="flex flex-wrap items-start justify-between gap-2"><span className="break-words">{q}</span><HookBadge/></div>
          <EngineLines engines={m?.engines} target={1} compact/>
        </li>;
      })}</ul>}
    {qs.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Kept word for word in the official baseline, for continuity from the first check to the re-measure. Replacing one needs a written reason.</p>}
  </CollapsibleBlock>;
}
export const HookBadge = () => <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset', TONE.purple.soft, TONE.purple.text, TONE.purple.ring)}>Hook Audit · locked in</span>;

/** STEP 2 — Discovery: generate, run, and the one plain verdict per question. */
export function DiscoverySection({ data, questions, busy, frozen, onGenerate, onRun, onAdd }: {
  data: PaidBaseline; questions: string[]; busy: boolean; frozen: boolean;
  onGenerate: () => void; onRun: () => void; onAdd: (q: string) => void;
}) {
  const d = data.discovery;
  const ctx = useMemo(() => mixContextOf(data), [data]);
  const towns = [ctx.primaryTown, ...ctx.areas];
  const measured = !!d?.pool.some((p) => p.opportunity);
  const inDraft = (q: string) => questions.some((x) => x.trim().toLowerCase() === q.trim().toLowerCase() || sameIntent(x, q, towns));
  const plan = discoveryPlan(d?.pool.length ?? 0, DISCOVERY_PLAN_RUNS, DISCOVERY_ENGINES.length);
  const view = discoveryView({ poolSize: d?.pool.length ?? 0, starting: d?.starting, audit: d?.audit ?? null },
    `Run Discovery — ${plan.measurements} measurements · about ${(d?.estimate_usd ?? 0).toFixed(2)}`);
  const target = d?.audit?.runs_target ?? DISCOVERY_PLAN_RUNS;
  const rec = data.recommendation;
  const byVerdict = useMemo(() => {
    const m: Record<RecVerdict, NonNullable<typeof rec>['pool']> = { recommended: [], future: [], not_recommended: [] };
    for (const p of rec?.pool ?? []) m[p.verdict].push(p);
    return m;
  }, [rec]);
  const classes = useMemo(() => {
    const m = new Map<string, NonNullable<PaidBaseline['discovery']>['pool']>();
    for (const p of d?.pool ?? []) { const k = p.opportunity?.classification ?? 'unmeasured'; (m.get(k) ?? m.set(k, []).get(k)!).push(p); }
    return GROUP_ORDER.filter((g) => m.has(g)).map((k) => ({ key: k, items: m.get(k)! }));
  }, [d]);
  const status = !d?.pool.length ? 'Not generated yet' : view.status === 'complete' ? 'Complete' : view.status === 'running' ? 'Running' : view.status === 'starting' ? 'Starting' : d.audit ? DISCOVERY_JOB_LABELS[view.status as keyof typeof DISCOVERY_JOB_LABELS] ?? 'Finished' : 'Questions ready — not measured yet';

  return <CollapsibleBlock as="section" className={STEP_BOX} title="2. Discovery"
    summary={`${d?.pool.length ? `${d.pool.length} questions across ${towns.filter(Boolean).length} town${towns.filter(Boolean).length === 1 ? '' : 's'}` : 'wider research'} · ${status}`}
    actions={!frozen && <>
      <Button size="sm" variant="outline" disabled={busy || !view.canRegenerate} onClick={onGenerate} title={view.canRegenerate ? undefined : 'Discovery is measuring these questions — regenerate once it has finished.'}><Sparkles className="mr-1 h-4 w-4" />{d?.pool.length ? 'Regenerate questions' : 'Generate Discovery questions'}</Button>
      {!!d?.pool.length && <Button size="sm" variant={view.canRun ? 'default' : 'secondary'} disabled={busy || !view.canRun} onClick={onRun}
        title="Asks ChatGPT and Gemini each Discovery question, three times. Starts one job on the server.">
        {view.poll ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}{view.buttonLabel}
      </Button>}
    </>}>
    <p className="text-xs text-muted-foreground">Explores genuine services, areas and customer intents beyond the baseline. Research only — never frozen, never part of the guarantee. Generating asks no AI engine; running costs what the button says.</p>
    {view.canRun && <p className="mt-1 text-xs">About to run: {plan.questions} questions × {plan.engines} engines × {plan.runs} runs = <b>{plan.measurements} measurements</b> · about ${(d?.estimate_usd ?? 0).toFixed(2)}.</p>}
    {view.status === 'starting' && <p className={cn('mt-1 text-xs', TONE.blue.text)}>Discovery is starting on the server…</p>}
    {d?.mismatch && <p className={cn('mt-1 text-xs', TONE.amber.text)}>An earlier Discovery (audit {d.mismatch.audit_id.slice(0, 8)}) measured a different question set. Its results stay on that audit and are not mixed in.</p>}
    {d?.audit?.progress && <DiscoveryProgressPanel progress={d.audit.progress}/>}
    {d?.towns_failed?.length ? <p className={cn('mt-1 text-xs', TONE.amber.text)}>No questions came back for: {d.towns_failed.join(', ')} — regenerate to retry.</p> : null}
    {/* 2026-10-04 (fix/04): questions the generator wrote about a service the client does not offer or
        never confirmed are kept OUT of the pool — listed here so nothing disappears silently. */}
    {d?.rejected?.length ? <CollapsibleBlock defaultOpen={false} titleClassName="text-xs text-muted-foreground" title={`${d.rejected.length} generated question${d.rejected.length === 1 ? '' : 's'} kept out — not a confirmed service`}>
      <ul className="ml-4 list-disc text-xs text-muted-foreground">{d.rejected.map((r) => <li key={r.question}>{r.question} — {r.reason}</li>)}</ul>
    </CollapsibleBlock> : null}
    {!!d?.pool.length && rec && <div className="mt-3 space-y-2">
      {view.provisional && measured && <p className={cn('rounded-xl px-2.5 py-1.5 text-xs font-medium', TONE.amber.tint, TONE.amber.text)}>{view.status === 'running' ? 'Provisional — Discovery still running. The verdicts below will change as answers arrive.' : 'Provisional — Discovery did not finish. The verdicts use the answers it collected.'}</p>}
      <p className="text-sm font-medium">Which questions should go into the official baseline?</p>
      {(['recommended', 'future', 'not_recommended'] as RecVerdict[]).map((v) => byVerdict[v].length > 0 && (
        <CollapsibleBlock key={v} defaultOpen={false} className={cn('px-2.5 py-1.5', ROW)} titleClassName="text-sm"
          title={<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${VERDICT_TONE[v]}`}>{REC_LABELS[v]} · {byVerdict[v].length}</span>}>
          <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">{byVerdict[v].map((p) => {
            const added = inDraft(p.question);
            return <li key={p.question} className="flex items-start justify-between gap-2 rounded-xl bg-muted/30 px-2.5 py-1.5 text-sm">
              <div className="min-w-0 space-y-0.5">
                <p className="break-words">{p.question}</p>
                <p className="text-xs text-muted-foreground">{[p.service ?? 'general', p.town ?? 'no approved town'].join(' · ')}</p>
                <p className="text-xs">{p.reason}</p>
                <EngineLines engines={p.engines} target={target} compact/>
              </div>
              {!frozen && v !== 'recommended' && <Button size="sm" variant={added ? 'ghost' : 'outline'} className="h-7 shrink-0 text-xs" disabled={added || busy} onClick={() => onAdd(p.question)} title="Override the recommendation and put this in the draft">
                {added ? 'In baseline' : <><Plus className="mr-1 h-3.5 w-3.5" />Add</>}
              </Button>}
            </li>;
          })}</ul>
        </CollapsibleBlock>
      ))}
      {measured && <CollapsibleBlock defaultOpen={false} className="rounded-xl border border-dashed border-border/70 px-2.5 py-1.5" titleClassName="text-xs text-muted-foreground" title="Advanced — the classifier's groups"
        summary={classes.map((g) => `${g.key === 'unmeasured' ? 'Not answered' : OPPORTUNITY_GROUP_LABELS[g.key as OpportunityClass]} ${g.items.length}`).join(' · ')}>
        <p className="mb-2 text-xs text-muted-foreground">Winnable / Possible / Already named / Weak explain a question; the verdicts above decide. Already named = named in at least one answer.</p>
        <div className="space-y-2">{classes.map((g) => <CollapsibleBlock key={g.key} defaultOpen={false} titleClassName={`text-xs font-semibold uppercase tracking-wide ${GROUP_TONE[g.key]}`}
          title={`${g.key === 'unmeasured' ? 'Not answered yet' : OPPORTUNITY_GROUP_LABELS[g.key as OpportunityClass]} (${g.items.length})`}>
          <ul className="max-h-[360px] space-y-1 overflow-y-auto pr-1">{g.items.map((p) => <li key={p.question} className="rounded-xl bg-muted/30 px-2.5 py-1 text-sm">
            <p className="break-words">{p.question}</p>
            <EngineLines engines={p.opportunity?.engines} target={target} opportunity={p.opportunity ? `${OPPORTUNITY_GROUP_LABELS[p.opportunity.classification]} — ${p.opportunity.fragmentation}. ${p.opportunity.reason}` : null}/>
          </li>)}</ul>
        </CollapsibleBlock>)}</div>
      </CollapsibleBlock>}
    </div>}
  </CollapsibleBlock>;
}

/** STEP 3 — the recommendation, prominent: what it is and why, from the actual questions. */
export function RecommendationStep({ data, busy, frozen, draftIsRecommendation, onUse }: { data: PaidBaseline; busy: boolean; frozen: boolean; draftIsRecommendation: boolean; onUse: () => void }) {
  const rec = data.recommendation;
  if (!rec) return null;
  const s = rec.summary;
  const measuredDone = data.discovery?.audit?.progress?.status === 'complete' || data.discovery?.audit?.progress?.status === 'complete_with_failures';
  const heading = !data.discovery?.pool.length ? 'Recommendation — generate Discovery first'
    : measuredDone ? 'Baseline recommendation ready' : data.discovery?.audit ? 'Recommendation (provisional — Discovery still measuring)' : 'Recommendation (balance only — Discovery not measured yet)';
  return <section className={cn('rounded-2xl p-3', TONE.blue.tint)}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className={cn('text-xs font-semibold uppercase tracking-wide', TONE.blue.text)}>3. {heading}</p>
        <p className="mt-0.5 text-sm"><b>{s.total} questions recommended</b>{s.fromHook ? ` · ${s.fromHook} from Hook Audit` : ''} · {s.fromDiscovery} from Discovery{rec.short ? ` · ${rec.short} short — add questions by hand` : ''}</p>
      </div>
      {!frozen && <Button size="sm" disabled={busy || !s.total} variant={draftIsRecommendation ? 'outline' : 'default'} onClick={onUse}>
        {draftIsRecommendation ? <><CheckCircle2 className="mr-1 h-4 w-4"/>Draft matches — rebuild</> : 'Use recommended baseline'}
      </Button>}
    </div>
    {s.why.length > 0 && <div className="mt-2 text-xs"><p className="font-medium">Why these:</p><ul className="ml-4 list-disc">{s.why.map((w) => <li key={w}>{w}</li>)}</ul></div>}
    <p className="mt-2 text-xs text-muted-foreground">Chosen for balance first — services, towns and intent — then, between equals, where the business is not yet named. Never simply the easiest questions.</p>
  </section>;
}

/** Where the draft sits, before the freeze. Recomputed live from the questions on screen. */
export function CoveragePanel({ data, questions }: { data: PaidBaseline; questions: string[] }) {
  const ctx = useMemo(() => mixContextOf(data), [data]);
  const r = useMemo(() => coverageReport(questions, ctx, BASELINE_QUESTIONS), [questions, ctx]);
  return <div className="mt-3 space-y-2 text-xs">
    {r.warnings.length > 0 && <ul className="space-y-0.5">{r.warnings.map((w) => <li key={w} className={cn('flex items-start gap-1.5', TONE.amber.text)}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}</ul>}
    {r.unusedAreas.length > 0 && <p className="text-muted-foreground">{r.unusedAreas.length} approved area{r.unusedAreas.length === 1 ? ' is' : 's are'} not individually represented ({r.unusedAreas.join(', ')}). That is fine — coverage is representative, and they stay in the Opportunity Backlog.</p>}
    {r.duplicates.length > 0 && <div><p className={cn('font-medium', TONE.amber.text)}>Near-duplicates — the same question in different words:</p>
      <ul className="ml-4 list-disc">{r.duplicates.map(([a, b]) => <li key={`${a}-${b}`}>#{a + 1} “{questions.filter((q) => q.trim())[a]}” ≈ #{b + 1} “{questions.filter((q) => q.trim())[b]}”</li>)}</ul></div>}
    <p className="text-muted-foreground">{BASELINE_RUNS} runs · ChatGPT + Gemini · exactly {BASELINE_QUESTIONS} questions.</p>
  </div>;
}

export const nearDuplicateCount = (data: PaidBaseline, questions: string[]) => coverageReport(questions, mixContextOf(data), BASELINE_QUESTIONS).duplicates.length;

export function BusyNote({ text }: { text: string }) {
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{text}</span>;
}
