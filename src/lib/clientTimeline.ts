/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CLIENT TIMELINE UNDER THE v3 CLIENT SERVICE AGREEMENT (Paul, 2026-10-05 — "Option B").

   ⛔ THE SIGNED AGREEMENT IS AUTHORITATIVE OVER THIS FILE. Every rule below cites the clause it comes
   from; if they ever differ, the agreement wins and this file is the bug.

     AGREEMENT ACCEPTED (1.2) → INITIAL £99 → ACCESS DATE (5.1, Paul confirms) → BASELINE (5.2)
       → about four weeks of work → RESULTS DATE (5.3: the day the formal results are SENT)
       → REFUND WINDOW: 14 days after the Results Date (5.4)
       → APPROVAL DATE = PAYMENT START DATE: the day after the Refund Window ends (5.6)
       → first £99 monthly payment; each later one on the same date each month (3.1).
     FALLBACK (5.6, 5.8(a)): no access within 30 days of the initial payment, or access withdrawn →
       the guarantee does not apply and the Payment Start Date is the day after the date six weeks
       from the initial payment.
     CONTINUING SERVICE (9A): after the last minimum-term payment, FINDABLE_CONTINUING_GBP a month on the same date until
       cancelled on 30 days' notice; Findable emails the client at least 30 days before it starts.

   ⛔ DERIVED, NEVER STORED (CLAUDE.md §6). The stored FACTS are: the initial payment instant, the
   Access Date Paul confirmed, the instant the formal results were sent, the instant (and reason) the
   guarantee ceased, the successful recurring payments. Every date below is arithmetic on those, so a
   rule change can never leave old rows frozen at a stale rule.
   ⛔ UK DAYS. Every date is a Europe/London calendar day (YYYY-MM-DD), including British Summer Time —
   the contractor agreement and the checklist both say UK time, not UTC and not Thailand.
   ⛔ NOTHING HERE MOVES MONEY. It answers "what date", "is it due", "what must Paul do". The Stripe
   write is _shared/client-terms.ts, and it refuses any date this file does not produce.
   Pure; no imports beyond findableOffer.ts. ⚠️ Edge-reachable — explicit .ts on every relative import.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { continuingServiceAfterTerm, FINDABLE_CONTINUING_GBP, recurringPaymentsFor, totalPaymentsFor, type ServiceRoute } from './findableOffer.ts';

/** The commercial terms a sale was made on. Stamped once per client (client_service_terms) from the
 *  agreement version they signed; every v3 rule below applies ONLY to a client stamped with it.
 *  ⛔ A client with no stamp is on the terms they bought under (Ronnie, MCL, RG, the QA clients) and is
 *  never re-ruled by this file — Paul migrates someone explicitly or not at all. */
export const COMMERCIAL_TERMS_V3 = 'csa_v3_option_b';
/** v4 (2026-10-06): the same Option B timing as v3; the Continuing Service is Findable Build only. */
export const COMMERCIAL_TERMS_V4 = 'csa_v4_option_b';
/** The terms every NEW sale is stamped with (the agreement version new sign-ups sign). */
export const COMMERCIAL_TERMS_CURRENT = COMMERCIAL_TERMS_V4;
export type CommercialTerms = typeof COMMERCIAL_TERMS_V3 | typeof COMMERCIAL_TERMS_V4;
/** Strictly the v3 stamp. Only the per-client Continuing Service rule needs to tell v3 from v4. */
export function isV3Terms(v: unknown): v is typeof COMMERCIAL_TERMS_V3 { return v === COMMERCIAL_TERMS_V3; }
/** ⛔ THE AGREEMENT-FIRST, OPTION B CLIENT: signed before paying, Access Date, Refund Window, Payment Start
 *  Date. True for v3 AND v4 — every timeline, scheduling and commission rule that used to say "v3" means
 *  this. A client with no stamp (Ronnie, MCL, RG, the QA clients) is false and is never re-ruled. */
export function isOptionBTerms(v: unknown): v is CommercialTerms { return v === COMMERCIAL_TERMS_V3 || v === COMMERCIAL_TERMS_V4; }

