/* ============================================================
   THE "MEASURING NOW" DERIVATION'S REGRESSION SUITE — Paul's spec, 2026-08-17.

   The indicator is derived from live audit state, never stored, and the fold has one property that
   must never break: ⛔ MARKET AUDITS ONLY. The runs table also carries business audits and the
   PAID BASELINE — a customer's guarantee measurement rendering as a Coverage spinner would be a
   privacy-of-purpose leak and plain wrong. `is_market` must be strictly true; absence excludes
   (the eleven-times-recorded absent-value rule).
   ============================================================ */
import { groupInFlight, inFlightKey } from "../src/lib/inFlightMeasures.ts";
import { MARKET_AUDIT_STALE_MS, MEASURE_CONCURRENCY_CAP, measureSlotsLeft } from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const NOW = 1_800_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const run = (id: string, audit: string, msAgo: number, status = "pending") =>
  ({ id, audit_id: audit, status, created_at: iso(msAgo) });
const market = (id: string, trade: string, town: string) =>
  ({ id, business_type: trade, location_text: town, is_market: true as boolean | null });
const q = (runId: string, status: string) => ({ run_id: runId, status });

console.log("── ⛔ Market audits only — baselines and business audits never appear ──");
{
  const runs = [run("r1", "a1", 60_000), run("r2", "a2", 60_000), run("r3", "a3", 60_000)];
  const audits = [
    market("a1", "Locksmiths", "Reading"),
    { id: "a2", business_type: "Locksmiths", location_text: "Reading", is_market: false },
    { id: "a3", business_type: "Locksmiths", location_text: "Reading", is_market: null },  // absent
  ];
  const out = groupInFlight(runs, audits, [], NOW);
  ok(out.length === 1 && out[0].auditIds.length === 1, "is_market false AND null (a baseline-shaped row) are both excluded");
}

console.log("── Two runs of one measure fold to one entry with summed progress ──");
{
  const runs = [run("r1", "a1", 240_000), run("r2", "a2", 180_000)];
  const audits = [market("a1", "Locksmiths", "Swindon (Swindon)"), market("a2", "Locksmiths", "Swindon (Swindon)")];
  const rows = [q("r1", "done"), q("r1", "done"), q("r1", "running"), q("r2", "done"), q("r2", "failed"), q("r2", "pending")];
  const out = groupInFlight(runs, audits, rows, NOW);
  ok(out.length === 1, "one market, one entry");
  ok(out[0].questionsDone === 4 && out[0].questionsTotal === 6, "progress counts SETTLED rows (done + failed = 4 of 6) — the same convention as the panel's state score");
  ok(out[0].startedMs === NOW - 240_000, "started at the EARLIEST run");
  ok(!out[0].stalled, "4 minutes old is measuring, not stalled");
}

console.log("── The stale grade uses the shared constant, exclusive boundary ──");
{
  const fresh = groupInFlight([run("r1", "a1", MARKET_AUDIT_STALE_MS)], [market("a1", "L", "T")], [], NOW);
  ok(!fresh[0].stalled, "exactly at the threshold is not yet stalled");
  const stale = groupInFlight([run("r1", "a1", MARKET_AUDIT_STALE_MS + 1)], [market("a1", "L", "T")], [], NOW);
  ok(stale[0].stalled, "past it is");
}

console.log("── Keys and edges ──");
ok(inFlightKey("Locksmiths", "Swindon (Swindon)") === inFlightKey(" locksmiths ", "SWINDON (SWINDON)"),
  "the join key is case- and whitespace-insensitive");
ok(groupInFlight([], [], [], NOW).length === 0, "nothing in flight → empty, no throw");
ok(groupInFlight([run("r1", "a1", 1000, "complete")], [market("a1", "L", "T")], [], NOW).length === 0,
  "a completed run never shows as measuring");
{
  const out = groupInFlight(
    [run("r1", "a1", 1000), run("r2", "a2", 2000)],
    [market("a1", "Locksmiths", "Reading"), market("a2", "Accountants", "Reading")],
    [], NOW,
  );
  ok(out.length === 2, "same town, different trades = two separate measures");
  ok(out[0].startedMs <= out[1].startedMs, "sorted oldest first");
}

console.log("── The concurrency cap — Paul's spec, 2026-08-17 ──");
ok(MEASURE_CONCURRENCY_CAP >= 2, "the cap permits concurrent measures — 1 would silently reinstate the one-at-a-time lock this shipped to remove");
ok(measureSlotsLeft(0) === MEASURE_CONCURRENCY_CAP, "idle page offers every slot");
ok(measureSlotsLeft(MEASURE_CONCURRENCY_CAP - 1) === 1, "one below the cap leaves exactly one slot");
ok(measureSlotsLeft(MEASURE_CONCURRENCY_CAP) === 0, "at the cap there are zero slots — the button disables and NAMES the running markets");
ok(measureSlotsLeft(MEASURE_CONCURRENCY_CAP + 3) === 0, "over the cap (panel-started measures can exceed it) still reads zero, never negative");
ok(measureSlotsLeft(-1) === MEASURE_CONCURRENCY_CAP, "a nonsense negative count is clamped, not amplified");
ok(measureSlotsLeft(2.9) === measureSlotsLeft(2), "a fractional count floors — a slot is whole or it is not there");

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? "" : "S"}`); process.exit(1); }
console.log("\nALL PASS");
