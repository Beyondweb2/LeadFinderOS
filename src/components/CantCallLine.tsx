import { cn } from '@/lib/utils';

/* "N we can't call hidden · Show" (2026-11-16, src/lib/callRules.ts callableVerdict). One grey line on Find leads and Outreach —
   the same shape as the "outside the town" line. Nothing is deleted: Show lists them greyed, each with its reason. */
export function CantCallLine({ count, shown, onToggle, className }: { count: number; shown: boolean; onToggle: () => void; className?: string }) {
  if (count <= 0) return null;
  return (
    <p className={cn('text-xs text-muted-foreground', className)} data-testid="cant-call-line"
      title="Their only number is a 09 premium-rate number, not a valid number, or in a country calling isn't switched on for. Nothing is deleted.">
      {shown ? `${count} we can't call shown (greyed)` : `${count} we can't call hidden`}{' · '}
      <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onToggle} data-testid="cant-call-toggle">
        {shown ? 'Hide' : `Show ${count} we can't call`}
      </button>
    </p>
  );
}
