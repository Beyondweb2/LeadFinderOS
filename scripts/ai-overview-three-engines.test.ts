/* ════════════════════════════════════════════════════════════════════════════════════════════════
   GOOGLE AI OVERVIEW ON EVERY NEW AUDIT — DISPLAY ONLY (2026-10-11, Paul).

   New audits record ChatGPT, Gemini and Google AI Overview. The overview is read off the same Google
   results page the scrape already loads (no actor input change, no extra cost), stamped shown / not
   shown per question, and SHOWN — never counted. This suite pins:
     A. the stamp: shown / not shown / unknown, from the actor's own item;
     B. the actor input is unchanged (cost);
     C. the score, the hook pick and the 6/6 are untouched by an overview;
     D. "No overview shown" is a result, an old audit draws nothing new;
     E. the quick public report and the full report show it, labelled not scored.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { aiOverviewStamp, normalizeAiSearch, buildAiSearchInput, AI_OVERVIEW_META_KEY } from '../supabase/functions/_shared/enrichment/ai-search.ts';
import { AI_OVERVIEW_STAMP_KEY, NO_OVERVIEW_TEXT, overviewFor, overviewSummary } from '../src/lib/aiOverview.ts';
import { HOOK_ENGINES, HOOK_SCORE_RESULTS, initialHookStateV2, scoreHookRun } from '../src/lib/hookScore.ts';
import { SCORED_ENGINES, buildReportData } from '../src/lib/auditReport.ts';
import { renderReportHtml } from '../src/lib/aiAuditReportHtml.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ');

/* ── A. The stamp ─────────────────────────────────────────────────────────────────────────── */
const organic = [{ position: 1, url: 'https://a.co.uk/', title: 'A' }];
const withAio = [{ organicResults: organic, chatGptSearchResult: { text: 'Try Rivals Ltd.' }, geminiSearchResult: { text: 'Try Rivals Ltd.' }, aiOverview: { text: 'Acme Roofing Services and Rivals Ltd are well reviewed.', sources: [] } }];
const noAio = [{ organicResults: organic, chatGptSearchResult: { text: 'x' }, geminiSearchResult: { text: 'y' } }];
const noPage = [{ chatGptSearchResult: { text: 'x' } }];
ok(AI_OVERVIEW_META_KEY === AI_OVERVIEW_STAMP_KEY && AI_OVERVIEW_STAMP_KEY.startsWith('_'), 'A: the edge stamp key and the reader key are the same leading-underscore meta key');
ok(aiOverviewStamp(withAio, normalizeAiSearch(withAio, 'Acme Roofing Services')) === 'shown', 'A: an overview on the page → shown');
ok(aiOverviewStamp(noAio, normalizeAiSearch(noAio, 'Acme Roofing Services')) === 'not_shown', 'A: a results page with no overview → not_shown');
ok(aiOverviewStamp(noPage, normalizeAiSearch(noPage, 'Acme Roofing Services')) === null, 'A: no results page at all → nothing stamped (never a guess)');
ok(aiOverviewStamp([], {}) === null, 'A: an empty dataset → nothing stamped');

/* ── B. Cost: the actor input is unchanged ────────────────────────────────────────────────── */
const input = buildAiSearchInput('roofer in Leeds', 'gb');
ok(!('aiOverview' in input), 'B: the full-overview scrape toggle stays OFF (no latency, no extra cost)');
ok(JSON.stringify(Object.keys(input).sort()) === JSON.stringify(['chatGptSearch', 'countryCode', 'geminiSearch', 'languageCode', 'maxPagesPerQuery', 'queries']), 'B: the actor input keys are exactly what they were');

/* ── C. The score is untouched ────────────────────────────────────────────────────────────── */
const BIZ = 'Acme Roofing Services';
const Q = ['roof repair in Leeds', 'best roofer in Leeds', 'emergency roofer near Leeds'];
const ans = (named: boolean) => ({ named, self_named: named, answer_text: named ? `Try ${BIZ} for roofing.` : 'Good options include Ridge Roofing Ltd, Slate Masters and Top Roofs.', competitors: named ? [] : ['Ridge Roofing Ltd', 'Slate Masters', 'Top Roofs'], citations: [] });
const rowsWith = (aio: Array<'named' | 'missed' | 'none' | 'old'>) => Q.map((question, i) => {
  const result: Record<string, unknown> = { chatgpt: ans(i === 0), gemini: ans(false) };
  if (aio[i] === 'named' || aio[i] === 'missed') { result.ai_overview = ans(aio[i] === 'named'); result[AI_OVERVIEW_STAMP_KEY] = 'shown'; }
  if (aio[i] === 'none') result[AI_OVERVIEW_STAMP_KEY] = 'not_shown';
  return { question, status: 'done', result };
});
const ctx = { named: { businessName: BIZ, trade: 'roofer', town: 'Leeds' }, town: 'Leeds', trade: 'roofer' };
const state = initialHookStateV2(Q);
const base = scoreHookRun(state, rowsWith(['old', 'old', 'old']), ctx);
const withO = scoreHookRun(state, rowsWith(['named', 'named', 'named']), ctx);
ok(HOOK_ENGINES.length === 2 && !(HOOK_ENGINES as readonly string[]).includes('ai_overview') && HOOK_SCORE_RESULTS === 6, 'C: the hook is still 3 × 2 = 6 (the overview is never a hook engine)');
ok(!(SCORED_ENGINES as readonly string[]).includes('ai_overview'), 'C: the overview is not a scored engine');
ok(withO.expected === base.expected && withO.named === base.named && withO.percent === base.percent && withO.complete === base.complete, 'C: an overview that NAMED the business changes no count or percentage');
ok(withO.hook?.engine === base.hook?.engine && withO.hook?.question === base.hook?.question, 'C: the hook pick (and so the call script) is unchanged');
ok(withO.perEngine.every((t) => t.engine !== 'ai_overview'), 'C: no overview tally in the per-engine score');

