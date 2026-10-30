/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PLAN-PERIOD REMINDER — Client Service Agreement v6, clause 9A.5 (2026-10-29) — the rules, pure.

   ⛔ WHAT THE AGREEMENT PROMISES, word for word (v6 9A.5, last sentence): "We will remind you before the Plan Period
   ends that you can opt in." — to the optional £29.99/month Hosting and Maintenance service of 9A.2. 16.6: notices go
   by email to the recorded address, so the reminder is ONE EMAIL to the client's "Email for notices" from their signed
   acceptance, from PLAN_PERIOD_REMINDER_LEAD_DAYS before the Plan Period ends and never on or after that day.
   ⛔ ONLY A CLIENT WHOSE SIGNED AGREEMENT CONTAINS THE PROMISE (the agreed TEXT, never a version label), on a v6 plan
   (full / six / twelve, read from the SIGNED acceptance). v5 says "before payment 12" — a different sentence, sent by
   fn month12-reminder (month12Reminder.ts); the two sentences never both match, so no client gets both.
   ⛔ WHEN THE PLAN PERIOD ENDS (v6 2.6 / 9.2):
      · 6 and 12 months — when the final payment has cleared: finalPaymentDates() with the PLAN's recurring count
        (6 months = 5 after the sign-up payment, 12 months = 11). Derived from the real collected payments.
      · Pay in full — FULL_PAY_HOSTING_INCLUDED_MONTHS after the website we build first goes live
        (outreach_leads.site_first_live_at, stamped by the DB the first time the build is recorded live). No go-live
        day = no date = no reminder (on a sending path absent means do not).
   ⛔ WHAT THE EMAIL SAYS is only what the signed v6 text says (2.6, 8.4, 9.2, 9A.2–9A.5). No price beyond
   FINDABLE_CONTINUING_GBP. Pure; edge-reachable (explicit .ts imports). Sender: fn plan-period-reminder.
   Record: docs/plan-period-reminder.md.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { addDays, addMonthsClamped, ukDay, ukDayWords, type TimelineFacts } from './clientTimeline.ts';
import { finalPaymentDates } from './finalPaymentDates.ts';
import { FINDABLE_CONTINUING_GBP, FINDABLE_CONTACT_EMAIL } from './findableOffer.ts';
import { FULL_PAY_HOSTING_INCLUDED_MONTHS, PAYMENT_PLAN_SPEC, type PaymentPlan } from './paymentPlans.ts';

/** The sentence the signed agreement must contain (v6 9A.5). */
export const PLAN_PERIOD_PROMISE_SENTENCE = 'We will remind you before the Plan Period ends that you can opt in.';
/** The reminder goes out from this many days before the Plan Period ends (and never on or after that day). */
export const PLAN_PERIOD_REMINDER_LEAD_DAYS = 30;
/** How far ahead the dry run looks by default (pay in full: go-live + 6 months, so look far). */
export const PLAN_PERIOD_DRY_RUN_HORIZON_DAYS = 240;
/** The plans whose signed v6 / v7 text carries the promise (v7 keeps 9A.5 word for word; Complete is v7 only). legacy_twelve is v5 (fn month12-reminder). */
export const PLAN_PERIOD_REMINDER_PLANS: readonly PaymentPlan[] = ['complete', 'full', 'six', 'twelve'];

const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
/** Does this signed agreement text contain the v6 9A.5 promise? Absent text → false. */
export function signedAgreementPromisesPlanPeriodReminder(agreedText: string | null | undefined): boolean {
  if (!agreedText) return false;
  return norm(agreedText).includes(norm(PLAN_PERIOD_PROMISE_SENTENCE));
}

export interface PlanPeriodEnd {
  plan: PaymentPlan;
  /** The last day of the Plan Period's included hosting: the final payment day, or go-live + 6 months. */
  endDay: string;
  /** True once it has actually happened (the final payment was taken). Pay in full: false until the day passes. */
  ended: boolean;
  reminderFromDay: string;
  reminderLastDay: string;
}

/** When this client's Plan Period ends. Null while it cannot be known (no plan, no go-live day, no payment dates). */
export function planPeriodEnd(plan: PaymentPlan | null, facts: TimelineFacts, siteFirstLiveAt: string | null): PlanPeriodEnd | null {
  if (!plan || !PLAN_PERIOD_REMINDER_PLANS.includes(plan)) return null;
  let endDay: string; let ended = false;
  if (plan === 'full') {
    const live = ukDay(siteFirstLiveAt);
    if (!live) return null;
    endDay = addMonthsClamped(live, FULL_PAY_HOSTING_INCLUDED_MONTHS);
  } else {
    const d = finalPaymentDates({ ...facts, recurringPaymentsNeeded: PAYMENT_PLAN_SPEC[plan].totalPayments - 1 });
    if (!d) return null;
    endDay = d.finalPaymentDay; ended = d.finalPaymentActual;
  }
  return { plan, endDay, ended, reminderFromDay: addDays(endDay, -PLAN_PERIOD_REMINDER_LEAD_DAYS), reminderLastDay: addDays(endDay, -1) };
}

