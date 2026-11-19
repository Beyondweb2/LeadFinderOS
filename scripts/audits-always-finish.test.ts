/* AUDITS ALWAYS FINISH (v1-audits-always-finish, 2026-11-18) — _shared/enrichment/ai-search-lanes.ts + the queue wiring.
   A. a lane run asks ONE engine and switches every other engine OFF explicitly; the normal run is unchanged.
   B. after a failed normal run, an engine its partial dataset already answered needs no lane; the rest are pending.
   C. a failed lane gets one more try, then stays failed; settled / live / missing are read correctly.
   D. the lanes merge into ONE dataset item the normal path reads unchanged; each engine's block only from its own lane;
      a question with one engine missing finishes with the other answers (the missing one absent, "Couldn't measure").
   E. the deadline ends only STARTED questions, and only past ROW_DEADLINE_MS.
   F. failure notes keep Apify's words, trimmed, newest MAX_FAILURE_NOTES.
   G. the queue: a failed normal run splits into lanes (never re-queued the same way), lane rows are polled and never
      reclaimed as stranded, lane starts are claimed by updated_at, Apify's own timeout is sent on every start,
      a pending started row past the deadline is ended, and lanes count against the in-flight ceiling.
   H. a deadline is a provider failure for the alert cause and the Quick check retry. */
/* eslint-disable @typescript-eslint/no-explicit-any -- the test reads loose actor JSON */
import { readFileSync } from 'node:fs';
import { buildAiSearchInput, laneAnswered, normalizeAiSearch } from '../supabase/functions/_shared/enrichment/ai-search.ts';
import {
  APIFY_RUN_TIMEOUT_SECS, LANE_MAX_TRIES, MAX_FAILURE_NOTES, ROW_DEADLINE_MS, addFailure, afterLaneFailure, failureNote, firstItem,
  initialLanes, lanesSettled, liveLaneCount, mergeLaneItems, missingLanes, pastDeadline, readLanes, type Lanes,
} from '../supabase/functions/_shared/enrichment/ai-search-lanes.ts';
import { PROVIDER_FAILURE_ERRORS } from '../src/lib/quickCheckRetry.ts';
import { incompleteCause } from '../src/lib/auditAlerts.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

// A
const g = buildAiSearchInput('best roofer in Leeds', 'GB', { lane: 'gemini', aiMode: true }) as Record<string, any>;
ok(g.geminiSearch.enableGemini === true && g.chatGptSearch.enableChatGpt === false, 'A: gemini lane asks Gemini only');
ok(g.aiModeSearch.enableAiMode === false && g.aiOverview.scrapeFullAiOverview === false, 'A: gemini lane switches Google AI off explicitly');
ok(g.countryCode === 'gb' && g.queries === 'best roofer in Leeds', 'A: lane keeps the question and market');
const a = buildAiSearchInput('q', 'gb', { lane: 'ai_overview', aiMode: true }) as Record<string, any>;
ok(a.aiModeSearch?.enableAiMode === true && a.chatGptSearch.enableChatGpt === false && a.geminiSearch.enableGemini === false, 'A: Google AI lane (AI Mode) asks Google AI only');
const ao = buildAiSearchInput('q', 'gb', { lane: 'ai_overview' }) as Record<string, any>;
ok(ao.aiOverview?.scrapeFullAiOverview === true && ao.aiModeSearch === undefined, 'A: Google AI lane on an older method keeps the Overview ask');
const normal = buildAiSearchInput('q', 'gb', { aiMode: true }) as Record<string, any>;
ok(normal.chatGptSearch.enableChatGpt && normal.geminiSearch.enableGemini && normal.aiModeSearch.enableAiMode, 'A: the normal run still asks every engine at once');

