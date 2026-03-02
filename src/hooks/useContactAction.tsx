import { useCallback, useRef } from 'react';
import { useOutreachAttempt } from '@/hooks/useOutreachAttempt';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead } from '@/types/outreach';

interface UseContactActionOptions {
  onUpdate: (leadId: string, updates: Record<string, any>) => void;
  onPersisted: (leadId: string, channel: 'whatsapp' | 'sms' | 'call') => void;
}

export function useContactAction({ onUpdate, onPersisted }: UseContactActionOptions) {
  const contactedRef = useRef<Set<string>>(new Set());
  const { logAttempt } = useOutreachAttempt();

  const executeContact = useCallback((lead: OutreachLead, channel: 'whatsapp' | 'sms' | 'call') => {
    // Prevent double-counting on rapid clicks
    if (contactedRef.current.has(lead.id)) return;
    contactedRef.current.add(lead.id);
    // Release after short delay to allow re-contact later
    setTimeout(() => contactedRef.current.delete(lead.id), 3000);

    const previousStatus = lead.status;

    // Update contact_method only (not status)
    const updates: Record<string, any> = {
      contact_method: channel === 'whatsapp' ? 'whatsapp' : channel === 'sms' ? 'sms' : 'call',
      outreach_attempts: (lead.outreach_attempts || 0) + 1,
      last_outreach_attempt_at: new Date().toISOString(),
    };
    onUpdate(lead.id, updates);

    // Fire walkthrough / checklist events
    window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    window.dispatchEvent(new CustomEvent('challenge-contact-sent', { detail: { leadId: lead.business_name } }));

    // Trigger one-time post-contact popup
    window.dispatchEvent(new CustomEvent('post-contact-modal-trigger'));

    // Log usage event
    supabase.rpc('log_usage_event', {
      p_event_type: 'contact_cta_clicked',
      p_meta: { channel, lead_id: lead.id, business_name: lead.business_name },
    }).then(() => {});

    // Persist to DB immediately
    logAttempt(lead.id, channel, previousStatus);
    window.dispatchEvent(new CustomEvent('crm-contact-action', { detail: { leadId: lead.id, method: channel } }));

    onPersisted(lead.id, channel);
  }, [onUpdate, onPersisted, logAttempt]);

  return { executeContact };
}
