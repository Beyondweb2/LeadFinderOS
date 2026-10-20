/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CALL SCREEN STARTS A MISSING WEBSITE CHECK, ONCE (2026-10-19, feat/crawl-in-audit-callscreen).

   The AI audit already crawls its lead's site when it finishes (process-ai-audit-queue). A lead can still
   reach the call screen with an AI result and no website check — audited before that existed, a crawl that
   was skipped, or the minute between the AI result landing and the crawl finishing. When the call screen
   opens on such a lead it asks crawl-check (requested_from "call_screen") for the QUICK check, in the
   background. crawl-check queues the deep check behind it, as it does for an audit.

   ⛔ ONLY WHEN IT IS MISSING: the lead has a website, a completed AI audit, and no stored check. A lead that
      has a check (fresh or old) is never re-crawled by opening a screen — "Run again" is a person's act.
   ⛔ A FAILED CHECK IS TRIED AGAIN ONCE, EVER (Paul, 2026-10-20): the retry is recorded (data.retry) and a second
      failure stays "Couldn't check the site" until a person presses Run again.
   ⛔ ONE AT A TIME PER LEAD: nothing while a crawl job runs, and nothing within CALL_SCREEN_CRAWL_COOLDOWN_MS of
      the last call-screen start for that lead (two people opening it at once start one).
   ⛔ RATE LIMITED PER PERSON: at most CALL_SCREEN_CRAWL_PER_PERSON starts in CALL_SCREEN_CRAWL_WINDOW_MS.
   The book-wide catch-up for leads audited before this (scripts/backfill-audit-crawls.ts, 2026-10-20) is a separate,
   slow, one-at-a-time run; it never goes through this door.
   ⛔ FREE: fetches of the lead's own public site only — no paid API (crawl-check's closure has none).
   Pure. IMPORTED BY AN EDGE FUNCTION: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const CALL_SCREEN_CRAWL_SOURCE = 'call_screen';
/** The last call-screen start for a lead blocks another for this long. */
export const CALL_SCREEN_CRAWL_COOLDOWN_MS = 10 * 60_000;
/** Starts one person may make in the window below. */
export const CALL_SCREEN_CRAWL_PER_PERSON = 12;
export const CALL_SCREEN_CRAWL_WINDOW_MS = 10 * 60_000;

export type CallScreenCrawlRefusal = 'no_lead' | 'no_website' | 'no_audit' | 'already_checked' | 'already_retried' | 'running' | 'recently_started' | 'rate_limited';

export interface CallScreenCrawlFacts {
  leadId: string | null;
  website: string | null | undefined;
  /** A completed (usable) AI audit run exists for this lead. */
  hasCompletedAudit: boolean;
  /** lead_crawl_checks has a row for this lead (any age, failed included). */
  hasCrawlRow: boolean;
  /** That row is a check that could not read the site. */
  crawlRowFailed?: boolean;
  /** A call-screen retry of a failed check has already been recorded for this lead. */
  retriedBefore?: boolean;
  /** A crawl job for this lead is running. */
  jobRunning: boolean;
  /** When the last call-screen start for this lead was recorded (null = never). */
  lastStartMs: number | null;
  /** Call-screen starts this person made inside CALL_SCREEN_CRAWL_WINDOW_MS. */
  startsByPersonInWindow: number;
  nowMs: number;
}

/** Null = start the quick check. Otherwise why not (said to the screen as a quiet skip, never an error). */
export function callScreenCrawlRefusal(f: CallScreenCrawlFacts): CallScreenCrawlRefusal | null {
  if (!f.leadId) return 'no_lead';
  if (!String(f.website ?? '').trim()) return 'no_website';
  if (f.hasCompletedAudit !== true) return 'no_audit';
  if (f.hasCrawlRow !== false) {
    if (f.crawlRowFailed !== true) return 'already_checked';
    if (f.retriedBefore !== false) return 'already_retried';
  }
  if (f.jobRunning !== false) return 'running';
  if (f.lastStartMs !== null && f.nowMs - f.lastStartMs < CALL_SCREEN_CRAWL_COOLDOWN_MS) return 'recently_started';
  if (!(f.startsByPersonInWindow < CALL_SCREEN_CRAWL_PER_PERSON)) return 'rate_limited';
  return null;
}

/** This start is the one retry of a failed check (recorded so it is never made twice). */
export function isCallScreenRetry(f: Pick<CallScreenCrawlFacts, 'hasCrawlRow' | 'crawlRowFailed'>): boolean {
  return f.hasCrawlRow === true && f.crawlRowFailed === true;
}
