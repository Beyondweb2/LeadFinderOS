import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// record-site-event — captures public barber-site tracking events.
//
// Called by the public /s/:token page (anon, verify_jwt = false). Keyed by the
// site's unguessable share_token. Writes both the headline column on
// generated_sites AND an append-only row in site_events (raw history). Uses the
// service role so anon can record without direct table write access (RLS keeps
// the client out; this function is the only writer).
//
// Events:
//   open            → set first_opened_at if null, increment open_count, log
//   claim           → ONE-TIME: set claimed_at if null, log (else alreadyClaimed)
//   addon_interest  → ONE-TIME: set addon_interest_at if null, log
//
// 'sent' and 'replied' are admin-side signals set elsewhere (AdminSiteManage),
// not here.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_EVENTS = ["open", "claim", "addon_interest"] as const;
type SiteEvent = (typeof VALID_EVENTS)[number];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const shareToken: string = typeof body.share_token === "string" ? body.share_token.trim() : "";
    const event = body.event as SiteEvent;

    if (!shareToken) return json({ ok: false, error: "share_token required" }, 400);
    if (!VALID_EVENTS.includes(event)) return json({ ok: false, error: "invalid event" }, 400);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Resolve the site by its unguessable token.
    const { data: site, error: findError } = await service
      .from("generated_sites")
      .select("id, first_opened_at, open_count, claimed_at, addon_interest_at")
      .eq("share_token", shareToken)
      .maybeSingle();
    if (findError) return json({ ok: false, error: "lookup_failed" }, 500);
    if (!site) return json({ ok: false, error: "not_found" }, 404);

    const nowIso = new Date().toISOString();
    const meta = {
      ua: req.headers.get("user-agent") ?? null,
      ref: req.headers.get("referer") ?? null,
    };

    if (event === "open") {
      await service.from("generated_sites").update({
        first_opened_at: site.first_opened_at ?? nowIso,
        open_count: (site.open_count ?? 0) + 1,
      }).eq("id", site.id);
      await service.from("site_events").insert({ site_id: site.id, event_type: "open", meta });
      return json({ ok: true, event: "open" });
    }

    if (event === "claim") {
      if (site.claimed_at) return json({ ok: true, event: "claim", alreadyDone: true, claimed_at: site.claimed_at });
      await service.from("generated_sites").update({ claimed_at: nowIso }).eq("id", site.id);
      await service.from("site_events").insert({ site_id: site.id, event_type: "claim", meta });
      return json({ ok: true, event: "claim", claimed_at: nowIso });
    }

    // addon_interest
    if (site.addon_interest_at) return json({ ok: true, event: "addon_interest", alreadyDone: true, addon_interest_at: site.addon_interest_at });
    await service.from("generated_sites").update({ addon_interest_at: nowIso }).eq("id", site.id);
    await service.from("site_events").insert({ site_id: site.id, event_type: "addon_interest", meta });
    return json({ ok: true, event: "addon_interest", addon_interest_at: nowIso });
  } catch (e) {
    console.error("record-site-event error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
