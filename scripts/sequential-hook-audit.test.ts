/* THE SEQUENTIAL HOOK AUDIT (2026-10-15, Paul). A hook / bulk prospecting audit asks ONE question at a time on
   ChatGPT + Gemini: the next question is asked only while every engine that answered named the business, and it
   stops at the first answer that did not (that answer is the proof). The picked 3 / 4 / 5 is the MOST asked.
   Mocked cells only: no engine, no Apify, no live audit. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HOOK_ENGINES, advanceSequentialHook, askedHookQuestions, initialHookStateV2, initialSequentialHookStateV2,
  isSequentialHookState, scoreHookRun, type HookScoreRow, type HookStateV2,
} from '../src/lib/hookScore.ts';
import { sixResultHookForbidsAbsenceCopy } from '../supabase/functions/_shared/audit-reply.ts';
import { estimateBatchCost } from '../src/lib/auditBatchPlan.ts';
import { AUDIT_RUN_CAP_USD, AUDIT_BULK_JOB_MAX_LEADS } from '../src/lib/auditLimits.ts';
import { POOL_DAILY_CAP_USD, APIFY_RESERVE_PCT } from '../src/lib/auditBudget.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  if (value) console.log(`PASS ${message}`);
  else { failures++; console.error(`FAIL ${message}`); }
}

const BIZ = 'E.E.S Electrical';
const TOWN = 'Addlestone';
const TRADE = 'electricians';
const CTX = { named: { businessName: BIZ, trade: TRADE, town: TOWN }, town: TOWN, trade: TRADE };
const Q = [
  'Who are the best electricians in Addlestone?',
  'Who would you recommend for an EICR in Addlestone?',
  'Who is a reliable electrician for electrical repairs in Addlestone?',
  'Can you recommend an electrician in Addlestone?',
  'I need an electrician in Addlestone, who should I call?',
];
const RIVALS = ['Sparks Ltd', 'Volt Electrical', 'Addlestone Power'];
function cell(named: boolean, rivals = RIVALS) {
  return {
    named, self_named: named,
    answer_text: named ? `Good options in Addlestone include ${BIZ}, ${rivals.join(', ')}.` : `Good options in Addlestone include ${rivals.join(', ')}.`,
    competitors: rivals, citations: [],
  };
}
const FAILED = { named: false, answer_text: '', competitors: [], error: 'timeout' };
type Pair = [boolean | 'fail', boolean | 'fail'];
const cells = ([c, g]: Pair): Record<string, unknown> => ({
  chatgpt: c === 'fail' ? FAILED : cell(c, ['ChatGPT Rival A', 'ChatGPT Rival B', 'ChatGPT Rival C']),
  gemini: g === 'fail' ? FAILED : cell(g, ['Gemini Rival A', 'Gemini Rival B', 'Gemini Rival C']),
});
const rowFor = (q: string, p: Pair): HookScoreRow => ({ question: q, status: 'done', result: cells(p), engines: [...HOOK_ENGINES] });

/** Drive the queue step exactly as process-ai-audit-queue does: ask Q1, settle it, advance, repeat. */
function drive(planned: string[], answers: Pair[], capped = false) {
  let state: HookStateV2 = initialSequentialHookStateV2(planned);
  const rows: HookScoreRow[] = [];
  const asked: string[] = [];
  for (let i = 0; i < planned.length; i++) {
    asked.push(planned[Number(state.next_index) - 1]);
    const pair = answers[i];
    if (!pair) throw new Error('script ran out of answers');
    const q = planned[Number(state.next_index) - 1];
    rows.push(rowFor(q, pair));
    if (capped) { state = { ...state, executed: Number(state.next_index), stop_reason: 'capped' }; break; }
    const step = advanceSequentialHook(state, cells(pair), CTX.named);
    state = step.state;
    if (step.action === 'stop') break;
  }
  return { state, rows, asked, score: scoreHookRun(state, rows, CTX) };
}

