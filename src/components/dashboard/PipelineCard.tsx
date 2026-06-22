import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitBranch } from 'lucide-react';

interface PipelineCounts {
  new: number;
  contacted: number;
  followUp: number;
  siteSent: number;
  interested: number;
  proposalSent: number;
  closedWon: number;
}

interface PipelineCardProps {
  pipeline: PipelineCounts;
}

const stages: { key: keyof PipelineCounts; label: string; color: string; activeColor: string }[] = [
  { key: 'new', label: 'New', color: 'text-muted-foreground/70', activeColor: 'text-muted-foreground' },
  { key: 'contacted', label: 'Contacted', color: 'text-blue-500/70', activeColor: 'text-blue-500' },
  { key: 'followUp', label: 'Follow-up', color: 'text-amber-500/70', activeColor: 'text-amber-500' },
  { key: 'siteSent', label: 'Site sent', color: 'text-cyan-500/70', activeColor: 'text-cyan-500' },
  { key: 'interested', label: 'Interested', color: 'text-green-500/80', activeColor: 'text-green-500 font-bold' },
  { key: 'proposalSent', label: 'Proposal', color: 'text-purple-500/80', activeColor: 'text-purple-500 font-bold' },
  { key: 'closedWon', label: 'Closed', color: 'text-emerald-500/80', activeColor: 'text-emerald-500 font-bold' },
];

export function PipelineCard({ pipeline }: PipelineCardProps) {
  const total = Object.values(pipeline).reduce((s, v) => s + v, 0);

  return (
    <Card className="bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border-blue-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <GitBranch className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
          <span className="truncate">Pipeline</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Total active */}
        <div>
          <div className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-500">
            {total}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Active leads</p>
        </div>

        {/* Two-column stat grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:gap-y-2 pt-2 border-t border-border/50">
          {stages.map(stage => (
            <div key={stage.key} className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs text-muted-foreground">{stage.label}</span>
              <span className={`text-xs sm:text-sm font-semibold ${pipeline[stage.key] > 0 ? stage.activeColor : stage.color}`}>
                {pipeline[stage.key]}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
