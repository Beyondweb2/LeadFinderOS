import { Navigate, useLocation } from 'react-router-dom';
import { legacyToolRedirect } from '@/lib/paidClientTools';

/* The retired admin pages — /page-plan, /page-generator, /review-replies (2026-10-06) — land on the
   same tool inside Paid Clients, with their query string carried over (an old "Build this page" link
   still opens the same client and page). Inside the operator shell, so the role gate runs first: a
   salesperson never reaches Paid Clients by this road either (access.ts lists none of these). */
export function LegacyToolRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={legacyToolRedirect(pathname, search) ?? '/paid-clients'} replace />;
}
