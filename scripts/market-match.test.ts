/* ============================================================
   THE MATCHER'S REGRESSION SUITE.

   ⛔ IT DID NOT EXIST. Every case below was documented in a comment in market-match.ts — the Rapid
   trap, Timpson, LockRite, the Wrexham junk, Little's — each one a real market that cost a
   diagnosis. A comment records what happened; it cannot stop it happening again, which is the same
   lesson as the constants. This file is those comments turned into assertions, written BEFORE the
   Norwich fix so it can prove what it did not break.
   ============================================================ */
import { buildMatchContext, candidateCores, namesMatch } from "../supabase/functions/_shared/market-match.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const LOCKS_NORWICH = buildMatchContext("locksmiths", "Norwich");
const LOCKS_WISBECH = buildMatchContext("locksmiths", "Wisbech");
const LOCKS_HASTINGS = buildMatchContext("locksmiths", "Hastings");
const ELEC_WREXHAM = buildMatchContext("electricians", "Wrexham");

const same = (a: string, b: string, ctx = LOCKS_NORWICH) =>
  namesMatch(candidateCores(a, ctx), candidateCores(b, ctx), ctx);

console.log("── ⛔ THE TRAPS. These must stay REFUSED, whatever else changes ──");
ok(!same("Rapid Locksmiths", "Rapid Secure UK", LOCKS_WISBECH),
  "THE RAPID TRAP: a trade-stripped residue must not swallow a different firm");
ok(!same("Mobile", "Mobile Auto Electricians", ELEC_WREXHAM),
  "Wrexham: the junk fragment 'Mobile' must not absorb a real entry");
ok(!same("Industrial", "Wrexham Industrial Estate", ELEC_WREXHAM),
  "Wrexham: nor 'Industrial'");
ok(!same("PT Lock & Safe", "AC Leigh"), "two plainly different firms stay apart");
ok(!same("LockSolid Locksmiths", "LockRite Locksmiths"), "similar brands are not merged");
ok(!same("Key & Laser Services", "Laser Key Products"), "shared words in another order are not one firm");

console.log("\n── THE MERGES THAT WERE FOUGHT FOR. These must stay MERGED ──");
ok(same("Timpson", "Timpson Key Machine"), "Timpson: a full name prefixing its own extension");
ok(same("Timpson", "Timpson Locksmiths and Safe Engineers", LOCKS_HASTINGS),
  "Timpson: the connector-split candidate meets the plain name by EQUALITY");
ok(same("LockRite", "LockRite Wisbech", LOCKS_WISBECH), "LockRite: town variant");
ok(same("LockRite", "LockRite Locksmiths Wisbech", LOCKS_WISBECH), "LockRite: town + trade variant");
ok(same("Little's Locksmiths", "Little's Locks", LOCKS_HASTINGS),
  "Little's: trade-adjacent extra token, said differently");
ok(same("Wisbech Locksmiths (Rapid Locksmiths)", "Rapid Locksmiths", LOCKS_WISBECH),
  "the identifying half inside brackets");

console.log("\n── ⛔ NORWICH: THE THREE SPLITS PAUL FOUND ──");
ok(same("PT Lock & Safe", "P T Lock & Safe Ltd"), "initials: 'PT' == 'P T'");
ok(same("LockSolid Locksmiths", "Lock Solid Locksmiths Norwich"), "compound: 'LockSolid' == 'Lock Solid'");
ok(same("Key & Laser Services", "Key Laser Services"), "connector: '&' present or absent is one firm");

