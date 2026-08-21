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
  /* ⚠️ BOTH READ "No WhatsApp", AND THAT IS DELIBERATE — Paul's call, 2026-08-08. He does no SMS
     outreach, so the difference between a mobile with no WhatsApp account and a landline changes
     nothing about what he does next: both mean email instead. A label that draws a distinction the
     operator never acts on is noise.
     ⛔ WHAT MUST NOT BE "TIDIED" ON THE BACK OF THIS: the two statuses stay SEPARATE IN THE DATA and
     keep different colours. process-sms-queue targets no_whatsapp and explicitly excludes
     no_whatsapp_needs_sms, so merging the values would lose which leads can still take an SMS — a
     channel that is unused today, not one that has been ruled out. The colour is what keeps them
     tellable apart on screen if that ever changes.
       no_whatsapp            a real mobile with no WhatsApp account — SMS would still work (53)
       no_whatsapp_needs_sms  not a mobile at all — neither WhatsApp nor SMS can arrive (509) */
  no_whatsapp: {
    label: 'No WhatsApp',
    shortLabel: 'No WA',
    className: 'bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))] border-transparent font-semibold',
  },
  no_whatsapp_needs_sms: {
    /* Same words as no_whatsapp above, different colour. See the block there for why. */
    label: 'No WhatsApp',
    shortLabel: 'No WA',
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
  second_attempt: {
    label: '2nd attempt',
    shortLabel: '2nd',
    className: 'bg-amber-500/20 text-amber-500 border-transparent font-semibold',
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
