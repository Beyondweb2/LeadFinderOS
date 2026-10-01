import { CalendarClock, Pencil, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { nextActionText, nextActionView, type NextActionView } from '@/lib/nextActionView';
import { noteBesideTime } from '@/lib/workspaceHeader';

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

type Lead = { next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null; next_action_note?: string | null; call_booked_at?: string | null };

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
      <span className="shrink-0">{v.label}{v.when ? ` · ${v.when}` : ' · No date set'}{v.time ? ` · ${v.time}` : ''}</span>
      {v.note && <span className="min-w-0 truncate font-normal opacity-90">· {v.note}</span>}
    </Comp>
  );
}

const BAR_TONE: Record<NextActionView['bucket'], string> = {
  overdue: 'border-red-500/40 bg-red-500/[0.07]',
  today: 'border-amber-500/40 bg-amber-500/[0.07]',
  upcoming: 'border-border/70 bg-muted/30',
  none: 'border-border/70 bg-muted/30',
};
const BAR_ICON: Record<NextActionView['bucket'], string> = {
  overdue: 'text-red-600 dark:text-red-400',
  today: 'text-amber-600 dark:text-amber-400',
  upcoming: 'text-primary',
  none: 'text-primary',
};

/* THE NEXT ACTION BAR — the lead workspace header's DISPLAY of the one stored next action (declutter pass,
   2026-10-01). Line 1 is what and when ("Meeting · Tomorrow · 08:30"), line 2 the person's own words; Edit
   opens the ONE editor on the Work tab (NextActionForm) — this bar never edits anything itself. A meeting's
   saved note starts "Meeting at 08:30", which the bar already says, so only the rest is shown (noteBesideTime).
   No next action: one quiet line and "Set one". */
export function NextActionBar({ lead, onEdit, className }: { lead: Lead | null | undefined; onEdit?: () => void; className?: string }) {
  const v = nextActionView(lead);
  if (!v) {
    return (
      <div className={cn('flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/70 px-3 py-1.5 text-xs text-muted-foreground', className)} data-testid="next-action-bar" data-bucket="none">
        <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />No next action</span>
        {onEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 font-medium text-primary hover:underline" data-testid="next-action-bar-edit"><Plus className="h-3 w-3" />Set one</button>}
      </div>
    );
  }
  const note = noteBesideTime(v.note, v.time);
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2', BAR_TONE[v.bucket], className)} data-testid="next-action-bar" data-bucket={v.bucket} title={`Next action: ${nextActionText(v)}`}>
      <CalendarClock className={cn('mt-0.5 h-4 w-4 shrink-0', BAR_ICON[v.bucket])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-5">
          {v.label}
          {v.when ? <span className={cn('font-medium', v.bucket === 'overdue' ? 'text-red-700 dark:text-red-300' : v.bucket === 'today' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground/80')}> · {v.when}</span>
            : <span className="font-medium text-muted-foreground"> · No date set</span>}
          {v.time && <span className="font-medium text-foreground/80"> · {v.time}</span>}
        </p>
        {note && <p className="line-clamp-2 break-words text-xs text-muted-foreground">{note}</p>}
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10" data-testid="next-action-bar-edit" aria-label="Edit the next action">
          <Pencil className="h-3 w-3" />Edit
        </button>
      )}
    </div>
  );
}
