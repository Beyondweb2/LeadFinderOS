import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/edgeInvoke';
import type { SetupView } from '@/components/ClientSetupCard';

/* ══ THE ADMIN CONTROL CENTRE'S TWO EXTRA READS (2026-10-02, docs/dashboards-redesign.md) ═══════════
   Both reuse what already exists — no new server code, no second status system:
   - usePaidClientList: fn paid-client-hub `list`, the SAME call the Paid Clients page makes. Each client
     carries the canonical handoff view (src/lib/handoffReadiness.ts + deliveryStage.ts via
     _shared/client-setup.ts): state, setup done/total, stage, missing items and the ONE next step.
   - useTeamLastActivity: each person's newest logged action (lead_activity) and newest WhatsApp they sent
     by hand (whatsapp_messages.sent_by_user_id). Admin-only by RLS (lead_activity_select is my_role()
     = 'admin' or the seller's own leads). One tiny read per person, newest row only. */

const sb = supabase as unknown as { from: (t: string) => any };

export interface PaidClientListRow {
  id: string; business_name: string; amount_paid?: number | null; payment_date?: string | null;
  sold_by_user_id?: string | null; sold_by_name?: string | null; status?: string | null;
  handoff?: SetupView | null; contract?: { name?: string | null } | null;
}

export function usePaidClientList(enabled: boolean) {
  return useQuery({
    queryKey: ['paid-client-hub', 'list'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => (await invokeEdge<{ clients: PaidClientListRow[] }>('paid-client-hub', { action: 'list' })).clients ?? [],
  });
}

export function useTeamLastActivity(userIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'team-last-activity', [...userIds].sort().join(',')],
    enabled: enabled && userIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string | null>> => {
      const newest = async (table: string, col: string, id: string): Promise<string | null> => {
        const { data, error } = await sb.from(table).select('created_at').eq(col, id).order('created_at', { ascending: false }).limit(1);
        if (error) return null;
        return (data?.[0]?.created_at as string | undefined) ?? null;
      };
      const out: Record<string, string | null> = {};
      await Promise.all(userIds.map(async (id) => {
        const [a, w] = await Promise.all([newest('lead_activity', 'actor_user_id', id), newest('whatsapp_messages', 'sent_by_user_id', id)]);
        out[id] = [a, w].filter((x): x is string => !!x).sort().pop() ?? null;
      }));
      return out;
    },
  });
}
