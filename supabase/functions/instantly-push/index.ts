// instantly-push — operator-initiated push of selected Outreach leads into an
// Instantly.ai campaign (Instantly V2 API, Bearer auth).
//
//   mode 'list_campaigns' → GET /api/v2/campaigns (for the picker dropdown)
//   mode 'push'           → POST /api/v2/leads/add (batch ≤1000), then flips the
//                           pushed leads to contact_method='email', status='email_sent',
//                           stamps instantly_pushed_at + instantly_campaign_id.
//
// Auth: the CALLER's JWT (verify_jwt=false; we resolve the user in-handler and only
// ever touch outreach_leads rows owned by that user). The Instantly key is read from
// the INSTANTLY_API_KEY secret — never hardcoded, never sent to the client.
//
// ⚠️ V2 SHAPES TO VERIFY against the live API (flagged for the first real test):
//   * GET  /campaigns        → response items array + {id,name} field names
//   * POST /leads/add        → body field names (campaign_id vs campaign; leads[]),
//                              and the custom_variables object shape.
// If these differ, only the marked spots below change — the flow is unaffected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";
const MAX_BATCH = 1000;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("INSTANTLY_API_KEY") ?? "";
    if (!apiKey) return json({ success: false, error: "INSTANTLY_API_KEY not configured" }, 503);

    // --- Auth: resolve the caller (so we only push their own leads) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ success: false, error: "Unauthorized" }, 401);
    const token = authHeader.slice(7);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return json({ success: false, error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const instantly = (path: string, init?: RequestInit) =>
      fetch(`${INSTANTLY_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init?.headers || {}) },
      });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "push" ? "push" : "list_campaigns";

    // ── list_campaigns ───────────────────────────────────────────────────────
    if (mode === "list_campaigns") {
      const res = await instantly(`/campaigns?limit=100`); // ⚠️ VERIFY pagination/shape
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return json({ success: false, error: "instantly_campaigns_failed", status: res.status, detail: data }, 502);
      }
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const campaigns = items
        .map((c: Record<string, unknown>) => ({ id: c.id as string, name: (c.name as string) ?? (c.id as string) }))
        .filter((c: { id?: string }) => !!c.id);
      return json({ success: true, campaigns });
    }

    // ── push ─────────────────────────────────────────────────────────────────
    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
    const leadIds: string[] = Array.isArray(body.lead_ids) ? body.lead_ids.filter((x: unknown) => typeof x === "string") : [];
    if (!campaignId || leadIds.length === 0) {
      return json({ success: false, error: "missing_campaign_or_leads" }, 200);
    }

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Admin check (service-role, mirrors the bulk-jobs pattern). Admins may push
    // leads they don't own; non-admins stay strictly owner-scoped. userId comes
    // ONLY from the verified JWT claims above — never from the request body.
    const { data: adminRow } = await service
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!adminRow;

    // Selected leads (note: outreach_leads has no `city` column — city is sent
    // empty for now; see the flag in the PR notes). Non-admins are restricted to
    // their own rows; admins get no owner filter so they can push any lead by id.
    let leadQuery = service
      .from("outreach_leads")
      .select("id, business_name, email, category, instantly_pushed_at")
      .in("id", leadIds);
    if (!isAdmin) leadQuery = leadQuery.eq("user_id", userId);
    const { data: rows, error: lErr } = await leadQuery;
    if (lErr) return json({ success: false, error: lErr.message }, 500);

    const all = rows ?? [];
    const skippedAlreadyPushed = all.filter((r) => r.instantly_pushed_at).length;
    const skippedNoEmail = all.filter((r) => !r.instantly_pushed_at && !String(r.email ?? "").trim()).length;
    const toPush = all
      .filter((r) => !r.instantly_pushed_at && String(r.email ?? "").trim())
      .slice(0, MAX_BATCH);

    if (toPush.length === 0) {
      return json({ success: true, pushed: 0, skippedAlreadyPushed, skippedNoEmail });
    }

    // ⚠️ VERIFY: V2 bulk-add body shape (campaign_id, leads[], custom_variables).
    const leads = toPush.map((r) => ({
      email: String(r.email).trim(),
      company_name: r.business_name ?? undefined,
      custom_variables: {
        business_name: r.business_name ?? "",
        city: "", // no city column on outreach_leads yet — flagged
        category: r.category ?? "",
      },
    }));

    const pushRes = await instantly(`/leads/add`, {
      method: "POST",
      body: JSON.stringify({ campaign_id: campaignId, leads }),
    });
    const pushData = await pushRes.json().catch(() => ({}));
    if (!pushRes.ok) {
      // Surface the raw Instantly error so the live test reveals the exact V2 shape.
      return json({ success: false, error: "instantly_push_failed", status: pushRes.status, detail: pushData }, 502);
    }

    // Mark the pushed rows (contact method + status + dedup stamp).
    const pushedIds = toPush.map((r) => r.id);
    const { error: uErr } = await service
      .from("outreach_leads")
      .update({
        contact_method: "email",
        status: "email_sent",
        instantly_pushed_at: new Date().toISOString(),
        instantly_campaign_id: campaignId,
      })
      .in("id", pushedIds);
    if (uErr) console.error("[instantly-push] status update failed:", uErr.message);

    return json({ success: true, pushed: pushedIds.length, skippedAlreadyPushed, skippedNoEmail, instantly: pushData });
  } catch (e) {
    console.error("[instantly-push] error:", (e as Error).message);
    return json({ success: false, error: "server_error", detail: (e as Error).message }, 500);
  }
});
