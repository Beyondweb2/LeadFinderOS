// _shared/client-terms.ts — the v3 Client Service Agreement timeline on the server (2026-10-05).
//
// ONE writer for each of: the client's commercial-terms row (client_service_terms), its append-only
// history (client_service_events), the Payment Start Date in Stripe, and the Access Date email.
// The dates themselves are src/lib/clientTimeline.ts — this file only reads the facts, asks that file
// what the date is, and makes Stripe agree.
//
// ⛔ NOTHING HERE CHARGES ANYONE. The only Stripe write is moving a TRIALING subscription's trial_end
//    (= its first charge) to the contract's Payment Start Date. It refuses: a subscription that is not
//    ours for this lead, one that is not trialing, a date the contract does not produce, and any date
//    inside the Refund Window (chargeAllowedOn). Absent facts → no date → nothing is written.
// ⛔ STRIPE MUST AGREE. After the update the subscription is READ BACK; only an exact trial_end match is
//    recorded as confirmed. A 200 alone is never proof (CLAUDE.md §4).
// ⛔ IDEMPOTENT. The same date sends the same parameters with the same Idempotency-Key; scheduling the
//    same day twice is a no-op, and a changed day (e.g. a corrected Results Date) is a new key.
// ⛔ THE CONTINUING SERVICE PRICE IS NEVER CHARGED FROM HERE. The minimum term's cancel_at is kept at its end; the Continuing
//    Service is Paul's manual step until CONTINUING_SERVICE_AUTOMATION.stripeSwitch is turned on.
import {
  CONTINUING_SERVICE_AUTOMATION, OPTION_B_TIMING, chargeAllowedOn, continuingServiceApplies, isOptionBTerms, minimumTerm, paymentStart, timelineActions, ukDay, ukDayAtHourIso, ukDayWords,
  type TimelineFacts,
} from "../../../src/lib/clientTimeline.ts";
import { paymentPlanCompleteEmail, recurringPaymentsFor, serviceRouteForTotal, isServiceRoute, totalPaymentsFor, type ServiceRoute } from "../../../src/lib/findableOffer.ts";
import { qaEmailHold } from "./qa-guard.ts";
import { minimumTermCancelAt } from "./delayed-subscription.ts";

// deno-lint-ignore no-explicit-any
type Service = any;
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The marker a v3 subscription carries (clientTimeline.ts), written at creation (delayed-subscription.ts).
 *  The scheduler refuses a subscription without it: it was created under a different timing rule. */
export { OPTION_B_TIMING };

/** The kinds the history log accepts (mirrors client_service_events_kind_check). */
export const TERMS_EVENT_KINDS = [
  "terms_stamped", "access_confirmed", "access_email_sent", "access_email_failed", "guarantee_ceased",
  "payment_start_scheduled", "payment_start_refused", "continuing_prepared", "continuing_reminder_sent",
  "continuing_will_continue", "continuing_will_cancel", "paid_without_v3_agreement", "fixed_term_final_payment",
] as const;
export type TermsEventKind = typeof TERMS_EVENT_KINDS[number];

export const TERMS_COLUMNS =
  "lead_id,commercial_terms,agreement_acceptance_id,service_route,initial_paid_at,access_date,access_confirmed_at,access_confirmed_by,access_email_sent_at,guarantee_ceased_at,guarantee_ceased_reason,payment_start_date,payment_start_basis,payment_start_trial_end,payment_start_confirmed_at,continuing_prepared_at,continuing_reminder_sent_at,continuing_reminder_sent_by,continuing_decision,continuing_decision_at";

export interface TermsRow {
  lead_id: string;
  commercial_terms: string;
  agreement_acceptance_id: string | null;
  service_route: string | null;
  initial_paid_at: string | null;
  access_date: string | null;
  access_confirmed_at: string | null;
  access_confirmed_by: string | null;
  access_email_sent_at: string | null;
  guarantee_ceased_at: string | null;
  guarantee_ceased_reason: string | null;
  payment_start_date: string | null;
  payment_start_basis: string | null;
  payment_start_trial_end: string | null;
  payment_start_confirmed_at: string | null;
  continuing_prepared_at: string | null;
  continuing_reminder_sent_at: string | null;
  continuing_reminder_sent_by: string | null;
  continuing_decision: "continue" | "cancel" | null;
  continuing_decision_at: string | null;
}

