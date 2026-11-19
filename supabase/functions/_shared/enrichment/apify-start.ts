/* APIFY START WITH APIFY'S OWN WORDS, AND THE LIVE SLOT READING (v1-audits-self-healing, 2026-11-19).
   Only process-ai-audit-queue reaches this file. apify.ts's startApifyRun throws "HTTP 402" and drops Apify's body, so on
   19 Nov the rows only said "start_failed" — the reason (the plan's concurrent-run limit) was never stored. This start
   keeps Apify's error type + message, so isCapacityRefusal can tell "the plan is full, wait" from a real failure.
   Rules: apify-slots.ts. */
import { startErrorText, type ApifyLive } from "./apify-slots.ts";

export class ApifyStartError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** START an actor run (async). Throws ApifyStartError("Apify start HTTP 402 actor-memory-limit-exceeded: …"). */
export async function startApifyRunExplained(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
  runTimeoutSecs: number,
  timeoutMs = 20_000,
): Promise<{ runId: string; datasetId: string | null }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?timeout=${Math.round(runTimeoutSecs)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new ApifyStartError(`Apify start ${startErrorText(res.status, body)}`, res.status);
    const data = ((body as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
    const runId = typeof data.id === "string" ? data.id : "";
    if (!runId) throw new ApifyStartError("Apify start: no run id in response", res.status);
    return { runId, datasetId: typeof data.defaultDatasetId === "string" ? data.defaultDatasetId : null };
  } finally {
    clearTimeout(t);
  }
}

/** Apify's live run + memory reading (one short call per tick). null = could not be read (the caller falls back to its
 *  own count). Never throws. */
export async function readApifyLive(token: string, timeoutMs = 5_000): Promise<ApifyLive | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.apify.com/v2/users/me/limits", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!res.ok) return null;
    const d = ((await res.json())?.data ?? {}) as Record<string, Record<string, unknown>>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      activeRuns: num(d.current?.activeActorJobCount),
      maxRuns: num(d.limits?.maxConcurrentActorJobs),
      memoryUsedGb: num(d.current?.actorMemoryGbytes),
      memoryMaxGb: num(d.limits?.maxActorMemoryGbytes),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
