/* ============================================================
   WHICH TEMPLATES MAY NEVER GO TO A NUMBER WE HAVE MESSAGED

   ⛔ THE BUG THIS PINS (2026-09-02): the phone-history seatbelt read
   `templateName === "initial_contact"`. The audit-first flow began queueing
   `video_template`, and the guard — keyed to a name, not a property — stopped applying.
   12 of 16 hook sends went to numbers already in conversation; 4 were marked not_interested.

   ⛔ AND THE DEFAULT MUST BE COLD. Written as a list of cold templates, the NEXT template added
   would default to exempt and repeat this incident exactly. The unknown/blank cases below are the
   whole point of the file.
   ============================================================ */
import { isColdOutreachTemplate, CONTINUATION_TEMPLATES } from "../src/lib/coldOutreach.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── THE TWO TEMPLATES THIS INCIDENT WAS ABOUT ──");
ok(isColdOutreachTemplate("initial_contact"), "initial_contact is cold (the original guard)");
ok(isColdOutreachTemplate("video_template"), "video_template is cold — THE FIX");

console.log("\n── EVERY OTHER COLD OPENER THE QUEUE CAN CARRY ──");
for (const t of ["book_call", "booking_page_intro", "no_website_barbers", "barber_poor_website",
                 "booking_switch_barbers", "barber_fresha_booksy"]) {
  ok(isColdOutreachTemplate(t), `${t} is cold`);
}

console.log("\n── CONTINUATIONS ARE EXEMPT, OR THEY BECOME UNSENDABLE ──");
for (const t of ["audit_reply", "hook_followup", "contact_followup", "report_followup",
                 "onboarding_followup", "questionnaire_followup", "payment_recieved"]) {
  ok(!isColdOutreachTemplate(t), `${t} is a continuation`);
}
ok(!isColdOutreachTemplate("re_engage_49"),
   "re_engage_49 is a continuation — it EXISTS for leads with history, so guarding it would block its only audience");

console.log("\n── ABSENCE IS COLD (the safe direction, and the reason this file exists) ──");
ok(isColdOutreachTemplate(null), "null is cold");
ok(isColdOutreachTemplate(undefined), "undefined is cold");
ok(isColdOutreachTemplate(""), "empty string is cold");
ok(isColdOutreachTemplate("   "), "whitespace is cold");
ok(isColdOutreachTemplate("a_template_nobody_has_written_yet"), "an UNKNOWN template is cold, not exempt");
ok(isColdOutreachTemplate("AUDIT_REPLY"), "wrong case does NOT get an exemption — Meta names are exact");
ok(!isColdOutreachTemplate(" audit_reply"), "a leading space trims to a real continuation (the name is trimmed, never fuzzy-matched)");
ok(!isColdOutreachTemplate("audit_reply "), "trailing space trims to a real continuation");

console.log("\n── SUBSTRING TRAPS (CLAUDE.md §4: 'bing' matches plumbing) ──");
ok(isColdOutreachTemplate("audit_reply_v2"), "audit_reply_v2 is NOT audit_reply — no prefix matching");
ok(isColdOutreachTemplate("re_engage_cold"), "re_engage_cold is NOT re_engage_49");
ok(isColdOutreachTemplate("pre_engage"), "pre_engage does not match re_engage_49 as a substring");

console.log("\n── THE SET ITSELF ──");
/* ⛔ THE EXACT SET, NOT ITS SIZE. This was `size === 8`, a tripwire meant to force a deliberate
   decision whenever a template joins the exempt list — and it worked: adding audit_reply_warm on
   2026-09-08 broke it. But nothing runs these scripts, so it sat red for a day and the only thing
   it said was "8 (got 9)", which tells you a number changed, not WHICH template was exempted from
   the guard that stops us cold-messaging someone we have already contacted.
   Listing the members keeps the tripwire AND names the change. Adding a template here is still a
   two-place edit, on purpose: the point is that exempting one is a decision, not a convenience. */
const EXPECTED_CONTINUATIONS = [
  "audit_reply",
  "audit_reply_warm",
  "hook_followup",
  "contact_followup",
  "report_followup",
  "onboarding_followup",
  "questionnaire_followup",
  "payment_recieved", // Meta's registered spelling — do not "correct" it
  "re_engage_49",
  /* audit_followup — added 2026-09-15, Paul's call, and the tripwire did its job: it went red on
     the classification change and named the template rather than a number.
     THE DECISION IT IS RECORDING: this is the second step of the two-step flow, sent to a lead who
     REPLIED to initial_contact. It only ever reaches a conversation that already exists, so cold
     would refuse it for every lead it is written for (the seatbelt matches the inbound reply as
     well as the outbound opener — no direction filter).
     ⚠️ THE COST, ACCEPTED AND THE SAME ONE re_engage_49 CARRIES: exempt means that if it were ever
     QUEUED to a number with NO history it would go out as a first touch. It is sent from the Inbox,
     never the queue — the containment is operational, not structural. */
  "audit_followup",
  /* explain_offer — added 2026-09-15 with audit_followup's reasoning: Inbox-only, sent into a live
     conversation, so cold would refuse it for its whole audience. Same accepted cost. */
  "explain_offer",
  /* explain_offer_v2 — 2026-09-16, the same pitch with the proof paragraph. Same decision. */
  "explain_offer_v2",
].sort();
const actual = [...CONTINUATION_TEMPLATES].sort();
const added = actual.filter((t) => !EXPECTED_CONTINUATIONS.includes(t));
const removed = EXPECTED_CONTINUATIONS.filter((t) => !actual.includes(t));
ok(
  added.length === 0 && removed.length === 0,
  added.length || removed.length
    ? `the exempt set changed — NEWLY EXEMPT: [${added.join(", ") || "none"}] NO LONGER EXEMPT: [${removed.join(", ") || "none"}]. `
      + `Anything newly exempt can now be sent to a number we have already messaged: is that right?`
    : `all ${actual.length} continuations are the expected ones`,
);
ok(!CONTINUATION_TEMPLATES.has("initial_contact"), "the opener is never in the exempt set");
ok(!CONTINUATION_TEMPLATES.has("video_template"), "the hook is never in the exempt set");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
