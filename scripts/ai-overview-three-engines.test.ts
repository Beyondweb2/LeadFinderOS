/* ════════════════════════════════════════════════════════════════════════════════════════════════
   GOOGLE AI OVERVIEW ON EVERY NEW AUDIT — DISPLAY ONLY (2026-10-11, Paul).

   New audits record ChatGPT, Gemini and Google AI Overview. The overview is read off the same Google
   results page the scrape already loads (no actor input change, no extra cost), stamped shown / not
   shown per question, and SHOWN — never counted. This suite pins:
     A. the stamp: shown / not shown / unknown, from the actor's own item;
     B. the actor input sends the full-overview add-on explicitly (approved 2026-10-11), nothing else changed;
     C. the score, the hook pick and the 6/6 are untouched by an overview;
     D. "No overview shown" is a result, an old audit draws nothing new;
     E. the quick public report and the full report show it, labelled not scored.
     H. (2026-10-19) audits from BEFORE the stamp show what they captured: a stored overview answer is
        'shown', a results page with none is 'not shown', nothing is 'not recorded'; the chip words; the
        full report quotes the overview text; Outreach carries the tally beside its two scores.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { aiOverviewStamp, normalizeAiSearch, buildAiSearchInput, AI_OVERVIEW_META_KEY } from '../supabase/functions/_shared/enrichment/ai-search.ts';
import { AI_OVERVIEW_STAMP_KEY, NO_OVERVIEW_TEXT, overviewFor, overviewSummary, overviewReadingOf, overviewTally, overviewChipText, overviewChipTone, overviewEvidenceLine } from '../src/lib/aiOverview.ts';
import { rowScoreFromPerEngine } from '../src/lib/outreachRowCheck.ts';
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

/* ── B. Cost: the actor input (full overview explicit) ────────────────────────────────────────────────── */
const input = buildAiSearchInput('roofer in Leeds', 'gb');
ok(JSON.stringify(input.aiOverview) === JSON.stringify({ scrapeFullAiOverview: true }), 'B: the FULL overview add-on is sent EXPLICITLY (Paul approved it 2026-10-11) — never left to the actor default');
ok(JSON.stringify(Object.keys(input).sort()) === JSON.stringify(['aiOverview', 'chatGptSearch', 'countryCode', 'geminiSearch', 'languageCode', 'maxPagesPerQuery', 'queries']), 'B: the actor input keys are exactly these (the overview add-on is the only addition)');

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
ok(base.overviews.length === 3 && base.overviews.every((o) => o.state === 'not_recorded'), 'D: an audit holding NOTHING about the overview (no stamp, no answer, no results page) reads not_recorded per question, never "not shown" (2026-10-19)');
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
ok(/Display only · not scored/.test(fresh.t), 'E: and says it is not scored');
ok(fresh.t.includes(NO_OVERVIEW_TEXT), 'E: the "No overview shown" state appears for the question with none');
ok(/plus Google’s AI Overview, shown for context/.test(fresh.t), 'E: the header method line mentions it');
ok(/Google AI Overview not recorded/.test(old.t) && !old.t.includes(NO_OVERVIEW_TEXT) && !/Display only · not scored/.test(old.t), 'E: a hook report holding nothing about the overview shows the chip as "not recorded" and invents no overview reply');
ok(/Google AI Overview 1\/2/.test(fresh.t), 'E: the quick report chip beside the two engine cards: named in 1 of the 2 searches that showed one');
const qb = fresh.d.questionBreakdown!.find((q) => q.question === Q[2])!;
const aioRow = qb.perEngine.find((e) => e.label === 'AI Overview') as { ran: boolean; notShown?: number; overviewRecorded?: boolean; counted: boolean };
ok(!!aioRow && !aioRow.ran && aioRow.notShown === 1 && aioRow.overviewRecorded === true && aioRow.counted === false, 'E: the full report records "not shown" for that question, and never counts it');
const oldRow = old.d.questionBreakdown!.find((q) => q.question === Q[2])!.perEngine.find((e) => e.label === 'AI Overview') as { notShown?: number; overviewRecorded?: boolean };
ok(oldRow.notShown === undefined && oldRow.overviewRecorded === undefined, 'E: an old audit’s full report row carries no new field');

