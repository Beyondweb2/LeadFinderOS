// agency-check — WHO RUNS THEIR WEBSITE? (2026-10-01, docs/agency-detection.md). Admin and Sales.
// POST { website } → the cached verdict for that site's domain if it is fresh, else a small
// sitemap-guided crawl (_shared/agency-crawl.ts) and the pure verdict (src/lib/agencyDetect.ts), saved to
// website_agency_checks. Free: no AI, nothing paid — counted against the free "site_scrape" guard.
// The SPA's Find Leads runs it for each result with its own website, 8 at a time.
// ⛔ Writes ONLY website_agency_checks. Never a lead, never website_control (the human's answer).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import { guardAction } from "../_shared/protection.ts";
import { crawlForAgency } from "../_shared/agency-crawl.ts";
import { isPublicHttpUrl } from "../_shared/safe-fetch.ts";
import { AGENCY_CACHE_DAYS, AGENCY_CHECK_VERSION, AGENCY_FAILED_CACHE_DAYS } from "../../../src/lib/agencyDetect.ts";
import { agencyCheckDomain, isCheckFresh } from "../../../src/lib/agencyCheck.ts";

const BUILD_ID = "agency-check-2026-10-01a";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json", "x-build": BUILD_ID } });
const COLUMNS = "domain, website, classification, confidence, agency, agency_domain, evidence, platform, status, failure_reason, pages_checked, requests, duration_ms, version, checked_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const website = typeof body.website === "string" ? body.website.trim() : "";
    const domain = agencyCheckDomain(website);
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    if (!domain || !isPublicHttpUrl(url)) return json({ ok: false, error: "not_a_website", detail: "That is not a website address we can check." }, 400);

    const { data: cached } = await service.from("website_agency_checks").select(COLUMNS).eq("domain", domain).maybeSingle();
    if (cached && isCheckFresh(cached, Date.now()) && body.force !== true) return json({ ok: true, cached: true, check: cached });

    const guard = await guardAction(service, who.actor.id, "site_scrape", { fn: "agency-check", role: who.actor.role });
    if (!guard.ok) return json(guard.body, guard.status);

    const r = await crawlForAgency(url);
    const v = r.verdict;
    const row = {
      domain, website: url, classification: v.classification, confidence: v.confidence, agency: v.agency, agency_domain: v.agencyDomain,
      evidence: v.evidence, platform: v.platform, status: v.failure ? "failed" : "ok", failure_reason: v.failure,
      pages_checked: r.stats.pagesFetched, requests: r.stats.requests, duration_ms: r.stats.durationMs, version: AGENCY_CHECK_VERSION,
      checked_at: new Date().toISOString(),
    };
    const { error } = await service.from("website_agency_checks").upsert(row, { onConflict: "domain" });
    if (error) console.error("[agency-check] save failed", error.message);
    return json({ ok: true, cached: false, check: row, cacheDays: v.failure ? AGENCY_FAILED_CACHE_DAYS : AGENCY_CACHE_DAYS });
  } catch (e) {
    console.error("[agency-check]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: "check_failed", detail: "The check could not run. Try again." }, 500);
  }
});
