/* The Inbox's read of "AI handles replies" (src/lib/aiReplyDraft.ts): the OPEN rows the signed-in person may see,
   from my_ai_reply_drafts() (the same scope as the unread counts: admin = the book, a rep = their assigned leads).
   WhatsApp only — the SMS tab passes enabled=false and reads nothing.
   ⚠️ A light poll: drafts are written by a one-minute cron, so a 30 s re-read is how a new one appears. It reads one
   small function, never the message list. */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AiReplyRow } from '@/lib/aiReplyDraft';

export const AI_REPLY_DRAFTS_KEY = ['ai-reply-drafts'] as const;
const phoneKey = (p: string | null | undefined) => String(p ?? '').replace(/\D/g, '').slice(-10);

/** The shell's bell polls at this pace; the Inbox keeps the 30 s default. Drafts come from a one-minute cron. */
export const SHELL_DRAFTS_POLL_MS = 60_000;

/** pollMs: how often to re-read (false = never; the cached rows are shared with whoever else reads them). */
export function useAiReplyDrafts(enabled: boolean, pollMs: number | false = 30_000) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: AI_REPLY_DRAFTS_KEY,
    enabled,
    refetchInterval: pollMs,
    staleTime: 10_000,
    queryFn: async (): Promise<AiReplyRow[]> => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>)('my_ai_reply_drafts');
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []) as AiReplyRow[];
    },
  });
  const byPhone = useMemo(() => {
    const m = new Map<string, AiReplyRow>();
    for (const r of q.data ?? []) m.set(phoneKey(r.phone), r);
    return m;
  }, [q.data]);
  return {
    rows: q.data ?? [],
    /** The open row for a conversation's number, if any (last ten digits: one number however it is written). */
    forPhone: (phone: string | null | undefined) => (enabled ? byPhone.get(phoneKey(phone)) ?? null : null),
    refetch: () => qc.invalidateQueries({ queryKey: AI_REPLY_DRAFTS_KEY }),
  };
}
