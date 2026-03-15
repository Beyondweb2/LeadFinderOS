import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Loader2, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';
import { getCheckoutAttribution } from '@/lib/checkoutAttribution';

const BENEFITS = [
  'Unlimited lead searches',
  'Full outreach & tracking',
  'WhatsApp & SMS outreach',
  'Export & templates',
];

// Preload Stripe.js as early as possible
const preloadStripe = () => {
  if (document.querySelector('script[src*="js.stripe.com"]')) return;
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = 'https://js.stripe.com';
  document.head.appendChild(link);
};

const UnlockAccess = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clickGuardRef = useRef(false);
  const { user, session, isLoading: authLoading } = useAuth();
  const { isPaidSubscriber, isStripeTrialing, isLoading: subLoading } = useSubscription();
  const { trialUsed, isLoading: trialLoading } = useTrial();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Preload Stripe on mount
  useEffect(() => { preloadStripe(); }, []);

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
      navigate('/', { replace: true });
    }
  }, [isPaidSubscriber, isStripeTrialing, subLoading, navigate]);

  // Intercept browser back button
  useEffect(() => {
    window.history.pushState({ fromUnlock: true }, '');
    const handlePopState = () => {
      navigate('/landing?welcome=demo', { replace: true });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigate]);

  const handleCheckout = useCallback(async () => {
    // Prevent double-clicks
    if (clickGuardRef.current || isLoading) return;
    clickGuardRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: getCheckoutAttribution(),
      });
      if (fnError) throw fnError;
      if (data?.url) {
        // Same-window redirect for reliability
        window.location.href = data.url;
        // Keep loading state while redirecting
        return;
      }
      throw new Error('No checkout URL received');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start checkout';
      setError(msg);
      toast({
        title: 'Checkout error',
        description: msg,
        variant: 'destructive',
      });
      setIsLoading(false);
      clickGuardRef.current = false;
    }
  }, [session?.access_token, isLoading, toast]);

  if (authLoading || !user || trialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasUsedTrial = trialUsed;
  const headlineText = hasUsedTrial
    ? 'Subscribe to Get Full Access'
    : 'Unlock Full Access — Free for 5 Days';
  const subheadText = hasUsedTrial
    ? '£19.99/month · Cancel anytime'
    : '£0 today · £19.99/month after 5 days · Cancel anytime';
  const ctaButtonText = hasUsedTrial
    ? 'Subscribe Now — £19.99/mo'
    : 'Unlock My 5-Day Free Access';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{ background: 'var(--gradient-glow)' }}
      />

      <div className="relative z-10 w-full max-w-md space-y-5">
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
            <Button
              size="lg"
              className="w-full btn-premium font-semibold py-3.5 h-auto text-[15px]"
              onClick={handleCheckout}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening checkout...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {ctaButtonText}
                </>
              )}
            </Button>
            {error && (
              <p className="text-sm text-destructive text-center">
                {error} — Please try again.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/60 text-center">
              Secure payment via Stripe · Cancel anytime
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default UnlockAccess;
