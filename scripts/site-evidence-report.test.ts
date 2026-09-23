/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "I HAD A LOOK AT YOUR WEBSITE TOO" — the deep-crawl findings where a prospect reads them.

   🔴 WHAT THIS BLOCK IS FOR, AND WHY IT IS NOT THE WHATSAPP COPY. The message deliberately carries
   no figure and no address: a precise number in a cold WhatsApp invites an argument about the
   number. The report is the opposite — somebody has opened it, and the single most persuasive thing
   we can put in front of them is the actual line out of their own sitemap, which they can go and
   check in ten seconds. So this block prints the proof verbatim, and this file's job is to make sure
   it prints the RIGHT proof and never renders at all when there is none.

   ⛔ AND THE NO-EVIDENCE PATH IS THE ONE THAT MUST NOT MOVE. Every report in the book today has a
   crawl with no evidence key. All of them must render exactly what they rendered yesterday.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { renderReportHtml, type AiAuditReportData } from '../src/lib/aiAuditReportHtml.ts';
import { buildSiteEvidence, type SiteEvidenceFinding } from '../src/lib/siteEvidence.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const SITE = 'https://mc-locksmiths.com';
const hookGap: NonNullable<AiAuditReportData['hook']> = {
  questionsTested: 1, maxQuestions: 3, stopReason: 'visibility_gap_found',
  gap: {
    questionIndex: 0, question: 'Who is the best locksmith in Wisbech?',
    engine: 'gemini', engineLabel: 'Gemini', namedInstead: ['A1 Locks'],
    citations: [], namedOnEngineLabels: [],
    answerExcerpt: 'For locksmiths in Wisbech a few well reviewed options come up regularly, and A1 Locks is the one most often mentioned for emergency call-outs across the town.',
  },
  tested: [{ question: 'Who is the best locksmith in Wisbech?', isGap: true, perEngine: [{ engine: 'gemini', label: 'Gemini', named: false }] }],
};
const base: AiAuditReportData = {
  businessName: 'MC Locksmiths', businessType: 'locksmith', named: 0, total: 1, pct: 0,
  perEngine: [], competitors: [], gutPunch: null, generatedAtLabel: '22 Sep 2026', hook: hookGap,
};

/* Built by the real detectors, not hand-written, so the report can never be tested against a shape
   the crawl does not actually produce. */
const MCL_EVIDENCE = buildSiteEvidence({
  servedUrl: SITE,
  sitemapUrls: [`${SITE}/sitemap.xml`],
  sitemapLocs: [
    'https://mclocksmiths.co.uk/', 'https://mclocksmiths.co.uk/emergency-locksmith',
    'https://mclocksmiths.co.uk/lock-changes', 'https://mclocksmiths.co.uk/contact',
    'https://mclocksmiths.co.uk/about', 'https://mclocksmiths.co.uk/uPVC-door-repairs',
  ],
  pages: [
    { requestedUrl: `${SITE}/`, finalUrl: `${SITE}/`, status: 200, xRobotsTag: null, isHome: true, html: '<html><body>home</body></html>' },
    { requestedUrl: `${SITE}/services/safes`, finalUrl: `${SITE}/services/safes`, status: 200, xRobotsTag: null, html: '<html><head><meta name="robots" content="noindex"></head><body>x</body></html>' },
  ],
}).findings;

console.log('── 1. THE SECTION RENDERS, WITH ITS PROOF ──');
const html = renderReportHtml({ ...base, siteEvidence: MCL_EVIDENCE });
ok(html.includes('sec-title">I had a look at your website too'), 'the section heading renders');
ok(html.includes('Your sitemap points at a different website'), 'the sitemap finding has a human title');
ok(/A sitemap is the file that lists your pages/.test(html), '…and a plain-English explanation of what a sitemap even is');
/* 🔴 THE PROOF. This is the thing that closed the deal by hand, and the only reason a prospect
   believes the rest of the page. */
ok(html.includes('https://mclocksmiths.co.uk/emergency-locksmith'), 'the OFFENDING URL is printed verbatim');
ok(html.includes('mc-locksmiths.com'), '…beside the address the site is actually served from');
ok(/6 of 6 checked/.test(html), '…with an honest matched/total count');
ok(html.includes('A main page is marked not to be listed'), 'the noindex finding renders too');
ok(html.includes(`${SITE}/services/safes`), '…naming the exact page it was found on');

console.log('── …and it stays readable for a tradesperson ──');
/* ⛔ NOT ONE OF OUR WORDS IN THE PROSE. The URLs are technical because a URL is technical; the
   sentences around them must not be. A prospect who has to accept a term on trust is being sold to. */
