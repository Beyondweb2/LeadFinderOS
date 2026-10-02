import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, requireAdmin } from "../_shared/access.ts";
import { loadAdminOverview } from "../_shared/admin-overview-load.ts";
import { resolvePeriod } from "../../../src/lib/reportingPeriod.ts";

// admin-overview — the Admin control centre's numbers (2026-09-30, docs/admin-control-centre.md).
//
// ⛔ ADMIN ONLY (requireAdmin: a salesperson is refused and the refusal is counted). The reads and the
// fold live in _shared/admin-overview-load.ts (shared with fn business-summary, so the two can never
// disagree). Reads only; it writes nothing and spends nothing (no model, no paid API).
// The period is resolved by src/lib/reportingPeriod.ts — the one London-day clock.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
/** Marker only the new code produces — the deploy check reads it from the response. */
const BUILD_ID = "admin-overview-2026-10-02-my-activity-scope";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  const started = Date.now();
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await requireAdmin(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const body = await req.json().catch(() => ({}));
    const nowMs = Date.now();
    const period = resolvePeriod(body.period ?? "30d", nowMs, { from: body.from, to: body.to });
    // "My activity: hidden" — only an explicit true hides; anything else (an older page, a blank) counts everyone.
    const overview = await loadAdminOverview(service, period, nowMs, { hideAdminActivityFor: body.hideMine === true ? who.actor.id : null });
    return json({ ok: true, build: BUILD_ID, ...overview, ms: Date.now() - started });
  } catch (e) {
    console.error("[admin-overview]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error", detail: "Could not load the dashboard numbers. Try again in a moment." }, 500);
  }
});
