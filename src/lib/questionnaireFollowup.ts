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
   replied at all (before any report). ONE variable: {{1}} = business name. It opens "Hi," (no
   first-name greeting), so a blank business name just degrades to "your business" and still reads
   naturally — there is no blank-name problem here. Registered at Meta 2026-08-22 as Marketing,
   locale "en". Reproduced character-for-character. Shared so the SPA preview and the edge send agree. */
export function contactFollowupBody(businessName: string): string {
  return `Hi, just following up on my message, is this the right number for ${businessName || "your business"}? Ran a quick check on how the business shows up when people ask AI like ChatGPT for local recommendations, worth a quick look if you're interested. No bother if not. Paul, findable`;
}
