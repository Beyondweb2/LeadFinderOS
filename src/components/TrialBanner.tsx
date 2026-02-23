import { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { Button } from '@/components/ui/button';
import { X, Sparkles, Crown, CreditCard, Search } from 'lucide-react';
import { CheckoutConfirmDialog } from '@/components/CheckoutConfirmDialog';

export function TrialBanner() {
  const { subscribed, isLoading, status, subscriptionEnd, openCustomerPortal, createCheckout } = useSubscription();
  const { isOnTrial, searchesRemaining, dailyLimit, isStripeTrialing, demoSearchUsed } = useTrial();
  const [dismissed, setDismissed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

  const handleCheckout = async () => {
    setIsCheckoutLoading(true);
    try { await createCheckout(); } catch { setIsCheckoutLoading(false); }
  };

  if (isLoading || dismissed) return null;

  const isTrialing = status === 'trialing';

  // Don't show for active subscribers (not trialing)
  if (subscribed && !isTrialing) return null;

  // Show banner for Stripe trialing users
  if (isTrialing) {
    return (
      <div className="bg-primary/5 border-b border-primary/10 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <CreditCard className="h-4 w-4 text-primary shrink-0" />
             <span className="font-medium text-foreground/90 whitespace-nowrap">
               Full access active
             </span>
            <span className="text-muted-foreground hidden sm:inline truncate">
               - £19.99/mo, cancel anytime
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

  // Show banner for free users
  if (!subscribed && !isStripeTrialing) {
    return (
      <>
        <div className="bg-muted/50 border-b border-border px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm min-w-0">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground/90 whitespace-nowrap">
                Free access
              </span>
              <span className="text-muted-foreground hidden sm:inline truncate">
                - Unlock unlimited searches
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button 
                size="sm"
                onClick={() => setShowConfirm(true)}
              >
                <Crown className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden sm:inline">Unlock unlimited</span>
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
        <CheckoutConfirmDialog
          open={showConfirm}
          onOpenChange={setShowConfirm}
          onConfirm={handleCheckout}
          isLoading={isCheckoutLoading}
        />
      </>
    );
  }

  return null;
}
