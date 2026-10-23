/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WEBSITE-CHECK RULES OF 2026-10-23 (Paul, chore/loose-ends-and-site-checks):
     (a) broken placeholder text on a page ("Welcome, !", "{{first_name}}");
     (b) the Google listing does not link to the website (Google's record we already hold, phone_cache);
     (c) a star rating or pass rate with no source named on the page.
   Each is said in the pitch's own words (pitchIssueWords.ts), so the first-reply pitch and the "site shared" reply can use
   it. Pins the false positives too, and that a check stored before these existed is never judged by them.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { buildContentTrust, pageObservations, type ContentTrust, type PageObs } from '../src/lib/contentTrust.ts';
import { listingLinkVerdict, listingNeedsFollow, listingRecordUsable, LISTING_RECORD_FRESH_DAYS } from '../src/lib/listingLink.ts';
import { pitchIssueLine, pitchIssueLines, GOOGLE_LISTING_NO_LINK } from '../src/lib/pitchIssueWords.ts';
import { plainIssueTitle, summariseWebsiteCheck, websiteCheckFor } from '../src/lib/websiteCheck.ts';
import { siteSharedReply } from '../src/lib/replyMove.ts';

let failures = 0;
function ok(cond: unknown, label: string) { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); }

const HOME = 'https://www.example-driving.co.uk/';
const html = (body: string) => `<html><head><title>Example Driving School</title><meta name="viewport" content="width=device-width"></head><body>${body}</body></html>`;
const obs = (path: string, body: string) => pageObservations(html(body), new URL(path, HOME).href, HOME);
const build = (pages: PageObs[], extra: Partial<Parameters<typeof buildContentTrust>[0]> = {}) => buildContentTrust({
  pages, servedUrl: HOME, knownUrls: pages.map((p) => p.url), robotsTxt: 'User-agent: *\nAllow: /', sitemapsRead: 1,
  lead: { name: 'Example Driving School', town: 'Banbury', trade: 'Driving instructors' }, partial: true, ...extra,
});
const issue = (ct: ContentTrust, k: string) => ct.issues.find((i) => i.kind === k);
/* The issue as the website check hands it on (siteAudit.contentIssueFinding → WebsiteIssue): id ct_<kind>, saw = first evidence line. */
const asWebsiteIssue = (ct: ContentTrust, k: string) => {
  const i = issue(ct, k)!;
  return { id: `ct_${i.kind}`, severity: i.severity, title: i.title, saw: i.evidence[0] ?? '', meaning: i.why, count: i.urls.length, pages: i.urls };
};

console.log('── (a) broken placeholder text ──');
{
  const ct = build([obs('/', '<h1>Driving lessons in Banbury</h1><p>Welcome, !</p><p>Book your first lesson today.</p>')]);
  const ph = issue(ct, 'placeholder_content');
  ok(ph && ph.severity === 'high' && /Broken placeholder text/.test(ph.title), '"Welcome, !" on a page → a HIGH broken-placeholder issue');
  ok(ph?.evidence[0] === '“Welcome, !” on the homepage', `…quoting it exactly: ${ph?.evidence[0]}`);
  ok(ph?.spoken === 'A line on your site reads “Welcome, !” where a name should be.', '…and the spoken line says what it is');
  const wi = asWebsiteIssue(ct, 'placeholder_content');
  ok(pitchIssueLine(wi) === 'A line on your site reads "Welcome, !" where a name should be', `pitch words: ${pitchIssueLine(wi)}`);
  ok(plainIssueTitle(wi as never) === 'A line on your site reads “Welcome, !” where a name should be', `screen words: ${plainIssueTitle(wi as never)}`);

  const tokens = build([obs('/', '<p>Hi {{first_name}}, thanks for visiting [Your Name] Driving School in [Town].</p>')]);
  const ev = issue(tokens, 'placeholder_content')?.evidence.join(' | ') ?? '';
  ok(/\{\{first_name\}\}/.test(ev) && /\[Your Name\]/.test(ev) && /\[Town\]/.test(ev), `template tokens are caught: ${ev}`);
  ok(pitchIssueLine(asWebsiteIssue(tokens, 'placeholder_content')) === 'Some pages still have sample text on them', '…and said as sample text left on the page');
  const back = build([obs('/', '<p>Welcome back , !</p>')]);
  ok(issue(back, 'placeholder_content')?.evidence[0] === '“Welcome back, !” on the homepage', '"Welcome back , !" is tidied to how it reads');

  const fine = build([obs('/', '<p>Welcome, John! Hi, I’m Dave. Thanks, we will be in touch. Hello, and welcome to Banbury’s friendliest school…</p>')]);
  ok(!issue(fine, 'placeholder_content'), 'a filled greeting, "Hi, I’m Dave." and an ellipsis are not broken text');
  const vue = build([obs('/', '<div>{{ item.price }} {{ lesson }}</div>')]);
  ok(!issue(vue, 'placeholder_content'), 'a page-template value that is not a name or place ({{ item.price }}) is never called broken');
  const old = obs('/', '<p>Welcome, !</p>');
  ok(old.placeholders[0] === '“Welcome, !”', 'the reading is stored with the page (the deep crawl keeps it per page)');
}

