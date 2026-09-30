// social-profiles — Find socials, and a person's add / confirm / "not them" (2026-09-30,
// docs/social-profiles.md). Admin and Sales, on a lead they may work (leadAccess). FREE: our records
// first, then the lead's own website (_shared/social-find.ts). The paid lookup stays admin-only in
// enrich-business; nothing here spends money.
//
// ACTIONS (POST { action, lead_id, … }):
//   find     — records → own website → graded → saved; returns the rows + a per-platform summary
//   add      — a pasted link: cleaned by the one rule, saved as confirmed by that person (manual)
//   confirm  — { profile_id }: a person says this is them → confirmed, preferred over every guess
//   reject   — { profile_id }: "Not them" → rejected for good (a later find never re-activates it)
// ⛔ Writes go ONLY to lead_social_profiles (+ lead_activity for History). The lead's columns are the
//    database's (_social_profiles_sync trigger). Email is never touched.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isUpstreamOutage } from "../_shared/operator-auth.ts";
import { leadAccess, refusalBody, resolveActor } from "../_shared/access.ts";
import { guardAction } from "../_shared/protection.ts";
import { findSocials, logCanonicalChanges, readRows, SOCIAL_LEAD_COLUMNS, type SocialLead } from "../_shared/social-find.ts";
import { normaliseSocialUrl, socialOutcomes, socialOutcomeSentence, socialPlatformLabel, SOCIAL_REJECT_TEXT } from "../../../src/lib/socialProfiles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// deno-lint-ignore no-explicit-any
type Service = any;

async function answer(service: Service, leadId: string, extra: Record<string, unknown> = {}) {
  const rows = await readRows(service, leadId);
  const outcomes = socialOutcomes(rows);
  return json({ ok: true, rows, outcomes, summary: socialOutcomeSentence(outcomes), ...extra });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const actor = who.actor;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action) || "find";
    const leadId = text(body.lead_id);
    if (!leadId) return json({ ok: false, error: "lead_id_required", detail: "No lead given." }, 400);
    /* ⛔ ROLE + LEAD ACCESS: admin on the book's leads; sales only on a lead assigned to them, not a client. */
    const access = await leadAccess(service, actor, leadId);
    if (!access.ok) {
      if (access.error === "lookup_failed") return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503);
      return json({ ok: false, error: "lead_not_found", detail: "That lead is not one you work." }, 404);
    }
    const { data: leadRow, error: leadErr } = await service.from("outreach_leads").select(SOCIAL_LEAD_COLUMNS).eq("id", leadId).maybeSingle();
    if (leadErr) throw leadErr;
    const lead = leadRow as SocialLead | null;
    if (!lead) return json({ ok: false, error: "lead_not_found", detail: "That lead is not one you work." }, 404);

    if (action === "list") return await answer(service, leadId);

    if (action === "find") {
      /* ⛔ USAGE GUARD: free, but it fetches another business's website — suspension + the per-hour window. */
      const guard = await guardAction(service, actor.id, "site_scrape", { fn: "social-profiles", leadId, role: actor.role });
      if (!guard.ok) return json(guard.body, guard.status);
      const r = await findSocials(service, lead, actor.id);
      const outcomes = socialOutcomes(r.rows);
      const siteNote = !lead.website ? "No website on this lead, so only our records were checked."
        : r.site === null ? (outcomes.every((o) => o.state === "confirmed" || o.platform === "linkedin") ? "" : "Their website on record is a profile page, not their own site.")
        : !r.site.reachable ? "Their website did not answer — only our records were checked. Try again later." : "";
      return json({ ok: true, rows: r.rows, outcomes, summary: socialOutcomeSentence(outcomes), added: r.added, checked: r.used, site_note: siteNote || null });
    }

    if (action === "add") {
      const n = normaliseSocialUrl(text(body.url));
      if (!n.ok) return json({ ok: false, error: "bad_link", detail: SOCIAL_REJECT_TEXT[n.reason] });
      const before = await readRows(service, leadId);
      const now = new Date().toISOString();
      const { data: ex } = await service.from("lead_social_profiles").select("id").eq("lead_id", leadId).eq("platform", n.platform).eq("url_key", n.urlKey).maybeSingle();
      const patch = { confidence: "confirmed", state: "active", confirmed_by: actor.id, confirmed_at: now, rejected_by: null, rejected_at: null, reject_reason: null };
      const res = ex
        ? await service.from("lead_social_profiles").update(patch).eq("id", ex.id)
        : await service.from("lead_social_profiles").insert({ lead_id: leadId, user_id: lead.user_id, platform: n.platform, url: n.url, url_key: n.urlKey, handle: n.handle, source: "manual", evidence: { why: "added by a person" }, added_by: actor.id, ...patch });
      if (res.error) throw res.error;
      await logCanonicalChanges(service, leadId, actor.id, before, await readRows(service, leadId));
      return await answer(service, leadId, { saved: socialPlatformLabel(n.platform) });
    }

    if (action === "confirm" || action === "reject") {
      const profileId = text(body.profile_id);
      const { data: row } = await service.from("lead_social_profiles").select("id, platform, url").eq("id", profileId).eq("lead_id", leadId).maybeSingle();
      if (!row) return json({ ok: false, error: "profile_not_found", detail: "That profile is no longer on this lead." }, 404);
      const before = await readRows(service, leadId);
      const now = new Date().toISOString();
      const patch = action === "confirm"
        ? { confidence: "confirmed", state: "active", confirmed_by: actor.id, confirmed_at: now, rejected_by: null, rejected_at: null, reject_reason: null }
        : { state: "rejected", rejected_by: actor.id, rejected_at: now, reject_reason: "not_them", confirmed_by: null, confirmed_at: null };
      const { error } = await service.from("lead_social_profiles").update(patch).eq("id", row.id);
      if (error) throw error;
      if (action === "reject") await service.from("lead_activity").insert({ lead_id: leadId, actor_user_id: actor.id, kind: "details_set", data: { social: `${socialPlatformLabel(row.platform)} marked not them: ${row.url}` } });
      await logCanonicalChanges(service, leadId, actor.id, before, await readRows(service, leadId));
      return await answer(service, leadId);
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const message = String((e as { message?: unknown })?.message ?? e);
    console.error("[social-profiles] error:", message);
    if (isUpstreamOutage(e)) return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503);
    return json({ ok: false, error: "internal", detail: message.slice(0, 300) }, 500);
  }
});
