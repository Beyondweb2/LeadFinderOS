import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Loader2, ArrowRight, CreditCard, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';

const BENEFITS = [
  'Unlimited lead searches',
  'Full CRM & tracking',
  'WhatsApp & SMS outreach',
  'Export & templates',
];

const UnlockAccess = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { user, session, isLoading: authLoading } = useAuth();
  const { isPaidSubscriber, isStripeTrialing, checkSubscription, isLoading: subLoading } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (subLoading) return;
    if (isPaidSubscriber || isStripeTrialing) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      navigate('/', { replace: true });
    }
  }, [isPaidSubscriber, isStripeTrialing, subLoading, navigate]);

  useEffect(() => {
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, []);

  const handleContinueToCheckout = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to start checkout', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || !user) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md space-y-5">
        <Link to="/landing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to app</Link>

        <Card className="bg-card/80 backdrop-blur-xl border-primary/20">
          <CardHeader className="text-center pb-3 pt-8 px-8">
            <div className="flex justify-center mb-4"><img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9" /></div>
            <CardTitle className="text-2xl font-bold tracking-tight">Unlock Unlimited Access</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">£19.99/month · Cancel anytime</p>
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
            <Button size="lg" className="w-full btn-premium font-semibold py-3.5 h-auto text-[15px]" onClick={handleContinueToCheckout} disabled={isLoading}>
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting...</> : <><CreditCard className="mr-2 h-4 w-4" />Unlock unlimited — £19.99/month</>}
            </Button>
            <p className="text-[11px] text-muted-foreground/60 text-center">Secure payment via Stripe · Cancel anytime</p>
            <Link to="/find-leads" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1">
              <Search className="h-3 w-3" /> Skip — try free searches
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default UnlockAccess;
