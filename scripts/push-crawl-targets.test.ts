/* ============================================================
   WHICH LEADS THE PUSH-TO-INSTANTLY CRAWL TOUCHES.

   Run: npx tsx scripts/push-crawl-targets.test.ts

   ⛔ WHAT THIS GUARDS. A crawl WRITES its result to the lead, and a MISS writes null — so the rule
   that picks its targets is one wrong condition away from erasing good email addresses across the
   whole book from a dialog that opens automatically. The other half is the 30-day skip, which is
   the thing Paul actually asked for: "run an email crawl on ones it hasn't crawled already."
   ============================================================ */
import { pushCrawlTargets, RECHECK_AFTER_DAYS } from '../src/lib/pushCrawlTargets.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const NOW = Date.parse('2026-09-09T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86400_000).toISOString();
const lead = (id: string, o: Record<string, unknown> = {}) =>
  ({ id, website: 'https://example.com', email: null, is_archived: false, email_last_checked_at: null, ...o });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort().join(',');

console.log('\n── THE BASELINE: a website, no email, never checked ──');
{
  const rows = [lead('a')];
  ok(ids(pushCrawlTargets(rows, ['a'], NOW)) === 'a', 'an uncrawled lead with a website is crawled');
  ok(pushCrawlTargets(rows, [], NOW).length === 0, 'a lead not in the push is never crawled');
  ok(pushCrawlTargets(rows, ['someone-else'], NOW).length === 0, 'an id that matches nothing crawls nothing');
  ok(pushCrawlTargets([], ['a'], NOW).length === 0, 'an empty book is not an error');
}

console.log('\n── ⛔ THE THREE UNCONDITIONAL GUARDS ──');
/* A crawl writes null on a miss, so re-crawling a lead that HAS an email can erase it. That is data
   loss from a dialog that runs itself — the single most important line in the rule. */
for (const [label, patch] of [
  ['already has an email', { email: 'hi@x.com' }],
  ['already has an email with padding', { email: '   hi@x.com  ' }],
  ['no website', { website: null }],
  ['blank website', { website: '   ' }],
  ['archived', { is_archived: true }],
] as [string, Record<string, unknown>][]) {
  ok(pushCrawlTargets([lead('a', patch)], ['a'], NOW).length === 0, `${label} -> never crawled`);
}
/* An archived lead that is ALSO ticked stays excluded — archiving means stop contacting, and a push
   must not be a way to re-open a lead that was deliberately closed. */
ok(pushCrawlTargets([lead('a', { is_archived: true, email_last_checked_at: null })], ['a'], NOW).length === 0,
   'archived beats never-checked');

console.log('\n── ⛔ THE 30-DAY SKIP — THE POINT OF THE FEATURE ──');
{
  ok(pushCrawlTargets([lead('a', { email_last_checked_at: daysAgo(1) })], ['a'], NOW).length === 0,
     'checked yesterday -> skipped');
  ok(pushCrawlTargets([lead('a', { email_last_checked_at: daysAgo(29) })], ['a'], NOW).length === 0,
     'checked 29 days ago -> skipped');
  ok(pushCrawlTargets([lead('a', { email_last_checked_at: daysAgo(31) })], ['a'], NOW).length === 1,
     'checked 31 days ago -> crawled again');
  /* The boundary itself: exactly RECHECK_AFTER_DAYS old is NOT yet stale (strict `<` against the
     cutoff), so the window is "within the last 30 days is skipped". Pinned so a later `<=` is a
     visible change rather than an accident. */
  ok(pushCrawlTargets([lead('a', { email_last_checked_at: daysAgo(RECHECK_AFTER_DAYS) })], ['a'], NOW).length === 0,
     `exactly ${RECHECK_AFTER_DAYS} days is still inside the window`);
}

console.log('\n── ⛔ AN UNREADABLE DATE MEANS CRAWL, NOT SKIP ──');
/* The safe direction is the opposite of the usual one: reading a bad date as "recently checked"
   would exclude a lead from ever being crawled again, and being wrong costs one free request. */
for (const bad of [null, undefined, '', '   ', 'not a date', 'yesterday', '0000-00-00']) {
  ok(pushCrawlTargets([lead('a', { email_last_checked_at: bad })], ['a'], NOW).length === 1,
     `email_last_checked_at ${JSON.stringify(bad)} -> crawled`);
}

console.log('\n── A REALISTIC MIXED PUSH ──');
{
  /* Shaped after the live book measured 2026-09-09: mostly never-crawled leads with websites, a few
     known misses inside the window, some already-emailed, some with no site at all. */
  const rows = [
    lead('never-1'), lead('never-2'),
    lead('miss-recent', { email_last_checked_at: daysAgo(3) }),
    lead('miss-old', { email_last_checked_at: daysAgo(90) }),
    lead('has-email', { email: 'a@b.com' }),
    lead('no-site', { website: '' }),
    lead('archived', { is_archived: true }),
    lead('not-in-push'),
  ];
  const push = ['never-1', 'never-2', 'miss-recent', 'miss-old', 'has-email', 'no-site', 'archived'];
  ok(ids(pushCrawlTargets(rows, push, NOW)) === 'miss-old,never-1,never-2',
     `crawls exactly the three worth crawling (${ids(pushCrawlTargets(rows, push, NOW))})`);
  /* And the leads it refuses are refused for reasons the dialog can state — none of them silently
     become "no email address" without having been looked at. */
  ok(pushCrawlTargets(rows, push, NOW).every((l) => !String(l.email ?? '').trim()),
     'nothing with an existing email is ever in the batch');
}

console.log('\n── DUPLICATE AND ODD INPUT ──');
{
  const rows = [lead('a')];
  ok(pushCrawlTargets(rows, ['a', 'a', 'a'], NOW).length === 1, 'a repeated id crawls the lead once');
  ok(pushCrawlTargets(rows, ['a'], NOW, 0).length === 1, 'a zero-day window re-crawls everything');
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) throw new Error(`${f} failures`);