/**
 * 🔴 DOES THIS CLIENT'S SERVICE CONTINUE AT FINDABLE_CONTINUING_GBP AFTER THE MINIMUM TERM? — the ONE rule.
 *  · v3 (clause 9A as signed): yes, Build and Optimise alike — a v3 signature is honoured as signed.
 *  · v4 (2026-10-06): Build only (findableOffer.ts continuingServiceAfterTerm). Optimise is a fixed term:
 *    after the sixth payment the plan is complete — no £29.99 state, no reminder, no decision, no charge.
 *  · No stamp (legacy) or no route: no — those subscriptions stop at their last payment, as sold.
 */
export function continuingServiceApplies(terms: unknown, route: ServiceRoute | null | undefined): boolean {
  if (!route) return false;
  if (isV3Terms(terms)) return true;
  if (terms === COMMERCIAL_TERMS_V4) return continuingServiceAfterTerm(route);
  return false;
}
/** The marker a v3 checkout and its Stripe subscription carry (metadata payment_timing): the monthly is
 *  created on a hold and its first charge is set later to the Payment Start Date. */
export const OPTION_B_TIMING = 'option_b';

/** Does a Stripe subscription's OWN record say the Continuing Service follows its minimum term? Read by the
 *  webhook's "starting soon" email and its term-complete branch, which have only the subscription in hand.
 *  Its metadata names the terms (written from v4 on, _shared/delayed-subscription.ts) and the route; an
 *  option_b subscription with no terms marker was created before v4, so it is a v3 sale. Legacy → false. */
/** A fixed-term subscription (v4 Optimise): agreement-first terms with NO Continuing Service after them. */
export function subscriptionIsFixedTerm(meta: Record<string, unknown> | null | undefined): boolean {
  const m = meta ?? {};
  const route: ServiceRoute | null = m.service_route === 'build' || m.service_route === 'optimise' ? m.service_route : null;
  return !!route && isOptionBTerms(m.commercial_terms) && !continuingServiceApplies(m.commercial_terms, route);
}

export function subscriptionContinuesAfterTerm(meta: Record<string, unknown> | null | undefined): boolean {
  const m = meta ?? {};
  const route: ServiceRoute | null = m.service_route === 'build' || m.service_route === 'optimise' ? m.service_route : null;
  if (isOptionBTerms(m.commercial_terms)) return continuingServiceApplies(m.commercial_terms, route);
  if (m.payment_timing === OPTION_B_TIMING) return continuingServiceApplies(COMMERCIAL_TERMS_V3, route);
  return false;
}

/** 5.4 — the Refund Window ends this many days after the Results Date. */
export const REFUND_WINDOW_DAYS = 14;
/** 5.8(a) — access not given within this many days of the initial payment → the guarantee ceases. */
export const ACCESS_DEADLINE_DAYS = 30;
/** 5.6 — the fallback Payment Start Date: the day after the date six weeks from the initial payment. */
export const FALLBACK_START_WEEKS = 6;
/** 5.3 — "about four weeks after the Access Date" (a TARGET, never the Results Date itself) … */
export const RESULTS_TARGET_DAYS = 28;
/** … "normally within six weeks of the Access Date". */
export const RESULTS_NORMAL_LATEST_DAYS = 42;
/** Paul is reminded this many days before the four-week target (checklist Part 4, "Results Date"). */
export const RESULTS_REMINDER_LEAD_DAYS = 7;
/** Paul is reminded this many days before the 30-day access deadline. */
export const ACCESS_REMINDER_LEAD_DAYS = 7;
/** 9A.1 — the Continuing Service price (the one constant lives in findableOffer.ts). */
export const CONTINUING_SERVICE_GBP = FINDABLE_CONTINUING_GBP;
/** 9A.3 — the client is emailed at least this many days before the Continuing Service starts. */
export const CLIENT_REMINDER_NOTICE_DAYS = 30;
/** Paul's own action appears this many days BEFORE the client reminder is due, so he has two weeks to
 *  prepare it and the 30-day notice is never missed. */
