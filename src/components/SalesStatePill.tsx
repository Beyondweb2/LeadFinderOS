import { CalendarCheck, History, PhoneOff, Star } from 'lucide-react';
import { contactAgo, type LastContactView, type SalesStateTone, type SalesStateView } from '@/lib/leadState';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALES STATE AND THE LAST CONTACT, AS EVERY SCREEN DRAWS THEM (lead state audit, 2026-09-30).
   The reading itself is src/lib/leadState.ts (salesStateOf, lastContactOf) — this file only draws it,
   so Focus Mode, the lead popup, Outreach and the Inbox can never describe one lead differently.
   ⛔ Nothing here writes or reads — the data hooks are src/hooks/useLeadSalesState.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const TONE_CLASS: Record<SalesStateTone, string> = {
  quiet: 'border-border/70 bg-muted/60 text-foreground/80',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  strong: 'border-blue-600 bg-blue-600 text-white',
  stopped: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

export function SalesStatePill({ view, size = 'sm', className }: { view: SalesStateView; size?: 'xs' | 'sm'; className?: string }) {
  const Icon = view.state === 'meeting_booked' ? CalendarCheck : view.state === 'wrong_number' ? PhoneOff : view.state === 'interested' ? Star : null;
  return (
    <span
      className={cn('inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full border font-semibold',
        size === 'xs' ? 'px-2 py-0 text-[10px]' : 'px-2.5 py-0.5 text-xs', TONE_CLASS[view.tone], className)}
      data-testid="sales-state" data-state={view.state}
      title={view.detail ? `${view.label} · ${view.detail}` : view.label}
    >
      {Icon && <Icon className={cn(size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3', view.state === 'interested' && 'fill-current')} />}
      {view.label}{view.detail ? <span className="font-normal opacity-90">· {view.detail}</span> : null}
    </span>
  );
}

const LAST_TONE = { good: 'text-emerald-700 dark:text-emerald-300', bad: 'text-red-700 dark:text-red-300', neutral: 'text-foreground' } as const;

/** "Last contact: Call · Left voicemail · 2h ago · Sam" — one short line. */
export function LastContactLine({ v, actorName, className, prefix = true }: { v: LastContactView | null; actorName?: string | null; className?: string; prefix?: boolean }) {
  if (!v) return <span className={cn('text-xs text-muted-foreground/70', className)} data-testid="last-contact">{prefix ? 'Last contact: ' : ''}none yet</span>;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground', className)} data-testid="last-contact" title={v.note ?? undefined}>
      <History className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate">
        {prefix ? 'Last contact: ' : ''}{v.method} · <span className={cn('font-semibold', LAST_TONE[v.tone])}>{v.outcome}</span> · {contactAgo(v.at)}
        {actorName ? ` · ${actorName}` : ''}{v.note ? ` · “${v.note}”` : ''}
      </span>
    </span>
  );
}
