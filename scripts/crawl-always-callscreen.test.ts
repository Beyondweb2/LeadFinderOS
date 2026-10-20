/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CRAWL ALWAYS FOLLOWS THE AUDIT (2026-10-20, feat/crawl-always-callscreen).

   Pinned here:
     1. The call screen's website section is only ever Checking / Done / Couldn't check the site / No website.
     2. A failed check is retried once, ever, from the call screen (callScreenCrawl.ts).
     3. The no-website words; a missing check is said as running, never "not checked yet".
     4. The page reader: areas served not stated, the owner the site names, and the same pages counted once.
     5. The audit's town prefers the Coverage area the lead was found under, within the wrong-town guard.
     6. The quick check reads one page at a time and obeys robots.txt; a prospect's deep crawl one page at a time.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { websiteCrawlShown, COULD_NOT_CHECK_LINE } from '../src/lib/websiteCrawlShown.ts';
import { callScreenCrawlRefusal, isCallScreenRetry } from '../src/lib/callScreenCrawl.ts';
import { NO_WEBSITE_LINE, placeholderPagesOnce, websiteCheckFor, plainIssueTitle, type WebsiteCheckSummary } from '../src/lib/websiteCheck.ts';
import { buildCallScript, NO_WEBSITE_SPOKEN, CHECKING_NOTE, type CallScriptInput } from '../src/lib/callScript.ts';
import { buildCallClose } from '../src/lib/callClose.ts';
import { buildContentTrust, ownerOf, pageObservations } from '../src/lib/contentTrust.ts';

let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log('  PASS ' + label);
  else { failures++; console.log('  FAIL ' + label); }
}
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('\n── 1. the section is never empty ──');
const sh = (state: string, checking = false, auto = 'idle', waitedOut = false) => websiteCrawlShown({ state, checking, auto, waitedOut });
ok(sh('not_checked') === 'checking', 'no check yet → Checking (it is being started), never "not checked"');
ok(sh('not_checked', false, 'failed') === 'could_not_check' && sh('not_checked', false, 'skipped', true) === 'could_not_check', 'start failed, or waited out → Couldn’t check the site');
ok(sh('unreadable') === 'could_not_check' && sh('unreadable', true) === 'checking', 'a failed check → Couldn’t check (Checking while its one retry runs)');
ok(sh('issues') === 'done' && sh('clean') === 'done', 'issues or none → Done');
ok(sh('no_website') === 'no_website' && sh('profile') === 'no_website', 'no website / only a profile → No website');
ok(COULD_NOT_CHECK_LINE === "Couldn't check the site.", 'the failed wording is Paul’s');
const section = read('../src/components/WebsiteCrawlSection.tsx');
ok(!/Not checked yet|Check now/.test(section), 'the section no longer says "Not checked yet" or "Check now"');

