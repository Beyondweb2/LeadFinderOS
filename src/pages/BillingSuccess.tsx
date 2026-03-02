import { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import appLogo from '@/assets/logo.png';

const BillingSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, session, signIn } = useAuth();
  const { toast } = useToast();

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'set-password' | 'creating' | 'success' | 'error'>('set-password');
  const [errorMessage, setErrorMessage] = useState('');
  const [resultEmail, setResultEmail] = useState('');
  const syncAttempted = useRef(false);

  const sessionId = searchParams.get('session_id');

  // If user is already authenticated, sync subscription directly
  if (user && session?.access_token && sessionId && !syncAttempted.current) {
    syncAttempted.current = true;
    // Existing user flow — sync subscription and redirect
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('sync-subscription', {
          body: { session_id: sessionId },
        });
        if (error || !data?.success) {
          console.error('Sync error:', error || data?.error);
        }
      } catch {}
      // Redirect to app regardless — webhook will handle it
      setTimeout(() => navigate('/', { replace: true }), 1500);
    })();

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="relative z-10 w-full max-w-md bg-card border-border">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
            </div>
            <CardTitle className="text-2xl font-bold">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12" style={{ color: 'hsl(142 76% 50%)' }} />
            <h2 className="text-xl font-semibold">You're in!</h2>
            <p className="text-muted-foreground text-sm text-center">Activating your trial...</p>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="relative z-10 w-full max-w-md bg-card border-border">
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

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: 'Password too short', description: 'Must be at least 6 characters.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    setStatus('creating');

    try {
      const { data, error } = await supabase.functions.invoke('complete-signup', {
        body: { session_id: sessionId, password },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to create account');

      const email = data.email;
      setResultEmail(email);

      // Sign in with the new credentials
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        // If sign-in fails, still show success but tell user to sign in manually
        setStatus('success');
        return;
      }

      setStatus('success');
      // Auto-redirect after brief delay
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
      <Card className="relative z-10 w-full max-w-md bg-card border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Lead<span className="text-gradient-primary">Finder</span> Pro
          </CardTitle>
        </CardHeader>

        <CardContent className="py-6">
          {status === 'set-password' && (
            <form onSubmit={handleSetPassword} className="space-y-6">
              <div className="flex flex-col items-center gap-3 mb-4">
                <CheckCircle2 className="h-12 w-12" style={{ color: 'hsl(142 76% 50%)' }} />
                <h2 className="text-xl font-semibold text-center">You're in — your free trial is active</h2>
                <p className="text-sm text-muted-foreground text-center">
                  Set a password to create your account and access the app.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Choose a password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    autoFocus
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full btn-premium h-12 text-base font-bold" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Continue to app →'
                )}
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
                <Button onClick={() => { setStatus('set-password'); setErrorMessage(''); }}>
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

export default BillingSuccess;
