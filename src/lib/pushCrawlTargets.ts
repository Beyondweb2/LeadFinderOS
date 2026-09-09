/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHICH LEADS THE PUSH CRAWLS — "ones it hasn't crawled already" (Paul, 2026-09-09).

   ⛔ WHY THIS IS A SEPARATE FILE RATHER THAN A CLOSURE INSIDE THE HOOK. useOutreachFindEmails
   imports '@/hooks/use-toast', which no test in this repo can resolve — the hook's own header
   already records that as the reason its constants live in types/outreach. This rule decides which
   businesses get their website crawled every time the Push dialog opens, so it is exactly the kind
   of thing that must not be untestable.

   ⛔ THE 30-DAY SKIP IS THE ENTIRE REQUEST, AND IT IS WHY THIS IS NOT THE `selectedIds` PATH.
   Ticking rows and pressing "Find emails" is an explicit instruction to crawl THOSE rows, so it
   deliberately overrides the skip. Opening the push dialog is not that instruction: a lead proven
   last week to have no findable email must not be re-crawled every time, or the per-run cap fills
   with known misses and the leads nobody has ever checked never get reached.

   ⚠️ MEASURED 2026-09-09, and it is why this matters: 2,287 unarchived leads have a website and
   have NEVER been crawled, against 133 crawled-and-found-nothing. The hit rate on leads that were
   crawled is 68% (279 of 412), and 299 of the 321 emails in the book came from this crawler.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** The lead columns the rule reads. A subset of OutreachLead, so the real type satisfies it. */
export interface CrawlCandidateLead {
  id: string;
  website?: string | null;
  email?: string | null;
  is_archived?: boolean | null;
  email_last_checked_at?: string | null;
}

/** Matches useOutreachFindEmails' own constant; both sides import this one. */
export const RECHECK_AFTER_DAYS = 30;

/**
 * The leads inside `leadIds` that are worth crawling now.
 *
 * ⛔ THREE UNCONDITIONAL GUARDS, and the second is data-loss protection rather than efficiency:
 *   · a website — there is nothing to crawl without one.
 *   · NO email already — a crawl WRITES its result and a MISS writes null, so re-crawling a lead
 *     that already has an address can ERASE a good email. A bulk action must never do that.
 *   · not archived — archiving means stop contacting, and it implies suppressed.
 *
 * ⚠️ AN UNREADABLE OR ABSENT TIMESTAMP MEANS CRAWL, NOT SKIP. Absence is never an answer, and the
 * safe direction here is the opposite of the usual one: treating a bad date as "recently checked"
 * would quietly exclude a lead from ever being crawled again, and the cost of being wrong is one
 * free HTTP request.
 */
export function pushCrawlTargets<T extends CrawlCandidateLead>(
  leads: readonly T[],
  leadIds: readonly string[],
  now: number = Date.now(),
  recheckAfterDays: number = RECHECK_AFTER_DAYS,
): T[] {
  const wanted = new Set(leadIds);
  const cutoff = now - recheckAfterDays * 24 * 60 * 60 * 1000;
  return leads.filter((l) => {
    if (!wanted.has(l.id)) return false;
    if (!String(l.website ?? '').trim()) return false;
    if (String(l.email ?? '').trim()) return false;
    if (l.is_archived) return false;
    const t = Date.parse(String(l.email_last_checked_at ?? ''));
    return !Number.isFinite(t) || t < cutoff;
  });
}
