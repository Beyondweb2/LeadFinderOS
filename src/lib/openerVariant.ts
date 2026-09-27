/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE INITIAL OPENERS — TWO ORDINARY TEMPLATES, CHOSEN PER SEND (Paul, 2026-09-27).

   Two approved cold openers exist: initial_contact (the original) and initial_opener_v2. They are
   normal choices in every template picker. The operator picks the one they want and sends it; for a
   bulk batch they pick it for that batch and the queue sends exactly that.

   🔴 WHAT THIS REPLACED, TWICE.
     · 2026-09-22 → 09-23: a lead-id hash split newly-queued leads ~50/50 between the openers.
     · 2026-09-23 → 09-27: a GLOBAL "selected opener" (whatsapp_outreach_state.initial_opener_template)
       made the other opener unsendable in every picker and at send-whatsapp-message
       (`opener_not_selected`), and fed the Sales bulk queue.
   Both are GONE. There is no split, no hash, no global selection, no substitution and no fallback:
   nothing here reads a stored setting, and nothing decides an opener except the person sending.
   (The column still exists in the database; nothing reads it.)

   ⛔ WHAT STAYS: an opener must be APPROVED at Meta to be sent (INITIAL_OPENER_V2_APPROVED is that
   switch for v2, read by the picker label and the approval gate), and a queued lead is sent the
   template stored on it — process-whatsapp-queue never swaps it.

   Edge-safe leaf (imported by process-whatsapp-queue): no imports.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The ORIGINAL cold opener. */
export const INITIAL_OPENER_A = 'initial_contact';

/** The NEWER opener (registered at Meta 2026-09-22 as `initial_opener_v2`). */
export const INITIAL_OPENER_B = 'initial_opener_v2';

/**
 * 🟢 APPROVED AT META 2026-09-22 (Paul confirmed from WhatsApp Manager). Meta's approval state only.
 * ⚠️ Not inferred from anything: Meta's state is not mirrored here, so a human sets this after looking.
 */
export const INITIAL_OPENER_V2_APPROVED = true;

/** Both openers, display order: the original first. */
export const INITIAL_OPENERS = [INITIAL_OPENER_A, INITIAL_OPENER_B] as const;
export type InitialOpener = (typeof INITIAL_OPENERS)[number];

const OPENER_SET: ReadonlySet<string> = new Set(INITIAL_OPENERS);

/** True when this template is one of the initial cold openers. */
export function isInitialOpener(name: string | null | undefined): boolean {
  return OPENER_SET.has(String(name ?? '').trim());
}

/** Is this opener approved at Meta (and so sendable)? Anything that is not an opener: false. */
export function openerApproved(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim();
  if (n === INITIAL_OPENER_A) return true;
  if (n === INITIAL_OPENER_B) return INITIAL_OPENER_V2_APPROVED;
  return false;
}