export const PAUL_REMINDER_LEAD_DAYS = 14;
/** The hour (UK) on the Payment Start Date at which Stripe's first charge is set. Mid-morning UK, so a
 *  clock change or a late-night reading can never put it on the previous UK day. */
export const PAYMENT_START_HOUR_UK = 10;
/** The provisional hold Stripe's trial is created with at sign-up, before any Payment Start Date is
 *  known (no recurring charge is possible until LeadFinder sets the real date). Stripe allows a trial
 *  up to two years from the billing anchor; one year is far past any Refund Window the contract allows. */
export const PAYMENT_START_HOLD_DAYS = 365;

/* ⛔ AUTOMATION-READY, ALL OFF (Paul, 2026-10-05: manual control first). The data model below already
   carries everything each switch needs — the reminder's due date, the decision, the price, the
   switch date — so turning one on later is a code switch here plus the job that reads it, never a new
   column. Until then every one of these is a button Paul presses, and nothing charges the Continuing Service price. */
export const CONTINUING_SERVICE_AUTOMATION = {
  /** Send the 9A.3 reminder email to the client automatically. */
  clientReminderEmail: false,
  /** Switch the Stripe subscription to the Continuing Service price after the last minimum-term payment. */
  stripeSwitch: false,
  /** Move the client into the Continuing Service state without Paul's decision. */
  autoState: false,
} as const;

/* ── UK calendar days ─────────────────────────────────────────────────────────────────────────── */
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The Europe/London calendar day an instant falls on ("YYYY-MM-DD"). Null for an unreadable instant. */
export function ukDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (DAY_RE.test(iso)) return iso;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

/** A day plus n calendar days (n may be negative). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** A day plus n calendar months, clamped to the last day of a shorter month (clause 3.1: "or on the
 *  last day of the month if that date does not exist in that month"). Always from the ORIGINAL day,
 *  so the 31st returns to the 31st in long months. */
export function addMonthsClamped(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** The UTC instant of HH:00 UK time on a UK day — BST-aware (the offset is read for that day). */
export function ukDayAtHourIso(day: string, hour: number = PAYMENT_START_HOUR_UK): string {
  const [y, m, d] = day.split('-').map(Number);
  // Guess the instant as UTC, read what London calls it, and correct by the difference (0 or 1 hour).
  const guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(new Date(guess)));
  const offsetH = ((londonHour - hour) + 24) % 24;
  return new Date(guess - offsetH * 3_600_000).toISOString();
}

/* ── the dates ────────────────────────────────────────────────────────────────────────────────── */

/** 5.4 — the last day of the Refund Window. */
export function refundWindowEndDay(resultsDay: string): string { return addDays(resultsDay, REFUND_WINDOW_DAYS); }
/** 5.6 — the Approval Date / Payment Start Date: the day after the Refund Window ends. */
export function approvalDayFromResults(resultsDay: string): string { return addDays(refundWindowEndDay(resultsDay), 1); }
/** 5.6 + 5.8 — "the day after the date six weeks from your initial payment". */
export function fallbackPaymentStartDay(initialPaidDay: string): string { return addDays(initialPaidDay, FALLBACK_START_WEEKS * 7 + 1); }
/** 5.8(a) — the last day access can be given and the guarantee still apply. */
export function accessDeadlineDay(initialPaidDay: string): string { return addDays(initialPaidDay, ACCESS_DEADLINE_DAYS); }
/** 5.3 — the four-week target for the formal results (a due date, never the Results Date). */
export function resultsTargetDay(accessDay: string): string { return addDays(accessDay, RESULTS_TARGET_DAYS); }
/** 5.3 — "normally within six weeks of the Access Date". */
export function resultsNormalLatestDay(accessDay: string): string { return addDays(accessDay, RESULTS_NORMAL_LATEST_DAYS); }

