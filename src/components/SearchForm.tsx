import { useEffect, useRef } from 'react';
import { Search, MapPin, Radius, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePersistedState } from '@/hooks/usePersistedState';
import logoIcon from '@/assets/leadfinder-logo-icon.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { QuickLocationsList } from '@/components/QuickLocationsList';
import { QuickBusinessTypes } from '@/components/QuickBusinessTypes';
import type { Country } from '@/types/lead';
import type { SearchFilters, SearchMode } from '@/types/lead';

interface SearchFormProps {
  onSearch: (filters: SearchFilters) => void;
  isLoading: boolean;
  isOnTrial?: boolean;
  searchesRemaining?: number;
  dailyLimit?: number;
  isPaidSubscriber?: boolean;
  disabled?: boolean;
  initialRadius?: number;
  /* URL-SEEDED VALUES. Present only when the page was opened on a market-view URL (a pasted link,
     a refresh, the back button). They win over the persisted boxes ONCE, on mount, so the inputs
     describe the market actually on screen — boxes reading "plumber / Bourne" above a Wisbech
     locksmiths view is the quiet kind of wrong this codebase keeps getting caught by. */
  initialMode?: SearchMode;
  initialKeyword?: string;
  initialLocation?: string;
  onUpgrade?: () => void;
  isUpgradeLoading?: boolean;
  freeSearchesExhausted?: boolean;
}

