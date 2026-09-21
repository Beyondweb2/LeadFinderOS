/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   AUDIT RUN FINALISATION — a settled run is released even when competitor cleaning cannot finish.

   THE INCIDENT (2026-09-20/21): OpenAI answered 429 to extract-competitors; the finaliser held every
   settled run `pending` for its cleaning and re-invoked the cleaner on every 30-second tick with no
   cap on that path. Six runs showed "running 40/40 / 3/3 / 1/1" for a day, attempts reached the
   thousands, and three adaptive hooks plus two first-reply pitches were blocked behind results that
   never reached `complete`. RETRY_CLEAN_CAP bounded only the separate sweep.

   The pure decisions now live in _shared/run-finalise.ts and are driven here by a tiny tick model of
   the finaliser: no database, no provider, no OpenAI. The source-shape checks at the end pin the
   wiring the pure functions cannot see.

   Run: npx tsx scripts/audit-finalise-lifecycle.test.ts
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RETRY_CLEAN_CAP,
  cleaningState,
  finaliseReadiness,
  markCleaningExhausted,
  runSettlement,
  shouldInvokeCleaning,
} from '../supabase/functions/_shared/run-finalise.ts';
import {
  HOOK_MAX_QUESTIONS,
  advanceHookState,
  evaluateHookQuestion,
  initialHookState,
  type HookState,
} from '../src/lib/hookAudit.ts';
import { HOOK_NO_GAP_REASON, hookForbidsAbsenceCopy } from '../supabase/functions/_shared/audit-reply.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  console.log(`${value ? 'PASS' : 'FAIL'} ${message}`);
  if (!value) failures++;
}

/* ── A tick model of finaliseSettledRuns, over one in-memory run ──────────────────────────────── */
type RunStatus = 'pending' | 'running' | 'processing' | 'complete' | 'failed' | 'capped' | 'cancelled';
interface Run {
  status: RunStatus;
  /** ai_audit_queue.status per provider row. */
  rows: string[];
  results: Record<string, unknown>;
  hasSite: boolean;
  isCapped?: boolean;
}
interface Counters { cleaningCalls: number; finalised: number; advanceCalls: number; stampWrites: number; runsInserted: number; rowsInserted: number }
const counters = (): Counters => ({ cleaningCalls: 0, finalised: 0, advanceCalls: 0, stampWrites: 0, runsInserted: 0, rowsInserted: 0 });

/** One finaliser tick. Mirrors the order in process-ai-audit-queue: pick open runs → settle gate →
 *  flip to processing → (maybe) invoke cleaning → crawl → readiness → release or hold. */
function tick(run: Run, c: Counters, cleaner: () => boolean): 'skipped' | 'wait' | 'held' | 'finalised' {
  if (!['pending', 'running', 'processing'].includes(run.status)) return 'skipped'; // not an open run
  const settlement = runSettlement(run.rows, run.isCapped === true);
  if (!settlement.allSettled) return 'wait';
  const prevStatus = run.status;
  run.status = 'processing';
  const reEntry = prevStatus === 'pending' || prevStatus === 'running' || prevStatus === 'processing';
  if (reEntry && shouldInvokeCleaning(run.results.competitor_cleaning, settlement.allFailed)) {
    c.cleaningCalls++;
    const prev = Number((run.results.competitor_cleaning as { attempts?: number } | undefined)?.attempts ?? 0);
    run.results.competitor_cleaning = cleaner()
      ? { at: 'now', attempts: prev + 1, complete: true, errors: [] }
      : { at: 'now', attempts: prev + 1, complete: false, errors: ['invoke HTTP 502: openai_http_429'] };
  }
  if (run.hasSite && !run.results.crawl_check) run.results.crawl_check = { status: 'complete' };
  const crawl = run.results.crawl_check as { status?: string } | undefined;
  const readiness = finaliseReadiness({ allFailed: settlement.allFailed, stamp: run.results.competitor_cleaning, crawlStatus: crawl?.status, hasSite: run.hasSite });
  if (readiness.cleaning === 'exhausted') {
    const marked = markCleaningExhausted(run.results.competitor_cleaning, '2026-09-21T00:00:00Z');
    if (marked.changed) { c.stampWrites++; run.results.competitor_cleaning = marked.stamp; }
  }
  if (readiness.ready) {
    run.status = settlement.runStatus;
    c.finalised++;
    c.advanceCalls++; // baselineJobs → advanceBaseline for this audit
    return 'finalised';
  }
  run.status = 'pending';
  return 'held';
}
function drive(run: Run, ticks: number, cleaner: () => boolean): { c: Counters; log: string[] } {
  const c = counters(); const log: string[] = [];
  for (let i = 0; i < ticks; i++) log.push(tick(run, c, cleaner));
  return { c, log };
}
const done = (n: number) => Array.from({ length: n }, () => 'done');

