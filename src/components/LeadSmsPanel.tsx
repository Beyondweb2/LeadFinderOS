import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCheck, ChevronDown, Clock, FlaskConical, Loader2, MessageSquareText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { markSmsRead, smsKeys, useContactDecision, useSmsThread, type SmsRow } from '@/hooks/useSms';
import { newSendKey, sendSms, type SmsSendOk, type SmsSendRefused } from '@/lib/smsClient';
import { smsSize, costWords, smsCostGbp } from '@/lib/channelCosts';
import { SMS_STATE_LABEL, smsDeliveryState, type SmsTemplateName } from '@/lib/smsMessages';
import { SMS_COLD_CHOICES, SMS_CONVERSATION_CHOICES, smsPreview } from '@/lib/smsPreview';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notifyLeadChanged } from '@/lib/leadSync';

/* ONE LEAD'S TEXT CONVERSATION (2026-10-09): the thread, delivery marks, the composer and the two approved quick
   texts. Used in the prospect workspace and as the right-hand pane of the SMS inbox — one component, so the two can
   never look or behave differently.
   ⛔ Setup / agreement links are NOT sent from here: they are made and sent by Quick Close (the right customer, the
   agreement before payment, the sale credited to the rep). The server refuses a typed link too.
   ⛔ A tick is a carrier receipt: ✓✓ only when the network confirmed delivery; "Sent" is only "handed to the network";
   a text that did not arrive says so, with the way out. */
const clock = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

function Mark({ m }: { m: SmsRow }) {
  if (m.direction === 'inbound') return null;
  const s = m.status;
  if (s === 'simulated') return <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300"><FlaskConical className="h-3 w-3" />Test only — not sent</span>;
  if (s === 'failed' || s === 'undelivered') return <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-300" data-testid="sms-failed"><AlertTriangle className="h-3 w-3" />Not delivered{m.error_code ? ` (${m.error_code})` : ''}</span>;
  if (s === 'delivered') return <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-300"><CheckCheck className="h-3 w-3" />Delivered</span>;
  if (s === 'sent') return <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />Sent</span>;
  return <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Queued</span>;
}

