import { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CreditCard, Loader2 } from 'lucide-react';

export function PaymentPausedScreen() {
  const { openCustomerPortal, isLoading, status: subStatus } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);

  const handleUpdateCard = async () => {
    setPortalLoading(true);
    try {
      await openCustomerPortal();
    } catch {
      setPortalLoading(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full border-destructive/30 bg-destructive/5">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-xl">Your Access is Paused</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Your subscription payment failed. Please update your payment method to continue using LeadFinder.
          </p>
          <Button onClick={handleUpdateCard} disabled={portalLoading} className="w-full" size="lg">
            {portalLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Update Payment Method
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            You'll be redirected to our secure payment portal to update your card.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
