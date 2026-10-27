/* SEND DRAFTS — the confirm step and the per-row results (Paul, 2026-10-27). The rules and the run are in
   src/lib/bulkDraftSend.ts; this file only draws them. ⛔ Nothing here sends: the confirm button calls `onConfirm`. */
import { Ban, Check, Clock, Loader2, Sparkles, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { DialogHero, SubSection } from '@/components/operator/ui';
import { queuedLabel } from '@/lib/inboxSendWindow';
import { BULK_DRAFT_MAX, draftOutcomeSummary, oneLine, type DraftOutcome, type DraftPlan } from '@/lib/bulkDraftSend';

export function DraftBatchConfirm({ open, plan, busy, progress, onCancel, onConfirm }: {
  open: boolean;
  plan: DraftPlan;
  busy: boolean;
  progress: { done: number; total: number };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const n = plan.send.length;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-lg" data-testid="draft-batch-confirm">
        <DialogHero
          icon={Sparkles}
          tone="purple"
          title={<>Approve and send {n} draft{n === 1 ? '' : 's'}?</>}
          subtitle={<>Each business gets <strong>its own draft</strong>, exactly as shown below. Each one goes through the normal send:
            outside their send hours it is queued to their morning; opt-outs, daily caps and the 24-hour rule still apply.
            Each is checked again just before it goes. At most {BULK_DRAFT_MAX} per batch.</>}
        />
        <div className="max-h-[50vh] space-y-3 overflow-y-auto text-xs">
          <ul className="space-y-2" data-testid="draft-batch-list">
            {plan.send.map((it) => (
              <li key={it.key} className="rounded-md border border-border/60 px-2 py-1.5">
                <p className="truncate font-semibold text-foreground">{it.label}</p>
                {it.theirLast && <p className="truncate text-muted-foreground"><span className="font-medium">They said:</span> {it.theirLast}</p>}
                <p className="truncate text-violet-700 dark:text-violet-300"><span className="font-medium">Draft:</span> {oneLine(it.body, 140)}</p>
              </li>
            ))}
          </ul>
          {plan.skipped.length > 0 && (
            <SubSection testId="draft-batch-skipped" tone="amber" title={<span className="text-amber-700 dark:text-amber-300">Skipped, not sent ({plan.skipped.length})</span>}>
              <ul className="space-y-0.5 text-muted-foreground">
                {plan.skipped.map((it) => <li key={it.key} className="truncate">· {it.label} — {it.skip}</li>)}
              </ul>
            </SubSection>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={busy || n === 0} onClick={onConfirm} data-testid="draft-batch-send">
            {busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Sending {progress.done}/{progress.total}</> : <><Check className="mr-1.5 h-4 w-4" />Approve and send {n}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ICON = { sent: Check, queued: Clock, failed: XCircle, skipped: Ban } as const;
const TONE = { sent: 'text-emerald-700 dark:text-emerald-400', queued: 'text-sky-700 dark:text-sky-300', failed: 'text-red-700 dark:text-red-300', skipped: 'text-amber-700 dark:text-amber-300' } as const;

/** What the batch did, one row per business. Stays until dismissed. Queued rows can be cancelled one by one. */
export function DraftBatchReport({ outcomes, cancelled, onCancelQueued, onOpen, onDismiss }: {
  outcomes: DraftOutcome[];
  cancelled: ReadonlySet<string>;
  onCancelQueued: (scheduledId: string) => void;
  onOpen: (key: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-1.5 rounded-md border border-border/60 bg-background px-2 py-1.5 text-[11px]" data-testid="draft-batch-report">
      <div className="flex items-center gap-2">
        <span className="font-medium">{draftOutcomeSummary(outcomes)}</span>
        <span className="flex-1" />
        <button type="button" className="text-muted-foreground hover:underline" onClick={onDismiss}>Dismiss</button>
      </div>
      <ul className="mt-1 space-y-0.5">
        {outcomes.map((o) => {
          const Icon = ICON[o.kind];
          const isCancelled = !!o.scheduledId && cancelled.has(o.scheduledId);
          return (
            <li key={o.key} className="flex items-start gap-1.5" data-testid="draft-batch-row">
              <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${TONE[o.kind]}`} />
              <span className="min-w-0 flex-1">
                <button type="button" className="font-medium text-foreground hover:underline" onClick={() => onOpen(o.key)}>{o.label}</button>
                <span className="text-muted-foreground"> — {
                  o.kind === 'sent' ? (o.simulated ? 'sent (simulated, test mode)' : 'sent')
                  : o.kind === 'queued' ? (isCancelled ? 'queued send cancelled' : (o.sendAt && o.tz ? queuedLabel(o.sendAt, o.tz) : 'queued, goes when their send hours open'))
                  : `${o.kind === 'failed' ? 'failed' : 'skipped'}: ${o.reason ?? 'no reason given'}`
                }</span>
              </span>
              {o.kind === 'queued' && o.scheduledId && !isCancelled && (
                <button type="button" className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground hover:text-destructive" onClick={() => onCancelQueued(o.scheduledId as string)}>
                  <X className="h-3 w-3" /> Cancel
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
