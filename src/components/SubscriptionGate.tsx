import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { Loader2 } from 'lucide-react';
import { PaymentPausedScreen } from '@/components/PaymentPausedScreen';

interface SubscriptionGateProps {
  children: ReactNode;
}

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { isLoading: subLoading, isPaymentPaused, isPaidSubscriber, isStripeTrialing, isAdmin } = useSubscription();

  if (subLoading) {
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

  // Only allow access for paid subscribers, trialing users, or admins
  const hasAccess = isPaidSubscriber || isStripeTrialing || isAdmin;

  if (!hasAccess) {
    return <Navigate to="/subscribe" replace />;
  }

  return <>{children}</>;
}
