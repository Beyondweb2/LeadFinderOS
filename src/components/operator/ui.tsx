import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, Loader2, Lock, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TONE, type Tone } from '@/components/salesDash/primitives';

/* ══ THE OPERATOR SURFACES' PRIMITIVES (2026-10-06, operator design consistency) ════════════════════
   The Sales dashboard, Find Leads and Outreach set the look; the dialogs, the Paid Client pages, Team
   and the admin cards now draw from the SAME tokens. This file adds only what the dashboards never
   needed — a dialog header, a status chip, a callout, a sub-section that is NOT another box, an action
   row — and re-exports the dashboards' props-only primitives (salesDash/primitives.tsx).

   ⛔ ONE SOURCE OF COLOUR: every tone comes from TONE in components/salesDash/ui.tsx. Colour carries
      the same meaning everywhere: GREEN (drawn teal) money / done / won · BLUE information / activity ·
      AMBER attention / waiting · PURPLE audits / AI · RED blocked / failed · GREY secondary.
   ⛔ NO BOX IN A BOX: inside a Panel or a dialog, group with SubSection (a coloured marker and a
      heading, no border) — a bordered box goes inside a surface only when it is a distinct object
      (a callout, a figure, a list row).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export { TONE, SURFACE, Figure, Empty, KpiCard, PageHeader, SectionHeading, Segmented, Dot } from '@/components/salesDash/primitives';
export type { Tone } from '@/components/salesDash/primitives';
/* ⛔ A LEAF, like salesDash/primitives: nothing here may load the app's wiring (auth, the Supabase client),
   so a component rendered from plain data — a test under tsx — can use it. Panel is NOT re-exported: its
   collapse control reads the signed-in user. Import Panel from '@/components/salesDash/ui'. */

type Icon = ComponentType<{ className?: string }>;

