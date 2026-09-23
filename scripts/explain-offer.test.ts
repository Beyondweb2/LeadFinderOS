/* ════════════════════════════════════════════════════════════════════════════════════════════════
   explain_offer AND explain_offer_v2 — THE FULL PITCH, AND THE THREE VARIABLES THAT CAN KILL A SEND.

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

   ⚠️ TWO TEMPLATES SINCE 2026-09-16. explain_offer_v2 is explain_offer with two paragraphs added —
   what a searcher does with the answer, and the proof (941 audits; a locksmith named once in twelve
   questions, then three times) — under the SAME three variables and the SAME video header. Both stay
   sendable; Paul chooses per lead. Every block below therefore runs for BOTH, and the last block
   pins what is specific to v2: that its shape is v1's, that its body is NOT v1's, and that
   "chatgpt" / "gemini" are lowercase because that is what Paul registered.

   Run: npx tsx scripts/explain-offer.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { READABLE_TEMPLATE_BODIES } from "../src/lib/templateBodies.ts";
import { WA_TEMPLATE_REQS } from "../src/lib/whatsappTemplates.ts";
import { CONTINUATION_TEMPLATES, isColdOutreachTemplate } from "../src/lib/coldOutreach.ts";
import { FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP, STALE_OFFER_TEMPLATES } from "../src/lib/findableOffer.ts";
import { getTemplateSendability } from "../src/lib/whatsappTemplates.ts";
import { templateAwaitingApproval } from "../supabase/functions/_shared/whatsapp-send.ts";
import { WHATSAPP_TEMPLATES } from "../src/types/outreach.ts";
/* The real registry, imported (its Deno reads are lazy enough for tsx — template-routing.test.ts
   already relies on this). It is what says a template's SHAPE: vars, order, header. */
import { WA_TEMPLATES } from "../supabase/functions/_shared/whatsapp-send.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const PITCHES = ["explain_offer", "explain_offer_v2"] as const;
const LINK = "https://findable.live/onboarding/acme-abc123/?lead=1";
const render = (name: string, trade?: string, town?: string) =>
  READABLE_TEMPLATE_BODIES[name]!("", LINK, trade, undefined, undefined, town);

for (const name of PITCHES) {
  console.log(`\n════ ${name} ════`);

  console.log("── ⛔ THE PRICES MUST MATCH THE CONSTANTS, OR META IS OUT OF DATE ──");
  {
    ok(!!READABLE_TEMPLATE_BODIES[name], `${name} has a readable body`);
    const text = render(name, "plumbers", "Wisbech");
    ok(text.includes(`£${FINDABLE_SETUP_PRICE_GBP} to start`),
       `the setup price in the body is £${FINDABLE_SETUP_PRICE_GBP} — if this fails, the CONSTANT moved and Meta still has the old wording`);
    /* 2026-09-23: the monthly moved to £99 (12-month minimum) and Meta still has "£29.99 … Stop any
       time". The rule is now: the body matches the constant, OR the template is BLOCKED on every path
       until a corrected version is registered. A stale body that is still sendable fails the build. */
    const current = text.includes(`After that £${FINDABLE_MONTHLY_GBP} a month`);
    const blocked = STALE_OFFER_TEMPLATES.has(name) && templateAwaitingApproval(name) && !getTemplateSendability(name, null, null).ok;
    ok(current || blocked,
       `the monthly in the body is £${FINDABLE_MONTHLY_GBP}, or the template is blocked (picker + server) until re-registered at Meta`);
    /* §1: no surface may name one figure without the other. */
    ok(text.includes(`£${FINDABLE_SETUP_PRICE_GBP}`) && /After that £[0-9.]+ a month/.test(text),
       "both halves of the offer appear — never one figure alone (CLAUDE.md §1)");
  }

  console.log("── ⛔ THE LINK IS THE MESSAGE: it must always be present in the rendered body ──");
  {
    const text = render(name, "plumbers", "Wisbech");
    ok(text.includes(LINK), "the sign-up link is rendered");
    ok(text.trim().length > 200, "and the body is the full pitch, not a truncated one");
    ok(text.trimEnd().endsWith("https://findable.live/"), "and it closes on the plain website URL (added at Meta 2026-09-15 for the prospect who does not click links from strangers)");
  }

  console.log("── ⚠️ THE TWO VARIABLES THAT DEGRADE, AND WHAT THEY DEGRADE TO ──");
  {
    /* The Inbox transcript has no lead row to read, so both legitimately fall back HERE. The SEND
       path refuses instead — send-whatsapp-message rejects a blank town or trade for any template
       that declares one, because an empty Meta parameter kills the whole message. */
    const noTown = render(name, "plumbers", undefined);
    ok(noTown.includes("in your area"), "a missing town reads 'in your area' in the transcript, never an empty gap");
    const noTrade = render(name, undefined, "Wisbech");
    ok(noTrade.includes("businesses in Wisbech"), "a missing trade reads 'businesses', never an empty gap");
    ok(!noTown.includes("  ") && !noTrade.includes("  "), "no double space where a variable was dropped");
  }

  console.log("── ⛔ THE TRADE IS PLURAL, AND THE VOWEL BLOCK MUST NOT APPLY ──");
  {
    /* The whole reason audit_followup was re-registered: normaliseTrade's article check held 17% of
       the book, almost all accountants and electricians. Neither body has an article. */
    for (const [raw, want] of [["electricians", "electricians"], ["accountant", "accountants"],
                               ["plumbing", "plumbers"], ["locksmiths", "locksmiths"]]) {
      const t = render(name, raw, "Leeds");
      ok(t.includes(`for ${want} in Leeds`), `"${raw}" renders "for ${want} in Leeds"`);
    }
  }

  console.log("── ⛔ CLASSIFICATION, THE REGISTRY AND THE PICKER ──");
  {
    ok(CONTINUATION_TEMPLATES.has(name), "it is a CONTINUATION — Inbox only, into a live conversation");
    ok(!isColdOutreachTemplate(name), "so the phone-history seatbelt does not refuse it");
    const reqs = (WA_TEMPLATE_REQS as Record<string, { needsUrl: boolean; needsAudit: boolean }>)[name];
    ok(!!reqs, "it is in the picker's requirements map");
    ok(reqs?.needsAudit === false, "needsAudit is FALSE — its link is the sign-up, not a report, so it never waits on an audit");
    ok(reqs?.needsUrl === false, "needsUrl is FALSE — 'url' means the claim link and gates on a share_token no Findable lead has");
    const entry = WA_TEMPLATES[name];
    ok(!!entry, "it is in the server registry");
    ok(JSON.stringify(entry?.vars) === JSON.stringify(["trade_plural", "town", "onboarding_url"]),
       "three vars, in this order: trade (lowercase plural), town, onboarding link");
    ok(!!entry?.headerVideoUrl, "and it declares the video header — registered with one at Meta, so a body-only payload would be rejected");
    ok(WHATSAPP_TEMPLATES.some((t) => t.value === name), "it is offered in the one sendable list");
  }

  console.log("── ⚠️ NO HEDGE, AND NO RETIRED PRICE (the client-copy rule, applied here directly) ──");
  {
    const text = render(name, "plumbers", "Wisbech").toLowerCase();
    for (const banned of ["49.99", "19.99", "founder", "eight weeks", "56 days", "we do not promise", "anyone who promises"]) {
      ok(!text.includes(banned), `the body does not say "${banned}"`);
    }
    ok(text.includes("four weeks"), "and it does say four weeks — the current cycle");
  }
}

