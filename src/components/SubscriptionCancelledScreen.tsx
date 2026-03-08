import { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle, CreditCard, Loader2, ArrowLeft } from 'lucide-react';

export function SubscriptionCancelledScreen() {
  const { createCheckout, isLoading } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleResubscribe = async () => {
    setCheckoutLoading(true);
    try {
      await createCheckout();
    } catch {
      setCheckoutLoading(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full border-border">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <XCircle className="h-7 w-7 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-xl">Your subscription has ended</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Resubscribe to continue using LeadFinder.
          </p>
          <Button onClick={handleResubscribe} disabled={checkoutLoading} className="w-full" size="lg">
            {checkoutLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Resubscribe
              </>
            )}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => { window.location.href = '/landing'; }}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
