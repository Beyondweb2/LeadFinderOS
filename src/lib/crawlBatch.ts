/* ════════════════════════════════════════════════════════════════════════════════════════════
   HOW MANY LEADS ONE PRESS OF "FIND EMAILS" ACTUALLY CRAWLS.

   🔴 THE FAULT THIS FIXES: THE BUTTON PROMISED THE WHOLE BACKLOG AND DELIVERED 200.
   `withWebsiteCount` was the UNCAPPED candidate count, so the label read "Crawl 1968 in view"
   while `findEmails` crawled `targets.slice(0, 200)`. The operator pressed it, watched
   "Finding… 200/200", got "Found emails for 137 of 200", and had no way to learn that 1,768
   leads were still untouched — the count on the button had already told him they were done.

   ⛔ THE RULE THIS FILE EXISTS FOR: A COUNT ON A CONTROL MUST BE WHAT PRESSING IT DOES.
   The push path already got this right — `crawlForPush` returns `remaining` and the dialog names
   it, with a comment saying a cap that quietly crawls 200 of 743 "reads as 'these leads have no
   email', which is the opposite of true". The button was the same fault, unfixed, on the control
   that gets pressed far more often.

   ⛔ WHY A SEPARATE FILE. `useOutreachFindEmails` imports '@/hooks/use-toast', which no test in
   this repo can resolve — the same reason `pushCrawlTargets` was extracted. The cap, the label
   arithmetic and the remainder are one rule, so they live where a test can reach them, and the
   hook holds no second copy.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Leads crawled per press. Bounds how long one run can take, not how much work exists.
 *  ⚠️ The crawl is 10-way concurrent plain HTTP, so 200 is roughly a minute. Raising it makes a
 *  single press longer, never cheaper — `extract-email` is free either way. */
/** Don't re-crawl a lead checked within this many days. Matches extract-email's own 30-day domain
 *  cache. Lived in pushCrawlTargets.ts until that file went with Instantly (2026-09-16). */
export const RECHECK_AFTER_DAYS = 30;

export const CRAWL_MAX_PER_RUN = 200;

export interface CrawlBatchPlan {
  /** Candidates in total — every lead that qualifies, ignoring the cap. */
  candidates: number;
  /** How many this press will crawl. */
  batch: number;
  /** How many qualify and will be left over afterwards. */
  remaining: number;
  /** True when the cap is what decides `batch`, i.e. one press is not enough. */
  capped: boolean;
}

/**
 * Split a candidate count into what one press does and what it leaves behind.
 *
 * ⚠️ A NEGATIVE OR UNREADABLE COUNT PLANS NOTHING, IT DOES NOT PLAN EVERYTHING. Absence is never
 * an answer (CLAUDE.md §6), and the safe direction on a control that writes to `email` is to crawl
 * zero rather than to fall through to the cap.
 */
export function crawlBatchPlan(candidates: number, max: number = CRAWL_MAX_PER_RUN): CrawlBatchPlan {
  const total = Number.isFinite(candidates) && candidates > 0 ? Math.floor(candidates) : 0;
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 0;
  const batch = Math.min(total, cap);
  return { candidates: total, batch, remaining: total - batch, capped: total > cap };
}

/**
 * What the button says. It names the batch FIRST, because that is what the press does, and the
 * total second so the backlog is still visible.
 *
 * ⚠️ "Crawl 200 of 1,968" is the whole point: both numbers are true, and the operator can see that
 * pressing again has work left. A bare "Crawl 1,968" was true of nothing.
 */
export function crawlButtonLabel(plan: CrawlBatchPlan, selected: boolean): string {
  const where = selected ? 'selected' : 'in view';
  if (plan.candidates === 0) return `Crawl 0 ${where}`;
  if (!plan.capped) return `Crawl ${plan.batch} ${where}`;
  return `Crawl ${plan.batch} of ${plan.candidates.toLocaleString()} ${where}`;
}

/** The sentence after a run. Names what is left, or says plainly that nothing is. */
export function crawlDoneMessage(found: number, scanned: number, remaining: number): string {
  const head = `Found emails for ${found} of ${scanned}`;
  if (remaining > 0) {
    return `${head}. ${remaining.toLocaleString()} still to crawl — press again to carry on.`;
  }
  return `${head}. That was the last of them.`;
}
