import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { PaymentPausedScreen } from '@/components/PaymentPausedScreen';
import { SubscriptionCancelledScreen } from '@/components/SubscriptionCancelledScreen';
import { TrialExpiredScreen } from '@/components/TrialExpiredScreen';
import { hasAdEntryAccess } from '@/lib/adEntryAccess';

interface SubscriptionGateProps {
  children: ReactNode;
}

const subscriptionGateCache = new Map<string, { setupCompleted: boolean; trialUsed: boolean }>();

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { isLoading: subLoading, isPaymentPaused, isPaidSubscriber, isStripeTrialing, isAdmin, status: subStatus } = useSubscription();
  const { user } = useAuth();

  const cachedGateState = user?.id ? subscriptionGateCache.get(user.id) : null;
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(cachedGateState?.setupCompleted ?? null);
  const [trialUsed, setTrialUsed] = useState<boolean | null>(cachedGateState?.trialUsed ?? null);
  const [setupLoading, setSetupLoading] = useState(Boolean(user?.id) && !cachedGateState);

  const isAdGuest = !user && hasAdEntryAccess();

  useEffect(() => {
    if (!user?.id) {
      setSetupCompleted(null);
      setTrialUsed(null);
      setSetupLoading(false);
      return;
    }

    const cached = subscriptionGateCache.get(user.id);
    if (cached) {
      setSetupCompleted(cached.setupCompleted);
      setTrialUsed(cached.trialUsed);
      setSetupLoading(false);
      return;
    }

    let cancelled = false;
    setSetupLoading(true);

    (async () => {
      try {
        const { data } = await supabase
          .from('user_trials')
          .select('setup_completed, trial_used')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cancelled) return;

        const nextState = {
          setupCompleted: (data as any)?.setup_completed ?? false,
          trialUsed: (data as any)?.trial_used ?? false,
        };

        subscriptionGateCache.set(user.id, nextState);
        setSetupCompleted(nextState.setupCompleted);
        setTrialUsed(nextState.trialUsed);
      } catch {
        if (cancelled) return;
        setSetupCompleted(true);
        setTrialUsed(false);
      } finally {
        if (!cancelled) {
          setSetupLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (isAdGuest) {
    return <>{children}</>;
  }

  if (subLoading || setupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isPaymentBlocked = isPaymentPaused || subStatus === 'unpaid';
  if (isPaymentBlocked) {
    return <PaymentPausedScreen />;
  }

  const isCancelled = subStatus === 'canceled' || subStatus === 'cancelled';
  if (isCancelled) {
    return <SubscriptionCancelledScreen />;
  }

  if (!isAdmin && subStatus === null && trialUsed === true) {
    return <TrialExpiredScreen />;
  }

  const hasPaidAccess = isPaidSubscriber || isStripeTrialing || isAdmin;
  if (hasPaidAccess && !isAdmin && setupCompleted === false) {
    return <Navigate to="/complete-setup" replace />;
  }

  return <>{children}</>;
}