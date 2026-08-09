/* ============================================================
   MAY WE SAY "AI NEVER NAMED YOU"?

   ⛔ THE ASYMMETRY IS THE WHOLE DESIGN. A derived report finds a business absent from the market
   audit's answers and reports it. That is sound only when the name was distinctive enough to have
   been found. "Chichester Accountants Ltd" strips to nothing — the matcher has no needle — so a
   zero means "we could not tell", and printing it as "you are invisible" is the worst thing this
   product can do. Wilson rejected his report over a milder version and was right.

   Refusing costs 8p for a per-business audit. A false negative costs the prospect. So every case
   that cannot ESTABLISH distinctiveness must land on refuse, and this suite drives the ways a name
   can fail to say anything about a business.
   ============================================================ */
import { canDeriveReport, explainRefusal, MIN_ANSWERED_DATAPOINTS } from "../supabase/functions/_shared/derivable.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const v = (businessName: string | null | undefined, trade = "accountants", town = "Chichester", n = 32) =>
  canDeriveReport({ businessName, trade, town, answeredDatapoints: n });

console.log("── A REAL NAME IS DERIVABLE ──");
for (const n of [
  "Wilson's Mobile Valeting & Detailing",
  "Ultimate Valet Cambridge",
  "Chapman’s Valeting & Detailing Specialists",
  "James Todd & Co",
  "B4Bookkeeping",
  "Mapus-Smith & Lemmon LLP",
]) {
  const r = v(n, "mobile valeting", "Cambridge");
  ok(r.ok, `${JSON.stringify(n.slice(0, 34))} -> derivable (${JSON.stringify(r.distinctive.slice(0, 2))})`);
}

console.log("\n── ⛔ A NAME THAT IS ONLY ITS TRADE AND TOWN IS NOT ──");
/* The case the gate exists for. Strip the trade and the town and there is no needle left, so a
   blank result is unmeasurable rather than negative. */
for (const n of [
  "Chichester Accountants Ltd",
  "Accountants Chichester",
  "The Chichester Accountants",
  "Accountants",
  "Chichester Accountancy Limited",
]) {
  const r = v(n);
  ok(!r.ok && r.reason === "name_not_distinctive", `${JSON.stringify(n)} -> refused (${r.reason})`);
}

console.log("\n── ⛔ AND SO IS AN ABSENT ONE ──");
for (const [label, n] of [["null", null], ["undefined", undefined], ["empty", ""], ["whitespace", "   "]] as Array<[string, string | null | undefined]>) {
  const r = v(n);
  ok(!r.ok, `${label} name -> refused (${r.reason})`);
}
/* ⛔ A one- or two-letter remainder is not distinctive either: it prefix-matches half a town. */
for (const n of ["A1 Accountants Chichester", "JS Chichester Accountants"]) {
  const r = v(n);
  console.log(`  ${JSON.stringify(n)} -> ok=${r.ok} distinctive=${JSON.stringify(r.distinctive)}`);
}

console.log("\n── ⛔ ENOUGH ANSWERS TO HAVE LOOKED ──");
/* Absence from three answers is not evidence of absence. The threshold is a real sample. */
ok(v("Wilson's Mobile Valeting", "mobile valeting", "Cambridge", 32).ok, "32 answers is plenty");
ok(v("Wilson's Mobile Valeting", "mobile valeting", "Cambridge", MIN_ANSWERED_DATAPOINTS).ok,
  `exactly ${MIN_ANSWERED_DATAPOINTS} is allowed`);
for (const n of [0, 1, 6, MIN_ANSWERED_DATAPOINTS - 1]) {
  const r = v("Wilson's Mobile Valeting", "mobile valeting", "Cambridge", n);
  ok(!r.ok && r.reason === "too_few_answers", `${n} answers -> refused (too_few_answers)`);
}
/* ⛔ THE ABSENT VALUE. A caller that cannot count must not be read as having counted a lot. */
for (const [label, n] of [["NaN", NaN], ["negative", -5], ["Infinity", Infinity]] as Array<[string, number]>) {
  const r = canDeriveReport({ businessName: "Wilson's Valeting", trade: "mobile valeting", town: "Cambridge", answeredDatapoints: n });
  /* Infinity is NOT a count. Number.isFinite rejects it, so it falls to 0 and refuses - which is
     right: a caller that produced Infinity has not counted anything. My first expectation here was
     that it would pass, and the gate was more careful than I was. */
  ok(!r.ok && r.reason === "too_few_answers", `${label} answers -> refused, never treated as enough`);
}