/** Append one history row. Never throws: the history must not be the reason an action fails. */
export async function appendTermsEvent(service: Service, leadId: string, kind: TermsEventKind, actor: string | null, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    const { error } = await service.from("client_service_events").insert({ lead_id: leadId, kind, actor_user_id: actor, detail });
    if (error) console.error(`[client-terms] history ${kind} for ${leadId} not written: ${error.message}`);
  } catch (e) {
    console.error(`[client-terms] history ${kind} for ${leadId} not written:`, (e as Error).message);
  }
}

/** The facts the timeline is derived from, read from the database. Null when the lead has no v3 row. */
export async function loadTimelineFacts(service: Service, leadId: string): Promise<{ terms: TermsRow; facts: TimelineFacts; lead: Record<string, unknown> } | null> {
  const { data: terms, error } = await service.from("client_service_terms").select(TERMS_COLUMNS).eq("lead_id", leadId).maybeSingle();
  if (error) throw error;
  if (!terms) return null;
  const { data: lead, error: leadErr } = await service.from("outreach_leads")
    .select("id,business_name,email,status,service_terminated_at,contract_total_payments,remeasure_results_sent_at,stripe_subscription_id,payment_date")
    .eq("id", leadId).maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return null;
  const { data: rec, error: recErr } = await service.from("payment_ledger").select("occurred_at,amount_gbp,status")
    .eq("lead_id", leadId).eq("kind", "recurring").eq("status", "succeeded").order("occurred_at", { ascending: true });
  if (recErr) throw recErr;
  const t = terms as TermsRow;
  const route: ServiceRoute | null = isServiceRoute(t.service_route) ? t.service_route : serviceRouteForTotal(lead.contract_total_payments);
  const facts: TimelineFacts = {
    terms: t.commercial_terms,
    route,
    initialPaidAt: t.initial_paid_at,
    accessDate: t.access_date,
    resultsSentAt: (lead.remeasure_results_sent_at as string | null) ?? null,
    guaranteeCeasedAt: t.guarantee_ceased_at,
    guaranteeCeasedReason: t.guarantee_ceased_reason,
    refundedAt: lead.status === "refunded" ? "refunded" : null,
    endedAt: (lead.service_terminated_at as string | null) ?? null,
    paymentStartScheduledDay: t.payment_start_date,
    paymentStartConfirmedAt: t.payment_start_confirmed_at,
    recurringPaidAt: ((rec ?? []) as Array<{ occurred_at: string; amount_gbp: number }>).filter((r) => Number(r.amount_gbp) > 0).map((r) => r.occurred_at),
    continuingReminderSentAt: t.continuing_reminder_sent_at,
    continuingDecision: t.continuing_decision,
  };
  return { terms: t, facts, lead: lead as Record<string, unknown> };
}

/* ══ THE PAYMENT START PLAN — pure, so the refusals are testable without Stripe ══════════════════════ */
export type PaymentStartPlan =
  | { ok: true; day: string; trialEndSec: number; cancelAtSec: number; idempotencyKey: string; basis: string }
  | { ok: false; reason: string };

export interface StripeSubscriptionView {
  id?: string; status?: string; trial_end?: number | null; cancel_at?: number | null;
  metadata?: Record<string, string | undefined> | null;
}

/**
 * What Stripe should be set to, or why not. `nowIso` is when the write would happen.
 * ⛔ A Payment Start Date already in the past (Paul set it late) is charged at the next safe moment —
 *    later than the contract allows is acceptable, EARLIER never is.
 */
