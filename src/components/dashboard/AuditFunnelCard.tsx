import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Filter, MessageCircle, Reply, FileText, Eye, BadgePoundSterling } from 'lucide-react';
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
        <div className={`grid gap-2 sm:gap-4 ${compact ? 'grid-cols-3' : 'grid-cols-3 lg:grid-cols-5'}`}>
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
        </div>
      </CardContent>
    </Card>
  );
}
