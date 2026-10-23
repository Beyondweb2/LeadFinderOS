import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canWorkLead, isClientLead, refusalBody, resolveActor } from "../_shared/access.ts";
import { recordDenial } from "../_shared/protection.ts";
import { runLinkedInDiscovery } from "../_shared/linkedin-discovery.ts";

/* linkedin-discovery — who runs this business, and their likely public LinkedIn profile (2026-09-30).
 *
 * POST { lead_id, mode?: 'peek' | 'run', force?: bool, verify?: bool, person?: { name, role? } }
 *   peek  (DEFAULT) — the cached answer or nothing. ⛔ NEVER SPENDS: opening a view never spends.
 *   run   — free sources first, then at most MAX_SEARCHES_PER_RUN paid public searches, behind the
 *           spend gate. force / verify are ADMIN ONLY (a salesperson's are refused, not ignored).
 *   person — a decision maker the salesperson already knows; it changes the cache key.
 *
 * Returns { ok: true, result: LinkedInDiscoveryResult | null } or { ok: false, error, detail,
 * manual_search } — src/lib/linkedinDiscovery.ts is the contract.
 *
 * ⛔ DISCOVERY ONLY. No LinkedIn login, cookie or session exists on this path; nothing views, connects,
 *    follows or messages anyone. The salesperson opens the profile and makes contact by hand.
 * ⛔ Auth in the handler: an operator JWT and a team role (resolveActor). A salesperson may look up
 *    only a lead assigned to them that is not a client (canWorkLead + isClientLead), fail closed.
 * NOT CALLED BY ANY SCREEN YET — the Social Enrichment work integrates it
 * (docs/linkedin-decision-maker.md, "Integration").
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const actor = who.actor;
    if (actor.role !== "admin" && actor.role !== "sales") return json({ ok: false, error: "no_role" }, 403);

    const body = await req.json().catch(() => ({}));
    const leadId = typeof body?.lead_id === "string" ? body.lead_id.trim() : "";
    if (!UUID_RE.test(leadId)) return json({ ok: false, error: "bad_lead_id" }, 400);
    const mode = body?.mode === "run" ? "run" : "peek";
    const force = body?.force === true;
    const verify = body?.verify === true;
    if ((force || verify) && actor.role !== "admin") {
      await recordDenial(service, actor.id, "linkedin_discovery_admin_option", leadId);
      return json({ ok: false, error: "admin_only", detail: "Only the admin can re-run or verify a LinkedIn lookup." }, 403);
    }
    const personName = typeof body?.person?.name === "string" ? body.person.name.trim().slice(0, 80) : "";
    const personRole = typeof body?.person?.role === "string" ? body.person.role.trim().slice(0, 60) : null;

    const { data: lead, error } = await service.from("outreach_leads")
      .select("id, business_name, website, derived_town, search_location, country, contact_name, assigned_to_user_id, amount_paid, status")
      .eq("id", leadId).maybeSingle();
    if (error) return json({ ok: false, error: "lookup_failed", detail: "Could not read the lead — try again." }, 503);
    if (!lead) return json({ ok: false, error: "not_found" }, 404);
    if (actor.role === "sales" && (!canWorkLead(actor, lead) || isClientLead(lead))) {
      await recordDenial(service, actor.id, "linkedin_discovery", leadId);
      return json({ ok: false, error: "not_your_lead", detail: "This lead is not assigned to you." }, 403);
    }
    if (!String(lead.business_name ?? "").trim()) return json({ ok: false, error: "no_business_name" }, 422);

    const out = await runLinkedInDiscovery(service, {
      lead: {
        id: lead.id, business_name: String(lead.business_name).trim(), website: lead.website ?? null,
        town: (lead.derived_town ?? lead.search_location ?? null) || null, country: lead.country ?? null,
        contact_name: lead.contact_name ?? null,
      },
      actor: { id: actor.id, role: actor.role },
      mode, force, verify,
      manualPerson: personName ? { name: personName, role: personRole } : null,
    });
    if (out.ok) return json(out);
    const status = out.error === "in_progress" ? 409 : out.error === "store_error" ? 503 : 429;
    return json(out, status);
  } catch (e) {
    console.error("[linkedin-discovery] failed:", e instanceof Error ? e.message : String(e));
    try {
      const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
      await service.from("client_error_reports").insert({ error_id: "linkedin_discovery_failed", context: { message: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500) } });
    } catch { /* best-effort */ }
    return json({ ok: false, error: "internal", detail: "The LinkedIn lookup failed — try again." }, 500);
  }
});
