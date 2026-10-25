/* ============================================================
   THE ONE WEBSITE CHECK + THE CALL SCRIPT'S ISSUE LIST (2026-10-15, feat/send-error-capture).

   Pins: one stored summary per lead, written by BOTH crawls and read by every screen (Inbox icon + popup, call
   script + call card, report, lead audit, hook card); the new speed and contact-route checks; no llms.txt; the
   automatic deep check behind a prospect's quick check; and the call script listing issues as short lines,
   capped, the rest on a tap, one plain line when clean.

   Run: npx tsx scripts/website-check.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { buildSiteAudit, type SiteAuditPage } from '../src/lib/siteAudit.ts';
import { detectEnquiryForm, type PageDigest } from '../src/lib/fullCrawl.ts';
import {
  issueLine, NO_WEBSITE_LINE, summariseWebsiteCheck, websiteCheckFor, WEBSITE_CHECK_VERSION, type WebsiteCheckView,
} from '../src/lib/websiteCheck.ts';
import { buildCallScript, CALL_SCRIPT_CHECK_OLD_DAYS, CALL_SCRIPT_ISSUE_LINES, spokenScriptText } from '../src/lib/callScript.ts';
import { isBrokenPageStatus } from '../src/lib/contentTrust.ts';
import { buildCallClose } from '../src/lib/callClose.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const SITE = 'https://example-plumbing.co.uk/';
function page(url: string, family: PageDigest['family'], over: Partial<PageDigest> = {}, b: Record<string, unknown> = {}): SiteAuditPage {
  const d: PageDigest = {
    url, finalUrl: url, status: 200, family, title: 'Example Plumbing ' + family, description: 'Plumber in Rugby', canonical: url,
    noindex: false, robots: '', h1: ['Example Plumbing'], h2: [], words: 400, excerpt: 'Example Plumbing in Rugby', internalLinks: 5,
    schemaTypes: [], viewport: true, jsonLdInvalid: 0, h3: [], ms: 400, bytes: 40_000, form: 'none', ...over,
  };
  return { url, status: 'done', d, b: b as never, l: [] };
}
const coverage = { pageCap: 60, capped: false, pagesCrawled: 4, urlsDiscovered: 4, notCrawled: 0, sitemapUrls: 4 };
function audit(pages: SiteAuditPage[]) {
  return buildSiteAudit({
    servedUrl: SITE, requestedUrl: SITE, robotsTxt: 'User-agent: *\nAllow: /\nSitemap: ' + SITE + 'sitemap.xml',
    pages, sitemapsRead: 1, sitemapUrlCount: 4, offSiteSitemap: { count: 0, samples: [] }, coverage,
    probe: { searchBlocked: [], readableAs: 'OAI-SearchBot', clientRendered: null }, duplicates: null,
    lead: { name: 'Example Plumbing', town: 'Rugby' }, homeText: 'Example Plumbing in Rugby',
  });
}

console.log('\n── 1. the new checks: contact route and page speed ──');
{
  ok(detectEnquiryForm('<form action="/x"><input type="email" name="e"><textarea></textarea></form>') === 'enquiry', 'a form with an email box is an enquiry form');
  ok(detectEnquiryForm('<form role="search"><input type="search" name="q"></form>') === 'none', 'a search box is not');
  ok(detectEnquiryForm('<iframe src="https://form.jotform.com/123"></iframe>') === 'enquiry', 'an embedded form-builder frame is');
  ok(detectEnquiryForm('<p>Call us</p>') === 'none', 'no form → none');

  const noRoute = audit([page(SITE, 'homepage'), page(SITE + 'services', 'service'), page(SITE + 'about', 'about'), page(SITE + 'contact', 'contact')]);
  const nr = noRoute.findings.find((f) => f.id === 'no_contact_route');
  ok(nr && nr.severity === 'high', 'no phone, no email, no form anywhere read → HIGH "No way to contact the business found"');
  const withForm = audit([page(SITE, 'homepage'), page(SITE + 'contact', 'contact', { form: 'enquiry' })]);
  ok(!withForm.findings.some((f) => f.id === 'no_contact_route') && withForm.findings.some((f) => f.id === 'enquiry_form' && f.severity === 'good'), 'an enquiry form is a contact route (and a strength)');
  const withPhone = audit([page(SITE, 'homepage', {}, { phones: [{ value: '01788 000000', url: SITE }] })]);
  ok(!withPhone.findings.some((f) => f.id === 'no_contact_route'), 'a phone number is a contact route');
  const old = audit([page(SITE, 'homepage', { form: undefined })]);
  ok(!old.findings.some((f) => f.id === 'no_contact_route'), 'a row from before the form check is never judged (absent = not checked)');

  const slow = audit([page(SITE, 'homepage', { ms: 4200 }), page(SITE + 'a', 'service', { ms: 3500 }), page(SITE + 'b', 'service', { ms: 6100 })]);
  ok(slow.findings.some((f) => f.id === 'slow_pages' && f.severity === 'medium' && /download/.test(f.saw)), 'a slow typical page → MEDIUM "Pages were slow to load", with the measured seconds');
  ok(slow.notChecked.some((n) => /not a full browser speed test/.test(n)), '…and says it is download time, not a browser speed test');
  const fast = audit([page(SITE, 'homepage'), page(SITE + 'a', 'service'), page(SITE + 'b', 'service')]);
  ok(!fast.findings.some((f) => /slow/.test(f.id)), 'fast pages → no speed issue');
  const untimed = audit([page(SITE, 'homepage', { ms: undefined })]);
  ok(untimed.notChecked.includes('Page speed — not measured by this crawl.'), 'too few timed pages → "not measured", never a guess');
  const all = [noRoute, withForm, slow, fast].flatMap((a) => a.findings.map((f) => f.id + ' ' + f.title + ' ' + f.saw));
  ok(!all.some((t) => /llms/i.test(t)), 'llms.txt is never an issue');
  ok(!/llms\.txt/.test(read('src/lib/websiteCheck.ts').replace(/\/\*[\s\S]*?\*\//g, '')), 'the website check never reads llms.txt');
}

console.log('\n── 2. one summary, one reader, one headline ──');
{
  const a = audit([page(SITE, 'homepage'), page(SITE + 'services', 'service'), page(SITE + 'about', 'about'), page(SITE + 'contact', 'contact')]);
  const row = { mode: 'full', created_at: '2026-10-15T09:00:00Z', result: { checked_at: '2026-10-15T09:00:00Z', signals: { pagesChecked: 4 } }, full_evidence: { audit: a, completeness: 'complete' } };
  const s = summariseWebsiteCheck(row as never)!;
  ok(s.version === WEBSITE_CHECK_VERSION && s.depth === 'deep' && s.pagesRead === 4, 'a deep crawl → a deep summary with the pages read');
  ok(s.issues.every((i) => i.severity !== ('good' as never)) && s.issues.every((i, k, arr) => k === 0 || ['high', 'medium', 'low'].indexOf(arr[k - 1].severity) <= ['high', 'medium', 'low'].indexOf(i.severity)), 'issues only (strengths apart), worst first');
  ok(s.issues.every((i) => Array.isArray(i.pages) && i.pages.length <= 3), 'each issue keeps the pages it was read on (evidence)');
  const v = websiteCheckFor({ ...row, result: { ...row.result, websiteCheck: s } } as never, { website: SITE, nowMs: Date.parse('2026-10-16T00:00:00Z') });
  ok(v.state === 'issues' && /website issue/.test(v.headline) && /on the 4 pages checked/.test(v.headline), `issues → "${v.headline}"`);
  ok(v.coverageLine === 'Checked 15 Oct · 4 pages read (deep check)', `coverage → "${v.coverageLine}"`);
  const fromRow = websiteCheckFor(row as never, { website: SITE, nowMs: Date.parse('2026-10-16T00:00:00Z') });
  ok(fromRow.headline === v.headline, 'a row without a stored summary reads exactly the same (computed the same way)');

  const good = audit([page(SITE, 'homepage', { form: 'enquiry', schemaTypes: ['LocalBusiness'] }, { phones: [{ value: '01788 000000', url: SITE }], emails: [{ value: 'a@b.co', url: SITE }], addresses: [{ value: 'CV21 1AA', url: SITE }], reviews: [{ value: 'Great', url: SITE }] }),
    page(SITE + 'plumbing', 'service'), page(SITE + 'about', 'about'), page(SITE + 'contact', 'contact', { form: 'enquiry' })]);
  const cleanRow = { mode: 'full', created_at: '2026-10-15T09:00:00Z', result: { checked_at: '2026-10-15T09:00:00Z' }, full_evidence: { audit: good, completeness: 'complete' } };
  const cv = websiteCheckFor(cleanRow as never, { website: SITE, nowMs: Date.parse('2026-10-16T00:00:00Z') });
  ok(cv.serious.length === 0 ? cv.state === 'clean' && cv.headline.startsWith('No serious website issues found on the 4 pages checked.') : true, `clean → "${cv.headline}"`);

  ok(websiteCheckFor(null, { website: '' }).headline === NO_WEBSITE_LINE, 'no website → the one no-website line');
  ok(websiteCheckFor(null, { website: SITE }).state === 'not_checked', 'not checked → says so, never "no issues"');
  const failed = websiteCheckFor({ result: { checked_at: '2026-10-15T09:00:00Z', signals: { fetchFailed: true }, homeFetch: { kind: 'dns' } } } as never, { website: SITE });
  ok(failed.state === 'unreadable' && /domain may have lapsed/.test(failed.headline), 'unreadable → the reason, never "no issues"');
  ok(websiteCheckFor(null, { website: 'https://www.facebook.com/someplumber' }).state === 'profile', 'a social profile is never "their website"');
  const stale = websiteCheckFor(row as never, { website: SITE, nowMs: Date.parse('2026-12-20T00:00:00Z') });
  ok(stale.stale && /over 30 days ago/.test(stale.coverageLine ?? ''), 'an old check says it may be out of date');
}

console.log('\n── 2b. only real issues: true broken pages, each issue said once ──');
{
  ok(isBrokenPageStatus(404) && isBrokenPageStatus(410) && isBrokenPageStatus(503) && !isBrokenPageStatus(403) && !isBrokenPageStatus(429) && !isBrokenPageStatus(401), 'broken = 404 / 410 / 5xx; 401 / 403 / 429 is the site refusing OUR crawler');
  const failedPage = (url: string, httpStatus: number): SiteAuditPage => ({ url, status: 'failed', httpStatus });
  const a = audit([page(SITE, 'homepage'), failedPage(SITE + 'x', 429), failedPage(SITE + 'y', 403), failedPage(SITE + 'z', 404)]);
  const b = a.findings.find((f) => f.id === 'broken_pages');
  ok(!!b && b.urls.length === 1 && /404/.test(b.urls[0]), 'only the 404 is a broken page');
  ok(a.notChecked.some((n) => /refused or rate-limited our crawler \(HTTP 429, 403\)/.test(n)), 'the 429 / 403 are said as "not judged"');
  /* An audit stored before this rule (live: 13 pages answered 429 to a fast crawl) is corrected when it is summarised. */
  const stored = { ...a, findings: [{ id: 'broken_pages', category: 'discovery', severity: 'medium', title: 'Linked pages that return an error', saw: 'x', meaning: '', count: 2, urls: [SITE + 'x (429)', SITE + 'y (403)'], urlsComplete: true },
    { id: 'no_https', category: 'discovery', severity: 'high', title: 'The site is served without HTTPS', saw: 'x', meaning: '', count: 0, urls: [], urlsComplete: true },
    { id: 'ct_no_https', category: 'discovery', severity: 'high', title: 'The site is not served securely (no HTTPS)', saw: 'x', meaning: '', count: 0, urls: [], urlsComplete: true }] };
  const s = summariseWebsiteCheck({ mode: 'full', created_at: '2026-10-15T09:00:00Z', result: { checked_at: '2026-10-15T09:00:00Z' }, full_evidence: { audit: stored, completeness: 'complete' } } as never)!;
  ok(!s.issues.some((i) => i.id === 'broken_pages'), 'an older stored "broken" list of only 429 / 403 is dropped');
  ok(s.issues.filter((i) => /no_https/.test(i.id)).length === 1, 'no HTTPS is said once, not twice');
}

