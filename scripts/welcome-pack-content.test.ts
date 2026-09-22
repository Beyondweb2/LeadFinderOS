/* ============================================================
   WELCOME PACK CONTENT — the document a paying client actually opens: their own verified details,
   their real baseline result in plain language, what happens next, and no promise anybody can break.

   Run: npx tsx scripts/welcome-pack-content.test.ts
   ============================================================ */
import { buildWelcomePackHtml } from '../src/lib/welcomePackHtml.ts';
import { buildBaselineSummary, visibilitySignals } from '../src/lib/baselineSummary.ts';
import type { AiAuditReportData } from '../src/lib/aiAuditReportHtml.ts';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const report: AiAuditReportData = {
  businessName: 'MCLocksmiths centre', businessType: 'locksmiths', locationText: 'Peterborough',
  named: 14, total: 120, pct: 12, questionsAsked: 20, enginesUsed: 2, measurementRuns: 3,
  perEngine: [
    { label: 'ChatGPT', named: 11, total: 60 },
    { label: 'Gemini', named: 3, total: 60 },
    { label: 'AI Overview', named: 0, total: 20 },
  ],
  competitors: [], topCompetitors: [], gutPunch: null, generatedAtLabel: '22 Sep 2026',
  questionBreakdown: [
    { question: 'emergency locksmith Peterborough', namedYou: true, namedCount: 6, answers: 6, rivals: [],
      citations: [{ domain: 'mc-locksmiths.com', url: 'https://mc-locksmiths.com/emergency' }],
      perEngine: [
        { label: 'ChatGPT', ran: true, named: 3, rivals: [], citations: [] },
        { label: 'Gemini', ran: true, named: 3, rivals: [], citations: [] },
      ] },
    { question: 'car key replacement Peterborough', namedYou: false, namedCount: 0, answers: 6, rivals: [],
      citations: [], perEngine: [
        { label: 'ChatGPT', ran: true, named: 0, rivals: [], citations: [] },
        { label: 'Gemini', ran: true, named: 0, rivals: [], citations: [] },
      ] },
    { question: 'uPVC door lock repair Peterborough', namedYou: true, namedCount: 2, answers: 6, rivals: [],
      citations: [], perEngine: [
        { label: 'ChatGPT', ran: true, named: 2, rivals: [], citations: [] },
        { label: 'Gemini', ran: true, named: 0, rivals: [], citations: [] },
      ] },
  ],
};

const summary = buildBaselineSummary(report, '2026-09-22T03:24:58.072Z');

console.log('\n── THE SUMMARY IS DERIVED CORRECTLY FROM THE REPORT ──');
ok(summary.named === 14 && summary.total === 120, 'it carries the report’s own overall figures');
ok(summary.perEngine.length === 2, 'SCORED engines only — AI Overview is not folded into the score');
ok(summary.perEngine.map((e) => e.label).join(',') === 'ChatGPT,Gemini', 'ChatGPT and Gemini, in that order');
ok(summary.strong.length === 1, 'one question named on every ask');
ok(summary.fragile.length === 1, 'one question named on some asks and not others');
ok(summary.oneEngine.length === 1, 'one question named by a single scored engine');
ok(summary.absent.length === 1, 'one question never named');
/* en-GB short month is "Sept" in Node's ICU; the assertion is on the DAY and YEAR being the
   measurement's, in UTC, not on the locale's abbreviation. */
ok(/^22 Sep\w* 2026$/.test(summary.completedLabel), `the MEASURED date, not the render date (got ${summary.completedLabel})`);

console.log('\n── VISIBILITY SIGNALS ARE THE CLIENT’S OWN HOST, NOT EVERY CITATION ──');
ok(visibilitySignals(report, 'https://mc-locksmiths.com/').length === 1, 'their own cited page is found');
ok(visibilitySignals(report, '').length === 0, 'no website on file → no do-not-break list invented');
ok(visibilitySignals(report, 'https://someone-else.co.uk').length === 0, 'another host’s citations are not claimed');

