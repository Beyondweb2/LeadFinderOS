import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import appLogo from '@/assets/logo.png';

const BillingSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [status, setStatus] = useState<'syncing' | 'success' | 'error'>('syncing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const syncSubscription = async () => {
      const sessionId = searchParams.get('session_id');
      
      if (!sessionId) {
        setStatus('error');
        setErrorMessage('Missing session ID');
        return;
      }

      if (!session?.access_token) {
        // Wait for auth to load
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('sync-subscription', {
          body: { session_id: sessionId },
        });

        if (error) {
          console.error('Sync error:', error);
          setStatus('error');
          setErrorMessage(error.message || 'Failed to sync subscription');
          return;
        }

        if (data?.success) {
          setStatus('success');
          // Short delay to show success state, then redirect
          setTimeout(() => {
            navigate('/', { replace: true });
          }, 2000);
        } else {
          setStatus('error');
          setErrorMessage(data?.error || 'Failed to activate subscription');
        }
      } catch (err) {
        console.error('Sync exception:', err);
        setStatus('error');
        setErrorMessage('An unexpected error occurred');
      }
    };

    if (session?.access_token) {
      syncSubscription();
    }
  }, [searchParams, session?.access_token, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{ background: 'var(--gradient-glow)' }}
      />
      
      <Card className="relative z-10 w-full max-w-md bg-card/80 backdrop-blur-xl border-primary/20">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Lead<span className="text-gradient-primary">Finder</span> Pro
          </CardTitle>
        </CardHeader>
        
        <CardContent className="flex flex-col items-center gap-4 py-8">
          {status === 'syncing' && (
            <>
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Activating your subscription...</h2>
                <p className="text-muted-foreground">Please wait while we set up your account.</p>
              </div>
            </>
          )}
          
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Welcome to LeadFinder Pro!</h2>
                <p className="text-muted-foreground">Your subscription is now active. Redirecting...</p>
              </div>
            </>
          )}
          
          {status === 'error' && (
            <>
              <AlertCircle className="h-12 w-12 text-destructive" />
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
                <p className="text-muted-foreground mb-4">{errorMessage}</p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={() => navigate('/', { replace: true })}>
                    Go to Dashboard
                  </Button>
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    Retry
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingSuccess;
