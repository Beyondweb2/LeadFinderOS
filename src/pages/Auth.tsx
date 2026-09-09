import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { readLastRoute } from '@/hooks/usePersistLastRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';

const Auth = () => {
  const { t } = useTranslation();
  const [searchParamsInit] = useSearchParams();
  const intentParam = searchParamsInit.get('intent');
  const modeParam = searchParamsInit.get('mode');
  const emailParam = searchParamsInit.get('email');
  const existingParam = searchParamsInit.get('existing');
  const returnToParam = searchParamsInit.get('returnTo');
  // Admin tool is INVITE-ONLY: this page is sign-in only. Public self-signup is
  // disabled server-side (Supabase "Allow new users to sign up" = off); new admin
  // users are created from the Supabase dashboard. (?mode=signup is ignored.)
  const [isLogin] = useState(true);
  const [email, setEmail] = useState(emailParam || '');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('User already registered')) {
            toast({ title: t('auth.signUpFailed'), description: t('auth.emailAlreadyRegistered'), variant: 'destructive' });
          } else {
            toast({ title: t('auth.signUpFailed'), description: error.message, variant: 'destructive' });
          }
        } else {
          toast({ title: t('auth.accountCreated'), description: t('auth.welcomeRedirecting') });
          navigate('/', { replace: true });
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
          onClick={() => navigate(returnToParam || '/')}
          className="text-muted-foreground hover:text-foreground h-8 px-2.5 text-xs transition-colors duration-200"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          {t('auth.back')}
        </Button>
      </div>

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

          {/* Invite-only: no public sign-up toggle. New admin users are created
              from the Supabase dashboard; barbers onboard via /claim. */}
        </div>
      </div>
    </div>
  );
};

export default Auth;
