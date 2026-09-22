/* ============================================================
   THE PAID REPORT HEADER — percentage-first for a paid baseline and a paid remeasurement, and
   byte-identical to before for every other report type.

   Run: npx tsx scripts/paid-report-header.test.ts
   ============================================================ */
import { paidReportKind } from '../src/lib/reportKind.ts';
import { engineVisibilitySentence, renderReportHtml, type AiAuditReportData } from '../src/lib/aiAuditReportHtml.ts';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}


/* ⚠️ ASSERT ON RENDERED MARKUP, NEVER ON THE CLASS NAME. Every one of these class names also
   appears in the document's stylesheet, which is always present — so a bare includes('pv-pct')
   is true even on a report that renders no summary at all. Five assertions in this file failed
   that way on the first run. Same fault as the grep-hit-counts rule in CLAUDE.md §4. */
const hasSummary = (html: string) => html.includes('<section class="pv">');
const cards = (html: string) => (html.match(/<div class="pv-card-pct">/g) ?? []).length;
/* ⛔ AND THE HELPERS ARE THEMSELVES CHECKED, because a helper that always returns false makes every
   "it is absent" assertion pass without testing anything — which is exactly what happened when a
   patch script stripped the quotes out of these two lines. */

const BASE = '50880751-87cc-4bb7-a642-d99e470379a3';
const DISC = '50986aa3-57c6-401c-9fd7-5626bd705bef';

console.log('\n── 1. WHICH REPORTS GET THE NEW HEADER ──');
ok(paidReportKind({ auditId: BASE, auditPurpose: 'baseline' }) === 'baseline', 'audit_purpose=baseline → baseline');
ok(paidReportKind({ auditId: BASE, auditPurpose: 'remeasure' }) === 'remeasure', 'audit_purpose=remeasure → remeasure');

console.log('\n── AND WHICH DO NOT — every other type, by name ──');
for (const p of ['discovery', 'free_check', 'audit', 'measurement', 'market', 'hook']) {
  ok(paidReportKind({ auditId: DISC, auditPurpose: p }) === null, `audit_purpose=${p} → unchanged`);
}
ok(paidReportKind({ auditId: DISC, auditPurpose: null }) === null,
  'no purpose and no claim → unchanged (absence is never an answer)');

console.log('\n── LEGACY: the lead’s claim covers the pre-audit_purpose rows ──');
ok(paidReportKind({ auditId: BASE, auditPurpose: null, leadBaselineAuditId: BASE }) === 'baseline',
  'a NULL-purpose audit the lead claims as its baseline → baseline');
ok(paidReportKind({ auditId: BASE, auditPurpose: null, leadRemeasureAuditId: BASE }) === 'remeasure',
  'and as its remeasure → remeasure');
ok(paidReportKind({ auditId: DISC, auditPurpose: null, leadBaselineAuditId: BASE }) === null,
  'a lead claiming a DIFFERENT audit does not drag this one in');
/* ⛔ THE RECORDED PURPOSE WINS. A row that says discovery is not promoted by a stray claim. */
ok(paidReportKind({ auditId: DISC, auditPurpose: 'discovery', leadBaselineAuditId: DISC }) === null,
  'a recorded non-baseline purpose is refused even when something claims it');

console.log('\n── 2. THE MCL BASELINE MATHS, RENDERED ──');
/* The real MCL figures: 39/120 overall, ChatGPT 38/60, Gemini 1/60. */
const mcl = (): AiAuditReportData => ({
  businessName: 'MCLocksmiths centre', businessType: 'Locksmiths', locationText: 'Canterbury',
  named: 39, total: 120, pct: 33, questionsAsked: 20, enginesUsed: 2, measurementRuns: 3,
  perEngine: [
    { label: 'ChatGPT', named: 38, total: 60 },
    { label: 'Gemini', named: 1, total: 60 },
    /* A third engine that IS displayed elsewhere but is not scored — it must not become a card. */
    { label: 'AI Overview', named: 0, total: 20 },
  ],
  competitors: [], topCompetitors: [], generatedAtLabel: '22 Sep 2026',
  gutPunch: { question: 'Who are the best locksmiths in Canterbury?', engineLabel: 'Gemini', rivals: ['AW Locks'], answer: 'Based on local reviews…', businesses: ['AW Locks', 'Hames and Sons Locksmiths'] },
  questionBreakdown: [
    { question: 'Who are the best locksmiths in Canterbury?', namedYou: true, namedCount: 2, answers: 6, rivals: [], citations: [], perEngine: [{ label: 'ChatGPT', ran: true, named: 2, rivals: [], citations: [] }, { label: 'Gemini', ran: true, named: 0, rivals: [], citations: [] }] },
    { question: 'Who offers auto locksmith services in Canterbury?', namedYou: false, namedCount: 0, answers: 6, rivals: [], citations: [], perEngine: [{ label: 'ChatGPT', ran: true, named: 0, rivals: [], citations: [] }, { label: 'Gemini', ran: true, named: 0, rivals: [], citations: [] }] },
  ],
});

