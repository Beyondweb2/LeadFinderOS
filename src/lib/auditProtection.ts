/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHICH AUDITS MAY NEVER BE ARCHIVED — the one place that decides.

   ⛔ THE POINT. An audit is not a document, it is a MEASUREMENT, and some measurements are the
   evidence behind a promise we sold. RG Locksmiths' paid baseline is the "before" half of his
   guarantee; losing it means the guarantee cannot be evidenced at all, and there is no backup.
   Until 2026-09-10 nothing distinguished it from a throwaway prospect audit: the same 24px trash
   icon, the same one-line browser confirm, and a DELETE that cascaded the runs and every stored
   answer away with it.

   ⛔ ABSENCE IS NEVER PERMISSION (CLAUDE.md §6, the recurring law). Every field here is
   three-valued — true / false / "could not tell" — and **"could not tell" protects**. A failed
   read of the paying-customer table returns 200 with [] under RLS, which is indistinguishable
   from "this lead has not paid" (CLAUDE.md §8). Treating that silence as permission is exactly
   how the wrong row gets destroyed, so the caller passes `null` when a check could not run and
   this module refuses.

   ⚠️ IT REFUSES, IT DOES NOT WARN. Archiving is reversible, so a refusal costs a conversation
   and a wrong archive costs the evidence. The asymmetry decides it. A refusal always names the
   reason — a control that quietly does nothing is worse than one that says no (CLAUDE.md §6c).
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Why an audit is protected. Ordered by how load-bearing the audit is, most first — the UI
 *  shows `reasons[0]`, so the order is what the operator reads. */
export type ProtectionReason =
  | 'paid_baseline'
  | 'locked_measurement'
  | 'measurement'
  | 'paying_customer'
  | 'unknown_paying_status'
  | 'unknown_lock_status';

/** The facts the decision needs. Every one may be `null`, meaning "could not tell" — which
 *  protects. The caller must NOT collapse a failed read into `false`. */
export interface AuditProtectionFacts {
  /** `ai_audits.baseline_target_runs`. Non-null = this audit is a paid baseline: the customer
   *  paid, and this is the measurement their guarantee is written against. */
  baselineTargetRuns: number | null;
  /** `ai_audits.is_measurement`. A before/after measurement — the other half of a comparison. */
  isMeasurement: boolean | null;
  /** Does this audit's lead have `amount_paid > 0`? (CLAUDE.md §6: paid means amount_paid > 0.)
   *  `null` = the check did not run or failed. An audit with no lead at all is `false`, not
   *  `null` — "no lead" is a known answer, not an unknown one. */
  leadIsPaying: boolean | null;
  /** Is there a `measurement_locks` row for this business name? (CLAUDE.md §17.) A locked
   *  measurement's question set is the agreed like-for-like; the audit it was taken from is the
   *  reference. `null` = the check did not run or failed. */
  hasMeasurementLock: boolean | null;
}

export interface ProtectionVerdict {
  /** True = refuse to archive. */
  isProtected: boolean;
  /** Every reason that applies, most load-bearing first. Empty when not protected. */
  reasons: ProtectionReason[];
  /** True when protection comes only from a check that could not run, rather than from a
   *  positive fact. Lets the UI say "could not verify" instead of asserting something false. */
  uncertain: boolean;
}

/** Plain-English wording for each reason. The UI never builds this text itself, so the refusal
 *  reads identically wherever it appears. */
export const PROTECTION_WORDING: Record<ProtectionReason, string> = {
  paid_baseline:
    'This is a paid baseline — the "before" measurement a customer\'s guarantee is written against.',
  locked_measurement:
    'This business has a locked measurement, and this audit is part of that like-for-like set.',
  measurement:
    'This is a before/after measurement. Archiving it would break the comparison it belongs to.',
  paying_customer:
    'This audit belongs to a paying customer.',
  unknown_paying_status:
    'Could not check whether this audit belongs to a paying customer, so it is being kept.',
  unknown_lock_status:
    'Could not check whether this business has a locked measurement, so it is being kept.',
};

/**
 * Decide whether an audit may be archived.
 *
 * ⛔ Positive facts and failed checks BOTH protect, but they are reported separately so the
 * operator can tell "this is your customer's baseline" from "the database did not answer".
 */
export function auditProtection(facts: AuditProtectionFacts): ProtectionVerdict {
  const reasons: ProtectionReason[] = [];

  /* A paid baseline is the strongest claim and the cheapest to check — it is a column on the
     audit row itself. `> 0` rather than merely non-null: a stored 0 would mean no repeat runs
     were ever targeted, and reading that as a baseline would protect every ordinary audit that
     happened to carry a zero. */
  if (typeof facts.baselineTargetRuns === 'number' && facts.baselineTargetRuns > 0) {
    reasons.push('paid_baseline');
  }

  if (facts.hasMeasurementLock === true) reasons.push('locked_measurement');

  /* Strictly `=== true`. `null` is handled below as uncertainty, never as false. */
  if (facts.isMeasurement === true) reasons.push('measurement');

  if (facts.leadIsPaying === true) reasons.push('paying_customer');

  /* The two "could not tell" cases. They are appended AFTER the positive reasons so that an
     audit which is both provably a baseline and unverifiable on payment still leads with the
     fact rather than with the doubt. */
  const uncertainReasons: ProtectionReason[] = [];
  if (facts.leadIsPaying === null) uncertainReasons.push('unknown_paying_status');
  if (facts.hasMeasurementLock === null) uncertainReasons.push('unknown_lock_status');

  const all = [...reasons, ...uncertainReasons];

  return {
    isProtected: all.length > 0,
    reasons: all,
    /* Uncertain only when nothing positive was found — otherwise the operator is being told a
       real reason and the doubt is noise. */
    uncertain: reasons.length === 0 && uncertainReasons.length > 0,
  };
}

/** The single line the confirm dialog and the toast both show. Leads with the most load-bearing
 *  reason; never empty when protected. */
export function protectionSummary(verdict: ProtectionVerdict): string {
  if (!verdict.isProtected) return '';
  return PROTECTION_WORDING[verdict.reasons[0]];
}
