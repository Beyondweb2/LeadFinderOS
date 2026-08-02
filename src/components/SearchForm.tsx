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
  const [townOnly, setTownOnly] = usePersistedState('find-leads-town-only', false, persist);

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
      townOnly,
    });
  };

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardContent className="p-3 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
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

            <div className="space-y-1.5 sm:space-y-2 sm:col-span-2 lg:col-span-1">
              <Label className={`text-xs font-medium ${townOnly ? 'text-muted-foreground/50' : 'text-foreground/80'}`}>
                Radius: {radius} km
              </Label>
              <div className="relative flex items-center gap-2 sm:gap-3 pt-0.5">
                <Radius className={`h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 ${townOnly ? 'text-muted-foreground/40' : 'text-muted-foreground'}`} />
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

          {/* THIS TOWN ONLY. A separate mode, not a smaller radius: the radius is a soft hint to
              Google and it returns neighbouring towns whatever it is set to. This sends the town's
              own boundary as a hard restriction instead, which is why the slider is disabled and
              says so rather than sitting there looking like it still applies. */}
          <div className="flex items-start gap-2.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
            <Switch
              id="town-only"
              checked={townOnly}
              onCheckedChange={setTownOnly}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="town-only" className="text-xs font-medium text-foreground/90 cursor-pointer">
                This town only
              </Label>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {townOnly
                  ? 'Searching inside the town boundary only — the radius slider is ignored, and the extra sweep for no-website leads is skipped.'
                  : 'Off: the radius is a hint, so Google can return nearby towns too.'}
              </p>
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
