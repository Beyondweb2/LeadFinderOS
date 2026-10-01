import { useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, CircleSlash, ClipboardCopy, History, Loader2, Pencil, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { clientSetupUrl } from '@/config/findableSite';
import { DELIVERY_STAGES, DELIVERY_STAGE_LABEL, type DeliveryStage, type DeliveryState, type NextStep } from '@/lib/deliveryStage';
import { handoffSummaryLines, type HandoffApplies, type HandoffFieldKey, type SalesHandoffFields, type SalesHandoffRecord } from '@/lib/salesHandoff';
import type { HandoffReadiness, HandoffWho } from '@/lib/handoffReadiness';
import { ACTIVITY_LABEL } from '@/lib/salesCrm';
import { SalesHandoffForm } from '@/components/SalesHandoffForm';
import { cn } from '@/lib/utils';

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
}
export interface SetupHandoff {
  readiness: HandoffReadiness;
  setup: SetupView;
  sales_handoff: { applies: HandoffApplies; saved: SalesHandoffRecord | null; fields: SalesHandoffFields; prefilled: HandoffFieldKey[]; saved_by: string | null; completed_at: string | null };
  submitted_at: string | null;
  submitted_by: string | null;
  onboarding_id: string | null;
  history: Array<{ id: string; kind: string; body: string | null; actor: string; created_at: string }>;
}

export const STATE_TONE: Record<DeliveryState, string> = {
  waiting_sales: 'bg-amber-700 text-white hover:bg-amber-700', waiting_client: 'bg-amber-700 text-white hover:bg-amber-700', waiting_findable: 'bg-sky-700 text-white hover:bg-sky-700',
  ready: 'bg-emerald-700 text-white hover:bg-emerald-700', in_delivery: 'bg-indigo-600 text-white hover:bg-indigo-600', ended: 'bg-slate-600 text-white hover:bg-slate-600',
};
const WHO: Record<HandoffWho, string> = { sales: 'Sales', client: 'Client', findable: 'Findable' };
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '';

export function ClientSetupCard({ leadId, h, route, onChanged, onOpenBaseline }: {
  leadId: string; h: SetupHandoff; route: 'build' | 'optimise' | null; onChanged: () => void; onOpenBaseline: () => void;
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
    go(s.next.section);
  };
  const setupLink = h.onboarding_id ? clientSetupUrl(h.onboarding_id, leadId) : null;
  const copyLink = async () => {
    if (!setupLink) return;
    try { await navigator.clipboard.writeText(setupLink); toast({ title: 'Client setup link copied' }); }
    catch { toast({ title: 'Copy blocked by the browser', description: setupLink, variant: 'destructive' }); }
  };
  const handoffLines = handoffSummaryLines(sh.saved);

  return (
    <Card id="hub-setup" data-testid="client-setup">
      <CardContent className="space-y-4 p-4 sm:p-5">
        {/* Where they are, and the one thing to do next. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Badge className={cn('text-xs', STATE_TONE[s.state])} data-testid="setup-state">{s.state_label}</Badge>
            <p className="text-sm text-muted-foreground">Setup {s.done}/{s.total} complete{h.submitted_at ? ` · submitted for delivery ${day(h.submitted_at)}${h.submitted_by ? ` by ${h.submitted_by}` : ''}` : ''}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="setup-next">
            <span className="text-sm">Next step: <span className="font-semibold">{s.next.label}</span></span>
            {s.next.action && (
              <Button size="sm" onClick={nextAction} disabled={!!busy}>
                {busy && (busy === 'submit' || busy === 'gbp') ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : s.next.key === 'submit' ? <Send className="mr-1 h-4 w-4" /> : <ArrowRight className="mr-1 h-4 w-4" />}
                {s.next.key === 'submit' ? 'Submit for delivery' : 'Go'}
              </Button>
            )}
          </div>
        </div>

        {/* The pipeline — the real stages, the current one marked. Wraps on a phone, never scrolls sideways. */}
        <ol className="flex flex-wrap gap-1.5 text-[11px]" aria-label="Delivery stages">
          {DELIVERY_STAGES.map((st, i) => (
            <li key={st} className={cn('rounded-full border px-2 py-0.5',
              s.stage === 'ended' ? 'text-muted-foreground' : i < currentIndex ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' : i === currentIndex ? 'border-primary bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground')}
              aria-current={i === currentIndex ? 'step' : undefined}>
              {DELIVERY_STAGE_LABEL[st]}
            </li>
          ))}
        </ol>

        {/* The checklist: required, not needed, and who owes each missing item. */}
        <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" data-testid="setup-checklist">
          {items.map((i) => (
            <li key={i.key} className="flex min-w-0 items-start gap-2" data-testid={`setup-${i.key}`}>
              {i.notNeeded ? <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                : i.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                : <Circle className={cn('mt-0.5 h-4 w-4 shrink-0', i.required ? 'text-amber-600' : 'text-muted-foreground')} />}
              <div className="min-w-0">
                <span className={cn('font-medium', i.notNeeded && 'text-muted-foreground')}>{i.label}</span>
                {!i.ok && i.required && <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">· {WHO[i.who]}</span>}
                {!i.required && !i.notNeeded && <span className="ml-1 text-xs text-muted-foreground">· optional</span>}
                <div className="break-words text-xs text-muted-foreground">{i.detail}</div>
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
        <div className="rounded-lg border p-3" data-testid="setup-sales-handoff">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Sales handoff</p>
            <span className="text-xs text-muted-foreground">
              {sh.applies !== 'required' ? (sh.applies === 'not_needed_own_sale' ? "Not needed — your own sale" : sh.applies === 'not_recorded_before' ? 'Not recorded — paid before handoffs existed' : 'Not needed — no salesperson')
                : sh.completed_at ? `Complete${sh.saved_by ? ` · ${sh.saved_by}` : ''}` : 'Not complete — the salesperson owes it'}
            </span>
          </div>
          {!editing && (handoffLines.length
            ? <ul className="mt-2 space-y-0.5 text-sm">{handoffLines.map((l) => <li key={l} className="break-words">{l}</li>)}</ul>
            : <p className="mt-1 text-xs text-muted-foreground">Nothing given yet.</p>)}
          {!editing && <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Pencil className="h-3 w-3" />{handoffLines.length ? 'Edit' : 'Fill it in'}</button>}
          {editing && <div className="mt-3"><SalesHandoffForm fields={sh.fields} prefilled={sh.prefilled} route={route} onSave={saveHandoff} busy={busy === 'handoff'} /></div>}
        </div>

        {/* History — the meaningful events only. */}
        <details className="rounded-lg border p-3" data-testid="setup-history">
          <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />History<span className="font-normal text-muted-foreground">· {h.history.length}</span></summary>
          {h.history.length === 0
            ? <p className="mt-2 text-xs text-muted-foreground">Nothing recorded yet.</p>
            : <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto text-xs">
                {h.history.map((a) => (
                  <li key={a.id}><span className="font-medium">{a.body || ACTIVITY_LABEL[a.kind] || a.kind}</span><span className="text-muted-foreground"> · {a.actor} · {day(a.created_at)}</span></li>
                ))}
              </ul>}
        </details>
      </CardContent>
    </Card>
  );
}
