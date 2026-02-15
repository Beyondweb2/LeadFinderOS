import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Check, Loader2, ArrowRight, Shield, CreditCard, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';

const BENEFITS = [
  'Unlimited lead searches',
  'Full CRM & tracking',
  'WhatsApp & SMS outreach',
  'Export & templates',
];

const UnlockAccess = () => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const { user, session, isLoading: authLoading } = useAuth();
  const { isPaidSubscriber, isStripeTrialing, checkSubscription, isLoading: subLoading } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Redirect paid/trialing users to dashboard
  useEffect(() => {
    if (subLoading) return;
    if (isPaidSubscriber || isStripeTrialing) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      navigate('/', { replace: true });
    }
  }, [isPaidSubscriber, isStripeTrialing, subLoading, navigate]);

  // Intercept browser back button — redirect to landing with demo welcome popup
  useEffect(() => {
    window.history.pushState({ fromUnlock: true }, '');

    const handlePopState = () => {
      navigate('/landing?welcome=demo', { replace: true });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const handleContinueToCheckout = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (error) throw error;
      if (data?.url) {
        // Try new tab first, fall back to same-window redirect
        const opened = window.open(data.url, '_blank');
        if (!opened) {
          // Popup was blocked — redirect in same window
          window.location.href = data.url;
          return;
        }
        setWaitingForPayment(true);
        setShowConfirmModal(false);
        
        // Start polling for subscription activation
        pollRef.current = setInterval(async () => {
          try {
            await checkSubscription(true);
          } catch {
            // ignore polling errors
          }
        }, 3000);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start checkout',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || !user) {
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
          <DialogTitle className="sr-only">Confirm trial</DialogTitle>
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

      <div className="relative z-10 w-full max-w-sm space-y-4">
        <Card className="bg-card/80 backdrop-blur-xl border-primary/20">
          <CardHeader className="text-center pb-2 pt-5 px-6">
            <div className="flex justify-center mb-3">
              <img src={appLogo} alt="LeadFinder Pro" className="h-10 w-10" />
            </div>
            <CardTitle className="text-xl font-bold">
              Unlock Full Access — Free for 24 Hours
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4 px-6 pt-2 pb-2">
            {/* Pricing block */}
            <div className="text-center space-y-0.5">
              <p className="text-3xl font-extrabold text-primary">£0 today</p>
              <p className="text-sm text-muted-foreground">£19.99/month after 24 hours · Cancel anytime</p>
            </div>

            {/* Benefits */}
            <ul className="space-y-2 pt-1">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2.5">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" strokeWidth={3} />
                  <span className="text-sm text-foreground/90">{benefit}</span>
                </li>
              ))}
            </ul>
          </CardContent>

          <CardFooter className="flex-col gap-2 pt-3 pb-5 px-6">
            {waitingForPayment ? (
              <div className="w-full text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="font-medium">Completing checkout...</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Finish in the new tab. This page will update automatically.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setWaitingForPayment(false);
                    if (pollRef.current) {
                      clearInterval(pollRef.current);
                      pollRef.current = null;
                    }
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <Button
                  size="lg"
                  className="w-full btn-premium font-semibold py-3 h-auto text-sm sm:text-base"
                  onClick={() => setShowConfirmModal(true)}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Unlock My 24-Hour Access
                </Button>
                <p className="text-[10px] text-muted-foreground/50 text-center">
                  Secure payment via Stripe · Cancel anytime
                </p>
                <Link
                  to="/find-leads"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
                >
                  <Search className="h-3 w-3" />
                  Skip — try 1 free search, no card required
                </Link>
              </>
            )}
          </CardFooter>
        </Card>

        <div className="text-center">
          <Link
            to="/landing"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
};

export default UnlockAccess;
