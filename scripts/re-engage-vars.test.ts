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
  WA_TEMPLATE_BODIES, renderTemplateBody, templateBodyParams, claimTemplatePayload,
} from "../supabase/functions/_shared/whatsapp-send.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── THE SHAPE META EXPECTS ──");
/* 🔴 re_engage BECAME re_engage_49 ON 2026-09-12, AND ITS VARIABLE COUNT WENT BACK TO ONE.
   This block used to assert TWO variables, added on 2026-08-11 against a real Meta rejection
   (#132000, "1 param sent, 2 expected"). That was correct for `re_engage`. `re_engage_49` is a
   DIFFERENT registered template carrying {{1}} business name and no link at all, so sending two is
   the same rejection pointing the other way. Both facts are true; only one is current. */
{
  const t = WA_TEMPLATES["re_engage_49"];
  ok(!!t, "re_engage_49 is registered at all");
  ok(t.vars.length === 1, `ONE variable — #132000 in the other direction (${t.vars.length})`);
  ok(t.vars[0] === "name", "{{1}} = business name");
  ok(!t.vars.includes("onboarding_url"), "the onboarding link is GONE — re_engage_49 carries no URL");
  ok(t.lang === "en", `lang matches the registration (${t.lang})`);
  ok(!t.vars.includes("url"), "NOT the claim-link var — it must not require a generated site");
  ok(!WA_TEMPLATES["re_engage"], "the OLD name is no longer a sendable template");
}

console.log("\n── THE PARAMS ACTUALLY SENT, IN ORDER ──");
{
  const t = WA_TEMPLATES["re_engage_49"];
  const comps = templateBodyParams(t.vars, "NeiL Hughes driving tuition", "", { templateName: "re_engage_49" });
  const params = (comps[0] as { parameters: Array<{ text: string }> }).parameters;
  ok(params.length === 1, `ONE parameter goes on the wire (${params.length})`);
  ok(params[0].text === "NeiL Hughes driving tuition", "{{1}} is the business name");
}

console.log("\n── AND IT REFUSES ON A BLANK BUSINESS NAME (the body opens \"Hi {{1}},\") ──");
{
  ok(TEMPLATES_NEEDING_REAL_NAME.has("re_engage_49"), "re_engage_49 is in TEMPLATES_NEEDING_REAL_NAME");
  ok(!TEMPLATES_NEEDING_REAL_NAME.has("re_engage"), "and the old name was not left behind in it");
  let threw = false;
  try {
    templateBodyParams(WA_TEMPLATES["re_engage_49"].vars, "", "", { templateName: "re_engage_49" });
  } catch { threw = true; }
  ok(threw, "a blank name refuses rather than sending \"Hi your business, following up...\"");
  ok(TEMPLATES_NEEDING_REAL_NAME.has("book_call"), "book_call still in the set (unchanged)");
}

console.log("\n── THE VIDEO HEADER, WHICH IS WHAT MAKES video_template SENDABLE AT ALL ──");
/* A template registered with a VIDEO header and sent with only a body is rejected outright. This
   asserts the payload SHAPE, because nothing else can: the send itself cannot be exercised here. */
{
  const payload = claimTemplatePayload("video_template", "en", "RG Locksmiths", "", {
    trade: "Locksmiths", town: "Huntingdon", auditUrl: "https://findable.live/report/abc",
  }) as { template: { components: Array<Record<string, unknown>> } };
  const comps = payload.template.components;
  ok(comps.length === 2, `header + body, in that order (${comps.length} components)`);
  ok(comps[0].type === "header", "the HEADER comes first — Meta requires that order");
  const hp = (comps[0] as { parameters: Array<{ type: string; video?: { link?: string } }> }).parameters;
  ok(hp.length === 1 && hp[0].type === "video", "one video parameter");
  ok(typeof hp[0].video?.link === "string" && String(hp[0].video?.link).startsWith("https://findable.live/"),
    `a public LINK, not a media id (${hp[0].video?.link})`);
  ok(!JSON.stringify(comps[0]).includes('"id"'), "no media id — those expire after 30 days");
  ok(comps[1].type === "body", "the body follows");
  const bp = (comps[1] as { parameters: Array<{ text: string }> }).parameters;
  ok(bp.length === 4, `four body params (${bp.length})`);
  ok(bp[0].text === "RG Locksmiths", "{{1}} business name");
  /* THE NORMALISER IS IN THE PAYLOAD PATH, not merely available to it. "Locksmiths" went in. */
  ok(bp[1].text === "locksmith", `{{2}} is singular and lowercase (got ${JSON.stringify(bp[1].text)})`);
  ok(bp[2].text === "Huntingdon", "{{3}} town");
  ok(bp[3].text.startsWith("https://findable.live/report/"), "{{4}} report link");
}

console.log("\n── AN UNSAFE TRADE OR TOWN BLOCKS THE SEND ──");
{
  let threw = false;
  try {
    claimTemplatePayload("video_template", "en", "X", "", { trade: "kava cafe, pool bar", town: "Bath", auditUrl: "https://findable.live/report/a" });
  } catch (e) { threw = String((e as Error).message).startsWith("unsafe_template_var:"); }
  ok(threw, "a trade that cannot be singularised throws unsafe_template_var");
  let threwTown = false;
  try {
    claimTemplatePayload("video_template", "en", "X", "", { trade: "Plumbers", town: "Bourne uk", auditUrl: "https://findable.live/report/a" });
  } catch (e) { threwTown = String((e as Error).message).startsWith("unsafe_template_var:"); }
  ok(threwTown, '"Bourne uk" throws rather than rendering verbatim');
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

console.log("\n── contact_followup: ZERO VARIABLES (re-approved at Meta 2026-08-22) ──");
{
  const t = WA_TEMPLATES["contact_followup"];
  ok(!!t, "contact_followup is registered");
  ok(t.lang === "en", `lang is plain "en", NOT en_GB (${t.lang})`);
  ok(t.vars.length === 0, `ZERO variables (${t.vars.length}) — the {{1}} business name was removed`);

  // The re-approved body — exact, no placeholders, no variable to fill.
  const body = renderTemplateBody("contact_followup", "RG Locksmiths", "");
  ok(body === "Hi, did you get my last message? Paul", `body is the exact re-approved text (${JSON.stringify(body)})`);
  ok(!body.includes("{{"), "no unfilled placeholders left");
  // With no variable the body is fixed regardless of the (now-ignored) business-name argument.
  const blank = renderTemplateBody("contact_followup", "", "");
  ok(blank === "Hi, did you get my last message? Paul", "same text with a blank business name — the arg is ignored");
  ok(!TEMPLATES_NEEDING_REAL_NAME.has("contact_followup"), "contact_followup is NOT in TEMPLATES_NEEDING_REAL_NAME");
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
