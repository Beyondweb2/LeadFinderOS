/* GOOGLE AI = AI MODE, CONTEXT ONLY (Paul, 2026-11-12).
   A. the actor input: AI Mode ON and the Overview add-on OFF only when asked; the default ask is unchanged.
   B. the reader: an `aiModeResult` block lands in the SAME `ai_overview` slot, with Google's settings lead-in cut;
      an older Overview block still reads; neither present = no cell (never a fake "0 named").
   C. AI Mode is NEVER scored: scoringMethodFor is 2 only in the window before AI Mode, 1 on both sides of it.
   D. the method date fails closed (unknown date = the old ask) and a re-measure follows its BASELINE.
   E. the queue wires it, both start calls; cost constants carry AI Mode and the quote stays at or above the reserve.
   F. the extractor still reads the slot, and the stored-answer readers are untouched (old audits keep their answers). */
import { readFileSync } from 'node:fs';
import { buildAiSearchInput, normalizeAiSearch, aiOverviewStamp } from '../supabase/functions/_shared/enrichment/ai-search.ts';
import { GOOGLE_AI_MODE_SINCE, GOOGLE_AI_SCORED_SINCE, googleAiModeApplies, scoringMethodFor } from '../src/lib/aiOverview.ts';
import { AI_SEARCH_USD_PER_QUESTION } from '../supabase/functions/_shared/enrichment/sources.ts';
import { AUDIT_EST_USD_PER_QUESTION } from '../src/lib/marketView.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// A
const modeIn = buildAiSearchInput('plumber in Bow', 'gb', { aiMode: true });
ok((modeIn.aiModeSearch as { enableAiMode?: boolean })?.enableAiMode === true && modeIn.aiOverview === undefined, 'A: aiMode asks AI Mode and no longer the Overview');
ok((modeIn.chatGptSearch as { enableChatGpt?: boolean }).enableChatGpt === true && (modeIn.geminiSearch as { enableGemini?: boolean }).enableGemini === true, 'A: ChatGPT and Gemini are still asked');
const oldIn = buildAiSearchInput('plumber in Bow', 'gb');
ok((oldIn.aiOverview as { scrapeFullAiOverview?: boolean })?.scrapeFullAiOverview === true && oldIn.aiModeSearch === undefined, 'A: the default ask is the old Overview, unchanged');
ok(JSON.stringify(buildAiSearchInput('plumber in Bow', 'gb', {})) === JSON.stringify(oldIn), 'A: empty options = the old ask');

// B
const organic = [{ position: 1, url: 'https://a.co.uk/', title: 'A' }];
const modeItems = [{ organicResults: organic, aiModeResult: { text: 'To get more features, update your settings Here are top-rated plumbers: Hackney Plumbers 4.6 (43) Plumber Open Call Directions Website', sources: [{ title: 'Hackney Plumbers', url: 'https://hackney-plumbers.co.uk' }] } }];
const n = normalizeAiSearch(modeItems, 'Acme Plumbing');
ok(!!n.ai_overview && n.ai_overview.answer_text.startsWith('Here are top-rated plumbers'), 'B: the AI Mode answer is stored in the ai_overview slot, lead-in cut');
ok(n.ai_overview?.named === false, 'B: not naming the business reads as not named');
ok(aiOverviewStamp(modeItems, n) === 'shown', 'B: an AI Mode answer stamps "shown"');
const oldItems = [{ organicResults: organic, aiOverviewResult: { text: 'Old overview text about plumbers', sources: [] } }];
ok(normalizeAiSearch(oldItems, 'Acme').ai_overview?.answer_text === 'Old overview text about plumbers', 'B: an older Overview block still reads');
const bare = [{ organicResults: organic }];
ok(normalizeAiSearch(bare, 'Acme').ai_overview === undefined && aiOverviewStamp(bare, normalizeAiSearch(bare, 'Acme')) === 'not_shown', 'B: no block = no cell, stamped not shown (never a fake zero)');
const own = normalizeAiSearch([{ aiModeResult: { text: 'Try Acme Plumbing in Bow', sources: [] } }], 'Acme Plumbing');
ok(own.ai_overview?.named === true, 'B: the business is still recognised when AI Mode names it');

// C
const before = '2026-10-01T00:00:00Z', window = '2026-11-01T00:00:00Z', after = '2026-11-13T00:00:00Z';
ok(Date.parse(GOOGLE_AI_SCORED_SINCE) < Date.parse(GOOGLE_AI_MODE_SINCE), 'C: AI Mode starts after the Overview was scored');
ok(scoringMethodFor(before) === 1, 'C: an audit from before Google AI was scored: method 1');
ok(scoringMethodFor(window) === 2, 'C: an Overview-era audit keeps method 2 (its stored score unchanged)');
ok(scoringMethodFor(GOOGLE_AI_MODE_SINCE) === 1 && scoringMethodFor(after) === 1, 'C: from the AI Mode date, Google AI is NOT in the score (method 1)');
ok(scoringMethodFor(null) === 1 && scoringMethodFor('nonsense') === 1, 'C: unknown date: not in the score');

// D
ok(googleAiModeApplies(after) === true && googleAiModeApplies(window) === false, 'D: AI Mode only from its date');
ok(googleAiModeApplies(null) === false && googleAiModeApplies(undefined) === false && googleAiModeApplies('garbage') === false, 'D: a missing or unreadable date fails closed to the old ask');
const q = read('../supabase/functions/process-ai-audit-queue/index.ts');
ok(/aiMode: googleAiModeApplies\(methodCreatedAt\)/.test(q) && /remeasure_audit_id", auditId/.test(q), 'D: the queue decides by the method date, and a re-measure follows its baseline');
ok((q.match(/startAiSearch\(String\(row\.question\), audit\.countryCode, apifyToken, \{ aiMode: audit\.aiMode \}\)/g) ?? []).length === 2, 'E: both start calls (first ask and retry) carry the same choice');
ok(!/startAiSearch\(String\(row\.question\), audit\.countryCode, apifyToken\)/.test(q), 'E: no start call is left on the old default');

// E cost
ok(AI_SEARCH_USD_PER_QUESTION >= 0.0184 && AUDIT_EST_USD_PER_QUESTION >= AI_SEARCH_USD_PER_QUESTION, 'E: the ledger carries AI Mode and the quote is at least the reserve');

// F
const ex = read('../supabase/functions/extract-competitors/index.ts');
ok(/ai_overview: "Google AI/.test(ex) && /AI_OVERVIEW_ENGINE/.test(ex), 'F: competitor extraction still reads the Google AI slot (same filters as ChatGPT and Gemini)');
const scored = read('../src/lib/hookScore.ts');
ok(/ctx\.scoringMethod === 2 \? 2 : 1/.test(scored), 'F: the hook score still counts Google AI only for method 2');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
