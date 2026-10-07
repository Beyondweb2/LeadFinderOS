/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CLIENT TIMELINE CARD — the v3 Client Service Agreement's dates on the Paid Client page (2026-10-05).

   ACCESS DATE (5.1) → BASELINE (5.2) → RESULTS DATE (5.3) → REFUND WINDOW (5.4) → APPROVAL / PAYMENT START
   DATE (5.6) → MINIMUM TERM → CONTINUING SERVICE (9A). Every date is derived on the server by
   src/lib/clientTimeline.ts from the facts Paul records here; nothing is guessed in the browser.
   ⛔ Only a client on the v3 terms has a timeline; any other client says so and offers nothing.
   ⛔ The Continuing Service buttons are bookkeeping: nothing here charges the Continuing Service price (manual control, Paul
      2026-10-05). The one Stripe write is "Set Payment Start Date", which the server reads back.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarCheck2, CalendarClock, History, Loader2, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout, EDGE, Fact, IconTile, SubSection, SURFACE, TONE, type Tone } from '@/components/operator/ui';
import { cn } from '@/lib/utils';
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
  terms_stamped: 'Paid on the v3 agreement', access_confirmed: 'Access Date confirmed', access_email_sent: 'Access Date email sent',
  access_email_failed: 'Access Date email NOT sent', guarantee_ceased: 'Guarantee recorded as not applying', payment_start_scheduled: 'Payment Start Date set in Stripe',
  payment_start_refused: 'Payment Start Date not set', continuing_prepared: 'Continuing Service prepared', continuing_reminder_sent: 'Client reminder recorded as sent',
  continuing_will_continue: 'Client will continue', continuing_will_cancel: 'Client will cancel', paid_without_v3_agreement: 'Paid without the v3 agreement',
};

/** One date on the timeline — a label/value fact, no box per date. */
function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return <Fact label={label}>
    <span className="font-semibold">{value}</span>{note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}
  </Fact>;
}

