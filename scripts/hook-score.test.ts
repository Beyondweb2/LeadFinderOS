/* The six-result hook (3 questions × ChatGPT + Google AI), 2026-09-25. src/lib/hookScore.ts is the
   score; this drives it with the cases Paul listed (A–K) plus the surfaces that read it: the report
   summary, the deep-crawl gate, the send guard, the 6/6 Not Interested write and the Inbox card's
   audit choice. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HOOK_ALL_NAMED_REASON, HOOK_ENGINES, HOOK_SCORE_RESULTS, hookMissSentence, hookScoreHeadline,
  initialHookStateV2, isHookStateV2, pickHookResult, rowsFromRunResults, scoreHookRun, type HookScoreRow,
} from '../src/lib/hookScore.ts';
import { buildHookReportSummary, hookReportCopy, initialHookState, isHookState, shouldDeepCrawl } from '../src/lib/hookAudit.ts';
import { cellNamed } from '../src/lib/namedSignal.ts';
import { pickHookAudit, scoreHookAuditForCard } from '../src/lib/hookVisibility.ts';
import { sixResultHookForbidsAbsenceCopy, hookForbidsAbsenceCopy } from '../supabase/functions/_shared/audit-reply.ts';
import { autoMarkSixOfSixNotInterested } from '../supabase/functions/_shared/hook-not-interested.ts';
import { OUTREACH_HOOK_QUESTIONS } from '../src/lib/auditQuestionCounts.ts';

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
];
const state = initialHookStateV2(Q);

const namedAnswer = (rivals: string[]) => `Good options in Addlestone include ${BIZ}, ${rivals.join(', ')}.`;
const missAnswer = (rivals: string[]) => `Good options in Addlestone include ${rivals.join(', ')}.`;
function cell(named: boolean, rivals: string[] = ['Sparks Ltd', 'Volt Electrical', 'Addlestone Power']) {
  return { named, self_named: named, answer_text: named ? namedAnswer(rivals) : missAnswer(rivals), competitors: rivals, citations: [{ title: 't', url: 'https://example.com' }] };
}
/** rows from a 3×2 grid: grid[i] = [chatgptNamed, geminiNamed]; null = that engine failed. */
function rows(grid: Array<[boolean | null, boolean | null]>, rivals?: (qi: number, e: string) => string[]): HookScoreRow[] {
  return grid.map(([c, g], i) => {
    const result: Record<string, unknown> = {};
    if (c !== null) result.chatgpt = cell(c, rivals?.(i, 'chatgpt'));
    else result.chatgpt = { named: false, answer_text: '', competitors: [], error: 'timeout' };
    if (g !== null) result.gemini = cell(g, rivals?.(i, 'gemini'));
    return { question: Q[i], status: 'done', result, engines: [...HOOK_ENGINES] };
  });
}
const score = (grid: Array<[boolean | null, boolean | null]>, rivals?: (qi: number, e: string) => string[]) => scoreHookRun(state, rows(grid, rivals), CTX);
const tally = (s: ReturnType<typeof score>, e: string) => s.perEngine.find((t) => t.engine === e);

/* ── Shape ──────────────────────────────────────────────────────────────────────────────────── */
ok(HOOK_SCORE_RESULTS === 6 && OUTREACH_HOOK_QUESTIONS === 3, 'a new hook is 3 questions × 2 engines = 6 results');
ok(isHookStateV2(state) && !isHookState(state), 'version 2 is its own state; the v1 step machine never touches it');
ok(JSON.stringify(state.engines) === JSON.stringify(['chatgpt', 'gemini']), 'both engines are asked every question');

