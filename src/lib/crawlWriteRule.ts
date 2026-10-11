/* ⛔ A FAILED CRAWL NEVER OVERWRITES THE LAST GOOD ONE (2026-10-11, Paul). A timeout or an unreachable site says
   nothing about the pages we already read: the stored lead_crawl_checks row stays, and the attempt is noted beside
   it (`last_failed_attempt`). A failed crawl is stored only when there is nothing good to keep.
   Used by crawl-check (the inline standard crawl) and _shared/crawl-job.ts (the full crawl's finalize).
   A leaf on purpose: fullCrawl.ts is reached by ~30 edge functions, this by two. */
import { mayReplaceLeadCrawl, type CrawlMode } from './fullCrawl.ts';

export type LeadCrawlWrite = 'replace' | 'preserve_full' | 'keep_last_good';

/** `existing.failed` is the stored row's own state; unknown counts as good — the direction that keeps data.
 *  Otherwise the existing rule stands: an automated standard crawl never replaces a fresh full one. */
export function leadCrawlWriteDecision(
  existing: { mode?: string | null; created_at?: string | null; failed?: boolean | null } | null | undefined,
  incoming: { mode: CrawlMode; failed: boolean },
  nowMs: number, freshMs: number,
): LeadCrawlWrite {
  if (incoming.failed === true && existing && existing.failed !== true) return 'keep_last_good';
  return mayReplaceLeadCrawl(existing, incoming.mode, nowMs, freshMs) ? 'replace' : 'preserve_full';
}

/** The columns a writer selects to judge the stored row: two small JSON paths, never the whole result. */
export const STORED_CRAWL_STATE_COLUMNS = 'mode, created_at, fetch_failed:result->signals->>fetchFailed, completeness:full_evidence->>completeness';

/** Was a stored row itself a failed crawl (the quick crawl could not read the home page, or a full crawl failed)? */
export function storedCrawlFailed(row: { fetch_failed?: unknown; completeness?: unknown } | null | undefined): boolean {
  if (!row) return false;
  return row.fetch_failed === true || row.fetch_failed === 'true' || row.completeness === 'failed';
}
