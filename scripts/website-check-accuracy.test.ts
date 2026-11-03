/* THE WEBSITE CHECK SAYS ONLY WHAT IS TRUE (2026-11-03, docs/website-check.md). Each case is a false claim found on a real site by
   the audit of 25 sites, written down so it cannot come back. */
import { readFileSync } from 'node:fs';
import { leanHtml, linkBase, MAX_PAGE_BYTES, processPage, internalPageLinks } from '../src/lib/fullCrawl.ts';
import { visibleText, buildFaultLines, type CrawlSignals } from '../src/lib/crawlCheck.ts';
import { crawlPriority } from '../src/lib/prospectCrawl.ts';
import { auditFromStoredCrawl, buildSiteAudit, heldOnOlderCheck, nameOnPage, WEBSITE_CHECKS_VERSION, type SiteAuditPage } from '../src/lib/siteAudit.ts';
import { buildContentTrust, pageObservations } from '../src/lib/contentTrust.ts';
import { buildVisibilityChecks, footerName } from '../src/lib/visibilityChecks.ts';
import { buildSalesInsights, usableInsights, type ServiceReview } from '../src/lib/salesInsights.ts';
import { summariseWebsiteCheck, usableWebsiteCheck, type WebsiteCheckSummary } from '../src/lib/websiteCheck.ts';

let failures = 0;
function ok(cond: unknown, label: string) { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); }

const HOME = 'https://www.example-trade.co.uk/';
const page = (path: string, html: string, extra: Partial<Parameters<typeof processPage>[0]> = {}): SiteAuditPage => {
  const url = new URL(path, HOME).href;
  const ev = processPage({ url, finalUrl: url, status: 200, xRobotsTag: null, html, isHome: path === '/', ...extra }, HOME);
  return { url, finalUrl: url, status: 'done', httpStatus: 200, source: 'link', depth: path === '/' ? 0 : 1, d: ev.d, b: ev.b, l: ev.l, t: ev.t };
};
const words = (n: number, w = 'electrical work for homes and businesses across the county') => Array.from({ length: n }, () => w).join(' ');
const full = (title: string, body: string) => `<html><head><title>${title}</title><meta name="description" content="d"><meta name="viewport" content="x"></head><body><h1>${title}</h1>${body}</body></html>`;
const SHELL = `<html><head><title>Electricians</title><script>${'x'.repeat(2000)}</script></head><body><div id="root"></div></body></html>`;
const audit = (pages: SiteAuditPage[], extra: Partial<Parameters<typeof buildSiteAudit>[0]> = {}) => buildSiteAudit({
  servedUrl: HOME, requestedUrl: HOME, robotsTxt: 'User-agent: *\nAllow: /', pages, sitemapsRead: 1, sitemapUrlCount: pages.length, offSiteSitemap: { count: 0, samples: [] },
  coverage: { capped: false, pagesCrawled: pages.length, urlsDiscovered: pages.length } as never,
  probe: { searchBlocked: [], blockEvidence: 'robots', readableAs: 'site check', clientRendered: { flagged: false } }, duplicates: null, lead: { name: 'Example Trade', town: 'Banbury' }, homeText: null, ...extra,
});
const ids = (a: { findings: Array<{ id: string }> }) => a.findings.map((f) => f.id);