/** The stored facts the timeline is derived from. Every field optional: absent is "not happened". */
export interface TimelineFacts {
  terms: string | null;
  route: ServiceRoute | null;
  /** The successful initial £99 (payment_ledger initial, or the lead's payment instant). */
  initialPaidAt: string | null;
  /** 5.1 — the Access Date Paul confirmed (a UK day), and when he confirmed it. */
  accessDate: string | null;
  /** 5.3 — the instant the formal results were SENT (outreach_leads.remeasure_results_sent_at). */
  resultsSentAt: string | null;
  /** 5.8 — when (and why) the guarantee was recorded as no longer applying. */
  guaranteeCeasedAt: string | null;
  guaranteeCeasedReason?: string | null;
  /** A valid guarantee claim was refunded (5.5) — the agreement has ended. */
  refundedAt?: string | null;
  /** The engagement ended for another reason. */
  endedAt?: string | null;
  /** The Payment Start Date LeadFinder set in Stripe, and whether Stripe's own read-back agreed. */
  paymentStartScheduledDay?: string | null;
  paymentStartConfirmedAt?: string | null;
  /** Successful recurring £99 payments, oldest first (payment_ledger, kind recurring, succeeded). */
  recurringPaidAt?: readonly string[];
  /** Continuing Service bookkeeping (all manual for now). */
  continuingReminderSentAt?: string | null;
  continuingDecision?: 'continue' | 'cancel' | null;
}

export type PaymentStartBasis = 'results' | 'fallback';
export interface PaymentStart {
  /** The Payment Start Date (= the Approval Date), or null while it cannot be known yet. */
  day: string | null;
  basis: PaymentStartBasis | null;
  /** Plain words: why this date, or why there is none yet. */
  why: string;
}

/**
 * 5.6 — THE PAYMENT START DATE (and the Approval Date, which is the same day).
 *  · Results sent and the guarantee applies → the day after the Refund Window (Results Date + 15).
 *  · The guarantee ceased (5.8) → the day after six weeks from the initial payment, never earlier than
 *    the day after it was recorded (a date already passed is not retroactive) — or the results date
 *    if results were already sent and that is EARLIER (checklist: "or earlier if it actually ended
 *    earlier").
 *  · Otherwise → none yet. ⛔ Never a guess: no date means Stripe stays on its hold and nothing is charged.
 */
export function paymentStart(f: TimelineFacts): PaymentStart {
  const initialDay = ukDay(f.initialPaidAt);
  const resultsDay = ukDay(f.resultsSentAt);
  const fromResults = resultsDay ? approvalDayFromResults(resultsDay) : null;
  if (f.guaranteeCeasedAt) {
    const ceasedDay = ukDay(f.guaranteeCeasedAt);
    if (!initialDay || !ceasedDay) return { day: null, basis: null, why: 'The guarantee was recorded as not applying, but the initial payment date is unknown — set the Payment Start Date by hand.' };
    const fallback = fallbackPaymentStartDay(initialDay);
    const notBefore = addDays(ceasedDay, 1);
    const day = fallback < notBefore ? notBefore : fallback;
    if (fromResults && fromResults < day) return { day: fromResults, basis: 'results', why: 'The Refund Window had already run from the Results Date, which ends earlier than the six-week fallback.' };
    return { day, basis: 'fallback', why: `The guarantee does not apply (clause 5.8), so monthly payments start the day after six weeks from the initial payment${day === notBefore && fallback < notBefore ? ' — that date had passed when it was recorded, so the day after recording' : ''}.` };
  }
  if (fromResults) return { day: fromResults, basis: 'results', why: 'The day after the 14-day Refund Window that runs from the Results Date (clauses 5.4 and 5.6).' };
  return { day: null, basis: null, why: 'Not known yet: it is the day after the Refund Window, which starts when the formal results are sent.' };
}

/** Initial commission is Pending until this day, Approved from it (contractor 6.1; checklist Part 4). */
export function approvalDay(f: TimelineFacts): string | null { return paymentStart(f).day; }

/** Is a Stripe charge on this instant allowed by the contract? ⛔ The ONE check every Stripe write
 *  passes: no recurring charge while the Refund Window can still be open. */
export function chargeAllowedOn(f: TimelineFacts, chargeInstantIso: string): boolean {
  const ps = paymentStart(f);
  const chargeDay = ukDay(chargeInstantIso);
  return !!ps.day && !!chargeDay && chargeDay >= ps.day;
}

