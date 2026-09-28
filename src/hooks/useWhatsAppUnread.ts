import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';

/* WhatsApp UNREAD, per person (Sales Experience 2026-09-28; migration 20260929120000).
   - useWhatsAppUnread(): the caller's unread conversations (number, lead, newest reply) from the one
     server function the nav badge, the dashboard's Today strip and the Inbox all agree on.
   - useWhatsAppReads(): when THIS person last opened each number — the Inbox's per-row unread dot.
   - markRead(phone): opening a thread. The server keeps the later of two times, so a stale tab can
     never mark a newer reply unread again. */

// Not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface UnreadRow { phone: string; lead_id: string | null; last_inbound_at: string }
export const UNREAD_KEY = (uid: string | undefined) => ['whatsapp-unread', uid ?? null] as const;
export const READS_KEY = (uid: string | undefined) => ['whatsapp-reads', uid ?? null] as const;
const POLL_MS = 60_000;

export function useWhatsAppUnread() {
  const { user } = useAuth();
  const { role } = useSubscription();
  const q = useQuery({
    queryKey: UNREAD_KEY(user?.id),
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async (): Promise<UnreadRow[]> => {
      const { data, error } = await sb.rpc('my_whatsapp_unread');
      if (error) throw error;
      return (data ?? []) as UnreadRow[];
    },
  });
  return { rows: q.data ?? [], count: q.data?.length ?? 0, loaded: q.isSuccess };
}

export function useWhatsAppReads() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: READS_KEY(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const out = new Map<string, string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('whatsapp_conversation_reads').select('phone, last_read_at').order('phone').range(from, from + 999);
        if (error) throw error;
        for (const r of (data ?? []) as { phone: string; last_read_at: string }[]) out.set(r.phone, r.last_read_at);
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
  return { reads: q.data, loaded: q.isSuccess };
}

export function useMarkWhatsAppRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useCallback(async (phone: string | null | undefined) => {
    if (!user?.id || !phone || !/^[0-9]{6,16}$/.test(phone)) return;
    const at = new Date().toISOString();
    qc.setQueryData<Map<string, string>>(READS_KEY(user.id), (prev) => { const m = new Map(prev ?? []); m.set(phone, at); return m; });
    qc.setQueryData<UnreadRow[]>(UNREAD_KEY(user.id), (prev) => (prev ?? []).filter((r) => r.phone !== phone));
    const { error } = await sb.rpc('mark_whatsapp_read', { _phone: phone });
    if (error) void qc.invalidateQueries({ queryKey: READS_KEY(user.id) });
    void qc.invalidateQueries({ queryKey: UNREAD_KEY(user.id) });
  }, [qc, user?.id]);
}
