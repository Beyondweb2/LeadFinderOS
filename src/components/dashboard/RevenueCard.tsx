import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PoundSterling, TrendingUp, TrendingDown, Minus, Users, FileText, Target } from 'lucide-react';

interface RevenueCardProps {
  revenueThisMonth: number;
  revenueLastMonth: number;
  totalRevenue: number;
  fullyPaidClients: number;
  activeProposals: number;
  pipelineDeals: number;
  totalPotentialRevenue?: number;
  closedRevenue?: number;
}

export function RevenueCard({
  revenueThisMonth,
  revenueLastMonth,
  totalRevenue,
  fullyPaidClients,
  activeProposals,
  pipelineDeals,
  totalPotentialRevenue = 0,
  closedRevenue = 0,
}: RevenueCardProps) {
  const change = revenueLastMonth > 0
    ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100)
    : revenueThisMonth > 0 ? 100 : 0;

  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'stable';

  return (
    <Card className="bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent border-green-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <PoundSterling className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
          <span className="truncate">Revenue</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-4 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* This Month - Hero */}
        <div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-green-500">
            £{revenueThisMonth.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-[10px] sm:text-xs text-muted-foreground">vs last month</p>
            <div className="flex items-center gap-0.5">
              {trend === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
              {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
              {trend === 'stable' && <Minus className="h-3 w-3 text-muted-foreground" />}
              <span className={`text-[10px] sm:text-xs font-medium ${
                trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
              }`}>
                {trend === 'up' ? '+' : ''}{change}%
              </span>
            </div>
          </div>
          {revenueThisMonth === 0 && pipelineDeals > 0 && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{pipelineDeals} deal{pipelineDeals !== 1 ? 's' : ''} in pipeline</p>
          )}
          {revenueThisMonth > 0 && (
            <p className="text-[10px] text-green-500/70 mt-0.5">+£{revenueThisMonth.toLocaleString()} added this month</p>
          )}
        </div>

        {/* Potential Revenue */}
        {totalPotentialRevenue > 0 && (
          <div className="flex items-center justify-between py-1.5 px-2 rounded-md bg-amber-500/5 border border-amber-500/20">
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Pipeline Value</span>
            </div>
            <span className="text-xs sm:text-sm font-semibold text-amber-500">£{totalPotentialRevenue.toLocaleString()}</span>
          </div>
        )}

        {/* Middle row */}
        <div className="hidden sm:grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Paid clients</span>
            </div>
            <div className="text-sm sm:text-lg font-semibold">{fullyPaidClients}</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <FileText className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-500" />
              <span className="text-[10px] sm:text-xs text-muted-foreground">Proposals</span>
            </div>
            <div className="text-sm sm:text-lg font-semibold">{activeProposals}</div>
          </div>
        </div>

        {/* Lifetime + Closed */}
        <div className="pt-2 border-t border-border/50 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-muted-foreground">Lifetime</span>
            <span className="text-xs sm:text-sm font-medium text-muted-foreground/70">£{totalRevenue.toLocaleString()}</span>
          </div>
          {closedRevenue > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm text-muted-foreground">Closed Revenue</span>
              <span className="text-xs sm:text-sm font-medium text-green-500/70">£{closedRevenue.toLocaleString()}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
