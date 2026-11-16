import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { describeSearchers, type CoverageSearcher } from '@/lib/coverageState';

/* WHO SEARCHED THIS TOWN, FOR THIS TRADE, AND WHEN (Coverage, 2026-11-16, v1-team-visibility).
 * "Searched by Paul · 14 Nov" under the Found / Added numbers, for EVERY role — a town any teammate searched shows as
 * searched for everyone, so a new salesperson never runs the same town again. The full list (each person, their latest
 * date, how many times) is the tooltip. Names come from the team directory every role already reads; the endpoint sends
 * ids only. Never searched → nothing (the Found / Added cell already says "Not searched"). */
export function CoverageSearchedBy({ searchers, trade, town }: { searchers: CoverageSearcher[]; trade: string; town: string }) {
  const team = useTeamDirectory();
  if (!searchers.length || team.isLoading) return null; // never flash "a teammate" before the names arrive
  const d = describeSearchers(searchers, (id) => team.byId.get(id)?.display_name ?? null);
  if (!d.text) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xs text-muted-foreground" tabIndex={0} aria-label={d.detail + ' — ' + trade + ' in ' + town}
          data-testid="coverage-searched-by">
          {d.text}
        </span>
      </TooltipTrigger>
      <TooltipContent>{d.detail}</TooltipContent>
    </Tooltip>
  );
}
