import { useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, CircleSlash, ClipboardCheck, ClipboardCopy, History, Loader2, Pencil, PhoneCall, Send, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { clientSetupUrl } from '@/config/findableSite';
import { DELIVERY_STAGES, DELIVERY_STAGE_LABEL, type DeliveryStage, type DeliveryState, type NextStep } from '@/lib/deliveryStage';
import { handoffSummaryLines, type HandoffApplies, type HandoffFieldKey, type SalesHandoffFields, type SalesHandoffRecord } from '@/lib/salesHandoff';
import type { HandoffReadiness, HandoffWho } from '@/lib/handoffReadiness';
import { ACTIVITY_LABEL } from '@/lib/salesCrm';
import { SalesHandoffForm } from '@/components/SalesHandoffForm';
import { cn } from '@/lib/utils';
import { Callout, EDGE, IconTile, SubSection, SURFACE, TONE, ToneChip, type Tone } from '@/components/operator/ui';
import { firstContactDueLabel, type FirstContactChannel, type FirstContactView } from '@/lib/firstContact';
import { ClientMissingInfoPanel, type MissingInfoView } from '@/components/ClientMissingInfoPanel';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CLIENT SETUP — the production line at the top of a paid client's page (2026-10-02,
   docs/paid-client-automation.md). Where the client is in delivery, the setup checklist (required /
   not needed, who owes each missing item), ONE next step, the salesperson's handoff, the client's own
   setup link, Submit for delivery, and the History of what happened. Every value comes from
   paid-client-hub `get` → _shared/client-setup.ts; nothing here decides.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface SetupView {
  ready: boolean; label: string; missing: string[]; done: number; total: number; waiting_on: HandoffWho | null;
  stage: DeliveryStage | 'ended'; stage_label: string; state: DeliveryState; state_label: string; next: NextStep;
  /** Paul's first contact after payment (src/lib/firstContact.ts). Absent on an older server. */
  first_contact?: FirstContactView;
}
export interface SetupHandoff {
  readiness: HandoffReadiness;
  setup: SetupView;
  sales_handoff: { applies: HandoffApplies; saved: SalesHandoffRecord | null; fields: SalesHandoffFields; prefilled: HandoffFieldKey[]; saved_by: string | null; completed_at: string | null; saved_at?: string | null };
  /** Missing information + Ask salesperson / Contact client (src/lib/clientMissingInfo.ts). Absent on an older server. */
  missing_info?: MissingInfoView;
  submitted_at: string | null;
  submitted_by: string | null;
  onboarding_id: string | null;
  history: Array<{ id: string; kind: string; body: string | null; actor: string; created_at: string }>;
}

export const STATE_TONE: Record<DeliveryState, string> = {
  waiting_sales: 'bg-amber-700 text-white hover:bg-amber-700', waiting_client: 'bg-amber-700 text-white hover:bg-amber-700', waiting_findable: 'bg-sky-700 text-white hover:bg-sky-700',
  ready_to_submit: 'bg-teal-700 text-white hover:bg-teal-700', ready: 'bg-emerald-700 text-white hover:bg-emerald-700', in_delivery: 'bg-indigo-600 text-white hover:bg-indigo-600', ended: 'bg-slate-600 text-white hover:bg-slate-600',
};
/** The same states in the shared tones (operator/ui.tsx): the left edge of a client card, the chip colour. */
export const STATE_EDGE: Record<DeliveryState, Tone> = {
  waiting_sales: 'amber', waiting_client: 'amber', waiting_findable: 'blue', ready_to_submit: 'green', ready: 'green', in_delivery: 'purple', ended: 'grey',
};
const WHO: Record<HandoffWho, string> = { sales: 'Sales', client: 'Client', findable: 'Findable' };
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '';

