/* ============================================================
   questionnaire_followup — the send path's regression suite (2026-08-17).

   Three properties that must never break:
   ⛔ {{1}} names a PERSON. A blank contact name must THROW at the last gate, never send
      "Hi there" / "Hi your business" — the same contract as onboarding_url.
   ⛔ The first name is DERIVED, never stored — firstNameFrom is the one derivation.
   ⛔ The registry entry exists identically in BOTH maps (re-engage-vars.test.ts asserts the
      whole-map identity; here we pin this template's own shape so a "fix" to one map fails fast).
   ============================================================ */
import { firstNameFrom, questionnaireFollowupBody } from "../src/lib/questionnaireFollowup.ts";
import { WA_TEMPLATES, WA_TEMPLATE_BODIES, templateBodyParams, renderTemplateBody } from "../supabase/functions/_shared/whatsapp-send.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── firstNameFrom: derived, never guessed ──");
ok(firstNameFrom("Ronnie Simms") === "Ronnie", "first word of a two-word name");
ok(firstNameFrom("  Ronnie   Simms  ") === "Ronnie", "whitespace trimmed and collapsed");
ok(firstNameFrom("Ronnie") === "Ronnie", "a single-word name is itself");
ok(firstNameFrom("") === "" && firstNameFrom(null) === "" && firstNameFrom(undefined) === "", "empty in, empty out — the caller decides the refusal");

console.log("── The registry entry ──");
{
  const t = WA_TEMPLATES["questionnaire_followup"];
  ok(!!t, "registered in WA_TEMPLATES");
  ok(t?.vars.length === 2 && t.vars[0] === "contact_first_name" && t.vars[1] === "name",
    "{{1}} = contact first name, {{2}} = business name — the order Meta was registered with");
  ok(typeof WA_TEMPLATE_BODIES["questionnaire_followup"] === "function", "display body present (no bare [label] in the Inbox)");
}

console.log("── ⛔ A blank name throws at the last gate ──");
{
  let threw = false;
  try {
    templateBodyParams(["contact_first_name", "name"], "Ronnie's Shoe Repairs", "", { templateName: "questionnaire_followup", contactName: "" });
  } catch { threw = true; }
  ok(threw, "empty contactName throws — a personal greeting never sends a placeholder");
  let threw2 = false;
  try {
    templateBodyParams(["contact_first_name", "name"], "Ronnie's Shoe Repairs", "", { templateName: "questionnaire_followup" });
  } catch { threw2 = true; }
  ok(threw2, "absent contactName throws too — absence is not an answer");
}

console.log("── The params Meta receives ──");
{
  const [c] = templateBodyParams(["contact_first_name", "name"], "Ronnie's Shoe Repairs & Key Cutting", "", { templateName: "questionnaire_followup", contactName: "Ronnie Simms" });
  const texts = (c.parameters as Array<{ text: string }>).map((p) => p.text);
  ok(texts.length === 2 && texts[0] === "Ronnie" && texts[1] === "Ronnie's Shoe Repairs & Key Cutting",
    "two params, first-name first — a count or order slip is Meta #132000");
  const [d] = templateBodyParams(["contact_first_name", "name"], "Biz", "", { templateName: "questionnaire_followup", contactName: "Ronnie\nSimms" });
  ok((d.parameters as Array<{ text: string }>)[0].text === "Ronnie", "a newline in the stored name cannot reach Meta (#132018 sanitiser)");
}

console.log("── The preview and the transcript are the same string ──");
{
  const viaMap = renderTemplateBody("questionnaire_followup", "Ronnie's Shoe Repairs", "", undefined, undefined, "Ronnie");
  const viaSpa = questionnaireFollowupBody("Ronnie", "Ronnie's Shoe Repairs");
  ok(viaMap === viaSpa, "renderTemplateBody (stored transcript) === questionnaireFollowupBody (SPA preview) — one copy, no drift");
  ok(viaSpa.startsWith("Hi Ronnie, saw your form come through for Ronnie's Shoe Repairs"), "the body is Paul's registered wording");
  ok(viaSpa.endsWith("Paul, findable"), "signature intact");
}

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? "" : "S"}`); process.exit(1); }
console.log("\nALL PASS");
