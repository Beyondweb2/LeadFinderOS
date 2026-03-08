import { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CreditCard, X, Loader2 } from 'lucide-react';

export function PaymentWarningBanner() {
  const { isInGracePeriod, isGracePeriodExpired, firstPaymentFailedAt, openCustomerPortal, isLoading } = useSubscription();
  const [dismissed, setDismissed] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  if (isLoading || (!isInGracePeriod && !isGracePeriodExpired)) return null;
  if (dismissed && !isGracePeriodExpired) return null; // Can dismiss during grace, not after

  const handleUpdateCard = async () => {
    setPortalLoading(true);
    try {
      await openCustomerPortal();
    } catch {
      setPortalLoading(false);
    }
  };

  // Calculate days remaining in grace period
  let daysRemaining = 7;
  if (firstPaymentFailedAt) {
    const elapsed = Date.now() - new Date(firstPaymentFailedAt).getTime();
    daysRemaining = Math.max(0, Math.ceil((7 * 24 * 60 * 60 * 1000 - elapsed) / (24 * 60 * 60 * 1000)));
  }

  if (isGracePeriodExpired) {
    return (
      <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-destructive">Subscription payment required</span>
              <span className="text-muted-foreground ml-2 hidden sm:inline">
                Your subscription payment couldn't be processed. Update your payment method to restore full access.
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleUpdateCard}
            disabled={portalLoading}
            className="shrink-0"
          >
            {portalLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            )}
            Update payment method
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="min-w-0">
            <span className="font-medium text-foreground">Payment issue detected</span>
            <span className="text-muted-foreground ml-2 hidden sm:inline">
              We couldn't process your subscription payment. Please update your card to avoid losing access.
              {daysRemaining > 0 && ` (${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining)`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleUpdateCard}
            disabled={portalLoading}
          >
            {portalLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            )}
            <span className="hidden sm:inline">Update payment method</span>
            <span className="sm:hidden">Update card</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss warning"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
