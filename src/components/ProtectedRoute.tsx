import { ReactNode, useEffect, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { hasAdEntryAccess } from '@/lib/adEntryAccess';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  const attemptedPath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.pathname, location.search, location.hash]
  );

  // If auth is missing, remember where the user tried to go.
  useEffect(() => {
    if (isLoading) return;
    if (user) return;

    try {
      sessionStorage.setItem('leadfinder_post_login_redirect', attemptedPath);
      localStorage.setItem('leadfinder_post_login_redirect', attemptedPath);
    } catch {
      // ignore
    }
  }, [attemptedPath, isLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" style={{ backgroundColor: 'hsl(220, 50%, 6%)' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Allow ad-entry users to bypass auth gate
    if (hasAdEntryAccess()) {
      return <>{children}</>;
    }
    return <Navigate to="/landing" replace />;
  }

  return <>{children}</>;
}

