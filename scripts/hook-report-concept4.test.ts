/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CONCEPT 4 · HOOK AUDIT HYBRID — the six-answer quick report (Paul, 2026-10-06).

   Pins: the answer clean-up (map/listing chrome removed, the AI's own words kept, never a word
   written), the ~500-character excerpt and its fallback, 3 × 2 = 6 scoring, the rival count across
   the misses (normalised, de-duplicated, withheld runs give no count), the website states, the 6/6
   positive state, the CTA/footer left exactly as every other hook report prints it, and every other
   report type untouched by the new layout.
   The fixtures below are SHAPED like real stored answers (measured on the 20 six-answer hooks); the
   business names are invented.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { answerExcerpt, cleanAnswerBlocks } from '../src/lib/answerText.ts';
import { buildReportData } from '../src/lib/auditReport.ts';
import { renderReportHtml, quickEngineTone, quickHighlight, ownNameVariants, QUICK_ANSWER_CHARS } from '../src/lib/aiAuditReportHtml.ts';
import { initialHookStateV2 } from '../src/lib/hookScore.ts';
import { buildHookReportSummary, countDistinctBusinesses, normaliseRivalName } from '../src/lib/hookAudit.ts';
import { REMEASURE_CLAIM_SENTENCE } from '../src/lib/findableOffer.ts';
import { buildFaultLines, isGenericSchemaGap } from '../src/lib/crawlCheck.ts';
import type { SiteEvidenceFinding } from '../src/lib/siteEvidence.ts';

let failures = 0;
function ok(cond: unknown, label: string) { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); }
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&#39;|&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&hellip;/g, '…').replace(/&#10005;/g, '✕').replace(/&#10003;/g, '✓').replace(/\s+/g, ' ');

/* ── Real-shaped answers ─────────────────────────────────────────────────────────────────────── */
const GEMINI_MAP = [
  '![](https://maps.gstatic.com/tactile/pane/default_geocode-1x.png) ',
  '',
  'Ridge Roofing Ltd',
  '',
  '4.8 stars rating 4.8 ![](https://www.gstatic.com/gemini/maps/star.png)   · £1-£3,000',
  '',
  '📍 Roofing contractor',
  '',
  'Closed · Opens 9:00 AM Thu',
  '',
  'Ridge Roofing Ltd Click to open side panel for more information is a professional roofing contractor in Leeds, providing commercial and residential roof repairs.',
  '',
  '*   **Services Offered:** Handles general roof repairs, maintenance, and full installations.',
  '    ',
  '*   **Location:** Based on Park Road, offering local expertise across the area.',
  '',
  'ridgeroofing.co.uk',
  '',
  '![](https://maps.gstatic.com/tactile/pane/default_geocode-1x.png) ',
  '',
  'Slate Masters',
  '',
  '4.9 stars rating 4.9 ![](https://www.gstatic.com/gemini/maps/star.png)  ',
  '',
  '📍 Roofing contractor',
  '',
  'Open',
  '',
  'Slate Masters Click to open side panel for more information operates around the clock, making it a reliable option for urgent or out-of-hours repairs in north Leeds and the surrounding villages, with a strong local reputation for fast response.',
].join('\n');
const CHATGPT_STRIP = '*   Map data is currently unavailable![](https://images.openai.com/static-rsc-1/abc) **Ridge Roofing Ltd** 4.9Roofing contractorOpen![](https://images.openai.com/static-rsc-1/def) **Slate Masters** 5.0Roofing contractorOpen\n    \n    If you need a roofer in Leeds, these are well-reviewed local options:\n    \n    *   Ridge Roofing Ltd — **24/7**, Leeds LS6. **0113 000 0000** \\[1\\]\n        \n    *   Slate Masters — strong reviews for leak repairs.\n        \n    \n    ### My practical shortlist\n    \n    Get **3 quotes** before you decide.';
const MAP_ONLY = '![](https://maps.gstatic.com/x.png)\n\nRidge Roofing Ltd\n\n4.8 stars rating 4.8 ![](https://www.gstatic.com/gemini/maps/star.png)\n\n📍 Roofing contractor\n\nOpen';

