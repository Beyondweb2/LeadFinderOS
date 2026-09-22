/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS REPORT A PAID BASELINE OR A PAID REMEASUREMENT? — the one rule, in one leaf.

   It exists because the customer-facing report renderer had no way to tell these two apart from a
   Discovery scan, a hook audit or an ordinary re-audit: every one of them arrived as the same
   payload and got the same top section. The paid documents are the only two a CLIENT reads as
   "where I stand / where I got to", and they are the only two that get the percentage-first header.

   ⛔ A POSITIVE ALLOWLIST ON THE PURPOSE THE WRITER RECORDED. `audit_purpose` is 'baseline' for a
   paid baseline and 'remeasure' for the day-28 replay (auditKind.ts — those two spellings are
   load-bearing in SQL as well as in code). A purpose that is RECORDED and is anything else —
   'discovery', 'free_check', 'audit', 'measurement', 'market' — returns null and keeps the report
   exactly as it renders today. Absence is never an answer here: an unrecorded purpose does NOT fall
   through to "probably a baseline".

   ⚠️ AND THE LEAD'S CLAIM COVERS THE LEGACY ROWS. `audit_purpose` only exists from 2026-09-12, so
   the three clients who paid before it (RG, Ronnie's, SC) carry NULL on their baseline audits. Their
   reports are paid baselines and should read like one. `outreach_leads.baseline_audit_id` and
   `remeasure_audit_id` are claimed by DB TRIGGERS and are immutable once set, so a lead pointing at
   an audit IS the claim — the same rule welcomePackData.ts already resolves a client's pack from.
   ⛔ THE RECORDED PURPOSE STILL WINS WHEN THE TWO DISAGREE. If a row says 'discovery' and something
   has nonetheless claimed it, that is a fault to see rather than to paper over, and the safe
   direction is the presentation that is already live.

   ⛔ NOT KEYED ON MONEY. `amount_paid` is deliberately not read: SC Plumbing was refunded, and a
   refund must not silently change how their existing report renders. The purpose is the marker.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { BASELINE_AUDIT_PURPOSE, REMEASURE_AUDIT_PURPOSE } from './auditKind.ts';

/** The two report kinds that get the percentage-first header. Everything else is null. */
export type PaidReportKind = 'baseline' | 'remeasure';

export interface PaidReportKindInput {
  /** The audit being rendered. */
  auditId?: string | null;
  /** `ai_audits.audit_purpose`. NULL on every row written before 2026-09-12. */
  auditPurpose?: string | null;
  /** `outreach_leads.baseline_audit_id` for the lead this audit belongs to, if any. */
  leadBaselineAuditId?: string | null;
  /** `outreach_leads.remeasure_audit_id` for the lead this audit belongs to, if any. */
  leadRemeasureAuditId?: string | null;
}

const same = (a: unknown, b: unknown) => {
  const x = String(a ?? '').trim();
  return !!x && x === String(b ?? '').trim();
};

/**
 * 'baseline' | 'remeasure' for the two paid client documents, null for everything else.
 *
 * Every other audit type — Discovery, hook, free check, ordinary re-audit, market, and any audit
 * with no recorded purpose that no lead claims — returns null and renders exactly as it does today.
 */
export function paidReportKind(input: PaidReportKindInput): PaidReportKind | null {
  const purpose = String(input.auditPurpose ?? '').trim();

  /* 1) The writer said what it was for. Trust that, in both directions. */
  if (purpose === BASELINE_AUDIT_PURPOSE) return 'baseline';
  if (purpose === REMEASURE_AUDIT_PURPOSE) return 'remeasure';
  if (purpose) return null;   // recorded as something else → not one of ours, whatever claims it

  /* 2) No purpose recorded (legacy). The lead's claim is the evidence. */
  if (same(input.auditId, input.leadRemeasureAuditId)) return 'remeasure';
  if (same(input.auditId, input.leadBaselineAuditId)) return 'baseline';
  return null;
}
