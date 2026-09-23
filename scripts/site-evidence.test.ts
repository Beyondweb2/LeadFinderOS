/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DEEP SALES CRAWL, PHASE 1 — the four findings, and every way each one can be WRONG.

   🔴 WHAT THIS FILE IS ACTUALLY PROTECTING. Every finding here is read aloud to a prospect who did
   not ask, about a site they own and can open in ten seconds. A missed finding costs nothing. A
   FALSE one costs the conversation and the credibility of everything else in the message — and each
   of these four has an obvious, common, entirely legitimate shape that looks exactly like it:

     · a sitemap on www. against a site served from the apex             (same site, no finding)
     · a canonical with a trailing slash, or https where the page was http   (same page, no finding)
     · an @id with a #fragment, a bare path, a stale scheme               (never read at all)
     · a noindex on a privacy page, a tag archive, /page/2, a thank-you page  (correct practice)

   So the negatives below are the point of the file, not the padding around the positives. The MCL
   fixture — a sitemap listing mclocksmiths.co.uk on a site served from mc-locksmiths.com — is the
   case this whole phase exists for and is driven verbatim.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  EVIDENCE_PRIORITY,
  EVIDENCE_SEVERITY,
  MIN_OFFDOMAIN_LOCS,
  MIN_SITEMAP_LOCS_FOR_VERDICT,
  OFFDOMAIN_SHARE,
  SITE_EVIDENCE_VERSION,
  buildSiteEvidence,
  directiveHasNoindex,
  extractCanonical,
  pageImportance,
  registrableDomain,
  sameRegistrableDomain,
  selectableEvidence,
  usableSiteEvidence,
  type EvidenceKind,
  type EvidencePage,
  type SiteEvidenceInput,
} from '../src/lib/siteEvidence.ts';
import { CRAWL_CHECK_VERSION, CRAWL_FRESH_MS } from '../src/lib/crawlCheck.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const SITE = 'https://mc-locksmiths.com';
const page = (p: Partial<EvidencePage> & { requestedUrl: string }): EvidencePage => ({
  finalUrl: p.requestedUrl, status: 200, xRobotsTag: null, html: '', ...p,
});
const input = (p: Partial<SiteEvidenceInput> = {}): SiteEvidenceInput => ({
  servedUrl: SITE,
  pages: [page({ requestedUrl: `${SITE}/`, isHome: true, html: '<html><body>hi</body></html>' })],
  sitemapLocs: [],
  sitemapUrls: [`${SITE}/sitemap.xml`],
  ...p,
});
const kinds = (i: SiteEvidenceInput): EvidenceKind[] => buildSiteEvidence(i).findings.map((x) => x.kind);
const find = (i: SiteEvidenceInput, k: EvidenceKind) => buildSiteEvidence(i).findings.find((x) => x.kind === k);

console.log('── 0. REGISTRABLE DOMAIN — the comparison the whole phase rests on ──');
ok(registrableDomain('https://www.example.com/a/b?c=d') === 'example.com', 'www is stripped to the registrable name');
ok(registrableDomain('https://example.com') === 'example.com', 'apex is itself');
ok(registrableDomain('https://shop.acme.co.uk/x') === 'acme.co.uk', 'a UK two-part suffix takes three labels');
ok(registrableDomain('https://acme.co.uk') === 'acme.co.uk', '…and a bare co.uk name is already registrable');
ok(registrableDomain('https://a.b.c.example.org') === 'example.org', 'deep subdomains collapse');
ok(registrableDomain('not a url') === null, 'a non-URL is null, never a guess');
ok(registrableDomain('') === null && registrableDomain('localhost') === null, 'blank and hostless are null');
/* 🔴 THE FOUR SHAPES THE BRIEF NAMES AS "NEVER A FINDING", EACH DRIVEN. */
ok(sameRegistrableDomain('https://www.acme.co.uk/x', 'https://acme.co.uk/x'), 'www vs apex is the SAME site');
ok(sameRegistrableDomain('http://acme.co.uk/x', 'https://acme.co.uk/x'), 'http vs https is the SAME site');
ok(sameRegistrableDomain('https://acme.co.uk/x', 'https://acme.co.uk/x/'), 'a trailing slash is the SAME site');
ok(sameRegistrableDomain('https://acme.co.uk/a', 'https://acme.co.uk/b'), 'a different path is the SAME site');
/* …and the one that IS a finding. */
ok(!sameRegistrableDomain('https://mc-locksmiths.com', 'https://mclocksmiths.co.uk'), 'the MCL pair is DIFFERENT');
/* ⛔ FAIL-SAFE: an unreadable value can never manufacture a finding. */
ok(sameRegistrableDomain('nonsense', 'https://acme.co.uk'), 'an unparseable side reads as the same site, never as a conflict');

