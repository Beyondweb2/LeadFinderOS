import { useState } from 'react';
import { Target, ChevronDown, ChevronUp, Check, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';

interface Challenge10WidgetProps {
  isActive: boolean;
  isCompleted: boolean;
  isSkipped: boolean;
  count: number;
  featureEnabled: boolean;
  onStart: () => void;
}

export function Challenge10Widget({ isActive, isCompleted, isSkipped, count, featureEnabled, onStart }: Challenge10WidgetProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [completedDismissed, setCompletedDismissed] = useState(false);

  if (!featureEnabled) return null;

  // Completed state
  if (isCompleted) {
    if (completedDismissed) return null;
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 sm:p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-emerald-500" />
            <span className="text-sm font-semibold text-emerald-500">Challenge Complete ✅</span>
          </div>
          <button
            onClick={() => setCompletedDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Nice - you've done the hard part: consistency. Keep contacting businesses to build your pipeline.
        </p>
        <div className="flex gap-2 mt-3">
          <Button asChild size="sm" variant="outline" className="text-xs h-8 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10">
            <Link to="/find-leads">
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Run Another Search
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Skipped — show subtle start prompt
  if (isSkipped && !isActive) {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-500">10 Business Challenge</span>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-7 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10" onClick={onStart}>
            Start Challenge
          </Button>
        </div>
      </div>
    );
  }

  // Active challenge
  if (!isActive) return null;

  const progress = Math.min((count / 10) * 100, 100);

  if (collapsed) {
    return (
      <div 
        className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 mb-4 cursor-pointer"
        onClick={() => setCollapsed(false)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-500">{count}/10 contacted</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <Progress value={progress} className="h-1.5 mt-1.5 [&>div]:bg-emerald-500" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 sm:p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-emerald-500">10 Business Challenge</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="text-muted-foreground hover:text-foreground">
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
      <Progress value={progress} className="h-2 mb-2 [&>div]:bg-emerald-500" />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-emerald-500">{count}/10 contacted</span>
        <span className="text-[10px] text-muted-foreground">Contact 10 businesses to complete</span>
      </div>
    </div>
  );
}
