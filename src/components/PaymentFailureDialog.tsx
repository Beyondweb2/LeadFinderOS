import { useState, useEffect, useMemo } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, CreditCard, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISSED_KEY = 'payment_failure_warning_dismissed';

function formatNextRetry(lastFailedAt: string | null): string {
  if (!lastFailedAt) return 'within 24 hours';
  const failed = new Date(lastFailedAt);
  const retry = new Date(failed.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  
  if (retry <= now) return 'very soon';
  
  const hoursLeft = Math.ceil((retry.getTime() - now.getTime()) / (1000 * 60 * 60));
  if (hoursLeft <= 1) return 'within the next hour';
  if (hoursLeft <= 24) return `in approximately ${hoursLeft} hours`;
  return retry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function PaymentFailureDialog() {
  const { paymentFailureCount, lastPaymentFailedAt, isPaymentPaused, openCustomerPortal, isLoading } = useSubscription();
  const [open, setOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const nextRetryText = useMemo(() => formatNextRetry(lastPaymentFailedAt), [lastPaymentFailedAt]);

  useEffect(() => {
    if (isLoading) return;

    // Show for first failure only (not paused — paused users get the full block screen)
    if (paymentFailureCount >= 1 && !isPaymentPaused) {
      const dismissed = sessionStorage.getItem(DISMISSED_KEY);
      if (!dismissed) {
        setOpen(true);
      }
    }
  }, [paymentFailureCount, isPaymentPaused, isLoading]);

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setOpen(false);
  };

  const handleUpdateCard = async () => {
    setPortalLoading(true);
    try {
      await openCustomerPortal();
    } catch {
      setPortalLoading(false);
    }
  };

  if (paymentFailureCount < 1 || isPaymentPaused) return null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && handleDismiss()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-lg">Payment Failed</AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Your most recent payment could not be processed.
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-muted/80 border border-border p-3">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-foreground font-medium text-xs">
                  Next retry: <span className="text-primary">{nextRetryText}</span>
                </p>
              </div>
              <p>
                If the next attempt also fails, your account will be <strong>restricted</strong> — you won't be able to search for leads or access your CRM until payment goes through.
              </p>
              <p className="text-foreground font-medium">
                Please update your card details or ensure sufficient funds before then.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogAction asChild>
            <Button variant="outline" onClick={handleDismiss}>
              I'll do it later
            </Button>
          </AlertDialogAction>
          <Button onClick={handleUpdateCard} disabled={portalLoading}>
            <CreditCard className="mr-2 h-4 w-4" />
            {portalLoading ? 'Opening...' : 'Update Card Details'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
