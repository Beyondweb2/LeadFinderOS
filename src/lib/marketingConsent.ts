/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MARKETING OPT-OUT vs SERVICE MESSAGES (Paul, 2026-09-30 integrity pass).
   "If a paying client explicitly asks to stop receiving marketing messages, the system must respect
   that request. Being a paying client must not override an explicit marketing opt-out."
   ⛔ AN EXPLICIT OPT-OUT (contact_suppressions.reason = OPT_OUT_REASON) BLOCKS EVERY MARKETING SEND:
   - every automated sender already refuses ANY suppressed row (_shared/suppression.ts checkSuppressed);
   - a MANUAL template from the Inbox (send-whatsapp-message) is refused too, unless it is a SERVICE
     template below. Before this pass the Inbox refused only Wrong number, so a follow-up pitch could
     still be sent by hand to someone who had said stop.
   ⚠️ WHAT IS NOT MARKETING, AND WHY:
   - a free-text reply inside Meta's 24-hour window — they wrote to us; a person answering is not
     outreach (the same line the Wrong number rule draws);
   - SERVICE_TEMPLATES: messages a paying client needs for the service they bought. Each entry is a
     deliberate decision. Unknown and blank are MARKETING (the absent-value law, pointed the safe way).
   Pure and edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The contact_suppressions reason an explicit "stop" writes (conversation triage and the admin's
 *  confirmed Suppress). A plain "no thanks" writes replied_no / not_interested — a decline, which the
 *  automated senders refuse but which is not an opt-out, and the lead can be revived. */
export const OPT_OUT_REASON = 'opted_out';

/** Templates that carry the service a client paid for — never marketing. */
export const SERVICE_TEMPLATES: ReadonlySet<string> = new Set([
  'payment_recieved', // Meta's registered spelling — the payment confirmation
  'questionnaire_followup', // chases the paid client's own setup questionnaire
]);

export function isServiceTemplate(name: string | null | undefined): boolean {
  return SERVICE_TEMPLATES.has(String(name ?? '').trim());
}

/** Does an explicit opt-out refuse this template? `optedOut` null = the lookup failed → refuse
 *  (fails closed, like every suppression check). */
export function optOutBlocksTemplate(templateName: string | null | undefined, optedOut: boolean | null): boolean {
  if (!String(templateName ?? '').trim()) return false; // free text — not a template send
  if (optedOut === false) return false;
  return !isServiceTemplate(templateName);
}

export const OPT_OUT_REFUSAL_REASON = 'This number asked to stop — marketing templates are not sent to it. Service messages and replies to their own message still are.';
