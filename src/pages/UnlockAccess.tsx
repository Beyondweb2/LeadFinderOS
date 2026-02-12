import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Check, Loader2, ArrowRight, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';

const BENEFITS = [
  'Unlimited searches',
  'Full outreach tracking',
  'WhatsApp & SMS messaging',
  'CRM pipeline management',
];

const UnlockAccess = () => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const { createCheckout } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Redirect if not authenticated
  if (!authLoading && !user) {
    navigate('/auth', { replace: true });
    return null;
  }

  const handleContinueToCheckout = async () => {
    setIsLoading(true);
    try {
      await createCheckout();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start checkout',
        variant: 'destructive',
      });
      setIsLoading(false);
      setShowConfirmModal(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{ background: 'var(--gradient-glow)' }}
      />

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md border-primary/30 bg-card/95 backdrop-blur-xl">
          <div className="flex flex-col items-center py-6 gap-5 text-center">
            <Shield className="h-10 w-10 text-primary" />
            <div className="space-y-2">
              <h3 className="text-lg font-bold">You're starting a 24-hour full access trial.</h3>
              <p className="text-sm text-muted-foreground">
                You will only be charged after the trial ends.
                <br />
                Cancel anytime before renewal.
              </p>
            </div>
            <Button
              className="w-full btn-premium font-semibold py-3 h-auto"
              onClick={handleContinueToCheckout}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  Continue to Secure Checkout
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground/50">
              Secure payment via Stripe · 256-bit encryption
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative z-10 w-full max-w-md">
        <Card className="bg-card/80 backdrop-blur-xl border-primary/20">
          <CardHeader className="text-center pb-3">
            <div className="flex justify-center mb-4">
              <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
            </div>
            <CardTitle className="text-2xl font-bold">
              Unlock Full Access
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              You've seen the demo. Now unlock everything for 24 hours.
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            <ul className="space-y-3">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center h-5 w-5 rounded-full shrink-0"
                    style={{
                      background: 'hsl(var(--primary) / 0.15)',
                    }}
                  >
                    <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-foreground/90">{benefit}</span>
                </li>
              ))}
            </ul>
          </CardContent>

          <CardFooter className="flex-col gap-3 pt-2 pb-6">
            <Button
              size="lg"
              className="w-full btn-premium font-semibold py-3 h-auto text-sm sm:text-base"
              onClick={() => setShowConfirmModal(true)}
            >
              Start 24-Hour Full Access
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Card required · Cancel anytime · Secure payment via Stripe
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default UnlockAccess;