export function planPaymentStart(facts: TimelineFacts, leadId: string, sub: StripeSubscriptionView | null, nowIso: string): PaymentStartPlan {
  if (!isOptionBTerms(facts.terms)) return { ok: false, reason: "This client is not on the agreement-first (v3/v4) terms — their payments keep the timing they signed up to." };
  if (facts.refundedAt || facts.endedAt) return { ok: false, reason: "The agreement has ended (refunded or ended) — no monthly payment may be scheduled." };
  const ps = paymentStart(facts);
  if (!ps.day) return { ok: false, reason: ps.why };
  if (!facts.route) return { ok: false, reason: "The route (Build / Optimise) is not recorded, so the number of monthly payments is unknown." };
  if (!sub || !sub.id) return { ok: false, reason: "No Stripe subscription is stored for this client." };
  if ((sub.metadata?.lead_id ?? "") !== leadId) return { ok: false, reason: "The stored Stripe subscription does not belong to this client (its lead id differs)." };
  if ((sub.metadata?.payment_timing ?? "") !== OPTION_B_TIMING) return { ok: false, reason: "The Stripe subscription was not created for the v3 timing (no option_b marker) — set it by hand in Stripe." };
  if (sub.status !== "trialing") return { ok: false, reason: `The Stripe subscription is ${sub.status ?? "in an unknown state"}, not waiting for its first payment — its start can no longer be moved here.` };
  let trialEndIso = ukDayAtHourIso(ps.day);
  const soonest = new Date(Date.parse(nowIso) + 3_600_000).toISOString();
  if (trialEndIso < soonest) trialEndIso = soonest;
  if (!chargeAllowedOn(facts, trialEndIso)) return { ok: false, reason: `Refused: ${trialEndIso} would charge before the Payment Start Date ${ps.day}.` };
  const trialEndSec = Math.floor(Date.parse(trialEndIso) / 1000);
  return {
    ok: true, day: ps.day, basis: ps.basis ?? "results", trialEndSec,
    cancelAtSec: minimumTermCancelAt(trialEndSec, recurringPaymentsFor(facts.route)),
    idempotencyKey: `findable-payment-start-${sub.id}-${trialEndSec}`,
  };
}

async function stripeCall(fetcher: FetchLike, secret: string, method: "GET" | "POST", path: string, body?: URLSearchParams, idem?: string) {
  const res = await fetcher(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    ...(body ? { body: body.toString() } : {}),
  });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* error text kept below */ }
  return { ok: res.ok, status: res.status, json, text };
}

export type ScheduleOutcome =
  | { kind: "scheduled"; day: string; trialEndSec: number; confirmed: true }
  | { kind: "refused"; reason: string }
  | { kind: "failed"; reason: string };

/**
 * Set the client's first monthly charge to the contract's Payment Start Date and prove Stripe agrees.
 * Safe to call any number of times (the results sender calls it, Paul's button calls it, a retry calls it).
 */
