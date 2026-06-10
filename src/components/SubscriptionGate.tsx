import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useOwner } from '@/contexts/OwnerContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { PaymentPausedScreen } from '@/components/PaymentPausedScreen';
import { SubscriptionCancelledScreen } from '@/components/SubscriptionCancelledScreen';
import { hasAdEntryAccess } from '@/lib/adEntryAccess';

interface SubscriptionGateProps {
  children: ReactNode;
}

const subscriptionGateCache = new Map<string, { setupCompleted: boolean }>();

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { isLoading: subLoading, isPaymentPaused, isPaidSubscriber, isStripeTrialing, isAdmin, status: subStatus } = useSubscription();
  const { user } = useAuth();
  const { loading: ownerLoading, isOwner } = useOwner();

  const cachedGateState = user?.id ? subscriptionGateCache.get(user.id) : null;
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(cachedGateState?.setupCompleted ?? null);
  const [setupLoading, setSetupLoading] = useState(Boolean(user?.id) && !cachedGateState);

  const isAdGuest = !user && hasAdEntryAccess();

  useEffect(() => {
    if (!user?.id) {
      setSetupCompleted(null);
      setSetupLoading(false);
      return;
    }

    const cached = subscriptionGateCache.get(user.id);
    if (cached) {
      setSetupCompleted(cached.setupCompleted);
      setSetupLoading(false);
      return;
    }

    let cancelled = false;
    setSetupLoading(true);

    (async () => {
      try {
        const { data } = await supabase
          .from('user_trials')
          .select('setup_completed')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cancelled) return;

        const nextState = {
          setupCompleted: (data as any)?.setup_completed ?? false,
        };

        subscriptionGateCache.set(user.id, nextState);
        setSetupCompleted(nextState.setupCompleted);
      } catch {
        if (cancelled) return;
        setSetupCompleted(true);
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

  if (subLoading || setupLoading || ownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Barbers (site owners) must never see LeadFinder's customer flow or subscribe
  // wall. Divert them to /barber from EVERY gated route — OwnerRedirect only
  // guards "/", so this is the catch-all. Admins who happen to own a site keep
  // the admin/customer experience.
  if (isOwner && !isAdmin) {
    return <Navigate to="/barber" replace />;
  }

  const isPaymentBlocked = isPaymentPaused || subStatus === 'unpaid';
  if (isPaymentBlocked) {
    return <PaymentPausedScreen />;
  }

  const isCancelled = subStatus === 'canceled' || subStatus === 'cancelled';
  if (isCancelled) {
    return <SubscriptionCancelledScreen />;
  }

  // Free users (no subscription) are allowed in — they hit per-feature limits
  // (5 searches, 2 contacts, 10 outreach adds). No more trial-expired full block.

  const hasPaidAccess = isPaidSubscriber || isStripeTrialing || isAdmin;
  if (hasPaidAccess && !isAdmin && setupCompleted === false) {
    return <Navigate to="/complete-setup" replace />;
  }

  return <>{children}</>;
}