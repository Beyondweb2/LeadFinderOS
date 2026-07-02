import { supabase } from '@/integrations/supabase/client';
import type { LeadStatus, OutreachLead } from '@/types/outreach';

// Single source of truth for the column changes a pipeline-status change implies —
// shared by useOutreach.updateStatus (Outreach page) and updateLeadStatus (Inbox),
// so both write IDENTICALLY. Mirrors the original inline branch logic exactly.

const CONTACT_METHOD_STATUSES: LeadStatus[] = ['whatsapp', 'sms', 'facebook_msg', 'sent_initial_text', 'sent_voice_note'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The DB patch for a status change (no side-effects, no I/O). */
export function statusUpdatePatch(status: LeadStatus): Partial<OutreachLead> {
  const updates: Partial<OutreachLead> = { status };
  // An outreach/contact-method status also records the contact method.
  if (CONTACT_METHOD_STATUSES.includes(status)) updates.contact_method = status;
  // "Replied" → same-day Send Draft next action (overwrites any existing).
  if (status === 'replied') { updates.next_action = 'send_draft'; updates.next_action_date = ymd(new Date()); }
  // "Site Sent" → next-day Follow-up (overwrites any existing).
  if (status === 'site_sent') { const d = new Date(); d.setDate(d.getDate() + 1); updates.next_action = 'follow_up'; updates.next_action_date = ymd(d); }
  // "Not Interested" → untrack (dead prospect) so the Tracked filter stays clean.
  if (status === 'not_interested') updates.is_potential_work = false;
  return updates;
}

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
