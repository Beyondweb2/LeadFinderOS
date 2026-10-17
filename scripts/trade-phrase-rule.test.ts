/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A TRADE IS A SHORT NOUN PHRASE (2026-10-17). "interior designers" / "english language schools" /
   "dental clinics" are single trades; a list, a sentence, a symbol or a long phrase is not.

   Property under test: ONE rule (tradePhraseProblem) decides all three slots — singular, plural and
   article — so they can never disagree; and a value that passes reads lowercase inside a sentence.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  articleTrade, normaliseTrade, pluraliseTrade, tradeInSentence, TRADE_MAX_CHARS, TRADE_MAX_WORDS,
} from "../src/lib/templateVars.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── SHORT NOUN PHRASES PASS ON THE PLURAL AND ARTICLE SLOTS ──");
for (const [raw, plural, article] of [
  ["interior designers", "interior designers", "an interior designer"],
  ["Interior designer", "interior designers", "an interior designer"],
  ["English language schools", "english language schools", "an english language school"],
  ["Dental clinics", "dental clinics", "a dental clinic"],
  ["event planners", "event planners", "an event planner"],
  ["accountants", "accountants", "an accountant"],
  ["driving instructors", "driving instructors", "a driving instructor"],
  ["Child's play centres", "child's play centres", "a child's play centre"],
  ["  Dental   clinics ", "dental clinics", "a dental clinic"],
] as const) {
  const p = pluraliseTrade(raw), a = articleTrade(raw);
  ok(p.ok && p.value === plural, `${JSON.stringify(raw)} -> plural "${plural}" (${JSON.stringify(p)})`);
  ok(a.ok && a.value === article, `${JSON.stringify(raw)} -> article "${article}" (${JSON.stringify(a)})`);
}
{
  const r = normaliseTrade("Dental clinics");
  ok(r.ok && r.value === "dental clinic", "singular slot still sends a consonant-initial phrase");
}

console.log("── FAILING VALUES ARE HELD ON EVERY SLOT, WITH THE RIGHT REASON ──");
for (const [raw, reason] of [
  ["Interior design and renovation", "trade_not_a_single_noun"],
  ["Wedding and event services", "trade_not_a_single_noun"],
  ["Company incorporation and accounting", "trade_not_a_single_noun"],
  ["plumbers & electricians", "trade_not_a_single_noun"],
  ["kava cafe, pool bar", "trade_not_a_single_noun"],
  ["shoes/boots", "trade_not_a_single_noun"],
  ["24 hour locksmith", "trade_has_digits"],
  ["plumber (emergency)", "trade_has_symbols"],
  ["plumbers!", "trade_has_symbols"],
  ["gas boiler repair engineer", "trade_phrase_too_long"],
  ["a b c d", "trade_phrase_too_long"],
  ["x".repeat(TRADE_MAX_CHARS + 1), "trade_phrase_too_long"],
  ["", "trade_missing"],
] as const) {
  for (const [name, fn] of [["normaliseTrade", normaliseTrade], ["pluraliseTrade", pluraliseTrade], ["articleTrade", articleTrade]] as const) {
    const r = fn(raw);
    ok(!r.ok && r.reason === reason, `${name}(${JSON.stringify(raw.slice(0, 40))}) held: ${reason}`);
  }
}

console.log("── THE LIMITS ARE EXACTLY THE DOCUMENTED ONES ──");
ok(TRADE_MAX_WORDS === 3, "three words at most");
{
  const three = pluraliseTrade("english language schools");
  const four = pluraliseTrade("private english language schools");
  ok(three.ok, "exactly three words passes");
  ok(!four.ok && four.reason === "trade_phrase_too_long", "four words is held");
}

console.log("── LOWERCASE INSIDE THE SENTENCE (no 'Interior' / 'Two' mid-line) ──");
ok(tradeInSentence("  Interior   Design ") === "interior design", "tradeInSentence lowercases and collapses spaces");
ok(tradeInSentence(null) === "", "tradeInSentence of null is empty");
const bodies = readFileSync(new URL("../src/lib/templateBodies.ts", import.meta.url), "utf8");
ok(!/\(trade \|\| ['"]/.test(bodies) && !/\$\{trade \|\| /.test(bodies),
  "no template body prints a raw, un-lowercased trade as a fallback");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
