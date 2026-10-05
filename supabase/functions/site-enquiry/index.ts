// site-enquiry — the enquiry form on a Findable client website (BS4 Electrical first, 2026-09-27).
// The rules live in _shared/site-enquiry.ts; this file does the IO.
//
//  · POST only. JSON (the site's script) or a plain form post (no JavaScript → a 303 back to the
//    site's thank-you address). OPTIONS answers CORS for a listed origin only.
//  · The recipient comes from the site key's Website Build record (website_build.form, switched on by
//    Paul in Website Build — fix workstream 6, 2026-10-04) — never from the request, and no code edit
//    or deploy per client. A key no Build client has switched on is refused (resolveClientSite).
//  · Only the site's PRODUCTION origin delivers to the business. A preview / localhost origin is
//    TEST mode: sent to Resend's test inbox, the row marked test. Any other origin is refused.
//  · Honeypot and too-fast posts are dropped silently (answered as success). Rate limits per IP hash
//    and per site. Every accepted enquiry is STORED first, so a failed email is visible in the row
//    (notify_error), never lost. The IP is kept only as a salted hash.
//
// verify_jwt=false: public by design (config.toml). Email via Resend (RESEND_API_KEY,
// alerts@findable.live — the path request-call and notify-onboarding-submit use).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  MAX_PER_IP_PER_HOUR, MAX_PER_SITE_PER_DAY, corsHeaders, enquiryEmail, isSiteKey, originMode, resolveClientSite, validateEnquiry,
} from "../_shared/site-enquiry.ts";
import { websiteServiceRoute } from "../../../src/lib/websiteRoute.ts";

const TABLE = "site_enquiries";
/** Marker only the registry build answers with (the deploy check, CLAUDE.md §4). */
const BUILD_ID = "site-enquiry-registry-1";

/** Every Website Build record claiming this key, each with its route (service role: the rows are
 *  admin-only). Up to two — a second one is enough to refuse. */
async function recordsForKey(service: SupabaseClient, key: string) {
  if (!isSiteKey(key)) return [];
  const { data, error } = await service.from("outreach_leads")
    .select("id,business_name,service_terminated_at,website_build,contract_total_payments")
    .eq("website_build->form->>site_key", key).limit(2);
  if (error) throw new Error("registry: " + error.message);
  const out = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const { data: ob } = await service.from("onboarding_responses").select("plan_tier,website_addon,website_route")
      .eq("lead_id", row.id as string).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    out.push({ row, route: websiteServiceRoute(ob as never, row as never).route });
  }
  return out;
}

async function readBody(req: Request): Promise<{ data: Record<string, unknown>; isJson: boolean }> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return { data: j && typeof j === "object" && !Array.isArray(j) ? j as Record<string, unknown> : {}, isJson: true };
  }
  const form = await req.formData().catch(() => null);
  const data: Record<string, unknown> = {};
  if (form) for (const [k, v] of form.entries()) if (typeof v === "string") data[k] = v;
  return { data, isJson: false };
}

async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!ip) return "";
  const salt = (Deno.env.get("SUPABASE_URL") ?? "") + ":site-enquiry";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + ip));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const url = new URL(req.url);
  const siteKey = (url.searchParams.get("site") || "").toLowerCase();
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let resolved: ReturnType<typeof resolveClientSite>;
  try { resolved = resolveClientSite(siteKey, await recordsForKey(service, siteKey)); }
  catch (e) {
    console.error("[site-enquiry] registry read failed:", (e as Error).message);
    return new Response(JSON.stringify({ ok: false, error: "internal" }), { status: 500, headers: { "Content-Type": "application/json", "x-site-enquiry-build": BUILD_ID } });
  }
  const site = resolved.site;
  const mode = site ? originMode(site, origin) : "refused";
  const cors = { ...corsHeaders(origin, mode), "x-site-enquiry-build": BUILD_ID };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: mode === "refused" ? 403 : 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "post_only" }, 405);
  /* The reason CODE only (unknown_site / form_not_enabled / not_servable / ambiguous_site_key) — enough
     for the builder to report "Paul has not switched the form on yet"; never the configuration. */
  if (!site) return json({ ok: false, error: "reason" in resolved ? resolved.reason.replace(/:.*$/, "") : "unknown_site" }, 404);
  if (mode === "refused") return json({ ok: false, error: "origin_not_allowed" }, 403);

  const { data, isJson } = await readBody(req);
  const back = (sent: boolean) => isJson
    ? json(sent ? { ok: true, mode } : { ok: false, error: "not_sent" }, sent ? 200 : 500)
    : new Response(null, { status: 303, headers: { ...cors, Location: origin + site.thanksPath.replace("sent=1", sent ? "sent=1" : "sent=0") } });

  const v = validateEnquiry(data, Date.now());
  if (!v.ok) {
    // A bot learns nothing: honeypot / too-fast are answered as if sent.
    if (v.reason !== "invalid") return back(true);
    return isJson ? json({ ok: false, error: "invalid", fields: v.problems }, 400) : back(false);
  }

  try {
    const hash = await ipHash(req);
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    if (hash) {
      const { count } = await service.from(TABLE).select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", hourAgo);
      if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) return isJson ? json({ ok: false, error: "rate_limited" }, 429) : back(false);
    }
    const { count: siteCount } = await service.from(TABLE).select("id", { count: "exact", head: true }).eq("site", site.key).gte("created_at", dayAgo);
    if ((siteCount ?? 0) >= MAX_PER_SITE_PER_DAY) return isJson ? json({ ok: false, error: "rate_limited" }, 429) : back(false);

    // Store FIRST: a Resend failure then shows in the row instead of losing the enquiry.
    const { data: row, error: insErr } = await service.from(TABLE).insert({
      site: site.key, mode, origin, ip_hash: hash || null, ...v.fields,
      email: v.fields.email || null, phone: v.fields.phone || null, service: v.fields.service || null,
    }).select("id").single();
    if (insErr) throw new Error("insert: " + insErr.message);

    let notifyError: string | null = null, resendId: string | null = null;
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) notifyError = "RESEND_API_KEY is not set";
    else {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(enquiryEmail(site, v.fields, mode, origin!)),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) notifyError = `resend HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`;
        else resendId = String((body as { id?: string }).id ?? "") || null;
      } catch (e) { notifyError = `resend threw: ${(e as Error).message}`.slice(0, 250); }
    }
    await service.from(TABLE).update({ notify_error: notifyError, resend_id: resendId, notified_at: notifyError ? null : new Date().toISOString() }).eq("id", (row as { id: string }).id);
    if (notifyError) console.error("[site-enquiry]", notifyError);
    return back(!notifyError);
  } catch (e) {
    console.error("[site-enquiry] error:", (e as Error).message);
    return isJson ? json({ ok: false, error: "internal" }, 500) : back(false);
  }
});
