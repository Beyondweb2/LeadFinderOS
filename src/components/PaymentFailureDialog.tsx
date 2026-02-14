import { useState, useEffect } from 'react';
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
import { AlertTriangle, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISSED_KEY = 'payment_failure_warning_dismissed';

export function PaymentFailureDialog() {
  const { paymentFailureCount, lastPaymentFailedAt, isPaymentPaused, openCustomerPortal, isLoading } = useSubscription();
  const [open, setOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    // Show for first failure only (not paused — paused users get the full block screen)
    if (paymentFailureCount === 1 && !isPaymentPaused) {
      // Check if already dismissed this session
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
      // Portal opens in same window, so this won't execute on success
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
          <AlertDialogDescription className="space-y-3 text-sm">
            <p>
              Your most recent payment could not be processed. We'll retry automatically in <strong>24 hours</strong>.
            </p>
            <p>
              If the next attempt also fails, your account will be <strong>paused</strong> — you won't be able to search for leads or access your CRM until payment goes through.
            </p>
            <p className="text-foreground font-medium">
              Please update your card details or ensure sufficient funds to avoid interruption.
            </p>
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
