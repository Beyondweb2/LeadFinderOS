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
ok((q.match(/runTimeoutSecs: APIFY_RUN_TIMEOUT_SECS/g) ?? []).length === 3, 'G: Apify\'s own timeout on the normal start, the Google AI retry and the lane start');
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
ok(cai.includes('hooksCountingToday((todays ?? []) as LimitAudit[]) >= SALES_HOOKS_PER_LEAD_PER_DAY') && cai.includes('"../../../src/lib/hookLeadLimit.ts"'), 'I: create-ai-audit counts with the rule');
for (const p of ['src/pages/Inbox.tsx', 'src/pages/AiAudit.tsx']) {
  const s = readFileSync(p, 'utf8');
  ok(!s.includes("supabase.functions.invoke('create-ai-audit'") && s.includes('invokeCreateAudit({'), `I: ${p} starts audits through invokeEdge (the server's reason, never "non-2xx")`);
}
ok(/invokeEdge<CreateAuditData>\('create-ai-audit'/.test(readFileSync('src/lib/createAuditCall.ts', 'utf8')) && /edgeErrorMessage\(e/.test(readFileSync('src/lib/createAuditCall.ts', 'utf8')), 'I: the helper turns a refusal into its sentence');

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
