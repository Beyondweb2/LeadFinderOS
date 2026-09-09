import { useCallback, useEffect, useRef } from 'react';
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
import type { SearchFilters } from '@/types/lead';

interface SearchFormProps {
  onSearch: (filters: SearchFilters) => void;
  isLoading: boolean;
  isOnTrial?: boolean;
  searchesRemaining?: number;
  dailyLimit?: number;
  isPaidSubscriber?: boolean;
  disabled?: boolean;
  initialRadius?: number;
  /* URL-SEEDED VALUES. Present when the page was opened from Coverage's "Find leads", or on a
     pasted link / refresh / back button. They win over the persisted boxes ONCE, on mount, so the
     inputs describe the search actually on screen — boxes reading "plumber / Bourne" above Wisbech
     locksmiths results is the quiet kind of wrong this codebase keeps getting caught by. */
  initialKeyword?: string;
  initialLocation?: string;
  /**
   * Run the search ONCE on arrival — set by Coverage's "Find leads" button, which exists to run a
   * search rather than to prefill a box and wait.
   *
   * ⚠️ IT USED TO BE A MODE RATHER THAN A BOOLEAN, and that mattered while this form could also run
   * a market view: `mode` was persisted, so an operator whose last visit was a market view would
   * have fired a MARKET VIEW from a button labelled Find leads. The market view is gone
   * (2026-09-09), so there is only one thing to run and the mode guard has nothing left to protect.
   * ⛔ THE GUARD THAT STILL MATTERS IS BELOW AND IS UNCHANGED: keyword and location are PERSISTED,
   * so this must not fire until the form actually HOLDS what the URL asked for. Firing early runs
   * the PREVIOUS search's terms, spends the money, and then paints the right town above the wrong
   * results.
   */
  autoSubmit?: boolean;
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
  initialKeyword,
  initialLocation,
  autoSubmit = null,
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
  /* ⚠️ `find-leads-mode` IS NO LONGER READ. It was the persisted leads/market choice; the market
     view was removed on 2026-09-09. Old values stay in browser storage harmlessly — nothing reads
     the key, and clearing other people's localStorage is not worth a migration. */

  /* Apply the URL seeds once. Ref-guarded rather than an empty dep array so the linter stays happy
     and a later re-render can never re-stomp what the operator has since typed. */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (initialKeyword) setKeyword(initialKeyword);
    if (initialLocation) setLocation(initialLocation);
  }, [initialKeyword, initialLocation, setKeyword, setLocation]);

  /* ⛔ ONE PLACE BUILDS THE FILTERS, so the auto-run and the button cannot send different searches.
     Every value comes from the form's own state — the radius, country and town-only the operator can
     SEE — rather than from defaults invented by whoever triggered it. A search that ran on 50km while
     the box read 25km is the "measurement right, document lying" fault in its cheapest form. */
  const runSearch = useCallback(() => {
    if (!keyword.trim() || !location.trim()) return false;
    onSearch({
      keyword: keyword.trim(),
      location: location.trim(),
      // Still sent when townOnly is on: the server ignores it for the search itself but uses it
      // for the cache key and for the fallback message if the town has no boundary.
      radius: radius * 1000,
      country: selectedCountry,
      townOnly,
    });
    return true;
  }, [keyword, location, radius, selectedCountry, townOnly, onSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
  };

  /* THE ARRIVAL RUN, AND EVERY CONDITION ON IT IS A POSITIVE TEST OF WHAT WE WANT.
     ⛔ THE BUG THIS SHAPE EXISTS TO PREVENT, caught before shipping: keyword and location are
     PERSISTED, and the seeding effect above sets state — which is not visible until the next render.
     On the first commit this effect still sees the PREVIOUS search's values. Firing then would run
     "plumber / Bourne" from a button that said locksmiths in Wisbech, spend the money, and then paint
     the right town in the boxes above the wrong results. Exactly the measurement-right /
     document-lying fault, in its cheapest form.
     So it fires only when the form HOLDS WHAT THE URL ASKED FOR — same keyword, same town. A seed
     that has not landed yet, or failed to land at all, spends nothing and leaves the operator to
     press Search. */
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!autoSubmit || autoSubmitted.current || !seeded.current) return;
    if (initialKeyword && keyword.trim() !== initialKeyword.trim()) return;   // the trade we were asked for
    if (initialLocation && location.trim() !== initialLocation.trim()) return; // the town we were asked for
    if (!keyword.trim() || !location.trim()) return;                       // nothing to search for
    autoSubmitted.current = true;
    runSearch();
  }, [autoSubmit, keyword, location, initialKeyword, initialLocation, runSearch]);

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardContent className="p-3 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
          {/* ⛔ THE MODE TOGGLE IS GONE (2026-09-09). This form used to offer "Find leads" or
              "Market view", and the second is what Paul said he never uses — confirmed against the
              data: 96 market audits ever, ALL in August, none since the 24th, while 1,352 leads were
              added by plain search in the same fortnight. The question the market view was built to
              answer ("is this niche worth outreaching?") is answered better and for free by the
              trade-wide niche read on Coverage, so there is one thing this form does now and it
              does not need naming twice. */}
          <p className="text-[11px] text-muted-foreground">
            Search returns local businesses you can add to the CRM.
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
                <Label className={`whitespace-nowrap text-xs font-medium transition-colors ${townOnly ? 'text-muted-foreground/50' : 'text-foreground/80'}`}>
                  Radius: {radius} km
                </Label>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="town-only"
                    className="whitespace-nowrap text-xs font-medium cursor-pointer text-foreground/80"
                  >
                    This town only
                  </Label>
                  <Switch
                    id="town-only"
                    checked={townOnly}
                    onCheckedChange={setTownOnly}
                  />
                </div>
              </div>
              {/* Dimmed as ONE unit — icon, track and thumb together — so "off" reads as deliberate
                  rather than broken. The shared Slider's own `disabled:opacity-50` sits on the thumb
                  and never fires: Radix sets data-disabled, not the HTML disabled attribute, so
                  without this the control looks live while ignoring every drag. `disabled` stays for
                  the real a11y/interaction state; the opacity is only what makes it legible. */}
              <div className={`relative flex items-center gap-2 sm:gap-3 pt-0.5 transition-opacity ${townOnly ? 'opacity-40' : ''}`}>
                <Radius className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 text-muted-foreground" />
                <Slider
                  value={[radius]}
                  onValueChange={(value) => setRadius(value[0])}
                  min={1}
                  max={50}
                  step={1}
                  disabled={townOnly}
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