console.log('\n── THE SHAPE: only the first question is planned-and-queued ──');
{
  const s = initialSequentialHookStateV2(Q.slice(0, 3));
  ok(isSequentialHookState(s) && s.next_index === 1 && !s.stop_reason, 'a new sequential hook has asked one question and has not stopped');
  ok(askedHookQuestions(s).length === 1 && askedHookQuestions(s)[0] === Q[0], 'only Q1 counts as asked while it runs');
  ok(!isSequentialHookState(initialHookStateV2(Q.slice(0, 3))), 'the older all-at-once state is untouched (still not sequential)');
  const running = scoreHookRun(s, [{ question: Q[0], status: 'running', result: null }], CTX);
  ok(!running.complete && running.percent === null && running.pending === 2, 'while it runs there is NO score');
}

console.log('\n── NAMED → ASK THE NEXT ──');
{
  const s0 = initialSequentialHookStateV2(Q.slice(0, 3));
  const step = advanceSequentialHook(s0, cells([true, true]), CTX.named);
  ok(step.action === 'next' && step.nextQuestion === Q[1], 'named on both engines on Q1 → Q2 is asked');
  ok(step.state.next_index === 2, 'the claim counter moves to 2');
  const step2 = advanceSequentialHook(step.state, cells([true, true]), CTX.named);
  ok(step2.action === 'next' && step2.nextQuestion === Q[2], 'named again → Q3 is asked');
}

console.log('\n── NOT NAMED → STOP, THAT ANSWER IS THE PROOF ──');
{
  const r = drive(Q.slice(0, 3), [[false, false]]);
  ok(r.asked.length === 1 && r.state.stop_reason === 'not_named', 'missed on Q1 → one question asked, nothing more');
  ok(r.score.complete && r.score.expected === 2 && r.score.named === 0 && r.score.percent === 0, 'score = named / asked = 0 of 2 = 0%');
  ok(r.score.hook?.questionIndex === 0, 'the proof is Q1');
  const m = drive(Q.slice(0, 3), [[true, true], [true, false]]);
  ok(m.asked.length === 2 && m.state.stop_reason === 'not_named', 'named on Q1, missed on ONE engine on Q2 → stop after Q2');
  ok(m.score.complete && m.score.expected === 4 && m.score.named === 3 && m.score.percent === 75, 'score = 3 named / 4 asked = 75% (whole number)');
  ok(m.score.misses.length === 1 && m.score.misses[0].engine === 'gemini' && m.score.misses[0].questionIndex === 1, 'the single miss is Gemini on Q2');
  const odd = drive(Q.slice(0, 3), [[true, false]]);
  ok(odd.score.percent === 50 && odd.state.stop_reason === 'not_named', 'a miss on one engine stops the run even though the other named');
}

console.log('\n── NAMED x3 → REFUSED (no absence to message about) ──');
{
  const r = drive(Q.slice(0, 3), [[true, true], [true, true], [true, true]]);
  ok(r.asked.length === 3 && r.state.stop_reason === 'max_questions_reached', 'named three times → stops at three');
  ok(r.score.complete && r.score.expected === 6 && r.score.named === 6 && r.score.percent === 100 && r.score.allNamed, 'six of six named → 100% and allNamed');
  ok(sixResultHookForbidsAbsenceCopy(r.state, r.rows, CTX) === true, 'the absence-copy guard REFUSES a lead named in every answer');
  const missed = drive(Q.slice(0, 3), [[true, true], [false, true]]);
  ok(sixResultHookForbidsAbsenceCopy(missed.state, missed.rows, CTX) === false, 'a run that stopped on a miss is not refused');
}

console.log('\n── A FAILED ANSWER → NO SCORE ──');
{
  const f1 = drive(Q.slice(0, 3), [[true, 'fail']]);
  ok(f1.state.stop_reason === 'provider_failure', 'one engine failed on Q1 → stop, provider_failure');
  ok(!f1.score.complete && f1.score.percent === null && f1.score.hook === null && f1.score.failed === 1, 'no percentage and no hook');
  const f2 = drive(Q.slice(0, 3), [[true, true], ['fail', false]]);
  ok(f2.state.stop_reason === 'provider_failure' && !f2.score.complete && f2.score.percent === null, 'a failure on Q2 beats the Gemini miss beside it: still no score');
  const none = advanceSequentialHook(initialSequentialHookStateV2(Q.slice(0, 3)), null, CTX.named);
  ok(none.action === 'stop' && none.state.stop_reason === 'provider_failure', 'a row that produced no result at all is a failure, never a "not named"');
  const cap = drive(Q.slice(0, 3), [[true, true]], true);
  ok(cap.state.stop_reason === 'capped' && !cap.score.complete && cap.score.percent === null, 'a spend-capped run never has a score');
}

