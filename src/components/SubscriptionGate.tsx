import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import { useOwner } from '@/contexts/OwnerContext';
import { Loader2 } from 'lucide-react';

interface SubscriptionGateProps {
  children: ReactNode;
}

// Billing is removed in LeadFinder OS — this gate's only remaining job is the
// barber diversion below. It keeps its name/position in the route tree so the
// routing structure matches the original app.
export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { isLoading: subLoading, isAdmin } = useSubscription();
  const { loading: ownerLoading, isOwner } = useOwner();

  if (subLoading || ownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Barbers (site owners) must never see LeadFinder's customer flow. Divert
  // them to /barber from EVERY gated route — OwnerRedirect only guards "/",
  // so this is the catch-all. Admins who happen to own a site keep the
  // admin/customer experience.
  if (isOwner && !isAdmin) {
    return <Navigate to="/barber" replace />;
  }

  return <>{children}</>;
}
