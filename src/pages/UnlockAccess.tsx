import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Check, Loader2, ArrowRight, Shield, CreditCard, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';

const BENEFITS = [
  'Unlimited lead searches',
  'Full outreach & tracking',
  'WhatsApp & SMS outreach',
  'Export & templates',
];

const UnlockAccess = () => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const { user, session, isLoading: authLoading } = useAuth();
  const { isPaidSubscriber, isStripeTrialing, checkSubscription, isLoading: subLoading } = useSubscription();
  const { trialUsed, isLoading: trialLoading } = useTrial();
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

  if (authLoading || !user || trialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Determine copy based on whether trial was already used
  const hasUsedTrial = trialUsed;
  const headlineText = hasUsedTrial
    ? 'Subscribe to Get Full Access'
    : 'Unlock Full Access — Free for 5 Days';
  const subheadText = hasUsedTrial
    ? '£19.99/month · Cancel anytime'
    : '£0 today · £19.99/month after 5 days · Cancel anytime';
  const confirmHeadline = hasUsedTrial
    ? 'You\'re subscribing to LeadFinder Pro.'
    : 'You\'re starting a 5-day full access trial.';
  const confirmSubtext = hasUsedTrial
    ? 'You will be charged £19.99/month. Cancel anytime.'
    : 'You will only be charged after the trial ends. Cancel anytime before renewal.';
  const ctaButtonText = hasUsedTrial
    ? 'Subscribe Now — £19.99/mo'
    : 'Unlock My 5-Day Free Access';

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
              <h3 className="text-lg font-bold">{confirmHeadline}</h3>
              <p className="text-sm text-muted-foreground">
                {confirmSubtext}
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

      <div className="relative z-10 w-full max-w-md space-y-5">
        {/* Back link — top */}
        <Link
          to="/landing"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to app
        </Link>

        <Card className="bg-card/80 backdrop-blur-xl border-primary/20">
          <CardHeader className="text-center pb-3 pt-8 px-8">
            <div className="flex justify-center mb-4">
              <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
               {headlineText}
             </CardTitle>
             <p className="text-sm text-muted-foreground mt-2">
               {subheadText}
            </p>
          </CardHeader>

          <CardContent className="px-8 pt-2 pb-4">
            {/* Benefits — centered column */}
            <ul className="space-y-3.5 max-w-[260px] mx-auto">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3">
                  <Check className="h-4 w-4 text-primary shrink-0" strokeWidth={3} />
                  <span className="text-[15px] font-medium text-foreground/90">{benefit}</span>
                </li>
              ))}
            </ul>
          </CardContent>

          <CardFooter className="flex-col gap-3 pt-4 pb-7 px-8">
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
                  className="w-full btn-premium font-semibold py-3.5 h-auto text-[15px]"
                  onClick={() => setShowConfirmModal(true)}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {ctaButtonText}
                </Button>
                <p className="text-[11px] text-muted-foreground/60 text-center">
                  Secure payment via Stripe · Cancel anytime
                </p>
              </>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default UnlockAccess;
