/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COLD OUTREACH vs CONTINUATION — which templates may never go to a number we have messaged.

   🔴 WHY THIS EXISTS. The phone-history seatbelt in process-whatsapp-queue was written on
   2026-08-18 as `if (templateName === "initial_contact")`, when initial_contact was the only cold
   opener the queue could carry. On 2026-09-02 the audit-first flow started queueing
   `video_template` instead — and the guard, keyed to a NAME rather than to a PROPERTY, stopped
   applying to the traffic that had replaced it. Measured that afternoon: 16 hook sends, 12 of them
   to numbers already in conversation, 9 of those had already replied and 4 were marked
   not_interested. No guard was deleted; the sends simply walked around the one that mattered.

   ⛔ SO THE TEST IS A PROPERTY OF THE TEMPLATE, NOT A LIST OF THE ONES WE HAPPEN TO SEND TODAY.
   The next template will be added by someone who has never read this file, and it must be covered
   the moment it is registered rather than the day someone remembers this guard exists.

   ⛔ UNKNOWN AND BLANK ARE COLD. This is the absent-value law (CLAUDE.md §6) pointed the safe way:
   every other guard in this codebase lets absence pass, and this one must not, for the same reason
   suppression fails closed. If we cannot tell what a template is for, we do not know it is safe to
   send to someone we have already contacted. The cost of being wrong here is one message not sent,
   visible in the delivery status; the cost of being wrong the other way is messaging a business
   that told us no. A new FOLLOW-UP template therefore has to be named below before it can reach an
   existing conversation — it fails safe and it fails loudly.

   ⚠️ THIS IS NOT `TemplateGroup` AND MUST NOT BE MERGED WITH IT. whatsappTemplates.ts's `group`
   says so itself: "for optional visual labelling only, NOT for auto-hiding". It also disagrees with
   this question on a real case — `re_engage_49` is group 'opener' while being, by design, a message to
   a lead who already has a conversation. A labelling field is not a safety field.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Templates whose whole purpose is to reach a conversation that already exists. Exempt from the
 *  phone-history guard, because applying it would make them unsendable to exactly the leads they
 *  are written for. Each entry is a deliberate decision, not a convenience. */
export const CONTINUATION_TEMPLATES: ReadonlySet<string> = new Set([
  // The reply chain: all four are answers to, or chases of, a live thread.
  "audit_reply",
  /* ⛔ audit_reply_warm IS THE WARM VERSION AND MUST BE NAMED HERE, which is exactly what this
     file's header demands of a new follow-up. It is defined by going to a lead who has ALREADY
     answered the opener — so leaving it unlisted would make it COLD by default (correct, safe
     default) and the phone-history seatbelt would refuse it for every single lead it is written
     for. It would be selectable, appear to send, and be dropped as phone_already_contacted. */
  "audit_reply_warm",
  "hook_followup",
  "contact_followup",
  "report_followup",
  /* ⛔ audit_followup IS A CONTINUATION, AND ITS NAME IS NOT WHY. It was listed as COLD for a few
     hours on the reasoning that it opens the pitch — the prospect has had no report yet. That reads
     the word "cold" as "has not seen a report", and in this file it means something else:
     MAY NOT REACH AN EXISTING CONVERSATION. That is the property the guard tests, and it is the
     2026-09-02 lesson — test the property, never the instance.
     By its own definition this message goes to a lead who REPLIED to initial_contact, so it only
     ever reaches a conversation that already exists. Left cold it was refused for every lead it was
     written for: the seatbelt's query is `.eq(phone).neq(status,'failed')` with NO direction
     filter, so the outbound opener AND the inbound reply both match it. Exactly the trap
     audit_reply_warm's note above describes.
     ⚠️ THE STATED COST, PAUL'S CALL 2026-09-15 AND THE SAME EXPOSURE re_engage_49 ALREADY CARRIES:
     a continuation is exempt from the phone-history seatbelt, so if audit_followup were ever
     QUEUED to a number with no history it would go out as a first touch. Nothing else catches that
     — process-whatsapp-queue's already-sent guard needs prior contact to trip, and a stranger has
     none. The containment is operational rather than structural: **it is sent from the Inbox, never
     the queue.** If that ever changes, this exposure is the thing to close first. */
  "audit_followup",
  /* audit_followup_call — the same note with a call offer instead of a report link, 2026-09-16.
     Same classification for the same reason: it is written for a lead who has already answered, so
     COLD would refuse it for every lead it exists for.
     ⛔ AND ITS CLASSIFICATION IS NOW LOAD-BEARING TWICE. Since 2026-09-16 rivalHookDecision reads
     this set: a rival-naming CONTINUATION that cannot fill three names holds, where a cold one
     falls back to video_template. Listing it here is therefore what stops a cold opener being
     substituted into a live thread — not only what lets it send at all.
     ⚠️ Same accepted exposure as its sibling: exempt from the phone-history seatbelt, so queueing
     it to a number with no history would send a first touch. It is never queued — it carries no
     audit_url, so the drip cannot select it, and the Inbox is the only door. */
  "audit_followup_call",
  /* explain_offer — the full pitch, Inbox only, 2026-09-15. Same reasoning as audit_followup above:
     it is sent into a conversation that already exists, so COLD would refuse it for every lead it
     is written for. ⚠️ It carries the same accepted exposure — exempt from the phone-history
     seatbelt, so queueing it to a number with no history would send a first touch. It is never
     queued: process-whatsapp-queue cannot select it anyway (no audit_url, and the already-sent
     guard is template-blind), and the Inbox is the only door. */
  "explain_offer",
  /* explain_offer_v2 — the same pitch with the proof paragraph, 2026-09-16. Same classification, same
     reasoning, same accepted exposure: Inbox only, never queued. */
  "explain_offer_v2",
  // Post-engagement: the lead has asked for something or paid for it.
  "onboarding_followup",
  "questionnaire_followup",
  "payment_recieved", // Meta's registered spelling — do not "correct" it
  /* ⚠️ re_engage_49 is the one that looks wrong and is right. It exists to restart a conversation
     that went quiet, so a guard reading "never message a number with history" would block the one
     template written for people who have history. Same reasoning as its needsAudit note in
     whatsappTemplates.ts. */
  "re_engage_49",
]);

/** True when this template is a COLD approach — a first contact that must never land on a number
 *  we have already messaged, whatever lead row it arrives on. Unknown and blank are cold. */
export function isColdOutreachTemplate(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim();
  return !CONTINUATION_TEMPLATES.has(n);
}
