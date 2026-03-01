import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface PipelineCardProps {
  trackedLeads: number;
  contacted: number;
  interested: number;
  callBooked: number;
  closedWon: number;
}

export function PipelineCard({
  trackedLeads,
  contacted,
  interested,
  callBooked,
  closedWon,
}: PipelineCardProps) {
  const stages = [
    { label: 'Tracked', value: trackedLeads, color: 'text-purple-500' },
    { label: 'Contacted', value: contacted, color: 'text-blue-500' },
    { label: 'Interested', value: interested, color: 'text-amber-500' },
    { label: 'Call Booked', value: callBooked, color: 'text-green-500' },
    { label: 'Closed Won', value: closedWon, color: 'text-emerald-500' },
  ];

  return (
    <Card className="bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border-blue-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
          <span className="truncate">Pipeline</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Hero - Tracked leads */}
        <div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-500">
            {trackedLeads}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Tracked Leads</p>
        </div>
        
        {/* Stage progression */}
        <div className="space-y-1.5 pt-2 border-t border-border/50">
          {stages.slice(1).map((stage) => (
            <div key={stage.label} className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs text-muted-foreground">{stage.label}</span>
              <span className={`text-xs sm:text-sm font-semibold ${stage.color}`}>{stage.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
