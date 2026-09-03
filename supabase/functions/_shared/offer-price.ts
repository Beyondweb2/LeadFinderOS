/* ============================================================
   WHAT THIS CUSTOMER PAYS — one function, server-side, used by BOTH the display and the charge.

   🔴 THERE IS ONE PRICE NOW. Rewritten 2026-09-03 on Paul's instruction (approved by Rich): the
   founder-vs-full split is gone and everyone pays FINDABLE_SETUP_PRICE_GBP, one-off, whether they
   arrive from their own report, the homepage, or a cold link.

   ⛔ WHAT THIS FILE USED TO DO, AND WHY IT IS WORTH KNOWING IT NO LONGER DOES. The price was
   derived per lead: founder (£49.99) when the lead had a COMPLETED AUDIT and had not paid, full
   (£99) otherwise. That rule was deliberately non-forgeable — you cannot fake having an audit — and
   it also happened to separate warm from cold arrivals for free. It cost three database queries per
   render, and it is the reason a lead-less visitor could not be charged at all: with no lead there
   was no way to decide what to charge, so findable-checkout refused the payment outright.
   Removing the split is what unblocks sign-up from the homepage. The old logic is in git
   (offer-price.ts before this commit) if the question ever comes back.

   ⛔ THE FUNCTION SURVIVES EVEN THOUGH IT NOW RETURNS A CONSTANT, AND THAT IS DELIBERATE. Its real
   value was never the branching — it was that the plan card and the Stripe session call the SAME
   thing, so display and charge cannot diverge. Before it existed, findable-site's own
   SETUP_PRICE_GBP displayed the price while findable-checkout charged FINDABLE_SETUP_PRICE_GBP: two
   constants in two repos, a mirror that had already drifted once. Inlining the constant at both call
   sites would rebuild exactly that. One answer, one place.

   ⛔ THE CLIENT STILL NEVER SENDS A PRICE, AND THERE IS STILL NO URL PARAMETER. Anything the
   browser can set, anybody can set. That property is unchanged and must stay: this file takes no
   caller-supplied money and no discount flag.
   ============================================================ */
import { FINDABLE_SETUP_PRICE_GBP } from "../../../src/lib/findableOffer.ts";

export interface OfferPrice {
  /** What Stripe will be told to charge, in pounds. */
  gbp: number;
  /** What to show. Rendered by the flow, never computed there. */
  label: string;
  /** Why, in one word, for the log. Kept as a field so a future differential price has a home and
   *  the callers' logging does not have to change shape to get one. */
  reason: "flat_price";
}

/**
 * The price. Takes nothing, because nothing about the customer changes it any more.
 *
 * ⚠️ NOT ASYNC ANY MORE, AND NO DATABASE HANDLE. Both callers used to await it with a service
 * client; keeping the async signature "just in case" would leave three dead queries' worth of
 * plumbing in two functions and invite someone to put a lookup back without asking why it went.
 */
export function offerPrice(): OfferPrice {
  return {
    gbp: FINDABLE_SETUP_PRICE_GBP,
    label: `£${FINDABLE_SETUP_PRICE_GBP}`,
    reason: "flat_price",
  };
}
