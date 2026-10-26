/* The dashboard rows' send state (src/lib/dashboardSendState.ts): the dashboard templates' outbound messages to the rows' leads
   in the last HANDLED_FOR_MS, and the queued ones (the Inbox's my_inbox_scheduled_sends). ⛔ Read-only; a failed read is an error
   the row can live without (the button still works, and the server refuses a double send itself).
   Re-read every 10 s only while a send on screen is still moving (sending / queued / sent but not yet delivered, newer than
   10 minutes), so "Sent" turns into "Delivered" or "Failed" without a reload; otherwise it rests. */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { NO_DOUBLE_SEND_TEMPLATES } from '@/lib/dashboardTemplates';
import { HANDLED_FOR_MS, type DashboardQueuedFact, type DashboardSentFact } from '@/lib/dashboardSendState';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export const DASHBOARD_SENDS_KEY = ['dashboard-sends'] as const;
const SENT_COLUMNS = 'id, lead_id, template_name, status, created_at, error_code, error_title, error_details, error';
const MOVING_MS = 10 * 60_000;

export interface DashboardSends { sent: DashboardSentFact[]; queued: DashboardQueuedFact[] }

function stillMoving(d: DashboardSends | undefined, nowMs: number): boolean {
  if (!d) return false;
  if (d.queued.some((q) => q.status === 'sending')) return true;
  return d.sent.some((m) => (m.status === 'sent' || m.status == null) && nowMs - Date.parse(m.created_at) < MOVING_MS);
}

export function useDashboardSends(leadIds: readonly string[]) {
  const ids = [...new Set(leadIds)].sort();
  return useQuery({
    queryKey: [...DASHBOARD_SENDS_KEY, ids],
    enabled: ids.length > 0,
    staleTime: 15_000,
    refetchInterval: (q) => (stillMoving(q.state.data as DashboardSends | undefined, Date.now()) ? 10_000 : false),
    queryFn: async (): Promise<DashboardSends> => {
      const since = new Date(Date.now() - HANDLED_FOR_MS).toISOString();
      const [m, s] = await Promise.all([
        sb.from('whatsapp_messages').select(SENT_COLUMNS).eq('direction', 'outbound').in('lead_id', ids)
          .in('template_name', NO_DOUBLE_SEND_TEMPLATES).gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
        sb.rpc('my_inbox_scheduled_sends'),
      ]);
      if (m.error) throw new Error(m.error.message);
      if (s.error) throw new Error(s.error.message);
      const want = new Set(ids);
      const queued = ((s.data ?? []) as (DashboardQueuedFact & { channel?: string })[])
        .filter((r) => r.channel === 'whatsapp' && r.lead_id && want.has(r.lead_id));
      return { sent: (m.data ?? []) as DashboardSentFact[], queued };
    },
  });
}
