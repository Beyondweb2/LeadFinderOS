import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface SubscriptionGateProps {
  children: ReactNode;
}

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { subscribed, isLoading: subLoading, status, openCustomerPortal } = useSubscription();
  const { isOnTrial, trialExpired, isLoading: trialLoading } = useTrial();

  const isLoading = subLoading || trialLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Allow access if subscribed OR on active trial
  if (subscribed || isOnTrial) {
    return <>{children}</>;
  }

  // Show cancelled message for cancelled subscriptions
  if (status === 'canceled' || status === 'cancelled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md mx-auto text-center p-8">
          <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Subscription Cancelled</h1>
          <p className="text-muted-foreground mb-6">
            Your subscription has been cancelled. Resubscribe to regain access to LeadFinder.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => openCustomerPortal()} variant="default">
              Manage Subscription
            </Button>
            <Button onClick={() => window.location.href = '/subscribe'} variant="outline">
              View Plans
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show trial expired message
  if (trialExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md mx-auto text-center p-8">
          <AlertTriangle className="h-16 w-16 text-warning mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Trial Expired</h1>
          <p className="text-muted-foreground mb-6">
            Your 7-day trial has ended. Subscribe to continue using LeadFinder.
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => window.location.href = '/subscribe'} variant="default">
              Subscribe Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback: redirect to subscribe
  return <Navigate to="/subscribe" replace />;
}