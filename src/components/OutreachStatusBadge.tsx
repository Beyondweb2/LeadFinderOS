import { Badge } from '@/components/ui/badge';
import type { LeadStatus } from '@/types/outreach';

interface OutreachStatusBadgeProps {
  status: LeadStatus;
  compact?: boolean;
}

const statusConfig: Record<LeadStatus, { label: string; shortLabel: string; className: string }> = {
  not_contacted: {
    label: 'Not Contacted',
    shortLabel: 'Contact Method',
    className: 'bg-muted text-muted-foreground border-transparent',
  },
  sent_initial_text: {
    label: 'Sent Text / WhatsApp',
    shortLabel: 'Texted',
    className: 'bg-green-600 text-white border-transparent',
  },
  replied: {
    label: 'Replied',
    shortLabel: 'Replied',
    className: 'bg-emerald-600 text-white border-transparent',
  },
  sent_voice_note: {
    label: 'Sent Voice Note',
    shortLabel: 'Voice',
    className: 'bg-purple-600 text-white border-transparent',
  },
  awaiting_decision: {
    label: 'Awaiting Decision',
    shortLabel: 'Awaiting',
    className: 'bg-amber-600 text-white border-transparent',
  },
  contacted: {
    label: 'Called',
    shortLabel: 'Called',
    className: 'bg-blue-600 text-white border-transparent',
  },
  call_back: {
    label: 'Call Back',
    shortLabel: 'Call Back',
    className: 'bg-orange-600 text-white border-transparent',
  },
  not_answered: {
    label: 'Not Answered',
    shortLabel: 'No Answer',
    className: 'bg-yellow-600 text-white border-transparent',
  },
  on_hold: {
    label: 'On Hold / Waiting',
    shortLabel: 'On Hold',
    className: 'bg-purple-600 text-white border-transparent',
  },
  wants_draft: {
    label: 'Wants a Draft',
    shortLabel: 'Wants Draft',
    className: 'bg-cyan-600 text-white border-transparent',
  },
  interested: {
    label: 'Interested',
    shortLabel: 'Interested',
    className: 'bg-green-600 text-white border-transparent',
  },
  not_interested: {
    label: 'Not Interested',
    shortLabel: 'Not Int.',
    className: 'bg-red-600 text-white border-transparent',
  },
  no_whatsapp: {
    label: 'No WhatsApp',
    shortLabel: 'No WA',
    className: 'bg-gray-600 text-white border-transparent',
  },
  waiting: {
    label: 'Waiting',
    shortLabel: 'Waiting',
    className: 'bg-amber-600 text-white border-transparent',
  },
  reviewing_draft: {
    label: 'Reviewing Draft',
    shortLabel: 'Reviewing',
    className: 'bg-sky-600 text-white border-transparent',
  },
  paid_for_draft: {
    label: 'Paid for Draft',
    shortLabel: 'Paid Draft',
    className: 'bg-emerald-600 text-white border-transparent',
  },
  completed: {
    label: 'Completed (Client)',
    shortLabel: 'Completed',
    className: 'bg-green-700 text-white border-transparent',
  },
  sms: {
    label: 'SMS',
    shortLabel: 'SMS',
    className: 'bg-blue-600 text-white border-transparent',
  },
  whatsapp: {
    label: 'WhatsApp',
    shortLabel: 'WhatsApp',
    className: 'bg-green-600 text-white border-transparent',
  },
  facebook_msg: {
    label: 'FB Messenger',
    shortLabel: 'FB Msg',
    className: 'bg-indigo-600 text-white border-transparent',
  },
};

export function OutreachStatusBadge({ status, compact }: OutreachStatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status ?? 'Unknown',
    shortLabel: status ?? '?',
    className: 'bg-muted text-muted-foreground border-muted',
  };

  return (
    <Badge 
      variant="outline" 
      className={`${config.className} ${compact ? 'text-[10px] px-1.5 py-0 rounded-md' : ''}`}
    >
      {compact ? config.shortLabel : config.label}
    </Badge>
  );
}
