import { Badge } from '@/components/ui/badge';
import { Flame, Building, Globe, HelpCircle } from 'lucide-react';
import type { WebsiteStatus } from '@/types/lead';

interface StatusBadgeProps {
  status: WebsiteStatus;
  confidence?: number;
}

const statusConfig: Record<WebsiteStatus, { 
  label: string; 
  variant: 'hot' | 'directory' | 'hasWebsite' | 'uncertain';
  icon: typeof Flame;
}> = {
  NO_WEBSITE: {
    label: 'No Website',
    variant: 'hot',
    icon: Flame,
  },
  DIRECTORY_ONLY: {
    label: 'Directory Only',
    variant: 'directory',
    icon: Building,
  },
  HAS_OWN_WEBSITE: {
    label: 'Has Website',
    variant: 'hasWebsite',
    icon: Globe,
  },
  UNCERTAIN: {
    label: 'Uncertain',
    variant: 'uncertain',
    icon: HelpCircle,
  },
};

export function StatusBadge({ status, confidence }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1.5 px-2.5 py-1">
      <Icon className="h-3.5 w-3.5" />
      <span>{config.label}</span>
      {confidence !== undefined && confidence > 0 && (
        <span className="opacity-75 text-xs ml-1">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </Badge>
  );
}
