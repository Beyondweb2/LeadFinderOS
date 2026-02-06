import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { X, Clock, Sparkles } from 'lucide-react';

export function TrialBanner() {
  const { isOnTrial, trialDaysRemaining, trialExpired, isLoading: trialLoading } = useTrial();
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
      <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-destructive" />
            <span className="text-destructive font-medium">
              Your trial has expired.
            </span>
            <span className="text-muted-foreground hidden sm:inline">
              Subscribe to continue using LeadFinder.
            </span>
          </div>
          <Button 
            size="sm" 
            onClick={() => navigate('/subscribe')}
            className="shrink-0"
          >
            Subscribe Now
          </Button>
        </div>
      </div>
    );
  }

  // Show trial banner
  if (isOnTrial) {
    return (
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium">
              {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} left in your trial
            </span>
            <span className="text-muted-foreground hidden sm:inline">
              • Upgrade anytime for full access
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => navigate('/subscribe')}
              className="shrink-0"
            >
              Upgrade
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setDismissed(true)}
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
