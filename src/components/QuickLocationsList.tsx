import { MapPin, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Country } from '@/types/lead';

const COUNTRY_DATA: Record<Country, { flag: string; locations: string[] }> = {
  USA: {
    flag: '🇺🇸',
    locations: [
      'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
      'San Antonio', 'San Diego', 'Dallas', 'Austin', 'San Jose', 'Jacksonville',
      'Fort Worth', 'Columbus', 'Charlotte', 'Indianapolis', 'Seattle', 'Denver',
      'Boston', 'Nashville', 'Portland', 'Las Vegas', 'Miami', 'Atlanta',
    ],
  },
  UK: {
    flag: '🇬🇧',
    locations: [
      'London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Liverpool',
      'Bristol', 'Sheffield', 'Edinburgh', 'Newcastle', 'Nottingham', 'Southampton',
      'Leicester', 'Cardiff', 'Belfast', 'Brighton', 'Plymouth', 'Reading',
      'Coventry', 'Hull', 'Stoke-on-Trent', 'Wolverhampton', 'Derby', 'Swansea',
      'Milton Keynes', 'Aberdeen', 'Norwich', 'Oxford', 'Cambridge', 'York',
    ],
  },
  Australia: {
    flag: '🇦🇺',
    locations: [
      'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast',
      'Sunshine Coast', 'Canberra', 'Newcastle', 'Wollongong', 'Geelong',
      'Hobart', 'Townsville', 'Cairns', 'Toowoomba', 'Darwin', 'Ballarat',
      'Bendigo', 'Albury', 'Mackay', 'Rockhampton', 'Bundaberg', 'Launceston',
    ],
  },
  Canada: {
    flag: '🇨🇦',
    locations: [
      'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa',
      'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener', 'London', 'Victoria',
      'Halifax', 'Oshawa', 'Windsor', 'Saskatoon', 'Regina', 'Barrie',
    ],
  },
};

const COUNTRIES: Country[] = ['USA', 'UK', 'Australia', 'Canada'];

interface QuickLocationsListProps {
  onLocationSelect: (location: string, country: Country) => void;
}

export function QuickLocationsList({ onLocationSelect }: QuickLocationsListProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          className="text-muted-foreground hover:text-foreground w-full justify-start"
        >
          <MapPin className="h-4 w-4 mr-2" />
          Quick Locations
          <ChevronDown
            className={`h-4 w-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <Tabs defaultValue="USA" className="w-full">
          <TabsList className="inline-flex h-auto p-1 mb-3 gap-1">
            {COUNTRIES.map((country) => (
              <TabsTrigger
                key={country}
                value={country}
                className="text-xs px-2 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {COUNTRY_DATA[country].flag} {country}
              </TabsTrigger>
            ))}
          </TabsList>
          <p className="text-[10px] text-muted-foreground mb-3">More countries coming soon</p>
          {COUNTRIES.map((country) => (
            <TabsContent key={country} value={country}>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {COUNTRY_DATA[country].locations.map((location) => (
                  <Button
                    key={location}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onLocationSelect(
                        country === 'UK' ? location : `${location}, ${country}`,
                        country
                      );
                      setIsOpen(false);
                    }}
                    className="text-xs bg-muted/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50"
                  >
                    {location}
                  </Button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}
