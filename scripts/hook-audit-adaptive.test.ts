import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HOOK_MAX_QUESTIONS,
  advanceHookState,
  buildHookReportSummary,
  evaluateHookQuestion,
  geminiNamedAllThree,
  hookReportCopy,
  initialHookState,
  planHookQuestions,
  type HookState,
} from '../src/lib/hookAudit.ts';
import { BASELINE_QUESTIONS, BASELINE_RUNS, OUTREACH_HOOK_QUESTIONS } from '../src/lib/auditQuestionCounts.ts';
import { autoMarkHookLeadNotInterested } from '../supabase/functions/_shared/hook-not-interested.ts';
import { esc, renderHookSection } from '../src/lib/aiAuditReportHtml.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  console.log(`${value ? 'PASS' : 'FAIL'} ${message}`);
  if (!value) failures++;
}

const ENGINES = ['chatgpt', 'gemini'] as const;
const label = (e: string) => e === 'chatgpt' ? 'ChatGPT' : e === 'gemini' ? 'Gemini' : e;
const cell = (named: boolean, competitors: string[] = ['Sparks Ltd', 'Volt Electrical'], answer = 'Here are some electricians you could try.') =>
  ({ named, answer_text: answer, competitors, citations: [{ title: 'Checkatrade', url: 'https://www.checkatrade.com/x' }] });
const failedCell = () => ({ named: false, answer_text: '', competitors: [], citations: [] });

/* ── Plan: order and ceiling ─────────────────────────────────────────────────────────────────── */
const generated = [
  'How much does an electrician charge to fit a consumer unit in Doncaster?',
  'Can you recommend a good electrician in Doncaster, UK?',
  'Who are the best electricians in Doncaster for a rewire?',
  'Emergency electrician Doncaster 24 hour',
];
const planned = planHookQuestions(generated, { town: 'Doncaster' });
ok(planned.length === HOOK_MAX_QUESTIONS && HOOK_MAX_QUESTIONS === OUTREACH_HOOK_QUESTIONS, `the plan is capped at ${HOOK_MAX_QUESTIONS} questions, the same number the hook callers state`);
ok(planned[0] === 'Can you recommend a good electrician in Doncaster, UK?', 'Q1 is the broad recommendation ask');
ok(planned[1] === 'Who are the best electricians in Doncaster for a rewire?', 'Q2 is the next broad local intent');
ok(planned[2] === 'Emergency electrician Doncaster 24 hour' || planned[2] === generated[0], 'Q3 is the narrower intent; the price question is never first');
ok(!planned.includes(generated[0]) || planned[2] === generated[0], 'a price question runs last if it runs at all');
ok(JSON.stringify(planHookQuestions(generated, { town: 'Doncaster' })) === JSON.stringify(planned), 'the plan is deterministic');
ok(planHookQuestions(['Q only'], { town: 'X' }).length === 1, 'a one-question plan is allowed (minimum 1)');

/* A tiny driver: what the queue processor does, without the database. Every question is ONE queue
   row on ONE run; the driver counts rows queued and never mints a run. */
function drive(results: Array<Record<string, unknown> | null>) {
  let state: HookState = initialHookState(planned);
  const queued: string[] = [state.planned[0]];
  const runsCreated = 1;
  for (let i = 0; i < queued.length; i++) {
    const step = advanceHookState(state, i, evaluateHookQuestion(results[i] ?? null, ENGINES));
    state = step.state;
    if (step.action === 'next' && step.nextQuestion) queued.push(step.nextQuestion);
    else break;
  }
  return { state, queued, runsCreated };
}

/* A. Gap on Q1 (Gemini misses — the deciding engine; ChatGPT also misses here) */
{
  const r = drive([{ chatgpt: cell(false), gemini: cell(false) }]);
  ok(r.queued.length === 1, 'A: only Q1 was queued — Q2/Q3 never reached the provider');
  ok(r.runsCreated === 1, 'A: one audit run');
  ok(r.state.stop_reason === 'visibility_gap_found', 'A: stop reason is visibility_gap_found');
  ok(r.state.gap?.question === planned[0] && r.state.gap?.engine === 'gemini' && r.state.gap?.question_index === 0, 'A: the exact gap question is preserved and the gap is attributed to Gemini, the deciding engine');
  ok(JSON.stringify(r.state.gap?.named_instead) === JSON.stringify(['Sparks Ltd', 'Volt Electrical']) && r.state.gap?.citations.length === 1, 'A: businesses named instead and citations are preserved, read from Gemini\'s own answer');
  ok(r.state.gap?.target_named === false, 'A: the target is recorded as not named');
}

/* B. Q1 pass, gap on Q2 — Gemini misses Q2 (ChatGPT named it, which must not save the question) */
{
  const r = drive([{ chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(false) }]);
  ok(r.queued.length === 2 && r.queued[1] === planned[1], 'B: Q1 then Q2 executed, Q3 never queued');
  ok(r.state.gap?.question_index === 1 && r.state.gap?.question === planned[1] && r.state.gap?.engine === 'gemini', 'B: the gap is Q2, attributed to Gemini even though ChatGPT named them');
  ok(JSON.stringify(r.state.gap?.named_on_engines) === JSON.stringify(['chatgpt']), 'B: ChatGPT naming them on the gap question is retained as the truthful qualifier, not discarded');
  ok(r.state.named_in.length === 1 && r.state.named_in[0].question === planned[0], 'B: Q1 is recorded as named, for the "found in the first search" line');
  ok(r.state.executed === 2 && r.runsCreated === 1, 'B: two questions, one run');
}

