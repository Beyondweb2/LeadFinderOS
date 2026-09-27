import type { LeadStatus, OutreachLead } from '@/types/outreach';

/* The DB patch a pipeline-status change implies. PURE — no Supabase import — so the tsx suite can
   drive it (leadStatus.ts pulls in the browser client, which needs Vite env). leadStatus.ts
   re-exports this, so every caller is unchanged. Shared by useOutreach.updateStatus (Outreach) and
   updateLeadStatus (Inbox), so both write IDENTICALLY. */

/** The DB patch for a status change (no side-effects, no I/O). */
export function statusUpdatePatch(status: LeadStatus): Partial<OutreachLead> {
  // Interested is a separate operator marker, not a pipeline stage. Preserve the current status and
  // persist the gold-star/tracked flag instead.
  const updates: Partial<OutreachLead> = status === 'interested'
    ? { is_potential_work: true }
    : { status };
  /* ⛔ A STATUS CHANGE NEVER WRITES A NEXT ACTION (Paul, 2026-09-28: "Next Action is human-set
     only"). Two automatic writes lived here and are both gone:
       · "Replied" → a 'send_draft' task due today (removed 2026-09-13 — it piled up to 625 overdue
         rows; "they replied and you have not answered" is DERIVED on the Dashboard instead);
       · "Site Sent" → a next-day 'follow_up' that OVERWROTE whatever the person had set
         (removed 2026-09-28).
     A next action is set only by a person, through the next-action controls (updateNextAction /
     lead_set_follow_up). scripts/next-action-human-only.test.ts sweeps every status. */
  // "Not Interested" → untrack (dead prospect) so the Tracked filter stays clean.
  if (status === 'not_interested') updates.is_potential_work = false;
  return updates;
}
