/* ════════════════════════════════════════════════════════════════════════════════════════════════
   {{2}} MUST NEVER RENDER AS "a Locksmiths".

   video_template's body is "... for a {{2}} in {{3}}", so the property under test is not "does the
   normaliser work" but "can ANY value that is actually in the database produce a wrong sentence".
   The fixture below is therefore the REAL data, not invented examples: every distinct
   ai_audits.business_type, read 2026-09-12 with a paginated query (968 audits, 24 distinct values),
   with its audit count so the weight of each case is visible.

   ⛔ THE FIXTURE IS A SNAPSHOT AND SAYS SO. New trades will appear; when they do, the fallback rule
   is what has to hold, which is why the generated-cases block below drives shapes the fixture does
   not contain. Re-pull the list rather than assuming this is still the whole world.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { normaliseTrade, normaliseTown, TRADE_SINGULAR } from "../src/lib/templateVars.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** Every distinct business_type in ai_audits, with audit counts. Measured, not invented. */
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

console.log("── EVERY STORED TRADE EITHER RENDERS SAFELY OR IS BLOCKED ──");
let sendable = 0, blocked = 0;
for (const [raw, count] of STORED_TRADES) {
  const r = normaliseTrade(raw);
  if (!r.ok) {
    blocked += count;
    ok(typeof r.reason === "string" && r.reason.length > 0, `${JSON.stringify(raw)} blocked with a reason (${r.reason})`);
    continue;
  }
  sendable += count;
  const lastWord = r.value.split(" ").slice(-1)[0];
  /* THE TWO THINGS PAUL NAMED, asserted on the rendered sentence rather than on the value. */
  const sentence = `for a ${r.value} in Huntingdon`;
  ok(r.value === r.value.toLowerCase(), `${JSON.stringify(raw)} -> ${JSON.stringify(r.value)} is lowercase`);
  ok(!(lastWord.endsWith("s") && !/(?:ss|us|is)$/.test(lastWord)),
    `  ...and not plural — "${sentence}"`);
}
ok(sendable + blocked === 968, `all 968 audits accounted for (${sendable} sendable, ${blocked} blocked)`);

console.log("\n-- THE TRADES PAUL IS ACTUALLY CONTACTING: all take \"a\" --");
for (const [input, want] of [
  ["Locksmiths", "locksmith"], ["locksmiths", "locksmith"],
  ["Plumbers", "plumber"], ["plumbers", "plumber"],
  ["Driving instructors", "driving instructor"],
  ["Mobile mechanics", "mobile mechanic"],
  ["Mobile valeting and detailing", "mobile valeter"],
] as const) {
  const r = normaliseTrade(input);
  ok(r.ok && r.value === want, `${JSON.stringify(input)} -> ${JSON.stringify(want)}`);
}

console.log("\n-- A VOWEL-SOUND TRADE BLOCKS, BECAUSE THE APPROVED BODY HARDCODES \"for a\" --");
/* 113 of 968 audits. The template is NOT being edited (Paul, 2026-09-12), so the code refuses
   rather than sending "for a accountant in Peterborough". */
for (const vowel of ["Accountants", "accountant", "Accountant", "electrician", "electricians", "architect", "optician", "estate agent"]) {
  const r = normaliseTrade(vowel);
  ok(!r.ok && r.reason === "trade_starts_with_vowel_sound",
    `${JSON.stringify(vowel)} blocks (${r.ok ? "SENT: " + r.value : r.reason})`);
}
/* THE MAP DOES NOT EXEMPT IT, and that was a real bug for one commit: `accountants` and
   `electricians` ARE in TRADE_SINGULAR (their singular forms are correct), and returning early on
   a map hit meant the two trades this block exists for were the two that skipped it. */
ok(!!TRADE_SINGULAR["accountants"], "accountants IS in the map (its singular form is correct)");
ok(!normaliseTrade("accountants").ok, "  ...and is STILL blocked - a map hit is not an exemption");

console.log("\n-- VOWEL SOUND, NOT VOWEL LETTER --");
/* The exception lists exist because "a university" and "an hour" both defeat a first-letter test. */
ok(normaliseTrade("university tutor").ok, '"university tutor" SENDS - "a university", consonant sound');
ok(normaliseTrade("used car dealer").ok, '"used car dealer" SENDS - "a used car dealer"');
ok(normaliseTrade("utility engineer").ok, '"utility engineer" SENDS - "a utility engineer"');
ok(!normaliseTrade("hour").ok, '"hour" BLOCKS - "an hour", vowel sound behind a consonant');
ok(!normaliseTrade("heir hunter").ok, '"heir hunter" BLOCKS - "an heir hunter"');

