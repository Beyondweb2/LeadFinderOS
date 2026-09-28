import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { leadSourceFor } from '@/lib/outreachLeadColumns';

/* RECENTLY WORKED LEADS (Sales Experience release 4, 2026-09-28) — leads this person actually did
   something on, newest first: their own lead_activity (a note, a follow-up, a logged contact, a stage,
   a star…) and the WhatsApp messages they sent by hand. Never "random" leads, never someone else's work.
   Read under the person's own RLS (a salesperson sees only their own leads' rows). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
export interface RecentLead { id: string; name: string; at: string }
const LIMIT = 8;

export function useRecentLeads(enabled = true) {
  const { user } = useAuth();
  const { role } = useSubscription();
  return useQuery({
    queryKey: ['recent-leads', user?.id, role],
    enabled: enabled && !!user?.id && !!role,
    staleTime: 60_000,
    queryFn: async (): Promise<RecentLead[]> => {
      const [act, msg] = await Promise.all([
        sb.from('lead_activity').select('lead_id, created_at').eq('actor_user_id', user!.id).order('created_at', { ascending: false }).limit(60),
        sb.from('whatsapp_messages').select('lead_id, created_at').eq('sent_by_user_id', user!.id).not('lead_id', 'is', null).order('created_at', { ascending: false }).limit(60),
      ]);
      const seen = new Map<string, string>();
      for (const r of [...(act.data ?? []), ...(msg.data ?? [])].sort((a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at)) as { lead_id: string; created_at: string }[]) {
        if (r.lead_id && !seen.has(r.lead_id)) seen.set(r.lead_id, r.created_at);
      }
      const ids = [...seen.keys()].slice(0, LIMIT * 2);
      if (!ids.length) return [];
      const { data } = await sb.from(leadSourceFor(role).table).select('id, business_name, is_archived').in('id', ids);
      const names = new Map(((data ?? []) as { id: string; business_name: string | null; is_archived: boolean | null }[]).filter((l) => !l.is_archived).map((l) => [l.id, l.business_name ?? 'Unnamed business']));
      return ids.filter((id) => names.has(id)).slice(0, LIMIT).map((id) => ({ id, name: names.get(id)!, at: seen.get(id)! }));
    },
  });
}
