import { Link } from 'react-router-dom';
import { HelpCircle, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TrialStatusBadgeProps {
  searchesRemaining: number;
  dailyLimit: number;
  isCollapsed?: boolean;
  className?: string;
}

export function TrialStatusBadge({ 
  searchesRemaining, 
  dailyLimit, 
  isCollapsed = false,
  className 
}: TrialStatusBadgeProps) {
  const isExhausted = searchesRemaining <= 0;
  
  const tooltipContent = (
    <div className="space-y-2 max-w-xs">
      <p className="font-medium">Demo Mode</p>
      <p className="text-xs text-muted-foreground">
        {isExhausted 
          ? 'Your free demo search has been used. Unlock 24-hour full access for unlimited searches and all features.'
          : 'You have 1 free search to try the app. Unlock 24-hour full access for unlimited searches and all features.'}
      </p>
      <div className="pt-1 border-t border-border">
        <Link 
          to="/subscribe" 
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <Sparkles className="h-3 w-3" />
          Start 24-Hour Full Access
        </Link>
      </div>
    </div>
  );

  if (isCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center justify-center p-2 rounded-lg bg-primary/10 cursor-help",
              className
            )}>
              <Search className="h-4 w-4 text-primary" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium text-xs">Demo Mode</p>
              <p className="text-xs text-muted-foreground">
                {searchesRemaining > 0 ? '1 free search' : 'Free search used'}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10",
        className
      )}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-medium text-foreground truncate">
              Demo Mode
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {searchesRemaining > 0 ? '1 free search' : 'Free search used'}
          </p>
        </div>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="p-1 rounded-full hover:bg-primary/10 transition-colors">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" align="start" className="p-3">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
