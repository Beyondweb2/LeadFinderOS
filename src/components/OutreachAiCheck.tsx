/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ROW'S AI CHECK + THE ONE-LINE CHECK BAR (2026-10-05, improve/outreach-compact-audit-rows).
   Rules: src/lib/outreachRowCheck.ts. Record: docs/pre-sales-certification/outreach-compact-audit-rows.md.

   AiCheckSummary — inside each Outreach row (desktop cell and phone card): the state in one or two
   words, or "ChatGPT 1/3 · Gemini 0/3" and a "Call screen" button. ⛔ SCORES ONLY — no rival names,
   no answer text, no website findings; those are the call screen's.
   OutreachCheckBar — one line above the list: the rep's batch in counts, checks left today, Stop, and
   "Open next ready". It replaces the old "Check before calling" results panel.
   ⛔ NOTHING HERE CONTACTS ANYONE OR WRITES A LEAD. Call screen opens the workspace; Retry opens the
   same confirm dialog as the toolbar (sales) or the single AI check popup (admin); Stop asks the
   server to skip what has not started. ⛔ NO COST IS SHOWN — the allowance is counted in checks.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { Clock, Loader2, PhoneCall, RotateCcw, SearchCheck, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { engineScoreText, ROW_CHECK_WORD, type RowCheckState, type RowScore } from '@/lib/outreachRowCheck';

export function AiCheckSummary({ state, score, scoreLoading = false, onCallScreen, onRetry, className }: {
  state: RowCheckState;
  /** undefined = not read yet; null = read, nothing to score (the call screen still has the detail). */
  score?: RowScore | null;
  scoreLoading?: boolean;
  onCallScreen?: () => void;
  onRetry?: () => void;
  className?: string;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight', className)}
      data-testid="row-ai-check" data-state={state.kind} onClick={stop}>
      {state.kind === 'ready' && (score
        ? score.engines.map((e) => (
            <span key={e.label} data-testid="row-ai-score" className={cn('whitespace-nowrap rounded border px-1 py-px font-medium tabular-nums',
              e.answered === 0 ? 'border-border text-muted-foreground'
                : e.named > 0 ? 'border-teal-500/50 text-teal-700 dark:text-teal-300' : 'border-border text-foreground')}>
              {engineScoreText(e)}
            </span>
          ))
        : <span className="text-muted-foreground">{scoreLoading || score === undefined ? 'Checked…' : 'Checked'}</span>)}
      {state.kind === 'ready' && state.cached && <span className="text-muted-foreground" title="A recent result was reused — no new check was needed">reused</span>}
      {state.kind === 'checking' && <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-300"><Loader2 className="h-3 w-3 animate-spin" />{ROW_CHECK_WORD.checking}</span>}
      {state.kind === 'waiting' && <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{ROW_CHECK_WORD.waiting}</span>}
      {state.kind === 'failed' && (
        <span className="inline-flex items-center gap-1 text-destructive" title={state.message ?? undefined}>
          {ROW_CHECK_WORD.failed}
          {onRetry && <><span aria-hidden>·</span><button type="button" className="underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); onRetry(); }} data-testid="row-ai-retry">Retry</button></>}
        </span>
      )}
      {state.kind === 'skipped' && <span className="text-amber-700 dark:text-amber-300" title={state.message ?? undefined}>{ROW_CHECK_WORD.skipped}</span>}
      {state.kind === 'not_checked' && <span className="text-muted-foreground">{ROW_CHECK_WORD.not_checked}</span>}
      {state.kind === 'ready' && onCallScreen && (
        <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[11px]" onClick={(e) => { e.stopPropagation(); onCallScreen(); }} data-testid="row-call-screen">
          <PhoneCall className="h-3 w-3" />Call screen
        </Button>
      )}
    </div>
  );
}

export interface CheckBarBatch {
  status: 'active' | 'waiting' | 'finished';
  counts: { total: number; queued: number; running: number; done: number; reused: number; failed: number; skipped: number };
}

export function OutreachCheckBar({ batch, allowance, onStop, ready, hasNext, onOpenNext, openedCount, onStartOver, disabled, error }: {
  /** The rep's newest batch (sales only); null = none to show. */
  batch: CheckBarBatch | null;
  /** Checks left today (sales only); null = not shown. */
  allowance: { limit: number; remaining: number } | null;
  onStop?: () => void;
  /** Ready, callable leads in the list as shown, not yet opened from here. */
  ready: number;
  hasNext: boolean;
  onOpenNext: () => void;
  /** How many have been opened from here this session (Start over clears it). */
  openedCount: number;
  onStartOver: () => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const c = batch?.counts ?? null;
  const open = !!batch && batch.status !== 'finished';
  const parts: string[] = [];
  if (c) {
    if (c.done + c.reused) parts.push(`${c.done + c.reused} ready`);
    if (c.running) parts.push(`${c.running} checking`);
    if (c.queued) parts.push(`${c.queued} waiting`);
    if (c.failed) parts.push(`${c.failed} failed`);
    if (c.skipped) parts.push(`${c.skipped} skipped`);
  }
  return (
    <div data-testid="outreach-check-bar" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      {c && (
        <span className="inline-flex min-w-0 items-center gap-1.5" data-testid="outreach-check-batch">
          {open ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" /> : <SearchCheck className="h-3.5 w-3.5 shrink-0 text-sky-500" />}
          <span className="min-w-0">
            <span className="text-foreground">{open ? `Checking ${c.total}` : `Last check (${c.total})`}</span>{parts.length ? `: ${parts.join(' · ')}` : ''}
          </span>
          {open && c.queued > 0 && onStop && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={onStop} title="Leads not started yet are skipped; checks already started finish on their own.">
              <Square className="mr-1 h-3 w-3 fill-current" />Stop
            </Button>
          )}
        </span>
      )}
      {allowance && (
        <span data-testid="outreach-check-allowance">Checks left today: <b className="text-foreground">{allowance.remaining}</b>/{allowance.limit}</span>
      )}
      {error && <span className="text-destructive">{error}</span>}
      <span className="ml-auto inline-flex items-center gap-1.5">
        {!hasNext && openedCount > 0 && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onStartOver} title="Offer the ready leads you already opened again">
            <RotateCcw className="mr-1 h-3 w-3" />Start over
          </Button>
        )}
        <Button size="sm" className="h-7 text-xs" disabled={disabled || !hasNext} onClick={onOpenNext} data-testid="outreach-next-ready"
          title="Open the call screen for the next lead in this list whose AI check is ready">
          <PhoneCall className="mr-1 h-3.5 w-3.5" />{hasNext ? `Open next ready (${ready})` : 'No ready lead left'}
        </Button>
      </span>
    </div>
  );
}
