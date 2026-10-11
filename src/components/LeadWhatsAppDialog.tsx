import { MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DialogHero } from '@/components/operator/ui';
import { LeadWhatsAppPanel, type WhatsAppDialogLead } from '@/components/LeadWhatsAppPanel';

/* THE WHATSAPP BUTTON ON AN OUTREACH ROW (2026-10-11) — the twin of SingleSmsDialog: one tap opens this lead's WhatsApp
   (recent thread, the approved-template picker with a live preview, free text inside the reply window). It used to jump
   straight to the Inbox; the Inbox is still one tap away inside.
   ⛔ Opening it writes nothing beyond what the button already did (the Contact Method pill); a send goes through the Inbox's
   own request (sendWhatsAppRequest). */
export function LeadWhatsAppDialog({ open, onOpenChange, lead }: {
  open: boolean; onOpenChange: (o: boolean) => void; lead: WhatsAppDialogLead | null;
}) {
  return (
    <Dialog open={open && !!lead} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation(); }} data-testid="lead-whatsapp-dialog">
        <DialogTitle className="sr-only">WhatsApp {lead?.business_name}</DialogTitle>
        <DialogDescription className="sr-only">Send and read WhatsApp messages with this lead</DialogDescription>
        <DialogHero icon={MessageCircle} tone="green" title={lead?.business_name ?? 'WhatsApp'} subtitle="WhatsApp messages with this lead. Replies appear here and in the Inbox." />
        {lead && <LeadWhatsAppPanel key={lead.id} lead={lead} height="max-h-[40dvh]" />}
      </DialogContent>
    </Dialog>
  );
}
