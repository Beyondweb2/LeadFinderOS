import { ReactNode } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { Loader2 } from 'lucide-react';
import { PaymentPausedScreen } from '@/components/PaymentPausedScreen';

interface SubscriptionGateProps {
  children: ReactNode;
}

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { isLoading: subLoading, isPaymentPaused } = useSubscription();
  const { isLoading: trialLoading } = useTrial();

  const isLoading = subLoading || trialLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Block access if payment is paused (2+ failures)
  if (isPaymentPaused) {
    return <PaymentPausedScreen />;
  }

  // All authenticated users get full app access.
  // Search limits are enforced at the search level, not the gate level.
  return <>{children}</>;
}
