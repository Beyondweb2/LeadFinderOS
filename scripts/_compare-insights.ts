/* Dev harness (untracked, underscore-prefixed): the standard crawl's page sampling replayed in Node against REAL
   public sites, then the OLD call-script findings vs the NEW ones, side by side. Free: a handful of GETs per site.
   Run: npx tsx scripts/_compare-insights.ts https://site1 https://site2 ... */
import {
  clusterUrls, detectClientRendered, extractSitemapLocs, hasH1, hasJsonLd, pageSimilarity, selectCrawlUrls, wordCount,
  CRAWL_CHECK_VERSION, DUP_MIN_CLUSTER, DUP_SIMILARITY, THIN_WORDS, crawlPageKind, type CrawlSignals,
} from '../src/lib/crawlCheck.ts';
import { buildSiteEvidence, SITE_EVIDENCE_VERSION, type EvidencePage } from '../src/lib/siteEvidence.ts';
import { internalPageLinks, toServedUrl, isPageUrl } from '../src/lib/fullCrawl.ts';
import { insightsFromFetchedPages } from '../src/lib/salesInsightsInline.ts';
import { buildColdCallPlaybook } from '../src/lib/coldCallPlaybook.ts';

const UA = 'LeadFinderOS-SiteCheck/1.0 (+https://findable.live)';
async function get(url: string) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    return { url, finalUrl: r.url || url, status: r.status, ok: r.ok, html: (await r.text()).slice(0, 1_000_000), xRobotsTag: r.headers.get('x-robots-tag') };
  } catch { return { url, finalUrl: url, status: 0, ok: false, html: '', xRobotsTag: null }; }
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

