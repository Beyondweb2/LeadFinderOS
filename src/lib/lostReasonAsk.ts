/* ══ ASK WHY THEY SAID NO — the one trigger (2026-10-01) ══════════════════════════════════════════
   Every place a person marks ONE lead Not interested (the status pill on Outreach, the lead workspace and
   the Inbox; the Work panel's "Not interested" outcome in the popup and Focus Mode) calls askLostReason
   after its own write. The one prompt (src/components/LostReasonPrompt.tsx, mounted once in AppLayout)
   answers it and saves through lead_set_lost_reason. A prompt mounted in the shell outlives the row that
   asked (Outreach archives a Not interested row, so a prompt anchored to it would vanish).
   Bulk status changes do not ask: those leads read "Reason not recorded" until someone adds one. */
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { lostReasonProblem } from '@/lib/lostReason';
import { refusalText } from '@/lib/salesCrm';

export const LOST_REASON_ASK_EVENT = 'lost-reason-ask';

export interface LostReasonAsk {
  leadId: string;
  businessName?: string | null;
  /** The reason already recorded, when correcting one. */
  reason?: string | null;
  note?: string | null;
}

export function askLostReason(ask: LostReasonAsk): void {
  if (!ask.leadId || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LostReasonAsk>(LOST_REASON_ASK_EVENT, { detail: ask }));
}

export type LostReasonSave = { ok: boolean; unchanged?: boolean; error?: string };

/** The one write (role + ownership checked, History in the same transaction). */
export async function saveLostReason(leadId: string, reason: string, note: string | null): Promise<LostReasonSave> {
  const problem = lostReasonProblem(reason, note);
  if (problem) return { ok: false, error: problem };
  const r = await leadRpc('lead_set_lost_reason', { _lead_id: leadId, _reason: reason, _note: note?.trim() || null });
  if (!r.ok) return { ok: false, error: refusalText(String(r.error ?? '')) || 'Not saved' };
  notifyLeadChanged(leadId);
  return { ok: true, unchanged: !!r.unchanged };
}
