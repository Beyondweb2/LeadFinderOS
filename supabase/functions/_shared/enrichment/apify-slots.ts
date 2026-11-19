/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE APIFY RUN SCHEDULER — queue, never fail, when the plan is full (Paul, 2026-11-19, v1-audits-self-healing).

   The case: 19 Nov 16:13 a batch of 15 audits went in together. Every question takes TWO Apify runs (ChatGPT + Gemini,
   and Google AI beside it), so the batch alone held ~30 of the plan's 32 concurrent runs. At 4 minutes the hedge asked
   ChatGPT / Gemini again on their own runs — up to 30 more starts. Apify refused them (the plan's concurrent-run limit),
   each refusal was booked as a failed try, two refusals a few seconds apart used up the engine, and the question then
   FINISHED without Gemini — aborting the normal run that was still going and would have answered. 7 audits incomplete.

   The rule:
     • One slot budget per tick: the fewer of (our own audit ceiling − our live runs) and (Apify's live free runs − the
       slots kept for every other actor). Apify's own live count is read once per tick; when it cannot be read, our own
       count against our ceiling is the budget (fail safe: the ceiling was sized to the plan).
     • Every start takes a slot first. No slot → the start WAITS (the lane stays pending, its tries untouched).
     • A start that Apify refuses for capacity (HTTP 429, a memory or concurrent-run limit) also waits — never a try.
     • Hedges are a speed nicety, so they come last: a hedge starts only when no question is waiting for its first run
       and a few slots are still spare after it.
     • Nothing waits for ever: the question's own 60-minute deadline still ends it.

   Pure. Reached by edge functions: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The plan's limits when Apify's live reading is missing (Apify STARTER, measured 2026-11-19: 32 runs, 64 GB). */
export const APIFY_PLAN_MAX_RUNS = 32;
export const APIFY_PLAN_MEMORY_GB = 64;
/** Runs kept free for every other actor (directory scrapes, enrichment, the SEO scan). */
export const OTHER_ACTORS_RESERVE = 4;
/** Memory kept free for the other actors (they take 4 GB each; one SEO scan + one scrape). */
export const OTHER_ACTORS_MEMORY_GB = 8;
/** Memory one AI-search run takes. */
export const AI_SEARCH_RUN_GB = 1;
/** Slots a hedge must leave spare after starting (fallbacks and first runs keep room). */
export const HEDGE_SPARE = 2;

export interface ApifyLive {
  activeRuns: number | null;
  maxRuns: number | null;
  memoryUsedGb: number | null;
  memoryMaxGb: number | null;
}

/** How many AI-search runs may start this tick. */
export function slotBudget(o: { ownLiveRuns: number; ceiling: number; live: ApifyLive | null }): number {
  const ours = o.ceiling - o.ownLiveRuns;
  let account = Number.POSITIVE_INFINITY;
  const l = o.live;
  if (l && l.activeRuns != null) {
    account = (l.maxRuns ?? APIFY_PLAN_MAX_RUNS) - OTHER_ACTORS_RESERVE - l.activeRuns;
  }
  if (l && l.memoryUsedGb != null) {
    const memFree = (l.memoryMaxGb ?? APIFY_PLAN_MEMORY_GB) - OTHER_ACTORS_MEMORY_GB - l.memoryUsedGb;
    account = Math.min(account, Math.floor(memFree / AI_SEARCH_RUN_GB));
  }
  return Math.max(0, Math.floor(Math.min(ours, account)));
}

/** A hedge may start: nobody is waiting for a first run, and HEDGE_SPARE slots stay free after it. */
export function hedgeMayStart(o: { free: number; waitingQuestions: number }): boolean {
  return o.waitingQuestions <= 0 && o.free - 1 >= HEDGE_SPARE;
}

/** The tick's slot counter. Take before awaiting the start (JS runs the take synchronously, so parallel polls share it). */
export function slotCounter(initial: number) {
  let free = Math.max(0, initial);
  return {
    get free() { return free; },
    take(n = 1): boolean { if (free < n) return false; free -= n; return true; },
    giveBack(n = 1) { free += n; },
  };
}
export type SlotCounter = ReturnType<typeof slotCounter>;

/** Apify refused the start because the account is FULL (not out of money, not a bad request): wait, don't fail.
 *  Apify's words: HTTP 429 (rate / too many runs), or a 402/403 whose type names a memory or concurrent-run limit. */
export function isCapacityRefusal(msg: string | null | undefined): boolean {
  const m = String(msg ?? "");
  if (/HTTP 429\b/.test(m)) return true;
  if (/HTTP 40[23]\b/.test(m) && /(memory|concurren|actor-job|too-many|run-limit)/i.test(m)) return true;
  return false;
}

/** The start error written to the row's failure notes: status + Apify's type/message, trimmed. */
export function startErrorText(status: number, body: unknown): string {
  const err = body && typeof body === "object" ? (body as { error?: { type?: unknown; message?: unknown } }).error : null;
  const type = err && typeof err.type === "string" ? err.type : "";
  const message = err && typeof err.message === "string" ? err.message : "";
  return `HTTP ${status}${type ? ` ${type}` : ""}${message ? `: ${message}` : ""}`.slice(0, 300);
}
