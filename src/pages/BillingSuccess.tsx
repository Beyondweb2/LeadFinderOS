import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';
import appLogo from '@/assets/logo.png';
import { trackStartTrial } from '@/lib/fbPixel';
import { getCheckoutAttribution } from '@/lib/checkoutAttribution';

const DEFAULT_IN_APP_ROUTE = '/find-leads';

const sanitizeReturnTo = (raw: string | null): string => {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_IN_APP_ROUTE;

  const blockedPrefixes = ['/billing/success', '/complete-setup', '/billing/cancel', '/landing', '/auth', '/start', '/start-free-trial', '/subscribe'];
  if (blockedPrefixes.some((prefix) => raw.startsWith(prefix))) return DEFAULT_IN_APP_ROUTE;

  return raw;
};

const BillingSuccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const syncAttempted = useRef(false);
  const [isValidatingReturn, setIsValidatingReturn] = useState(true);

  const sessionId = searchParams.get('session_id') || searchParams.get('sessionId');
  const returnTo = useMemo(
    () => sanitizeReturnTo(searchParams.get('return_to') || searchParams.get('returnTo')),
    [searchParams]
  );
  const isAuthenticated = !!(user && session?.access_token);

  const redirectToApp = useCallback((target?: string) => {
    const destination = sanitizeReturnTo(target ?? returnTo);
    console.info('[BILLING-SUCCESS] Redirecting to app', { destination, hasSessionId: !!sessionId, isAuthenticated });
    navigate(destination, { replace: true });
  }, [navigate, returnTo, sessionId, isAuthenticated]);

  // New user (not authenticated): continue account setup with checkout session
  useEffect(() => {
    if (!isAuthenticated && sessionId) {
      console.info('[BILLING-SUCCESS] Anonymous return, routing to complete setup', { sessionId, returnTo });
      navigate(`/complete-setup?session_id=${encodeURIComponent(sessionId)}&return_to=${encodeURIComponent(returnTo)}`, { replace: true });
    }
  }, [isAuthenticated, sessionId, returnTo, navigate]);

  // Authenticated user: sync + verify access, then route into app
  useEffect(() => {
    if (!isAuthenticated || !session?.access_token || syncAttempted.current) return;

    syncAttempted.current = true;
    let cancelled = false;

    (async () => {
      setIsValidatingReturn(true);
      console.info('[BILLING-SUCCESS] Callback hit', { hasSessionId: !!sessionId, returnTo, userId: user?.id });

      try {
        if (sessionId) {
          const { error } = await supabase.functions.invoke('sync-subscription', {
            body: { session_id: sessionId },
          });
          if (error) {
            console.warn('[BILLING-SUCCESS] sync-subscription failed', { message: error.message });
          }
        }

        let subscribed = false;
        for (let attempt = 0; attempt < 4; attempt++) {
          const { data, error } = await supabase.functions.invoke('check-subscription', {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });

          console.info('[BILLING-SUCCESS] check-subscription response', {
            attempt,
            subscribed: data?.subscribed,
            status: data?.subscription_status,
            error: error?.message,
          });

          if (data?.subscribed) {
            subscribed = true;
            // Fire StartTrial pixel event once per session
            if (!sessionStorage.getItem('fb_start_trial_fired') && sessionId) {
              trackStartTrial(sessionId);
              sessionStorage.setItem('fb_start_trial_fired', '1');
            }
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 800));
        }

        if (!cancelled) {
          redirectToApp(subscribed ? returnTo : DEFAULT_IN_APP_ROUTE);
        }
      } catch (error) {
        console.warn('[BILLING-SUCCESS] Recovery failed, routing to in-app fallback', { error });
        if (!cancelled) redirectToApp(DEFAULT_IN_APP_ROUTE);
      } finally {
        if (!cancelled) setIsValidatingReturn(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, sessionId, session?.access_token, user?.id, returnTo, redirectToApp]);

  // If user lands here unauthenticated without session_id, recover to auth (never show invalid-link for checkout returns)
  useEffect(() => {
    if (isAuthenticated || sessionId) return;
    navigate('/auth', { replace: true });
  }, [isAuthenticated, sessionId, navigate]);

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
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <h2 className="text-xl font-semibold">Finalizing your access…</h2>
          <p className="text-muted-foreground text-sm text-center">
            {isValidatingReturn ? 'Verifying your trial and redirecting you into the app.' : 'Redirecting…'}
          </p>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          {!isAuthenticated && (
            <Button variant="outline" onClick={() => navigate('/auth', { replace: true })}>Sign in to continue</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingSuccess;

