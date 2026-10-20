/* ══ THE WEBSITE CHECK NAMES THE SAME TOWN AS THE AUDIT QUESTION (2026-10-20, fix/coverage-town-strict) ══════════════
   The crawl's "<town> is not mentioned on the site" read Google's post town ("London") while the question asked about
   the Coverage town or the finer area. One answer for both: the town the lead's newest audit ASKED (ai_audits.location_text);
   with no audit yet, the town an audit would ask (src/lib/inTown.ts leadQuestionTown: Coverage town → Google's town
   unless broad → the postcode's area). Never throws: null = the caller's own fallback. */
import { leadQuestionTown, type LeadTownRow } from "../../../src/lib/inTown.ts";

// deno-lint-ignore no-explicit-any -- loose-typed to avoid supabase-js generic 'never' friction
export async function questionTownForLead(service: any, leadId: string | null | undefined): Promise<string | null> {
  if (!leadId) return null;
  try {
    const [a, l] = await Promise.all([
      service.from("ai_audits").select("location_text").eq("lead_id", leadId).not("location_text", "is", null)
        .order("created_at", { ascending: false }).limit(1),
      service.from("outreach_leads").select("coverage_town, derived_town, search_location, address, country").eq("id", leadId).maybeSingle(),
    ]);
    const asked = String((a?.data as Array<{ location_text?: string | null }> | null)?.[0]?.location_text ?? "").trim();
    if (asked) return asked;
    return leadQuestionTown((l?.data ?? {}) as LeadTownRow).town;
  } catch (e) {
    console.warn("[question-town] lookup failed:", (e as Error).message);
    return null;
  }
}
