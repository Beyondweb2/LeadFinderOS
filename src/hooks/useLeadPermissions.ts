import { useMemo } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { leadPermissions, type LeadPermissions } from '@/lib/access';

/** The caller's permissions on the shared Outreach / Inbox / lead detail (src/lib/access.ts).
 *  Presentation only — the database and the edge functions enforce the same rules. */
export function useLeadPermissions(): LeadPermissions {
  const { role } = useSubscription();
  return useMemo(() => leadPermissions(role), [role]);
}
