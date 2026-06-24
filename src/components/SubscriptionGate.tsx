import { ReactNode } from 'react';
import { RequireAdmin } from './RequireAdmin';

/**
 * Kept for its historical position in the route tree (wraps every operator
 * route). Operator access is now ADMIN-ONLY and the logic lives in the single
 * RequireAdmin guard — this just delegates, so there's one guard, not scattered
 * copies. Non-admins (barbers) are diverted to /barber (or /barber-login).
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
