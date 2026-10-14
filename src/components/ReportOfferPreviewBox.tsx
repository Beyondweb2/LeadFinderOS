import { useEffect } from 'react';
import { checkReportOffer, summariseReportOffer, type ReportOfferSummary } from '@/lib/reportOfferCheck';

type Value = ReportOfferSummary | 'checking' | 'failed' | null;

/* The report offer's pre-check in the queue dialog (2026-10-14, src/lib/reportOfferTemplate.ts): how many of the
   selection can get it, who cannot and why, and the warnings (never blocking). The press re-checks; the drip checks again. */
export function ReportOfferPreviewBox({ ids, value, setValue, nameOf }: {
  ids: string[]; value: Value; setValue: (v: Value) => void; nameOf: (id: string) => string;
}) {
  const key = ids.join(',');
  useEffect(() => {
    let alive = true;
    setValue('checking');
    void checkReportOffer(ids).then((c) => { if (alive) setValue(c.ok ? summariseReportOffer(c, ids, nameOf) : 'failed'); });
    return () => { alive = false; setValue(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const names = (n: string[]) => `${n.slice(0, 4).join(', ')}${n.length > 4 ? ` +${n.length - 4} more` : ''}`;
  return (
    <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs" data-testid="report-offer-check">
      {value === 'checking' || value === null ? <p className="text-muted-foreground">Checking each lead’s AI check, score and report…</p>
        : value === 'failed' ? <p className="text-destructive">Couldn’t check these leads just now. Nothing will be queued until the check works.</p>
        : (
          <>
            <p className="font-medium">{value.okIds.length} of {ids.length} can get this message.</p>
            {value.refused.map((r) => (
              <p key={r.label} className="text-destructive">Not queued — {r.names.length} {r.label}: {names(r.names)}</p>
            ))}
            {value.warnings.map((w) => (
              <p key={w.label} className="text-amber-700 dark:text-amber-300">Check — {w.names.length} {w.label}: {names(w.names)}</p>
            ))}
          </>
        )}
    </div>
  );
}