console.log('\n── THE PICKED NUMBER IS THE MOST ASKED (3 / 4 / 5) ──');
for (const n of [3, 4, 5]) {
  const r = drive(Q.slice(0, n), Array.from({ length: n }, () => [true, true] as Pair));
  ok(r.asked.length === n && r.state.stop_reason === 'max_questions_reached', `${n} picked, named every time → exactly ${n} asked, then stop`);
  ok(r.score.expected === n * 2 && r.score.percent === 100, `${n} picked → ${n * 2} answers`);
}
{
  const r = drive(Q.slice(0, 5), [[true, true], [true, true], [false, false]]);
  ok(r.asked.length === 3 && r.score.expected === 6 && r.score.named === 4, '5 picked but missed on Q3 → only 3 asked, 4 of 6');
  const a = advanceSequentialHook({ ...initialSequentialHookStateV2(Q.slice(0, 4)), next_index: 4 }, cells([true, true]), CTX.named);
  ok(a.action === 'stop' && a.state.stop_reason === 'max_questions_reached', 'never asks past the end of the plan');
}

console.log('\n── COMPETITOR NAMES COME ONLY FROM ANSWERS THAT DID NOT NAME THE LEAD ──');
{
  const r = drive(Q.slice(0, 3), [[true, true], [true, false]]);
  const named = r.score.results.filter((x) => x.status === 'named');
  ok(r.score.misses.every((m) => m.status === 'not_named'), 'misses are only not_named cells');
  ok(r.score.hook !== null && r.score.hook.competitors.every((c) => c.startsWith('Gemini Rival')), 'the hook pick carries the MISSING cell\'s own rivals');
  ok(named.length === 3 && r.score.hook!.competitors.every((c) => !c.startsWith('ChatGPT Rival')), 'a named answer\'s rivals are never used as the competitors');
}

console.log('\n── THE SPEND CEILINGS ARE UNCHANGED ──');
{
  ok(AUDIT_RUN_CAP_USD === 1, '$1 per run');
  ok(POOL_DAILY_CAP_USD.prospecting === 12, '$12 daily prospecting pool');
  ok(AUDIT_BULK_JOB_MAX_LEADS === 100, '100 leads per job');
  ok(APIFY_RESERVE_PCT.prospecting === 85, '85% Apify reserve for prospecting');
  const e = estimateBatchCost([{ id: 'a', website: 'https://a.co.uk' }], 3, { usdPerQuestion: 0.014 });
  ok(Math.abs(e.totalUsd - 3 * 0.014) < 1e-9, 'the estimate is questions only (a hook audit runs no scan)');
}

console.log('\n── WIRING (source) ──');
{
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
  const create = read('supabase/functions/create-ai-audit/index.ts');
  ok(/initialSequentialHookStateV2\(questions, AUDIT_ENGINES\)/.test(create), 'create-ai-audit starts a hook sequentially');
  ok(/isSequentialHookState\(hookState\) \? questions\.slice\(0, 1\) : questions/.test(create), 'create-ai-audit queues ONLY the first question of a sequential hook');
  ok(/reuseAuditId\s*\n?\s*\? initialHookStateV2/.test(create), 'a re-run by audit_id keeps the all-queued marker');
  const proc = read('supabase/functions/process-ai-audit-queue/index.ts');
  ok(/advanceSequentialHook\(seqPrev, cells, namedCtx\)/.test(proc), 'the queue processor advances a sequential hook with the report\'s ruler');
  ok(/eq\("results->hook->>next_index", String\(seqPrev\.next_index\)\)/.test(proc), 'the next question is claimed exactly once (conditional on next_index)');
  ok(/stop_reason: "capped"/.test(proc), 'a capped run stops as capped and never asks another question');
  const bulk = read('supabase/functions/bulk-jobs/index.ts');
  ok(!/single \$12|100 x \(5 x \$0\.0104 \+ \$0\.04\)/.test(bulk), 'the stale single-cap arithmetic is gone from bulk-jobs');
  ok(!/\$0\.04\) = \$9\.20/.test(bulk) && !/DAILY_CAP_USD \(\$12 rolling-24h, per user\), not/.test(bulk), 'bulk-jobs no longer prices a scan');
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nAll sequential-hook-audit checks passed.');
