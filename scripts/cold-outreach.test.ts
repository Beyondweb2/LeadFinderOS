/* ============================================================
   WHICH TEMPLATES MAY NEVER GO TO A NUMBER WE HAVE MESSAGED

   ⛔ THE BUG THIS PINS (2026-09-02): the phone-history seatbelt read
   `templateName === "initial_contact"`. The audit-first flow began queueing
   `audit_result_hook`, and the guard — keyed to a name, not a property — stopped applying.
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
ok(isColdOutreachTemplate("audit_result_hook"), "audit_result_hook is cold — THE FIX");

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
ok(!isColdOutreachTemplate("re_engage"),
   "re_engage is a continuation — it EXISTS for leads with history, so guarding it would block its only audience");

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
ok(isColdOutreachTemplate("re_engage_cold"), "re_engage_cold is NOT re_engage");
ok(isColdOutreachTemplate("pre_engage"), "pre_engage does not match re_engage as a substring");

console.log("\n── THE SET ITSELF ──");
ok(CONTINUATION_TEMPLATES.size === 8, `8 continuations declared (got ${CONTINUATION_TEMPLATES.size})`);
ok(!CONTINUATION_TEMPLATES.has("initial_contact"), "the opener is never in the exempt set");
ok(!CONTINUATION_TEMPLATES.has("audit_result_hook"), "the hook is never in the exempt set");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
