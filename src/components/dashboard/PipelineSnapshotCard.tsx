import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitBranch } from 'lucide-react';

interface PipelineSnapshotCardProps {
  pipeline: {
    contacted: number;
    replied: number;
    interested: number;
    callBooked: number;
    proposalSent: number;
    closedWon: number;
    closedLost: number;
  };
}

const stages = [
  { key: 'contacted', label: 'Contacted', color: 'bg-blue-500' },
  { key: 'replied', label: 'Replied', color: 'bg-sky-500' },
  { key: 'interested', label: 'Interested', color: 'bg-emerald-500' },
  { key: 'callBooked', label: 'Call Booked', color: 'bg-amber-500' },
  { key: 'proposalSent', label: 'Proposal Sent', color: 'bg-purple-500' },
  { key: 'closedWon', label: 'Closed Won', color: 'bg-green-500' },
  { key: 'closedLost', label: 'Closed Lost', color: 'bg-red-500/70' },
] as const;

export function PipelineSnapshotCard({ pipeline }: PipelineSnapshotCardProps) {
  const maxCount = Math.max(pipeline.contacted, 1);

  return (
    <Card className="bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent border-purple-500/20">
      <CardHeader className="pb-1 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-purple-500" />
          Pipeline Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        <div className="space-y-1.5">
          {stages.map(({ key, label, color }) => {
            const count = pipeline[key];
            const pct = Math.round((count / maxCount) * 100);
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="w-24 sm:w-28 text-muted-foreground shrink-0 truncate">{label}</span>
                <div className="flex-1 h-5 rounded bg-muted/40 overflow-hidden">
                  <div
                    className={`h-full rounded ${color} transition-all duration-500`}
                    style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <span className="w-8 text-right font-medium tabular-nums">{count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
