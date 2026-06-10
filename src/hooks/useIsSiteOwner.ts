import { useOwner } from "@/contexts/OwnerContext";

/**
 * Is the current user a barber/site owner (owns at least one generated_sites row)?
 *
 * Thin wrapper over the shared OwnerProvider so ownership is computed once per
 * session and reused by OwnerRedirect, SubscriptionGate and BarberDashboard.
 */
export function useIsSiteOwner() {
  return useOwner();
}
