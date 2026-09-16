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
  queued: {
    label: 'Queued',
    shortLabel: 'Queued',
    className: 'bg-[hsl(var(--badge-sky))] text-[hsl(var(--badge-sky-fg))] border-transparent font-semibold',
  },
  /* Queued for / sent the no-reply follow-up (contact_followup). Distinct from Contacted so a lead
     on its second touch is visible at a glance in the Status column. */
  second_attempt: {
    label: '2nd attempt',
    shortLabel: '2nd',
    className: 'bg-amber-500/20 text-amber-500 border-transparent font-semibold',
  },
  whatsapp_failed: {
    label: 'WhatsApp Failed',
    shortLabel: 'WA Failed',
    className: 'bg-[hsl(var(--badge-orange))] text-[hsl(var(--badge-orange-fg))] border-transparent font-semibold',
  },
  replied: {
    label: 'Replied',
    shortLabel: 'Replied',
    className: 'bg-[hsl(var(--badge-replied))] text-[hsl(var(--badge-replied-fg))] border-transparent font-semibold',
  },
  report_sent: {
    label: 'Report Sent',
    shortLabel: 'Report',
    className: 'bg-sky-500/20 text-sky-400 border-transparent font-semibold',
  },
  price_given: {
    label: 'Price Given',
    shortLabel: 'Price',
    className: 'bg-indigo-500/20 text-indigo-400 border-transparent font-semibold',
  },
  in_delivery: {
    label: 'In Delivery',
    shortLabel: 'Delivery',
    className: 'bg-green-500/20 text-green-400 border-transparent font-semibold',
  },
  opted_out: {
    label: 'Opted Out',
    shortLabel: 'Opted Out',
    className: 'bg-red-500/15 text-red-400 border-transparent font-semibold',
  },
  email_sent: {
    label: 'Email Sent',
    shortLabel: 'Email',
    className: 'bg-sky-600 text-white border-transparent font-semibold',
  },
  bounced: {
    label: 'Bounced',
    shortLabel: 'Bounced',
    className: 'bg-red-700 text-white border-transparent font-semibold',
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
  /* ⚠️ BOTH READ "No WhatsApp", AND THAT IS DELIBERATE — Paul's call, 2026-08-08. He does no SMS
     outreach, so the difference between a mobile with no WhatsApp account and a landline changes
     nothing about what he does next: both mean email instead. A label that draws a distinction the
     operator never acts on is noise.
     ⛔ WHAT MUST NOT BE "TIDIED" ON THE BACK OF THIS: the two statuses stay SEPARATE IN THE DATA and
     keep different colours. They describe two different phones, and merging the values would lose
     that fact for ever. (SMS left the product 2026-09-16; the second status is the landline marker,
     Paul's decision to keep it.) The colour is what keeps them tellable apart on screen.
       no_whatsapp            a real mobile with no WhatsApp account
       no_whatsapp_needs_sms  not a mobile at all — a landline/VoIP number (1,861 leads, 2026-09-15) */
  no_whatsapp: {
    label: 'No WhatsApp',
    shortLabel: 'No WA',
    className: 'bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))] border-transparent font-semibold',
  },
  no_whatsapp_needs_sms: {
    /* Same words as no_whatsapp above, different colour. See the block there for why. */
    label: 'No WhatsApp',
    shortLabel: 'No WA',
    className: 'bg-[hsl(var(--badge-cyan))] text-[hsl(var(--badge-cyan-fg))] border-transparent font-semibold',
  },
  completed: {
    label: 'Completed (Client)',
    shortLabel: 'Completed',
    className: 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))] border-transparent font-semibold',
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
