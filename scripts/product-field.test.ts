/* ============================================================
   PRODUCT — WHAT WE ARE SELLING, SEPARATE FROM STATUS.

   🔴 Paul, 2026-09-11: "Status and PRODUCT are two different things and I only have one field for
   both." Measured: 498 unarchived leads at replied/report_sent/interested with no record of which
   product they are for, 421 of them at report_sent.

   ⛔ NULL MEANS UNDECIDED and is never stored as a word, so there is no backfill and no default
   to go stale. An UNRECOGNISED value also reads as undecided — it must surface rather than join a
   pile silently.
   ============================================================ */
import { productOf, PRODUCT_VALUES, PRODUCT_OPTIONS, PRODUCT_UNDECIDED,
         normalisePhoneKey, sharedPhoneLeadIds } from "../src/types/outreach.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ── Absence is absence ──────────────────────────────────────────────────────────────────── */
ok(productOf(null) === null, "a null lead reads undecided");
ok(productOf({}) === null, "⛔ a row written BEFORE the column existed reads undecided, not an error");
ok(productOf({ product: null }) === null, "null is undecided");
ok(productOf({ product: "" }) === null, "empty string is undecided");
ok(productOf({ product: "   " }) === null, "whitespace is undecided");
ok(productOf({ product: "undecided" }) === null,
   "⛔ even the WORD 'undecided' reads as undecided — it is not one of the three products");
ok(productOf({ product: "something_new" }) === null,
   "🔴 an UNRECOGNISED value reads undecided rather than joining a pile silently");
for (const v of PRODUCT_VALUES) ok(productOf({ product: v }) === v, `'${v}' round-trips`);
ok(productOf({ product: "REBUILD" }) === "rebuild", "case is normalised");
ok(PRODUCT_UNDECIDED !== "" && !(PRODUCT_VALUES as readonly string[]).includes(PRODUCT_UNDECIDED),
   "the undecided FILTER sentinel can never collide with a real product value");
ok(PRODUCT_OPTIONS.length === PRODUCT_VALUES.length, "every product has an option");
ok(PRODUCT_OPTIONS.every((o) => o.label && o.hint), "and each says what it means");

/* ── 🔴 SHARED PHONES — the class that sent 25 duplicate openers in August ────────────────── */
ok(normalisePhoneKey("+44 7920 684400") === normalisePhoneKey("07920684400"),
   "⛔ +44 and 0 forms of the SAME subscriber match — a raw compare would call them two people");
ok(normalisePhoneKey("07920 684400") === normalisePhoneKey("+447920684400"), "spacing does not matter");
ok(normalisePhoneKey("") === "" && normalisePhoneKey(null) === "" && normalisePhoneKey(undefined) === "",
   "no phone yields no key");
{
  const ids = sharedPhoneLeadIds([
    { id: "a", phone: "+44 7920 684400" },
    { id: "b", phone: "07920684400" },      // same operator, different listing
    { id: "c", phone: "+44 7111 111111" },
    { id: "d", phone: null },
    { id: "e", phone: "" },
  ]);
  ok(ids.has("a") && ids.has("b"), "both halves of a duplicate pair are flagged, not just the newer");
  ok(!ids.has("c"), "a unique number is not flagged");
  ok(!ids.has("d") && !ids.has("e"),
     "⛔ two leads with NO phone are not 'sharing' one — absence is never a match");
  ok(ids.size === 2, "and nothing else is swept in");
}
ok(sharedPhoneLeadIds([]).size === 0, "an empty list yields an empty set");
{
  /* Three on one number: every one of them needs flagging, not two of three. */
  const ids = sharedPhoneLeadIds([{ id: "a", phone: "07000000000" }, { id: "b", phone: "07000000000" },
                                  { id: "c", phone: "+447000000000" }]);
  ok(ids.size === 3, "three leads on one number flags all three");
}

console.log(f === 0 ? "\nOK the product field holds" : `\n${f} FAILED`);
if (f) process.exit(1);
