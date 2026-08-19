import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Filter, MessageCircle, Reply, FileText, Eye, BadgePoundSterling, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AuditFunnel {
  /** Leads actually sent a templated message that really went out (isRealSend — a failed or
   *  simulated row is not a contact). The original lead-status test read 653 when 196 had been
   *  messaged. See useDashboardMetrics for what every stage replaced. */
  contacted: number;
  /** Leads with a real inbound message that is not an auto-responder. In practice these are replies
   *  to the OPENER: the hook (audit_reply) only ever goes out after a first reply. */
  replied: number;
  /** Leads actually sent the HOOK — message 2, the report pitch (audit_reply). The opener exists to
   *  get a reply; this is the message being measured. */
  pitched: number;
  /** Of `pitched`, leads whose newest real message arrived AFTER the hook. */
  pitchReplied: number;
  /** Of `pitchReplied`, leads with money in — the hook→paid conversion. */
  pitchRepliedPaid: number;
  /** Leads with money in. amount_paid ONLY — a status someone moved by hand is not a payment. */
  paid: number;
  replyRate: number | null;      // replied / contacted
  pitchReplyRate: number | null; // pitchReplied / pitched
  /* ⛔ FOUNDER PLACES TAKEN, COUNTED EXACTLY RATHER THAN GUESSED. stripe-webhook writes the real
     charged amount into amount_paid (amount_total / 100), so a founder sale is literally a lead that
     paid A founder price — not "any paid lead", which would also count a full-price sale once the
     offer closes.
     ⚠️ THE FOUNDER PRICE HAS MOVED (£19.99 → £49.99 on 2026-08-12), so this counts matches against
     the CURRENT price AND the historical list (FOUNDER_PRICES_HISTORICAL_GBP) — Paul's call
     2026-08-19, after the tile read 1 with two paying customers in the bank. An earlier comment
     here argued £49.99 was NOT a founder price; the price change inverted that, and the comment
     mis-described the code for a week.
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
            title="Leads actually sent a templated message that really went out. Failed sends (number not on WhatsApp) and test-mode rows are excluded — a send Meta refused is not a contact."
          />
          <Stat
            icon={Reply} value={funnel.replied} label="Replied" color="text-emerald-500"
            sub={funnel.replyRate === null ? undefined : `${funnel.replyRate}% of reached`}
            title="Leads who sent a real inbound message that is not an auto-responder. In practice: replies to the OPENER — the hook only goes out after a first reply."
          />
          <Stat
            icon={FileText} value={funnel.pitched} label="Hook sent (msg 2)" color="text-emerald-400"
            title="Leads actually sent the hook — message 2, the report pitch (audit_reply). The opener exists to get a reply; this is the message being measured."
          />
          <Stat
            icon={Eye} value={funnel.pitchReplied} label="Hook reply" color="text-purple-500"
            sub={funnel.pitchReplyRate === null ? undefined : `${funnel.pitchReplyRate}% of hook sent`}
            title="Of the leads sent the hook, how many wrote back AFTER it. This is whether the pitch works, separate from whether the opener gets replies."
          />
          <Stat
            icon={BadgePoundSterling} value={funnel.paid} label="Paid" color="text-green-600"
            sub={funnel.pitchReplied > 0 ? `${funnel.pitchRepliedPaid} of ${funnel.pitchReplied} hook replies` : undefined}
            title="Leads with money in, read from amount_paid rather than a status someone remembered to move. The small print is the hook→paid conversion: of the leads who answered the hook, how many bought."
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
