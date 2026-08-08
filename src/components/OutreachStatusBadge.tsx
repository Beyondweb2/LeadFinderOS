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
  /* ⛔ THE TWO no_whatsapp STATUSES ARE DIFFERENT THINGS AND MUST READ THAT WAY. "No WA" told the
     operator nothing, and next to "Needs SMS" the pair looked like one concept under two names.
     no_whatsapp        = a REAL MOBILE with no WhatsApp account  -> SMS still works
     no_whatsapp_needs_sms = not a mobile at all                  -> neither WhatsApp nor SMS works
     process-sms-queue targets the first and explicitly excludes the second, so confusing them
     costs you a reachable channel. */
  no_whatsapp: {
    label: 'Mobile, no WhatsApp',
    shortLabel: 'Mobile, no WA',
    className: 'bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))] border-transparent font-semibold',
  },
  no_whatsapp_needs_sms: {
    /* "Needs SMS" read as an instruction to send one. It is a landline: SMS is impossible too, and
       process-sms-queue skips it for exactly that reason. Label only — no data change. */
    label: 'Landline — no WhatsApp or SMS',
    shortLabel: 'Landline',
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
