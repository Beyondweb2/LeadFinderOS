/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AUDITS ALWAYS FINISH — the per-engine fallback and the hard deadline (Paul, 2026-11-18, v1-audits-always-finish).

   The case: from ~08:40 on 18 Nov every AI-search run on Apify hung. 36 questions in a row ran 3 × 12 minutes and failed
   ("run_age_exceeded"), 0 finished; Apify spend stayed flat at $1.39 while ~10 runs sat "active". Same on 16 Nov at 11:30.
   One Apify run asks ChatGPT, Gemini and Google AI together, so ONE hung engine lost the whole question, three times.

   The rule:
     • A question's FIRST run is the normal one (every engine in one run — the cheapest, and fine on a normal day).
     • When that run fails or does not finish, the question is NOT asked the same way again. It splits into one Apify run
       per engine still missing (a "lane"), started together. Whatever a lane brings back is KEPT; a lane that fails gets
       ONE more try (LANE_MAX_TRIES), and only the missing engines are ever asked again.
     • Anything the failed normal run did bring back (its dataset, read after the abort) counts already: that engine
       needs no lane.
     • When every lane has settled the question is DONE with what came back (an engine that never answered is simply
       absent, which the report already reads as "Couldn't measure"), or FAILED if nothing came back at all.
     • ROW_DEADLINE_MS: a question that has been started and is still unsettled this long after it was queued is ended
       ("deadline_exceeded"), keeping whatever it has. Nothing spins for ever.
     • Every failed attempt keeps Apify's own words (status message + the end of its log) in `_failures`, so the next
       outage says WHICH engine hung instead of "it didn't finish".

   Pure. Reached by edge functions: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { AI_SEARCH_LANES, laneAnswered, type AiSearchLane } from "./ai-search.ts";

export const LANES_META_KEY = "_lanes";
export const FAILURES_META_KEY = "_failures";
/** Engines that never answered, on a question that finished with some of them. */
export const MISSING_META_KEY = "_missing_engines";

/** Starts per lane (the first + one more). */
export const LANE_MAX_TRIES = 2;
/** A started question still unsettled this long after it was queued is ended. Normal worst case: 12 min normal run +
 *  2 × 12 min lanes + a few ticks of queueing ≈ 40 min. */
export const ROW_DEADLINE_MS = 60 * 60 * 1000;
/** Apify's own run timeout, a little above our 12-minute age guard so ours acts first and Apify's is the backstop. */
export const APIFY_RUN_TIMEOUT_SECS = 13 * 60;
/** Most failure notes kept per question. */
export const MAX_FAILURE_NOTES = 6;

export interface LaneState {
  state: "pending" | "running" | "done" | "failed";
  tries: number;
  runId?: string | null;
  datasetId?: string | null;
  startedAtTick?: string | null;
  /** The lane's dataset item once it came back (or the failed normal run's partial item for this engine). */
  item?: Record<string, unknown> | null;
  error?: string | null;
}
export type Lanes = Partial<Record<AiSearchLane, LaneState>>;

export interface FailureNote {
  at: string;
  kind: string;
  reason: string;
  status_message?: string | null;
  log_tail?: string | null;
}

/** One note per failed attempt: Apify's own words, trimmed. */
export function failureNote(o: { atIso: string; kind: string; reason: string; statusMessage?: string | null; logTail?: string | null }): FailureNote {
  const n: FailureNote = { at: o.atIso, kind: o.kind, reason: o.reason };
  if (o.statusMessage) n.status_message = String(o.statusMessage).slice(0, 300);
  if (o.logTail) n.log_tail = String(o.logTail).slice(-600);
  return n;
}

/** Appends a note, keeping only the newest MAX_FAILURE_NOTES. */
export function addFailure(prev: unknown, note: FailureNote): FailureNote[] {
  const list = Array.isArray(prev) ? (prev as FailureNote[]) : [];
  return [...list, note].slice(-MAX_FAILURE_NOTES);
}

/** The first dataset item, as a record (the actor writes one item per question). */
export function firstItem(items: unknown): Record<string, unknown> | null {
  const first = Array.isArray(items) ? items[0] : items;
  return first && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, unknown>) : null;
}

/** The lanes a question starts with after its normal run failed: an engine the failed run already answered (its
 *  partial item) is done; every other engine is pending. */
