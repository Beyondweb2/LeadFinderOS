import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOutreachAttempt } from '@/hooks/useOutreachAttempt';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageSquare, Check, X } from 'lucide-react';

const PENDING_LEAD_ID_KEY = 'pending_whatsapp_check_lead_id';
const PENDING_STARTED_KEY = 'pending_whatsapp_check_started_at';
const PENDING_LEAD_NAME_KEY = 'pending_whatsapp_check_lead_name';
const STALE_MS = 2 * 60 * 1000; // 2 minutes

export function WhatsAppReturnCheck() {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadName, setLeadName] = useState('');
  const { logWhatsAppUnavailable } = useOutreachAttempt();

  const clearPending = useCallback(() => {
    localStorage.removeItem(PENDING_LEAD_ID_KEY);
    localStorage.removeItem(PENDING_STARTED_KEY);
    localStorage.removeItem(PENDING_LEAD_NAME_KEY);
  }, []);

  const checkPending = useCallback(() => {
    const id = localStorage.getItem(PENDING_LEAD_ID_KEY);
    const startedAt = localStorage.getItem(PENDING_STARTED_KEY);
    const name = localStorage.getItem(PENDING_LEAD_NAME_KEY);

    if (!id || !startedAt) return;

    const elapsed = Date.now() - parseInt(startedAt, 10);
    if (elapsed > STALE_MS) {
      clearPending();
      return;
    }

    setLeadId(id);
    setLeadName(name || 'this business');
    setOpen(true);
  }, [clearPending]);

  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to let the page settle
        setTimeout(checkPending, 300);
      }
    };
    const onFocus = () => {
      setTimeout(checkPending, 300);
    };

    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkPending]);

  const handleConfirm = async (hasWhatsApp: boolean) => {
    setOpen(false);
    clearPending();
    if (!leadId) return;

    const status = hasWhatsApp ? 'yes' : 'no';
    const checkedAt = new Date().toISOString();

    await supabase
      .from('outreach_leads')
      .update({ whatsapp_status: status, whatsapp_checked_at: checkedAt })
      .eq('id', leadId);

    if (!hasWhatsApp) {
      await logWhatsAppUnavailable(leadId);
    }

    // Dispatch event so local state updates
    window.dispatchEvent(new CustomEvent('whatsapp-status-updated', {
      detail: { leadId, status, checkedAt },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-xs" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-green-500" />
            WhatsApp Check
          </DialogTitle>
          <DialogDescription className="text-sm">
            Did WhatsApp open with a chat for <span className="font-semibold text-foreground">{leadName}</span>?
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => handleConfirm(true)}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <Check className="h-4 w-4 mr-1.5" />
            Yes
          </Button>
          <Button
            variant="outline"
            onClick={() => handleConfirm(false)}
            className="flex-1"
          >
            <X className="h-4 w-4 mr-1.5" />
            No
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
