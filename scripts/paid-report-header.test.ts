/* ============================================================
   THE PAID REPORT HEADER — percentage-first for a paid baseline and a paid remeasurement, and
   byte-identical to before for every other report type.

   Run: npx tsx scripts/paid-report-header.test.ts
   ============================================================ */
import { paidReportKind } from '../src/lib/reportKind.ts';
import { renderReportHtml, type AiAuditReportData } from '../src/lib/aiAuditReportHtml.ts';

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
  /* Identical but for the HTML comment naming which kind it is — no second design to maintain. */
  ok(rm.replace('PAID REMEASURE SUMMARY', 'PAID BASELINE SUMMARY') === paid,
    'baseline and remeasurement render the same markup, byte for byte');
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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
