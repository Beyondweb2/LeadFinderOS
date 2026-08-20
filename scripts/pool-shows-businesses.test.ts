/* ============================================================
   WHICH POOL STATES HAVE BUSINESSES TO SHOW — and therefore when the market view must offer
   "Find leads" instead.

   ⛔ WHY THIS IS WORTH PINNING. Burnley and Rugby (2026-08-20) were measured with no pool, and the
   market view offered no way forward that Paul could see: the pool card's search button was on
   screen — he quoted its title — but it was labelled "Run the lead search", carried no price, and
   opened a second confirm, so it did not read as the same class of action as the two primary
   buttons beside it. The find-leads action is now gated on THIS predicate in two places (the pool
   card and the primary button row), so the predicate is the thing that decides whether a market view
   can dead-end.

   ⛔ AND IT IS A POSITIVE TEST FOR A REASON. Written as `state !== 'never_searched'`, `expired`
   would claim to have businesses and the panel would render an empty list with no action — the
   original dead end, restored by a negative test. A fifth state added later must land on the
   offer-the-action side; that is what the last case here asserts.
   ============================================================ */
import { poolShowsBusinesses } from '../src/lib/marketView.ts';

let f = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? 'PASS  ' : 'FAIL  '} ${label}`);
  if (!cond) f++;
};

console.log('\n── the two states that DO have businesses ──');
ok(poolShowsBusinesses('ready') === true, "'ready' shows the businesses");
ok(poolShowsBusinesses('stale') === true,
  "'stale' shows them too — age decides the label, never whether they appear (the 2026-08-14 fix)");

console.log('\n── the two that do NOT, and must offer Find leads ──');
ok(poolShowsBusinesses('never_searched') === false, "'never_searched' has nothing to show");
ok(poolShowsBusinesses('expired') === false,
  "'expired' has nothing to show either — this is the case a negative test would have got wrong");

console.log('\n── absence and the unknown future state ──');
ok(poolShowsBusinesses(null) === false, 'null offers the action rather than claiming a pool');
ok(poolShowsBusinesses(undefined) === false, 'undefined does the same');
ok(poolShowsBusinesses('some_future_state' as never) === false,
  'an UNKNOWN state lands on the offer-the-action side, never on "we have businesses"');

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
