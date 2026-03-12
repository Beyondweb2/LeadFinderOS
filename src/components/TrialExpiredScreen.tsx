import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, CreditCard, Loader2, ArrowRight } from 'lucide-react';

export function TrialExpiredScreen() {
  const { createCheckout, isLoading } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const navigate = useNavigate();

  const handleUpgrade = async () => {
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
              <Clock className="h-7 w-7 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-xl">Your trial has ended</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Upgrade to continue finding leads and managing outreach.
          </p>
          <Button onClick={handleUpgrade} disabled={checkoutLoading} className="w-full" size="lg">
            {checkoutLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Upgrade Now
              </>
            )}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/landing#pricing')}>
            <ArrowRight className="mr-2 h-4 w-4" />
            View Pricing
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
