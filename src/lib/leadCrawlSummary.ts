/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LEAD'S LATEST CRAWL, IN ONE LINE — what every screen shows about lead_crawl_checks and the
   lead's newest crawl job.

   ⛔ ONE ROW, EVERY SCREEN. lead_crawl_checks holds one row per lead; the exhaustive job writes it when
   the frontier is exhausted, whatever screen started it.
   ⛔ NEVER CALL A CAPPED CRAWL "FULL". The label is read off the row: an exhaustive job (evidence
   version ≥ 2) says Full crawl; the 60-page crawl of earlier on 2026-09-23 (version 1) says it was
   capped; an automated standard crawl says Quick crawl.

   IMPORTED BY AN EDGE FUNCTION (paid-client-hub): relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { FullCrawlEvidence } from './fullCrawl.ts';
import { progressLabel, type JobCounts, type JobStatus } from './crawlJob.ts';

export type CrawlStatus = 'none' | 'crawling' | 'complete' | 'complete_with_failures' | 'partial' | 'failed';

export const CRAWL_STATUS_LABELS: Record<CrawlStatus, string> = {
  none: 'Not crawled', crawling: 'Crawling', complete: 'Complete', complete_with_failures: 'Complete with failures',
  partial: 'Partial (capped)', failed: 'Failed',
};

export interface LeadCrawlRowLike {
  url?: string | null;
  created_at?: string | null;
  mode?: string | null;
  requested_from?: string | null;
  job_id?: string | null;
  result?: {
    checked_at?: string | null;
    url?: string | null;
    signals?: { fetchFailed?: boolean; pagesChecked?: number | null; checkedPages?: Array<{ url: string; kind?: string; readable?: boolean }> } | null;
    siteInfo?: { services?: string[]; towns?: string[]; email?: string | null; phone?: string | null; address?: string | null } | null;
  } | null;
  full_evidence?: (Partial<FullCrawlEvidence> & { stats?: Partial<FullCrawlEvidence['stats']> & Record<string, unknown> }) | null;
}

/** The lead's newest crawl job, as crawl-check `status` / paid-client-hub return it. */
export interface CrawlJobLike { id: string; status: JobStatus; started_at?: string | null; completed_at?: string | null; counts?: JobCounts | null; label?: string | null }

export interface LeadCrawlSummary {
  status: CrawlStatus;
  mode: 'full' | 'capped' | 'standard' | null;
  crawledAt: string | null;
  url: string | null;
  servedUrl: string | null;
  requestedFrom: string | null;
  pagesDiscovered: number | null;
  pagesFetched: number | null;
  pagesFailed: number | null;
  pagesSkipped: number | null;
  sitemapsRead: number | null;
  warnings: string[];
  counts: { services: number; towns: number; credentials: number; technical: number; profiles: number };
  /** The running job, when one is in progress (its progress, not the last result). */
  running: CrawlJobLike | null;
  jobId: string | null;
  label: string;
}

const EMPTY: LeadCrawlSummary = {
  status: 'none', mode: null, crawledAt: null, url: null, servedUrl: null, requestedFrom: null,
  pagesDiscovered: null, pagesFetched: null, pagesFailed: null, pagesSkipped: null, sitemapsRead: null, warnings: [],
  counts: { services: 0, towns: 0, credentials: 0, technical: 0, profiles: 0 }, running: null, jobId: null,
  label: 'Not crawled yet',
};

const when = (iso: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && Number.isFinite(d.getTime()) ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown time';
};

export function summariseLeadCrawl(row: LeadCrawlRowLike | null | undefined, job?: CrawlJobLike | null): LeadCrawlSummary {
  const running = job && job.status === 'running' ? job : null;
  const base = summariseRow(row);
  if (!running) return base;
  const counts = running.counts ?? null;
  return {
    ...base, status: 'crawling', running,
    label: counts ? progressLabel('running', counts) : 'Crawling…',
  };
}

