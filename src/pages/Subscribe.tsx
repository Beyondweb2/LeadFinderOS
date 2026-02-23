import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
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

  // Redirect paid subscribers to dashboard
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
              Unlock unlimited access
            </CardTitle>
            <CardDescription className="text-base">
              Upgrade to continue unlimited searches and keep building your pipeline.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
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
            {waitingForPayment ? (
              <div className="w-full text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="font-medium">Waiting for payment...</span>
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
                      Unlock unlimited - £19.99/month
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Cancel anytime
                </p>
              </>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Subscribe;