// B
const organic = [{ position: 1, url: 'https://a.co.uk/', title: 'A Roofing' }];
const partial = { organicResults: organic, chatGptSearchResult: { text: 'Try A Roofing.' }, geminiSearchResult: { text: '  ' } };
const lanes0 = initialLanes(partial);
ok(lanes0.chatgpt?.state === 'done' && lanes0.gemini?.state === 'pending' && lanes0.ai_overview?.state === 'pending', 'B: answered engine kept, empty / missing engines get a lane');
const none = initialLanes(null);
ok(['chatgpt', 'gemini', 'ai_overview'].every((k) => (none as any)[k].state === 'pending' && (none as any)[k].tries === 0), 'B: nothing back = three pending lanes');
ok(laneAnswered(partial, 'chatgpt') && !laneAnswered(partial, 'gemini') && !laneAnswered(partial, 'ai_overview'), 'B: laneAnswered needs text');
ok(firstItem([partial]) === partial && firstItem([]) === null && firstItem(null) === null, 'B: firstItem');

// C
const once = afterLaneFailure({ state: 'running', tries: 1, runId: 'r1' }, 'run_age_exceeded');
ok(once.state === 'pending' && once.runId === null && once.error === 'run_age_exceeded', 'C: first lane failure → one more try');
const twice = afterLaneFailure({ state: 'running', tries: LANE_MAX_TRIES, runId: 'r2' }, 'run_age_exceeded');
ok(twice.state === 'failed', 'C: lane failure after its last try → failed');
ok(afterLaneFailure({ state: 'running', tries: 1, runId: 'r3' }, 'run_age_exceeded', 'ai_overview').state === 'failed'
  && afterLaneFailure({ state: 'running', tries: 1, runId: 'r4' }, 'run_age_exceeded', 'gemini').state === 'pending', 'C: Google AI (display only) gets one try; scored engines get two');
ok(!/afterLaneFailure\(l, [^)]*\)(?<!, lane\))/.test(readFileSync('supabase/functions/process-ai-audit-queue/index.ts', 'utf8').replace(/afterLaneFailure\(l, [^)]*, lane\)/g, '')), 'C: the queue passes the lane on every lane failure');
const mixed: Lanes = { chatgpt: { state: 'done', tries: 0, item: partial }, gemini: { state: 'running', tries: 1, runId: 'x' }, ai_overview: { state: 'failed', tries: 2 } };
ok(!lanesSettled(mixed) && liveLaneCount(mixed) === 1, 'C: a running lane keeps the question open');
ok(lanesSettled({ ...mixed, gemini: { state: 'failed', tries: 2 } }), 'C: all done/failed = settled');
ok(readLanes({ _lanes: mixed })?.gemini?.runId === 'x' && readLanes({ _apify: { runId: 'y' } }) === null && readLanes(null) === null, 'C: readLanes');

// D
const gemItem = { organicResults: [{ position: 1, url: 'https://b.co.uk/', title: 'B Roofing' }], geminiSearchResult: { text: 'A Roofing and B Roofing.' }, chatGptSearchResult: { text: 'SHOULD NOT WIN' } };
const settled: Lanes = { chatgpt: { state: 'done', tries: 0, item: partial }, gemini: { state: 'done', tries: 1, item: gemItem }, ai_overview: { state: 'failed', tries: 2, error: 'run_age_exceeded' } };
const merged = mergeLaneItems(settled)!;
ok((merged.chatGptSearchResult as any).text === 'Try A Roofing.', 'D: ChatGPT block from the ChatGPT lane only');
ok((merged.geminiSearchResult as any).text === 'A Roofing and B Roofing.', 'D: Gemini block from the Gemini lane');
ok(merged.organicResults === organic, 'D: shared keys from the first lane that has them');
ok(missingLanes(settled).join(',') === 'ai_overview', 'D: missing engine named');
const norm = normalizeAiSearch([merged], 'A Roofing') as Record<string, any>;
ok(norm.chatgpt?.named === true && norm.gemini?.named === true && !('ai_overview' in norm), 'D: the merged item reads like a normal run; the missing engine is absent');
ok(mergeLaneItems({ chatgpt: { state: 'failed', tries: 2 }, gemini: { state: 'failed', tries: 2 } }) === null, 'D: nothing back → null (the row fails)');

