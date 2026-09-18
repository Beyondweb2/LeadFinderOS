/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE CRAWLABILITY CHECK — the deterministic analysis, driven on the two real faults it was built
   for (client-rendered homepage; near-identical location pages) plus the cheap checks.
   Run: npx tsx scripts/crawl-check.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  visibleText, detectClientRendered, hasH1, hasJsonLd, wordCount,
  looksChallenged, extractSitemapLocs, patternKey, clusterUrls, pageSimilarity, buildVerdict,
  buildFaultLines, selectCrawlUrls, crawlPageKind, MAX_CRAWL_PAGES, type CrawlSignals,
} from '../src/lib/crawlCheck.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/** A clean signals object; override the fields under test. */
const mkSig = (over: Partial<CrawlSignals> = {}): CrawlSignals => ({
  homeUrl: 'https://x.co', fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot',
  clientRendered: null, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0, ...over,
});

console.log('── visible text + client-render ──');
{
  // The real case: an app shell that serves ~69 chars to a crawler, thousands to a browser.
  const shell = `<!doctype html><html><head><title>Ace Electrical</title></head><body>` +
    `<div id="root"></div>` +
    `<script>${'x'.repeat(9000)}</script></body></html>`;
  const cr = detectClientRendered(shell);
  ok(cr.flagged, 'app shell with empty #root + big JS → client-rendered');
  ok(cr.appShell, 'app shell detected');
  ok(cr.visibleChars < 200, `crawler sees almost nothing (${cr.visibleChars} chars)`);

  const real = `<html><body><h1>Ace Electrical, Leeds</h1><p>${'We rewire homes and fix faults across Leeds. '.repeat(40)}</p></body></html>`;
  ok(!detectClientRendered(real).flagged, 'a normal content page is NOT flagged');
  ok(visibleText(real).length > 500, 'real page has real text');
}

console.log('\n── H1 / JSON-LD / thin ──');
{
  ok(hasH1('<h1>Hi</h1>'), 'h1 present'); ok(!hasH1('<h2>Hi</h2>'), 'no h1');
  ok(hasJsonLd('<script type="application/ld+json">{}</script>'), 'json-ld present');
  ok(!hasJsonLd('<script>var x=1</script>'), 'no json-ld');
  ok(wordCount('<p>one two three</p>') === 3, 'word count');
}

console.log('\n── search-crawler block + Cloudflare challenge (the actual-fetch fault; robots is not evidence) ──');
{
  ok(looksChallenged('<html><body>Just a moment...<script>window.__cf_chl_opt={};</script></body></html>'), 'a Cloudflare challenge body is a block, even on a 200');
  ok(looksChallenged('Please enable JavaScript and cookies to continue'), 'the JS/cookies interstitial is a block');
  ok(!looksChallenged('<html><body><h1>Ace Electrical</h1><p>We rewire homes.</p></body></html>'), 'a real page is not a challenge');
  // A blocked SEARCH crawler is the red headline fault; GPTBot (training) is never tested, and
  // robots.txt is never consulted.
  const blocked = buildFaultLines(mkSig({ searchBlocked: ['OAI-SearchBot', 'ChatGPT-User'], readableAs: null }));
  ok(blocked[0].title.includes('can’t reach') && blocked[0].detail.includes('OAI-SearchBot') && !blocked[0].minor,
    'blocked search crawlers are the red headline fault, naming which');
  ok(buildFaultLines(mkSig()).length === 0, 'no search block + clean site → no fault');
}

console.log('\n── sitemap + clustering (bounds the fetch) ──');
{
  const sm = `<urlset><url><loc>https://x.co/emergency-electrician-leeds</loc></url>` +
    `<url><loc>https://x.co/emergency-electrician-york</loc></url>` +
    `<url><loc>https://x.co/about</loc></url></urlset>`;
  const { locs, isIndex } = extractSitemapLocs(sm);
  ok(locs.length === 3 && !isIndex, 'sitemap locs parsed, not an index');
  ok(extractSitemapLocs('<sitemapindex><sitemap><loc>https://x.co/sm1.xml</loc></sitemap></sitemapindex>').isIndex, 'sitemap index detected');
  ok(patternKey('https://x.co/emergency-electrician-leeds', 'Leeds') === patternKey('https://x.co/emergency-electrician-york', 'York'),
    'town stripped → the two location pages share a pattern');
  const clusters = clusterUrls(locs, 'Leeds');
  ok(clusters[0].urls.length === 2, 'the emergency-electrician pages cluster together');
}

