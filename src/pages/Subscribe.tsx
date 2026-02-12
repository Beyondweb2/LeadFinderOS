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
   'Find businesses without websites',
   'Full CRM access',
   'Contact tracking & notes',
   'Email & call templates',
   'Export leads to outreach',
   'Priority support',
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
  
  // Eligibility is only resolved once trial data has loaded
  const eligibilityLoading = authLoading || trialLoading || subLoading;
  // User should NOT see trial messaging if they've already used a trial
  // Only hide trial offer while loading or if user is already on a Stripe trial
  const hideTrialOffer = eligibilityLoading || isStripeTrialing || status === 'trialing';

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
                 Lead<span className="text-gradient-primary">Finder</span> Pro
              </CardTitle>
               <CardDescription className="text-lg">
                 {eligibilityLoading ? 'Loading...' : hideTrialOffer 
                   ? 'Unlock full access to all features'
                   : 'Try everything free for 24 hours'}
               </CardDescription>
            </CardHeader>
            
             <CardContent className="space-y-6">
               <div className="text-center">
               {eligibilityLoading ? (
                   <Skeleton className="h-5 w-32 mx-auto mb-3" />
                 ) : !hideTrialOffer ? (
                   <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-3">
                     Free 24-Hour Full Access
                   </div>
                 ) : null}
                 <div>
                   <span className="text-4xl font-bold">£19.99</span>
                   <span className="text-muted-foreground">/month</span>
                 </div>
                 {eligibilityLoading ? (
                   <Skeleton className="h-4 w-48 mx-auto mt-2" />
                 ) : (
                    <p className="text-sm text-muted-foreground mt-2">
                      {hideTrialOffer 
                        ? '£19.99/month. Cancel anytime.'
                        : '£0 today · Full access for 24 hours · Then £19.99/month · Cancel anytime'
                      }
                    </p>
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
                    {hideTrialOffer ? 'Subscribe Now' : 'Start 24-Hour Full Access'}
                  </>
                )}
              </Button>
               <p className="text-xs text-muted-foreground text-center">
                 {hideTrialOffer 
                   ? 'Secure payment via Stripe. Cancel anytime.'
                   : 'Card required. Cancel anytime before renewal. Secure payment via Stripe.'
                 }
               </p>
            </CardFooter>
         </Card>
       </div>
     </div>
   );
 };
 
 export default Subscribe;