/* ============================================================
   THE BATCH-AUDIT PLAN'S SUITE — Paul's spec, 2026-08-30.

   This module decides how much money one press spends, so the absent cases are driven explicitly:
   an unknown run status, a missing created_at, an unreadable Apify budget, and a typed number
   above the job cap. Each of those has a safe direction and a dangerous one, and the tests assert
   the safe direction rather than the happy path.
   ============================================================ */
import {
  splitAlreadyAudited, oldestFirst, estimateBatchCost, budgetVerdict,
  monthlyRemainingUsd, resolveTake,
} from "../src/lib/auditBatchPlan.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const isAgg = (u: string) => /facebook\.com|instagram\.com/i.test(u);

console.log("── ALREADY-AUDITED SPLIT: completed vs failed vs in flight ──");
{
  const by = {
    a: { status: "complete" }, b: { status: "capped" },
    c: { status: "failed" },
    d: { status: "pending" }, e: { status: "running" },
    f: { status: "something_new" },   // unrecognised
    g: { status: null },              // absent
  };
  const s = splitAlreadyAudited(["a", "b", "c", "d", "e", "f", "g", "never"], by as never);
  ok(s.completed === 2, "complete + capped = 2 genuinely done");
  ok(s.failed === 1, "failed counted separately — the ones worth knowing about");
  ok(s.inProgress === 4, "⛔ pending + running + UNRECOGNISED + null = 4 in progress");
  ok(s.total === 7, "a lead with no audit at all is not in the split");
}
ok(splitAlreadyAudited(["x"], { x: { status: "wat" } } as never).completed === 0,
  "⛔ an unknown status is NEVER counted as completed — absence is not 'done'");

console.log("\n── OLDEST-ADDED FIRST ──");
{
  const l = [
    { id: "new", created_at: "2026-08-01T00:00:00Z" },
    { id: "old", created_at: "2026-01-01T00:00:00Z" },
    { id: "mid", created_at: "2026-05-01T00:00:00Z" },
  ];
  ok(oldestFirst(l).map((x) => x.id).join(",") === "old,mid,new", "sorted oldest → newest");
}
{
  /* ⛔ THE ONE THAT MATTERS: a date-less lead must not jump the queue. Treating a missing
     created_at as epoch-zero would put every one of them at the front of every batch and starve
     the real backlog — the exact opposite of what oldest-first is for. */
  const l = [
    { id: "dated", created_at: "2026-01-01T00:00:00Z" },
    { id: "nodate", created_at: null },
    { id: "baddate", created_at: "not-a-date" },
  ];
  const order = oldestFirst(l).map((x) => x.id);
  ok(order[0] === "dated", "⛔ a real date always precedes a missing one");
  ok(order.includes("nodate") && order.includes("baddate"), "and neither is dropped");
}
ok(oldestFirst([{ id: "b", created_at: null }, { id: "a", created_at: null }]).map((x) => x.id).join(",") === "a,b",
  "id is the tiebreaker, so the order is stable across renders");

console.log("\n── COST IS PRICED OVER THE SLICE, NOT SCALED ──");
{
  const rates = { usdPerQuestion: 0.0104, usdPerSeoScan: 0.04 };
  const withSites = [
    { id: "1", website: "https://a.co.uk" }, { id: "2", website: "https://b.co.uk" },
  ];
  const without = [
    { id: "3", website: "" }, { id: "4", website: "https://facebook.com/x" },
  ];
  const a = estimateBatchCost(withSites, 3, rates, isAgg);
  const b = estimateBatchCost(without, 3, rates, isAgg);
  ok(a.withWebsite === 2 && b.withWebsite === 0, "a Facebook-only page is NOT an own website");
  ok(Math.abs(a.totalUsd - (2 * 3 * 0.0104 + 2 * 0.04)) < 1e-9, "questions + 2 SEO scans");
  ok(Math.abs(b.totalUsd - (2 * 3 * 0.0104)) < 1e-9, "no site → no scan");
  ok(a.totalUsd > b.totalUsd * 1.5,
    "⛔ two slices of the SAME SIZE differ hugely — which is why cost is computed per slice");
  ok(estimateBatchCost([], 3, rates, isAgg).totalUsd === 0, "an empty run costs nothing");
}

console.log("\n── BUDGET: an unreadable figure is UNKNOWN, never 'you have room' ──");
{
  ok(budgetVerdict(5, 10).exceeds === false, "$5 fits in $10");
  ok(budgetVerdict(15, 10).exceeds === true, "$15 does not fit in $10");
  ok(budgetVerdict(10, 10).exceeds === false, "exactly the budget still fits (boundary inclusive)");
  for (const missing of [null, undefined, NaN]) {
    const v = budgetVerdict(999, missing as number | null);
    ok(v.unknown === true, `remaining ${String(missing)} → unknown`);
    ok(v.exceeds === false, `  and NOT reported as exceeding — the caller says "couldn't check"`);
  }
}
{
  ok(monthlyRemainingUsd({ monthlyUsageUsd: 40, maxMonthlyUsageUsd: 100 }) === 60, "100 − 40 = 60 left");
  ok(monthlyRemainingUsd({ monthlyUsageUsd: 120, maxMonthlyUsageUsd: 100 }) === 0, "over cap clamps to 0, never negative");
  ok(monthlyRemainingUsd(null) === null, "no snapshot → null");
  ok(monthlyRemainingUsd({ monthlyUsageUsd: 40 }) === null, "half a snapshot → null, not a guess");
}

console.log("\n── TYPED NUMBER vs THE JOB CAP: reported, never silently truncated ──");
{
  const CAP = 100;
  ok(resolveTake(80, 300, CAP).take === 80, "80 of 300 eligible → 80");
  const over = resolveTake(150, 300, CAP);
  ok(over.take === CAP && over.overCap === true, "⛔ 150 clamps to the cap AND flags overCap so the UI can say so");
  const overEl = resolveTake(50, 20, CAP);
  ok(overEl.take === 20 && overEl.overEligible === true, "more than eligible → clamped and flagged");
  for (const bad of [0, -5, null, undefined, NaN, 'abc']) {
    ok(resolveTake(bad as number, 300, CAP).take === 0, `junk input ${JSON.stringify(bad)} → 0, never the whole batch`);
  }
  ok(resolveTake(2.7, 300, CAP).take === 2, "a fraction floors — never rounds up into extra spend");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exit(1);