/* C. Q1 + Q2 pass, gap on Q3 */
{
  const r = drive([{ chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(false), gemini: cell(false) }]);
  ok(r.queued.length === 3 && r.state.executed === 3, 'C: three questions executed');
  ok(r.state.gap?.question_index === 2, 'C: the gap is Q3');
  ok(r.runsCreated === 1, 'C: still one run');
}

/* D. All three pass */
{
  const r = drive([{ chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }]);
  ok(r.queued.length === 3 && r.state.executed === 3, 'D: exactly three executed');
  ok(r.state.stop_reason === 'max_questions_reached' && r.state.gap === null, 'D: stop reason is max_questions_reached, no gap');
  const summary = buildHookReportSummary({
    state: r.state,
    rows: planned.map((q) => ({ question: q, status: 'done', result: { chatgpt: cell(true), gemini: cell(true) } })),
    engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead,
  });
  const copy = hookReportCopy(summary!, 'Kirkbride Electrical');
  ok(copy.headline === 'Strong initial AI visibility', 'D: the report uses the strong-initial-visibility wording');
  ok(/named across the three searches tested/.test(copy.lede) && /quick snapshot/.test(copy.lede), 'D: the lede states three searches and the snapshot caveat');
  ok(!/100%|percent|%/.test(copy.headline + copy.lede + copy.count), 'D: no percentage or "100% visibility" claim anywhere');
  ok(summary!.questionsTested === 3 && summary!.maxQuestions === 3, 'D: 3 of up to 3 tested is exposed as counts, not a score');
}

/* E. A ChatGPT-only gap must NOT stop Gemini's progression (Paul, 2026-09-21 — task case 2).
   Gemini named all three; ChatGPT missed Q1. The hook must still ask Q2 AND Q3 — a "named" verdict
   from Gemini on Q1 is not something drive() can be told to stop after, since the plan itself has
   three questions and Gemini keeps naming them; asserting Q2 ran is what matters here. The report
   must still show the real ChatGPT miss on Q1 — it just never gets to be THE reason anything stopped. */
{
  const r = drive([
    { chatgpt: cell(false, ['Sparks Ltd']), gemini: cell(true) },
    { chatgpt: cell(true), gemini: cell(true) },
    { chatgpt: cell(true), gemini: cell(true) },
  ]);
  ok(r.queued.length === 3 && r.queued[1] === planned[1], 'E: a ChatGPT-only miss on Q1 does not stop the hook — Q2 still ran because Gemini named them');
  ok(r.state.gap === null && r.state.stop_reason === 'max_questions_reached', 'E: no gap is recorded — Gemini itself never missed, so the hook ran to the ceiling');
  ok(r.state.named_in.length === 3, 'E: all three questions are recorded as named by the deciding engine');
  const summary = buildHookReportSummary({
    state: r.state,
    rows: [
      { question: planned[0], status: 'done', result: { chatgpt: cell(false, ['Sparks Ltd']), gemini: cell(true) } },
      { question: planned[1], status: 'done', result: { chatgpt: cell(true), gemini: cell(true) } },
      { question: planned[2], status: 'done', result: { chatgpt: cell(true), gemini: cell(true) } },
    ],
    engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead,
  });
  ok(summary!.tested[0].perEngine.find((p) => p.engine === 'chatgpt')?.named === false, 'E: the report still shows the real ChatGPT miss on Q1, truthfully — never discarded');
  ok(summary!.tested[0].perEngine.find((p) => p.engine === 'gemini')?.named === true, "E: and Gemini's real Q1 answer alongside it");
}

/* E2. A genuine Gemini gap on the SAME shape still stops the hook and is attributed to Gemini,
   with ChatGPT's naming kept as the truthful "named on" qualifier (the mirror of E). */
{
  const r = drive([{ chatgpt: cell(true), gemini: cell(false, ['Sparks Ltd']) }]);
  ok(r.queued.length === 1 && r.state.stop_reason === 'visibility_gap_found', 'E2: a genuine Gemini miss stops the hook after Q1');
  ok(r.state.gap?.engine === 'gemini', 'E2: the gap engine is Gemini, the deciding engine');
  ok(JSON.stringify(r.state.gap?.named_on_engines) === JSON.stringify(['chatgpt']), 'E2: ChatGPT naming them is retained as the truthful qualifier');
  const summary = buildHookReportSummary({
    state: r.state, rows: [{ question: planned[0], status: 'done', result: { chatgpt: cell(true), gemini: cell(false, ['Sparks Ltd']) } }],
    engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead,
  });
  const copy = hookReportCopy(summary!, 'Kirkbride Electrical');
  ok(copy.lede.startsWith('We asked Gemini:') && copy.headline === 'We found a visibility gap.', 'E2: the report names Gemini, the engine that actually decided the gap');
  ok(summary!.gap?.namedOnEngineLabels.join() === 'ChatGPT', 'E2: the report can say ChatGPT did name them — no universal "AI never recommends you" claim');
  ok(summary!.tested[0].perEngine.find((p) => p.engine === 'chatgpt')?.named === true, 'E2: per-engine result still shows ChatGPT named them');
}