/* 1. One question, cleaning succeeds → finalised on the first tick. */
{
  const run: Run = { status: 'running', rows: done(1), results: {}, hasSite: true };
  const { c, log } = drive(run, 1, () => true);
  ok(log[0] === 'finalised' && run.status === 'complete', '1: a 1-question run whose cleaning succeeds finalises complete on the first tick');
  ok(c.cleaningCalls === 1, '1: exactly one cleaning call');
}

/* 2. One question, cleaning fails every time → stops at RETRY_CLEAN_CAP, then finalises. */
{
  const run: Run = { status: 'running', rows: done(1), results: {}, hasSite: true };
  const { c, log } = drive(run, RETRY_CLEAN_CAP + 10, () => false);
  const firstFinal = log.indexOf('finalised');
  ok(firstFinal === RETRY_CLEAN_CAP - 1, `2: released on tick ${RETRY_CLEAN_CAP} — the tick the ${RETRY_CLEAN_CAP}th failed attempt lands (got tick ${firstFinal + 1})`);
  ok(log.slice(0, firstFinal).every((l) => l === 'held'), '2: every earlier tick held the run pending (unchanged behaviour inside the cap)');
  ok(c.cleaningCalls === RETRY_CLEAN_CAP, `2: exactly RETRY_CLEAN_CAP (${RETRY_CLEAN_CAP}) cleaning calls in total — never a fifth`);
  ok(run.status === 'complete', '2: the run is complete — the AI answers are the measurement; cleaning was optional');
  const stamp = run.results.competitor_cleaning as Record<string, unknown>;
  ok(stamp.complete === false && Array.isArray(stamp.errors) && stamp.attempts === RETRY_CLEAN_CAP && typeof stamp.gave_up_at === 'string', '2: the receipt is honest — complete:false, the error kept, attempts as counted, gave_up_at set');
  ok(c.stampWrites === 1, '2: the gave-up marker was written exactly once');
  ok(log.slice(firstFinal + 1).every((l) => l === 'skipped'), '2: after release the finaliser never touches the run again');
}

/* 3. 40-question discovery run, all terminal → finalises. */
{
  const run: Run = { status: 'running', rows: done(40), results: {}, hasSite: true };
  const { log } = drive(run, 1, () => true);
  ok(log[0] === 'finalised' && run.status === 'complete' && run.rows.length === 40, '3: a 40/40 discovery run finalises complete with its 40 rows untouched');
}
/* 3b. 40-question run whose cleaning never succeeds → still released at the cap. */
{
  const run: Run = { status: 'running', rows: done(40), results: {}, hasSite: true };
  const { c } = drive(run, RETRY_CLEAN_CAP + 5, () => false);
  ok(run.status === 'complete' && c.cleaningCalls === RETRY_CLEAN_CAP, '3b: 40/40 with a failing cleaner is released at the cap — never "running 40/40" for ever');
}

/* 4. Discovery, three runs: each run finalises independently; advancement hands off ONCE per run. */
{
  const runs: Run[] = [1, 2, 3].map(() => ({ status: 'running', rows: done(40), results: {}, hasSite: false }));
  const c = counters();
  // Run 1 lands; run 2 lands with a broken cleaner; run 3 lands.
  tick(runs[0], c, () => true);
  for (let i = 0; i < RETRY_CLEAN_CAP; i++) tick(runs[1], c, () => false);
  tick(runs[2], c, () => true);
  ok(runs.every((r) => r.status === 'complete'), '4: all three discovery runs reach complete, including the one whose cleaning failed');
  ok(c.advanceCalls === 3 && c.finalised === 3, '4: advanceBaseline is handed each run exactly once (3 hand-offs for 3 runs)');
  ok(c.runsInserted === 0 && c.rowsInserted === 0, '4: the finaliser itself creates no run and no queue row — advancement is advanceBaseline’s job');
}

