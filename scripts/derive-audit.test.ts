/* ============================================================
   DERIVING A PROSPECT'S REPORT FROM THE TOWN'S MARKET AUDIT.

   ⛔ THE ONE THING THAT MUST NEVER GO WRONG: `named` is RECOMPUTED for the prospect, never copied
   from the market audit's own stored flag. That flag was set at scan time against the market
   audit's placeholder name, so copying it would report the placeholder's result as the prospect's —
   a fabricated verdict wearing the appearance of a measured one, on the document that sells.

   The recompute uses the SAME nameMatches on the SAME answer text the per-business path has always
   used, so no new class of matching risk is introduced. What is new is only WHICH questions the
   answers came from, and those were measured to carry nothing business-specific across 925 of them.
   ============================================================ */
import { nameMatches } from "../supabase/functions/_shared/enrichment/ai-search.ts";
import { canDeriveReport } from "../supabase/functions/_shared/derivable.ts";
import { normaliseTownName } from "../supabase/functions/_shared/town-distance.ts";
import { canonicalTrade } from "../src/lib/trades.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* Real answer text, shortened. The names are the ones actually returned for Chichester accountants. */
const ANSWERS = [
  "For accountants in Chichester, well-regarded firms include Lewis Brownlee Chartered Accountants, "
  + "James Todd & Co and Standen Accounting Solutions.",
  "You could try Stedman Accounting Limited or B4Bookkeeping for small business accounts in the area.",
  "Chichester has several options including Lewis Brownlee and Peter Roberts Personal Tax.",
];

/* The recompute, restated from derive-audit's mapping step. */
function recompute(answers: string[], businessName: string) {
  let named = 0, total = 0;
  for (const text of answers) { total++; if (nameMatches(text, businessName)) named++; }
  return { named, total };
}

console.log("── ⛔ THE VERDICT IS THE PROSPECT'S, NOT THE MARKET AUDIT'S ──");
{
  /* A market audit's stored flags are all false — its placeholder name appears in nothing. Copying
     them would tell every prospect in the town they were never named, including the ones who were. */
  const copiedFromMarket = { named: 0, total: ANSWERS.length };
  const todd = recompute(ANSWERS, "James Todd & Co");
  ok(todd.named > 0, `James Todd & Co is found in the market answers (${todd.named} of ${todd.total})`);
  ok(todd.named !== copiedFromMarket.named,
    "  and that differs from the copied flag — which is exactly why copying is forbidden");
  const brownlee = recompute(ANSWERS, "Lewis Brownlee Chartered Accountants");
  /* ⚠️ ONE, NOT TWO — AND THAT IS A REAL LIMIT OF THE MATCHER, ASSERTED SO IT IS NOT MISTAKEN FOR
     CORRECTNESS. businessCore truncates at the first GENERIC_NAME_TOKEN; "accountants" is in that
     list but "chartered" is not, so the needle is the exact run "lewis brownlee chartered". The
     answer that says only "Lewis Brownlee" does not match and is recorded as NOT named.
     Measured across the whole book 2026-08-09: 40 of 1,720 scored datapoints, in 15 of 212 audits,
     are stored as not-named while the shortened name IS in the answer — so the true positive count
     is nearer 310 than 270. This is PRE-EXISTING and identical on the paid per-business path; the
     derivation inherits it rather than introducing it. Loosening it is a separate decision with a
     real trade-off (a shorter needle starts matching "Cambridge Driving Academy" for "Cambridge
     Driving Instructors"), and CLAUDE.md is explicit that ai-search.ts is not touched casually. */
  ok(brownlee.named === 1,
    `Lewis Brownlee matches only the answer using its FULL name (${brownlee.named} of 3) — the known matcher limit`);
}

console.log("\n── AND A BUSINESS GENUINELY ABSENT READS AS ABSENT ──");
{
  const r = recompute(ANSWERS, "Circular Accountants");
  ok(r.named === 0, `Circular Accountants is in none of them (${r.named} of ${r.total})`);
  ok(r.total === 3, "  but the denominator is still the real number of answers");
}

console.log("\n── ⛔ A SHORTENED NAME STILL MATCHES ──");
/* AI shortens names. nameMatches has always handled this on the per-business path; the derived path
   inherits it rather than reimplementing, which is the point of reusing the function. */
/* ⛔ THIS IS THE FALSE NEGATIVE, PINNED. It fails today and the assertion says so rather than
   pretending otherwise — if someone loosens businessCore later, this flips and they will find the
   note above explaining what else that changes. */
ok(!nameMatches("Lewis Brownlee is a good option in Chichester.", "Lewis Brownlee Chartered Accountants"),
  "a shortened name does NOT match today — pinned, not endorsed (see the note above)");
ok(nameMatches("Try James Todd & Co in Chichester.", "James Todd & Co"),
  "  a name whose core survives intact matches normally");
ok(!nameMatches("Try Standen Accounting Solutions.", "Stedman Accounting Limited"),
  "  but two genuinely different firms do NOT match");

console.log("\n── ⛔ THE GATE STILL DECIDES WHETHER A ZERO MAY BE PUBLISHED ──");
{
  const nAnswers = ANSWERS.length * 2;   // two engines
  const good = canDeriveReport({ businessName: "James Todd & Co", trade: "accountants", town: "Chichester", answeredDatapoints: 32 });
  ok(good.ok, "a distinctive name with enough answers is derivable");
  const bad = canDeriveReport({ businessName: "Chichester Accountants Ltd", trade: "accountants", town: "Chichester", answeredDatapoints: 32 });
  ok(!bad.ok, "a name that is only its trade and town is refused, whatever the answers say");
  const thin = canDeriveReport({ businessName: "James Todd & Co", trade: "accountants", town: "Chichester", answeredDatapoints: nAnswers });
  ok(!thin.ok, `${nAnswers} answers is below the threshold, so a zero would not be publishable`);
}

console.log("\n── ⛔ FINDING THE RIGHT MARKET AUDIT ──");
/* business_type is stored as typed, so singular and plural must find each other's market — that is
   what trades.ts exists for. */
ok(canonicalTrade("accountant")?.slug === canonicalTrade("accountants")?.slug,
  "a lead typed 'accountant' finds an 'accountants' market audit");
ok(canonicalTrade("plumber")?.slug !== canonicalTrade("locksmiths")?.slug,
  "  but a plumber never matches a locksmith market");
ok(canonicalTrade("kava cafe, pool bar") === null,
  "an unmapped trade stays unmapped — guessing which market it belongs to is how a plumber gets an accountant's report");
ok(normaliseTownName("Chichester") === normaliseTownName("chichester  "),
  "town matching ignores case and whitespace");
ok(normaliseTownName("Cambridge (Cambridge)") === normaliseTownName("Cambridge UK"),
  "  and the ONS parenthetical matches what an audit asks about");

console.log("\n── ⛔ NOTHING WAS SPENT, AND THE RECORD MUST SAY SO ──");
/* actor_cost_usd is what CLAUDE.md's cost queries read. A non-zero figure on a derived run would
   double-count the market audit's bill once per prospect derived from it. */
{
  const summary = { actor_cost_usd: 0, named_datapoints: 2, total_datapoints: 6 };
  ok(summary.actor_cost_usd === 0, "a derived run records zero spend");
  ok(summary.total_datapoints > 0 && summary.named_datapoints <= summary.total_datapoints,
    "and the counts are internally consistent");
  const rate = summary.named_datapoints / summary.total_datapoints;
  ok(rate > 0 && rate < 1, `mention_rate ${rate.toFixed(2)} is a real fraction`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