console.log('── 1. SITEMAP WRONG DOMAIN — the MCL finding ──');
const many = (host: string, n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => `${host}/service-${i + from}`);

ok(!kinds(input({ sitemapLocs: many(SITE, 10) })).includes('sitemap_wrong_domain'),
  'a sitemap entirely on the served domain produces NOTHING');
ok(!kinds(input({ sitemapLocs: many('https://www.mc-locksmiths.com', 10) })).includes('sitemap_wrong_domain'),
  'a sitemap on www against an apex-served site produces NOTHING (the false positive that matters most)');
ok(!kinds(input({ servedUrl: 'https://www.mc-locksmiths.com', sitemapLocs: many('https://mc-locksmiths.com', 10) })).includes('sitemap_wrong_domain'),
  '…and the same the other way round');
ok(!kinds(input({ sitemapLocs: many('http://mc-locksmiths.com', 10) })).includes('sitemap_wrong_domain'),
  'an http sitemap on an https site produces NOTHING');

/* 🔴 THE MCL FIXTURE, VERBATIM. The site is served from mc-locksmiths.com; its sitemap lists the old
   mclocksmiths.co.uk. This is the finding Paul found by hand and closed on. */
const MCL = input({
  sitemapLocs: [
    'https://mclocksmiths.co.uk/',
    'https://mclocksmiths.co.uk/emergency-locksmith',
    'https://mclocksmiths.co.uk/lock-changes',
    'https://mclocksmiths.co.uk/uPVC-door-repairs',
    'https://mclocksmiths.co.uk/contact',
    'https://mclocksmiths.co.uk/about',
  ],
});
const mcl = find(MCL, 'sitemap_wrong_domain');
ok(!!mcl, 'the MCL-style sitemap IS caught');
ok(mcl?.tier === 'A' && mcl?.certainty === 'observed', '…at Tier A, observed');
ok(mcl?.severity === EVIDENCE_SEVERITY.sitemap_wrong_domain && mcl?.severity === 5, '…at severity 5');
ok(mcl?.evidence.subject === 'mc-locksmiths.com', '…naming the domain the site is actually served from');
ok(mcl?.evidence.observed.some((o) => o.includes('mclocksmiths.co.uk')), '…and carrying the offending URL verbatim as proof');
ok(mcl?.evidence.observed.length === 3, '…capped at three proof strings, not the whole file');
ok(mcl?.evidence.counted?.matched === 6 && mcl?.evidence.counted?.of === 6, '…with an honest matched/total count');

console.log('── …and it refuses to overstate a stray URL ──');
/* ⛔ THE BRIEF'S EXPLICIT RULE. One or two links to somewhere else is not "your sitemap points at the
   wrong website", and a prospect who opens the file and sees 38 of 40 correct stops believing us. */
const strays = input({ sitemapLocs: [...many(SITE, 18), ...many('https://supplier.example', 2)] });
ok(!kinds(strays).includes('sitemap_wrong_domain'), 'two off-domain URLs in twenty produce NOTHING');
const belowCount = input({ sitemapLocs: [...many(SITE, 1), ...many('https://old-domain.co.uk', MIN_OFFDOMAIN_LOCS - 1)] });
ok(!kinds(belowCount).includes('sitemap_wrong_domain'), `fewer than ${MIN_OFFDOMAIN_LOCS} off-domain URLs produce NOTHING even at a high share`);
const tiny = input({ sitemapLocs: many('https://old-domain.co.uk', MIN_SITEMAP_LOCS_FOR_VERDICT - 1) });
ok(!kinds(tiny).includes('sitemap_wrong_domain'), `fewer than ${MIN_SITEMAP_LOCS_FOR_VERDICT} URLs in total is not enough to judge a pattern`);
/* Mixed, but over the line: the count printed must be the REAL one, not the whole file. */
const mixed = input({ sitemapLocs: [...many('https://old-domain.co.uk', 8), ...many(SITE, 2)] });
const mixedF = find(mixed, 'sitemap_wrong_domain');
ok(!!mixedF, `a dominant off-domain group (over ${OFFDOMAIN_SHARE * 100}%) IS a finding`);
ok(mixedF?.evidence.counted?.matched === 8 && mixedF?.evidence.counted?.of === 10,
  '…and it counts honestly: 8 of 10, never "your sitemap" as though all of it were wrong');
