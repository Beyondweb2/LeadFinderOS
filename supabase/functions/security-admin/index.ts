import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, requireAdmin, isInternalCall } from "../_shared/access.ts";
import { sendOperatorAlert } from "../_shared/operator-alert.ts";
import { isProtectionMode, validateLimits } from "../../../src/lib/protectionLimits.ts";
import { alertEmail, type SecurityEventRow } from "../../../src/lib/securityAlerts.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SECURITY ADMIN (2026-09-29, docs/abuse-cost-protection.md) — the Admin screen's one door, and the
   5-minute alert sweep.

     overview      (admin) — spend today by provider / person, warnings, restricted and suspended
                             accounts, recent guarded activity, the mode, the thresholds, the webhook
                             signature state, Apify. public.security_overview() + env facts.
     set_mode      (admin) — running / prospecting_paused / all_stop. ONE control.
     set_limits    (admin) — the whole thresholds object, validated by validateLimits (positive shape).
     unlock_user   (admin) — lift one salesperson's per-user limits for N hours (1–72).
     sweep         (cron, CRON_SECRET) — raise the team / spike / Apify / webhook events, then email
                             every pending alert in ONE message and mark them sent only if Resend
                             accepted it.

   ⛔ verify_jwt = false (config.toml): the cron carries CRON_SECRET, not a user token; every other
   action is requireAdmin in the handler.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-job",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Client = any;

/** Is Meta's webhook signature actually being checked? The secret is project-wide, so this function
 *  sees exactly what whatsapp-status sees. Never the value — only whether it is there. */
const webhookSignatureEnforced = () => (Deno.env.get("WHATSAPP_APP_SECRET") ?? "").length > 0;

async function logAdminEvent(service: Client, adminId: string, kind: string, detail: Record<string, unknown>) {
  const { error } = await service.from("security_events").insert({
    actor_user_id: adminId, actor_role: "admin", kind, severity: "info", detail,
  });
  if (error) console.error(`[security-admin] event ${kind} not recorded: ${error.message}`);
}

async function sweep(service: Client): Promise<Record<string, unknown>> {
  if (!webhookSignatureEnforced()) {
    // Once, ever (no date in the key): the Admin screen keeps showing it; the inbox is told one time.
    await service.from("security_events").upsert({
      kind: "webhook_unsigned", severity: "critical", detail: {}, alert_key: "system:webhook_unsigned", alert_wanted: true,
    }, { onConflict: "alert_key", ignoreDuplicates: true });
  }
  const { data, error } = await service.rpc("security_sweep");
  if (error || !data?.ok) return { ok: false, error: "sweep_failed", detail: String(error?.message ?? data?.error ?? "") };
  const pending = (Array.isArray(data.pending) ? data.pending : []) as Array<SecurityEventRow & { id: string }>;
  if (!pending.length) return { ok: true, sent: 0, team_24h_usd: data.team_24h_usd };
  const { subject, lines } = alertEmail(pending, new Date().toISOString());
  const sent = await sendOperatorAlert(subject, lines);
  if (!sent.ok) {
    console.error(`[security-admin] alert email NOT sent (${sent.status}): ${sent.error}`);
    return { ok: false, error: "email_failed", pending: pending.length };
  }
  const { error: mErr } = await service.from("security_events").update({ alerted_at: new Date().toISOString() }).in("id", pending.map((p) => p.id));
  if (mErr) console.error(`[security-admin] alerts sent but not marked: ${mErr.message}`);
  return { ok: true, sent: pending.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "sweep") {
      if (!isInternalCall(req)) return json({ ok: false, error: "forbidden" }, 403);
      return json(await sweep(service));
    }

    const who = await requireAdmin(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const adminId = who.actor.id;

    if (action === "overview") {
      const { data, error } = await service.rpc("security_overview");
      if (error || !data) return json({ ok: false, error: "read_failed", detail: String(error?.message ?? "") }, 503);
      return json({ ok: true, ...data, webhook_signature_enforced: webhookSignatureEnforced() });
    }

    if (action === "set_mode") {
      const mode = body.mode;
      if (!isProtectionMode(mode)) return json({ ok: false, error: "bad_mode" }, 400);
      const { data: before } = await service.from("protection_settings").select("mode").eq("id", 1).maybeSingle();
      const { error } = await service.from("protection_settings").update({ mode, updated_at: new Date().toISOString(), updated_by: adminId }).eq("id", 1);
      if (error) return json({ ok: false, error: "write_failed", detail: error.message }, 503);
      await logAdminEvent(service, adminId, "mode_changed", { from: before?.mode ?? null, to: mode });
      return json({ ok: true, mode });
    }

    if (action === "set_limits") {
      const v = validateLimits(body.limits);
      if (!v.ok) return json({ ok: false, error: "bad_limits", detail: v.error }, 400);
      const { data: before } = await service.from("protection_settings").select("limits").eq("id", 1).maybeSingle();
      const { error } = await service.from("protection_settings").update({ limits: v.limits, updated_at: new Date().toISOString(), updated_by: adminId }).eq("id", 1);
      if (error) return json({ ok: false, error: "write_failed", detail: error.message }, 503);
      await logAdminEvent(service, adminId, "limits_changed", { before: before?.limits ?? null, after: v.limits });
      return json({ ok: true });
    }

    if (action === "unlock_user") {
      const uid = typeof body.user_id === "string" && /^[0-9a-f-]{36}$/i.test(body.user_id) ? body.user_id : null;
      const hours = Math.floor(Number(body.hours));
      if (!uid) return json({ ok: false, error: "bad_user" }, 400);
      if (!(hours >= 0 && hours <= 72)) return json({ ok: false, error: "bad_hours" }, 400);
      const { data: s, error: rErr } = await service.from("protection_settings").select("overrides").eq("id", 1).maybeSingle();
      if (rErr || !s) return json({ ok: false, error: "read_failed" }, 503);
      const overrides = { ...(s.overrides ?? {}) } as Record<string, string>;
      // Expired overrides are dropped on every write, so the row never grows.
      for (const [k, until] of Object.entries(overrides)) if (!(Date.parse(until) > Date.now())) delete overrides[k];
      if (hours === 0) delete overrides[uid];
      else overrides[uid] = new Date(Date.now() + hours * 3_600_000).toISOString();
      const { error } = await service.from("protection_settings").update({ overrides, updated_at: new Date().toISOString(), updated_by: adminId }).eq("id", 1);
      if (error) return json({ ok: false, error: "write_failed", detail: error.message }, 503);
      await logAdminEvent(service, adminId, "user_unlocked", { user_id: uid, hours });
      return json({ ok: true, until: overrides[uid] ?? null });
    }

    return json({ ok: false, error: "unsupported_action" }, 400);
  } catch (e) {
    console.error("[security-admin] crashed:", e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: "server_error" }, 500);
  }
});