async function one(site: string, lead: { name: string; town: string; trade: string }) {
  const homeUrl = site.endsWith('/') ? site : site + '/';
  const home = await get(homeUrl);
  if (!home.ok || !home.html) { console.log('\n#### ' + site + ' — homepage not readable (' + home.status + ')'); return; }
  const served = home.finalUrl;
  const origin = new URL(served).origin;
  const pool0: string[] = [];
  const robots = await get(origin + '/robots.txt');
  const declared = [...(robots.html.match(/^\s*sitemap\s*:\s*(\S+)/gim) ?? [])].map((l) => l.replace(/^\s*sitemap\s*:\s*/i, '').trim());
  const queue = [...declared.slice(0, 4), origin + '/sitemap.xml']; const tried = new Set<string>(); let fetches = 0;
  while (queue.length && fetches < 4) {
    const n = queue.shift()!; if (tried.has(n)) continue; tried.add(n); fetches++;
    const d = await get(n); if (!d.ok) continue;
    const p = extractSitemapLocs(d.html);
    if (p.isIndex) queue.push(...p.locs.slice(0, 4)); else pool0.push(...p.locs);
  }
  const homeLinks = internalPageLinks(home.html, served, served);
  const sm = pool0.map((u) => toServedUrl(u, served)).filter((u): u is string => !!u && isPageUrl(u));
  const pool = [...new Set(!sm.length ? [...sm, ...homeLinks] : sm)];
  const biggest = clusterUrls(pool, lead.town)[0];
  const urls = selectCrawlUrls([...(biggest?.urls ?? []), ...pool], served, 12);
  const samples = await Promise.all(urls.map((u) => get(u)));
  const readable = samples.filter((r) => r.ok && r.html);

  const mkSignals = (thinRule: 'old' | 'new'): CrawlSignals => {
    const thinOf = (r: typeof readable[number]) => wordCount(r.html) < THIN_WORDS && (thinRule === 'old' || ['service', 'location'].includes(crawlPageKind(r.url)));
    const thinUrls = readable.filter(thinOf).map((r) => r.url);
    let duplicates: CrawlSignals['duplicates'] = null;
    if (biggest && biggest.urls.length >= DUP_MIN_CLUSTER) {
      const cs = readable.filter((r) => biggest.urls.includes(r.url)); const sims: number[] = [];
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) sims.push(pageSimilarity(cs[i].html, cs[j].html, lead.town));
      if (cs.length >= 2 && median(sims) >= DUP_SIMILARITY) duplicates = { clusterSize: biggest.urls.length, sampleSize: cs.length, similarityPct: Math.round(median(sims) * 100) };
    }
    const cr = detectClientRendered(home.html);
    return { homeUrl, fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot', clientRendered: cr, missingH1: !hasH1(home.html), noJsonLd: !hasJsonLd(home.html), duplicates,
      thinPages: thinUrls.length + (!cr.flagged && wordCount(home.html) < THIN_WORDS ? 1 : 0), pagesChecked: samples.length + 1, checkedPages: [], thinPageUrls: thinUrls };
  };
  const evPages: EvidencePage[] = [home, ...samples.filter((r) => r.status)].map((r, i) => ({ requestedUrl: r.url, finalUrl: r.finalUrl, status: r.status, xRobotsTag: r.xRobotsTag, html: r.ok ? r.html : '', isHome: i === 0 }));
  const evidence = buildSiteEvidence({ servedUrl: served, pages: evPages, sitemapLocs: pool0, sitemapUrls: [] });
  const insights = insightsFromFetchedPages({
    servedUrl: served, home, samples: readable, knownUrls: pool,
    lead: { name: lead.name, town: lead.town, trade: lead.trade, services: [] },
  });

  const NOW = Date.now();
  const play = (signals: CrawlSignals, ins: unknown) => buildColdCallPlaybook({
    lead: { id: 'x', business_name: lead.name, phone: '01', website: site, category: lead.trade, derived_town: lead.town, status: 'contacted' },
    reportAudit: { id: 'a', short_code: 'abcdef', created_at: new Date(NOW - 3600_000).toISOString(), business_name: lead.name, business_type: lead.trade + 's', location_text: lead.town },
    report: { hook: { questionsTested: 3, gap: { question: lead.trade + ' ' + lead.town, engineLabel: 'Gemini', namedInstead: ['Rival One', 'Rival Two'], answerExcerpt: 'x' }, tested: [] } },
    runCrawls: [], leadCrawl: { result: { version: CRAWL_CHECK_VERSION, signals, evidence, evidenceVersion: SITE_EVIDENCE_VERSION, ...(ins ? { insights: ins } : {}) }, createdAtMs: NOW - 3600_000 },
    messages: [], nowMs: NOW, callerName: 'Paul',
  });
  const before = play(mkSignals('old'), null);
  const after = play(mkSignals('new'), insights);

  console.log('\n#### ' + lead.name + ' — ' + site + '  (' + (samples.length + 1) + ' pages fetched, pool ' + pool.length + ')');
  console.log('SERVICES SEEN: ' + (insights.services.map((s) => s.name + ' [' + s.coverage + ']').join('; ') || '(none detected)'));
  console.log('STRENGTHS:    ' + (insights.strengths.join('; ') || '(none)'));
  console.log('INSIGHT STATE: ' + insights.state + (insights.opportunity ? ' · opportunity=' + insights.opportunity.kind : ''));
  for (const f of insights.findings) console.log('  - [' + f.confidence + ' ' + f.priority + '] ' + f.id + ': ' + f.observed + '\n      pages: ' + f.evidence.urls.slice(0, 3).join(' , '));
  console.log('BEFORE — script says:'); (before.script.found.lines.length ? before.script.found.lines : ['(nothing about the site)']).forEach((l) => console.log('   • ' + l)); console.log('   note: ' + (before.script.found.note ?? '—'));
  console.log('AFTER  — script says:'); (after.script.found.lines.length ? after.script.found.lines : ['(nothing about the site)']).forEach((l) => console.log('   • ' + l)); console.log('   note: ' + (after.script.found.note ?? '—'));
}

const sites: Array<[string, { name: string; town: string; trade: string }]> = [
  ['https://www.scplumbing.co.uk/', { name: 'SC Plumbing & Gas Ltd', town: 'Tamworth', trade: 'plumber' }],
  ['https://bs4electricalservices.co.uk/', { name: 'BS4 Electrical Services Ltd', town: 'Bristol', trade: 'electrician' }],
  ['https://wscplumbing.co.uk/', { name: 'WSC Plumbing & Home Services Ltd', town: 'Reading', trade: 'plumber' }],
  ['http://ronniesshoerepair.co.uk/', { name: "Ronnie's Shoe Repairs & Key Cutting", town: 'Halifax', trade: 'shoe repairer' }],
  ['https://rglocksmithshuntingdon.co.uk/', { name: 'RG Locksmiths', town: 'Huntingdon', trade: 'locksmith' }],
  ['https://www.sc-plumbingandheating.co.uk/', { name: 'SC Plumbing & Heating', town: 'Liverpool', trade: 'plumber' }],
  ['https://www.ablm.co.uk/', { name: 'ABLM', town: 'Wisbech', trade: 'builder' }],
];
const only = process.argv.slice(2);
for (const [u, l] of sites) if (!only.length || only.includes(u)) await one(u, l);
