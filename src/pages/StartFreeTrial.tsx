import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ArrowRight, Lock, Shield, Loader2 } from 'lucide-react';
import appLogo from '@/assets/logo.png';
import { useLandingTheme } from '@/hooks/useLandingTheme';

const FEATURES = [
  'Instantly find businesses that don\'t have websites',
  'Contact them directly by call, SMS or WhatsApp',
  'Track outreach and follow-ups in one place',
  'Never miss a potential client',
];

const StartFreeTrial = () => {
  const navigate = useNavigate();
  const [showEmailStep, setShowEmailStep] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  useLandingTheme();

  const handleStartClick = () => {
    setShowEmailStep(true);
    setEmailError('');
  };

  const handleEmailContinue = useCallback(async () => {
    const trimmed = checkoutEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    setIsCheckingEmail(true);

    try {
      const { data, error } = await supabase.functions.invoke('check-email-subscription', {
        body: { email: trimmed },
      });
      if (error) throw error;

      if (data?.exists) {
        navigate(`/auth?email=${encodeURIComponent(trimmed)}&existing=true`);
        return;
      }

      setIsStartingCheckout(true);
      const headers: Record<string, string> = {};
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        headers.Authorization = `Bearer ${sessionData.session.access_token}`;
      }

      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke('create-checkout', {
        headers,
        body: { customer_email: trimmed },
      });
      if (checkoutError) throw checkoutError;
      if (checkoutData?.url) {
        window.location.href = checkoutData.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err) {
      console.error('Email check/checkout error:', err);
      setEmailError('Something went wrong. Please try again.');
    } finally {
      setIsCheckingEmail(false);
      setIsStartingCheckout(false);
    }
  }, [checkoutEmail, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(210 100% 50% / 0.12), transparent 60%)' }}
      />

      {/* Header */}
      <header className="relative z-20 border-b border-border/50">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/landing" className="flex items-center gap-2.5">
            <img src={appLogo} alt="LeadFinder" className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
          </Link>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <section className="relative z-10 pt-8 sm:pt-16 pb-12 sm:pb-24 px-3 sm:px-4">
        <div className="container mx-auto max-w-[26rem] sm:max-w-md">
          <div
            className="rounded-2xl px-5 py-6 sm:px-10 sm:py-10"
            style={{
              background: 'linear-gradient(180deg, hsl(220 40% 10%) 0%, hsl(220 45% 7%) 100%)',
              border: '1px solid hsl(210 100% 50% / 0.2)',
              boxShadow: '0 0 60px hsl(210 100% 50% / 0.1), 0 0 90px hsl(210 100% 50% / 0.05), 0 8px 32px hsl(220 40% 4% / 0.5)',
            }}
          >
            <h1 className="text-[22px] sm:text-[28px] font-bold tracking-tight text-center mb-1 sm:mb-1.5">
              Start your 5-day <span className="whitespace-nowrap text-gradient-primary">free trial</span>
            </h1>
            <p className="text-[13px] sm:text-sm text-foreground/60 text-center leading-snug mb-5 sm:mb-6">
              Get full access to LeadFinder and start finding potential clients in minutes.
            </p>

            <ul className="space-y-2 sm:space-y-2.5 mb-4 sm:mb-5">
              {FEATURES.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] sm:text-sm text-foreground/85 font-medium leading-snug">
                  <Check
                    className="h-4 w-4 shrink-0 mt-0.5"
                    style={{ color: 'hsl(142 76% 50%)' }}
                    strokeWidth={2.5}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="border-t border-border/30 pt-3 sm:pt-4 mb-3 sm:mb-4 text-center">
              <p className="text-[13px] sm:text-sm text-foreground/65 leading-relaxed">
                Full access during your trial.<br />
                If you don't land a client in 5 days, cancel and you won't be charged.
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground/45 text-center mb-4 sm:mb-5">
              Card required to start trial. You will not be charged today.
            </p>

            {!showEmailStep ? (
              <div className="text-center">
                <Button
                  size="lg"
                  className="btn-premium font-semibold h-12 sm:h-[52px] px-10 sm:px-14 text-[14px] sm:text-[15px] rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-0.5 transition-all duration-300 w-full sm:w-auto"
                  onClick={handleStartClick}
                >
                  Start My 5-Day Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="w-full space-y-3">
                <h4 className="text-base sm:text-lg font-bold tracking-tight text-center">
                  Enter your email to start
                </h4>
                <div className="space-y-1.5">
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={checkoutEmail}
                    onChange={(e) => { setCheckoutEmail(e.target.value); setEmailError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleEmailContinue(); }}
                    className="h-11 text-sm bg-background/50 border-border/40 focus:border-primary/60"
                    autoFocus
                    disabled={isCheckingEmail || isStartingCheckout}
                  />
                  {emailError && (
                    <p className="text-xs text-destructive text-center">{emailError}</p>
                  )}
                </div>
                <Button
                  size="lg"
                  className="btn-premium w-full font-semibold h-11 text-[14px] rounded-xl shadow-lg shadow-primary/25"
                  onClick={handleEmailContinue}
                  disabled={isCheckingEmail || isStartingCheckout || !checkoutEmail.trim()}
                >
                  {isCheckingEmail || isStartingCheckout ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isCheckingEmail ? 'Checking...' : 'Redirecting...'}
                    </>
                  ) : (
                    'Continue'
                  )}
                </Button>
              </div>
            )}

            <div className="flex flex-col items-center gap-1.5 mt-4 sm:mt-5">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/45">
                <Lock className="h-3 w-3" />
                <span>Secure payment powered by Stripe</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/45">
                <Shield className="h-3 w-3" />
                <span>Cancel anytime from your dashboard</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default StartFreeTrial;
