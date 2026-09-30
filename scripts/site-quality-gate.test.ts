/* THE FINDABLE SITE QUALITY GATE (scripts/site-quality-gate.mjs, 2026-09-30) — the pre-deploy check
   of a BUILT client site. Fixture sites, each check driven to the value we WANT (a good site passes;
   each defect fails the check that owns it, and nothing else is needed to make it fail).
     A. a good site passes every automated check; identity / intents SKIP without an expect file
     B. crawl: robots, noindex (meta + _headers scope), sitemap, canonicals, hosts
     C. links: broken, orphan, redirect hop, Cloudflare /cdn-cgi/
     D. SEO: titles, descriptions, H1s, cloned pages, placeholders
     E. entity: schema parse, business entity, one @id, no rating markup, breadcrumbs
     F. identity + intents from the Site Intent Map, the verbatim-question rule
     G. the parsers (robots groups, _headers, _redirects) */

import { auditSite, parseHeaders, parseRedirects, robotsAllows } from './site-quality-gate.mjs';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const D = 'example-electrical.co.uk', O = 'https://' + D;
type Page = { title?: string; desc?: string; h1?: string; body?: string; canonical?: string | null; ld?: unknown[]; robots?: string; extraHead?: string };
const BIZ = { '@type': 'Electrician', '@id': O + '/#business', name: 'Example Electrical', telephone: '01179 000111', url: O + '/', areaServed: ['Bristol'] };
const NAV = '<header><nav><a href="/">Home</a> <a href="/services/">Services</a> <a href="/services/rewiring/">Rewiring</a> <a href="/services/eicr/">EICR</a> <a href="/areas/bath/">Bath</a> <a href="/contact/">Contact</a> <a href="tel:01179000111">01179 000111</a></nav></header>';
const FOOT = '<footer><p>Example Electrical · <a href="mailto:hello@example-electrical.co.uk">hello@example-electrical.co.uk</a> · <a href="/privacy/">Privacy</a></p></footer>';
const lorem = (seed: string, n = 140) => { let h = 7; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return Array.from({ length: n }, (_, k) => { h = (h * 1103515245 + 12345) >>> 0; return ['wiring', 'safety', 'homes', 'landlords', 'fuse', 'board', 'test', 'report', 'socket', 'circuit', 'light', 'cable', 'meter', 'earth', 'bond'][h % 15] + (h % 3 ? '' : ' ' + seed); }).join(' '); };
function html(path: string, p: Page): string {
  const crumbs = path === '/' ? [] : [{ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: O + '/' }, { '@type': 'ListItem', position: 2, name: p.h1 ?? path, item: O + path }] }];
  const ld = p.ld ?? [{ '@context': 'https://schema.org', '@graph': [path === '/' ? BIZ : { '@id': BIZ['@id'] }, ...crumbs] }];
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + (p.title ?? ('Page ' + path + ' | Example Electrical')) + '</title>' +
    (p.desc === '' ? '' : '<meta name="description" content="' + (p.desc ?? ('Example Electrical ' + path + ' — plain, specific, useful information about this page for customers in Bristol.')) + '">') +
    (p.robots ? '<meta name="robots" content="' + p.robots + '">' : '') +
    (p.canonical === null ? '' : '<link rel="canonical" href="' + (p.canonical ?? O + path) + '">') + (p.extraHead ?? '') +
    ld.map((x) => '<script type="application/ld+json">' + JSON.stringify(x) + '</script>').join('') +
    '</head><body>' + NAV + '<main><h1>' + (p.h1 ?? 'Heading for ' + path) + '</h1>' + (p.body ?? '<p>' + lorem(path) + '</p>') + '</main>' + FOOT + '</body></html>';
}
const GOOD: Record<string, Page> = {
  '/': { title: 'Electrician in Bristol | Example Electrical', h1: 'Example Electrical — electricians in Bristol', body: '<p>Example Electrical rewires homes, tests landlords\' installations and fixes faults across Bristol and Bath, with NICEIC-registered electricians and fixed quotes.</p><p>' + lorem('home') + '</p>' },
  '/services/': { title: 'Electrical services in Bristol | Example Electrical', h1: 'Our electrical services' },
  '/services/rewiring/': { title: 'House rewiring in Bristol | Example Electrical', h1: 'House rewiring in Bristol', body: '<p>We rewire houses and flats across Bristol, usually in three to five days, with the old circuits made safe first.</p><p>' + lorem('rew') + '</p>' },
  '/services/eicr/': { title: 'EICR landlord certificates | Example Electrical', h1: 'EICR landlord certificates', body: '<p>An EICR is the electrical safety report landlords in Bristol need every five years; we test, report and fix what fails.</p><p>' + lorem('eicr') + '</p>' },
  '/areas/bath/': { title: 'Electrician in Bath | Example Electrical', h1: 'Electrician in Bath', body: '<p>We work across Bath from our Bristol base, including the Georgian terraces around the Circus where older wiring is common.</p><p>' + lorem('bath') + '</p>' },
  '/contact/': { title: 'Contact Example Electrical', h1: 'Contact us' },
  '/privacy/': { title: 'Privacy policy | Example Electrical', h1: 'Privacy' },
};
const ROBOTS = 'User-agent: *\nAllow: /\n\nSitemap: ' + O + '/sitemap-index.xml\n';
const HEADERS = 'https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n';
function site(over: { pages?: Record<string, Page | null>; robots?: string | null; headers?: string; redirects?: string; sitemapPaths?: string[]; sitemapHost?: string; llms?: boolean; extraFiles?: string[] } = {}) {
  const defs: Record<string, Page | null> = { ...GOOD, ...(over.pages ?? {}) };
  const pages = new Map<string, string>();
  for (const [p, d] of Object.entries(defs)) if (d) pages.set(p, html(p, d));
  const paths = over.sitemapPaths ?? [...pages.keys()];
  const host = over.sitemapHost ?? O;
  const sitemaps = new Map([
    ['/sitemap-index.xml', '<sitemapindex><sitemap><loc>' + O + '/sitemap-0.xml</loc></sitemap></sitemapindex>'],
    ['/sitemap-0.xml', '<urlset>' + paths.map((p) => '<url><loc>' + host + p + '</loc></url>').join('') + '</urlset>'],
  ]);
  return { mode: 'dist', pages, files: new Set(['/favicon.ico', '/images/van.webp', ...(over.extraFiles ?? [])]), sizes: new Map(), sitemaps,
    robots: over.robots === undefined ? ROBOTS : over.robots, headers: over.headers ?? HEADERS, redirects: over.redirects ?? '/old-rewire/ /services/rewiring/ 301\n', llms: !!over.llms, live: null };
}
const EXPECT = {
  domain: D, businessName: 'Example Electrical', phone: '01179 000111', email: 'hello@example-electrical.co.uk',
  services: [{ name: 'House rewiring', page: '/services/rewiring/' }, { name: 'EICR', page: '/services/eicr/' }], locations: [{ name: 'Bath', page: '/areas/bath/' }],
  intents: [
    { intent: 'House rewiring', service: 'rewiring', page: '/services/rewiring/', source: 'service' },
    { intent: 'Bath', town: 'Bath', page: '/areas/bath/', source: 'location' },
    { intent: 'Baseline: who can do an EICR for my rental flat in Bristol', service: 'EICR', page: '/services/eicr/', source: 'baseline', question: 'Who can do an EICR for my rental flat in Bristol?' },
  ],
};
type Report = ReturnType<typeof auditSite>;
const lvl = (r: Report, id: string) => r.checks.find((c: { id: string }) => c.id === id)?.level;
const det = (r: Report, id: string) => (r.checks.find((c: { id: string }) => c.id === id)?.details ?? []).join(' | ');
const run = (s: ReturnType<typeof site>, o: Record<string, unknown> = {}) => auditSite(s, { domain: D, ...o });