/* ⛔ AND STRAYS SPREAD ACROSS MANY DOMAINS ARE NEVER ADDED TOGETHER. */
const spread = input({ sitemapLocs: [...many(SITE, 4), 'https://a.com/x', 'https://b.com/x', 'https://c.com/x', 'https://d.com/x'] });
ok(!kinds(spread).includes('sitemap_wrong_domain'), 'four strays on four different domains do not sum into one verdict');

console.log('── 2. CANONICAL OFF DOMAIN ──');
const withCanonical = (href: string, at = `${SITE}/services`) => input({
  pages: [
    page({ requestedUrl: `${SITE}/`, isHome: true, html: '<html><head></head><body>hi</body></html>' }),
    page({ requestedUrl: at, html: `<html><head><link rel="canonical" href="${href}"></head><body>x</body></html>` }),
  ],
});
ok(!kinds(withCanonical(`${SITE}/services`)).includes('canonical_off_domain'), 'a self-canonical produces NOTHING');
ok(!kinds(withCanonical('https://www.mc-locksmiths.com/services')).includes('canonical_off_domain'), 'a www canonical on an apex site produces NOTHING');
ok(!kinds(withCanonical('http://mc-locksmiths.com/services')).includes('canonical_off_domain'), 'an http canonical produces NOTHING');
ok(!kinds(withCanonical(`${SITE}/services/`)).includes('canonical_off_domain'), 'a trailing-slash canonical produces NOTHING');
ok(!kinds(withCanonical('/services')).includes('canonical_off_domain'), 'a RELATIVE canonical resolves against its own page and produces NOTHING');
const canon = find(withCanonical('https://mclocksmiths.co.uk/services'), 'canonical_off_domain');
ok(!!canon, 'a genuinely off-domain canonical IS a finding');
ok(canon?.tier === 'A' && canon?.severity === 5, '…at Tier A, severity 5');
ok(canon?.pageUrl === `${SITE}/services`, '…naming the page it is on');
ok(canon?.evidence.observed[0] === 'https://mclocksmiths.co.uk/services', '…and quoting the href verbatim');
/* The extractor's own edge cases. */
ok(extractCanonical('<link href="https://x.com/a" rel="canonical">', SITE) === 'https://x.com/a', 'attribute order does not matter');
ok(extractCanonical('<link rel="shortlink canonical" href="https://x.com/a">', SITE) === 'https://x.com/a', 'a multi-token rel still counts');
ok(extractCanonical('<!-- <link rel="canonical" href="https://x.com/a"> -->', SITE) === null,
  '⛔ a COMMENTED-OUT canonical is not what the page says, so it is never read');
ok(extractCanonical('<link rel="stylesheet" href="https://x.com/a.css">', SITE) === null, 'a stylesheet is not a canonical');

console.log('── 3. SCHEMA WRONG DOMAIN ──');
const ld = (obj: unknown, at = `${SITE}/`) => input({
  pages: [page({ requestedUrl: at, isHome: true, html: `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body>x</body></html>` })],
});
ok(!kinds(ld({ '@type': 'LocalBusiness', url: SITE })).includes('schema_wrong_domain'), 'a matching url produces NOTHING');
ok(!kinds(ld({ '@type': 'LocalBusiness', url: 'https://www.mc-locksmiths.com/' })).includes('schema_wrong_domain'), 'www + trailing slash produces NOTHING');
ok(!kinds(ld({ '@type': 'LocalBusiness', '@id': 'https://mclocksmiths.co.uk/#business', url: SITE })).includes('schema_wrong_domain'),
  '⛔ an @id on another domain is NEVER read — plugins emit stale @id values constantly and none of them is a conflict');