console.log("\n── ...AND THE OVER-MERGES THOSE FIXES COULD CAUSE ──");
ok(!same("A1 Locksmiths", "A2 Locksmiths"), "initial-collapse must not merge A1 and A2");
ok(!same("PT Lock & Safe", "PTS Lock & Safe"), "nor 'PT' with 'PTS'");
ok(!same("LockSolid", "SolidLock"), "compound split must not merge a reversal");
ok(!same("Key Services", "Laser Services"), "connector removal must not merge either half alone");
/* ⚠️ A KNOWN OVER-MERGE, PRE-EXISTING AND NOT INTRODUCED HERE — proven by running this suite against
   the committed matcher before the Norwich fix, where it behaves identically.
   "Smith and Sons" and "Smith and Daughters" both yield the exactOnly candidate "smith", because the
   connector-split candidate added for Timpson takes everything before the first connector. Two firms
   sharing a pre-connector stem therefore merge.
   Asserted as CURRENT BEHAVIOUR rather than silently dropped, so the limitation is written down. If
   anyone tightens it, the Timpson-by-equality case two blocks above is the thing that has to be
   re-proven — that is what the loosening was for. */
ok(same("Smith and Sons", "Smith and Daughters"),
  "KNOWN LIMIT: two firms sharing a pre-connector stem merge (inherited from the Timpson fix)");

console.log("\n── ⛔ SOHAM: \"A / B\" IS TWO FIRMS, NOT ONE ──");
/* The compound used to yield candidates for BOTH halves, and groupNames is union-find, so it
   BRIDGED two unrelated firms into one group. Huntingdon's own Homefront then counted as Ely
   appearing in another town, and the panel said "Skip this one" about a market whose leader is a
   local firm in the next town along. A wrong VERDICT, not a wrong row. */
ok(!same("Ely & Soham Locksmiths / Homefront Locksmiths", "Homefront Locksmiths"),
  "THE BRIDGE IS BROKEN: the compound no longer matches its SECOND half");
ok(same("Ely & Soham Locksmiths / Homefront Locksmiths", "Ely Locksmiths"),
  "  it still matches its FIRST half, which is the firm the string is about");
ok(!same("Ely Locksmiths", "Homefront Locksmiths"),
  "  and the two firms themselves never meet");
// The reversed spelling exists in the corpus too, and attaches to the other firm. That both orders
// occur is the evidence these are pairs rather than trading names.
ok(same("Homefront / Ely & Soham Locksmiths", "Homefront Locksmiths"), "the reversal follows its own first half");
ok(!same("Homefront / Ely & Soham Locksmiths", "Ely Locksmiths"), "  and not the other");
// Two CHAINS listed together must not become one chain — this one would corrupt the national flag.
ok(!same("Able Group / Keytek Locksmiths", "Keytek Locksmiths"), "Able Group / Keytek does not absorb Keytek");
ok(same("Able Group / Keytek Locksmiths", "Able Group"), "  it is Able Group");
ok(!same("Spalding Locksmiths / White Knight Locksmiths", "White Knight Locksmiths", LOCKS_WISBECH),
  "Spalding / White Knight does not bridge");

console.log("\n── ...AND \"24/7\" IS A NUMBER, NOT A SEPARATOR ──");
/* ⚠️ THE OVER-SPLIT RISK, and the reason the separator demands whitespace on BOTH sides. All seven
   slash-bearing names in the corpus that are NOT pairs are of this shape. */
ok(same("Lockout 24/7 Locksmiths", "Lockout 24/7"), "'24/7' survives intact — no split");
/* ⚠️ NOT `same("Locksmith Master 24/7", "Locksmith Master")` — that fails, and correctly so: both
   are trade-stripped residues, so exactOnly applies and "master" may not absorb "master 24 7". It
   is the Rapid guard doing its job and has nothing to do with slashes. Written down because it
   looked like a slash regression for a minute and will again. */
ok(same("Prestige Maintenance 24/7 Ltd", "Prestige Maintenance 24/7"),
  "a trailing 24/7 is kept whole — the digits are not split off");
ok(!same("Lockout 24/7 Locksmiths", "Master 24/7 Locksmiths"), "  and it still does not over-merge");
// An AMPERSAND is not a separator. These are single firms and must stay single — the specific
// over-splitting risk Paul named.
ok(same("Cambs Lock & Safe", "Cambs Lock & Safe Ltd"), "an ampersand name is one firm, still merged");
ok(same("M&E Services Ltd", "M&E Services"), "  M&E Services is one firm");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
