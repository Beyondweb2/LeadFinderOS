// poll-instantly-replies — scheduled poll of Instantly.ai for replies / bounces on
// leads we pushed (Instantly V2 API). No webhooks (Growth plan) — pg_cron drives it
// every ~20 min (see the invoke_instantly_poll() wrapper in the migration).
//
// Active set: outreach_leads with instantly_pushed_at set AND status='email_sent'
// (i.e. pushed, not yet replied/bounced). We match Instantly events to these by EMAIL.
//   reply  → status='replied'
//   bounce → status='bounced'
// Idempotent: once a lead leaves 'email_sent' it's out of the active set, so re-polling
// the same events can't re-flip it.
//
// Auth: service-role bearer only (the cron). Instantly key from INSTANTLY_API_KEY.
//
// ⚠️ V2 SHAPES TO VERIFY against the live API:
//   * Replies: GET /emails?ue_type=2 (received) → sender-email field name.
//   * Bounces: read per-campaign lead status via POST /leads/list → the bounced flag.
// Reply detection is the primary path; bounce detection is best-effort until the exact
// V2 bounce signal is confirmed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("INSTANTLY_API_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    if (!apiKey) return json({ ok: false, error: "INSTANTLY_API_KEY not configured" }, 503);

    // --- Auth: service-role bearer only (cron) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const instantly = (path: string, init?: RequestInit) =>
      fetch(`${INSTANTLY_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init?.headers || {}) },
      });

    // --- Active set: pushed leads not yet replied/bounced, keyed by email ---
    const { data: active } = await service
      .from("outreach_leads")
      .select("id, email, instantly_campaign_id")
      .not("instantly_pushed_at", "is", null)
      .eq("status", "email_sent");
    const activeLeads = active ?? [];
    if (activeLeads.length === 0) {
      await service.from("instantly_poll_state").update({ last_polled_at: new Date().toISOString() }).eq("id", 1);
      return json({ ok: true, active: 0, replied: 0, bounced: 0, skipped: "empty_active_set" });
    }
    const emailToId = new Map<string, string>();
    for (const l of activeLeads) {
      const e = norm(l.email);
      if (e) emailToId.set(e, l.id as string);
    }

    const repliedIds = new Set<string>();
    const bouncedIds = new Set<string>();

    // --- 1) Replies: received emails (ue_type=2). Match sender → active lead ---
    try {
      const res = await instantly(`/emails?ue_type=2&limit=100`); // ⚠️ VERIFY shape
      const data = await res.json().catch(() => ({}));
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      for (const m of items as Record<string, unknown>[]) {
        // sender of a RECEIVED email is the prospect (the lead). Try the likely fields.
        const sender = norm(m.from_address_email ?? m.from_address ?? m.lead_email ?? m.lead);
        const id = sender && emailToId.get(sender);
        if (id) repliedIds.add(id);
      }
    } catch (e) {
      console.error("[poll-instantly] replies fetch failed:", (e as Error).message);
    }

    // --- 2) Bounces (best-effort): per-campaign lead status. ⚠️ VERIFY V2 signal ---
    try {
      const campaignIds = [...new Set(activeLeads.map((l) => l.instantly_campaign_id).filter(Boolean) as string[])];
      for (const cid of campaignIds) {
        const res = await instantly(`/leads/list`, {
          method: "POST",
          body: JSON.stringify({ campaign_id: cid, limit: 100 }),
        });
        const data = await res.json().catch(() => ({}));
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        for (const l of items as Record<string, unknown>[]) {
          const e = norm(l.email);
          const id = e && emailToId.get(e);
          if (!id) continue;
          const status = String(l.status ?? l.lead_status ?? "").toLowerCase();
          if (status.includes("bounce")) bouncedIds.add(id);
          else if (status.includes("repl")) repliedIds.add(id);
        }
      }
    } catch (e) {
      console.error("[poll-instantly] bounce/status fetch failed:", (e as Error).message);
    }

    // --- Apply: bounce wins over reply if both somehow flagged ---
    for (const id of bouncedIds) repliedIds.delete(id);
    if (repliedIds.size) {
      await service.from("outreach_leads").update({ status: "replied" }).in("id", [...repliedIds]);
    }
    if (bouncedIds.size) {
      await service.from("outreach_leads").update({ status: "bounced" }).in("id", [...bouncedIds]);
    }

    await service.from("instantly_poll_state").update({ last_polled_at: new Date().toISOString() }).eq("id", 1);

    return json({ ok: true, active: activeLeads.length, replied: repliedIds.size, bounced: bouncedIds.size });
  } catch (e) {
    console.error("[poll-instantly] error:", (e as Error).message);
    return json({ ok: false, error: "server_error", detail: (e as Error).message }, 500);
  }
});
