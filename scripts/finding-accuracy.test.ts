/* FINDING ACCURACY (Paul, 2026-10-25; docs/finding-accuracy.md). The real case: X Border Transport Training (heavy vehicle
   driver trainer, Lavington NSW, https://findable.live/r/j4zej4). A hook draft told them "your site doesn't say which areas you
   cover", "your site doesn't mention Lavington NSW" and "your main pages don't say clearly what you do" — all three false —
   and the audit asked about "the best driving instructor". Page texts below are the site's own words. Pure: no model, no DB. */
import { processPage } from '../src/lib/fullCrawl.ts';
import { pageObservations, buildContentTrust } from '../src/lib/contentTrust.ts';
import { buildSalesInsights } from '../src/lib/salesInsights.ts';
import type { SiteAuditPage } from '../src/lib/siteAudit.ts';
import { pitchIssueLine } from '../src/lib/pitchIssueWords.ts';
import { FULL_TEXT_MARK, KEPT_TEXT_CHARS, coverageStatementsIn, homepageWords, pageTextWasCut, siteTradeFor, textStatesTown, townCore } from '../src/lib/siteClaims.ts';
import { bestFirstHookQuestion } from '../src/lib/hookScore.ts';

let failures = 0;
const ok = (c: unknown, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };

const O = 'https://www.xbordertt.com.au';
const NAV = '<nav><a href="/">Home</a> <a href="/about.html">ABOUT</a> <a href="/courses.html">COURSES</a> <a href="/services.html">Services</a> <a href="/contact.html">Contact</a></nav>';
const FILL = ' We will teach you the fundamental skills required to operate heavy vehicles in a safe and efficient manner and we assess your progress throughout.'.repeat(4);
const PAGES: Array<{ path: string; title: string; body: string }> = [
  { path: '/', title: 'X BORDER TRANSPORT TRAINING - X-Border TT - home', body: '<h2>Get Your Truck Licence today</h2><p>X Border Transport Training supplies Heavy Vehicle and Driver Training for anyone in Albury Wodonga and surrounds, including all areas of Riverina NSW and NE Victoria.' + FILL + '</p>' },
  { path: '/about.html', title: 'about - X BORDER TRANSPORT TRAINING', body: '<h2>ABOUT US</h2><p>Our services are available to anyone in Albury/Wodonga and surrounds, including all areas of Riverina NSW and NE Victoria.' + FILL + '</p>' },
  { path: '/services.html', title: 'services - X BORDER TRANSPORT TRAINING', body: '<h2>Not just truck licences....</h2><p>We also offer Forklift Licence, Construction Induction Whitecard, Dangerous Goods Licence. Contact us.</p>' },
  { path: '/courses.html', title: 'courses - X BORDER TRANSPORT TRAINING', body: '<h2>OUR TRAINING COURSES</h2><p>LR - Light Rigid. Small trucks with a gross vehicle mass up to 8 tonnes. MR - Medium Rigid. HR - Heavy Rigid.' + FILL + '</p>' },
  { path: '/contact.html', title: 'contact - X BORDER TRANSPORT TRAINING', body: '<h2>Contact</h2><p>Call us to book a course.' + FILL + '</p>' },
];
const html = (p: { title: string; body: string }) => `<html><head><title>${p.title}</title><meta name="viewport" content="width=device-width"></head><body>${NAV}${p.body}</body></html>`;
const built = PAGES.map((p, i) => {
  const url = O + p.path;
  const ev = processPage({ url, finalUrl: url, status: 200, xRobotsTag: null, html: html(p), isHome: i === 0 }, O + '/');
  const row: SiteAuditPage = { url, finalUrl: url, status: 'done', httpStatus: 200, d: ev.d, b: ev.b, l: ev.l ?? [], t: ev.t };
  return { row, obs: pageObservations(html(p), url, O + '/', 200), ev };
});