/* ── the minimum term and the Continuing Service ───────────────────────────────────────────────── */
export interface MinimumTerm {
  /** Recurring £99 payments the minimum term needs (Build 11, Optimise 5). */
  recurringNeeded: number;
  recurringPaid: number;
  /** The day of the last minimum-term payment: actual when made, else expected from the real payments. */
  finalPaymentDay: string | null;
  finalPaymentActual: boolean;
  /** 9A.1 — the first Continuing Service day (same date each month as the previous payments). */
  continuingStartDay: string | null;
  /** 9A.3 — the client reminder must be sent ON OR BEFORE this day. */
  clientReminderDueDay: string | null;
  /** Paul's own action appears on this day. */
  paulActionDay: string | null;
  /** continuingServiceApplies(terms, route). False → the three Continuing Service days above are null. */
  continuingApplies: boolean;
  /** A fixed-term client (v4 Optimise) whose final minimum-term payment has actually been collected:
   *  the payment plan is complete and nothing more is ever charged. */
  planComplete: boolean;
  /** v4 Optimise (Paul, 2026-10-06): the Optimise End Date (clause 9B.2) — one calendar month after the day the
   *  sixth payment ACTUALLY succeeded (payment_ledger, Stripe's paid_at), clamped to the month's last day like every
   *  payment date (3.1). The sixth payment covers this final month of work; the agreement then ends automatically.
   *  Null until the sixth payment is collected, and for any client with a Continuing Service. */
  serviceEndDay: string | null;
}

/**
 * When the minimum term completes — from the SUCCESSFULLY COLLECTED payments, not a calendar guess.
 * The expected final day is the latest real payment plus the months still owed (a late or recovered
 * payment moves it); with no recurring payment yet it counts from the Payment Start Date.
 * ⛔ Unknown inputs give nulls, never a date: a reminder sent on a guessed date is worse than an
 * action that says "not known yet".
 */
/** Has a fixed-term (v4 Optimise) agreement ended on its Optimise End Date? Only once the sixth payment has
 *  actually been collected — an expected date never ends a service. */
export function serviceEndedOn(f: TimelineFacts, todayIso: string): boolean {
  const mt = minimumTerm(f);
  const today = ukDay(todayIso);
  return mt.planComplete && !!mt.serviceEndDay && !!today && today >= mt.serviceEndDay;
}

export function minimumTerm(f: TimelineFacts): MinimumTerm {
  const route = f.route;
  const continuingApplies = continuingServiceApplies(f.terms, route);
  const empty: MinimumTerm = { recurringNeeded: route ? recurringPaymentsFor(route) : 0, recurringPaid: f.recurringPaidAt?.length ?? 0, finalPaymentDay: null, finalPaymentActual: false, continuingStartDay: null, clientReminderDueDay: null, paulActionDay: null, continuingApplies, planComplete: false, serviceEndDay: null };
  if (!route) return empty;
  const needed = recurringPaymentsFor(route);
  const paid = [...(f.recurringPaidAt ?? [])].map((x) => ukDay(x)).filter((x): x is string => !!x).sort();
  const start = paymentStart(f).day;
  // The billing anchor: the first real payment's day when there is one (Stripe bills from it), else the Payment Start Date.
  const anchor = paid[0] ?? start;
  if (!anchor) return { ...empty, recurringPaid: paid.length };
  let finalDay: string; let actual = false;
  if (paid.length >= needed) { finalDay = paid[needed - 1]; actual = true; }
  else if (paid.length > 0) { finalDay = addMonthsClamped(anchor, needed - 1); }
  else finalDay = addMonthsClamped(anchor, needed - 1);
  /* A recovered late payment can sit past its anchor slot; the term is not complete before the last
     real payment, so the expected final day is never earlier than (latest paid + months still owed). */
  if (!actual && paid.length > 0) {
    const fromLatest = addMonthsClamped(paid[paid.length - 1], needed - paid.length);
    if (fromLatest > finalDay) finalDay = fromLatest;
  }
  /* ⛔ A FIXED TERM HAS NO CONTINUING SERVICE DATES (v4 Optimise): no start day, no reminder, no action —
     so nothing downstream (timelineActions, cron notices, the client card) can raise a £29.99 step. */
  if (!continuingApplies) {
    return {
      recurringNeeded: needed, recurringPaid: paid.length, finalPaymentDay: finalDay, finalPaymentActual: actual,
      continuingStartDay: null, clientReminderDueDay: null, paulActionDay: null, continuingApplies, planComplete: actual,
      /* ⛔ ONLY FROM THE ACTUAL SIXTH PAYMENT (Paul, 2026-10-06): the day Stripe reports it paid, as recorded
         in payment_ledger — never the due date. No countdown starts before it is collected. */
      serviceEndDay: actual ? addMonthsClamped(finalDay, 1) : null,
    };
  }
  const continuingStart = addMonthsClamped(anchor, needed);
  const cs = continuingStart > finalDay ? continuingStart : addMonthsClamped(finalDay, 1);
  const reminderDue = addDays(cs, -CLIENT_REMINDER_NOTICE_DAYS);
  return {
    recurringNeeded: needed, recurringPaid: paid.length, finalPaymentDay: finalDay, finalPaymentActual: actual,
    continuingStartDay: cs, clientReminderDueDay: reminderDue, paulActionDay: addDays(reminderDue, -PAUL_REMINDER_LEAD_DAYS),
    continuingApplies, planComplete: false, serviceEndDay: null,
  };
}

