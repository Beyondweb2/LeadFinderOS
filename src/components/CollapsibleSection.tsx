/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE COLLAPSE PATTERN FOR EVERY DASHBOARD SECTION (Paul, 2026-09-30).

   A small chevron in the section header; the whole body folds away; the title and a one-line summary
   stay visible, and nothing else is left behind (no empty padding). Used by the dashboard Panel, the
   Admin dashboard's card sections (DashboardSection), the Paid Client hub's stages and the long lists
   inside Prepare baseline — the same hook, the same button, the same words.

   ⛔ REMEMBERED PER PERSON, on this device (usePersistedState tier 'local', scoped to the signed-in
      user) — the dashboard stays how THEY left it, and a teammate on the same browser gets their own.
   ⛔ ONE STABLE KEY PER SECTION, passed in — never built from the title (a reworded heading would
      silently re-open every section; DashboardSection's header has the history).
   ⛔ A SHUT SECTION'S BODY IS UNMOUNTED, not hidden: cards run their own reads, and a hidden card
      would keep fetching for nobody.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/** Open/shut for one section, remembered per signed-in user on this device. */
export function useSectionOpen(key: string, defaultOpen = true): [boolean, (open: boolean) => void] {
  const { user } = useAuth();
  const [open, setOpen] = usePersistedState<boolean>(`section.${key}`, defaultOpen, { tier: 'local', scope: user?.id ?? null });
  return [open, (v: boolean) => setOpen(v)];
}

/** The chevron. Small, unobtrusive, and says what it does to a screen reader. */
export function SectionToggle({ open, onToggle, label, className }: { open: boolean; onToggle: () => void; label: string; className?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      title={open ? 'Collapse' : 'Expand'}
      className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', className)}>
      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}

/**
 * A titled block with the collapse control: heading + summary + optional actions in one row, the body
 * below. `summary` is shown beside the title when shut (so a closed section still says something).
 * `persistKey` omitted = not remembered (a list inside a dialog that should open fresh each time).
 */
export function CollapsibleBlock({ persistKey, title, summary, actions, defaultOpen = true, children, className, headerClassName, titleClassName, as: Tag = 'section' }: {
  persistKey?: string; title: ReactNode; summary?: ReactNode; actions?: ReactNode; defaultOpen?: boolean; children: ReactNode;
  className?: string; headerClassName?: string; titleClassName?: string; as?: 'section' | 'div';
}) {
  const [open, setOpen] = useSectionOpenMaybe(persistKey, defaultOpen);
  const label = typeof title === 'string' ? title : 'section';
  return (
    <Tag className={className}>
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', headerClassName)}>
        <SectionToggle open={open} onToggle={() => setOpen(!open)} label={label} className="-ml-1.5" />
        <button type="button" onClick={() => setOpen(!open)} className={cn('min-w-0 text-left font-medium', titleClassName)}>{title}</button>
        {summary && <span className="min-w-0 text-xs text-muted-foreground">{summary}</span>}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </Tag>
  );
}

/* A dialog's inner lists open fresh each time (no key), everything else remembers. The hook order is
   fixed either way: both hooks always run. */
function useSectionOpenMaybe(key: string | undefined, defaultOpen: boolean): [boolean, (v: boolean) => void] {
  const remembered = useSectionOpen(key ?? '__unpersisted__', defaultOpen);
  const [local, setLocal] = useState(defaultOpen);
  return key ? remembered : [local, setLocal];
}
