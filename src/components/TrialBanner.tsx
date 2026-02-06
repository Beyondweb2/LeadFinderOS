import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { X, Clock, Sparkles, Crown } from 'lucide-react';

export function TrialBanner() {
  const { isOnTrial, trialDaysRemaining, trialExpired, trialEndDate, isLoading: trialLoading } = useTrial();
  const { subscribed, isLoading: subLoading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  // Don't show if loading, subscribed, or dismissed
  if (trialLoading || subLoading || subscribed || dismissed) {
    return null;
  }

  // Show expired banner
  if (trialExpired) {
    return (
      <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-destructive font-medium">
              Your free trial has expired
            </span>
            <span className="text-muted-foreground hidden sm:inline">
              — Subscribe to continue using LeadFinder
            </span>
          </div>
          <Button 
            size="sm" 
            onClick={() => navigate('/subscribe')}
            className="shrink-0"
          >
            <Crown className="h-3.5 w-3.5 mr-1.5" />
            Upgrade to Pro
          </Button>
        </div>
      </div>
    );
  }

  // Show trial banner with remaining days
  if (isOnTrial) {
    return (
      <div className="bg-primary/5 border-b border-primary/10 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground/90">
              {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} left in your free trial
            </span>
            <span className="text-muted-foreground hidden md:inline">
              — Unlock unlimited searches & full CRM access
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm"
              onClick={() => navigate('/subscribe')}
              className="shrink-0"
            >
              <Crown className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Upgrade to Pro</span>
              <span className="sm:hidden">Upgrade</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