/* ── A ── */
{
  const r = run(site());
  const fails = r.checks.filter((c: { level: string }) => c.level === 'fail');
  ok(r.passed && fails.length === 0, 'A: the good fixture passes (fails: ' + fails.map((c: { id: string; details: string[] }) => c.id + ' ' + c.details[0]).join('; ') + ')');
  ok(lvl(r, 'identity') === 'skip' && lvl(r, 'intents') === 'skip', 'A: without --expect, identity and intents are SKIP — never pass');
  ok(r.humanReview.length >= 5 && r.humanReview.some((h: string) => /true TODAY/.test(h)), 'A: the human-review list is always printed');
  const e = run(site(), { expect: EXPECT });
  ok(e.passed && lvl(e, 'identity') !== 'fail' && lvl(e, 'intents') !== 'fail', 'A: with the Site Intent Map the good fixture still passes (' + det(e, 'intents') + det(e, 'identity') + ')');
  ok(run(site(), { domain: '' }).passed === false, 'A: no domain → the gate fails rather than guessing');
}

/* ── B crawl ── */
{
  ok(lvl(run(site({ headers: '/*\n  X-Robots-Tag: noindex\n' })), 'noindex') === 'fail', 'B: a blanket "/*" X-Robots-Tag noindex in _headers FAILS (the old MCL template repo)');
  ok(lvl(run(site()), 'noindex') === 'pass', 'B: noindex scoped to https://:project.pages.dev/* passes');
  ok(lvl(run(site({ headers: 'https://' + D + '/*\n  X-Robots-Tag: noindex\n' })), 'noindex') === 'fail', 'B: noindex on the production host fails');
  ok(lvl(run(site({ pages: { '/services/eicr/': { ...GOOD['/services/eicr/'], robots: 'noindex, follow' } } })), 'noindex') === 'fail', 'B: a robots meta noindex on a real page fails');
  ok(lvl(run(site({ robots: 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: ' + O + '/sitemap-index.xml' })), 'robots') === 'fail', 'B: robots.txt blocking OAI-SearchBot fails');
  ok(lvl(run(site({ robots: null })), 'robots') === 'fail', 'B: no robots.txt fails');
  ok(lvl(run(site({ robots: 'User-agent: *\nAllow: /\nSitemap: https://preview.x.pages.dev/sitemap.xml' })), 'robots') === 'fail', 'B: a Sitemap line off the production domain fails');
  const gpt = run(site({ robots: ROBOTS + '\nUser-agent: GPTBot\nDisallow: /\n' }));
  ok(lvl(gpt, 'robots') === 'warn' && /GPTBot/.test(det(gpt, 'robots')), 'B: a training-crawler block is a WARNING (a client choice), not a fail');
  ok(lvl(run(site({ sitemapPaths: ['/', '/services/'] })), 'sitemap') === 'fail', 'B: an indexable page missing from the sitemap fails');
  ok(lvl(run(site({ sitemapHost: 'https://www.' + D })), 'sitemap') === 'fail', 'B: sitemap URLs on the www host (not canonical) fail');
  ok(lvl(run(site({ sitemapPaths: [...Object.keys(GOOD), '/old-rewire/'] })), 'sitemap') === 'fail', 'B: a sitemap URL that is not built / is redirected fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], canonical: O + '/' } } })), 'canonical') === 'fail', 'B: a canonical pointing at another page fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], canonical: null } } })), 'canonical') === 'fail', 'B: a missing canonical fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], canonical: O + '/contact' } } })), 'canonical') === 'fail', 'B: a canonical that differs by the trailing slash fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p>See <a href="https://preview.example.pages.dev/">the preview</a>.</p>' } } })), 'domain') === 'fail', 'B: a pages.dev address in a page fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p><a href="https://oldsite.co.uk/contact">old</a></p>' } } }), { forbidHosts: ['oldsite.co.uk'] }), 'domain') === 'fail', 'B: a forbidden (old-site) host fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<script>var x="http://localhost:4321/"</script><p>' + lorem('c') + '</p>' } } })), 'domain') === 'pass', 'B: a dev address inside a SCRIPT bundle is not page content (Wix bundles, live ABLM)');
}

