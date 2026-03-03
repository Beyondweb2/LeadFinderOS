import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';
import type { PipelineStatus } from '@/types/outreach';

interface PipelineStatusBadgeProps {
  status: PipelineStatus | null | undefined;
  compact?: boolean;
}

const statusConfig: Record<string, { label: string; shortLabel: string; className: string }> = {
  not_contacted: {
    label: 'New',
    shortLabel: 'Status',
    className: 'bg-muted text-muted-foreground border-border/50',
  },
  waiting: {
    label: 'Attempted',
    shortLabel: 'Attempted',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  },
  contacted: {
    label: 'Contacted',
    shortLabel: 'Contacted',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  },
  replied: {
    label: 'Replied',
    shortLabel: 'Replied',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  },
  interested: {
    label: 'Interested',
    shortLabel: 'Interested',
    className: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/40',
  },
  not_interested: {
    label: 'Not Interested',
    shortLabel: 'Not Int.',
    className: 'bg-red-500/20 text-red-400 border-red-500/40',
  },
  completed: {
    label: 'Closed',
    shortLabel: 'Closed',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  },
};

const defaultConfig = {
  label: 'New',
  shortLabel: 'Status',
  className: 'bg-muted text-muted-foreground border-border/50',
};

export function PipelineStatusBadge({ status, compact }: PipelineStatusBadgeProps) {
  const config = status ? (statusConfig[status] ?? defaultConfig) : defaultConfig;
  const isInterested = status === 'interested';

  return (
    <Badge
      variant="outline"
      className={`${config.className} ${compact ? 'text-[10px] px-1.5 py-0 rounded-md' : ''} ${isInterested ? 'gap-1' : ''}`}
    >
      {isInterested && (
        <Star className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} text-yellow-500 fill-yellow-500`} />
      )}
      {compact ? config.shortLabel : config.label}
    </Badge>
  );
}