export async function schedulePaymentStart(service: Service, leadId: string, actor: string | null, opts: { fetcher?: FetchLike; secret?: string; nowIso?: string } = {}): Promise<ScheduleOutcome> {
  const fetcher = opts.fetcher ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const secret = opts.secret ?? (Deno.env.get("STRIPE_SECRET_KEY") ?? "");
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const loaded = await loadTimelineFacts(service, leadId);
  if (!loaded) return { kind: "refused", reason: "This client has no v3 terms record." };
  const subId = String(loaded.lead.stripe_subscription_id ?? "").trim();
  if (!secret) return { kind: "failed", reason: "STRIPE_SECRET_KEY is not set" };
  let sub: StripeSubscriptionView | null = null;
  if (subId) {
    const got = await stripeCall(fetcher, secret, "GET", `subscriptions/${encodeURIComponent(subId)}`);
    if (!got.ok) return { kind: "failed", reason: `Could not read the Stripe subscription: ${got.text.slice(0, 200)}` };
    sub = got.json as StripeSubscriptionView;
  }
  const plan = planPaymentStart(loaded.facts, leadId, sub, nowIso);
  if (!plan.ok) {
    await appendTermsEvent(service, leadId, "payment_start_refused", actor, { reason: plan.reason });
    return { kind: "refused", reason: plan.reason };
  }
  /* Already exactly right in Stripe → record it (idempotent) without another write. */
  if (sub?.trial_end !== plan.trialEndSec || sub?.cancel_at !== plan.cancelAtSec) {
    const upd = await stripeCall(fetcher, secret, "POST", `subscriptions/${encodeURIComponent(subId)}`, new URLSearchParams({
      trial_end: String(plan.trialEndSec),
      cancel_at: String(plan.cancelAtSec),
      proration_behavior: "none",
      "metadata[payment_start_date]": plan.day,
      "metadata[payment_start_basis]": plan.basis,
    }), plan.idempotencyKey);
    if (!upd.ok) return { kind: "failed", reason: `Stripe refused the Payment Start Date: ${upd.text.slice(0, 300)}` };
  }
  /* ⛔ READ BACK — the only proof. */
  const back = await stripeCall(fetcher, secret, "GET", `subscriptions/${encodeURIComponent(subId)}`);
  const b = back.json as StripeSubscriptionView;
  if (!back.ok || b.trial_end !== plan.trialEndSec || b.status !== "trialing") {
    return { kind: "failed", reason: `Stripe did not confirm the Payment Start Date (read back trial_end ${String(b.trial_end ?? "none")}, status ${String(b.status ?? "unknown")}).` };
  }
  const trialEndIso = new Date(plan.trialEndSec * 1000).toISOString();
  const { error } = await service.from("client_service_terms").update({
    payment_start_date: plan.day, payment_start_basis: plan.basis, payment_start_trial_end: trialEndIso, payment_start_confirmed_at: nowIso,
  }).eq("lead_id", leadId);
  if (error) return { kind: "failed", reason: `Stripe is set to ${plan.day} but the record could not be saved: ${error.message}` };
  await service.from("outreach_leads").update({ subscription_renews_at: trialEndIso }).eq("id", leadId);
  await appendTermsEvent(service, leadId, "payment_start_scheduled", actor, { day: plan.day, basis: plan.basis, trial_end: trialEndIso, subscription: subId });
  return { kind: "scheduled", day: plan.day, trialEndSec: plan.trialEndSec, confirmed: true };
}

/* ══ THE ACCESS DATE EMAIL (clause 5.1: "We will confirm the date to you by email") ═══════════════════ */
export function accessDateEmail(i: { businessName: string; accessDay: string; resultsTargetDay: string }): { subject: string; text: string } {
  return {
    subject: `Your Findable Access Date - ${i.businessName}`,
    text: [
      "Hello,",
      "",
      `Thank you for giving us the access and information we need. This email confirms your Access Date under clause 5.1 of your Client Service Agreement: ${ukDayWords(i.accessDay)}.`,
      "",
      `We now take your baseline measurement, before we change anything, and send you the list of questions with your baseline result. We aim to send your formal before-and-after results about four weeks from your Access Date (around ${ukDayWords(i.resultsTargetDay)}). The date we send them is your Results Date.`,
      "",
      "Your first monthly payment is not taken until the day after your 14-day refund window closes.",
      "",
      "If anything about this date looks wrong, just reply to this email.",
      "",
      "Paul",
      "Findable",
    ].join("\n"),
  };
}

/** Send it. Returns ok only when Resend accepted it (never claims a send it cannot prove). */
export async function sendAccessDateEmail(to: string, mail: { subject: string; text: string }, fetcher: FetchLike = (u, i) => fetch(u, i)): Promise<{ ok: boolean; detail: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, detail: "RESEND_API_KEY not set" };
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Findable <alerts@findable.live>", to: [to], reply_to: "paul@findable.live", subject: mail.subject, text: mail.text }),
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, detail: res.ok ? body.slice(0, 200) : `${res.status} ${body.slice(0, 300)}` };
}

/* ══ PAUL'S NOTICES — the timeline actions, once a day (fn cron-run) ══════════════════════════════════
   Every v3 client's derived actions (clientTimeline.timelineActions: confirm access, the 30-day access
   deadline, results due, a Payment Start Date not yet in Stripe, the Continuing Service reminder and
   decision) become notifications for the book owner. Deduped per lead, action and due day, so a daily
   run never repeats one; a new due day (e.g. a later minimum-term date) is a new notice.
   ⛔ Notices only. Nothing here emails a client or touches Stripe (CONTINUING_SERVICE_AUTOMATION). */