/* ── the actions LeadFinder puts in front of Paul ─────────────────────────────────────────────── */
export type TimelineActionKind =
  | 'confirm_access'          // payment taken, no Access Date yet
  | 'access_deadline'         // 30 days without access: decide whether the guarantee has ceased (5.8(a))
  | 'results_due'             // the four-week target is close or passed, results not sent
  | 'payment_start_unscheduled' // a Payment Start Date exists but Stripe has not been set / confirmed
  | 'continuing_prepare'      // the minimum term is approaching: prepare the 9A.3 reminder
  | 'continuing_reminder_overdue' // the 30-day client reminder is due or late
  | 'continuing_decision';    // the Continuing Service is about to start: continue or cancel?

export interface TimelineAction { kind: TimelineActionKind; dueDay: string; urgent: boolean; text: string }

/** Everything Paul must do on this client today or soon. Derived; never stored. Empty for a client not
 *  on v3 terms, and for an ended or refunded agreement. */
export function timelineActions(f: TimelineFacts, todayIso: string): TimelineAction[] {
  if (!isOptionBTerms(f.terms) || f.refundedAt || f.endedAt) return [];
  /* v4 Optimise: once the Optimise End Date is reached the agreement has ended (9B.2) — nothing is asked of Paul. */
  if (serviceEndedOn(f, todayIso)) return [];
  const today = ukDay(todayIso)!;
  const out: TimelineAction[] = [];
  const initialDay = ukDay(f.initialPaidAt);
  if (initialDay && !f.accessDate && !f.guaranteeCeasedAt) {
    const deadline = accessDeadlineDay(initialDay);
    if (today > deadline) out.push({ kind: 'access_deadline', dueDay: deadline, urgent: true, text: `No Access Date ${ACCESS_DEADLINE_DAYS} days after the initial payment (deadline ${deadline}). If access is still missing, record that the guarantee no longer applies (clause 5.8(a)) — monthly payments then start on the six-week fallback.` });
    else out.push({ kind: 'confirm_access', dueDay: deadline, urgent: daysBetween(today, deadline) <= ACCESS_REMINDER_LEAD_DAYS, text: `Confirm the Access Date once the access and information needed to start are in (clause 5.1). Deadline for the guarantee: ${deadline}.` });
  }
  if (f.accessDate && !f.resultsSentAt && !f.guaranteeCeasedAt) {
    const target = resultsTargetDay(f.accessDate);
    const latest = resultsNormalLatestDay(f.accessDate);
    if (daysBetween(today, target) <= RESULTS_REMINDER_LEAD_DAYS) {
      out.push({ kind: 'results_due', dueDay: target, urgent: today > latest, text: `Formal results due about ${target} (four weeks after the Access Date), normally by ${latest}. The Results Date is the day they are actually sent.` });
    }
  }
  const ps = paymentStart(f);
  if (ps.day && !(f.paymentStartScheduledDay === ps.day && f.paymentStartConfirmedAt)) {
    out.push({ kind: 'payment_start_unscheduled', dueDay: ps.day, urgent: daysBetween(today, ps.day) <= 3, text: `Payment Start Date ${ps.day} is not yet confirmed in Stripe. Set it from this client's page — until then Stripe holds the monthly payment and charges nothing.` });
  }
  const mt = minimumTerm(f);
  if (mt.continuingApplies && mt.continuingStartDay && mt.clientReminderDueDay && mt.paulActionDay && f.continuingDecision == null) {
    if (!f.continuingReminderSentAt) {
      if (today > mt.clientReminderDueDay) out.push({ kind: 'continuing_reminder_overdue', dueDay: mt.clientReminderDueDay, urgent: true, text: `The 30-day Continuing Service reminder was due by ${mt.clientReminderDueDay} (clause 9A.3). Send it and record it; the £${CONTINUING_SERVICE_GBP} service starts ${mt.continuingStartDay}.` });
      else if (today >= mt.paulActionDay) out.push({ kind: 'continuing_prepare', dueDay: mt.clientReminderDueDay, urgent: daysBetween(today, mt.clientReminderDueDay) <= 3, text: `Minimum term completes ${mt.finalPaymentDay}. Email the client their Continuing Service reminder by ${mt.clientReminderDueDay} (at least 30 days before £${CONTINUING_SERVICE_GBP}/month starts on ${mt.continuingStartDay}).` });
    } else if (daysBetween(today, mt.continuingStartDay) <= 7) {
      out.push({ kind: 'continuing_decision', dueDay: mt.continuingStartDay, urgent: true, text: `Continuing Service starts ${mt.continuingStartDay}. Record whether the client continues or cancels — nothing switches in Stripe automatically.` });
    }
  }
  return out.sort((a, b) => a.dueDay.localeCompare(b.dueDay));
}

