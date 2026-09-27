import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, requireAdmin } from "../_shared/access.ts";

/* apify-usage-status — the newest Apify account-usage snapshot, for the operator UI.
 *
 * WHY A FUNCTION AND NOT A DIRECT TABLE READ. `apify_account_usage` is created with RLS ENABLED AND
 * NO POLICIES (see 20260727_apify_account_usage.sql), deliberately: it is billing data. So a read
 * from the SPA with the anon/authenticated role returns HTTP 200 with an EMPTY ARRAY — it does not
 * error, it just silently looks like "no data", which is exactly the trap CLAUDE.md §4 warns about.
 * The alternatives were a SELECT policy (needs SQL run by hand, and opens billing to every logged-in
 * role) or this: one tiny service-role read behind the platform's own JWT check. No SQL, and the
 * table stays closed.
 *
 * ⛔ ADMIN ONLY, CHECKED IN THE HANDLER (2026-09-27). The old note here said the platform's JWT check
 * kept it to a logged-in operator — it does not: the public anon key in the JS bundle passes that
 * check, so the billing figures were readable by anyone. Billing is admin-only (multi-user plan).
 *
 * WHAT IT IS FOR. On 2026-07-30 the account sat at $89.78 of a $90 monthly cap from lunchtime and
 * every audit failed with an Apify 402. apify-usage.ts had been logging CRITICAL for two days — 170
 * times — but only into edge-function logs, which nobody reads. This is that warning, moved to where
 * the work happens.
 *
 * READ-ONLY. It writes nothing and calls Apify not at all: the snapshots are already captured every
 * 15 minutes by the audit queue's tick.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const gate = await requireAdmin(req, service);
    if (!gate.ok) return json(refusalBody(gate), gate.status);

    const { data, error } = await service
      .from("apify_account_usage")
      .select("captured_at, monthly_usage_usd, max_monthly_usage_usd, usage_pct, cycle_start, cycle_end")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    /* A missing table (migration not applied) or a read failure is NOT an error worth failing on —
       the caller is a status line, and a status line that breaks the page is worse than no line. Say
       ok:true with usage:null and let the UI render nothing. */
    if (error) {
      console.warn("[apify-usage-status] read failed:", error.message);
      return json({ ok: true, usage: null, note: "usage unavailable" });
    }
    if (!data) return json({ ok: true, usage: null, note: "no snapshot recorded yet" });

    const used = data.monthly_usage_usd === null ? null : Number(data.monthly_usage_usd);
    const cap = data.max_monthly_usage_usd === null ? null : Number(data.max_monthly_usage_usd);
    /* Recompute the percentage rather than trusting the stored one: the cap can be RAISED mid-cycle
       (Paul raised it by $10 on 2026-07-30), and a stored pct is only true for the cap that was in
       force when the snapshot was written. Falls back to the stored value when the numbers are absent. */
    const pct = used != null && cap ? used / cap : (data.usage_pct === null ? null : Number(data.usage_pct));

    return json({
      ok: true,
      usage: {
        capturedAt: data.captured_at,
        monthlyUsageUsd: used,
        maxMonthlyUsageUsd: cap,
        usagePct: pct,
        cycleStart: data.cycle_start,
        cycleEnd: data.cycle_end,
      },
    });
  } catch (e) {
    console.error("[apify-usage-status]", e instanceof Error ? e.message : e);
    // Same reasoning as above: never break the caller.
    return json({ ok: true, usage: null, note: "usage unavailable" });
  }
});
