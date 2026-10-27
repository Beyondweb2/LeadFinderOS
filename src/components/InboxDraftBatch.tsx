/* SEND DRAFTS — the live panel: the Undo bar, progress and the per-row results (Paul, 2026-10-27). The rules and the run
   are in src/lib/bulkDraftSend.ts; this file only draws them. ⛔ Nothing here sends: Undo / Stop / Cancel call back. */
import { Ban, Check, Clock, Loader2, PenLine, Send, Sparkles, Undo2, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queuedLabel } from '@/lib/inboxSendWindow';
import { FINAL_STATES, draftOutcomeSummary, type BatchRow, type RowState } from '@/lib/bulkDraftSend';

const ICON: Record<RowState, typeof Check> = { sent: Check, queued: Clock, failed: XCircle, skipped: Ban, drafting: PenLine, waiting: Clock, sending: Send };
const TONE: Record<RowState, string> = {
  sent: 'text-emerald-700 dark:text-emerald-400', queued: 'text-sky-700 dark:text-sky-300', failed: 'text-red-700 dark:text-red-300',
  skipped: 'text-amber-700 dark:text-amber-300', drafting: 'text-violet-700 dark:text-violet-300', waiting: 'text-muted-foreground', sending: 'text-violet-700 dark:text-violet-300',
};

function rowWords(o: BatchRow, cancelled: boolean): string {
  switch (o.state) {
    case 'sent': return (o.drafted ? 'drafted and ' : '') + (o.simulated ? 'sent (simulated, test mode)' : 'sent');
    case 'queued': return cancelled ? 'queued send cancelled' : (o.drafted ? 'drafted · ' : '') + (o.sendAt && o.tz ? queuedLabel(o.sendAt, o.tz) : 'queued, goes when their send hours open');
    case 'failed': return `failed: ${o.reason ?? 'no reason given'}`;
    case 'skipped': return `skipped: ${o.reason ?? 'no reason given'}`;
    case 'drafting': return 'writing a draft…';
    case 'sending': return 'sending…';
    default: return o.reason ?? 'waiting to send';
  }
}

export function DraftBatchPanel({ rows, running, undoLeftMs, cancelled, onUndo, onStop, onCancelQueued, onCancelAllQueued, onOpen, onDismiss }: {
  rows: BatchRow[];
  running: boolean;
  /** > 0 while the Undo window is open (nothing has been sent yet). */
  undoLeftMs: number;
  cancelled: ReadonlySet<string>;
  onUndo: () => void;
  onStop: () => void;
  onCancelQueued: (scheduledId: string) => void;
  onCancelAllQueued: () => void;
  onOpen: (key: string) => void;
  onDismiss: () => void;
}) {
  const done = rows.filter((r) => FINAL_STATES.has(r.state)).length;
  const drafting = rows.filter((r) => r.state === 'drafting').length;
  const openQueued = rows.filter((r) => r.state === 'queued' && r.scheduledId && !cancelled.has(r.scheduledId));
  const undoOpen = running && undoLeftMs > 0;
  return (
    <div className="mb-1.5 rounded-md border border-border/60 bg-background px-2 py-1.5 text-[11px]" data-testid="draft-batch-report">
      {undoOpen && (
        <div className="mb-1.5 flex items-center gap-2 rounded bg-violet-600 px-2 py-1.5 text-white" data-testid="draft-batch-undo">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 font-medium">Sending starts in {Math.ceil(undoLeftMs / 1000)}s. Nothing has been sent yet.</span>
          <Button size="sm" variant="secondary" className="h-6 px-2 text-[11px]" onClick={onUndo} data-testid="draft-batch-undo-btn">
            <Undo2 className="mr-1 h-3 w-3" />Undo
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {running
          ? <span className="inline-flex items-center gap-1 font-medium"><Loader2 className="h-3 w-3 animate-spin" />Send drafts: {done}/{rows.length} done{drafting ? ` · writing ${drafting}` : ''}</span>
          : <span className="font-medium">{draftOutcomeSummary(rows)}</span>}
        <span className="flex-1" />
        {running && !undoOpen && <button type="button" className="text-destructive hover:underline" onClick={onStop} data-testid="draft-batch-stop">Stop</button>}
        {openQueued.length > 0 && (
          <button type="button" className="text-muted-foreground hover:text-destructive hover:underline" onClick={onCancelAllQueued} data-testid="draft-batch-cancel-all">
            Cancel all queued ({openQueued.length})
          </button>
        )}
        {!running && <button type="button" className="text-muted-foreground hover:underline" onClick={onDismiss}>Dismiss</button>}
      </div>
      <ul className="mt-1 max-h-[40vh] space-y-0.5 overflow-y-auto">
        {rows.map((o) => {
          const Icon = ICON[o.state];
          const isCancelled = !!o.scheduledId && cancelled.has(o.scheduledId);
          return (
            <li key={o.key} className="flex items-start gap-1.5" data-testid="draft-batch-row" data-state={o.state}>
              <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${TONE[o.state]} ${o.state === 'drafting' || o.state === 'sending' ? 'animate-pulse' : ''}`} />
              <span className="min-w-0 flex-1 break-words">
                <button type="button" className="font-medium text-foreground hover:underline" onClick={() => onOpen(o.key)}>{o.label}</button>
                <span className="text-muted-foreground"> — {rowWords(o, isCancelled)}</span>
              </span>
              {o.state === 'queued' && o.scheduledId && !isCancelled && (
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
