/* ============================================================
   THE OFF-TRADE MARK.

   ⛔ THE FAULT THIS GUARDS IS NOT "does it spot a hardware shop" — it is the ABSENCE RULE. Every
   pool row cached before the field mask changed has no primaryType. If absence is read as "not the
   trade", the mark appears on EVERY historic row and the panel calls a whole market non-locksmiths.
   That is the same failure as the tier subtraction (unknown read as named, 15 Norwich prospects
   dropped) and the questionnaire column (null read as "they said no"), which is why it is asserted
   first and hardest here rather than left to a comment.
   ============================================================ */
import {
  expectedPrimaryType, offTradeMark, OFF_TRADE_MIN_SHARE, OFF_TRADE_MIN_TYPED,
} from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const t = (primaryType?: string, primaryTypeLabel?: string) => ({ primaryType, primaryTypeLabel });
const many = (type: string, n: number) => Array.from({ length: n }, () => t(type));

console.log("── ⛔ ABSENCE IS NEVER AN ANSWER ──");
const NORWICH = [...many("locksmith", 8), t("hardware_store", "Hardware Store")];
ok(offTradeMark(t(undefined), expectedPrimaryType(NORWICH)) === undefined,
  "a row with NO type is never marked, even against a strong consensus");
ok(expectedPrimaryType(many("locksmith", 3).concat([t(undefined), t(undefined), t(undefined)])) === null,
  "untyped rows do not vote: 3 typed rows is below the floor, so no consensus");
ok(offTradeMark(t("hardware_store"), null) === undefined,
  "no consensus -> nothing is marked, however wrong the row looks");
// The whole historic pool, every row untyped. Not one mark, and no consensus to mark against.
const HISTORIC = Array.from({ length: 20 }, () => t(undefined));
ok(expectedPrimaryType(HISTORIC) === null && HISTORIC.every((r) => offTradeMark(r, expectedPrimaryType(HISTORIC)) === undefined),
  "A PRE-FIELD-MASK POOL OF 20 PRODUCES ZERO MARKS (the regression that would call a market non-locksmiths)");

console.log("\n── IT FINDS WHAT PAUL FOUND IN NORWICH ──");
const exp = expectedPrimaryType(NORWICH);
ok(exp === "locksmith", `the consensus is derived, not declared: ${exp}`);
ok(offTradeMark(t("hardware_store", "Hardware Store"), exp)?.label === "Hardware Store",
  "the hardware shop is marked, with GOOGLE'S OWN label");
ok(offTradeMark(t("locksmith"), exp) === undefined, "an actual locksmith is not marked");
ok(offTradeMark(t("shoe_repair_shop"), exp)?.label === "shoe repair shop",
  "no display label -> the raw type made readable, never the raw underscored token");

console.log("\n── ...WITHOUT A TRADE TABLE ANYWHERE ──");
/* The same code, no edit, on trades nobody wrote a rule for. This is the whole point: a hardcoded
   trade -> type map would be right for locksmiths and absent for everything else. */
ok(expectedPrimaryType([...many("plumber", 6), t("hvac_contractor")]) === "plumber", "plumbers");
ok(expectedPrimaryType([...many("hair_salon", 5), t("barber_shop")]) === "hair_salon", "salons");
ok(offTradeMark(t("barber_shop", "Barber Shop"), expectedPrimaryType([...many("hair_salon", 5), t("barber_shop")]))?.label === "Barber Shop",
  "  and a barber in a salon pool is marked, on data alone");

console.log("\n── THE GUARDS AGAINST MARKING HALF A MARKET ──");
ok(expectedPrimaryType(many("locksmith", OFF_TRADE_MIN_TYPED - 1)) === null,
  `${OFF_TRADE_MIN_TYPED - 1} typed rows is below OFF_TRADE_MIN_TYPED -> no consensus`);
ok(expectedPrimaryType(many("locksmith", OFF_TRADE_MIN_TYPED)) === "locksmith",
  `${OFF_TRADE_MIN_TYPED} typed rows reaches it`);
// A genuinely split pool has no expected type. 5 v 5 is exactly the share bar; 4 v 6 is under it.
ok(expectedPrimaryType([...many("locksmith", 4), ...many("hardware_store", 6)]) === "hardware_store",
  "a 60% majority is a consensus");
ok(expectedPrimaryType([...many("locksmith", 3), ...many("hardware_store", 3), ...many("key_shop", 4)]) === null,
  `a three-way split with no ${OFF_TRADE_MIN_SHARE * 100}% majority marks NOTHING`);

console.log("\n── DETERMINISM ──");
const SPLIT = [...many("b_type", 5), ...many("a_type", 5)];
ok(expectedPrimaryType(SPLIT) === expectedPrimaryType([...SPLIT].reverse()),
  "an exact tie gives the same answer whichever order the pool arrives in");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
