/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REVIEW QUEUE — who is waiting on a decision, and it is one of two decisions.

   🔴 WHY IT EXISTS (Paul, 2026-09-13). White Sparks Electrical finished its baseline AND its
   winnable-questions audit and NOTHING said so: no email, nothing on the Dashboard, nothing
   anywhere. He found out by opening the AI Audit page himself. The `baseline_checked` tick on the
   Deliver card is a record that he did it, not a prompt — a client with no tick is
   indistinguishable from one whose baseline has not finished.

   ⛔ THE DECISION IS CONFIRM-OR-REFUND, WHICH IS WHY IT CANNOT BE A QUIET BADGE. Either the
   baseline is confirmed and goes to the client, or the client is refunded because there is nothing
   winnable. Missing the second means taking £99 for work that cannot help them.

   ⛔ NO VERDICT IS COMPUTED HERE, DELIBERATELY (Paul's call, and it matches baselineView.ts's own
   warning). classifyWinnability was rejected for that view because it grades from ONE run and flips
   between identical runs; a "nothing winnable" verdict would be that sampling problem wearing a
   number's clothes, and it would be making a REFUND decision. This module decides only WHO is
   waiting. What they are shown is counts; the judgement is Paul's.

   ⛔ ALL FIVE BANDS ARE SHOWN, INCLUDING NO RACE. The brief asked for four — ABSENT, ONE ENGINE,
   FRAGILE, HELD — and NO RACE is the one the refund actually turns on: it means no engine answers
   the question locally, so there is nothing to win. ABSENT is its opposite and is the BEST case
   (the race exists and they are invisible: winnable work). A tab hiding NO RACE would omit the
   number the decision needs.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { Band } from './baselineView';
import { isPaidLead } from './leadPayment';

/** Set by the tab's Dismiss. Lives beside `baseline_checked` in outreach_leads.delivery_checklist. */
export const REVIEW_DISMISSED_KEY = 'review_dismissed';
/* ⛔ CONFIRM WRITES THE KEY THE DELIVER CARD ALREADY OWNS, rather than a second one meaning the
   same thing. Two keys for "you have read the baseline" is two surfaces that can disagree about
   whether you have, and the Deliver card would go on showing it unticked. */
export const REVIEW_CONFIRM_KEY = 'baseline_checked';

/** The lead columns this decision reads. Narrow on purpose: nothing here needs the whole row. */
export interface ReviewLead {
  id: string;
  business_name: string | null;
  status: string | null;
  amount_paid: number | null;
  is_archived?: boolean | null;
  baseline_audit_id: string | null;
  full_measure_audit_id: string | null;
  delivery_checklist: Record<string, boolean> | null;
}

/** What we know about one pointed-at audit. `frozenAt` is ai_audits.baseline_completed_at. */
export interface AuditFact { id: string; frozenAt: string | null }

export interface ReviewEntry {
  leadId: string;
  businessName: string;
  baselineAuditId: string;
  fullMeasureAuditId: string;
  /** When the SECOND of the two finished — the moment this became reviewable. Sorts oldest first. */
  readyAt: string;
}

/**
 * Who is waiting on a decision.
 *
 * ⛔ BOTH POINTERS MUST RESOLVE TO A FROZEN AUDIT. `baseline_completed_at` is the ONE definition of
 * done in this codebase — written by a single conditional update in advanceBaseline, and it lands
 * on any multi-run audit — so this reads that one column twice rather than inventing a second
 * meaning of "complete". A pointer that is null, or points at an audit still measuring, is not a
 * client waiting on Paul: it is a client the machine has not finished with.
 *
 * ⛔ LEGACY CLIENTS NEVER APPEAR, AND THAT IS THE CORRECT ANSWER, NOT A GAP. RG and Ronnie predate
 * audit_purpose, so the claim trigger never fired for them and full_measure_audit_id is NULL. RG
 * also has TWO measurement audits, so "the measurement audit for this lead" has no enforced answer
 * for him — exactly the ambiguity the baseline pointer was built to stop. Guessing one would put a
 * made-up number in front of a refund decision. They are handled by hand.
 */
