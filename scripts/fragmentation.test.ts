/* ============================================================
   THE FRAGMENTATION VERDICT'S REGRESSION SUITE — Paul's spec, 2026-08-15.

   The verdict is junk-immune by construction (inputs are deterministic pool scores, never
   extracted names), so what needs pinning is the ARITHMETIC and the guards:
   ⛔ zero scored answers = UNMEASURED, never a verdict (every share would be 0/0 and the market
      would grade FRAGMENTED on no data — the Soham failure wearing a verdict word);
   ⛔ a tiny pool = POOL_TOO_SMALL, never a confident word (Aylesbury's 3 real locksmiths);
   ⛔ off-trade entries are outside BOTH sides of the ratio; chains are in the denominator
      (a dominant chain is real concentration) but never targets.
   The threshold cases at the bottom encode the measured 2026-08-15 distribution's known markets,
   so a "tidied" constant that flips one of them fails loudly with the town's name in the output.
   ============================================================ */
import {
  fragmentationVerdict, FRAG_MIN_GRADEABLE_ENTRIES, FRAG_MIN_TARGET_SHARE, TARGET_MAX_NAMED_SHARE,
  type FragmentationEntry,
} from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const e = (share: number, isChain = false, offTrade = false): FragmentationEntry => ({ share, isChain, offTrade });
const many = (n: number, share: number): FragmentationEntry[] => Array.from({ length: n }, () => e(share));

console.log("── ⛔ ZERO SCORED ANSWERS = UNMEASURED, whatever the pool looks like ──");
ok(fragmentationVerdict(many(20, 0), 0).kind === "unmeasured", "20 never-named entries + 0 answers → unmeasured, NOT fragmented");
ok(fragmentationVerdict([], 0).kind === "unmeasured", "empty everything → unmeasured");
ok(fragmentationVerdict(many(20, 0), NaN).kind === "unmeasured", "NaN answers → unmeasured");

console.log("── ⛔ POOL TOO SMALL below the measured floor ──");
ok(FRAG_MIN_GRADEABLE_ENTRIES === 5, "the floor is 5 gradeable entries (the three smallest live pools are 2, 3, 4)");
ok(fragmentationVerdict(many(4, 0), 32).kind === "pool_too_small", "4 entries → pool_too_small even at 100% target share");
ok(fragmentationVerdict(many(5, 0), 32).kind === "fragmented", "5 entries is the first gradeable size");
ok(fragmentationVerdict([e(0), e(0), e(0), e(0, false, true), e(0, false, true)], 32).kind === "pool_too_small",
  "off-trade entries do NOT count toward the gradeable floor (3 real + 2 off-trade = too small)");

console.log("── Off-trade out of both sides; chains in the denominator only ──");
{
  const v = fragmentationVerdict([e(0), e(0), e(0), e(0.9), e(0.9), e(0, false, true)], 32);
  ok(v.gradeable === 5 && v.targets === 3, "off-trade entry absent from gradeable AND targets");
}
{
  const v = fragmentationVerdict([e(0), e(0), e(0.1, true), e(0.9), e(0.9)], 32);
  ok(v.gradeable === 5, "a chain counts as a real business in the denominator");
  ok(v.targets === 2, "…but a chain is never a target, however rarely it is named");
  ok(v.kind === "fragmented", "2/5 = 40% ≥ the 35% bar → fragmented");
}

console.log("── Boundaries, inclusive where the spec says so ──");
ok(fragmentationVerdict([e(TARGET_MAX_NAMED_SHARE), e(0.9), e(0.9), e(0.9), e(0.9)], 32).targets === 1,
  "an entry named in exactly 40% of answers is still a target (Paul: boundary included)");
{
  // exactly at FRAG_MIN_TARGET_SHARE: 7 gradeable, 2.45 would be 35%; use 20 entries, 7 targets = 35%
  const entries = [...many(7, 0), ...many(13, 0.9)];
  const v = fragmentationVerdict(entries, 32);
  ok(Math.abs(v.targetShare - 0.35) < 1e-9 && v.kind === "fragmented", "target share exactly 35% → fragmented (inclusive)");
}
ok(fragmentationVerdict([...many(6, 0), ...many(14, 0.9)], 32).kind === "concentrated", "30% → concentrated");

console.log("── top3Share is the mean of the highest shares, robust to short lists ──");
{
  const v = fragmentationVerdict([e(1.0), e(0.5), e(0.25), e(0), e(0)], 32);
  ok(Math.abs(v.top3Share - (1.0 + 0.5 + 0.25) / 3) < 1e-9, "top-3 mean over the three loudest");
}
{
  const v = fragmentationVerdict([...many(3, 0), e(0.8), e(0.6)], 32);
  ok(Math.abs(v.top3Share - (0.8 + 0.6 + 0) / 3) < 1e-9, "zeros fill honestly when fewer than 3 named");
}

console.log("── The measured 2026-08-15 markets keep their verdicts (names in the failures) ──");
// locksmiths/Nuneaton: 7 gradeable (1 target, 5 winning, 1 chain) → concentrated
{
  const nuneaton = [e(0.2), ...many(5, 0.7), e(0.1, true)];
  ok(fragmentationVerdict(nuneaton, 18).kind === "concentrated", "Nuneaton-shaped market (1/7 = 14%) → CONCENTRATED");
}
// locksmiths/Halifax: 20 gradeable, 16 targets → fragmented
ok(fragmentationVerdict([...many(16, 0.05), ...many(3, 0.8), e(0.1, true)], 24).kind === "fragmented",
  "Halifax-shaped market (16/20 = 80%) → FRAGMENTED");
// locksmiths/Aylesbury: 3 gradeable → pool_too_small
ok(fragmentationVerdict([e(0.84), e(0.5), e(0.09, true)], 32).kind === "pool_too_small",
  "Aylesbury-shaped market (3 real entities) → POOL TOO SMALL, never a confident word");

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? "" : "S"}`); process.exit(1); }
console.log("\nALL PASS");
