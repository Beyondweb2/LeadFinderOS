import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HOOK_MAX_QUESTIONS,
  advanceHookState,
  buildHookReportSummary,
  evaluateHookQuestion,
  hookReportCopy,
  initialHookState,
  planHookQuestions,
  type HookState,
} from '../src/lib/hookAudit.ts';
import { BASELINE_QUESTIONS, BASELINE_RUNS, OUTREACH_HOOK_QUESTIONS } from '../src/lib/auditQuestionCounts.ts';

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

/* A. Gap on Q1 (ChatGPT misses, Gemini misses too) */
{
  const r = drive([{ chatgpt: cell(false), gemini: cell(false) }]);
  ok(r.queued.length === 1, 'A: only Q1 was queued — Q2/Q3 never reached the provider');
  ok(r.runsCreated === 1, 'A: one audit run');
  ok(r.state.stop_reason === 'visibility_gap_found', 'A: stop reason is visibility_gap_found');
  ok(r.state.gap?.question === planned[0] && r.state.gap?.engine === 'chatgpt' && r.state.gap?.question_index === 0, 'A: the exact gap question and engine are preserved');
  ok(JSON.stringify(r.state.gap?.named_instead) === JSON.stringify(['Sparks Ltd', 'Volt Electrical']) && r.state.gap?.citations.length === 1, 'A: businesses named instead and citations are preserved');
  ok(r.state.gap?.target_named === false, 'A: the target is recorded as not named');
}

/* B. Q1 pass, gap on Q2 */
{
  const r = drive([{ chatgpt: cell(true), gemini: cell(true) }, { chatgpt: cell(false), gemini: cell(true) }]);
  ok(r.queued.length === 2 && r.queued[1] === planned[1], 'B: Q1 then Q2 executed, Q3 never queued');
  ok(r.state.gap?.question_index === 1 && r.state.gap?.question === planned[1], 'B: the gap is Q2');
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

/* E. Multi-engine mixed: ChatGPT misses, Gemini names */
{
  const r = drive([{ chatgpt: cell(false, ['Sparks Ltd']), gemini: cell(true) }]);
  ok(r.queued.length === 1 && r.state.stop_reason === 'visibility_gap_found', 'E: stops after Q1');
  ok(r.state.gap?.engine === 'chatgpt', 'E: the gap engine is ChatGPT');
  ok(JSON.stringify(r.state.gap?.named_on_engines) === JSON.stringify(['gemini']), 'E: Gemini naming them is retained as the qualifier');
  const summary = buildHookReportSummary({
    state: r.state, rows: [{ question: planned[0], status: 'done', result: { chatgpt: cell(false, ['Sparks Ltd']), gemini: cell(true) } }],
    engineOrder: ENGINES, engineLabel: label, namedInstead: (g) => g.named_instead,
  });
  const copy = hookReportCopy(summary!, 'Kirkbride Electrical');
  ok(copy.lede.startsWith('We asked ChatGPT:') && copy.headline === 'We found a visibility gap.', 'E: the report names ChatGPT, not "AI"');
  ok(summary!.gap?.namedOnEngineLabels.join() === 'Gemini', 'E: the report can say Gemini did name them — no universal "AI never recommends you" claim');
  ok(summary!.tested[0].perEngine.find((p) => p.engine === 'gemini')?.named === true, 'E: per-engine result shows Gemini named them');
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
  // Mixed: one engine failed, the other answered and named → named (the failed engine is absent, not a gap)
  ok(evaluateHookQuestion({ chatgpt: failedCell(), gemini: cell(true) }, ENGINES).outcome === 'named', 'F: an engine with no answer never decides a gap');
  // A SERP block in the cell map is ignored: only scored engines are judged.
  ok(evaluateHookQuestion({ google_organic: cell(false), chatgpt: cell(true) }, ENGINES).outcome === 'named', 'only scored engines decide a gap');
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

if (failures) throw new Error(`${failures} adaptive hook checks failed`);
