import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { readLastRoute } from '@/hooks/usePersistLastRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AffiliateCapture } from '@/components/AffiliateCapture';
import { LanguageSelector } from '@/components/LanguageSelector';
import { type SupportedLanguage } from '@/hooks/useLanguage';
import { LANG_STORAGE_KEY } from '@/i18n';
import appLogo from '@/assets/logo.png';
import { trackCompleteRegistration } from '@/lib/fbPixel';

const Auth = () => {
  const { t } = useTranslation();
  const [searchParamsInit] = useSearchParams();
  const intentParam = searchParamsInit.get('intent');
  const emailParam = searchParamsInit.get('email');
  const existingParam = searchParamsInit.get('existing');
  const [isLogin, setIsLogin] = useState(!intentParam || existingParam === 'true');
  const [email, setEmail] = useState(emailParam || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(() => {
    try {
      return (localStorage.getItem(LANG_STORAGE_KEY) as SupportedLanguage) || 'en';
    } catch { return 'en'; }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirectingToCheckout, setIsRedirectingToCheckout] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  
  const { signIn, signUp, user, session, isLoading } = useAuth();
  const { isPaidSubscriber, isStripeTrialing, isLoading: subLoading, createCheckout } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already authenticated
  useEffect(() => {
    if (!user || isLoading || subLoading) return;

    // If already subscribed, go to dashboard
    if (isPaidSubscriber || isStripeTrialing) {
      let redirectTo: string | null = null;
      try {
        redirectTo =
          sessionStorage.getItem('leadfinder_post_login_redirect') ||
          localStorage.getItem('leadfinder_post_login_redirect');
        if (redirectTo) {
          sessionStorage.removeItem('leadfinder_post_login_redirect');
          localStorage.removeItem('leadfinder_post_login_redirect');
        }
      } catch {}
      navigate(redirectTo || readLastRoute(user.id) || '/', { replace: true });
      return;
    }

    // If logged in but no subscription and came with intent=upgrade, redirect to checkout
    if (intentParam === 'upgrade' && !isRedirectingToCheckout) {
      setIsRedirectingToCheckout(true);
      (async () => {
        try {
          await createCheckout();
        } catch {
          navigate('/landing', { replace: true });
        }
      })();
    }
  }, [user, isLoading, subLoading, isPaidSubscriber, isStripeTrialing, navigate, intentParam, isRedirectingToCheckout, createCheckout]);

  const validateForm = () => {
    const newErrors: typeof errors = {};
    
    const emailResult = z.string().trim().email({ message: t('auth.validEmail') }).safeParse(email);
    if (!emailResult.success) newErrors.email = emailResult.error.errors[0].message;
    
    if (password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    
    if (!isLogin && password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            title: t('auth.loginFailed'),
            description: error.message.includes('Invalid login credentials')
              ? t('auth.invalidCredentials')
              : error.message,
            variant: 'destructive',
          });
        }
        // After login, useEffect handles redirect
      } else {
        // Signup flow
        try { localStorage.setItem(LANG_STORAGE_KEY, selectedLanguage); } catch {}

        const { error } = await signUp(email, password);
        if (error) {
          toast({
            title: t('auth.signUpFailed'),
            description: error.message.includes('User already registered')
              ? t('auth.emailAlreadyRegistered')
              : error.message,
            variant: 'destructive',
          });
          return;
        }

        trackCompleteRegistration();

        // Set language and mark setup completed (password already set)
        try {
          await supabase.functions.invoke('ensure-trial', {
            body: { action: 'set_language', language: selectedLanguage },
          });
        } catch {}
        try {
          await supabase.functions.invoke('ensure-trial', {
            body: { action: 'complete_setup' },
          });
        } catch {}

        toast({
          title: t('auth.accountCreated'),
          description: 'Redirecting to start your free trial...',
        });

        // Redirect to Stripe checkout immediately
        setIsRedirectingToCheckout(true);
        try {
          await createCheckout();
        } catch {
          navigate('/landing', { replace: true });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // When language changes on the form, also update i18n immediately
  const handleLanguageChange = (lang: SupportedLanguage) => {
    setSelectedLanguage(lang);
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {}
    import('@/i18n').then(({ default: i18n }) => {
      i18n.changeLanguage(lang);
    });
  };

  if (isLoading || isRedirectingToCheckout) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {isRedirectingToCheckout && (
          <p className="text-sm text-muted-foreground">Redirecting to checkout...</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <AffiliateCapture />

      <Card className="w-full max-w-md relative z-10 bg-card border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Lead<span className="text-gradient-primary">Finder</span> Pro
          </CardTitle>
          <CardDescription>
            {existingParam === 'true'
              ? 'You already have Pro — sign in to continue.'
              : isLogin 
                ? t('auth.signInToFind')
                : 'Create your account to start your free trial'}
          </CardDescription>
          {!isLogin && !existingParam && (
            <p className="text-xs text-muted-foreground mt-2">
              5-day free trial · £0 today · Cancel anytime
            </p>
          )}
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting || (existingParam === 'true' && !!emailParam)}
                className={`${errors.email ? 'border-destructive' : ''} ${existingParam === 'true' && emailParam ? 'bg-muted cursor-not-allowed' : ''}`}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className={errors.password ? 'border-destructive' : ''}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            {/* Confirm password - signup only */}
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting}
                  className={errors.confirmPassword ? 'border-destructive' : ''}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                )}
              </div>
            )}

            {/* Language selector - shown on signup */}
            {!isLogin && (
              <LanguageSelector
                value={selectedLanguage}
                onChange={handleLanguageChange}
                label={t('auth.chooseLanguage')}
              />
            )}
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
                  {isLogin ? t('auth.signingIn') : t('auth.creatingAccount')}
                </>
              ) : (
                isLogin ? t('auth.signIn') : 'Create Account & Start Free Trial'
              )}
            </Button>
            
            <p className="text-sm text-muted-foreground text-center">
              {isLogin ? t('auth.noAccount') + ' ' : t('auth.haveAccount') + ' '}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrors({});
                  setConfirmPassword('');
                }}
                className="text-primary hover:underline font-medium"
              >
                {isLogin ? t('auth.signUp') : t('auth.signIn')}
              </button>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Auth;
