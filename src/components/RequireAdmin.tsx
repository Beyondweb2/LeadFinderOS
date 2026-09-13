import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { Loader2 } from 'lucide-react';

/**
 * Operator gate — the SINGLE source of truth for who may see the operator app.
 *
 * LeadFinderOS is internal-only, so access is ADMIN-ONLY: you must have a
 * `user_roles` row with role='admin'. This is a POSITIVE check (require admin), never
 * "block the known non-admins", so an unknown account can't slip in.
 *
 * ⛔ IT NO LONGER WAITS ON A SECOND LOOKUP, AND THAT IS A REAL SAVING. It used to also
 * block on useOwner(), a `generated_sites` query that ran on EVERY sign-in purely to
 * decide whether to divert a barber to /barber. The barber product is gone, so the query
 * is gone with it and the app renders as soon as the role is known. Anyone who is not an
 * admin goes to /auth, the only public surface left.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading: roleLoading, isAdmin } = useSubscription();

  if (roleLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background"
        style={{ backgroundColor: 'hsl(220, 50%, 6%)' }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
