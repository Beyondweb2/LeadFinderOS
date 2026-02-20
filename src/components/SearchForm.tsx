import { useState } from 'react';
import { Search, MapPin, Radius, Loader2, CreditCard, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { QuickLocationsList } from '@/components/QuickLocationsList';
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
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(initialRadius ?? 5);
  const [selectedCountry, setSelectedCountry] = useState<Country>('UK' as Country);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !location.trim()) return;

    onSearch({
      keyword: keyword.trim(),
      location: location.trim(),
      radius: radius * 1000,
      country: selectedCountry,
    });
  };

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardContent className="p-3 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
          {/* Main Search Fields */}
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5 sm:space-y-2">
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
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
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
                />
              </div>
              <QuickLocationsList onLocationSelect={(loc, country) => {
                setLocation(loc);
                setSelectedCountry(country);
              }} />
            </div>

            <div className="space-y-1.5 sm:space-y-2 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs font-medium text-foreground/80">
                Radius: {radius} km
              </Label>
              <div className="relative flex items-center gap-2 sm:gap-3 pt-0.5">
                <Radius className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                <Slider
                  value={[radius]}
                  onValueChange={(value) => setRadius(value[0])}
                  min={1}
                  max={100}
                  step={1}
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          {/* Submit Button with Trial Indicator */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className={`flex flex-col items-center sm:items-end w-full ${isPaidSubscriber ? '' : 'sm:w-auto'}`}>
              {freeSearchesExhausted && !isPaidSubscriber ? (
                /* Exhausted state: disabled search + upgrade CTA */
                <div className="w-full space-y-3">
                  <Button 
                    type="submit"
                    disabled
                    className="w-full sm:w-auto bg-muted text-muted-foreground cursor-not-allowed font-semibold px-5 sm:px-8 h-9 sm:h-10 text-sm opacity-60"
                  >
                    <Lock className="mr-1.5 h-3.5 w-3.5" />
                    Find Leads
                  </Button>
                  <div className="text-center sm:text-right space-y-2">
                    <p className="text-xs text-muted-foreground">
                      You've used your 3 free searches
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Upgrade to unlock unlimited searches
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5"
                      disabled={isUpgradeLoading}
                      onClick={onUpgrade}
                    >
                      {isUpgradeLoading ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Starting...</>
                      ) : (
                        <><Sparkles className="h-3.5 w-3.5" />Unlock Unlimited</>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !keyword.trim() || !location.trim() || disabled}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 sm:px-8 h-9 sm:h-10 w-full sm:w-auto text-sm"
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
                  {!isPaidSubscriber && searchesRemaining > 0 && searchesRemaining < Infinity && searchesRemaining < dailyLimit && (
                    <p className="text-xs text-muted-foreground mt-1.5 text-center sm:text-right">
                      {searchesRemaining} free search{searchesRemaining !== 1 ? 'es' : ''} remaining
                    </p>
                  )}
                  {isLoading && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-1.5 text-center sm:text-right">
                      This can take 20–30 seconds — hang tight!
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
