import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { readinessHeadline, type ReadinessSummary } from '@/lib/leadReadiness';

/* ══ LEAD READINESS ON SCREEN (2026-10-15) — the rules are src/lib/leadReadiness.ts; this only draws them.
   · ReadinessSummary — "X ready, Y need something", grouped by what is missing, with the names (add / import / audit).
   ⛔ The "Needs info" tag and its one-click fix dialog were REMOVED (Paul, 2026-10-17): leads are added as they used
     to be, and a lead that cannot be added for a real reason is not added and is counted in the add's summary. */

const MAX_NAMES = 8;
const nameList = (names: string[]) => names.length <= MAX_NAMES ? names.join(', ') : `${names.slice(0, MAX_NAMES).join(', ')} and ${names.length - MAX_NAMES} more`;

export function ReadinessSummaryBlock({ summary, testId = 'readiness-summary', onFixName, hideHeadline = false }: {
  summary: ReadinessSummary; testId?: string;
  /** The caller says the count itself (the bulk audit dialog's "N will be skipped"). */
  hideHeadline?: boolean;
  /** When given, a name in a fixable group is a button that opens its fix. */
  onFixName?: (name: string) => void;
}) {
  const total = summary.ready + summary.needs;
  if (total === 0) return null;
  return (
    <div className="space-y-1.5 text-xs" data-testid={testId}>
      {!hideHeadline && <p className="flex items-center gap-1.5 text-sm font-semibold">
        {summary.needs === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
        {readinessHeadline(summary)}
      </p>}
      {summary.groups.length > 0 && (
        <ul className="space-y-1">
          {summary.groups.map((g) => (
            <li key={g.key + g.words} className="rounded-md bg-amber-500/10 px-2 py-1">
              <span className="font-medium">{g.words}</span> <span className="text-muted-foreground">({g.names.length})</span>
              <span className="block text-muted-foreground">
                {onFixName && g.fix
                  ? g.names.slice(0, MAX_NAMES).map((n, i) => (
                    <span key={n}>{i > 0 && ', '}<button type="button" className="underline decoration-dotted hover:text-foreground" onClick={() => onFixName(n)}>{n}</button></span>
                  ))
                  : nameList(g.names)}
                {onFixName && g.fix && g.names.length > MAX_NAMES && ` and ${g.names.length - MAX_NAMES} more`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {summary.pending.length > 0 && (
        <ul className="space-y-0.5 text-muted-foreground">
          {summary.pending.map((g) => (
            <li key={g.key + g.words} className="flex items-start gap-1"><Clock className="mt-0.5 h-3 w-3 shrink-0" />{g.words}: {g.names.length}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
