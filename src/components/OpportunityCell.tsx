import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { OPP_GROUP_LABELS, OPP_NEEDS_LABELS, oppGroupOf, type OppGroup, type OppResult } from '@/lib/opportunityScore';

/* THE OPPORTUNITY CELL (2026-11-16, docs/OPPORTUNITY_SCORE.md; made compact 2026-11-17, Paul): ONE small pill in the row.
   A score ("66 Hot") shows ONLY when both the website scan and the AI audit have run; until then a small grey pill says
   which is missing: "Needs scan", "Needs audit" or "Needs both" (never a guess). The reasons, and the row's AI chips
   (ChatGPT / Gemini / Google AI, `aiSlot`), live in the hover (desktop) or a tap (phone). ⛔ TEAM ONLY: a sorting aid,
   never sent, never a prediction of AI visibility. */

const GROUP_STYLE: Record<OppGroup, string> = {
  hot: 'border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300',
  warm: 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  cold: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  incomplete: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  excluded: 'border-muted-foreground/30 bg-muted text-muted-foreground line-through',
};

export const OPPORTUNITY_TITLE = 'Opportunity score: how well this lead fits our ICP (AI ignores them and their website is the reason). Team only, not a prediction.';

/** The words on the pill: "66 Hot", "Needs scan" / "Needs audit" / "Needs both", "Excluded". */
export function oppPillWords(result: OppResult): string {
  if (result.kind === 'scored') return `${result.score} ${OPP_GROUP_LABELS[result.band]}`;
  if (result.kind === 'incomplete') return OPP_NEEDS_LABELS[result.needs];
  return OPP_GROUP_LABELS.excluded;
}

export function OpportunityCell({ result, aiSlot, compact = false }: { result: OppResult; aiSlot?: ReactNode; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const group = oppGroupOf(result);
  const lines = result.kind === 'incomplete'
    ? [`Missing: ${result.missing.join('; ')}`, ...result.reasons.slice(0, 2).map((r) => r.text)]
    : result.kind === 'excluded' ? [result.why] : result.reasons.map((r) => r.text);
  const words = oppPillWords(result);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Opportunity: ${words}`}
          data-testid="opportunity-cell" data-group={group}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className={cn('inline-flex shrink-0 items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring', compact && 'max-w-[220px]')}>
          <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', GROUP_STYLE[group])} data-testid="opportunity-pill">
            {result.critical && <AlertTriangle className="h-3 w-3 text-red-600 dark:text-red-400" data-testid="opportunity-critical" aria-label="Critical site issue" />}
            {result.kind === 'scored' ? <><span className="tabular-nums">{result.score}</span>{OPP_GROUP_LABELS[result.band]}</> : words}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 space-y-2 p-3 text-xs" onClick={(e) => e.stopPropagation()} onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', GROUP_STYLE[group])}>{words}</span>
          {result.critical && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
              <AlertTriangle className="h-3 w-3" />Critical site issue
            </span>
          )}
        </div>
        <ul className="space-y-0.5 text-[11px] leading-snug text-muted-foreground" data-testid="opportunity-reasons">
          {lines.slice(0, 3).map((t, i) => <li key={i}>· {t}</li>)}
        </ul>
        {aiSlot && <div className="border-t pt-2" data-testid="opportunity-ai">{aiSlot}</div>}
        <p className="border-t pt-1.5 text-[10px] text-muted-foreground">{OPPORTUNITY_TITLE}</p>
      </PopoverContent>
    </Popover>
  );
}