/* ── D. Shown / not shown / old ───────────────────────────────────────────────────────────── */
const mixed = scoreHookRun(state, rowsWith(['named', 'missed', 'none']), ctx);
ok(mixed.overviews.length === 3, 'D: a new audit has one overview per question');
ok(mixed.overviews[0].state === 'shown' && mixed.overviews[0].named === true, 'D: Q1 shown and named');
ok(mixed.overviews[1].state === 'shown' && mixed.overviews[1].named === false && mixed.overviews[1].competitors.length === 3, 'D: Q2 shown, not named, its own competitors');
ok(mixed.overviews[2].state === 'not_shown', 'D: Q3 "no overview shown" is a result, not a failure');
ok(mixed.complete && mixed.failed === 0, 'D: a question with no overview does not make the audit incomplete');
ok(base.overviews.length === 0, 'D: an OLD audit (no stamp) gets no overview at all — drawn exactly as before');
ok(overviewSummary(mixed.overviews)?.line === 'Shown on 2 of 3 searches, named in 1 · 1 showed none', `D: the summary line (${overviewSummary(mixed.overviews)?.line})`);
ok(overviewSummary(scoreHookRun(state, rowsWith(['none', 'none', 'none']), ctx).overviews)?.line === `${NO_OVERVIEW_TEXT} for any of the 3 searches`, 'D: none shown anywhere says so plainly');
ok(overviewSummary(base.overviews) === null, 'D: no summary for an old audit');
ok(overviewFor({ status: 'pending', cells: null }, { stamped: true }).state === 'pending', 'D: a new audit’s pending question is pending, not "no overview"');
ok(overviewFor({ status: 'failed', cells: null }, { stamped: true }).state === 'failed', 'D: a failed question is unknown, never "no overview"');
ok(overviewFor({ status: 'done', cells: { chatgpt: ans(true) } }, { stamped: false }).state === 'not_recorded', 'D: unstamped → not_recorded');

/* ── E. The reports ───────────────────────────────────────────────────────────────────────── */
function render(aio: Array<'named' | 'missed' | 'none' | 'old'>) {
  const run = { id: 'r1', run_number: 1, status: 'complete', mention_rate: 0, created_at: '2026-10-11T10:00:00Z', results: { hook: state, competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } };
  const qr = rowsWith(aio).map((r, i) => ({ id: `q${i}`, ...r }));
  const d = buildReportData(qr as never, run as never, { businessName: BIZ, businessType: 'roofer', locationText: 'Leeds', specialisms: '', isAggregatorUrl: () => false, hasWebsite: true });
  return { d: d!, t: text(renderReportHtml({ ...(d as object), generatedAtLabel: '11 October 2026', showOffer: true, offerUrl: '#', auditId: 'a1', requestCallUrl: '#' } as never)) };
}
const fresh = render(['missed', 'named', 'none']);
const old = render(['old', 'old', 'old']);
ok(fresh.d.hook?.score?.total === old.d.hook?.score?.total && fresh.d.hook?.score?.named === old.d.hook?.score?.named, 'E: the quick report’s score is identical with or without overviews');
ok(/Google AI Overview/.test(fresh.t), 'E: the quick public report shows Google AI Overview');
ok(/not counted in the score/.test(fresh.t) && /not scored/.test(fresh.t), 'E: and says it is not counted');
ok(fresh.t.includes(NO_OVERVIEW_TEXT), 'E: the "No overview shown" state appears for the question with none');
ok(/plus Google’s AI Overview, shown for context/.test(fresh.t), 'E: the header method line mentions it');
ok(!/AI Overview/.test(old.t), 'E: an OLD hook report is unchanged — no overview anywhere');
const qb = fresh.d.questionBreakdown!.find((q) => q.question === Q[2])!;
const aioRow = qb.perEngine.find((e) => e.label === 'AI Overview') as { ran: boolean; notShown?: number; overviewRecorded?: boolean; counted: boolean };
ok(!!aioRow && !aioRow.ran && aioRow.notShown === 1 && aioRow.overviewRecorded === true && aioRow.counted === false, 'E: the full report records "not shown" for that question, and never counts it');
const oldRow = old.d.questionBreakdown!.find((q) => q.question === Q[2])!.perEngine.find((e) => e.label === 'AI Overview') as { notShown?: number; overviewRecorded?: boolean };
ok(oldRow.notShown === undefined && oldRow.overviewRecorded === undefined, 'E: an old audit’s full report row carries no new field');

console.log(f ? `\n${f} FAILED` : '\nall passed');
process.exit(f ? 1 : 0);
