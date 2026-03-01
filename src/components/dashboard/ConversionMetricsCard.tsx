import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Rocket } from 'lucide-react';

interface ConversionMetricsCardProps {
  contactToReply: number;
  replyToCall: number;
  callToClosed: number;
  overallContactToClosed: number;
  totalContacted: number;
}

function RateBar({ label, rate }: { label: string; rate: number }) {
  const color = rate >= 20 ? 'bg-green-500' : rate >= 10 ? 'bg-amber-500' : 'bg-blue-500/60';
  const textColor = rate >= 20 ? 'text-green-500' : rate >= 10 ? 'text-amber-500' : 'text-muted-foreground';

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs font-bold ${textColor}`}>{rate.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function ConversionMetricsCard({
  contactToReply,
  replyToCall,
  callToClosed,
  overallContactToClosed,
  totalContacted,
}: ConversionMetricsCardProps) {
  if (totalContacted < 10) {
    return (
      <Card className="bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent border-sky-500/20">
        <CardHeader className="pb-1 p-3 sm:p-4 md:p-6">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-sky-500" />
            Conversion Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <Rocket className="h-8 w-8 text-sky-500/50 mb-2" />
            <p className="text-sm font-medium text-foreground/80">
              Contact {10 - totalContacted} more businesses
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              to unlock performance insights
            </p>
            <div className="mt-3 h-1.5 w-32 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${(totalContacted / 10) * 100}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{totalContacted}/10</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent border-sky-500/20">
      <CardHeader className="pb-1 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-sky-500" />
          Conversion Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0 space-y-3">
        <RateBar label="Contact → Reply" rate={contactToReply} />
        <RateBar label="Reply → Call Booked" rate={replyToCall} />
        <RateBar label="Call → Closed" rate={callToClosed} />
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Overall Close Rate</span>
            <span className={`text-base font-bold ${overallContactToClosed >= 5 ? 'text-green-500' : 'text-foreground'}`}>
              {overallContactToClosed.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
