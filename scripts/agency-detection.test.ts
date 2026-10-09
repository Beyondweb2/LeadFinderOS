/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHO RUNS THEIR WEBSITE? — the agency check (2026-10-01, docs/agency-detection.md). Fixture pages and a
   fake fetch only: no network. The rules (src/lib/agencyDetect.ts), the crawl's limits
   (_shared/agency-crawl.ts), the cache rules and filters (src/lib/agencyCheck.ts), and the wiring.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { classifyAgency, selectSamplePages, AGENCY_DEPRIORITISE_CONFIDENCE, AGENCY_CHECK_VERSION, type AgencyPage } from '../src/lib/agencyDetect.ts';
import { agencyCheckDomain, agencyCellText, isCheckFresh, isHighConfidenceAgency, passesSiteFilter, siteStateOf } from '../src/lib/agencyCheck.ts';
import { crawlForAgency, AGENCY_CRAWLER_UA, AGENCY_MAX_REQUESTS } from '../supabase/functions/_shared/agency-crawl.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** The code without its comments (a comment saying "never X" must not read as X). */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SITE = 'https://www.acmeplumbing.co.uk/';
const body = (main: string, footer: string, head = '') => `<!doctype html><html><head><title>Acme Plumbing</title>${head}</head><body><header>Acme Plumbing</header><main><h1>Plumbers in Leeds</h1><p>${'We fix boilers, leaks and bathrooms across Leeds and the surrounding areas. '.repeat(12)}</p>${main}</main><footer>${footer}</footer></body></html>`;
const page = (path: string, footer: string, head = '', main = ''): AgencyPage => ({ url: `https://www.acmeplumbing.co.uk${path}`, html: body(main, footer, head) });
const WP_HEAD = '<link rel="stylesheet" href="/wp-content/themes/astra/style.css"><meta name="generator" content="WordPress 6.4">';