export async function notifyTimelineActions(service: Service, nowIso: string = new Date().toISOString()): Promise<{ clients: number; notices: number }> {
  const { data: owner, error: oErr } = await service.from("team_members").select("user_id").eq("is_book_owner", true).maybeSingle();
  if (oErr) throw oErr;
  const ownerId = (owner as { user_id?: string } | null)?.user_id;
  if (!ownerId) return { clients: 0, notices: 0 };
  const { data: rows, error } = await service.from("client_service_terms").select("lead_id").order("lead_id").limit(1000);
  if (error) throw error;
  let notices = 0;
  for (const r of (rows ?? []) as { lead_id: string }[]) {
    const loaded = await loadTimelineFacts(service, r.lead_id);
    if (!loaded) continue;
    const biz = String(loaded.lead.business_name ?? "A client").trim() || "A client";
    const out = timelineActions(loaded.facts, nowIso).map((a) => ({
      user_id: ownerId, kind: "team_task", title: `${biz}: ${TIMELINE_ACTION_TITLE[a.kind]}`, body: a.text,
      link: `/paid-clients/${r.lead_id}`, lead_id: r.lead_id, priority: 2, dedupe_key: `terms:${r.lead_id}:${a.kind}:${a.dueDay}`,
    }));
    if (!out.length) continue;
    const { error: nErr } = await service.from("notifications").upsert(out, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
    if (nErr) console.error(`[client-terms] notices for ${r.lead_id} not written: ${nErr.message}`);
    else notices += out.length;
  }
  return { clients: (rows ?? []).length, notices };
}
const TIMELINE_ACTION_TITLE: Record<string, string> = {
  confirm_access: "confirm the Access Date",
  access_deadline: "no access after 30 days",
  results_due: "formal results due",
  payment_start_unscheduled: "Payment Start Date not set in Stripe",
  continuing_prepare: "Continuing Service reminder due",
  continuing_reminder_overdue: "Continuing Service reminder OVERDUE",
  continuing_decision: "Continuing Service starts soon",
};

/** Today's UK day (for the actions list). */
export const todayUk = (nowIso: string = new Date().toISOString()) => ukDay(nowIso)!;

/** The automation switches, re-exported so every server path reads the same object. */
export { CONTINUING_SERVICE_AUTOMATION };

/* ══ v4 OPTIMISE: THE SIXTH PAYMENT, THE FINAL MONTH AND THE END (Paul, 2026-10-06; agreement 9B.1–9B.3) ══════
   PAYMENT 6 SUCCEEDS → no further charge → the service runs one final month → it ends automatically on the
   Optimise End Date = one calendar month after the day payment 6 ACTUALLY succeeded (month-end clamped).
   ⛔ THE AUTHORITATIVE DATE is payment_ledger's occurred_at for the sixth successful payment — Stripe's own
      status_transitions.paid_at, written by stripe-webhook invoice.paid, unique per invoice. Never the due date,
      the invoice's creation or the subscription's anchor; nothing typed in a screen feeds it (minimumTerm()).
   ⛔ PAYMENT 7 IS IMPOSSIBLE, TWICE OVER: Stripe pause_collection = void (every invoice Stripe creates from now on
      is voided the moment it is created, so it is never attempted), and cancel_at = the Optimise End Date (the
      subscription closes itself then). A late sixth payment can put the End Date past the next billing boundary;
      the renewal invoice Stripe generates there is voided, never charged.
   ⛔ IDEMPOTENT: a stable Idempotency-Key per subscription and end second; a re-run where Stripe already agrees
      writes nothing; the "plan complete" email is claimed ONCE by a unique index on client_service_events
      (lead_id) WHERE kind = 'fixed_term_final_payment' — a duplicate webhook can neither double-write nor re-email.
   ⛔ A FAILED STRIPE WRITE THROWS UPWARD (the webhook answers 500 and Stripe retries the whole event; every step
      before it is idempotent). Nothing here can charge anyone. */
export const FIXED_TERM_EVENT = "fixed_term_final_payment" as const;

export interface FixedTermSubscriptionView extends StripeSubscriptionView {
  pause_collection?: { behavior?: string | null } | null;
}

export type FixedTermPlan =
  | { ok: true; endDay: string; finalPaymentDay: string; cancelAtSec: number; write: boolean; idempotencyKey: string | null }
  | { ok: false; skip: true; reason: string }
  | { ok: false; skip: false; reason: string };

/** Pure: what Stripe must say once the sixth Optimise payment has succeeded, or why nothing applies. */
export function planFixedTermEnd(facts: TimelineFacts, leadId: string, sub: FixedTermSubscriptionView | null, nowIso: string): FixedTermPlan {
  if (!isOptionBTerms(facts.terms) || continuingServiceApplies(facts.terms, facts.route)) return { ok: false, skip: true, reason: "not a fixed-term (v4 Optimise) client" };
  if (facts.refundedAt || facts.endedAt) return { ok: false, skip: true, reason: "the agreement has ended (refunded or ended)" };
  const mt = minimumTerm(facts);
  if (!mt.planComplete || !mt.serviceEndDay || !mt.finalPaymentDay) return { ok: false, skip: true, reason: "the sixth payment has not been collected yet" };
  const endDay = mt.serviceEndDay;
  const endSec = Math.floor(Date.parse(ukDayAtHourIso(endDay)) / 1000);
  const nowSec = Math.floor(Date.parse(nowIso) / 1000);
  /* No subscription, or one Stripe has already closed: nothing can be charged — nothing to write. */
  if (!sub || !sub.id || sub.status === "canceled" || sub.status === "incomplete_expired") {
    return { ok: true, endDay, finalPaymentDay: mt.finalPaymentDay, cancelAtSec: endSec, write: false, idempotencyKey: null };
  }
  if ((sub.metadata?.lead_id ?? "") !== leadId) return { ok: false, skip: false, reason: "The stored Stripe subscription does not belong to this client (its lead id differs)." };
  /* Processed after the End Date (a very late event): close at the next safe moment, never in the past. */
  const cancelAtSec = Math.max(endSec, nowSec + 60);
  const write = sub.cancel_at !== cancelAtSec || sub.pause_collection?.behavior !== "void" || sub.metadata?.optimise_end_date !== endDay;
  return { ok: true, endDay, finalPaymentDay: mt.finalPaymentDay, cancelAtSec, write, idempotencyKey: write ? `findable-fixed-term-end-${sub.id}-${cancelAtSec}` : null };
}

export type FinaliseOutcome =
  | { kind: "skipped"; reason: string }
  | { kind: "finalised"; endDay: string; cancelAtSec: number; emailed: boolean; stripeWritten: boolean }
  | { kind: "already"; endDay: string; stripeWritten: boolean }
  | { kind: "failed"; reason: string };

/**
 * Run on every successful recurring payment (stripe-webhook invoice.paid). For anyone but a v4 Optimise client
 * whose sixth payment has succeeded it returns "skipped" without touching Stripe.
 */
export async function finaliseFixedTerm(service: Service, leadId: string, opts: { fetcher?: FetchLike; secret?: string; nowIso?: string; send?: (to: string, mail: { subject: string; text: string }) => Promise<{ ok: boolean; detail: string }> } = {}): Promise<FinaliseOutcome> {
  const fetcher = opts.fetcher ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const secret = opts.secret ?? (Deno.env.get("STRIPE_SECRET_KEY") ?? "");
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const loaded = await loadTimelineFacts(service, leadId);
  if (!loaded) return { kind: "skipped", reason: "no agreement-first terms" };
  /* Cheap pure check first: no Stripe call for anyone this cannot apply to. */
  const pre = planFixedTermEnd(loaded.facts, leadId, null, nowIso);
  if (!pre.ok && pre.skip) return { kind: "skipped", reason: pre.reason };
  const subId = String(loaded.lead.stripe_subscription_id ?? "").trim();
  let sub: FixedTermSubscriptionView | null = null;
  if (subId) {
    if (!secret) return { kind: "failed", reason: "STRIPE_SECRET_KEY is not set" };
    const got = await stripeCall(fetcher, secret, "GET", `subscriptions/${encodeURIComponent(subId)}`);
    if (!got.ok) return { kind: "failed", reason: `Could not read the Stripe subscription: ${got.text.slice(0, 200)}` };
    sub = got.json as FixedTermSubscriptionView;
  }
  const plan = planFixedTermEnd(loaded.facts, leadId, sub, nowIso);
  if (!plan.ok) return plan.skip ? { kind: "skipped", reason: plan.reason } : { kind: "failed", reason: plan.reason };
  if (plan.write && sub?.id) {
    const upd = await stripeCall(fetcher, secret, "POST", `subscriptions/${encodeURIComponent(sub.id)}`, new URLSearchParams({
      "pause_collection[behavior]": "void",
      cancel_at: String(plan.cancelAtSec),
      proration_behavior: "none",
      "metadata[optimise_end_date]": plan.endDay,
      "metadata[final_payment_day]": plan.finalPaymentDay,
      "metadata[fixed_term_cancel_at]": String(plan.cancelAtSec),
    }), plan.idempotencyKey ?? undefined);
    if (!upd.ok) return { kind: "failed", reason: `Stripe refused the final-month end: ${upd.text.slice(0, 300)}` };
    /* ⛔ READ BACK — the only proof that payment 7 cannot be taken. */
    const back = await stripeCall(fetcher, secret, "GET", `subscriptions/${encodeURIComponent(sub.id)}`);
    const b = back.json as FixedTermSubscriptionView;
    if (!back.ok || b.cancel_at !== plan.cancelAtSec || b.pause_collection?.behavior !== "void") {
      return { kind: "failed", reason: `Stripe did not confirm the final-month end (read back cancel_at ${String(b.cancel_at ?? "none")}, pause ${String(b.pause_collection?.behavior ?? "none")}).` };
    }
  }
  /* ⛔ CLAIM ONCE (unique index): the first delivery records it and emails; every other one stops here. */
  const { error: claimErr } = await service.from("client_service_events").insert({
    lead_id: leadId, kind: FIXED_TERM_EVENT, actor_user_id: null,
    detail: { final_payment_day: plan.finalPaymentDay, end_day: plan.endDay, cancel_at: plan.cancelAtSec, subscription: sub?.id ?? null, stripe_written: plan.write },
  });
  if (claimErr) {
    if (String(claimErr.code) === "23505") return { kind: "already", endDay: plan.endDay, stripeWritten: plan.write };
    return { kind: "failed", reason: `The final payment could not be recorded: ${claimErr.message}` };
  }
  if (plan.write) await service.from("outreach_leads").update({ subscription_renews_at: null }).eq("id", leadId);
  /* Message 1 of 2: the plan is complete and the final month is running (paymentPlanCompleteEmail). */
  let emailed = false;
  const { data: obRows } = await service.from("onboarding_responses").select("contact_email,status,updated_at").eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(5);
  const to = ((((obRows ?? []) as { contact_email: string | null; status: string | null }[]).find((r) => r.status === "paid")?.contact_email)
    ?? String(loaded.lead.email ?? "")).trim().toLowerCase();
  if (to && to.includes("@")) {
    const held = await qaEmailHold(service, leadId, to);
    if (!held) {
      const m = paymentPlanCompleteEmail({ totalPayments: loaded.facts.route ? totalPaymentsFor(loaded.facts.route) : 6, endDayWords: ukDayWords(plan.endDay) });
      const sent = await (opts.send ?? sendAccessDateEmail)(to, { subject: m.subject, text: m.paragraphs.join("\n\n") });
      emailed = sent.ok;
      if (!sent.ok) {
        try { await service.from("client_error_reports").insert({ error_id: "fixed_term_email_failed", context: { lead_id: leadId, to, detail: sent.detail.slice(0, 300) } }); } catch { /* best effort */ }
      }
    }
  }
  return { kind: "finalised", endDay: plan.endDay, cancelAtSec: plan.cancelAtSec, emailed, stripeWritten: plan.write };
}
