import { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { Button } from '@/components/ui/button';
import { X, Clock, Sparkles, Crown, CreditCard, Search } from 'lucide-react';

export function TrialBanner() {
  const { subscribed, isLoading, status, subscriptionEnd, openCustomerPortal } = useSubscription();
  const { isOnTrial, searchesRemaining, dailyLimit, isStripeTrialing } = useTrial();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if loading or dismissed
  if (isLoading || dismissed) {
    return null;
  }

  // Calculate days until charge for trialing users
  const getDaysUntilCharge = () => {
    if (!subscriptionEnd) return 0;
    const endDate = new Date(subscriptionEnd);
    const now = new Date();
    const msRemaining = endDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
  };

  const isTrialing = status === 'trialing';
  const daysUntilCharge = isTrialing ? getDaysUntilCharge() : 0;

  // Don't show for active subscribers (not trialing)
  if (subscribed && !isTrialing) {
    return null;
  }

  // Show banner for Stripe trialing users (card already on file, unlimited access)
  if (isTrialing) {
    return (
      <div className="bg-primary/5 border-b border-primary/10 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <CreditCard className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground/90 whitespace-nowrap">
              {daysUntilCharge} day{daysUntilCharge !== 1 ? 's' : ''} until first charge
            </span>
            <span className="text-muted-foreground hidden sm:inline truncate">
              — Enjoying full Pro access with unlimited searches
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button 
              size="sm"
              variant="outline"
              onClick={() => openCustomerPortal()}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Manage Subscription</span>
              <span className="sm:hidden">Manage</span>
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

  // Show banner for free trial users (no card, limited access)
  if (isOnTrial && !isStripeTrialing) {
    return (
      <div className="bg-muted/50 border-b border-border px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground/90 whitespace-nowrap">
              {searchesRemaining} of {dailyLimit} daily search{dailyLimit !== 1 ? 'es' : ''} remaining
            </span>
            <span className="text-muted-foreground hidden sm:inline truncate">
              — Start free trial for unlimited
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button 
              size="sm"
              onClick={() => window.location.href = '/subscribe'}
            >
              <Crown className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Start Free Trial</span>
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

  // Show expired/no subscription banner
  if (!subscribed) {
    return (
      <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-destructive font-medium">
              No active subscription
            </span>
            <span className="text-muted-foreground hidden sm:inline">
              — Subscribe to access LeadFinder
            </span>
          </div>
          <Button 
            size="sm" 
            onClick={() => window.location.href = '/subscribe'}
            className="shrink-0"
          >
            <Crown className="h-3.5 w-3.5 mr-1.5" />
            Subscribe Now
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
