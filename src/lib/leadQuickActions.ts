/* ══ INTERESTED / NOT INTERESTED — ONE PATH FOR EVERY SCREEN (Sales Experience, 2026-09-28) ══════════
   The Inbox's status pill and Focus Mode's two buttons both call these, so the two roles' routes are
   written once: the admin writes the row directly; a salesperson goes through the ownership-checked
   lead functions (salesPatchLead) — a direct write from a sales session silently changes nothing —
   and a salesperson's "not interested" also stops the queue for that lead (suppress_lead), exactly as
   the admin's does server-side. Every screen then re-reads (notifyLeadChanged). */
import { supabase } from '@/integrations/supabase/client';
import { updateLeadStatus } from '@/lib/leadStatus';
import type { LeadStatus } from '@/types/outreach';
import { salesPatchLead } from '@/lib/leadRpc';
import { refusalText } from '@/lib/salesCrm';
import { notifyLeadChanged } from '@/lib/leadSync';

export type QuickResult = { ok: boolean; error?: string };

/** Mark interested (the star). The pipeline status is left as it is. */
export async function markLeadInterested(leadId: string, isAdmin: boolean): Promise<QuickResult> {
  const error = isAdmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (await (supabase as any).from('outreach_leads').update({ is_potential_work: true }).eq('id', leadId)).error?.message ?? null
    : await salesPatchLead(leadId, { is_potential_work: true }).then((r) => (r.ok ? null : refusalText(r.error)));
  if (error) return { ok: false, error };
  notifyLeadChanged(leadId);
  return { ok: true };
}

/** Set a pipeline status (the Inbox pill; Focus Mode's "Not interested"). */
export async function setLeadPipelineStatus(leadId: string, status: string, isAdmin: boolean): Promise<QuickResult> {
  const { error } = isAdmin
    ? await updateLeadStatus(leadId, status as LeadStatus)
    : await salesPatchLead(leadId, { status }).then((r) => ({ error: r.ok ? null : refusalText(r.error) }));
  if (error) return { ok: false, error: String(error) };
  if (!isAdmin && status === 'not_interested') {
    void supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'suppress_lead', lead_id: leadId, reason: 'not_interested' } });
  }
  notifyLeadChanged(leadId);
  return { ok: true };
}
