import { useState } from 'react';
import { Loader2, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { mergeAreas } from '@/lib/coverageTowns';

/* "Expand into towns" (Paul, 2026-11-16; src/lib/coverageTowns.ts). AI turns the client's "area they cover" into real towns or
   boroughs; Paul picks them into "Service areas" (still editable there) and saves the context as usual. A suggestion only:
   nothing is saved, written into questions or measured from this box. */
export function CoverageTownsSuggest({ coverage, primaryTown, country, trade, areas, disabled, onAreas }: {
  coverage: string; primaryTown: string; country?: string | null; trade?: string | null;
  areas: readonly string[]; disabled?: boolean; onAreas: (next: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const have = new Set(areas.map((a) => a.trim().toLowerCase()));
  const expand = async () => {
    setBusy(true); setError(null);
    try {
      const r = await invokeEdge<{ ok: boolean; places?: string[]; note?: string | null; detail?: string }>('coverage-towns', {
        coverage_area: coverage, primary_town: primaryTown, country: country ?? '', trade: trade ?? '',
      });
      if (!r?.ok) throw new Error(r?.detail || 'The AI could not answer just now.');
      setPlaces(r.places ?? []); setNote(r.note ?? null);
    } catch (e) {
      setError(edgeErrorMessage(e, 'The AI could not answer just now. Try again, or type the towns yourself.'));
    } finally { setBusy(false); }
  };
  const missing = (places ?? []).filter((p) => !have.has(p.toLowerCase()));
  return (
    <div className="mt-2 space-y-2" data-testid="coverage-towns">
      <Button type="button" size="sm" variant="outline" disabled={disabled || busy || coverage.trim().length < 3} onClick={() => void expand()}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <MapPin className="mr-1 h-4 w-4"/>}Expand into towns (AI)
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {places && (
        <div className="rounded-md border border-dashed p-2 text-xs">
          {places.length === 0
            ? <p className="text-muted-foreground">No towns suggested{note ? `: ${note}` : '.'} Type them into Service areas yourself.</p>
            : <>
                <p className="mb-1 text-muted-foreground">AI suggestion: check each one is really covered. Click a town to add it to <b>Service areas</b>, then edit and <b>Save client context</b>.</p>
                <div className="flex flex-wrap gap-1">
                  {places.map((p) => {
                    const added = have.has(p.toLowerCase());
                    return (
                      <button key={p} type="button" disabled={disabled || added} data-testid="coverage-town"
                        onClick={() => onAreas(mergeAreas(areas, [p]))}
                        className={`rounded-full border px-2 py-0.5 ${added ? 'border-emerald-400 text-emerald-700 dark:text-emerald-300' : 'hover:bg-muted'}`}>
                        {added ? '✓ ' : ''}{p}
                      </button>
                    );
                  })}
                </div>
                {missing.length > 1 && <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 px-2 text-xs" disabled={disabled} onClick={() => onAreas(mergeAreas(areas, missing))}><Plus className="mr-1 h-3 w-3"/>Add all {missing.length}</Button>}
                {note && <p className="mt-1 text-muted-foreground">{note}</p>}
              </>}
        </div>
      )}
    </div>
  );
}