/* ── 5.1 + 7.1(a)(b): what must be in before Paul may confirm the Access Date ─────────────────────
   The setup checklist's own items (handoffReadiness.ts), route by route. ⛔ NEVER declared from non-null
   fields: Paul presses Confirm; this only stops him pressing it while a required item is plainly
   missing. An item the checklist marks not required for this client (e.g. "Not needed — Findable builds
   and hosts") counts as satisfied — that decision is the checklist's, not repeated here. */
export const ACCESS_REQUIREMENTS: Record<ServiceRoute, readonly string[]> = {
  /* Build: we build and host, so their domain (and authority over it), their business facts, their GBP. */
  build: ['business', 'contact', 'services', 'service_areas', 'domain', 'gbp_access'],
  /* Optimise: we work on THEIR site, so access to it is the core of 7.1(a). */
  optimise: ['business', 'contact', 'services', 'service_areas', 'website', 'website_access', 'gbp_access'],
};
export interface AccessItem { key: string; label: string; ok: boolean; required: boolean }
export function accessReadiness(route: ServiceRoute | null, items: readonly AccessItem[]): { ready: boolean; missing: string[]; checked: string[] } {
  if (!route) return { ready: false, missing: ['the route (Build / Optimise)'], checked: [] };
  const missing: string[] = []; const checked: string[] = [];
  for (const key of ACCESS_REQUIREMENTS[route]) {
    const it = items.find((i) => i.key === key);
    if (!it) { missing.push(key); continue; }
    checked.push(it.label);
    if (it.required && !it.ok) missing.push(it.label);
  }
  return { ready: missing.length === 0, missing, checked };
}

/** 5.2 — may the paid baseline start? A v3 client waits for the confirmed Access Date; a client with no
 *  terms row (sold before v3) is never held by this rule. */
export function baselineMayStart(terms: { commercial_terms?: string | null; access_date?: string | null } | null | undefined): boolean {
  if (!terms || !isOptionBTerms(terms.commercial_terms)) return true;
  return !!terms.access_date;
}

