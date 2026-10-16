import { CheckCircle2, Loader2 } from 'lucide-react';
import { ToneChip, type Tone } from '@/components/operator/ui';
import { townLineWords, type TownLine, type TownRun } from '@/lib/manyTowns';

/* ══ MANY TOWNS — WHERE EACH TOWN IS (2026-10-16, src/lib/manyTowns.ts) ═══════════════════════════════════════════
   One line above the results while (and after) a many-towns press runs: each town's state, what it found, and what
   stays selected for the next press. The results themselves are the ordinary Find Leads table below.
   ⛔ No cost here: each town is an ordinary search with its own guards. */
const TONE_OF: Record<TownLine['state'], Tone> = { waiting: 'grey', searching: 'blue', done: 'green', not_found: 'amber', failed: 'red', not_searched: 'amber' };

export function ManyTownsStatus({ run }: { run: TownRun }) {
  const done = run.towns.filter((t) => t.state === 'done');
  const found = done.reduce((n, t) => n + (t.found ?? 0) - (t.duplicates ?? 0), 0);
  const failed = run.towns.filter((t) => t.state === 'failed' || t.state === 'not_searched');
  return (
    <section className="space-y-2 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm" data-testid="many-towns-status" aria-live="polite">
      <p className="flex flex-wrap items-center gap-1.5 font-semibold">
        {run.running ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        <span>{run.running ? `Searching ${run.towns.length} towns for ${run.keyword}…` : `${found} leads from ${done.length} of ${run.towns.length} towns`}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {run.towns.map((t) => (
          <ToneChip key={t.town} tone={TONE_OF[t.state]} dot testId={`many-town-${t.state}`} title={t.message}>
            {t.town}: {townLineWords(t)}
          </ToneChip>
        ))}
      </div>
      {!run.running && (failed.length > 0 || run.later.length > 0) && (
        <p className="text-xs text-muted-foreground" data-testid="many-towns-left">
          {failed.length > 0 && <>Not searched or failed: {failed.map((t) => t.town).join(', ')}{failed.some((t) => t.message) ? ` (${failed.find((t) => t.message)?.message})` : ''}. </>}
          {run.later.length > 0 && <>{run.later.length} more still selected: press Find leads again for the next ones.</>}
        </p>
      )}
    </section>
  );
}
