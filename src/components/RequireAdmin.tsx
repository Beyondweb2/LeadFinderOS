import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useOwner } from '@/contexts/OwnerContext';
import { Loader2 } from 'lucide-react';

/**
 * Operator/admin gate — the SINGLE source of truth for who may see the operator
 * app (Find Leads, Outreach, Dashboard, /admin/*).
 *
 * LeadFinderOS is internal-only (Move37), so operator access is ADMIN-ONLY: you
 * must have a `user_roles` row with role='admin'. Anyone else is diverted —
 * a site owner (barber) to /barber, everyone else to /barber-login. This is a
 * POSITIVE check (require admin), not "block known owners", so a non-owner /
 * non-admin account (e.g. an orphaned barber with no site) can no longer slip in.
 *
 * Waits for BOTH gates to resolve before deciding — useSubscription.isLoading
 * covers the user_roles admin lookup, and useOwner.loading covers ownership — so
 * an admin is never briefly flashed/redirected before their role is known.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading: roleLoading, isAdmin } = useSubscription();
  const { loading: ownerLoading, isOwner } = useOwner();

  if (roleLoading || ownerLoading) {
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
    return <Navigate to={isOwner ? '/barber' : '/barber-login'} replace />;
  }

  return <>{children}</>;
}