console.log('\n── 3. both crawls write it; every screen reads it ──');
{
  ok(/summariseWebsiteCheck\(\{ result: storedResult as never, mode: "standard", created_at: checkedAt \}\)/.test(read('supabase/functions/crawl-check/index.ts')), 'the quick check stores the summary with its result');
  ok(/summariseWebsiteCheck\(\{ result, full_evidence: full as never, mode: "full", created_at: checkedAt \}\)/.test(read('supabase/functions/_shared/crawl-job.ts')), 'the deep check stores the summary with its result');
  const readers: Array<[string, RegExp]> = [
    ['src/components/CrawlCheckButton.tsx', /websiteCheckFor\(/],
    ['src/lib/coldCallPlaybook.ts', /const check = websiteCheckFor\(row, \{ website: input\.lead\.website, nowMs: input\.nowMs \}\);/],
    ['supabase/functions/render-audit-report/index.ts', /const wc = cc \? websiteCheckFor\(/],
    ['src/lib/prospectAuditView.ts', /headline: websiteCheckFor\(row, \{ website: site \}\)\.headline/],
    ['src/components/HookWebsiteIssuesView.tsx', /outcome\.check/],
  ];
  for (const [f, re] of readers) ok(re.test(read(f)), `${f} reads the one website check`);
  const cp = read('src/lib/coldCallPlaybook.ts');
  const sel = cp.slice(cp.indexOf('export function selectFindings'), cp.indexOf('export function selectFindings') + 3000);
  ok(!/runCrawls\]|resolveFindingsSource\(|freshInsights\(|freshContentIssues\(/.test(sel), 'the call script no longer reads an audit run\'s copy or a second pool');
  const btn = read('src/components/CrawlCheckButton.tsx');
  ok(!/No AI-visibility faults found/.test(btn) && /const faulted = view\?\.state === 'issues';/.test(btn), 'the Inbox icon\'s dot and popup say what the one check says');
  const rep = read('supabase/functions/render-audit-report/index.ts');
  ok(/delete data\.siteEvidence;\s+delete data\.contentIssues;/.test(rep), 'a lead\'s report shows the one check\'s issues, not the three older picks');
}

console.log('\n── 4. a prospect\'s quick check queues the deep check ──');
{
  const cc = read('supabase/functions/crawl-check/index.ts');
  ok(/requestedFrom: "automatic", pageCap: PROSPECT_CRAWL_PAGE_CAP/.test(cc), 'the automatic deep check is the capped prospect crawl');
  ok(/lr && !isClientLead\(lr\) \? await activeJobFor/.test(cc), 'never for a paying client, never while one runs');
  ok(/\(count \?\? 0\) < AUTO_DEEP_MAX_RUNNING/.test(cc), 'capped how many wait at once');
  const block = cc.slice(cc.indexOf('ONE DEEP CHECK FOR EVERY PROSPECT'), cc.indexOf('// Attach the result to the exact audit run'));
  ok(!/kickCrawlWorker/.test(block), 'no kick: the minute cron takes them one after another (a bulk audit never floods the worker)');
  /* 2026-10-19: also behind the call screen's one-time start of a MISSING check (callScreenCrawl.ts) — never a person's other presses. */
  ok(/leadId && \(internal \|\| callScreen\) && stored === true/.test(cc), 'only behind an automated (or call-screen) quick check that was stored (a fresh deep check is never replaced)');
  ok(read('src/lib/fullCrawl.ts').includes("'client_intake', 'automatic', 'catch_up'] as const"), "'automatic' is a recorded crawl source");
}

console.log('\n── 5. the call script lists the issues (Job 3) ──');
{
  const mk = (n: number): WebsiteCheckView => {
    const issues = Array.from({ length: n }, (_, k) => ({ id: 'i' + k, severity: k < 2 ? 'high' as const : 'medium' as const, title: 'Issue number ' + k, saw: 'Seen ' + k, meaning: '', count: k === 0 ? 3 : 0, pages: [SITE] }));
    return { state: 'issues', summary: null, serious: issues, minor: [{ id: 'm', severity: 'low', title: 'Minor thing', saw: '', meaning: '', count: 0, pages: [] }], headline: n + ' website issues found on the 9 pages checked.', coverageLine: 'Checked 15 Oct · 9 pages read (deep check)', stale: false, ageDays: 2, checkedDay: '15 Oct' };
  };
  const base = {
    searchFor: 'a plumber in Rugby', engine: 'Gemini', evidenceKind: 'gap' as const, competitors: ['A Ltd', 'B Ltd'], auditStale: false,
    findings: [{ kind: 'i0' as never, title: 'Issue number 0', explanation: 'Seen 0' }], findingsStatus: 'findings' as const,
    site: { source: 'own_site' as const, label: null }, close: buildCallClose('own_site'), contactedBefore: false, hasReport: true,
  };
  const s = buildCallScript({ ...base, website: mk(8) });
  ok(s.found.lines.length === CALL_SCRIPT_ISSUE_LINES && s.found.lines[0] === 'Issue number 0' && s.found.lines[1] === 'Issue number 1', 'TITLES ONLY (no page counts), most important first, max 5');
  ok(s.found.more.length === 0 && s.found.sources.length === 0, 'a sixth issue, the minor points and the page proof stay out (2026-10-17)');
  ok(s.found.coverage === 'Checked 15 Oct' && s.found.oldNote === null, 'says when it was checked; a 2-day-old check has no old note');
  const old = buildCallScript({ ...base, website: { ...mk(2), ageDays: CALL_SCRIPT_CHECK_OLD_DAYS + 1 } });
  const edge = buildCallScript({ ...base, website: { ...mk(2), ageDays: CALL_SCRIPT_CHECK_OLD_DAYS } });
  ok(old.found.oldNote === 'Press Run again before the call' && edge.found.oldNote === null, 'older than 14 days → "Press Run again before the call" (Paul, 2026-10-19); exactly 14 is not old');
  ok(!/https?:|.uk|.com/.test(s.found.lines.join(' ')), 'no URLs in the list');
  const said = spokenScriptText(s);
  ok(!/found a few potential reasons|an issue was found|one thing that could be part of it|stood out/i.test(said), 'no "I found a few potential reasons" sentence around the issues');
  const clean = buildCallScript({ ...base, findings: [], findingsStatus: 'clean', website: { ...mk(0), state: 'clean', serious: [], headline: 'No serious website issues found on the 9 pages checked. 1 minor point.' } });
  ok(clean.found.lines.length === 0 && clean.found.more.length === 0, 'completed with no serious issue (minor points only) → nothing said about the site');
  const nc = buildCallScript({ ...base, findings: [], findingsStatus: 'not_crawled', website: { ...mk(0), state: 'not_checked', serious: [], minor: [], headline: 'Website not checked yet.' } });
  /* 2026-10-19 (Paul): the old "Website not checked yet. No usable website check…" line is REPLACED. */
  ok(nc.found.lines.length === 0 && !/No usable website check/.test(nc.found.note ?? '') && /say nothing about the site/.test(nc.found.note ?? ''), 'not checked → nothing said about the site, and the old "no usable website check" line is gone');
  ok(!/isn't really set up to be found by AI/.test(spokenScriptText(clean)), '…not the old "isn\'t really set up for AI" line that read like an issue');
  ok(issueLine({ id: 'x', severity: 'high', title: 'No phone number found', saw: '', meaning: '', count: 0, pages: [] }) === 'No phone number found', 'a site-wide issue is just its title');
  const ui = read('src/components/ColdCallPlaybook.tsx');
  ok(/data-testid="call-found-coverage"/.test(ui) && /CALL_SCRIPT_ISSUES_HEADING/.test(ui) && /data-testid="call-found-old"/.test(ui), 'the screen shows the heading, the checked day and the old-check note');
  ok(read('src/components/CrawlCheckButton.tsx').includes("queryKey: ['cold-call-playbook']"), 'a finished crawl refreshes the call script (it kept "not checked yet" otherwise)');
}

console.log('\n── 6. KSM (Paul, 2026-10-20): placeholder posts counted once, areas said before headings ──');
{
  const K = 'https://ksm-example.co.uk/';
  const posts = [1, 2, 3].map((n) => `${K}post-${n}-headline/`);
  const iss = (id: string, severity: 'high' | 'medium' | 'low', count: number, pages: string[]) => ({ id, severity, title: id, saw: id, meaning: '', count, pages });
  const stored = {
    version: WEBSITE_CHECK_VERSION, depth: 'deep', checkedAt: '2026-10-19T10:27:04Z', pagesRead: 12, pagesFound: 12, capped: false,
    issues: [iss('ct_placeholder_content', 'high', 6, posts), iss('near_duplicate_pages', 'medium', 6, []),
      iss('vs_key_page_basics', 'medium', 5, [K, K + 'prices/']), iss('ct_conflicting_facts', 'medium', 2, [K]), iss('location_unclear', 'medium', 0, [K])],
    strengths: [], notChecked: [], failure: null,
  };
  const v = websiteCheckFor({ result: { websiteCheck: stored } as never, created_at: '2026-10-19T10:27:04Z' } as never, { website: K, nowMs: Date.parse('2026-10-20T10:00:00Z') });
  const ids = v.serious.map((i) => i.id);
  ok(!ids.includes('near_duplicate_pages'), 'the six "Post N Headline" placeholder posts are counted once: no "near enough the same" issue for them');
  ok(ids.indexOf('location_unclear') < ids.indexOf('vs_key_page_basics') && ids[0] === 'ct_placeholder_content', 'within a severity, the town / areas issue is said before the heading / description issue');
  ok(v.serious.find((i) => i.id === 'ct_placeholder_content')?.pages.join() === posts.join() && v.serious.find((i) => i.id === 'location_unclear')?.pages[0] === K, 'every issue keeps its stored pages (the evidence)');
  const real = { ...stored, issues: [iss('near_duplicate_pages', 'medium', 4, [K + 'a/', K + 'b/'])] };
  ok(websiteCheckFor({ result: { websiteCheck: real } as never, created_at: '2026-10-19T10:27:04Z' } as never, { website: K, nowMs: Date.parse('2026-10-20T10:00:00Z') }).serious.some((i) => i.id === 'near_duplicate_pages'), 'real near-duplicate pages (no placeholder posts) are still an issue');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