function summariseRow(row: LeadCrawlRowLike | null | undefined): LeadCrawlSummary {
  if (!row || (!row.result && !row.full_evidence)) return EMPTY;
  const r = row.result ?? {};
  const full = row.mode === 'full' ? (row.full_evidence ?? null) : null;
  const exhaustive = !!full && Number(full.version ?? 1) >= 2;
  const mode: LeadCrawlSummary['mode'] = exhaustive ? 'full' : full ? 'capped' : 'standard';
  const crawledAt = r.checked_at || row.created_at || null;
  const fetchFailed = r.signals?.fetchFailed === true;
  const completeness = String(full?.completeness ?? '');
  const status: CrawlStatus = fetchFailed || completeness === 'failed' ? 'failed'
    : exhaustive ? (completeness === 'complete' ? 'complete' : 'complete_with_failures')
    : full ? 'partial'
    : 'complete';
  const st = (full?.stats ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const pagesFetched = num(st.pagesFetched) ?? num(r.signals?.pagesChecked);
  const pagesDiscovered = num(st.urlsDiscovered);
  const pagesFailed = exhaustive ? num(st.failed) : null;
  const pagesSkipped = exhaustive ? num(st.skipped) : null;
  const f = (n: number) => n.toLocaleString('en-GB');
  const pagesText = exhaustive
    ? `${f(pagesDiscovered ?? 0)} discovered · ${f(num(st.pagesOk) ?? 0)} fetched · ${f(pagesFailed ?? 0)} failed · ${f(pagesSkipped ?? 0)} skipped`
    : pagesFetched != null ? `${pagesFetched} page${pagesFetched === 1 ? '' : 's'} read${pagesDiscovered != null ? ` of ${f(pagesDiscovered)} found` : ''}` : 'pages not recorded';
  const kind = mode === 'full' ? 'Full crawl' : mode === 'capped' ? 'Capped crawl (old 60-page limit — not a full crawl)' : 'Quick crawl (automatic profile, up to 12 pages)';
  return {
    status, mode, crawledAt, url: row.url || r.url || null, servedUrl: (full?.servedUrl as string | undefined) ?? null,
    requestedFrom: row.requested_from ?? null, pagesDiscovered, pagesFetched, pagesFailed, pagesSkipped,
    sitemapsRead: exhaustive ? num((full?.sitemaps as { read?: unknown } | undefined)?.read) : null,
    warnings: [...((full?.warnings as string[] | undefined) ?? [])],
    counts: {
      services: r.siteInfo?.services?.length ?? 0, towns: r.siteInfo?.towns?.length ?? 0,
      credentials: full?.business?.credentials?.length ?? 0, technical: full?.technical?.length ?? 0, profiles: full?.business?.profiles?.length ?? 0,
    },
    running: null, jobId: row.job_id ?? full?.job_id ?? null,
    /* ⛔ NO TIME IN THE LABEL. paid-client-hub builds it on the server (UTC) while the card renders
       crawledAt in the viewer's own time zone beside it — two clocks on one card (seen on BS4,
       2026-09-23: "10:32" under "17:32"). The card owns the time. */
    label: `${kind} · ${CRAWL_STATUS_LABELS[status].toLowerCase()} · ${pagesText}`,
  };
}

/** Old URLs when no inventory is available (a quick crawl): the pages it checked. The exhaustive
 *  crawl's COMPLETE inventory is read page by page through paid-client-hub `crawl_inventory`. */
export function crawlOldUrls(row: LeadCrawlRowLike | null | undefined): Array<{ url: string; kind?: string }> {
  return (row?.result?.signals?.checkedPages ?? []).map((p) => ({ url: p.url, kind: p.kind }));
}

/** The columns every reader selects for the summary — never `*`. */
export const LEAD_CRAWL_SUMMARY_COLUMNS = 'url,created_at,mode,requested_from,job_id,result,full_evidence';
