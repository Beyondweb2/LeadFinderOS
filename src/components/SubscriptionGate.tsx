import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { PaymentPausedScreen } from '@/components/PaymentPausedScreen';

interface SubscriptionGateProps {
  children: ReactNode;
}

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { isLoading: subLoading, isPaymentPaused, isPaidSubscriber, isStripeTrialing, isAdmin, status: subStatus } = useSubscription();
  const { user } = useAuth();
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setSetupLoading(false);
      return;
    }

    (async () => {
      try {
        const { data } = await supabase
          .from('user_trials')
          .select('setup_completed')
          .eq('user_id', user.id)
          .maybeSingle();
        setSetupCompleted((data as any)?.setup_completed ?? false);
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

  // Block access if payment is paused, past_due, unpaid, or any non-active/trialing status
  const isPaymentBlocked = isPaymentPaused || subStatus === 'past_due' || subStatus === 'unpaid';
  if (isPaymentBlocked) {
    return <PaymentPausedScreen />;
  }

  // Only allow access for active subscribers, trialing users, or admins
  const hasAccess = isPaidSubscriber || isStripeTrialing || isAdmin;

  if (!hasAccess) {
    return <Navigate to="/landing" replace />;
  }

  // If subscribed but setup not completed, redirect to complete-setup
  if (!isAdmin && !setupCompleted) {
    return <Navigate to="/complete-setup" replace />;
  }

  return <>{children}</>;
}
