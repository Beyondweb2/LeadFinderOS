import type { LeadStatus, OutreachLead } from '@/types/outreach';

/* The DB patch a pipeline-status change implies. PURE — no Supabase import — so the tsx suite can
   drive it (leadStatus.ts pulls in the browser client, which needs Vite env). leadStatus.ts
   re-exports this, so every caller is unchanged. Shared by useOutreach.updateStatus (Outreach) and
   updateLeadStatus (Inbox), so both write IDENTICALLY. */

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The DB patch for a status change (no side-effects, no I/O). */
export function statusUpdatePatch(status: LeadStatus): Partial<OutreachLead> {
  // Interested is a separate operator marker, not a pipeline stage. Preserve the current status and
  // persist the gold-star/tracked flag instead.
  const updates: Partial<OutreachLead> = status === 'interested'
    ? { is_potential_work: true }
    : { status };
  /* ⛔ "Replied" NO LONGER WRITES A 'send_draft' NEXT ACTION (2026-09-13). It piled up: the
     inbound handler wrote the same value on every reply and nothing cleared it on answering, so
     625 leads carried an overdue task the card had to hide. "They replied and you have not
     answered" is DERIVED from message timestamps on the Dashboard (dashboardTasks.ts); a stored
     next_action is now only ever something a person set. */
  // "Site Sent" → next-day Follow-up (overwrites any existing).
  if (status === 'site_sent') { const d = new Date(); d.setDate(d.getDate() + 1); updates.next_action = 'follow_up'; updates.next_action_date = ymd(d); }
  // "Not Interested" → untrack (dead prospect) so the Tracked filter stays clean.
  if (status === 'not_interested') updates.is_potential_work = false;
  return updates;
}