/** The Call tab's "Text messages" block: closed by default (the script and AI result stay the focus), one tap to open. */
export function LeadSmsSection({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-blue-500/30 bg-blue-500/[0.04] p-3 sm:p-3.5" data-testid="text-section">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-[36px] w-full items-center gap-2 text-left text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
        <MessageSquareText className="h-4 w-4" />Text messages<ChevronDown className={cn('ml-auto h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <LeadSmsPanel leadId={leadId} className="mt-2" />}
    </section>
  );
}

export function LeadSmsPanel({ leadId, className, height = 'max-h-[320px]' }: { leadId: string; className?: string; height?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const thread = useSmsThread(leadId);
  const { decision, freeTextOpen, introOpen, lead } = useContactDecision(leadId, 'message');
  const rows = thread.data ?? [];
  const phone = rows[0]?.phone;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const keyRef = useRef(newSendKey());
  const endRef = useRef<HTMLDivElement>(null);
  const sms = decision?.options.find((o) => o.channel === 'sms');
  const state = smsDeliveryState(rows);
  const size = useMemo(() => smsSize(text), [text]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [rows.length]);
  // Opening the thread is reading it (per person, per number) — the unread count follows.
  const hasInbound = rows.some((r) => r.direction === 'inbound');
  useEffect(() => {
    if (!phone || !hasInbound) return;
    void markSmsRead(phone).then(() => qc.invalidateQueries({ queryKey: smsKeys.unread }));
  }, [phone, hasInbound, rows.length, qc]);

  const done = (r: Awaited<ReturnType<typeof sendSms>>, okTitle: string) => {
    if (r.ok) {
      toast({ title: (r as SmsSendOk).simulated ? `${okTitle} (test mode — not sent)` : okTitle, description: (r as SmsSendOk).duplicate ? 'That text had already gone.' : 'Delivery is confirmed once the network reports it.' });
      keyRef.current = newSendKey();
      void qc.invalidateQueries({ queryKey: smsKeys.all });
      notifyLeadChanged(leadId); // a real text moves the lead's Contact Method to Text; every screen re-reads it
    } else {
      toast({ title: 'Text not sent', description: (r as SmsSendRefused).detail, variant: 'destructive' });
    }
    return r.ok;
  };
  const sendText = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy('text');
    try { if (done(await sendSms({ leadId, text: body, key: keyRef.current }), 'Text sent')) setText(''); } finally { setBusy(null); }
  };
  /* THE TEMPLATE PICKER (2026-10-09): SMS carries the existing WhatsApp templates — the two cold openers while the lead is untouched,
     the plain continuations once there is a conversation — and the preview is the exact text the server will send. */
  const choices = [...(introOpen ? SMS_COLD_CHOICES : []), ...(freeTextOpen ? SMS_CONVERSATION_CHOICES : [])];
  const [tpl, setTpl] = useState<SmsTemplateName | ''>('');
  const chosen = (choices.some((c) => c.value === tpl) ? tpl : (choices[0]?.value ?? '')) as SmsTemplateName | '';
  const preview = chosen ? smsPreview(chosen, { business_name: lead?.business_name, derived_town: lead?.derived_town }) : '';
  const previewSize = useMemo(() => smsSize(preview), [preview]);
  const sendTemplate = async () => {
    if (busy || !chosen) return;
    setBusy('template');
    try { done(await sendSms({ leadId, template: chosen, key: newSendKey() }), 'Text sent'); } finally { setBusy(null); }
  };
  const templatePicker = choices.length > 0 && (
    <div className="space-y-1.5 rounded-xl border border-border/60 bg-card/60 p-2.5" data-testid="sms-template-picker">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Send a template (the same wording as WhatsApp)</p>
      <Select value={chosen} onValueChange={(v) => setTpl(v as SmsTemplateName)}>
        <SelectTrigger className="h-9" aria-label="Template"><SelectValue placeholder="Choose a template" /></SelectTrigger>
        <SelectContent>{choices.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
      </Select>
      <p className="whitespace-pre-wrap break-words rounded-lg bg-blue-600 px-3 py-2 text-sm text-white" data-testid="sms-template-preview">{preview}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground" data-testid="sms-template-size">{previewSize.characters} characters · {previewSize.segments} text{previewSize.segments === 1 ? '' : 's'} · {costWords(smsCostGbp(preview))}</p>
        <Button size="sm" className="h-9 gap-1.5 bg-blue-600 font-bold text-white hover:bg-blue-700" disabled={!!busy || !chosen} onClick={() => void sendTemplate()} data-testid="sms-send-template">
          {busy === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send template
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn('space-y-2.5', className)} data-testid="lead-sms-panel">
      <div className={cn('overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-2.5', height)} data-testid="sms-thread" aria-live="polite">
        {thread.isLoading ? <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading texts…</p>
          : rows.length === 0 ? <p className="p-2 text-xs text-muted-foreground">No texts yet.</p>
          : (
            <ul className="space-y-1.5">
              {rows.map((m) => (
                <li key={m.id} className={cn('flex flex-col', m.direction === 'outbound' ? 'items-end' : 'items-start')}>
                  <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm', m.direction === 'outbound' ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md bg-card text-foreground ring-1 ring-border/60')}>{m.body}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">{clock(m.created_at)}<Mark m={m} /></div>
                </li>
              ))}
            </ul>
          )}
        <div ref={endRef} />
      </div>
      {state === 'failed' && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-300" data-testid="sms-failed-help"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />The last text did not arrive. Check the number with them, or try another way to reach them.</p>
      )}
      {sms && !sms.available ? (
        <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground" data-testid="sms-unavailable">{sms.reason}</p>
      ) : (
        <>
          {templatePicker}
          {!freeTextOpen && <p className="text-[11px] text-muted-foreground" data-testid="sms-intro-only">{sms?.reason} They get one approved opener; replies open the conversation.</p>}
          {freeTextOpen && (
            <>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={600} placeholder="Or write a message…" aria-label="Text message"
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendText(); }} className="resize-none text-sm" data-testid="sms-input" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground" data-testid="sms-counter">
                  {size.characters} characters · {size.segments || 0} text{size.segments === 1 ? '' : 's'}{size.segments ? ` · ${costWords(smsCostGbp(text))}` : ''}{size.encoding === 'UCS-2' ? ' · special characters make it longer' : ''}
                </p>
                <Button size="sm" className="h-9 gap-1.5 bg-blue-600 font-bold text-white hover:bg-blue-700" disabled={!!busy || !text.trim()} onClick={() => void sendText()} data-testid="sms-send">
                  {busy === 'text' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send text
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">{SMS_STATE_LABEL[state]}. Links to set up or pay are sent from the Close tab, not typed here.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