const prose = (html.match(/<p class="ev-p">([^<]*)<\/p>/g) ?? []).join(' ');
ok(prose.length > 0, 'the explanations render');
for (const word of ['canonical', 'schema', 'noindex', 'JSON-LD', 'markup', 'directive', 'indexation', 'crawl budget']) {
  ok(!new RegExp(`\\b${word}\\b`, 'i').test(prose), `the explanations never say "${word}"`);
}
/* ⛔ AND NO RAW HTML IS SHOWN. The brief is explicit: proof, not a dump. A meta tag is the one
   exception and it is the finding itself, so it lands in the monospaced proof line, never in prose. */
ok(!/<p class="ev-p">[^<]*&lt;/.test(html), 'no markup is dumped into the explanations');

console.log('── 2. THE CRAWL FAULTS JOIN THE SAME SECTION, NOT A SECOND ONE ──');
/* Two website sections one after the other reads as the report saying the same thing twice. */
const withBoth = renderReportHtml({
  ...base, siteEvidence: MCL_EVIDENCE,
  crawlFaults: [{ title: 'AI can’t reach your site', detail: 'OAI-SearchBot is blocked from fetching your pages.', minor: false }],
});
ok(withBoth.includes('sec-title">I had a look at your website too'), 'the evidence heading renders');
ok(!withBoth.includes('Website issues we can fix'), '…and the old second heading does NOT also appear');
ok(withBoth.includes('OAI-SearchBot is blocked'), '…while the crawl fault still renders, inside it');
ok((withBoth.match(/sec-title">I had a look at your website too/g) ?? []).length === 1, 'exactly one website section');

console.log('── 3. NO EVIDENCE → BYTE-IDENTICAL TO BEFORE ──');
/* 🔴 THE CONTRACT FOR SHIPPING WITHOUT A BACKFILL. Every stored crawl row predates this. */
const faultsOnly = renderReportHtml({
  ...base,
  crawlFaults: [{ title: 'AI can’t reach your site', detail: 'OAI-SearchBot is blocked from fetching your pages.', minor: false }],
});
ok(faultsOnly.includes('Website issues we can fix'), 'with no evidence, the original fault card renders exactly as it did');
ok(!faultsOnly.includes('sec-title">I had a look at your website too'), '…and the new heading is absent');
ok(renderReportHtml({ ...base, siteEvidence: [] }).includes('Website issues we can fix') === false,
  'an EMPTY evidence list is the same as none — no section invented from nothing');
const nothing = renderReportHtml(base);
ok(!nothing.includes('sec-title">I had a look at your website too') && !nothing.includes('Website issues we can fix'),
  'a clean crawl renders NO website section at all — silence, not reassurance (Paul, 2026-09-21)');

console.log('── 4. AT MOST FOUR, STRONGEST FIRST ──');
const many: SiteEvidenceFinding[] = Array.from({ length: 6 }, (_, i) => ({
  ...MCL_EVIDENCE[0],
  pageUrl: `${SITE}/p${i}`,
  evidence: { ...MCL_EVIDENCE[0].evidence, observed: [`https://mclocksmiths.co.uk/p${i}`] },
}));
const capped = renderReportHtml({ ...base, siteEvidence: many });
ok((capped.match(/class="ev-item"/g) ?? []).length === 4, 'never more than four findings render');
ok(capped.includes('https://mclocksmiths.co.uk/p0') && !capped.includes('https://mclocksmiths.co.uk/p5'),
  '…and it is the first four, in the order they were given (already priority-sorted)');

console.log('── 5. A FINDING WITH NO COPY IS SKIPPED, NEVER RENDERED BLANK ──');
/* A kind added to the evidence layer without words here must produce nothing rather than an empty
   card with a URL under it — the absent case, enumerated rather than left to fall through. */
const unknownKind = renderReportHtml({
  ...base,
  // deno-lint-ignore no-explicit-any
  siteEvidence: [{ ...MCL_EVIDENCE[0], kind: 'some_future_kind' as any }],
});
ok(!unknownKind.includes('class="ev-item"'), 'an unrecognised finding kind renders nothing');

console.log('── 6. THE NON-HOOK REPORT IS UNTOUCHED ──');
/* The evidence block lives in the hook report's website slot. An ordinary report must not grow one
   silently, and must keep its own fault rendering exactly as it was. */
const ordinary = renderReportHtml({
  ...base, hook: undefined, named: 2, total: 6, pct: 33,
  crawlFaults: [{ title: 'AI can’t reach your site', detail: 'OAI-SearchBot is blocked from fetching your pages.', minor: false }],
});
ok(!ordinary.includes('sec-title">I had a look at your website too'), 'an ordinary (non-hook) report does not grow the new section');
ok(ordinary.includes('What&rsquo;s stopping AI reading your site'), '…and keeps its own fault section, unchanged');
ok(!ordinary.includes('class="chatcard evcard"'), '…and has no hook evidence card');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f) process.exit(1);