console.log('1. areas covered: "available to anyone in X and surrounds" IS a statement of coverage');
{
  const home = coverageStatementsIn('supplies Heavy Vehicle and Driver Training for anyone in Albury Wodonga and surrounds, including all areas of Riverina NSW and NE Victoria.');
  const about = coverageStatementsIn("Our services are available to anyone in Albury/Wodonga and surrounds, including all areas of Riverina NSW and NE Victoria.");
  ok(home.length > 0 && about.length > 0, 'both of this lead\'s sentences are read as coverage');
  ok(coverageStatementsIn('Norwich and surrounding villages, we also travel to Dereham').length > 0, '"Norwich and surrounding villages" is coverage');
  ok(coverageStatementsIn('Based in Leeds, we cover all areas of West Yorkshire').length > 0, '"all areas of West Yorkshire" is coverage');
  ok(coverageStatementsIn('Our founder grew up in Norwich. We love a good cup of tea. Call us today.').length === 0, 'a place named in passing is not coverage');
  ok(coverageStatementsIn('Welcome to our driving school. Lessons are available for everyone.').length === 0, '"available for everyone" with no place is not coverage');
  const ct = buildContentTrust({ pages: built.map((b) => b.obs), servedUrl: O + '/', knownUrls: PAGES.map((p) => O + p.path), lead: { name: 'X Border Transport Training', town: 'Lavington NSW' } });
  ok(!ct.issues.some((i) => i.kind === 'areas_not_stated'), 'this lead: no "areas not stated" finding');
}

console.log('2. the town: "Lavington NSW" is judged on the full text, the parent city is not ignored');
{
  ok(townCore('Lavington NSW') === 'Lavington' && townCore('Royal Leamington Spa') === 'Royal Leamington Spa' && townCore('Deer Park VIC') === 'Deer Park', 'the state label is dropped, a town is not');
  ok(textStatesTown('Training in Lavington and Albury', 'Lavington NSW'), 'a site that writes "Lavington" without "NSW" states Lavington NSW');
  ok(!textStatesTown('Training in Lavingtonia', 'Lavington NSW'), 'whole words only');
  ok(textStatesTown('Tiff achieved her HR licence with us in Thurgoona', 'Thurgoona NSW'), 'a town deep in the text counts (not only title / headings / opening)');
  const i = buildSalesInsights({ servedUrl: O + '/', pages: built.map((b) => b.row), nav: [], knownUrls: PAGES.map((p) => O + p.path), lead: { name: 'X Border Transport Training', town: 'Lavington NSW', trade: 'Driving instructors' } });
  ok(!i.findings.some((f) => f.id === 'location_unclear'), 'this lead: Lavington is NOT reported missing (the site names Albury/Wodonga and surrounds)');
  // A site that says nothing about where it works at all, every page read to the end: still reported, and stamped.
  const plain = (b: string) => ({ title: 'Acme Locks', body: `<h2>Locks</h2><p>${b}</p>` });
  const nowhere = ['/', '/a', '/b'].map((p, k) => { const u = O + p; const h = html(plain('We fit and repair locks for homes and businesses. Call us today. '.repeat(10))); const ev = processPage({ url: u, finalUrl: u, status: 200, xRobotsTag: null, html: h, isHome: k === 0 }, O + '/'); return { url: u, finalUrl: u, status: 'done', httpStatus: 200, d: ev.d, b: ev.b, l: ev.l ?? [], t: ev.t } as SiteAuditPage; });
  const j = buildSalesInsights({ servedUrl: O + '/', pages: nowhere, nav: [], knownUrls: [], lead: { name: 'Acme Locks', town: 'Bath', trade: 'locksmith' } });
  const f = j.findings.find((x) => x.id === 'location_unclear');
  ok(!!f && f.observed.includes(FULL_TEXT_MARK), 'a town named nowhere, every page read in full, no coverage said → reported, with the full-text stamp');
  // The same site with a page cut at the cap: cannot be proved, not reported.
  const cut = nowhere.map((p, k) => (k === 1 ? { ...p, t: 'x '.repeat(KEPT_TEXT_CHARS) } : p));
  ok(!buildSalesInsights({ servedUrl: O + '/', pages: cut, nav: [], knownUrls: [], lead: { name: 'Acme Locks', town: 'Bath', trade: 'locksmith' } }).findings.some((x) => x.id === 'location_unclear'), 'a page longer than the text we keep → not reported');
  // Old stored rows have no text at all: unknown is not "empty".
  ok(pageTextWasCut(undefined) && pageTextWasCut(null) && !pageTextWasCut('short'), 'text we never kept is "cut", never "absent"');
  ok(!buildSalesInsights({ servedUrl: O + '/', pages: nowhere.map((p) => ({ ...p, t: undefined })), nav: [], knownUrls: [], lead: { name: 'Acme Locks', town: 'Bath', trade: 'locksmith' } }).findings.some((x) => x.id === 'location_unclear'), 'pages with no kept text → not reported');
}

