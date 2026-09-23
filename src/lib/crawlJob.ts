/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CRAWL JOB RULES — what a fetch result means for a URL's state, and what a job's counts mean.

   Every URL in crawl_urls ends in exactly one TERMINAL state: done, failed or skipped (with a
   reason). A job is finished only when no page or sitemap row is queued or processing — the frontier
   is exhausted. "Complete" never means "every page succeeded": failed pages are counted and named.

   IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { FULL_CRAWL } from './fullCrawl.ts';
import { sameSite, type SkipReason } from './crawlUrl.ts';

export type UrlState = 'queued' | 'processing' | 'done' | 'failed' | 'skipped';

export interface FetchOutcome {
  status: UrlState;
  skip_reason?: SkipReason;
  http_status: number | null;
  error?: string;
}

/** One fetch → the row's next state. A network failure or a "try later" status is retried until
 *  maxAttempts, then terminal; every other answer is terminal at once. Pure. */
export function decideFetchOutcome(r: {
  responded: boolean; status: number; contentType: string | null; attempts: number;
  source: string | null; finalUrl: string; servedUrl: string; error?: string | null;
}, maxAttempts = FULL_CRAWL.maxAttempts): FetchOutcome {
  if (!r.responded) {
    return r.attempts >= maxAttempts
      ? { status: 'failed', http_status: null, error: r.error || 'no response after retries' }
      : { status: 'queued', http_status: null, error: r.error || 'no response — will retry' };
  }
  if ([408, 425, 429, 500, 502, 503, 504].includes(r.status) && r.attempts < maxAttempts) {
    return { status: 'queued', http_status: r.status, error: `HTTP ${r.status} — will retry` };
  }
  if ((r.status === 404 || r.status === 410) && r.source === 'previous') {
    return { status: 'skipped', skip_reason: 'removed_since_last_crawl', http_status: r.status };
  }
  if (r.status >= 400) return { status: 'failed', http_status: r.status, error: `HTTP ${r.status}` };
  if (r.finalUrl && !sameSite(r.finalUrl, r.servedUrl)) return { status: 'skipped', skip_reason: 'off_site', http_status: r.status };
  const ct = (r.contentType || '').toLowerCase();
  if (ct && !/text\/html|application\/xhtml|text\/plain/.test(ct)) return { status: 'skipped', skip_reason: 'not_html', http_status: r.status };
  return { status: 'done', http_status: r.status };
}

export interface JobCounts {
  discovered: number; queued: number; processing: number; done: number; failed: number; skipped: number;
  sitemaps: number; sitemaps_pending: number;
}

export const EMPTY_COUNTS: JobCounts = { discovered: 0, queued: 0, processing: 0, done: 0, failed: 0, skipped: 0, sitemaps: 0, sitemaps_pending: 0 };

export function cleanCounts(raw: unknown): JobCounts {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = (k: keyof JobCounts) => { const v = Number(r[k]); return Number.isFinite(v) && v >= 0 ? v : 0; };
  return { discovered: n('discovered'), queued: n('queued'), processing: n('processing'), done: n('done'), failed: n('failed'), skipped: n('skipped'), sitemaps: n('sitemaps'), sitemaps_pending: n('sitemaps_pending') };
}

/** The frontier is exhausted: nothing (page or sitemap) is waiting or in flight. */
export function frontierExhausted(c: JobCounts): boolean {
  return c.queued === 0 && c.processing === 0 && c.sitemaps_pending === 0;
}

/** Pages still to process — the "remaining" the operator sees. */
export const remaining = (c: JobCounts) => c.queued + c.processing;

export type JobStatus = 'running' | 'complete' | 'complete_with_failures' | 'failed' | 'cancelled';

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  running: 'Crawling',
  complete: 'Complete',
  complete_with_failures: 'Complete with failures',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** "Crawling… 347 processed · 1,476 discovered · 1,129 remaining · 3 failed · 12 skipped" */
export function progressLabel(status: JobStatus, c: JobCounts): string {
  const f = (n: number) => n.toLocaleString('en-GB');
  const processed = c.done + c.failed + c.skipped;
  const parts = [`${f(processed)} processed`, `${f(c.discovered)} discovered`];
  if (status === 'running') parts.push(`${f(remaining(c))} remaining`);
  parts.push(`${f(c.done)} fetched`, `${f(c.failed)} failed`, `${f(c.skipped)} skipped`);
  if (status === 'running' && c.sitemaps_pending) parts.push(`${f(c.sitemaps_pending)} sitemap(s) still to read`);
  return `${JOB_STATUS_LABELS[status]}${status === 'running' ? '…' : ''} ${parts.join(' · ')}`;
}
