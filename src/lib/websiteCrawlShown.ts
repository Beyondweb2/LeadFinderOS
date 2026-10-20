/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT THE CALL SCREEN'S WEBSITE SECTION SHOWS (Paul, 2026-10-20) — one of four, never "not checked".
   Read by WebsiteCrawlSection; pure, so the rule is testable (scripts/crawl-always-callscreen.test.ts).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const CHECKING_WEBSITE_LINE = 'Checking the website...';
export const COULD_NOT_CHECK_LINE = "Couldn't check the site.";
/** While the section waits on a check someone else started, it re-reads the lead this often, for this long. */
export const WEBSITE_CRAWL_WAIT_POLL_MS = 15_000;
export const WEBSITE_CRAWL_WAIT_MAX_MS = 5 * 60_000;

export type WebsiteCrawlShown = 'checking' | 'done' | 'could_not_check' | 'no_website';

/** `state` is websiteCheck's WebsiteCheckState; `checking` = a crawl this screen knows is running; `auto` = the
 *  call screen's own start (useCallScreenCrawl); `waitedOut` = waited WEBSITE_CRAWL_WAIT_MAX_MS for a check that never landed. */
export function websiteCrawlShown(a: { state: string; checking: boolean; auto: string; waitedOut: boolean }): WebsiteCrawlShown {
  if (a.state === 'no_website' || a.state === 'profile') return 'no_website';
  if (a.checking) return 'checking';
  if (a.state === 'issues' || a.state === 'clean') return 'done';
  if (a.state === 'unreadable') return 'could_not_check';
  /* not_checked: the screen has asked for it (or someone else is running it) — checking until it lands or times out. */
  return a.auto === 'failed' || a.waitedOut ? 'could_not_check' : 'checking';
}
