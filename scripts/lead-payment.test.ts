/* ============================================================
   A CLEARED PAYMENT BOX MUST NOT UN-PAY A CUSTOMER.

   ⛔ THE SHAPE. `paid` means `amount_paid > 0`, everywhere (CLAUDE.md §6). The payment editor is a
   TEXT input, so "the operator cleared the box" arrives as "" — and the obvious `parseFloat("")`
   gives NaN, while an equally obvious `Number("") || 0` gives 0. Writing 0 there does not error, does
   not warn, and does not look wrong on screen: it silently removes a real paying customer from the
   Paid filter, from the Inbox's paid exemption, and from every revenue figure. This is the
   absent-value shape (CLAUDE.md §6, now on its eighth instance) pointed at the one column that
   decides whether someone is a customer at all.

   ⚠️ AND THE OPPOSITE CASE IS DIFFERENT AND MUST STAY DIFFERENT. A deliberately typed 0 is a
   statement ("they paid nothing") and is kept as 0. Absent is null; zero is zero.
   ============================================================ */
import { parseAmountPaid, isPaidLead } from "../src/lib/leadPayment.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── ⛔ ABSENT MEANS null, NEVER 0 ──");
for (const raw of ["", " ", "   ", "\t", null, undefined] as (string | null | undefined)[]) {
  const got = parseAmountPaid(raw);
  ok(got === null, `${JSON.stringify(raw)} -> ${JSON.stringify(got)} (must be null, not 0)`);
}

console.log("\n── ⛔ AND SO DOES ANYTHING WE CANNOT READ AS A NUMBER ──");
/* A value we failed to parse is a value we did not learn. It must not become 0 either. */
for (const raw of ["abc", "£", "-", ".", "--3", "NaN"]) {
  const got = parseAmountPaid(raw);
  ok(got === null, `${JSON.stringify(raw)} -> ${JSON.stringify(got)} (unreadable is absent, not zero)`);
}

console.log("\n── A DELIBERATE ZERO IS KEPT, BECAUSE IT SAYS SOMETHING ──");
ok(parseAmountPaid("0") === 0, `"0" -> 0 (an explicit statement, not the absent case)`);
ok(parseAmountPaid("0.00") === 0, `"0.00" -> 0`);

console.log("\n── REAL AMOUNTS ROUND-TRIP ──");
ok(parseAmountPaid("19.99") === 19.99, `"19.99" -> 19.99 (RG Locksmiths' actual amount)`);
ok(parseAmountPaid(" 19.99 ") === 19.99, `" 19.99 " -> 19.99 (whitespace trimmed)`);
ok(parseAmountPaid("£19.99") === 19.99, `"£19.99" -> 19.99 (a pasted amount keeps its sign off)`);
ok(parseAmountPaid("99") === 99, `"99" -> 99`);

console.log("\n── ⛔ isPaidLead READS THE MONEY, NEVER THE STATUS ──");
/* The divergence is the whole point: in_delivery is still paid, and a £0 lead dragged to
   payment_received is not. Asserting on the money means neither case can be got wrong. */
ok(isPaidLead({ amount_paid: 19.99 }) === true, "amount_paid 19.99 -> paid");
ok(isPaidLead({ amount_paid: 0 }) === false, "amount_paid 0 -> NOT paid");
ok(isPaidLead({ amount_paid: null }) === false, "amount_paid null -> NOT paid");
ok(isPaidLead({}) === false, "column absent entirely -> NOT paid (never throws)");
ok(isPaidLead(null) === false, "no lead at all -> NOT paid");

console.log("\n── ⛔ AND THE ROUND TRIP THAT IS THE ACTUAL BUG ──");
/* Type an amount, save, clear the box, save again. The customer must go back to "not paid" via
   null — and a build that wrote 0 instead would pass every assertion above except this one. */
{
  const written = parseAmountPaid("19.99");
  ok(isPaidLead({ amount_paid: written }) === true, "typed 19.99 -> the lead reads as paid");
  const cleared = parseAmountPaid("");
  ok(cleared === null, "  cleared -> null");
  ok(isPaidLead({ amount_paid: cleared }) === false, "  and the lead reads as not paid, from null not 0");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
