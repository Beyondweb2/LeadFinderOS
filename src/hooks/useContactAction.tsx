import { useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useOutreachAttempt } from '@/hooks/useOutreachAttempt';
import { generateWhatsAppUrl, generateSMSUrl } from '@/lib/leadUtils';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead } from '@/types/outreach';

const WHATSAPP_TEMPLATE_KEY = 'leadfinder_whatsapp_template';
const SMS_TEMPLATE_KEY = 'leadfinder_sms_template';
const DEFAULT_TEMPLATE = 'Hi, is this the right number for {{business_name}}?';
const TOAST_DURATION = 4000;

interface PendingContact {
  leadId: string;
  channel: 'whatsapp' | 'sms' | 'call';
  previousStatus: string;
  timer: ReturnType<typeof setTimeout>;
}

interface UseContactActionOptions {
  onOptimisticUpdate: (leadId: string, updates: Record<string, any>) => void;
  onRevert: (leadId: string, updates: Record<string, any>) => void;
  onPersist: (leadId: string, channel: 'whatsapp' | 'sms' | 'call', previousStatus: string) => void;
  onContactCounted: (leadId: string) => void;
  onContactUndone: (leadId: string) => void;
}

export function useContactAction({
  onOptimisticUpdate,
  onRevert,
  onPersist,
  onContactCounted,
  onContactUndone,
}: UseContactActionOptions) {
  const { toast, dismiss } = useToast();
  const pendingRef = useRef<Map<string, PendingContact>>(new Map());
  const { logAttempt } = useOutreachAttempt();

  const getTemplate = (channel: 'whatsapp' | 'sms') => {
    const key = channel === 'whatsapp' ? WHATSAPP_TEMPLATE_KEY : SMS_TEMPLATE_KEY;
    try {
      return localStorage.getItem(key) || DEFAULT_TEMPLATE;
    } catch {
      return DEFAULT_TEMPLATE;
    }
  };

  const executeContact = useCallback((lead: OutreachLead, channel: 'whatsapp' | 'sms' | 'call') => {
    if (!lead.phone) return;

    // Prevent double-counting
    if (pendingRef.current.has(lead.id)) return;

    const previousStatus = lead.status;

    // 1. Open the app immediately
    if (channel === 'whatsapp') {
      const template = getTemplate('whatsapp');
      const message = template.replace(/\{\{business_name\}\}/g, lead.business_name);
      const url = generateWhatsAppUrl(lead.phone, message);
      window.open(url, '_blank');
    } else if (channel === 'sms') {
      const template = getTemplate('sms');
      const message = template.replace(/\{\{business_name\}\}/g, lead.business_name);
      const url = generateSMSUrl(lead.phone, message);
      window.open(url, '_self');
    } else {
      // Call - already handled via tel: link, this is just for tracking
    }

    // 2. Optimistic UI update
    const optimisticUpdates: Record<string, any> = {};
    if (!previousStatus || previousStatus === 'not_contacted') {
      optimisticUpdates.status = 'waiting';
    }
    optimisticUpdates.contact_method = channel === 'whatsapp' ? 'whatsapp' : channel === 'sms' ? 'sms' : 'call';
    optimisticUpdates.outreach_attempts = (lead.outreach_attempts || 0) + 1;
    optimisticUpdates.last_outreach_attempt_at = new Date().toISOString();
    
    onOptimisticUpdate(lead.id, optimisticUpdates);
    onContactCounted(lead.id);

    // Fire walkthrough events
    window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    window.dispatchEvent(new CustomEvent('challenge-contact-sent', { detail: { leadId: lead.business_name } }));

    // Log usage event (fire and forget)
    supabase.rpc('log_usage_event', {
      p_event_type: 'contact_cta_clicked',
      p_meta: { channel, lead_id: lead.id, business_name: lead.business_name },
    }).then(() => {});

    // 3. Show toast with undo
    const { id: toastId } = toast({
      force: true,
      description: '✓ Marked as contacted',
      action: (
        <ToastAction
          altText="Undo contact"
          onClick={() => {
            // Undo
            const pending = pendingRef.current.get(lead.id);
            if (pending) {
              clearTimeout(pending.timer);
              pendingRef.current.delete(lead.id);
            }
            // Revert optimistic updates
            const revertUpdates: Record<string, any> = {
              status: previousStatus,
              contact_method: lead.contact_method,
              outreach_attempts: lead.outreach_attempts,
              last_outreach_attempt_at: lead.last_outreach_attempt_at,
            };
            onRevert(lead.id, revertUpdates);
            onContactUndone(lead.id);
            dismiss(toastId);

            // Log undo event
            supabase.rpc('log_usage_event', {
              p_event_type: 'contact_undo',
              p_meta: { lead_id: lead.id },
            }).then(() => {});
          }}
          className="text-xs font-medium"
        >
          Undo
        </ToastAction>
      ),
      duration: TOAST_DURATION,
    });

    // 4. Set timer to persist after toast expires
    const timer = setTimeout(() => {
      pendingRef.current.delete(lead.id);
      onPersist(lead.id, channel, previousStatus);
    }, TOAST_DURATION + 500); // small buffer after toast

    pendingRef.current.set(lead.id, {
      leadId: lead.id,
      channel,
      previousStatus,
      timer,
    });
  }, [toast, dismiss, onOptimisticUpdate, onRevert, onPersist, onContactCounted, onContactUndone, logAttempt]);

  return { executeContact };
}
