import { useRef, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import appLogo from '@/assets/logo.png';

const BillingSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const syncAttempted = useRef(false);
  const [isValidatingReturn, setIsValidatingReturn] = useState(false);

  const sessionId = searchParams.get('session_id') || searchParams.get('sessionId');
  const isAuthenticated = !!(user && session?.access_token);

  // Authenticated user: sync subscription and redirect
  useEffect(() => {
    if (isAuthenticated && sessionId && !syncAttempted.current) {
      syncAttempted.current = true;
      (async () => {
        try {
          await supabase.functions.invoke('sync-subscription', {
            body: { session_id: sessionId },
          });
        } catch {}
        setTimeout(() => navigate('/', { replace: true }), 1500);
      })();
    }
  }, [isAuthenticated, sessionId, navigate]);

  // Fallback: if Stripe returned without session_id, re-check access and recover to app
  useEffect(() => {
    if (!isAuthenticated || sessionId || !session?.access_token) return;

    let cancelled = false;
    setIsValidatingReturn(true);

    (async () => {
      try {
        const { data } = await supabase.functions.invoke('check-subscription', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!cancelled && data?.subscribed) {
          navigate('/', { replace: true });
          return;
        }
      } catch {}

      if (!cancelled) setIsValidatingReturn(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, sessionId, session?.access_token, navigate]);

  // New user (not authenticated): redirect to complete-setup
  useEffect(() => {
    if (!isAuthenticated && sessionId) {
      navigate(`/complete-setup?session_id=${sessionId}`, { replace: true });
    }
  }, [isAuthenticated, sessionId, navigate]);

  if (isAuthenticated && sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card border-border">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />
            </div>
            <CardTitle className="text-2xl font-bold">
              Lead<span className="text-primary">Finder</span> Pro
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

  if (isValidatingReturn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card border-border">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground text-center">Finalizing your access...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default BillingSuccess;
