import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useIsSiteOwner } from "@/hooks/useIsSiteOwner";
import { useSubscription } from "@/hooks/useSubscription";

/**
 * Diverts barber/site-owner accounts to their own dashboard (/barber) BEFORE they
 * hit the LeadFinder customer flow / SubscriptionGate. Admins and normal customers
 * pass straight through. Owners are a new account type, so existing users are
 * unaffected (they own no sites → isOwner false).
 */
export function OwnerRedirect({ children }: { children: ReactNode }) {
  const { isAdmin } = useSubscription();
  const { loading, isOwner } = useIsSiteOwner();

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background"
        style={{ backgroundColor: "hsl(220, 50%, 6%)" }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Admin keeps the admin/customer experience even if they happen to own a site.
  if (isOwner && !isAdmin) return <Navigate to="/barber" replace />;
  return <>{children}</>;
}
