import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { onLeadChanged } from '@/lib/leadSync';
import { lastLoggedByLead } from '@/lib/leadState';

/* THE LAST LOGGED CONTACT FOR A PAGE OF LEADS (lead state audit, 2026-09-30) — Outreach's row line
   "Call · Left voicemail · 2h ago". The reading is src/lib/leadState.ts (lastLoggedByLead). ⛔ Its own
   file: the lead LIST must not import the Work panel (scripts/outreach-list-columns.test.ts walks it). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const CHUNK = 150;

/** The newest logged contact for many leads at once (Outreach rows, the Inbox list) — lead_activity,
 *  which both roles may read for their own leads (RLS). Re-read when any lead changes. */
export function useLastLoggedContacts(leadIds: readonly string[]) {
  const key = useMemo(() => [...new Set(leadIds)].sort(), [leadIds]);
  const [bump, setBump] = useState(0);
  useEffect(() => onLeadChanged((d) => { if (!d.optimistic && key.includes(d.leadId)) setBump((n) => n + 1); }), [key]);
  return useQuery({
    queryKey: ['last-logged-contacts', key.join(','), bump],
    enabled: key.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const rows: { lead_id: string; kind: string; body: string | null; data: Record<string, unknown> | null; created_at: string; actor_user_id: string | null }[] = [];
      // Paged by id (PostgREST stops at 1,000 rows without saying so).
      for (let i = 0; i < key.length; i += CHUNK) {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await sb.from('lead_activity').select('id, lead_id, kind, body, data, created_at, actor_user_id')
            .in('lead_id', key.slice(i, i + CHUNK)).in('kind', ['call_outcome', 'contact_logged'])
            .order('id').range(from, from + 999);
          if (error) throw error;
          rows.push(...(data ?? []));
          if ((data ?? []).length < 1000) break;
        }
      }
      return lastLoggedByLead(rows);
    },
  });
}