/* F. Provider failure on Q1 */
{
  const evalFailed = evaluateHookQuestion(null, ENGINES);
  ok(evalFailed.outcome === 'no_valid_answer', 'F: a failed row (no result) is not evaluable');
  const evalEmpty = evaluateHookQuestion({ chatgpt: failedCell(), gemini: failedCell() }, ENGINES);
  ok(evalEmpty.outcome === 'no_valid_answer', 'F: empty answers are not a gap');
  const step = advanceHookState(initialHookState(planned), 0, evalFailed);
  ok(step.action === 'stop' && step.state.stop_reason === 'provider_failure' && step.state.gap === null, 'F: a terminal provider failure stops truthfully — never a gap, never Q2');
  ok(buildHookReportSummary({ state: step.state, rows: [], engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead }) === null, 'F: no hook summary is shown for a provider failure — the ordinary rendering handles the failed run');
  // ChatGPT failed to answer at all; Gemini (the deciding engine) answered and named → named.
  ok(evaluateHookQuestion({ chatgpt: failedCell(), gemini: cell(true) }, ENGINES).outcome === 'named', 'F: ChatGPT having no answer never blocks Gemini\'s "named" from deciding');
  // A SERP block in the cell map is ignored: only scored engines are judged, and Gemini still decides.
  ok(evaluateHookQuestion({ google_organic: cell(false), chatgpt: cell(true), gemini: cell(true) }, ENGINES).outcome === 'named', 'an unscored engine block is ignored; Gemini still decides');
  // Gemini itself gave no evaluable answer → provider failure, whatever ChatGPT did.
  ok(evaluateHookQuestion({ chatgpt: cell(true), gemini: failedCell() }, ENGINES).outcome === 'no_valid_answer', 'F: a failed/empty Gemini answer is a provider failure even when ChatGPT answered and named');
  ok(evaluateHookQuestion({ chatgpt: cell(true) }, ENGINES).outcome === 'no_valid_answer', 'F: a missing Gemini block entirely is a provider failure, never inferred as "named" from ChatGPT alone');
}

/* ── N. END-TO-END: THE TEN RECONCILIATION SCENARIOS (Paul, 2026-09-21 revision) ────────────────
   Progression (drive) and qualification (geminiNamedAllThree) exercised TOGETHER, exactly the
   scenarios the revision was asked to reconcile. `settled(r)` turns a drive() result's rows back
   into the {status, result} shape geminiNamedAllThree reads — the same shape the queue processor
   passes it from real ai_audit_queue rows. */
function settled(r: ReturnType<typeof drive>, results: Array<Record<string, unknown>>) {
  return r.queued.map((_q, i) => ({ status: 'done', result: results[i] }));
}

// 1. Q1 Gemini miss → only 1 question executed, never 3/3, never qualifies.
{
  const results = [{ chatgpt: cell(true), gemini: cell(false) }];
  const r = drive(results);
  ok(r.queued.length === 1, '1: only Q1 executed');
  ok(geminiNamedAllThree(settled(r, results)) === false, '1: not 3/3 — no Not Interested update');
}

// 2. Q1 Gemini hit, ChatGPT miss → Q2 MUST execute. (A third result is supplied so the drive
//    completes rather than hitting an undefined "Q4" — the plan always has three questions and
//    Gemini keeps naming them; the assertion only cares that Q2 is among the executed questions.)
{
  const r = drive([{ chatgpt: cell(false), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }]);
  ok(r.queued.length >= 2 && r.queued[1] === planned[1], '2: Q2 executed despite the ChatGPT miss on Q1');
}

// 3. Q1/Q2 Gemini hit, ChatGPT misses either one → Q3 MUST execute.
{
  const r = drive([
    { chatgpt: cell(false), gemini: cell(true) },
    { chatgpt: cell(true), gemini: cell(true) },
    { chatgpt: cell(true), gemini: cell(true) },
  ]);
  ok(r.queued.length === 3 && r.state.executed === 3, '3: Q3 executed despite a ChatGPT miss on Q1');
}

// 4. Gemini hit, hit, miss → 3 questions execute, never 3/3, no update.
{
  const results = [{ chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(false) }];
  const r = drive(results);
  ok(r.queued.length === 3 && r.state.executed === 3, '4: three questions executed');
  ok(geminiNamedAllThree(settled(r, results)) === false, '4: Gemini missed Q3 — not 3/3, no Not Interested update');
}

// 5. Gemini hit, hit, hit; ChatGPT hit, miss, miss → still mark Not Interested.
{
  const results = [{ chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(false), gemini: cell(true) }, { chatgpt: cell(false), gemini: cell(true) }];
  const r = drive(results);
  ok(r.queued.length === 3 && r.state.executed === 3 && r.state.stop_reason === 'max_questions_reached', '5: all three executed to completion despite two ChatGPT misses');
  ok(geminiNamedAllThree(settled(r, results)) === true, '5: Gemini 3/3 qualifies regardless of ChatGPT');
}

// 6. Gemini hit, hit, hit; ChatGPT all hit → mark Not Interested.
{
  const results = [{ chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }];
  const r = drive(results);
  ok(geminiNamedAllThree(settled(r, results)) === true, '6: Gemini 3/3 with ChatGPT also 3/3 — qualifies');
}

// 7. A missing/failed Gemini result at any point must not count as 3/3.
for (const badIndex of [0, 1, 2]) {
  const results = [{ chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }];
  results[badIndex] = { chatgpt: cell(true), gemini: failedCell() };
  // Drive only as far as the bad Gemini answer allows (a failure at index 0/1 stops the hook there).
  const r = drive(results);
  const rows = settled(r, results);
  ok(geminiNamedAllThree(rows) === false, `7: a failed Gemini answer at question ${badIndex + 1} is never counted as 3/3`);
}

// 8. Non-hook audits are structurally unchanged — asserted as a source-shape guard below (M),
//    since geminiNamedAllThree/evaluateHookQuestion are only ever reached via results.hook.

