import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquareText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Callout, DialogHero } from '@/components/operator/ui';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { smsKeys } from '@/hooks/useSms';
import { announceQueueChanged, recordQueueBatch } from '@/lib/whatsappQueueView';
import { buildSms, SMS_QUEUE_DAILY_CAP, SMS_QUEUE_SKIP_WORDS, SMS_QUEUE_WINDOW, SMS_TEMPLATES } from '@/lib/smsMessages';
import { smsSize, costWords, smsCostGbp } from '@/lib/channelCosts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* QUEUE SMS (2026-10-09) — the text twin of "Queue WhatsApp": pick leads, press, they wait in the SMS queue and go out one at a
   time inside the sending window. What goes out is ONE approved text (SMS_TEMPLATES.sms_opener), shown here in full BEFORE you
   queue. The server (queue_sms_openers, then the drip again at send time) refuses anything that is not a clean first text:
   not a UK mobile, opted out, already texted, already in a WhatsApp conversation, already spoken to, a client — and says which.
   ⛔ Only your own leads (a salesperson); the drip sends AS THE PERSON WHO QUEUED, so the text and its replies are theirs. */
export function QueueSmsDialog({ open, onOpenChange, leadIds, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; leadIds: string[]; onDone?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const example = buildSms('sms_opener', { rep: 'you', business: 'Your Business Ltd' }) ?? '';
  const size = smsSize(example);

  const go = async () => {
    setBusy(true);
    try {
      const { data, error } = await sb.rpc('queue_sms_openers', { _lead_ids: leadIds });
      const r = data as { ok?: boolean; queued?: number; skipped?: Record<string, number>; error?: string; detail?: string } | null;
      if (error || !r?.ok) {
        toast({ title: 'Nothing queued', description: r?.detail ?? (r?.error === 'too_many' ? 'Queue up to 200 at a time.' : 'Could not queue the texts. Try again.'), variant: 'destructive' });
        return;
      }
      const skippedList = Object.entries(r.skipped ?? {}).map(([k, n]) => ({ n, label: SMS_QUEUE_SKIP_WORDS[k] ?? k }));
      recordQueueBatch(r.queued ?? 0, skippedList);
      const skipped = skippedList.reduce((s, x) => s + x.n, 0);
      toast({
        title: `Queued ${r.queued ?? 0} for text`,
        description: `${skipped ? `${skipped} skipped: ${skippedList.map((s) => `${s.n} ${s.label}`).join(' · ')}. ` : ''}Texts go out one at a time, ${SMS_QUEUE_WINDOW.startHour}am–${SMS_QUEUE_WINDOW.endHour > 12 ? SMS_QUEUE_WINDOW.endHour - 12 : SMS_QUEUE_WINDOW.endHour}pm UK.`,
        variant: r.queued ? undefined : 'destructive',
      });
      void qc.invalidateQueries({ queryKey: smsKeys.all });
      void qc.invalidateQueries({ queryKey: ['sms-queue'] });
      announceQueueChanged();
      onDone?.();
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="queue-sms-dialog">
        <DialogTitle className="sr-only">Queue texts</DialogTitle>
        <DialogDescription className="sr-only">Queue the intro text for the selected leads</DialogDescription>
        <DialogHero icon={MessageSquareText} tone="blue" title={<>Queue {leadIds.length} for text</>} subtitle="They wait in the text queue and go out one at a time. You can remove any of them before it sends." />
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The text that goes out</p>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-blue-600 px-3 py-2 text-sm text-white" data-testid="queue-sms-example">{example}</p>
          <p className="text-[11px] text-muted-foreground">Your name and the business name are filled in for each lead. {size.segments} text{size.segments === 1 ? '' : 's'} each ({costWords(smsCostGbp(example))}).</p>
        </div>
        <Callout tone="amber" className="text-xs">
          Sent only to UK mobiles you have not texted or spoken to, who are not already in a WhatsApp conversation and have not opted out. Anyone else is skipped, and you are told why. Up to {SMS_QUEUE_DAILY_CAP} a day.
        </Callout>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="gap-1.5 bg-blue-600 font-bold text-white hover:bg-blue-700" disabled={busy || leadIds.length === 0} onClick={() => void go()} data-testid="queue-sms-confirm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}Queue {leadIds.length} text{leadIds.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The one-line wording of the cold text, for places that only need the template's name. */
export const SMS_OPENER_LABEL = SMS_TEMPLATES.sms_opener.label;
