import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Check, Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import logoIcon from '@/assets/leadfinder-logo-icon.png';

const TRIAL_FEATURES = [
  'Unlimited lead searches',
  'Add leads to your pipeline in one click',
  'Message instantly via WhatsApp or SMS',
  'Track every contact and follow-up',
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
    navigate('/landing');
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, hsl(220 50% 8%) 0%, hsl(220 50% 4%) 100%)' }}>
      <div className="relative z-10 w-full max-w-md">
        <Button variant="ghost" className="mb-4" onClick={handleBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <div className="bg-[hsl(220_50%_6%)] border border-border/30 rounded-3xl overflow-hidden px-7 py-9 sm:px-9 sm:py-10 space-y-7 shadow-[0_16px_60px_hsl(0_0%_0%/0.5),0_4px_20px_hsl(0_0%_0%/0.3)]">
          {/* Green pill */}
          <div className="flex justify-center">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-0.5 text-[11px] font-semibold tracking-widest uppercase text-emerald-400 shadow-[0_0_12px_hsl(142_76%_45%/0.12)]">
              Free Trial
            </span>
          </div>

          {/* Brand header */}
          <div className="flex items-center justify-center gap-2.5">
            <img src={logoIcon} alt="" className="h-7 w-7" />
            <p className="text-xl font-bold tracking-tight">
              Lead<span className="text-primary">Finder</span> Pro
            </p>
          </div>

          {/* Description */}
          <p className="text-center text-sm text-muted-foreground">
            Everything you need to find and close your next client.
          </p>

          {/* Price hero */}
          <div className="text-center space-y-1.5">
            <p className="text-4xl font-extrabold tracking-tight">£0 Today</p>
            <p className="text-sm text-muted-foreground">5 Day Free Trial · Cancel anytime</p>
          </div>

          {/* Divider */}
          <div className="border-t border-border/20" />

          {/* Benefits */}
          <div className="space-y-3">
            {TRIAL_FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="flex-shrink-0 h-5 w-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <Check className="h-3 w-3 text-emerald-400" />
                </div>
                <span className="text-sm leading-relaxed">{feature}</span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-border/20" />

          {/* Recurring price — subdued */}
          <p className="text-center text-xs text-muted-foreground">
            £19.99/month after trial
          </p>

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
            <div className="space-y-3.5">
              <Button
                onClick={handleSubscribe}
                className="btn-premium w-full h-13 text-base font-bold text-primary-foreground shadow-[0_4px_20px_hsl(210_100%_50%/0.3)] hover:shadow-[0_6px_28px_hsl(210_100%_50%/0.4)] hover:-translate-y-0.5 transition-all"
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

              <p className="text-center text-[11px] text-muted-foreground">
                Secure payment via Stripe · Reminder before billing
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Subscribe;
