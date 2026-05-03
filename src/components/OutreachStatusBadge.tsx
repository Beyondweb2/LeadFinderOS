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
    className: 'bg-[hsl(var(--badge-new))] text-[hsl(var(--badge-new-fg))] border-transparent font-semibold',
  },
  sent_initial_text: {
    label: 'Sent Text / WhatsApp',
    shortLabel: 'Texted',
    className: 'bg-[hsl(var(--badge-whatsapp))] text-[hsl(var(--badge-whatsapp-fg))] border-transparent font-semibold',
  },
  replied: {
    label: 'Replied',
    shortLabel: 'Replied',
    className: 'bg-[hsl(var(--badge-replied))] text-[hsl(var(--badge-replied-fg))] border-transparent font-semibold',
  },
  sent_voice_note: {
    label: 'Sent Voice Note',
    shortLabel: 'Voice',
    className: 'bg-[hsl(var(--badge-purple))] text-[hsl(var(--badge-purple-fg))] border-transparent font-semibold',
  },
  awaiting_decision: {
    label: 'Awaiting Decision',
    shortLabel: 'Awaiting',
    className: 'bg-[hsl(var(--badge-attempted))] text-[hsl(var(--badge-attempted-fg))] border-transparent font-semibold',
  },
  contacted: {
    label: 'Called',
    shortLabel: 'Called',
    className: 'bg-[hsl(var(--badge-contacted))] text-[hsl(var(--badge-contacted-fg))] border-transparent font-semibold',
  },
  call_back: {
    label: 'Call Back',
    shortLabel: 'Call Back',
    className: 'bg-[hsl(var(--badge-orange))] text-[hsl(var(--badge-orange-fg))] border-transparent font-semibold',
  },
  not_answered: {
    label: 'Not Answered',
    shortLabel: 'No Answer',
    className: 'bg-[hsl(var(--badge-waiting))] text-[hsl(var(--badge-waiting-fg))] border-transparent font-semibold',
  },
  on_hold: {
    label: 'On Hold / Waiting',
    shortLabel: 'On Hold',
    className: 'bg-[hsl(var(--badge-purple))] text-[hsl(var(--badge-purple-fg))] border-transparent font-semibold',
  },
  wants_draft: {
    label: 'Wants a Draft',
    shortLabel: 'Wants Draft',
    className: 'bg-[hsl(var(--badge-cyan))] text-[hsl(var(--badge-cyan-fg))] border-transparent font-semibold',
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
  no_whatsapp: {
    label: 'No WhatsApp',
    shortLabel: 'No WA',
    className: 'bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))] border-transparent font-semibold',
  },
  waiting: {
    label: 'Waiting',
    shortLabel: 'Waiting',
    className: 'bg-[hsl(var(--badge-waiting))] text-[hsl(var(--badge-waiting-fg))] border-transparent font-semibold',
  },
  reviewing_draft: {
    label: 'Reviewing Draft',
    shortLabel: 'Reviewing',
    className: 'bg-[hsl(var(--badge-sky))] text-[hsl(var(--badge-sky-fg))] border-transparent font-semibold',
  },
  paid_for_draft: {
    label: 'Paid for Draft',
    shortLabel: 'Paid Draft',
    className: 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))] border-transparent font-semibold',
  },
  completed: {
    label: 'Completed (Client)',
    shortLabel: 'Completed',
    className: 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))] border-transparent font-semibold',
  },
  sms: {
    label: 'SMS',
    shortLabel: 'SMS',
    className: 'bg-[hsl(var(--badge-sms))] text-[hsl(var(--badge-sms-fg))] border-transparent font-semibold',
  },
  whatsapp: {
    label: 'WhatsApp',
    shortLabel: 'WhatsApp',
    className: 'bg-[hsl(var(--badge-whatsapp))] text-[hsl(var(--badge-whatsapp-fg))] border-transparent font-semibold',
  },
  facebook_msg: {
    label: 'FB Messenger',
    shortLabel: 'FB Msg',
    className: 'bg-[hsl(var(--badge-facebook))] text-[hsl(var(--badge-facebook-fg))] border-transparent font-semibold',
  },
};

export function OutreachStatusBadge({ status, compact }: OutreachStatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status ?? 'Unknown',
    shortLabel: status ?? '?',
    className: 'bg-[hsl(var(--badge-new))] text-[hsl(var(--badge-new-fg))] border-transparent font-semibold',
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
