import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';
import appLogo from '@/assets/logo.png';

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 30000;

const Confirmation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPaidSubscriber, isStripeTrialing, checkSubscription } = useSubscription();
  const [showManualButton, setShowManualButton] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const startTimeRef = useRef(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasAccess = isPaidSubscriber || isStripeTrialing;

  // If user already has access, show confirmed and redirect
  useEffect(() => {
    if (hasAccess && !isConfirmed) {
      setIsConfirmed(true);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setTimeout(() => navigate('/', { replace: true }), 2000);
    }
  }, [hasAccess, isConfirmed, navigate]);

  // Poll for subscription status
  useEffect(() => {
    if (!user || hasAccess) return;

    pollRef.current = setInterval(async () => {
      try {
        await checkSubscription(true);
      } catch {
        // ignore polling errors
      }

      // After 30 seconds, show manual button
      if (Date.now() - startTimeRef.current > MAX_WAIT_MS) {
        setShowManualButton(true);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [user, hasAccess, checkSubscription]);

  // Show manual button after 30s regardless
  useEffect(() => {
    const timer = setTimeout(() => setShowManualButton(true), MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (isConfirmed) {
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
            <h2 className="text-xl font-semibold">Payment confirmed</h2>
            <p className="text-muted-foreground text-sm text-center">
              Your account is ready. Redirecting to your dashboard...
            </p>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <h2 className="text-xl font-semibold">Payment confirmed</h2>
          <p className="text-muted-foreground text-sm text-center">
            Unlocking your account...
          </p>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />

          {showManualButton && (
            <div className="mt-4 text-center space-y-3">
              <p className="text-xs text-muted-foreground">
                Taking longer than expected? Your account will be activated shortly.
              </p>
              <Button
                onClick={() => navigate('/', { replace: true })}
                className="btn-premium"
              >
                Go to Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Confirmation;