/* ── a JavaScript shell (poesuk.com, shorelec.uk) ─────────────────────────────────────────────────── */
{
  const a = audit([page('/', SHELL), page('/services', SHELL), page('/contact', SHELL)], { sitemapUrlCount: 212, probe: { searchBlocked: [], blockEvidence: 'robots', readableAs: 'site check', clientRendered: { flagged: true } } });
  for (const id of ['no_contact_route', 'no_phone', 'one_page_site', 'thin_key_pages', 'duplicate_titles', 'no_reviews', 'missing_h1', 'no_address', 'no_contact_page'])
    ok(!ids(a).includes(id), `a shell says nothing about ${id}`);
  ok(ids(a).includes('client_rendered'), 'a shell keeps the one true finding: it is built by JavaScript');
  ok(a.notChecked.some((n) => /JavaScript/.test(n)), 'and says the pages could not be read');
  const rendered = audit([page('/', full('Example Trade Banbury', `Call 01295 123456. ${words(40)}`), { rendered: true, shell: false })], { probe: { searchBlocked: [], blockEvidence: 'robots', readableAs: 'site check', clientRendered: { flagged: true } } });
  ok(rendered.rendered === true && ids(rendered).includes('client_rendered') && ids(rendered).includes('phone_shown'), 'read in a browser: judged from the real page, and the flag stays');
  const lines = buildFaultLines({ clientRendered: { flagged: true, visibleChars: 8, htmlBytes: 2000, appShell: true }, missingH1: true, noJsonLd: true, thinPages: 2, searchBlocked: [], fetchFailed: false, duplicates: null, pagesChecked: 3, homeUrl: HOME, readableAs: 'x' } as unknown as CrawlSignals);
  ok(!lines.some((l) => /heading|label the basics|enough on your pages/i.test(l.title)), 'the fault lines say nothing of a shell\'s headings, markup or length');
  const ctShell = pageObservations(SHELL, HOME, HOME);
  ok(buildContentTrust({ pages: [ctShell], servedUrl: HOME, knownUrls: [], robotsTxt: null, sitemapsRead: 1, lead: { name: 'x', town: 'y', trade: 'z' }, partial: false, sitemapOnly: null, brokenPages: [] } as never).issues.every((i) => i.kind !== 'no_proof'), 'content & trust judges no shell');
  const v = buildVisibilityChecks({ servedUrl: HOME, pages: [page('/', SHELL)].map((p) => ({ url: p.url, d: p.d!, b: p.b as never, t: p.t ?? null, footer: null, nav: null })), partial: false });
  ok(v.findings.length === 0, 'the page checks judge no shell');
  const ins = buildSalesInsights({ servedUrl: HOME, pages: [page('/', SHELL), page('/a', SHELL), page('/b', SHELL)], serviceReview: { kind: 'rules_only' } });
  ok(ins.findings.length === 0, 'the sales insights judge no shell');
}

/* ── a page longer than we download (fpelectric.uk) ───────────────────────────────────────────────── */
{
  ok(MAX_PAGE_BYTES >= 2_900_000, 'a 2.8 MB site-builder page is read to its end');
  const cutHtml = `<html><head><title>T</title></head><body><p>Visible words</p><script>var a = "secret code words";`;
  ok(!visibleText(cutHtml).includes('secret code'), 'a page cut inside a script does not count the code as text');
  ok(!leanHtml(cutHtml).includes('secret code') && leanHtml(cutHtml).includes('Visible words'), 'leanHtml drops the cut script and keeps the page');
  const withLd = `<script type="application/ld+json">{"a":1}</script><p>After</p>`;
  ok(leanHtml(withLd).includes('After') && leanHtml(withLd).includes('ld+json'), 'a complete JSON-LD block is not treated as a cut script');
  const a = audit([page('/', full('Example Trade', words(60)), { cut: true }), page('/about', full('About', words(60)))]);
  ok(!a.findings.some((f) => f.absence), 'part of a page not seen: nothing is said to be missing');
  ok(a.notChecked.some((n) => /longer than we download/.test(n)), 'and that is said');
}

/* ── links resolved as a browser does (st-electric.co.uk) ─────────────────────────────────────────── */
{
  const html = `<html><head><base href="https://www.example-trade.co.uk/"><title>S</title></head><body><a href="Domestic-Electrician/">x</a></body></html>`;
  ok(linkBase(html, 'https://www.example-trade.co.uk/Services/') === 'https://www.example-trade.co.uk/', 'base href is honoured');
  ok(internalPageLinks(html, 'https://www.example-trade.co.uk/Services/', HOME).includes('https://www.example-trade.co.uk/Domestic-Electrician/'), 'a relative link goes where the browser goes');
  ok(linkBase('<p>no base</p>', 'https://x.co.uk/a/') === 'https://x.co.uk/a/', 'no base: the page itself');
  const ev = processPage({ url: 'https://www.example-trade.co.uk/Services/', finalUrl: 'https://www.example-trade.co.uk/Services/', status: 200, xRobotsTag: null, html }, HOME);
  ok((ev.l ?? []).includes('/Domestic-Electrician/'), 'the stored link graph agrees');
}

/* ── title and meta after </head> (svgelectricalsolutions.co.uk) ──────────────────────────────────── */
{
  const html = `<html><head><script>1</script></head><body><title>SVG Electrical</title><meta name="description" content="Based in Andover"><meta name="viewport" content="x"><svg><title>icon</title></svg><p>${words(30)}</p></body></html>`;
  const ev = processPage({ url: HOME, finalUrl: HOME, status: 200, xRobotsTag: null, html, isHome: true }, HOME);
  ok(ev.d.title === 'SVG Electrical', 'a title after </head> is read');
  ok(ev.d.description === 'Based in Andover', 'so is the description');
  ok(ev.d.viewport === true, 'and the viewport');
  const svgOnly = processPage({ url: HOME, finalUrl: HOME, status: 200, xRobotsTag: null, html: `<html><head></head><body><svg><title>icon</title></svg><p>${words(30)}</p></body></html>`, isHome: true }, HOME);
  ok(svgOnly.d.title === '', 'an icon\'s own <title> is not the page title');
}

