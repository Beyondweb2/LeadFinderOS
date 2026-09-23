import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { invokePaidBaseline, type PaidBaseline } from '@/lib/paidBaseline';
import { canonicalServices, coverageReport, INTENT_LABELS, sameIntent, type IntentType } from '@/lib/baselineMix';
import { OPPORTUNITY_GROUP_LABELS, type OpportunityClass } from '@/lib/discoveryOpportunity';
import { BASELINE_QUESTIONS, BASELINE_RUNS } from '@/lib/auditQuestionCounts';
import { DISCOVERY_JOB_LABELS, DISCOVERY_ENGINES, ENGINE_LABELS, discoveryPlan, discoveryView, namedLine, questionProgressLine, type DiscoveryProgress } from '@/lib/discoveryProgress';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DISCOVERY → BASELINE (Paid Clients, 2026-09-23).

   Discovery explores a WIDE pool across the home town and every approved service area; Paul adds
   the questions worth measuring to the baseline draft, or asks for a balanced draft; the coverage
   summary shows, before the freeze, where the 20 sit by town, service and intent.
   ⛔ Opening this spends nothing. "Generate Discovery questions" writes questions (no AI engine is
   asked). "Run Discovery" asks ChatGPT and Gemini and says its price on the button.
   ⛔ Winnability is shown to inform, never to choose: the balanced generator does not read it.
   ⛔ DISCOVERY IS A SERVER-SIDE JOB (an ordinary audit in the queue). This screen only READS its
   stored progress — in measurements, question × engine × run — and re-reads it while it runs. Closing
   the dialog, leaving the page or refreshing changes nothing; reopening shows the same numbers.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const GROUP_ORDER: Array<OpportunityClass | 'unmeasured'> = ['winnable', 'possible', 'named', 'low', 'unmeasured'];
const GROUP_TONE: Record<OpportunityClass | 'unmeasured', string> = {
  winnable: 'text-emerald-700 dark:text-emerald-300', possible: 'text-sky-700 dark:text-sky-300',
  named: 'text-violet-700 dark:text-violet-300', low: 'text-muted-foreground', unmeasured: 'text-muted-foreground',
};

/** = _shared/baseline-discovery.ts DISCOVERY_RUNS (the server decides; this only prices the button). */
export const DISCOVERY_PLAN_RUNS = 3;

const hhmm = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
const fmt = (n: number) => n.toLocaleString('en-GB');

