/* ════════════════════════════════════════════════════════════════════════════════════════════════
   RUN FINALISATION — the pure decisions the queue processor makes once a run's questions have
   all settled. Plain TypeScript, no Deno, no database: the test drives these directly.

   🔴 WHY THIS EXISTS (2026-09-21). Competitor cleaning (extract-competitors → OpenAI) is a
   SECONDARY step: it names rivals, it does not measure anything. When OpenAI started answering 429
   the finaliser held every settled run `pending` until cleaning succeeded, and the next 30-second
   tick re-finalised the held run and re-invoked the cleaner — with no cap on that path. Six runs
   (three adaptive hooks, two discoveries, one ordinary audit) sat "running 40/40 / 3/3 / 1/1" for a
   day with attempt counts in the thousands, and nothing downstream could use a result that never
   reached `complete`. RETRY_CLEAN_CAP existed, but only bounded the separate sweep.

   ⛔ THE RULE: a run whose provider questions are terminal is released once cleaning has either
   completed or used up RETRY_CLEAN_CAP attempts. An exhausted cleaning is a persisted, honest
   receipt (`complete: false`, the errors, `gave_up_at`) — the report and the reply resolver already
   withhold rival names on such a receipt, so nothing false is shown and nothing is fabricated.
   ⛔ The cap bounds every path: the finaliser stops invoking once it is reached, so re-running the
   finaliser on a released run spends nothing.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Total cleaning attempts a run may consume (1 at finalise + retries) before it is released with
 *  an honest incomplete receipt. One constant for the finaliser's hold AND the retry sweep. */
export const RETRY_CLEAN_CAP = 4;

export type QueueRowStatus = string | null | undefined;
export type RunFinalStatus = "complete" | "failed" | "capped";

export interface RunSettlement {
  /** Every provider row is terminal (`done` or `failed`). False while any row is pending/running. */
  allSettled: boolean;
  /** Every row failed — an outage, never a measurement. */
  allFailed: boolean;
  /** The status the run finalises to, once it may. */
  runStatus: RunFinalStatus;
}

/** How a settled run's questions grade it. Mirrors the finaliser's own reading of the rows so the
 *  three statuses keep their meaning: capped = the cost cap stopped it, failed = every question
 *  failed, complete = otherwise. A partial run (some failed) is complete, exactly as before. */
export function runSettlement(statuses: readonly QueueRowStatus[], isCapped: boolean): RunSettlement {
  const isTerminal = (s: QueueRowStatus) => s === "done" || s === "failed";
  const allSettled = statuses.length > 0 && statuses.every(isTerminal);
  const allFailed = statuses.length > 0 && statuses.every((s) => s === "failed");
  return { allSettled, allFailed, runStatus: isCapped ? "capped" : allFailed ? "failed" : "complete" };
}

export type CleaningState = "complete" | "exhausted" | "pending";

/** Attempts recorded on a cleaning receipt; 0 for no receipt or an unreadable one. */
export function cleaningAttempts(stamp: unknown): number {
  const raw = stamp && typeof stamp === "object" ? (stamp as { attempts?: unknown }).attempts : undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Where a run's competitor cleaning stands. ⛔ `complete: true` wins; then the cap; else pending.
 *  A missing receipt is `pending` (nothing has been tried), never `complete`. */
export function cleaningState(stamp: unknown, cap: number = RETRY_CLEAN_CAP): CleaningState {
  const complete = stamp && typeof stamp === "object" ? (stamp as { complete?: unknown }).complete : undefined;
  if (complete === true) return "complete";
  if (cleaningAttempts(stamp) >= cap) return "exhausted";
  return "pending";
}

/** May the finaliser invoke extract-competitors for this run on this tick?
 *  ⛔ NO on an all-failed run (nothing to clean), NO once complete, NO once the cap is reached.
 *  This is the guard the storm walked past: the hold path re-invoked on every tick. */
export function shouldInvokeCleaning(stamp: unknown, allFailed: boolean, cap: number = RETRY_CLEAN_CAP): boolean {
  if (allFailed) return false;
  return cleaningState(stamp, cap) === "pending";
}

export interface FinaliseReadinessInput {
  allFailed: boolean;
  /** `results.competitor_cleaning` as stored, or undefined. */
  stamp: unknown;
  /** `results.crawl_check.status` as stored, or undefined. */
  crawlStatus: unknown;
  /** The audit or its lead has a website, so a crawl is expected. */
  hasSite: boolean;
}

export interface FinaliseReadiness {
  ready: boolean;
  cleaning: CleaningState | "not_needed";
  crawlReady: boolean;
}

/** Is the settled run ready to be exposed as terminal? Crawl unavailability is honest and ready;
 *  cleaning is ready when complete OR exhausted. Only a cleaning still inside its attempts, or a
 *  crawl that has not answered, holds the run. */
export function finaliseReadiness(i: FinaliseReadinessInput, cap: number = RETRY_CLEAN_CAP): FinaliseReadiness {
  const crawlReady = !i.hasSite || i.crawlStatus === "complete" || i.crawlStatus === "unavailable";
  const cleaning: CleaningState | "not_needed" = i.allFailed ? "not_needed" : cleaningState(i.stamp, cap);
  return { ready: crawlReady && cleaning !== "pending", cleaning, crawlReady };
}

/** The receipt an exhausted cleaning is released with. Idempotent: a receipt that already records
 *  giving up is returned unchanged, so a second pass never rewrites it. Nothing else on the stamp
 *  is altered — the attempts and errors stay exactly as measured. */
export function markCleaningExhausted(stamp: unknown, at: string): { stamp: Record<string, unknown>; changed: boolean } {
  const cur = stamp && typeof stamp === "object" ? { ...(stamp as Record<string, unknown>) } : {};
  if (typeof cur.gave_up_at === "string" && cur.gave_up_at) return { stamp: cur, changed: false };
  return { stamp: { ...cur, complete: false, gave_up_at: at }, changed: true };
}