/* ── a postcode is an address (sknightelectrical.co.uk, bluestoneroofing.co.uk) ───────────────────── */
{
  const html = full('Contact', `<p>Steve Knight Electrical 238 Barton Hill Road Barton Torquay TQ2 8LA Tel 01803 311688 ${words(30)}</p>`);
  const p = page('/contact', html);
  ok((p.b?.addresses ?? []).some((a) => /TQ2 8LA/.test(a)), 'a postcode in a long run of text is read as an address');
  ok(!ids(audit([page('/', full('Example Trade', words(40))), p])).includes('no_address'), 'no "no address" beside it');
}

/* ── contact, about and reviews are read first (highdesignroofing.com) ────────────────────────────── */
{
  const p = (u: string) => crawlPriority(new URL(u, HOME).href, 1, HOME);
  ok(p('/contact-us') < p('/services/chimney-repairs'), 'contact before a service page');
  ok(p('/about') < p('/barnsley/chimney-repairs'), 'about before a town service page');
  ok(p('/reviews') < p('/chimney-repairs'), 'reviews before a service page');
  ok(p('/chimney-repairs') < p('/barnsley/chimney-repairs'), 'a main service page before its town copies');
}

/* ── the business name (smartwireinstall.com, rtelectrical.co.uk, poesuk.com) ─────────────────────── */
{
  ok(nameOnPage('Electrician | Wolverhampton | Smart wire installations ltd', 'Smartwire Installations LTD'), 'spacing does not hide a name');
  ok(nameOnPage('Landlord Certification | RT Electrical | Banbury', 'RT Electrical & Property Maintenance Limited'), 'the brand part of a listing name is the name');
  ok(nameOnPage('Electricians Cheshire | POES UK', 'Power On Electrical Services UK Ltd'), 'initials name it');
  ok(!nameOnPage('Roofers in Surrey | Best Roofing', 'Andover Locksmiths'), 'a different business still is not named');
  ok(footerName('©Copyright. All rights reserved') === null, '"Copyright" is not a name');
  ok(footerName('© 2025 by RT Electrical') === 'RT Electrical', '"by" is not part of a name');
}

/* ── name variants (ljmullanelectrical.com, highdesignroofing.com) ────────────────────────────────── */
{
  const biz = (title: string, schemaName: string, type = 'LocalBusiness', path = '/') => {
    const html = `<html><head><title>${title}</title><script type="application/ld+json">{"@type":"${type}","name":"${schemaName}"}</script></head><body><h1>x</h1><p>${words(40)}</p></body></html>`;
    return page(path, html);
  };
  const vis = (ps: SiteAuditPage[]) => buildVisibilityChecks({ servedUrl: HOME, pages: ps.map((p) => ({ url: p.url, d: p.d!, b: p.b as never, t: p.t ?? null, footer: null, nav: null })), partial: false }).findings.map((f) => f.id);
  ok(!vis([biz('Home | Mullan', 'L J Mullan Electrical'), biz('Thomas | Mullan', 'Thomas McFall', 'LocalBusiness', '/testimonial/thomas-mcfall')]).includes('vs_name_inconsistent'), 'a customer on a review page is not a business name');
  const strapline = ['/', '/a', '/b', '/c'].map((u) => biz(`Page | Castleford, West Yorkshire Roofing Company`, 'High Design Roofing', 'RoofingContractor', u));
  ok(!vis(strapline).includes('vs_name_inconsistent'), 'a strapline in the titles is not a second name');
  const mysite = ['/', '/a', '/b', '/c'].map((u) => biz(`${u.slice(1) || 'home'} page | mysite`, 'Smart Wire Installations LTD', 'LocalBusiness', u));
  ok(vis(mysite).includes('vs_name_inconsistent'), 'a builder\'s default left in the titles is still said');
  ok(biz('x', 'Bluestone Design &amp; Construction').b?.names?.[0] === 'Bluestone Design & Construction', 'an HTML entity is not a different spelling');
}

