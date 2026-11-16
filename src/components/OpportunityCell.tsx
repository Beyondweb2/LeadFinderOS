import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OPP_GROUP_LABELS, oppGroupOf, type OppGroup, type OppResult } from '@/lib/opportunityScore';

/* THE OPPORTUNITY CELL (2026-11-16, docs/OPPORTUNITY_SCORE.md): band + number, a red mark for a critical website issue, and
   the top reasons in plain words, always visible (Paul: "each lead shows its top 2–3 reasons"). ⛔ TEAM ONLY: a sorting aid,
   never sent, never a prediction of AI visibility. Incomplete says what is missing; nothing is guessed. */

const GROUP_STYLE: Record<OppGroup, string> = {
  hot: 'border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300',
  warm: 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  cold: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  incomplete: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  excluded: 'border-muted-foreground/30 bg-muted text-muted-foreground line-through',
};

export const OPPORTUNITY_TITLE = 'Opportunity score: how well this lead fits our ICP (AI ignores them and their website is the reason). Team only, not a prediction.';

export function OpportunityCell({ result, compact = false }: { result: OppResult; compact?: boolean }) {
  const group = oppGroupOf(result);
  const lines = result.kind === 'incomplete'
    ? [`Missing: ${result.missing.join('; ')}`, ...result.reasons.slice(0, 2).map((r) => r.text)]
    : result.kind === 'excluded' ? [result.why] : result.reasons.map((r) => r.text);
  return (
    <div className={cn('flex flex-col gap-0.5 text-left', compact ? 'max-w-[220px]' : 'max-w-[260px]')} data-testid="opportunity-cell" data-group={group} title={OPPORTUNITY_TITLE}>
      <span className="flex items-center gap-1.5">
        <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', GROUP_STYLE[group])}>
          {result.kind === 'scored' && <span className="tabular-nums">{result.score}</span>}
          {OPP_GROUP_LABELS[group]}
        </span>
        {result.critical && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 whitespace-nowrap" data-testid="opportunity-critical">
            <AlertTriangle className="h-3 w-3" />Critical site issue
          </span>
        )}
      </span>
      <ul className="text-[11px] leading-snug text-muted-foreground" data-testid="opportunity-reasons">
        {lines.slice(0, 3).map((t, i) => <li key={i} className="truncate" title={t}>· {t}</li>)}
      </ul>
    </div>
  );
}
