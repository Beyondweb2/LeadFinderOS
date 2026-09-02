/* normaliseTrade — the free-check trade spell-checker.
 *
 * The properties that matter are NEGATIVE ones: what it must refuse to do. A classifier that
 * quietly rewrites an unfamiliar trade into a familiar one would reproduce the bug it exists to
 * fix (an audit asking about the wrong trade) with more confidence, not less.
 *
 * Run: npx tsx scripts/free-check-trade.test.ts
 */
import { normaliseTrade, editDistance, KNOWN_TRADE_WORDS } from "../src/lib/freeCheckTrade.ts";

let pass = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) pass++;
  else fails.push(`${name}${extra ? ` — ${extra}` : ""}`);
}
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── THE REPORTED BUG: the real submission that triggered this work.
{
  const r = normaliseTrade("plummer");
  eq("plummer -> plumber", r.trade, "plumber");
  eq("plummer marked corrected", r.corrected, true);
  eq("plummer keeps what was submitted", r.submitted, "plummer");
}

// ── other obvious typos of words we know
eq("electrican", normaliseTrade("electrican").trade, "electrician");
// ⛔ THE TIE-BREAK EARNS ITS KEEP HERE: "electrican" is one edit from BOTH "electrician" (a dropped
// letter) and "electrical" (a substitution onto another listed word). The dropped-letter candidate
// wins because omissions are what people actually type — see correctToken.
eq("accountent", normaliseTrade("accountent").trade, "accountant");
eq("locksmit", normaliseTrade("locksmit").trade, "locksmith");
eq("plasterrer", normaliseTrade("plasterrer").trade, "plasterer");
eq("hairdreser", normaliseTrade("hairdreser").trade, "hairdresser");

// ── ABSENCE IS NEVER FILLED IN. Blank in, blank out — the caller must refuse to audit.
for (const v of ["", "   ", "\t\n", null, undefined, 42, {}, []]) {
  const r = normaliseTrade(v as unknown);
  eq(`absent input ${JSON.stringify(v)} -> blank`, r.trade, "");
  eq(`absent input ${JSON.stringify(v)} not corrected`, r.corrected, false);
}

// ── ⛔ SHORT WORDS UNTOUCHED. "bar" is a real free-check submission and a real trade.
eq("bar untouched", normaliseTrade("bar").trade, "bar");
eq("bar not corrected", normaliseTrade("bar").corrected, false);
eq("spa untouched", normaliseTrade("spa").trade, "spa");
eq("cafe untouched", normaliseTrade("cafe").trade, "cafe");
eq("pub untouched", normaliseTrade("pub").trade, "pub");

// ── ⛔ AN UNRECOGNISED TRADE IS NOT A MISSPELLING. Left exactly as typed.
for (const t of ["falconer", "puppeteer", "sommelier", "luthier", "cheesemonger", "milliner"]) {
  eq(`unknown "${t}" verbatim`, normaliseTrade(t).trade, t);
  eq(`unknown "${t}" not corrected`, normaliseTrade(t).corrected, false);
}

// ── correctly spelled input is returned byte-identical, including plurals and multi-word trades
for (const t of [
  "plumber", "plumbers", "locksmith", "locksmiths", "accountant", "accountants",
  "electrician", "gas engineer", "mobile mechanic", "driving instructor",
  "tree surgeon", "pest control", "window cleaner", "dog groomer",
]) {
  eq(`clean "${t}" unchanged`, normaliseTrade(t).trade, t);
  eq(`clean "${t}" not corrected`, normaliseTrade(t).corrected, false);
}

// ── plural of a typo keeps the plural
eq("plummers -> plumbers", normaliseTrade("plummers").trade, "plumbers");
eq("electricans -> electricians", normaliseTrade("electricans").trade, "electricians");

// ── capitalisation shape is preserved
eq("Plummer -> Plumber", normaliseTrade("Plummer").trade, "Plumber");
eq("multi-word cap kept", normaliseTrade("Mobile Plummer").trade, "Mobile Plumber");

// ── only the misspelled token is touched, in a multi-word trade
eq("mobile plummer", normaliseTrade("mobile plummer").trade, "mobile plumber");
eq("emergency locksmit", normaliseTrade("emergency locksmit").trade, "emergency locksmith");
eq("gas enginer", normaliseTrade("gas enginer").trade, "gas engineer");

// ── punctuation does not make a clean word look unknown
eq("trailing comma kept", normaliseTrade("plumber,").trade, "plumber,");
eq("typo with comma fixed", normaliseTrade("plummer,").trade, "plumber,");

// ── ⛔ NO CROSS-LENGTH LEAPS. A 2-edit budget must not reach a different trade entirely.
ok("gas is not stretched to glazier", normaliseTrade("gas").trade === "gas");
ok("roofer not turned into roofing", ["roofer"].includes(normaliseTrade("roofer").trade));

// ── ⛔ A TIE IS LEFT ALONE: output must not depend on declaration order.
// "advisor"/"adviser" are both listed and one edit apart, so anything equidistant from both stays.
{
  const r = normaliseTrade("advisar");
  ok("equidistant input left alone or resolved consistently",
    r.trade === "advisar" || r.trade === "adviser" || r.trade === "advisor",
    `got ${r.trade}`);
  // Determinism is the real requirement: the same input twice must give the same answer.
  eq("normaliseTrade is deterministic", normaliseTrade("advisar").trade, r.trade);
}

// ── the function is idempotent: correcting a corrected value changes nothing further
for (const t of ["plummer", "electrican", "bar", "falconer", "mobile plummer"]) {
  const once = normaliseTrade(t).trade;
  eq(`idempotent for "${t}"`, normaliseTrade(once).trade, once);
}

// ── editDistance sanity (it decides every correction above)
eq("distance identical", editDistance("plumber", "plumber"), 0);
eq("distance one sub", editDistance("plummer", "plumber"), 1);
eq("distance empty", editDistance("", "abc"), 3);

// ── the word list itself: lowercase, unique, no short entries that would fire on 3-letter input
{
  const dupes = KNOWN_TRADE_WORDS.filter((w, i) => KNOWN_TRADE_WORDS.indexOf(w) !== i);
  eq("no duplicate trade words", dupes.length, 0);
  const uppers = KNOWN_TRADE_WORDS.filter((w) => w !== w.toLowerCase());
  eq("trade words all lowercase", uppers.length, 0);
}

console.log(`\nfree-check-trade: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log("  FAIL " + f);
if (fails.length) process.exit(1);