console.log("\n── ⛔ THE TWO REFUSALS SAY DIFFERENT THINGS ──");
/* "We could not tell" and "you are invisible" must never print the same sentence — and neither
   must the two REASONS we could not tell, or the operator cannot act on them. */
const a = explainRefusal(v("Chichester Accountants Ltd"));
const b = explainRefusal(v("Wilson's Valeting", "mobile valeting", "Cambridge", 2));
const c = explainRefusal(v(null));
ok(a !== b && b !== c && a !== c, "all three refusals produce distinct wording");
ok(/could not tell/i.test(a), "the not-distinctive refusal says we could not tell, not that they are invisible");
ok(/audit this one individually/i.test(a), "  and tells the operator what to do instead");
ok(/\b2\b/.test(b) && new RegExp(`\\b${MIN_ANSWERED_DATAPOINTS}\\b`).test(b),
  "the too-few refusal names both the count and the threshold");
ok(explainRefusal(v("Wilson's Valeting", "mobile valeting", "Cambridge", 32)) === "",
  "a derivable business produces no refusal text at all");

console.log("\n── ⛔ A TRADE WORD IN ANOTHER GRAMMATICAL FORM IS STILL A TRADE WORD ──");
/* No suffix list is ever complete (plumbers/plumbing, accountants/accountancy,
   electricians/electrical), so the rule is a shared 5-character stem. It will sometimes strip a
   real name — "Plumbline" against the trade "plumbers" shares five — and that is the direction to
   err in: a wrongly-stripped name refuses and costs 8p for a per-business audit, where a
   wrongly-kept one lets us call a business invisible on the strength of its own trade word. */
for (const [n, trade, town] of [
  ["Chichester Accountancy Limited", "accountants", "Chichester"],
  ["Cambridge Valeters", "mobile valeting", "Cambridge"],
  ["Norwich Plumbing Ltd", "plumbers", "Norwich"],
  ["Ipswich Electrical", "electricians", "Ipswich"],
] as Array<[string, string, string]>) {
  const r = canDeriveReport({ businessName: n, trade, town, answeredDatapoints: 32 });
  ok(!r.ok, JSON.stringify(n) + " vs trade " + JSON.stringify(trade) + " -> refused (" + r.reason + ")");
}
/* ⚠️ AND IT MUST NOT EAT EVERY NAME. A distinctive word that merely starts with the same letter
   or two survives, or the gate would refuse the whole book and the derivation would be pointless. */
for (const [n, trade, town] of [
  ["Plum Perfect Valeting", "mobile valeting", "Cambridge"],
  ["Lockwood & Sons", "locksmiths", "Norwich"],
  ["Accurate Books", "accountants", "Chichester"],
] as Array<[string, string, string]>) {
  const r = canDeriveReport({ businessName: n, trade, town, answeredDatapoints: 32 });
  ok(r.ok, JSON.stringify(n) + " survives the stem rule -> " + JSON.stringify(r.distinctive));
}

console.log("\n── THE TRADE AND TOWN ACTUALLY GET STRIPPED ──");
/* If they did not, every name would look distinctive and the gate would pass everything. */
{
  const r = v("Accountants Chichester Ltd");
  ok(r.distinctive.length === 0, `"Accountants Chichester Ltd" leaves nothing: ${JSON.stringify(r.distinctive)}`);
  const r2 = v("Accountants Chichester Ltd", "plumbers", "Norwich");
  ok(r2.distinctive.length > 0, "  but in a PLUMBERS/NORWICH market the same words ARE distinctive");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