/** The job header: one progress bar, measurements first, then questions and engines. */
export function DiscoveryProgressPanel({ progress }: { progress: Omit<DiscoveryProgress, 'by_question'> }) {
  const p = progress;
  const tone = p.status === 'complete' ? 'text-emerald-700 dark:text-emerald-300'
    : p.status === 'running' ? 'text-sky-700 dark:text-sky-300'
    : 'text-amber-700 dark:text-amber-300';
  return <div className="mt-3 space-y-2 rounded-md border bg-background p-3 text-sm" aria-live="polite">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{p.status === 'needs_attention' && p.done === 0 ? 'Discovery failed — needs attention' : DISCOVERY_JOB_LABELS[p.status]}</p>
      <p className="text-xs text-muted-foreground">Started {hhmm(p.started_at)} · last update {hhmm(p.updated_at)}{p.completed_at ? ` · finished ${hhmm(p.completed_at)}` : ''}</p>
    </div>
    <p><span className="text-lg font-semibold">{fmt(p.done)} / {fmt(p.total)}</span> measurements · {p.percent}%</p>
    <Progress value={p.percent} className="h-2" aria-label={`${p.done} of ${p.total} measurements complete`}/>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span>{fmt(p.questions_complete)} / {fmt(p.questions)} questions fully measured</span>
      {p.by_engine.map((e) => <span key={e.engine}>{ENGINE_LABELS[e.engine] ?? e.engine} {fmt(e.done)} / {fmt(e.total)}</span>)}
      {p.failed > 0 && <span className="text-amber-700 dark:text-amber-300">Failed: {fmt(p.failed)}</span>}
    </div>
    <p className="text-xs text-muted-foreground">{p.questions} questions × {p.engines.length} engines × {p.runs_target} runs. It runs on the server — close this, leave the page or refresh; the progress is kept and shown again when you come back.</p>
    {p.stalled && <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>No new answers for over 20 minutes — the audit queue may be stuck.</p>}
    {p.status === 'needs_attention' && <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{p.error ? `The run chain stopped: ${p.error}. ` : 'Nothing has moved for a while and no more runs are due. '}The answers so far are kept. Regenerate the Discovery questions to start a fresh Discovery.</p>}
    {p.status === 'complete_with_failures' && <p className="text-xs text-muted-foreground">{fmt(p.failed)} measurement{p.failed === 1 ? '' : 's'} failed after the queue's own retries; every successful answer is kept and used below.</p>}
  </div>;
}

/* THE DISCOVERY POLLER. While the pool's job is starting or running, re-read the STORED state
   (paid-baseline "get" — read-only: it asks no engine and writes nothing) and hand back ONLY the
   discovery block, so the draft questions and context being edited on screen are never overwritten.
   It stops by itself once the job is finished, and a read that lands while an action is in flight
   is dropped (the action's own answer is newer). Closing the dialog stops the poll, not the job. */
export const DISCOVERY_POLL_MS = 10_000;
export function useDiscoveryPoll(leadId: string, open: boolean, data: PaidBaseline | null, busy: boolean, onDiscovery: (d: PaidBaseline['discovery']) => void) {
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
        .then((next) => { if (!cancelled && !busyRef.current) cb.current(next.discovery); })
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

export function DiscoverySection({ data, questions, busy, frozen, onGenerate, onRun, onAdd }: {
  data: PaidBaseline; questions: string[]; busy: boolean; frozen: boolean;
  onGenerate: () => void; onRun: () => void; onAdd: (q: string) => void;
}) {
  const d = data.discovery;
  const ctx = useMemo(() => mixContextOf(data), [data]);
  const towns = [ctx.primaryTown, ...ctx.areas];
  const [groupBy, setGroupBy] = useState<'opportunity' | 'town'>('opportunity');
  const measured = !!d?.pool.some((p) => p.opportunity);
  const inDraft = (q: string) => questions.some((x) => x.trim().toLowerCase() === q.trim().toLowerCase() || sameIntent(x, q, towns));
  const plan = discoveryPlan(d?.pool.length ?? 0, DISCOVERY_PLAN_RUNS, DISCOVERY_ENGINES.length);
  const view = discoveryView({ poolSize: d?.pool.length ?? 0, starting: d?.starting, audit: d?.audit ?? null },
    `Run Discovery — ${plan.measurements} measurements · about ${(d?.estimate_usd ?? 0).toFixed(2)}`);
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<PaidBaseline['discovery']>['pool']>();
    for (const p of d?.pool ?? []) {
      const k = groupBy === 'opportunity' && measured ? (p.opportunity?.classification ?? 'unmeasured') : (p.town ?? 'No town');
      (m.get(k) ?? m.set(k, []).get(k)!).push(p);
    }
    const keys = groupBy === 'opportunity' && measured ? GROUP_ORDER.filter((g) => m.has(g)) : [...m.keys()].sort((a, b) => (a === ctx.primaryTown ? -1 : b === ctx.primaryTown ? 1 : a.localeCompare(b)));
    return keys.map((k) => ({ key: k, items: m.get(k)! }));
  }, [d, groupBy, measured, ctx.primaryTown]);

  return <section className="rounded-md border p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="font-medium">B. Discovery — explore before choosing the baseline</h3>
        <p className="text-sm text-muted-foreground">A wide pool across {ctx.primaryTown || 'the home town'}{ctx.areas.length ? ` and ${ctx.areas.length} approved area${ctx.areas.length === 1 ? '' : 's'} (${ctx.areas.join(', ')})` : ''}, from {ctx.services.length} approved service{ctx.services.length === 1 ? '' : 's'}. Add the questions worth measuring to the baseline. Discovery is research — it is never frozen and never compared.</p>
      </div>
      {!frozen && <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy || !view.canRegenerate} onClick={onGenerate} title={view.canRegenerate ? undefined : 'Discovery is measuring these questions — regenerate once it has finished.'}><Sparkles className="mr-1 h-4 w-4" />{d?.pool.length ? 'Regenerate Discovery questions' : 'Generate Discovery questions'}</Button>
        {!!d?.pool.length && <Button size="sm" variant={view.canRun ? 'outline' : 'secondary'} disabled={busy || !view.canRun} onClick={onRun}
          title="Asks ChatGPT and Gemini each Discovery question, three times — the same engine as every Discovery scan. Starts one job on the server.">
          {view.poll ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}{view.buttonLabel}
        </Button>}
      </div>}
    </div>
    <p className="mt-1 text-xs text-muted-foreground">Generating questions asks no AI engine. Running Discovery does, and costs what the button says.</p>
    {view.canRun && <p className="mt-1 text-xs">About to run: {plan.questions} questions · {plan.engines} engines · {plan.runs} runs = <b>{plan.measurements} measurements</b> · estimated cost about ${(d?.estimate_usd ?? 0).toFixed(2)}.</p>}
    {view.status === 'starting' && <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">Discovery is starting on the server…</p>}
    {d?.mismatch && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">An earlier Discovery (audit {d.mismatch.audit_id.slice(0, 8)}) measured a different question set. Its results are kept on that audit and are not mixed into these questions.</p>}
    {d?.audit?.progress && <DiscoveryProgressPanel progress={d.audit.progress}/>}
    {d?.towns_failed?.length ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">No questions came back for: {d.towns_failed.join(', ')} — regenerate to retry.</p> : null}
    {!!d?.pool.length && <>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{d.pool.length} Discovery questions{d.generated_at ? ` · generated ${new Date(d.generated_at).toLocaleString('en-GB')}` : ''}{d.audit ? '' : ' · not measured yet'}</span>
        {measured && <span className="ml-auto flex gap-1">
          <Button size="sm" variant={groupBy === 'opportunity' ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setGroupBy('opportunity')}>By opportunity</Button>
          <Button size="sm" variant={groupBy === 'town' ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setGroupBy('town')}>By town</Button>
        </span>}
      </div>
      {measured && view.provisional && <p className="mt-1 rounded border border-amber-300/60 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">{view.status === 'running' ? 'Provisional — Discovery still running. These groups are from the answers so far and will change.' : 'Provisional — Discovery did not finish. These groups are from the answers it collected.'}</p>}
      {measured && <p className="mt-1 text-xs text-muted-foreground">Winnable / Possible / Already named / Weak come from the existing winnability classifier over the Discovery runs. They explain a question; they do not decide the baseline — a baseline of only easy questions would not measure the business.</p>}
      <div className="mt-2 max-h-[340px] space-y-3 overflow-y-auto pr-1">{groups.map((g) => <div key={g.key}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${GROUP_TONE[g.key as keyof typeof GROUP_TONE] ?? 'text-muted-foreground'}`}>
          {groupBy === 'opportunity' && measured ? (g.key === 'unmeasured' ? 'Not answered yet' : OPPORTUNITY_GROUP_LABELS[g.key as OpportunityClass]) : g.key} · {g.items.length}{groupBy === 'opportunity' && measured && view.provisional && g.key !== 'unmeasured' ? ' · provisional' : ''}
        </p>
        <ul className="mt-1 space-y-1">{g.items.map((p) => {
          const added = inDraft(p.question);
          return <li key={p.question} className="flex items-start justify-between gap-2 rounded border px-2 py-1 text-sm">
            <div className="min-w-0">
              <p className="break-words">{p.question}</p>
              <p className="text-xs text-muted-foreground">{[p.town ?? 'no town', p.service ?? 'no specific service', INTENT_LABELS[p.intent as IntentType] ?? p.intent].join(' · ')}
</p>
              {p.progress && <p className={`text-xs ${p.progress.state === 'complete' ? 'text-emerald-700 dark:text-emerald-300' : p.progress.state === 'complete_with_issue' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                {p.progress.state === 'complete' ? 'Complete · ' : p.progress.state === 'complete_with_issue' ? 'Complete with issue · ' : p.progress.state === 'running' ? 'Running · ' : ''}{questionProgressLine(p.progress)}</p>}
              {p.opportunity && <p className="text-xs text-muted-foreground">{namedLine(p.opportunity, p.progress?.state)} · {p.opportunity.fragmentation} — {p.opportunity.reason}</p>}
            </div>
            {!frozen && <Button size="sm" variant={added ? 'ghost' : 'outline'} className="h-7 shrink-0 text-xs" disabled={added || busy} onClick={() => onAdd(p.question)}>
              {added ? 'In baseline' : <><Plus className="mr-1 h-3.5 w-3.5" />Add to baseline</>}
            </Button>}
          </li>;
        })}</ul>
      </div>)}</div>
    </>}
  </section>;
}

