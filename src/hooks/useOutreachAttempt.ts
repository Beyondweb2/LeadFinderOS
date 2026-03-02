import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type Channel = 'whatsapp' | 'sms' | 'call';

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

      // If status is New (not_contacted), auto-set to Attempted (waiting)
      // Do not override Replied, Interested, Closed, Not Interested
      const protectedStatuses = ['replied', 'interested', 'not_interested', 'completed'];
      if (!currentStatus || currentStatus === 'not_contacted') {
        updates.status = 'waiting';
      } else if (protectedStatuses.includes(currentStatus)) {
        // Don't change status
      }

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