/* A. 0/6 */
{
  const s = score([[false, false], [false, false], [false, false]]);
  ok(s.complete && s.named === 0 && s.expected === 6 && s.percent === 0, 'A: 0/6 → 0%');
  ok(s.misses.length === 6, 'A: six misses');
  ok(s.hook?.engine === 'gemini', 'A: a Google AI miss is preferred for the hook');
  ok(hookScoreHeadline(s) === '0% named (0/6)', 'A: headline "0% named (0/6)"');
}
/* B. ChatGPT 2/3, Google AI 0/3 */
{
  const s = score([[true, false], [true, false], [false, false]]);
  ok(s.named === 2 && s.percent === 33 && tally(s, 'chatgpt')?.named === 2 && tally(s, 'gemini')?.named === 0, 'B: 2/6 → 33% (ChatGPT 2/3, Google AI 0/3)');
}
/* C. ChatGPT 2/3, Google AI 1/3 */
{
  const s = score([[true, true], [true, false], [false, false]]);
  ok(s.named === 3 && s.percent === 50, 'C: 3/6 → 50%');
}
/* D. ChatGPT 3/3, Google AI 1/3 */
{
  const s = score([[true, true], [true, false], [true, false]]);
  ok(s.named === 4 && s.percent === 67 && hookScoreHeadline(s) === '67% named (4/6)', 'D: 4/6 → 67%');
  ok(tally(s, 'chatgpt')?.named === 3 && tally(s, 'chatgpt')?.expected === 3 && tally(s, 'gemini')?.named === 1, 'D: engine split ChatGPT 3/3, Google AI 1/3');
}
/* E. ChatGPT 3/3, Google AI 2/3 */
{
  const s = score([[true, true], [true, false], [true, true]]);
  ok(s.named === 5 && s.percent === 83, 'E: 5/6 → 83%');
  ok(!s.allNamed && s.hook !== null, 'E: still an outreach candidate');
  ok(s.hook?.engine === 'gemini' && s.hook?.question === Q[1], 'E: the Google AI missed question becomes the hook');
}
/* F. 6/6 */
{
  const s = score([[true, true], [true, true], [true, true]]);
  ok(s.complete && s.allNamed && s.percent === 100 && hookScoreHeadline(s) === '100% named (6/6)', 'F: 6/6 → 100%');
  ok(s.hook === null && s.misses.length === 0, 'F: no hook, nothing fabricated');
}
/* G. Google AI 3/3, ChatGPT 2/3 */
{
  const s = score([[true, true], [false, true], [true, true]]);
  ok(s.hook?.engine === 'chatgpt' && s.hook.question === Q[1], 'G: with no Google AI miss, the ChatGPT missed question becomes the hook');
}
/* H. One API failure */
{
  const s = score([[true, false], [null, false], [false, false]]);
  ok(!s.complete && s.percent === null && hookScoreHeadline(s) === null, 'H: one failed result → incomplete, no final percentage');
  ok(s.valid === 5 && s.failed === 1 && s.named === 1, 'H: the failure is counted as failed, never as "not named"');
  ok(s.hook === null && !s.allNamed, 'H: no hook and no 6/6 from an incomplete audit');
  const allNamedButOne = score([[true, true], [true, true], [null, true]]);
  ok(!allNamedButOne.allNamed && !allNamedButOne.complete, 'H: five named plus one failure is not 6/6 (and not 5/6)');
  const missingGemini = scoreHookRun(state, rows([[true, true], [true, true], [true, null]]), CTX);
  ok(!missingGemini.complete && missingGemini.failed === 1, 'H: a missing engine block on a done row is a failure');
  const failedRow = scoreHookRun(state, [...rows([[true, true], [true, true]]), { question: Q[2], status: 'failed', result: null }], CTX);
  ok(!failedRow.complete && failedRow.failed === 2, 'H: a failed row fails both of its engines');
  const running = scoreHookRun(state, [...rows([[true, true]]), { question: Q[1], status: 'running', result: null }], CTX);
  ok(!running.complete && running.pending === 4 && running.valid === 2, 'H: in flight: two valid, four still to come (row running + row not yet read)');
}
/* I. Historical adaptive hook */
{
  // v1 stopped after Q1 on a Gemini gap: two results exist, and it is scored out of two.
  const v1 = { ...initialHookState(Q), executed: 1, stop_reason: 'visibility_gap_found' as const };
  const s = scoreHookRun(v1, rows([[true, false]]), CTX);
  ok(s.shape === 'adaptive_legacy' && s.expected === 2 && s.named === 1 && s.percent === 50, 'I: a v1 hook stopped after one question reads 50% (1/2), never out of six');
  // v1 that ran all three with Gemini named every time and ChatGPT once missing: 5/6 on its own denominator.
  const v1full = { ...initialHookState(Q), executed: 3, stop_reason: 'max_questions_reached' as const };
  const s3 = scoreHookRun(v1full, rows([[true, true], [false, true], [true, true]]), CTX);
  ok(s3.expected === 6 && s3.named === 5, 'I: a v1 hook that asked three questions is scored on the six it has');
  // A legacy ordinary audit (no hook marker) with only ChatGPT on each row: 2/3 → 67%.
  const legacyRows: HookScoreRow[] = Q.map((q, i) => ({ question: q, status: 'done', engines: ['chatgpt'], result: { chatgpt: cell(i !== 2) } }));
  const legacy = scoreHookRun(null, legacyRows, CTX);
  ok(legacy.shape === 'legacy' && legacy.expected === 3 && legacy.named === 2 && legacy.percent === 67 && hookScoreHeadline(legacy) === '67% named (2/3)', 'I: a historical 2/3 audit shows 67% (2/3), no fake six-result denominator');
  const v1failed = { ...initialHookState(Q), executed: 1, stop_reason: 'provider_failure' as const };
  ok(!scoreHookRun(v1failed, rows([[true, true]]), CTX).complete, 'I: a v1 provider-failure stop is never a final score');
}
/* J. Competitor integrity */
{
  const rivals = (qi: number, e: string) => [`${e}-q${qi}-A`, `${e}-q${qi}-B`, `${e}-q${qi}-C`];
  const s = score([[false, true], [false, false], [true, false]], rivals);
  ok(s.hook?.engine === 'gemini', 'J: the hook is a Google AI miss');
  const qi = s.hook!.questionIndex;
  ok(s.hook!.competitors.every((n) => n.startsWith(`gemini-q${qi}-`)) && s.hook!.competitors.length === 3,
    'J: the hook competitors come from the exact engine and question of the hook, never merged');
  for (const m of s.misses) ok(m.competitors.every((n) => n.startsWith(`${m.engine}-q${m.questionIndex}-`)), `J: missed ${m.engine} Q${m.questionIndex + 1} keeps its own names`);
  // Ranking: a miss with no usable names loses to an equally worded one with three.
  const pick = pickHookResult([
    { questionIndex: 0, question: Q[0], engine: 'gemini', label: 'Google AI', status: 'not_named', competitors: [], answerExcerpt: '' },
    { questionIndex: 2, question: 'Who are the best electricians in Addlestone for repairs?', engine: 'gemini', label: 'Google AI', status: 'not_named', competitors: ['A', 'B', 'C'], answerExcerpt: '' },
  ], { town: TOWN, trade: TRADE });
  ok(pick?.questionIndex === 2, 'J: the strongest miss is chosen, not simply the first (useful competitor names count)');
  const priceVsBroad = pickHookResult([
    { questionIndex: 0, question: 'How much does an electrician cost in Addlestone?', engine: 'gemini', label: 'Google AI', status: 'not_named', competitors: ['A', 'B', 'C'], answerExcerpt: '' },
    { questionIndex: 1, question: 'Can you recommend a good electrician in Addlestone?', engine: 'gemini', label: 'Google AI', status: 'not_named', competitors: ['A', 'B', 'C'], answerExcerpt: '' },
  ], { town: TOWN, trade: TRADE });
  ok(priceVsBroad?.questionIndex === 1, 'J: commercial recommendation intent outranks a price question');
  ok(pickHookResult([], { town: TOWN, trade: TRADE }) === null, 'J: no misses → no hook');
}
/* K. One matcher */
{
  const r = rows([[true, false], [true, true], [false, false]]);
  const s = scoreHookRun(state, r, CTX);
  for (const res of s.results) {
    const c = (r[res.questionIndex].result as Record<string, unknown>)[res.engine];
    ok((res.status === 'named') === cellNamed(c as never, CTX.named), `K: Q${res.questionIndex + 1} ${res.engine} agrees with cellNamed (the report's ruler)`);
  }
  // Joined/punctuated spelling of the name in the answer counts as named, through nameMatch's own
  // rules. Uses a text-judgeable name: short initials like E.E.S fall back to the model verdict.
  const jctx = { named: { businessName: 'Jones Electrical', trade: TRADE, town: TOWN }, town: TOWN, trade: TRADE };
  const joined = { question: Q[0], status: 'done', engines: [...HOOK_ENGINES], result: {
    chatgpt: { answer_text: 'Try JonesElectrical or Sparks Ltd.', competitors: ['Sparks Ltd'] },
    gemini: { answer_text: 'Try Jones-Electrical, Sparks Ltd.', competitors: ['Sparks Ltd'] },
  } };
  const js = scoreHookRun(initialHookStateV2([Q[0]]), [joined], jctx);
  ok(js.named === 2 && js.results.every((x) => x.status === 'named'), 'K: joined (JonesElectrical) and hyphenated (Jones-Electrical) forms are named');
  const absent = scoreHookRun(initialHookStateV2([Q[0]]), [{ ...joined, result: { chatgpt: { answer_text: 'Try Sparks Ltd.' }, gemini: { answer_text: 'Try Volt Ltd.' } } }], jctx);
  ok(absent.named === 0 && absent.valid === 2, 'K: an answer without the name is not named');
  // Duplicate rows for one question are counted once.
  const dup = [...rows([[true, true], [true, false], [false, false]]), rows([[true, true]])[0]];
  const ds = scoreHookRun(state, dup, CTX);
  ok(ds.expected === 6 && ds.named === 3, 'K: a duplicate row for the same question never adds results (still out of six)');
}

