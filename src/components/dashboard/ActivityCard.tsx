import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, MessageSquare, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ActivityMetrics {
  phonesCopiedToday: number;
  phonesCopiedYesterday: number;
  leadsContactedToday: number;
  leadsContactedYesterday: number;
  totalPhonesCopied: number;
  totalLeadsContacted: number;
}

interface ActivityCardProps {
  activity: ActivityMetrics;
}

export function ActivityCard({ activity }: ActivityCardProps) {
  // Calculate changes
  const phonesChange = activity.phonesCopiedToday - activity.phonesCopiedYesterday;
  const contactsChange = activity.leadsContactedToday - activity.leadsContactedYesterday;
  
  const phonesTrend = phonesChange > 0 ? 'up' : phonesChange < 0 ? 'down' : 'stable';
  const contactsTrend = contactsChange > 0 ? 'up' : contactsChange < 0 ? 'down' : 'stable';

  return (
    <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
          <span className="truncate">Activity</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Primary metrics */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-500">
              {activity.totalLeadsContacted.toLocaleString()}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Leads Contacted</p>
          </div>
          <div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-500">
              {activity.totalPhonesCopied.toLocaleString()}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Phones Copied</p>
          </div>
        </div>
        
        {/* Today stats - Hidden on mobile */}
        <div className="hidden sm:grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-500" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Contacted Today</span>
            </div>
            <div className="text-sm sm:text-lg font-semibold">{activity.leadsContactedToday}</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-500" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Copied Today</span>
            </div>
            <div className="text-sm sm:text-lg font-semibold">{activity.phonesCopiedToday}</div>
          </div>
        </div>
        
        {/* Trend indicators */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">vs Yesterday</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {contactsTrend === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
                {contactsTrend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                {contactsTrend === 'stable' && <Minus className="h-3 w-3 text-muted-foreground" />}
                <span className={`font-medium ${
                  contactsTrend === 'up' ? 'text-green-500' : 
                  contactsTrend === 'down' ? 'text-red-500' : 
                  'text-muted-foreground'
                }`}>
                  {contactsChange > 0 ? '+' : ''}{contactsChange}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {phonesTrend === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
                {phonesTrend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
                {phonesTrend === 'stable' && <Minus className="h-3 w-3 text-muted-foreground" />}
                <span className={`font-medium ${
                  phonesTrend === 'up' ? 'text-green-500' : 
                  phonesTrend === 'down' ? 'text-red-500' : 
                  'text-muted-foreground'
                }`}>
                  {phonesChange > 0 ? '+' : ''}{phonesChange}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