console.log('\n── (c) ratings and pass rates with no source ──');
{
  const pass = build([obs('/', '<h1>Driving lessons</h1><p>We have a 98% pass rate and our pupils love us.</p>')]);
  const u = issue(pass, 'unsourced_claims');
  ok(u && u.severity === 'medium' && /pass rate/.test(u.title), `"98% pass rate" with no source → MEDIUM: ${u?.title}`);
  ok(/98% pass rate/.test(u?.evidence[0] ?? ''), `…with the words read: ${u?.evidence[0]}`);
  ok(pitchIssueLine(asWebsiteIssue(pass, 'unsourced_claims')) === "Your site quotes a pass rate but doesn't say where it comes from", 'pitch words for a pass rate');
  ok(!issue(build([obs('/', '<p>Our 98% pass rate is well above the DVSA national average for Banbury test centre.</p>')]), 'unsourced_claims'), 'a pass rate beside the DVSA figures → sourced, no issue');
  ok(!!issue(build([obs('/', '<p>Pass rate of 92% for first-time candidates.</p>')]), 'unsourced_claims'), '"pass rate of 92%" is a claim too');

  const rating = build([obs('/', '<p>Rated 4.9/5 by our pupils. A 5 star service every time.</p>')]);
  ok(!!issue(rating, 'unsourced_claims'), '"Rated 4.9/5" with no source → an issue');
  ok(pitchIssueLine(asWebsiteIssue(rating, 'unsourced_claims')) === "Your site shows a star rating but doesn't say where it comes from", 'pitch words for a rating');
  ok(!issue(build([obs('/', '<p>Rated 4.9/5 on Google from 120 reviews.</p>')]), 'unsourced_claims'), 'a rating that names Google → sourced');
  ok(!issue(build([obs('/', '<p>Rated 4.9 out of 5.</p><div class="trustpilot-widget"></div>')]), 'unsourced_claims'), 'a rating beside a Trustpilot widget → sourced');
  ok(!issue(build([obs('/', '<p>A 5 star service from friendly instructors. We are a five-star team.</p>')]), 'unsourced_claims'), '"5 star service" is a boast, not a rating claim');
  ok(!issue(build([obs('/', '<p>Lessons from £35. Block of 10 hours. 2 out of 3 pupils pass first time.</p>')]), 'unsourced_claims'), 'prices, hours and "2 out of 3" are not ratings');
  const both = build([obs('/', '<p>98% pass rate.</p>'), obs('/reviews', '<p>Rated 5/5 by pupils.</p>')]);
  ok(/a pass rate and a star rating/.test(issue(both, 'unsourced_claims')?.title ?? ''), 'both on the site → one issue naming both');
  ok(/pass rate/.test(issue(both, 'unsourced_claims')?.evidence[0] ?? ''), '…the pass rate first, so the pitch names it');

  const stored = obs('/', '<p>98% pass rate.</p>');
  delete (stored as { claims?: unknown }).claims;
  ok(!issue(build([stored]), 'unsourced_claims'), 'a page read before this check existed (no claims field) is never judged');
}