console.log('── 1. THE VERDICT ──');
{
  const v = classifyAgency([page('/', '© 2026 Acme Plumbing. Website by Bright Digital.')], SITE);
  ok(v.classification === 'agency_likely' && v.agency === 'Bright Digital', 'explicit footer credit → Agency likely');
  ok(v.evidence.some((e) => /Website by Bright Digital/.test(e)), '…with the credit as evidence, in plain words');
}
{
  const foot = '© 2026 Acme Plumbing | Website by <a href="https://brightdigital.co.uk">Bright Digital</a>';
  const v = classifyAgency([page('/', foot), page('/contact', foot), page('/about', foot)], SITE);
  ok(v.classification === 'agency_likely' && v.confidence >= 90 && v.agencyDomain === 'brightdigital.co.uk', `credit + agency link, sitewide → high confidence (${v.confidence}%)`);
  ok(isHighConfidenceAgency({ classification: v.classification, confidence: v.confidence }) && v.confidence >= AGENCY_DEPRIORITISE_CONFIDENCE, '…high enough to be flagged and sorted last');
  ok(v.evidence.some((e) => /brightdigital\.co\.uk/.test(e)) && v.evidence.some((e) => /Seen on 3 of 3 pages/.test(e)), '…evidence names the domain and that it is on every page checked');
}
{
  const v = classifyAgency([page('/', '© Acme Plumbing', WP_HEAD), page('/contact', '© Acme Plumbing', WP_HEAD)], SITE);
  ok(v.classification === 'no_evidence' && v.platform === 'WordPress', 'WordPress only → NOT Agency likely (no agency evidence)');
  ok(v.evidence.some((e) => /WordPress — a platform, not evidence/.test(e)), '…the platform is shown as context only');
}
{
  const wix = '<script src="https://static.wixstatic.com/x.js"></script>';
  const v = classifyAgency([page('/', '© Acme Plumbing', wix)], SITE);
  ok(v.classification !== 'agency_likely' && v.platform === 'Wix', 'Wix only → NOT Agency likely');
}
{
  ok(classifyAgency([page('/', 'Proudly powered by WordPress')], SITE).classification === 'no_evidence', '"Powered by WordPress" is not a credit');
  ok(classifyAgency([page('/', 'Website by Wix.com')], SITE).classification === 'no_evidence', '"Website by Wix" is the platform, not an agency');
  ok(classifyAgency([page('/', 'Website designed and built by Acme Plumbing')], SITE).classification === 'no_evidence', 'a business crediting itself is not an agency');
}
{
  const one = classifyAgency([page('/', '<a href="https://pixelpushersdesign.co.uk">Partners</a>')], SITE);
  ok(one.classification === 'no_evidence', 'one weak sign (a footer link to a design-named domain) is never enough');
  const two = classifyAgency([page('/', '<a href="https://pixelpushersdesign.co.uk">Partners</a>', '<link rel="stylesheet" href="/wp-content/themes/pixelpushersdesign-theme/style.css">')], SITE);
  ok(two.classification === 'agency_likely' && two.confidence < AGENCY_DEPRIORITISE_CONFIDENCE, `two independent signs naming the same supplier → Agency likely, lower confidence (${two.confidence}%)`);
  const mixed = classifyAgency([page('/', '<a href="https://pixelpushersdesign.co.uk">Partners</a>', '<link rel="stylesheet" href="/wp-content/themes/brightmedia-child/style.css">')], SITE);
  ok(mixed.classification === 'no_evidence', 'two weak signs pointing at DIFFERENT names do not add up');
}
{
  const v = classifyAgency([page('/', '© 2026 Acme Plumbing'), page('/contact', '© 2026 Acme Plumbing'), page('/about', '© 2026 Acme Plumbing'), page('/services', '© 2026 Acme Plumbing')], SITE);
  ok(v.classification === 'no_evidence' && v.confidence >= 70 && v.confidence <= 80, `no agency signal on 4 pages → No agency evidence (${v.confidence}%), never "self-managed"`);
  ok(agencyCellText(v) === `No agency evidence · ${v.confidence}%`, 'the cell reads "No agency evidence · N%"');
}
{
  const cmt = classifyAgency([{ url: SITE, html: body('', '© Acme', '<!-- Website developed by Northern Web Co. www.northernweb.co.uk -->') }], SITE);
  ok(cmt.classification === 'agency_likely', 'a developer note in the page source counts');
  const tool = classifyAgency([{ url: SITE, html: body('', '© Acme', '<!-- This site is optimized with the Yoast SEO plugin, built by Team Yoast -->') }], SITE);
  ok(tool.classification === 'no_evidence', 'a plugin\'s "by" note does not');
}
ok(classifyAgency([], SITE, 'The site blocked the check').classification === 'unknown', 'nothing readable → Unknown, with the reason');
{
  /* Found in the 50-site measurement: a relative page link read as a domain; a builder's CDN read as a supplier. */
  const rel = classifyAgency([page('/', '<a href="bathroom-design-and-installation-leeds.html">Bathroom design</a>')], SITE);
  ok(!rel.evidence.some((e) => /bathroom-design/.test(e)), 'a relative footer link is the site itself, never a supplier domain');
  const cdn = classifyAgency([page('/', '© Acme', '<script src="https://irp.cdn-website.com/x.js"></script><link href="https://assets.website-files.com/a.css">')], SITE);
  ok(!cdn.evidence.some((e) => /cdn-website|website-files/.test(e)), "a site builder's own file servers (Duda, Webflow) are not a supplier");
  const seo = classifyAgency([page('/', 'All rights reserved | <a href="https://www.poddigital.co.uk/seo-leicester">SEO</a> by <a href="https://www.poddigital.co.uk">Pod Digital</a>')], SITE);
  ok(seo.classification === 'agency_likely' && seo.agencyDomain === 'poddigital.co.uk', '"SEO by Pod Digital", linked → Agency likely');
  ok(classifyAgency([page('/', 'Hosted by 123-reg')], SITE).classification === 'no_evidence', '"Hosted by …" alone is a host, not a supplier');
}