ok(!kinds(ld({ '@type': 'LocalBusiness', url: SITE, sameAs: ['https://facebook.com/mc', 'https://mclocksmiths.co.uk'] })).includes('schema_wrong_domain'),
  '⛔ sameAs is never read — pointing elsewhere is what it is FOR');
ok(!kinds(ld({ '@type': 'LocalBusiness', url: '/about' })).includes('schema_wrong_domain'), 'a relative url is not a claim we can read');
ok(!kinds(ld({ '@type': 'Product', url: 'https://supplier.example/widget' })).includes('schema_wrong_domain'),
  'a Product url on a supplier domain is legitimate and is not read');
ok(!kinds(ld({ '@type': 'BreadcrumbList', url: 'https://other.example/x' })).includes('schema_wrong_domain'), 'a BreadcrumbList is not an identity claim');
const schema = find(ld({ '@type': 'LocalBusiness', name: 'MC Locksmiths', url: 'https://mclocksmiths.co.uk' }), 'schema_wrong_domain');
ok(!!schema, 'a business node whose url is on another domain IS a finding');
ok(schema?.tier === 'A' && schema?.severity === 5, '…at Tier A, severity 5');
ok(schema?.evidence.observed[0] === 'https://mclocksmiths.co.uk', '…quoting the exact observed URL');
ok(!!find(ld({ '@graph': [{ '@type': 'WebSite', url: 'https://mclocksmiths.co.uk' }] }), 'schema_wrong_domain'),
  'a node nested inside @graph is found (the shape every Yoast site emits)');
ok(!!find(ld({ '@type': ['LocalBusiness', 'Locksmith'], url: 'https://mclocksmiths.co.uk' }), 'schema_wrong_domain'),
  'an array @type is handled');
ok(buildSiteEvidence(ld('{{ broken json')).findings.length === 0, 'malformed JSON-LD is skipped, never fatal');

console.log('── 4. NOINDEX ON AN IMPORTANT PAGE ──');
ok(directiveHasNoindex('noindex, nofollow') && directiveHasNoindex('NOINDEX') && directiveHasNoindex('none'),
  'noindex and none both count, in any case');
ok(!directiveHasNoindex('index, follow') && !directiveHasNoindex('') && !directiveHasNoindex(null),
  'index/blank/absent do not');
ok(!directiveHasNoindex('max-snippet:-1, noindexing-is-not-a-word'), 'a word merely containing "noindex" is not a directive');

const noindexPage = (url: string, via: 'meta' | 'header') => input({
  pages: [
    page({ requestedUrl: `${SITE}/`, isHome: true, html: '<html><body>home</body></html>' }),
    page({
      requestedUrl: url,
      xRobotsTag: via === 'header' ? 'noindex' : null,
      html: via === 'meta' ? '<html><head><meta name="robots" content="noindex, follow"></head><body>x</body></html>' : '<html><body>x</body></html>',
    }),
  ],
});
const svc = find(noindexPage(`${SITE}/services/emergency-locksmith`, 'meta'), 'noindex_important_page');
ok(svc?.tier === 'A', 'a SERVICE page marked noindex is Tier A');
ok(svc?.evidence.observed[0]?.includes('meta name="robots"'), '…and the proof is the tag itself, verbatim');
ok(find(noindexPage(`${SITE}/areas/wisbech`, 'meta'), 'noindex_important_page')?.tier === 'A', 'a LOCATION page is Tier A');
ok(find(noindexPage(`${SITE}/services/lock-changes`, 'header'), 'noindex_important_page')?.tier === 'A',
  'X-Robots-Tag alone is enough — a noindex can live in the header and nowhere in the markup');
ok(find(noindexPage(`${SITE}/services/lock-changes`, 'header'), 'noindex_important_page')?.evidence.observed[0]?.includes('X-Robots-Tag'),
  '…and says so in the proof');

/* 🔴 THE FALSE POSITIVES. Every one of these is normal, correct practice, and a message telling a
   locksmith his privacy policy is "marked not to be listed" is the automated-scan tell. */
