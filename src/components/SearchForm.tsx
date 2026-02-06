import { useState } from 'react';
import { Search, MapPin, Radius, Star, MessageSquare, Loader2, Phone, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { QuickLocationsList } from '@/components/QuickLocationsList';
import type { Country } from '@/types/lead';
import { Switch } from '@/components/ui/switch';
import type { SearchFilters } from '@/types/lead';

interface SearchFormProps {
  onSearch: (filters: SearchFilters) => void;
  isLoading: boolean;
  isOnTrial?: boolean;
  searchesRemaining?: number;
  dailyLimit?: number;
  subscribed?: boolean;
}

export function SearchForm({ 
  onSearch, 
  isLoading, 
  isOnTrial = false, 
  searchesRemaining = 3, 
  dailyLimit = 3,
  subscribed = false 
}: SearchFormProps) {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(5);
  const [minRating, setMinRating] = useState(0);
  const [minReviews, setMinReviews] = useState(2); // Default to 2 to filter out inactive businesses
  const [requirePhone, setRequirePhone] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country>('UK' as Country);
  const [deepSearch, setDeepSearch] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !location.trim()) return;

    onSearch({
      keyword: keyword.trim(),
      location: location.trim(),
      radius: radius * 1000, // Convert to meters
      minRating: minRating > 0 ? minRating : undefined,
      minReviews: minReviews > 0 ? minReviews : undefined,
      requirePhone,
      country: selectedCountry,
      deepSearch,
    });
  };

  return (
    <Card className="glass-panel border-border/50">
      <CardContent className="p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Main Search Fields */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="keyword" className="text-xs sm:text-sm font-medium text-foreground/80">
                Business Type
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="keyword"
                  placeholder="e.g. plumber, electrician"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="pl-10 bg-input border-border focus:ring-primary text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="text-xs sm:text-sm font-medium text-foreground/80">
                Location
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="location"
                  placeholder="City or postcode"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-10 bg-input border-border focus:ring-primary text-sm"
                />
              </div>
              <QuickLocationsList onLocationSelect={(loc, country) => {
                setLocation(loc);
                setSelectedCountry(country);
              }} />
            </div>

            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs sm:text-sm font-medium text-foreground/80">
                Radius: {radius} km
              </Label>
              <div className="relative flex items-center gap-3 pt-1">
                <Radius className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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

          {/* Advanced Filters - Hidden by default for trial users */}
          {subscribed && (
            <Collapsible open={showFilters} onOpenChange={setShowFilters}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" type="button" className="text-muted-foreground hover:text-foreground text-xs sm:text-sm">
                  <ChevronDown className={`h-4 w-4 mr-1.5 sm:mr-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                  Advanced Filters
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl">
                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm font-medium text-foreground/80 flex items-center gap-1.5 sm:gap-2">
                      <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Min Rating: {minRating > 0 ? minRating.toFixed(1) : 'Any'}
                    </Label>
                    <Slider
                      value={[minRating]}
                      onValueChange={(value) => setMinRating(value[0])}
                      min={0}
                      max={5}
                      step={0.5}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm font-medium text-foreground/80 flex items-center gap-1.5 sm:gap-2">
                      <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Min Reviews: {minReviews > 0 ? minReviews : 'Any'}
                    </Label>
                    <Slider
                      value={[minReviews]}
                      onValueChange={(value) => setMinReviews(value[0])}
                      min={0}
                      max={100}
                      step={1}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm font-medium text-foreground/80 flex items-center gap-1.5 sm:gap-2">
                      <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Require Phone
                    </Label>
                    <div className="flex items-center gap-2 pt-1">
                      <Switch
                        checked={requirePhone}
                        onCheckedChange={setRequirePhone}
                      />
                      <span className="text-[10px] sm:text-xs text-muted-foreground">
                        {requirePhone ? 'With phone' : 'All'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs sm:text-sm font-medium text-foreground/80 flex items-center gap-1.5 sm:gap-2">
                      <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Deep Search
                    </Label>
                    <div className="flex items-center gap-2 pt-1">
                      <Switch
                        checked={deepSearch}
                        onCheckedChange={setDeepSearch}
                      />
                      <span className="text-[10px] sm:text-xs text-muted-foreground">
                        {deepSearch ? '200+ results' : 'Up to 60'}
                      </span>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Submit Button with Trial Indicator */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Trial searches remaining indicator */}
            {isOnTrial && !subscribed && (
              <div className="flex items-center gap-2 text-sm">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                  searchesRemaining === 0 
                    ? 'bg-destructive/10 text-destructive' 
                    : searchesRemaining === 1 
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-primary/10 text-primary'
                }`}>
                  <Search className="h-3.5 w-3.5" />
                  <span className="font-medium">
                    {searchesRemaining} search{searchesRemaining !== 1 ? 'es' : ''} remaining today
                  </span>
                </div>
              </div>
            )}
            
            <div className={`flex justify-center sm:justify-end ${isOnTrial && !subscribed ? '' : 'w-full'}`}>
              <Button 
                type="submit" 
                disabled={isLoading || !keyword.trim() || !location.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 sm:px-8 glow-effect w-full sm:w-auto text-sm sm:text-base"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Find Leads
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
