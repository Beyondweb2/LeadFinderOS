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

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
