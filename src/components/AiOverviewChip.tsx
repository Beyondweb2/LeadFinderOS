/* Google AI Overview as a chip beside the ChatGPT and Gemini chips (2026-10-19, Paul: "AI Overview
   everywhere"). Every app surface draws it through this one component; the words come from
   src/lib/aiOverview.ts (overviewChipText / overviewChipTitle), the same as the reports.
   ⛔ DISPLAY ONLY: coloured by what was captured (named / not named) with a DASHED edge and "not scored",
   so it never reads as a third score. "No AI Overview shown" and "not recorded" are neutral grey. */
import { cn } from '@/lib/utils';
import { IN_SCORE_TEXT, NOT_IN_SCORE_TEXT, AI_OVERVIEW_LABEL, overviewChipText, overviewChipTitle, overviewChipValue, NO_OVERVIEW_TEXT, type OverviewTally } from '@/lib/aiOverview';
import { scoreTone, SCORE_TONE_CLASS } from '@/lib/scoreTone';

/** SCORE_TONE_CLASS's colours with a dashed BORDER instead of a ring (written out so Tailwind sees them). */
const AIO_CHIP_CLASS: Record<ReturnType<typeof scoreTone>, string> = {
  strong: 'bg-emerald-500/10 border-emerald-500/50',
  good: 'bg-lime-500/10 border-lime-500/50',
  weak: 'bg-amber-500/10 border-amber-500/50',
  poor: 'bg-red-500/10 border-red-500/50',
  none: 'bg-muted border-border',
};

export function AiOverviewChip({ tally, label = AI_OVERVIEW_LABEL, showNotScored = false, inScore = false, className, testId = 'aio-chip' }: {
  tally: OverviewTally | null | undefined;
  /** "Google AI Overview" by default; a cramped row may pass "AI Overview" (the tooltip still says Google). */
  label?: string;
  /** Adds a muted "in score" / "not in score" after the figure where there is room. */
  showNotScored?: boolean;
  /** This audit's scoring method counts Google AI (aiOverview.ts scoringMethodFor, 2026-10-19): a solid edge. */
  inScore?: boolean;
  className?: string;
  testId?: string;
}) {
  const t = tally ?? null;
  const tone = t && t.shown > 0 ? scoreTone(t.named, t.shown) : 'none';
  const value = overviewChipValue(t);
  const state = t && t.shown > 0 ? 'shown' : value === NO_OVERVIEW_TEXT ? 'none' : 'unknown';
  return (
    <span
      data-testid={testId}
      data-engine="ai_overview"
      data-state={state}
      data-tone={tone}
      data-in-score={inScore ? 'true' : 'false'}
      title={overviewChipTitle(t, inScore)}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5', !inScore && 'border-dashed', AIO_CHIP_CLASS[tone], className)}
    >
      <span className={cn('font-semibold', SCORE_TONE_CLASS[tone].text)}>{overviewChipText(t, label)}</span>
      {showNotScored && state === 'shown' && <span className="text-[10px] font-normal text-muted-foreground">{inScore ? IN_SCORE_TEXT : NOT_IN_SCORE_TEXT}</span>}
    </span>
  );
}
