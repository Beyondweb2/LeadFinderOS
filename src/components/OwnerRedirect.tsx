import { ReactNode } from "react";
import { RequireAdmin } from "./RequireAdmin";

/**
 * Kept for its position guarding "/". Operator access is now ADMIN-ONLY via the
 * single RequireAdmin guard — non-admins (barbers / orphaned accounts) are
 * diverted to their own dashboard (or /barber-login). Delegates so the gate logic
 * lives in exactly one place.
 */
export function OwnerRedirect({ children }: { children: ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
