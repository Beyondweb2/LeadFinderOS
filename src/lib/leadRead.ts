import { supabase } from '@/integrations/supabase/client';

/* ONE LEAD ROW, READ THE WAY THE CALLER'S ROLE ALLOWS (multi-user, 2026-09-27).
 *
 * The admin reads public.outreach_leads exactly as before — this is the first query, byte-for-byte
 * the old read, so nothing changes for the admin. A salesperson has NO read on that table (RLS:
 * admin_only_outreach_leads) and gets zero rows there; they read public.sales_leads instead, a view
 * with no money columns that only ever holds their own assigned prospects.
 *
 * ⛔ The fallback is not a way round anything: sales_leads decides its own rows server-side. A column
 * that is not in the view (amount_paid is a literal NULL there) simply comes back as the view has it. */
export async function readLeadRow<T>(leadId: string, columns: string): Promise<{ data: T | null; error: unknown }> {
  const first = await supabase.from('outreach_leads').select(columns).eq('id', leadId).maybeSingle();
  if (first.error) return { data: null, error: first.error };
  if (first.data) return { data: first.data as T, error: null };
  const view = await supabase.from('sales_leads' as never).select(columns).eq('id', leadId).maybeSingle();
  if (view.error) return { data: null, error: view.error };
  return { data: (view.data as T | null) ?? null, error: null };
}
