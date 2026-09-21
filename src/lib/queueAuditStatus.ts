/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHERE A QUEUED LEAD'S AUDIT HAS GOT TO — for the send-order list in the queue panel.

   🔴 WHY THE OPERATOR NEEDS THIS ON SCREEN. A lead queued for an audit-class template
   (audit_result_hook, audit_reply) CANNOT send until its audit completes: the message carries the
   report link, and templateBodyParams refuses to build it without one. That guard is correct, but
   from the panel a lead waiting on its audit looked identical to a lead that was stuck — same row,
   same position, no explanation. Sixteen of them sat like that.

   ⛔ THIS FILE DECIDES NOTHING ABOUT SENDING OR SPENDING. It reads stored rows and returns a label.
   The real decisions live server-side in _shared/outreach-audit.ts (what to audit) and in the drip
   (what may send); duplicating either here is how a UI starts disagreeing with the thing it
   describes. If this ever seems to need a threshold or a cost, it is being asked the wrong question.

   ⚠️ WHICH TEMPLATES NEED AN AUDIT COMES FROM WA_TEMPLATE_REQS, not from a list here. That table is
   already the SPA's one answer to that question (it drives the per-template send guards), so a new
   audit-class template shows a pill automatically.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { WA_TEMPLATE_REQS } from './whatsappTemplates';

/** A run that means the audit produced something usable. `capped` counts: resolveAuditReplyVars
 *  accepts it, so a capped run can genuinely send.
 *  ⛔ THE ONE DEFINITION — exported so `auditReportResolver.ts` and every other "is this run done"
 *  check reads the same two strings instead of re-typing the literal (CLAUDE.md §4, "one rule
 *  written in N places"). */
export const RUN_USABLE = new Set(['complete', 'capped']);
/** Settled but produced nothing. */
const RUN_DEAD = new Set(['failed', 'cancelled']);

export type QueueAuditStatus =
  /** This template needs no audit — show nothing. */
  | 'not_needed'
  /** A usable audit exists; the lead can send as soon as the drip reaches it. */
  | 'ready'
  /** An audit exists and has not settled — the lead is waiting, not broken. */
  | 'running'
  /** Audits were attempted and none produced anything usable. */
  | 'failed'
  /** No audit at all yet. The audit-ahead pass will start one when a slot frees. */
  | 'none';

export interface AuditRowForStatus {
  lead_id: string | null;
  /** Supabase embed. ABSENT (undefined) is treated as "not settled", never as "usable" — an audit
   *  row whose runs we cannot see must not read as ready. */
  ai_audit_runs?: Array<{ status: string | null }> | null;
}

/**
 * The audit status of one queued lead.
 *
 * ⛔ `ready` REQUIRES POSITIVE EVIDENCE — a run whose status is in RUN_USABLE. Every other shape,
 * including an audit row with no runs visible and a status string nobody recognises, resolves to
 * `running` or `failed`, never to `ready`. Getting that backwards would paint a lead as sendable
 * while the drip goes on refusing it, which is worse than no pill at all: the operator would be
 * looking for a bug in the sender.
 */
export function auditStatusFor(
  template: string | null | undefined,
  auditsForLead: AuditRowForStatus[],
): QueueAuditStatus {
  const needs = template ? WA_TEMPLATE_REQS[template]?.needsAudit === true : false;
  if (!needs) return 'not_needed';
  if (!auditsForLead.length) return 'none';

  let sawUnsettled = false;
  for (const a of auditsForLead) {
    const runs = Array.isArray(a.ai_audit_runs) ? a.ai_audit_runs : null;
    if (runs && runs.some((r) => RUN_USABLE.has(String(r.status)))) return 'ready';
    // No runs yet, runs we cannot read, or runs still going — all "not finished", not "dead".
    if (!runs || !runs.length || runs.some((r) => !RUN_USABLE.has(String(r.status)) && !RUN_DEAD.has(String(r.status)))) {
      sawUnsettled = true;
    }
  }
  return sawUnsettled ? 'running' : 'failed';
}

export interface StatusPresentation {
  label: string;
  /** Tailwind classes for the pill. Muted by default — this is an annotation, not an alarm. */
  className: string;
  title: string;
}

/* ⚠️ THE WORDING SAYS WHAT HAPPENS NEXT, not just what the state is. "No audit" alone reads as a
   fault the operator has to fix; the tooltip says one gets started automatically, which is what
   stops a waiting queue looking like a broken one. */
export const AUDIT_STATUS_PRESENTATION: Record<Exclude<QueueAuditStatus, 'not_needed'>, StatusPresentation> = {
  ready: {
    label: 'audit ready',
    className: 'text-emerald-400/80',
    title: 'This lead has a completed audit, so it can send when the queue reaches it.',
  },
  running: {
    label: 'audit running',
    className: 'text-amber-400/80',
    title: 'Its audit is running. The lead stays queued and sends as soon as the audit finishes.',
  },
  none: {
    label: 'no audit',
    className: 'text-muted-foreground/60',
    title: 'No audit yet. One is started automatically when an audit slot frees up (3 run at a time).',
  },
  failed: {
    label: 'audit failed',
    className: 'text-destructive/80',
    title: 'Its audits did not complete. It will drop out of the queue with a reason rather than send a message with no link.',
  },
};
