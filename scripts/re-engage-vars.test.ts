/* ============================================================
   re_engage: TWO VARIABLES, AND THE TWO ALLOWLISTS THAT MUST AGREE.

   ⛔ WHAT WENT WRONG, AND IT WAS A FLAGGED GUESS RATHER THAN AN ACCIDENT. re_engage shipped as
   vars ["name"] because every other name-only follow-up (book_call, initial_contact) has one
   variable. Meta rejected the send: #132000, "number of localizable_params (1) does not match the
   expected number of params (2)". The registration is the authority; the shape of a similar template
   is not evidence about it.

   ⛔ THE TWO LISTS ARE A DELIBERATE COPY — _shared/whatsapp-send.ts WA_TEMPLATES and
   process-whatsapp-queue's own TEMPLATES — because the queue refuses an unlisted name outright
   rather than falling back to another pitch. A copy that drifts sends the WRONG NUMBER of params
   from one path and the right number from the other, which is exactly what #132000 is.
   ============================================================ */
import {
  WA_TEMPLATES, TEMPLATES_NEEDING_REAL_NAME, TEMPLATES_ALLOWING_NO_FIRST_NAME,
  WA_TEMPLATE_BODIES, renderTemplateBody, templateBodyParams,
} from "../supabase/functions/_shared/whatsapp-send.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── THE SHAPE META EXPECTS ──");
{
  const t = WA_TEMPLATES["re_engage"];
  ok(!!t, "re_engage is registered at all");
  ok(t.vars.length === 2, `TWO variables, which is what #132000 was about (${t.vars.length})`);
  ok(t.vars[0] === "name", "{{1}} = business name");
  ok(t.vars[1] === "onboarding_url", "{{2}} = the onboarding link");
  ok(t.lang === "en", `lang matches the registration (${t.lang})`);
  /* ⚠️ `url` would have gated the send on the lead having a GENERATED SITE. Distinct var, distinct
     meaning — reusing it is what made onboarding_followup unsendable to its own audience once. */
  ok(!t.vars.includes("url"), "⛔ NOT the claim-link var — re_engage must not require a generated site");
}

console.log("\n── THE PARAMS ACTUALLY SENT, IN ORDER ──");
{
  const t = WA_TEMPLATES["re_engage"];
  const comps = templateBodyParams(t.vars, "NeiL Hughes driving tuition", "", {
    onboardingUrl: "https://findable.live/onboarding/neil-hughes/?lead=7bd712c5",
    templateName: "re_engage",
  });
  const params = (comps[0] as { parameters: Array<{ text: string }> }).parameters;
  ok(params.length === 2, `two parameters go on the wire (${params.length}) — this is the fix`);
  ok(params[0].text === "NeiL Hughes driving tuition", "{{1}} is the business name");
  ok(params[1].text.includes("/onboarding/"), "{{2}} is the onboarding link");
}

console.log("\n── ⛔ IT REFUSES RATHER THAN SENDING A BROKEN MESSAGE ──");
/* The whole message is a pointer to that link, so a blank {{2}} is worse than no send. */
{
  const t = WA_TEMPLATES["re_engage"];
  let threw = false;
  try {
    templateBodyParams(t.vars, "NeiL Hughes driving tuition", "", { onboardingUrl: "", templateName: "re_engage" });
  } catch { threw = true; }
  ok(threw, "an EMPTY onboarding link refuses (throws) instead of sending {{2}} blank");

  let threwWhitespace = false;
  try {
    templateBodyParams(t.vars, "NeiL Hughes driving tuition", "", { onboardingUrl: "   ", templateName: "re_engage" });
  } catch { threwWhitespace = true; }
  ok(threwWhitespace, "whitespace-only is refused too — trimmed, not truthy-tested");

  let threwMissing = false;
  try {
    templateBodyParams(t.vars, "NeiL Hughes driving tuition", "", { templateName: "re_engage" });
  } catch { threwMissing = true; }
  ok(threwMissing, "⛔ the var ABSENT entirely also refuses — an absent link is not an empty string");
}

