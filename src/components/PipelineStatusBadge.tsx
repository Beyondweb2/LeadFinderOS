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
  initial_contact: {
    label: 'Contacted',
    shortLabel: 'Contacted',
    className: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent font-semibold',
  },
  // Legacy values kept as fallbacks so any un-migrated/stray row still renders as
  // "Initial Contact" (amber) rather than the generic New badge.
  waiting: {
    label: 'Contacted',
    shortLabel: 'Contacted',
    className: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent font-semibold',
  },
  delivered: {
    label: 'Contacted',
    shortLabel: 'Contacted',
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
  site_sent: {
    label: 'Site Sent',
    shortLabel: 'Site Sent',
    className: 'bg-emerald-500/20 text-emerald-400 border-transparent font-semibold',
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
  payment_received: {
    label: 'Paid',
    shortLabel: 'Paid',
    className: 'bg-green-500/20 text-green-400 border-transparent font-semibold',
  },
  // Legacy "Closed" → renders as Paid (green) for any pre-existing row.
  completed: {
    label: 'Paid',
    shortLabel: 'Paid',
    className: 'bg-green-500/20 text-green-400 border-transparent font-semibold',
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
