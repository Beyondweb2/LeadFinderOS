/* ══ ASK WHY THEY SAID NO — on request only ═══════════════════════════════════════════════════════
   (2026-10-23, Paul: "I always skip it") Marking a lead Not interested no longer opens this prompt by itself. It opens only from the lead's "Why they said no" line (Add / Change).
   The one prompt (src/components/LostReasonPrompt.tsx, mounted once in AppLayout) answers askLostReason and
   saves through lead_set_lost_reason. Bulk status changes never asked: those leads read "Reason not recorded". */
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