// 9. The report still retains BOTH engines' real answers even when only Gemini decided progression.
{
  const r = drive([{ chatgpt: cell(false), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(false), gemini: cell(true) }]);
  const summary = buildHookReportSummary({
    state: r.state,
    rows: [
      { question: planned[0], status: 'done', result: { chatgpt: cell(false), gemini: cell(true) } },
      { question: planned[1], status: 'done', result: { chatgpt: cell(true), gemini: cell(true) } },
      { question: planned[2], status: 'done', result: { chatgpt: cell(false), gemini: cell(true) } },
    ],
    engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead,
  })!;
  ok(summary.tested.length === 3, '9: all three questions appear in the report');
  ok(summary.tested[0].perEngine.find((p) => p.engine === 'chatgpt')?.named === false, '9: Q1\'s real ChatGPT miss is shown, truthfully');
  ok(summary.tested[2].perEngine.find((p) => p.engine === 'chatgpt')?.named === false, '9: Q3\'s real ChatGPT miss is shown too, truthfully');
  ok(summary.tested.every((t) => t.perEngine.find((p) => p.engine === 'gemini')?.named === true), '9: Gemini\'s real (all-named) answers are shown throughout');
}

// 10. No fourth question can ever execute, even when Gemini names the business on Q3.
{
  const r = drive([{ chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(true), gemini: cell(true) }]);
  ok(r.queued.length === 3, '10: exactly three questions queued, never a fourth');
  ok(r.state.stop_reason === 'max_questions_reached', '10: the hook stops at the ceiling instead of asking again');
}

/* Copy for gap on Q2 / Q3 */
{
  const s2 = buildHookReportSummary({
    state: { ...initialHookState(planned), executed: 2, stop_reason: 'visibility_gap_found', named_in: [{ question_index: 0, question: planned[0], engines: ['chatgpt', 'gemini'] }],
      gap: { question_index: 1, question: planned[1], engine: 'gemini', target_named: false, named_instead: ['A Ltd'], citations: [], named_on_engines: [], answer_excerpt: '' } },
    rows: [], engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead,
  })!;
  const c2 = hookReportCopy(s2, 'Kirkbride Electrical');
  ok(c2.headline === 'We found a visibility gap on the second search.', 'Q2 gap headline says second search');
  ok(c2.earlier === 'Kirkbride Electrical was found in the first search, but not in this one.', 'Q2 gap explains the first search named them');
  ok(c2.count.startsWith('Gap found after 2 searches'), 'count is descriptive ("Gap found after 2 searches"), not a percentage');
  const c3 = hookReportCopy({ ...s2, questionsTested: 3, gap: { ...s2.gap!, questionIndex: 2 } }, 'Kirkbride Electrical');
  ok(c3.headline === 'We found a visibility gap on the third search.' && /earlier searches/.test(c3.earlier ?? ''), 'Q3 gap headline and earlier-searches line');
}

/* ── Source-shape guards: the wiring the pure functions cannot see ─────────────────────────── */
const root = resolve(import.meta.dirname, '..');
const createAudit = readFileSync(resolve(root, 'supabase/functions/create-ai-audit/index.ts'), 'utf8');
const queue = readFileSync(resolve(root, 'supabase/functions/process-ai-audit-queue/index.ts'), 'utf8');
const helper = readFileSync(resolve(root, 'supabase/functions/_shared/first-reply-audit.ts'), 'utf8');
const inbox = readFileSync(resolve(root, 'src/pages/Inbox.tsx'), 'utf8');
const outreachAudit = readFileSync(resolve(root, 'supabase/functions/_shared/outreach-audit.ts'), 'utf8');
const baseline = readFileSync(resolve(root, 'supabase/functions/_shared/audit-baseline.ts'), 'utf8');
const report = readFileSync(resolve(root, 'src/lib/auditReport.ts'), 'utf8');
const html = readFileSync(resolve(root, 'src/lib/aiAuditReportHtml.ts'), 'utf8');

