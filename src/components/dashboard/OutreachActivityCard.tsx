import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Phone, Mail } from 'lucide-react';

interface OutreachActivityCardProps {
  totalContacted: number;
  contactedToday: number;
  contactedYesterday: number;
  avg7Day: number;
  callsTotal: number;
  whatsappTotal: number;
  smsTotal: number;
  emailTotal: number;
}

export function OutreachActivityCard({
  totalContacted,
  contactedToday,
  contactedYesterday,
  avg7Day,
  callsTotal,
  whatsappTotal,
  smsTotal,
  emailTotal,
}: OutreachActivityCardProps) {
  return (
    <Card className="bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent border-purple-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
          <span className="truncate">Outreach Activity</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Total Contacted - Hero */}
        <div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-purple-500">
            {totalContacted.toLocaleString()}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Total Contacted</p>
        </div>
        
        {/* Today / Yesterday / Avg - Hidden on mobile */}
        <div className="hidden sm:grid grid-cols-3 gap-2 sm:gap-3 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <span className="text-[10px] sm:text-xs text-muted-foreground">Today</span>
            <div className="text-sm sm:text-lg font-semibold">{contactedToday}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] sm:text-xs text-muted-foreground">Yesterday</span>
            <div className="text-sm sm:text-lg font-semibold">{contactedYesterday}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] sm:text-xs text-muted-foreground">7d Avg</span>
            <div className="text-sm sm:text-lg font-semibold">{avg7Day.toFixed(1)}</div>
          </div>
        </div>
        
        {/* Channel breakdown */}
        <div className="pt-2 border-t border-border/50">
          <div className="grid grid-cols-4 gap-1 text-center">
            <div>
              <div className="text-xs sm:text-sm font-semibold">{callsTotal}</div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">Calls</p>
            </div>
            <div>
              <div className="text-xs sm:text-sm font-semibold">{whatsappTotal}</div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">WhatsApp</p>
            </div>
            <div>
              <div className="text-xs sm:text-sm font-semibold">{smsTotal}</div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">SMS</p>
            </div>
            <div>
              <div className="text-xs sm:text-sm font-semibold">{emailTotal}</div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">Email</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