/* ── the guarantee (5.4) ──────────────────────────────────────────────────────────────────────── */
/**
 * "If the number of answers that name your business at the re-measurement is not higher than at the
 * baseline" — Paul, 2026-10-05: ANY increase counts. 39/120 → 40/120 is higher; 39 → 39 and 39 → 38
 * are not. ⛔ No noise band, no percentage: the COUNT of named answer opportunities on the same matched
 * questions, the same engines and the same method. Whether the two measurements are comparable at all
 * (same questions, both engines answered, enough runs) is a separate gate that holds the results for
 * Paul — it is never a threshold on the number.
 */
export function guaranteeNumberWentUp(beforeNamed: number, afterNamed: number): boolean {
  if (!Number.isFinite(beforeNamed) || !Number.isFinite(afterNamed)) return false;
  return afterNamed > beforeNamed;
}

/* ── everything the client page shows, in one derived object ────────────────────────────────────── */
export interface TimelineView {
  onV3: boolean;
  initialPaidDay: string | null;
  accessDate: string | null;
  accessDeadlineDay: string | null;
  resultsTargetDay: string | null;
  resultsNormalLatestDay: string | null;
  resultsDay: string | null;
  refundWindowEndDay: string | null;
  guaranteeApplies: boolean;
  paymentStart: PaymentStart;
  paymentStartConfirmed: boolean;
  minimumTerm: MinimumTerm;
  /** v4 Optimise: the agreement has ended automatically on its Optimise End Date (9B.2). Derived from today. */
  serviceEnded: boolean;
  /** FINDABLE_CONTINUING_GBP when the Continuing Service applies to this client, null when it does not
   *  (a v4 Optimise client is never shown a £29.99 step). */
  continuingGbp: number | null;
  actions: TimelineAction[];
}
export function timelineView(f: TimelineFacts, todayIso: string): TimelineView {
  const initialPaidDay = ukDay(f.initialPaidAt);
  const resultsDay = ukDay(f.resultsSentAt);
  const ps = paymentStart(f);
  const mt = minimumTerm(f);
  return {
    onV3: isOptionBTerms(f.terms),
    serviceEnded: serviceEndedOn(f, todayIso),
    initialPaidDay,
    accessDate: f.accessDate,
    accessDeadlineDay: initialPaidDay ? accessDeadlineDay(initialPaidDay) : null,
    resultsTargetDay: f.accessDate ? resultsTargetDay(f.accessDate) : null,
    resultsNormalLatestDay: f.accessDate ? resultsNormalLatestDay(f.accessDate) : null,
    resultsDay,
    refundWindowEndDay: resultsDay && !f.guaranteeCeasedAt ? refundWindowEndDay(resultsDay) : null,
    guaranteeApplies: !f.guaranteeCeasedAt,
    paymentStart: ps,
    paymentStartConfirmed: !!ps.day && f.paymentStartScheduledDay === ps.day && !!f.paymentStartConfirmedAt,
    minimumTerm: mt,
    continuingGbp: mt.continuingApplies ? CONTINUING_SERVICE_GBP : null,
    actions: timelineActions(f, todayIso),
  };
}

/** 5.8 — the recorded reasons the guarantee no longer applies (the agreement's own four). */
export const GUARANTEE_CEASED_REASONS = {
  no_access_30_days: '5.8(a) — access and information not given within 30 days of the initial payment',
  access_withdrawn: '5.8(a) — access we reasonably need was withdrawn',
  domain_cannot_connect: '5.8(b) — the website we built cannot lawfully be connected to the domain',
  third_party_dispute: '5.8(c) — a third-party dispute stopped or delayed the work',
  wrong_authority_info: '5.8(d) — information about who owns or controls the domain, website or listings was wrong',
} as const;
export type GuaranteeCeasedReason = keyof typeof GUARANTEE_CEASED_REASONS;

/* ── words ────────────────────────────────────────────────────────────────────────────────────── */
/** "13 October 2026" for a UK day. */
export function ukDayWords(day: string | null | undefined): string {
  if (!day) return 'not known yet';
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
/** The number of payments in the minimum term, sign-up included, for a route. */
export function minimumTermPayments(route: ServiceRoute): number { return totalPaymentsFor(route); }
