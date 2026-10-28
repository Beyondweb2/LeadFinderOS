/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE CRAWL STANDARD (2026-10-26, fix/crawl-one-standard; docs/website-check.md).
   Driven on the real cases Paul reported, with the pages as they really came back:
     · drivewelluk.co.uk — said "AI can't reach your site". From a Supabase server, the SAME second, Cloudflare answered our
       fake "OAI-SearchBot" with a 403 "Just a moment…" challenge (fixtures/crawl-drivewell-challenge.html) and an ordinary
       request with the full page (fixtures/crawl-drivewell-home.html). robots.txt blocks only /wp-admin/.
     · ambition2drive — the lead's website is typed "ambiton2drive.com" (no listing website): DNS fails; the old verdict
       said the site "may be down or blocking automated requests".
     · X Border Transport Training (Lavington NSW) — a Weebly site, readable, robots.txt blocks only NerdyBot.
   Run: npx tsx scripts/crawl-one-standard.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  BLOCK_EVIDENCE_ROBOTS, buildFaultLines, buildVerdict, crawlResultFaults, crawlUnreadable, detectClientRendered, hasH1,
  looksChallenged, pageReadable, robotsSearchBlocked, siteFaultLine, usableCrawlSignals, verifiedSearchBlocked,
  visibleText, wordCount, CRAWL_CHECK_VERSION, COULD_NOT_CHECK_HEADLINE, type CrawlSignals,
} from '../src/lib/crawlCheck.ts';
import { auditFromStoredCrawl, buildSiteAudit, classifyFetchError, HOME_FETCH_LABELS, storedCrawlUnread } from '../src/lib/siteAudit.ts';
import { websiteCheckFor, summariseWebsiteCheck } from '../src/lib/websiteCheck.ts';
import { pitchIssueLines } from '../src/lib/pitchIssueWords.ts';
import { SITE_CHECK_UA, SITE_CHECK_HEADERS, SITE_CHECK_READ_AS, SITE_FETCH_TIMEOUT_MS } from '../src/lib/siteReadIdentity.ts';
import { AGENCY_CRAWLER_UA } from '../supabase/functions/_shared/agency-crawl.ts';
import { FULL_CRAWL, STANDARD_CRAWL } from '../src/lib/fullCrawl.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const fx = (n: string) => read(`scripts/fixtures/${n}`);
const NOW = Date.now();
const iso = new Date(NOW - 3_600_000).toISOString();

/** What crawl-check now stores for a homepage it read (one read under our name, robots.txt's verdict, the marker). */
const readSignals = (homeUrl: string, html: string, robots: string | null): CrawlSignals => ({
  homeUrl, fetchFailed: false, searchBlocked: robotsSearchBlocked(robots), blockEvidence: BLOCK_EVIDENCE_ROBOTS,
  readableAs: SITE_CHECK_READ_AS, clientRendered: detectClientRendered(html), missingH1: !hasH1(html), noJsonLd: false,
  duplicates: null, thinPages: 0,
});

console.log('── 1. drivewelluk.co.uk: the refused impostor is not evidence, the real page is read ──');
{
  const challenge = fx('crawl-drivewell-challenge.html');
  const home = fx('crawl-drivewell-home.html');
  const robots = fx('crawl-drivewell-robots.txt');
  ok(looksChallenged(challenge) && !pageReadable({ status: 403, cfMitigated: true, body: challenge }), 'the 403 "Just a moment…" answer to our fake OAI-SearchBot is not a page');
  ok(pageReadable({ status: 200, body: home }), 'the same site, read under our own name: a page');
  const text = visibleText(home);
  ok(/Kettering/.test(text) && /Corby/.test(text) && /£\s?\d/.test(text) && wordCount(home) > 300, `real readable content: towns, prices, ${wordCount(home)} words`);
  ok(!detectClientRendered(home).flagged, 'not a JavaScript-only page');
  ok(robotsSearchBlocked(robots).length === 0, 'robots.txt (Disallow: /wp-admin/ only) shuts out no AI search crawler');
  const after = readSignals('https://drivewelluk.co.uk/', home, robots);
  ok(!crawlUnreadable(after) && !buildFaultLines(after).some((x) => x.kind === 'search_blocked'), 'AFTER: crawlable — no "can’t reach" / blocked fault');
  ok(!/blocked|can.t reach|can.t see/i.test(buildVerdict(after).headline), `AFTER: the verdict says nothing about a block ("${buildVerdict(after).headline.slice(0, 70)}…")`);

  /* BEFORE — the row actually stored on 2026-10-25 (lead 039c74ef): every probe 403, readableAs null, homeFetch blocked. */
  const stored = { url: 'http://drivewelluk.co.uk/', mode: 'standard', created_at: iso, result: { version: CRAWL_CHECK_VERSION, checked_at: iso, url: 'http://drivewelluk.co.uk/',
    signals: { homeUrl: 'http://drivewelluk.co.uk/', fetchFailed: false, searchBlocked: ['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot'], readableAs: null,
      clientRendered: null, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0, pagesChecked: 0 },
    homeFetch: { kind: 'blocked' as const, status: 403, detail: null },
    websiteCheck: { version: 1, depth: 'quick', checkedAt: iso, pagesRead: 0, pagesFound: null, capped: false,
      issues: [{ id: 'search_crawler_refused', severity: 'high', title: 'The site refused AI search crawlers', saw: 'Requested as OAI-SearchBot…', pages: [], count: 0 }], strengths: [], notChecked: [] } } };
  ok(crawlResultFaults(stored.result as never, NOW - 3_600_000).length === 0, 'the stored false row now yields no fault line');
  ok(siteFaultLine(true, stored.result as never, NOW - 3_600_000) === null, '…no audit_followup_fault {{6}} (the template is not offered off it)');
  ok(usableCrawlSignals(stored.result as never, NOW - 3_600_000)?.fetchFailed === true, '…every reader of the signals sees it as couldn’t check');
  ok(storedCrawlUnread(stored as never) && auditFromStoredCrawl(stored as never) === null, '…no audit is built off a homepage nobody read');
  const view = websiteCheckFor(stored as never, { website: 'http://drivewelluk.co.uk/', nowMs: NOW });
  ok(view.state === 'unreadable' && view.serious.length === 0, `…the one website check says couldn’t check, with no issues (state ${view.state})`);
  ok(!/AI|blocked from|can.t reach/i.test(view.headline.replace(/whether AI tools can read it/, '')) && /could not read the website/.test(view.headline), `…in words that blame nothing: "${view.headline}"`);
  ok(pitchIssueLines(view.serious, view.minor).length === 0, '…and nothing for a message to say');
}

