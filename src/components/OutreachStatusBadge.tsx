import { Pill } from '@/components/ui/pill';
import type { LeadStatus } from '@/types/outreach';

interface OutreachStatusBadgeProps {
  status: LeadStatus;
  compact?: boolean;
}

const statusConfig: Record<LeadStatus, { label: string; shortLabel: string; className: string }> = {
  not_contacted: {
    label: 'Not contacted',
    shortLabel: 'Contact Method',
    className: 'bg-muted text-muted-foreground border-border/50',
  },
  sent_initial_text: {
    label: 'Sent Text / WA',
    shortLabel: 'Texted',
    className: 'bg-green-500/20 text-green-400 border-green-500/40',
  },
  replied: {
    label: 'Replied',
    shortLabel: 'Replied',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  },
  sent_voice_note: {
    label: 'Sent Voice Note',
    shortLabel: 'Voice',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  },
  awaiting_decision: {
    label: 'Awaiting decision',
    shortLabel: 'Awaiting',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  },
  contacted: {
    label: 'Called',
    shortLabel: 'Called',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  },
  call_back: {
    label: 'Call Back',
    shortLabel: 'Call Back',
    className: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  },
  not_answered: {
    label: 'No Answer',
    shortLabel: 'No Answer',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  },
  on_hold: {
    label: 'On Hold',
    shortLabel: 'On Hold',
    className: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  },
  wants_draft: {
    label: 'Wants Draft',
    shortLabel: 'Wants Draft',
    className: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
  },
  interested: {
    label: 'Interested',
    shortLabel: 'Interested',
    className: 'bg-green-500/20 text-green-400 border-green-500/40',
  },
  not_interested: {
    label: 'Not interested',
    shortLabel: 'Not int.',
    className: 'bg-red-500/20 text-red-400 border-red-500/40',
  },
  no_whatsapp: {
    label: 'No WhatsApp',
    shortLabel: 'No WA',
    className: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
  },
  waiting: {
    label: 'Awaiting reply',
    shortLabel: 'Awaiting',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  },
  reviewing_draft: {
    label: 'Reviewing Draft',
    shortLabel: 'Reviewing',
    className: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
  },
  paid_for_draft: {
    label: 'Paid for Draft',
    shortLabel: 'Paid Draft',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  },
  completed: {
    label: 'Completed',
    shortLabel: 'Completed',
    className: 'bg-green-600/20 text-green-500 border-green-600/40',
  },
  sms: {
    label: 'SMS',
    shortLabel: 'SMS',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  },
  whatsapp: {
    label: 'WhatsApp',
    shortLabel: 'WhatsApp',
    className: 'bg-green-500/20 text-green-400 border-green-500/40',
  },
  facebook_msg: {
    label: 'FB Messenger',
    shortLabel: 'FB Msg',
    className: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
  },
};

export function OutreachStatusBadge({ status, compact }: OutreachStatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status ?? 'Unknown',
    shortLabel: status ?? '?',
    className: 'bg-muted text-muted-foreground border-muted',
  };

  if (compact) {
    return (
      <span className={`text-[10px] font-semibold px-1.5 py-0 rounded-md border inline-flex items-center ${config.className}`}>
        {config.shortLabel}
      </span>
    );
  }

  return (
    <Pill variant={config.className}>
      {config.label}
    </Pill>
  );
}