export function reviewQueue(
  leads: ReadonlyArray<ReviewLead>,
  audits: Readonly<Record<string, AuditFact>>,
): ReviewEntry[] {
  const out: ReviewEntry[] = [];
  for (const l of leads) {
    /* Paying, live, and not already refunded. isPaidLead is the one test for "is this a paying
       customer" and it already subtracts a refund via the status — a refunded client has no
       decision left to make. */
    if (!isPaidLead(l) || l.is_archived) continue;
    const b = l.baseline_audit_id ? audits[l.baseline_audit_id] : undefined;
    const m = l.full_measure_audit_id ? audits[l.full_measure_audit_id] : undefined;
    if (!b?.frozenAt || !m?.frozenAt) continue;
    const cl = l.delivery_checklist ?? {};
    /* ⛔ EITHER ACTION RETIRES THE ENTRY, AND THEY MEAN DIFFERENT THINGS. Confirm asserts he has
       read it; dismiss asserts only that he does not want to be asked again. Collapsing them into
       one key would make "not now" silently claim the baseline was checked, on the one document
       the refund is measured against. */
    if (cl[REVIEW_CONFIRM_KEY] === true || cl[REVIEW_DISMISSED_KEY] === true) continue;
    out.push({
      leadId: l.id,
      businessName: (l.business_name ?? '').trim() || 'Unnamed client',
      baselineAuditId: l.baseline_audit_id as string,
      fullMeasureAuditId: l.full_measure_audit_id as string,
      readyAt: b.frozenAt > m.frozenAt ? b.frozenAt : m.frozenAt,
    });
  }
  /* Oldest first: the client who has been waiting longest is the one to deal with. */
  return out.sort((a, b) => a.readyAt.localeCompare(b.readyAt) || a.businessName.localeCompare(b.businessName));
}

/** The five bands, worst-first, as the tab prints them. Mirrors BANDS order from baselineView. */
export const REVIEW_BAND_ORDER: Band[] = ['absent', 'one_engine', 'fragile', 'held', 'no_race'];

/* ── THE REFUND, WHICH MOVES NO MONEY ────────────────────────────────────────────────────────────
   ⛔ BOOKKEEPING ONLY, BY PAUL'S EXPLICIT DECISION (2026-09-13): "a button that moves £99 on a
   click is a button I will eventually hit by accident", and he wants the Stripe record to be the
   thing he did deliberately. The other half is stripe-webhook's charge.refunded handler: when he
   refunds in Stripe, the app finds out within seconds. The two converge on ONE record.
   ⚠️ `amount_paid` IS NEVER CLEARED — it is the record of what was charged, and isPaidLead already
   subtracts a refund through the status. Zeroing it would make a refund indistinguishable from a
   lead that never paid.
   ⛔ AND THE POINTERS ARE NEVER CLEARED EITHER. baseline_audit_id is what stopped
   ensureBaselinesForPaidOnboardings buying a fresh baseline — the onboarding row still says `paid`
   after a refund, by design. startPaidBaseline now refuses a refunded lead outright, so the pointer
   is no longer the only thing standing in the way, but clearing it would still be wrong: it is the
   record of what the refund was measured against. */
export interface RefundPatch {
  status: 'refunded';
  refunded_at: string;
  refund_reason: string;
  refund_amount_gbp: number | null;
}

export function refundPatch(lead: Pick<ReviewLead, 'amount_paid'>, reason: string, nowIso: string): RefundPatch {
  return {
    status: 'refunded',
    refunded_at: nowIso,
    /* A refund with no story is what Paul said is no good in three months. The UI requires one. */
    refund_reason: reason.trim(),
    refund_amount_gbp: typeof lead.amount_paid === 'number' && lead.amount_paid > 0 ? lead.amount_paid : null,
  };
}

/** The reason box is mandatory, and a couple of characters is not a reason. */
export const MIN_REFUND_REASON_CHARS = 10;
export const refundReasonOk = (reason: string): boolean => reason.trim().length >= MIN_REFUND_REASON_CHARS;
