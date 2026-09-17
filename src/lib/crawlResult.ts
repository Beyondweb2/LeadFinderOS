/* The stored shape of lead_crawl_checks.result — the SPA-side type shared by useInbox, useOutreach
   and the Crawl-site popup. Kept out of crawlCheck.ts (which the edge functions import) so pulling
   the SiteInfo type in never widens an edge closure. The two halves stay separate here exactly as
   they are stored: `signals` is the AI-visibility faults (gates audit_followup_fault); `siteInfo` is
   the reading material. */
import type { CrawlSignals, CrawlVerdict } from './crawlCheck';
import type { SiteInfo } from './siteInfo';

export interface CrawlStoredResult {
  version?: number;
  siteInfoVersion?: number;
  url?: string;
  town?: string | null;
  signals?: CrawlSignals;
  verdict?: CrawlVerdict;
  siteInfo?: SiteInfo | null;
}

export interface CrawlRow {
  result: CrawlStoredResult | null;
  created_at: string;
}
