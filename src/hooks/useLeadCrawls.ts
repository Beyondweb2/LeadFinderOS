import { useMemo } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CrawlRow, CrawlStoredResult } from '@/lib/crawlResult';
import type { StoredSiteScore } from '@/lib/siteScore';

// lead_crawl_checks isn't in the generated types (same as useInbox) → an untyped `from`.
// deno-lint-ignore no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

/* The newest stored crawl check per lead — the Crawl-site button's state, for the Outreach table AND the Inbox (one
   cache, one read). Reads the SAME lead_crawl_checks rows the crawl-check edge function writes; no second
   mechanism. Paginated with the id tiebreaker (PostgREST silently caps at 1,000). React Query, so every list use
   shares one fetch and an `onDone` refetch after a run restyles the button. */

/* ⚡ THE LISTS READ THE SUMMARY, NEVER THE WHOLE CHECK (perf, 2026-10-22). `result_slim` is the same JSON with the
   heavy parts the lists never read taken out, kept by a trigger (migration 20261121090000): 2.7 MB for every lead
   instead of 18.6 MB. It carries exactly what the icon (websiteCheckFor) and the Inbox template gates
   (resolveSiteFault, hasSiteFindings) read — proved identical on all 1,339 live rows. ⛔ Anything that SHOWS the
   check (the popup, the lead popup) reads the full row through useLeadCrawl below. Aliased to `result` so every
   reader keeps its shape. */
/* The site score (2026-10-23, src/lib/siteScore.ts): its small stored columns ride the same read — never the result. */
export const LEAD_CRAWL_LIST_SELECT = 'lead_id, result:result_slim, created_at, site_score, site_score_state, site_score_version, site_score_reasons, site_score_detail';

export interface LeadCrawlListRow extends StoredSiteScore { lead_id: string | null; result: CrawlStoredResult | null; created_at: string }

async function fetchLeadCrawls(label: string): Promise<LeadCrawlListRow[]> {
  const res = await fetchAllRows<LeadCrawlListRow>(label, (from, to) =>
    sb.from('lead_crawl_checks').select(LEAD_CRAWL_LIST_SELECT)
      .order('id', { ascending: true }).range(from, to));
  return res.rows;
}

/* A website check changing (a bulk crawl writes many in a row) re-reads the summary list ONCE, after a pause —
   never once per row, and never the whole Inbox. */
export const LEAD_CRAWLS_REFRESH_DEBOUNCE_MS = 3_000;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
export function refreshLeadCrawlsSoon(qc: QueryClient) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void qc.invalidateQueries({ queryKey: ['lead-crawls'] });
  }, LEAD_CRAWLS_REFRESH_DEBOUNCE_MS);
}

/** ONE lead's FULL crawl row — the popups' stored result. Same table, same row every screen reads;
 *  the ['lead-crawls', …] key prefix means any crawl run anywhere invalidates it. */
export function useLeadCrawl(leadId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['lead-crawls', 'one', leadId ?? null],
    enabled: !!leadId,
    queryFn: async (): Promise<CrawlRow | null> => {
      const { data, error } = await sb.from('lead_crawl_checks').select('result, created_at').eq('lead_id', leadId).maybeSingle();
      if (error) throw error;
      return data ? { result: data.result, created_at: data.created_at } : null;
    },
  });
  return { crawl: query.data ?? null, refetch: query.refetch, isLoading: query.isLoading };
}

export function useLeadCrawls(label = 'Outreach (crawl checks)') {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['lead-crawls', user?.id ?? null],
    queryFn: () => fetchLeadCrawls(label),
    enabled: !!user?.id,
  });

  const crawlByLeadId = useMemo(() => {
    const m = new Map<string, CrawlRow>();
    for (const c of query.data ?? []) {
      if (!c.lead_id) continue;
      const prev = m.get(c.lead_id);
      if (!prev || new Date(c.created_at).getTime() > new Date(prev.created_at).getTime()) {
        m.set(c.lead_id, {
          result: c.result, created_at: c.created_at,
          siteScore: { site_score: c.site_score, site_score_state: c.site_score_state, site_score_version: c.site_score_version, site_score_reasons: c.site_score_reasons, site_score_detail: c.site_score_detail },
        });
      }
    }
    return m;
  }, [query.data]);

  return { crawlByLeadId, refetch: query.refetch };
}
