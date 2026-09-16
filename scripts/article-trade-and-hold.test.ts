/* ════════════════════════════════════════════════════════════════════════════════════════════════
   audit_followup_call — THE TWO RULES IT INTRODUCED, 2026-09-16.

   The template itself is six registry entries and a body; neither of those needs a suite. These two
   do, because each is a rule about a CLASS of template rather than about this one:

     1. {{1}} CARRIES ITS OWN ARTICLE (`trade_article` / `articleTrade`). Every other trade slot in
        the book is a bare noun — singular for a sentence that hardcodes "a", plural for one that
        hardcodes nothing. This is the first where the VALUE owns the article, which is what lets an
        accountant and an electrician receive the message as themselves instead of being held.

     2. A RIVAL-NAMING CONTINUATION HOLDS. It does not fall back to video_template, because
        video_template is a cold opener and the phone-history seatbelt has already run on the
        requested name by the time the substitution happens.

   ⛔ THE FIXTURE IS THE REAL DATA. Every trade below is a distinct stored `ai_audits.business_type`
   (the snapshot in scripts/template-vars.test.ts, 968 audits / 24 distinct values), so what is
   asserted here is what will actually render — not invented examples that happen to work.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { articleTrade, normaliseTrade, pluraliseTrade } from "../src/lib/templateVars.ts";
import { rivalHookDecision, RIVAL_HOOK_FALLBACK, RIVALS_REQUIRED } from "../src/lib/rivalHook.ts";
import { CONTINUATION_TEMPLATES, isColdOutreachTemplate } from "../src/lib/coldOutreach.ts";
import { WA_TEMPLATES } from "../supabase/functions/_shared/whatsapp-send.ts";
import { branchForVars, unsuppliedVars, AUDIT_DERIVED_VARS } from "../src/lib/templateRouting.ts";
import { templateNeedsAudit } from "../supabase/functions/_shared/outreach-audit.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── 1. THE ARTICLE IS WRITTEN, NOT REFUSED ──");
/* 🔴 THE WHOLE POINT. These four are the trades video_template's hardcoded "for a {{2}}" holds —
   measured 2026-09-15 at 179 of 1,066 lead-linked audits (16.8%), almost all of them these two
   trades. normaliseTrade must still refuse them and articleTrade must still send them. */
for (const [raw, expected] of [
  ["accountant", "an accountant"],
  ["Accountants", "an accountant"],
  ["electrician", "an electrician"],
  ["electricians", "an electrician"],
] as const) {
  const a = articleTrade(raw);
  ok(a.ok && a.value === expected, `${raw.padEnd(14)} → "${a.ok ? a.value : `REFUSED (${a.reason})`}"`);
  ok(!normaliseTrade(raw).ok, `  and normaliseTrade still refuses it — the article rule is a fact about ONE sentence`);
}

console.log("\n── consonant trades take \"a\", and the map still decides the noun ──");
for (const [raw, expected] of [
  ["Locksmiths", "a locksmith"],
  ["plumber", "a plumber"],
  ["Plumbers", "a plumber"],
  ["Driving instructors", "a driving instructor"],
  ["mobile mechanics", "a mobile mechanic"],
  /* ⛔ THE UNCOUNTABLE FORMS PEOPLE REALLY TYPE, THROUGH THE SAME MAP. "plumbing" is a real word
     naming the WORK; the map is what turns it into a person, and the article follows from the
     mapped answer rather than from the raw input. */
  ["plumbing", "a plumber"],
  ["locksmithing", "a locksmith"],
  /* And a mapped value that is vowel-initial takes "an" — the article follows the SOUND of whatever
     the map returned, which is why there is no second list of "trades that take an". */
  ["electrics", "an electrician"],
  ["accountancy", "an accountant"],
] as const) {
  const a = articleTrade(raw);
  ok(a.ok && a.value === expected, `${raw.padEnd(20)} → "${a.ok ? a.value : `REFUSED (${a.reason})`}"`);
}

