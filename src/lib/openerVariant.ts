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

/**
 * The SHORT opener (2026-10-15): "Hey, is this {{1}}?" / "Thanks". Marketing, English, submitted to Meta
 * 2026-10-15. {{1}} is the CLEANED business name (src/lib/cleanBusinessName.ts, via CLEAN_NAME_TEMPLATES).
 * ⛔ NOT a flag: Meta's LIVE status is the gate (_shared/template-status.ts) — the queue and the Inbox
 * sender refuse it with Meta's own word until Meta approves it, and the day it does, nothing changes here.
 */
export const INITIAL_OPENER_C = 'initial_contact_short';

/**
 * The QUESTION opener (Paul, 2026-11-15): "Hi mate, do you build websites or do SEO or AI visibility?". English, NO variables,
 * no header, footer or buttons. Meta approval was in progress when it was added; Paul: treat it as approved.
 * ⛔ NOT a flag: Meta's LIVE status is the gate (_shared/template-status.ts), exactly as for the short opener — the queue and the
 * Inbox sender refuse it with Meta's word while Meta says it is pending/rejected, and when Meta cannot be asked (UNKNOWN) Meta
 * decides on the send and a refusal comes back as the failed message with Meta's reason. WhatsApp-only (not in INITIAL_OPENERS).
 */
export const INITIAL_OPENER_D = 'initial_question';

/**
 * The LINK opener (Paul, 2026-11-22; src/lib/initialWithLink.ts): one variable, a per-lead tracking code in
 * https://leadfinderos.com/go/{{1}}. In review at Meta (ID 1084953241232593); Paul: treat it as approved — no gate, and a Meta
 * refusal shows as the normal failed send. WhatsApp-only, and only for LeadFinderOS-style campaigns (checked at send).
 */
export const INITIAL_OPENER_E = 'initial_with_link';
export const INITIAL_WITH_LINK_APPROVED = true;

/** The two openers the SMS lane carries (and its parity tests pin), display order: the original first. The short opener is
 *  WhatsApp-only and is NOT here — see WHATSAPP_OPENERS. */
export const INITIAL_OPENERS = [INITIAL_OPENER_A, INITIAL_OPENER_B] as const;

/** Every cold WhatsApp opener (what isInitialOpener answers for). */
/* initial_question (INITIAL_OPENER_D) is NOT here: Paul, 2026-11-15 — it is a follow-up, not an opener (coldOutreach.ts). */
export const WHATSAPP_OPENERS = [INITIAL_OPENER_A, INITIAL_OPENER_B, INITIAL_OPENER_C, INITIAL_OPENER_E] as const;
export type InitialOpener = (typeof INITIAL_OPENERS)[number];

/** ⛔ THE COLD OPENER IS THE ORIGINAL (Paul, 2026-11-02, RED since 25 Oct): the short opener was ramped to about 200 a day just
 *  before the rating fell, so a send that names it goes as initial_contact, every country, at both senders. A queued lead keeps
 *  the name it was stored with; what goes, and what is recorded, is the original. */
export function coldOpenerFor(name: string): string {
  return name === INITIAL_OPENER_C ? INITIAL_OPENER_A : name;
}

const OPENER_SET: ReadonlySet<string> = new Set(WHATSAPP_OPENERS);

/** True when this template is one of the initial cold openers. */
export function isInitialOpener(name: string | null | undefined): boolean {
  return OPENER_SET.has(String(name ?? '').trim());
}

/** Is this opener approved at Meta (and so sendable)? Anything that is not an opener: false. */
export function openerApproved(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim();
  if (n === INITIAL_OPENER_A) return true;
  if (n === INITIAL_OPENER_B) return INITIAL_OPENER_V2_APPROVED;
  if (n === INITIAL_OPENER_C) return true;   // Meta's live status decides, server-side — not a constant here
  if (n === INITIAL_OPENER_D) return true;   // same: Meta's live status decides, server-side
  if (n === INITIAL_OPENER_E) return INITIAL_WITH_LINK_APPROVED;   // Paul, 2026-11-22: treat as approved
  return false;
}
