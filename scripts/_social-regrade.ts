// ONE-OFF (not committed): re-grade ONLY the rows the 2026-09-30 backfill wrote (added_by null, never
// confirmed or rejected by a person, not legacy / manual) under the tightened rule. Lowers or rejects
// where the rule now says so; a person's row is never touched.
import { createClient } from "@supabase/supabase-js";
import { candidatesFromRecords, businessOf, sharedCounts, SOCIAL_LEAD_COLUMNS, type SocialLead } from "../supabase/functions/_shared/social-find.ts";
import { gradeSocialCandidates, normaliseSocialUrl } from "../src/lib/socialProfiles.ts";

const service = createClient(process.env.SUPABASE_URL!, process.env.SERVICE_JWT!, { auth: { persistSession: false } });
const { data: rows, error } = await service.from("lead_social_profiles")
  .select("id, lead_id, url, url_key, confidence, state")
  .is("added_by", null).is("confirmed_by", null).is("rejected_by", null).eq("state", "active")
  .in("source", ["website", "website_schema", "web_search", "google_listing", "same_business"])
  .gte("created_at", "2026-09-30T00:00:00Z").order("id");
if (error) throw error;
const byLead = new Map<string, typeof rows>();
for (const r of rows ?? []) (byLead.get(r.lead_id) ?? byLead.set(r.lead_id, []).get(r.lead_id)!).push(r);
const tally: Record<string, number> = {};
for (const [leadId, list] of byLead) {
  const { data: lead } = await service.from("outreach_leads").select(SOCIAL_LEAD_COLUMNS).eq("id", leadId).maybeSingle();
  if (!lead) continue;
  const rec = await candidatesFromRecords(service, lead as SocialLead);
  const keys = rec.candidates.map((c) => normaliseSocialUrl(c.url)).flatMap((n) => (n.ok ? [n.urlKey] : []));
  const shared = await sharedCounts(service, leadId, rec.sameBusinessIds, [...new Set(keys)]);
  const g = gradeSocialCandidates(rec.candidates, businessOf(lead as SocialLead), shared);
  for (const r of list) {
    const now = g.graded.find((x) => x.urlKey === r.url_key);
    if (!now) {
      const n = normaliseSocialUrl(r.url);
      if (n.ok === false) {
        await service.from("lead_social_profiles").update({ state: "rejected", rejected_at: new Date().toISOString(), reject_reason: "rule_tightened" }).eq("id", r.id);
        tally[`rejected`] = (tally.rejected ?? 0) + 1;
      }
      continue;
    }
    if (now.confidence !== r.confidence) {
      await service.from("lead_social_profiles").update({ confidence: now.confidence, source: now.source, evidence: now.evidence }).eq("id", r.id);
      tally[`${r.confidence}→${now.confidence}`] = (tally[`${r.confidence}→${now.confidence}`] ?? 0) + 1;
    }
  }
}
console.log("re-graded", rows?.length, "rows:", tally);
