import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Loader2, CreditCard, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';

const FEATURES = [
  'Unlimited lead searches',
  'Full CRM & tracking',
  'WhatsApp & SMS outreach',
  'Export & templates',
];

const Subscribe = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { createCheckout, subscribed, isLoading: subLoading, status, isPaidSubscriber } = useSubscription();
  const { isOnTrial, isStripeTrialing, trialUsed, isLoading: trialLoading } = useTrial();
  const { user, session, isLoading: authLoading, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Show trial by default, only hide if actively trialing on Stripe
  const hideTrialOffer = isStripeTrialing || status === 'trialing';

  // Redirect paid subscribers away
  useEffect(() => {
    if (isPaidSubscriber && !subLoading) {
      navigate('/', { replace: true });
    }
  }, [isPaidSubscriber, subLoading, navigate]);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      // Call createCheckout but handle the redirect ourselves via window.open
      // to work around iframe restrictions in preview
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
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

  // Only show spinner while auth is resolving
  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{ background: 'var(--gradient-glow)' }}
      />

      <div className="relative z-10 w-full max-w-lg">
        <Button variant="ghost" className="mb-6" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to app
        </Button>

        <Card className="bg-card/80 backdrop-blur-xl border-primary/20">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
            </div>
            <CardTitle className="text-2xl font-bold">
              {hideTrialOffer ? (
                <>Lead<span className="text-gradient-primary">Finder</span> Pro</>
              ) : (
                'Unlock Full Access — Free for 24 Hours'
              )}
            </CardTitle>
            <CardDescription className="text-base">
              {hideTrialOffer
                ? 'Unlock full access to all features'
                : '£0 today · Cancel anytime'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center">
              {!hideTrialOffer ? (
                <div className="space-y-1">
                  <div className="text-4xl font-bold text-primary">£0 today</div>
                  <div className="text-sm text-muted-foreground">
                    £19.99/month after 24 hours
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-4xl font-bold">£19.99</span>
                  <span className="text-muted-foreground">/month</span>
                  <p className="text-sm text-muted-foreground mt-2">
                    £19.99/month. Cancel anytime.
                  </p>
                </div>
              )}
            </div>

            <ul className="space-y-3">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button
              onClick={handleSubscribe}
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {hideTrialOffer ? 'Subscribe Now' : 'Unlock My 24-Hour Access'}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Secure payment via Stripe · Cancel anytime
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Subscribe;