import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { replyHoursFrom, type InboxChannel, type ReplyHours, type ScheduledSendRow } from '@/lib/inboxSendWindow';

/* The Inbox's queued sends (messages saved outside the lead's send hours, src/lib/inboxSendWindow.ts) and the one reply-hours
   setting. Reads and changes go only through the role-checked functions (migration 20261114090000): the table itself has no
   policies. A failed read is an empty list for display only — it can never cause a send (the server decides every send). */
const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export const INBOX_SCHEDULED_KEY = ['inbox-scheduled-sends'] as const;
export const INBOX_REPLY_HOURS_KEY = ['inbox-reply-hours'] as const;
export interface InboxScheduledInfo { id: string; send_at: string; tz: string }

const last10 = (p: string) => String(p ?? '').replace(/\D/g, '').slice(-10);

export function useInboxScheduled(channel: InboxChannel) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: INBOX_SCHEDULED_KEY,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ScheduledSendRow[]> => {
      const { data, error } = await sb.rpc('my_inbox_scheduled_sends');
      if (error) throw new Error(error.message);
      return (data ?? []) as ScheduledSendRow[];
    },
  });
  const hoursQ = useQuery({
    queryKey: INBOX_REPLY_HOURS_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<ReplyHours | null> => {
      const { data, error } = await sb.rpc('inbox_reply_hours');
      if (error) return null;
      return replyHoursFrom(data as Record<string, unknown> | null);
    },
  });
  const rows = useMemo(() => (q.data ?? []).filter((r) => r.channel === channel), [q.data, channel]);
  const byPhone = useMemo(() => {
    const m = new Map<string, ScheduledSendRow[]>();
    for (const r of rows) { const k = last10(r.phone); m.set(k, [...(m.get(k) ?? []), r]); }
    return m;
  }, [rows]);
  const forPhone = useCallback((phone: string) => byPhone.get(last10(phone)) ?? [], [byPhone]);
  const forLead = useCallback((leadId: string) => rows.filter((r) => r.lead_id === leadId), [rows]);
  const heldForPhone = useCallback((phone: string) => (byPhone.get(last10(phone)) ?? []).some((r) => r.status === 'held'), [byPhone]);

  const act = useCallback(async (fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await sb.rpc(fn, args);
    const res = data as { ok?: boolean; error?: string } | null;
    await qc.invalidateQueries({ queryKey: INBOX_SCHEDULED_KEY });
    if (error) return { ok: false, error: error.message };
    return res?.ok ? { ok: true } : { ok: false, error: res?.error ?? 'failed' };
  }, [qc]);
  const edit = useCallback((id: string, body: string) => act('inbox_scheduled_edit', { _id: id, _body: body }), [act]);
  const cancel = useCallback((id: string) => act('inbox_scheduled_cancel', { _id: id }), [act]);
  const release = useCallback((id: string) => act('inbox_scheduled_release', { _id: id }), [act]);
  const saveReplyHours = useCallback(async (startMin: number | null, endMin: number | null) => {
    const { data, error } = await sb.rpc('set_inbox_reply_hours', { _start: startMin, _end: endMin });
    const res = data as { ok?: boolean; error?: string } | null;
    await qc.invalidateQueries({ queryKey: INBOX_REPLY_HOURS_KEY });
    if (error || !res?.ok) throw new Error(error?.message ?? res?.error ?? 'save_failed');
  }, [qc]);

  const refresh = useCallback(() => { void qc.invalidateQueries({ queryKey: INBOX_SCHEDULED_KEY }); }, [qc]);
  return { rows, forPhone, forLead, heldForPhone, refresh, replyHours: hoursQ.data ?? null, edit, cancel, release, saveReplyHours, loaded: q.isSuccess };
}
