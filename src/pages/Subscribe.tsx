import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Loader2, CreditCard, ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
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
  const { user, isLoading: authLoading, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [authLoading, user, navigate]);
  
  // Only block rendering while auth is loading
  const eligibilityLoading = authLoading;
  // Only hide trial offer if user is already on a Stripe trial
  const hideTrialOffer = isStripeTrialing || status === 'trialing';

  // Debug log for verification
  useEffect(() => {
    if (!eligibilityLoading && user?.id) {
      console.log('[Subscribe] eligibility resolved', {
        userId: user.id,
        trialUsed,
        branch: hideTrialOffer ? 'no_trial' : 'trial',
      });
    }
  }, [eligibilityLoading, user?.id, trialUsed, hideTrialOffer]);

   const handleBackToLogin = useCallback(async () => {
     await signOut();
     navigate('/auth');
   }, [signOut, navigate]);

   const handleSubscribe = async () => {
     setIsLoading(true);
     try {
       await createCheckout();
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

    // Only redirect if user is a PAID subscriber (not trialing)
    if (isPaidSubscriber && !subLoading) {
      navigate('/', { replace: true });
      return null;
    }

    // Don't render anything while auth is resolving or user is not logged in
    if (authLoading || !user) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }
 
   return (
     <div className="min-h-screen bg-background flex items-center justify-center p-4">
       {/* Background glow effect */}
       <div 
         className="fixed inset-0 pointer-events-none opacity-30"
         style={{ background: 'var(--gradient-glow)' }}
       />
       
       <div className="relative z-10 w-full max-w-lg">
         <Button
           variant="ghost"
           className="mb-6"
           onClick={handleBackToLogin}
         >
           <ArrowLeft className="mr-2 h-4 w-4" />
           Back to login
         </Button>
 
          <Card className="bg-card/80 backdrop-blur-xl border-primary/20">
           <CardHeader className="text-center pb-2">
               <div className="flex justify-center mb-4">
                 <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
               </div>
                <CardTitle className="text-2xl font-bold">
                  {eligibilityLoading ? (
                    'Loading...'
                  ) : hideTrialOffer ? (
                    <>Lead<span className="text-gradient-primary">Finder</span> Pro</>
                  ) : (
                    'Unlock Full Access — Free for 24 Hours'
                  )}
               </CardTitle>
                <CardDescription className="text-base">
                  {eligibilityLoading ? '' : hideTrialOffer 
                    ? 'Unlock full access to all features'
                    : '£0 today · Cancel anytime'}
                </CardDescription>
             </CardHeader>
             
              <CardContent className="space-y-6">
                <div className="text-center">
                {eligibilityLoading ? (
                    <Skeleton className="h-10 w-40 mx-auto mb-3" />
                  ) : !hideTrialOffer ? (
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
                 disabled={isLoading || eligibilityLoading}
               >
                 {isLoading ? (
                   <>
                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                     {hideTrialOffer ? 'Starting checkout...' : 'Starting...'}
                   </>
                 ) : eligibilityLoading ? (
                   <>
                     <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                     Loading…
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