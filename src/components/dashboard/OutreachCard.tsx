import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';

interface OutreachCardProps {
  /** HERO: businesses contacted = leads past "New" (status). Reconciles with Sent. */
  contactedTotal: number;
  /** Daily pulse — DISTINCT businesses contacted that day (deduped send log). */
  contactedToday: number;
  contactedYesterday: number;
  avg7Day: number;
  /** How many contacted businesses have a logged send (for the honest note). */
  loggedLeads: number;
}

/**
 * Outreach activity. HERO = businesses contacted (leads past "New", status =
 * source of truth) — reconciles with Sent / pipeline / channel card. Underneath,
 * a daily pulse counts DISTINCT businesses per day from the send log (deduped,
 * never per-press), with an honest note on how many are logged.
 */
export function OutreachCard({
  contactedTotal,
  contactedToday,
  contactedYesterday,
  avg7Day,
  loggedLeads,
}: OutreachCardProps) {
  return (
    <Card className="bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent border-purple-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
          <span className="truncate">Businesses contacted</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Hero — total businesses contacted (status, reconciles with Sent) */}
        <div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-purple-500">
            {contactedTotal}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Past "New" — one per business</p>
        </div>

        {/* Daily activity pulse — deduped per business/day from the send log */}
        <div className="pt-2 border-t border-border/50">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Today</span>
              <div className="text-sm sm:text-lg font-semibold">{contactedToday}</div>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Yesterday</span>
              <div className="text-sm sm:text-lg font-semibold">{contactedYesterday}</div>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] sm:text-xs text-muted-foreground">7d avg/day</span>
              <div className="text-sm sm:text-lg font-semibold">{avg7Day}</div>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/55 mt-1.5">
            Daily figures = businesses contacted from the send log (deduped). {loggedLeads} of {contactedTotal} logged.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
