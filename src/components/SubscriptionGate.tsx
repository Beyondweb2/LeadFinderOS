import { ReactNode, useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { PaymentPausedScreen } from '@/components/PaymentPausedScreen';
import { SubscriptionCancelledScreen } from '@/components/SubscriptionCancelledScreen';
import { TrialExpiredScreen } from '@/components/TrialExpiredScreen';

interface SubscriptionGateProps {
  children: ReactNode;
}

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { isLoading: subLoading, isPaymentPaused, isPaidSubscriber, isStripeTrialing, isAdmin, status: subStatus } = useSubscription();
  const { user } = useAuth();
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [trialUsed, setTrialUsed] = useState<boolean | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const lastCheckedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setSetupLoading(false);
      return;
    }

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

  // Allow unauthenticated users through — gating happens at feature level
  if (!user) {
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
  if (hasPaidAccess && !isAdmin && !setupCompleted) {
    return <Navigate to="/complete-setup" replace />;
  }

  return <>{children}</>;
}
