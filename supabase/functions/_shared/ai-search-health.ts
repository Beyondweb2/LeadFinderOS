/* AI SEARCH HEALTH — the reader and the rate-drop alert (Paul, 2026-11-19, v1-audits-self-healing; the rules are
   src/lib/providerHealth.ts). Read by apify-usage-status (the admin line on the AI Visibility Audit page) and checked by
   process-ai-audit-queue every 5 minutes (raiseOperatorAlert: the bell row is the once-only claim, so a drop is one
   email per engine per 6 hours). Reads only the few JSON fields the rate needs. Never throws. */
import { RATE_WINDOW_MS, engineStats, hourlyStats, inWindow, rateDropAlerts, type HealthRow } from "../../../src/lib/providerHealth.ts";
import { HEAL_META_KEY } from "../../../src/lib/auditSelfHeal.ts";
import { raiseOperatorAlert } from "./audit-alerts.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

/** The asks that settled since `sinceIso` (newest 3000). */
export async function readHealthRows(service: Service, sinceIso: string): Promise<HealthRow[]> {
  const out: HealthRow[] = [];
  for (let from = 0; from < 3000; from += 1000) {
    const { data, error } = await service.from("ai_audit_queue")
      .select("status, updated_at, error:result->>error, chatgpt:result->chatgpt->>answer_text, gemini:result->gemini->>answer_text, aio_lane:result->_lanes->ai_overview->>state")
      .in("status", ["done", "failed"]).gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as HealthRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The admin view: last 24 h by engine, the last hour, hourly buckets, and what the heal did. null = unreadable. */
export async function healthReport(service: Service, nowMs = Date.now()) {
  try {
    const since = new Date(nowMs - 24 * 3_600_000).toISOString();
    const rows = await readHealthRows(service, since);
    const { data: runs } = await service.from("ai_audit_runs").select(`status, heal:results->${HEAL_META_KEY}`)
      .gte("created_at", new Date(nowMs - 36 * 3_600_000).toISOString()).not(`results->${HEAL_META_KEY}`, "is", null).limit(500);
    const heal = { reran: 0, gaveUp: 0, running: 0 };
    for (const r of (runs ?? []) as Array<{ status: string; heal: { rounds?: unknown[]; gave_up?: unknown } | null }>) {
      if (!r.heal || !Array.isArray(r.heal.rounds) || !r.heal.rounds.length) continue;
      heal.reran++;
      if (r.heal.gave_up) heal.gaveUp++;
      else if (r.status === "pending" || r.status === "running" || r.status === "processing") heal.running++;
    }
    return {
      day: engineStats(rows),
      lastHour: engineStats(inWindow(rows, nowMs - RATE_WINDOW_MS, nowMs + 1)),
      hourly: hourlyStats(rows, nowMs, 24),
      heal,
      generatedAt: new Date(nowMs).toISOString(),
    };
  } catch (e) {
    console.error("[ai-search-health] report failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Every 5 minutes from the queue tick. Returns how many alerts were raised. */
export async function checkRateDrop(service: Service, nowMs = Date.now()): Promise<number> {
  try {
    const rows = await readHealthRows(service, new Date(nowMs - RATE_WINDOW_MS).toISOString());
    let n = 0;
    for (const a of rateDropAlerts(engineStats(rows), nowMs)) {
      const r = await raiseOperatorAlert(service, "team_update", a);
      if (r === "sent") n++;
      console.warn(`[ai-search-health] ${a.title} → ${r}`);
    }
    return n;
  } catch (e) {
    console.error("[ai-search-health] rate check failed (non-blocking):", e instanceof Error ? e.message : e);
    return 0;
  }
}
