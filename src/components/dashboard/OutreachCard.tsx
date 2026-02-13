import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';

interface OutreachCardProps {
  totalBusinessesAdded: number;
  addedToday: number;
  addedYesterday: number;
  avgPerDay: number;
}

export function OutreachCard({
  totalBusinessesAdded,
  addedToday,
  addedYesterday,
  avgPerDay,
}: OutreachCardProps) {
  // Calculate change from yesterday
  const change = addedToday - addedYesterday;
  const changePercent = addedYesterday > 0 
    ? ((change / addedYesterday) * 100).toFixed(0) 
    : addedToday > 0 ? '+100' : '0';
  
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'stable';

  return (
    <Card className="border-border">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
          <span className="truncate">Outreach CRM</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Total Added - Hero */}
        <div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-purple-500">
            {totalBusinessesAdded.toLocaleString()}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Total in CRM</p>
        </div>
        
        {/* Today vs Yesterday - Hidden on mobile */}
        <div className="hidden sm:grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-purple-500" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Today</span>
            </div>
            <div className="text-sm sm:text-lg font-semibold">{addedToday}</div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Yesterday</span>
            </div>
            <div className="text-sm sm:text-lg font-semibold">{addedYesterday}</div>
          </div>
        </div>
        
        {/* Trend indicator */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-muted-foreground">vs Yesterday</span>
            <div className="flex items-center gap-1">
              {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-green-500" />}
              {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
              {trend === 'stable' && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className={`text-xs sm:text-sm font-medium ${
                trend === 'up' ? 'text-green-500' : 
                trend === 'down' ? 'text-red-500' : 
                'text-muted-foreground'
              }`}>
                {trend === 'up' ? '+' : ''}{change} ({changePercent}%)
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}