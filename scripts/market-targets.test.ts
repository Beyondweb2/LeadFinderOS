/* ============================================================
   THE TARGET RULE'S REGRESSION SUITE — Paul's 2026-08-14 targeting fix.

   Three predicates decide who gets pitched, and each has an absent-value case that history says
   will be got wrong (CLAUDE.md §6 counts eight instances of that shape):
     * poolTargetVerdict — zero scored answers must be 'unmeasured', NEVER 'target'. With nothing
       measured every share is 0/0, and "everyone is invisible" would be a prospect list built on
       no data — the Soham failure in a new coat.
     * offTradeMarkForGroup — untyped rows never vote. Every pool row cached before 2026-08-06 has
       no primaryType; reading absence as "not the trade" would mark whole historic markets
       off-trade (the same fault off-trade.test.ts pins for the single-row mark).
     * invisibilityPhrase — must never render a percentage of zero answers.

   The scoring itself is nameMatches, REUSED UNCHANGED (it also decides the report verdict and the
   week-8 guarantee comparison). The integration cases at the bottom prove the reuse behaves on the
   real shapes this feature exists for — junk words cannot score a pool row, real names do.
   ============================================================ */
import {
  poolTargetVerdict, TARGET_MAX_NAMED_SHARE, offTradeMarkForGroup, invisibilityPhrase,
  auditableTargets, poolRowToLead, type MarketPoolRow,
} from "../src/lib/marketView.ts";
import { nameMatches } from "../supabase/functions/_shared/enrichment/ai-search.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── ⛔ THE ABSENT CASE: zero scored answers is 'unmeasured', never 'target' ──");
ok(poolTargetVerdict(0, 0) === "unmeasured", "0 named of 0 answers → unmeasured (not a target)");
ok(poolTargetVerdict(5, 0) === "unmeasured", "impossible 5 of 0 → still unmeasured, never divides");
ok(poolTargetVerdict(0, -1) === "unmeasured", "negative denominator → unmeasured");
ok(poolTargetVerdict(0, NaN) === "unmeasured", "NaN denominator → unmeasured");

console.log("── The boundary is INCLUSIVE at TARGET_MAX_NAMED_SHARE (Paul: <=40% is a target) ──");
ok(TARGET_MAX_NAMED_SHARE === 0.4, "the constant is 40%, the number Paul set and will tune");
ok(poolTargetVerdict(2, 5) === "target", "2 of 5 = exactly 40% → target (boundary included)");
ok(poolTargetVerdict(21, 52) === "winning", "21 of 52 = 40.4% → winning (just over)");
ok(poolTargetVerdict(0, 32) === "target", "never named → target, the strongest pitch");
ok(poolTargetVerdict(32, 32) === "winning", "named in every answer → winning");
ok(poolTargetVerdict(21, 53) === "target", "21 of 53 = 39.6% → target (just under)");

console.log("── ⛔ offTradeMarkForGroup: absence never answers, one on-trade branch clears a chain ──");
const t = (primaryType?: string, primaryTypeLabel?: string) => ({ primaryType, primaryTypeLabel });
ok(offTradeMarkForGroup([t("service", "Services")], null) === undefined,
  "no consensus → nothing is marked, whatever the row says");
ok(offTradeMarkForGroup([t(), t(), t()], "locksmith") === undefined,
  "every branch untyped (pre-2026-08-06 cache) → no mark");
ok(offTradeMarkForGroup([t("service", "Services"), t("locksmith", "Locksmith")], "locksmith") === undefined,
  "THE TIMPSON CASE: one branch typed locksmith clears the whole chain");
ok(offTradeMarkForGroup([t("service", "Services"), t()], "locksmith")?.label === "Services",
  "all TYPED branches off-trade → marked with Google's own label; the untyped branch does not rescue it");
ok(offTradeMarkForGroup([t("shoe_repair")], "locksmith")?.label === "shoe repair",
  "no label → the raw type made readable");

console.log("── invisibilityPhrase: never a percentage of zero answers ──");
ok(invisibilityPhrase({ answersNamed: 0, answersTotal: 0 }).includes("not measured"),
  "0 of 0 says not-measured, not 'never named'");
ok(invisibilityPhrase({ answersNamed: 0, answersTotal: 32 }) === "never named in 32 AI answers",
  "0 of 32 reads as never named");
ok(invisibilityPhrase({ answersNamed: 7, answersTotal: 44 }) === "named in 7 of 44 answers (16%)",
  "the score reads as a share of answers");
ok(invisibilityPhrase({ answersNamed: 1, answersTotal: 1 }) === "named in 1 of 1 answers (100%)",
  "tiny denominators still render honestly");

console.log("── Integration: the score is nameMatches over answer text — junk cannot enter ──");
const CTX = { trade: "locksmiths", town: "Chester" };
const ANSWER =
  "For a locksmith in Chester, always check credentials. Here are options: Saltney Locksmiths " +
  "is well reviewed, and Chester Locksmiths Ltd covers the centre. PVC door specialists exist too.";
ok(nameMatches(ANSWER, "Saltney Locksmiths", CTX), "a real pool business named in the text scores");
ok(nameMatches(ANSWER, "Chester Locksmiths Ltd", CTX), "a description-style name still scores (the report's own convention)");
ok(!nameMatches(ANSWER, "A-Z Emergency Car key Services Chester", CTX),
  "a business the answer never names does not score");
/* The junk words that polluted the extracted lists ("Always", "Here", "PVC" as standalone
   'competitors') are simply not inputs any more: the pool is Places names, and no Places business
   is called "Always". A real multi-word firm that HAPPENS to start with one is still matchable: */
ok(nameMatches("We'd suggest Always Secure Ltd for urgent jobs.", "Always Secure Ltd", CTX),
  "a real firm whose name contains a function word still scores by its full name");

console.log("── The surface-shared helpers: one list, one mapping, no drift ──");
const row = (over: Partial<MarketPoolRow>): MarketPoolRow => ({
  key: "k", name: "A Locksmith", branches: 1, isChain: false, placeIds: ["pid1"],
  noWebsite: false, googleMapsUrl: "https://maps.example/x", websiteUrl: "https://a.example",
  answersNamed: 0, answersTotal: 32, ...over,
});
{
  const pool = [row({ key: "t" }), row({ key: "chain", isChain: true }), row({ key: "off", offTrade: { label: "Services" } })];
  const targets = auditableTargets(pool);
  ok(targets.length === 1 && targets[0].key === "t", "auditableTargets keeps targets, drops chains and wrong-trade");
  ok(auditableTargets([]).length === 0, "empty pool → empty targets, no throw");
}
{
  const l = poolRowToLead(row({ placeIds: ["place-9"], noWebsite: true, websiteUrl: null }));
  ok(l.id === "place-9" && l.websiteStatus === "NO_WEBSITE" && l.websiteUrl === undefined,
    "poolRowToLead: place id carried, no-website row maps to NO_WEBSITE with no URL");
  const l2 = poolRowToLead(row({}));
  ok(l2.websiteStatus === "HAS_OWN_WEBSITE" && l2.websiteUrl === "https://a.example",
    "…and a with-website row keeps its URL and status");
}

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? "" : "S"}`); process.exit(1); }
console.log("\nALL PASS");
