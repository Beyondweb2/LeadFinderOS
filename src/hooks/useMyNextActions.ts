import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { onLeadChanged } from '@/lib/leadSync';
import { latestSetters, type NextActionLead, type SetterFact } from '@/lib/myNextActions';

/* THE DASHBOARD'S NEXT ACTIONS READ (Paul, 2026-10-26; src/lib/myNextActions.ts has the rules).
   Two plain SELECTs under the admin's own RLS: the leads that have a Next Action (explicit columns, paginated, id tiebreak),
   and who set each one (History follow_up_set, newest wins). ⛔ Read-only: changes go through the one write
   (NextActionEditor → lead_set_follow_up), whose notice (leadSync) brings this list up to date. */
export const MY_NEXT_ACTIONS_KEY = ['dashboard-next-actions'] as const;
const COLUMNS = 'id, business_name, next_action, next_action_date, next_action_time, next_action_note, assigned_to_user_id, status, is_potential_work, amount_paid, call_booked_at';
const CHUNK = 150;
/* Untyped for these two reads: the generated types make this filter chain too deep for tsc (TS2589). */
const sb = supabase as unknown as SupabaseClient;

async function load(): Promise<{ leads: NextActionLead[]; setters: Map<string, string | null> }> {
  const { rows: leads } = await fetchAllRows<NextActionLead>('Dashboard (next actions)', (from, to) =>
    sb.from('outreach_leads').select(COLUMNS)
      .not('next_action', 'is', null).neq('next_action', 'none').eq('is_archived', false)
      .order('id', { ascending: true }).range(from, to));
  const ids = leads.map((l) => l.id);
  const facts: SetterFact[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const { rows } = await fetchAllRows<SetterFact>('Dashboard (next action setters)', (from, to) =>
      sb.from('lead_activity').select('lead_id, actor_user_id, created_at').eq('kind', 'follow_up_set').in('lead_id', part)
        .order('id', { ascending: true }).range(from, to));
    facts.push(...rows);
  }
  return { leads, setters: latestSetters(facts) };
}

export function useMyNextActions() {
  const q = useQuery({ queryKey: MY_NEXT_ACTIONS_KEY, queryFn: load, staleTime: 60_000 });
  const ids = useMemo(() => new Set((q.data?.leads ?? []).map((l) => l.id)), [q.data]);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const { refetch } = q;
  /* A Next Action saved or completed anywhere (this list, the Inbox, Outreach): re-read once the server has answered.
     An optimistic notice is not re-read (the old row would come back); a lead not in the list may have just gained one. */
  useEffect(() => onLeadChanged((d) => { if (!d.optimistic && (idsRef.current.has(d.leadId) || d.patch?.next_action)) void refetch(); }), [refetch]);
  return q;
}
