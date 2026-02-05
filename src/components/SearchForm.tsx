import { useState } from 'react';
import { Search, MapPin, Radius, Star, MessageSquare, Loader2, Phone, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { QuickLocationsList, type Country } from '@/components/QuickLocationsList';
import { Switch } from '@/components/ui/switch';
import type { SearchFilters } from '@/types/lead';

interface SearchFormProps {
  onSearch: (filters: SearchFilters) => void;
  isLoading: boolean;
}

export function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState(5);
  const [minRating, setMinRating] = useState(0);
  const [minReviews, setMinReviews] = useState(2); // Default to 2 to filter out inactive businesses
  const [requirePhone, setRequirePhone] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<Country>('UK');
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
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Main Search Fields */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="keyword" className="text-sm font-medium text-foreground/80">
                Business Type
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="keyword"
                  placeholder="e.g. plumber, electrician, bakery"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="pl-10 bg-input border-border focus:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="text-sm font-medium text-foreground/80">
                Location
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="location"
                  placeholder="City, postcode, or address"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-10 bg-input border-border focus:ring-primary"
                />
              </div>
              <QuickLocationsList onLocationSelect={(loc, country) => {
                setLocation(loc);
                setSelectedCountry(country);
              }} />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground/80">
                Search Radius: {radius} km
              </Label>
              <div className="relative flex items-center gap-3 pt-1">
                <Radius className="h-4 w-4 text-muted-foreground" />
                <Slider
                  value={[radius]}
                  onValueChange={(value) => setRadius(value[0])}
                  min={1}
                  max={50}
                  step={1}
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          {/* Advanced Filters */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" type="button" className="text-muted-foreground hover:text-foreground">
                <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                Advanced Filters
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="grid gap-4 md:grid-cols-3 max-w-2xl">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground/80 flex items-center gap-2">
                    <Star className="h-4 w-4" />
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
                  <Label className="text-sm font-medium text-foreground/80 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
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
                  <Label className="text-sm font-medium text-foreground/80 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Require Phone Number
                  </Label>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={requirePhone}
                      onCheckedChange={setRequirePhone}
                    />
                    <span className="text-xs text-muted-foreground">
                      {requirePhone ? 'Only show businesses with phone' : 'Show all businesses'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground/80 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Deep Search
                  </Label>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={deepSearch}
                      onCheckedChange={setDeepSearch}
                    />
                    <span className="text-xs text-muted-foreground">
                      {deepSearch ? 'Grid search for 200+ results (slower)' : 'Standard search (up to 60 results)'}
                    </span>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={isLoading || !keyword.trim() || !location.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 glow-effect"
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
        </form>
      </CardContent>
    </Card>
  );
}
