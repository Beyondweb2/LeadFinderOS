import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { WHATSAPP_SERVICE_WINDOW_MS } from '@/lib/serviceWindow';

/* Which of these numbers have an open 24-hour WhatsApp window NOW (an inbound row in the last 24 hours) — for the bulk-send
   confirm's free / paid split (templateSendPrice.ts). RLS-scoped: a number the viewer cannot see reads as closed (= shown as
   paid, the cautious direction). The sender decides again at send time. A failed read = null (the split is not shown). */
export function useOpenWindowPhones(digits: readonly string[], enabled: boolean) {
  const ids = [...new Set(digits.filter(Boolean))].sort();
  const q = useQuery({
    queryKey: ['open-window-phones', ids.join(',')],
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const sb = supabase as unknown as SupabaseClient;
      const since = new Date(Date.now() - WHATSAPP_SERVICE_WINDOW_MS).toISOString();
      const open = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { data, error } = await sb.from('whatsapp_messages').select('phone')
          .eq('direction', 'inbound').gte('created_at', since).in('phone', [...chunk, ...chunk.map((d) => `+${d}`)]);
        if (error) throw error;
        for (const r of (data ?? []) as { phone: string | null }[]) { const d = String(r.phone ?? '').replace(/\D/g, ''); if (d) open.add(d); }
      }
      return open;
    },
  });
  return q.isError ? null : q.data ?? (ids.length === 0 ? new Set<string>() : null);
}
