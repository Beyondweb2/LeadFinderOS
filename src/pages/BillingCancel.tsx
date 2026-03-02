import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowLeft, CreditCard, Loader2 } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import appLogo from '@/assets/logo.png';

const BillingCancel = () => {
  const navigate = useNavigate();
  const { createCheckout } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);

  const handleTryAgain = async () => {
    setIsLoading(true);
    try {
      await createCheckout();
    } catch {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      
      <Card className="relative z-10 w-full max-w-md bg-card border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Lead<span className="text-gradient-primary">Finder</span> Pro
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <XCircle className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Checkout Cancelled</h2>
            <p className="text-muted-foreground mb-6">
              No worries! Your card was not charged. You can try again whenever you're ready.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={handleTryAgain} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Try Again
                  </>
                )}
              </Button>
              <Button variant="ghost" onClick={() => { window.location.href = '/landing'; }}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go Back
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingCancel;
