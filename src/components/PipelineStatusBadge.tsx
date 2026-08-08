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
  queued: {
    label: 'Queued',
    shortLabel: 'Queued',
    className: 'bg-[hsl(var(--badge-sky))] text-[hsl(var(--badge-sky-fg))] border-transparent font-semibold',
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
  /* ⛔ THESE TWO USED TO RENDER THE SAME WORDS. Both said "No WhatsApp" and differed only by
     colour — grey here, cyan below — which is exactly the report: "I filtered by no WhatsApp and
     the rows show a GREY pill, but the no-WhatsApp pill is light blue." A colour is not a label.
     They are different populations and the words now say so:
       no_whatsapp            a real MOBILE with no WhatsApp account -> SMS still works (53)
       no_whatsapp_needs_sms  not a mobile at all -> neither WhatsApp nor SMS works (509)
     process-sms-queue targets the first and explicitly excludes the second, so reading one as the
     other costs a reachable channel. */
  no_whatsapp: {
    label: 'Mobile, no WhatsApp',
    shortLabel: 'Mobile, no WA',
    className: 'bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))] border-transparent font-semibold',
  },
  no_whatsapp_needs_sms: {
    /* The old comment said the display "reads No WhatsApp ... kept distinct cyan to still signal
       the not-mobile state". That was the whole fault written down as a decision: the distinction
       was carried entirely by a colour, so the two pills were indistinguishable in words. And
       "Needs SMS" read as an instruction to send one — it is a landline, SMS cannot arrive, and
       process-sms-queue skips it for that reason. Labels only; status value and routing unchanged. */
    label: 'Landline — no WhatsApp or SMS',
    shortLabel: 'Landline',
    className: 'bg-[hsl(var(--badge-cyan))] text-[hsl(var(--badge-cyan-fg))] border-transparent font-semibold whitespace-nowrap',
  },
  whatsapp_failed: {
    label: 'WhatsApp Failed',
    shortLabel: 'WA Failed',
    className: 'bg-[hsl(var(--badge-orange))] text-[hsl(var(--badge-orange-fg))] border-transparent font-semibold',
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
  // Terminal stage of the live pipeline (after in_delivery) — operator-pickable.
  completed: {
    label: 'Completed',
    shortLabel: 'Done',
    className: 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))] border-transparent font-semibold',
  },
  // Inbox "Remove from inbox" terminal — hidden from the Inbox by default; label so a
  // revealed (Show hidden) row reads "Closed" instead of falling back to "New".
  closed: {
    label: 'Closed',
    shortLabel: 'Closed',
    className: 'bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))] border-transparent font-semibold',
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
