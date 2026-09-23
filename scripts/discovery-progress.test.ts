/* ============================================================
   DISCOVERY AS A DURABLE, VISIBLY PROGRESSIVE SERVER JOB (2026-09-23).

   BS4 Electrical: 49 Discovery questions × 2 engines × 3 runs = 294 measurements. The screen said
   "Discovery running (0/3 runs)" at 154 of 294 while rows said "named in 1/1 runs". This pins the
   measurement-level progress, the per-question and per-engine counts, the one-job-per-pool claim,
   the pool version, the read-only reopen, and that Discovery never touches the baseline.

   Run: npx tsx scripts/discovery-progress.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  discoveryProgress, discoveryView, discoveryPlan, poolMatchesJob, poolVersion, questionProgressLine,
  namedLine, DISCOVERY_STALL_MS, type ProgressRow, type ProgressRun,
} from '../src/lib/discoveryProgress';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const ENGINES = ['chatgpt', 'gemini'];
const Q = Array.from({ length: 49 }, (_, i) => `question ${i + 1} in Bristol UK`);
const T0 = Date.parse('2026-09-23T12:39:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const answer = (named = false) => ({ named, answer_text: 'x', competitors: [], citations: [] });
const both = (named = false) => ({ chatgpt: answer(named), gemini: answer(named) });
const runsOf = (n: number, status = 'pending'): ProgressRun[] => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, run_number: i + 1, status, created_at: at(i * 3) }));
/** rows for run `r`, first `done` questions answered, the rest pending. */
const rowsFor = (run: string, done: number, result: unknown = both(), min = 10): ProgressRow[] =>
  Q.map((q, i) => ({ run_id: run, question: q, status: i < done ? 'done' : 'pending', result: i < done ? result : null, updated_at: at(min) }));
const prog = (rows: ProgressRow[], runs: ProgressRun[], extra: Partial<Parameters<typeof discoveryProgress>[0]> = {}) =>
  discoveryProgress({ questions: Q, engines: ENGINES, targetRuns: 3, runs, rows, startedAt: at(0), completedAt: null, now: T0 + 15 * 60_000, ...extra });

console.log('\n── 1. EXPECTED TOTAL = QUESTIONS × ENGINES × RUNS ──');
{
  const p = prog([], []);
  ok(p.total === 294, `1. BS4: 49 × 2 × 3 = ${p.total}`);
  ok(discoveryPlan(49, 3).measurements === 294 && discoveryPlan(49, 3).engines === 2, '1. the pre-start plan says 294 measurements on 2 engines');
  ok(prog([], [], { questions: Q.slice(0, 10), targetRuns: 1 }).total === 20, '1. 10 × 2 × 1 = 20');
}

console.log('\n── 2/3. COMPLETED COUNT AND PER-ENGINE PROGRESS ──');
{
  // The live BS4 shape at 13:01: run 1 43 done, run 2 33 done, run 3 1 done.
  const rows = [...rowsFor('r1', 43), ...rowsFor('r2', 33), ...rowsFor('r3', 1)];
  const p = prog(rows, runsOf(3));
  ok(p.done === (43 + 33 + 1) * 2, `2. ${p.done} of 294 measurements complete (77 question-runs × 2 engines)`);
  ok(p.percent === Math.floor((154 / 294) * 100), `2. ${p.percent}%`);
  ok(p.status === 'running' && p.runs_started === 3, '2. running — not "0/3 runs"');
  const cg = p.by_engine.find((e) => e.engine === 'chatgpt')!, gm = p.by_engine.find((e) => e.engine === 'gemini')!;
  ok(cg.done === 77 && cg.total === 147 && gm.done === 77 && gm.total === 147, `3. ChatGPT ${cg.done}/${cg.total} · Gemini ${gm.done}/${gm.total}`);
  // Gemini missing from a done row = a failed Gemini measurement, never a success.
  const oneMissing = rowsFor('r1', 49).map((r, i) => (i === 0 ? { ...r, result: { chatgpt: answer() } } : r));
  const p2 = prog(oneMissing, runsOf(1), { targetRuns: 1 });
  const g2 = p2.by_engine.find((e) => e.engine === 'gemini')!;
  ok(g2.done === 48 && g2.failed === 1 && p2.by_engine[0].done === 49, '3. an engine absent from a done row counts as a failed measurement for that engine only');
}

