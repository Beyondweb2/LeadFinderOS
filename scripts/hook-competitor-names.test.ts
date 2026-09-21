/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HOOK REPORT COMPETITOR NAMES — the real production failure, exercised end to end (2026-09-21).

   Live-verified on findable.live/r/z8q2ty (Inclusive Driving, audit 5675df27-e947-4d18-86d3-
   ad41325f71e5): the stored Gemini answer clearly names four driving schools, extract-competitors
   (the canonical LLM extractor) HAD ALREADY run and correctly extracted all four into
   `ai_audit_queue.result.gemini.competitors` / `ai_audit_runs.results.questions[0].engines.gemini.
   competitors` — yet the report showed "Other businesses were suggested." with no names at all.

   ROOT CAUSE: `evaluateHookQuestion` (hookAudit.ts) captures `named_instead` from `cell.competitors`
   at the moment a question settles — but `cell.competitors` is unconditionally `[]` at that point
   (`_shared/enrichment/ai-search.ts`'s `normalizeEngineBlock`: "ALWAYS EMPTY AT SCAN TIME").
   `extract-competitors` only runs LATER, at the run's transition to terminal, in
   `process-ai-audit-queue/index.ts` — structurally AFTER the hook step has already evaluated and
   persisted its gap. So `results.hook.gap.named_instead` is a permanent, empty snapshot for every
   hook gap that has ever existed. The fix (hookAudit.ts's `buildHookReportSummary`) no longer reads
   that frozen field — it reads the SAME rows the report already re-fetches live at render time
   (long after extraction has completed) and pulls the gap's own question+engine cell's
   `competitors`, which by then holds the real, already-cleaned, canonical extraction.

   The fixtures below use the REAL stored answer text and the REAL extract-competitors output for
   this exact audit, verbatim — not a synthetic injection of namedInstead — so this specific
   production failure (frozen-empty gap.named_instead vs. populated row.competitors) cannot recur
   while these tests still pass. */
import { buildHookReportSummary, hookReportCopy, type HookState } from '../src/lib/hookAudit.ts';
import { esc, renderHookSection } from '../src/lib/aiAuditReportHtml.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const ENGINES = ['chatgpt', 'gemini'] as const;
const label = (e: string) => e === 'chatgpt' ? 'ChatGPT' : e === 'gemini' ? 'Gemini' : e;
const QUESTION = 'who is the best driving instructor for nervous drivers in Wolverhampton UK';

// The REAL stored Gemini answer_text for ai_audit_queue row 7a73be23-…649 (audit 5675df27-…, live
// 2026-09-21), verbatim — map-formatted, with image asset URLs, star ratings, category labels and
// opening-hours fragments woven through the real business names.
const REAL_GEMINI_ANSWER = `When looking for the best driving instruction tailored for nervous drivers in Wolverhampton, several highly rated local options stand out for their patient, calm, and structured approaches:

![](https://maps.gstatic.com/tactile/pane/default_geocode-1x.png)

AUTOMATIC DRIVING SCHOOL J10- WOLVERHAMPTON

5.0 stars rating 5.0 ![](https://www.gstatic.com/gemini/maps/star.png)

📍 Educational institution

Open · Closes 10:00 PM

AUTOMATIC DRIVING SCHOOL J10- WOLVERHAMPTON Click to open side panel for more information is a top-rated choice for learners seeking automatic instruction and specialized support for anxious drivers.

![](https://maps.gstatic.com/tactile/pane/default_geocode-1x.png)

SFD Driving School (Salaria Friends Driving School)

5.0 stars rating 5.0 ![](https://www.gstatic.com/gemini/maps/star.png)

📍 Educational institution

Open · Closes 8:00 PM

![](https://maps.gstatic.com/tactile/pane/default_geocode-1x.png)

Tonys Driver Training

4.9 stars rating 4.9 ![](https://www.gstatic.com/gemini/maps/star.png)

📍 Educational institution

Open · Closes 6:00 PM

![](https://maps.gstatic.com/tactile/pane/default_geocode-1x.png)

Dawns Driving School

5.0 stars rating 5.0 ![](https://www.gstatic.com/gemini/maps/star.png)

📍 Educational institution

Dawns Driving School (located in Penn, Wolverhampton) provides highly personalized instruction.`;

// The REAL extract-competitors output for this exact row (cleaning_stamp: complete, gpt-4o,
// 2026-09-21T10:46:14.386Z) — already canonical: no URLs, no ratings, no category labels, no hours.
const REAL_EXTRACTED_COMPETITORS = [
  'AUTOMATIC DRIVING SCHOOL J10- WOLVERHAMPTON',
  'SFD Driving School (Salaria Friends Driving School)',
  'Tonys Driver Training',
  'Dawns Driving School',
];

/** A hook state whose gap.named_instead is EMPTY — the real, permanently-frozen production shape
 *  (never a stand-in for "no competitors exist"; see the file header). */
function realGapState(): HookState {
  return {
    version: 1,
    planned: [QUESTION],
    next_index: 1,
    executed: 1,
    stop_reason: 'visibility_gap_found',
    gap: {
      question_index: 0, question: QUESTION, engine: 'gemini', target_named: false,
      named_instead: [], // ← the real, always-empty frozen snapshot
      citations: [], named_on_engines: [],
      answer_excerpt: REAL_GEMINI_ANSWER.slice(0, 600),
    },
    named_in: [],
  };
}

/** The rows as the REPORT reads them at render time — i.e. AFTER extract-competitors has already
 *  run, exactly like the live z8q2ty audit today. This is the canonical extraction's real output,
 *  not a hand-picked namedInstead override. */
function realRows(competitors: string[]) {
  return [{
    question: QUESTION, status: 'done',
    result: { gemini: { named: false, answer_text: REAL_GEMINI_ANSWER, competitors, citations: [] } },
  }];
}

const buildAndRender = (competitors: string[]) => {
  const summary = buildHookReportSummary({
    state: realGapState(), rows: realRows(competitors),
    engineOrder: ENGINES, engineLabel: label,
    namedInstead: (c) => c.filter((n) => n.trim()).slice(0, 5), // same shape as auditReport.ts's caller
  });
  return renderHookSection(summary!, 'Inclusive Driving');
};

console.log('── 1/2: a real stored answer with named businesses, extracted the canonical way, surfaces them ──');
{
  const html = buildAndRender(REAL_EXTRACTED_COMPETITORS);
  ok(html.includes('AUTOMATIC DRIVING SCHOOL J10- WOLVERHAMPTON'), '1: the first real competitor name is surfaced');
  ok(html.includes('SFD Driving School (Salaria Friends Driving School)'), '1: a second real competitor name is surfaced');
  ok(html.includes('Tonys Driver Training') && html.includes('Dawns Driving School'), '1: the remaining real competitor names are surfaced');
  ok(!html.includes('Other businesses were suggested.'), '2: the map-formatted answer no longer falls back to the empty-sounding fallback');
  ok((html.match(/<li>/g) ?? []).length === 4, '2: exactly the four real names render as list items, from a genuinely map-formatted answer');
}

console.log('── 3: junk map/image URLs are excluded ──');
{
  const html = buildAndRender(REAL_EXTRACTED_COMPETITORS);
  ok(!html.includes('maps.gstatic.com') && !html.includes('gstatic.com/gemini/maps/star.png'), '3: no image/map asset URLs leak into the rendered list');
  const listContent = (html.match(/<ol class="cc-list">.*?<\/ol>/s) ?? [''])[0];
  ok(!/https?:\/\//.test(listContent), '3: no bare URL appears inside the competitor list itself');
}

console.log('── 4: ratings/opening-hours/category fragments are excluded ──');
{
  const html = buildAndRender(REAL_EXTRACTED_COMPETITORS);
  ok(!html.includes('5.0 stars') && !html.includes('4.9 stars'), '4: star ratings are not rendered as if they were business names');
  ok(!html.includes('Closes 10:00 PM') && !html.includes('Closes 8:00 PM'), '4: opening-hours fragments are excluded');
  ok(!html.includes('Educational institution'), '4: the generic category label is excluded');
}

console.log('── 5: at most 5 competitors are shown, even if more were extracted ──');
{
  const many = ['A Driving School', 'B School', 'C School', 'D School', 'E School', 'F School', 'G School'];
  const html = buildAndRender(many);
  ok((html.match(/<li>/g) ?? []).length <= 5, '5: the visible list never exceeds 5 entries');
}

console.log('── 6: duplicates are removed case-insensitively ──');
{
  const html = buildAndRender(['Tonys Driver Training', 'tonys driver training ', 'Dawns Driving School']);
  ok((html.match(/<li>/g) ?? []).length === 2, '6: a case/whitespace duplicate collapses to one entry');
}

console.log('── 7: no fake "Other businesses were suggested." fallback anywhere ──');
{
  ok(!buildAndRender(REAL_EXTRACTED_COMPETITORS).includes('Other businesses were suggested.'), '7: the old fabricated-sounding line never appears when real names exist');
}

console.log('── 8: when extraction genuinely found nothing, no name is invented ──');
{
  const html = buildAndRender([]);
  ok(!(html.match(/<li>/g) ?? []).length, '8: no competitor <li> entries when nothing was extracted');
  ok(!html.includes('AI named'), '8: the "AI named" block is omitted rather than filled with a guess');
  ok(html.includes('class="cc-callout"') && html.includes(esc('Inclusive Driving') + ' wasn&rsquo;t named.'), '8: the truthful red not-named line still renders');
}

console.log('── 9/10/11: the non-overstated verdict headline by which question the gap was on (2026-09-21) ──');
{
  // A Q1 miss earns the stronger, still-truthful "for this search yet" — there is no earlier
  // success to be inconsistent with. A Q2/Q3 miss (the business WAS named earlier) never
  // overstates to "AI never recommends you" — it says "consistently" instead.
  const s1 = buildHookReportSummary({
    state: realGapState(), rows: realRows(REAL_EXTRACTED_COMPETITORS),
    engineOrder: ENGINES, engineLabel: label, namedInstead: (c) => c,
  })!;
  ok(hookReportCopy(s1, 'Inclusive Driving').headline === "AI isn't recommending you for this search yet.", '9: a Q1 (first search) gap renders the "for this search yet" verdict');
  const gapOnQ2: HookState = { ...realGapState(), executed: 2, gap: { ...realGapState().gap!, question_index: 1 } };
  const s2 = buildHookReportSummary({ state: gapOnQ2, rows: realRows(REAL_EXTRACTED_COMPETITORS), engineOrder: ENGINES, engineLabel: label, namedInstead: (c) => c })!;
  ok(hookReportCopy(s2, 'Inclusive Driving').headline === "AI isn't recommending you consistently yet.", '10: a Q2 gap renders the non-overstated "consistently yet" verdict, never "never"');
  const gapOnQ3: HookState = { ...realGapState(), executed: 3, gap: { ...realGapState().gap!, question_index: 2 } };
  const s3 = buildHookReportSummary({ state: gapOnQ3, rows: realRows(REAL_EXTRACTED_COMPETITORS), engineOrder: ENGINES, engineLabel: label, namedInstead: (c) => c })!;
  ok(hookReportCopy(s3, 'Inclusive Driving').headline === "AI isn't recommending you consistently yet.", '11: a Q3 gap renders the same non-overstated "consistently yet" verdict');
}

console.log('── 12: the old awkward "1 of up to 3 search tested" wording is gone everywhere ──');
{
  const html = buildAndRender(REAL_EXTRACTED_COMPETITORS);
  ok(!html.includes('of up to') && !html.includes('search tested') && !html.includes('searches tested'), '12: "of up to" / "search(es) tested" never appears in the rendered hook section');
  ok(!/\d+ of up to \d+/.test(html), '12: the "N of up to M" pattern never appears anywhere in the rendered hook section');
}

if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
