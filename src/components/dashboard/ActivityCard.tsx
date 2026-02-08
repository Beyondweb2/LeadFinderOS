import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, MessageSquare, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

interface ActivityMetrics {
  phonesCopiedToday: number;
  phonesCopiedYesterday: number;
  phonesCopiedThisWeek: number;
  phonesCopiedLastWeek: number;
  leadsContactedToday: number;
  leadsContactedYesterday: number;
  leadsContactedThisWeek: number;
  leadsContactedLastWeek: number;
  activitiesToday: number;
  activitiesYesterday: number;
  activitiesThisWeek: number;
  totalPhonesCopied: number;
  totalLeadsContacted: number;
}

interface ActivityCardProps {
  activity: ActivityMetrics;
}

function TrendIndicator({ current, previous, label }: { current: number; previous: number; label: string }) {
  const diff = current - previous;
  const percentage = previous > 0 ? Math.round((diff / previous) * 100) : current > 0 ? 100 : 0;
  
  if (diff > 0) {
    return (
      <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="h-3 w-3" />
        <span className="text-[10px]">+{diff} vs {label}</span>
      </span>
    );
  } else if (diff < 0) {
    return (
      <span className="flex items-center gap-0.5 text-red-500">
        <TrendingDown className="h-3 w-3" />
        <span className="text-[10px]">{diff} vs {label}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground">
      <Minus className="h-3 w-3" />
      <span className="text-[10px]">same as {label}</span>
    </span>
  );
}

function MetricRow({ 
  icon: Icon, 
  label, 
  todayValue, 
  yesterdayValue,
  weekValue,
  lastWeekValue,
  iconColor 
}: { 
  icon: React.ElementType;
  label: string;
  todayValue: number;
  yesterdayValue: number;
  weekValue: number;
  lastWeekValue: number;
  iconColor: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          <span className="text-xs sm:text-sm text-muted-foreground">{label}</span>
        </div>
        <div className="text-right">
          <span className="text-lg sm:text-xl font-bold">{todayValue}</span>
          <span className="text-xs text-muted-foreground ml-1">today</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <TrendIndicator current={todayValue} previous={yesterdayValue} label="yesterday" />
        <div className="text-muted-foreground">
          <span className="font-medium">{weekValue}</span> this week
          {lastWeekValue > 0 && (
            <span className="ml-1">
              ({weekValue >= lastWeekValue ? '+' : ''}{weekValue - lastWeekValue} vs last)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityCard({ activity }: ActivityCardProps) {
  const totalToday = activity.phonesCopiedToday + activity.leadsContactedToday + activity.activitiesToday;
  const totalYesterday = activity.phonesCopiedYesterday + activity.leadsContactedYesterday + activity.activitiesYesterday;

  return (
    <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
            <span>Today's Activity</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg sm:text-xl font-bold text-foreground">{totalToday}</span>
            <span className="text-[10px]">actions</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Phone Numbers Copied */}
        <MetricRow
          icon={Phone}
          label="Phones Copied"
          todayValue={activity.phonesCopiedToday}
          yesterdayValue={activity.phonesCopiedYesterday}
          weekValue={activity.phonesCopiedThisWeek}
          lastWeekValue={activity.phonesCopiedLastWeek}
          iconColor="text-blue-500"
        />

        <div className="border-t border-border/50" />

        {/* Leads Contacted */}
        <MetricRow
          icon={MessageSquare}
          label="Leads Contacted"
          todayValue={activity.leadsContactedToday}
          yesterdayValue={activity.leadsContactedYesterday}
          weekValue={activity.leadsContactedThisWeek}
          lastWeekValue={activity.leadsContactedLastWeek}
          iconColor="text-emerald-500"
        />

        {/* Summary footer */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">All time</span>
            <div className="flex items-center gap-3">
              <span>
                <span className="font-medium">{activity.totalPhonesCopied}</span>
                <span className="text-muted-foreground ml-1">copied</span>
              </span>
              <span>
                <span className="font-medium">{activity.totalLeadsContacted}</span>
                <span className="text-muted-foreground ml-1">contacted</span>
              </span>
            </div>
          </div>
          {totalToday !== totalYesterday && (
            <div className="flex justify-end mt-1">
              <TrendIndicator current={totalToday} previous={totalYesterday} label="yesterday" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
