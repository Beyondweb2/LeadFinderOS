/* ============================================================
   questionnaire_followup — the pieces BOTH sides need, in a Deno-free module.

   The edge sender (supabase/functions/_shared/whatsapp-send.ts) imports these to build the send
   and the stored transcript body; the SPA's lead-card section imports them to render the preview
   the operator confirms. One copy, so the preview and the send cannot drift — the same reason
   findableOffer.ts is a src/lib file. ⚠️ Keep this file free of imports and Deno/browser globals:
   whatsapp-send.ts has top-level Deno.env reads, which is exactly why the SPA cannot import THAT
   file and why this one exists.
   ============================================================ */

/** First word of a contact name — "Ronnie Simms" → "Ronnie". DERIVED AT SEND TIME, NEVER STORED
 *  (the stored fact is the full name; a stored derivative would drift the moment the name is
 *  edited). Empty in, empty out — the caller decides what refusal looks like. */
export function firstNameFrom(contactName: string | null | undefined): string {
  return (contactName ?? "").trim().split(/\s+/)[0] ?? "";
}

/* The body Paul submitted to Meta 2026-08-17, reproduced exactly. {{1}} = owner first name,
   {{2}} = business name. Display copy: Meta renders what the prospect receives from its own
   registered text; this decides the transcript the operator reads and the preview they confirm. */
export function questionnaireFollowupBody(firstName: string, businessName: string): string {
  return `Hi ${firstName || "there"}, saw your form come through for ${businessName || "your business"}, thanks for that. Everything is ready this end, it's just the payment step left and then I get started on the work. If you had any questions before going ahead, just reply here and I'll answer them.

Paul, findable`;
}

/* hook_followup — the report follow-up to a lead who got the audit_reply (their AI-visibility
   report) and went quiet. {{1}} = owner first name, {{2}} = business name. Same shared-module
   reasoning as questionnaireFollowupBody: the SPA preview and the edge sender both import this, so
   what the operator confirms and what Meta sends cannot drift. Registered at Meta 2026-08-22 as
   Marketing, locale "en". Reproduced character-for-character from the registration. */
export function hookFollowupBody(firstName: string, businessName: string): string {
  return `Hi ${firstName || "there"}, following up on the report I sent for ${businessName || "your business"}. The businesses AI is naming instead of you are picking up work you could be getting. Happy to walk you through how we fix that, no charge to take a look, just reply here. Paul, findable`;
}

/* contact_followup — the EARLIER-stage nudge: a lead who got the initial_contact opener and never
   replied at all (before any report). RE-EDITED + RE-APPROVED AT META 2026-08-22 to this short body,
   which has ZERO variables — the {{1}} business-name placeholder is gone. `vars` was changed to []
   in BOTH allowlists to match (whatsapp-send.ts WA_TEMPLATES + process-whatsapp-queue's mirror), or
   Meta would reject the send #132000 (param count). The `businessName` arg is now unused (kept so the
   two call sites `(b) => contactFollowupBody(b)` don't need touching). Reproduced character-for-
   character from WhatsApp Manager; shared so the SPA preview and the edge send agree. */
export function contactFollowupBody(businessName?: string): string {
  void businessName;
  return "Hi, did you get my last message? Paul";
}
