/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HOW A PAID CLIENT'S SERVICE ENDED — the one rule (2026-10-03).

   A paid client's service can stop before its payments run out. That is recorded ONCE, on the lead:
   outreach_leads.service_terminated_at (+ _reason, _note, _by), written only by paid-client-hub
   `terminate_service`. Every reader that stops future work already keys on service_terminated_at (the
   remeasure firer, the results sender, the weekly check, performance sync, the admin counts, the
   delivery stage). This module says only WHY, so each surface can say it in the right words.

   The reasons (a CHECK on the column, migration 20261006110000):
     · domain_authority_dispute — Findable ended it: a third party credibly disputes the client's
       ownership / authority (terms). Shown as ENDED.
     · client_ended_early — the CLIENT chose to stop before the term ran out (e.g. went back to their old
       website). What they paid is kept; no further payments or delivery. Shown as COMPLETED: nothing
       further needs doing.
   Distinct from: refunded (status 'refunded' — the money went back), a 12 / 6-payment engagement that ran
   its full term (subscriptionEndedByTerm), and a sale that never paid (not a paid client at all).

   ⛔ Ending never marks a delivery stage done: the stage becomes 'ended' and the stage history is left as
      it was. ⛔ Ending never touches money: no refund, no ledger row, no commission change — and a live
      Stripe subscription is cancelled by Paul in Stripe (the app never moves money; he is emailed).
   Pure and edge-reachable (no imports).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const SERVICE_END_REASONS = ['domain_authority_dispute', 'client_ended_early'] as const;
export type ServiceEndReason = (typeof SERVICE_END_REASONS)[number];

export function isServiceEndReason(v: unknown): v is ServiceEndReason {
  return typeof v === 'string' && (SERVICE_END_REASONS as readonly string[]).includes(v);
}

export interface ServiceEndView {
  /** The badge on Paid Clients ("COMPLETED" / "ENDED"). */
  stateLabel: string;
  /** The stage name next to it. */
  stageLabel: string;
  /** The one next step — always nothing to do. */
  next: string;
  /** One line for the client page and the admin. */
  summary: string;
}

const VIEW: Record<ServiceEndReason, ServiceEndView> = {
  client_ended_early: {
    stateLabel: 'COMPLETED',
    stageLabel: 'Completed',
    next: 'Completed — nothing further to do',
    summary: 'Engagement ended early by the client. What they paid is kept; no further payments, delivery, re-measure or monthly updates.',
  },
  domain_authority_dispute: {
    stateLabel: 'ENDED',
    stageLabel: 'Ended',
    next: 'Service ended — nothing to do',
    summary: 'Findable ended the service (domain / authority dispute). Guarantee re-measure and results are off.',
  },
};

/** The view for a lead whose service has ended; null when it has not. An ended lead with an unknown
 *  reason (a value written before this module) reads as ENDED — never as COMPLETED, which is a claim. */
export function serviceEndView(lead: { service_terminated_at?: string | null; service_termination_reason?: string | null }): ServiceEndView | null {
  if (!lead.service_terminated_at) return null;
  return isServiceEndReason(lead.service_termination_reason) ? VIEW[lead.service_termination_reason] : VIEW.domain_authority_dispute;
}