console.log("\n── ⛔ AND IT REFUSES ON A BLANK BUSINESS NAME (the body opens \"Hi {{1}},\") ──");
{
  ok(TEMPLATES_NEEDING_REAL_NAME.has("re_engage"),
    "re_engage is in TEMPLATES_NEEDING_REAL_NAME");
  let threw = false;
  try {
    templateBodyParams(WA_TEMPLATES["re_engage"].vars, "", "", { onboardingUrl: "https://x/onboarding/?lead=1", templateName: "re_engage" });
  } catch { threw = true; }
  ok(threw, "a blank name refuses rather than sending \"Hi your business, following up…\"");
  /* The degrade is right for a mid-sentence name and wrong for a salutation — same reasoning as
     book_call, which is the only other member of that set. */
  ok(TEMPLATES_NEEDING_REAL_NAME.has("book_call"), "book_call still in the set (unchanged)");
}

console.log("\n── THE PREVIEW MATCHES WHAT META SENDS ──");
{
  ok(typeof WA_TEMPLATE_BODIES["re_engage"] === "function", "re_engage has a preview body");
  const body = renderTemplateBody("re_engage", "NeiL Hughes driving tuition", "https://findable.live/onboarding/x/?lead=1");
  ok(body.startsWith("Hi NeiL Hughes driving tuition, following up on the AI visibility report we sent over."),
    "opens with the approved first line, {{1}} filled");
  /* ⛔ £49.99 SINCE 2026-08-12, AND THE ASSERTION NAMES BOTH NUMBERS ON PURPOSE. The founder price
     moved; the £99 anchor did not. Asserting the whole phrase rather than just the new number is
     what would catch a future edit that "tidies" the anchor down to match the offer — the anchor is
     FINDABLE_SETUP_PRICE_GBP and changing it is a different decision entirely.
     ⚠️ THIS ASSERTS THE CODE'S PREVIEW STRING, NOT WHAT META SENDS. Meta renders the real message
     from its own registered copy, so this passing means the Inbox transcript is right — it says
     nothing about the prospect's phone until the template is re-registered by hand. */
  ok(body.includes("£49.99 instead of £99"), "carries the approved offer line, at the new price");
  ok(!body.includes("£19.99"), "and the old founder price is gone from the preview");
  ok(body.includes("Five quick questions and we're started: https://findable.live/onboarding/x/?lead=1"),
    "{{2}} is rendered inline where the approved copy puts it");
  ok(body.trimEnd().endsWith("Happy to answer anything first if you'd rather."), "and the approved closing line");
  ok(!body.includes("{{"), "no unfilled placeholders left in the preview");
  /* The old placeholder wording must be gone, or the Inbox keeps showing a message nobody sent. */
  ok(!body.includes("Paul here from Findable"), "⛔ the placeholder preview is gone");
}

console.log("\n── hook_followup: same TWO-VAR PERSONAL-GREETING SHAPE AS questionnaire_followup ──");
{
  const t = WA_TEMPLATES["hook_followup"];
  ok(!!t, "hook_followup is registered");
  ok(t.lang === "en", `lang is plain "en", NOT en_GB (${t.lang})`);
  ok(t.vars.length === 2, `TWO variables (${t.vars.length})`);
  ok(t.vars[0] === "contact_first_name", "{{1}} = the owner's first name");
  ok(t.vars[1] === "name", "{{2}} = business name");

  // The preview matches the approved body, {{1}}/{{2}} filled.
  const body = renderTemplateBody("hook_followup", "RG Locksmiths", "", undefined, undefined, "Ronnie");
  ok(body.startsWith("Hi Ronnie, following up on the report I sent for RG Locksmiths."),
    "opens with the approved first line, both vars filled");
  ok(body.includes("no charge to take a look, just reply here."), "carries the approved offer line");
  ok(body.trimEnd().endsWith("Paul, findable"), "signs off exactly as registered");
  ok(!body.includes("{{"), "no unfilled placeholders left");

  /* ⛔ A BLANK FIRST NAME IS ALLOWED for hook_followup and degrades {{1}} to "there" (Paul 2026-08-22)
     — cold report leads we often have no name for. The Meta param and the body renderer must agree. */
  ok(TEMPLATES_ALLOWING_NO_FIRST_NAME.has("hook_followup"), "hook_followup is in the no-first-name allow-set");
  const blankParams = templateBodyParams(t.vars, "RG Locksmiths", "", { contactName: "", templateName: "hook_followup" });
  const bp = (blankParams[0] as { parameters: Array<{ text: string }> }).parameters;
  ok(bp[0].text === "there", `blank first name → {{1}} = "there" (got "${bp[0].text}")`);
  ok(bp[1].text === "RG Locksmiths", "{{2}} is still the business name");
  const missingParams = templateBodyParams(t.vars, "RG Locksmiths", "", { templateName: "hook_followup" });
  ok((missingParams[0] as { parameters: Array<{ text: string }> }).parameters[0].text === "there",
    "an ABSENT contactName also degrades to \"there\", not a throw");
  const blankBody = renderTemplateBody("hook_followup", "RG Locksmiths", "", undefined, undefined, "");
  ok(blankBody.startsWith("Hi there, following up on the report I sent for RG Locksmiths."),
    "the stored transcript agrees: blank name reads \"Hi there, …\"");

  /* ⛔ SEPARATION: questionnaire_followup MUST still refuse a blank first name — changing hook_followup
     did not change it. This is the whole point of the allow-set. */
  ok(!TEMPLATES_ALLOWING_NO_FIRST_NAME.has("questionnaire_followup"), "questionnaire_followup is NOT in the allow-set");
  let qThrew = false;
  try { templateBodyParams(WA_TEMPLATES["questionnaire_followup"].vars, "RG Locksmiths", "", { contactName: "", templateName: "questionnaire_followup" }); }
  catch { qThrew = true; }
  ok(qThrew, "questionnaire_followup still refuses a blank first name (unchanged)");
}

