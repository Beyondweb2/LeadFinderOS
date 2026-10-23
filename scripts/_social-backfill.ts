// ONE-OFF (not committed — scripts/_*.ts): grade the social links our crawls already hold, through the
// SAME finder the edge function runs (records only: no website fetch, no spend). Usage:
//   SUPABASE_URL=… SERVICE_JWT=… npx tsx scripts/_social-backfill.ts [--dry]
import { createClient } from "@supabase/supabase-js";
import { findSocials, candidatesFromRecords, businessOf, SOCIAL_LEAD_COLUMNS, type SocialLead } from "../supabase/functions/_shared/social-find.ts";
import { gradeSocialCandidates, socialOutcomes } from "../src/lib/socialProfiles.ts";

const dry = process.argv.includes("--dry");
const service = createClient(process.env.SUPABASE_URL!, process.env.SERVICE_JWT!, { auth: { persistSession: false } });

async function leadIdsWithCrawlSocials(): Promise<string[]> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("lead_crawl_checks").select("id, lead_id, result").order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) if (r.lead_id && Array.isArray(r.result?.siteInfo?.socialLinks) && r.result.siteInfo.socialLinks.length) ids.add(r.lead_id);
    if (!data || data.length < 1000) break;
  }
  for (let from = 0; ; from += 500) {
    const { data, error } = await service.from("ai_audit_runs").select("id, audit_id, results_crawl_check").not("results_crawl_check", "is", null).order("id").range(from, from + 499);
    if (error) throw error;
    const auditIds = (data ?? []).filter((r) => Array.isArray(r.results_crawl_check?.siteInfo?.socialLinks) && r.results_crawl_check.siteInfo.socialLinks.length).map((r) => r.audit_id);
    if (auditIds.length) {
      const { data: a } = await service.from("ai_audits").select("lead_id").in("id", [...new Set(auditIds)]);
      for (const x of a ?? []) if (x.lead_id) ids.add(x.lead_id);
    }
    if (!data || data.length < 500) break;
  }
  return [...ids];
}

const ids = await leadIdsWithCrawlSocials();
console.log(`${ids.length} leads have crawled social links`);
const tally: Record<string, number> = {};
let rejected = 0;
for (const id of ids) {
  const { data: lead } = await service.from("outreach_leads").select(SOCIAL_LEAD_COLUMNS).eq("id", id).maybeSingle();
  if (!lead) continue;
  if (dry) {
    const rec = await candidatesFromRecords(service, lead as SocialLead);
    const g = gradeSocialCandidates(rec.candidates, businessOf(lead as SocialLead));
    rejected += g.rejected.length;
    for (const x of g.graded) tally[`${x.platform}:${x.confidence}`] = (tally[`${x.platform}:${x.confidence}`] ?? 0) + 1;
    continue;
  }
  const r = await findSocials(service, lead as SocialLead, null, { site: false });
  for (const o of socialOutcomes(r.rows)) tally[`${o.platform}:${o.state}`] = (tally[`${o.platform}:${o.state}`] ?? 0) + 1;
  rejected += r.rejected;
}
console.log(dry ? "DRY RUN (graded candidates):" : "SAVED (per lead, per platform):", tally, "rejected links:", rejected);