console.log('\n── 2. ambition2drive: a misspelt address is "couldn’t check", never "blocking" ──');
{
  const dnsMsg = 'error sending request for url (https://ambiton2drive.com/): client error (Connect): dns error: failed to lookup address information: Name or service not known';
  const kind = classifyFetchError({ message: dnsMsg, status: null, responded: false, blocked: false });
  ok(kind === 'dns' && /misspelt/.test(HOME_FETCH_LABELS.dns), 'the DNS failure is named as an address that does not resolve (maybe misspelt)');
  const failed: CrawlSignals = { homeUrl: 'https://ambiton2drive.com/', fetchFailed: true, searchBlocked: [], blockEvidence: BLOCK_EVIDENCE_ROBOTS, readableAs: null, clientRendered: null, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0 };
  ok(buildVerdict(failed).headline === COULD_NOT_CHECK_HEADLINE && !/blocking|down/i.test(COULD_NOT_CHECK_HEADLINE), 'the verdict is couldn’t check — no "down or blocking automated requests"');
  ok(buildFaultLines(failed).length === 0, 'no fault line');
  const real = fx('crawl-ambition2drive-home.html');
  const after = readSignals('https://ambition2drive.com/', real, fx('crawl-ambition2drive-robots.txt'));
  ok(pageReadable({ status: 200, body: real }) && /Ambition2drive/.test(real) && !buildFaultLines(after).some((x) => x.kind === 'search_blocked'), 'the real domain (ambition2drive.com) reads, nothing blocked');
}

console.log('\n── 3. X Border Transport Training (Lavington NSW): readable, nothing blocked ──');
{
  const home = fx('crawl-xborder-home.html');
  const robots = fx('crawl-xborder-robots.txt');
  ok(pageReadable({ status: 200, body: home }) && /X BORDER TRANSPORT TRAINING/i.test(home), 'the homepage reads under our name');
  ok(robotsSearchBlocked(robots).length === 0, 'robots.txt blocks NerdyBot only — no AI search crawler');
  ok(!buildFaultLines(readSignals('https://www.xbordertt.com.au/', home, robots)).some((x) => x.kind === 'search_blocked'), 'no blocked finding');
}

