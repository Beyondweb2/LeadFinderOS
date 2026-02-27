import { Briefcase, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';

const BUSINESS_TYPES = [
  'Electrician', 'Plumber', 'Gardener', 'Painter', 'Roofer',
  'Builder', 'Carpenter', 'Locksmith', 'HVAC', 'Cleaning',
  'Moving Company', 'Restaurant', 'Cafe', 'Barber', 'Hair Salon',
  'Dentist', 'Lawyer', 'Accountant', 'Real Estate Agent', 'Gym',
];

interface QuickBusinessTypesProps {
  onSelect: (type: string) => void;
  selected?: string;
}

export function QuickBusinessTypes({ onSelect, selected }: QuickBusinessTypesProps) {
  const [isOpen, setIsOpen] = useState(false);

  const normalise = (s: string) => s.toLowerCase().trim();
  const isSelected = (type: string) => normalise(selected || '') === normalise(type);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} data-walkthrough-step="quick-business-types">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          className="text-muted-foreground hover:text-foreground w-full justify-start"
        >
          <Briefcase className="h-4 w-4 mr-2" />
          Quick Business Types
          <ChevronDown
            className={`h-4 w-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="flex flex-wrap gap-2">
          {BUSINESS_TYPES.map((type) => (
            <Button
              key={type}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (isSelected(type)) {
                  onSelect('');
                } else {
                  onSelect(type);
                }
                setIsOpen(false);
              }}
              className={`text-xs ${
                isSelected(type)
                  ? 'bg-primary/20 text-primary border-primary/50'
                  : 'bg-muted/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50'
              }`}
            >
              {type}
            </Button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
