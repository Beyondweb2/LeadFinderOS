import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ══ THE SALES DASHBOARD'S DESIGN TOKENS (Sales Experience, 2026-09-28) ═════════════════════════════
   One place for the colour system, so a visual correction after Paul's review is one edit here:
   GREEN money / earned / won · BLUE replies / conversations / activity · AMBER follow-up / attention ·
   PURPLE audits / AI · RED blocked / overdue / failed · GREY secondary. */
export type Tone = 'green' | 'blue' | 'amber' | 'purple' | 'red' | 'grey';

export const TONE: Record<Tone, { text: string; soft: string; ring: string; icon: string; dot: string; bar: string }> = {
  green:  { text: 'text-emerald-700 dark:text-emerald-300', soft: 'bg-emerald-500/10', ring: 'ring-emerald-500/25', icon: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', dot: 'bg-emerald-500', bar: 'bg-emerald-500' },
  blue:   { text: 'text-blue-700 dark:text-blue-300',       soft: 'bg-blue-500/10',    ring: 'ring-blue-500/25',    icon: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',          dot: 'bg-blue-500',    bar: 'bg-blue-500' },
  amber:  { text: 'text-amber-700 dark:text-amber-300',     soft: 'bg-amber-500/10',   ring: 'ring-amber-500/25',   icon: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',       dot: 'bg-amber-500',   bar: 'bg-amber-500' },
  purple: { text: 'text-violet-700 dark:text-violet-300',   soft: 'bg-violet-500/10',  ring: 'ring-violet-500/25',  icon: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',    dot: 'bg-violet-500',  bar: 'bg-violet-500' },
  red:    { text: 'text-red-700 dark:text-red-300',         soft: 'bg-red-500/10',     ring: 'ring-red-500/25',     icon: 'bg-red-500/15 text-red-600 dark:text-red-300',             dot: 'bg-red-500',     bar: 'bg-red-500' },
  grey:   { text: 'text-muted-foreground',                  soft: 'bg-muted/60',       ring: 'ring-border',         icon: 'bg-muted text-muted-foreground',                           dot: 'bg-muted-foreground/60', bar: 'bg-muted-foreground/50' },
};

type Icon = ComponentType<{ className?: string }>;

/** A dashboard surface: rounded, soft border, a clear title row. */
export function Panel({ title, icon: I, tone = 'grey', hint, action, children, className, id }: {
  title: string; icon?: Icon; tone?: Tone; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  return (
    <section id={id} className={cn('min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5', className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {I && <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE[tone].icon)}><I className="h-4 w-4" /></span>}
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight tracking-tight">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** A headline number. `hero` is the money card: filled, the strongest surface on the page. */
export function KpiCard({ label, value, sub, icon: I, tone, hero = false, onClick, children }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: Icon; tone: Tone; hero?: boolean; onClick?: () => void; children?: ReactNode;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick}
      className={cn('group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl p-3 text-left shadow-sm transition sm:p-5',
        hero ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white ring-1 ring-emerald-400/30 dark:from-emerald-600 dark:to-emerald-800'
             : cn('border border-border/60 bg-card'),
        onClick && 'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transform-none')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide sm:text-xs', hero ? 'text-emerald-50/90' : 'text-muted-foreground')}>{label}</span>
        <span className={cn('hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex', hero && '!flex', hero ? 'bg-white/15 text-white' : TONE[tone].icon)}><I className="h-4 w-4" /></span>
      </div>
      <div className={cn('mt-2 font-bold tabular-nums tracking-tight', hero ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl', !hero && TONE[tone].text)}>{value}</div>
      {sub && <div className={cn('mt-1 text-[11px] leading-snug sm:text-xs', hero ? 'text-emerald-50/85' : 'text-muted-foreground')}>{sub}</div>}
      {children}
    </Comp>
  );
}

/** A compact figure for the Today strip. */
export function StatTile({ label, value, icon: I, tone, onClick, title }: { label: string; value: ReactNode; icon: Icon; tone: Tone; onClick?: () => void; title?: string }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} title={title}
      className={cn('flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left', TONE[tone].soft,
        onClick && 'transition hover:ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', onClick && TONE[tone].ring)}>
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', TONE[tone].icon)}><I className="h-3.5 w-3.5" /></span>
      <span className="min-w-0">
        <span className={cn('block text-lg font-bold leading-none tabular-nums', TONE[tone].text)}>{value}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-muted-foreground">{label}</span>
      </span>
    </Comp>
  );
}

export function Empty({ children, icon: I }: { children: ReactNode; icon?: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
      {I && <I className="h-5 w-5 opacity-50" />}
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

export const gbp = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `£${n.toFixed(2)}`);