// Hook gate and fan-out in create-ai-audit: EXPLICIT marker, never a heuristic.
ok(/const hookAuditRequested: boolean = body\.hook_audit === true;/.test(createAudit), 'the hook is an explicit request marker (hook_audit: true)');
ok(/const isHookAudit: boolean = hookAuditRequested && auditPurpose === ORDINARY_AUDIT_PURPOSE && !reuseAuditId && !preview;/.test(createAudit), 'adaptive applies only to a declared hook on an ordinary audit; re-runs, previews and every other purpose are excluded');
{
  const decl = createAudit.slice(createAudit.indexOf('const isHookAudit: boolean ='), createAudit.indexOf(';', createAudit.indexOf('const isHookAudit: boolean =')));
  ok(!/question_count|questionCount|providedQuestions|MAX_QUESTION|isInternal|OUTREACH_HOOK/.test(decl), 'B/C/D: question count, a supplied list and caller identity decide NOTHING about hook status');
}
const bulkJobs = readFileSync(resolve(root, 'supabase/functions/bulk-jobs/index.ts'), 'utf8');
const wizard = readFileSync(resolve(root, 'src/pages/AiAudit.tsx'), 'utf8');
ok(!bulkJobs.includes('hook_audit'), 'B: a bulk audit (3, 4 or 5 questions) sends no hook marker — full fan-out, not adaptive, not reduced to 3, normal report');
ok(!wizard.includes('hook_audit'), 'C/D: a manual or wizard audit (3 questions, or a reviewed list) sends no hook marker — existing behaviour');
ok(!baseline.includes('hook_audit'), 'G: the paid baseline chain sends no hook marker');
ok(/fresh_audit: true,[^\n]*\n\s*hook_audit: true,/.test(helper), 'E: the first reply sends fresh_audit AND the explicit hook marker');
ok(outreachAudit.includes('hook_audit: true,'), 'the drip pre-send audit sends the explicit hook marker');
ok(/hook_audit: true,\s*fresh_audit: true,/.test(inbox), 'F: the Inbox re-run sends the explicit hook marker AND fresh_audit');
ok(/const freshAudit: boolean = body\.fresh_audit === true && \(isInternal \|\| hookAuditRequested\);/.test(createAudit), 'fresh_audit and hook_audit stay separate flags; a declared hook may ask for freshness');
// H: the report keys on the persisted hook state, not on the question count.
ok(buildHookReportSummary({ state: undefined, rows: [{ question: 'q', status: 'done', result: { chatgpt: cell(false) } }], engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead }) === null, 'H: a one-question ordinary run with no hook state gets the normal report, never the hook UX');
ok(buildHookReportSummary({ state: { ...initialHookState(['q']), executed: 1, stop_reason: 'max_questions_reached' }, rows: [{ question: 'q', status: 'done', result: { chatgpt: cell(true) } }], engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead }) !== null, 'H: hook state present → hook UX');
ok(createAudit.includes('questions = planHookQuestions(questions, { town: locationText });') && createAudit.includes('hookState = initialHookState(questions);'), 'create-ai-audit plans and orders the hook questions');
ok(createAudit.includes('(hookState ? questions.slice(0, 1) : questions).map('), 'create-ai-audit queues ONLY Q1 for a hook; every other audit still fans out in full');
ok(createAudit.includes('if (hookState) runResults.hook = hookState;'), 'the plan lives on the run (results.hook) — no migration');
ok(/&& !freshAudit && !isHookAudit\) \{/.test(createAudit), 'H: a hook request never reuses the lead\'s existing audit — an Inbox re-run is a NEW hook that starts at Q1');
ok((createAudit.match(/from\("ai_audit_runs"\)\s*\.insert\(/g) ?? []).length === 1 && !/from\("ai_audit_runs"\)\s*\.insert\(/.test(queue.replace(/\/\*[\s\S]*?\*\//g, '')), 'only create-ai-audit inserts a run; the processor never mints run 2');

// The processor's step.
ok(queue.includes('advanceHookState(hookPrev, lastIdx, evaluation)') && queue.includes('evaluateHookQuestion('), 'the processor evaluates the settled question on the scored engines');
ok(queue.includes('.eq("results->hook->>next_index", String(hookPrev.next_index))'), 'queuing the next question is an atomic claim on the persisted plan — two ticks cannot both queue Q2');
ok(/from\("ai_audit_queue"\)\.insert\(\{\s*audit_id: runRow\?\.audit_id, run_id: runId/.test(queue), 'the next question is another queue row on the SAME run');
ok(queue.includes('continue; // not finalised: the new row keeps the run open'), 'the run is not finalised while the hook is still asking');
ok(queue.includes('!isCapped && rows.length > 0'), 'a capped run never asks another question');

// G. First reply: one fresh adaptive hook, reliability semantics intact.
ok(helper.includes('fresh_audit: true') && helper.includes('question_count: OUTREACH_HOOK_QUESTIONS') && !helper.includes('questions:'), 'G: the first-reply audit is a generated ordinary audit — adaptive by construction — and always fresh');
ok(!helper.includes('nextAuditRequest') && !/audit_id: row\.audit_id/.test(helper), 'G: a retry mints a fresh hook, never run 2 on the failed one');
ok(helper.includes('audit_status: "starting"') && helper.includes('.eq("id", row.id).eq("audit_status", "queued")'), 'G: e0a72430 claim and queued-settlement semantics remain');

// H. Inbox re-run sends no audit_id, so it goes through the (now non-reusing) hook path.
const startAudit = inbox.slice(inbox.indexOf('const startAudit = async'), inbox.indexOf('const startAudit = async') + 1400);
ok(startAudit.includes("invoke('create-ai-audit'") && !startAudit.includes('audit_id:') && !startAudit.includes('questions:'), 'H: the Inbox button creates a fresh generated audit (adaptive), never a re-run of the old one');

// Pre-send drip hook: generated, no questions[], no target_runs → adaptive, one run.
ok(outreachAudit.includes('question_count: OUTREACH_AUDIT_QUESTIONS') && !outreachAudit.includes('target_runs:') && !outreachAudit.includes('questions:'), 'the drip pre-send hook is adaptive by construction and single-run');

// I. Paid baseline untouched: 20 x 3, frozen set, replayed verbatim.
ok(BASELINE_QUESTIONS === 20 && BASELINE_RUNS === 3, `I: paid baseline stays ${BASELINE_QUESTIONS} questions x ${BASELINE_RUNS} runs`);
ok(/audit_id: auditId,\s*\/\/ re-run path: same audit, next run_number/.test(baseline), 'I: advanceBaseline still adds runs 2 and 3 to the SAME baseline audit');
ok(baseline.includes('questions: plan.questions,') && baseline.includes('purpose: "remeasure"'), 'I: the day-28 remeasure still replays the frozen asked set verbatim');
ok(!baseline.includes('hookAudit') && !baseline.includes('planHookQuestions'), 'I: no adaptive sequencing reaches the baseline module');

// J. Full/manual measurement unchanged: purpose measurement is never a hook, and a supplied list is never a hook.
ok(createAudit.includes('isMeasurement ? MEASUREMENT_AUDIT_PURPOSE') && /isHookAudit: boolean = hookAuditRequested && auditPurpose === ORDINARY_AUDIT_PURPOSE/.test(createAudit), 'J: a measurement (or any non-ordinary purpose) can never be adaptive, marker or not');

// Report: the hook summary is attached by the builder and rendered by its own section.
ok(report.includes('hook: buildHookReportSummary({') && report.includes('engineOrder: SCORED_ENGINES'), 'the report builder attaches the hook summary from the run state, scored engines only');
ok(report.includes('namedInstead: (gap) => rivalsSuppressed ? [] :'), 'rival names on the hook card obey the same cleanliness gate as the rest of the report');
ok(html.includes('export function renderHookSection(') && html.includes('d.hook ? `${renderHookSection(d.hook, d.businessName)}'), 'the renderer branches narrowly on d.hook — the counted hero is replaced, nothing else is forked');
ok(html.includes('hookReportCopy(h, businessName)'), 'the renderer uses the tested copy verbatim');
const hookSection = html.slice(html.indexOf('export function renderHookSection('), html.indexOf('export function renderReportHtml('));
ok(!/\d+%|out of \$\{|showed up in AI search/.test(hookSection), 'the hook section never prints a percentage or an "N out of M answers" score');

/* ── N. THE MODEL/EVIDENCE BOX — restored (2026-09-21), then simplified the same day ─────────────
   Two changes exercised together as RENDER tests (build a real HookReportSummary via
   buildHookReportSummary, inspect renderHookSection's actual HTML output, not just source text):
     1. the separate pink `.hook-card` block (a second "we asked / answered with other suggestions /
        wasn't named") is GONE — the model/evidence box directly under the heading is now the only
        place that narrative appears.
     2. the box no longer quotes the model's raw answer text — only the engine, the exact question,
        the STRUCTURED competitor list (namedInstead), and the red not-named result line. */
const gapAnswer = 'Try Sparks Ltd or Volt Electrical for a fast callout in Doncaster.';
const gapState = (engine: 'gemini' | 'chatgpt', namedInsteadList: string[] = ['Sparks Ltd', 'Volt Electrical']): HookState => ({
  version: 1,
  planned: ['Can you recommend a good electrician in Doncaster, UK?'],
  next_index: 1,
  executed: 1,
  stop_reason: 'visibility_gap_found',
  gap: {
    question_index: 0,
    question: 'Can you recommend a good electrician in Doncaster, UK?',
    engine,
    target_named: false,
    named_instead: namedInsteadList,
    citations: [],
    named_on_engines: [],
    answer_excerpt: gapAnswer,
  },
  named_in: [],
});
const gapRows = (engine: 'gemini' | 'chatgpt', competitors: string[]) => [
  { question: 'Can you recommend a good electrician in Doncaster, UK?', status: 'done', result: { [engine]: cell(false, competitors, gapAnswer) } },
];
const buildAndRender = (engine: 'gemini' | 'chatgpt', namedInsteadList: string[] = ['Sparks Ltd', 'Volt Electrical']) => {
  const summary = buildHookReportSummary({
    state: gapState(engine, namedInsteadList), rows: gapRows(engine, namedInsteadList),
    engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead,
  });
  return renderHookSection(summary!, 'Doncaster Sparks Ltd');
};

// N1: the old duplicate pink narrative block is gone — no .hook-card, no "We asked X:" prose,
// no "answered with other suggestions" line repeated above the box.
const geminiHtml = buildAndRender('gemini');
ok(!geminiHtml.includes('class="hook-card"'), 'N1: the separate pink duplicate block no longer renders');
ok(!geminiHtml.includes('We asked') && !geminiHtml.includes('answered with other suggestions'), 'N1: the duplicated "we asked / answered with other suggestions" prose is gone');
ok(geminiHtml.includes('We found a visibility gap'), 'N1: the section heading itself is kept');

// N2/N3: the model box renders the engine name and the exact question.
ok(geminiHtml.includes('class="chatcard"'), 'the model/evidence box renders');
ok(geminiHtml.includes('cc-mark--gem') && !geminiHtml.includes('cc-mark--oai'), 'N2: it carries the Gemini mark for a Gemini gap, not ChatGPT’s');
ok(geminiHtml.includes('>Gemini<'), 'N2: the engine label reads Gemini');
const chatgptHtml = buildAndRender('chatgpt');
ok(chatgptHtml.includes('cc-mark--oai') && !chatgptHtml.includes('cc-mark--gem'), 'N2: a ChatGPT gap carries the ChatGPT mark instead');
ok(chatgptHtml.includes('>ChatGPT<'), 'N2: the engine label reads ChatGPT');
ok(geminiHtml.includes('Can you recommend a good electrician in Doncaster, UK?'), 'N3: the exact question asked is shown verbatim');

// N4: structured competitors render as a short, deduplicated list — from namedInstead (the
// already-cleaned, already-capped extraction), never re-parsed from the raw answer.
ok(geminiHtml.includes('<li>Sparks Ltd</li>') && geminiHtml.includes('<li>Volt Electrical</li>'), 'N4: the structured competitor names render as a list');
const dupedHtml = buildAndRender('gemini', ['Sparks Ltd', 'sparks ltd ', 'Volt Electrical']);
ok((dupedHtml.match(/<li>/g) ?? []).length === 2, 'N4: a case/whitespace duplicate is deduplicated to one entry');
const manyHtml = buildAndRender('gemini', ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
ok((manyHtml.match(/<li>/g) ?? []).length <= 5, 'N4: the visible list is capped to a reasonable amount (<=5)');

// N5: the long raw answer text is NOT dumped into the report anywhere.
ok(!geminiHtml.includes(esc(gapAnswer)), 'N5: the raw stored answer text is never rendered into the report');

// N6: "[Business] wasn't named." renders in red (the .cc-callout/.cc-bang treatment) for a real gap.
ok(geminiHtml.includes('class="cc-callout"') && geminiHtml.includes('Doncaster Sparks Ltd wasn&rsquo;t named.'), 'N6: the red not-named result line renders with the real business name');
// The fully-named ("ok") branch must never show this red missed-result state — preserve existing
// truthful logic: no gap → no callout, no fabricated "wasn't named" claim.
const namedState: HookState = { version: 1, planned: ['q1'], next_index: 1, executed: 1, stop_reason: 'max_questions_reached', gap: null, named_in: [{ question_index: 0, question: 'q1', engines: ['gemini'] }] };
const namedRows = [{ question: 'q1', status: 'done', result: { gemini: cell(true) } }];
const namedSummary = buildHookReportSummary({ state: namedState, rows: namedRows, engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead });
const namedHtml = renderHookSection(namedSummary!, 'Doncaster Sparks Ltd');
ok(!namedHtml.includes('class="chatcard"') && !namedHtml.includes('cc-callout'), 'N6: a fully-named result never renders the missed-result box or red line');
ok(namedHtml.includes('hook-head ok'), 'the fully-named headline still renders');

// N7: missing/no competitors never invent a name — the truthful fallback line renders instead.
const noCompetitorsHtml = buildAndRender('gemini', []);
ok(noCompetitorsHtml.includes('Other businesses were suggested.'), 'N7: no extracted competitors → the truthful fallback line, never a fabricated name');
ok(!(noCompetitorsHtml.match(/<li>/g) ?? []).length, 'N7: no <li> competitor entries appear when none were extracted');

// Everything else in the hook section still renders (no broader redesign).
ok(geminiHtml.includes('hook-eyebrow') && geminiHtml.includes('hook-count') && geminiHtml.includes('hook-caveat'), 'the eyebrow, count and caveat all still render beside the simplified box');

/* ── K. GEMINI-ONLY 3/3 AUTO "NOT INTERESTED" (Paul, 2026-09-21) ─────────────────────────────────
   geminiNamedAllThree is deliberately independent of the hook's own stop/gap logic above — it
   reads the three settled rows on its own terms, Gemini's cell only. ChatGPT's presence, absence
   or failure must never move this answer. */
const done = (result: Record<string, unknown>) => ({ status: 'done', result });

// 1/2/3: fewer than three executed rows (Q1/Q2/Q3 miss stops the hook early) never qualify.
ok(geminiNamedAllThree([done({ gemini: cell(false), chatgpt: cell(false) })]) === false, '1: Q1 Gemini miss (1 row) — never 3/3');
ok(geminiNamedAllThree([done({ gemini: cell(true) }), done({ gemini: cell(false) })]) === false, '2: Q1 hit + Q2 miss (2 rows) — never 3/3');
ok(geminiNamedAllThree([done({ gemini: cell(true) }), done({ gemini: cell(true) }), done({ gemini: cell(false) })]) === false, '3: Q1+Q2 hit, Q3 miss — not 3/3');

// 4: all three genuinely named on Gemini.
ok(geminiNamedAllThree([done({ gemini: cell(true) }), done({ gemini: cell(true) }), done({ gemini: cell(true) })]) === true, '4: Gemini named on all three — qualifies');

// 5: a Gemini error/timeout/unavailable answer on any of the three is never counted as a hit.
ok(geminiNamedAllThree([done({ gemini: cell(true) }), done({ gemini: failedCell() }), done({ gemini: cell(true) })]) === false, '5a: an empty/failed Gemini cell on Q2 blocks qualification');
ok(geminiNamedAllThree([done({ gemini: cell(true) }), done({ gemini: cell(true) }), { status: 'failed', result: null }]) === false, '5b: a failed queue row on Q3 blocks qualification');
ok(geminiNamedAllThree([done({ gemini: cell(true) }), done({ gemini: cell(true) }), done({ chatgpt: cell(true) })]) === false, '5c: a missing Gemini block entirely (no engine cell) blocks qualification');

// 6: ChatGPT 3/3 but Gemini not 3/3 — ChatGPT never decides this.
ok(geminiNamedAllThree([
  done({ chatgpt: cell(true), gemini: cell(true) }),
  done({ chatgpt: cell(true), gemini: cell(true) }),
  done({ chatgpt: cell(true), gemini: cell(false) }),
]) === false, '6: ChatGPT 3/3 does not compensate for a Gemini miss on Q3');
ok(geminiNamedAllThree([
  done({ chatgpt: cell(false), gemini: cell(true) }),
  done({ chatgpt: cell(false), gemini: cell(true) }),
  done({ chatgpt: cell(false), gemini: cell(true) }),
]) === true, '6b: ChatGPT missing/failing on all three still qualifies on Gemini alone — ChatGPT cannot veto it either');

// 7: a non-hook audit never reaches geminiNamedAllThree in production — the queue only calls it
// inside `if (isHookState(results.hook) ...)`, asserted below as a source-shape guard.

/* ── L. THE LEAD WRITE ITSELF: resolution, the exact status, and the terminal-state guard ──────
   A tiny fake Supabase client that behaves like Postgres would under the code's own `.not(...)`
   predicate, so the test tracks PROTECTED_LEAD_STATUSES from the source rather than duplicating
   the list. */
type FakeLead = { id: string; status: string; is_potential_work: boolean | null };
function fakeService(opts: { auditLeadId?: string | null; auditError?: string; lead?: FakeLead | null }) {
  function chain(table: string) {
    const calls: Array<[string, unknown[]]> = [];
    const resolve = () => {
      if (table === 'ai_audits') {
        if (opts.auditError) return { data: null, error: { message: opts.auditError } };
        return { data: opts.auditLeadId === undefined ? null : { lead_id: opts.auditLeadId }, error: null };
      }
      // outreach_leads: simulate the conditional UPDATE ... WHERE id = ? AND status NOT IN (...) AND (is_potential_work IS NULL OR = false)
      const lead = opts.lead;
      if (!lead) return { data: [], error: null };
      const eqId = calls.find((c) => c[0] === 'eq' && c[1][0] === 'id')?.[1][1];
      if (eqId !== lead.id) return { data: [], error: null };
      const notIn = calls.find((c) => c[0] === 'not');
      const protectedList = notIn ? String(notIn[1][2]).replace(/^\(|\)$/g, '').split(',') : [];
      if (protectedList.includes(lead.status)) return { data: [], error: null };
      if (lead.is_potential_work === true) return { data: [], error: null };
      return { data: [{ id: lead.id }], error: null };
    };
    const api: Record<string, unknown> = {
      select: (...a: unknown[]) => { calls.push(['select', a]); return api; },
      update: (...a: unknown[]) => { calls.push(['update', a]); return api; },
      eq: (...a: unknown[]) => { calls.push(['eq', a]); return api; },
      not: (...a: unknown[]) => { calls.push(['not', a]); return api; },
      or: (...a: unknown[]) => { calls.push(['or', a]); return api; },
      maybeSingle: async () => resolve(),
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
    };
    return api;
  }
  return { from: chain };
}

const threeGeminiHits = [done({ gemini: cell(true) }), done({ gemini: cell(true) }), done({ gemini: cell(true) })];

// Top-level await: this file is an ES module (package.json "type": "module"), and these checks
// exercise real async IO through the fake client, so they must resolve before the failure count
// below is read — a fire-and-forget async block here would let the final throw run first.
await (async () => {
  // 4 (write side): a genuinely qualifying lead, still active, gets moved.
  {
    const svc = fakeService({ auditLeadId: 'lead-1', lead: { id: 'lead-1', status: 'queued', is_potential_work: null } });
    const outcome = await autoMarkHookLeadNotInterested(svc, 'audit-1', threeGeminiHits);
    ok(outcome.applied === true && outcome.leadId === 'lead-1', '4 (write): a 3/3 Gemini hook on an active lead is applied');
  }
  // Not 3/3 → never calls through to a lead write, never guesses.
  {
    const svc = fakeService({ auditLeadId: 'lead-1', lead: { id: 'lead-1', status: 'queued', is_potential_work: null } });
    const outcome = await autoMarkHookLeadNotInterested(svc, 'audit-1', [done({ gemini: cell(true) }), done({ gemini: cell(false) })]);
    ok(outcome.applied === false && outcome.reason === 'gemini_not_3_of_3', 'not 3/3 → never applied');
  }
  // 8: missing/ambiguous lead association — never update another lead, never guess.
  {
    const svc = fakeService({ auditLeadId: null, lead: { id: 'lead-1', status: 'queued', is_potential_work: null } });
    const outcome = await autoMarkHookLeadNotInterested(svc, 'audit-1', threeGeminiHits);
    ok(outcome.applied === false && outcome.reason === 'audit_has_no_lead', '8a: an audit with no lead_id is left alone');
  }
  {
    const svc = fakeService({});
    const outcome = await autoMarkHookLeadNotInterested(svc, null, threeGeminiHits);
    ok(outcome.applied === false && outcome.reason === 'no_audit_id', '8b: no audit id at all — never looked up, never guessed');
  }
  {
    const svc = fakeService({ auditError: 'timeout' });
    const outcome = await autoMarkHookLeadNotInterested(svc, 'audit-1', threeGeminiHits);
    ok(outcome.applied === false && outcome.reason.startsWith('audit_lookup_failed'), '8c: an unreadable audit->lead lookup is reported, not guessed past');
  }
  // 9: a lead already in a manual/paid/terminal state, or starred Interested, is left untouched.
  for (const status of ['payment_received', 'in_delivery', 'completed', 'refunded', 'closed', 'opted_out', 'price_given', 'already_visible', 'not_interested']) {
    const svc = fakeService({ auditLeadId: 'lead-1', lead: { id: 'lead-1', status, is_potential_work: null } });
    const outcome = await autoMarkHookLeadNotInterested(svc, 'audit-1', threeGeminiHits);
    ok(outcome.applied === false, `9: a lead already "${status}" is never overwritten by the auto-classification`);
  }
  {
    const svc = fakeService({ auditLeadId: 'lead-1', lead: { id: 'lead-1', status: 'queued', is_potential_work: true } });
    const outcome = await autoMarkHookLeadNotInterested(svc, 'audit-1', threeGeminiHits);
    ok(outcome.applied === false, '9b: a lead starred Interested (is_potential_work) is never auto-marked not interested');
  }
})();

/* ── M. Source-shape guards for the write path and the isolation from every other audit type ──── */
const notInterested = readFileSync(resolve(root, 'supabase/functions/_shared/hook-not-interested.ts'), 'utf8');
ok(/status: "not_interested", is_potential_work: false/.test(notInterested), 'M: the write is the EXACT statusUpdatePatch(\'not_interested\') shape — no parallel status invented');
ok(queue.includes('isHookState((results as Row).hook) && (results as Row).hook.executed === 3 && rows.length === 3'), 'M: the queue only ever calls the auto-classifier for a genuine hook run with all three questions settled — every other audit type (Quick Check, Full Measurement, paid baseline, remeasure, manual/bulk) never populates results.hook and is structurally excluded');
ok(queue.includes('autoMarkHookLeadNotInterested(service, runRow?.audit_id, rows)'), 'M: the write happens after the SAME atomic finalise claim as the crawl side-effect — fires once per run, not once per tick');

if (failures) throw new Error(`${failures} adaptive hook checks failed`);