console.log("\n── ⛔ AND IT BLOCKS EVERYTHING ITS SIBLINGS BLOCK. The article is the ONLY difference ──");
/* A value that cannot be read is unreadable in any sentence. If this ever diverges from
   normaliseTrade on anything but the article, the extraction of singulariseTrade has gone wrong. */
for (const bad of [
  "",
  "   ",
  "Shoe repairs & watch battery replacement",  // a list, not a noun — real, 1 audit
  "kava cafe, pool bar",                        // real
  "24/7 locksmith",                             // digits
  "joinery",                                    // uncountable, not mapped
  "carpet cleaning",                            // uncountable on the LAST word
]) {
  const a = articleTrade(bad);
  const n = normaliseTrade(bad);
  ok(!a.ok, `refuses ${JSON.stringify(bad)}${a.ok ? ` — GOT "${a.value}"` : ` (${a.reason})`}`);
  ok(!a.ok && !n.ok && a.reason === n.reason,
     `  and for the SAME reason normaliseTrade gives (${a.ok ? "-" : a.reason})`);
}

console.log("\n── the three slots agree about the trade and differ only in shape ──");
/* One map, three sentences. If these three ever disagree about WHICH trade a value names, the
   vocabulary has been copied somewhere it should not have been. */
for (const raw of ["Locksmiths", "plumbing", "accountants", "Driving instructors"]) {
  const s = normaliseTrade(raw), p = pluraliseTrade(raw), a = articleTrade(raw);
  ok(p.ok && a.ok, `${raw.padEnd(20)} plural "${p.ok ? p.value : "-"}" · article "${a.ok ? a.value : "-"}"`);
  if (a.ok) {
    const noun = a.value.replace(/^an? /, "");
    ok(s.ok ? noun === s.value : true, `  the noun under the article is normaliseTrade's own answer`);
    ok(p.ok && p.value.startsWith(noun.split(" ").slice(0, -1).join(" ")),
       `  and the plural is built from the same words`);
  }
}

console.log("\n── 2. THE TEMPLATE IS REGISTERED THE WAY META HAS IT ──");
{
  const t = WA_TEMPLATES["audit_followup_call"];
  ok(!!t, "audit_followup_call is registered at all");
  /* ⛔ FIVE, NOT SIX. Its sibling audit_followup ends with a report link; this one has no link at
     all. Sending six parameters to a five-variable template is #132000 — the rejection re_engage
     was built on, pointing the other way. */
  ok(t.vars.length === 5, `FIVE variables, not its sibling's six (${t.vars.length})`);
  ok(t.vars[0] === "trade_article", "{{1}} is the trade WITH its article");
  ok(t.vars[1] === "town", "{{2}} is the town");
  ok(t.vars[2] === "rival_1" && t.vars[3] === "rival_2" && t.vars[4] === "rival_3", "{{3}}{{4}}{{5}} are the three rivals");
  ok(!t.vars.includes("audit_url"), "and it carries NO report link");
  ok(!t.vars.includes("name"), "and no business name — the body opens \"Hi mate\"");
  ok(t.lang === "en", `lang matches the registration (${t.lang})`);
  ok(!("headerVideoUrl" in t), "no video header");
}

console.log("\n── ⛔ NO LINK, AND STILL needsAudit — THE RIVALS COME FROM THE AUDIT ──");
{
  const vars = WA_TEMPLATES["audit_followup_call"].vars as readonly string[];
  /* 🔴 THE FAULT THIS PINS. templateNeedsAudit named `trade`, `competitors` and `audit_url` by hand
     until 2026-09-16 — so a template whose only audit-derived values are the three RIVAL NAMES
     answered NO, and would have been queued to a lead with no completed audit. It reads
     AUDIT_DERIVED_VARS now, so the two rules share one set. */
  ok(templateNeedsAudit(vars), "templateNeedsAudit is TRUE even with no audit_url");
  ok(!vars.includes("trade") && !vars.includes("competitors") && !vars.includes("audit_url"),
     "  and NONE of the three variables the old hand-written list named is present");
  ok(templateNeedsAudit(["rival_1"]), "a lone rival name is enough to need the audit");
  ok(!templateNeedsAudit(["name"]), "and a template with no audit-derived variable does not wait");
  ok(!templateNeedsAudit(undefined), "absent vars → false (nothing declared, nothing to wait for)");
  ok(branchForVars(vars) === "audit", "it BUILDS on the audit branch too");
  ok(unsuppliedVars(vars).length === 0, `and that branch can answer every variable (${unsuppliedVars(vars).join(", ") || "none missing"})`);
  ok(AUDIT_DERIVED_VARS.has("trade_article"), "trade_article is classified as audit-derived");
}

