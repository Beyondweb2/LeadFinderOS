import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Unlock, Target, Users, TrendingUp, Search } from 'lucide-react';

interface TrialProgressCardProps {
  trialEnd: string | null;
  noWebsiteBusinesses: number;
  addedToCRM: number;
  searchesToday?: number;
  totalLeadsAdded?: number;
}

function useCountdown(trialEnd: string | null) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!trialEnd) return;

    const update = () => {
      const now = new Date().getTime();
      const end = new Date(trialEnd).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        setTimeLeft(`Ends in ${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`Ends in ${minutes}m`);
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [trialEnd]);

  return timeLeft;
}

export function TrialProgressCard({
  trialEnd,
  noWebsiteBusinesses,
  addedToCRM,
  searchesToday = 0,
  totalLeadsAdded = 0,
}: TrialProgressCardProps) {
  const countdown = useCountdown(trialEnd);
  const hasActivity = searchesToday > 0 || totalLeadsAdded > 0 || addedToCRM > 0;

  return (
    <Card className="col-span-2 lg:col-span-4 bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Unlock className="h-4 w-4 text-primary" />
          </div>
          Full Access Unlocked
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <p className="text-sm font-medium">
              Full access active · {countdown || 'Calculating...'}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Everything unlocked.
          </p>
        </div>

        {/* Progress Metrics */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
            <div className="p-2 rounded-lg bg-primary/10">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">{noWebsiteBusinesses}</p>
              <p className="text-xs text-muted-foreground">No website found</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">{addedToCRM}</p>
              <p className="text-xs text-muted-foreground">Added to CRM</p>
            </div>
          </div>
        </div>

        {/* Usage reinforcement */}
        {(searchesToday > 0 || totalLeadsAdded > 0) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span>
              {searchesToday > 0 && `${searchesToday} search${searchesToday !== 1 ? 'es' : ''} run today`}
              {searchesToday > 0 && totalLeadsAdded > 0 && ' · '}
              {totalLeadsAdded > 0 && `${totalLeadsAdded} lead${totalLeadsAdded !== 1 ? 's' : ''} added so far`}
            </span>
          </div>
        )}

        {/* Momentum reinforcement */}
        {hasActivity && (
          <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" />
            You're building momentum.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