/* ── Engine-specific words ───────────────────────────────────────────────────────────────────── */
ok(hookMissSentence('Google AI') === "Google AI didn't name you for this search.", 'the miss sentence names the engine');
ok(HOOK_ALL_NAMED_REASON === 'Hook audit: named in 6/6 ChatGPT + Google AI results', 'the internal 6/6 reason is exactly Paul\'s wording');

/* ── Report summary (version 2) ──────────────────────────────────────────────────────────────── */
{
  const label = (e: string) => e === 'chatgpt' ? 'ChatGPT' : e === 'gemini' ? 'Gemini' : e;
  const base = { engineOrder: ['chatgpt', 'gemini'], engineLabel: label, namedInstead: (c: string[]) => c, namedCtx: CTX.named, town: TOWN, trade: TRADE };
  const rivals = (qi: number, e: string) => [`${e}-q${qi}-A`, `${e}-q${qi}-B`];
  const r = rows([[true, true], [true, false], [true, true]], rivals);
  const sum = buildHookReportSummary({ ...base, state, rows: r });
  ok(sum?.shape === 'six' && sum.tested.length === 3 && sum.tested.every((t) => t.perEngine.length === 2), 'report: all three questions × both engines are carried');
  ok(sum?.gap?.question === Q[1] && sum.gap.engine === 'gemini' && JSON.stringify(sum.gap.namedInstead) === JSON.stringify(['gemini-q1-A', 'gemini-q1-B']), 'report: the gap is the hook pick, with that cell\'s own rivals');
  ok(JSON.stringify(sum?.gap?.namedOnEngineLabels) === JSON.stringify(['ChatGPT']), 'report: the truthful qualifier (ChatGPT named them on the same search)');
  const copy = hookReportCopy(sum!, BIZ);
  ok(copy.headline === "Gemini didn't name you for this search." && !/\bAI isn't\b/.test(copy.headline), 'report: the headline is engine-specific, never "AI isn\'t recommending you"');
  ok(buildHookReportSummary({ ...base, state, rows: rows([[true, true], [null, false], [true, true]]) }) === null, 'report: an incomplete six-result hook gets no hook summary (ordinary rendering)');
  const all = buildHookReportSummary({ ...base, state, rows: rows([[true, true], [true, true], [true, true]]) });
  ok(all?.gap === null && all.stopReason === 'max_questions_reached' && /all 6 results/.test(hookReportCopy(all, BIZ).lede), 'report: 6/6 says so, with its own count');
}

/* ── Deep crawl gate (version 2) ─────────────────────────────────────────────────────────────── */
{
  const asRun = (grid: Array<[boolean | null, boolean | null]>) => ({ hook: state, questions: rows(grid).map((x) => ({ question: x.question, status: x.status, engines: x.result })) });
  ok(rowsFromRunResults(asRun([[true, false]])).length === 1, 'results.questions adapts to rows');
  ok(shouldDeepCrawl(asRun([[true, false], [true, true], [true, true]]), CTX) === true, 'crawl: a complete hook with a miss → deep');
  ok(shouldDeepCrawl(asRun([[true, true], [true, true], [true, true]]), CTX) === false, 'crawl: 6/6 → shallow (nobody will be messaged)');
  ok(shouldDeepCrawl(asRun([[true, false], [null, true], [true, true]]), CTX) === false, 'crawl: incomplete → shallow (no final score, no hook)');
}

/* ── Send guard ──────────────────────────────────────────────────────────────────────────────── */
ok(sixResultHookForbidsAbsenceCopy(state, rows([[true, true], [true, true], [true, true]]), CTX) === true, 'send guard: 6/6 forbids "not named" copy');
ok(sixResultHookForbidsAbsenceCopy(state, rows([[true, true], [true, false], [true, true]]), CTX) === false, 'send guard: 5/6 leaves the normal checks to decide');
ok(sixResultHookForbidsAbsenceCopy(state, rows([[true, true], [null, true], [true, true]]), CTX) === false, 'send guard: incomplete forbids nothing on its own');
ok(hookForbidsAbsenceCopy(state) === false, 'send guard: the v1 check never misreads a v2 state');

/* ── Inbox card: which audit ────────────────────────────────────────────────────────────────── */
{
  const mk = (id: string, created: string, purpose: string | null, runStatus = 'complete') =>
    ({ id, created_at: created, business_name: BIZ, business_type: TRADE, location_text: TOWN, audit_purpose: purpose, ai_audit_runs: [{ id: `run-${id}`, status: runStatus, run_number: 1, results: {} }] });
  const picked = pickHookAudit([mk('old', '2026-09-01', 'audit'), mk('base', '2026-09-20', 'baseline'), mk('new', '2026-09-24', 'audit', 'running')]);
  ok(picked?.audit.id === 'new' && picked.runStatus === 'running', 'card: the newest outreach audit wins, even while running (progress)');
  ok(pickHookAudit([mk('b', '2026-09-20', 'baseline'), mk('m', '2026-09-21', 'measurement')]) === null, 'card: a paid baseline or measurement is never shown as the hook score');
  const card = scoreHookAuditForCard({ audit: { business_name: BIZ, business_type: TRADE, location_text: TOWN }, state, runResults: {}, rows: rows([[true, true], [true, false], [true, true]], () => [BIZ, 'Sparks Ltd']) });
  ok(card.score.hook?.competitors.includes('Sparks Ltd') && !card.score.hook.competitors.some((n) => n === BIZ), 'card: the business is never listed as its own rival');
}

/* ── 6/6 Not Interested: the write ───────────────────────────────────────────────────────────── */
type Call = { table: string; op: string; args: unknown[] };
function fakeService(data: { audit: Record<string, unknown> | null; runResults: unknown; rows: HookScoreRow[]; leadMatches: boolean }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let op = 'select';
    let payload: unknown = null;
    const q: Record<string, unknown> = {};
    const chain = {
      select: (...a: unknown[]) => { calls.push({ table, op: op === 'update' ? 'update.select' : 'select', args: a }); return chain; },
      update: (p: unknown) => { op = 'update'; payload = p; calls.push({ table, op: 'update', args: [p] }); return chain; },
      delete: () => { calls.push({ table, op: 'delete', args: [] }); return chain; },
      eq: (..._a: unknown[]) => chain, not: (..._a: unknown[]) => chain, or: (..._a: unknown[]) => chain, order: (..._a: unknown[]) => chain,
      maybeSingle: async () => ({ data: table === 'ai_audits' ? data.audit : table === 'ai_audit_runs' ? { results: data.runResults } : null, error: null }),
      then: (res: (v: unknown) => unknown) => {
        if (table === 'ai_audit_queue') return Promise.resolve({ data: data.rows, error: null }).then(res);
        if (table === 'outreach_leads' && op === 'update') return Promise.resolve({ data: data.leadMatches ? [{ id: 'lead-1' }] : [], error: null }).then(res);
        return Promise.resolve({ data: null, error: null, payload, q }).then(res);
      },
    };
    return chain;
  };
  return { svc: { from }, calls };
}
await (async () => {
  const audit = { lead_id: 'lead-1', business_name: BIZ, business_type: TRADE, location_text: TOWN };
  {
    const { svc, calls } = fakeService({ audit, runResults: { hook: state }, rows: rows([[true, true], [true, true], [true, true]]), leadMatches: true });
    const out = await autoMarkSixOfSixNotInterested(svc, 'audit-1', 'run-1');
    ok(out.applied === true, 'F: 6/6 → Not Interested applied');
    const leadWrite = calls.find((c) => c.table === 'outreach_leads' && c.op === 'update');
    ok(JSON.stringify(leadWrite?.args[0]) === JSON.stringify({ status: 'not_interested', is_potential_work: false }), 'F: the exact patch the manual Not interested button writes');
    ok(!calls.some((c) => c.op === 'delete'), 'F: nothing is deleted (lead, audit and history preserved)');
    const stamp = calls.find((c) => c.table === 'ai_audit_runs' && c.op === 'update');
    const hook = (stamp?.args[0] as { results?: { hook?: { auto_not_interested?: { reason?: string } } } })?.results?.hook;
    ok(hook?.auto_not_interested?.reason === HOOK_ALL_NAMED_REASON && (hook as { planned?: unknown }).planned !== undefined, 'F: the internal reason is recorded on results.hook, and the plan is kept');
  }
  for (const grid of [[[true, true], [true, false], [true, true]], [[false, false], [false, false], [false, false]]] as Array<Array<[boolean, boolean]>>) {
    const { svc, calls } = fakeService({ audit, runResults: { hook: state }, rows: rows(grid), leadMatches: true });
    const out = await autoMarkSixOfSixNotInterested(svc, 'audit-1', 'run-1');
    ok(!out.applied && out.reason === 'not_six_of_six' && !calls.some((c) => c.table === 'outreach_leads'), `any miss keeps the lead as an opportunity (${grid.flat().filter(Boolean).length}/6)`);
  }
  {
    const { svc, calls } = fakeService({ audit, runResults: { hook: state }, rows: rows([[true, true], [true, true], [null, true]]), leadMatches: true });
    const out = await autoMarkSixOfSixNotInterested(svc, 'audit-1', 'run-1');
    ok(!out.applied && !calls.some((c) => c.table === 'outreach_leads'), 'incomplete (one failure) never moves the lead');
  }
  {
    const { svc } = fakeService({ audit, runResults: { hook: { ...initialHookState(Q), executed: 3, stop_reason: 'max_questions_reached' } }, rows: rows([[true, true], [true, true], [true, true]]), leadMatches: true });
    const out = await autoMarkSixOfSixNotInterested(svc, 'audit-1', 'run-1');
    ok(!out.applied && out.reason === 'not_a_six_result_hook', 'a v1 run is left to the v1 rule');
  }
  {
    const { svc } = fakeService({ audit, runResults: { hook: state }, rows: rows([[true, true], [true, true], [true, true]]), leadMatches: false });
    const out = await autoMarkSixOfSixNotInterested(svc, 'audit-1', 'run-1');
    ok(!out.applied && out.reason === 'lead_already_progressed_or_missing', 'an already-progressed / starred lead is left alone (conditional write)');
  }
})();

