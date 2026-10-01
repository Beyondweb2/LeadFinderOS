import { CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { nextActionText, nextActionView, type NextActionView } from '@/lib/nextActionView';

/* THE NEXT ACTION PILL — one component for the lead popup, the Inbox list, Outreach and Focus Mode
   (UI cleanup pass, 2026-09-29). It reads the ONE stored next action (src/lib/nextActionView.ts) and
   draws nothing when there is none.
   Colour follows urgency: OVERDUE red, TODAY amber, anything later quiet grey. */

const TONE: Record<NextActionView['bucket'], string> = {
  overdue: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  today: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  upcoming: 'border-border/70 bg-muted/40 text-muted-foreground',
  none: 'border-border/70 bg-muted/40 text-muted-foreground',
};

type Lead = { next_action?: string | null; next_action_date?: string | null; next_action_note?: string | null; call_booked_at?: string | null };

/**
 * size 'md' — the popup: "Call · Tomorrow", the note after it (truncated, full text on hover/long-press).
 * size 'xs' — a list row: the day only ("Overdue", "Today", "3 Oct"), or the action when it has no date.
 */
export function NextActionPill({ lead, size = 'md', onClick, className }: { lead: Lead | null | undefined; size?: 'md' | 'xs'; onClick?: () => void; className?: string }) {
  const v = nextActionView(lead);
  if (!v) return null;
  const title = `Next action: ${nextActionText(v)}`;
  const Comp = onClick ? 'button' : 'span';
  if (size === 'xs') {
    return (
      <Comp type={onClick ? 'button' : undefined} onClick={onClick} title={title} aria-label={title} data-testid="next-action-pill"
        className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-semibold leading-4', TONE[v.bucket], className)}>
        <CalendarClock className="h-2.5 w-2.5" />{v.short ?? v.label}
      </Comp>
    );
  }
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} title={title} data-testid="next-action-pill"
      className={cn('inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', TONE[v.bucket], onClick && 'hover:brightness-95', className)}>
      <CalendarClock className="h-3 w-3 shrink-0" />
      <span className="shrink-0">{v.label}{v.when ? ` · ${v.when}` : ''}{v.time ? ` · ${v.time}` : ''}</span>
      {v.note && <span className="min-w-0 truncate font-normal opacity-90">· {v.note}</span>}
    </Comp>
  );
}
