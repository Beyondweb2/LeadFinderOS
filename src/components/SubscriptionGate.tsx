import { ReactNode, useEffect, useState, useRef } from 'react';
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

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { isLoading: subLoading, isPaymentPaused, isPaidSubscriber, isStripeTrialing, isAdmin, status: subStatus } = useSubscription();
  const { user } = useAuth();

  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [trialUsed, setTrialUsed] = useState<boolean | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  // Cache setup_completed per user to avoid refetching on every mount/route change
  const lastCheckedUserIdRef = useRef<string | null>(null);

  const isAdGuest = !user && hasAdEntryAccess();

  useEffect(() => {
    if (!user?.id) {
      setSetupLoading(false);
      return;
    }

    // Skip refetch if we already checked for this user
    if (lastCheckedUserIdRef.current === user.id && setupCompleted !== null) {
      setSetupLoading(false);
      return;
    }

    (async () => {
      try {
        const { data } = await supabase
          .from('user_trials')
          .select('setup_completed, trial_used')
          .eq('user_id', user.id)
          .maybeSingle();
        setSetupCompleted((data as any)?.setup_completed ?? false);
        setTrialUsed((data as any)?.trial_used ?? false);
        lastCheckedUserIdRef.current = user.id;
      } catch {
        setSetupCompleted(false);
      } finally {
        setSetupLoading(false);
      }
    })();
  }, [user?.id]);

  if (subLoading || setupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Block access if grace period expired (payment failing >7 days) or account paused
  const isPaymentBlocked = isPaymentPaused || subStatus === 'unpaid';
  if (isPaymentBlocked) {
    return <PaymentPausedScreen />;
  }

  // Block cancelled users — must resubscribe
  const isCancelled = subStatus === 'canceled' || subStatus === 'cancelled';
  if (isCancelled) {
    return <SubscriptionCancelledScreen />;
  }

  // Block expired trial users — no active subscription and trial was used
  if (!isAdmin && subStatus === null && trialUsed === true) {
    return <TrialExpiredScreen />;
  }

  // Allow all authenticated users into the app — gating happens at feature level
  // (search results are gated, buttons locked, trial modal shown)

  // If subscribed but setup not completed, redirect to complete-setup
  // Only enforce for paying/trialing users, not free users exploring
  const hasPaidAccess = isPaidSubscriber || isStripeTrialing || isAdmin;
  if (hasPaidAccess && !isAdmin && !setupCompleted) {
    return <Navigate to="/complete-setup" replace />;
  }

  return <>{children}</>;
}
