import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Check, Loader2, ArrowLeft, Shield, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const TRIAL_FEATURES = [
  'Unlimited lead searches',
  'Keep your outreach organised',
  'Turn outreach into real clients',
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
      <div className="relative z-10 w-full max-w-md">
        <Button variant="ghost" className="mb-4" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to app
        </Button>

        <div className="bg-[hsl(220_50%_5%)] border border-border/40 rounded-xl overflow-hidden p-6 sm:p-8 space-y-6">
          {/* Brand header */}
          <div className="text-center">
            <p className="text-sm font-semibold tracking-wide">
              Lead<span className="text-primary">Finder</span> Pro
            </p>
          </div>

          {/* Headline */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Start your 5-day free trial
            </h1>
            <p className="text-sm text-muted-foreground">
              £0 today · Full access · Cancel anytime
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-3">
            {TRIAL_FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="flex-shrink-0 h-5 w-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-400" />
                </div>
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>

          {/* Pricing */}
          <div className="rounded-lg bg-muted/50 border border-border/40 p-4 text-center space-y-1">
            <p className="text-sm text-muted-foreground">After 5 days</p>
            <p className="text-2xl font-bold">£19.99<span className="text-sm font-normal text-muted-foreground">/month</span></p>
            <p className="text-xs text-muted-foreground">Cancel anytime from your account</p>
          </div>

          {/* CTA / Waiting */}
          {waitingForPayment ? (
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center gap-2 text-primary">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="font-medium text-sm">Waiting for payment setup...</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Complete checkout in the new tab. This page updates automatically.
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
            <div className="space-y-4">
              <Button
                onClick={handleSubscribe}
                className="btn-premium w-full h-12 text-base font-bold text-primary-foreground"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Start Free Trial — £0 Today'
                )}
              </Button>

              {/* Micro trust */}
              <div className="flex flex-col items-center gap-1.5 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" />
                  <span>Secure payment via Stripe</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Reminder before billing</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Subscribe;