/* 5. Terminal provider failure keeps its semantics and is never stuck. */
{
  const run: Run = { status: 'running', rows: ['failed', 'failed', 'failed'], results: {}, hasSite: true };
  const { c, log } = drive(run, 3, () => false);
  ok(log[0] === 'finalised' && run.status === 'failed', '5: every question failed → run status failed (an outage, never a measurement)');
  ok(c.cleaningCalls === 0, '5: nothing to clean on an all-failed run — the cleaner is not called');
  const partial: Run = { status: 'running', rows: ['done', 'failed', 'done'], results: {}, hasSite: true };
  drive(partial, 1, () => true);
  ok(partial.status === 'complete', '5: a partial run (some failed) finalises complete, as before');
  const capped: Run = { status: 'running', rows: ['done', 'failed'], results: {}, hasSite: true, isCapped: true };
  drive(capped, 1, () => true);
  ok(capped.status === 'capped', '5: a cost-capped run finalises capped, as before');
  ok(runSettlement([], false).allSettled === false, '5: an empty row set is never "settled" — absence is not an answer');
}

/* 6. Reconciliation twice (and more) → idempotent. */
{
  const run: Run = { status: 'running', rows: done(3), results: {}, hasSite: true };
  const { c } = drive(run, RETRY_CLEAN_CAP + 6, () => false);
  const stampAfter = JSON.stringify(run.results.competitor_cleaning);
  const c2 = counters();
  for (let i = 0; i < 5; i++) tick(run, c2, () => false);
  ok(c2.cleaningCalls === 0 && c2.stampWrites === 0 && c2.finalised === 0, '6: re-running the finaliser on a released run makes no cleaning call, no write, no second finalisation');
  ok(JSON.stringify(run.results.competitor_cleaning) === stampAfter && run.rows.length === 3, '6: the receipt and the rows are byte-identical after the repeats');
  ok(c.cleaningCalls === RETRY_CLEAN_CAP, '6: the first pass spent exactly the cap');
  const twice = markCleaningExhausted(markCleaningExhausted({ attempts: 9, complete: false }, 't1').stamp, 't2');
  ok(twice.changed === false && (twice.stamp as { gave_up_at?: string }).gave_up_at === 't1', '6: markCleaningExhausted is idempotent — the first gave_up_at stands');
}

/* 7. A genuinely active run is never finalised early. */
{
  const run: Run = { status: 'running', rows: ['done', 'running', 'pending'], results: {}, hasSite: true };
  const { c, log } = drive(run, 3, () => true);
  ok(log.every((l) => l === 'wait') && run.status === 'running', '7: with a row still pending/running the run waits and keeps its status');
  ok(c.cleaningCalls === 0 && c.finalised === 0, '7: nothing is invoked or finalised while provider work is outstanding');
  ok(runSettlement(['done', 'cancelled'], false).allSettled === false, '7: an unrecognised row status is not terminal — fail closed');
}

/* The cap itself. */
ok(RETRY_CLEAN_CAP === 4, `RETRY_CLEAN_CAP stays at 4 (1 at finalise + 3 retries) — it is the ONE bound on every cleaning path`);
ok(cleaningState(undefined) === 'pending' && cleaningState({ complete: true, attempts: 1 }) === 'complete' && cleaningState({ complete: false, attempts: RETRY_CLEAN_CAP }) === 'exhausted', 'cleaningState: no receipt → pending; complete wins; the cap makes exhausted');
ok(cleaningState({ complete: false, attempts: 3248 }) === 'exhausted', 'a receipt already thousands of attempts deep is exhausted, never pending');
ok(shouldInvokeCleaning({ complete: false, attempts: 3248 }, false) === false, 'the live stuck runs (attempts in the thousands) are never invoked again');
ok(shouldInvokeCleaning(undefined, false) === true && shouldInvokeCleaning(undefined, true) === false, 'a fresh run is cleaned once; an all-failed run is never cleaned');
ok(finaliseReadiness({ allFailed: false, stamp: undefined, crawlStatus: 'complete', hasSite: true }).ready === false, 'a run whose cleaning has not been tried yet is still held (inside the cap, behaviour unchanged)');
ok(finaliseReadiness({ allFailed: false, stamp: { complete: true }, crawlStatus: undefined, hasSite: true }).ready === false, 'a site with no crawl answer yet still holds — crawl semantics unchanged');
ok(finaliseReadiness({ allFailed: false, stamp: { complete: true }, crawlStatus: 'unavailable', hasSite: true }).ready === true, 'an unavailable crawl is honest and ready — unchanged');

