import { useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useOutreachAttempt } from '@/hooks/useOutreachAttempt';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead } from '@/types/outreach';

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

  /** Call this AFTER the external app has been opened (e.g. from dialog's "Open App" CTA) */
  const executeContact = useCallback((lead: OutreachLead, channel: 'whatsapp' | 'sms' | 'call') => {
    // Prevent double-counting
    if (pendingRef.current.has(lead.id)) return;

    const previousStatus = lead.status;

    // Optimistic UI update
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