console.log("\n── contact_followup: ONE VARIABLE ({{1}} = business name), opens \"Hi,\" (no name greeting) ──");
{
  const t = WA_TEMPLATES["contact_followup"];
  ok(!!t, "contact_followup is registered");
  ok(t.lang === "en", `lang is plain "en", NOT en_GB (${t.lang})`);
  ok(t.vars.length === 1, `ONE variable (${t.vars.length})`);
  ok(t.vars[0] === "name", "{{1}} = business name");
  ok(!t.vars.includes("contact_first_name"), "no personal-greeting var — it opens \"Hi,\"");

  const body = renderTemplateBody("contact_followup", "RG Locksmiths", "");
  ok(body.startsWith("Hi, just following up on my message, is this the right number for RG Locksmiths?"),
    "opens with the approved first line, {{1}} filled");
  ok(body.trimEnd().endsWith("Paul, findable"), "signs off exactly as registered");
  ok(!body.includes("{{"), "no unfilled placeholders left");
  // A blank business name degrades to "your business" — reads fine, no refusal (unlike name-greeting templates).
  const blank = renderTemplateBody("contact_followup", "", "");
  ok(blank.includes("is this the right number for your business?"), "blank business name degrades to \"your business\", not a refusal");
  ok(!TEMPLATES_NEEDING_REAL_NAME.has("contact_followup"), "contact_followup is NOT in TEMPLATES_NEEDING_REAL_NAME (it opens \"Hi,\")");
}

console.log("\n── THE TWO ALLOWLISTS AGREE ON EVERY TEMPLATE, NOT JUST THIS ONE ──");
/* Read out of process-whatsapp-queue's source rather than imported: it is a deliberate copy, and the
   point is to catch the copies diverging. Parsed loosely on purpose — a format change here should
   fail loudly rather than silently stop comparing. */
{
  const src = await (await import("node:fs/promises")).readFile(
    new URL("../supabase/functions/process-whatsapp-queue/index.ts", import.meta.url), "utf8",
  );
  const mirror = new Map<string, string>();
  /* Trailing `// …` comments are allowed after the comma — two live entries carry one, and anchoring
     at end-of-line silently dropped them from the comparison, which is the sweep quietly covering
     less than it claimed. */
  for (const m of src.matchAll(/^\s{2}(\w+): \{ lang: "([^"]+)", vars: \[([^\]]*)\] \},/gm)) {
    mirror.set(m[1], `${m[2]}|${m[3].replace(/["\s]/g, "")}`);
  }
  ok(mirror.size >= 10, `parsed ${mirror.size} entries from the queue's mirror (format still recognised)`);
  for (const [name, entry] of Object.entries(WA_TEMPLATES)) {
    const mine = `${entry.lang}|${entry.vars.join(",")}`;
    ok(mirror.get(name) === mine, `${name}: ${mine} matches the mirror (${mirror.get(name) ?? "MISSING"})`);
  }
  for (const name of mirror.keys()) {
    ok(name in WA_TEMPLATES, `${name} in the mirror also exists in WA_TEMPLATES`);
  }
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
