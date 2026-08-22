/* ============================================================
   THE INBOX'S READABLE BODIES MUST MATCH THE SENT BODIES, EXACTLY.

   src/lib/templateBodies.ts renders the human copy the Inbox shows for a row the whatsapp_sends DB
   trigger stored as a bare slug ("[initial_contact]"). It is a Deno-free MIRROR of
   whatsapp-send.ts's WA_TEMPLATE_BODIES (the SPA cannot import that file — it has top-level Deno.env
   reads). A mirror drifts; this test is what stops it. It asserts, for EVERY template:
     • the readable body renders identically to the send-side body across sample inputs, and
     • every send-side template name has a readable body (a new template can't ship display-blind).

   Run: deno run --sloppy-imports --allow-env scripts/template-bodies-parity.test.ts
   ============================================================ */
import { WA_TEMPLATE_BODIES, renderTemplateBody } from "../supabase/functions/_shared/whatsapp-send.ts";
import { READABLE_TEMPLATE_BODIES, readableTemplateBody, isPlaceholderBody } from "../src/lib/templateBodies.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

// Sample inputs exercise every argument the renderers read.
const B = "Acme Plumbing";
const U = "https://x.test/onboard";
const TRADE = "plumber";
const COMP = "Rival Plumbing, Other Co";
const FIRST = "Sam";

console.log("── EVERY SEND-SIDE TEMPLATE RENDERS IDENTICALLY ──");
for (const name of Object.keys(WA_TEMPLATE_BODIES)) {
  const sent = renderTemplateBody(name, B, U, TRADE, COMP, FIRST);
  const mine = READABLE_TEMPLATE_BODIES[name];
  ok(!!mine, `${name}: has a readable body`);
  if (!mine) continue;
  const shown = mine(B, U, TRADE, COMP, FIRST);
  ok(shown === sent, `${name}: readable body === sent body`);
  if (shown !== sent) {
    console.log(`   sent : ${JSON.stringify(sent).slice(0, 120)}`);
    console.log(`   shown: ${JSON.stringify(shown).slice(0, 120)}`);
  }
}

console.log("\n── PLACEHOLDER DETECTION ──");
ok(isPlaceholderBody("[initial_contact]"), "bracketed slug is a placeholder");
ok(isPlaceholderBody("initial_contact"), "bare snake_case is a placeholder");
ok(isPlaceholderBody(""), "empty is a placeholder");
ok(isPlaceholderBody("   "), "whitespace is a placeholder");
ok(isPlaceholderBody(null), "null is a placeholder");
ok(!isPlaceholderBody("Hi, is this the right number for Acme? Cheers"), "real text is NOT a placeholder");
ok(!isPlaceholderBody("Hi there"), "two plain words are NOT a placeholder");

console.log("\n── readableTemplateBody BEHAVIOUR ──");
// A bracketed opener → the real opener copy, filled with the business name.
ok(
  readableTemplateBody("[initial_contact]", "initial_contact", { businessName: B }) ===
    `Hi, is this the right number for ${B}? Cheers`,
  "bracketed initial_contact → readable opener with business name",
);
// Real text is returned unchanged (trimmed).
ok(
  readableTemplateBody("Hi, thanks for getting back.", "audit_reply", { businessName: B }) ===
    "Hi, thanks for getting back.",
  "real body returned unchanged",
);
// Unknown template + placeholder body → empty (caller falls back to a label).
ok(readableTemplateBody("[mystery]", "mystery", { businessName: B }) === "", "unknown template placeholder → empty");
// Empty body, known template → the template's copy. contact_followup is now a zero-variable
// fixed string (re-approved at Meta 2026-08-22), so it does NOT include the business name.
ok(
  readableTemplateBody(null, "contact_followup", { businessName: B }) === "Hi, did you get my last message? Paul",
  "empty contact_followup → the exact re-approved fixed text",
);

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) throw new Error(`${f} parity failures`);
