import { ReactNode, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { Loader2 } from 'lucide-react';
import { readLastRoute } from '@/hooks/usePersistLastRoute';

interface PublicRouteProps {
  children: ReactNode;
}

export function PublicRoute({ children }: PublicRouteProps) {
  const { user, isLoading } = useAuth();
  const { isPaidSubscriber, isStripeTrialing, isLoading: subLoading } = useSubscription();
  const [searchParams] = useSearchParams();

  const hasDemoWelcome = searchParams.get('welcome') === 'demo';

  const resumePath = useMemo(() => {
    if (!user) return null;
    return readLastRoute(user.id) || '/';
  }, [user]);

  if (isLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && hasDemoWelcome) {
    return <>{children}</>;
  }

  // Only redirect authenticated users who have an active subscription.
  // Unsubscribed users should be able to view the landing page.
  const hasActiveSubscription = isPaidSubscriber || isStripeTrialing;
  if (user && hasActiveSubscription) {
    return <Navigate to={resumePath || '/'} replace />;
  }

  return <>{children}</>;
}
