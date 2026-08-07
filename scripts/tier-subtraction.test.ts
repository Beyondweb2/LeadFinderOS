/* ============================================================
   THE SUBTRACTION, IN BOTH DIRECTIONS.

   ⛔ ONE LINE OF CODE HAS NOW PRODUCED TWO OPPOSITE BUGS, three weeks apart, and each fix could
   have caused the other:

     NORWICH   kept `tier === "thin"` and dropped everything else, so `unknown` — which below the
               evidence bar is what EVERY entry is — was subtracted as established.
               15 real prospects vanished.
     CHICHESTER  keeps everything that is not `established`, and with the tier bar set to a flat 5
               while the SHAPE bar is 2 market audits, nothing could ever BE established.
               Chi-Lec Electrical (23 mentions, 2 of 2 audits, the market leader) was offered as a
               prospect. The reconciliation line said "24 entries − 0 already named" while the rows
               showed their mention counts.

   ⚠️ A ONE-DIRECTIONAL TEST WOULD HAVE PASSED BOTH TIMES. Norwich needed "a thin firm is KEPT";
   Chichester needs "the leader is REMOVED". Assert both on the same data or the next fix swings
   the line back the other way and looks green doing it.
   ============================================================ */
import {
  hasShapeEvidence, MARKET_AUDIT_MIN_AUDITS, EVIDENCE_MIN_AUDITS,
  ESTABLISHED_MIN_AUDIT_SHARE, ESTABLISHED_MIN_MENTION_SHARE,
  type MarketTier,
} from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* market-view's grading and subtraction, restated exactly. Both halves live here because the bug
   was never in either half alone — it was in the two of them disagreeing about the bar. */
function grade(
  v: { mentions: number; auditsNamedIn: number },
  ctx: { totalAudits: number; leaderMentions: number; marketAuditsDone: number; businessAuditsDone: number },
): MarketTier {
  const thinMarket = !hasShapeEvidence({
    marketAudits: ctx.marketAuditsDone, businessAudits: ctx.businessAuditsDone,
  });
  const auditShare = ctx.totalAudits > 0 ? v.auditsNamedIn / ctx.totalAudits : 0;
  const mentionShare = ctx.leaderMentions > 0 ? v.mentions / ctx.leaderMentions : 0;
  const established = auditShare >= ESTABLISHED_MIN_AUDIT_SHARE && mentionShare >= ESTABLISHED_MIN_MENTION_SHARE;
  return thinMarket ? "unknown" : established ? "established" : "thin";
}
/** market-view: a pool business stays a prospect unless AI names it CONSISTENTLY. */
const isProspect = (t: MarketTier) => t !== "established";

// ── THE REAL CHICHESTER MARKET: 2 completed market audits, 0 business audits ──
const CHI = { totalAudits: 2, leaderMentions: 23, marketAuditsDone: 2, businessAuditsDone: 0 };
const chiLec     = { mentions: 23, auditsNamedIn: 2 };   // the leader
const swift      = { mentions: 19, auditsNamedIn: 2 };
const arctic     = { mentions: 16, auditsNamedIn: 2 };
const henderson  = { mentions: 12, auditsNamedIn: 2 };
const onceNamed  = { mentions: 1,  auditsNamedIn: 1 };   // a genuine prospect
const neverNamed = { mentions: 0,  auditsNamedIn: 0 };

console.log("── ⛔ DIRECTION 1: THE LEADER MUST NOT BE A PROSPECT (Chichester) ──");
ok(grade(chiLec, CHI) === "established", `Chi-Lec (23 mentions, 2 of 2) grades established, not "${grade(chiLec, CHI)}"`);
ok(!isProspect(grade(chiLec, CHI)), "THE MARKET LEADER IS SUBTRACTED (was: offered as a prospect)");
ok(!isProspect(grade(swift, CHI)), "  Swift Electrical (19) subtracted");
ok(!isProspect(grade(arctic, CHI)), "  Arctic Electrical (16) subtracted");
ok(!isProspect(grade(henderson, CHI)), "  Henderson (12) subtracted");

console.log("\n── ⛔ DIRECTION 2: A THINLY-NAMED FIRM MUST STAY A PROSPECT (Norwich) ──");
ok(grade(onceNamed, CHI) === "thin", `named once in 1 of 2 grades thin, not "${grade(onceNamed, CHI)}"`);
ok(isProspect(grade(onceNamed, CHI)), "A FIRM NAMED ONCE IS STILL A PROSPECT (the 15 Norwich lost)");
ok(isProspect(grade(neverNamed, CHI)), "a firm never named is a prospect");
/* The degenerate case the graded model exists for: with ONE audit everybody is in 100% of audits,
   so auditShare carries no information and the mention half would decide alone. */
const ONE = { totalAudits: 1, leaderMentions: 23, marketAuditsDone: 1, businessAuditsDone: 0 };
ok(grade(chiLec, ONE) === "unknown", "with ONE market audit even the leader is only `unknown`");
ok(isProspect(grade(chiLec, ONE)), "  and below the bar nothing is subtracted — nothing is proven");

console.log("\n── THE TIER BAR AND THE SHAPE BAR ARE THE SAME BAR ──");
/* ⛔ THE ROOT CAUSE. The tier used a flat EVIDENCE_MIN_AUDITS (5) while the shape gate used
   hasShapeEvidence (2 market audits). Between 2 and 4 market audits the view called the shape and
   graded everything `unknown` at the same time. Asserting on the FUNCTION, not on a copied number:
   two thresholds that must agree will drift, one function cannot. */
for (let n = 0; n <= 6; n++) {
  const shapeCalled = hasShapeEvidence({ marketAudits: n, businessAudits: 0 });
  const tierMeansSomething = grade(chiLec, { ...CHI, totalAudits: Math.max(1, n), marketAuditsDone: n }) !== "unknown";
  ok(shapeCalled === tierMeansSomething,
    `${n} market audits: shape called=${shapeCalled}, tiers meaningful=${tierMeansSomething} — they agree`);
}
ok(MARKET_AUDIT_MIN_AUDITS === 2 && EVIDENCE_MIN_AUDITS === 5,
  `the two bars are still ${MARKET_AUDIT_MIN_AUDITS} market / ${EVIDENCE_MIN_AUDITS} business audits`);
/* Business audits alone must still need the full 5 — the market bar is lower because a market audit
   asks 8 questions AT the market, and lowering the business bar was never the intent. */
ok(!hasShapeEvidence({ marketAudits: 0, businessAudits: 4 }), "4 business audits alone: still below the bar");
ok(hasShapeEvidence({ marketAudits: 0, businessAudits: 5 }), "5 business audits alone: at the bar");

console.log("\n── THE RECONCILIATION MUST ADD UP ──");
/* "24 entries − 0 already named" was the visible symptom. The paragraph now states all three
   buckets, so they can be checked against the total by eye. */
const pool = [chiLec, swift, arctic, henderson, onceNamed, neverNamed];
const tiers = pool.map((p) => grade(p, CHI));
const subtracted = tiers.filter((t) => !isProspect(t)).length;
const thinKept = tiers.filter((t) => t === "thin" || t === "unknown").length;
console.log(`   ${pool.length} entries = ${subtracted} subtracted + ${thinKept} kept`);
ok(subtracted + thinKept === pool.length, "subtracted + kept accounts for every pool entry");
ok(subtracted === 4, `the four established firms are subtracted (got ${subtracted})`);

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
