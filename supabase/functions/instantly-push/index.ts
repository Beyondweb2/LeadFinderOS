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
import { resolveAuditReplyVars } from "../_shared/audit-reply.ts";

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
      .select("id, business_name, email, category, instantly_pushed_at, search_location, derived_town")
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

    /* ══ THE FIVE VARIABLES, FROM THE RESOLVER THE WHATSAPP PITCH ALREADY USES ══════════════════
       ⛔ WHAT THIS REPLACED: business_name + category + `city: ""` — a hardcoded empty string, with
       a comment claiming outreach_leads had no city column. It has two (search_location and the
       derived_town added 2026-07-30), so every push carried a blank city into a variable a template
       would have rendered as nothing, mid-sentence, in a real email.

       ⚠️ REUSED, NOT REIMPLEMENTED. resolveAuditReplyVars is the SAME resolver send-whatsapp-message
       uses for audit_reply. It already formats competitors as "X, Y and Z" capped at three, prefers
       the report's HEADLINE rivals so the email names what the report leads with, and returns
       {ok:false, reason} rather than something broken. Writing a second competitor formatter here
       would drift from the WhatsApp one the first time either changed.

       ⛔ NO COMPLETED AUDIT -> THE LEAD IS NOT PUSHED AT ALL. Touch 1 is reply-gated and carries no
       link, so competitor names ARE the hook; without them the email is generic and burns both the
       lead and the sending domain's reputation. Refusing is the whole point of resolving here
       rather than sending a blank variable and finding out from a reply that never comes. */
    const resolved: Array<{ row: typeof toPush[number]; vars: { trade: string; competitors: string; business: string; link: string } }> = [];
    const skippedNoAudit: Array<{ id: string; business_name: string | null; reason: string }> = [];

    /* Small concurrency: one resolver call is several reads, and MAX_BATCH is 1000. Sequential
       would be minutes; unbounded would hammer PostgREST. */
    const CONCURRENCY = 8;
    for (let i = 0; i < toPush.length; i += CONCURRENCY) {
      const slice = toPush.slice(i, i + CONCURRENCY);
      const out = await Promise.all(slice.map(async (r) => ({ r, v: await resolveAuditReplyVars(service, r.id) })));
      for (const { r, v } of out) {
        if (v.ok) resolved.push({ row: r, vars: { trade: v.trade, competitors: v.competitors, business: v.business, link: v.link } });
        else skippedNoAudit.push({ id: r.id, business_name: r.business_name ?? null, reason: v.reason });
      }
    }

    if (resolved.length === 0) {
      return json({
        success: true, pushed: 0, skippedAlreadyPushed, skippedNoEmail,
        skippedNoAudit: skippedNoAudit.length, skippedNoAuditDetail: skippedNoAudit,
      });
    }

    // ⚠️ VERIFY: V2 bulk-add body shape (campaign_id, leads[], custom_variables).
    /* ⚠️ THE VARIABLE NAMES ARE THE CONTRACT. Instantly fills {{business_name}} etc. by EXACT name
       against what was uploaded; a rename here silently renders as an empty string in a sent email
       rather than erroring. Change these only alongside the campaign's templates. */
    const leads = resolved.map(({ row: r, vars }) => ({
      email: String(r.email).trim(),
      company_name: vars.business || r.business_name || undefined,
      custom_variables: {
        business_name: vars.business || r.business_name || "",
        trade: vars.trade,
        competitors: vars.competitors,
        report_url: vars.link,
        /* The real town, at last. derived_town is resolved from the Places address and is the
           truthful one; search_location is what was typed and can be a neighbouring town (the
           Huntingdon-from-a-Wisbech-search case). Prefer derived, fall back, never empty-string. */
        city: (r.derived_town ?? "").trim() || (r.search_location ?? "").trim() || "",
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
    const pushedIds = resolved.map(({ row }) => row.id);
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

    return json({
      success: true, pushed: pushedIds.length,
      skippedAlreadyPushed, skippedNoEmail,
      skippedNoAudit: skippedNoAudit.length, skippedNoAuditDetail: skippedNoAudit,
      sentVariables: Object.keys(leads[0].custom_variables),   // so a rename is visible in the response
      sample: { email: leads[0].email, custom_variables: leads[0].custom_variables },
      instantly: pushData,
    });
  } catch (e) {
    console.error("[instantly-push] error:", (e as Error).message);
    return json({ success: false, error: "server_error", detail: (e as Error).message }, 500);
  }
});