/* ── the address (hmconstruction.co.uk, renderplus.co.uk) ─────────────────────────────────────────── */
{
  const withPc = (path: string, pc: string, family = '') => page(path + family, full('Page', `<p>27 Leith Close, ${pc}. ${words(40)}</p>`));
  const pages = [withPc('/', 'NW9 8DE'), withPc('/services', 'NW9 8DE'), withPc('/projects', 'HA9 8NN')];
  const v = buildVisibilityChecks({ servedUrl: HOME, pages: pages.map((p) => ({ url: p.url, d: p.d!, b: p.b as never, t: p.t ?? null, footer: null, nav: null })), partial: false });
  ok(!v.findings.some((f) => f.id === 'vs_address_not_on_key_pages'), 'a customer\'s postcode on a project page does not make the homepage "missing" the address');
}

/* ── services (a4electrical, acroofingsouth, lmcaccountancy) ──────────────────────────────────────── */
{
  const nav = [{ label: 'Newton Heath', url: '/newton-heath' }, { label: 'Heaton Chapel', url: '/heaton-chapel' }, { label: 'Health & Safety', url: '/hs' }, { label: 'Chimney repairs', url: '/chimney-repairs-andover/' }, { label: 'Fascias and guttering', url: '/fascias-guttering-andover/' }, { label: 'Roof repairs', url: '/roof-repairs-andover/' }, { label: 'Lead valleys', url: '/nope' }, { label: 'Flat roof repairs', url: '/nope2' }];
  const sub = (path: string, title: string) => page(path, `<html><head><title>${title}</title><meta name="description" content="d"></head><body><h1>${title}</h1><h2>Roof repairs</h2><h2>Chimney repairs</h2><h3>Fascias and guttering</h3><p>${words(40)}</p></body></html>`);
  const pages = [page('/', full('AC Roofing', words(40))), sub('/chimney-repairs-andover/', 'Chimney Repair in Andover'), sub('/fascias-guttering-andover/', 'Fascias & Guttering in Andover'), sub('/roof-repairs-andover/', 'Roof Repairs in Andover')];
  const run = (serviceReview?: ServiceReview) => buildSalesInsights({ servedUrl: HOME, pages, nav, serviceReview, lead: { name: 'AC Roofing', town: 'Andover', trade: 'Roofer' } });
  const named = (r: ReturnType<typeof run>) => r.findings.flatMap((f) => [f.observed, ...f.evidence.quotes]).join(' ');
  ok(!run().findings.some((f) => /service/i.test(f.kind)) && !run({ kind: 'not_reviewed' }).findings.some((f) => /service/i.test(f.kind)), 'no reader: nothing is claimed about service pages (absent = do not)');
  const rules = run({ kind: 'rules_only' });
  ok(!(rules.services ?? []).some((s) => /Heath|Heaton|Safety/.test(s.name)), 'towns and safety policies are not service words');
  ok(rules.services.filter((s) => /Chimney|Fascias|Roof repairs/.test(s.name)).every((s) => s.coverage === 'dedicated'), 'a service page with an "other services" block is still its own page');
  const reviewed = run({ kind: 'reviewed', real: ['Chimney repairs', 'Fascias and guttering', 'Roof repairs', 'Lead valleys', 'Flat roof repairs'], pageFor: { 'Flat roof repairs': pages[3].url } });
  ok(reviewed.services.find((s) => s.name === 'Flat roof repairs')?.coverage === 'dedicated', 'the page the reader named counts');
  ok(!/Flat roof repairs/.test(named(reviewed)), 'and is not claimed as missing');
  const notReal = run({ kind: 'reviewed', real: ['Chimney repairs'], pageFor: {} });
  ok(!notReal.services.some((s) => s.name === 'Lead valleys'), 'a name the reader rejected is gone');
  ok(usableInsights({ version: 1, state: 'issues', findings: [], services: [], strengths: [], basis: {} }) === null, 'older stored guesses are never read again');
  const src = readFileSync(new URL('../supabase/functions/_shared/service-review.ts', import.meta.url), 'utf8');
  ok(/gpt-4o-mini/.test(src) && /logOpenAiUsage/.test(src), 'the reader is the cheap model and its cost is logged');
}

