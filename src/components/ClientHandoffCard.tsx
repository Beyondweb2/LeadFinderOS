import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ACTIVITY_LABEL, activityDetail } from '@/lib/salesCrm';
import { leadSourceLabel } from '@/lib/salesPerformance';
import { shortReportUrl } from '@/lib/reportSlug';
import type { HandoffReadiness, HandoffSource } from '@/lib/handoffReadiness';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE HANDOFF — the top of a paid client's page (2026-09-28, docs/self-sourced-handoff.md).

   Who sold it, READY TO START or MISSING INFORMATION (and exactly what is missing), what Sales
   collected, the prospect audit and the conversation so far. Read only; every value comes from
   paid-client-hub `get` (handoff), which derives the readiness from src/lib/handoffReadiness.ts — the
   same rule the payment email uses. Nothing here is a second copy of any data.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface ClientHandoff {
  readiness: HandoffReadiness;
  sold_by: string | null;
  sold_by_recorded: boolean;
  sold_at: string | null;
  owner_now: string | null;
  added_by: string | null;
  lead_source: string | null;
  prospect_audit: { id: string; short_code: string | null; created_at: string; audit_purpose: string | null } | null;
  activity: Array<{ id: string; kind: string; body: string | null; data: Record<string, unknown> | null; actor: string; created_at: string }>;
}

const SOURCE_LABEL: Record<Exclude<HandoffSource, null>, string> = {
  onboarding: 'client', sales: 'Sales', findable: 'Findable', payment: 'Stripe / marked paid',
};
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '';

export function ClientHandoffCard({ handoff }: { handoff: ClientHandoff }) {
  const r = handoff.readiness;
  const audit = handoff.prospect_audit;
  const auditUrl = audit ? (audit.short_code ? shortReportUrl(audit.short_code) : `https://findable.live/report/${audit.id}`) : null;
  return (
    <Card data-testid="client-handoff">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Badge className={cn('text-xs', r.ready ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-amber-600 hover:bg-amber-600')} data-testid="handoff-label">{r.label}</Badge>
            {!r.ready && <p className="text-sm text-amber-700 dark:text-amber-300">Missing: {r.missing.join(', ')}</p>}
          </div>
          <div className="text-right text-sm">
            <div className="flex items-center justify-end gap-1.5"><UserRound className="h-4 w-4 text-muted-foreground" />Sold by <span className="font-medium">{handoff.sold_by ?? 'Not recorded'}</span></div>
            <div className="text-xs text-muted-foreground">
              {handoff.sold_by_recorded ? `Recorded at payment${handoff.sold_at ? ` · ${day(handoff.sold_at)}` : ''}` : 'From the current owner (paid before this was recorded)'}
              {handoff.owner_now && handoff.owner_now !== handoff.sold_by ? ` · now with ${handoff.owner_now}` : ''}
            </div>
            <div className="text-xs text-muted-foreground">Found via {leadSourceLabel(handoff.lead_source)}{handoff.added_by ? ` · added by ${handoff.added_by}` : ''}</div>
          </div>
        </div>
        <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {r.items.map((i) => (
            <li key={i.key} className="flex min-w-0 items-start gap-2" data-testid={`handoff-${i.key}`}>
              {i.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                : i.required ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0">
                <span className="font-medium">{i.label}</span>
                {i.source && <span className="ml-1 text-xs text-muted-foreground">({SOURCE_LABEL[i.source]})</span>}
                <div className="break-words text-xs text-muted-foreground">{i.detail}</div>
              </div>
            </li>
          ))}
        </ul>
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