/** The card's surface and its icon-tile header — the Paid Client page's stage look. */
function Shell({ title, children, tone = 'blue', testId }: { title: string; children: ReactNode; tone?: Tone; testId?: string }) {
  return <section data-testid={testId} className={cn(SURFACE, 'min-w-0 space-y-4 p-4 sm:p-5')}>
    <header className="flex min-w-0 items-center gap-3">
      <IconTile icon={CalendarCheck2} tone={tone} />
      <h2 className="min-w-0 text-base font-bold leading-tight tracking-tight">{title}</h2>
    </header>
    {children}
  </section>;
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

  if (!s) return <section className={cn(SURFACE, 'min-w-0 p-4 text-sm text-muted-foreground sm:p-5')}><Loader2 className="mr-1 inline h-4 w-4 animate-spin"/>Loading the client timeline…</section>;
  if (!s.on_v3 || !s.view) {
    return <Shell title="Client timeline" tone="grey">
      <p className="text-sm text-muted-foreground">This client was not sold on the v3 Client Service Agreement, so their dates and payments keep the terms they bought under. Nothing here changes them.</p>
    </Shell>;
  }
  const v = s.view;
  const mt = v.minimumTerm;
  const spin = (a: string) => busy === a ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : null;
  return <Shell title="Client timeline · v3 agreement" testId="client-timeline">
      {v.actions.length > 0 && <ul className="space-y-2" data-testid="client-timeline-actions">
        {v.actions.map((a) => <li key={a.kind}><Callout tone={a.urgent ? 'red' : 'amber'} icon={AlertTriangle}>{a.text}</Callout></li>)}
      </ul>}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Row label="Initial £99" value={ukDayWords(v.initialPaidDay)}/>
        <Row label="Access Date" value={v.accessDate ? ukDayWords(v.accessDate) : 'Not confirmed'} note={v.accessDate ? (s.terms?.access_email_sent_at ? 'Client emailed' : 'Client email NOT sent') : v.accessDeadlineDay ? `Guarantee needs access by ${ukDayWords(v.accessDeadlineDay)}` : undefined}/>
        <Row label="Results due" value={v.resultsTargetDay ? `about ${ukDayWords(v.resultsTargetDay)}` : 'after the Access Date'} note={v.resultsNormalLatestDay ? `normally by ${ukDayWords(v.resultsNormalLatestDay)}` : undefined}/>
        <Row label="Results Date" value={v.resultsDay ? ukDayWords(v.resultsDay) : 'Not sent yet'} note="the day the formal results are actually sent"/>
        <Row label="Refund window ends" value={v.refundWindowEndDay ? ukDayWords(v.refundWindowEndDay) : v.guaranteeApplies ? '14 days after the Results Date' : 'Guarantee does not apply'}/>
        <Row label="Approval / Payment Start" value={v.paymentStart.day ? ukDayWords(v.paymentStart.day) : 'Not known yet'} note={v.paymentStart.day ? (v.paymentStartConfirmed ? 'Stripe confirmed' : 'NOT yet set in Stripe') : v.paymentStart.why}/>
        <Row label="Monthly payments" value={`${mt.recurringPaid} of ${mt.recurringNeeded} collected`} note={mt.finalPaymentDay ? `minimum term ${mt.finalPaymentActual ? 'completed' : 'expected to complete'} ${ukDayWords(mt.finalPaymentDay)}` : undefined}/>
      </dl>

      {!ended && !v.accessDate && v.guaranteeApplies && <SubSection title="Confirm Access Date" icon={CalendarClock} tone="amber" className="border-t border-border/60 pt-4">
        <div className="space-y-2">
          {s.access && !s.access.ready && <p className={cn('text-xs', TONE.amber.text)}>Still missing: {s.access.missing.join(', ')}.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="h-9 w-full sm:w-44" value={accessDay} onChange={(e) => setAccessDay(e.target.value)} aria-label="Access Date (blank = today)"/>
            <Button size="sm" disabled={!!busy || !s.access?.ready} onClick={() => void act('confirm_access_date', accessDay ? { access_date: accessDay } : {}, 'Access Date confirmed')}>{spin('confirm_access_date')}Confirm Access Date</Button>
          </div>
          <p className="text-xs text-muted-foreground">Starts the measurement clock, lets the baseline run, emails the client their Access Date and records it in History.</p>
        </div>
      </SubSection>}

      {!ended && !v.resultsDay && v.guaranteeApplies && <details className={cn('rounded-xl border border-border/60 bg-muted/20 p-3 text-sm', EDGE.red)}>
        <summary className="cursor-pointer font-semibold">The guarantee no longer applies (clause 5.8)…</summary>
        <div className="mt-2 space-y-2">
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose the reason</option>
            {Object.entries(s.ceased_reasons ?? {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <Button size="sm" variant="destructive" className="h-auto min-h-9 whitespace-normal" disabled={!!busy || !reason} onClick={() => void act('record_guarantee_ceased', { reason }, 'Recorded')}>{spin('record_guarantee_ceased')}Record and use the six-week fallback</Button>
          <p className="text-xs text-muted-foreground">Monthly payments then start the day after six weeks from the initial payment (clause 5.6) and initial commission is approved then.</p>
        </div>
      </details>}
      {!v.guaranteeApplies && <Callout tone="amber" icon={AlertTriangle}>Guarantee does not apply: {s.terms?.guarantee_ceased_reason}</Callout>}

      {!ended && v.paymentStart.day && !v.paymentStartConfirmed && <Button size="sm" disabled={!!busy} onClick={() => void act('schedule_payment_start', {}, 'Payment Start Date')}>{spin('schedule_payment_start')}Set Payment Start Date in Stripe</Button>}

      {/* v4 (2026-10-07): WHAT FOLLOWS the minimum term is what the client signed (clientTimeline.continuingModeFor). An older server that does not send it only had v3. */}
      {(v.continuingMode ?? 'automatic') === 'none' && <SubSection title="After the minimum term · the plan ends" icon={Repeat} tone="green" testId="continuing-service" className="border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground">Findable Optimise ends after payment {mt.recurringNeeded + 1} and the final service period (v4 clause 15.1). Nothing continues and nothing more is charged.</p>
      </SubSection>}
      {(v.continuingMode ?? 'automatic') !== 'none' && <SubSection title={(v.continuingMode ?? 'automatic') === 'optional' ? `Optional Hosting and Maintenance · £${v.continuingGbp}/month, only if the client opts in` : `Continuing Service · £${v.continuingGbp}/month after the minimum term`} icon={Repeat} tone="green" testId="continuing-service" className="border-t border-border/60 pt-4">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {mt.continuingStartDay ? <>Starts {ukDayWords(mt.continuingStartDay)} · client reminder due by {ukDayWords(mt.clientReminderDueDay)}{mt.finalPaymentDay ? <> · minimum term {mt.finalPaymentActual ? 'completed' : 'completes'} {ukDayWords(mt.finalPaymentDay)}</> : null}</> : 'Dates appear once the Payment Start Date is known.'}
          </p>
          <p className="text-xs text-muted-foreground">{(v.continuingMode ?? 'automatic') === 'optional' ? 'Build does not continue automatically (v4 clause 9A). ' : ''}Manual for now: nothing switches to £{v.continuingGbp} in Stripe automatically{s.automation?.stripeSwitch ? '' : ' (automation off)'}. No salesperson commission on it.</p>
          {!ended && <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void act('continuing_prepared', {}, 'Marked prepared')}>{spin('continuing_prepared')}{s.terms?.continuing_prepared_at ? 'Prepared ✓' : 'Prepare Continuing Service'}</Button>
            <Button size="sm" variant="outline" disabled={!!busy || !!s.terms?.continuing_reminder_sent_at} onClick={() => void act('continuing_reminder_sent', {}, 'Client reminder recorded')}>{spin('continuing_reminder_sent')}{s.terms?.continuing_reminder_sent_at ? 'Client reminder sent ✓' : 'Record client reminder sent'}</Button>
            <Button size="sm" variant={s.terms?.continuing_decision === 'continue' ? 'default' : 'outline'} disabled={!!busy} onClick={() => void act('continuing_decision', { decision: 'continue' }, 'Client will continue')}>{spin('continuing_decision')}{(v.continuingMode ?? 'automatic') === 'optional' ? 'Client opted in' : 'Client will continue'}</Button>
            <Button size="sm" variant={s.terms?.continuing_decision === 'cancel' ? 'default' : 'outline'} disabled={!!busy} onClick={() => void act('continuing_decision', { decision: 'cancel' }, 'Client will cancel')}>{(v.continuingMode ?? 'automatic') === 'optional' ? 'Client declined' : 'Client will cancel'}</Button>
          </div>}
        </div>
      </SubSection>}

      {(s.events?.length ?? 0) > 0 && <details className="border-t border-border/60 pt-3 text-xs text-muted-foreground"><summary className="flex cursor-pointer items-center gap-2 text-sm font-bold tracking-tight text-foreground"><History className="h-4 w-4 text-muted-foreground"/>History ({s.events!.length})</summary>
        <ul className="mt-1 divide-y divide-border/50">{s.events!.map((e, i) => <li key={i} className="py-1">{new Date(e.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} · {EVENT_WORDS[e.kind] ?? e.kind}</li>)}</ul>
      </details>}
  </Shell>;
}
