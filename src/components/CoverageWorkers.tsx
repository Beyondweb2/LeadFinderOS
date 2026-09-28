import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OwnerAvatar } from '@/components/OwnerBadge';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { describeWorkers, type CoverageWorker } from '@/lib/coverageState';

const MAX_SHOWN = 3;

/* WHO WORKED THIS TOWN, FOR THIS TRADE (Coverage, 2026-09-28).
 * A small avatar — a stack when more than one person genuinely worked it — beside the Worked badge,
 * with the names on hover. The people come from the coverage endpoint (owners of contacted leads);
 * names and avatars from the team directory every role already reads. No per-person figure is shown
 * to a salesperson: the endpoint sends counts to the admin only. */
export function CoverageWorkers({ workers, trade, town }: { workers: CoverageWorker[]; trade: string; town: string }) {
  const team = useTeamDirectory();
  const d = describeWorkers(workers, (id) => team.byId.get(id)?.display_name ?? null);
  if (team.isLoading || !d.text) return null; // never flash "+1 other" before the names arrive
  const shown = d.named.slice(0, MAX_SHOWN);
  const extra = d.named.length - shown.length + d.unnamed;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center" aria-label={`${d.text} — ${trade} in ${town}`} data-testid="coverage-workers" tabIndex={0}>
          {shown.map((w, i) => (
            <OwnerAvatar key={w.id} name={w.name} avatarUrl={team.byId.get(w.id)?.avatar_url ?? null}
              className={i > 0 ? '-ml-1.5 ring-2 ring-background' : 'ring-2 ring-background'} />
          ))}
          {extra > 0 && (
            <span className="-ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-semibold text-muted-foreground ring-2 ring-background">
              +{extra}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{d.text}</TooltipContent>
    </Tooltip>
  );
}