/* ── what the live re-crawl of 2026-11-03 showed ──────────────────────────────────────────────────── */
{
  const review: ServiceReview = { kind: 'reviewed', real: ['Fire & security', 'Kitchens & outbuildings', 'Rewires', 'Lighting'], pageFor: {} };
  const nav = [{ label: 'Fire & security', url: '/fire' }, { label: 'Kitchens & outbuildings', url: '/kitchens' }, { label: 'Rewires', url: '/rewires' }, { label: 'Lighting', url: '/lighting' }];
  const ps = [page('/', full('Shorelec', words(40))), page('/rewires', full('Rewires', words(40)))];
  const capped = buildSalesInsights({ servedUrl: HOME, pages: ps, nav, capped: true, serviceReview: review, lead: { name: 'Shorelec', town: 'x', trade: 'Electrician' } });
  ok(!capped.findings.some((f) => /service/.test(f.kind)), 'a crawl stopped at its page limit never says a service has no page');
  const reviewsOn = page('/', full('AC Roofing', 'We are on Checkatrade with 40 customer reviews from local homeowners who used us. ' + words(40)));
  ok((reviewsOn.b?.reviews ?? []).length > 0, 'Checkatrade and customer reviews on the page count as reviews');
  const oneShell = audit([page('/', full('Example Trade', `Call 01295 123456. ${words(40)}`)), page('/contact', SHELL)]);
  ok(!ids(oneShell).includes('no_contact_page') && !oneShell.findings.some((f) => f.absence), 'one unread page: nothing is said to be missing');
}

/* ── an older stored check says only what it got right ────────────────────────────────────────────── */
{
  const f = (id: string, extra: Record<string, unknown> = {}) => ({ id, severity: 'medium', ...extra });
  const shell = heldOnOlderCheck([f('client_rendered'), f('no_contact_route'), f('no_phone'), f('no_sitemap'), f('robots_blocks_oai-searchbot')], false).map((x) => x.id);
  ok(shell.join() === 'client_rendered,no_sitemap,robots_blocks_oai-searchbot', 'an unrendered shell keeps only what robots.txt and the sitemap show');
  const normal = heldOnOlderCheck([f('service_page_gaps'), f('vs_name_inconsistent'), f('broken_pages'), f('ct_placeholder_content'), f('no_reviews', { absence: true })], false).map((x) => x.id);
  ok(normal.join() === 'ct_placeholder_content,no_reviews', 'the unreliable kinds go, the sound ones stay');
  ok(!heldOnOlderCheck([f('ct_no_proof', { absence: true })], true).length, 'a capped crawl\'s "not found" goes: it may never have read the page');
  const stored = { version: 1, depth: 'deep', checkedAt: null, pagesRead: 60, pagesFound: 300, capped: true, strengths: [], notChecked: [], failure: null, issues: [{ id: 'no_contact_route', severity: 'high', title: 'x', saw: '', meaning: '', count: 0, pages: [], absence: true }, { id: 'client_rendered', severity: 'medium', title: 'y', saw: '', meaning: '', count: 0, pages: [] }] } as WebsiteCheckSummary;
  ok(usableWebsiteCheck(stored)!.issues.map((i) => i.id).join() === 'client_rendered', 'a stored summary is held on read');
  ok(usableWebsiteCheck({ ...stored, checksVersion: WEBSITE_CHECKS_VERSION })!.issues.length === 2, 'a current one is read as written');
  const row = { result: { checksVersion: WEBSITE_CHECKS_VERSION, url: HOME, checked_at: '2026-11-03', signals: { homeUrl: HOME, searchBlocked: [], readableAs: 'x', pagesChecked: 1, thinPageUrls: [`${HOME}a`] } }, created_at: '2026-11-03', mode: 'standard' };
  ok(summariseWebsiteCheck(row as never)?.checksVersion === WEBSITE_CHECKS_VERSION, 'a current row\'s summary carries its version');
  ok(!!auditFromStoredCrawl(row as never), 'and its audit reads');
}

/* ── the spend is one conditional write, and it is wired ──────────────────────────────────────────── */
{
  const job = readFileSync(new URL('../supabase/functions/_shared/crawl-job.ts', import.meta.url), 'utf8');
  const render = readFileSync(new URL('../supabase/functions/_shared/site-render.ts', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/migrations/20261204090000_crawl_render_cap.sql', import.meta.url), 'utf8');
  ok(/rpc\("claim_crawl_render"\)/.test(render) && /allowed !== true/.test(render), 'no browser read without the claim');
  ok(/where u\.pages < v_cap/.test(sql) && /<> 'running'/.test(sql), 'the claim is the cap and the protection mode');
  ok(/SITE_CHECK_UA/.test(render), 'the browser reads under our honest name');
  ok(/checksVersion: WEBSITE_CHECKS_VERSION/.test(job), 'the deep crawl marks its checks');
  ok(/checksVersion: WEBSITE_CHECKS_VERSION/.test(readFileSync(new URL('../supabase/functions/crawl-check/index.ts', import.meta.url), 'utf8')), 'so does the quick check');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
if (failures) process.exit(1);
