import { MapPin, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';

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

interface UKLocationsListProps {
  onLocationSelect: (location: string) => void;
}

export function UKLocationsList({ onLocationSelect }: UKLocationsListProps) {
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
          Quick UK Locations
          <ChevronDown
            className={`h-4 w-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="flex flex-wrap gap-2">
          {UK_LOCATIONS.map((location) => (
            <Button
              key={location}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onLocationSelect(location)}
              className="text-xs bg-muted/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50"
            >
              {location}
            </Button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
