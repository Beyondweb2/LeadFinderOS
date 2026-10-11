import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, CheckCheck, Clock, FlaskConical, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import { getTemplateSendability } from '@/lib/whatsappTemplates';
import { readableTemplateBody } from '@/lib/templateBodies';
import { unresolvedTokens } from '@/lib/leadUtils';
import { serviceWindowState } from '@/lib/serviceWindow';
import { resolveLeadReport, type ResolvableAudit } from '@/lib/auditReportResolver';
import { whatsAppLinkForLead } from '@/lib/conversationState';
import { LEAD_CHANGED_EVENT, notifyLeadChanged } from '@/lib/leadSync';
import { sendWhatsAppRequest } from '@/lib/whatsAppSendRequest';

/* ══ ONE LEAD'S WHATSAPP, IN A DIALOG (2026-10-11) — the twin of LeadSmsPanel ══════════════════════════════════════════════
   The Outreach WhatsApp button opens this instead of jumping to the Inbox: the recent thread, the approved-template picker
   (default: the original opener) with this lead's name filled into the preview, Send template, and a free-text box.
   ⛔ IT SENDS THROUGH THE INBOX'S OWN REQUEST (sendWhatsAppRequest → send-whatsapp-message) with the same arguments the Inbox
   passes — the server decides everything (cold vs continuation, the one opener, opt-outs, the 24-hour window, QA holds). It
   writes nothing itself: no status, no Next Action, no queue row. The picker's enable/disable is the Inbox's rule
   (getTemplateSendability); what this screen cannot judge (a site fault / site findings) stays disabled — the safe direction —
   and is sent from the Inbox.
   ⛔ The preview is the parity-tested transcript mirror (readableTemplateBody), the same words the Inbox shows after sending. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const THREAD_LIMIT = 50;
const DEFAULT_TEMPLATE = 'initial_contact';

export interface WhatsAppDialogLead {
  id: string;
  business_name: string;
  phone?: string | null;
  country?: string | null;
  derived_town?: string | null;
  search_location?: string | null;
  search_keyword?: string | null;
}

interface WaRow { id: string; direction: 'inbound' | 'outbound'; body: string | null; message_type: string | null; template_name: string | null; created_at: string; status: string | null }

const clock = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

function Mark({ m }: { m: WaRow }) {
  if (m.direction === 'inbound') return null;
  const s = m.status;
  if (s === 'simulated') return <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300"><FlaskConical className="h-3 w-3" />Test only — not sent</span>;
  if (s === 'failed' || s === 'failed_temporary') return <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-300"><AlertTriangle className="h-3 w-3" />Not delivered</span>;
  if (s === 'read') return <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-300"><CheckCheck className="h-3 w-3" />Read</span>;
  if (s === 'delivered') return <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300"><CheckCheck className="h-3 w-3" />Delivered</span>;
  if (s === 'sent') return <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />Sent</span>;
  return <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Sending</span>;
}

const ERROR_WORDS: Record<string, string> = {
  window_closed: 'The 24h reply window is closed — send an approved template instead.',
  forbidden: 'You can only message your own conversations.',
  template_needs_lead: 'A template needs a linked lead.',
  audit_reply_unavailable: 'Audit report not ready for this lead — run an audit first.',
};

export function LeadWhatsAppPanel({ lead, height = 'max-h-[320px]', className }: { lead: WhatsAppDialogLead; height?: string; className?: string }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const endRef = useRef<HTMLDivElement>(null);
  const phone = (lead.phone ?? '').trim();

  const thread = useQuery({
    queryKey: ['lead-whatsapp-dialog', lead.id],
    enabled: !!lead.id,
    staleTime: 10_000,
    queryFn: async (): Promise<WaRow[]> => {
      const { data, error } = await sb.from('whatsapp_messages').select('id, direction, body, message_type, template_name, created_at, status')
        .eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(THREAD_LIMIT);
      if (error) throw error;
      return ((data ?? []) as WaRow[]).reverse();
    },
  });
  /* The lead's report, for the audit templates' gate — the SAME resolver the Inbox uses. A failed read leaves it null, which
     keeps those templates disabled (the safe direction). */
  const report = useQuery({
    queryKey: ['lead-whatsapp-dialog-report', lead.id],
    enabled: !!lead.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb.from('ai_audits').select('id, short_code, lead_id, created_at, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(status)')
        .eq('lead_id', lead.id).order('created_at', { ascending: false }).limit(20);
      if (error) return null;
      return resolveLeadReport((data ?? []) as ResolvableAudit[], lead.id);
    },
  });
  useEffect(() => {
    const re = (e: Event) => { if ((e as CustomEvent<{ leadId?: string }>).detail?.leadId === lead.id) void thread.refetch(); };
    window.addEventListener(LEAD_CHANGED_EVENT, re);
    return () => window.removeEventListener(LEAD_CHANGED_EVENT, re);
  }, [lead.id, thread]);

  const rows = useMemo(() => thread.data ?? [], [thread.data]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [rows.length]);
  const lastInboundAt = [...rows].reverse().find((m) => m.direction === 'inbound')?.created_at ?? null;
  const win = serviceWindowState(lastInboundAt);

  const sendability = (name: string) => getTemplateSendability(name, { shareToken: null }, { reportSlug: report.data?.auditId ?? null, hasSiteFault: false, hasSiteFindings: false });
  const [tpl, setTpl] = useState(DEFAULT_TEMPLATE);
  const chosenOk = sendability(tpl);
  const vars = {
    businessName: lead.business_name,
    town: lead.derived_town ?? lead.search_location ?? null,
    trade: lead.search_keyword ?? null,
  };
  const preview = readableTemplateBody(null, tpl, { ...vars, sentAt: new Date().toISOString() });

  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'template' | 'text' | null>(null);

  const finish = (r: Awaited<ReturnType<typeof sendWhatsAppRequest>>) => {
    if (!r.ok) {
      toast({ title: 'Not sent', description: r.reason ?? ERROR_WORDS[r.error ?? ''] ?? r.error ?? 'Send failed.', variant: 'destructive' });
      return false;
    }
    toast({ title: r.simulated ? 'Sent (simulated — test mode)' : 'Sent ✓' });
    void thread.refetch();
    notifyLeadChanged(lead.id); // every screen re-reads the lead (the server may have moved its status)
    return true;
  };
  const sendTemplate = async () => {
    if (busy || !phone || !tpl || !chosenOk.ok) return;
    // The Inbox's rule: a repeat of a template this lead already had carries the explicit server override.
    const alreadySent = rows.some((m) => m.direction === 'outbound' && m.template_name === tpl);
    setBusy('template');
    try { finish(await sendWhatsAppRequest(sb, { phone, leadId: lead.id, country: lead.country ?? null, templateName: tpl, allowResend: alreadySent })); } finally { setBusy(null); }
  };
  const sendText = async () => {
    const body = text.trim();
    if (busy || !phone || !body) return;
    const left = unresolvedTokens(body);
    if (left.length) { toast({ title: 'Fill in the blanks first', description: `This message still contains ${left.join(', ')}. Replace it with the real wording, then send.`, variant: 'destructive' }); return; }
    setBusy('text');
    try { if (finish(await sendWhatsAppRequest(sb, { phone, leadId: lead.id, country: lead.country ?? null, body }))) setText(''); } finally { setBusy(null); }
  };

  return (
    <div className={cn('space-y-2.5', className)} data-testid="lead-whatsapp-panel">
      <div className={cn('overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-2.5', height)} data-testid="whatsapp-thread" aria-live="polite">
        {thread.isLoading ? <p className="flex items-center gap-2 p-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading messages…</p>
          : thread.isError ? <p className="p-2 text-xs text-red-600 dark:text-red-300">Could not load the messages. <button type="button" className="underline" onClick={() => void thread.refetch()}>Try again</button></p>
          : rows.length === 0 ? <p className="p-2 text-xs text-muted-foreground" data-testid="whatsapp-no-messages">No messages yet.</p>
          : (
            <ul className="space-y-1.5">
              {rows.map((m) => (
                <li key={m.id} className={cn('flex flex-col', m.direction === 'outbound' ? 'items-end' : 'items-start')}>
                  <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm', m.direction === 'outbound' ? 'rounded-br-md bg-emerald-600 text-white' : 'rounded-bl-md bg-card text-foreground ring-1 ring-border/60')}>
                    {readableTemplateBody(m.body, m.template_name, { businessName: lead.business_name, sentAt: m.created_at }) || `[${m.message_type ?? 'message'}]`}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">{clock(m.created_at)}<Mark m={m} /></div>
                </li>
              ))}
            </ul>
          )}
        <div ref={endRef} />
      </div>

      {!phone ? (
        <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground" data-testid="whatsapp-no-phone">This lead has no phone number to message.</p>
      ) : (
        <>
          <div className="space-y-1.5 rounded-xl border border-border/60 bg-card/60 p-2.5" data-testid="whatsapp-template-picker">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Send a template</p>
            <Select value={tpl} onValueChange={setTpl}>
              <SelectTrigger className="h-9" aria-label="Template"><SelectValue placeholder="Choose a template" /></SelectTrigger>
              <SelectContent>
                {WHATSAPP_TEMPLATES.map((t) => {
                  const s = sendability(t.value);
                  return (
                    <SelectItem key={t.value} value={t.value} disabled={!s.ok}>
                      <span className="flex flex-col">
                        <span>{t.label}</span>
                        {!s.ok && <span className="text-[10px] text-amber-600">{s.reason}</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white" data-testid="whatsapp-template-preview">{preview}</p>
            {!chosenOk.ok && <p className="text-[11px] text-amber-700 dark:text-amber-300" data-testid="whatsapp-template-blocked">{chosenOk.reason}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">The server fills in the details and checks it is allowed before it goes.</p>
              <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 font-bold text-white hover:bg-emerald-700" disabled={!!busy || !tpl || !chosenOk.ok} onClick={() => void sendTemplate()} data-testid="whatsapp-send-template">
                {busy === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send template
              </Button>
            </div>
          </div>

          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} placeholder={win.open ? 'Or write a message…' : 'Free text opens for 24 hours after they reply'} aria-label="WhatsApp message"
            disabled={!win.open}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendText(); }} className="resize-none text-sm" data-testid="whatsapp-input" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground" data-testid="whatsapp-window">
              {win.open ? `Reply window open — about ${win.hoursLeft} hour${win.hoursLeft === 1 ? '' : 's'} left.` : 'Outside the 24-hour reply window, only an approved template can be sent.'}
            </p>
            <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 font-bold text-white hover:bg-emerald-700" disabled={!!busy || !win.open || !text.trim()} onClick={() => void sendText()} data-testid="whatsapp-send">
              {busy === 'text' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send
            </Button>
          </div>
        </>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => navigate(whatsAppLinkForLead(lead.id))} data-testid="whatsapp-open-inbox">Open the full conversation in the Inbox<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
