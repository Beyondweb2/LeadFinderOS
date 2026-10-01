/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHO RUNS THEIR WEBSITE? — the agency check (2026-10-01, docs/agency-detection.md). Fixture pages and a
   fake fetch only: no network. The rules (src/lib/agencyDetect.ts), the crawl's limits
   (_shared/agency-crawl.ts), the cache rules and filters (src/lib/agencyCheck.ts), and the wiring.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { classifyAgency, selectSamplePages, AGENCY_DEPRIORITISE_CONFIDENCE, AGENCY_CHECK_VERSION, type AgencyPage } from '../src/lib/agencyDetect.ts';
import { agencyCheckDomain, agencyCellText, isCheckFresh, isHighConfidenceAgency, passesSiteFilter, siteStateOf } from '../src/lib/agencyCheck.ts';
import { crawlForAgency, AGENCY_MAX_REQUESTS } from '../supabase/functions/_shared/agency-crawl.ts';

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
  ok(calls.some((u) => u.endsWith('/contact')) && calls.some((u) => u.endsWith('/about-us')) && calls.some((u) => u.endsWith('/services')) && !calls.some((u) => /privacy/.test(u)), 'samples contact, about and a service page; skips privacy');
  ok(r.verdict.classification === 'agency_likely' && r.verdict.confidence >= 90, 'and reaches the verdict');
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
ok(/if \(agency\.pending > 0\) return shown;\s*return \[\.\.\.shown\.filter\(\(l\) => !highAgency\(l\)\), \.\.\.shown\.filter\(\(l\) => highAgency\(l\)\)\];/.test(table), 'high-confidence agency sites sort last once the checks finish (rows never jump mid-check), never hidden');
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

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
process.exit(f === 0 ? 0 : 1);
