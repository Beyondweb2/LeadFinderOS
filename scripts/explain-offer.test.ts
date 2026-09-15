/* ════════════════════════════════════════════════════════════════════════════════════════════════
   explain_offer — THE FULL PITCH, AND THE THREE VARIABLES THAT CAN KILL A SEND.

   🔴 THE RISK PAUL NAMED: {{3}} is the sign-up link, and nothing had ever sent an onboarding link as
   a variable on a template whose WHOLE MESSAGE is that link. An empty Meta parameter is rejected
   outright and takes the send with it — that is how video_template failed for its entire life.
   The link cannot go blank (resolveOnboardingFollowupVars refuses with a named reason;
   templateBodyParams throws on an empty one), and this suite pins the third variable's guard plus
   the two the body prints beside it.

   ⛔ AND THE PRICES. The body quotes £99 and £29.99 as LITERAL TEXT, because it mirrors what Meta
   registered — interpolating the constants would make the Inbox show a figure Meta is not sending
   the moment one moves. So the drift has to be caught instead: if a price constant changes and this
   body does not, the build fails and somebody re-registers at Meta rather than discovering it in a
   customer's message.

   Run: npx tsx scripts/explain-offer.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { READABLE_TEMPLATE_BODIES } from "../src/lib/templateBodies.ts";
import { WA_TEMPLATE_REQS } from "../src/lib/whatsappTemplates.ts";
import { CONTINUATION_TEMPLATES, isColdOutreachTemplate } from "../src/lib/coldOutreach.ts";
import { FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP } from "../src/lib/findableOffer.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const body = READABLE_TEMPLATE_BODIES["explain_offer"];
const LINK = "https://findable.live/onboarding/acme-abc123/?lead=1";

console.log("── ⛔ THE PRICES MUST MATCH THE CONSTANTS, OR META IS OUT OF DATE ──");
{
  ok(!!body, "explain_offer has a readable body");
  const text = body!("", LINK, "plumbers", undefined, undefined, "Wisbech");
  ok(text.includes(`£${FINDABLE_SETUP_PRICE_GBP} to start`),
     `the setup price in the body is £${FINDABLE_SETUP_PRICE_GBP} — if this fails, the CONSTANT moved and Meta still has the old wording`);
  ok(text.includes(`After that £${FINDABLE_MONTHLY_GBP} a month`),
     `the monthly in the body is £${FINDABLE_MONTHLY_GBP} — same: re-register at Meta, then change this string`);
  /* §1: no surface may name one figure without the other. */
  ok(text.includes(`£${FINDABLE_SETUP_PRICE_GBP}`) && text.includes(`£${FINDABLE_MONTHLY_GBP}`),
     "both halves of the offer appear — never one figure alone (CLAUDE.md §1)");
}

console.log("\n── ⛔ THE LINK IS THE MESSAGE: it must always be present in the rendered body ──");
{
  const text = body!("", LINK, "plumbers", undefined, undefined, "Wisbech");
  ok(text.includes(LINK), "the sign-up link is rendered");
  ok(text.trim().length > 200, "and the body is the full pitch, not a truncated one");
}

console.log("\n── ⚠️ THE TWO VARIABLES THAT DEGRADE, AND WHAT THEY DEGRADE TO ──");
{
  /* The Inbox transcript has no lead row to read, so both legitimately fall back HERE. The SEND
     path refuses instead — send-whatsapp-message rejects a blank town or trade for any template
     that declares one, because an empty Meta parameter kills the whole message. */
  const noTown = body!("", LINK, "plumbers", undefined, undefined, undefined);
  ok(noTown.includes("in your area"), "a missing town reads 'in your area' in the transcript, never an empty gap");
  const noTrade = body!("", LINK, undefined, undefined, undefined, "Wisbech");
  ok(noTrade.includes("businesses in Wisbech"), "a missing trade reads 'businesses', never an empty gap");
  ok(!noTown.includes("  ") && !noTrade.includes("  "), "no double space where a variable was dropped");
}

console.log("\n── ⛔ THE TRADE IS PLURAL, AND THE VOWEL BLOCK MUST NOT APPLY ──");
{
  /* The whole reason audit_followup was re-registered: normaliseTrade's article check held 17% of
     the book, almost all accountants and electricians. This body has no article either. */
  for (const [raw, want] of [["electricians", "electricians"], ["accountant", "accountants"],
                             ["plumbing", "plumbers"], ["locksmiths", "locksmiths"]]) {
    const t = body!("", LINK, raw, undefined, undefined, "Leeds");
    ok(t.includes(`for ${want} in Leeds`), `"${raw}" renders "for ${want} in Leeds"`);
  }
}

console.log("\n── ⛔ CLASSIFICATION AND THE PICKER ──");
{
  ok(CONTINUATION_TEMPLATES.has("explain_offer"), "it is a CONTINUATION — Inbox only, into a live conversation");
  ok(!isColdOutreachTemplate("explain_offer"), "so the phone-history seatbelt does not refuse it");
  const reqs = (WA_TEMPLATE_REQS as Record<string, { needsUrl: boolean; needsAudit: boolean }>)["explain_offer"];
  ok(!!reqs, "it is in the picker's requirements map");
  ok(reqs?.needsAudit === false, "needsAudit is FALSE — its link is the sign-up, not a report, so it never waits on an audit");
  ok(reqs?.needsUrl === false, "needsUrl is FALSE — 'url' means the claim link and gates on a share_token no Findable lead has");
}

console.log("\n── ⚠️ NO HEDGE, AND NO RETIRED PRICE (the client-copy rule, applied here directly) ──");
{
  const text = body!("", LINK, "plumbers", undefined, undefined, "Wisbech").toLowerCase();
  for (const banned of ["49.99", "19.99", "founder", "eight weeks", "56 days", "we do not promise", "anyone who promises"]) {
    ok(!text.includes(banned), `the body does not say "${banned}"`);
  }
  ok(text.includes("four weeks"), "and it does say four weeks — the current cycle");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