/* ── Wiring (source) ─────────────────────────────────────────────────────────────────────────── */
const root = resolve(import.meta.dirname, '..');
const createAudit = readFileSync(resolve(root, 'supabase/functions/create-ai-audit/index.ts'), 'utf8');
const queue = readFileSync(resolve(root, 'supabase/functions/process-ai-audit-queue/index.ts'), 'utf8');
ok(createAudit.includes('hookState = initialHookStateV2(questions, AUDIT_ENGINES);'), 'create-ai-audit writes a version-2 hook marker');
ok(/const queueRows = questions\.map\(\(q\) => \(\{[\s\S]{0,200}engines: AUDIT_ENGINES,/.test(createAudit), 'every hook question is queued at once, each row asking both engines (same questions, like-for-like)');
const released = queue.indexOf('if (!error) readyRuns.add(p.runId);');
const sixCall = queue.indexOf('autoMarkSixOfSixNotInterested(service, p.auditId, p.runId)');
ok(released > 0 && sixCall > released && sixCall - released < 2000, 'the 6/6 rule runs after the run is released (competitor extraction done), beside readyRuns');
ok(sixCall < queue.indexOf('completionSendJobs.splice'), 'the 6/6 rule runs before the completion auto-send is considered');

if (failures) throw new Error(`${failures} six-result hook checks failed`);
console.log('hook-score: all checks passed');
