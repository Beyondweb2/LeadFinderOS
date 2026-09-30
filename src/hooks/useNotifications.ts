import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { notifyLeadChanged } from '@/lib/leadSync';

/* The signed-in person's notifications (Sales Experience release 3; migration 20260929140000).
   Own rows only (RLS); written by the server (triggers + the ledger writer), never by the browser.
   Live: realtime on the table (RLS applies), with a slow poll as the safety net. */

// Not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface AppNotification {
  id: string; created_at: string; kind: string; title: string; body: string | null; link: string | null;
  lead_id: string | null; priority: number; count: number; read_at: string | null;
}
export const NOTIFICATIONS_KEY = (uid: string | undefined) => ['notifications', uid ?? null] as const;
const LIMIT = 100;
const POLL_MS = 120_000;

export function useNotifications(onArrive?: (n: AppNotification) => void) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = useMemo(() => NOTIFICATIONS_KEY(user?.id), [user?.id]);
  const q = useQuery({
    queryKey: key,
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await sb.from('notifications')
        .select('id, created_at, kind, title, body, link, lead_id, priority, count, read_at')
        .is('cleared_at', null).order('created_at', { ascending: false }).limit(LIMIT);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  useEffect(() => {
    if (!user?.id) return;
    // One channel per mounted reader (the desktop bell and the phone bell are separate components).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (supabase.channel(`notifications:${user.id}:${Math.random().toString(36).slice(2, 8)}`) as any)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (p: { eventType: string; new: AppNotification }) => {
        void qc.invalidateQueries({ queryKey: key });
        if (p.eventType === 'INSERT' && p.new) arrive.current?.(p.new);
        /* ⛔ AN ASSIGNMENT REACHES THE WORK QUEUES AT ONCE (2026-09-30). A salesperson never receives
           outreach_leads realtime, but they do receive their own notifications — so "lead assigned to
           you" announces the lead, and the Inbox (with its thread) and Outreach read it through the
           person's own access (leadSync, useInbox loadLead, useOutreach placeRow). */
        if ((p.eventType === 'INSERT' || p.eventType === 'UPDATE') && p.new?.kind === 'lead_assigned' && p.new.lead_id) notifyLeadChanged(p.new.lead_id);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, qc, key]);

  const patch = (fn: (rows: AppNotification[]) => AppNotification[]) => qc.setQueryData<AppNotification[]>(key, (prev) => fn(prev ?? []));
  const markRead = useCallback(async (ids: string[] | null) => {
    const now = new Date().toISOString();
    patch((rows) => rows.map((r) => (!ids || ids.includes(r.id) ? { ...r, read_at: r.read_at ?? now } : r)));
    await sb.rpc('mark_notifications_read', { _ids: ids });
    void qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, key]);
  const clear = useCallback(async (ids: string[] | null) => {
    patch((rows) => rows.filter((r) => ids && !ids.includes(r.id)));
    await sb.rpc('clear_notifications', { _ids: ids });
    void qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, key]);

  const rows = q.data ?? [];
  return { rows, unread: rows.filter((r) => !r.read_at).length, loaded: q.isSuccess, markRead, clear };
}
