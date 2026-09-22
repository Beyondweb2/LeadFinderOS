/* The stored shape of lead_crawl_checks.result — the SPA-side type shared by useInbox, useOutreach
   and the Crawl-site popup. Kept out of crawlCheck.ts (which the edge functions import) so pulling
   the SiteInfo type in never widens an edge closure. The two halves stay separate here exactly as
   they are stored: `signals` is the AI-visibility faults (gates audit_followup_fault); `siteInfo` is
   the reading material; `evidence` is the deep sales crawl's own findings. THREE halves now, each
   with its own version, and the separation is the point — see SITE_EVIDENCE_VERSION. */
import type { CrawlSignals, CrawlVerdict } from './crawlCheck';
import type { SiteInfo } from './siteInfo';
import type { SiteEvidence } from './siteEvidence';

export interface CrawlStoredResult {
  version?: number;
  siteInfoVersion?: number;
  checked_at?: string;
  url?: string;
  town?: string | null;
  signals?: CrawlSignals;
  verdict?: CrawlVerdict;
  siteInfo?: SiteInfo | null;
  /** Deep-crawl Phase 1 findings. ABSENT on every row written before 2026-09-22 and on any crawl run
   *  with `deep: false`; readers must treat absent as "nothing found here", never as an error. */
  evidence?: SiteEvidence | null;
  evidenceVersion?: number;
}

export interface CrawlRow {
  result: CrawlStoredResult | null;
  created_at: string;
}
