/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE COMPETITOR HOOK: A PLURAL TRADE, THREE REAL NAMES, OR A DIFFERENT MESSAGE.

   Two rules under test, and they fail in opposite directions:

   1. `pluraliseTrade` must produce a LOWERCASE PLURAL for the slot "find {{2}} in your area", and
      must NOT inherit normaliseTrade's vowel rule — that rule exists only because video_template's
      registered text hardcodes "for a". Inheriting it would keep 113 of 968 audits (12%, almost all
      accountants and electricians) unsendable for a reason that does not apply to this sentence.
   2. A rival-naming template with fewer than three usable names must FALL BACK, never pad and never
      send a blank. An empty Meta parameter is a rejected send; a padded one ("and others") is an
      unverifiable claim in the first message a prospect ever gets from us.

   ⛔ THE FIXTURE IS THE REAL DATA, as template-vars.test.ts's is: every distinct
   ai_audits.business_type with its audit count. A generated-shapes block follows it, because the
   next trade typed into the free check is not in any fixture.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { pluraliseTrade, normaliseTrade } from "../src/lib/templateVars.ts";
import {
  rivalHookDecision, usableRivals, templateNeedsRivals,
  RIVAL_HOOK_TEMPLATE, RIVAL_HOOK_FALLBACK, RIVALS_REQUIRED, RIVAL_VARS,
} from "../src/lib/rivalHook.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** Every distinct business_type in ai_audits, with audit counts (968 audits, 24 values, 2026-09-12). */
const STORED_TRADES: ReadonlyArray<[string, number]> = [
  ["Locksmiths", 362], ["Plumbers", 268], ["Driving instructors", 78], ["plumber", 53],
  ["locksmiths", 52], ["accountant", 40], ["Accountants", 29], ["accountants", 22],
  ["electrician", 12], ["mobile mechanics", 11], ["plumbers", 10],
  ["Mobile valeting and detailing", 7], ["electricians", 4], ["locksmith", 3],
  ["online menopause clinic", 3], ["Accountant", 3], ["Driving instructor", 2],
  ["Mobile mechanics", 2], ["mobile valeting", 2],
  ["Shoe repairs & watch battery replacement", 1], ["driving instructor", 1],
  ["hospitality", 1], ["Plumber", 1], ["kava cafe, pool bar", 1],
];

console.log("-- the real book: what {{2}} would render as --");
for (const [raw, n] of STORED_TRADES) {
  const r = pluraliseTrade(raw);
  console.log(`   ${String(n).padStart(3)}x ${JSON.stringify(raw).padEnd(44)} -> ${r.ok ? JSON.stringify(r.value) : `BLOCKED ${r.reason}`}`);
}

console.log("\n-- every sendable value is lowercase and plural --");
for (const [raw] of STORED_TRADES) {
  const r = pluraliseTrade(raw);
  if (!r.ok) continue;
  ok(r.value === r.value.toLowerCase(), `${JSON.stringify(raw)} renders lowercase`);
  ok(r.value.split(" ").slice(-1)[0].endsWith("s"), `${JSON.stringify(raw)} renders plural`);
}

console.log("\n-- the big trades read correctly in this sentence --");
for (const [input, want] of [
  ["Locksmiths", "locksmiths"], ["Plumbers", "plumbers"], ["plumber", "plumbers"],
  ["Driving instructors", "driving instructors"], ["driving instructor", "driving instructors"],
  ["Mobile mechanics", "mobile mechanics"], ["mobile valeting", "mobile valeters"],
  ["hospitality", "hospitality businesses"], ["online menopause clinic", "online menopause clinics"],
] as const) {
  const r = pluraliseTrade(input);
  ok(r.ok && r.value === want, `find ${JSON.stringify(want)} in your area  <- ${JSON.stringify(input)}`);
}

/* 🟢 THE POINT OF THE WHOLE FUNCTION. These are held by normaliseTrade's article rule and must NOT
   be held here — measured at 113 of 968 audits (12%). If this block ever goes red because somebody
   "restored consistency" with the singular path, the fix is to delete their article check, not
   these assertions. */
console.log("\n-- the 12% the singular path holds on the article, and this one sends --");
for (const [input, want] of [
  ["accountant", "accountants"], ["Accountants", "accountants"], ["accountants", "accountants"],
  ["electrician", "electricians"], ["electricians", "electricians"],
  ["accountancy", "accountants"], ["electrics", "electricians"],
] as const) {
  const singular = normaliseTrade(input);
  const plural = pluraliseTrade(input);
  ok(!singular.ok && singular.reason === "trade_starts_with_vowel_sound", `${JSON.stringify(input)} is held on "a" by the singular path`);
  ok(plural.ok && plural.value === want, `${JSON.stringify(input)} sends here as ${JSON.stringify(want)}`);
}

console.log("\n-- the unusable values are still blocked, for the same reasons --");
for (const [input, reason] of [
  ["", "trade_missing"],
  ["   ", "trade_missing"],
  ["kava cafe, pool bar", "trade_not_a_single_noun"],
  ["Shoe repairs & watch battery replacement", "trade_not_a_single_noun"],
  ["locksmiths and key cutting", "trade_not_a_single_noun"],
  ["plumber 24", "trade_has_digits"],
  ["roofing", "trade_uncountable"],
  ["gas heating", "trade_uncountable"],
  ["carpet cleaning", "trade_uncountable"],
  ["joinery", "trade_uncountable"],
  ["dental", "trade_uncountable"],
  ["removals", "trade_uncountable"],
] as const) {
  const r = pluraliseTrade(input);
  ok(!r.ok && r.reason === reason, `${JSON.stringify(input)} blocks as ${reason}`);
}

