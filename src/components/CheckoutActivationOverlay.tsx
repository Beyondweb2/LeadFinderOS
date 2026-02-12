import { useEffect, useState, useCallback } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import appLogo from '@/assets/logo.png';

export function CheckoutActivationOverlay() {
  const { session } = useAuth();
  const [phase, setPhase] = useState<'hidden' | 'polling' | 'activated'>('hidden');

  const pollForActivation = useCallback(async () => {
    if (!session?.access_token) return false;
    try {
      const { data } = await supabase.functions.invoke('check-subscription', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      return data?.subscribed === true;
    } catch {
      return false;
    }
  }, [session?.access_token]);

  useEffect(() => {
    const handleCheckoutOpened = () => {
      setPhase('polling');
    };
    window.addEventListener('checkout-opened', handleCheckoutOpened);
    return () => window.removeEventListener('checkout-opened', handleCheckoutOpened);
  }, []);

  useEffect(() => {
    if (phase !== 'polling') return;

    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 3000));
        if (cancelled) break;
        const active = await pollForActivation();
        if (active && !cancelled) {
          setPhase('activated');
          // Redirect after showing success
          setTimeout(() => {
            window.location.href = '/';
          }, 2500);
          break;
        }
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [phase, pollForActivation]);

  if (phase === 'hidden') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-5 text-center px-6 max-w-sm">
        <img src={appLogo} alt="LeadFinder Pro" className="h-12 w-12" />

        {phase === 'polling' && (
          <>
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div>
              <h2 className="text-lg font-semibold mb-1">Waiting for payment...</h2>
              <p className="text-sm text-muted-foreground">
                Complete checkout in the new tab. This screen will update automatically.
              </p>
            </div>
            <button
              onClick={() => setPhase('hidden')}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline mt-2"
            >
              Dismiss
            </button>
          </>
        )}

        {phase === 'activated' && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div>
              <h2 className="text-lg font-semibold mb-1">You're activated!</h2>
              <p className="text-sm text-muted-foreground">
                Full access unlocked. Redirecting to dashboard...
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
