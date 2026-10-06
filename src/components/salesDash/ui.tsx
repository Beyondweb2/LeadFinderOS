import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SectionToggle, useSectionOpen } from '@/components/CollapsibleSection';
type Icon = ComponentType<{ className?: string }>;
import { SURFACE, TONE, type Tone } from './primitives';
/* The tones and the props-only primitives live in ./primitives (a leaf); re-exported so every import is unchanged. */
export { TONE, SURFACE, PageHeader, SectionHeading, Segmented, KpiCard, Figure, Empty, Dot } from './primitives';
export type { Tone } from './primitives';

/* ══ THE DASHBOARDS' DESIGN SYSTEM (Sales Experience 2026-09-28; redesigned 2026-10-02) ════════════
   ONE file for both dashboards — the Sales dashboard and the Admin dashboard draw every surface,
   heading, figure and colour from here, so they read as one product and a visual correction after
   Paul's review is one edit. (The admin panels in components/admin import from here too.)
   Colour carries meaning, the same on both pages:
   GREEN (drawn teal) money / earned / won · BLUE replies / conversations / activity · AMBER follow-up / attention ·
   PURPLE audits / AI / forecasts · RED blocked / overdue / failed · GREY secondary.
   2026-10-02 (Paul: "more modern, more colourful but tasteful, more solid, softer"): panel icons sit
   on SOLID colour tiles, figures get a soft tinted wash, corners are rounder, the shadow is softer and
   deeper, and both pages share one page header, one section heading and one segmented control. */
/* ── Panels ─────────────────────────────────────────────────────────────────────────────────────── */

/** A dashboard surface: rounded, soft shadow, a solid colour icon tile and a clear title row. With
 *  `collapseKey` it gets the shared collapse control (src/components/CollapsibleSection.tsx): the body
 *  folds away, the title and `summary` (or the hint) stay. */
export function Panel({ title, icon: I, tone = 'grey', hint, action, children, className, id, collapseKey, defaultOpen = true, summary, stackAction }: {
  title: string; icon?: Icon; tone?: Tone; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string;
  /** Phone only: put the action on its own row under the title (a wide button would squeeze the title). */
  stackAction?: boolean;
  /** Stable key — makes the panel collapsible and remembers it per person. Never derived from the title. */
  collapseKey?: string; defaultOpen?: boolean; summary?: ReactNode;
}) {
  if (collapseKey) return <CollapsiblePanel {...{ title, icon: I, tone, hint, action, children, className, id, collapseKey, defaultOpen, summary, stackAction }} />;
  return (
    <section id={id} className={cn('min-w-0 p-4 sm:p-5', SURFACE, className)}>
      <PanelHeader title={title} icon={I} tone={tone} hint={hint} action={action} stackAction={stackAction} />
      {children}
    </section>
  );
}

function PanelHeader({ title, icon: I, tone, hint, action, toggle, shut, stackAction }: { title: string; icon?: Icon; tone: Tone; hint?: ReactNode; action?: ReactNode; toggle?: ReactNode; shut?: boolean; stackAction?: boolean }) {
  /* stackAction (phone only): the action drops to its own row under the title instead of squeezing it;
     the collapse chevron stays top-right. From sm it sits beside the chevron as before. */
  if (stackAction) return (
    <header className={cn('flex flex-wrap items-start gap-3', shut ? 'mb-0' : 'mb-4')}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {I && <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONE[tone].solid)}><I className="h-[18px] w-[18px]" /></span>}
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {toggle && <div className="flex shrink-0 items-center sm:order-last">{toggle}</div>}
      {action && !shut && <div className="order-last flex basis-full items-center sm:order-none sm:basis-auto sm:shrink-0">{action}</div>}
    </header>
  );
  return (
    <header className={cn('flex items-start justify-between gap-3', shut ? 'mb-0' : 'mb-4')}>
      <div className="flex min-w-0 items-center gap-3">
        {I && <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', TONE[tone].solid)}><I className="h-[18px] w-[18px]" /></span>}
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {(action || toggle) && <div className="flex shrink-0 items-center gap-1">{!shut && action}{toggle}</div>}
    </header>
  );
}

function CollapsiblePanel({ title, icon, tone = 'grey', hint, action, children, className, id, collapseKey, defaultOpen = true, summary, stackAction }: {
  title: string; icon?: Icon; tone?: Tone; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string; collapseKey: string; defaultOpen?: boolean; summary?: ReactNode; stackAction?: boolean;
}) {
  const [open, setOpen] = useSectionOpen(collapseKey, defaultOpen);
  return (
    <section id={id} className={cn('min-w-0 p-4 sm:p-5', SURFACE, !open && 'py-3.5 sm:py-3.5', className)}>
      <PanelHeader title={title} icon={icon} tone={tone} hint={open ? hint : (summary ?? hint)} action={action} shut={!open} stackAction={stackAction}
        toggle={<SectionToggle open={open} onToggle={() => setOpen(!open)} label={title} />} />
      {open && children}
    </section>
  );
}

/** "3m ago", "2h ago", "4 Oct" */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const d = now - Date.parse(iso);
  if (!Number.isFinite(d)) return '';
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** £1,335.60 — pence always shown, thousands separated (a long money figure is read at a glance). */
export const gbp = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
