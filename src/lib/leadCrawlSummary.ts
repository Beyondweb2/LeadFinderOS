/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LEAD'S LATEST CRAWL, IN ONE LINE — what every screen shows about lead_crawl_checks.

   ⛔ ONE ROW, EVERY SCREEN. lead_crawl_checks holds one row per lead (unique lead_id); every manual
   Crawl site / Re-crawl site button writes it, whatever screen it sits on, and every screen reads it
   through this summary. There is no screen-specific copy anywhere.
   ⛔ NEVER CALL A SHALLOW CRAWL "FULL". `mode` is read off the row; a row written before the full
   profile existed, or by an automated audit crawl, is `standard` and is labelled as such with its
   real page count.

   IMPORTED BY AN EDGE FUNCTION (paid-client-hub): relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { FullCrawlEvidence } from './fullCrawl.ts';

export type CrawlStatus = 'none' | 'complete' | 'partial' | 'failed';

export interface LeadCrawlRowLike {
  url?: string | null;
  created_at?: string | null;
  mode?: string | null;
  requested_from?: string | null;
  result?: {
    checked_at?: string | null;
    url?: string | null;
    signals?: { fetchFailed?: boolean; pagesChecked?: number | null; checkedPages?: Array<{ url: string; kind?: string; readable?: boolean }> } | null;
    siteInfo?: { services?: string[]; towns?: string[]; email?: string | null; phone?: string | null; address?: string | null } | null;
  } | null;
  full_evidence?: Partial<FullCrawlEvidence> | null;
}

export interface LeadCrawlSummary {
  status: CrawlStatus;
  mode: 'full' | 'standard' | null;
  crawledAt: string | null;
  url: string | null;
  servedUrl: string | null;
  requestedFrom: string | null;
  pagesDiscovered: number | null;
  pagesFetched: number | null;
  sitemapsRead: number | null;
  warnings: string[];
  counts: { services: number; towns: number; credentials: number; technical: number; profiles: number };
  /** A sentence for the status line. */
  label: string;
}

const EMPTY: LeadCrawlSummary = {
  status: 'none', mode: null, crawledAt: null, url: null, servedUrl: null, requestedFrom: null,
  pagesDiscovered: null, pagesFetched: null, sitemapsRead: null, warnings: [],
  counts: { services: 0, towns: 0, credentials: 0, technical: 0, profiles: 0 },
  label: 'Not crawled yet',
};

export function summariseLeadCrawl(row: LeadCrawlRowLike | null | undefined): LeadCrawlSummary {
  if (!row || (!row.result && !row.full_evidence)) return EMPTY;
  const r = row.result ?? {};
  const full = row.mode === 'full' ? (row.full_evidence ?? null) : null;
  const mode: 'full' | 'standard' = full ? 'full' : 'standard';
  const crawledAt = r.checked_at || row.created_at || null;
  const fetchFailed = r.signals?.fetchFailed === true;
  const status: CrawlStatus = fetchFailed ? 'failed'
    : full ? (full.completeness === 'failed' ? 'failed' : full.completeness === 'partial' ? 'partial' : 'complete')
    : 'complete';
  const pagesFetched = full?.stats?.pagesFetched ?? (typeof r.signals?.pagesChecked === 'number' ? r.signals.pagesChecked : null);
  const pagesDiscovered = full?.stats?.urlsDiscovered ?? null;
  const counts = {
    services: r.siteInfo?.services?.length ?? 0,
    towns: r.siteInfo?.towns?.length ?? 0,
    credentials: full?.business?.credentials?.length ?? 0,
    technical: full?.technical?.length ?? 0,
    profiles: full?.business?.profiles?.length ?? 0,
  };
  const when = crawledAt ? new Date(crawledAt) : null;
  const whenText = when && Number.isFinite(when.getTime())
    ? when.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'unknown time';
  const pagesText = pagesFetched != null
    ? `${pagesFetched} page${pagesFetched === 1 ? '' : 's'} read${pagesDiscovered != null ? ` of ${pagesDiscovered} found` : ''}`
    : 'pages not recorded';
  const kind = mode === 'full' ? 'Full crawl' : 'Quick crawl (automatic profile, up to 12 pages)';
  const statusText = status === 'failed' ? 'could not read the site' : status === 'partial' ? 'partial' : 'complete';
  return {
    status, mode, crawledAt, url: row.url || r.url || null, servedUrl: full?.servedUrl ?? null,
    requestedFrom: row.requested_from ?? null, pagesDiscovered, pagesFetched,
    sitemapsRead: full?.sitemaps?.read?.length ?? null,
    warnings: [...(full?.warnings ?? [])],
    counts,
    label: `${kind} · ${statusText} · ${pagesText} · ${whenText}`,
  };
}

/** The URLs a rebuild must account for: every page the full crawl DISCOVERED (fetched or not), else
 *  the pages the quick crawl checked. Old URLs are what redirects are written from. */
export function crawlOldUrls(row: LeadCrawlRowLike | null | undefined): Array<{ url: string; kind?: string }> {
  const full = row?.mode === 'full' ? row.full_evidence : null;
  if (full && (full.pages?.length || full.discoveredUrls?.length)) {
    const byUrl = new Map<string, { url: string; kind?: string }>();
    for (const p of full.pages ?? []) if (p.status > 0 && p.status < 400) byUrl.set(p.finalUrl || p.url, { url: p.finalUrl || p.url, kind: p.family === 'homepage' ? undefined : p.family });
    for (const u of full.discoveredUrls ?? []) if (!byUrl.has(u)) byUrl.set(u, { url: u });
    return [...byUrl.values()];
  }
  return (row?.result?.signals?.checkedPages ?? []).map((p) => ({ url: p.url, kind: p.kind }));
}

/** The columns every reader selects for the summary — never `*`. */
export const LEAD_CRAWL_SUMMARY_COLUMNS = 'url,created_at,mode,requested_from,result,full_evidence';