/* ── 8 & 9. The adaptive hook: engine-specific gap kept; all-named forbids absence copy ────────── */
const ENGINES = ['chatgpt', 'gemini'] as const;
const cell = (named: boolean) => ({ named, answer_text: 'Here are some options.', competitors: ['A Ltd', 'B Ltd', 'C Ltd'], citations: [] });
const planned = ['recommend a good electrician in Doncaster', 'best electricians in Doncaster', 'emergency electrician Doncaster'];
{
  /* ⛔ GEMINI DECIDES (2026-09-21): a ChatGPT-only gap (Gemini named it) must NOT stop the hook —
     see src/lib/hookAudit.ts's evaluateHookQuestion and hook-audit-adaptive.test.ts for the full
     progression matrix. This fixture is the other way round: Gemini itself misses (ChatGPT named
     them), which IS a genuine stopping gap, attributed to Gemini. */
  let state: HookState = initialHookState(planned);
  const step = advanceHookState(state, 0, evaluateHookQuestion({ chatgpt: cell(true), gemini: cell(false) }, ENGINES));
  state = step.state;
  ok(step.action === 'stop' && state.stop_reason === 'visibility_gap_found' && state.gap?.engine === 'gemini', '8: Gemini misses (ChatGPT named them) → stop after Q1 with a Gemini-specific gap — Gemini decides, never ChatGPT');
  ok(JSON.stringify(state.gap?.named_on_engines) === JSON.stringify(['chatgpt']), '8: the ChatGPT naming is preserved as the qualifier');
  ok(hookForbidsAbsenceCopy(state) === false, '8: a real gap does NOT forbid absence copy — the message may say Gemini did not name them');
}
{
  let state: HookState = initialHookState(planned);
  for (let i = 0; i < HOOK_MAX_QUESTIONS; i++) {
    const step = advanceHookState(state, i, evaluateHookQuestion({ chatgpt: cell(true), gemini: cell(true) }, ENGINES));
    state = step.state;
    if (step.action === 'stop') break;
  }
  ok(state.stop_reason === 'max_questions_reached' && state.gap === null && state.executed === HOOK_MAX_QUESTIONS, '9: named on both engines in all three → max_questions_reached, no gap');
  ok(hookForbidsAbsenceCopy(state) === true, '9: an all-named hook forbids absence copy');
  ok(HOOK_NO_GAP_REASON === 'hook_no_visibility_gap', '9: the refusal reason is the agreed token');
  ok(hookForbidsAbsenceCopy(initialHookState(planned)) === false, '9: a hook still running forbids nothing');
  ok(hookForbidsAbsenceCopy({ ...initialHookState(planned), executed: 1, stop_reason: 'provider_failure' }) === false, '9: a provider failure forbids nothing (the resolver’s existing checks handle it)');
  ok(hookForbidsAbsenceCopy(undefined) === false && hookForbidsAbsenceCopy({}) === false, '9: a non-hook run (no state) is never treated as all-named — absence of the marker decides nothing');
}

/* ── Source-shape: the wiring the pure functions cannot see ───────────────────────────────────── */
const root = resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8').replace(/\r\n/g, '\n');
const queue = read('supabase/functions/process-ai-audit-queue/index.ts');
const reply = read('supabase/functions/_shared/audit-reply.ts');
const sender = read('supabase/functions/send-whatsapp-message/index.ts');
const drip = read('supabase/functions/process-whatsapp-queue/index.ts');
const baseline = read('supabase/functions/_shared/audit-baseline.ts');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

