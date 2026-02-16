import { Badge } from '@/components/ui/badge';
import type { LeadStatus } from '@/types/outreach';

interface OutreachStatusBadgeProps {
  status: LeadStatus;
  compact?: boolean;
}

const statusConfig: Record<LeadStatus, { label: string; shortLabel: string; className: string }> = {
  not_contacted: {
    label: 'Not Contacted',
    shortLabel: 'New',
    className: 'bg-muted text-muted-foreground border-muted',
  },
  sent_initial_text: {
    label: 'Sent Text / WhatsApp',
    shortLabel: 'Texted',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  replied: {
    label: 'Replied',
    shortLabel: 'Replied',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  sent_voice_note: {
    label: 'Sent Voice Note',
    shortLabel: 'Voice',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  awaiting_decision: {
    label: 'Awaiting Decision',
    shortLabel: 'Awaiting',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  contacted: {
    label: 'Called',
    shortLabel: 'Called',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  call_back: {
    label: 'Call Back',
    shortLabel: 'Call Back',
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
  not_answered: {
    label: 'Not Answered',
    shortLabel: 'No Answer',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  on_hold: {
    label: 'On Hold / Waiting',
    shortLabel: 'On Hold',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  wants_draft: {
    label: 'Wants a Draft',
    shortLabel: 'Wants Draft',
    className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  },
  interested: {
    label: 'Interested',
    shortLabel: 'Interested',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  not_interested: {
    label: 'Not Interested',
    shortLabel: 'Not Int.',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
  no_whatsapp: {
    label: 'No WhatsApp',
    shortLabel: 'No WA',
    className: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  },
  waiting: {
    label: 'Waiting',
    shortLabel: 'Waiting',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  reviewing_draft: {
    label: 'Reviewing Draft',
    shortLabel: 'Reviewing',
    className: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  },
  paid_for_draft: {
    label: 'Paid for Draft',
    shortLabel: 'Paid Draft',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  completed: {
    label: 'Completed (Client)',
    shortLabel: 'Completed',
    className: 'bg-green-600/20 text-green-500 border-green-600/30',
  },
  sms: {
    label: 'SMS',
    shortLabel: 'SMS',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  whatsapp: {
    label: 'WhatsApp',
    shortLabel: 'WhatsApp',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  facebook_msg: {
    label: 'Facebook',
    shortLabel: 'Facebook',
    className: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  },
};

export function OutreachStatusBadge({ status, compact }: OutreachStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge 
      variant="outline" 
      className={`${config.className} ${compact ? 'text-[10px] px-1.5 py-0 rounded-md' : ''}`}
    >
      {compact ? config.shortLabel : config.label}
    </Badge>
  );
}