export function initialLanes(partial: Record<string, unknown> | null): Lanes {
  const out: Lanes = {};
  for (const lane of AI_SEARCH_LANES) {
    out[lane] = partial && laneAnswered(partial, lane)
      ? { state: "done", tries: 0, item: partial }
      : { state: "pending", tries: 0 };
  }
  return out;
}

/** Is the result's `_lanes` a lane map? (absent / malformed = no lanes: the row is on its normal run). */
export function readLanes(result: unknown): Lanes | null {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>)[LANES_META_KEY] : null;
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const out: Lanes = {};
  for (const lane of AI_SEARCH_LANES) {
    const l = (r as Record<string, unknown>)[lane];
    if (l && typeof l === "object") out[lane] = l as LaneState;
  }
  return Object.keys(out).length ? out : null;
}

/** A lane that failed: one more try while it has tries left, else it stays failed. */
export function afterLaneFailure(l: LaneState, reason: string): LaneState {
  const next: LaneState = { ...l, runId: null, datasetId: null, startedAtTick: null, error: reason };
  next.state = l.tries < LANE_MAX_TRIES ? "pending" : "failed";
  return next;
}

/** Every lane done or failed. */
export function lanesSettled(lanes: Lanes): boolean {
  return AI_SEARCH_LANES.every((k) => { const l = lanes[k]; return !l || l.state === "done" || l.state === "failed"; });
}

/** Lanes that are still in flight on Apify (each one holds an Apify slot). */
export function liveLaneCount(lanes: Lanes | null): number {
  if (!lanes) return 0;
  return AI_SEARCH_LANES.filter((k) => lanes[k]?.state === "running").length;
}

/** Engines that never answered. */
export function missingLanes(lanes: Lanes): AiSearchLane[] {
  return AI_SEARCH_LANES.filter((k) => { const l = lanes[k]; return !l || l.state !== "done" || !l.item || !laneAnswered(l.item, k); });
}

/**
 * The lanes' answers as ONE dataset item, the shape a normal run returns, so the queue's ordinary
 * "run succeeded" path reads it unchanged. Each engine's block is taken from ITS lane only; the shared keys (the
 * Google results page etc.) from the first lane that has them, in lane order. null = no lane brought anything back.
 */
export function mergeLaneItems(lanes: Lanes): Record<string, unknown> | null {
  const done = AI_SEARCH_LANES.filter((k) => lanes[k]?.state === "done" && lanes[k]?.item);
  if (!done.length) return null;
  const ENGINE_KEYS: Record<AiSearchLane, string[]> = {
    chatgpt: ["chatGptSearchResult"],
    gemini: ["geminiSearchResult"],
    ai_overview: ["aiModeResult", "aiOverviewResult", "aiOverview", "aiOverviewSearchResult"],
  };
  const allEngineKeys = new Set(Object.values(ENGINE_KEYS).flat());
  const merged: Record<string, unknown> = {};
  // Shared keys first (results page, query, …): first lane that has them wins.
  for (const k of done) {
    for (const [key, v] of Object.entries(lanes[k]!.item!)) {
      if (allEngineKeys.has(key)) continue;
      if (merged[key] == null && v != null) merged[key] = v;
    }
  }
  // Each engine's block only from its own lane.
  for (const k of done) {
    const item = lanes[k]!.item!;
    for (const key of ENGINE_KEYS[k]) if (item[key] != null && merged[key] == null) merged[key] = item[key];
  }
  return merged;
}

/** Where the current try of a question started (its normal run's start), carried onto the lanes. */
export const CYCLE_META_KEY = "_cycle_started_at";

/** Has a started question run out of time? Only rows that were started at least once (a row waiting its turn in a
 *  big batch is not stuck), judged from when its CURRENT try began (CYCLE_META_KEY on a lane row, the last change on a
 *  pending row) — ⛔ never from when it was queued: a question re-opened by the automatic Quick check retry 30+ minutes
 *  after failing would be ended at once (it happened on the first deploy, 18 Nov 13:12). */
export function pastDeadline(o: { startedAt: string | null | undefined; attempts: number; nowMs: number }): boolean {
  if (!(o.attempts > 0)) return false;
  const t = Date.parse(String(o.startedAt ?? ""));
  return Number.isFinite(t) && o.nowMs - t > ROW_DEADLINE_MS;
}