console.log('3. what reaches a prospect');
{
  const stored = { id: 'location_unclear', title: 'Lavington NSW is not mentioned on the site', saw: 'Lavington NSW does not appear in the title, headings or opening text of any of the 6 pages read.' };
  ok(pitchIssueLine(stored) === null, 'this lead\'s STORED town finding (opening text only) is left out');
  ok(pitchIssueLine({ ...stored, saw: `Bath does not appear anywhere in the text of any of the 6 pages read (${FULL_TEXT_MARK}).`, title: 'Bath is not mentioned on the site' }) === "Your site doesn't mention Bath", 'a full-text town finding is still said');
  ok(pitchIssueLine({ id: 'ct_areas_not_stated', title: 'We couldn’t find which areas you cover', saw: 'No “areas we cover” list or statement on any page read' }) === null, 'the stored areas finding (no stamp) is left out');
  ok(pitchIssueLine({ id: 'ct_areas_not_stated', title: 'x', saw: `No “areas we cover” list or statement on any page read (${FULL_TEXT_MARK})` }) === "Your site doesn't say which areas you cover", 'a stamped areas finding is still said');
  for (const id of ['vs_key_page_basics', 'missing_h1', 'missing_title', 'missing_description', 'duplicate_titles', 'ct_area_coverage']) {
    ok(pitchIssueLine({ id, title: 'Key pages have no main heading (H1)', saw: 'homepage: no H1; /services.html: no H1.' }) === null, `${id} never becomes "main pages don't say what you do" (or "areas") in a pitch`);
  }
  ok(pitchIssueLine({ id: 'ct_vague_headings', title: 'Main headings don’t say what you do or where' }) === "Your main pages don't say clearly what you do", 'the heading check, which reads what headings SAY, may still use the line');
}

console.log('4. question 1 names what the business does');
{
  const words = homepageWords(html(PAGES[0]));
  ok(siteTradeFor('Driving instructors', words) === 'truck driver trainer', 'a "Driving instructors" site about truck licences → truck driver trainer');
  ok(bestFirstHookQuestion('truck driver trainer', 'Albury NSW') === 'Who is the best truck driver trainer in Albury NSW?', 'question 1 reads "Who is the best truck driver trainer in Albury NSW?"');
  ok(siteTradeFor('Driving instructors', homepageWords('<title>Pass your driving test | Sam Driving School</title><h1>Driving lessons in Leeds</h1><p>Manual and automatic lessons for learner drivers. We also teach some motorbike CBT.</p>')) === null, 'a car-lesson site that mentions a motorbike course keeps its category');
  ok(siteTradeFor('Driving instructors', homepageWords('<title>Hartley Driving School</title><p>Friendly local lessons.</p>')) === null, 'nothing specific on the site → the category');
  ok(siteTradeFor('Plumber', homepageWords('<title>Truck Plumbing</title><h1>Truck wash plumbing</h1>')) === null, 'a category that is not a driving one is never rewritten');
  ok(siteTradeFor('Driving instructors', homepageWords('<title>Bus and truck licences</title><h1>Bus and truck training</h1>')) === null, 'two specialisms named → unclear → the category');
}

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall passed');
