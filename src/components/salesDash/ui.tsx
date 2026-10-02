import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SectionToggle, useSectionOpen } from '@/components/CollapsibleSection';

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
export type Tone = 'green' | 'blue' | 'amber' | 'purple' | 'red' | 'grey';

export const TONE: Record<Tone, { text: string; soft: string; ring: string; icon: string; dot: string; bar: string; solid: string; tint: string }> = {
  /* 'green' is the MONEY tone; since 2026-10-02 it is drawn in TEAL (Paul: no green-on-green). The key stays 'green'. */
  green:  { text: 'text-teal-700 dark:text-teal-300', soft: 'bg-teal-500/10', ring: 'ring-teal-500/25', icon: 'bg-teal-500/15 text-teal-600 dark:text-teal-300', dot: 'bg-teal-400', bar: 'bg-teal-400',
            solid: 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-900/40', tint: 'bg-gradient-to-br from-teal-500/[0.16] via-teal-500/[0.06] to-transparent ring-1 ring-inset ring-teal-400/25' },
  blue:   { text: 'text-blue-700 dark:text-blue-300',       soft: 'bg-blue-500/10',    ring: 'ring-blue-500/25',    icon: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',          dot: 'bg-blue-500',    bar: 'bg-blue-500',
            solid: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm shadow-blue-600/30',        tint: 'bg-gradient-to-br from-blue-500/[0.13] via-blue-500/[0.05] to-transparent ring-1 ring-inset ring-blue-500/20' },
  amber:  { text: 'text-amber-700 dark:text-amber-300',     soft: 'bg-amber-500/10',   ring: 'ring-amber-500/25',   icon: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',       dot: 'bg-amber-500',   bar: 'bg-amber-500',
            solid: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-orange-500/30',  tint: 'bg-gradient-to-br from-amber-500/[0.14] via-amber-500/[0.05] to-transparent ring-1 ring-inset ring-amber-500/20' },
  purple: { text: 'text-violet-700 dark:text-violet-300',   soft: 'bg-violet-500/10',  ring: 'ring-violet-500/25',  icon: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',    dot: 'bg-violet-500',  bar: 'bg-violet-500',
            solid: 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm shadow-violet-600/30', tint: 'bg-gradient-to-br from-violet-500/[0.13] via-violet-500/[0.05] to-transparent ring-1 ring-inset ring-violet-500/20' },
  red:    { text: 'text-red-700 dark:text-red-300',         soft: 'bg-red-500/10',     ring: 'ring-red-500/25',     icon: 'bg-red-500/15 text-red-600 dark:text-red-300',             dot: 'bg-red-500',     bar: 'bg-red-500',
            solid: 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm shadow-red-600/30',         tint: 'bg-gradient-to-br from-red-500/[0.13] via-red-500/[0.05] to-transparent ring-1 ring-inset ring-red-500/20' },
  grey:   { text: 'text-muted-foreground',                  soft: 'bg-muted/60',       ring: 'ring-border',         icon: 'bg-muted text-muted-foreground',                           dot: 'bg-muted-foreground/60', bar: 'bg-muted-foreground/50',
            solid: 'bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-sm shadow-slate-600/20',     tint: 'bg-muted/50 ring-1 ring-inset ring-border/60' },
};

/** The one card surface. Every panel, hero and table on both dashboards sits on it. */
export const SURFACE = 'rounded-[1.25rem] border border-border/70 bg-card shadow-[0_1px_2px_hsl(0_0%_0%/0.06),0_12px_32px_-18px_hsl(0_0%_0%/0.35)]';

type Icon = ComponentType<{ className?: string }>;

/* ── Page header and section headings (both dashboards) ─────────────────────────────────────────── */

/** The top of a dashboard: a small greeting, the page name, one line of purpose, and the actions. */
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pt-1">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>}
        <h1 className="mt-0.5 text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-[2rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A group of panels under one heading: a coloured marker, a clear title, one line of what it is for. */
export function SectionHeading({ title, hint, tone = 'grey', id }: { title: string; hint?: ReactNode; tone?: Tone; id?: string }) {
  return (
    <div id={id} className="flex items-center gap-3 px-1 pt-2">
      <span className={cn('h-6 w-1.5 shrink-0 rounded-full', TONE[tone].bar)} aria-hidden />
      <div className="min-w-0">
        <h2 className="text-lg font-bold leading-tight tracking-tight">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** A pill-shaped segmented control (the admin's period picker, the sales follow-up lists). */
export function Segmented<K extends string>({ options, value, onChange, label, wrapOnPhone = false }: {
  options: { key: K; label: ReactNode; count?: number; tone?: Tone }[]; value: K; onChange: (k: K) => void; label: string;
  /** Phone only: the pills wrap onto rows instead of scrolling sideways (long lists, e.g. the follow-ups). */
  wrapOnPhone?: boolean;
}) {
  return (
    <div className={cn('-mx-1 px-1 pb-1', wrapOnPhone ? 'sm:overflow-x-auto' : 'overflow-x-auto')}>
      <div className={cn('gap-1 p-1', wrapOnPhone ? 'flex flex-wrap rounded-2xl bg-muted/50 sm:inline-flex sm:flex-nowrap sm:rounded-full sm:bg-muted/70 sm:ring-1 sm:ring-inset sm:ring-border/50' : 'inline-flex rounded-full bg-muted/70 ring-1 ring-inset ring-border/50')} role="group" aria-label={label}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={on}
              className={cn('flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition',
                on ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60' : 'text-muted-foreground hover:text-foreground')}>
              {o.tone && on && <span className={cn('h-1.5 w-1.5 rounded-full', TONE[o.tone].dot)} />}
              {o.label}
              {o.count !== undefined && <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', on && o.tone ? cn(TONE[o.tone].soft, TONE[o.tone].text) : 'bg-background/60')}>{o.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

/* ── Figures ────────────────────────────────────────────────────────────────────────────────────── */

/** A headline number on its own card: a tinted wash in its colour, a solid icon tile, the figure big.
 *  `hero` is the money card: solid colour, the strongest surface on the page. */
export function KpiCard({ label, value, sub, icon: I, tone, hero = false, onClick, children }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: Icon; tone: Tone; hero?: boolean; onClick?: () => void; children?: ReactNode;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick}
      className={cn('group relative flex h-full w-full min-w-0 flex-col overflow-hidden p-3 text-left transition sm:p-5',
        hero ? cn('rounded-[1.25rem]', TONE[tone].solid) : cn(SURFACE),
        onClick && 'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transform-none')}>
      {!hero && <span className={cn('pointer-events-none absolute inset-0 rounded-[1.25rem]', TONE[tone].tint)} aria-hidden />}
      <div className="relative flex items-center justify-between gap-2">
        <span className={cn('min-w-0 text-[11px] font-semibold leading-tight sm:truncate sm:text-xs', hero ? 'text-white/85' : 'text-muted-foreground')}>{label}</span>
        <span className={cn('hidden h-8 w-8 shrink-0 sm:flex items-center justify-center rounded-xl', hero ? 'bg-white/20 text-white' : TONE[tone].solid)}><I className="h-4 w-4" /></span>
      </div>
      <div className={cn('relative mt-auto pt-1.5 text-2xl font-extrabold tabular-nums tracking-tight sm:mt-2 sm:pt-0 sm:text-3xl', hero && 'text-4xl')}>{value}</div>
      {sub && <div className={cn('relative mt-1 hidden text-xs leading-snug sm:block', hero ? 'text-white/80' : 'text-muted-foreground')}>{sub}</div>}
      {children}
    </Comp>
  );
}

/** A compact figure inside a panel. `strong` gives it its colour's tinted wash and coloured number. */
export function Figure({ label, value, sub, tone = 'grey', strong }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; strong?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-2xl px-3.5 py-3', strong ? TONE[tone].tint : 'bg-muted/40 ring-1 ring-inset ring-border/40')}>
      <p className="truncate text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-xl font-extrabold tabular-nums leading-tight tracking-tight', strong && TONE[tone].text)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Empty({ children, icon: I }: { children: ReactNode; icon?: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-7 text-center text-xs text-muted-foreground">
      {I && <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><I className="h-4 w-4 opacity-70" /></span>}
      {children}
    </div>
  );
}

export function Dot({ tone }: { tone: Tone }) { return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', TONE[tone].dot)} />; }

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
