import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Check, Loader2, ArrowLeft, Shield, Clock, CreditCard, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';

const TRIAL_FEATURES = [
  'Unlimited lead searches',
  'Full Outreach CRM & tracking',
  'WhatsApp & SMS outreach tools',
  'Export leads & message templates',
  'Build a consistent pipeline',
];

const TRUST_POINTS = [
  { icon: Shield, text: 'Secure payment via Stripe' },
  { icon: Clock, text: 'Email reminder 24h before billing' },
  { icon: CreditCard, text: 'Cancel instantly from your account' },
];

const Subscribe = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const { createCheckout, subscribed, isLoading: subLoading, status, isPaidSubscriber, isStripeTrialing, checkSubscription } = useSubscription();
  const { user, session, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Redirect paid/trialing subscribers to dashboard
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

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
        setWaitingForPayment(true);
        
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-lg">
        <Button variant="ghost" className="mb-4" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to app
        </Button>

        <Card className="bg-card/80 backdrop-blur-xl border-primary/20 overflow-hidden">
          {/* Header */}
          <CardHeader className="text-center pb-4 pt-8">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <img src={appLogo} alt="LeadFinder Pro" className="h-14 w-14" />
                <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  FREE
                </div>
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Start your 5-day free trial
            </h1>
            <div className="flex flex-col items-center gap-1 mt-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                  <Zap className="h-3.5 w-3.5" />
                  £0 today
                </span>
                <span className="text-sm text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">Full access</span>
                <span className="text-sm text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">Cancel anytime</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 px-6">
            {/* Features */}
            <div className="space-y-3">
              {TRIAL_FEATURES.map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>

            {/* Pricing clarity */}
            <div className="rounded-lg bg-muted/50 border border-border p-4 text-center space-y-1">
              <p className="text-sm font-medium">After your free trial</p>
              <p className="text-2xl font-bold">£19.99<span className="text-sm font-normal text-muted-foreground">/month</span></p>
              <p className="text-xs text-muted-foreground">No hidden fees · Cancel in one click</p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4 px-6 pb-8">
            {waitingForPayment ? (
              <div className="w-full text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="font-medium">Waiting for payment setup...</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Complete checkout in the new tab. This page will update automatically.
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
                  onClick={handleSubscribe}
                  className="w-full h-12 text-base font-semibold"
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
                      Start Free Trial — £0 Today
                    </>
                  )}
                </Button>

                {/* Trust elements */}
                <div className="w-full space-y-2 pt-2">
                  {TRUST_POINTS.map((point) => (
                    <div key={point.text} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <point.icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{point.text}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Subscribe;
