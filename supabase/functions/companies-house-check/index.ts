// companies-house-check — HOW OLD IS THIS BUSINESS? (2026-10-02, docs/companies-house-age.md). Admin and Sales.
// POST { placeId, name, address } → the stored match for that Google place if it is fresh and the listing
// has not changed, else a Companies House lookup (_shared/companies-house.ts) and the pure match
// (src/lib/companiesHouse.ts), saved to companies_house_checks. Free: no AI, nothing paid — Companies
// House's public data API with the COMPANIES_HOUSE_API_KEY secret; counted against the free
// "site_scrape" guard. Find Leads calls it ONLY for UK results with no website, CH_CONCURRENCY at a time.
// Designed refusals answer 200 + ok:false with a reason: not_configured / rate_limited / unavailable /
// not_uk / bad_request. A failed lookup is never stored — it is tried again next time.
// ⛔ Writes ONLY companies_house_checks. Never a lead: the machine's match is not a confirmed fact.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import { guardAction } from "../_shared/protection.ts";
import { lookUpCompany } from "../_shared/companies-house.ts";
import { CH_CHECK_VERSION, cacheDaysFor, isChCheckFresh, isUkAddress, listingFingerprint } from "../../../src/lib/companiesHouse.ts";

const BUILD_ID = "companies-house-check-2026-10-02a";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json", "x-build": BUILD_ID } });
const COLUMNS = "place_id, fingerprint, business_name, postcode, town, match, company_number, company_name, company_status, company_type, incorporated_on, registered_locality, registered_postcode, evidence, candidates_seen, requests, duration_ms, version, checked_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    const address = typeof body.address === "string" ? body.address.trim().slice(0, 300) : "";
    if (!placeId || placeId.length > 300 || !name) return json({ ok: false, error: "bad_request", detail: "A place id and a business name are needed." });
    if (!isUkAddress(address)) return json({ ok: false, error: "not_uk", detail: "Companies House covers UK companies only." });
    const fingerprint = listingFingerprint(name, address);

    const { data: cached } = await service.from("companies_house_checks").select(COLUMNS).eq("place_id", placeId).maybeSingle();
    if (cached && isChCheckFresh(cached, fingerprint, Date.now()) && body.force !== true) return json({ ok: true, cached: true, check: cached });

    const apiKey = Deno.env.get("COMPANIES_HOUSE_API_KEY");
    if (!apiKey?.trim()) return json({ ok: false, error: "not_configured", detail: "Companies House is not connected yet." });

    const guard = await guardAction(service, who.actor.id, "site_scrape", { fn: "companies-house-check", role: who.actor.role });
    if (!guard.ok) return json(guard.body, guard.status);

    const r = await lookUpCompany({ name, address }, { apiKey });
    if (!r.ok) return json({ ok: false, error: r.error, detail: r.detail, requests: r.requests });
    const v = r.verdict;
    const c = v.match === "none" ? null : v.candidate;
    const row = {
      place_id: placeId, fingerprint, business_name: name, postcode: r.listing.postcode, town: r.listing.town,
      match: v.match, company_number: c?.number ?? null, company_name: c?.name ?? null, company_status: c?.status ?? null,
      company_type: c?.type ?? null, incorporated_on: c?.incorporatedOn ?? null, registered_locality: c?.officeLocality ?? null,
      registered_postcode: c?.officePostcode ?? null, evidence: v.evidence, candidates_seen: v.candidatesSeen,
      requests: r.requests, duration_ms: r.durationMs, version: CH_CHECK_VERSION, checked_at: new Date().toISOString(),
    };
    const { error } = await service.from("companies_house_checks").upsert(row, { onConflict: "place_id" });
    if (error) console.error("[companies-house-check] save failed", error.message);
    return json({ ok: true, cached: false, check: row, cacheDays: cacheDaysFor(v.match) });
  } catch (e) {
    console.error("[companies-house-check]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: "unavailable", detail: "The check could not run. Try again." });
  }
});