console.log("\n── THE FALLBACK RULE, on shapes the fixture does not contain ──");
const fb = (s: string) => { const r = normaliseTrade(s); return r.ok ? r.value : `BLOCKED:${r.reason}`; };
ok(fb("Roofers") === "roofer", "unmapped plural is lowercased and singularised");
ok(fb("ROOFERS") === "roofer", "shouting is handled");
ok(fb("  Roofers  ") === "roofer", "padding is trimmed");
/* ⛔ THE "ss" CARVE-OUT. Without it "glass" becomes "glas". */
ok(fb("Glass merchants") === "glass merchant", "only the LAST word is singularised");
ok(fb("business") === "business", "a word ending in 'ss' keeps its s");
/* ⛔ AND THE LENGTH GUARD, which is what stops "gas" becoming "ga" — the failure a naive
   strip-the-s rule produces on a real trade word. */
ok(fb("gas") === "gas", "a short singular ending in s is not mangled ('gas' must not become 'ga')");
ok(fb("bus") === "bus", "nor 'bus' (the 'us' carve-out)");
/* ⛔ A STATED LIMIT, PINNED SO IT IS A DECISION RATHER THAN A SURPRISE. A FOUR-letter singular
   ending in a bare "s" — "lens", "alms" — is stripped to nonsense, because nothing distinguishes
   it from "kitchens" -> "kitchen" by shape alone. The rule is not bent for it: no such word is a
   trade, and TRADE_SINGULAR is the escape hatch if one ever is. This asserts the CURRENT behaviour
   so that changing it is a choice somebody makes on purpose. */
ok(fb("Lens") === "len", "KNOWN LIMIT: a 4-letter singular ending in a bare s is over-stripped ('lens' -> 'len')");

console.log("\n── ABSENCE AND JUNK BLOCK, THEY DO NOT GUESS ──");
for (const bad of ["", "   ", null, undefined]) {
  const r = normaliseTrade(bad as string | null | undefined);
  ok(!r.ok && r.reason === "trade_missing", `${JSON.stringify(bad)} blocks as trade_missing`);
}
ok(!normaliseTrade("kava cafe, pool bar").ok, "a comma-separated list blocks");
ok(!normaliseTrade("Shoe repairs & watch battery replacement").ok, "an ampersand list blocks");
ok(!normaliseTrade("plumber 24/7").ok, "a value carrying digits blocks");

console.log("\n── AND NOTHING IN THE MAP IS ITSELF UNSAFE ──");
for (const [k, v] of Object.entries(TRADE_SINGULAR)) {
  ok(k === k.toLowerCase(), `map key ${JSON.stringify(k)} is lowercase (or it can never be hit)`);
  const lastWord = v.split(" ").slice(-1)[0];
  ok(v === v.toLowerCase() && !(lastWord.endsWith("s") && !/(?:ss|us|is)$/.test(lastWord)),
    `  map value ${JSON.stringify(v)} is itself singular and lowercase`);
}

console.log("\n── THE TOWN GUARD ──");
/* The two real offenders, and the 238 that must keep working. */
ok(!normaliseTown("Bourne uk").ok, '"Bourne uk" blocks rather than rendering verbatim');
ok(!normaliseTown("GF3a").ok, '"GF3a" blocks');
for (const good of [
  "Wisbech", "Peterborough", "Huntingdon", "Bath", "Stoke-on-Trent",
  "Bury St Edmunds", "King's Lynn", "Weston-super-Mare", "St Neots",
]) {
  ok(normaliseTown(good).ok, `${JSON.stringify(good)} is accepted`);
}
/* ⛔ WHOLE-WORD MATCHING ON THE REJECT TOKENS — the substring trap this repo has fallen into twice
   ("bing" in "plumbing", "acca" in "Macca-Gas"). A town is not disqualified for CONTAINING "uk". */
ok(normaliseTown("Ukfield").ok, '"Ukfield" is not rejected for containing "uk"');
ok(normaliseTown("Englefield Green").ok, '"Englefield Green" is not rejected for containing "england"-ish letters');
for (const bad of ["", "   ", null, undefined]) {
  ok(!normaliseTown(bad as string | null | undefined).ok, `${JSON.stringify(bad)} blocks`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
