import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { readLastRoute } from '@/hooks/usePersistLastRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, CreditCard, Sparkles, Gift, Check, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AffiliateCapture } from '@/components/AffiliateCapture';
import { InternetIdentityButton } from '@/components/InternetIdentityButton';
import { LanguageSelector } from '@/components/LanguageSelector';
import { type SupportedLanguage } from '@/hooks/useLanguage';
import { LANG_STORAGE_KEY } from '@/i18n';
import appLogo from '@/assets/logo.png';
import { trackCompleteRegistration } from '@/lib/fbPixel';
import { getCheckoutAttribution } from '@/lib/checkoutAttribution';

const Auth = () => {
  const { t } = useTranslation();
  const [searchParamsInit] = useSearchParams();
  const intentParam = searchParamsInit.get('intent');
  const emailParam = searchParamsInit.get('email');
  const existingParam = searchParamsInit.get('existing');
  const returnToParam = searchParamsInit.get('returnTo');
  const [isLogin, setIsLogin] = useState(!intentParam || existingParam === 'true' || !intentParam);
  const [email, setEmail] = useState(emailParam || '');
  const [password, setPassword] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(() => {
    try {
      return (localStorage.getItem(LANG_STORAGE_KEY) as SupportedLanguage) || 'en';
    } catch { return 'en'; }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirectingToCheckout, setIsRedirectingToCheckout] = useState(false);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  
  const { signIn, signUp, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!user || isLoading) return;
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
    if (!redirectTo) {
      redirectTo = readLastRoute(user.id) || '/';
    }
    navigate(redirectTo, { replace: true });
  }, [user, isLoading, navigate]);

  const validateForm = () => {
    const authSchema = z.object({
      email: z.string().trim().email({ message: t('auth.validEmail') }),
      password: z.string().min(6, { message: t('auth.passwordMinLength') }),
    });
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
            toast({ title: t('auth.loginFailed'), description: t('auth.invalidCredentials'), variant: 'destructive' });
          } else {
            toast({ title: t('auth.loginFailed'), description: error.message, variant: 'destructive' });
          }
        }
      } else {
        try { localStorage.setItem(LANG_STORAGE_KEY, selectedLanguage); } catch {}
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('User already registered')) {
            toast({ title: t('auth.signUpFailed'), description: t('auth.emailAlreadyRegistered'), variant: 'destructive' });
          } else {
            toast({ title: t('auth.signUpFailed'), description: error.message, variant: 'destructive' });
          }
        } else {
          trackCompleteRegistration();
          try {
            await supabase.functions.invoke('ensure-trial', {
              body: { action: 'set_language', language: selectedLanguage },
            });
          } catch {}

          let shouldCheckout = false;
          try {
            shouldCheckout = localStorage.getItem('leadfinder_post_signup_checkout') === 'true';
            if (shouldCheckout) localStorage.removeItem('leadfinder_post_signup_checkout');
          } catch {}

          if (shouldCheckout) {
            setIsRedirectingToCheckout(true);
            toast({ title: t('auth.accountCreated'), description: 'Redirecting to checkout…' });
            try {
              await new Promise(r => setTimeout(r, 500));
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData?.session?.access_token;
              if (token) {
                const { data, error } = await supabase.functions.invoke('create-checkout', {
                  headers: { Authorization: `Bearer ${token}` },
                  body: getCheckoutAttribution(),
                });
                if (!error && data?.url) {
                  window.location.href = data.url;
                  return;
                }
              }
            } catch {}
            setIsRedirectingToCheckout(false);
          }

          toast({ title: t('auth.accountCreated'), description: t('auth.welcomeRedirecting') });
          navigate('/', { replace: true });
          return;
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <p className="text-sm text-muted-foreground">Opening checkout…</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative -mt-8">
      {/* Top bar: back + language */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(returnToParam || '/landing')}
          className="text-muted-foreground hover:text-foreground h-8 px-2 text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          {t('auth.back')}
        </Button>
        {!isLogin && (
          <div className="w-32">
            <LanguageSelector
              value={selectedLanguage}
              onChange={handleLanguageChange}
              label=""
              compact
            />
          </div>
        )}
      </div>

      <AffiliateCapture />

      {/* Free Trial Loading Modal */}
      <Dialog open={showTrialModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-primary/30 bg-card/95 backdrop-blur-xl" hideClose>
          <div className="flex flex-col items-center justify-center py-8 gap-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative h-20 w-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Gift className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold flex items-center justify-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t('trial.threeDayFullAccess')}
                <Sparkles className="h-5 w-5 text-primary" />
              </h3>
              <p className="text-muted-foreground text-sm">{t('trial.settingUpTrial')}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-primary" />
                <span>{t('trial.unlimitedSearches')}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-primary" />
                <span>{t('trial.fullOutreach')}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-primary" />
                <span>{t('trial.whatsappTemplates')}</span>
              </div>
            </div>
            <div className="text-center pt-1 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-1">{t('trial.notReadyCard')}</p>
              <button
                type="button"
                onClick={() => { setShowTrialModal(false); navigate('/demo'); }}
                className="text-xs text-primary hover:underline font-medium"
              >
                {t('trial.freeSearchDemo')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auth Card */}
      <div className="w-full max-w-[420px] relative z-10">
        {/* Header */}
        <div className="text-center mb-5">
          <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 mx-auto mb-2" />
          <h1 className="text-xl font-bold">
            Lead<span className="text-gradient-primary">Finder</span> Pro
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {existingParam === 'true'
              ? 'You already have Pro — sign in to continue.'
              : isLogin 
                ? t('auth.signInToFind')
                : 'Create an account and start finding clients'}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting || (existingParam === 'true' && !!emailParam)}
                className={`h-9 text-sm ${errors.email ? 'border-destructive' : ''} ${existingParam === 'true' && emailParam ? 'bg-muted cursor-not-allowed' : ''}`}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className={`h-9 text-sm ${errors.password ? 'border-destructive' : ''}`}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            <Button 
              type="submit" 
              className="w-full h-9 text-sm mt-1" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  {isLogin ? t('auth.signingIn') : t('auth.creatingAccount')}
                </>
              ) : (
                isLogin ? t('auth.signIn') : t('auth.createAccount')
              )}
            </Button>

            {!isLogin && (
              <p className="text-xs text-muted-foreground text-center">
                {t('auth.haveAccount') + ' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setErrors({}); }}
                  className="text-primary hover:underline font-medium"
                >
                  {t('auth.signIn')}
                </button>
              </p>
            )}
          </form>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/40" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-card px-3 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Internet Identity - premium styled */}
          <div className="space-y-2">
            <div className="rounded-lg border border-[hsl(270,60%,40%)]/40 bg-[hsl(270,40%,12%)]/30 p-[1px]">
              <InternetIdentityButton />
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center tracking-wide">
              Powered by Internet Computer
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
