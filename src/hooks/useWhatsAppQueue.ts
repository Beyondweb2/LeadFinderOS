import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  QUEUE_CHANGED_EVENT, QUEUE_POLL_MS, QUEUE_ROW_COLUMNS, QUEUE_ROW_FILTER, WHATSAPP_QUEUE_KEY, type QueueRow,
} from '@/lib/whatsappQueueView';

/* ══ THE QUEUE ROWS — ONE READ, BOTH ROLES (2026-10-06) ═══════════════════════════════════════════
   ⛔ Read from the `sales_leads` view for EVERY caller: the database decides the scope (admin → every
      prospect; salesperson → only leads assigned to them). There is no role branch here and no owner
      filter — a salesperson who edited this file could still only read their own rows.
   ⛔ Paged (fetchAllRows, ordered by id): a 90-follow-up backlog must never be silently cut at 1,000.
   Fresh: on a queue-changed notice (every queue path announces one), on any lead change notice
   (src/lib/leadSync.ts invalidates WHATSAPP_QUEUE_KEY), on focus, and every QUEUE_POLL_MS while
   anything waits. The Outreach summary and the queue page share this one query. */
export function useWhatsAppQueue() {
  const qc = useQueryClient();
  useEffect(() => {
    const h = () => { void qc.invalidateQueries({ queryKey: WHATSAPP_QUEUE_KEY }); };
    window.addEventListener(QUEUE_CHANGED_EVENT, h);
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, h);
  }, [qc]);
  return useQuery({
    queryKey: WHATSAPP_QUEUE_KEY,
    queryFn: async (): Promise<QueueRow[]> => {
      const { rows } = await fetchAllRows<QueueRow>('whatsapp-queue', (from, to) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('sales_leads').select(QUEUE_ROW_COLUMNS)
          .or(QUEUE_ROW_FILTER)
          .order('id', { ascending: true })
          .range(from, to));
      return rows;
    },
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? QUEUE_POLL_MS : false),
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}
