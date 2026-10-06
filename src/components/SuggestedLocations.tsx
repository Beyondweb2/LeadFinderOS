import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Country } from '@/types/lead';
import { countryName, isQuickLocationSelected, suggestedLocationsFor } from '@/lib/locationPicker';

/* ══ SUGGESTED LOCATIONS — FOR THE SELECTED COUNTRY ONLY (2026-10-07) ═════════════════════════════════
   Replaces the "Quick Locations" expander (a cloud of every country's tabs above a scrolling bubble of
   cities). One country's places, as chips that wrap — no inner scrollbox, no outlined bubble — the first
   SUGGESTED_COLLAPSED_COUNT with "Show all" for the rest. The rules are src/lib/locationPicker.ts. */
export function SuggestedLocations({ country, location, onPick }: {
  country: Country;
  location: string;
  onPick: (city: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  /* A different country starts collapsed again — its list is a different length. */
  useEffect(() => { setShowAll(false); }, [country]);
  const { visible, hiddenCount } = suggestedLocationsFor(country, showAll);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid="find-leads-suggested-locations">
      <p className="text-[11px] font-medium text-muted-foreground">Suggested in {countryName(country)}</p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((city) => {
          const selected = isQuickLocationSelected(location, city, country);
          return (
            <button
              key={city}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(city)}
              className={cn(
                'inline-flex h-7 max-w-full items-center rounded-full border px-2.5 text-xs transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'border-primary/60 bg-primary/15 text-primary'
                  : 'border-border/60 bg-muted/40 text-foreground/80 hover:border-primary/50 hover:bg-primary/10 hover:text-primary',
              )}
            >
              <span className="truncate">{city}</span>
            </button>
          );
        })}
        {(hiddenCount > 0 || showAll) && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex h-7 items-center rounded-full px-2 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="find-leads-suggested-toggle"
          >
            {showAll ? 'Show fewer' : `Show all (${hiddenCount} more)`}
          </button>
        )}
      </div>
    </div>
  );
}
