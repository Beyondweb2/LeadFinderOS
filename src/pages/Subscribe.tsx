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
  'Find qualified business leads',
  'Message business owners instantly',
  'Organise and track every lead',
  'Close more deals',
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
          Go to app
        </Button>

        <div className="bg-[hsl(220_50%_5%)] border border-border/40 rounded-2xl overflow-hidden px-6 py-7 sm:px-8 sm:py-8 space-y-6 shadow-[0_8px_32px_hsl(220_50%_3%/0.5)]">
          {/* Green pill */}
          <div className="flex justify-center">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-0.5 text-[11px] font-semibold tracking-widest uppercase text-emerald-400 shadow-[0_0_12px_hsl(142_76%_45%/0.15)]">
              Free Trial
            </span>
          </div>

          {/* Brand header */}
          <div className="relative flex items-center justify-center">
            <img src={logoIcon} alt="" className="absolute left-1/2 -translate-x-[calc(50%+6.5rem)] h-8 w-8" />
            <p className="text-2xl font-bold tracking-tight">
              Lead<span className="text-primary">Finder</span> Pro
            </p>
          </div>

          {/* Description */}
          <p className="text-center text-sm text-muted-foreground">
            Everything you need to find and close your next client.
          </p>

          {/* Benefits */}
          <div className="pt-2">
            <div className="border-t border-border/20 pt-5">
              <div className="space-y-4.5 pl-1" style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
                {TRIAL_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="flex-shrink-0 h-[26px] w-[26px] rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={3} />
                    </div>
                    <span className="text-sm font-medium">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pricing — no box */}
          <div className="text-center space-y-0.5 pt-2">
            <p className="text-2xl font-bold">£0 <span className="text-sm font-normal text-muted-foreground">today</span></p>
            <p className="text-xs text-muted-foreground">Cancel anytime from your account</p>
            <p className="text-xs text-muted-foreground">After 5 days · £19.99/month</p>
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
            <div className="space-y-3">
              <Button
                onClick={handleSubscribe}
                className="btn-premium w-full h-[52px] text-base font-bold text-primary-foreground shadow-[0_4px_20px_hsl(210_100%_50%/0.3)] hover:shadow-[0_6px_24px_hsl(210_100%_50%/0.4)] hover:-translate-y-0.5 transition-all"
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Start Free Trial — £0 Today →'
                )}
              </Button>

              {/* Micro trust — single line */}
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
