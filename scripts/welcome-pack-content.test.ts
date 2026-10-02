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
{
  /* 🔴 THE REAL BASELINE PRODUCED THESE. Engines return their own attribution on the URLs they
     cite, so the homepage arrived as "…/?utm_source=chatgpt.com" and the same page cited by two
     engines arrived as two entries. A rebuild agent would read those as distinct pages to preserve. */
  const tracked: AiAuditReportData = {
    ...report,
    questionBreakdown: [
      { question: 'a', namedYou: true, namedCount: 1, answers: 1, rivals: [],
        citations: [{ domain: 'mc-locksmiths.com', url: 'https://www.mc-locksmiths.com/?utm_source=chatgpt.com' }], perEngine: [] },
      { question: 'b', namedYou: true, namedCount: 1, answers: 1, rivals: [],
        citations: [{ domain: 'mc-locksmiths.com', url: 'https://mc-locksmiths.com/' }], perEngine: [] },
      { question: 'c', namedYou: false, namedCount: 0, answers: 1, rivals: [],
        citations: [{ domain: 'mc-locksmiths.com', url: 'https://mc-locksmiths.com/locations/dover?utm_source=chatgpt.com&page=2' }], perEngine: [] },
    ],
  };
  const sig = visibilitySignals(tracked, 'https://mc-locksmiths.com/');
  ok(sig.length === 2, `tracking params are stripped and the homepage collapses to one entry (got ${sig.length})`);
  ok(sig.some((s) => s.url === 'https://mc-locksmiths.com' && s.questions.length === 2),
    'the two homepage citations become one URL carrying both questions');
  ok(sig.some((s) => s.url === 'https://mc-locksmiths.com/locations/dover?page=2'),
    'a LOAD-BEARING query parameter survives while the tracking one does not');
}

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

console.log('\n── THE CLIENT’S OWN TERMS AND SCHEDULE (Paul, 2026-10-02) ──');
{
  const text = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
  const base = { businessName: 'MCLocksmiths centre', reviewLink: '', report: { ...report }, baseline: summary };
  /* RG: £19.99, no route, re-measure pinned 56 days after the baseline day. */
  const rg = text(buildWelcomePackHtml({ ...base, amountPaid: 19.99, totalPayments: null, remeasureDueDate: '2026-11-17' }));
  ok(!/£\s?99/.test(rg), 'an older client is shown no £99 anywhere (guarantee or payments)');
  ok(rg.includes('Your agreed payment schedule continues under the terms you signed up to.'), 'and gets the neutral payments line');
  ok(rg.includes('Your money-back guarantee applies on the terms you signed up to.'), 'and a neutral guarantee line');
  ok(rg.includes('Eight weeks after your starting point, due 17 Nov 2026') && rg.includes('At eight weeks'), 'a 56-day record reads eight weeks, with its date');
  ok(!/At four weeks/.test(rg), 'and never four');
  /* A £99 client from before routes: still not provably today's offer. */
  const pre = text(buildWelcomePackHtml({ ...base, amountPaid: 99, totalPayments: null }));
  ok(!/£\s?99 a month/.test(pre) && pre.includes('terms you signed up to'), 'a £99 payment with no recorded route is not assumed to be today’s offer');
  ok(pre.includes('Four weeks after your starting point') && pre.includes('At four weeks'), 'no recorded date → the standard four weeks');
  /* Today’s offer, recorded: route stamped + £99. */
  const cur = text(buildWelcomePackHtml({ ...base, amountPaid: 99, totalPayments: 12, remeasureDueDate: '2026-10-20' }));
  ok(cur.includes('refund your £99') && cur.includes('Six weeks after your first payment, £99 a month begins'), 'a recorded current client gets today’s guarantee and payments');
  ok(cur.includes('Four weeks after your starting point, due 20 Oct 2026'), 'and their own 28-day date');
  ok(cur.includes('hosting and maintenance of your website'), 'Build route: hosting of the website we built');
  const opt = text(buildWelcomePackHtml({ ...base, amountPaid: 99, totalPayments: 6 }));
  ok(opt.includes('hosting and maintenance if your site is with us'), 'Optimise route keeps the cautious hosting wording');
}

console.log('\n── YOUR AGREEMENT: THE KEY POINTS (Paul, 2026-10-02) ──');
{
  const text = (h: string) => h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
  const base = { businessName: 'MCLocksmiths centre', reviewLink: '', report: { ...report }, baseline: summary };
  const url = 'https://findable.live/agree/' + 'ab'.repeat(32);
  const none = buildWelcomePackHtml({ ...base });
  ok(!none.includes('Your agreement: the key points'), 'no agreement link on record → no agreement page');
  const open = buildWelcomePackHtml({ ...base, agreement: { url, termsKnown: true } });
  const ot = text(open);
  ok(ot.includes('Your agreement: the key points') && ot.includes('Your agreement The key points, and where to review and sign it.'), 'the page is in the pack and on the contents list');
  for (const line of [
    'Your service has a minimum term: 12 payments (Build) or 6 (Optimise). The remaining payments are owed even if you stop early.',
    'Monthly payments start six weeks after your first payment.',
    'We own the website and our work until your final payment. Then it’s yours.',
    'If a payment is 14 days late, we can take the site down until it’s paid.',
    'If AI names you no more often at your four-week re-check, you can claim your £99 back within 14 days, and the agreement ends.',
    'Your domain, logo and photos are always yours.',
  ]) ok(ot.includes(line), `key point: "${line.slice(0, 48)}…"`);
  ok(open.includes(`class="wp-agreebtn" href="${url}"`) && /Review and agree to your agreement/.test(open), 'the button links to the client’s own page');
  ok(/<svg[^>]+aria-label="QR code for your agreement page"/.test(open), 'and a QR code sits beside it');
  ok(!/brand-new domain|eight if/i.test(ot.replace(/Eight weeks after/g, '')), 'no new-domain eight-week wording anywhere in the pack');
  const signed = text(buildWelcomePackHtml({ ...base, agreement: { url, termsKnown: true, acceptedAtIso: '2026-10-05T10:00:00Z', acceptedBy: 'Mark Smith' } }));
  ok(signed.includes('Agreement accepted on 5 October 2026 by Mark Smith.') && !signed.includes('Review and agree to your agreement'), 'once signed, the button is replaced by the accepted line');
  const legacy = text(buildWelcomePackHtml({ ...base, agreement: { url: null } }));
  ok(legacy.includes('Your agreement link will be sent separately.') && !legacy.includes('Review and agree'), 'no link available → it says the link comes separately, never a dead button');
  /* ⛔ AN OLDER CLIENT (Paul, 2026-10-02): a link exists, but nothing on record says the current terms apply. */
  const older = text(buildWelcomePackHtml({ ...base, agreement: { url, termsKnown: false } }));
  ok(older.includes('Your agreed payment schedule continues under the terms you signed up to.') && !older.includes('Review and agree'), 'older client → the neutral line and no button to the v1 agreement');
  ok(!older.includes('12 payments (Build)') && !older.includes('claim your £99 back') && !/£s?99 a month/.test(older), 'older client → today’s £99 / 12-or-6 terms are never shown as theirs');
  ok(older.includes('Your agreement How your agreement works from here.'), 'and the contents line matches');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
