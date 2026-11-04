import type { ReactNode } from 'react';

/** A section of the prospect page: a small heading, then its content. */
export function CallBlock({ title, children, testId, action }: { title: string; children: ReactNode; testId?: string; action?: ReactNode }) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 shrink-0 rounded-full bg-blue-500" aria-hidden />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/80">{title}</h3>
        {action && <span className="ml-auto min-w-0">{action}</span>}
      </div>
      {children}
    </section>
  );
}