for (const utility of ['/privacy-policy', '/terms', '/cookie-policy', '/thank-you', '/tag/locks', '/category/news', '/page/2', '/cart', '/my-account', '/2024/05/a-post']) {
  const got = find(noindexPage(`${SITE}${utility}`, 'meta'), 'noindex_important_page');
  ok(got?.tier !== 'A', `noindex on ${utility} is NOT Tier A`);
}
/* The homepage is the most important instance of all. */
const homeNoindex = buildSiteEvidence(input({
  pages: [page({ requestedUrl: `${SITE}/`, isHome: true, html: '<html><head><meta name="robots" content="noindex"></head><body>x</body></html>' })],
})).findings.find((x) => x.kind === 'noindex_important_page');
ok(homeNoindex?.tier === 'A', 'a noindexed HOMEPAGE is Tier A');
/* ⛔ AND THE MOST IMPORTANT PAGE IS THE ONE REPORTED, so forty noindexed tag archives beside one
   noindexed service page still says the thing that matters. */
const both = buildSiteEvidence(input({
  pages: [
    page({ requestedUrl: `${SITE}/`, isHome: true, html: '<html><body>home</body></html>' }),
    page({ requestedUrl: `${SITE}/tag/x`, html: '<html><head><meta name="robots" content="noindex"></head><body>x</body></html>' }),
    page({ requestedUrl: `${SITE}/services/safes`, html: '<html><head><meta name="robots" content="noindex"></head><body>x</body></html>' }),
  ],
})).findings.find((x) => x.kind === 'noindex_important_page');
ok(both?.tier === 'A' && both.pageUrl === `${SITE}/services/safes`,
  'a service page and a tag archive together report the SERVICE page, at Tier A');
ok(both?.evidence.observed.every((o) => !o.includes('/tag/')), '…and the proof shows the important page, not the archive');

console.log('── …page importance never falls THROUGH into Tier A ──');
ok(pageImportance(`${SITE}/`, `${SITE}/`) === 'home', 'the home path is home');
ok(pageImportance(`${SITE}/services/x`, `${SITE}/`) === 'commercial', 'a service path is commercial');
ok(pageImportance(`${SITE}/privacy`, `${SITE}/`) === 'utility', 'a legal path is utility');
ok(pageImportance(`${SITE}/some-unusual-thing`, `${SITE}/`) === 'supporting',
  '⛔ a path this code cannot place lands on SUPPORTING — report-only, never Tier A. Assert on the grade you want.');
ok(pageImportance('not a url', `${SITE}/`) === 'supporting', 'an unparseable URL lands there too, never higher');

console.log('── 5. PRIORITY, THEMES AND SELECTION ──');
ok(SITE_EVIDENCE_VERSION === 1, 'version 1');
ok(EVIDENCE_PRIORITY[0] === 'sitemap_wrong_domain' && EVIDENCE_PRIORITY[3] === 'noindex_important_page',
  'the fixed order is sitemap, canonical, schema, then noindex');
ok(EVIDENCE_SEVERITY.sitemap_wrong_domain === 5 && EVIDENCE_SEVERITY.canonical_off_domain === 5
  && EVIDENCE_SEVERITY.schema_wrong_domain === 5 && EVIDENCE_SEVERITY.noindex_important_page === 4,
  'severities are 5/5/5/4 as specified');

const everything = input({
  sitemapLocs: many('https://mclocksmiths.co.uk', 8),
  pages: [
    page({ requestedUrl: `${SITE}/`, isHome: true, html: `<html><head><link rel="canonical" href="https://mclocksmiths.co.uk/"><script type="application/ld+json">${JSON.stringify({ '@type': 'LocalBusiness', url: 'https://mclocksmiths.co.uk' })}</script></head><body>x</body></html>` }),
    page({ requestedUrl: `${SITE}/services/safes`, html: '<html><head><meta name="robots" content="noindex"></head><body>x</body></html>' }),
  ],
});
const all = buildSiteEvidence(everything).findings;
ok(all.length === 4, 'a site with all four produces all four');
ok(all.map((x) => x.kind).join(',') === EVIDENCE_PRIORITY.join(','), '…in the fixed priority order');

/* 🔴 THE THEME RULE. sitemap / canonical / schema are one story told three ways. Saying two of them
   in a cold message is the same complaint twice, which reads as padding. */
