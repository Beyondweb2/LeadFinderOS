import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { readLastRoute } from '@/hooks/usePersistLastRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, CreditCard, Sparkles, Gift, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AffiliateCapture } from '@/components/AffiliateCapture';
import appLogo from '@/assets/logo.png';

const authSchema = z.object({
  email: z.string().trim().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

const Auth = () => {
  const [searchParamsInit] = useSearchParams();
  const intentParam = searchParamsInit.get('intent');
  const [isLogin, setIsLogin] = useState(!intentParam);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirectingToCheckout, setIsRedirectingToCheckout] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  const { signIn, signUp, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Determine intent from query param: "demo" or "upgrade"
  const intent = intentParam === 'upgrade' ? 'upgrade' : 'demo';

  // Helper to redirect to the unlock-access page (which handles Stripe checkout properly)
  const redirectToCheckout = () => {
    navigate('/unlock', { replace: true });
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (!user || isLoading) return;

    // If intent is upgrade, go straight to Stripe checkout
    if (intent === 'upgrade') {
      redirectToCheckout();
      return;
    }

    let redirectTo: string | null = null;
    try {
      redirectTo =
        sessionStorage.getItem('leadfinder_post_login_redirect') ||
        localStorage.getItem('leadfinder_post_login_redirect');
      if (redirectTo) {
        sessionStorage.removeItem('leadfinder_post_login_redirect');
        localStorage.removeItem('leadfinder_post_login_redirect');
      }
    } catch {
      // ignore
    }

    // Fallback to last remembered in-app route
    if (!redirectTo) {
      redirectTo = readLastRoute(user.id) || '/';
    }

    navigate(redirectTo, { replace: true });
  }, [user, isLoading, navigate, intent]);

  const validateForm = () => {
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              title: 'Login failed',
              description: 'Invalid email or password. Please try again.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Login failed',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Welcome back!',
            description: 'You have successfully logged in.',
          });
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('User already registered')) {
            toast({
              title: 'Sign up failed',
              description: 'This email is already registered. Try logging in instead.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Sign up failed',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          if (intent === 'upgrade') {
            toast({
              title: 'Account created!',
              description: 'Redirecting to checkout...',
            });
            // Small delay to let auth state settle, then checkout will trigger via useEffect
          } else {
            toast({
              title: 'Account created!',
              description: 'Redirecting to your dashboard...',
            });
            navigate('/');
          }
          return;
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Capture affiliate codes from URL */}
      <AffiliateCapture />
      {/* Free Trial Loading Modal */}
      <Dialog open={showTrialModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-primary/30 bg-card/95 backdrop-blur-xl" hideClose>
          <div className="flex flex-col items-center justify-center py-8 gap-6">
            {/* Animated ring */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative h-20 w-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Gift className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            
            {/* Text content */}
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Free Trial Loading
                <Sparkles className="h-5 w-5 text-primary" />
              </h3>
              <p className="text-muted-foreground text-sm">
                Setting up your free trial...
              </p>
            </div>
            
            {/* Benefits list */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-primary" />
                <span>Unlimited business searches</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-primary" />
                <span>Full CRM access</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-primary" />
                <span>Free trial with full access</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      
      <Card className="w-full max-w-md relative z-10 bg-card border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Lead<span className="text-gradient-primary">Finder</span> Pro
          </CardTitle>
          <CardDescription>
            {isLogin 
              ? 'Sign in to find businesses without websites' 
              : intent === 'upgrade'
                ? 'Create your account to unlock full access'
                : 'Create an account to try your first search free'}
          </CardDescription>
          {!isLogin && (
            <p className="text-xs text-muted-foreground mt-2">
              {intent === 'upgrade' 
                ? '£0 today · Cancel anytime'
                : 'No card required. See real results instantly.'}
            </p>
          )}
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className={errors.password ? 'border-destructive' : ''}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </Button>
            
            <p className="text-sm text-muted-foreground text-center">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrors({});
                }}
                className="text-primary hover:underline font-medium"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Auth;
