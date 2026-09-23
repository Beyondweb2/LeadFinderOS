/* ============================================================
   ONE MANUAL FULL CRAWL, ONE ROW PER LEAD, EVERY SCREEN (2026-09-23).

   Pins: every manual Crawl site / Re-crawl site button runs the FULL profile and writes the lead's
   ONE lead_crawl_checks row; Paid Clients and Website Build read that same row; an automated audit
   crawl stays on the small STANDARD profile and never replaces a fresh full crawl; the www
   redirect no longer throws a site's own pages away.

   Run: npx tsx scripts/full-crawl.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveCrawlMode, STANDARD_CRAWL, FULL_CRAWL, sameSiteUrl, toServedUrl, internalPageLinks, orderSitemapChildren,
  selectFullCrawlUrls, leanHtml, buildFullCrawlEvidence, mayReplaceLeadCrawl, robotsDisallowsAll, fullPageFamily,
} from '../src/lib/fullCrawl';
import { summariseLeadCrawl, crawlOldUrls, LEAD_CRAWL_SUMMARY_COLUMNS } from '../src/lib/leadCrawlSummary';
import { CRAWL_FRESH_MS, MAX_CRAWL_PAGES } from '../src/lib/crawlCheck';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const crawlFn = read('supabase/functions/crawl-check/index.ts');
const button = read('src/components/CrawlCheckButton.tsx');
const panel = read('src/components/LeadCrawlPanel.tsx');
const hub = read('supabase/functions/paid-client-hub/index.ts');
const clientHub = read('src/pages/ClientHub.tsx');
const websiteBuild = read('src/pages/WebsiteBuild.tsx');
const outreachTable = read('src/components/OutreachTable.tsx');
const inbox = read('src/pages/Inbox.tsx');
const leadDetail = read('src/components/LeadDetailDialog.tsx');
const queue = read('supabase/functions/process-ai-audit-queue/index.ts');
const report = read('supabase/functions/render-audit-report/index.ts');

function actionBlock(src: string, action: string): string {
  const start = src.indexOf(`if (action === "${action}")`);
  if (start < 0) throw new Error(`action ${action} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced');
}

console.log('\n── 1. A MANUAL CRAWL FROM OUTREACH SAVES THE CANONICAL LEAD CRAWL ──');
ok(/<CrawlCheckButton[\s\S]{0,300}?from="outreach"/.test(outreachTable), '1. the Outreach row button is marked from="outreach"');
ok(/body: \{ \.\.\.body, mode: 'full', requested_from: from \}/.test(button), '1. every CrawlCheckButton press sends mode: "full" with its screen');
ok(/\.from\("lead_crawl_checks"\)\.upsert\(\{[\s\S]*?lead_id: leadId[\s\S]*?mode,[\s\S]*?full_evidence: full,[\s\S]*?\}, \{ onConflict: "lead_id" \}\)/.test(crawlFn),
  '1. crawl-check upserts the ONE row per lead (onConflict lead_id) with mode + full_evidence');
ok(/if \(upErr\) throw new Error/.test(crawlFn) && /stored = true/.test(crawlFn), '1. a failed save is reported (stored:false), never silent');
ok(/res\.stored === false|next\.stored === false/.test(button), '1. the button refuses to call an unsaved crawl a success');

console.log('\n── 2. EVERY OTHER MANUAL ENTRY POINT USES THE SAME CRAWL AND THE SAME ROW ──');
ok(/from="inbox"/.test(inbox), '2. Inbox header button → from="inbox"');
ok(/LeadDetailCrawlButton/.test(leadDetail) && /from="lead_detail"/.test(leadDetail), '2. lead popup button → from="lead_detail"');
ok(/useLeadCrawl\(lead\.id\)/.test(leadDetail), '2. the lead popup is seeded with the stored row, so an existing crawl opens instead of re-running');
ok(/invokeEdge<Record<string, any>>\('crawl-check', \{ lead_id: leadId, mode: 'full', requested_from: from \}\)/.test(panel), '2. the Paid Client / Website Build panel calls the same function, same shape');
ok(/from="paid_client"/.test(clientHub), '2. Paid Clients panel → from="paid_client"');
ok(/from="website_build"/.test(websiteBuild), '2. Website Build panel → from="website_build"');
ok(/<CrawlCheckDialog open=\{open\} onOpenChange=\{setOpen\} urlMode from="outreach" \/>/.test(button), '2. the paste-a-URL check also runs the full profile (nothing stored — it has no lead)');

console.log('\n── 3/4. PAID CLIENTS AND WEBSITE BUILD READ THE SAME LATEST ROW ──');
{
  const get = actionBlock(hub, 'get');
  ok(/from\("lead_crawl_checks"\)[\s\S]*?\.select\(LEAD_CRAWL_SUMMARY_COLUMNS\)\.eq\("lead_id", leadId\)/.test(get), '3. hub `get` reads the lead\'s crawl row by lead_id');
  ok(/summariseLeadCrawl\(/.test(get) && /crawl \} \}\)/.test(get), '3. and returns its summary as client.crawl');
  ok(!/crawl-check|functions\.invoke|\.upsert\(|\.insert\(|\.update\(/.test(get), '3. opening a Paid Client runs no crawl and writes nothing');
  const ctx = actionBlock(hub, 'rebuild_context');
  ok(/from\("lead_crawl_checks"\)[\s\S]*?\.select\(LEAD_CRAWL_SUMMARY_COLUMNS\)/.test(ctx), '4. Website Build (rebuild_context) reads the same row, including full_evidence');
  ok(LEAD_CRAWL_SUMMARY_COLUMNS.includes('full_evidence') && LEAD_CRAWL_SUMMARY_COLUMNS.includes('mode'), '4. …mode and full_evidence are in the column list');
  ok(/checkedPages=\{crawlOldUrls\(payload\.crawl\)\}/.test(websiteBuild), '4. Website Build seeds old URLs from the full crawl\'s discovered URLs');
  ok(/<CrawlEvidenceDetails full=/.test(websiteBuild), '4. Website Build shows the crawl evidence');
  ok(!/setInterval/.test(websiteBuild) && !/runFullLeadCrawl\(/.test(websiteBuild), '4. opening Website Build crawls nothing');
  const row = {
    url: 'https://bs4.example/', created_at: '2026-09-23T10:00:00Z', mode: 'full', requested_from: 'outreach',
    result: { checked_at: '2026-09-23T10:00:00Z', signals: { fetchFailed: false, pagesChecked: 3, checkedPages: [{ url: 'https://www.bs4.example/', kind: 'other' }] }, siteInfo: { services: ['EICRs', 'Rewiring'], towns: ['Bath'] } },
    full_evidence: {
      completeness: 'partial' as const, warnings: ['Page limit reached'], servedUrl: 'https://www.bs4.example/',
      stats: { urlsDiscovered: 120, pagesFetched: 61, pagesQueued: 120, pagesOk: 60, fetchesUsed: 80, hitPageLimit: true, hitFetchBudget: false, hitDeadline: false, ms: 50000 },
      pages: [{ url: 'https://www.bs4.example/eicr', finalUrl: 'https://www.bs4.example/eicr', status: 200, family: 'service' as const, title: '', description: '', canonical: '', noindex: false, h1: [], h2: [], words: 300, excerpt: '', internalLinks: 3, schemaTypes: [] }],
      discoveredUrls: ['https://www.bs4.example/eicr', 'https://www.bs4.example/rewiring/bath'],
      business: { credentials: [{ value: 'NICEIC', url: 'x' }], profiles: [] } as never, technical: [{ kind: 'thin', detail: 'x', urls: ['a'] }],
    },
  };
  const s = summariseLeadCrawl(row as never);
  ok(s.mode === 'full' && s.status === 'partial' && s.pagesFetched === 61 && s.pagesDiscovered === 120, '3. the summary says full · partial · 61 of 120');
  ok(/^Full crawl · partial · 61 pages read of 120 found/.test(s.label), '19. the status line is plain words');
  ok(s.requestedFrom === 'outreach', '3. an Outreach crawl is the crawl Paid Clients shows (same row, source recorded)');
  const old = crawlOldUrls(row as never);
  ok(old.length === 2 && old.some((u) => u.url.endsWith('/rewiring/bath')), '4. old URLs include discovered-but-not-fetched pages');
  const std = summariseLeadCrawl({ url: 'x', created_at: '2026-09-23T10:00:00Z', mode: 'standard', result: { signals: { pagesChecked: 1 } } } as never);
  ok(std.mode === 'standard' && /^Quick crawl/.test(std.label) && std.pagesFetched === 1, '19. a shallow crawl is never labelled full');
  ok(summariseLeadCrawl(null).status === 'none' && summariseLeadCrawl(null).label === 'Not crawled yet', '19. no row → "Not crawled yet"');
  ok(summariseLeadCrawl({ result: { signals: { fetchFailed: true } } } as never).status === 'failed', '19. an unreadable site shows as failed');
}

console.log('\n── 5. RE-CRAWL UPDATES THE LATEST CRAWL ──');
{
  const now = Date.parse('2026-09-23T12:00:00Z');
  ok(mayReplaceLeadCrawl({ mode: 'full', created_at: '2026-09-23T11:00:00Z' }, 'full', now, CRAWL_FRESH_MS), '5. a full re-crawl replaces a full crawl');
  ok(mayReplaceLeadCrawl({ mode: 'standard', created_at: '2026-09-23T11:00:00Z' }, 'full', now, CRAWL_FRESH_MS), '5. a full crawl replaces a quick one');
  ok(mayReplaceLeadCrawl(null, 'full', now, CRAWL_FRESH_MS), '5. a first crawl creates the row');
  ok(/created_at: checkedAt,/.test(crawlFn) && /result: storedResult,/.test(crawlFn), '5. the row\'s result and timestamp are replaced on every stored crawl');
  ok(/void queryClient\.invalidateQueries\(\{ queryKey: \['lead-crawls'\] \}\)/.test(panel) && /queryKey: \['lead-crawls'\]/.test(button), '5. every screen\'s cached copy is invalidated after a crawl');
}

console.log('\n── 6. APPROVED ONBOARDING FACTS SURVIVE A RE-CRAWL ──');
ok(!/onboarding_responses|website_build/.test(crawlFn), '6. crawl-check never touches onboarding_responses or the approved build facts');

console.log('\n── 7. THE AUTOMATIC CRAWL STAYS LIGHT ──');
{
  ok(resolveCrawlMode('full', false) === 'standard', '7. an internal caller asking for full gets STANDARD');
  ok(resolveCrawlMode(undefined, true) === 'standard' && resolveCrawlMode('FULL', true) === 'standard' && resolveCrawlMode('deep', true) === 'standard', '7. absent / unknown mode is STANDARD');
  ok(resolveCrawlMode('full', true) === 'full', '7. only an operator saying exactly "full" gets FULL');
  ok(STANDARD_CRAWL.maxPages === MAX_CRAWL_PAGES && MAX_CRAWL_PAGES === 12 && STANDARD_CRAWL.fetchBudget === 22 && STANDARD_CRAWL.deadlineMs === 35_000 && STANDARD_CRAWL.sitemapFetches === 4 && STANDARD_CRAWL.fetchTimeoutMs === 6_000,
    '7. the standard profile is the budget crawl-check always had (12 pages, 22 fetches, 35 s, 4 sitemaps, 6 s)');
  ok(FULL_CRAWL.maxPages > STANDARD_CRAWL.maxPages && FULL_CRAWL.deadlineMs < 150_000, '7. full is bigger, and inside the edge request limit');
  ok(/const mode = resolveCrawlMode\(body\?\.mode, !internal\);/.test(crawlFn), '7. crawl-check decides the profile with the operator flag');
  const qBody = /body: JSON\.stringify\(\{ lead_id: cLeadId, audit_id: auditId, run_id: runId, url: site, deep: deepCrawl \}\)/.test(queue);
  ok(qBody, '7. the audit-finalise crawl sends no mode (standard)');
  ok(/body: JSON\.stringify\(\{ lead_id: leadId \}\)/.test(report), '7. the report\'s background crawl sends no mode (standard)');
  const now = Date.parse('2026-09-23T12:00:00Z');
  ok(!mayReplaceLeadCrawl({ mode: 'full', created_at: '2026-09-22T12:00:00Z' }, 'standard', now, CRAWL_FRESH_MS), '7. an automatic crawl never replaces a fresh full crawl');
  ok(mayReplaceLeadCrawl({ mode: 'full', created_at: new Date(now - CRAWL_FRESH_MS - 1000).toISOString() }, 'standard', now, CRAWL_FRESH_MS), '7. …but a stale one can be refreshed');
  ok(/mayReplaceLeadCrawl\(existing/.test(crawlFn) && /preserved = true/.test(crawlFn), '7. crawl-check applies that rule before writing');
}

console.log('\n── THE www REDIRECT (why BS4 read one page) ──');
{
  ok(sameSiteUrl('https://www.bs4.example/eicr', 'https://bs4.example/'), 'www and apex are the same site');
  ok(!sameSiteUrl('https://other.example/', 'https://bs4.example/'), 'a different host is not');
  ok(toServedUrl('https://bs4.example/eicr?x=1#y', 'https://www.bs4.example/') === 'https://www.bs4.example/eicr', 'same-site URLs are rewritten onto the served origin, query/hash dropped');
  const links = internalPageLinks('<a href="https://www.bs4.example/about">A</a><a href="/contact">C</a><a href="https://x.com/y">X</a><a href="/logo.png">L</a>', 'https://www.bs4.example/', 'https://www.bs4.example/');
  ok(links.length === 2 && links.includes('https://www.bs4.example/about') && links.includes('https://www.bs4.example/contact'), 'internal links: same site, pages only');
  ok(/servedUrl = home\.finalUrl \|\| homeUrl;/.test(crawlFn), 'crawl-check compares against the SERVED address, in both profiles');
  ok(/toServedUrl\(u, servedUrl\)/.test(crawlFn), 'sitemap URLs are normalised onto the served origin before the same-site filter');
}

console.log('\n── FULL-PROFILE MECHANICS ──');
{
  ok(orderSitemapChildren(['https://s/dynamic-a-sitemap.xml', 'https://s/blog-posts-sitemap.xml', 'https://s/pages-sitemap.xml'])[0] === 'https://s/pages-sitemap.xml', 'a site\'s own pages sitemap is read before generated collections');
  const discovered = [
    ...Array.from({ length: 30 }, (_, i) => `https://s.example/eicr-locations/town${i}`),
    ...Array.from({ length: 30 }, (_, i) => `https://s.example/rewire-locations/town${i}`),
    'https://s.example/faq', 'https://s.example/pricing',
  ];
  const picked = selectFullCrawlUrls({ homeLinks: ['https://s.example/about'], discovered, homeUrl: 'https://s.example/', limit: 5 });
  ok(picked[0] === 'https://s.example/about', 'the homepage navigation is read first');
  ok(picked.includes('https://s.example/faq') && picked.includes('https://s.example/pricing'), 'breadth first: FAQ and pricing are read before a 30th town page');
  ok(picked.filter((u) => u.includes('eicr-locations')).length === 1 && picked.filter((u) => u.includes('rewire-locations')).length === 1, 'one page per template family before any family gets a second');
  ok(picked.length === 5 && !picked.includes('https://s.example/'), 'the limit holds and the homepage is not re-fetched');
  const lean = leanHtml('<head><script>var x=1</script><script type="application/ld+json">{"@type":"Electrician"}</script><style>a{}</style></head><body><svg><path/></svg><h1>Hi</h1></body>');
  ok(!lean.includes('var x') && lean.includes('ld+json') && !lean.includes('<svg') && lean.includes('<h1>Hi</h1>'), 'lean HTML drops scripts/styles/SVG, keeps JSON-LD and content');
  ok(robotsDisallowsAll('User-agent: *\nDisallow: /\n') && !robotsDisallowsAll('User-agent: *\nAllow: /\nDisallow: *?lightbox=\nUser-agent: PetalBot\nDisallow: /'), 'robots "disallow everything" is read for the * group only');
  ok(fullPageFamily('https://s.example/faqs', 'https://s.example/') === 'faq' && fullPageFamily('https://s.example/privacy-policy', 'https://s.example/') === 'legal' && fullPageFamily('https://s.example/', 'https://s.example/') === 'homepage', 'page families');

  const home = `<html><head><title>BS4 Electrical | Bristol Electricians</title><meta name="description" content="NICEIC electricians in Bristol">
    <link rel="icon" href="/fav.ico"><script type="application/ld+json">{"@type":"Electrician","name":"BS4 Electrical Services","telephone":"07950 399604","address":{"streetAddress":"172 Novers Lane","addressLocality":"Bristol","postalCode":"BS4 1TP"},"areaServed":["Bristol","Bath"]}</script></head>
    <body><nav><a href="/eicr">EICRs</a><a href="/contact">Contact</a></nav><h1>Electricians in Bristol</h1>
    <p>We are NICEIC approved and fully insured. Over 15 years experience serving Bristol. All work comes with a 12 month guarantee. EICR from £120. My name is Ben and I run the business.</p>
    <a href="https://www.checkatrade.com/trades/bs4">Checkatrade</a><img src="/logo.png" alt="BS4 logo"><footer>© 2026 BS4 Electrical</footer></body></html>`;
  const ev = buildFullCrawlEvidence({
    requestedUrl: 'https://bs4.example/', servedUrl: 'https://www.bs4.example/',
    pages: [
      { url: 'https://bs4.example/', finalUrl: 'https://www.bs4.example/', status: 200, xRobotsTag: null, html: home, isHome: true },
      { url: 'https://www.bs4.example/eicr', finalUrl: 'https://www.bs4.example/eicr', status: 200, xRobotsTag: 'noindex', html: '<head><title>EICR</title></head><body><h1>EICR</h1>short</body>' },
      { url: 'https://www.bs4.example/old', finalUrl: 'https://www.bs4.example/old', status: 404, xRobotsTag: null, html: '' },
    ],
    robotsTxt: 'User-agent: *\nAllow: /\nSitemap: https://bs4.example/sitemap.xml', sitemapDocs: ['https://www.bs4.example/sitemap.xml'],
    sitemapLocs: ['https://www.bs4.example/eicr', 'https://mc-other.example/x'],
    discoveredUrls: ['https://www.bs4.example/eicr', 'https://www.bs4.example/contact', 'https://www.bs4.example/old'],
    stats: { urlsDiscovered: 3, pagesQueued: 3, pagesFetched: 3, pagesOk: 2, fetchesUsed: 9, hitPageLimit: false, hitFetchBudget: false, hitDeadline: false, ms: 1000 },
    profile: FULL_CRAWL,
  });
  ok(ev.redirectedFrom === 'https://bs4.example/', 'the redirect is recorded');
  ok(ev.business.credentials.some((c) => c.value.startsWith('NICEIC')) && ev.business.credentials.some((c) => c.value.startsWith('Fully insured')), 'credentials are detected with their sentence');
  ok(ev.business.guarantees.length > 0 && ev.business.experience.length > 0 && ev.business.prices.length > 0 && ev.business.people.length > 0, 'guarantee, experience, price and person mentions are detected');
  ok(ev.business.profiles.some((p) => p.value.startsWith('Checkatrade')), 'third-party profiles are detected');
  ok(ev.business.schema[0]?.areaServed.join(',') === 'Bristol,Bath' && ev.business.phones.some((p) => p.value.includes('07950')), 'schema business facts are read');
  ok(ev.business.logo.endsWith('/logo.png') && ev.business.favicon.endsWith('/fav.ico'), 'logo and favicon');
  ok(ev.navigation.map((n) => n.label).join('|') === 'EICRs|Contact', 'navigation labels');
  ok(ev.technical.some((t) => t.kind === 'noindex') && ev.technical.some((t) => t.kind === 'broken') && ev.technical.some((t) => t.kind === 'sitemap_off_site'), 'technical findings: noindex, broken page, off-site sitemap URL');
  ok(ev.completeness === 'partial' && ev.warnings.some((w) => /could not be read/.test(w)), 'a crawl with an unreadable page says partial, never complete');
  ok(ev.business.credentials.every((c) => !!c.url) && ev.business.guarantees.every((c) => !!c.url), 'every detected item names the page it was read on');
  const failed = buildFullCrawlEvidence({ requestedUrl: 'https://x.example/', servedUrl: 'https://x.example/', pages: [], robotsTxt: null, sitemapDocs: [], sitemapLocs: [], discoveredUrls: [],
    stats: { urlsDiscovered: 0, pagesQueued: 0, pagesFetched: 0, pagesOk: 0, fetchesUsed: 4, hitPageLimit: false, hitFetchBudget: false, hitDeadline: false, ms: 1 }, profile: FULL_CRAWL });
  ok(failed.completeness === 'failed', 'no readable homepage → failed');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
