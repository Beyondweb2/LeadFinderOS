import { useEffect, useState } from 'react';
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
import { SMS_COLD_TEMPLATES, SMS_QUEUE_WINDOW, type SmsColdTemplate } from '@/lib/smsMessages';
import { checkSmsQueue, runSmsQueue, skipSummary, SMS_QUEUE_LIMIT_WORDS, type SmsQueuePlan, type SmsQueueRpc } from '@/lib/smsQueueBatch';
import { SMS_COLD_CHOICES, smsPreview } from '@/lib/smsPreview';
import { smsSize, costWords, smsCostGbp } from '@/lib/channelCosts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const rpc: SmsQueueRpc = (args) => sb.rpc('queue_sms_openers', args);

/* QUEUE SMS (2026-10-09) — the text twin of "Queue WhatsApp": pick leads, pick the OPENER, press, they wait in the text queue and go out
   one at a time inside the sending window.
   ⛔ THE TEXT IS THE WHATSAPP OPENER, UNCHANGED: the same two approved openers WhatsApp offers (initial_contact, initial_opener_v2), chosen for
   the batch exactly as on WhatsApp, with NOTHING added. What is shown below is the EXACT text the server will send
   to the first selected lead (the business name is filled in per lead, the way the real send fills it), with its segment count and cost.
   The server (queue_sms_openers, then the drip again at send time) refuses anything that is not a clean first text — not a UK mobile, opted out,
   already texted, already in a WhatsApp conversation, already spoken to, a client — and says which. The drip sends AS THE PERSON WHO QUEUED.
   ⛔ HONEST COUNT (2026-10-13): the popup first asks the server, check-only (smsQueueBatch.checkSmsQueue), and its title, button and
   reasons are THAT answer — never the selection size. At most SMS_QUEUE_MAX_PER_ACTION are queued; the rest are named "over the limit". */
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
  const [plan, setPlan] = useState<SmsQueuePlan | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const idsKey = leadIds.join(',');

  // Ask the server what would really happen, every time the popup opens on a selection. Nothing is written.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setPlan(null); setCheckError(null);
    checkSmsQueue(rpc, leadIds, template)
      .then((p) => { if (live) setPlan(p); })
      .catch((e: unknown) => { if (live) setCheckError(e instanceof Error ? e.message : 'Could not check the texts. Try again.'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey]);
  const willQueue = plan?.queueIds.length ?? 0;

  const go = async () => {
    if (!plan || willQueue === 0) return;
    setBusy(true);
    try {
      const r = await runSmsQueue(rpc, plan, template);
      recordQueueBatch(r.queued, r.skipped.map((l) => ({ n: l.n, label: l.label })));
      toast({
        title: `Queued ${r.queued} for text`,
        description: `${r.skippedTotal ? `${r.skippedTotal} not queued: ${skipSummary(r.skipped)}. ` : ''}Texts go out one at a time, ${SMS_QUEUE_WINDOW.startHour}am–${SMS_QUEUE_WINDOW.endHour > 12 ? SMS_QUEUE_WINDOW.endHour - 12 : SMS_QUEUE_WINDOW.endHour}pm UK.`,
        variant: r.queued ? undefined : 'destructive',
      });
      void qc.invalidateQueries({ queryKey: smsKeys.all });
      void qc.invalidateQueries({ queryKey: ['sms-queue'] });
      announceQueueChanged();
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Nothing queued', description: e instanceof Error ? e.message : 'Could not queue the texts. Try again.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="queue-sms-dialog">
        <DialogTitle className="sr-only">Queue texts</DialogTitle>
        <DialogDescription className="sr-only">Queue a WhatsApp opener as a text for the selected leads</DialogDescription>
        <DialogHero icon={MessageSquareText} tone="blue" title={plan ? <>Queue {willQueue} of {plan.selected} for text</> : <>Checking {leadIds.length} for text…</>} subtitle="They wait in the text queue and go out one at a time. You can remove any of them before it sends." />
        <div className="space-y-1.5 text-xs" data-testid="queue-sms-check">
          {!plan && !checkError && <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking each lead for WhatsApp, past texts, calls and opt-outs…</p>}
          {checkError && <Callout tone="red" className="text-xs">{checkError}</Callout>}
          {plan && (
            <>
              <p className="font-semibold" data-testid="queue-sms-will-queue">{willQueue} will be queued{plan.skippedTotal ? `, ${plan.skippedTotal} skipped` : ''}.</p>
              {plan.skipped.length > 0 && (
                <ul className="space-y-0.5 text-muted-foreground" data-testid="queue-sms-skipped">
                  {plan.skipped.map((l) => <li key={l.key} data-reason={l.key}>{l.n} {l.label}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
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
          <p className="text-[11px] text-muted-foreground" data-testid="queue-sms-size">{size.characters} characters · {size.segments} text{size.segments === 1 ? '' : 's'} each · {costWords(smsCostGbp(text))}. Word for word the WhatsApp template.</p>
        </div>
        <Callout tone="amber" className="text-xs">
          Sent only to UK mobiles you have not texted or spoken to, who have not opted out, and who are not in the WhatsApp queue or already messaged on WhatsApp. A mobile with no WhatsApp is fine. <span data-testid="queue-sms-limit">{SMS_QUEUE_LIMIT_WORDS}</span>
        </Callout>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="gap-1.5 bg-blue-600 font-bold text-white hover:bg-blue-700" disabled={busy || !plan || willQueue === 0} onClick={() => void go()} data-testid="queue-sms-confirm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}{plan ? <>Queue {willQueue} text{willQueue === 1 ? '' : 's'}</> : 'Checking…'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
