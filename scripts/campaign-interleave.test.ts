/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ROUND-ROBIN ACROSS CAMPAIGNS — the properties, not the numbers.

   The rule under test: no campaign may drain before another starts, and a campaign's own leads must
   keep their FIFO order. Those pull in opposite directions, which is why both are asserted on every
   shape rather than eyeballed on one.

   ⛔ THE FIXTURE IS THE REAL QUEUE of 2026-09-14 — two campaigns, 20 leads queued across the morning
   and 75 sharing a single 15:53 timestamp. The shared timestamp is the case a naive implementation
   gets wrong: with no unique final tie-break the order depends on whatever order Postgres returned,
   and two ticks disagree about who is next.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { interleaveByCampaign, campaignsRepresented, NO_CAMPAIGN_KEY } from "../supabase/functions/_shared/campaign-interleave.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

type L = { id: string; campaign_id: string | null; queued_at: string | null };
const lead = (id: string, c: string | null, q: string | null): L => ({ id, campaign_id: c, queued_at: q });
const keyOf = (l: L) => l.campaign_id ?? NO_CAMPAIGN_KEY;

/** The live shape: A = 20 leads across the morning, B = 75 all stamped 15:53. */
const A = Array.from({ length: 20 }, (_, i) =>
  lead(`a${String(i).padStart(3, "0")}`, "053a05dd", `2026-09-14T0${6 + Math.floor(i / 10)}:${String(49 + (i % 10)).padStart(2, "0")}:29Z`));
const B = Array.from({ length: 75 }, (_, i) =>
  lead(`b${String(i).padStart(3, "0")}`, "f21d58a8", "2026-09-14T15:53:00Z"));

/* Hand them over in the order the database returns them: strict global FIFO, all of A then all of B.
   That IS the bug, so it is the input. */
const live = [...A, ...B];

console.log("── ⛔ THE LIVE QUEUE: NO CAMPAIGN DRAINS BEFORE ANOTHER STARTS ──");
{
  const out = interleaveByCampaign(live);
  ok(out.length === live.length, `nothing lost or duplicated (${out.length} of ${live.length})`);
  ok(new Set(out.map((l) => l.id)).size === live.length, "every lead appears exactly once");

  const first12 = out.slice(0, 12).map(keyOf);
  ok(new Set(first12).size === 2, "the first 12 ticks span BOTH campaigns (they were all one before)");
  ok(first12.filter((k) => k === "053a05dd").length === 6 &&
     first12.filter((k) => k === "f21d58a8").length === 6, "and split them 6/6");

  /* The headline property: the smaller campaign finishes while the larger one is still going. */
  const lastA = out.findIndex((l) => l.id === "a019");
  ok(lastA < 41, `the 20-lead campaign is done by send ${lastA + 1}, not held to the end`);
  ok(out.slice(lastA + 1).every((l) => keyOf(l) === "f21d58a8"), "after it clears, the rest is the big campaign alone");
}

console.log("\n── ⛔ A CAMPAIGN'S OWN ORDER IS NEVER RESHUFFLED ──");
{
  const out = interleaveByCampaign(live);
  for (const c of ["053a05dd", "f21d58a8"]) {
    const mine = out.filter((l) => l.campaign_id === c).map((l) => l.id);
    const want = live.filter((l) => l.campaign_id === c).map((l) => l.id);
    ok(JSON.stringify(mine) === JSON.stringify(want), `${c}: FIFO within the campaign is preserved exactly`);
  }
}

console.log("\n── ⛔ DETERMINISTIC ON A SHARED TIMESTAMP (the 75 leads stamped 15:53) ──");
{
  const shuffled = [...live].reverse();
  const a = interleaveByCampaign(live).map((l) => l.id).join(",");
  const b = interleaveByCampaign(shuffled).map((l) => l.id).join(",");
  ok(a === b, "the same queue in a different row order produces the SAME send order");
  const twice = interleaveByCampaign(live).map((l) => l.id).join(",");
  ok(a === twice, "and two ticks over one queue agree");
}

console.log("\n── ⛔ A NULL campaign_id IS ITS OWN BUCKET, NEVER DROPPED, NEVER MERGED ──");
{
  const orphans = Array.from({ length: 6 }, (_, i) => lead(`n${i}`, null, "2026-09-14T09:00:00Z"));
  const withNulls = [...live, ...orphans];
  const out = interleaveByCampaign(withNulls);
  ok(out.length === withNulls.length, "all six survive the re-order");
  ok(out.filter((l) => l.campaign_id === null).length === 6, "and are still null-campaigned, not relabelled");
  ok(campaignsRepresented(withNulls) === 3, "they count as a third campaign, not as part of another");
  const firstNull = out.findIndex((l) => l.campaign_id === null);
  ok(firstNull < 3, `and they get a turn in the FIRST round (position ${firstNull + 1}), not after 95 others`);
}

console.log("\n── ⚠️ THE ABSENT AND DEGENERATE CASES ──");
{
  ok(interleaveByCampaign([]).length === 0, "empty queue → empty, no throw");
  ok(interleaveByCampaign([A[0]])[0].id === "a000", "one lead → itself");
  const oneCampaign = interleaveByCampaign(A).map((l) => l.id);
  ok(JSON.stringify(oneCampaign) === JSON.stringify(A.map((l) => l.id)),
     "a single campaign is plain FIFO — the change is invisible when there is nothing to interleave");

  /* A missing queued_at must not crash or silently sort as 'newest'. */
  const noStamp = [lead("x1", "c1", null), lead("x2", "c1", "2026-09-14T08:00:00Z"), lead("y1", "c2", null)];
  const out = interleaveByCampaign(noStamp);
  ok(out.length === 3, "null queued_at rows survive");
  ok(new Set(out.map((l) => l.id)).size === 3, "and are not collapsed");
}

console.log("\n── ⛔ FAIRNESS HOLDS AT MANY CAMPAIGNS, INCLUDING VERY UNEVEN ONES ──");
{
  const sizes = [1, 2, 5, 40, 300];
  const many: L[] = [];
  sizes.forEach((n, ci) => {
    for (let i = 0; i < n; i++) many.push(lead(`c${ci}-${String(i).padStart(3, "0")}`, `camp${ci}`, `2026-09-14T10:0${ci}:00Z`));
  });
  const out = interleaveByCampaign(many);
  ok(out.length === many.length, `nothing lost across ${sizes.length} campaigns (${many.length} leads)`);

  /* Round r must contain one lead from every campaign that still has leads — that IS equal share. */
  const firstRound = out.slice(0, sizes.length).map(keyOf);
  ok(new Set(firstRound).size === sizes.length, "round 1 contains every campaign exactly once");

  /* The 1-lead campaign must not wait for the 300-lead one. */
  const tiny = out.findIndex((l) => l.campaign_id === "camp0");
  ok(tiny < sizes.length, `the 1-lead campaign sends in round 1 (position ${tiny + 1}), not after 300 others`);

  /* And no campaign may be more than one round ahead of another while both still have leads. */
  const seen: Record<string, number> = {};
  let fair = true;
  for (const l of out) {
    const k = keyOf(l);
    seen[k] = (seen[k] ?? 0) + 1;
    const live = Object.keys(seen).filter((c) => seen[c] < sizes[Number(c.slice(4))]);
    for (const c of live) if (seen[k] - (seen[c] ?? 0) > 1) fair = false;
  }
  ok(fair, "no campaign ever gets two rounds ahead of another that still has leads");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exitCode = 1;
