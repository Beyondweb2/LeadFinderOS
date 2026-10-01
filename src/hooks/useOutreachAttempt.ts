import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type Channel = 'whatsapp' | 'call';

export function useOutreachAttempt() {
  const { user } = useAuth();

  const logAttempt = useCallback(async (leadId: string, channel: Channel, currentStatus?: string) => {
    if (!user) return;

    try {
      // 1. Increment outreach_attempts & set last_outreach_attempt_at + contact_method
      const updates: Record<string, any> = {
        last_outreach_attempt_at: new Date().toISOString(),
        contact_method: channel,
      };

      /* ⛔ An attempt never changes the status (2026-10-01): opening a dialler or the WhatsApp app is not
         contact. Contacted comes only from a real send or a logged contact that reached them (leadState). */
      void currentStatus;

      // Fire-and-forget: update lead + insert event in parallel
      const updatePromise = supabase
        .from('outreach_leads')
        .update(updates)
        .eq('id', leadId)
        .select('outreach_attempts')
        .single()
        .then(({ data }) => {
          if (data) {
            // Increment atomically via a second update
            return supabase
              .from('outreach_leads')
              .update({ outreach_attempts: ((data as any).outreach_attempts || 0) + 1 })
              .eq('id', leadId);
          }
        });

      const eventPromise = supabase
        .from('outreach_events' as any)
        .insert({
          user_id: user.id,
          lead_id: leadId,
          channel,
          event_type: 'attempt',
        });

      await Promise.all([updatePromise, eventPromise]);

      // Dispatch custom event for walkthrough validation
      window.dispatchEvent(new CustomEvent('outreach-attempt-logged', { detail: { leadId, channel } }));
    } catch (e) {
      console.error('[logAttempt] Non-fatal error:', e);
    }
  }, [user]);

  const logWhatsAppUnavailable = useCallback(async (leadId: string) => {
    if (!user) return;

    try {
      await supabase
        .from('outreach_events' as any)
        .insert({
          user_id: user.id,
          lead_id: leadId,
          channel: 'whatsapp',
          event_type: 'whatsapp_unavailable',
        });
    } catch (e) {
      console.error('[logWhatsAppUnavailable] Non-fatal error:', e);
    }
  }, [user]);

  return { logAttempt, logWhatsAppUnavailable };
}
