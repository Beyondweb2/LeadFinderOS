import { useState } from 'react';
import { MessageSquare, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WHATSAPP_TEMPLATES, type OutreachLead } from '@/types/outreach';
import { TemplateWordingInList, TemplateWordingPreview, useTemplateHover } from '@/components/TemplateWordingPreview';
import { RequestTemplateButton } from '@/components/RequestTemplateButton';
import { classifyLineType } from '@/lib/lineType';
import { isInitialOpener } from '@/lib/openerVariant';
import { getTemplateSendability } from '@/lib/whatsappTemplates';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';
import { salesQueueOpener } from '@/lib/leadRpc';
import { QUEUE_SKIP_LABEL, refusalText } from '@/lib/salesCrm';
import { useToast } from '@/hooks/use-toast';
import { useQueueState } from '@/hooks/useQueueState';
import { fetchQueueState, queuedLeadLine } from '@/lib/queueStatus';

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
  const { toast } = useToast();
  /* ⛔ SAME CONTROL, BOTH ROLES (2026-09-27). The admin stores the template on the lead and queues it
     directly, as before. A salesperson cannot write the lead row: they choose the opener here and
     sales_queue_opener stores THAT template and queues it, with the same never-contacted, UK-mobile,
     opt-out and ownership checks — or says why it did not. */
  const perms = useLeadPermissions();
  const salesPath = !perms.queueControls;
  const [salesTemplate, setSalesTemplate] = useState('');
  const template = salesPath ? salesTemplate : (lead.whatsapp_template ?? '');
  const hover = useTemplateHover();
  const queued = lead.status === 'queued';
  /* ⛔ THE QUEUED LINE SAYS WHETHER THE QUEUE IS ACTUALLY SENDING (2026-09-28): paused by the admin
     outranks the sending window, and an unreadable state never claims it will send. */
  const queueLine = queuedLeadLine(useQueueState(queued), lead.phone);
  /* A salesperson's single-lead queue is the bulk opener path, so it offers the approved openers. */
  const options = salesPath ? WHATSAPP_TEMPLATES.filter((t) => isInitialOpener(t.value)) : WHATSAPP_TEMPLATES;
  /* A template must be CHOSEN before this lead can be queued. Only a name that is currently in the
     allowlist counts: a lead can be carrying a value from a removed or renamed template, and
     inheriting that silently is the same problem as substituting one. Removing from the queue is
     always allowed — being unable to cancel because of a bad template would be worse. */
  /* Both openers are ordinary choices (src/lib/openerVariant.ts): only Meta approval can refuse one. */
  const approval = template ? getTemplateSendability(template, { shareToken: null }, {}) : { ok: true as const };
  const templateChosen = !!template && options.some((t) => t.value === template) && approval.ok;

  const salesQueue = async () => {
    if (!templateChosen) return;
    setBusy(true);
    try {
      const r = await salesQueueOpener([lead.id], template);
      if (!r.ok) { toast({ title: 'Not queued', description: refusalText(r.error), variant: 'destructive' }); return; }
      const skipped = Object.keys((r.skipped ?? {}) as Record<string, number>);
      if (!r.queued) {
        toast({ title: 'Not queued', description: skipped.map((k) => QUEUE_SKIP_LABEL[k] ?? k).join(', ') || 'Refused', variant: 'destructive' });
        return;
      }
      const st = await fetchQueueState().catch(() => null);
      toast({ title: 'Queued for WhatsApp', description: `${template} — ${queuedLeadLine(st, lead.phone).text} The queue re-checks it before it sends.` });
      window.dispatchEvent(new CustomEvent('lead-row-changed', { detail: { leadId: lead.id } }));
    } finally { setBusy(false); }
  };

  const toggleQueue = async () => {
    // Guard as well as the disabled button: the button can be bypassed by a stale render, and this
    // write is the thing that decides what a real business receives.
    if (!queued && !templateChosen) return;
    setBusy(true);
    try {
      if (queued) {
        // Restore the status the lead had BEFORE queueing (fallback not_contacted).
        await onUpdate(lead.id, {
          status: lead.previous_status ?? 'not_contacted',
          previous_status: null,
          queued_at: null,
          contact_method: null, // clear the WhatsApp tag set at queue-time
        });
      } else {
        // Tier-1 offline line-type gate: only mobiles may be queued. A non-mobile
        // (landline/VoIP/etc.) is flagged 'no_whatsapp_needs_sms' instead of queued — the
        // status name is historical; it is the landline marker, and no send is ever attempted.
        const { lineType, whatsappEligible } = classifyLineType(lead.phone, lead.country);
        if (!whatsappEligible) {
          await onUpdate(lead.id, {
            status: 'no_whatsapp_needs_sms',
            line_type: lineType,
            line_type_checked_at: new Date().toISOString(),
          });
          return;
        }
        await onUpdate(lead.id, {
          status: 'queued',
          previous_status: lead.status, // capture pre-queue status for restore-on-cancel
          queued_at: new Date().toISOString(),
          // The operator's OWN choice, never a substitute. This was
          //   whatsapp_template: template || 'booking_page_intro'
          // so queueing without touching the picker wrote a barber booking-page pitch onto the
          // lead, and the queue would later send it. The picker shows "Choose a template" in that
          // state, so nothing on screen said a template had been decided — the value appeared out
          // of nowhere and looked chosen. The button is now disabled until one is picked, and this
          // write is unreachable without it.
          whatsapp_template: template,
          whatsapp_attempts: 0, // fresh retries (e.g. re-queuing a whatsapp_failed lead)
          line_type: lineType, // cache the offline result
          contact_method: 'whatsapp', // attribute to WhatsApp immediately
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

      {lead.status === 'no_whatsapp' ? (
        <p className="text-xs leading-relaxed text-amber-500">
          Not on WhatsApp — this number can't receive WhatsApp. Reach them by call or email instead.
        </p>
      ) : lead.status === 'no_whatsapp_needs_sms' ? (
        <p className="text-xs leading-relaxed text-cyan-500">
          Landline{lead.line_type && lead.line_type !== 'landline' ? ` (${lead.line_type})` : ''} — flagged, not queued. It can't receive WhatsApp.
        </p>
      ) : lead.whatsapp_sent_at ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-green-500" />
          Sent {new Date(lead.whatsapp_sent_at).toLocaleDateString()}
          {lead.whatsapp_template ? ` · ${lead.whatsapp_template}` : ''}
          {lead.whatsapp_delivery_status ? ` (${lead.whatsapp_delivery_status})` : ''}
        </p>
      ) : (
        <>
          {lead.status === 'whatsapp_failed' && (
            <p className="mb-2 text-[11px] leading-relaxed text-orange-400">
              Previous WhatsApp send failed (temporary). You can re-queue to try again.
            </p>
          )}
          <label className="mb-1 block text-[11px] text-muted-foreground">Template</label>
          <Select value={template} disabled={salesPath && queued} onOpenChange={hover.onOpenChange} onValueChange={(v) => (salesPath ? setSalesTemplate(v) : onUpdate(lead.id, { whatsapp_template: v }))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={salesPath && queued ? (lead.whatsapp_template ?? 'Queued') : 'Choose a template'} /></SelectTrigger>
            <SelectContent>
              {options.map((t) => {
                const o = getTemplateSendability(t.value, { shareToken: null }, {});
                return <SelectItem key={t.value} value={t.value} disabled={isInitialOpener(t.value) && !o.ok} {...hover.itemProps(t.value)}>{t.label}{isInitialOpener(t.value) && !o.ok ? ` — ${o.reason}` : ''}</SelectItem>;
              })}
              <TemplateWordingInList hovered={hover.hovered} values={{ businessName: lead.business_name, firstName: lead.contact_name, town: lead.derived_town ?? lead.search_location, trade: lead.search_keyword }} />
            </SelectContent>
          </Select>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/60">
            Sends the chosen template with the business name + this lead's claim link.
          </p>
          <TemplateWordingPreview className="mt-2" hovered={null} selected={template}
            values={{ businessName: lead.business_name, firstName: lead.contact_name, town: lead.derived_town ?? lead.search_location, trade: lead.search_keyword }} />
          <RequestTemplateButton source="lead" />
          {!(salesPath && queued) && <Button
            size="sm"
            variant={queued ? 'outline' : 'default'}
            className="mt-2.5 h-7 w-full gap-1.5 text-xs"
            onClick={salesPath ? salesQueue : toggleQueue}
            disabled={busy || (!queued && !templateChosen)}
            title={!queued && !templateChosen ? 'Choose a template first' : undefined}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : queued ? <X className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
            {queued ? 'Remove from queue' : 'Add to WhatsApp queue'}
          </Button>}
          {/* Says why the button is dead. A disabled control with no explanation reads as a bug,
              and the picker's own placeholder is easy to miss. */}
          {!queued && template && !approval.ok && (
            <p className="mt-1.5 text-center text-[10px] text-orange-400">{approval.reason}</p>
          )}
          {!queued && !templateChosen && (
            <p className="mt-1.5 text-center text-[10px] text-orange-400">
              Choose a template above before queueing — nothing is picked by default.
            </p>
          )}
          {queued && (
            <p className={`mt-1.5 text-center text-[10px] ${queueLine.tone === 'paused' ? 'font-medium text-amber-500' : 'text-sky-400'}`} data-testid="queued-line">
              {lead.whatsapp_template ? `${lead.whatsapp_template} · ` : ''}{queueLine.text}{salesPath ? ' Ask the admin to take it out of the queue.' : ''}
            </p>
          )}
        </>
      )}
    </section>
  );
}
