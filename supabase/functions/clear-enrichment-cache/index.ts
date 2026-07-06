// clear-enrichment-cache — operator-triggered "Reset to fresh" for a set of leads.
// Per business (owned by the caller), it: (a) deletes the generated site (FK cascades
// to bookings/booking_staff/claim_tokens/site_events), (b) nulls ONLY the lead's
// enrichment fields (explicit null-list — identity/notes/status/is_potential_work/
// website/whatsapp_*/history untouched), and (c) deletes the enrichment_cache rows by
// key-prefix (business_enrich / maps_enrich / services / website_check). So the lead is
// as if freshly added — no enrichment, no site — while staying in the list.
//
// enrichment_cache is RLS service-role-only, and generated_sites delete needs the admin
// policy, so all writes MUST be server-side. Auth mirrors enrich-business: a Bearer token
// identifying an authenticated user is required; the writes run under a service-role
// client. Because service role BYPASSES RLS, every business is ownership-guarded first
// (the lead's user_id must equal the caller) — a non-owned/not-found lead is skipped.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-job, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface BusinessRef {
  placeId?: string | null;
  googleMapsUrl?: string | null;
  leadId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Auth required" }, 401);
    const token = authHeader.replace("Bearer ", "");

    // Authenticated-user check — mirrors enrich-business's non-internal path.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    let userId: string | null = null;
    try {
      const { data } = await userClient.auth.getClaims(token);
      userId = (data?.claims?.sub as string) ?? null;
    } catch { /* fall through */ }
    if (!userId) {
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data?.user) return json({ error: "Auth required" }, 401);
      userId = data.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const businesses: BusinessRef[] = Array.isArray(body?.businesses) ? body.businesses : [];
    if (!businesses.length) return json({ error: "businesses required" }, 400);

    // Service-role client — the only role granted on enrichment_cache (RLS: no
    // authenticated policy). Same construction as enrich-business.
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    let reset = 0;
    let skipped = 0;
    for (const b of businesses) {
      if (!b || typeof b.leadId !== "string" || !b.leadId) { skipped++; continue; }

      // (a) OWNERSHIP GUARD (first, before any wipe). Service role bypasses RLS, so we
      //     MUST confirm the caller owns this lead. Not found / owned by someone else →
      //     skip entirely (no site delete, no field reset, no cache delete).
      let owned = false;
      try {
        const { data: leadRow } = await service
          .from("outreach_leads")
          .select("id,user_id")
          .eq("id", b.leadId)
          .single();
        owned = !!leadRow && (leadRow as { user_id?: string }).user_id === userId;
      } catch { owned = false; }
      if (!owned) { skipped++; continue; }

      // (b) DELETE the generated site for this lead (FK cascades to bookings /
      //     booking_staff → staff_working_hours / claim_tokens / site_events). The public
      //     URL and claim link die — acceptable for a reset. Best-effort.
      try {
        await service.from("generated_sites").delete().eq("lead_id", b.leadId);
      } catch (e) {
        console.error(`[reset-to-fresh] site delete failed for lead ${b.leadId}:`, (e as Error).message);
      }

      // (c) RESET only the lead's ENRICHMENT fields — explicit null-list, nothing else.
      //     Deliberately NOT touched: status, next_action, contact_method, notes,
      //     is_potential_work, website, identity (name/phone/maps/place_id/address),
      //     whatsapp_*, outreach_attempts, journey markers, payment/project fields.
      try {
        await service.from("outreach_leads").update({
          facebook_url: null,
          facebook_status: null,
          facebook_method: null,
          facebook_confidence: null,
          facebook_last_checked_at: null,
          instagram_url: null,
          instagram_status: null,
          instagram_method: null,
          instagram_last_checked_at: null,
          email: null,
          email_status: null,
          email_method: null,
          email_last_checked_at: null,
          line_type: null,
          line_type_checked_at: null,
          enrichment_source: null,
          image_url: null,
        }).eq("id", b.leadId);
      } catch (e) {
        console.error(`[reset-to-fresh] lead reset failed for lead ${b.leadId}:`, (e as Error).message);
      }

      // (d) DELETE the enrichment_cache rows (unchanged). Every prefix this business's
      //     cache_key could carry: keys are `${placeId || googleMapsUrl || `lead:${leadId}`}:<type>`.
      const prefixes: string[] = [];
      if (b.placeId) prefixes.push(`${b.placeId}:%`);
      if (b.googleMapsUrl) prefixes.push(`${b.googleMapsUrl}:%`);
      prefixes.push(`lead:${b.leadId}:%`);
      for (const prefix of prefixes) {
        try {
          await service.from("enrichment_cache").delete().like("cache_key", prefix);
        } catch (e) {
          console.error(`[clear-enrichment-cache] delete failed for prefix ${prefix}:`, (e as Error).message);
        }
      }
      reset++;
    }

    return json({ ok: true, reset, skipped });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
