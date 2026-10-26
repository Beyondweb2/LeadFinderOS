import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toWhatsAppDigits } from '@/lib/waNumber';
import { PEEK_COUNT, PEEK_MESSAGE_COLUMNS, type PeekRow } from '@/lib/messagePeek';

/* THE DASHBOARD'S "LAST 3" READ (Paul, 2026-10-26). One small SELECT, only when the row is opened (`enabled`).
   ⛔ READ-ONLY: a plain select on whatsapp_messages under the viewer's own RLS (the Inbox's own read and access) — no
   read mark, no receipt, no status change, no write. The thread is the lead's messages OR the lead's number's (the Inbox
   finds a conversation by number, so an inbound row with no lead id still belongs to it). Newest first, PEEK_COUNT rows. */
export function useLeadPeek(lead: { leadId: string | null; phone?: string | null; country?: string | null }, enabled: boolean) {
  const digits = lead.phone ? toWhatsAppDigits(lead.phone, lead.country ?? null) : null;
  return useQuery({
    queryKey: ['dashboard-peek', lead.leadId, digits],
    enabled: enabled && !!(lead.leadId || digits),
    staleTime: 30_000,
    queryFn: async (): Promise<PeekRow[]> => {
      /* Both values are safe inside the filter: a uuid and digits only (toWhatsAppDigits). */
      const or = [lead.leadId ? `lead_id.eq.${lead.leadId}` : null, digits && /^\d+$/.test(digits) ? `phone.eq.${digits}` : null].filter(Boolean).join(',');
      const { data, error } = await supabase.from('whatsapp_messages').select(PEEK_MESSAGE_COLUMNS)
        .or(or).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PEEK_COUNT);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PeekRow[];
    },
  });
}
