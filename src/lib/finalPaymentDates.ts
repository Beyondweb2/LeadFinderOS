/* THE FINAL MINIMUM-TERM PAYMENT — payment 12 on Build — ONE set of dates (2026-10-17). A leaf beside clientTimeline.ts
   (kept out of it so the 19 functions that bundle clientTimeline.ts are untouched). Pure; edge-reachable (.ts imports). */
import { addDays, minimumTerm, type TimelineFacts } from './clientTimeline.ts';
import { totalPaymentsFor } from './findableOffer.ts';

/* ⛔ Every reader of "when is payment 12" asks THIS: the v5 9A.5 reminder (src/lib/month12Reminder.ts, fn
   month12-reminder) today, and the month-12 ownership handover (clause 8.4: "On final payment we assign to you…")
   when it is built. Derived from minimumTerm() — the real collected payments, never a calendar guess — so a late or
   recovered payment moves every one of these together. */
/** v5 9A.5 — the payment-12 reminder goes out from this many days before payment 12 is due (and never on or after it). */
export const MONTH12_REMINDER_LEAD_DAYS = 30;
export interface FinalPaymentDates {
  /** The total payments of the plan (Build 12) — what "payment 12" means. */
  totalPayments: number;
  /** The day the final minimum-term payment is due (expected) or was taken (actual). */
  finalPaymentDay: string;
  finalPaymentActual: boolean;
  /** 9A.5: the first day the "before payment 12" reminder may go … */
  reminderFromDay: string;
  /** … and the last (the day before payment 12 — "before" means before). */
  reminderLastDay: string;
  /** 8.4: ownership of Our Work transfers on final payment — known only once it is ACTUALLY taken. */
  ownershipTransferDay: string | null;
}
/** Null while the final payment's day cannot be known (no route, no Payment Start Date and no payment yet). */
export function finalPaymentDates(f: TimelineFacts): FinalPaymentDates | null {
  if (!f.route) return null;
  const mt = minimumTerm(f);
  if (!mt.finalPaymentDay) return null;
  return {
    totalPayments: totalPaymentsFor(f.route),
    finalPaymentDay: mt.finalPaymentDay,
    finalPaymentActual: mt.finalPaymentActual,
    reminderFromDay: addDays(mt.finalPaymentDay, -MONTH12_REMINDER_LEAD_DAYS),
    reminderLastDay: addDays(mt.finalPaymentDay, -1),
    ownershipTransferDay: mt.finalPaymentActual ? mt.finalPaymentDay : null,
  };
}

