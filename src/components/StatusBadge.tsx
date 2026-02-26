import { Badge } from '@/components/ui/badge';
import { Flame, Building, Globe, HelpCircle } from 'lucide-react';
import type { WebsiteStatus } from '@/types/lead';

interface StatusBadgeProps {
  status: WebsiteStatus;
  confidence?: number;
  compact?: boolean;
}

const statusConfig: Record<WebsiteStatus, { 
  label: string; 
  shortLabel: string;
  className: string;
  icon: typeof Flame;
}> = {
  NO_WEBSITE: {
    label: 'No Website',
    shortLabel: 'No Website',
    className: 'bg-[hsl(var(--status-hot))] text-[hsl(var(--status-hot-foreground))] border-transparent font-semibold',
    icon: Flame,
  },
  DIRECTORY_ONLY: {
    label: 'Directory Only',
    shortLabel: 'Directory',
    className: 'bg-[hsl(var(--status-directory))] text-[hsl(var(--status-directory-foreground))] border-transparent font-semibold',
    icon: Building,
  },
  HAS_OWN_WEBSITE: {
    label: 'Has Website',
    shortLabel: 'Has Website',
    className: 'bg-[hsl(var(--status-has-website))] text-[hsl(var(--status-has-website-foreground))] border-transparent font-semibold',
    icon: Globe,
  },
  UNCERTAIN: {
    label: 'Uncertain',
    shortLabel: 'Uncertain',
    className: 'bg-[hsl(var(--status-uncertain))] text-[hsl(var(--status-uncertain-foreground))] border-transparent font-semibold',
    icon: HelpCircle,
  },
};

export function StatusBadge({ status, confidence, compact }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={`${config.className} ${compact ? "gap-1 px-2 py-0.5 text-xs" : "gap-1.5 px-2.5 py-1"}`}
    >
      <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span>{compact ? config.shortLabel : config.label}</span>
      {confidence !== undefined && confidence > 0 && (
        <span className="opacity-75 text-xs ml-1">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </Badge>
  );
}