const picked = selectableEvidence(all);
ok(picked.length === 2, 'selection takes TWO: one domain finding and the noindex');
ok(picked[0].kind === 'sitemap_wrong_domain', '…the strongest domain finding');
ok(picked[1].kind === 'noindex_important_page', '…and the one from the other theme');
/* …and when the sitemap is clean, the next domain finding takes the slot rather than none doing. */
const noSitemap = buildSiteEvidence({ ...everything, sitemapLocs: [] }).findings;
ok(selectableEvidence(noSitemap)[0].kind === 'canonical_off_domain', 'with no sitemap finding, the canonical leads');

console.log('── …and only Tier A, observed, is selectable ──');
const tierB = buildSiteEvidence(noindexPage(`${SITE}/some-unusual-thing`, 'meta')).findings;
ok(tierB.length === 1 && tierB[0].tier === 'B', 'an unplaceable page yields a Tier B finding');
ok(selectableEvidence(tierB).length === 0, '…which is recorded for the report and NEVER selectable for a message');
const tierC = buildSiteEvidence(noindexPage(`${SITE}/privacy`, 'meta')).findings;
ok(tierC.length === 1 && tierC[0].tier === 'C', 'a utility page yields a Tier C finding');
ok(selectableEvidence(tierC).length === 0, '…also never selectable');

console.log('── 6. STORAGE — an old row must behave exactly as it always did ──');
const now = Date.now();
/* 🔴 THE CONTRACT FOR SHIPPING WITHOUT A BACKFILL. Every crawl row in the book predates this and has
   no `evidence` key at all. None of them may start throwing, and none may start claiming anything. */
ok(usableSiteEvidence(null, now, CRAWL_FRESH_MS).length === 0, 'a null result yields []');
ok(usableSiteEvidence({}, now, CRAWL_FRESH_MS).length === 0, 'a result with no evidence key yields []');
ok(usableSiteEvidence({ evidence: null }, now, CRAWL_FRESH_MS).length === 0, 'an explicit null yields []');
ok(usableSiteEvidence({ evidence: { version: 1, findings: [] } }, now, CRAWL_FRESH_MS).length === 0, 'an empty findings list yields []');
const stored = { evidence: buildSiteEvidence(MCL), evidenceVersion: SITE_EVIDENCE_VERSION };
ok(usableSiteEvidence(stored, now, CRAWL_FRESH_MS).length === 1, 'a current, fresh row yields its findings');
ok(usableSiteEvidence(stored, now - (CRAWL_FRESH_MS + 1), CRAWL_FRESH_MS).length === 0,
  'a STALE row yields [] — it describes a site as it was');
ok(usableSiteEvidence({ ...stored, evidenceVersion: SITE_EVIDENCE_VERSION - 1 }, now, CRAWL_FRESH_MS).length === 0,
  'a row below the current evidence version yields []');

/* ⛔ AND THE TWO VERSIONS ARE INDEPENDENT. Bumping CRAWL_CHECK_VERSION would blank the report's fault
   section and the audit_followup_fault gate for every stored lead; that is exactly why this feature
   got its own constant instead of riding on that one. */
ok(SITE_EVIDENCE_VERSION !== undefined && CRAWL_CHECK_VERSION === 2,
  'CRAWL_CHECK_VERSION is untouched at 2 — the new finding shipped without blanking a single stored row');

console.log('── 7. NOTHING IS INVENTED ──');
ok(buildSiteEvidence(input()).findings.length === 0, 'a clean site produces NO findings, not a reassurance');
ok(buildSiteEvidence(input({ pages: [] })).findings.length === 0, 'no pages produce no findings');
ok(buildSiteEvidence(input({ servedUrl: 'nonsense', sitemapLocs: many('https://other.example', 9) })).findings.length === 0,
  '⛔ an unreadable served address produces NOTHING — with no side to compare against, every finding would be a guess');
for (const finding of all) {
  ok(finding.evidence.observed.length > 0, `${finding.kind}: carries at least one verbatim proof string`);
  ok(finding.evidence.observed.every((o) => typeof o === 'string' && o.length > 0), `${finding.kind}: every proof is a real string`);
  ok(!!finding.evidence.source, `${finding.kind}: says where it was read from`);
  ok(finding.certainty === 'observed', `${finding.kind}: Phase 1 findings are all observed, never inferred`);
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f) process.exit(1);
