import { MessageSquareText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DialogHero } from '@/components/operator/ui';
import { LeadSmsPanel } from '@/components/LeadSmsPanel';

/* THE SMS BUTTON ON AN OUTREACH ROW (2026-10-09) — the twin of the WhatsApp button beside it: one tap opens this lead's text
   conversation (the thread, the intro text, free-text replies once they have answered). It is the SAME panel the Call tab and the
   SMS inbox use, so what you see here is what you see everywhere.
   ⛔ Opening it writes nothing; only a text that is actually sent moves the lead's Contact Method to Text. */
export function SingleSmsDialog({ open, onOpenChange, lead }: {
  open: boolean; onOpenChange: (o: boolean) => void; lead: { id: string; business_name: string } | null;
}) {
  return (
    <Dialog open={open && !!lead} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation(); }} data-testid="single-sms-dialog">
        <DialogTitle className="sr-only">Text {lead?.business_name}</DialogTitle>
        <DialogDescription className="sr-only">Send and read text messages with this lead</DialogDescription>
        <DialogHero icon={MessageSquareText} tone="blue" title={lead?.business_name ?? 'Text message'} subtitle="Text messages with this lead. Replies appear here and in the SMS inbox." />
        {lead && <LeadSmsPanel leadId={lead.id} height="max-h-[40dvh]" />}
      </DialogContent>
    </Dialog>
  );
}