/** Where the draft sits, before the freeze. Recomputed live from the questions on screen. */
export function CoveragePanel({ data, questions }: { data: PaidBaseline; questions: string[] }) {
  const ctx = useMemo(() => mixContextOf(data), [data]);
  const r = useMemo(() => coverageReport(questions, ctx, BASELINE_QUESTIONS), [questions, ctx]);
  const f = (n: number) => n.toLocaleString('en-GB');
  return <div className="mt-3 space-y-2 rounded-md border bg-background p-3 text-xs">
    <p className="text-sm font-medium">{f(r.total)} / {BASELINE_QUESTIONS} selected · {BASELINE_RUNS} runs · ChatGPT + Gemini</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">Areas</p>
        <ul>{r.areas.map((a) => <li key={a.town} className={a.count === 0 ? 'text-muted-foreground' : ''}>{a.town} — {a.count}</li>)}{r.noTown > 0 && <li className="text-muted-foreground">No town named — {r.noTown}</li>}</ul></div>
      <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">Services</p>
        <ul>{r.services.map((s) => <li key={s.service}>{s.service} — {s.count}</li>)}{r.noService > 0 && <li className="text-muted-foreground">General / no single service — {r.noService}</li>}</ul></div>
      <div><p className="font-semibold uppercase tracking-wide text-muted-foreground">Intent types</p>
        <ul>{(Object.keys(INTENT_LABELS) as IntentType[]).map((k) => <li key={k}>{INTENT_LABELS[k]} — {r.intents[k]}</li>)}</ul>
        <p className="mt-1 text-muted-foreground">Guide for 20: 4–5 broad · 7–8 service · 5–6 service + other area · 2–3 emergency/problem.</p></div>
    </div>
    {r.warnings.length > 0 && <ul className="space-y-0.5">{r.warnings.map((w) => <li key={w} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</li>)}</ul>}
    {r.duplicates.length > 0 && <div><p className="font-medium text-amber-700 dark:text-amber-300">Near-duplicates — the same question in different words:</p>
      <ul className="ml-4 list-disc">{r.duplicates.map(([a, b]) => <li key={`${a}-${b}`}>#{a + 1} “{questions.filter((q) => q.trim())[a]}” ≈ #{b + 1} “{questions.filter((q) => q.trim())[b]}”</li>)}</ul></div>}
  </div>;
}

export const nearDuplicateCount = (data: PaidBaseline, questions: string[]) => coverageReport(questions, mixContextOf(data), BASELINE_QUESTIONS).duplicates.length;

export function BusyNote({ text }: { text: string }) {
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{text}</span>;
}
