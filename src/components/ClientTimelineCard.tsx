/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CLIENT TIMELINE CARD — the v3 Client Service Agreement's dates on the Paid Client page (2026-10-05).

   ACCESS DATE (5.1) → BASELINE (5.2) → RESULTS DATE (5.3) → REFUND WINDOW (5.4) → APPROVAL / PAYMENT START
   DATE (5.6) → MINIMUM TERM → CONTINUING SERVICE (9A). Every date is derived on the server by
   src/lib/clientTimeline.ts from the facts Paul records here; nothing is guessed in the browser.
   ⛔ Only a client on the v3 terms has a timeline; any other client says so and offers nothing.
   ⛔ The Continuing Service buttons are bookkeeping: nothing here charges the Continuing Service price (manual control, Paul
      2026-10-05). The one Stripe write is "Set Payment Start Date", which the server reads back.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { ukDayWords, type TimelineView } from '@/lib/clientTimeline';

type TermsStatus = {
  on_v3: boolean;
  view?: TimelineView;
  access?: { ready: boolean; missing: string[]; checked: string[] };
  automation?: { clientReminderEmail: boolean; stripeSwitch: boolean; autoState: boolean };
  ceased_reasons?: Record<string, string>;
  terms?: { guarantee_ceased_reason: string | null; access_email_sent_at: string | null; continuing_reminder_sent_at: string | null; continuing_decision: string | null; continuing_prepared_at: string | null };
  events?: Array<{ kind: string; created_at: string; detail: Record<string, unknown> }>;
};

const call = (body: Record<string, unknown>) => invokeEdge<Record<string, any>>('paid-client-hub', body);
const EVENT_WORDS: Record<string, string> = {
  terms_stamped: 'Paid on the signed agreement', access_confirmed: 'Access Date confirmed', access_email_sent: 'Access Date email sent',
  access_email_failed: 'Access Date email NOT sent', guarantee_ceased: 'Guarantee recorded as not applying', payment_start_scheduled: 'Payment Start Date set in Stripe',
  payment_start_refused: 'Payment Start Date not set', continuing_prepared: 'Continuing Service prepared', continuing_reminder_sent: 'Client reminder recorded as sent',
  continuing_will_continue: 'Client will continue', continuing_will_cancel: 'Client will cancel', paid_without_v3_agreement: 'Paid without the v3 agreement',
};

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 py-1.5 text-sm last:border-0">
    <span className="font-semibold uppercase tracking-wide text-muted-foreground text-xs">{label}</span>
    <span className="text-right"><b>{value}</b>{note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}</span>
  </div>;
}