/* ── A. Clean-up: chrome removed, words kept ─────────────────────────────────────────────────── */
{
  const ex = answerExcerpt(GEMINI_MAP, QUICK_ANSWER_CHARS)!;
  const joined = ex ? ex.blocks.map((b) => b.text).join(' ') : '';
  ok(!!ex, 'A: a map-heavy Google AI answer is CLEANED, not discarded');
  ok(!/click to open side panel/i.test(joined), 'A: "Click to open side panel" removed');
  ok(!/stars? rating|gstatic|📍|Opens 9:00|^Open$/i.test(joined) && !ex.blocks.some((b) => /^(open|closed)\b/i.test(b.text)), 'A: ratings, map pins, open/closed lines and images removed');
  ok(!/ridgeroofing\.co\.uk/.test(joined), 'A: a bare source-domain chip is removed');
  ok(/is a professional roofing contractor in Leeds, providing commercial and residential roof repairs\./.test(joined), 'A: the real sentence is preserved word for word');
  ok(/Ridge Roofing Ltd is a professional/.test(joined), 'A: the business name is preserved (the card title above it is dropped, not the name in the sentence)');
  ok(ex.blocks.filter((b) => b.text === 'Ridge Roofing Ltd').length === 0, 'A: the listing title line is not duplicated');
  ok(ex.blocks.some((b) => b.kind === 'li' && /^Services Offered: Handles general roof repairs/.test(b.text)), 'A: bullets keep their words, markdown bold removed');
  const gpt = answerExcerpt(CHATGPT_STRIP, QUICK_ANSWER_CHARS)!;
  const gj = gpt.blocks.map((b) => b.text).join(' ');
  ok(!/Map data is currently unavailable|images\.openai|4\.9Roofing/.test(gj), 'A: ChatGPT’s map strip is removed');
  ok(/If you need a roofer in Leeds, these are well-reviewed local options:/.test(gj) && !/\[1\]/.test(gj), 'A: ChatGPT prose kept, citation markers removed');
  /* No fabrication: every word of every excerpt exists in the stored answer. */
  for (const [label, raw] of [['Google AI', GEMINI_MAP], ['ChatGPT', CHATGPT_STRIP]] as const) {
    const e = answerExcerpt(raw, QUICK_ANSWER_CHARS)!;
    const rawWords = new Set(raw.toLowerCase().match(/[a-z0-9£]+/g) ?? []);
    const extra = e.blocks.flatMap((b) => b.text.toLowerCase().match(/[a-z0-9£]+/g) ?? []).filter((w) => !rawWords.has(w));
    ok(extra.length === 0, `A: ${label} excerpt adds no word that is not in the stored answer${extra.length ? ` (${extra.join(', ')})` : ''}`);
  }
}