const html = buildWelcomePackHtml({
  businessName: 'MCLocksmiths centre',
  reviewLink: '',
  report: { ...report },
  facts: {
    website: 'https://mc-locksmiths.com/', primaryLocation: 'Peterborough', category: 'Locksmith',
    services: ['emergency entry', 'uPVC door locks'], areas: ['Peterborough', 'Whittlesey'],
    contactName: 'Mark', email: 'mark@mc-locksmiths.com', phone: '01733 000000',
  },
  baseline: summary,
});

console.log('\n── THE DOCUMENT CARRIES THE CLIENT’S VERIFIED DETAILS ──');
for (const needle of [
  'MCLocksmiths centre', 'mc-locksmiths.com', 'Peterborough', 'Locksmith',
  'emergency entry, uPVC door locks', 'Peterborough, Whittlesey', 'Mark', '01733 000000',
]) ok(html.includes(needle), `the pack prints "${needle}"`);

console.log('\n── AND THE BASELINE RESULT, IN PLAIN LANGUAGE ──');
ok(html.includes('14 of 120'), 'the overall naming result');
ok(html.includes('ChatGPT named you in 11 of 60 answers'), 'the ChatGPT result');
ok(html.includes('Gemini named you in 3 of 60 answers'), 'the Gemini result');
ok(html.includes('22 Sep 2026'), 'the baseline date');
ok(/20<\/div><div class="wp-statlab">Questions/.test(html.replace(/\s+/g, '')) || html.includes('20 questions') || html.includes('>20<'),
  'the approved question count');
ok(html.includes('asked 3 times'), 'the run count');
ok(/frozen/i.test(html), 'it says the questions are frozen');
ok(html.includes('four weeks'), 'it explains the four-week remeasurement');
ok(/same frozen questions, the same AI tools, the same method/.test(html), 'same questions, engines and method');

console.log('\n── NO OPERATOR VOCABULARY, NO PROMISE ANYBODY CAN BREAK ──');
/* The operator words for the same facts. If one appears, the client is reading our internal
   language, which is the thing this page exists to translate. */
for (const word of ['fragile', 'one-engine', 'absent question', 'audit_purpose']) {
  ok(!new RegExp(word, 'i').test(html), `the pack never says "${word}"`);
}
/* ⚠️ "winnability" IS present in the document — in a CSS comment inside the report's own stylesheet,
   which this pack lifts verbatim (and which every client report at /r/<code> has always carried).
   That is not a data leak, so the check is on the RENDERED CHIP, which is what would actually show
   an operator verdict to a customer. */
ok(!/class="[^"]*qb-win\b/.test(html), 'the internal winnability chip is not rendered');
ok(!/<div class="qb-win/.test(html), 'and no winnability block reaches the client document');
ok(/AI answers are not fixed/.test(html), 'it says AI answers vary between runs');
ok(/nobody can do is guarantee/.test(html), 'it says a recommendation cannot be guaranteed');
ok(!/guaranteed (recommendation|citation)|we will get you recommended|#1 in AI/i.test(html),
  'and promises neither a recommendation nor a citation');

console.log('\n── STRUCTURE ──');
ok((html.match(/<title>/g) ?? []).length === 1, 'exactly one <title>');
ok(html.includes('What we have on file'), 'the contents list names the details page');
ok(html.includes('Where you stand today'), 'and the baseline page');
{
  /* The legacy shape — a report and nothing else — still renders, and then does NOT promise the
     two new sections in its contents. */
  const legacy = buildWelcomePackHtml({ businessName: 'MCLocksmiths centre', reviewLink: '', report: { ...report } });
  ok(!legacy.includes('What we have on file'), 'without facts, the contents does not list a page that is absent');
  ok(!legacy.includes('Where you stand today'), 'without a baseline, likewise');
  ok(legacy.includes('Your plan'), 'and the original pages are untouched');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
