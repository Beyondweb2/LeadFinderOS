import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, AlertCircle, Lock, Mail, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LANGUAGE_OPTIONS, type SupportedLanguage } from '@/hooks/useLanguage';
import appLogo from '@/assets/logo.png';

const CompleteSetup = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const { toast } = useToast();

  const sessionId = searchParams.get('session_id');

  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'form' | 'creating' | 'success' | 'error'>('form');
  const [errorMessage, setErrorMessage] = useState('');

  // If user is already logged in and setup is done, redirect
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // Fetch email from Stripe session
  useEffect(() => {
    if (!sessionId) return;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-checkout-email', {
          body: { session_id: sessionId },
        });
        if (error) throw error;
        if (data?.email) {
          setEmail(data.email);
        } else {
          throw new Error('No email returned');
        }
      } catch (err) {
        console.error('Failed to fetch email:', err);
        setErrorMessage('Could not verify your checkout session. Please try again.');
        setStatus('error');
      } finally {
        setEmailLoading(false);
      }
    })();
  }, [sessionId]);

  // Validation
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const isFormValid = email && password.length >= 8 && password === confirmPassword && language;

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card border-border">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Invalid link</h2>
            <p className="text-muted-foreground text-sm text-center">This page requires a valid checkout session.</p>
            <Button onClick={() => navigate('/landing', { replace: true })}>Go to Homepage</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setIsSubmitting(true);
    setStatus('creating');

    try {
      const { data, error } = await supabase.functions.invoke('complete-signup', {
        body: { session_id: sessionId, password, language },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to create account');

      // Sign in with the new credentials
      const { error: signInError } = await signIn(data.email, password);
      if (signInError) {
        setStatus('success');
        return;
      }

      setStatus('success');
      setTimeout(() => navigate('/', { replace: true }), 2000);
    } catch (err) {
      console.error('Complete signup error:', err);
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
          </div>
          <h1 className="text-2xl font-bold">
            Lead<span className="text-primary">Finder</span> Pro
          </h1>
        </CardHeader>

        <CardContent className="py-6">
          {status === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center mb-6">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3" style={{ color: 'hsl(142 76% 50%)' }} />
                <h2 className="text-xl font-semibold">Finish setting up your account</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  One last step before you start using LeadFinder
                </p>
              </div>

              {/* Email (read-only) */}
              <div className="space-y-2">
                <Label htmlFor="email">Account email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  {emailLoading ? (
                    <div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 pl-10 items-center">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      disabled
                      className="pl-10 bg-muted text-muted-foreground cursor-not-allowed"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Used the wrong email? You can change it later in Settings.
                </p>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Create a password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    autoFocus
                    disabled={isSubmitting || emailLoading}
                  />
                </div>
                {passwordTooShort && (
                  <p className="text-xs text-destructive">Password must be at least 8 characters</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    disabled={isSubmitting || emailLoading}
                  />
                </div>
                {passwordMismatch && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>

              {/* Language */}
              <div className="space-y-2">
                <Label htmlFor="language">
                  <Globe className="inline h-4 w-4 mr-1 -mt-0.5" />
                  Language
                </Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as SupportedLanguage)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label} ({opt.nativeLabel})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                className="w-full btn-premium h-12 text-base font-bold"
                disabled={!isFormValid || isSubmitting || emailLoading}
              >
                Continue to app →
              </Button>
            </form>
          )}

          {status === 'creating' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <h2 className="text-xl font-semibold">Setting up your account...</h2>
              <p className="text-sm text-muted-foreground text-center">This only takes a moment.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle2 className="h-12 w-12" style={{ color: 'hsl(142 76% 50%)' }} />
              <h2 className="text-xl font-semibold">You're all set!</h2>
              <p className="text-sm text-muted-foreground text-center">Your 5-day free trial is active. Redirecting...</p>
              <Button onClick={() => navigate('/', { replace: true })} className="btn-premium">
                Continue to app →
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Something went wrong</h2>
              <p className="text-sm text-muted-foreground text-center">{errorMessage}</p>
              <div className="flex gap-2">
                <Button onClick={() => { setStatus('form'); setErrorMessage(''); }}>
                  Try again
                </Button>
                <Button variant="outline" onClick={() => navigate('/landing', { replace: true })}>
                  Go back
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompleteSetup;