/* ── B. Length, cut and fallback ─────────────────────────────────────────────────────────────── */
{
  const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} describes a local roofer and the repairs they handle across the city.`).join(' ');
  const ex = answerExcerpt(long, 500)!;
  const len = ex.blocks.reduce((t, b) => t + b.text.length, 0);
  ok(len <= 500 && len > 200, `B: the excerpt is about 500 characters (${len})`);
  ok(/\.$/.test(ex.blocks[ex.blocks.length - 1].text) && ex.truncated, 'B: cut at a sentence end, and marked as continuing');
  ok(answerExcerpt(MAP_ONLY, 500) === null, 'B: nothing readable left → null (no excerpt, never junk)');
  ok(answerExcerpt('', 500) === null, 'B: an empty answer → null');
  ok(cleanAnswerBlocks('Line one is here.\nLine one is here.').length === 1, 'B: an identical repeated paragraph is shown once');
  ok(cleanAnswerBlocks('*    **W Midgley Plumbing and Heating Ltd** ')[0]?.text === 'W Midgley Plumbing and Heating Ltd', 'B: private-use icon glyphs (Gemini U+E000/U+E800) are removed, the name kept');
}

/* ── Report fixtures ─────────────────────────────────────────────────────────────────────────── */
const BIZ = 'Acme Roofing Services';
const TOWN = 'Leeds';
const Q = ['roof repair in Leeds', 'best roofer in Leeds', 'emergency roofer near Leeds'];
type Cell = { named: boolean; text?: string; rivals: string[] };
const cell = (c: Cell) => ({ named: c.named, self_named: c.named, answer_text: c.text ?? (c.named ? `Try ${BIZ} or ${c.rivals.join(', ')} for a well reviewed local roofer in the city.` : `Good local options include ${c.rivals.join(', ')}. Compare quotes, reviews and guarantees before choosing one of them.`), competitors: c.rivals, citations: [] });
function report(grid: Array<[Cell, Cell]>, extra: Record<string, unknown> = {}, hook: unknown = initialHookStateV2(Q)) {
  const run = { id: 'r1', run_number: 1, status: 'complete', mention_rate: 0, created_at: '2026-10-06T10:00:00Z', results: { hook, competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } };
  const qr = grid.map(([c, g], i) => ({ id: `q${i}`, question: Q[i], status: 'done', result: { chatgpt: cell(c), gemini: cell(g) } }));
  const d = buildReportData(qr as never, run as never, { businessName: BIZ, businessType: 'roofer', locationText: TOWN, specialisms: '', isAggregatorUrl: () => false, hasWebsite: true });
  const html = renderReportHtml({ ...(d as object), generatedAtLabel: '6 October 2026', showOffer: true, offerUrl: '#', auditId: 'a1', requestCallUrl: '#', ...extra } as never);
  return { d: d!, html, t: text(html) };
}
const miss = (rivals: string[], text?: string): Cell => ({ named: false, rivals, text });
const hit = (rivals: string[]): Cell => ({ named: true, rivals });

/* ── C. Score: 3 questions × 2 engines = 6 ───────────────────────────────────────────────────── */
{
  /* The picker prefers a Google AI miss that names at least three rivals (hookScore.ts), so the
     intended featured answer carries three and the others one each. */
  const r = report([[hit(['Top Tiles Ltd']), miss(['Ridge Roofing Ltd', 'Slate Masters', 'Tile Doctors'], GEMINI_MAP)], [miss(['Top Tiles Ltd']), miss(['Slate Masters'])], [miss(['Leeds Roof Co']), miss(['Ridge Roofing'])]]);
  const s = r.d.hook!.score!;
  ok(s.total === 6 && s.named === 1 && s.percent === 17, 'C: 1 of 6 answers → 17%');
  ok(s.perEngine.length === 2 && s.perEngine.every((e) => e.total === 3), 'C: ChatGPT /3 and Google AI /3');
  ok(/17%/.test(r.t) && /1 of 6 answers named your business/.test(r.t), 'C: "17%" and "1 of 6 answers named your business" are printed');
  ok(/3 questions × 2 AI engines × 1 ask each · 6 answers total/.test(r.t.replace(/&times;/g, '×').replace(/&middot;/g, '·')), 'C: the header reminds the reader of the method, from the real score shape');
  ok(r.html.indexOf('class="q4-score"') < r.html.indexOf('Featured question'), 'C: the score comes before the featured question');
  ok(quickEngineTone(0, 3) === 'red' && quickEngineTone(1, 3) === 'amber' && quickEngineTone(2, 3) === 'green' && quickEngineTone(3, 3) === 'green' && quickEngineTone(0, 0) === '', 'C: engine colours 0 red, 1 amber, 2-3 green, no denominator none');
  ok(/q4-eng--gpt[\s\S]*?ChatGPT[\s\S]*?q4-eng-v q4-t-amber">33%/.test(r.html) && /q4-eng--gai[\s\S]*?Google AI[\s\S]*?q4-eng-v q4-t-red">0%/.test(r.html), 'C: ChatGPT 1/3 (33%) amber, Google AI 0/3 (0%) red — tint identifies the engine, colour grades the result');
  ok(/class="q4-t-red">17%/.test(r.html), 'C: 17% overall reads red (poor)');
  ok(!/Gemini/.test(r.t), 'C: the page says Google AI, never Gemini');

  /* ── D. Featured question: BOTH engines' answers to the strongest missed question ── */
  const f = r.d.hook!.featured!;
  ok(f.question === Q[0] && f.answers.map((a) => `${a.engine}:${a.named}`).join(',') === 'chatgpt:true,gemini:false', 'D: the featured question is the strongest miss, with each engine’s own answer and status');
  ok(/Featured question/i.test(r.t) && r.t.includes('roof repair in Leeds') && /We asked both AI engines the same question/.test(r.t), 'D: the question is shown with both answers');
  ok((r.html.match(/class="q4-ans q4-ans--/g) ?? []).length === 2 && /q4-ans--gpt[\s\S]*?q4-chip--y[\s\S]*?q4-ans--gai[\s\S]*?q4-chip--n/.test(r.html), 'D: ChatGPT card NAMED, Google AI card NOT NAMED');
  ok(/is a professional roofing contractor in Leeds/.test(r.t) && !/click to open side panel|stars rating|gstatic/i.test(r.t), 'D: the cleaned excerpt is shown, map clutter gone');
  ok(/<mark class="q4-hl">Ridge Roofing Ltd<\/mark>/.test(r.html), 'D: a competitor in the excerpt is highlighted (Slate Masters falls after the 380-character cut and is listed under Named instead)');
  ok(new RegExp(`<mark class="q4-hl q4-hl--me">${BIZ}</mark>`).test(r.html), 'D: the business is highlighted GREEN inside the answer that named it');
  const gaiCard = r.html.slice(r.html.indexOf('class="q4-ans q4-ans--gai"'));
  ok(!/q4-hl--me/.test(gaiCard.slice(0, gaiCard.indexOf('</article>'))), 'D: …and never inside an answer that did not name it');
  ok(/Named instead[\s\S]*?Ridge Roofing Ltd[\s\S]*?Slate Masters/.test(r.t), 'D: the not-named card lists who was named instead');
  ok(r.html.includes('class="q4-mk q4-mk--gai"') && r.html.includes('class="q4-mk q4-mk--gpt"'), 'D: both engine identifiers are present');

  /* ── E. Rival count across all six answers ── */
  ok(r.d.hook!.rivalsNamedInstead === 5, `E: rivals across the misses, de-duplicated (got ${r.d.hook!.rivalsNamedInstead}: Ridge Roofing = Ridge Roofing Ltd; the named answer’s list is not counted)`);
  ok(/5 of 6 answers didn’t name you/.test(r.t) && /5 competitors were named instead/.test(r.t), 'E: why-this-matters shows the supported figures');
}

/* ── F. Normalising and counting ─────────────────────────────────────────────────────────────── */
{
  ok(normaliseRivalName('Apex Roofing Contractors Ltd') === 'apex roofing contractors' && normaliseRivalName('APEX ROOFING CONTRACTORS LIMITED') === 'apex roofing contractors', 'F: case and legal suffix do not make a second firm');
  ok(normaliseRivalName('Foundry Gym Sheffield', 'Sheffield') === 'foundry gym' && normaliseRivalName('Olympia Health & Fitness') === 'olympia health and fitness', 'F: a trailing home-town name and "&" normalise');
  ok(countDistinctBusinesses(['puregym', 'puregym city centre south', 'the gym group', 'the gym group heeley', 'virgin active']) === 3, 'F: a name and its longer branch form count once');
  ok(countDistinctBusinesses(['ab roofing', 'abc roofing']) === 2, 'F: prefix merging is word-bounded ("ab" is not "abc")');
}

/* ── G. Messy run: rival names withheld → no count, never 0 or a guess ───────────────────────── */
{
  const state = initialHookStateV2(Q);
  const rows = Q.map((q, i) => ({ question: q, status: 'done', result: { chatgpt: cell(miss(['Top Tiles Ltd'])), gemini: cell(miss([`Rival ${i}`])) } }));
  const base = { state, rows, engineOrder: ['chatgpt', 'gemini'] as const, engineLabel: (e: string) => (e === 'chatgpt' ? 'ChatGPT' : 'Google AI'), namedInstead: () => [] as string[], namedCtx: { businessName: BIZ, trade: 'roofer', town: TOWN }, town: TOWN, trade: 'roofer' };
  const withheld = buildHookReportSummary({ ...base, rivalFilter: () => null });
  ok(withheld!.rivalsNamedInstead === null, 'G: a withheld run gives rivalsNamedInstead = null');
  const noFilter = buildHookReportSummary({ ...base });
  ok(noFilter!.rivalsNamedInstead === null, 'G: no gate passed → no count (absent never becomes 0)');
  const counted = buildHookReportSummary({ ...base, rivalFilter: (c) => c });
  ok(counted!.rivalsNamedInstead === 4, 'G: with the gate open, all six answers are counted (Top Tiles once + Rival 0-2)');
  const r = report([[miss(['Top Tiles Ltd']), miss(['Slate Masters'])], [miss(['Top Tiles Ltd']), miss(['Slate Masters'])], [miss(['Top Tiles Ltd']), miss(['Slate Masters'])]]);
  const html = r.html.replace(/data-x/g, '');
  ok(/competitors were named instead|competitor was named instead/.test(r.t), 'G: (control) an open run prints the count');
  const d = { ...(r.d as object), hook: { ...r.d.hook!, rivalsNamedInstead: null } };
  const t2 = text(renderReportHtml({ ...d, generatedAtLabel: '6 October 2026' } as never));
  ok(!/named instead\s*$/.test(t2) && !/competitors? (were|was) named instead/.test(t2), 'G: a withheld count is omitted from why-this-matters');
  ok(html.length > 0, 'G: render ok');
}

/* ── H. Fallback when nothing readable survives ──────────────────────────────────────────────── */
{
  const r = report([[miss(['Top Tiles Ltd']), miss(['Ridge Roofing Ltd', 'Slate Masters', 'Tile Doctors'], MAP_ONLY)], [miss(['Top Tiles Ltd']), miss(['Slate Masters'])], [miss(['Top Tiles Ltd']), miss(['Slate Masters'])]]);
  ok(r.d.hook!.gap!.question === Q[0] && r.d.hook!.gap!.engine === 'gemini', 'H: (setup) the map-only answer is the featured one');
  const gai = r.html.slice(r.html.indexOf('class="q4-ans q4-ans--gai"'), r.html.indexOf('</article>', r.html.indexOf('class="q4-ans q4-ans--gai"')));
  ok(!gai.includes('q4-ans-body') && gai.includes('q4-ans-none'), 'H: no excerpt when nothing readable survives');
  ok(/Google AI answered without naming/.test(r.t) && /Named instead[\s\S]*Ridge Roofing Ltd/.test(text(gai)) && /q4-chip--n/.test(gai), 'H: the result and the names still show, stated from the data');
  ok(!/stars rating|gstatic|📍/.test(r.t), 'H: no garbage printed');

  /* A NAMED answer that mentions the client only late: the excerpt starts at that passage, marked "…". */
  const late = 'Here are several local roofers worth considering for repairs across the city this season. '.repeat(8) + `\n\n${BIZ} is a well reviewed local roofer covering the whole of Leeds and nearby towns.`;
  const ex = answerExcerpt(late, 380, [BIZ])!;
  ok(ex.lead && ex.blocks[0].text.startsWith(BIZ), 'H2: a named answer’s excerpt starts where it names the business (lead "…")');
  ok(answerExcerpt(late, 380)!.lead === false, 'H2: without a focus the excerpt starts at the top as before');
  const v = ownNameVariants('5 Towns Roofing and Guttering Ltd');
  ok(v.includes('5 Towns Roofing') && v.includes('5 Towns Roofing & Guttering') && !v.includes('5 Towns Roofing and') && !v.includes('5 Towns'), 'H2: own-name variants: a 3+ word lead ("5 Towns Roofing"), &/and, never a dangling "and" or a 2-word stub');
  const shortForm = `Here are some local roofers. **5 Towns Roofing:** a family-run local business covering Castleford with general repairs and guttering.`;
  ok(quickHighlight(shortForm, [], 'q4-hl', v).includes('<mark class="q4-hl q4-hl--me">5 Towns Roofing</mark>'), 'H2: a named answer that shortens the name still highlights it green');
}

/* ── I. Website states ───────────────────────────────────────────────────────────────────────── */
{
  const grid: Array<[Cell, Cell]> = [[miss(['A Co']), miss(['B Co'])], [miss(['A Co']), miss(['B Co'])], [hit(['A Co']), miss(['B Co'])]];
  const issues = report(grid, { crawlFaults: [{ title: 'AI can’t reach your site', detail: 'GPTBot is blocked.', minor: false, kind: 'search_blocked' }, { title: 'Pages load slowly for crawlers', detail: 'A minor fault.', minor: true, kind: 'thin_pages' }] });
  ok(/Website issues we found/i.test(issues.t) && /q4-sev--high">High/.test(issues.html) && /q4-sev--med">Medium/.test(issues.html), 'I: issues → High (serious) and Medium (minor)');
  ok(!/\bLow\b/.test(issues.t) && !/of \d+ pages/.test(issues.t), 'I: no invented "Low" and no invented pages-affected figure');

  /* ── I2. STRUCTURED DATA (Paul, 2026-10-06): the GENERIC "no schema" line never qualifies for the
     six-answer hook report; a misleading schema finding still does; every other surface keeps it. ── */
  const signals = { homeUrl: 'https://example.co.uk', fetchFailed: false, searchBlocked: ['OAI-SearchBot'], clientRendered: null, duplicates: null, thinPages: 2, missingH1: true, noJsonLd: true } as never;
  const faults = buildFaultLines(signals);
  ok(faults.some((f) => f.kind === 'no_structured_data' && /label the basics/.test(f.title)), 'I2: the crawl check still detects and reports the schema gap (buildFaultLines unchanged for other surfaces)');
  ok(faults.length === 4 && faults.map((f) => f.kind).join(',') === 'search_blocked,thin_pages,missing_h1,no_structured_data', 'I2: buildFaultLines order and cap are unchanged');
  const hook = report(grid, { crawlFaults: faults, siteChecked: true });
  ok(!/label the basics|structured data/i.test(hook.t), 'I2: "no structured data" alone does NOT appear on the six-answer hook report');
  ok(/AI can’t reach your site/.test(hook.t) && /There isn’t enough on your pages/.test(hook.t) && /Your pages have no clear heading/.test(hook.t) && (hook.html.match(/class="q4-issue"/g) ?? []).length === 3, 'I2: the other genuine issues stay, in order, and nothing is added to fill the slot');
  const onlySchema = report(grid, { crawlFaults: faults.filter(isGenericSchemaGap), siteChecked: true });
  ok(!/structured data|label the basics/i.test(onlySchema.t) && /No technical faults found/.test(onlySchema.t), 'I2: a site whose only finding is "no schema" reads as no technical fault — nothing invented');
  const badSchema: SiteEvidenceFinding = { kind: 'schema_wrong_domain', severity: 5, certainty: 'certain', tier: 'A', pageUrl: 'https://example.co.uk/', evidence: { observed: ['"url": "https://other-site.co.uk"'], source: 'https://example.co.uk/', subject: 'example.co.uk' } } as never;
  const misleading = report(grid, { siteEvidence: [badSchema], crawlFaults: faults, siteChecked: true });
  ok(/Your business details point at a different website/.test(misleading.t) && /q4-sev--high">High/.test(misleading.html), 'I2: a genuinely misleading schema finding (wrong website in the business details) still appears, as High');
  ok(!/label the basics/.test(misleading.t), 'I2: …while the generic gap stays out beside it');
  /* Every other surface: the full report and the version-1 hook report still print the schema line. */
  const fullRun = { id: 'r1', run_number: 1, status: 'complete', mention_rate: 0, created_at: '2026-10-06T10:00:00Z', results: {} };
  const fullRows = grid.map(([c, g], i) => ({ id: `q${i}`, question: Q[i], status: 'done', result: { chatgpt: cell(c), gemini: cell(g) } }));
  const full = renderReportHtml({ ...(buildReportData(fullRows as never, fullRun as never, { businessName: BIZ, businessType: 'roofer', locationText: TOWN, specialisms: '', isAggregatorUrl: () => false, hasWebsite: true }) as object), generatedAtLabel: '6 October 2026', crawlFaults: faults, siteChecked: true } as never);
  ok(/Your site doesn’t label the basics/.test(text(full)), 'I2: the full report still shows the structured-data line');
  const v1 = { version: 1, planned: [Q[0]], executed: 1, next_index: 1, stop_reason: 'visibility_gap_found', named_in: [], gap: { question_index: 0, question: Q[0], engine: 'gemini', target_named: false, named_instead: ['B Co'], citations: [], named_on_engines: [], answer_excerpt: '' } };
  const v1r = report(grid, { crawlFaults: faults }, v1);
  ok(/Your site doesn’t label the basics/.test(v1r.t), 'I2: an older (version-1) hook report still shows it — only the six-answer report changed');
  const many = report(grid, { crawlFaults: Array.from({ length: 8 }, (_, i) => ({ title: `Issue ${i + 1}`, detail: 'Detail.', minor: false })) });
  ok(/Issue 5/.test(many.t) && !/Issue 6/.test(many.t), 'I: capped at 5 issues');
  const none = report(grid, { hasWebsite: false });
  ok(/You don’t have a website yet, so we’ll build you one\./.test(none.t) && /AI can’t recommend a business it can’t read/.test(none.t), 'I: no website → the approved no-website words');
  const clean = report(grid, { siteChecked: true });
  ok(/No technical faults found/.test(clean.t) && /didn’t find a technical fault stopping AI from reading it/.test(clean.t), 'I: clean crawl → the existing truthful line');
  const unknown = report(grid);
  ok(!/Your website|Website issues/i.test(unknown.t), 'I: no completed crawl → no website section, nothing invented');
}

/* ── J. 6/6: no manufactured miss ────────────────────────────────────────────────────────────── */
{
  const r = report([[hit(['A Co']), hit(['B Co'])], [hit(['A Co']), hit(['B Co'])], [hit(['A Co']), hit(['B Co'])]]);
  ok(/100%/.test(r.t) && /6 of 6 answers named your business/.test(r.t), 'J: 6/6 → 100%');
  ok(r.d.hook!.featured!.question === Q[0] && r.d.hook!.featured!.answers.every((a) => a.named), 'J: 6/6 features the first question, both answers NAMED');
  ok(!/Not named/i.test(r.t) && (r.html.match(/q4-ans-head[^]*?q4-chip--y/g) ?? []).length >= 1, 'J: no "not named" anywhere — no manufactured miss');
  ok(!/didn’t name you|named instead/.test(r.t), 'J: why-this-matters claims no misses and no rivals');
}

/* ── K. The CTA + footer are the existing ones, unchanged ────────────────────────────────────── */
{
  const grid: Array<[Cell, Cell]> = [[miss(['A Co']), miss(['B Co'])], [miss(['A Co']), miss(['B Co'])], [hit(['A Co']), miss(['B Co'])]];
  const c4 = report(grid);
  const v1 = { version: 1, planned: [Q[0]], executed: 1, next_index: 1, stop_reason: 'visibility_gap_found', named_in: [], gap: { question_index: 0, question: Q[0], engine: 'gemini', target_named: false, named_instead: ['B Co'], citations: [], named_on_engines: [], answer_excerpt: '' } };
  const old = report(grid, {}, v1);
  const frag = (h: string) => h.slice(h.indexOf('<section class="cta">'), h.indexOf('</footer>') + 9);
  ok(frag(c4.html).length > 500 && frag(c4.html) === frag(old.html), 'K: the CTA + footer are byte-identical to the existing hook report’s');
  ok(/Want to be one of the names\?/.test(c4.t) && c4.html.includes('Get started &mdash; &pound;99') && c4.t.includes(REMEASURE_CLAIM_SENTENCE.replace(/'/g, '’')), 'K: CTA heading, buttons and the locked guarantee sentence are present');
  ok(c4.html.indexOf('class="q4-why"') < c4.html.indexOf('<section class="cta">'), 'K: why-this-matters comes before the CTA');

  /* ── L. Older / other reports unchanged ── */
  ok(!old.html.includes('q4-head') && old.html.includes('<header class="band">'), 'L: a version-1 hook report keeps the wave band, no Concept 4');
  ok(c4.html.includes('class="q4-head"') && !c4.html.includes('<header class="band">'), 'L: the six-answer report uses the Concept 4 header');
  const measuring = report(grid, { measuring: { runsDone: 0, runsTarget: 1 } });
  ok(!measuring.html.includes('q4-head') && /still measuring/i.test(measuring.t), 'L: a still-measuring six-answer report keeps the measuring page');
  const plainRun = { id: 'r1', run_number: 1, status: 'complete', mention_rate: 0, created_at: '2026-10-06T10:00:00Z', results: {} };
  const plainRows = grid.map(([c, g], i) => ({ id: `q${i}`, question: Q[i], status: 'done', result: { chatgpt: cell(c), gemini: cell(g) } }));
  const plain = renderReportHtml({ ...(buildReportData(plainRows as never, plainRun as never, { businessName: BIZ, businessType: 'roofer', locationText: TOWN, specialisms: '', isAggregatorUrl: () => false, hasWebsite: true }) as object), generatedAtLabel: '6 October 2026' } as never);
  ok(!plain.includes('q4-') && plain.includes('<header class="band">'), 'L: a full (non-hook) report never reaches Concept 4');
}

/* ── M. Highlighting is exact and safe ───────────────────────────────────────────────────────── */
{
  ok(quickHighlight('Try Apex Roofing Contractors today.', ['Apex Roofing Contractors Ltd']) === 'Try <mark class="q4-hl">Apex Roofing Contractors</mark> today.', 'M: a name is matched without its "Ltd"');
  ok(quickHighlight('Apexian roofs are great.', ['Apex']) === 'Apexian roofs are great.', 'M: no match inside a longer word');
  ok(quickHighlight('<b>Bold & Co</b>', ['Bold & Co']).includes('&lt;b&gt;<mark class="q4-hl">Bold &amp; Co</mark>&lt;/b&gt;'), 'M: text is escaped around a highlight');
}

if (failures) throw new Error(`${failures} Concept 4 report checks failed`);
console.log('hook-report-concept4: all checks passed');
