import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Radio } from 'lucide-react';
import type { ChannelPerformance, ChannelStat } from '@/hooks/useDashboardMetrics';

const CHANNELS: { key: keyof ChannelPerformance; label: string; dot: string; alwaysShow?: boolean }[] = [
  { key: 'whatsapp', label: 'WhatsApp', dot: 'bg-[hsl(var(--badge-whatsapp))]', alwaysShow: true },
  { key: 'sms', label: 'SMS', dot: 'bg-[hsl(var(--badge-sms))]', alwaysShow: true },
  { key: 'call', label: 'Call', dot: 'bg-[hsl(var(--badge-call))]', alwaysShow: true },
  { key: 'email', label: 'Email', dot: 'bg-sky-600', alwaysShow: true },
  { key: 'facebook_msg', label: 'Messenger', dot: 'bg-[hsl(var(--badge-facebook))]' },
];

function rateColor(rate: number | null): string {
  if (rate === null) return 'text-muted-foreground/40';
  if (rate >= 30) return 'text-green-500';
  if (rate >= 15) return 'text-amber-500';
  return 'text-foreground/70';
}

/**
 * Per-channel outreach performance: Sent / Replied / Reply rate.
 *
 * Every figure comes from the record of the SEND, not from the lead's status or its contact_method
 * pill — see the note in useDashboardMetrics for what each number used to claim. A channel whose
 * sends are not recorded anywhere says so instead of showing a number, and SMS shows a dash under
 * Replied because sms_sends logs what we send while nothing logs an inbound SMS.
 */
export function ChannelPerformanceCard({ data }: { data: ChannelPerformance }) {
  // An untracked channel has no meaningful `sent`, so keep it listed rather than hiding it — the
  // "not tracked" row is the useful information.
  const rows = CHANNELS.filter((c) => c.alwaysShow || (data[c.key] as ChannelStat).sent > 0
    || (data[c.key] as ChannelStat).tracking === 'none');

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent border-primary/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-5">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <Radio className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          <span className="truncate">Channel performance</span>
          <span className="ml-auto text-[10px] sm:text-xs font-normal text-muted-foreground/60">reply rate by channel</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-5 md:pt-0">
        {/* column headers */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 sm:gap-x-4 px-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
          <span>Channel</span>
          <span className="text-right w-10">Sent</span>
          <span className="text-right w-12">Replied</span>
          <span className="text-right w-14">Reply&nbsp;%</span>
        </div>
        <div className="divide-y divide-border/40">
          {rows.map((c) => {
            const s = data[c.key] as ChannelStat;
            // Nothing records a send on this channel, so there is no honest number to show. Saying
            // so beats a 0 that reads as "we tried and nobody answered".
            if (s.tracking === 'none') {
              return (
                <div key={c.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-1 py-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${c.dot} opacity-40`} />
                    <span className="text-xs sm:text-sm font-medium truncate text-muted-foreground/60">{c.label}</span>
                  </span>
                  <span className="text-right text-[10px] text-muted-foreground/50">not tracked</span>
                </div>
              );
            }
            return (
              <div key={c.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 sm:gap-x-4 px-1 py-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${c.dot}`} />
                  <span className="text-xs sm:text-sm font-medium truncate">{c.label}</span>
                </span>
                <span className="text-right w-10 text-xs sm:text-sm tabular-nums">{s.sent}</span>
                <span
                  className="text-right w-12 text-xs sm:text-sm tabular-nums"
                  title={s.replied === null ? 'Nothing records an inbound on this channel, so replies cannot be counted' : undefined}
                >
                  {s.replied === null ? '—' : s.replied}
                </span>
                <span className={`text-right w-14 text-sm sm:text-base font-bold tabular-nums ${rateColor(s.replyRate)}`}>
                  {s.replyRate === null ? '—' : `${s.replyRate}%`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground/50">
          Counted from messages actually sent, not from the contact-method pill. Archived leads are
          excluded.
        </p>
      </CardContent>
    </Card>
  );
}