export function SearchForm({ 
  onSearch, 
  isLoading, 
  isOnTrial = false, 
  searchesRemaining = 2, 
  dailyLimit = 2,
  isPaidSubscriber = false,
  disabled = false,
  initialRadius,
  initialMode,
  initialKeyword,
  initialLocation,
  onUpgrade,
  isUpgradeLoading = false,
  freeSearchesExhausted = false,
}: SearchFormProps) {
  // Persist the search inputs per-user (tier 'both' to survive a tab close, matching the
  // already-persisted results) so returning to Find Leads keeps the boxes filled.
  const { user } = useAuth();
  const persist = { tier: 'both', scope: user?.id } as const;
  const [keyword, setKeyword] = usePersistedState('find-leads-keyword', '', persist);
  const [location, setLocation] = usePersistedState('find-leads-location', '', persist);
  const [radius, setRadius] = usePersistedState('find-leads-radius', initialRadius ?? 50, persist);
  const [selectedCountry, setSelectedCountry] = usePersistedState<Country>('find-leads-country', 'UK' as Country, persist);
  // Persisted exactly like radius — same tier, same per-user scope — so the mode survives a
  // reload instead of quietly reverting to a radius search between sessions.
  /* ⛔ DEFAULT ON, 2026-08-09. locationBias is a HINT — Google returns results outside the circle
     whatever the radius — so the old default let a Corby locksmith arrive from a Wisbech search and
     be audited against Wisbech. 31 of 44 measurable audits were more than 10km from the town they
     asked about; 28 of those reached a prospect.
     ⚠️ IT DOES NOT LOSE LEADS. townOnly runs a nearby pass and returns out-of-boundary results
     ALONGSIDE the town ones, tagged outsideTown, now rendered as an "Outside town" badge. Measured
     against Google's own cached viewports: 63% of leads with coordinates sit outside the town they
     were searched from — 91% for Wisbech, 92% for Bourne. Those are the leads that were quietly
     becoming wrong-town audits; they are still returned, just no longer indistinguishable.
     ⚠️ IT COSTS ONE EXTRA GOOGLE PAGE per search (~$0.035) for the nearby pass. A persisted toggle,
     so turning it off once turns it off for good. */
  const [townOnly, setTownOnly] = usePersistedState('find-leads-town-only', true, persist);
  /* SEARCH MODE. 'leads' = the existing lead search, unchanged. 'market' = read what we already
     know about this trade in this town. Persisted like the other inputs so the page comes back the
     way it was left. */
  const [mode, setMode] = usePersistedState<SearchMode>('find-leads-mode', 'leads' as SearchMode, persist);

  /* TOWN-ONLY IS FORCED ON IN MARKET MODE. The market view compares a MEASURED town against the
     businesses in that same town; a radius pool drags in neighbouring towns the audits never
     covered, which is the exact bug that put businesses in the prospect list that were never in the
     market. The toggle stays visible so it is clear what is happening, but it is not the operator's
     to turn off here. */
  const effectiveTownOnly = mode === 'market' ? true : townOnly;

  /* Apply the URL seeds once. Ref-guarded rather than an empty dep array so the linter stays happy
     and a later re-render can never re-stomp what the operator has since typed. */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (initialMode) setMode(initialMode);
    if (initialKeyword) setKeyword(initialKeyword);
    if (initialLocation) setLocation(initialLocation);
  }, [initialMode, initialKeyword, initialLocation, setMode, setKeyword, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !location.trim()) return;

    onSearch({
      keyword: keyword.trim(),
      location: location.trim(),
      // Still sent when townOnly is on: the server ignores it for the search itself but uses it
      // for the cache key and for the fallback message if the town has no boundary.
      radius: radius * 1000,
      country: selectedCountry,
      townOnly: effectiveTownOnly,
      mode,
    });
  };

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardContent className="p-3 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
          {/* MODE. Deliberately louder than the town-only switch: this changes what the Search
              button DOES, not merely how wide it looks. A segmented control rather than a toggle so
              both options are named on screen and neither is a hidden default. */}
          <div className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-1 sm:w-auto">
            {(['leads', 'market'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none sm:px-4 ${
                  mode === m
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'leads' ? 'Find leads' : 'Market view'}
              </button>
            ))}
          </div>
          <p className="-mt-1 text-[11px] text-muted-foreground sm:-mt-4">
            {mode === 'leads'
              ? 'Search returns local businesses you can add to the CRM.'
              : 'Search reads what AI already says about this trade in this town \u2014 no spend.'}
          </p>

          {/* Main Search Fields */}
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 sm:space-y-2" data-walkthrough-step="business-type-area">
              <Label htmlFor="keyword" className="text-xs font-medium text-foreground/80">
                Business Type
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                <Input
                  id="keyword"
                  placeholder="e.g. plumber, electrician"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="pl-8 sm:pl-10 h-9 sm:h-10 bg-input border-border focus:ring-primary text-sm"
                  data-walkthrough-step="business-type"
                />
              </div>
              <QuickBusinessTypes onSelect={setKeyword} selected={keyword} />
            </div>

            <div className="space-y-1.5 sm:space-y-2" data-walkthrough-step="location-area">
              <Label htmlFor="location" className="text-xs font-medium text-foreground/80">
                Location
              </Label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                <Input
                  id="location"
                  placeholder="City or postcode"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-8 sm:pl-10 h-9 sm:h-10 bg-input border-border focus:ring-primary text-sm"
                  data-walkthrough-step="location"
                />
              </div>
              <QuickLocationsList onLocationSelect={(loc, country) => {
                setLocation(loc);
                setSelectedCountry(country);
              }} />
            </div>

            {/* HOW WIDE TO SEARCH — one control group. The radius and the town boundary answer the
                same question, so they share a cell. As its own bordered block below the grid the
                toggle read as an unrelated setting. */}
            <div className="space-y-1.5 sm:space-y-2 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between gap-3">
                <Label className={`whitespace-nowrap text-xs font-medium transition-colors ${effectiveTownOnly ? 'text-muted-foreground/50' : 'text-foreground/80'}`}>
                  Radius: {radius} km
                </Label>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="town-only"
                    className={`whitespace-nowrap text-xs font-medium ${mode === 'market' ? 'text-muted-foreground' : 'cursor-pointer text-foreground/80'}`}
                    title={mode === 'market' ? 'Always on in market view: the pool has to be the same town that was measured.' : undefined}
                  >
                    This town only{mode === 'market' ? ' (always)' : ''}
                  </Label>
                  <Switch
                    id="town-only"
                    checked={effectiveTownOnly}
                    onCheckedChange={setTownOnly}
                    disabled={mode === 'market'}
                  />
                </div>
              </div>
              {/* Dimmed as ONE unit — icon, track and thumb together — so "off" reads as deliberate
                  rather than broken. The shared Slider's own `disabled:opacity-50` sits on the thumb
                  and never fires: Radix sets data-disabled, not the HTML disabled attribute, so
                  without this the control looks live while ignoring every drag. `disabled` stays for
                  the real a11y/interaction state; the opacity is only what makes it legible. */}
              <div className={`relative flex items-center gap-2 sm:gap-3 pt-0.5 transition-opacity ${effectiveTownOnly ? 'opacity-40' : ''}`}>
                <Radius className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 text-muted-foreground" />
                <Slider
                  value={[radius]}
                  onValueChange={(value) => setRadius(value[0])}
                  min={1}
                  max={50}
                  step={1}
                  disabled={effectiveTownOnly}
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          {/* Submit Button with Trial Indicator */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 sm:gap-4">
            <div className="flex flex-col items-center sm:items-end w-full sm:w-auto">
              {freeSearchesExhausted && !isPaidSubscriber ? (
                /* Exhausted state: disabled search + upgrade CTA */
                <div className="w-full space-y-3">
                  <Button
                    type="button"
                    size="lg"
                    className="btn-premium w-full sm:w-auto gap-2 font-semibold px-5 sm:px-8 h-[44px] sm:h-[44px] text-sm text-white"
                    disabled={isUpgradeLoading}
                    onClick={onUpgrade}
                  >
                    {isUpgradeLoading ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />Starting...</>
                    ) : (
                      <><img src={logoIcon} alt="" className="h-5 w-5 object-contain" />Upgrade to Unlock</>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !keyword.trim() || !location.trim() || disabled}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 sm:px-8 h-[44px] sm:h-[44px] py-2 w-full sm:w-auto text-sm"
                    data-walkthrough-step="search"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                        Find Leads
                      </>
                    )}
                  </Button>
                  {isLoading && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-1.5 text-center sm:text-right">
                      This can take 20-30 seconds - hang tight!
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
