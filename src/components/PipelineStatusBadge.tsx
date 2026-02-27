import { Badge } from '@/components/ui/badge';
import type { PipelineStatus } from '@/types/outreach';

interface PipelineStatusBadgeProps {
  status: PipelineStatus | null | undefined;
  compact?: boolean;
}

const statusConfig: Record<string, { label: string; shortLabel: string; className: string }> = {
  not_contacted: {
    label: 'Not Contacted',
    shortLabel: 'Status',
    className: 'bg-muted text-muted-foreground border-border/50',
  },
  waiting: {
    label: 'Waiting for Reply',
    shortLabel: 'Waiting',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  },
  no_reply: {
    label: 'No Reply',
    shortLabel: 'No Reply',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  },
  sent_follow_up: {
    label: 'Sent Follow-up',
    shortLabel: 'Follow-up',
    className: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
  },
  sent_voice_note: {
    label: 'Sent Voice Message',
    shortLabel: 'Voice',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  },
  interested: {
    label: 'Interested',
    shortLabel: 'Interested',
    className: 'bg-green-500/20 text-green-400 border-green-500/40',
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
  label: 'Status',
  shortLabel: 'Status',
  className: 'bg-muted text-muted-foreground border-border/50',
};

export function PipelineStatusBadge({ status, compact }: PipelineStatusBadgeProps) {
  const config = status ? (statusConfig[status] ?? defaultConfig) : defaultConfig;

  return (
    <Badge
      variant="outline"
      className={`${config.className} ${compact ? 'text-[10px] px-1.5 py-0 rounded-md' : ''}`}
    >
      {compact ? config.shortLabel : config.label}
    </Badge>
  );
}
