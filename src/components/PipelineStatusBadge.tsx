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
    className: 'bg-[hsl(var(--badge-new))] text-[hsl(var(--badge-new-fg))] border-transparent font-semibold',
  },
  waiting: {
    label: 'Attempted',
    shortLabel: 'Attempted',
    className: 'bg-[hsl(var(--badge-attempted))] text-[hsl(var(--badge-attempted-fg))] border-transparent font-semibold',
  },
  delivered: {
    label: 'Delivered',
    shortLabel: 'Delivered',
    className: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent font-semibold',
  },
  contacted: {
    label: 'Contacted',
    shortLabel: 'Contacted',
    className: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent font-semibold',
  },
  replied: {
    label: 'Replied',
    shortLabel: 'Replied',
    className: 'bg-[hsl(var(--badge-replied))] text-[hsl(var(--badge-replied-fg))] border-transparent font-semibold',
  },
  interested: {
    label: 'Interested',
    shortLabel: 'Interested',
    className: 'bg-[hsl(var(--badge-interested))] text-[hsl(var(--badge-interested-fg))] border-transparent font-semibold',
  },
  not_interested: {
    label: 'Not Interested',
    shortLabel: 'Not Int.',
    className: 'bg-[hsl(var(--badge-not-interested))] text-[hsl(var(--badge-not-interested-fg))] border-transparent font-semibold',
  },
  completed: {
    label: 'Closed',
    shortLabel: 'Closed',
    className: 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))] border-transparent font-semibold',
  },
};

const defaultConfig = {
  label: 'New',
  shortLabel: 'Status',
  className: 'bg-[hsl(var(--badge-new))] text-[hsl(var(--badge-new-fg))] border-transparent font-semibold',
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
        <Star className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} text-[hsl(var(--badge-interested-fg))] fill-[hsl(var(--badge-interested-fg))]`} />
      )}
      {compact ? config.shortLabel : config.label}
    </Badge>
  );
}