console.log('\n── 4. a crawler is "blocked" only when robots.txt says so ──');
{
  ok(JSON.stringify(robotsSearchBlocked('User-agent: OAI-SearchBot\nDisallow: /')) === '["OAI-SearchBot"]', 'its own group disallowing "/" → named');
  ok(robotsSearchBlocked('User-agent: *\nDisallow: /').length === 4, '"User-agent: * / Disallow: /" shuts out all four');
  ok(robotsSearchBlocked('User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /').length === 0, 'training crawlers (GPTBot, ClaudeBot) are never a search block');
  ok(robotsSearchBlocked('User-agent: PerplexityBot\nDisallow: /private/').length === 0, 'a part of the site is not "the site"');
  ok(robotsSearchBlocked(null).length === 0, 'no robots.txt → nothing blocked');
  ok(verifiedSearchBlocked({ searchBlocked: ['OAI-SearchBot'] }).length === 0 && verifiedSearchBlocked({ searchBlocked: ['OAI-SearchBot'], blockEvidence: 'robots' }).length === 1, 'an unmarked (pre-2026-10-26) list is never believed; a robots-marked one is');
  const robotsBlocked = readSignals('https://x.example/', '<h1>Hi</h1><p>' + 'word '.repeat(400) + '</p>', 'User-agent: ChatGPT-User\nDisallow: /');
  const lines = buildFaultLines(robotsBlocked);
  ok(lines[0]?.kind === 'search_blocked' && /robots\.txt tells ChatGPT-User not to read/.test(lines[0].detail), 'a real robots.txt block IS the headline fault, worded as robots.txt');
  const audit = buildSiteAudit({ servedUrl: 'https://x.example/', requestedUrl: 'https://x.example/', robotsTxt: 'User-agent: ChatGPT-User\nDisallow: /', pages: [], sitemapsRead: 0, sitemapUrlCount: 0,
    offSiteSitemap: { count: 0, samples: [] }, coverage: { pagesCrawled: 1, capped: false } as never,
    probe: { searchBlocked: ['ChatGPT-User'], blockEvidence: 'robots', readableAs: SITE_CHECK_READ_AS, clientRendered: null }, duplicates: null });
  ok(audit.findings.some((x) => x.id === 'robots_blocks_ai_search') && !audit.findings.some((x) => x.id === 'search_crawler_refused'), 'the deep audit says it as robots_blocks_ai_search; search_crawler_refused is never built');
}

console.log('\n── 5. one way to read a site, everywhere ──');
{
  ok(SITE_CHECK_UA === 'LeadFinderOS-SiteCheck/1.0 (+https://findable.live)' && SITE_CHECK_HEADERS['User-Agent'] === SITE_CHECK_UA, 'the honest crawler name (Paul, 2026-10-01)');
  ok(AGENCY_CRAWLER_UA === SITE_CHECK_UA, 'the agency check uses the same name');
  ok(STANDARD_CRAWL.fetchTimeoutMs === SITE_FETCH_TIMEOUT_MS && FULL_CRAWL.fetchTimeoutMs === SITE_FETCH_TIMEOUT_MS, 'the quick check and the deep crawl wait the same time per page');
  const readers = ['supabase/functions/crawl-check/index.ts', 'supabase/functions/_shared/crawl-job.ts', 'supabase/functions/_shared/listing-website.ts',
    'supabase/functions/_shared/site-research.ts', 'supabase/functions/prospect-preview/index.ts', 'supabase/functions/scan-site-details/index.ts',
    'supabase/functions/extract-email/index.ts', 'supabase/functions/create-ai-audit/index.ts'];
  for (const p of readers) ok(/SITE_CHECK_HEADERS/.test(read(p)), `${p.replace('supabase/functions/', '')} reads the site with SITE_CHECK_HEADERS`);
  /* ⛔ No AI crawler is impersonated, and no site read borrows a browser identity. */
  const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const p of [...readers, 'supabase/functions/_shared/agency-crawl.ts']) {
    ok(!/OAI-SearchBot\/1\.0|ChatGPT-User\/1\.0|Claude-User\/1\.0|PerplexityBot\/1\.0/.test(code(p)), `${p.replace('supabase/functions/', '')}: never sends an AI crawler’s name`);
    ok(!/Chrome\/\d|Windows NT/.test(code(p)), `${p.replace('supabase/functions/', '')}: never a browser identity`);
  }
  const cc = code('supabase/functions/crawl-check/index.ts');
  ok(/searchBlocked = robotsSearchBlocked\(robotsBody\)/.test(cc) && /blockEvidence: BLOCK_EVIDENCE_ROBOTS/.test(cc) && /fetchFailed: !home,/.test(cc), 'crawl-check: blocked from robots.txt, marked; an unread homepage is fetchFailed');
  const job = code('supabase/functions/_shared/crawl-job.ts');
  ok(/searchBlocked: robotsSearchBlocked\(robotsTxt\), blockEvidence: BLOCK_EVIDENCE_ROBOTS/.test(job), 'the deep job: the same robots.txt rule, the same marker');
  /* ⛔ Couldn't check is never a message line. */
  const rm = code('src/lib/replyMove.ts');
  ok(!/couldn't read your website/i.test(rm + code('src/lib/pitchIssueWords.ts')) && /st === 'unreadable'/.test(rm), 'the site-shared reply holds for a person when the check could not read the site — no "my check couldn’t read your website" line');
  ok(summariseWebsiteCheck({ result: { signals: { fetchFailed: true } as never, homeFetch: { kind: 'blocked' } } } as never)?.depth === 'failed', 'a refused check is summarised as failed (couldn’t check)');
  ok(/refused our check/.test(HOME_FETCH_LABELS.blocked) && /says nothing about whether AI tools can read it/.test(HOME_FETCH_LABELS.blocked), 'the refused-check reason blames nothing');
}

if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
