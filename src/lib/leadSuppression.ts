/* Which of these leads are on the do-not-contact list (2026-10-20).
   ⛔ contact_suppressions has RLS on and NO policies: a browser read of it returns 200 and [] for everyone, so the
   screen must never read it directly (scripts/no-browser-suppression-read.test.ts). This asks the role-checked SQL
   function leads_suppressed instead: lead ids in, the suppressed lead ids out — never a reason, never a phone, and
   a salesperson only learns about leads they work. ANY suppression counts, matched on the lead or its number.
   The senders stay the enforcement; this only lets the screen count honestly.
   Returns null when the check could not be made (the caller decides what unknown means). */
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The SQL function's own per-call cap (cardinality <= 500). */
export const SUPPRESSION_CHECK_CHUNK = 500;

export async function fetchSuppressedLeadIds(leadIds: readonly string[]): Promise<Set<string> | null> {
  const ids = [...new Set(leadIds.filter(Boolean))];
  const out = new Set<string>();
  const sb = supabase as unknown as SupabaseClient;
  for (let i = 0; i < ids.length; i += SUPPRESSION_CHECK_CHUNK) {
    const { data, error } = await sb.rpc('leads_suppressed', { _lead_ids: ids.slice(i, i + SUPPRESSION_CHECK_CHUNK) });
    if (error) {
      console.error('[leadSuppression] leads_suppressed failed', error.message ?? error);
      return null;
    }
    for (const id of (data ?? []) as string[]) out.add(id);
  }
  return out;
}
