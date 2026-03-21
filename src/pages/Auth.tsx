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
import { Loader2, Sparkles, Gift, Check, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AffiliateCapture } from '@/components/AffiliateCapture';
import { InternetIdentityButton } from '@/components/InternetIdentityButton';
import { GoogleLoginButton } from '@/components/GoogleLoginButton';
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
  const modeParam = searchParamsInit.get('mode');
  const emailParam = searchParamsInit.get('email');
  const existingParam = searchParamsInit.get('existing');
  const returnToParam = searchParamsInit.get('returnTo');
  const [isLogin, setIsLogin] = useState(() => {
    if (modeParam === 'signup' || intentParam === 'signup') return false;
    if (modeParam === 'signin') return true;
    if (existingParam === 'true') return true;
    return true;
  });
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 40%, hsl(210 100% 50% / 0.04), transparent 70%)',
        }}
      />
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, hsl(210 80% 50% / 0.03), transparent 60%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Top bar: back + language */}
      <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3 bg-background/60 backdrop-blur-md border-b border-border/10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(returnToParam || '/landing')}
          className="text-muted-foreground hover:text-foreground h-8 px-2.5 text-xs transition-colors duration-200"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
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
      <div className="w-full max-w-[420px] relative z-10 -mt-6">
        {/* Header */}
        <div className="text-center mb-8">
          <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 mx-auto mb-4" />
          <h1 className="text-[1.75rem] font-bold tracking-tight">
            Lead<span className="text-gradient-primary">Finder</span> Pro
          </h1>
          <p className="text-[13px] text-muted-foreground/70 mt-2 leading-relaxed">
            {existingParam === 'true'
              ? 'You already have Pro. Sign in to continue.'
              : isLogin 
                ? t('auth.signInToFind')
                : 'Create your account to start finding clients'}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7 sm:p-8"
          style={{
            background: 'hsl(220 30% 8% / 0.8)',
            border: '1px solid hsl(0 0% 100% / 0.06)',
            boxShadow: '0 1px 2px hsl(0 0% 0% / 0.2), 0 8px 24px hsl(220 40% 4% / 0.4), 0 0 0 1px hsl(0 0% 100% / 0.02) inset',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting || (existingParam === 'true' && !!emailParam)}
                className={`h-9 text-sm bg-background/40 border-border/30 placeholder:text-muted-foreground/30 transition-all duration-200 focus:border-primary/50 focus:bg-background/60 ${errors.email ? 'border-destructive' : ''} ${existingParam === 'true' && emailParam ? 'bg-muted cursor-not-allowed' : ''}`}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className={`h-9 text-sm bg-background/40 border-border/30 placeholder:text-muted-foreground/30 transition-all duration-200 focus:border-primary/50 focus:bg-background/60 ${errors.password ? 'border-destructive' : ''}`}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            <Button 
              type="submit" 
              className="w-full h-10 text-sm font-semibold rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-[1px]" 
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
          </form>

          {/* Toggle login/signup */}
          <p className="text-[13px] text-muted-foreground/60 text-center mt-5">
            {isLogin ? (
              <>
                {"Don't have an account? "}
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setErrors({}); }}
                  className="text-primary hover:text-primary/80 font-medium transition-colors duration-200"
                >
                  {t('auth.createAccount')}
                </button>
              </>
            ) : (
              <>
                {t('auth.haveAccount') + ' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setErrors({}); }}
                  className="text-primary hover:text-primary/80 font-medium transition-colors duration-200"
                >
                  {t('auth.signIn')}
                </button>
              </>
            )}
          </p>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/20" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40" style={{ backgroundColor: 'hsl(220 30% 8%)' }}>or</span>
            </div>
          </div>

          {/* Social logins */}
          <div className="space-y-3">
            <GoogleLoginButton />

            {/* Internet Identity - premium differentiated button */}
            <div
              className="rounded-xl p-[1px] transition-all duration-250"
              style={{
                background: 'linear-gradient(135deg, hsl(270 60% 40% / 0.5), hsl(250 50% 35% / 0.3), hsl(270 60% 40% / 0.5))',
              }}
            >
              <div
                className="rounded-[11px]"
                style={{
                  background: 'linear-gradient(135deg, hsl(270 30% 12%), hsl(260 25% 10%))',
                }}
              >
                <InternetIdentityButton />
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 pt-1">
              <div className="h-[1px] w-3 bg-muted-foreground/15" />
              <p className="text-[9px] text-muted-foreground/35 tracking-[0.12em] uppercase font-medium">
                Powered by Internet Computer
              </p>
              <div className="h-[1px] w-3 bg-muted-foreground/15" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
