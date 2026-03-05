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
      <section className="relative z-10 pt-8 sm:pt-20 pb-12 sm:pb-28 px-3 sm:px-4">
        <div className="container mx-auto max-w-[28rem] sm:max-w-lg">
          <div
            className="rounded-2xl px-5 py-7 sm:p-12"
            style={{
              background: 'linear-gradient(180deg, hsl(220 40% 10%) 0%, hsl(220 45% 7%) 100%)',
              border: '1px solid hsl(210 100% 50% / 0.2)',
              boxShadow: '0 0 60px hsl(210 100% 50% / 0.1), 0 0 90px hsl(210 100% 50% / 0.05), 0 8px 32px hsl(220 40% 4% / 0.5)',
            }}
          >
            {/* Headline */}
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-center mb-1.5 sm:mb-2">
              Start your 5-day <span className="text-gradient-primary">free trial</span>
            </h1>
            <p className="text-[13px] sm:text-base text-foreground/65 text-center leading-relaxed mb-5 sm:mb-8 max-w-sm mx-auto">
              Get full access to LeadFinder and start finding potential clients in minutes.
            </p>

            {/* Feature checklist */}
            <ul className="space-y-2.5 sm:space-y-3 mb-5 sm:mb-7 max-w-sm mx-auto">
              {FEATURES.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-[13px] sm:text-sm text-foreground/85 font-medium leading-snug">
                  <Check
                    className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 mt-0.5 sm:mt-0"
                    style={{ color: 'hsl(142 76% 50%)' }}
                    strokeWidth={2.5}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {/* Trust section */}
            <div className="mb-3 sm:mb-5 text-center max-w-sm mx-auto border-t border-border/30 pt-4 sm:pt-5">
              <p className="text-sm text-foreground/70 leading-relaxed">
                Full access during your trial.<br />
                If it doesn't help you land a client, cancel within 5 days and you won't be charged.
              </p>
            </div>

            {/* Disclaimer */}
            <p className="text-[11px] sm:text-xs text-muted-foreground/50 text-center mb-5 sm:mb-7">
              Card required to start trial. No charge during the 5-day trial.
            </p>

            {/* CTA / Email step */}
            {!showEmailStep ? (
              <div className="text-center">
                <Button
                  size="lg"
                  className="btn-premium font-semibold h-[52px] sm:h-14 px-12 sm:px-16 text-[15px] sm:text-base rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35 hover:-translate-y-0.5 transition-all duration-300 w-full sm:w-auto"
                  onClick={handleStartClick}
                >
                  Start My Free Trial
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>
            ) : (
              <div className="w-full max-w-sm mx-auto space-y-4">
                <h4 className="text-lg sm:text-xl font-bold tracking-tight text-center">
                  Enter your email to start
                </h4>
                <div className="space-y-2">
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={checkoutEmail}
                    onChange={(e) => { setCheckoutEmail(e.target.value); setEmailError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleEmailContinue(); }}
                    className="h-12 text-base bg-background/50 border-border/40 focus:border-primary/60"
                    autoFocus
                    disabled={isCheckingEmail || isStartingCheckout}
                  />
                  {emailError && (
                    <p className="text-xs text-destructive text-center">{emailError}</p>
                  )}
                </div>
                <Button
                  size="lg"
                  className="btn-premium w-full font-semibold h-[52px] text-[15px] rounded-xl shadow-lg shadow-primary/25"
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

            {/* Trust indicators */}
            <div className="flex flex-col items-center gap-2 mt-6">
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground/50">
                <Lock className="h-3.5 w-3.5" />
                <span>Secure payment powered by Stripe</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground/50">
                <Shield className="h-3.5 w-3.5" />
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