console.log('\n── page similarity (town swapped) ──');
{
  const body = (town: string) => `<html><body><h1>Emergency Electrician in ${town}</h1><p>` +
    `Fast 24/7 emergency electrician covering ${town} and nearby. Fault finding, fuse board upgrades, ` +
    `landlord certificates and rewires in ${town}. Call today for a same-day electrician in ${town}.`.repeat(3) +
    `</p></body></html>`;
  const sim = pageSimilarity(body('Leeds'), body('York'), 'Leeds York');
  ok(sim >= 0.9, `two location pages are ~identical once the town is stripped (sim=${sim.toFixed(3)})`);
  const diff = pageSimilarity('<p>we fix boilers and heating</p>', '<p>we cut keys and change locks</p>', '');
  ok(diff < 0.3, `genuinely different pages are not similar (sim=${diff.toFixed(3)})`);
}

console.log('\n── verdict priority + wording ──');
{
  const base = mkSig();
  ok(!buildVerdict({ ...base, fetchFailed: true }).ok, 'fetch failed → not ok');
  const cr = buildVerdict({ ...base, clientRendered: { flagged: true, visibleChars: 69, htmlBytes: 9000, appShell: true }, missingH1: true });
  ok(cr.headline.includes('69 characters'), 'client-render leads the verdict and names the char count');
  ok(cr.problems.length === 2, 'both problems listed (client-render + missing H1)');
  const dup = buildVerdict({ ...base, duplicates: { clusterSize: 20, sampleSize: 5, similarityPct: 99 } });
  ok(dup.headline.includes('20 near-identical'), 'duplicate verdict names the count');
  ok(buildVerdict(base).problems.length === 0, 'clean site → no problems');
  // Priority: a blocked SEARCH crawler leads over client-render.
  const both = buildVerdict({ ...base, searchBlocked: ['OAI-SearchBot'], clientRendered: { flagged: true, visibleChars: 50, htmlBytes: 9000, appShell: true } });
  ok(/blocked from fetching/.test(both.headline), 'a blocked search crawler leads over client-render');
}

console.log('\n── report fault lines (each carries its number; amber only for structured data) ──');
{
  const base = mkSig();
  ok(buildFaultLines({ ...base, fetchFailed: true }).length === 0, 'couldn’t fetch → no fault lines (section hidden)');
  ok(buildFaultLines({ ...base, searchBlocked: ['OAI-SearchBot'] })[0].title.includes('can’t reach'), 'a blocked search crawler IS a fault (headline)');
  ok(buildFaultLines(base).length === 0, 'a clean site → no fault lines');
  const dup = buildFaultLines({ ...base, duplicates: { clusterSize: 20, sampleSize: 5, similarityPct: 98 } })[0];
  ok(dup.detail.includes('20') && dup.detail.includes('98%') && !dup.minor, 'duplicate line carries the numbers, red dot');
  const jsonld = buildFaultLines({ ...base, noJsonLd: true })[0];
  ok(jsonld.minor === true, 'structured-data line is the ONLY amber (minor) one');
  const cr = buildFaultLines({ ...base, clientRendered: { flagged: true, visibleChars: 64, htmlBytes: 9000, appShell: true } })[0];
  ok(cr.detail.includes('64') && !cr.minor, 'client-render line carries the char count, red');
  ok(buildFaultLines({ ...base, duplicates: { clusterSize: 9, sampleSize: 3, similarityPct: 95 }, thinPages: 6, missingH1: true, noJsonLd: true }).length === 4, 'capped at 4 lines');
}

console.log('\nBOUNDED IMPORTANT-PAGE SELECTION');
{
  const home = 'https://x.co/';
  const pages = selectCrawlUrls([
    'https://x.co/', 'https://x.co/services/boiler-repair', 'https://x.co/areas/leeds',
    'https://x.co/about', 'https://x.co/contact', 'https://x.co/blog/useful-guide',
    'https://x.co/wp-admin/edit.php', 'https://x.co/cart', 'https://x.co/logo.svg',
    'https://elsewhere.co/services', 'https://x.co/services/boiler-repair#pricing',
  ], home, 5);
  ok(pages.length <= 5 && pages.length <= MAX_CRAWL_PAGES, 'page selection is hard-capped');
  ok(pages.every((u) => new URL(u).origin === 'https://x.co'), 'only same-domain URLs are selected');
  ok(!pages.some((u) => /wp-admin|cart|\.svg/.test(u)), 'admin, transactional and asset URLs are excluded');
  ok(pages.some((u) => crawlPageKind(u) === 'service'), 'a service page is considered');
  ok(pages.some((u) => crawlPageKind(u) === 'location'), 'a location page is considered');
  ok(pages.some((u) => crawlPageKind(u) === 'about'), 'an about page is considered');
  ok(pages.some((u) => crawlPageKind(u) === 'contact'), 'a contact page is considered');
  ok(new Set(pages).size === pages.length, 'URLs are deduplicated after fragments/queries are removed');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
process.exit(f === 0 ? 0 : 1);
