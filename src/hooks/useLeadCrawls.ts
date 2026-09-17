import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CrawlRow, CrawlStoredResult } from '@/lib/crawlResult';

// lead_crawl_checks isn't in the generated types (same as useInbox) → an untyped `from`.
// deno-lint-ignore no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

/* The newest stored crawl check per lead — the Crawl-site button's state and the popup's stored
   result, for the Outreach table. Reads the SAME lead_crawl_checks rows the Inbox reads (useInbox)
   and the crawl-check edge function writes; no second mechanism. Paginated with the id tiebreaker
   (PostgREST silently caps at 1,000). React Query, so the two Outreach uses share one fetch and an
   `onDone` refetch after a run restyles the button. */

interface Row { lead_id: string | null; result: CrawlStoredResult | null; created_at: string }

async function fetchLeadCrawls(): Promise<Row[]> {
  const res = await fetchAllRows<Row>('Outreach (crawl checks)', (from, to) =>
    sb.from('lead_crawl_checks').select('lead_id, result, created_at')
      .order('id', { ascending: true }).range(from, to));
  return res.rows;
}

export function useLeadCrawls() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['lead-crawls', user?.id ?? null],
    queryFn: fetchLeadCrawls,
    enabled: !!user?.id,
  });

  const crawlByLeadId = useMemo(() => {
    const m = new Map<string, CrawlRow>();
    for (const c of query.data ?? []) {
      if (!c.lead_id) continue;
      const prev = m.get(c.lead_id);
      if (!prev || new Date(c.created_at).getTime() > new Date(prev.created_at).getTime()) {
        m.set(c.lead_id, { result: c.result, created_at: c.created_at });
      }
    }
    return m;
  }, [query.data]);

  return { crawlByLeadId, refetch: query.refetch };
}
