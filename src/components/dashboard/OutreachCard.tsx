import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Phone, MessageCircle } from 'lucide-react';

interface OutreachCardProps {
  contactedToday: number;
  contactedYesterday: number;
  avg7Day: number;
  channels7d: {
    calls: number;
    whatsapp: number;
    sms: number;
  };
}

export function OutreachCard({
  contactedToday,
  contactedYesterday,
  avg7Day,
  channels7d,
}: OutreachCardProps) {
  return (
    <Card className="bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent border-purple-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
          <span className="truncate">Outreach</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Today - Hero */}
        <div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-purple-500">
            {contactedToday}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Contacted today</p>
          {contactedToday === 0 && contactedYesterday > 0 && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">No activity today</p>
          )}
          {contactedToday > 0 && contactedToday > contactedYesterday && (
            <p className="text-[10px] text-green-500/70 mt-0.5">Up from yesterday</p>
          )}
          {contactedToday > 0 && contactedToday <= contactedYesterday && (
            <p className="text-[10px] text-green-500/70 mt-0.5">Good momentum today</p>
          )}
        </div>

        {/* Yesterday & 7d avg */}
        <div className="hidden sm:grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <span className="text-[10px] sm:text-xs text-muted-foreground">Yesterday</span>
            <div className="text-sm sm:text-lg font-semibold">{contactedYesterday}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] sm:text-xs text-muted-foreground">7d avg</span>
            <div className="text-sm sm:text-lg font-semibold">{avg7Day}</div>
          </div>
        </div>

        {/* Channel breakdown */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">{channels7d.calls}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3 text-green-500" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">{channels7d.whatsapp}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">{channels7d.sms}</span>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5 text-center">7-day channels</p>
        </div>
      </CardContent>
    </Card>
  );
}
