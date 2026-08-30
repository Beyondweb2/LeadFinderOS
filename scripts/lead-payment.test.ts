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

console.log("\n── ⛔ REFUNDED: THE ONE STATUS THAT SUBTRACTS ──");
/* Money in, then money back out. Before this, a refunded customer kept amount_paid > 0 and went on
   inflating the paid count, the funnel, the founder tile and every revenue total, because nothing
   in this predicate could see the refund. The status may only ever SUBTRACT — it can never make an
   unpaid lead count. */
ok(isPaidLead({ amount_paid: 19.99, status: "refunded" }) === false,
  "paid then refunded -> NOT a paying customer");
ok(isPaidLead({ amount_paid: 19.99, status: "payment_received" }) === true,
  "paid, not refunded -> still paying");
ok(isPaidLead({ amount_paid: 19.99, status: "in_delivery" }) === true,
  "⛔ in_delivery is STILL PAID — the original divergence must survive this change");
ok(isPaidLead({ amount_paid: 19.99, status: "completed" }) === true, "completed -> still paying");
ok(isPaidLead({ amount_paid: 0, status: "refunded" }) === false, "£0 + refunded -> not paid");
ok(isPaidLead({ amount_paid: null, status: "refunded" }) === false, "null + refunded -> not paid");

console.log("\n   the status can only SUBTRACT, never add:");
ok(isPaidLead({ amount_paid: 0, status: "payment_received" }) === false,
  "£0 dragged to payment_received is STILL not paid — the status never creates a customer");

console.log("\n   ⚠️ AN ABSENT STATUS KEEPS THE OLD BEHAVIOUR (the safe direction):");
/* A caller that forgets to select `status` must not silently un-pay every customer. undefined is
   not 'refunded', so they still count. Pinned so a future caller that forgets the column meets a
   tested behaviour rather than a surprise. */
ok(isPaidLead({ amount_paid: 19.99 }) === true, "status column not selected -> still reads as paid");
ok(isPaidLead({ amount_paid: 19.99, status: null }) === true, "status null -> still reads as paid");
ok(isPaidLead({ amount_paid: 19.99, status: "" }) === true, "status empty string -> still reads as paid");
ok(isPaidLead({ amount_paid: 19.99, status: "Refunded" }) === true,
  "⚠️ case-sensitive by design: the app only ever writes the exact lowercase value");

console.log("\n   ⛔ THE AMOUNT SURVIVES THE REFUND — history is not destroyed:");
{
  /* Marking a lead refunded must NOT zero amount_paid. The row still records what was charged; it
     simply stops counting. A build that cleared the amount would pass every assertion above and
     still lose the record of the sale. */
  const lead = { amount_paid: parseAmountPaid("19.99"), status: "refunded" };
  ok(lead.amount_paid === 19.99, "the charged amount is still on the row after the refund");
  ok(isPaidLead(lead) === false, "  and the lead does not count as paying");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