ok(/import \{[^}]*RETRY_CLEAN_CAP[^}]*\} from "\.\.\/_shared\/run-finalise\.ts";/.test(queue) && !/^const RETRY_CLEAN_CAP\s*=/m.test(code(queue)), 'queue: RETRY_CLEAN_CAP is imported from run-finalise.ts and no longer declared locally — one cap');
ok(code(queue).includes('attempts < RETRY_CLEAN_CAP') , 'queue: the retry sweep still bounds itself with the same cap');
ok(/const invokeCleaning = shouldInvokeCleaning\(existingResults\.competitor_cleaning, allFailed\);/.test(queue), 'queue: the finaliser asks shouldInvokeCleaning before invoking extract-competitors');
ok(/if \(invokeCleaning && \(prevStatus === "pending" \|\| prevStatus === "running" \|\| prevStatus === "processing"\)\) \{\s*extractionInvokes\.push/.test(queue), 'queue: the extract-competitors invoke is gated by invokeCleaning');
ok((code(queue).match(/functions\/v1\/extract-competitors/g) ?? []).length === 2, 'queue: exactly two extract-competitors call sites (finaliser + sweep), both capped');
ok(/const readiness = finaliseReadiness\(\{ allFailed: p\.allFailed, stamp: current\.competitor_cleaning, crawlStatus: crawl\?\.status, hasSite: !!site \}\);/.test(queue), 'queue: readiness comes from finaliseReadiness');
ok(/if \(readiness\.cleaning === "exhausted"\) \{[\s\S]*?markCleaningExhausted\(current\.competitor_cleaning/.test(queue) && /if \(readiness\.ready\) \{/.test(queue), 'queue: an exhausted cleaning is stamped once and the run released');
ok(/const \{ allFailed, runStatus \} = runSettlement\(rows\.map\(\(r: Row\) => r\.status\), isCapped\);/.test(queue) && !/const runStatus = isCapped \? "capped"/.test(queue), 'queue: allFailed/runStatus come from runSettlement — failed/capped/complete semantics in one place');
ok(!/from\("ai_audit_runs"\)\s*\.insert\(/.test(code(queue)), 'queue: the finaliser never inserts a run');
ok(/for \(const auditId of new Set\(baselineJobs\.map\(\(j\) => j\.auditId\)\)\)/.test(queue) && /if \(!auditReady\(baselineJobs\[i\]\.auditId\)\) baselineJobs\.splice/.test(queue), 'queue: advancement hand-off runs once per RELEASED audit (baselineJobs filtered by auditReady)');
ok(/if \(usable\.length >= target\) \{/.test(baseline) && /audit_id: auditId,\s*\/\/ re-run path: same audit, next run_number/.test(baseline) && /if \(!audit \|\| !\(target > 1\)\) return;/.test(baseline), 'baseline: advanceBaseline still finalises at the target, adds the next run to the SAME audit, and ignores single-run audits (stagger.test.ts pins the decision matrix)');
ok(/txt\.slice\(0, 400\)/.test(queue), 'queue: the cleaning failure receipt keeps 400 chars so the OpenAI 429 body is classifiable');

ok(/export function hookForbidsAbsenceCopy\(state: unknown\): boolean \{\s*return isHookState\(state\) && state\.stop_reason === "max_questions_reached" && !state\.gap;/.test(reply), 'reply: the guard is the PROPERTY (ceiling reached, no gap), defined once beside the resolver');
ok(!read('src/lib/hookAudit.ts').includes('hookForbidsAbsenceCopy'), 'reply: the guard is NOT in hookAudit.ts (reached by twelve edge functions) — only the two senders carry it');
{
  const sel = reply.indexOf('if (!audit || !run) return');
  const guard = reply.indexOf('if (hookForbidsAbsenceCopy(hookState))');
  const comp = reply.indexOf('// 2) Competitors via the SHARED aggregation');
  ok(sel > 0 && guard > sel && comp > guard, 'reply: the refusal sits right after run selection, before any competitor or template work');
  ok(/reason: `\$\{HOOK_NO_GAP_REASON\}: /.test(reply), 'reply: the refusal reason begins with hook_no_visibility_gap');
}
ok(/if \(!a\.ok\) return json\(\{ ok: false, error: "audit_reply_unavailable", reason: a\.reason \}, 200\);/.test(sender), 'Inbox: send-whatsapp-message turns the refusal into audit_reply_unavailable with the reason (existing convention)');
ok(/if \(!vars\.ok\) \{ await finish\("flagged_no_audit", vars\.reason\);/.test(drip), 'first-reply lane: process-whatsapp-queue flags the parked pitch with the reason (existing convention)');
ok(/whatsapp_delivery_status: "audit_reply_unavailable"/.test(drip) && /const ar = await resolveAuditReplyVars\(service, lead\.id as string\);/.test(drip), 'drip: the queued lead is dequeued as audit_reply_unavailable with the reason (existing convention)');
ok(!/cleaner hasn.?t run|haven.?t been extracted/.test(HOOK_NO_GAP_REASON), 'the refusal does not match the Inbox’s "re-clean and retry" regex, so a no-gap hook is never re-cleaned to get past it');

if (failures) throw new Error(`${failures} audit finalisation checks failed`);
console.log('\naudit-finalise-lifecycle: all checks passed');