// E
const now = Date.parse('2026-11-18T12:00:00Z');
ok(!pastDeadline({ startedAt: '2026-11-18T09:00:00Z', attempts: 0, nowMs: now }), 'E: never-started backlog row is not ended');
ok(pastDeadline({ startedAt: new Date(now - ROW_DEADLINE_MS - 1000).toISOString(), attempts: 1, nowMs: now }), 'E: started row past the deadline is ended');
ok(!pastDeadline({ startedAt: new Date(now - ROW_DEADLINE_MS + 60_000).toISOString(), attempts: 3, nowMs: now }), 'E: started row inside the deadline keeps going');
ok(!pastDeadline({ startedAt: null, attempts: 2, nowMs: now }), 'E: unknown age never ends a row');
// The 18 Nov 13:12 regression: a question queued hours ago and re-opened by the 30-minute retry must not be ended at once.
const qq0 = readFileSync('supabase/functions/process-ai-audit-queue/index.ts', 'utf8');
ok(!/pastDeadline\(\{ startedAt: (r|row)\.created_at/.test(qq0) && qq0.includes('.lt("updated_at", new Date(Date.now() - 60 * 60 * 1000)'), 'E: the deadline never counts from when the question was first queued');
ok(qq0.includes('[CYCLE_META_KEY]: startedAtTick ?? new Date().toISOString()') && qq0.includes('[CYCLE_META_KEY]: cycleStartedAt'), 'E: lanes carry the start of the current try, and keep it');
ok(APIFY_RUN_TIMEOUT_SECS * 1000 > 12 * 60 * 1000, 'E: Apify\'s own timeout sits above our 12-minute guard');

// F
const note = failureNote({ atIso: '2026-11-18T12:00:00Z', kind: 'normal_run', reason: 'run_age_exceeded', statusMessage: 'x'.repeat(500), logTail: 'y'.repeat(2000) });
ok(note.status_message!.length === 300 && note.log_tail!.length === 600, 'F: notes trimmed');
let list: unknown = undefined;
for (let i = 0; i < MAX_FAILURE_NOTES + 3; i++) list = addFailure(list, { at: String(i), kind: 'k', reason: 'r' });
ok((list as any[]).length === MAX_FAILURE_NOTES && (list as any[])[0].at === '3', 'F: newest notes kept');

// G
const q = readFileSync('supabase/functions/process-ai-audit-queue/index.ts', 'utf8');
const failBlock = q.slice(q.indexOf('const failAttempt = async'), q.indexOf('const { status, usageTotalUsd, computeUnits, statusMessage }'));
ok(failBlock.includes('initialLanes(partial)') && !/status:\s*giveUp/.test(failBlock), 'G: a failed normal run splits into lanes, never re-queued the same way');
ok(failBlock.includes('fetchAiSearchItems(runId') && failBlock.includes('getApifyRunLogTail'), 'G: the failed run\'s partial answers and Apify\'s log are kept');
ok(/filter\(\(r\) => r\.result\?\._apify\?\.runId \|\| readLanes\(r\.result\)\)/.test(q), 'G: lane rows are polled');
ok(/!r\.result\?\._apify\?\.runId && !readLanes\(r\.result\)/.test(q), 'G: lane rows are never reclaimed as stranded');
ok(/\.eq\("updated_at", row\.updated_at\)/.test(q), 'G: lane starts are claimed by updated_at (one tick only)');
/* v1-audits-self-healing: the normal start and the lane start go through startApifyRunExplained, whose 4th argument is
   Apify's own timeout; the Google AI retry still passes runTimeoutSecs. */
ok((q.match(/runTimeoutSecs: APIFY_RUN_TIMEOUT_SECS/g) ?? []).length === 1 && (q.match(/apifyToken, APIFY_RUN_TIMEOUT_SECS\)/g) ?? []).length === 2,
  'G: Apify\'s own timeout on the normal start, the Google AI retry and the lane start');
ok(q.includes('error: "deadline_exceeded"') && q.includes('.eq("status", "pending").gt("attempts", 0)'), 'G: a started pending row past the deadline is ended');
ok(q.includes('- laneExtra)'), 'G: lanes count against the in-flight ceiling');
ok(q.includes('MAX_RUN_AGE_MS = 12 * 60 * 1000'), 'G: the 12-minute age guard is unchanged (never lowered)');

// H
ok(PROVIDER_FAILURE_ERRORS.has('deadline_exceeded'), 'H: a deadline gets the Quick check retry like a timeout');
ok(incompleteCause([{ status: 'failed', result: { error: 'deadline_exceeded' } }], []) === 'search_timeout', 'H: a deadline alerts as "did not finish in time"');

// I — a rep's per-lead limit ignores failed audits; refusals reach the screen in words
const { countsTowardLeadLimit, hooksCountingToday } = await import('../src/lib/hookLeadLimit.ts');
ok(!countsTowardLeadLimit({ ai_audit_runs: [{ status: 'failed' }] }) && !countsTowardLeadLimit({ ai_audit_runs: [{ status: 'cancelled' }, { status: 'failed' }] }), 'I: a failed audit does not use the rep\'s allowance');
ok(countsTowardLeadLimit({ ai_audit_runs: [{ status: 'running' }] }) && countsTowardLeadLimit({ ai_audit_runs: [] }) && countsTowardLeadLimit({}), 'I: a running audit, or one with no run yet, counts');
ok(countsTowardLeadLimit({ ai_audit_runs: [{ status: 'failed' }, { status: 'complete' }] }), 'I: an audit with any good run counts');
ok(hooksCountingToday([...Array(6)].map(() => ({ ai_audit_runs: [{ status: 'failed' }] }))) === 0, 'I: six failed automatic audits (HSM, 18 Nov) leave the rep\'s allowance untouched');
const cai = readFileSync('supabase/functions/create-ai-audit/index.ts', 'utf8');
/* Since 19 Nov (v1-rep-limits-own-actions) the per-lead limit counts the rep's OWN guard rows, failed ones refunded:
   scripts/rep-limits-own-actions.test.ts. */
ok(cai.includes('if ((mine ?? 0) >= SALES_HOOKS_PER_LEAD_PER_DAY)') && cai.includes('"../../../src/lib/usageRefund.ts"'), 'I: create-ai-audit counts with the rule');
for (const p of ['src/pages/Inbox.tsx', 'src/pages/AiAudit.tsx']) {
  const s = readFileSync(p, 'utf8');
  ok(!s.includes("supabase.functions.invoke('create-ai-audit'") && s.includes('invokeCreateAudit({'), `I: ${p} starts audits through invokeEdge (the server's reason, never "non-2xx")`);
}
ok(/invokeEdge<CreateAuditData>\('create-ai-audit'/.test(readFileSync('src/lib/createAuditCall.ts', 'utf8')) && /edgeErrorMessage\(e/.test(readFileSync('src/lib/createAuditCall.ts', 'utf8')), 'I: the helper turns a refusal into its sentence');

// J — Google AI apart + the hedge (v1-ai-mode-separate)
{
  const L = await import('../supabase/functions/_shared/enrichment/ai-search-lanes.ts');
  const s = L.buildScoredInput('q', 'GB') as Record<string, any>;
  ok(s.countryCode === 'gb' && s.queries === 'q', 'J: the normal run keeps the question and market');
  ok(s.chatGptSearch.enableChatGpt === true && s.geminiSearch.enableGemini === true, 'J: the normal run asks ChatGPT and Gemini together');
  ok(s.aiModeSearch.enableAiMode === false && s.aiOverview.scrapeFullAiOverview === false, 'J: …and switches Google AI off explicitly');

  const both = { organicResults: organic, chatGptSearchResult: { text: 'A Roofing.' }, geminiSearchResult: { text: 'B Roofing.' } };
  const onlyGpt = { organicResults: organic, chatGptSearchResult: { text: 'A Roofing.' } };
  // Started: Google AI running beside the normal run, no scored lanes yet → not settled (the normal run is the answer).
  const start: Lanes = { ai_overview: { state: 'running', tries: 1, runId: 'g1' } };
  ok(!L.scoredSettled(start), 'J: a just-started question is not settled (waits for the normal run)');
  // Normal run back with both: settled at once, Google AI still running does NOT hold it.
  const r1 = L.foldNormalItem(structuredClone(start), both);
  ok(L.scoredSettled(r1.lanes) && r1.lanes.ai_overview?.state === 'running' && r1.abort.length === 0, 'J: ChatGPT + Gemini back → settled while Google AI is still running');
  // Normal run back with ChatGPT only: Gemini gets a lane, not settled.
  const r2 = L.foldNormalItem(structuredClone(start), onlyGpt);
  ok(r2.lanes.chatgpt?.state === 'done' && r2.lanes.gemini?.state === 'pending' && !L.scoredSettled(r2.lanes), 'J: an engine the normal run missed gets its own lane');
  // Hedge: lanes added beside a slow normal run; the normal run then answers → the running hedge lane is aborted.
  const h = L.addHedgeLanes(structuredClone(start));
  ok(h.chatgpt?.state === 'pending' && h.gemini?.state === 'pending' && h.ai_overview?.state === 'running', 'J: the hedge adds ChatGPT and Gemini lanes, Google AI untouched');
  h.chatgpt = { state: 'running', tries: 1, runId: 'c1' };
  h.gemini = { state: 'done', tries: 1, item: { geminiSearchResult: { text: 'From the hedge.' } } };
  const r3 = L.foldNormalItem(h, both);
  ok(r3.abort.join() === 'c1' && r3.lanes.chatgpt?.state === 'done', 'J: the normal run answering first stops the hedge lane (no double billing)');
  ok((r3.lanes.gemini?.item as any)?.geminiSearchResult?.text === 'From the hedge.', 'J: a hedge lane that answered first keeps its answer');
  ok(L.addHedgeLanes(structuredClone(r3.lanes)).chatgpt?.state === 'done', 'J: the hedge never re-opens an answered engine');
  // Both scored lanes failed → settled (incomplete), never waits on Google AI.
  ok(L.scoredSettled({ chatgpt: { state: 'failed', tries: 2 }, gemini: { state: 'failed', tries: 2 }, ai_overview: { state: 'running', tries: 1 } }), 'J: both scored engines failed → settled, Google AI does not hold it');
  ok(L.laneMaxTries('ai_overview') === 1 && L.laneMaxTries('chatgpt') === 2, 'J: Google AI one try, scored engines two');
  ok(L.HEDGE_AFTER_MS === 4 * 60_000 && L.laneAgeLimitMs('chatgpt', 12 * 60_000) === 5 * 60_000 && L.laneAgeLimitMs('ai_overview', 12 * 60_000) === 12 * 60_000, 'J: hedge after 4 min; a scored lane is retried after 5 min; Google AI keeps the normal limit');
  ok(L.foldNormalItem({}, null).lanes.chatgpt?.state === 'pending', 'J: a lost or failed normal run with nothing back gives every scored engine a lane');

  // The queue wiring.
  ok(q.includes('startApifyRunExplained(AI_SEARCH_ACTOR, buildScoredInput(String(row.question), audit.countryCode)') && q.includes('startLaneRun(row, "ai_overview", 0)'), 'J: each question starts ChatGPT + Gemini and, beside it, Google AI');
  ok(q.includes('if (!scoredSettled(lanes, !!normal))') && !q.includes('if (!lanesSettled(lanes))'), 'J: a question finishes on ChatGPT + Gemini, never waiting for Google AI');
  ok(q.includes('error: "cut_at_finish"') && q.includes('delete result[AI_OVERVIEW_META_KEY]'), 'J: Google AI not back is cut and never read as "Google showed none"');
  ok(q.includes('ageMs > HEDGE_AFTER_MS') && q.includes('addHedgeLanes(lanes)'), 'J: a slow normal run is hedged, not killed');
  ok(q.includes('if (headroomLeft < 2 || !slots.take(2))') && q.includes('headroomLeft -= 2'), 'J: a question takes two Apify slots against the ceiling');
  ok(q.includes('result._timing = timing'), 'J: each finished question records how long it took');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