/* ── C links ── */
{
  const broken = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p><a href="/services/solar/">Solar</a> ' + lorem('c') + '</p>' } } }));
  ok(lvl(broken, 'links') === 'fail' && /solar/.test(det(broken, 'links')), 'C: a link to a page that is not built fails');
  ok(lvl(run(site({ pages: { '/orphan/': { title: 'Orphan page | Example Electrical', h1: 'Orphan' } }, sitemapPaths: [...Object.keys(GOOD), '/orphan/'] })), 'orphans') === 'fail', 'C: a page nothing links to fails as an orphan');
  const hop = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p><a href="/old-rewire/">rewiring</a> ' + lorem('c') + '</p>' } } }));
  ok(lvl(hop, 'links') === 'warn' && /redirect/.test(det(hop, 'links')), 'C: a link to a redirect source is a warning (link the target)');
  const cf = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p><a href="/cdn-cgi/l/email-protection#abc">email</a> ' + lorem('c') + '</p>' } } }));
  ok(lvl(cf, 'links') === 'warn' && /Obfuscation/.test(det(cf, 'links')), 'C: Cloudflare email obfuscation is named (crawlers cannot read the email), not a broken link');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p><a href="/images/van.webp">van</a> ' + lorem('c') + '</p>' } } })), 'links') === 'pass', 'C: a link to a built file resolves');
}

