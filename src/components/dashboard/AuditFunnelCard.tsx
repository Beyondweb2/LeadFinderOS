import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Filter, MessageCircle, Reply, FileText, Eye, BadgePoundSterling, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AuditFunnel {
  /** Leads actually sent a templated message. This was a lead-status test that read 653 when 196
   *  had been messaged. See useDashboardMetrics for what every stage replaced. */
  contacted: number;
  /** Leads with a real inbound message that is not an auto-responder. */
  replied: number;
  /** Leads actually sent the report pitch (audit_reply). */
  pitched: number;
  /** Of `pitched`, leads whose newest real message arrived AFTER the pitch. */
  pitchReplied: number;
  /** Leads with money in, from amount_paid or a paid-or-beyond status. */
  paid: number;
  replyRate: number | null;      // replied / contacted
  pitchReplyRate: number | null; // pitchReplied / pitched
  /* ⛔ FOUNDER PLACES TAKEN, COUNTED EXACTLY RATHER THAN GUESSED. stripe-webhook writes the real
     charged amount into amount_paid (amount_total / 100), so a founder sale is literally a lead that
     paid the founder price — not "any paid lead", which would also count a full-price sale once the
     offer closes.
     ⚠️ NOT £49.99. RG Locksmiths was quoted that on a separate payment link under the OLD outcome
     guarantee; if he pays it he is not a founder place, he is a different quote. Counting anything
     "below full price" would have swept him in. See _shared/offer-price.ts.
     ⚠️ NOTHING CLOSES THE OFFER ON THIS NUMBER. It is displayed so Paul can see it; FOUNDER_OFFER_LIVE
     stays a manual switch, because a webhook lag or a refund silently changing what the next person
     pays is a worse failure than forgetting to flip it. */
  founderSales: number;
  founderPlaces: number;
}

function Stat({ icon: Icon, value, label, color, sub, title }: {
  icon: LucideIcon; value: number; label: string; color: string; sub?: string; title?: string;
}) {
  return (
    <div className="space-y-1" title={title}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-lg sm:text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60 leading-tight">{sub}</p>}
    </div>
  );
}

/**
 * The audit funnel: Reached, Replied, Pitched, Pitch reply, Paid.
 *
 * Every stage is derived from whatsapp_messages, so each is something that demonstrably happened
 * rather than a status someone set. Two stages are gone:
 *   Report opened - ai_audits records only first_opened_at and open_count, with no viewer, IP or
 *     user agent, so our own views counted as a prospect's and could never be separated out.
 *   Price given   - the price_given status has never been set on any lead, so the tile was
 *     structurally always 0.
 */
export function AuditFunnelCard({ funnel, compact = false }: { funnel: AuditFunnel; compact?: boolean }) {
  return (
    <Card className="bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent border-primary/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          <span className="truncate">Audit funnel</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Six across at lg, not five. A sixth stat here rather than a card of its own: one tile does
            not earn a row, and "0 of 10" alone reads as a section that failed to load. It also sits
            next to Paid, which is where the number gets its meaning. */}
        <div className={`grid gap-2 sm:gap-4 ${compact ? 'grid-cols-3' : 'grid-cols-3 lg:grid-cols-6'}`}>
          <Stat
            icon={MessageCircle} value={funnel.contacted} label="Reached" color="text-blue-500"
            title="Leads actually sent a templated message. The old status test counted leads that were only queued, unreachable on WhatsApp, or archived."
          />
          <Stat
            icon={Reply} value={funnel.replied} label="Replied" color="text-emerald-500"
            sub={funnel.replyRate === null ? undefined : `${funnel.replyRate}% of reached`}
            title="Leads who sent a real inbound message that is not an auto-responder."
          />
          <Stat
            icon={FileText} value={funnel.pitched} label="Pitched" color="text-emerald-400"
            title="Leads actually sent the report pitch (audit_reply)."
          />
          <Stat
            icon={Eye} value={funnel.pitchReplied} label="Pitch reply" color="text-purple-500"
            sub={funnel.pitchReplyRate === null ? undefined : `${funnel.pitchReplyRate}% of pitched`}
            title="Of the leads pitched, how many wrote back AFTER the pitch. This is whether the report and pitch actually work."
          />
          <Stat
            icon={BadgePoundSterling} value={funnel.paid} label="Paid" color="text-green-600"
            title="Leads with money in, read from amount_paid rather than only from a status someone remembered to move."
          />
          {/* NEXT TO PAID, because that is where it gets its meaning: of the money in, how much of it
              was a founder place. Counting DOWN rather than up — the number that matters is how many
              are left at the reduced price, not how many have gone. */}
          <Stat
            icon={Sparkles}
            value={Math.max(0, funnel.founderPlaces - funnel.founderSales)}
            label="Founder places"
            color="text-amber-500"
            sub={`${funnel.founderSales} of ${funnel.founderPlaces} taken`}
            title="Leads that paid the founder price exactly, counted from the real charged amount. Nothing closes the offer automatically — FOUNDER_OFFER_LIVE is a manual switch, so a webhook lag or a refund can never silently change what the next person pays."
          />
        </div>
      </CardContent>
    </Card>
  );
}