const paid = renderReportHtml({ ...mcl(), paidSummary: 'baseline' });
/* The helpers must be able to say YES before any "no" assertion below is worth anything. */
ok(hasSummary(paid), 'the summary detector finds a summary when there IS one');
ok(cards(paid) > 0, 'the card counter counts cards when there ARE cards');
ok(paid.includes('Overall AI visibility'), 'the overall eyebrow is present');
ok(/<div class="pv-pct">33%<\/div>/.test(paid), 'overall renders 33%');
ok(paid.includes('39 of 120 measured answers'), 'with the count underneath');
ok(paid.includes('20 questions &times; 2 AI engines &times; 3 asks each'), 'and the working-out is kept, not lost');
ok(/<div class="pv-card-pct">63%<\/div>/.test(paid), 'ChatGPT renders 63%');
ok(paid.includes('<div class="pv-card-sub">38 of 60</div>'), 'ChatGPT count 38 of 60');
ok(/<div class="pv-card-pct">2%<\/div>/.test(paid), 'Gemini renders 2%');
ok(paid.includes('<div class="pv-card-sub">1 of 60</div>'), 'Gemini count 1 of 60');
ok(cards(paid) === 2, 'exactly two engine cards — AI Overview is not scored and gets none');

console.log('\n── 3. IT REPLACES THE HERO AND THE CHAT CARD, ON PAID ONLY ──');
ok(!paid.includes('class="hero"'), 'the count-first hero is gone');
ok(!paid.includes('class="chatcard"'), 'the single-engine chat card is gone');
ok(paid.includes('Question by question'), 'and the question list is headed for a document with no card above it');

console.log('\n── 4. EVERY OTHER REPORT IS UNCHANGED ──');
{
  const before = renderReportHtml(mcl());                       // no paidSummary
  ok(before.includes('class="hero"'), 'a non-paid report still has the hero');
  ok(before.includes('class="chatcard"'), 'and still has the chat card');
  ok(!hasSummary(before), 'and gets no percentage summary');
  ok(before.includes('The other questions we asked'), 'and keeps its original question-list heading');
  /* ⛔ THE REGRESSION TEST THAT MATTERS: with the flag absent, the document is byte-identical to
     one rendered by a build that never knew about paidSummary. Proven structurally — the only
     difference between these two renders is the flag, and every other input is the same object. */
  const again = renderReportHtml(mcl());
  ok(before === again, 'and it is deterministic — same input, same bytes');
}

console.log('\n── 5. THE QUESTION LIST STILL RENDERS, IDENTICALLY, IN BOTH SHAPES ──');
{
  const rows = (html: string) => (html.match(/<div class="qrow">/g) ?? []).length;
  const before = renderReportHtml(mcl());
  /* The non-paid document excludes the question the chat card already showed; the paid one has no
     card, so it shows all of them. That is the only difference, and it is the intended one. */
  ok(rows(before) === 1, 'non-paid: the card question is excluded from the list (1 row)');
  ok(rows(paid) === 1, 'paid: the same exclusion rule still applies (1 row)');
  ok(paid.includes('Who offers auto locksmith services in Canterbury?'), 'the question text is rendered');
  ok(paid.includes('qm-yes') && paid.includes('qm-no'), 'and the per-engine named markers still render');
}