console.log("\n── 3. A RIVAL-NAMING CONTINUATION HOLDS; A COLD ONE FALLS BACK ──");
{
  ok(CONTINUATION_TEMPLATES.has("audit_followup_call"), "audit_followup_call is a CONTINUATION");
  ok(!isColdOutreachTemplate("audit_followup_call"), "  so the phone-history seatbelt lets it reach a live thread");
  ok(isColdOutreachTemplate(RIVAL_HOOK_FALLBACK), `  and the fallback ${RIVAL_HOOK_FALLBACK} is COLD — which is why it cannot be substituted`);

  for (const n of [0, 1, 2]) {
    const d = rivalHookDecision("audit_followup_call", true, n);
    ok(d.held && !d.fellBack, `${n} rival(s) → HELD, nothing substituted`);
    ok(d.template === "audit_followup_call", `  and the template is unchanged (${d.template})`);
    ok(d.reason.includes("audit_followup_call") && /no cold template/.test(d.reason),
       "  and the reason names the template and says why there is no substitute");
  }
  const full = rivalHookDecision("audit_followup_call", true, RIVALS_REQUIRED);
  ok(!full.held && !full.fellBack && full.reason === "", "three rivals → it sends as itself, no reason to report");

  /* ⛔ THE COLD SIDE IS UNCHANGED, AND THAT IS HALF THE PROPERTY. competitor_hook opens a
     conversation, so video_template is a legitimate substitute for it and a lead short of three
     names still hears from us today. */
  for (const n of [0, 1, 2]) {
    const d = rivalHookDecision("competitor_hook", true, n);
    ok(d.fellBack && !d.held && d.template === RIVAL_HOOK_FALLBACK,
       `competitor_hook with ${n} → still falls back to ${d.template}`);
  }
}

console.log("\n── ⛔ THE RULE IS THE PROPERTY, NEVER THE NAME ──");
{
  /* A template registered tomorrow is covered by its CLASSIFICATION, not by being listed here — the
     2026-09-02 lesson (a guard keyed to today's instance expires silently). */
  ok(rivalHookDecision("some_future_continuation", true, 1).fellBack,
     "an UNKNOWN name is cold by default, so it falls back rather than holding");
  ok(!rivalHookDecision("audit_reply_warm", true, 1).fellBack,
     "and any continuation holds — audit_reply_warm would too, if it ever named rivals");
  /* Nothing that does not need rivals is touched, whichever class it is in. */
  for (const t of ["audit_followup_call", "competitor_hook", "video_template", "initial_contact"]) {
    const d = rivalHookDecision(t, false, 0);
    ok(!d.fellBack && !d.held && d.template === t, `${t.padEnd(22)} does not name rivals → untouched`);
  }
}

console.log("\n── every rival-naming template is classified, so none can drift into the wrong branch ──");
{
  /* If a rival-naming template is neither listed as a continuation nor sendable as a cold opener,
     somebody has added one without deciding what it is. */
  for (const [name, t] of Object.entries(WA_TEMPLATES)) {
    const vars = t.vars as readonly string[];
    if (!vars.some((v) => v.startsWith("rival_"))) continue;
    const d = rivalHookDecision(name, true, 0);
    ok(d.held !== d.fellBack, `${name.padEnd(22)} resolves to exactly one of hold/fall-back (${d.held ? "hold" : "fall back"})`);
  }
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