console.log('\n── 4. PER-QUESTION PROGRESS ──');
{
  const rows = [...rowsFor('r1', 2), ...rowsFor('r2', 1)];
  rows.push({ run_id: 'r2', question: Q[1], status: 'running', result: null, updated_at: at(11) });
  const p = prog(rows.filter((r) => !(r.run_id === 'r2' && r.question === Q[1] && r.status === 'pending')), runsOf(2));
  const q1 = p.by_question[0], q2 = p.by_question[1], q9 = p.by_question[8];
  ok(q1.state === 'running' && questionProgressLine(q1) === 'ChatGPT 2/3 · Gemini 2/3', `4. running: "${questionProgressLine(q1)}"`);
  ok(q2.state === 'running' && questionProgressLine(q2) === 'ChatGPT 1/3 · Gemini 1/3', `4. running: "${questionProgressLine(q2)}"`);
  ok(q9.state === 'not_started' && questionProgressLine(q9) === 'Not started', '4. not started');
  const full = prog([...rowsFor('r1', 49), ...rowsFor('r2', 49), ...rowsFor('r3', 49)], runsOf(3, 'complete'), { completedAt: at(30) });
  ok(full.by_question.every((q) => q.state === 'complete') && questionProgressLine(full.by_question[0]) === 'ChatGPT 3/3 · Gemini 3/3', '4. complete: "ChatGPT 3/3 · Gemini 3/3"');
  ok(full.questions_complete === 49 && full.done === 294 && full.status === 'complete', '10. a finished job reaches 294 / 294 and 49 / 49');
  const issue = [...rowsFor('r1', 49), ...rowsFor('r2', 49), ...rowsFor('r3', 49).map((r, i) => (i === 0 ? { ...r, result: { chatgpt: answer() } } : r))];
  const pi = prog(issue, runsOf(3, 'complete'), { completedAt: at(30) });
  ok(pi.by_question[0].state === 'complete_with_issue' && questionProgressLine(pi.by_question[0]) === 'ChatGPT 3/3 · Gemini 2/3 · 1 failed', `4. issue: "${questionProgressLine(pi.by_question[0])}"`);
  ok(pi.status === 'complete_with_failures' && pi.failed === 1 && pi.done === 293, '4. the job is "complete with failures": 293 done, 1 failed');
}

