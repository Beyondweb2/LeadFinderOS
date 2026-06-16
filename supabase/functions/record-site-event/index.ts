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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Email me (paul@move37.fun) when a barber requests the booking/SMS add-on, so I
 *  can follow up. Sends via Resend FROM the verified lead-finder-app.com sender
 *  (NOT yoursites.uk, which isn't verified). Best-effort — never blocks the event. */
async function notifyAddonInterest(opts: { businessName: string; siteName: string }): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("[record-site-event] RESEND_API_KEY not set; skipping add-on email");
    return;
  }
  try {
    const siteUrl = `https://yoursites.uk/p/${opts.siteName}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "LeadFinder Pro <noreply@lead-finder-app.com>",
        to: ["paul@move37.fun"],
        subject: `Add-on requested: ${opts.businessName}`,
        text:
          `${opts.businessName} just requested the booking + SMS add-on.\n\n` +
          `Site: ${siteUrl}\n\n` +
          `They've been added to Track Leads with a 24-hour follow-up task. Reply within 24h.`,
        html:
          `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1e293b">` +
          `<h2 style="margin:0 0 12px">Add-on requested 🔔</h2>` +
          `<p style="margin:0 0 4px"><strong>${escapeHtml(opts.businessName)}</strong> just requested the booking + SMS add-on.</p>` +
          `<p style="margin:0 0 4px"><strong>Site:</strong> <a href="${siteUrl}">${siteUrl}</a></p>` +
          `<p style="margin:8px 0 0;color:#475569">Added to Track Leads with a 24-hour follow-up task.</p>` +
          `</div>`,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[record-site-event] add-on email non-OK:", res.status, t.slice(0, 200));
    }
  } catch (e) {
    console.error("[record-site-event] add-on email failed (non-blocking):", (e as Error).message);
  }
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

    // Resolve the site by its unguessable token. `lead_id` + `content` are pulled
    // so the addon_interest branch can fan out (auto-pipeline + operator email).
    const { data: site, error: findError } = await service
      .from("generated_sites")
      .select("id, site_name, content, lead_id, first_opened_at, open_count, claimed_at, addon_interest_at")
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

    // addon_interest — ONE-TIME. On the FIRST request we also (b) drop the linked
    // CRM lead into Track Leads with a 24h follow-up, and (a) email me to follow
    // up. Both are best-effort and never block the tracking write.
    if (site.addon_interest_at) return json({ ok: true, event: "addon_interest", alreadyDone: true, addon_interest_at: site.addon_interest_at });
    await service.from("generated_sites").update({ addon_interest_at: nowIso }).eq("id", site.id);
    await service.from("site_events").insert({ site_id: site.id, event_type: "addon_interest", meta });

    const content = (site.content ?? {}) as Record<string, unknown>;
    const businessName = (typeof content.businessName === "string" && content.businessName.trim())
      ? content.businessName.trim()
      : site.site_name;

    // (b) Auto-pipeline: surface the linked lead in Track Leads with a "contact
    // within 24h" follow-up. Service role bypasses RLS (the barber is anon and is
    // NOT the CRM owner). next_action='follow_up' + a due date of tomorrow.
    if (site.lead_id) {
      try {
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await service.from("outreach_leads").update({
          is_potential_work: true,
          next_action: "follow_up",
          next_action_date: tomorrow,
        }).eq("id", site.lead_id);
      } catch (e) {
        console.error("[record-site-event] addon auto-pipeline failed (non-blocking):", (e as Error).message);
      }
    }

    // (a) Operator email (best-effort).
    await notifyAddonInterest({ businessName, siteName: site.site_name });

    return json({ ok: true, event: "addon_interest", addon_interest_at: nowIso });
  } catch (e) {
    console.error("record-site-event error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