console.log("\n-- absent input is never guessed at --");
for (const v of [null, undefined]) {
  const r = pluraliseTrade(v as unknown as string);
  ok(!r.ok && r.reason === "trade_missing", `${String(v)} blocks rather than rendering`);
}

/* The plural machinery itself, on shapes the fixture does not contain — an already-plural value must
   survive untouched (the common case), and a word that pluralises irregularly must not be mangled. */
console.log("\n-- the plural rules, on shapes the book does not yet contain --");
for (const [input, want] of [
  ["roofer", "roofers"], ["Roofers", "roofers"], ["plasterer", "plasterers"],
  ["gas engineer", "gas engineers"], ["kitchen fitter", "kitchen fitters"],
  ["barber", "barbers"], ["barbers", "barbers"],
  ["locksmith", "locksmiths"], ["bakery", "bakeries"], ["surveyor", "surveyors"],
  ["coach", "coaches"], ["gas", "gases"], ["glazier", "glaziers"],
] as const) {
  const r = pluraliseTrade(input);
  ok(r.ok && r.value === want, `${JSON.stringify(input)} -> ${JSON.stringify(want)}`);
}

console.log("\n-- usableRivals: what may become a parameter --");
ok(usableRivals(["A Plumbing", "B Gas", "C Heating"]).length === 3, "three clean names give three");
ok(usableRivals(["A", "B", "C", "D"]).length === RIVALS_REQUIRED, "a longer list is capped at three");
ok(usableRivals(["A", "a", "B"]).join("|") === "A|B", "the same firm twice is one firm, not two names");
ok(usableRivals(["  ", "", null, undefined, "A"]).join("|") === "A", "blanks and nulls are not names");
/* ⛔ #132018: Meta rejects the WHOLE send for a parameter carrying a newline, a tab or 4+ spaces —
   four live audit_reply sends died on exactly this on 2026-08-12. */
ok(usableRivals(["Checkatrade\n    \n    If"])[0] === "Checkatrade If", "internal newlines and runs of spaces are collapsed, not rejected");
ok(usableRivals(["\tA\tGas\t"])[0] === "A Gas", "tabs are collapsed");
ok(!usableRivals(["A", "B", "C"]).some((n) => /[\n\t]|\s{4}/.test(n)), "no usable name can carry what Meta refuses");
ok(usableRivals(null).length === 0 && usableRivals(undefined).length === 0, "an absent list is zero names, never a throw");

console.log("\n-- templateNeedsRivals is a property of the template, never its name --");
ok(templateNeedsRivals(["name", "trade_plural", "rival_1", "rival_2", "rival_3", "audit_url"]), "a template declaring rivals needs rivals");
ok(!templateNeedsRivals(["name", "trade", "town", "audit_url"]), "video_template does not");
ok(!templateNeedsRivals([]) && !templateNeedsRivals(undefined) && !templateNeedsRivals(null), "no vars, no rivals — and no throw");
ok(RIVAL_VARS.length === RIVALS_REQUIRED, "the variable list and the required count are the same number");

console.log("\n-- the fallback: three names, or the message that needs none --");
for (const n of [0, 1, 2]) {
  const d = rivalHookDecision(RIVAL_HOOK_TEMPLATE, true, n);
  ok(d.fellBack && d.template === RIVAL_HOOK_FALLBACK, `${n} of 3 names falls back to ${RIVAL_HOOK_FALLBACK}`);
  ok(d.reason.length > 0, `${n} of 3 says why`);
}
for (const n of [3, 4, 9]) {
  const d = rivalHookDecision(RIVAL_HOOK_TEMPLATE, true, n);
  ok(!d.fellBack && d.template === RIVAL_HOOK_TEMPLATE && d.reason === "", `${n} names sends the competitor hook`);
}
/* ⛔ NARROW BY CONSTRUCTION. The fallback must never redirect a template that does not name rivals —
   an audit with no competitors is perfectly normal for video_template and audit_reply_warm. */
for (const t of ["video_template", "audit_reply_warm", "audit_reply", "initial_contact"]) {
  const d = rivalHookDecision(t, false, 0);
  ok(!d.fellBack && d.template === t, `${t} is untouched by the rival rule at zero names`);
}
/* ⛔ AND THE FALLBACK NEVER FALLS BACK: a fallback that could be substituted is a loop. */
ok(rivalHookDecision(RIVAL_HOOK_FALLBACK, false, 0).template === RIVAL_HOOK_FALLBACK, "the fallback is never itself redirected");

/* THE END-TO-END PROPERTY, the one that actually protects a prospect: whatever the audit supplies,
   the template that gets sent can be filled with no blank and no invented name. */
console.log("\n-- the property: no send is ever built with a blank or a padded rival --");
for (const names of [
  [], ["A"], ["A", "B"], ["A", "a"], ["", "  ", "B"], ["A", "B", "C"], ["A", "B", "C", "D"],
  ["Checkatrade\n  \n  If", "B", "C"],
] as string[][]) {
  const usable = usableRivals(names);
  const d = rivalHookDecision(RIVAL_HOOK_TEMPLATE, true, usable.length);
  const filled = d.template === RIVAL_HOOK_TEMPLATE ? usable.slice(0, RIVALS_REQUIRED) : [];
  ok(filled.length === 0 || filled.length === RIVALS_REQUIRED, `${JSON.stringify(names)}: three names or none`);
  ok(filled.every((n) => n.trim().length > 0), `${JSON.stringify(names)}: nothing blank reaches a parameter`);
  ok(new Set(filled.map((n) => n.toLowerCase())).size === filled.length, `${JSON.stringify(names)}: no name is repeated to make up the count`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
