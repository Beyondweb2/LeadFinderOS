/* APIFY ACCOUNT USAGE — read the account's real consumption and record it where we can see it.
 *
 * The problem this solves: internal cost accounting read $1.36 while the account had spent $73.55 of
 * a $90 monthly cap. Every internal cap was therefore measuring a number unrelated to the money, and
 * there was no warning before Apify stops serving at the cap — which halts audits and directory
 * scrapes at the same moment.
 *
 * Called from the audit queue's tick, throttled to once per REFRESH_MS, so it costs one unbilled
 * Apify API call every 15 minutes regardless of how often the cron fires.
 */

// deno-lint-ignore no-explicit-any
type Client = any;

/** How often to refresh. Apify API calls are rate-limited, not billed, but there is no point
 *  reading a monthly figure every 30 seconds. */
export const APIFY_USAGE_REFRESH_MS = 15 * 60_000;

/** Warn from here, loudly, on every tick. Chosen so there is real time to react before the hard
 *  stop rather than finding out when scrapes start failing. */
export const USAGE_WARN_PCT = 0.75;
/** Past this, the warning becomes a CRITICAL line: the account is close enough that a busy hour
 *  could reach the cap. */
export const USAGE_CRITICAL_PCT = 0.90;

export interface ApifyUsageSnapshot {
  monthlyUsageUsd: number | null;
  maxMonthlyUsageUsd: number | null;
  usagePct: number | null;
  cycleStart: string | null;
  cycleEnd: string | null;
  activeActorJobs: number | null;
  maxConcurrentRuns: number | null;
}

/**
 * Fetch + record, at most once per REFRESH_MS. Returns the snapshot it recorded, or null when it
 * skipped (too soon) or could not read the account. Never throws: this is observability, and it
 * must not be able to break a queue tick.
 */
export async function refreshApifyUsage(service: Client, token: string): Promise<ApifyUsageSnapshot | null> {
  if (!token) return null;
  try {
    // Throttle on the newest recorded snapshot rather than in-memory state, because each tick is a
    // fresh isolate — a module-level timestamp would never survive to be checked.
    const { data: last, error: lastErr } = await service
      .from("apify_account_usage")
      .select("captured_at")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) {
      // Table missing (migration pending) → say so once and carry on; the queue must not care.
      console.warn("[apify-usage] cannot read apify_account_usage, skipping:", lastErr.message);
      return null;
    }
    if (last?.captured_at && Date.now() - new Date(last.captured_at as string).getTime() < APIFY_USAGE_REFRESH_MS) {
      return null;
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    let payload: Record<string, unknown> | null = null;
    try {
      const res = await fetch("https://api.apify.com/v2/users/me/limits", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[apify-usage] limits endpoint returned ${res.status}`);
        return null;
      }
      payload = (await res.json())?.data ?? null;
    } finally {
      clearTimeout(t);
    }
    if (!payload) return null;

    const limits = (payload.limits ?? {}) as Record<string, unknown>;
    const current = (payload.current ?? {}) as Record<string, unknown>;
    const cycle = (payload.monthlyUsageCycle ?? {}) as Record<string, unknown>;

    const used = typeof current.monthlyUsageUsd === "number" ? current.monthlyUsageUsd : null;
    const cap = typeof limits.maxMonthlyUsageUsd === "number" ? limits.maxMonthlyUsageUsd : null;
    const pct = used != null && cap ? Number((used / cap).toFixed(4)) : null;

    const snap: ApifyUsageSnapshot = {
      monthlyUsageUsd: used,
      maxMonthlyUsageUsd: cap,
      usagePct: pct,
      cycleStart: typeof cycle.startAt === "string" ? cycle.startAt : null,
      cycleEnd: typeof cycle.endAt === "string" ? cycle.endAt : null,
      activeActorJobs: typeof current.activeActorJobCount === "number" ? current.activeActorJobCount : null,
      maxConcurrentRuns: typeof limits.maxConcurrentActorJobs === "number" ? limits.maxConcurrentActorJobs : null,
    };

    const { error: insErr } = await service.from("apify_account_usage").insert({
      monthly_usage_usd: snap.monthlyUsageUsd,
      max_monthly_usage_usd: snap.maxMonthlyUsageUsd,
      usage_pct: snap.usagePct,
      cycle_start: snap.cycleStart,
      cycle_end: snap.cycleEnd,
      active_actor_jobs: snap.activeActorJobs,
      max_concurrent_runs: snap.maxConcurrentRuns,
      max_actor_memory_gb: typeof limits.maxActorMemoryGbytes === "number" ? limits.maxActorMemoryGbytes : null,
      plan_id: typeof (payload.plan as { id?: string } | undefined)?.id === "string" ? (payload.plan as { id: string }).id : null,
      raw: payload,
    });
    if (insErr) console.warn("[apify-usage] snapshot not stored:", insErr.message);

    // THE WARNING. Deliberately on the queue's own log, because that is the thing running every 30s
    // and the thing that stops working when the cap is hit.
    if (pct != null && used != null && cap != null) {
      const line = `$${used.toFixed(2)} of $${cap.toFixed(2)} (${(pct * 100).toFixed(1)}%) this cycle` +
        (snap.cycleEnd ? `, resets ${snap.cycleEnd.slice(0, 10)}` : "");
      if (pct >= USAGE_CRITICAL_PCT) {
        console.error(`[apify-usage] CRITICAL: ${line}. At 100% Apify stops serving and BOTH audits and directory scrapes fail.`);
      } else if (pct >= USAGE_WARN_PCT) {
        console.warn(`[apify-usage] WARNING: ${line}.`);
      } else {
        console.log(`[apify-usage] ${line}.`);
      }
    }
    return snap;
  } catch (e) {
    console.warn("[apify-usage] refresh failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
