import { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { StatusBadge } from './StatusBadge';
import { Check, ChevronDown } from 'lucide-react';
import type { Lead, WebsiteStatus } from '@/types/lead';

const OPTIONS: { value: WebsiteStatus; label: string }[] = [
  { value: 'HAS_OWN_WEBSITE', label: 'Has Website' },
  { value: 'NO_WEBSITE', label: 'No Website' },
];

/**
 * Website-status pill that doubles as a manual override control. Clicking opens a
 * small popover to pick "Has Website" / "No Website" (explicit choice — a stray
 * row-click can't flip it). When `onSet` is omitted it renders a plain badge.
 */
export function WebsiteStatusToggle({
  lead,
  onSet,
  compact,
}: {
  lead: Lead;
  onSet?: (lead: Lead, status: WebsiteStatus) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Treat legacy DIRECTORY_ONLY as NO_WEBSITE for the "current" check mark.
  const current: WebsiteStatus = lead.websiteStatus === 'DIRECTORY_ONLY' ? 'NO_WEBSITE' : lead.websiteStatus;

  if (!onSet) return <StatusBadge status={lead.websiteStatus} compact={compact} />;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onClick={(e) => e.stopPropagation()}
        title="Correct website status"
        className="inline-flex items-center gap-0.5 rounded-full cursor-pointer transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      >
        <StatusBadge status={lead.websiteStatus} compact={compact} />
        <ChevronDown className="h-3 w-3 -ml-0.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
        <p className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Set website status</p>
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (opt.value !== current) onSet(lead, opt.value);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <span>{opt.label}</span>
            {opt.value === current && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