/* ── D SEO ── */
{
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], title: GOOD['/services/'].title } } })), 'titles') === 'fail', 'D: a duplicate title fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], desc: '' } } })), 'descriptions') === 'fail', 'D: a missing meta description fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<h1>Second</h1><p>' + lorem('c') + '</p>' } } })), 'headings') === 'fail', 'D: two H1s on one page fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], h1: GOOD['/services/eicr/'].h1 } } })), 'headings') === 'fail', 'D: the same H1 on two pages fails (competing pages)');
  const jump = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<h3>Skipped</h3><p>' + lorem('c') + '</p>' } } }));
  ok(lvl(jump, 'headings') === 'warn', 'D: a heading that skips a level is a warning');
  const town = (t: string) => ({ title: 'Electrician in ' + t + ' | Example Electrical', h1: 'Electrician in ' + t, body: '<p>' + lorem('same').replace(/same/g, t) + '</p>' });
  const clone = run(site({ pages: { '/areas/bath/': town('Bath'), '/areas/keynsham/': town('Keynsham') }, sitemapPaths: [...Object.keys(GOOD), '/areas/keynsham/'] }), { expect: { ...EXPECT, locations: [{ name: 'Bath', page: '/areas/bath/' }, { name: 'Keynsham', page: '/areas/keynsham/' }] } });
  ok(lvl(clone, 'duplicates') === 'fail' && /keynsham/.test(det(clone, 'duplicates')), 'D: two town pages that differ only by the town name FAIL as cloned');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p>Lorem ipsum dolor ' + lorem('c') + '</p>' } } })), 'placeholders') === 'fail', 'D: placeholder copy fails');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p>[CLIENT CONFIRM] ' + lorem('c') + '</p>' } } })), 'placeholders') === 'fail', 'D: a page-generator [CLIENT CONFIRM] blank fails');
  ok(lvl(run(site({ llms: true })), 'placeholders') === 'warn', 'D: a published llms.txt is a warning (not a default tactic)');
  ok(lvl(run(site({ pages: { '/contact/': { ...GOOD['/contact/'], extraHead: '<meta name="viewport" content="width=1200">' } } })), 'mobile') !== 'fail', 'D: (a second viewport tag does not crash the check)');
}

/* ── E entity ── */
{
  const rating = run(site({ pages: { '/': { ...GOOD['/'], ld: [{ ...BIZ, aggregateRating: { '@type': 'AggregateRating', ratingValue: 5, reviewCount: 138 } }] } } }));
  ok(lvl(rating, 'schema') === 'fail' && /rating/i.test(det(rating, 'schema')), 'E: AggregateRating schema FAILS — genuine reviews are visible content only');
  ok(lvl(run(site({ pages: { '/': { ...GOOD['/'], ld: [{ '@type': 'Organization', name: 'Example Electrical' }] } } })), 'schema') === 'fail', 'E: only an Organization (no LocalBusiness subtype) on the home page fails');
  const two = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], ld: [{ ...BIZ, '@id': O + '/#org' }] } } }));
  ok(lvl(two, 'schema') === 'fail' && /2 different business entities/.test(det(two, 'schema')), 'E: two business @ids fail (one entity everywhere)');
  const bad = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], extraHead: '<script type="application/ld+json">{not json</script>' } } }));
  ok(lvl(bad, 'schema') === 'fail', 'E: JSON-LD that does not parse fails');
  const plain = run(site({ pages: { '/': { ...GOOD['/'], ld: [{ ...BIZ, '@type': 'LocalBusiness' }] } } }));
  ok(lvl(plain, 'schema') === 'warn' && /subtype/.test(det(plain, 'schema')), 'E: plain LocalBusiness where a trade subtype exists is a warning');
  const wrongName = run(site(), { expect: { ...EXPECT, businessName: 'Example Electrical Ltd Bristol' } });
  ok(lvl(wrongName, 'schema') === 'fail', 'E: schema name ≠ the approved business name fails');
  const crumb = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], ld: [{ '@graph': [{ '@id': BIZ['@id'] }, { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, item: O + '/nowhere/' }] }] }] } } }));
  ok(lvl(crumb, 'schema') === 'fail' && /breadcrumb/.test(det(crumb, 'schema')), 'E: a breadcrumb item that is not a built page fails');
}

