/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT CRAWL POLICY — how much of a prospect's site a user-pressed crawl reads, and when a saved
   crawl is reused instead of crawling again (2026-10-05, branch improve/prospect-full-crawl-audit-results;
   docs/pre-sales-certification/prospect-full-crawl-audit-results.md).

   TWO KINDS OF USER-PRESSED CRAWL, ONE ENGINE (src/lib/fullCrawl.ts, _shared/crawl-job.ts):
     · a PAYING CLIENT's crawl (the lead is a client, or it was started from Paid Clients / Website
       Build) stays EXHAUSTIVE — no page limit (Paul, 2026-09-23; docs/exhaustive-crawl.md);
     · a PROSPECT's crawl (everything else: Outreach, Inbox, the lead popup, a salesperson) reads at
       most PROSPECT_CRAWL_PAGE_CAP pages. Sitemaps are still read in full, so the crawl KNOWS how big
       the site is; every address it found and did not read is recorded (skip reason coverage_cap) and
       the result says "capped" everywhere it is shown. ⛔ A capped crawl is never "the full site".
   ⛔ EXHAUSTIVE IS THE POSITIVE MATCH. An absent or unknown source on a non-client lead is a prospect —
   on a fetch path that runs for minutes, absent means the bounded one.

   REUSE: a prospect's saved crawl is reused for PROSPECT_CRAWL_REUSE_MS — a second press inside that
   window opens the saved result (labelled "saved") instead of crawling the site again. A salesperson
   may force a fresh crawl once the saved one is older than PROSPECT_CRAWL_MIN_GAP_MS; an admin any
   time. A failed crawl is never reused.

   ⛔ NO AI, NO AUDIT QUOTA. A crawl costs fetches only; nothing here touches the sales_check allowance,
   the audit budget pools or guard_action.

   IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { sameSite } from './crawlUrl.ts';

/** Pages a prospect crawl reads before it stops and records the rest as not crawled. */
export const PROSPECT_CRAWL_PAGE_CAP = 500;
/** A saved prospect crawl younger than this is reused rather than crawled again. */
export const PROSPECT_CRAWL_REUSE_MS = 7 * 86_400_000;
/** A salesperson may force a fresh crawl only once the saved one is at least this old. */
export const PROSPECT_CRAWL_MIN_GAP_MS = 86_400_000;

/** Request sources that are paying-client work (exhaustive). */
const CLIENT_SOURCES = new Set(['paid_client', 'website_build']);

/** The page limit for a user-pressed crawl: null = exhaustive (client work), else the prospect cap. */
export function crawlPageCapFor(input: { isClient: boolean; requestedFrom: string | null | undefined }): number | null {
  if (input.isClient === true) return null;
  if (typeof input.requestedFrom === 'string' && CLIENT_SOURCES.has(input.requestedFrom)) return null;
  return PROSPECT_CRAWL_PAGE_CAP;
}

export interface SavedCrawlRow {
  url?: string | null;
  created_at?: string | null;
  mode?: string | null;
  job_id?: string | null;
  full_evidence?: { version?: number; completeness?: string | null } | null;
  result?: { signals?: { fetchFailed?: boolean } | null } | null;
}

export type ReuseDecision =
  | { reuse: true; ageMs: number; jobId: string | null; crawledAt: string }
  | { reuse: false; reason: 'none' | 'not_full' | 'failed' | 'stale' | 'other_site' | 'forced' };

/** Whether a press of "Crawl site" should open the saved crawl instead of starting a new one. Pure. */
export function prospectCrawlReuse(row: SavedCrawlRow | null | undefined, opts: {
  nowMs: number; websiteUrl: string; force: boolean; role: 'admin' | 'sales' | string | null;
}): ReuseDecision {
  if (!row || !row.created_at) return { reuse: false, reason: 'none' };
  const full = row.mode === 'full' ? row.full_evidence ?? null : null;
  if (!full || Number(full.version ?? 0) < 2) return { reuse: false, reason: 'not_full' };
  if (full.completeness === 'failed' || row.result?.signals?.fetchFailed === true) return { reuse: false, reason: 'failed' };
  const t = Date.parse(row.created_at);
  if (!Number.isFinite(t)) return { reuse: false, reason: 'none' };
  const ageMs = Math.max(0, opts.nowMs - t);
  if (ageMs >= PROSPECT_CRAWL_REUSE_MS) return { reuse: false, reason: 'stale' };
  const savedUrl = String(row.url ?? '');
  const site = /^https?:\/\//i.test(opts.websiteUrl) ? opts.websiteUrl : `https://${opts.websiteUrl}`;
  if (!savedUrl || !sameSite(savedUrl, site)) return { reuse: false, reason: 'other_site' };
  if (opts.force && (opts.role === 'admin' || ageMs >= PROSPECT_CRAWL_MIN_GAP_MS)) return { reuse: false, reason: 'forced' };
  return { reuse: true, ageMs, jobId: row.job_id ?? null, crawledAt: row.created_at };
}

/** Whether the person on screen may press "Re-crawl now" on a saved crawl of this age. */
export function mayForceRecrawl(role: string | null | undefined, ageMs: number): boolean {
  return role === 'admin' || ageMs >= PROSPECT_CRAWL_MIN_GAP_MS;
}