export function ClientTimelineCard({ leadId, ended = false }: { leadId: string; ended?: boolean }) {
  const { toast } = useToast();
  const [s, setS] = useState<TermsStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [accessDay, setAccessDay] = useState('');
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    try { setS(await call({ action: 'terms_status', lead_id: leadId }) as TermsStatus); }
    catch (e) { toast({ title: 'Client timeline', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' }); }
  }, [leadId, toast]);
  useEffect(() => { void load(); }, [load]);
  const act = async (action: string, extra: Record<string, unknown> = {}, done = 'Saved') => {
    setBusy(action);
    try {
      const r = await call({ action, lead_id: leadId, ...extra });
      const ps = r.payment_start as { kind?: string; reason?: string; day?: string } | undefined;
      toast({ title: done, description: r.emailed === false ? `The client email was NOT sent: ${r.email_detail ?? 'unknown'}` : ps?.kind && ps.kind !== 'scheduled' ? `Stripe not updated: ${ps.reason}` : ps?.day ? `Stripe set to ${ps.day}` : undefined });
    } catch (e) {
      toast({ title: 'Not saved', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(''); void load(); }
  };

  if (!s) return <Card><CardContent className="p-4 text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin"/>Loading the client timeline…</CardContent></Card>;
  if (!s.on_v3 || !s.view) {
    return <Card><CardHeader className="pb-2"><CardTitle className="text-base">Client timeline</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground">This client was not sold on the agreement-first Client Service Agreement (v3 or later), so their dates and payments keep the terms they bought under. Nothing here changes them.</CardContent></Card>;
  }
  const v = s.view;
  const mt = v.minimumTerm;
  const spin = (a: string) => busy === a ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : null;
  return <Card data-testid="client-timeline">
    <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarCheck2 className="h-4 w-4"/>Client timeline · {v.continuingGbp === null ? 'fixed-term agreement' : 'agreement-first terms'}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {v.actions.length > 0 && <ul className="space-y-1.5" data-testid="client-timeline-actions">
        {v.actions.map((a) => <li key={a.kind} className={`rounded-lg px-3 py-2 text-sm ${a.urgent ? 'bg-red-500/10 text-red-800 dark:text-red-200' : 'bg-amber-500/10 text-amber-900 dark:text-amber-100'}`}>{a.text}</li>)}
      </ul>}

      <div>
        <Row label="Initial £99" value={ukDayWords(v.initialPaidDay)}/>
        <Row label="Access Date" value={v.accessDate ? ukDayWords(v.accessDate) : 'Not confirmed'} note={v.accessDate ? (s.terms?.access_email_sent_at ? 'Client emailed' : 'Client email NOT sent') : v.accessDeadlineDay ? `Guarantee needs access by ${ukDayWords(v.accessDeadlineDay)}` : undefined}/>
        <Row label="Results due" value={v.resultsTargetDay ? `about ${ukDayWords(v.resultsTargetDay)}` : 'after the Access Date'} note={v.resultsNormalLatestDay ? `normally by ${ukDayWords(v.resultsNormalLatestDay)}` : undefined}/>
        <Row label="Results Date" value={v.resultsDay ? ukDayWords(v.resultsDay) : 'Not sent yet'} note="the day the formal results are actually sent"/>
        <Row label="Refund window ends" value={v.refundWindowEndDay ? ukDayWords(v.refundWindowEndDay) : v.guaranteeApplies ? '14 days after the Results Date' : 'Guarantee does not apply'}/>
        <Row label="Approval / Payment Start" value={v.paymentStart.day ? ukDayWords(v.paymentStart.day) : 'Not known yet'} note={v.paymentStart.day ? (v.paymentStartConfirmed ? 'Stripe confirmed' : 'NOT yet set in Stripe') : v.paymentStart.why}/>
        <Row label="Monthly payments" value={`${mt.recurringPaid} of ${mt.recurringNeeded} collected`} note={mt.finalPaymentDay ? `minimum term ${mt.finalPaymentActual ? 'completed' : 'expected to complete'} ${ukDayWords(mt.finalPaymentDay)}` : undefined}/>
      </div>

      {!ended && !v.accessDate && v.guaranteeApplies && <div className="space-y-1.5 rounded-lg border p-3">
        <p className="text-sm font-semibold">Confirm Access Date</p>
        {s.access && !s.access.ready && <p className="text-xs text-amber-700 dark:text-amber-300">Still missing: {s.access.missing.join(', ')}.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="h-9 w-44" value={accessDay} onChange={(e) => setAccessDay(e.target.value)} aria-label="Access Date (blank = today)"/>
          <Button size="sm" disabled={!!busy || !s.access?.ready} onClick={() => void act('confirm_access_date', accessDay ? { access_date: accessDay } : {}, 'Access Date confirmed')}>{spin('confirm_access_date')}Confirm Access Date</Button>
        </div>
        <p className="text-xs text-muted-foreground">Starts the measurement clock, lets the baseline run, emails the client their Access Date and records it in History.</p>
      </div>}

      {!ended && !v.resultsDay && v.guaranteeApplies && <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">The guarantee no longer applies (clause 5.8)…</summary>
        <div className="mt-2 space-y-2">
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose the reason</option>
            {Object.entries(s.ceased_reasons ?? {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <Button size="sm" variant="destructive" disabled={!!busy || !reason} onClick={() => void act('record_guarantee_ceased', { reason }, 'Recorded')}>{spin('record_guarantee_ceased')}Record and use the six-week fallback</Button>
          <p className="text-xs text-muted-foreground">Monthly payments then start the day after six weeks from the initial payment (clause 5.6) and initial commission is approved then.</p>
        </div>
      </details>}
      {!v.guaranteeApplies && <p className="text-sm text-amber-700 dark:text-amber-300">Guarantee does not apply: {s.terms?.guarantee_ceased_reason}</p>}

      {!ended && v.paymentStart.day && !v.paymentStartConfirmed && <Button size="sm" disabled={!!busy} onClick={() => void act('schedule_payment_start', {}, 'Payment Start Date')}>{spin('schedule_payment_start')}Set Payment Start Date in Stripe</Button>}

      {/* 🔴 v4 (2026-10-06): a fixed-term client (Findable Optimise) has NO Continuing Service — no £29.99 step,
         no reminder, no continue/cancel question. Their card ends at the payment plan. */}
      {!mt.continuingApplies && <div className="space-y-1 rounded-lg border p-3" data-testid="fixed-term-plan">
        <p className="text-sm font-semibold">{mt.planComplete ? 'Payment plan complete' : `Fixed term · ${mt.recurringNeeded + 1} payments in total, then the payments stop`}</p>
        <p className="text-xs text-muted-foreground">{mt.planComplete
          ? `All ${mt.recurringNeeded + 1} payments have been collected${mt.finalPaymentDay ? ` (the last on ${ukDayWords(mt.finalPaymentDay)})` : ''}. Nothing more is charged and there is no Continuing Service on this agreement.`
          : 'No Continuing Service on this agreement: after the last payment nothing more is charged and there is nothing to ask the client.'}</p>
      </div>}

      {mt.continuingApplies && <div className="space-y-1.5 rounded-lg border p-3" data-testid="continuing-service">
        <p className="text-sm font-semibold">Continuing Service · £{v.continuingGbp}/month after the minimum term</p>
        <p className="text-xs text-muted-foreground">
          {mt.continuingStartDay ? <>Starts {ukDayWords(mt.continuingStartDay)} · client reminder due by {ukDayWords(mt.clientReminderDueDay)}{mt.finalPaymentDay ? <> · minimum term {mt.finalPaymentActual ? 'completed' : 'completes'} {ukDayWords(mt.finalPaymentDay)}</> : null}</> : 'Dates appear once the Payment Start Date is known.'}
        </p>
        <p className="text-xs text-muted-foreground">Manual for now: nothing switches to £{v.continuingGbp} in Stripe automatically{s.automation?.stripeSwitch ? '' : ' (automation off)'}. No salesperson commission on it.</p>
        {!ended && <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void act('continuing_prepared', {}, 'Marked prepared')}>{spin('continuing_prepared')}{s.terms?.continuing_prepared_at ? 'Prepared ✓' : 'Prepare Continuing Service'}</Button>
          <Button size="sm" variant="outline" disabled={!!busy || !!s.terms?.continuing_reminder_sent_at} onClick={() => void act('continuing_reminder_sent', {}, 'Client reminder recorded')}>{spin('continuing_reminder_sent')}{s.terms?.continuing_reminder_sent_at ? 'Client reminder sent ✓' : 'Record client reminder sent'}</Button>
          <Button size="sm" variant={s.terms?.continuing_decision === 'continue' ? 'default' : 'outline'} disabled={!!busy} onClick={() => void act('continuing_decision', { decision: 'continue' }, 'Client will continue')}>{spin('continuing_decision')}Client will continue</Button>
          <Button size="sm" variant={s.terms?.continuing_decision === 'cancel' ? 'default' : 'outline'} disabled={!!busy} onClick={() => void act('continuing_decision', { decision: 'cancel' }, 'Client will cancel')}>Client will cancel</Button>
        </div>}
      </div>}

      {(s.events?.length ?? 0) > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">History ({s.events!.length})</summary>
        <ul className="mt-1 space-y-0.5">{s.events!.map((e, i) => <li key={i}>{new Date(e.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} · {EVENT_WORDS[e.kind] ?? e.kind}</li>)}</ul>
      </details>}
    </CardContent>
  </Card>;
}
