import { ReactNode, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { readLastRoute } from '@/hooks/usePersistLastRoute';

interface PublicRouteProps {
  children: ReactNode;
}

export function PublicRoute({ children }: PublicRouteProps) {
  const { user, isLoading } = useAuth();
  const [searchParams] = useSearchParams();

  // Allow authenticated users to stay on the page if welcome=demo param is present
  const hasDemoWelcome = searchParams.get('welcome') === 'demo';

  const resumePath = useMemo(() => {
    if (!user) return null;
    return readLastRoute(user.id) || '/';
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user is authenticated but has demo welcome flag, let them see the page (with popup)
  if (user && hasDemoWelcome) {
    return <>{children}</>;
  }

  // If user is authenticated, redirect to the last place they were in the app
  if (user) {
    return <Navigate to={resumePath || '/'} replace />;
  }

  return <>{children}</>;
}
