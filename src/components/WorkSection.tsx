import { useState, type ComponentType, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE COLLAPSIBLE SECTION FOR THE LEAD WORKSPACE'S WORK TAB (declutter pass 2, 2026-10-01).
   Paul: "one consistent visual pattern … a collapsed section should still show the useful summary."
   Every folding Work section — Log a contact, Campaign, Call booked, Sign-up link, WhatsApp outreach —
   draws THIS header: icon, label, one-line summary, the same chevron. Rules:
     · the summary says the section's current state in a few words ("Plumbers Leeds", "Sent 1 Oct · opened");
     · `alert` is drawn under the header whether open or not — a warning is never folded away;
     · the body stays MOUNTED while folded (hidden), so a picked template or a typed note survives a fold;
     · no children → no chevron, no toggle: a section with nothing more to show is just its line.
   Open state is local by default; pass `open` + `onOpenChange` when the parent decides (Log a contact).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const WORK_CARD = 'rounded-xl border border-border/60 bg-card/60 shadow-sm';
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-foreground/70';

export function WorkSection({
  icon: Icon, iconClass = 'text-primary', title, summary, summaryClass, alert, after, children,
  defaultOpen = false, open: openProp, onOpenChange, testId, className,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClass?: string;
  title: string;
  summary?: ReactNode;
  summaryClass?: string;
  /** Shown open or folded: warnings, a paused queue, a blocking gap. */
  alert?: ReactNode;
  /** Shown open or folded, after the body: a result line. */
  after?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
  className?: string;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = openProp ?? own;
  const expandable = children !== undefined && children !== null && children !== false;
  const toggle = () => { const n = !open; if (openProp === undefined) setOwn(n); onOpenChange?.(n); };
  const head = (
    <>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} />
      <span className={cn(LABEL, 'shrink-0')}>{title}</span>
      {summary !== undefined && summary !== null && summary !== '' && (
        <span className={cn('min-w-0 truncate text-xs text-muted-foreground', summaryClass)} data-testid={testId ? `${testId}-summary` : undefined}>{summary}</span>
      )}
      {expandable && <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />}
    </>
  );
  return (
    <section className={cn(WORK_CARD, 'px-3.5 py-2.5', open && expandable && 'pb-3.5', className)} data-testid={testId} data-open={expandable ? (open ? 'true' : 'false') : undefined}>
      {expandable ? (
        <button type="button" className="flex min-h-[28px] w-full items-center gap-2 text-left" aria-expanded={open} onClick={toggle} data-testid={testId ? `${testId}-toggle` : undefined}>
          {head}
        </button>
      ) : (
        <div className="flex min-h-[28px] w-full items-center gap-2">{head}</div>
      )}
      {alert && <div className="mt-1.5">{alert}</div>}
      {expandable && <div className="mt-2.5" hidden={!open}>{children}</div>}
      {after && <div className="mt-2">{after}</div>}
    </section>
  );
}
