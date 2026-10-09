import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquareText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Callout, DialogHero } from '@/components/operator/ui';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { smsKeys } from '@/hooks/useSms';
import { announceQueueChanged, recordQueueBatch } from '@/lib/whatsappQueueView';
import { SMS_COLD_TEMPLATES, SMS_QUEUE_DAILY_CAP, SMS_QUEUE_SKIP_WORDS, SMS_QUEUE_WINDOW, type SmsColdTemplate } from '@/lib/smsMessages';
import { SMS_COLD_CHOICES, smsPreview } from '@/lib/smsPreview';
import { smsSize, costWords, smsCostGbp } from '@/lib/channelCosts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* QUEUE SMS (2026-10-09) — the text twin of "Queue WhatsApp": pick leads, pick the OPENER, press, they wait in the text queue and go out
   one at a time inside the sending window.
   ⛔ THE TEXT IS THE WHATSAPP OPENER, UNCHANGED: the same two approved openers WhatsApp offers (initial_contact, initial_opener_v2), chosen for
   the batch exactly as on WhatsApp, with the only SMS addition being the opt-out line. What is shown below is the EXACT text the server will send
   to the first selected lead (the business name is filled in per lead, the way the real send fills it), with its segment count and cost.
   The server (queue_sms_openers, then the drip again at send time) refuses anything that is not a clean first text — not a UK mobile, opted out,
   already texted, already in a WhatsApp conversation, already spoken to, a client — and says which. The drip sends AS THE PERSON WHO QUEUED. */
export function QueueSmsDialog({ open, onOpenChange, leadIds, sample, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; leadIds: string[];
  /** The first selected lead, so the preview is a real message and not an invented one. */
  sample?: { business_name?: string | null; derived_town?: string | null } | null;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState<SmsColdTemplate>(SMS_COLD_TEMPLATES[0]);
  const text = smsPreview(template, sample ?? {});
  const size = smsSize(text);

  const go = async () => {
    setBusy(true);
    try {
      const { data, error } = await sb.rpc('queue_sms_openers', { _lead_ids: leadIds, _template: template });
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
        <DialogDescription className="sr-only">Queue a WhatsApp opener as a text for the selected leads</DialogDescription>
        <DialogHero icon={MessageSquareText} tone="blue" title={<>Queue {leadIds.length} for text</>} subtitle="They wait in the text queue and go out one at a time. You can remove any of them before it sends." />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Opener (the same two as WhatsApp)</label>
          <Select value={template} onValueChange={(v) => setTemplate(v as SmsColdTemplate)}>
            <SelectTrigger aria-label="Opener" data-testid="queue-sms-template"><SelectValue /></SelectTrigger>
            <SelectContent>{SMS_COLD_CHOICES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The text that goes out{sample?.business_name ? ` (to ${sample.business_name})` : ''}</p>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-blue-600 px-3 py-2 text-sm text-white" data-testid="queue-sms-example">{text}</p>
          <p className="text-[11px] text-muted-foreground" data-testid="queue-sms-size">{size.characters} characters · {size.segments} text{size.segments === 1 ? '' : 's'} each · {costWords(smsCostGbp(text))}. The WhatsApp wording is unchanged; the last line is the opt-out.</p>
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