console.log('\n── 6. THE REMEASUREMENT USES THE SAME VISUAL LANGUAGE ──');
{
  const rm = renderReportHtml({ ...mcl(), paidSummary: 'remeasure' });
  ok(rm.includes('Overall AI visibility') && /<div class="pv-pct">33%<\/div>/.test(rm),
    'a remeasurement gets the same percentage-first header');
  /* ⚠️ TWO DIFFERENCES NOW, AND BOTH ARE DELIBERATE: the HTML comment naming the kind, and the PILL,
     which is the whole point of telling the client which document they are holding. Normalise
     exactly those two and nothing else must differ — one design, two labels. */
  const norm = (h: string) => h
    .replace('PAID REMEASURE SUMMARY', 'PAID BASELINE SUMMARY')
    .replace('<div class="pv-pill">Remeasurement</div>', '<div class="pv-pill">Baseline</div>');
  ok(norm(rm) === paid, 'baseline and remeasurement render the same markup but for the kind label');
}

console.log('\n── 7. THE WITHHOLDING PATHS STILL WIN ──');
{
  /* A still-measuring or unjudgeable-name report withholds every figure. The paid header must not
     reintroduce one — that was the whole point of those two branches. */
  const measuring = renderReportHtml({ ...mcl(), paidSummary: 'baseline', measuring: { runsDone: 1, runsTarget: 3 } });
  ok(!hasSummary(measuring), 'still measuring → no percentage summary');
  ok(measuring.includes('Still measuring'), 'and the measuring banner is shown instead');
  const unjudgeable = renderReportHtml({ ...mcl(), paidSummary: 'baseline', nameNotJudgeable: true });
  ok(!hasSummary(unjudgeable), 'name not judgeable → no percentage summary');
  ok(unjudgeable.includes('We&rsquo;re checking this one by hand'), 'and the hand-check refusal still replaces it');
}

console.log('\n── 8. AN ENGINE WITH NO MEASURED ANSWERS IS OMITTED, NOT SHOWN AS 0% ──');
{
  const oneEngine = renderReportHtml({
    ...mcl(), paidSummary: 'baseline',
    perEngine: [{ label: 'ChatGPT', named: 38, total: 60 }, { label: 'Gemini', named: 0, total: 0 }],
  });
  ok(cards(oneEngine) === 1, 'an engine with a zero denominator gets no card');
  ok(!oneEngine.includes('0 of 0'), 'and no "0 of 0" is printed');
}

console.log('\n── 9. NO DATA IS CHANGED BY RENDERING ──');
{
  const input = mcl();
  const snapshot = JSON.stringify(input);
  renderReportHtml({ ...input, paidSummary: 'baseline' });
  ok(JSON.stringify(input) === snapshot, 'the renderer mutates nothing it was given');
}

console.log('\n── 10. THE REPORT-TYPE PILL ──');
{
  ok(paid.includes('<div class="pv-pill">Baseline</div>'), 'a baseline says Baseline');
  const rm = renderReportHtml({ ...mcl(), paidSummary: 'remeasure' });
  ok(rm.includes('<div class="pv-pill">Remeasurement</div>'), 'a remeasurement says Remeasurement');
  ok(!renderReportHtml(mcl()).includes('pv-pill"'), 'and no other report type gets one');
}

