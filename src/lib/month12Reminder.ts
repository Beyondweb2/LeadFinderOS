/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAYMENT-12 REMINDER — Client Service Agreement v5, clause 9A.5 (2026-10-17) — the rules, pure.

   ⛔ WHAT THE AGREEMENT PROMISES, word for word (v5 9A.5, last sentence): "We will remind you before payment 12
   that you can opt in." — to the optional £29.99/month Hosting and Maintenance service of 9A.2. The clause
   names no lead time and no channel; 16.6 says notices go by email to the address recorded for each party, so
   the reminder is an EMAIL to the client's "Email for notices" from their signed acceptance, sent once, from
   MONTH12_REMINDER_LEAD_DAYS before payment 12 and never on or after the payment-12 day.
   ⛔ ONLY A CLIENT WHOSE SIGNED AGREEMENT CONTAINS THE PROMISE. Decided from the agreed TEXT they signed
   (client_agreement_acceptances.agreed_text), never from a version label: v4's 9A.5 and v3's 9A have no such
   sentence (v3's 9A.3 is a different reminder — the Continuing Service starting — and is not sent from here).
   ⛔ WHAT THE EMAIL SAYS is only what the signed v5 text says: Build does not continue automatically after
   payment 12 (9A.2); the optional service and what it covers (9A.2, 9A.3); cancelling it (9A.4); if they do
   not opt in, the website is made reasonably available to move and may be kept live up to 30 days (9A.5); the
   website transfers on final payment (8.4). No price beyond FINDABLE_CONTINUING_GBP, no promise beyond those.
   ⛔ DATES are finalPaymentDates.ts — the ONE "when is payment 12" (the ownership handover reuses it).
   Pure; edge-reachable (explicit .ts imports). The sender is fn month12-reminder. Record: docs/month12-reminder.md.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { ukDay, ukDayWords, type TimelineFacts } from './clientTimeline.ts';
import { finalPaymentDates, type FinalPaymentDates } from './finalPaymentDates.ts';
import { FINDABLE_CONTINUING_GBP, FINDABLE_CONTACT_EMAIL } from './findableOffer.ts';

/** The sentence the signed agreement must contain (v5 9A.5). */
export const MONTH12_PROMISE_SENTENCE = 'We will remind you before payment 12 that you can opt in.';
/** How far ahead the dry run looks by default. */
export const MONTH12_DRY_RUN_HORIZON_DAYS = 60;

const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
/** Does this signed agreement text contain the 9A.5 promise? Absent text → false (on a sending path, absent means do not). */
export function signedAgreementPromisesReminder(agreedText: string | null | undefined): boolean {
  if (!agreedText) return false;
  return norm(agreedText).includes(norm(MONTH12_PROMISE_SENTENCE));
}

export interface Month12Input {
  facts: TimelineFacts;
  /** The text the client signed (client_agreement_acceptances.agreed_text). */
  agreedText: string | null;
  /** Their "Email for notices" from the same acceptance. */
  notifyEmail: string | null;
  /** outreach_leads.subscription_status (Stripe's). */
  subscriptionStatus: string | null;
  /** A reminder row already exists for this client (sent, failed or in flight) — never a second one. */
  alreadyRecorded: boolean;
}

export type Month12SkipReason =
  | 'no_promise' | 'not_build' | 'refunded' | 'ended' | 'cancelled' | 'decided' | 'no_date'
  | 'payment12_made' | 'too_early' | 'too_late' | 'already_sent' | 'no_email';

export type Month12Verdict =
  | { send: true; to: string; dates: FinalPaymentDates }
  | { send: false; reason: Month12SkipReason; dates: FinalPaymentDates | null };

/** Subscriptions that are over (the same positive list the dashboard's churn count reads). */
const OVER = new Set(['canceled', 'cancelled', 'incomplete_expired', 'unpaid']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MONTH12_SKIP_WORDS: Record<Month12SkipReason, string> = {
  no_promise: 'their signed agreement has no payment-12 reminder (not v5)',
  not_build: 'not a Build client',
  refunded: 'refunded',
  ended: 'service ended',
  cancelled: 'subscription cancelled',
  decided: 'opt-in decision already recorded',
  no_date: 'payment 12 date not known yet',
  payment12_made: 'payment 12 already taken',
  too_early: 'not yet in the reminder window',
  too_late: 'payment 12 is due today or has passed',
  already_sent: 'already reminded',
  no_email: 'no valid email for notices',
};

/** Should this client get the payment-12 reminder TODAY? Every "no" names why. */
export function month12ReminderVerdict(i: Month12Input, todayIso: string): Month12Verdict {
  const dates = finalPaymentDates(i.facts);
  const no = (reason: Month12SkipReason): Month12Verdict => ({ send: false, reason, dates });
  if (!signedAgreementPromisesReminder(i.agreedText)) return no('no_promise');
  if (i.facts.route !== 'build') return no('not_build');
  if (i.facts.refundedAt) return no('refunded');
  if (i.facts.endedAt) return no('ended');
  if (OVER.has(String(i.subscriptionStatus ?? '').trim().toLowerCase())) return no('cancelled');
  if (i.facts.continuingDecision != null) return no('decided');
  if (i.alreadyRecorded) return no('already_sent');
  if (!dates) return no('no_date');
  if (dates.finalPaymentActual) return no('payment12_made');
  const today = ukDay(todayIso);
  if (!today) return no('no_date');
  if (today < dates.reminderFromDay) return no('too_early');
  if (today > dates.reminderLastDay) return no('too_late');
  const to = String(i.notifyEmail ?? '').trim();
  if (!EMAIL_RE.test(to)) return no('no_email');
  return { send: true, to, dates };
}

/** The email. Only what the signed v5 text says (see the header); signed by Paul, reply to opt in. */
export function month12ReminderEmail(i: { businessName: string; payment12Day: string }): { subject: string; text: string } {
  const day = ukDayWords(i.payment12Day);
  return {
    subject: `Your Findable website after payment 12 - ${i.businessName}`,
    text: [
      'Hello,',
      '',
      `As your Client Service Agreement says (clause 9A.5), this is your reminder before payment 12 that you can opt in to our optional Hosting and Maintenance service. Payment 12, the last payment of your Findable Build minimum term, is due on ${day}.`,
      '',
      'What happens after payment 12:',
      '- Findable Build does not automatically continue after payment 12. Nothing more is charged unless you opt in (clause 9A.2).',
      '- Once your final payment is made, the website we built for you transfers to you (clause 8.4).',
      '',
      `If you want us to keep hosting and reasonably maintaining the website, you can opt in to our rolling Hosting and Maintenance service at £${FINDABLE_CONTINUING_GBP} a month. It includes hosting, reasonable technical maintenance and small routine updates (clause 9A.3). You can cancel it by email with 30 days notice (clause 9A.4).`,
      '',
      'If you do not opt in, we will make the website reasonably available for you to move to your own hosting. We may keep it live on our hosting for up to 30 days after the minimum term to allow a reasonable transfer, after which we may take it down if you have not moved it (clause 9A.5).',
      '',
      `To opt in, or if you have any questions, just reply to this email or write to ${FINDABLE_CONTACT_EMAIL}.`,
      '',
      'Paul',
      'Findable',
    ].join('\n'),
  };
}
