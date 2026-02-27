import * as React from 'react';
import { cn } from '@/lib/utils';

interface PillProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Color variant class string, e.g. "bg-amber-500/20 text-amber-400 border-amber-500/40" */
  variant?: string;
  children: React.ReactNode;
}

/**
 * Unified pill/chip used across the Outreach CRM for Contact, Status, and Next Action columns.
 * Fixed sizing ensures visual consistency regardless of content.
 */
const Pill = React.forwardRef<HTMLDivElement, PillProps>(
  ({ className, variant, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // Fixed sizing
        'h-8 min-w-[120px] max-w-[170px] px-3',
        // Layout
        'inline-flex items-center justify-center gap-2',
        // Shape
        'rounded-full',
        // Typography
        'text-[13px] font-semibold leading-none whitespace-nowrap',
        // Overflow
        'overflow-hidden text-ellipsis',
        // Border
        'border border-white/[0.08]',
        // Default muted styling (overridden by variant)
        'bg-muted text-muted-foreground',
        variant,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Pill.displayName = 'Pill';

export { Pill };
