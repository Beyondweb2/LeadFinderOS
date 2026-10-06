import { useMemo } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useMyReadiness } from '@/hooks/useMyReadiness';
import { leadPermissions, type LeadPermissions } from '@/lib/access';

/** The caller's permissions on the shared Outreach / Inbox / lead detail (src/lib/access.ts).
 *  Presentation only — the database and the edge functions enforce the same rules. A salesperson who is
 *  whose sales access is restricted (suspended, ended, login off — never the onboarding checklist, 2026-10-06) loses the selling actions (useMyReadiness; the admin is never gated). */
export function useLeadPermissions(): LeadPermissions {
  const { role } = useSubscription();
  const me = useMyReadiness();
  const ready = !me.gated || me.ready;
  return useMemo(() => leadPermissions(role, ready), [role, ready]);
}