console.log("\n════ explain_offer_v2 IS explain_offer's SHAPE WITH A DIFFERENT BODY ════");
{
  const v1 = WA_TEMPLATES.explain_offer, v2 = WA_TEMPLATES.explain_offer_v2;
  ok(JSON.stringify(v1.vars) === JSON.stringify(v2.vars), "identical variable list, same order — a v2 send fills exactly what a v1 send fills");
  ok(v1.lang === v2.lang, `same language code (${v1.lang})`);
  ok(v2.headerVideoUrl === v1.headerVideoUrl, "same video header asset");

  const t1 = render("explain_offer", "plumbers", "Wisbech");
  const t2 = render("explain_offer_v2", "plumbers", "Wisbech");
  ok(t1 !== t2, "the two bodies DIFFER — v2 is not v1's function registered under a second key");
  ok(t2.includes("instead of googling, and they call whoever gets named. Right now that's not you."),
     "v2 says what a searcher does with the answer");
  ok(t2.includes("I've audited 941 UK businesses to work out what actually gets a firm named."),
     "v2 carries the proof line, literal, as registered");
  ok(t2.includes("went from named once in twelve questions to named three times, in four weeks, on the pages I built."),
     "and the locksmith result, literal");
  ok(!t1.includes("941") && !t1.includes("whoever gets named"), "neither addition leaked into v1's body");

  /* ⛔ LOWERCASE ENGINE NAMES IN v2 ARE PAUL'S WORDING. explain_offer capitalises them because ITS
     registration does. Each mirror follows its own registration; "correcting" either breaks parity
     with what the prospect actually reads. */
  ok(/People ask chatgpt and gemini for/.test(t2), '"chatgpt" and "gemini" are LOWERCASE in v2 — do not capitalise');
  ok(!/ChatGPT|Gemini/.test(t2), "and neither engine is capitalised anywhere in v2");
  ok(/People ask ChatGPT and Gemini for/.test(t1), "while v1 keeps its own capitalised registration");

  /* v2 only ADDS. From the website paragraph onwards the two are word-for-word the same, so a later
     edit to the shared tail (a price, the closing URL) that reaches one and not the other fails here. */
  const tail = (s: string) => s.slice(s.indexOf("Keep your website"));
  ok(tail(t1).length > 100, "the shared tail was found in v1");
  ok(tail(t1) === tail(t2), 'from "Keep your website" onwards the two bodies are byte-identical — v2 only ADDS paragraphs above it');

  const p1 = WHATSAPP_TEMPLATES.find((t) => t.value === "explain_offer");
  const p2 = WHATSAPP_TEMPLATES.find((t) => t.value === "explain_offer_v2");
  ok(!!p1 && !!p2, "BOTH are offered in the picker — Paul chooses per lead; explain_offer was left in place");
  ok(p1?.label !== p2?.label, "with different labels");
  ok(/v2/.test(p2?.label ?? "") && /941/.test(p2?.label ?? ""), `and v2's label says what it adds ("${p2?.label}")`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