/* ── F identity + intents ── */
{
  const tel = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p>Call <a href="tel:07700111222">07700 111222</a> ' + lorem('c') + '</p>' } } }), { expect: EXPECT });
  ok(lvl(tel, 'identity') === 'fail' && /07700111222/.test(det(tel, 'identity')), 'F: a tel: link to a number that is not the approved phone fails');
  const mail = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], body: '<p><a href="mailto:morgan@other.com">mail</a> ' + lorem('c') + '</p>' } } }), { expect: EXPECT });
  ok(lvl(mail, 'identity') === 'fail', 'F: an email that is not the approved email fails');
  const noSvc = run(site(), { expect: { ...EXPECT, intents: [{ intent: 'Solar panels', service: 'Solar panels', page: '/services/eicr/', source: 'service' }] } });
  ok(lvl(noSvc, 'intents') === 'fail' && /does not state the service/.test(det(noSvc, 'intents')), 'F: an owning page that never states its service fails');
  const noPage = run(site(), { expect: { ...EXPECT, intents: [{ intent: 'Boilers', page: '', source: 'service' }] } });
  ok(lvl(noPage, 'intents') === 'fail', 'F: an intent with no owning page assigned fails');
  const missing = run(site(), { expect: { ...EXPECT, intents: [{ intent: 'Solar', page: '/services/solar/', source: 'service' }] } });
  ok(lvl(missing, 'intents') === 'fail', 'F: an intent whose page is not built fails');
  const town = run(site(), { expect: { ...EXPECT, intents: [{ intent: 'Keynsham', town: 'Keynsham', page: '/areas/bath/', source: 'location' }] } });
  ok(lvl(town, 'intents') === 'fail' && /Keynsham/.test(det(town, 'intents')), 'F: a location owner that never states the place fails');
  const q = EXPECT.intents[2].question!;
  const parrot = run(site({ pages: { '/services/eicr/': { ...GOOD['/services/eicr/'], h1: q } } }), { expect: EXPECT });
  ok(lvl(parrot, 'intents') === 'fail' && /verbatim/.test(det(parrot, 'intents')), 'F: a baseline question copied verbatim as the H1 FAILS — answer it, never parrot it');
  const compete = run(site({ pages: { '/contact/': { ...GOOD['/contact/'], h1: 'House rewiring quotes' } } }), { expect: EXPECT });
  ok(/possible competition/.test(det(compete, 'intents')), 'F: another page leading with the same intent is named as possible competition');
}

/* ── G parsers ── */
{
  const r = 'User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\nAllow: /\n';
  ok(!robotsAllows(r, 'GPTBot') && !robotsAllows(r, 'CCBot') && robotsAllows(r, 'OAI-SearchBot') && !robotsAllows(r, '*', '/private/x'), 'G: robots groups share rules across stacked user agents; the longest rule wins');
  ok(robotsAllows('User-agent: *\nDisallow:\n', 'OAI-SearchBot'), 'G: an empty Disallow allows everything');
  const h = parseHeaders('# c\n/*\n  X-Robots-Tag: noindex\nhttps://:project.pages.dev/*\n  X-Robots-Tag: noindex\n');
  ok(h.length === 2 && h[0].pattern === '/*' && h[0].headers[0].name === 'x-robots-tag', 'G: _headers rules and their headers');
  const rd = parseRedirects('# old\n/a /b 301\n/c/*  /d/:splat  302\n');
  ok(rd.length === 2 && rd[1].status === 302, 'G: _redirects lines');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