/* ── F. The overview, readable for the extractor (2026-10-11, full-overview add-on) ──────────── */
{
  const { overviewReadableText } = await import('../src/lib/aiOverview.ts');
  const raw = '…and certified testing:Services: fit-outs.Contact: 0113 436 0017 | SmartOhm Commercial ServicesServices: Small fit-outs.Learn moreCopied to clipboardFailed to copy';
  const r = overviewReadableText(raw);
  ok(r.includes('testing: Services:') && r.includes('fit-outs. Contact:'), 'F: a sentence glued to the next label gets its space back');
  ok(r.includes('SmartOhm Commercial Services Services:'), 'F: a name glued to the next card label is separated');
  ok(!/clipboard|copy/i.test(r), "F: Google's share / copy controls are cut");
  ok(['SmartOhm', 'Commercial', 'fit-outs', '0113 436 0017'].every((w) => r.includes(w)), "F: no word is written and none of the overview's own words is lost");
  const ec = (await import('node:fs')).readFileSync('supabase/functions/extract-competitors/index.ts', 'utf8');
  ok(/engine === AI_OVERVIEW_ENGINE \? overviewReadableText\(raw\) : raw/.test(ec), 'F: extract-competitors reads the overview (only) through overviewReadableText');
}

/* ── G. Report restyle + overview states + names (2026-10-11) ───────────────────────────────── */
{
  const { overviewSummaryText, overviewFullText, OVERVIEW_NO_NAMES_TEXT } = await import('../src/lib/aiOverview.ts');
  const { countDistinctBusinesses, distinctNames, normaliseRivalName } = await import('../src/lib/hookAudit.ts');
  /* S P Electrical's stored snippet (fga54n): a sentence glued to the next heading. */
  const sp = overviewSummaryText('Top commercial electrical contractors in Leeds, UK provide specialized installations, testing, fit-outs, and maintenance for businesses, offices, retail spaces, and industrial facilities.Top Commercial Electricians in Leeds');
  ok(sp.text.endsWith('industrial facilities.') && !/Top Commercial Electricians/.test(sp.text) && sp.truncated, 'G: a glued trailing heading is dropped and the text marked as continuing');
  const maps = overviewSummaryText('You can call Wirral 24 Hour Plumber at 0151 691 0258 for help in Wallasey.Wirral 24 Hour Plumber4.8(105)PlumberOpen5 Moorcroft RdPhone: 0151 691');
  ok(maps.text === 'You can call Wirral 24 Hour Plumber at 0151 691 0258 for help in Wallasey.' && maps.truncated, 'G: the summary stops before a Google Maps card');
  ok(!/clipboard/i.test(overviewFullText('One. Two sentences here.Learn moreCopied to clipboard')), 'G: the full text drops Google\'s copy controls');
  ok(overviewSummaryText('').text === '', 'G: empty in, empty out (never a placeholder)');
  /* The duplicate rule (S P Electrical read four firms as four). */
  const k = (n: string) => normaliseRivalName(n, 'Leeds');
  ok(countDistinctBusinesses([k('Martin Day Electrician'), k('Martin Day Commercial Electricians'), k('Coleman Electrical Services'), k('Coleman Electrical & Security')]) === 2, 'G: two spellings of one firm count once');
  ok(countDistinctBusinesses([k('AB Roofing'), k('ABC Roofing'), k('HG Electrical'), k('HPS Electrical')]) === 4, 'G: different firms stay different');
  ok(JSON.stringify(distinctNames(['Brightlec Ltd', 'Brightlec', 'Volta Compliance'], 'Leeds')) === JSON.stringify(['Brightlec Ltd', 'Volta Compliance']), 'G: one name per business, first spelling kept');

  /* The quick report: three overview states, table pills, "+n more", one colour per business. */
  const many = ['Ridge Roofing Ltd', 'Slate Masters', 'Top Roofs'];
  const cellOf = (named: boolean, names: string[]) => ({ named, self_named: named, answer_text: named ? `Try ${BIZ} for roofing, they are well reviewed across Leeds and nearby towns for repairs.` : `Good options include ${names.join(', ')} for roofing work across Leeds and nearby towns, all well reviewed.`, competitors: named ? [] : names, citations: [] });
  const rows3 = Q.map((question, i) => {
    const result: Record<string, unknown> = { chatgpt: cellOf(false, many), gemini: cellOf(false, i === 0 ? ['Ridge Roofing Services Ltd'] : many) };
    if (i === 0) { result.ai_overview = cellOf(false, ['Slate Masters', 'Top Roofs']); result[AI_OVERVIEW_STAMP_KEY] = 'shown'; }
    if (i === 1) { result.ai_overview = { ...cellOf(false, []), answer_text: 'Roofers in Leeds handle repairs, flat roofs and storm damage for homeowners across the city.' }; result[AI_OVERVIEW_STAMP_KEY] = 'shown'; }
    if (i === 2) result[AI_OVERVIEW_STAMP_KEY] = 'not_shown';
    return { id: `g${i}`, question, status: 'done', result };
  });
  const run = { id: 'r1', run_number: 1, status: 'complete', mention_rate: 0, created_at: '2026-10-11T10:00:00Z', results: { hook: state, competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } };
  const d = buildReportData(rows3 as never, run as never, { businessName: BIZ, businessType: 'roofer', locationText: 'Leeds', specialisms: '', isAggregatorUrl: () => false, hasWebsite: true });
  const html = renderReportHtml({ ...(d as object), generatedAtLabel: '11 October 2026', showOffer: true, offerUrl: '#', auditId: 'a1', requestCallUrl: '#' } as never);
  const tt = text(html);
  const chats = [...html.matchAll(/<article class="q4-chat">([\s\S]*?)<\/article>/g)].map((m) => m[1]);
  ok(/<span class="q4-nm">Ridge Roofing Ltd</.test(chats[0] ?? '') && /You weren&rsquo;t mentioned/.test(chats[0] ?? ''), 'G: each reply lists who the AI named, the miss said plainly');
  ok(chats.length === 3 && chats.every((c) => /q4-reply--aio[\s\S]*?Display only · not scored/.test(c)), 'G: the overview is a further reply in every window, labelled display only');
  ok(/q4-reply--aio[\s\S]*?Slate Masters[\s\S]*?Top Roofs/.test(chats[0] ?? ''), 'G: the overview reply lists its own names');
  ok(tt.includes(OVERVIEW_NO_NAMES_TEXT) && tt.includes(NO_OVERVIEW_TEXT), 'G: the chat view distinguishes "names could not be read" from "no overview shown"');
  ok((chats[0] ?? '').indexOf('q4-reply--aio') > (chats[0] ?? '').indexOf('q4-reply--gai'), 'G: the overview reply comes after the two scored engines');
  ok(!/q4-np--|#4285F4/i.test(html), 'G: no coloured name pills and no blue');
  ok(/Measured on[\s\S]*ChatGPT, Gemini and Google AI Overview/.test(tt), 'G: "Measured on" names all three');
  ok(d!.hook!.score!.total === 6, 'G: the score is still 3 × 2 = 6');
}

/* ── H. Audits from before the stamp show what they captured (2026-10-19) ───────────────────── */
{
  const preStamp = (kind: 'cell' | 'serp' | 'nothing', named = false): Record<string, unknown> => ({
    chatgpt: ans(false), gemini: ans(false),
    ...(kind === 'cell' ? { ai_overview: ans(named) } : {}),
    ...(kind === 'serp' ? { _google_serp: { count: 3, results: [] } } : {}),
  });
  ok(overviewReadingOf(preStamp('cell')) === 'shown', 'H: a stored overview answer with no stamp → shown (the bug: these showed nothing)');
  ok(overviewReadingOf(preStamp('serp')) === 'not_shown', 'H: a results page that came back with no overview → not shown (the same test as aiOverviewStamp)');
  ok(overviewReadingOf(preStamp('nothing')) === null, 'H: nothing captured → unknown, never a guess');
  ok(overviewReadingOf({ ...preStamp('cell'), [AI_OVERVIEW_STAMP_KEY]: 'not_shown' }) === 'not_shown', 'H: the queue’s own stamp always wins');
  const oldRows = [preStamp('cell', true), preStamp('cell', false), preStamp('serp')].map((result, i) => ({ question: Q[i], status: 'done', result }));
  const sc = scoreHookRun(state, oldRows, ctx);
  ok(sc.overviews.map((o) => o.state).join() === 'shown,shown,not_shown' && sc.overviews[0].named === true && sc.overviews[1].named === false, 'H: an old hook audit now shows its captured overviews (named / not named / none)');
  ok(sc.overviews[1].answerText.length > 0, 'H: with the captured answer text, never an invented one');
  const stripped = oldRows.map((r) => ({ ...r, result: { chatgpt: r.result.chatgpt, gemini: r.result.gemini } }));
  const sc0 = scoreHookRun(state, stripped, ctx);
  ok(sc.named === sc0.named && sc.expected === sc0.expected && sc.percent === sc0.percent, 'H: the score is untouched by reading old overviews');
  const t = overviewTally(sc.overviews)!;
  ok(t.shown === 2 && t.named === 1 && t.notShown === 1 && overviewChipText(t) === 'Google AI Overview 1/2' && overviewChipTone(t) === 'not_named', `H: chip "Google AI Overview 1/2" (${overviewChipText(t)})`);
  const none3 = { shown: 0, named: 0, notShown: 3, unknown: 0, pending: 0, total: 3 };
  ok(overviewChipText(none3) === 'No AI Overview shown' && overviewChipTone(none3) === 'neutral', 'H: chip "No AI Overview shown", neutral, not a failure');
  ok(overviewChipText(null) === 'Google AI Overview not recorded' && overviewChipText(overviewTally([])) === 'Google AI Overview not recorded', 'H: an old payload / no questions → "not recorded"');
  ok(/not scored/.test(overviewEvidenceLine(t)), 'H: the call screen evidence line keeps "(not scored)"');
  const run = { id: 'r1', run_number: 1, status: 'complete', mention_rate: 0, created_at: '2026-09-20T10:00:00Z', results: {} };
  const reportCtx = { businessName: BIZ, businessType: 'roofer', locationText: 'Leeds', specialisms: '', isAggregatorUrl: () => false, hasWebsite: true };
  const d = buildReportData(oldRows.map((r, i) => ({ id: `o${i}`, ...r })) as never, run as never, reportCtx)!;
  const d0 = buildReportData(stripped.map((r, i) => ({ id: `p${i}`, ...r })) as never, run as never, reportCtx)!;
  ok(d.overview?.shown === 2 && d.overview?.named === 1, 'H: buildReportData carries the audit-wide tally');
  ok(d.pct === d0.pct && d.named === d0.named && d.total === d0.total, 'H: the report percentage and counts are unchanged by the overview');
  const aio = d.questionBreakdown!.find((q) => q.question === Q[1])!.perEngine.find((e) => e.label === 'AI Overview') as { overviewAnswers?: Array<{ text: string; full: string }>; overviewRecorded?: boolean };
  ok(aio.overviewRecorded === true && (aio.overviewAnswers?.[0]?.full ?? '').includes('Ridge Roofing Ltd'), 'H: the full report row carries the overview answer text, as captured');
  const tt = text(renderReportHtml({ ...(d as object), generatedAtLabel: '20 September 2026', showOffer: true, offerUrl: '#', auditId: 'a1', requestCallUrl: '#' } as never));
  ok(/Google AI Overview said/.test(tt) && tt.includes('Ridge Roofing Ltd, Slate Masters and Top Roofs'), 'H: the full report quotes the overview, labelled Google AI Overview');
  ok(/Google AI Overview 1\/2/.test(tt), 'H: the full report shows the chip');
  const row = rowScoreFromPerEngine(d.perEngine, d.overview);
  ok(row?.engines.length === 2 && row.overview?.shown === 2, 'H: Outreach keeps its two scores and carries the overview beside them');
}

console.log(f ? `\n${f} FAILED` : '\nall passed');
process.exit(f ? 1 : 0);
