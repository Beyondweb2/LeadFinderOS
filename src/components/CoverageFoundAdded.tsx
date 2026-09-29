import type { FoundAdded } from '@/lib/coverageState';

/* ══ FOUND vs ADDED, ONE COVERAGE CELL (Paul, 2026-09-29) — src/lib/coverageState.ts foundAddedByPair ══
   Four separate numbers, compact enough to scan down 700 rows:
     Found  34 with website · 18 without
     Added  22 with website · 11 without
   A pair searched only before recording shows "Breakdown not recorded" — never an estimate. A pair
   never searched shows "Not searched". */
export function CoverageFoundAdded({ fa, trade, town }: { fa: FoundAdded | null; trade: string; town: string }) {
  if (!fa) return <span className="text-xs text-muted-foreground/70">Not searched</span>;
  if (fa.status === 'not_recorded') {
    return (
      <span className="text-xs text-muted-foreground" title={`Searched for ${trade} in ${town} before Found / Added was recorded (29 Sep 2026). The counts from those searches were taken after exclusions, so they are not shown. The next search here records it.`}>
        Breakdown not recorded
      </span>
    );
  }
  const Line = ({ k, w, wo }: { k: string; w: number; wo: number }) => (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="w-11 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="tabular-nums"><b>{w}</b> with website</span>
      <span className="text-muted-foreground">·</span>
      <span className="tabular-nums"><b>{wo}</b> without</span>
    </span>
  );
  return (
    <span className="flex flex-col gap-0.5 text-xs" data-testid="coverage-found-added"
      title={fa.unrecordedRuns ? `${fa.unrecordedRuns} earlier search${fa.unrecordedRuns === 1 ? '' : 'es'} here predate the recording and are not counted.` : undefined}>
      <Line k="Found" w={fa.foundWithWebsite} wo={fa.foundWithoutWebsite} />
      <Line k="Added" w={fa.addedWithWebsite} wo={fa.addedWithoutWebsite} />
    </span>
  );
}