/** A solid colour icon tile — the dashboards' panel icon, in three sizes. */
export function IconTile({ icon: I, tone = 'grey', size = 'md', className }: { icon: Icon; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'sm' ? 'h-7 w-7 rounded-lg' : size === 'lg' ? 'h-11 w-11 rounded-2xl' : 'h-9 w-9 rounded-xl';
  const ic = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-[18px] w-[18px]';
  return <span className={cn('flex shrink-0 items-center justify-center', box, TONE[tone].solid, className)} aria-hidden><I className={ic} /></span>;
}

/** A status pill: soft tint, coloured text, an optional icon or dot. The one chip for states. */
export function ToneChip({ tone = 'grey', icon: I, dot = false, children, className, title, testId }: {
  tone?: Tone; icon?: Icon; dot?: boolean; children: ReactNode; className?: string; title?: string; testId?: string;
}) {
  return (
    <span title={title} data-testid={testId} data-tone={tone}
      className={cn('inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ring-1 ring-inset', TONE[tone].soft, TONE[tone].text, TONE[tone].ring, className)}>
      {I && <I className="h-3 w-3 shrink-0" />}
      {!I && dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE[tone].dot)} />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** A success / warning / error / information message: the tone's soft wash, a small icon tile, a title
 *  and the detail. `red` is announced to screen readers. */
export function Callout({ tone = 'blue', icon, title, children, action, className, testId }: {
  tone?: Tone; icon?: Icon; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; testId?: string;
}) {
  return (
    <div role={tone === 'red' ? 'alert' : undefined} data-testid={testId} data-tone={tone}
      className={cn('flex min-w-0 items-start gap-3 rounded-2xl px-3.5 py-3 text-sm', TONE[tone].tint, className)}>
      {icon && <IconTile icon={icon} tone={tone} size="sm" className="mt-0.5" />}
      <div className="min-w-0 flex-1">
        {title && <p className={cn('font-semibold leading-snug', TONE[tone].text)}>{title}</p>}
        {children && <div className={cn('leading-snug text-foreground/85', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/** A group INSIDE a panel or dialog: a coloured marker, a compact heading, an optional action — and no
 *  border of its own, so a card never holds a stack of identical grey boxes. */
export function SubSection({ title, icon: I, tone = 'grey', hint, action, children, className, id, testId }: {
  title: ReactNode; icon?: Icon; tone?: Tone; hint?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; id?: string; testId?: string;
}) {
  return (
    <section id={id} data-testid={testId} className={cn('min-w-0', className)}>
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('h-4 w-1 shrink-0 rounded-full', TONE[tone].bar)} aria-hidden />
        {I && <I className={cn('h-4 w-4 shrink-0', TONE[tone].text)} />}
        <h3 className="min-w-0 text-sm font-bold tracking-tight">{title}</h3>
        {hint && <span className="min-w-0 text-xs text-muted-foreground">{hint}</span>}
        {action && <div className="ml-auto flex flex-wrap items-center gap-2">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** A dialog's header: the solid icon tile, the title (the dialog's accessible name), a line of purpose
 *  and the status chips — the dashboards' panel header at the top of a popup. */
export function DialogHero({ icon, tone = 'blue', title, subtitle, chips, className }: {
  icon: Icon; tone?: Tone; title: ReactNode; subtitle?: ReactNode; chips?: ReactNode; className?: string;
}) {
  return (
    <DialogHeader className={cn('space-y-0', className)}>
      <div className="flex min-w-0 items-start gap-3">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <DialogTitle className="break-words">{title}</DialogTitle>
          {subtitle && <DialogDescription className="mt-0.5 text-xs leading-snug sm:text-sm">{subtitle}</DialogDescription>}
          {chips && <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>}
        </div>
      </div>
    </DialogHeader>
  );
}

/** The row of actions at the end of a dialog or panel. `sticky` keeps it on screen while a long dialog
 *  scrolls (the dialog must be the scroll container — the base DialogContent is). */
export function ActionBar({ children, sticky = false, className }: { children: ReactNode; sticky?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3',
      sticky && 'sticky bottom-0 z-10 -mb-4 bg-card/95 pb-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:-mb-6 sm:pb-6', className)}>
      {children}
    </div>
  );
}

/** A label and its value, compact — the facts grid on a client or lead (no box per fact). */
export function Fact({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

/* ── The four states every screen and popup can be in besides "showing data" (2026-10-06, full-app
   design consistency): loading, failed (with Retry), empty, not allowed. One look, one wording shape.
   ⛔ Leaf only: props in, markup out. The caller owns the fetch and the retry. */

/** Loading: a spinner and what is being loaded, centred in the space the content will take. */
export function LoadState({ label = 'Loading…', className, compact = false }: { label?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div role="status" aria-live="polite" data-testid="load-state"
      className={cn('flex items-center justify-center gap-2 text-sm text-muted-foreground', compact ? 'py-4' : 'py-12', className)}>
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** Failed: what could not be loaded, the reason in plain words when known, and Retry. Announced. */
export function ErrorState({ title = 'Couldn’t load this', detail, onRetry, retryLabel = 'Try again', className }: {
  title?: ReactNode; detail?: ReactNode; onRetry?: () => void; retryLabel?: string; className?: string;
}) {
  return (
    <Callout tone="red" icon={AlertTriangle} title={title} testId="error-state" className={className}
      action={onRetry ? <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-full" onClick={onRetry}><RotateCcw className="h-3.5 w-3.5" />{retryLabel}</Button> : undefined}>
      {detail}
    </Callout>
  );
}

/** Empty: what this area is for, why it is empty, and the next useful action — compact, no fluff. */
export function EmptyState({ icon: I, title, children, action, tone = 'grey', className, testId = 'empty-state' }: {
  icon?: Icon; title: ReactNode; children?: ReactNode; action?: ReactNode; tone?: Tone; className?: string; testId?: string;
}) {
  return (
    <div data-testid={testId} className={cn('flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center', className)}>
      {I && <IconTile icon={I} tone={tone} />}
      <p className="text-sm font-semibold">{title}</p>
      {children && <div className="max-w-md text-xs leading-snug text-muted-foreground">{children}</div>}
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Not allowed: this screen or action belongs to another role. Says so plainly; never a blank page. */
export function DeniedState({ title = 'Not available on your account', children, className }: { title?: ReactNode; children?: ReactNode; className?: string }) {
  return <EmptyState icon={Lock} tone="grey" title={title} className={className} testId="denied-state">{children}</EmptyState>;
}

/** The left accent edge for a card whose state matters (a row that needs attention, a held sale). */
export const EDGE: Record<Tone, string> = {
  green: 'border-l-[3px] border-l-teal-500',
  blue: 'border-l-[3px] border-l-blue-500',
  amber: 'border-l-[3px] border-l-amber-500',
  purple: 'border-l-[3px] border-l-violet-500',
  red: 'border-l-[3px] border-l-red-500',
  grey: 'border-l-[3px] border-l-border',
};
