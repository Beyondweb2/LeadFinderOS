import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Filter, MessageCircle, Reply, FileText, Eye, Tag, BadgePoundSterling } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AuditFunnel {
  contacted: number;    // initial_contact or beyond (past New)
  replied: number;      // replied or beyond
  reportSent: number;   // report_sent or beyond
  reportOpened: number; // report_sent-or-beyond leads whose audit has first_opened_at
  priceGiven: number;   // price_given or beyond
  paid: number;         // payment_received or beyond
  openRate: number | null; // reportOpened / reportSent, %
}

function Stat({ icon: Icon, value, label, color, sub }: {
  icon: LucideIcon; value: number; label: string; color: string; sub?: string;
}) {
  return (
    <div className="space-y-1">
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
 * The current audit → pitch → pay funnel. Contacted → Replied → Report sent →
 * Report opened → Price given → Paid. All stages are cumulative ("reached this
 * stage or beyond") from outreach_leads.status except Report opened, which counts
 * report-sent-or-beyond leads whose audit has a first_opened_at (tracked by
 * render-audit-report). Opened shows count + % of reports sent.
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
        <div className={`grid gap-2 sm:gap-4 ${compact ? 'grid-cols-3' : 'grid-cols-3 lg:grid-cols-6'}`}>
          <Stat icon={MessageCircle} value={funnel.contacted} label="Contacted" color="text-blue-500" />
          <Stat icon={Reply} value={funnel.replied} label="Replied" color="text-emerald-500" />
          <Stat icon={FileText} value={funnel.reportSent} label="Report sent" color="text-emerald-400" />
          <Stat
            icon={Eye}
            value={funnel.reportOpened}
            label="Report opened"
            color="text-purple-500"
            sub={funnel.openRate === null ? undefined : `${funnel.openRate}% of sent`}
          />
          <Stat icon={Tag} value={funnel.priceGiven} label="Price given" color="text-sky-500" />
          <Stat icon={BadgePoundSterling} value={funnel.paid} label="Paid" color="text-green-600" />
        </div>
      </CardContent>
    </Card>
  );
}
