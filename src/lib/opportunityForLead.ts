/* The opportunity score for a list row (Outreach / Find Leads): reads the lead's ONE website check through the same
   readers every team screen uses (websiteCheckFor, siteScoreViewFor), then the pure rule in opportunityScore.ts.
   Team only (docs/OPPORTUNITY_SCORE.md). */
import { websiteCheckFor } from './websiteCheck.ts';
import { siteScoreViewFor } from './siteScore.ts';
import { opportunityScore, oppWebsiteFacts, type OppLeadFacts, type OppResult } from './opportunityScore.ts';
import type { CrawlRow } from './crawlResult.ts';
import { oppWinnableOf, recheckAiFacts } from './auditVerdictCounts.ts';
import type { OppAuditInput } from './oppAuditInputs.ts';

export function opportunityForLead(lead: OppLeadFacts, crawl: CrawlRow | null | undefined, audit: OppAuditInput | null | undefined): OppResult {
  const hasRow = !!crawl;
  const view = hasRow ? websiteCheckFor(crawl, { website: lead.website, audience: 'team' }) : null;
  const siteView = siteScoreViewFor(lead.website, crawl?.siteScore ?? null);
  const site = oppWebsiteFacts(view, siteView);
  /* A prospect re-check that replaced the hook (oppAuditInputs.oppAuditByLead) supplies the whole AI part. */
  if (audit?.recheck) {
    const r = recheckAiFacts(audit.recheck);
    return opportunityScore(lead, site, { score: null, updating: r.updating, v3: r.v3, recheckShare: r.share });
  }
  return opportunityScore(lead, site, audit ? { score: audit.score ?? null, updating: audit.updating ?? false, v3: oppWinnableOf(audit.verdicts) } : null);
}
