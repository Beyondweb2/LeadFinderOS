import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { canOpenRoute, homeFor } from '@/lib/access';
import { Button } from '@/components/ui/button';

/**
 * The shell gate (multi-user, 2026-09-27) — replaces RequireAdmin around the operator shell.
 *
 * ⛔ NOTHING RENDERS UNTIL THE ROLE IS KNOWN, and a route the role may not open never renders at all:
 * the redirect happens here, before <Outlet/> mounts the page, so no admin screen (and none of its
 * queries) flashes for a salesperson. The admin opens every route exactly as before.
 *
 * ⛔ THIS IS PRESENTATION, NOT SECURITY. The database and the edge functions refuse a salesperson
 * whatever this component does; see src/lib/access.ts.
 *
 * A signed-in account with NO role (never invited, or disabled) gets a plain screen with a sign-out
 * button — not a redirect to /auth, which would bounce a signed-in user straight back here.
 */
export function RequireAccess({ children }: { children: ReactNode }) {
  const { isLoading, role } = useSubscription();
  const { signOut } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" style={{ backgroundColor: 'hsl(220, 50%, 6%)' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-lg font-semibold">No access</h1>
          <p className="text-sm text-muted-foreground">
            This account does not have access to LeadFinderOS. If you think it should, ask the admin.
          </p>
          <Button variant="outline" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    );
  }

  if (!canOpenRoute(role, location.pathname)) {
    return <Navigate to={homeFor(role)} replace />;
  }

  return <>{children}</>;
}
