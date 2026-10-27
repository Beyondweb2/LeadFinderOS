/**
 * Google AI (AI Overview) — scrape evidence and the OPTIONAL one-time retry. Pure; no I/O.
 *
 * ⛔ DISPLAY ONLY, NO SCORING CHANGE. A retry can only ADD a Google AI answer to a question that came back
 * "not shown"; ChatGPT / Gemini answers, the SERP and every count stay the first run's. Google AI is scored
 * only where Google showed an answer (src/lib/aiOverview.ts), so a gained answer is the only effect.
 *
 * THE SWITCH is the edge secret GOOGLE_AI_RETRY, read once per tick (parseAioRetryMode). ABSENT, empty or
 * anything unrecognised = OFF (fail closed: a retry spends Apify money). Values:
 *   on                      every question that came back "not shown" is asked once more (needs Paul's OK).
 *   sample:<N>@<ISO time>   the first N such questions after that time are asked once more, then it stops.
 *
 * `_scrape` (every new question, any mode) records WHAT THE SCRAPER RETURNED, so "Google showed none" can
 * be told from "the scraper missed it" later: did the results page come back, did an AI Overview block
 * come back, did it carry text, and which overview-like keys the dataset item held.
 */

export const GOOGLE_AI_RETRY_SECRET = "GOOGLE_AI_RETRY";
/** Leading-underscore meta keys, like `_google_serp`: nothing that walks the engine keys trips on them. */
export const SCRAPE_META_KEY = "_scrape";
export const AIO_RETRY_META_KEY = "_aio_retry";
/** The first run's whole result, carried on the row while its one retry is in flight. */
export const AIO_FIRST_META_KEY = "_aio_first";

export interface ScrapeEvidence {
  v: 1;
  /** The Google results page came back (the actor's organic block is present). */
  page: boolean;
  /** How many organic results it held (null when no page). */
  organic_n: number | null;
  /** The dataset item carried an AI Overview block under a key we read. */
  aio_block: boolean;
  /** …and that block held answer text. */
  aio_text: boolean;
  /** Item keys that look overview-related (a block under a key we do NOT read would show here). */
  aio_keys: string[];
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** What the scraper returned for ONE question. `normalised` is normalizeAiSearch's output. */
export function scrapeEvidence(
  items: unknown[],
  normalised: { ai_overview?: { answer_text?: string } | undefined },
): ScrapeEvidence {
  const item = rec(Array.isArray(items) ? items[0] : items);
  const organic = item ? (item["organicResults"] ?? item["results"]) : undefined;
  const cell = normalised.ai_overview;
  return {
    v: 1,
    page: Array.isArray(organic),
    organic_n: Array.isArray(organic) ? organic.length : null,
    aio_block: !!cell,
    aio_text: !!cell && typeof cell.answer_text === "string" && cell.answer_text.trim().length > 0,
    aio_keys: item ? Object.keys(item).filter((k) => /overview|ai_?mode/i.test(k)).slice(0, 8) : [],
  };
}

export type AioRetryMode =
  | { kind: "off" }
  | { kind: "on" }
  | { kind: "sample"; limit: number; since: string };

/** Fail closed: only the exact documented forms switch anything on. */
export function parseAioRetryMode(raw: string | null | undefined): AioRetryMode {
  const s = String(raw ?? "").trim();
  if (s === "on") return { kind: "on" };
  const m = /^sample:(\d{1,3})@(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)$/.exec(s);
  if (m && Number.isFinite(Date.parse(m[2])) && Number(m[1]) > 0) return { kind: "sample", limit: Number(m[1]), since: m[2] };
  return { kind: "off" };
}

/** Should this just-finished first run be asked once more? A retry never nests (`hasFirst`). */
export function shouldRetryAio(i: {
  mode: AioRetryMode;
  /** The first run's `_ai_overview` stamp. Only a recorded "not_shown" qualifies; null/unknown never does. */
  stamp: string | null | undefined;
  hasFirst: boolean;
  /** Sample mode: retries already started since `since`, this tick's own included. */
  sampleUsed: number;
  /** The paid-action control is "running" (not all_stop / prospecting_paused). */
  tickRunning: boolean;
}): boolean {
  if (i.hasFirst || !i.tickRunning || i.stamp !== "not_shown") return false;
  if (i.mode.kind === "on") return true;
  if (i.mode.kind === "sample") return i.sampleUsed < i.mode.limit;
  return false;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The row's final result once the retry run has finished: the first run, plus Google AI if it was gained. */
export function mergeAioRetry(first: Record<string, unknown>, second: Record<string, unknown>): Record<string, unknown> {
  const gained = second["_ai_overview"] === "shown" && !!second["ai_overview"];
  const cost = num(first["_cost_usd"]) + num(second["_cost_usd"]);
  const merged: Record<string, unknown> = {
    ...first,
    [AIO_RETRY_META_KEY]: gained ? "gained" : "no_gain",
    [SCRAPE_META_KEY]: { ...(rec(first[SCRAPE_META_KEY]) ?? {}), retry: second[SCRAPE_META_KEY] ?? null },
  };
  if (first["_cost_usd"] != null || second["_cost_usd"] != null) merged["_cost_usd"] = cost;
  if (gained) {
    merged["ai_overview"] = second["ai_overview"];
    merged["_ai_overview"] = "shown";
  }
  return merged;
}

/** The retry could not be started or did not finish: the first run stands, untouched. */
export function keepFirstAfterRetry(first: Record<string, unknown>, outcome: "failed" | "not_started"): Record<string, unknown> {
  return { ...first, [AIO_RETRY_META_KEY]: outcome };
}