console.log('\n── (b) the Google listing links to the site ──');
{
  const v = (listingWebsite: string | null, landedUrl?: string | null, known = true) => listingLinkVerdict({ known, listingWebsite, checkedUrl: HOME, landedUrl });
  ok(v(null, undefined, false) === null, 'no Google record we can read → not judged');
  ok(v(null) === 'no_link', 'Google’s record has no website → "no_link"');
  ok(v('  ') === 'no_link', 'an empty website field → "no_link"');
  ok(v('http://example-driving.co.uk/lessons') === 'links', 'same domain (no www, http, a deeper page) → links');
  ok(v('https://facebook.com/exampledriving') === 'no_link', 'a Facebook page in place of the site → "no_link"');
  ok(v('https://www.yell.com/biz/example') === 'no_link', 'a directory page in place of the site → "no_link"');
  ok(v('https://old-driving.co.uk/') === null, 'a different domain not yet followed → not judged');
  ok(v('https://old-driving.co.uk/', null) === null, '…and one whose link could not be followed → not judged');
  ok(v('https://old-driving.co.uk/', 'https://www.example-driving.co.uk/') === 'links', 'an old domain that forwards here → links');
  ok(v('https://other-school.co.uk/', 'https://other-school.co.uk/') === 'other_site', 'a link landing on another site → "other_site"');
  ok(listingNeedsFollow('https://old-driving.co.uk/', HOME) && !listingNeedsFollow('https://facebook.com/x', HOME) && !listingNeedsFollow('https://example-driving.co.uk', HOME),
    'only a different, non-social domain is followed');

  const now = Date.parse('2026-10-23T12:00:00Z');
  ok(!listingRecordUsable({ details_version: 1, created_at: '2026-10-20T00:00:00Z' }, now), 'a v1 cache row (website never asked for) is never judged');
  ok(listingRecordUsable({ details_version: 2, created_at: '2026-10-20T00:00:00Z' }, now), 'a recent v2 row is judged');
  ok(!listingRecordUsable({ details_version: 2, created_at: new Date(now - (LISTING_RECORD_FRESH_DAYS + 1) * 86_400_000).toISOString() }, now), 'an old record is not judged (the listing may have been fixed)');
  ok(!listingRecordUsable(null, now) && !listingRecordUsable({ details_version: 2, created_at: null }, now), 'no row / no date → not judged');

  const pages = [obs('/', '<h1>Driving lessons in Banbury</h1>')];
  const none = build(pages, { listing: { verdict: 'no_link', website: null } });
  const li = issue(none, 'listing_no_link');
  ok(li && li.severity === 'medium' && li.title === 'Your Google listing doesn’t link to your website', `no link → MEDIUM: ${li?.title}`);
  ok(pitchIssueLine(asWebsiteIssue(none, 'listing_no_link')) === GOOGLE_LISTING_NO_LINK, 'pitch words = the "site shared" reply’s own line');
  const other = build(pages, { listing: { verdict: 'other_site', website: 'https://other-school.co.uk/' } });
  ok(pitchIssueLine(asWebsiteIssue(other, 'listing_no_link')) === 'Your Google listing links to a different website', 'a different site → its own words');
  ok(/other-school\.co\.uk/.test(issue(other, 'listing_no_link')?.evidence[0] ?? ''), '…naming where the listing points');
  ok(!issue(build(pages, { listing: { verdict: 'links', website: HOME } }), 'listing_no_link') && build(pages, { listing: { verdict: 'links', website: HOME } }).verified.includes('The Google listing links to this site.'), 'links → no issue, said as checked');
  ok(!issue(build(pages, { listing: null }), 'listing_no_link') && !issue(build(pages), 'listing_no_link'), 'not judged → no issue');

  const r = siteSharedReply(pitchIssueLines([asWebsiteIssue(none, 'listing_no_link')]), { googleNoLink: true, whoKnown: true });
  ok((r.text.toLowerCase().match(/google listing doesn't link/g) ?? []).length === 1, `the site-shared reply never says the listing line twice: ${r.text.split('\n')[0]}`);
  const r2 = siteSharedReply(pitchIssueLines([asWebsiteIssue(other, 'listing_no_link')]), { googleNoLink: true, whoKnown: true });
  ok(!r2.text.includes(GOOGLE_LISTING_NO_LINK) && r2.text.includes('links to a different website'), 'the check’s reading of Google’s record wins over the guess');
}

console.log('\n── through the website check (one summary, one reader) ──');
{
  const pages = [obs('/', '<h1>Driving lessons in Banbury</h1><p>Welcome, !</p><p>98% pass rate. Call 01295 000000.</p>')];
  const ct = build(pages, { listing: { verdict: 'no_link', website: null } });
  const row = { mode: 'quick', created_at: '2026-10-23T09:00:00Z', url: HOME, result: { checked_at: '2026-10-23T09:00:00Z', url: HOME, version: 99, signals: { homeUrl: HOME, fetchFailed: false, pagesChecked: 1 }, contentTrust: ct } };
  const s = summariseWebsiteCheck(row as never);
  const ids = (s?.issues ?? []).map((i) => i.id);
  ok(['ct_placeholder_content', 'ct_listing_no_link', 'ct_unsourced_claims'].every((id) => ids.includes(id)), `all three reach the stored summary: ${ids.join(', ')}`);
  const view = websiteCheckFor(row as never, { website: HOME, nowMs: Date.parse('2026-10-23T10:00:00Z') });
  const lines = pitchIssueLines(view.serious, view.minor);
  ok(lines.includes('A line on your site reads "Welcome, !" where a name should be') && lines.includes(GOOGLE_LISTING_NO_LINK) && lines.some((l) => /pass rate/.test(l)),
    `…and the pitch list can use them: ${lines.join(' / ')}`);
}

console.log('\n── wiring: both crawls, no paid call, the old checks kept ──');
{
  const read = (p: string) => readFileSync(p, 'utf8');
  const quick = read('supabase/functions/crawl-check/index.ts'), deep = read('supabase/functions/_shared/crawl-job.ts'), helper = read('supabase/functions/_shared/listing-website.ts');
  ok(/listingForCheck\(service, \(leadRow\?\.place_id/.test(quick) && /buildContentTrust\(\{\s*listing,/.test(quick), 'the quick check passes Google’s record to the content checks');
  ok(/listingForCheck\(service, \(l\?\.place_id/.test(deep) && /buildContentTrust\(\{\s*listing,/.test(deep), 'the deep crawl does too');
  ok(/from\("phone_cache"\)/.test(helper) && !/places\.googleapis|google-place-details|apify/i.test(helper.replace(/\/\*[\s\S]*?\*\//g, '')), 'the listing is read from phone_cache, never a paid Google call');
  ok(/listingRecordUsable/.test(helper), 'the helper judges only usable records');
  const ctSrc = read('src/lib/contentTrust.ts');
  ok(/kind: 'conflicting_facts'/.test(ctSrc) && /kind: 'no_people'/.test(ctSrc), 'the existing checks stay');
  const vis = read('src/lib/visibilityChecks.ts');
  ok(/vs_name_inconsistent/.test(vis) && /vs_address_not_on_key_pages/.test(vis), 'the name and address checks stay');
}

if (failures) { console.log(`\n${failures} FAILURE${failures === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
