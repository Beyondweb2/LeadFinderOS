import { useState } from 'react';
import { MessageSquare, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WHATSAPP_TEMPLATES, type OutreachLead } from '@/types/outreach';

/**
 * Per-lead WhatsApp outreach controls (lead detail dialog): pick the approved
 * template for THIS business, then add/remove it from the daily outreach queue.
 * Sending itself is done server-side by process-whatsapp-queue (TEST_MODE-gated);
 * here we only choose the template + queue the lead (status='queued').
 */
export function WhatsAppLeadControls({
  lead,
  onUpdate,
}: {
  lead: OutreachLead;
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false);
  const template = lead.whatsapp_template ?? '';
  const queued = lead.status === 'queued';

  const toggleQueue = async () => {
    setBusy(true);
    try {
      if (queued) {
        await onUpdate(lead.id, { status: 'not_contacted', queued_at: null });
      } else {
        await onUpdate(lead.id, {
          status: 'queued',
          queued_at: new Date().toISOString(),
          whatsapp_template: template || 'booking_page_intro',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-green-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">WhatsApp outreach</span>
      </div>

      {lead.whatsapp_sent_at ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-green-500" />
          Sent {new Date(lead.whatsapp_sent_at).toLocaleDateString()}
          {lead.whatsapp_template ? ` · ${lead.whatsapp_template}` : ''}
          {lead.whatsapp_delivery_status ? ` (${lead.whatsapp_delivery_status})` : ''}
        </p>
      ) : (
        <>
          <label className="mb-1 block text-[11px] text-muted-foreground">Template</label>
          <Select value={template} onValueChange={(v) => onUpdate(lead.id, { whatsapp_template: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose a template" /></SelectTrigger>
            <SelectContent>
              {WHATSAPP_TEMPLATES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/60">
            Sends the chosen template with the business name + this lead's claim link.
          </p>
          <Button
            size="sm"
            variant={queued ? 'outline' : 'default'}
            className="mt-2.5 h-7 w-full gap-1.5 text-xs"
            onClick={toggleQueue}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : queued ? <X className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
            {queued ? 'Remove from queue' : 'Add to WhatsApp queue'}
          </Button>
          {queued && (
            <p className="mt-1.5 text-center text-[10px] text-sky-400">In the queue — sends within the daily 7am–7pm UK window (max 10/day).</p>
          )}
        </>
      )}
    </section>
  );
}
