import { ReactNode, useEffect, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  /**
   * Where to send an unauthenticated visitor. /auth is the only public surface this app
   * has left — it used to default to the LeadFinder marketing landing, which was deleted
   * with the barber product, and a redirect to a deleted route is a 404 on sign-out.
   */
  redirectTo?: string;
}

export function ProtectedRoute({ children, redirectTo = "/auth" }: ProtectedRouteProps) {
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
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

