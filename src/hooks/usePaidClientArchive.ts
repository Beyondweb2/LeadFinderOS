/* Paul's archive of paid clients (src/lib/paidClientArchive.ts): read the live marks, archive one, bring one back.
   Admin only: RLS on admin_home_marks refuses anyone else. Nothing here touches a lead, a payment or commission.
   ⛔ A failed read is an error the screen shows, never "nothing archived" passed off as the answer. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ADMIN_HOME_NEEDS_KEY } from '@/hooks/useAdminHome';
import { archivedPaidClients, paidClientArchiveKey, type ArchiveMark } from '@/lib/paidClientArchive';

/* The generated types do not know admin_home_marks (migration 20261127090000). */
const sb = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export const PAID_CLIENT_ARCHIVE_KEY = ['paid-client-archive'] as const;

export function usePaidClientArchive(enabled = true) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: PAID_CLIENT_ARCHIVE_KEY, enabled, staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await sb.from('admin_home_marks').select('id, item_key, action, undone_at')
        .eq('action', 'archive').like('item_key', 'paidclient:%').is('undone_at', null).order('created_at', { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      return archivedPaidClients((data ?? []) as ArchiveMark[]);
    },
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: PAID_CLIENT_ARCHIVE_KEY }), qc.invalidateQueries({ queryKey: ADMIN_HOME_NEEDS_KEY })]);
  const archive = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await sb.from('admin_home_marks').insert({ item_key: paidClientArchiveKey(leadId), action: 'archive' });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
  /* Bring back: the mark is stamped undone, never deleted. Every live mark for the client goes, in case two were made. */
  const restore = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await sb.from('admin_home_marks').update({ undone_at: new Date().toISOString() })
        .eq('item_key', paidClientArchiveKey(leadId)).eq('action', 'archive').is('undone_at', null);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
  return { archived: q.data ?? new Map<string, string>(), isLoading: q.isLoading, isError: q.isError, error: q.error, archive, restore };
}
