import { useState } from 'react';
import { ExternalLink, FileSearch, Globe, Loader2, MessagesSquare, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { serviceEndView } from '@/lib/serviceEnd';
import { DOMAIN_CONTROL_OPTIONS, DOMAIN_REASON_TEXT } from '@/lib/domainAuthority';
import { EDGE, Fact, IconTile, SubSection, SURFACE, TONE, ToneChip, type Tone } from '@/components/operator/ui';
import { ACTIVITY_LABEL, activityDetail } from '@/lib/salesCrm';
import { leadSourceLabel } from '@/lib/salesPerformance';
import { shortReportUrl } from '@/lib/reportSlug';
import type { HandoffReadiness } from '@/lib/handoffReadiness';
import type { SetupHandoff } from '@/components/ClientSetupCard';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE HANDOFF — the top of a paid client's page (2026-09-28, docs/self-sourced-handoff.md).

   Who sold it, READY TO START or MISSING INFORMATION (and exactly what is missing), what Sales
   collected, the prospect audit and the conversation so far. Read only; every value comes from
   paid-client-hub `get` (handoff), which derives the readiness from src/lib/handoffReadiness.ts — the
   same rule the payment email uses. Nothing here is a second copy of any data.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface ClientHandoff extends Partial<Omit<SetupHandoff, 'readiness'>> {
  readiness: HandoffReadiness;
  sold_by: string | null;
  sold_by_recorded: boolean;
  /** Set = the sale is under attribution review (or not credited): no seller is shown. Absent on older reads. */
  seller_pending?: 'awaiting_attribution' | 'not_credited' | null;
  sold_at: string | null;
  owner_now: string | null;
  added_by: string | null;
  lead_source: string | null;
  /** What Sales heard about the domain (A/B/C/D). Information only. */
  domain_control?: string | null;
  domain_escalated_at?: string | null;
  terminated?: { at: string; reason: string | null; note: string | null } | null;
  prospect_audit: { id: string; short_code: string | null; created_at: string; audit_purpose: string | null } | null;
  activity: Array<{ id: string; kind: string; body: string | null; data: Record<string, unknown> | null; actor: string; created_at: string }>;
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '';

/* ── THE DOMAIN, and ending the service over a dispute (Paul, 2026-09-28) ─────────────────────── */
function DomainBlock({ leadId, handoff, onChanged }: { leadId: string; handoff: ClientHandoff; onChanged?: () => void }) {
  const { toast } = useToast();
  const d = handoff.readiness.domain;
  const [ending, setEnding] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const sales = DOMAIN_CONTROL_OPTIONS.find((o) => o.value === handoff.domain_control);
  const end = async () => {
    if (!window.confirm('End the service for this client because of a domain / authority dispute? This records it, stops the guarantee re-measure and results, and emails you to cancel the subscription in Stripe. Nothing is charged or refunded by the app.')) return;
    setBusy(true);
    try {
      const r = await invokeEdge<{ ok: boolean; subscription_live?: boolean; alerted?: boolean }>('paid-client-hub', { action: 'terminate_service', lead_id: leadId, reason: 'domain_authority_dispute', note, confirm: true });
      toast({ title: 'Service ended', description: r.subscription_live ? 'Now cancel their subscription in Stripe (we emailed you the details).' : 'No live subscription recorded; check Stripe anyway.' });
      setEnding(false); onChanged?.();
    } catch (e) { toast({ title: 'Not ended', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  if (!d) return null;
  const domainTone: Tone = d.label === 'DOMAIN READY' ? 'green' : d.label === 'NOT NEEDED' ? 'grey' : 'amber';
  return (
    <div className={cn('space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3 text-sm', EDGE[domainTone])} data-testid="handoff-domain">
      <div className="flex flex-wrap items-center gap-2">
        <Globe className={cn('h-4 w-4 shrink-0', TONE[domainTone].text)} />
        <ToneChip tone={domainTone} className="text-xs">{d.label}</ToneChip>
        {d.applies && <span className="min-w-0 text-xs text-muted-foreground">{d.mayReuseExistingSite ? 'Client says they own / may reuse the current site' : 'Fresh build: no confirmed rights to reuse the current site'}</span>}
      </div>
      {d.reasons.length > 0 && <p className={cn('text-xs', TONE.amber.text)}>{d.reasons.map((x) => DOMAIN_REASON_TEXT[x]).join(' · ')}</p>}
      {sales && <p className="text-xs text-muted-foreground">Sales heard: {sales.label}</p>}
      {handoff.domain_escalated_at && <p className={cn('text-xs', TONE.amber.text)}>They asked us to check their domain setup ({day(handoff.domain_escalated_at)}).</p>}
      {handoff.terminated
        ? <p className={cn('text-xs font-semibold', handoff.terminated.reason === 'client_ended_early' ? 'text-muted-foreground' : TONE.red.text)}>{serviceEndView({ service_terminated_at: handoff.terminated.at, service_termination_reason: handoff.terminated.reason })?.stateLabel === 'COMPLETED' ? `Completed ${day(handoff.terminated.at)}: the client ended the engagement early.` : `Service ended ${day(handoff.terminated.at)} (domain / authority dispute)${handoff.terminated.note ? `: ${handoff.terminated.note}` : ''}. Guarantee re-measure and results are off; cancel the subscription in Stripe if not done.`}</p>
        : !ending
          ? <Button size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal text-left text-xs" onClick={() => setEnding(true)}>End service (domain / authority dispute)…</Button>
          : <div className={cn('space-y-2 rounded-xl p-3', TONE.red.tint)}>
              <p className="text-xs text-foreground/85">Use only where a third party credibly disputes the client’s ownership or authority and it cannot reasonably be resolved (terms: “If someone else disputes your authority”). The £99 is not refunded for this reason, the guarantee does not cover it, and no further monthly payments may be taken — you cancel the subscription in Stripe.</p>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is the dispute? (who raised it, what they claim)" className="text-sm" />
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEnding(false)} disabled={busy}>Cancel</Button>
                <Button size="sm" variant="destructive" className="text-xs" disabled={busy || note.trim().length < 10} onClick={() => void end()}>{busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}End the service</Button>
              </div>
            </div>}
    </div>
  );
}

export function ClientHandoffCard({ handoff, leadId, onChanged }: { handoff: ClientHandoff; leadId?: string; onChanged?: () => void }) {
  const audit = handoff.prospect_audit;
  const auditUrl = audit ? (audit.short_code ? shortReportUrl(audit.short_code) : `https://findable.live/report/${audit.id}`) : null;
  return (
    <section data-testid="client-handoff" className={cn(SURFACE, 'min-w-0 space-y-4 p-4 sm:p-5')}>
      {/* The checklist and READY TO SUBMIT / READY FOR DELIVERY / WAITING moved to ClientSetupCard (2026-10-02) — drawn once. */}
      <header className="flex min-w-0 items-center gap-3">
        <IconTile icon={UserRound} tone="blue" />
        <h2 className="min-w-0 text-base font-bold leading-tight tracking-tight">Who sold it · domain · the conversation</h2>
      </header>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Fact label="Sold by">
          <span className="font-semibold">{handoff.seller_pending === 'awaiting_attribution' ? 'Awaiting attribution review' : handoff.seller_pending === 'not_credited' ? 'Not credited to a salesperson' : handoff.sold_by ?? 'Not recorded'}</span>
          <span className="block text-xs text-muted-foreground">
            {handoff.seller_pending ? 'Decided on the Team page' : handoff.sold_by_recorded ? `Recorded at payment${handoff.sold_at ? ` · ${day(handoff.sold_at)}` : ''}` : 'From the current owner (paid before this was recorded)'}
            {handoff.owner_now && handoff.owner_now !== handoff.sold_by ? ` · now with ${handoff.owner_now}` : ''}
          </span>
        </Fact>
        <Fact label="Found via">
          {leadSourceLabel(handoff.lead_source)}
          {handoff.added_by && <span className="block text-xs text-muted-foreground">added by {handoff.added_by}</span>}
        </Fact>
      </dl>
      {leadId && <DomainBlock leadId={leadId} handoff={handoff} onChanged={onChanged} />}
      {auditUrl && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          <FileSearch className={cn('h-4 w-4 shrink-0', TONE.purple.text)} />
          Prospect audit · {day(audit!.created_at)} ·{' '}
          <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={`${auditUrl}${auditUrl.includes('?') ? '&' : '?'}preview=1`} target="_blank" rel="noreferrer">
            Open report <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </p>
      )}
      <SubSection title="Sales notes and contact" icon={MessagesSquare} tone="blue" className="border-t border-border/60 pt-4">
        {handoff.activity.length === 0
          ? <p className="text-xs text-muted-foreground">Nothing recorded by Sales.</p>
          : (
            <ul className="max-h-64 divide-y divide-border/50 overflow-y-auto text-xs">
              {handoff.activity.map((a) => {
                const detail = activityDetail(a, () => 'Someone');
                return (
                  <li key={a.id} className="py-1.5">
                    <span className="font-medium">{ACTIVITY_LABEL[a.kind] ?? a.kind}</span>
                    <span className="text-muted-foreground"> · {a.actor} · {day(a.created_at)}</span>
                    {detail && <div className="whitespace-pre-wrap break-words text-muted-foreground">{detail}</div>}
                  </li>
                );
              })}
            </ul>
          )}
      </SubSection>
    </section>
  );
}
