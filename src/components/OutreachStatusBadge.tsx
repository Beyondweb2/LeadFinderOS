import { Badge } from '@/components/ui/badge';
import type { LeadStatus } from '@/types/outreach';

interface OutreachStatusBadgeProps {
  status: LeadStatus;
}

const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
  not_contacted: {
    label: 'Not Contacted',
    className: 'bg-muted text-muted-foreground border-muted',
  },
  sent_initial_text: {
    label: 'Sent Initial Text',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  replied: {
    label: 'Replied',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  sent_voice_note: {
    label: 'Sent Voice Note',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  awaiting_decision: {
    label: 'Awaiting Decision',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  contacted: {
    label: 'Contacted',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  call_back: {
    label: 'Call Back',
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  not_answered: {
    label: 'Not Answered',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  on_hold: {
    label: 'On Hold / Waiting',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  wants_draft: {
    label: 'Wants a Draft',
    className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  },
  interested: {
    label: 'Interested',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  not_interested: {
    label: 'Not Interested',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
};

export function OutreachStatusBadge({ status }: OutreachStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
