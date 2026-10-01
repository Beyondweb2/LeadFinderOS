import { useState } from 'react';
import { ExternalLink, Loader2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { DOMAIN_CONTROL_OPTIONS, DOMAIN_REASON_TEXT } from '@/lib/domainAuthority';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm" data-testid="handoff-domain">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn('text-xs', d.label === 'DOMAIN READY' ? 'bg-emerald-600 hover:bg-emerald-600' : d.label === 'NOT NEEDED' ? 'bg-slate-500 hover:bg-slate-500' : 'bg-amber-600 hover:bg-amber-600')}>{d.label}</Badge>
        {d.applies && <span className="text-xs text-muted-foreground">{d.mayReuseExistingSite ? 'Client says they own / may reuse the current site' : 'Fresh build: no confirmed rights to reuse the current site'}</span>}
      </div>
      {d.reasons.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{d.reasons.map((x) => DOMAIN_REASON_TEXT[x]).join(' · ')}</p>}
      {sales && <p className="text-xs text-muted-foreground">Sales heard: {sales.label}</p>}
      {handoff.domain_escalated_at && <p className="text-xs text-amber-700 dark:text-amber-300">They asked us to check their domain setup ({day(handoff.domain_escalated_at)}).</p>}
      {handoff.terminated
        ? <p className="text-xs font-semibold text-destructive">Service ended {day(handoff.terminated.at)} (domain / authority dispute){handoff.terminated.note ? `: ${handoff.terminated.note}` : ''}. Guarantee re-measure and results are off; cancel the subscription in Stripe if not done.</p>
        : !ending
          ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEnding(true)}>End service (domain / authority dispute)…</Button>
          : <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Use only where a third party credibly disputes the client’s ownership or authority and it cannot reasonably be resolved (terms: “If someone else disputes your authority”). The £99 is not refunded for this reason, the guarantee does not cover it, and no further monthly payments may be taken — you cancel the subscription in Stripe.</p>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is the dispute? (who raised it, what they claim)" className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEnding(false)} disabled={busy}>Cancel</Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busy || note.trim().length < 10} onClick={() => void end()}>{busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}End the service</Button>
              </div>
            </div>}
    </div>
  );
}

export function ClientHandoffCard({ handoff, leadId, onChanged }: { handoff: ClientHandoff; leadId?: string; onChanged?: () => void }) {
  const audit = handoff.prospect_audit;
  const auditUrl = audit ? (audit.short_code ? shortReportUrl(audit.short_code) : `https://findable.live/report/${audit.id}`) : null;
  return (
    <Card data-testid="client-handoff">
      <CardContent className="space-y-4 p-5">
        {/* The checklist and READY FOR DELIVERY / WAITING moved to ClientSetupCard (2026-10-02) — drawn once. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm font-semibold">Who sold it · domain · the conversation</p>
          <div className="text-right text-sm">
            <div className="flex items-center justify-end gap-1.5"><UserRound className="h-4 w-4 text-muted-foreground" />Sold by <span className="font-medium">{handoff.sold_by ?? 'Not recorded'}</span></div>
            <div className="text-xs text-muted-foreground">
              {handoff.sold_by_recorded ? `Recorded at payment${handoff.sold_at ? ` · ${day(handoff.sold_at)}` : ''}` : 'From the current owner (paid before this was recorded)'}
              {handoff.owner_now && handoff.owner_now !== handoff.sold_by ? ` · now with ${handoff.owner_now}` : ''}
            </div>
            <div className="text-xs text-muted-foreground">Found via {leadSourceLabel(handoff.lead_source)}{handoff.added_by ? ` · added by ${handoff.added_by}` : ''}</div>
          </div>
        </div>
        {leadId && <DomainBlock leadId={leadId} handoff={handoff} onChanged={onChanged} />}
        {auditUrl && (
          <p className="text-sm">
            Prospect audit · {day(audit!.created_at)} ·{' '}
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`${auditUrl}${auditUrl.includes('?') ? '&' : '?'}preview=1`} target="_blank" rel="noreferrer">
              Open report <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </p>
        )}
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sales notes and contact</div>
          {handoff.activity.length === 0
            ? <p className="text-xs text-muted-foreground">Nothing recorded by Sales.</p>
            : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
                {handoff.activity.map((a) => {
                  const detail = activityDetail(a, () => 'Someone');
                  return (
                    <li key={a.id}>
                      <span className="font-medium">{ACTIVITY_LABEL[a.kind] ?? a.kind}</span>
                      <span className="text-muted-foreground"> · {a.actor} · {day(a.created_at)}</span>
                      {detail && <div className="whitespace-pre-wrap text-muted-foreground">{detail}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
