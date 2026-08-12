/* ============================================================
   THE PAYMENT CONFIRMATION TEMPLATE — ITS NAME AND ITS PARAMETER SHAPE.

   ⛔ WHY THIS EXISTS. The last template added to this codebase, re_engage, was registered with a
   GUESSED variable count and Meta rejected every send: #132000 "number of localizable_params (1)
   does not match the expected number of params (2)". Nothing local caught it — the shape is only
   wrong relative to a registration living at Meta, so the code looked fine and the sends died.
   This suite pins the two properties that would fail the same way for payment_recieved: the exact
   NAME, and exactly ONE body parameter carrying the business name.

   ⛔ AND THE MISSPELLING IS THE POINT. Meta matches the registered name exactly. "payment_received"
   — the correct English spelling — is a DIFFERENT template that does not exist, and a send would
   fail template-not-found. Asserted by name so an editor, a linter or a well-meaning reader cannot
   quietly correct it.

   These drive the REAL exported functions from _shared/whatsapp-send.ts, not a restatement of them.
   ============================================================ */
import {
  WA_TEMPLATES, claimTemplatePayload, toWhatsAppNumber, TEMPLATES_NEEDING_REAL_NAME,
} from "../supabase/functions/_shared/whatsapp-send.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const NAME = "payment_recieved";

console.log("── ⛔ THE MISSPELLED NAME IS THE REGISTERED ONE ──");
ok(NAME in WA_TEMPLATES, `${JSON.stringify(NAME)} is registered (i before e — matches Meta)`);
ok(!("payment_received" in WA_TEMPLATES),
  `the correctly-spelled "payment_received" is NOT registered — it would fail template-not-found`);
ok(WA_TEMPLATES[NAME]?.lang === "en", "language is en");

console.log("\n── ⛔ EXACTLY ONE VARIABLE, AND IT IS THE BUSINESS NAME ──");
/* This is the assertion that would have caught the re_engage rejection before it shipped. */
ok(WA_TEMPLATES[NAME]?.vars.length === 1, `declares ONE variable (got ${WA_TEMPLATES[NAME]?.vars.length})`);
ok(WA_TEMPLATES[NAME]?.vars[0] === "name", `and it is "name" (got ${JSON.stringify(WA_TEMPLATES[NAME]?.vars[0])})`);

console.log("\n── THE PAYLOAD META ACTUALLY RECEIVES ──");
{
  const p = claimTemplatePayload(NAME, "en", "RG Locksmiths cambs", "") as {
    type: string; template: { name: string; language: { code: string }; components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> };
  };
  ok(p.type === "template", "payload type is template (not text) — this is what bypasses the 24h window");
  ok(p.template.name === NAME, `payload carries the misspelled name verbatim: ${p.template.name}`);
  ok(p.template.language.code === "en", "language code en");
  const params = p.template.components[0].parameters;
  ok(params.length === 1, `EXACTLY ONE body parameter (got ${params.length}) — a mismatch is Meta #132000`);
  ok(params[0].text === "RG Locksmiths cambs", `{{1}} is the business name: ${JSON.stringify(params[0].text)}`);
  /* No url variable, so nothing to resolve and nothing to gate on a generated site — the claimUrl
     argument above is deliberately empty and must not leak into the payload. */
  ok(!JSON.stringify(p).includes('""') || params.length === 1, "no empty second parameter is sent");
}

console.log("\n── ⛔ AN UNREGISTERED NAME REFUSES RATHER THAN GUESSING ──");
/* The guard that turns a typo into a loud failure instead of a wrong-shaped send. */
{
  let threw = false;
  try { claimTemplatePayload("payment_received", "en", "X", ""); } catch { threw = true; }
  ok(threw, "the correctly-spelled name THROWS — it is not registered, and the shape is not guessed");
}

console.log("\n── GUARD 2: NO PHONE IS A CLEAN SKIP, NOT A SEND ──");
/* toWhatsAppNumber is the only thing standing between a blank lead phone and a Graph call. Every
   absent shape must return null so the caller's `if (!to) return` fires. */
for (const [raw, why] of [["", "empty"], ["   ", "whitespace"], ["-", "punctuation only"], ["+", "plus only"]] as const) {
  ok(toWhatsAppNumber(raw, "UK") === null, `${why} phone -> null (caller skips)`);
}
ok(toWhatsAppNumber("07762 200339", "UK") === "447762200339", "a real UK mobile normalises to E.164 digits");

console.log("\n── THE GREETING GUARD IS NOT BORROWED FOR THIS TEMPLATE ──");
/* TEMPLATES_NEEDING_REAL_NAME throws on a blank name. payment_recieved is deliberately NOT in it:
   the caller skips on a blank name instead, so a missing name can never 500 the webhook from inside
   templateBodyParams. Both behaviours refuse to send a placeholder greeting; only one of them is
   safe inside a Stripe handler. */
ok(!TEMPLATES_NEEDING_REAL_NAME.has(NAME),
  "payment_recieved does NOT throw on a blank name — stripe-webhook skips before it gets here");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
