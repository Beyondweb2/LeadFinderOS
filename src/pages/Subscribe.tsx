 import { useState, useCallback } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { useSubscription } from '@/hooks/useSubscription';
 import { useAuth } from '@/hooks/useAuth';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
 import { Target, Check, Loader2, CreditCard, ArrowLeft } from 'lucide-react';
 import { useToast } from '@/hooks/use-toast';
 
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
   const { createCheckout, subscribed, isLoading: subLoading } = useSubscription();
   const { signOut } = useAuth();
   const { toast } = useToast();
   const navigate = useNavigate();
 
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
 
   // If already subscribed, redirect to home
   if (subscribed && !subLoading) {
     navigate('/', { replace: true });
     return null;
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
               <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                 <Target className="h-8 w-8 text-primary" />
               </div>
             </div>
             <CardTitle className="text-2xl font-bold">
               Lead<span className="text-gradient-primary">Finder</span> Pro
             </CardTitle>
             <CardDescription className="text-lg">
               Get full access to all features
             </CardDescription>
           </CardHeader>
           
           <CardContent className="space-y-6">
             <div className="text-center">
               <span className="text-4xl font-bold">£19.99</span>
               <span className="text-muted-foreground">/month</span>
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
               disabled={isLoading || subLoading}
             >
               {isLoading ? (
                 <>
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                   Starting checkout...
                 </>
               ) : (
                 <>
                   <CreditCard className="mr-2 h-4 w-4" />
                   Subscribe Now
                 </>
               )}
             </Button>
             <p className="text-xs text-muted-foreground text-center">
               Cancel anytime. Secure payment via Stripe.
             </p>
           </CardFooter>
         </Card>
       </div>
     </div>
   );
 };
 
 export default Subscribe;