console.log('\n── 2. one retry of a failed check ──');
const base = { leadId: 'l', website: 'https://x.co.uk', hasCompletedAudit: true, hasCrawlRow: true, jobRunning: false, lastStartMs: null, startsByPersonInWindow: 0, nowMs: 1e12 };
ok(callScreenCrawlRefusal({ ...base, crawlRowFailed: false }) === 'already_checked', 'a good check is never re-crawled by opening a screen');
ok(callScreenCrawlRefusal({ ...base, crawlRowFailed: true, retriedBefore: false }) === null, 'a failed check is tried again once');
ok(callScreenCrawlRefusal({ ...base, crawlRowFailed: true, retriedBefore: true }) === 'already_retried', '…and only once');
ok(callScreenCrawlRefusal({ ...base, crawlRowFailed: true }) === 'already_retried', 'retry history unknown → no retry (fails closed)');
ok(isCallScreenRetry({ hasCrawlRow: true, crawlRowFailed: true }) && !isCallScreenRetry({ hasCrawlRow: false }), 'the retry is recorded as one');
const cc = read('../supabase/functions/crawl-check/index.ts');
ok(/data->>retry", "true"/.test(cc) && /retry: true/.test(cc), 'crawl-check reads and records the retry');

console.log('\n── 3. the words ──');
ok(NO_WEBSITE_LINE === 'No website found. Gemini and Google AI have no site of yours to read.', 'the section’s no-website line is Paul’s');
ok(!/harm/i.test(NO_WEBSITE_LINE + NO_WEBSITE_SPOKEN), 'never "harming"');
ok(websiteCheckFor(null, { website: '' }).headline === NO_WEBSITE_LINE, 'every screen says the one no-website line');
const input = (o: Partial<CallScriptInput>): CallScriptInput => ({
  searchFor: 'a driving instructor in Acle', engine: 'Gemini', evidenceKind: 'gap', competitors: ['A School', 'B School'], auditStale: false,
  findings: [], findingsStatus: 'clean', website: null, site: { source: 'own_site', label: null }, close: buildCallClose('own_site'),
  contactedBefore: false, hasReport: false, ...o,
});
const nw = buildCallScript(input({ findingsStatus: 'no_website', site: { source: 'none', label: null }, close: buildCallClose('none') }));
ok(nw.opener.some((l) => l.includes(NO_WEBSITE_SPOKEN)) && nw.found.lines.length === 0, 'no website → the no-website line, said once');
const nc = buildCallScript(input({ findingsStatus: 'not_crawled' }));
ok(nc.found.note === CHECKING_NOTE && nc.opener.length === 1, 'a missing check is said as running, and nothing about the site');
const clean = buildCallScript(input({ findingsStatus: 'clean' }));
ok(clean.opener.length === 1 && !/had a look into why/.test(clean.opener.join(' ')), 'no issues → the "I had a look into why…" line goes');
ok(!/Website not checked yet/.test(read('../src/lib/callScript.ts') + read('../src/lib/voiceNoteFromCall.ts')), '"Website not checked yet" is gone from the script and the voice note');

console.log('\n── 4. the page reader ──');
const H = 'https://ksm-example.co.uk/';
const pg = (path: string, body: string) => pageObservations(`<html><head><title>KSM</title><meta name="viewport" content="w"></head><body><h1>Driving lessons</h1><p>${body}</p></body></html>`, H + path, H);
const ksm = [
  pg('', 'KSM Driving Tuition (formerly Kylie’s School of Motoring) is owned by Kylie. Kylie began her career working for a school in Kent. Location Acle, Norfolk.'),
  pg('instructors/', 'Hi, I’m Kylie, the owner of KSM Driving Tuition. My name is Pete, I lived in Norwich for a time and now live in Sutton near Stalham.'),
];
const ct = buildContentTrust({ pages: ksm, servedUrl: H, knownUrls: [H, H + 'instructors/'], partial: false, lead: { name: 'KSM Driving Tuition', town: 'Acle', trade: 'driving instructor' } });
ok(ct.issues.some((i) => i.kind === 'areas_not_stated' && i.severity === 'medium' && /^We couldn’t find/.test(i.title)), 'places named only in passing (a bio) are not areas served → "We couldn’t find which areas you cover"');
ok(!ct.issues.some((i) => i.kind === 'area_coverage'), '…said once, not also as the older area note');
ok(ct.owner?.name === 'Kylie' && ct.owner.url === H && /owned by Kylie/.test(ct.owner.quote), 'the owner is read with the page and the words');
const cover = pageObservations('<html><body><p>We are based in Sheffield and work across South Yorkshire. Areas we cover: Rotherham, Barnsley.</p></body></html>', H, H);
ok((cover.coverage ?? []).length > 0, 'a real coverage statement is read as one');
ok(ownerOf([{ url: H, owner: [] }]) === null, 'a site that names no owner stores nothing');
ok(pageObservations('<p>Our team is run by experienced instructors.</p>', H, H).owner?.length === 0, 'never a guessed name ("run by experienced …")');
const sum = (issues: WebsiteCheckSummary['issues']): WebsiteCheckSummary => ({ version: 1, depth: 'deep', checkedAt: null, pagesRead: 12, pagesFound: 15, capped: false, issues, strengths: [], notChecked: [], failure: null });
const posts = [1, 2, 3].map((n) => `${H}post-${n}-headline/`);
const once = placeholderPagesOnce(sum([
  { id: 'ct_placeholder_content', severity: 'high', title: 't', saw: 's', meaning: '', count: 6, pages: posts },
  { id: 'near_duplicate_pages', severity: 'medium', title: 't', saw: 's', meaning: '', count: 6, pages: [] },
  { id: 'thin_pages', severity: 'low', title: 't', saw: 's', meaning: '', count: 6, pages: posts },
  { id: 'vs_key_page_basics', severity: 'medium', title: 't', saw: 's', meaning: '', count: 5, pages: [H, H + 'prices/'] },
]));
ok(once.issues.map((i) => i.id).join() === 'ct_placeholder_content,vs_key_page_basics', 'the six placeholder posts are counted once: the template set and the thin pages that are only them go');
ok(plainIssueTitle(once.issues[0]) !== 't', 'the placeholder issue has a plain line to read out');

console.log('\n── 5. the audit town ──');
const ca = read('../supabase/functions/create-ai-audit/index.ts');
ok(/select\("search_location"\)/.test(ca) && /near\.verdict !== "block"/.test(ca) && /picked\.source !== "confirmed"/.test(ca), 'the found-under Coverage area is used when within the guard; a confirmed town still wins');

console.log('\n── 6. polite crawling ──');
ok(/QUICK_CHECK_CONCURRENCY = 1/.test(cc) && /robotsAllows\(rules/.test(cc), 'the quick check reads one page at a time and obeys robots.txt');
ok(/pageCap \? PROSPECT_CRAWL_CONCURRENCY/.test(read('../supabase/functions/_shared/crawl-job.ts')), 'a prospect’s deep crawl reads one page at a time');
const mig = read('../supabase/migrations/20261110090000_audit_crawl_backfill.sql');
ok(/per_tick constant integer := 3/.test(mig) && /cron\.unschedule\('audit-crawl-backfill'\)/.test(mig) && !/insert into public\.outreach_leads|update public\.outreach_leads/.test(mig), 'the backfill is slow, stops itself and never writes a lead');

console.log(failures ? `\nFAILED: ${failures}` : '\nAll passed.');
if (failures) process.exit(1);