console.log('── 2. THE CRAWL (fake fetch) ──');
type Route = { status?: number; type?: string; body: string; url?: string };
const fakeFetch = (routes: Record<string, Route>, calls: string[]) => async (url: string) => {
  calls.push(url);
  const r = routes[url] ?? { status: 404, body: 'not found', type: 'text/html' };
  const res = new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'text/html' } });
  Object.defineProperty(res, 'url', { value: r.url ?? url });
  return res;
};
{
  const foot = 'Website by <a href="https://brightdigital.co.uk">Bright Digital</a>';
  const routes: Record<string, Route> = {
    'https://www.acmeplumbing.co.uk/': { body: body('<a href="/contact">Contact</a><a href="/about-us">About</a>', foot) },
    'https://www.acmeplumbing.co.uk/robots.txt': { type: 'text/plain', body: 'User-agent: *\nSitemap: https://www.acmeplumbing.co.uk/sitemap_index.xml' },
    'https://www.acmeplumbing.co.uk/sitemap_index.xml': { type: 'application/xml', body: '<sitemapindex><sitemap><loc>https://www.acmeplumbing.co.uk/page-sitemap.xml</loc></sitemap></sitemapindex>' },
    'https://www.acmeplumbing.co.uk/page-sitemap.xml': { type: 'application/xml', body: ['/', '/contact', '/about-us', '/services', '/boiler-repair', '/blog/2024/01/hello', '/privacy-policy', '/gallery', '/reviews', '/areas'].map((p) => `<url><loc>https://www.acmeplumbing.co.uk${p}</loc></url>`).join('').replace(/^/, '<urlset>') + '</urlset>' },
  };
  for (const p of ['/contact', '/about-us', '/services', '/boiler-repair', '/gallery', '/reviews', '/areas', '/blog/2024/01/hello']) routes[`https://www.acmeplumbing.co.uk${p}`] = { body: body('', foot) };
  const calls: string[] = [];
  const r = await crawlForAgency('https://www.acmeplumbing.co.uk/boilers?utm_source=gmb', fakeFetch(routes, calls));
  ok(calls[0] === 'https://www.acmeplumbing.co.uk/', 'starts at the homepage, without the deep path or tracking codes');
  ok(calls.includes('https://www.acmeplumbing.co.uk/robots.txt') && calls.includes('https://www.acmeplumbing.co.uk/page-sitemap.xml'), 'reads robots.txt, then the declared sitemap index and its page sitemap');
  ok(r.stats.requests <= AGENCY_MAX_REQUESTS && calls.length === r.stats.requests, `never more than ${AGENCY_MAX_REQUESTS} requests (${r.stats.requests})`);
  ok(calls.some((u) => u.endsWith('/contact')) && calls.some((u) => u.endsWith('/about-us')) && calls.some((u) => u.endsWith('/services')) && calls.filter((u) => /privacy|terms|legal|credits/.test(u)).length <= 1, 'samples contact, about and a service page, and at most ONE legal / credits page (v2, read for "this website was designed by")');
  ok(r.verdict.classification === 'agency_likely' && r.verdict.confidence >= 90, 'and reaches the verdict');
}
{
  /* ⛔ Paul, 2026-10-01: the crawler names itself; it is never disguised as a person's browser. */
  const seen: string[] = [];
  await crawlForAgency(SITE, async (_u: string, init?: RequestInit) => { seen.push(String((init?.headers as Record<string, string>)?.['User-Agent'] ?? '')); return new Response('Forbidden', { status: 403 }); });
  ok(seen.length > 0 && seen.every((ua) => ua === AGENCY_CRAWLER_UA) && /LeadFinderOS-SiteCheck/.test(AGENCY_CRAWLER_UA) && !/Chrome|Safari|Windows NT/.test(AGENCY_CRAWLER_UA), 'every request carries the honest crawler name, never a browser identity');
}
{
  const calls: string[] = [];
  const r = await crawlForAgency(SITE, fakeFetch({ [SITE]: { status: 403, body: 'Forbidden' } }, calls));
  ok(r.verdict.classification === 'unknown' && /blocked/.test(r.verdict.failure ?? ''), 'a blocked site → Unknown ("blocked")');
  const ch = await crawlForAgency(SITE, fakeFetch({ [SITE]: { body: '<html><head><title>Just a moment...</title></head><body>challenge</body></html>' } }, []));
  ok(ch.verdict.classification === 'unknown', 'a bot-challenge page → Unknown');
  const js = await crawlForAgency(SITE, fakeFetch({ [SITE]: { body: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>' } }, []));
  ok(js.verdict.classification === 'unknown' && /script/.test(js.verdict.failure ?? ''), 'a script-only page → Unknown, never "no evidence"');
  const moved = await crawlForAgency(SITE, fakeFetch({ [SITE]: { body: body('', 'Domain for sale'), url: 'https://expireddomains.com/domain/acmeplumbing.co.uk' } }, []));
  ok(moved.verdict.classification === 'unknown' && /different website/.test(moved.verdict.failure ?? ''), 'a redirect to a different domain (expired, moved) → Unknown');
}
{
  const picked = selectSamplePages(SITE, ['https://www.acmeplumbing.co.uk/contact-us', 'https://www.acmeplumbing.co.uk/about', 'https://www.acmeplumbing.co.uk/services/boilers', 'https://other.com/x', 'https://www.acmeplumbing.co.uk/wp-admin/', 'https://www.acmeplumbing.co.uk/image.jpg', 'https://www.acmeplumbing.co.uk/?p=1'], 6);
  ok(picked[0].endsWith('/contact-us') && picked[1].endsWith('/about') && picked[2].endsWith('/services/boilers') && picked.length === 3, 'page choice: contact, about, service; never another site, admin pages, files or queries');
}

console.log('── 3. CACHE, DOMAINS, FILTERS ──');
const now = Date.parse('2026-10-20T12:00:00Z');
const row = (daysAgo: number, extra: Record<string, unknown> = {}) => ({ version: AGENCY_CHECK_VERSION, status: 'ok' as const, checked_at: new Date(now - daysAgo * 86_400_000).toISOString(), ...extra });
ok(isCheckFresh(row(10), now) && !isCheckFresh(row(31), now), 'a check is reused for 30 days, then done again (no unnecessary re-crawl)');
ok(isCheckFresh(row(0.5, { status: 'failed' }), now) && !isCheckFresh(row(2, { status: 'failed' }), now), 'a failed check is retried after a day');
ok(!isCheckFresh(row(1, { version: AGENCY_CHECK_VERSION - 1 }), now), 'a check made under older rules is done again');
ok(agencyCheckDomain('https://www.acme.co.uk/contact?utm=x') === agencyCheckDomain('http://acme.co.uk') && agencyCheckDomain('acme.co.uk') === 'acme.co.uk', 'one cache key per site: www / path / query / http do not matter');
ok(agencyCheckDomain('https://acme-new.co.uk') !== agencyCheckDomain('https://acme.co.uk'), 'a changed domain is a new key → checked fresh at once');
ok(agencyCheckDomain('https://www.facebook.com/acme') === null && agencyCheckDomain('https://www.yell.com/biz/acme') === null && agencyCheckDomain('') === null, 'a directory / social listing or a blank is never crawled');
ok(siteStateOf(false, null) === 'no_website' && siteStateOf(true, null) === null && siteStateOf(true, { classification: 'agency_likely' }) === 'agency_likely', 'each result has one site state (no website / not checked yet / its class)');
ok(passesSiteFilter('all', null) && passesSiteFilter('agency_likely', 'agency_likely') && !passesSiteFilter('agency_likely', 'no_evidence') && passesSiteFilter('no_website', 'no_website') && !passesSiteFilter('unknown', null), 'the filter shows exactly its state; one still checking shows under All only');

console.log('── 4. WIRING ──');
const table = read('src/components/LeadsTable.tsx');
ok(/<TableHead[^>]*>Site management<\/TableHead>/.test(table) && /<SiteManagementCell row=\{agency\.rowFor\(lead\.websiteUrl\)\}/.test(table), 'Find Leads has its own Site management column');
ok(/SITE_FILTERS\.map/.test(table) && /passesSiteFilter\(siteFilter, siteStateOf\(hasOwnSite\(lead\), agency\.rowFor\(lead\.websiteUrl\)\)\)/.test(table), 'and a site-management filter');
// 2026-10-02: the order also waits for the Companies House check (ch.pending) and lifts new strong matches
// within the non-agency rows; agency sites are still last and still never hidden.
ok(/if \(agency\.pending > 0\) return shown;\s*const last = shown\.filter\(\(l\) => highAgency\(l\)\);\s*const rest = shown\.filter\(\(l\) => !highAgency\(l\)\);\s*return \[[^\]]*\.\.\.last\];/.test(table),'high-confidence agency sites sort last once the checks finish (rows never jump mid-check), never hidden');
ok(/const selectAllPool = useMemo\(\(\) => selectableLeads\.filter\(\(l\) => !highAgency\(l\)\)/.test(table), '"Select all" leaves them out (they can still be ticked one by one)');
ok(table.includes('onClick={() => runBulkAdd(selectAllPool)}') && table.includes('Add all shown ({selectAllPool.length})'), '"Add all shown" leaves them out too, and says so');
ok(agencyCellText({ classification: 'agency_likely', confidence: 92 }, true) === 'Agency · 92%' && agencyCellText({ classification: 'no_evidence', confidence: 78 }, true) === 'No agency · 78%', 'on a phone the pill is short, so the confidence is never the part cut off');
const hook = read('src/hooks/useAgencyChecks.ts');
ok(/AGENCY_CONCURRENCY = 8/.test(hook) && /Array\.from\(\{ length: Math\.min\(AGENCY_CONCURRENCY, todo\.length\) \}, worker\)/.test(hook), '8 sites at a time; each updates as it finishes');
ok(/from\('website_agency_checks'\)\.select\(COLUMNS\)\.in\('domain'/.test(hook) && /isCheckFresh\(r, now\)/.test(hook), 'stored fresh checks are read first and never re-crawled');
const fn = read('supabase/functions/agency-check/index.ts');
ok(/guardAction\(service, who\.actor\.id, "site_scrape"/.test(fn) && /isCheckFresh\(cached, Date\.now\(\)\)/.test(fn), 'the function answers from the cache when fresh; a crawl counts against the free site_scrape guard');
ok(!/outreach_leads|website_control|openai|gemini|apify/i.test(code('supabase/functions/agency-check/index.ts') + code('supabase/functions/_shared/agency-crawl.ts')), 'it writes only its cache: never a lead, never website_control, no AI, nothing paid');
ok(/\[functions\.agency-check\]\nverify_jwt = true/.test(read('supabase/config.toml')), 'config.toml lists the new function');
const det = read('src/components/DetectedAgency.tsx');
ok(/const undecided = !websiteControl \|\| websiteControl === 'unknown';/.test(det) && /onConfirm/.test(det) && /onReject/.test(det) && !/lead_set_website_control|\.rpc\(|\.update\(/.test(code('src/components/DetectedAgency.tsx')), 'the lead shows "Detected: …" until a person decides; the machine never sets "Agency runs their site"');
const crm = read('src/components/LeadCrmPanel.tsx');
ok(/onConfirm=\{\(\) => void save\('lead_set_website_control', \{ _value: 'agency_controls'/.test(crm) && /onReject=\{\(\) => void save\('lead_set_website_control', \{ _value: 'client_controls'/.test(crm), 'Confirm agency / Not agency save through the one website-control write (History)');
const mig = read('supabase/migrations/20261003100100_website_agency_checks.sql');
ok(/enable row level security/.test(mig) && /for select to authenticated using \(\(select public\.my_role\(\)\) is not null\)/.test(mig) && /revoke insert, update, delete, truncate on public\.website_agency_checks from anon, authenticated/.test(mig), 'the cache: team members read it; only the function writes it');

console.log('── v2 (2026-10-02): BETTER EVIDENCE, SAME CAUTION ──');
{
  ok(AGENCY_CHECK_VERSION === 2, 'the rules version is 2 — every v1 result is checked again under the new rules');
  // The FIRST <footer> is a testimonial's; the site footer (with the credit) comes after it.
  const twoFooters = { url: SITE, html: body('<blockquote>Great job<footer>— Mrs Smith, Leeds</footer></blockquote>', '© 2026 Acme. Website by Bright Digital') };
  ok(classifyAgency([twoFooters], SITE).agency === 'Bright Digital', 'a credit in the SITE footer is found when an earlier <footer> (a testimonial) comes first');
  const bar = { url: SITE, html: body('', '© 2026 Acme Plumbing').replace('</body>', '<div class="bottom-bar">Website by Bright Digital</div></body>') };
  ok(classifyAgency([bar], SITE).classification === 'agency_likely', 'a credit in a bottom bar after the footer is found');
  ok(classifyAgency([page('/', 'Theme by Astra. Website by Bright Digital.')], SITE).agency === 'Bright Digital', 'every credit is tried: a rejected first one ("by Astra") no longer hides the real one');
  const wrapped = classifyAgency([page('/', '© Acme <a href="https://www.brightdigital.co.uk/">Website by Bright Digital</a>')], SITE);
  ok(wrapped.classification === 'agency_likely' && wrapped.agencyDomain === 'brightdigital.co.uk' && wrapped.confidence >= 88, `a link that IS the credit carries its domain (${wrapped.confidence}%)`);
  const titled = classifyAgency([page('/', '<a href="https://brightdigital.co.uk" title="Web design by Bright Digital"><img src="/logo.png" alt="Bright Digital"></a>')], SITE);
  ok(titled.classification === 'agency_likely' && titled.agencyDomain === 'brightdigital.co.uk', 'a logo link whose title says "Web design by …" counts');
  const logoOnly = classifyAgency([page('/', '<a href="https://www.seoexperts.co.uk"><img src="/seo.png" alt="SEO Experts"></a>')], SITE);
  ok(logoOnly.classification === 'no_evidence', 'a logo-only link with no credit words is still never enough (the known miss stays a miss)');
  ok(classifyAgency([page('/', 'Website by <a href="https://wordpress.org">WordPress</a>')], SITE).classification === 'no_evidence', 'a link credit to the platform is still the platform');
  const sentence = classifyAgency([page('/', '© Acme', '', '<p>This website was designed and built by Bright Digital.</p>')], SITE);
  ok(sentence.classification === 'agency_likely' && sentence.agency === 'Bright Digital', '"This website was designed and built by …" in the page counts');
  ok(classifyAgency([page('/', '© Acme', '', '<p>Every kitchen is designed by our team and built by Acme Joinery.</p>')], SITE).classification === 'no_evidence', 'but "designed by our team" about their work never does');
  ok(classifyAgency([page('/', '© Acme', '', '<p>Our website is managed by Acme Plumbing.</p>')], SITE).classification === 'no_evidence', '…nor the business naming itself');
  const noisy = classifyAgency([page('/', 'Website design and SEO by Thisworks 68 64 CLICK TO CALL')], SITE);
  ok(noisy.agency === 'Thisworks', `a credit's name stops before footer noise (got "${noisy.agency}")`);
  const slash = classifyAgency([page('/', '<p>Website built by Lab Creative / Digi Guru</p><ul class="social"><li>twitter</li></ul>')], SITE);
  ok(slash.agency === 'Lab Creative', `"Website built by Lab Creative / Digi Guru" names Lab Creative (got "${slash.agency}")`);
  const noFooterEl = { url: SITE, html: body('', '').replace(/<footer><\/footer>/, '<div id="footer-right"><p>Website hosted and managed by <br> <a href="https://www.zestandpunch.com">Zest &amp; Punch</a></p></div>').replace('</body>', `<script>${'var x=1;'.repeat(4000)}</script><style>${'.a{b:c}'.repeat(3000)}</style></body>`) };
  ok(classifyAgency([noFooterEl], SITE).agencyDomain === 'zestandpunch.com', 'no <footer> element and big scripts after the footer: the credit is still found (the tail is measured without scripts)');
  const dup = classifyAgency([page('/', '<a href="https://thisworks.co.uk">Website design and SEO by Thisworks</a>'), page('/about', 'Website design and SEO by Thisworks')], SITE);
  ok(dup.evidence.filter((e) => /^Footer:/.test(e)).length === 1, 'one footer-credit line in the evidence, not one per wording');
  const legal = selectSamplePages(SITE, ['/privacy-policy', '/terms', '/site-credits', '/contact', '/about', '/services', '/gallery'].map((p) => `https://www.acmeplumbing.co.uk${p}`), 7);
  ok(legal.filter((u) => /privacy|terms|credits/.test(u)).length === 1 && legal.some((u) => /site-credits/.test(u)), 'ONE legal-type page is read, a credits page first');
  ok(!selectSamplePages(SITE, ['/privacy-policy', '/terms', '/cookies'].map((p) => `https://www.acmeplumbing.co.uk${p}`), 7).some((u) => /cookies/.test(u)), 'never the cookie page');
  ok(/^LeadFinderOS-SiteCheck\/1\.0 \(\+https:\/\/findable\.live\)$/.test(AGENCY_CRAWLER_UA) && !/Mozilla/.test(AGENCY_CRAWLER_UA), 'the crawler name is the bare honest name — no borrowed "Mozilla" wrapper');
}
{
  // The www / bare-domain twin, once, only when the homepage gives no answer at all.
  const calls: string[] = [];
  const fake = async (url: string) => {
    calls.push(url);
    if (url.startsWith('https://acme-twin.co.uk')) throw new Error('ECONNREFUSED');
    if (url === 'https://www.acme-twin.co.uk/') return new Response(body('', '© Acme. Website by Bright Digital'), { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } });
  };
  const r = await crawlForAgency('https://acme-twin.co.uk/', fake as typeof fetch);
  ok(r.verdict.classification === 'agency_likely' && calls.includes('https://www.acme-twin.co.uk/'), 'no answer on the bare domain → the www twin is tried once, and read');
  const c404: string[] = [];
  await crawlForAgency('https://acme404.co.uk/', (async (url: string) => { c404.push(url); return new Response('<html><body>Not found</body></html>', { status: 404, headers: { 'content-type': 'text/html' } }); }) as typeof fetch);
  ok(!c404.some((u) => u.includes('www.acme404')), 'a 404 is an answer — no twin');
  const sgc = await crawlForAgency('https://acme-sg.co.uk/', (async () => new Response('<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2F"></meta></head></html>', { status: 202, headers: { 'content-type': 'text/html' } })) as typeof fetch);
  ok(sgc.verdict.classification === 'unknown' && /blocked/.test(sgc.verdict.failure ?? ''), 'a SiteGround bot challenge reads "blocked", never "built by script" — and is never worked around');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
