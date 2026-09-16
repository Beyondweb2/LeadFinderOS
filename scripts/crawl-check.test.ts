/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE CRAWLABILITY CHECK — the deterministic analysis, driven on the two real faults it was built
   for (client-rendered homepage; near-identical location pages) plus the cheap checks.
   Run: npx tsx scripts/crawl-check.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  visibleText, detectClientRendered, hasH1, hasJsonLd, wordCount,
  parseRobotsAIBlocks, extractSitemapLocs, patternKey, clusterUrls, pageSimilarity, buildVerdict,
  type CrawlSignals,
} from '../src/lib/crawlCheck.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

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

console.log('\n── robots.txt AI blocking ──');
{
  ok(parseRobotsAIBlocks('User-agent: GPTBot\nDisallow: /').includes('GPTBot (ChatGPT)'), 'GPTBot Disallow / → blocked');
  ok(parseRobotsAIBlocks('User-agent: *\nDisallow: /').length >= 2, 'wildcard Disallow / blocks the AI crawlers too');
  ok(parseRobotsAIBlocks('User-agent: GPTBot\nDisallow: /admin').length === 0, 'partial Disallow is not a block');
  ok(parseRobotsAIBlocks('User-agent: Googlebot\nDisallow: /').length === 0, 'blocking Googlebot only is not an AI block');
  ok(parseRobotsAIBlocks('').length === 0, 'empty robots → nothing blocked');
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
  const base: CrawlSignals = {
    homeUrl: 'https://x.co', fetchFailed: false, blockedByBot: false,
    clientRendered: null, missingH1: false, noJsonLd: false, aiBlocked: [], duplicates: null, thinPages: 0,
  };
  ok(!buildVerdict({ ...base, fetchFailed: true }).ok, 'fetch failed → not ok');
  const cr = buildVerdict({ ...base, clientRendered: { flagged: true, visibleChars: 69, htmlBytes: 9000, appShell: true }, missingH1: true });
  ok(cr.headline.includes('69 characters'), 'client-render leads the verdict and names the char count');
  ok(cr.problems.length === 2, 'both problems listed (client-render + missing H1)');
  const dup = buildVerdict({ ...base, duplicates: { clusterSize: 20, sampleSize: 5, similarityPct: 99 } });
  ok(dup.headline.includes('20 near-identical'), 'duplicate verdict names the count');
  ok(buildVerdict(base).problems.length === 0, 'clean site → no problems');
  // Priority: client-render outranks a robots block outranks duplicates.
  const both = buildVerdict({ ...base, blockedByBot: true, clientRendered: { flagged: true, visibleChars: 50, htmlBytes: 9000, appShell: true } });
  ok(both.headline.includes('block'), 'a hard block leads over client-render');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
process.exit(f === 0 ? 0 : 1);