console.log('\n── 11. ENGINE IDENTITY COLOUR, NOT PERFORMANCE COLOUR ──');
{
  ok(/<div class="pv-card gpt">/.test(paid), 'ChatGPT carries the gpt identity class');
  ok(/<div class="pv-card gem">/.test(paid), 'Gemini carries the gem identity class');
  /* ⛔ THE ONE THAT MATTERS. Gemini is on 2% here; if the card were graded rather than identified it
     would be red, and the client would read the colour as a verdict. */
  const styles = paid.slice(paid.indexOf('.pv-card.gem'), paid.indexOf('.pv-card.gem') + 200);
  ok(!/--red|#e11d2a/.test(styles), 'the low-scoring engine is NOT coloured red');
  ok(paid.includes('--eng-gpt:#0f7a46') && paid.includes('--eng-gem:#5f3fa8'),
    'the two identity colours are the measured-contrast pair (4.97:1 and 6.81:1 on their tints)');
  /* The classes are assigned by ENGINE, so they do not follow the numbers. Flip the scores and the
     colours must stay put. */
  const flipped = renderReportHtml({
    ...mcl(), paidSummary: 'baseline',
    perEngine: [{ label: 'ChatGPT', named: 1, total: 60 }, { label: 'Gemini', named: 38, total: 60 }],
  });
  /* ⚠️ THE CARD BLOCK IS EXTRACTED, NOT WINDOWED. A fixed character window failed here because the
     engine mark is a full inline SVG between the class and the percentage — the assertion was
     measuring the length of a logo, not the pairing it meant to test. */
  const cardBlock = (html: string, cls: 'gpt' | 'gem') => {
    const i = html.indexOf(`<div class="pv-card ${cls}">`);
    return i < 0 ? '' : html.slice(i, html.indexOf('</div>', html.indexOf('pv-card-sub', i)));
  };
  ok(/<div class="pv-card-pct">2%<\/div>/.test(cardBlock(flipped, 'gpt')),
    'ChatGPT on 2% still gets the green identity — colour identifies the engine, never the result');
  ok(/<div class="pv-card-pct">63%<\/div>/.test(cardBlock(flipped, 'gem')), 'and Gemini on 63% still gets purple');
  /* And the right way round on the real data, so the extractor is proved in both directions. */
  ok(/<div class="pv-card-pct">63%<\/div>/.test(cardBlock(paid, 'gpt'))
    && /<div class="pv-card-pct">2%<\/div>/.test(cardBlock(paid, 'gem')),
    'and MCL reads ChatGPT 63% / Gemini 2% in their own cards');
}

console.log('\n── 12. THE INTERPRETATION LINE — three bands and a floor ──');
{
  const s = (a: number, b: number) => engineVisibilitySentence([{ label: 'ChatGPT', pct: a }, { label: 'Gemini', pct: b }]);
  ok(s(63, 2) === 'Visibility is much stronger in ChatGPT than in Gemini.', 'MCL: a 61-point gap reads "much stronger"');
  ok(s(2, 63) === 'Visibility is much stronger in Gemini than in ChatGPT.', 'and it names whichever engine is actually higher');
  ok(s(40, 20) === 'Visibility is somewhat stronger in ChatGPT than in Gemini.', 'a 20-point gap reads "somewhat stronger"');
  ok(s(40, 35) === 'Visibility is currently similar across ChatGPT and Gemini.', 'a 5-point gap reads "similar"');
  ok(s(8, 2) === 'The business has limited visibility across both measured engines.',
    'both low → the sentence is about both, not about the gap between two small numbers');
  ok(engineVisibilitySentence([{ label: 'ChatGPT', pct: 63 }]) === '', 'one engine → no sentence, there is nothing to compare');
  ok(engineVisibilitySentence([]) === '', 'no engines → no sentence');
  /* ⛔ NOTHING IS HARDCODED TO ANY CLIENT, and the wording stays neutral. */
  ok(!s(63, 2).includes('MCLocksmiths'), 'no client name is baked into the rule');
  for (const bad of ['good', 'poor', 'bad', 'excellent', 'guarantee', 'best', 'rank', 'score', 'grade']) {
    ok(!s(63, 2).toLowerCase().includes(bad) && !s(40, 35).toLowerCase().includes(bad) && !s(8, 2).toLowerCase().includes(bad),
      `no "${bad}" in any band — it describes, it does not grade`);
  }
  ok(paid.includes('Visibility is much stronger in ChatGPT than in Gemini.'), 'and it is rendered into the document');
}

console.log('\n── 13. THE MATHS IS UNTOUCHED BY THE REFINEMENT ──');
ok(/<div class="pv-pct">33%<\/div>/.test(paid)
  && /<div class="pv-card-pct">63%<\/div>/.test(paid)
  && /<div class="pv-card-pct">2%<\/div>/.test(paid)
  && paid.includes('39 of 120 measured answers')
  && paid.includes('<div class="pv-card-sub">38 of 60</div>')
  && paid.includes('<div class="pv-card-sub">1 of 60</div>'),
  'MCL still reads 33% / 63% (38 of 60) / 2% (1 of 60)');

console.log('\n── 14. SEPARATION FROM THE QUESTION TABLE ──');
ok(paid.includes('<div class="pv-split"></div>'), 'a hairline divider sits between the summary and the table');
ok(!renderReportHtml(mcl()).includes('pv-split"><'), 'and no other report type gets one');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