console.log('\n── 8. PARTIAL RESULTS ARE LABELLED PARTIAL ──');
{
  ok(namedLine({ namedRuns: 1, runs: 1 }, 'running') === 'named in 1 of 1 answered run so far (partial)', '8. a question still being measured says "so far (partial)"');
  ok(namedLine({ namedRuns: 2, runs: 3 }, 'complete') === 'named in 2 of 3 answered runs', '8. a finished question does not');
  const ui = read('src/components/BaselineDiscovery.tsx');
  ok(/Provisional — Discovery still running/.test(ui) && /view\.provisional/.test(ui), '8. the opportunity groups carry "Provisional — Discovery still running" while it runs');
  const running = discoveryView({ poolSize: 49, audit: { complete: false, progress: { status: 'running' } } }, 'Run');
  const done = discoveryView({ poolSize: 49, audit: { complete: true, progress: { status: 'complete' } } }, 'Run');
  ok(running.provisional && !done.provisional, '8. …and the label goes once the job is complete');
  ok(!/Discovery running \(\$\{d\.audit!\.runs_done\}/.test(ui), '8. the old "Discovery running (0/3 runs)" headline is gone');
  ok(/measurements · \{p\.percent\}%/.test(ui) && /<Progress value=\{p\.percent\}/.test(ui), '8. the header shows measurements, a percentage and a progress bar');
}

console.log('\n── 9. FAILURES NEVER ERASE SUCCESSFUL RUNS ──');
{
  // Run 2 failed wholesale; advanceBaseline started run 4 as the replacement.
  const failedRun2 = Q.map((q) => ({ run_id: 'r2', question: q, status: 'failed', result: { error: 'apify_FAILED' }, updated_at: at(12) }));
  const mid = prog([...rowsFor('r1', 49), ...failedRun2, ...rowsFor('r3', 49)], [...runsOf(3, 'complete'), { id: 'r4', run_number: 4, status: 'pending', created_at: at(20) }]);
  ok(mid.done === 196 && mid.failed === 98 && mid.status === 'running', `9. a failed run: ${mid.done} kept, ${mid.failed} failed, still running (a replacement is under way)`);
  const after = prog([...rowsFor('r1', 49), ...failedRun2, ...rowsFor('r3', 49), ...rowsFor('r4', 49)], [...runsOf(3, 'complete'), { id: 'r4', run_number: 4, status: 'complete', created_at: at(20) }], { completedAt: at(40) });
  ok(after.done === 294 && after.failed === 0 && after.status === 'complete', '9. once the replacement lands the failures stop counting: 294 / 294, complete');
  const extra = prog([...rowsFor('r1', 49), ...rowsFor('r2', 49), ...rowsFor('r3', 49), ...rowsFor('r4', 49)], runsOf(4, 'complete'), { completedAt: at(40) });
  ok(extra.done === 294, '9. a fourth answered run can never push a question past 3/3');
  const cancelled = prog([{ run_id: 'r1', question: Q[0], status: 'cancelled', result: null }], runsOf(1, 'cancelled'), { questions: [Q[0]], targetRuns: 1 });
  ok(cancelled.failed === 2 && cancelled.done === 0, '9. a cancelled row is a failed measurement, not a pending one');
}

console.log('\n── STATUS: ENUMERATED, INCLUDING THE STUCK AND REFUSED CASES ──');
{
  ok(prog([], [], { questions: Q }).status === 'running', 'no rows yet but the audit exists and nothing refused → running (run 1 is being queued)');
  const refused = prog([...rowsFor('r1', 49), ...rowsFor('r2', 49)], runsOf(2, 'complete'), { error: 'repeat run 3/3 refused: x' });
  ok(refused.status === 'needs_attention' && refused.done === 196, 'a refused chain with nothing open → needs attention, answers kept');
  const quiet = prog([...rowsFor('r1', 49, both(), 0)], runsOf(1, 'complete'), { now: T0 + DISCOVERY_STALL_MS + 60_000 });
  ok(quiet.status === 'needs_attention', 'nothing open and nothing moved for the stall window → needs attention');
  const stuck = prog(rowsFor('r1', 10, both(), 0), runsOf(1), { now: T0 + DISCOVERY_STALL_MS + 60_000 });
  ok(stuck.status === 'running' && stuck.stalled, 'open rows that have not moved → still running, flagged as stalled');
}

console.log('\n── 5/6/13. THE JOB IS SERVER-SIDE; CLOSING, RELOADING AND REOPENING ONLY READ ──');
{
  const disc = read('supabase/functions/_shared/baseline-discovery.ts');
  const state = disc.slice(disc.indexOf('export async function discoveryState'));
  ok(!/fetch\(|\.insert\(|\.update\(|\.upsert\(|functions\/v1\//.test(state), '13. the state read (every open, reopen and poll) writes nothing and calls no function');
  ok(/discoveryProgress\(\{/.test(state) && /\.from\("ai_audit_queue"\)\.select\("id,run_id,question,status,result,updated_at"\)/.test(state), '6. progress is derived from the stored queue rows, not a client counter');
  const pb = read('supabase/functions/paid-baseline/index.ts');
  const beforeGet = pb.slice(0, pb.indexOf('if (action === "get") return json('));
  ok(!/startDiscoveryRun\(|fetch\(/.test(beforeGet), '13. "get" is answered before anything that could start a measurement');
  const ui = read('src/components/BaselineDiscovery.tsx');
  const hook = ui.slice(ui.indexOf('export function useDiscoveryPoll'), ui.indexOf('export function mixContextOf'));
  ok(/invokePaidBaseline\('get', leadId\)/.test(hook) && !/discovery_run|discovery_generate/.test(hook), '13. the poller only ever sends "get"');
  ok(/if \(!open \|\| !live\) return;/.test(hook) && /window\.clearInterval\(id\)/.test(hook), '5. closing the dialog stops the POLL (clearInterval) — nothing cancels the job');
  const hub = read('src/pages/ClientHub.tsx');
  ok(!/cancel|stop_discovery|abort/i.test(hub.slice(hub.indexOf('function BaselineSetupDialog'), hub.indexOf('function BaselineSetupDialog') + 12000).replace(/cancelled/g, '')), '5. the dialog has no cancel/stop path for Discovery');
  ok(/useDiscoveryPoll\(leadId, open, data, !!busy, \(discovery\) => \{\n\s+setData\(\(cur\) => \(cur \? \{ \.\.\.cur, discovery \} : cur\)\);/.test(hub), '6. a poll replaces ONLY the discovery block — the draft on screen is untouched');
  ok(hub.split('setInterval(').length === 2, 'the hub still owns exactly one poller of its own');
  const v = discoveryView({ poolSize: 49, audit: { complete: false, progress: { status: 'running' } } }, 'Run');
  const fin = discoveryView({ poolSize: 49, audit: { complete: true, progress: { status: 'complete' } } }, 'Run');
  ok(v.poll && !fin.poll, '13. the poll runs only while the job runs, and stops by itself when it is done');
}

console.log('\n── 7. A RUNNING (OR FINISHED) JOB CANNOT BE DUPLICATED ──');
{
  const running = discoveryView({ poolSize: 49, audit: { complete: false, progress: { status: 'running' } } }, 'Run Discovery');
  const starting = discoveryView({ poolSize: 49, starting: true, audit: null }, 'Run Discovery');
  const complete = discoveryView({ poolSize: 49, audit: { complete: true, progress: { status: 'complete_with_failures' } } }, 'Run Discovery');
  const fresh = discoveryView({ poolSize: 49, audit: null }, 'Run Discovery');
  ok(!running.canRun && running.buttonLabel === 'Discovery running', '7. running → the button reads "Discovery running" and is disabled');
  ok(!starting.canRun && starting.buttonLabel === 'Discovery starting…', '7. starting → disabled');
  ok(!complete.canRun && fresh.canRun, '7. finished → disabled; only a pool with no job may start one');
  ok(!running.canRegenerate && complete.canRegenerate, '7/11. the pool cannot be regenerated mid-run; it can once finished');
  const pb = read('supabase/functions/paid-baseline/index.ts');
  const run = pb.slice(pb.indexOf('if (action === "discovery_run")'), pb.indexOf('/* ══ GENERATE = THE BALANCED BASELINE'));
  ok(run.indexOf('skipped: "discovery_running"') < run.indexOf('startDiscoveryRun('), '7. server: a running job answers with itself before any start');
  ok(/error: "discovery_already_run"/.test(run), '7. server: a finished job refuses a second run on the same pool');
  ok(/\.is\("baseline_discovery->>audit_id", null\)/.test(run) && /\.eq\("baseline_discovery->>generated_at"/.test(run) && /\.is\("baseline_discovery->>run_claimed_at", null\)/.test(run), '7. server: the start is a compare-and-set claim in the database (same pool, no job, no live claim)');
  ok(run.indexOf('if (!claimed) return json(') < run.indexOf('startDiscoveryRun('), '7. server: a lost claim returns before any engine is asked');
  ok(/run_claimed_at: null \} \}\)\s*\n\s*\.eq\("id", row\.id\)\.eq\("baseline_discovery->>run_claimed_at", claimAt\)/.test(run), '7. server: a failed start releases only its OWN claim');
  const gen = pb.slice(pb.indexOf('if (action === "discovery_generate")'), pb.indexOf('if (action === "discovery_run")'));
  ok(/discovery\.audit\?\.progress\.status === "running"/.test(gen) && /error: "discovery_running"/.test(gen), '11. server: regenerate is refused while the job runs');
}

console.log('\n── 11. A CHANGED POOL NEVER SILENTLY REUSES MISMATCHED RESULTS ──');
{
  ok(poolVersion(Q) === poolVersion([...Q].reverse()) && poolVersion(Q) === poolVersion(Q.map((q) => `  ${q.toUpperCase()} `)), '11. the pool version is stable across order, case and whitespace');
  ok(poolVersion(Q) !== poolVersion([...Q.slice(0, 48), 'a different question in Bath UK']), '11. one changed question → a different version');
  ok(poolMatchesJob(Q, Q) && poolMatchesJob(Q, Q.slice(0, 40)), '11. a job whose questions all belong to the pool is attached');
  ok(!poolMatchesJob(Q.slice(0, 40), Q) && !poolMatchesJob(Q, []), '11. a job with a question the pool lacks (or no questions) is NOT attached');
  const disc = read('supabase/functions/_shared/baseline-discovery.ts');
  ok(/if \(!poolMatchesJob\(pool\.map\(\(p\) => p\.question\), jobQuestions\)\) \{\n\s+mismatch = \{ audit_id: auditId \};/.test(disc), '11. discoveryState reports a mismatched job instead of attaching it');
  ok(/store\.audit_pool_version !== version\) \{ mismatch = \{ audit_id: auditId \}; auditId = null; \}/.test(disc), '11. a job recorded against another pool version is never read as this pool\'s');
  const pb = read('supabase/functions/paid-baseline/index.ts');
  ok(/fresh\.history = \[\{ pool_version: oldVersion, generated_at: store\.generated_at, questions: store\.pool\.length, audit_id: oldAudit \}/.test(pb), '11. regenerating keeps the old pool\'s job in history (nothing is deleted)');
  ok(!/\.delete\(\)/.test(pb.slice(pb.indexOf('if (action === "discovery_generate")'), pb.indexOf('/* ══ GENERATE = THE BALANCED BASELINE'))), '11. no Discovery action deletes a measurement');
}

console.log('\n── 12. DISCOVERY NEVER FREEZES OR STARTS THE BASELINE ──');
{
  const pb = read('supabase/functions/paid-baseline/index.ts');
  const blocks = pb.slice(pb.indexOf('if (action === "discovery_generate")'), pb.indexOf('/* ══ GENERATE = THE BALANCED BASELINE'));
  ok(!/baseline_questions:|baseline_status:|startPaidBaseline|baseline_approved_at/.test(blocks), '12. neither Discovery action writes the baseline draft, its status or its approval, or starts it');
  const ab = read('supabase/functions/_shared/audit-baseline.ts');
  ok(/export async function onBaselineFrozen[\s\S]{0,200}if \(audit\.audit_purpose !== "baseline" \|\| !audit\.lead_id\) return;/.test(ab), '12. a finished Discovery audit hands nothing on: onBaselineFrozen acts only on audit_purpose "baseline"');
  const prog = read('src/lib/discoveryProgress.ts');
  ok(!/^import /m.test(prog), 'discoveryProgress.ts has no imports (edge-safe leaf)');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