export interface PlanPeriodInput {
  facts: TimelineFacts;
  /** The plan on the SIGNED acceptance (client_agreement_acceptances.payment_plan). */
  plan: PaymentPlan | null;
  /** The text the client signed (client_agreement_acceptances.agreed_text). */
  agreedText: string | null;
  /** Their "Email for notices" from the same acceptance. */
  notifyEmail: string | null;
  /** outreach_leads.subscription_status (Stripe's; none on pay in full). */
  subscriptionStatus: string | null;
  /** outreach_leads.site_first_live_at — the day the built site first went live. */
  siteFirstLiveAt: string | null;
  /** A reminder row already exists for this client (sent, failed or in flight) — never a second one. */
  alreadyRecorded: boolean;
}

export type PlanPeriodSkipReason =
  | 'no_promise' | 'not_v6_plan' | 'not_build' | 'refunded' | 'ended' | 'cancelled' | 'decided' | 'no_date'
  | 'period_over' | 'too_early' | 'too_late' | 'already_sent' | 'no_email';

export type PlanPeriodVerdict =
  | { send: true; to: string; end: PlanPeriodEnd }
  | { send: false; reason: PlanPeriodSkipReason; end: PlanPeriodEnd | null };

const OVER = new Set(['canceled', 'cancelled', 'incomplete_expired', 'unpaid']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PLAN_PERIOD_SKIP_WORDS: Record<PlanPeriodSkipReason, string> = {
  no_promise: 'their signed agreement has no Plan Period reminder (not v6)',
  not_v6_plan: 'not on a v6 payment plan',
  not_build: 'not a Build client',
  refunded: 'refunded',
  ended: 'service ended',
  cancelled: 'subscription cancelled',
  decided: 'opt-in decision already recorded',
  no_date: 'Plan Period end not known yet (pay in full: site not recorded live)',
  period_over: 'final payment already taken',
  too_early: 'not yet in the reminder window',
  too_late: 'the Plan Period ends today or has ended',
  already_sent: 'already reminded',
  no_email: 'no valid email for notices',
};

/** Should this client get the Plan Period reminder TODAY? Every "no" names why. */
export function planPeriodReminderVerdict(i: PlanPeriodInput, todayIso: string): PlanPeriodVerdict {
  const end = planPeriodEnd(i.plan, i.facts, i.siteFirstLiveAt);
  const no = (reason: PlanPeriodSkipReason): PlanPeriodVerdict => ({ send: false, reason, end });
  if (!signedAgreementPromisesPlanPeriodReminder(i.agreedText)) return no('no_promise');
  if (!i.plan || !PLAN_PERIOD_REMINDER_PLANS.includes(i.plan)) return no('not_v6_plan');
  if (i.facts.route !== 'build') return no('not_build');
  if (i.facts.refundedAt) return no('refunded');
  if (i.facts.endedAt) return no('ended');
  if (OVER.has(String(i.subscriptionStatus ?? '').trim().toLowerCase())) return no('cancelled');
  if (i.facts.continuingDecision != null) return no('decided');
  if (i.alreadyRecorded) return no('already_sent');
  if (!end) return no('no_date');
  if (end.ended) return no('period_over');
  const today = ukDay(todayIso);
  if (!today) return no('no_date');
  if (today < end.reminderFromDay) return no('too_early');
  if (today > end.reminderLastDay) return no('too_late');
  const to = String(i.notifyEmail ?? '').trim();
  if (!EMAIL_RE.test(to)) return no('no_email');
  return { send: true, to, end };
}

/** The email. Only what the signed v6 text says (see the header); signed by Paul, reply to opt in. */
export function planPeriodReminderEmail(i: { businessName: string; plan: PaymentPlan; endDay: string }): { subject: string; text: string } {
  const day = ukDayWords(i.endDay);
  const when = i.plan === 'full'
    ? `On Pay in full, hosting is included for ${FULL_PAY_HOSTING_INCLUDED_MONTHS} months from the date your website first went live, so your Plan Period ends on ${day} (clauses 2.6 and 9.2).`
    : `Your Plan Period ends when your final payment, due on ${day}, has cleared (clause 2.6). Hosting is included until then (clause 9.2).`;
  const transfer = i.plan === 'full'
    ? '- Your payment has cleared, so the website we built for you has already transferred to you (clause 8.4).'
    : '- Once your final payment has cleared, the website we built for you transfers to you (clause 8.4).';
  return {
    subject: `Your Findable website after your Plan Period - ${i.businessName}`,
    text: [
      'Hello,',
      '',
      `As your Client Service Agreement says (clause 9A.5), this is your reminder before your Plan Period ends that you can opt in to our optional Hosting and Maintenance service. ${when}`,
      '',
      'What happens after the Plan Period:',
      '- Findable Build does not automatically continue after the Plan Period. Nothing more is charged unless you opt in (clause 9A.2).',
      transfer,
      '',
      `If you want us to keep hosting and reasonably maintaining the website, you can opt in to our rolling Hosting and Maintenance service at £${FINDABLE_CONTINUING_GBP} a month. It includes hosting, reasonable technical maintenance and small routine updates (clause 9A.3). You can cancel it by email with 30 days notice (clause 9A.4).`,
      '',
      'If you do not opt in, we will make the website reasonably available for you to move to your own hosting. We may keep it live on our hosting for up to 30 days after the Plan Period to allow a reasonable transfer, after which we may take it down if you have not moved it (clause 9A.5).',
      '',
      `To opt in, or if you have any questions, just reply to this email or write to ${FINDABLE_CONTACT_EMAIL}.`,
      '',
      'Paul',
      'Findable',
    ].join('\n'),
  };
}
