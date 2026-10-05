// legacy-checkout-cutover — the controlled cutover to the agreement-first checkout (2026-10-05).
//
//   POST {}                                              → REPORT (read-only): what is still payable
//   POST { mode: "execute", plan_hash, confirm }         → invalidate EXACTLY the reviewed plan, then report
//
// LEGACY FINDABLE CHECKOUT CUTOVER: open legacy Checkout Sessions, active Findable Payment Links, stored
// Quick Close Stripe links, other bypass paths — and the exact objects to invalidate. Rules:
// src/lib/legacyCutover.ts; Stripe I/O: _shared/legacy-cutover.ts. Run by the integration session right
// after findable-checkout (the gate) is deployed, then again until it says READY.
// ⛔ AUTH: x-cron-secret = CRON_SECRET, or an admin session. verify_jwt = false (handler-side auth,
//    CLAUDE.md §6) — config.toml carries the entry.
// ⛔ It never charges, refunds or touches a completed payment, a signed v3 session, or anything that is
//    not a Findable sales path.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, requireAdmin } from "../_shared/access.ts";
import { cutoverReport, executeCutover } from "../_shared/legacy-cutover.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const cronOk = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    if (!cronOk) {
      const gate = await requireAdmin(req, service);
      if (!gate.ok) return json(refusalBody(gate), gate.status);
    }
    const secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!secret) return json({ ok: false, error: "payments_not_configured" }, 503);
    const body = await req.json().catch(() => ({})) as { mode?: string; plan_hash?: string; confirm?: string };
    if (body.mode === "execute") {
      const out = await executeCutover(service, { secret, planHash: String(body.plan_hash ?? ""), confirm: String(body.confirm ?? "") });
      if (out.kind === "refused") return json({ ok: false, error: "refused", reason: out.reason, report: out.report.text, plan_hash: out.report.planHash }, 409);
      return json({ ok: true, expired: out.expired, deactivated: out.deactivated, report: out.after.text, ready: out.after.plan.ready, plan_hash: out.after.planHash });
    }
    const r = await cutoverReport(service, { secret });
    return json({ ok: true, report: r.text, plan_hash: r.planHash, ready: r.plan.ready, plan: r.plan });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[legacy-checkout-cutover]", message);
    return json({ ok: false, error: "cutover_failed", detail: message.slice(0, 300) }, 500);
  }
});