export function ClientSetupCard({ leadId, businessName = null, h, route, onChanged, onOpenBaseline }: {
  leadId: string; businessName?: string | null; h: SetupHandoff; route: 'build' | 'optimise' | null; onChanged: () => void; onOpenBaseline: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const s = h.setup;
  const r = h.readiness;
  const sh = h.sales_handoff;
  const items = r.items.filter((i) => i.key !== 'hook_audit');
  const currentIndex = DELIVERY_STAGES.indexOf(s.stage as DeliveryStage);

  const run = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try { await fn(); toast({ title: ok }); onChanged(); return true; }
    catch (e) { toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' }); return false; }
    finally { setBusy(null); }
  };
  const submit = () => run('submit', () => invokeEdge('paid-client-hub', { action: 'submit_delivery', lead_id: leadId }), 'Submitted for delivery');
  const confirmGbp = () => run('gbp', () => invokeEdge('paid-client-hub', { action: 'confirm_gbp', lead_id: leadId }), 'GBP access confirmed');
  /* Paul records the first contact (pre-sales fix 03): once, with how it was made. */
  const recordContact = (via: FirstContactChannel) => run(`contact_${via}`, () => invokeEdge('paid-client-hub', { action: 'record_first_contact', lead_id: leadId, via }), 'First contact recorded');
  const fc = s.first_contact;
  const contactOwed = !!fc && (fc.state === 'owed' || fc.state === 'overdue');
  const saveHandoff = async (f: SalesHandoffFields) => {
    const ok = await run('handoff', () => invokeEdge('quick-close', { mode: 'save_handoff', lead_id: leadId, handoff: f }), 'Handoff saved');
    if (ok) setEditing(false);
    return ok;
  };
  const go = (section: string) => document.getElementById(`hub-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const nextAction = () => {
    const k = s.next.key;
    if (k === 'submit') return void submit();
    if (k === 'confirm_gbp') return void confirmGbp();
    if (k === 'complete_handoff') return setEditing(true);
    if (k === 'run_discovery' || k === 'review_questions' || k === 'run_baseline') return onOpenBaseline();
    if (k === 'contact_client') return document.getElementById('setup-first-contact')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    go(s.next.section);
  };
  const setupLink = h.onboarding_id ? clientSetupUrl(h.onboarding_id, leadId) : null;
  const copyLink = async () => {
    if (!setupLink) return;
    try { await navigator.clipboard.writeText(setupLink); toast({ title: 'Client setup link copied' }); }
    catch { toast({ title: 'Copy blocked by the browser', description: setupLink, variant: 'destructive' }); }
  };
  const handoffLines = handoffSummaryLines(sh.saved);

  const tone = STATE_EDGE[s.state];
  const handoffTone: Tone = sh.applies !== 'required' ? 'grey' : sh.completed_at ? 'green' : 'amber';

  return (
    <section id="hub-setup" data-testid="client-setup" className={cn(SURFACE, 'min-w-0 space-y-5 p-4 sm:p-5', EDGE[tone])}>
      {/* Where they are, and the one thing to do next. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={ClipboardCheck} tone={tone} />
          <div className="min-w-0 space-y-1">
            <ToneChip tone={tone} dot testId="setup-state" className="text-xs">{s.state_label}</ToneChip>
            <p className="text-sm text-muted-foreground">Setup <span className="font-semibold tabular-nums text-foreground">{s.done}/{s.total}</span> complete{h.submitted_at ? ` · submitted for delivery ${day(h.submitted_at)}${h.submitted_by ? ` by ${h.submitted_by}` : ''}` : ''}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2 ring-1 ring-inset ring-border/40" data-testid="setup-next">
          <span className="min-w-0 text-sm">Next step: <span className="font-semibold">{s.next.label}</span></span>
          {s.next.action && (
            <Button size="sm" onClick={nextAction} disabled={!!busy}>
              {busy && (busy === 'submit' || busy === 'gbp') ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : s.next.key === 'submit' ? <Send className="mr-1 h-4 w-4" /> : <ArrowRight className="mr-1 h-4 w-4" />}
              {s.next.key === 'submit' ? 'Submit for delivery' : 'Go'}
            </Button>
          )}
        </div>
      </div>

      {/* FIRST CONTACT IS PAUL'S (pre-sales fix 03): the client was told "within two working days". */}
      {contactOwed && fc && (
        <div id="setup-first-contact" data-testid="setup-first-contact">
          <Callout tone={fc.state === 'overdue' ? 'red' : 'blue'} icon={PhoneCall}
            title={<>
              First contact is yours — introduce yourself and send the setup link
              <span className={cn('ml-1 font-normal', fc.state === 'overdue' ? TONE.red.text : 'text-muted-foreground')}>
                {fc.state === 'overdue' ? `· overdue since ${firstContactDueLabel(fc.due)}` : `· by ${firstContactDueLabel(fc.due)}`}
              </span>
            </>}>
            <p className="text-xs text-muted-foreground">They were told we would be in touch within two working days. The salesperson's part is done. Once you have spoken to them or sent the link, record it here.</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {setupLink && <Button size="sm" variant="outline" onClick={() => void copyLink()}><ClipboardCopy className="mr-1 h-4 w-4" />Copy client setup link</Button>}
              {(['phone', 'email', 'whatsapp'] as const).map((via) => (
                <Button key={via} size="sm" onClick={() => void recordContact(via)} disabled={!!busy}>
                  {busy === `contact_${via}` ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                  Done by {via === 'whatsapp' ? 'WhatsApp' : via}
                </Button>
              ))}
            </div>
          </Callout>
        </div>
      )}

      {/* MISSING INFORMATION (2026-10-05): what is missing, Ask salesperson, Contact client — one place. */}
      {h.missing_info && <ClientMissingInfoPanel leadId={leadId} businessName={businessName} mi={h.missing_info} setupLink={setupLink} onChanged={onChanged} />}

      {/* The pipeline — the real stages, the current one marked. Wraps on a phone, never scrolls sideways. */}
      <ol className="flex flex-wrap gap-1.5 text-[11px]" aria-label="Delivery stages">
        {DELIVERY_STAGES.map((st, i) => (
          <li key={st} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 ring-inset',
            s.stage === 'ended' ? 'text-muted-foreground ring-border/60'
              : i < currentIndex ? cn(TONE.green.soft, TONE.green.text, TONE.green.ring)
              : i === currentIndex ? cn(TONE[tone].solid, 'font-semibold ring-transparent')
              : 'text-muted-foreground ring-border/60')}
            aria-current={i === currentIndex ? 'step' : undefined}>
            {s.stage !== 'ended' && i < currentIndex && <CheckCircle2 className="h-3 w-3 shrink-0" />}
            {DELIVERY_STAGE_LABEL[st]}
          </li>
        ))}
      </ol>

      {/* The checklist: required, not needed, and who owes each missing item. */}
      <ul className="grid gap-2 text-sm sm:grid-cols-2" data-testid="setup-checklist">
        {items.map((i) => (
          <li key={i.key} className={cn('flex min-w-0 items-start gap-2 rounded-xl border border-border/60 bg-muted/20 p-3',
            i.notNeeded ? EDGE.grey : i.ok ? EDGE.green : i.required ? EDGE.amber : EDGE.grey)} data-testid={`setup-${i.key}`}>
            {i.notNeeded ? <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              : i.ok ? <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', TONE.green.text)} />
              : <Circle className={cn('mt-0.5 h-4 w-4 shrink-0', i.required ? TONE.amber.text : 'text-muted-foreground')} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className={cn('font-medium', i.notNeeded && 'text-muted-foreground')}>{i.label}</span>
                {!i.ok && i.required && <ToneChip tone="amber">{WHO[i.who]}</ToneChip>}
                {!i.required && !i.notNeeded && <span className="text-xs text-muted-foreground">· optional</span>}
              </div>
              <div className="mt-0.5 break-words text-xs text-muted-foreground">{i.detail}</div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {setupLink && (
          <Button size="sm" variant="outline" onClick={() => void copyLink()} title="The client's own form for the details they still owe (services, towns, Google access)">
            <ClipboardCopy className="mr-1 h-4 w-4" />Copy client setup link
          </Button>
        )}
        {r.items.some((i) => i.key === 'gbp_access' && !i.ok && i.who === 'findable') && s.next.key !== 'confirm_gbp' && (
          <Button size="sm" variant="outline" onClick={() => void confirmGbp()} disabled={!!busy}>Confirm GBP access arrived</Button>
        )}
        {r.ready && !h.submitted_at && s.next.key !== 'submit' && (
          <Button size="sm" variant="outline" onClick={() => void submit()} disabled={!!busy}><Send className="mr-1 h-4 w-4" />Submit for delivery</Button>
        )}
      </div>

      {/* The salesperson's handoff. */}
      <SubSection title="Sales handoff" icon={UserRound} tone={handoffTone} testId="setup-sales-handoff" className="border-t border-border/60 pt-4"
        action={<span className={cn('text-xs font-medium', handoffTone === 'grey' ? 'text-muted-foreground' : TONE[handoffTone].text)}>
          {sh.applies !== 'required' ? (sh.applies === 'not_needed_own_sale' ? "Not needed — your own sale" : sh.applies === 'not_recorded_before' ? 'Not recorded — paid before handoffs existed' : 'Not needed — no salesperson')
            : sh.completed_at ? `Complete${sh.saved_by ? ` · ${sh.saved_by}` : ''}` : 'Not complete — the salesperson owes it'}
        </span>}>
        {/* Someone else sold it: who, their handoff, and Paul's request to them (2026-10-05). */}
        {sh.applies === 'required' && (
          <p className="text-xs text-muted-foreground" data-testid="handoff-seller">
            Salesperson: <span className="font-medium text-foreground">{h.missing_info?.ask.seller_name ?? sh.saved_by ?? 'Not recorded'}</span>
            {sh.saved_at ? ` · last update ${day(sh.saved_at)}` : ' · nothing saved yet'}
            {h.missing_info?.request.state === 'pending' ? ` · info requested ${day(h.missing_info.request.requestedAt)}` : ''}
            {h.missing_info?.request.state === 'answered' ? ` · answered ${day(h.missing_info.request.answeredAt)}` : ''}
          </p>
        )}
        {!editing && (handoffLines.length
          ? <ul className="mt-2 space-y-1 text-sm">{handoffLines.map((l) => <li key={l} className="break-words">{l}</li>)}</ul>
          : <p className="mt-1 text-xs text-muted-foreground">Nothing given yet.</p>)}
        {!editing && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)} className="mt-1 -ml-2 h-9 px-2 text-xs text-primary"><Pencil className="mr-1 h-3.5 w-3.5" />{handoffLines.length ? 'Edit' : 'Fill it in'}</Button>}
        {editing && <div className="mt-3"><SalesHandoffForm fields={sh.fields} prefilled={sh.prefilled} route={route} onSave={saveHandoff} busy={busy === 'handoff'} /></div>}
      </SubSection>

      {/* History — the meaningful events only. */}
      <details className="border-t border-border/60 pt-4" data-testid="setup-history">
        <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-bold tracking-tight"><History className="h-4 w-4 text-muted-foreground" />History<span className="font-normal text-muted-foreground">· {h.history.length}</span></summary>
        {h.history.length === 0
          ? <p className="mt-2 text-xs text-muted-foreground">Nothing recorded yet.</p>
          : <ul className="mt-2 max-h-72 divide-y divide-border/50 overflow-y-auto text-xs">
              {h.history.map((a) => (
                <li key={a.id} className="py-1.5"><span className="font-medium">{a.body || ACTIVITY_LABEL[a.kind] || a.kind}</span><span className="text-muted-foreground"> · {a.actor} · {day(a.created_at)}</span></li>
              ))}
            </ul>}
      </details>
    </section>
  );
}
