/* The lead's AI result as three small chips — ChatGPT, Gemini, Google AI Overview — for panels that quote
   one engine's answer (the voice-note script, the reply drafters), so the reader sees the whole result the
   words were drawn from (2026-10-19, Paul: "AI Overview everywhere"). Read-only, from the SAME cached
   query the Inbox strip uses (useHookVisibility), so it adds no request when the strip is on screen and
   can never disagree with it. Nothing renders until there is a hook result.
   ⛔ DISPLAY ONLY. It never changes a script, a draft or what is sent. */
import { useHookVisibility } from '@/hooks/useHookVisibility';
import { overviewTally } from '@/lib/aiOverview';
import { scoreTone, SCORE_TONE_CLASS } from '@/lib/scoreTone';
import { cn } from '@/lib/utils';
import { AiOverviewChip } from '@/components/AiOverviewChip';

export function LeadAiResultChips({ leadId, className }: { leadId: string | null | undefined; className?: string }) {
  const q = useHookVisibility(leadId);
  const score = q.data?.card?.score;
  if (!score || score.expected === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-[11px]', className)} data-testid="lead-ai-result-chips">
      <span className="font-semibold uppercase tracking-wider text-muted-foreground">AI result</span>
      {score.perEngine.map((t) => {
        const tone = t.valid === t.expected ? scoreTone(t.named, t.expected) : 'none';
        return (
          <span key={t.engine} data-engine={t.engine} className={cn('whitespace-nowrap rounded-full px-2 py-0.5 font-semibold tabular-nums ring-1 ring-inset', SCORE_TONE_CLASS[tone].chip, SCORE_TONE_CLASS[tone].text)}>
            {t.label} {t.valid === t.expected ? `${t.named}/${t.expected}` : `${t.named} of ${t.valid}`}
          </span>
        );
      })}
      <AiOverviewChip tally={overviewTally(score.overviews)} showNotScored inScore={score.scored.googleAi.inScore} testId="lead-ai-overview-chip" />
    </div>
  );
}
