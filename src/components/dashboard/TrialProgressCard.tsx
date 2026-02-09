import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Search, Users, Target, Sparkles } from 'lucide-react';

interface TrialProgressCardProps {
  searchesUsedToday: number;
  dailyLimit: number;
  noWebsiteBusinesses: number;
  addedToCRM: number;
}

export function TrialProgressCard({
  searchesUsedToday,
  dailyLimit,
  noWebsiteBusinesses,
  addedToCRM,
}: TrialProgressCardProps) {
  const searchProgress = (searchesUsedToday / dailyLimit) * 100;
  const searchesRemaining = Math.max(0, dailyLimit - searchesUsedToday);

  return (
    <Card className="col-span-2 lg:col-span-4 bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Search className="h-4 w-4 text-primary" />
          </div>
          Your Trial Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Daily searches</span>
            <span className="font-medium">
              {searchesUsedToday} / {dailyLimit} used today
            </span>
          </div>
          <Progress value={searchProgress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {searchesRemaining > 0 
              ? `${searchesRemaining} search${searchesRemaining !== 1 ? 'es' : ''} remaining today`
              : 'Daily limit reached – resets tomorrow'
            }
          </p>
        </div>

        {/* Progress Metrics */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Target className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">{noWebsiteBusinesses}</p>
              <p className="text-xs text-muted-foreground">No website</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Users className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">{addedToCRM}</p>
              <p className="text-xs text-muted-foreground">Added to CRM</p>
            </div>
          </div>
        </div>

        {/* Upgrade CTA */}
        <div className="pt-2 flex items-center justify-between gap-4 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Upgrade to unlock unlimited searches
          </p>
          <Button size="sm" asChild>
            <Link to="/subscribe" className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Upgrade
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
