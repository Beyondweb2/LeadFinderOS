/* ============================================================
   IS THIS A PAYING CUSTOMER? — the two rules the website add-on changed.

   🔴 THE BUG THIS PREVENTS (2026-09-03): the founder tile matched amount_paid against
   [49.99, 19.99] EXACTLY, within a penny. A customer who ticks "add a new website" pays the AI
   price plus a £49.99 build plus their first £9.99 of hosting in one session — £109.97 — and would
   have dropped out of the tile entirely. A paying customer reading as no sale is the exact class of
   false number this dashboard has been purged of twice.

   🔴 AND THE SECOND RULE IS THE ONE CLAUDE.md §11 PREDICTED: `paid = amount_paid > 0` is a single
   scalar and cannot express "bought once, hosting since cancelled". With a recurring charge in the
   product, a churned customer would read as paying forever.

   ⛔ BOTH ARE ABSENT-VALUE SHAPED, WHICH IS WHY THIS FILE EXISTS. A one-off customer has NO
   subscription and NO status, and must keep counting — so the churn test is a POSITIVE match on the
   two dead statuses, never `!== "active"`. The absent cases below are the point.
   ============================================================ */

// The predicate, restated exactly as useDashboardMetrics computes it.
const FOUNDER_PRICE_GBP = 49.99;
const FOUNDER_PRICES_HISTORICAL_GBP = [19.99];
const PAYING_FLOOR_GBP = Math.min(FOUNDER_PRICE_GBP, ...FOUNDER_PRICES_HISTORICAL_GBP);
const DEAD_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

const counts = (amountPaid: number | null, subscriptionStatus?: string | null): boolean => {
  const paidAmt = amountPaid ?? 0;
  if (!(paidAmt > 0)) return false;                       // stands in for isPaidLead
  const churned = DEAD_SUBSCRIPTION_STATUSES.has(String(subscriptionStatus ?? ""));
  return !churned && paidAmt >= PAYING_FLOOR_GBP - 0.01;
};

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── THE AMOUNTS WE ACTUALLY CHARGE ──");
ok(counts(49.99), "£49.99 AI only counts");
ok(counts(19.99), "£19.99 founder-era sale still counts (RG Locksmiths)");
ok(counts(109.97), "£109.97 with the website add-on counts — THE FIX");
ok(counts(99.98), "£99.98 (AI + build, hosting billed separately) counts");
ok(counts(59.98), "£59.98 (AI + first month, no build) counts");

console.log("\n── THE FLOOR ──");
ok(PAYING_FLOOR_GBP === 19.99, `the floor is the SMALLEST price ever charged (${PAYING_FLOOR_GBP})`);
/* ⚠️ THE BOUNDARY IS "WITHIN A PENNY OF THE FLOOR", not "at least the floor". £19.98 counts
   BECAUSE of the 1p tolerance, which is deliberate and inherited from the exact-match version.
   The first draft of this test asserted 19.98 was excluded and failed - the assertion was wrong,
   not the predicate. Pinning the real edge rather than the one I assumed. */
ok(counts(19.98), "a penny under the floor still counts (inside the 1p tolerance)");
ok(counts(19.97) === false, "two pence under the floor does NOT count");
ok(counts(19.99 - 0.005), "half a penny under still counts — the tolerance survives");
ok(counts(1000), "an unexpectedly large amount counts, rather than being dropped as unrecognised");

console.log("\n── CHURN: ONLY THE TWO DEAD STATUSES STOP IT COUNTING ──");
ok(counts(109.97, "canceled") === false, "'canceled' stops counting");
ok(counts(109.97, "incomplete_expired") === false, "'incomplete_expired' stops counting");
ok(counts(109.97, "past_due"), "'past_due' STILL counts — Smart Retries is trying, they have not left");
ok(counts(109.97, "unpaid"), "'unpaid' still counts — Stripe's own retries may yet succeed");
ok(counts(109.97, "active"), "'active' counts");
ok(counts(109.97, "trialing"), "'trialing' counts");

console.log("\n── ABSENCE IS NOT CHURN (a one-off customer has no subscription at all) ──");
ok(counts(49.99, null), "null status counts");
ok(counts(49.99, undefined), "absent status counts");
ok(counts(49.99, ""), "empty status counts");
ok(counts(49.99, "a_status_stripe_adds_in_2027"), "an UNKNOWN status counts — only the two dead ones stop it");

console.log("\n── NOT PAID AT ALL ──");
ok(counts(0) === false, "£0 does not count");
ok(counts(null) === false, "null amount does not count");
ok(counts(null, "active") === false, "an active subscription with no payment does not count");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
