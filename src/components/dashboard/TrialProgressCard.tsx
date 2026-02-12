import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Target, Users, Sparkles } from 'lucide-react';

interface TrialProgressCardProps {
  trialEnd: string | null;
  noWebsiteBusinesses: number;
  addedToCRM: number;
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
        setTimeLeft(`${hours}h ${minutes}m remaining`);
      } else {
        setTimeLeft(`${minutes}m remaining`);
      }
    };

    update();
    const interval = setInterval(update, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [trialEnd]);

  return timeLeft;
}

export function TrialProgressCard({
  trialEnd,
  noWebsiteBusinesses,
  addedToCRM,
}: TrialProgressCardProps) {
  const countdown = useCountdown(trialEnd);

  return (
    <Card className="col-span-2 lg:col-span-4 bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          Free Trial
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Countdown */}
        <div className="space-y-1">
          <p className="text-sm font-medium">{countdown || 'Calculating...'}</p>
          <p className="text-xs text-muted-foreground">
            Full access to all features — unlimited searches included
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
              <p className="text-xs text-muted-foreground">No website found</p>
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
            Your plan auto-renews after the trial — manage anytime
          </p>
          <Button size="sm" asChild>
            <Link to="/subscribe" className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Subscribe
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
