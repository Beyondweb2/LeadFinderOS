import { AlertTriangle, CalendarClock, MessageCircleReply, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationState } from '@/lib/conversationState';

/* One small chip for a conversation's most urgent state (src/lib/conversationState.ts decides which).
   BLUE = a reply waiting on us · AMBER = follow-up due · RED = send failed · GREY = queued.
   Quiet rows show nothing — colour only where there is something to do. */
const TONE: Record<string, string> = {
  red: 'bg-red-500/15 text-red-700 dark:text-red-300',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  grey: 'bg-muted text-muted-foreground',
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
};

export function ConvStateChip({ state, compact = false, hideQueued = false }: { state: ConversationState | undefined; compact?: boolean; hideQueued?: boolean }) {
  if (!state || !state.label) return null;
  /* ⛔ ONE INDICATOR PER FACT (UI cleanup pass, 2026-09-29): a due Next Action is drawn by the
     NextActionPill beside this chip (Overdue / Today / date) — the chip no longer repeats it as
     "Follow-up due". hideQueued: the thread header has its own Queued pill (it says when the queue is
     paused). */
  const onlyFollowUp = !state.failed && state.waitingSinceMs === null && state.followUpDue;
  const onlyQueued = !state.failed && state.waitingSinceMs === null && !state.followUpDue && state.queued;
  if (onlyFollowUp || (hideQueued && onlyQueued)) return null;
  const Icon = state.failed ? AlertTriangle : state.waitingSinceMs !== null ? MessageCircleReply : state.followUpDue ? CalendarClock : Timer;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full font-semibold', compact ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]', TONE[state.tone])}
      title={state.failed ? 'Our last message failed to send' : state.waitingSinceMs !== null ? 'They replied and nothing has answered yet' : state.followUpDue ? 'A Next Action set by a person is due' : 'In the drip queue'}>
      <Icon className="h-3 w-3" />{state.label}
    </span>
  );
}
