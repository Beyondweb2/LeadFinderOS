import { MapPin, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const UK_LOCATIONS = [
  'London',
  'Manchester',
  'Birmingham',
  'Leeds',
  'Glasgow',
  'Liverpool',
  'Bristol',
  'Sheffield',
  'Edinburgh',
  'Newcastle',
  'Nottingham',
  'Southampton',
  'Leicester',
  'Cardiff',
  'Belfast',
  'Brighton',
  'Plymouth',
  'Reading',
  'Coventry',
  'Hull',
  'Stoke-on-Trent',
  'Wolverhampton',
  'Derby',
  'Swansea',
  'Milton Keynes',
  'Aberdeen',
  'Norwich',
  'Oxford',
  'Cambridge',
  'York',
];

const AUS_LOCATIONS = [
  // Queensland
  { name: 'Gold Coast', region: 'QLD' },
  { name: 'Sunshine Coast', region: 'QLD' },
  { name: 'Townsville', region: 'QLD' },
  { name: 'Cairns', region: 'QLD' },
  { name: 'Toowoomba', region: 'QLD' },
  { name: 'Mackay', region: 'QLD' },
  { name: 'Rockhampton', region: 'QLD' },
  { name: 'Bundaberg', region: 'QLD' },
  // New South Wales
  { name: 'Central Coast NSW', region: 'NSW' },
  { name: 'Wollongong', region: 'NSW' },
  { name: 'Newcastle NSW', region: 'NSW' },
  { name: 'Maitland NSW', region: 'NSW' },
  { name: 'Wagga Wagga', region: 'NSW' },
  { name: 'Albury', region: 'NSW' },
  { name: 'Tamworth', region: 'NSW' },
  // Victoria
  { name: 'Geelong', region: 'VIC' },
  { name: 'Ballarat', region: 'VIC' },
  { name: 'Bendigo', region: 'VIC' },
  { name: 'Mornington Peninsula', region: 'VIC' },
  { name: 'Shepparton', region: 'VIC' },
  { name: 'Warrnambool', region: 'VIC' },
  // South Australia
  { name: 'Adelaide Hills', region: 'SA' },
  { name: 'Mount Gambier', region: 'SA' },
  { name: 'Murray Bridge', region: 'SA' },
  { name: 'Port Augusta', region: 'SA' },
];

export type Country = 'UK' | 'AUS';

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
        <Tabs defaultValue="uk" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-3">
            <TabsTrigger value="uk">🇬🇧 UK</TabsTrigger>
            <TabsTrigger value="aus">🇦🇺 Australia</TabsTrigger>
          </TabsList>
          <TabsContent value="uk">
            <div className="flex flex-wrap gap-2">
              {UK_LOCATIONS.map((location) => (
                <Button
                  key={location}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onLocationSelect(location, 'UK')}
                  className="text-xs bg-muted/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50"
                >
                  {location}
                </Button>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="aus">
            <div className="flex flex-wrap gap-2">
              {AUS_LOCATIONS.map((loc) => (
                <Button
                  key={loc.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onLocationSelect(`${loc.name}, Australia`, 'AUS')}
                  className="text-xs bg-muted/50 hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/50"
                >
                  {loc.name}
                  <span className="ml-1 text-[10px] text-muted-foreground">{loc.region}</span>
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}