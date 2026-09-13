import { supabase } from '@/integrations/supabase/client';
import type { LeadStatus, OutreachLead } from '@/types/outreach';

// Single source of truth for the column changes a pipeline-status change implies —
// shared by useOutreach.updateStatus (Outreach page) and updateLeadStatus (Inbox),
// so both write IDENTICALLY. Mirrors the original inline branch logic exactly.

// (The legacy per-channel contact-method statuses — whatsapp/sms/facebook_msg/sent_* — were
// removed from the vocabulary; contact_method is now written by the send paths directly.)

/** A lead is FRESH/untouched — safe to remove from the CRM (Find Leads Remove
 *  toggle) — only when it's a brand-new add with NO action signals: still
 *  not_contacted, never messaged/queued, no contact method, no notes, no next
 *  action, no attempts, not tracked. SHARED so the UI (button state) and the hook
 *  (click-time delete guard) agree exactly. Accepts a loose subset of the row. */
export function isFreshLead(l: Partial<Pick<OutreachLead,
  'status' | 'whatsapp_sent_at' | 'whatsapp_delivery_status' | 'whatsapp_message_id'
  | 'contact_method' | 'notes' | 'queued_at' | 'next_action'
  | 'last_outreach_attempt_at' | 'outreach_attempts' | 'is_potential_work'>> | null | undefined): boolean {
  if (!l) return false;
  return l.status === 'not_contacted'
    && !l.whatsapp_sent_at && !l.whatsapp_delivery_status && !l.whatsapp_message_id
    && !l.contact_method
    && !(l.notes && l.notes.trim())
    && !l.queued_at
    && (l.next_action === 'none' || !l.next_action)
    && !l.last_outreach_attempt_at && !((l.outreach_attempts ?? 0) > 0)
    && !l.is_potential_work;
}

/* statusUpdatePatch lives in the PURE module src/lib/statusPatch.ts (2026-09-13) so the tsx suite
   can drive it without this file's Supabase client import; re-exported here so callers are
   unchanged. "replied" no longer writes a 'send_draft' next action — see that file. */
import { statusUpdatePatch } from './statusPatch';
export { statusUpdatePatch };

/**
 * Lightweight direct status writer for callers without the full useOutreach hook
 * (e.g. the Inbox). Applies the SAME column patch as Outreach's updateStatus.
 * RLS ("Users can update their own leads") ensures only the lead's owner can write.
 * This is a deliberate manual override — no forward-only guard (unlike the edge
 * functions), so it can move a lead in any direction the operator picks.
 */
export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<{ error: string | null }> {
  // outreach_leads columns are loosely typed in a few call sites; cast the client.
  const { error } = await (supabase as unknown as { from: (t: string) => any })
    .from('outreach_leads')
    .update(statusUpdatePatch(status))
    .eq('id', leadId);
  return { error: error?.message ?? null };
}
