/* SMS REPLY AUDIT — what a text reply may start, and when it must NOT spend (2026-10-09). Pure; edge-reachable (relative .ts imports only).

   A first text reply runs the SAME "When a prospect replies" rule a WhatsApp reply runs (one stored setting, one once-ever claim per lead in
   whatsapp_auto_replies, drained by reconcileFirstReplyAuditIntents → create-ai-audit). Two differences, both here:
     · THE SMS CHANNEL NEVER SENDS. If the shared setting is "Audit and reply", a text reply still runs the audit only (smsReplyMode).
     · THE CACHE. A lead that already has a usable ordinary/hook check younger than SALES_CHECK_AUDIT_REUSE_DAYS (or one in flight) is not
       audited again: the reply's claim is recorded against THAT audit and nothing is spent (replyAuditSource). The reply path is internal, so it
       never touches a rep's daily "fresh checks" allowance either way; a fresh audit draws from the PROSPECTING pool only (the audit queue
       enforces it — budgetPoolForPurpose('audit') === 'prospecting'), never the paid-client baseline / measurement pools.
   ⛔ Nothing here, or in any audit, changes a lead's sales status. */
import type { AuditKindRow } from './auditKind.ts';
import { AUDIT_RUN_IN_FLIGHT, SALES_CHECK_AUDIT_REUSE_DAYS, isReusableAudit, runIsUsable } from './salesCheck.ts';
import { modeSends, type FirstReplyMode } from './firstReplyMode.ts';

/** The mode a TEXT reply runs under: audit only, whatever the shared setting says about sending. 'off' stays off. */
export function smsReplyMode(mode: FirstReplyMode): FirstReplyMode {
  return modeSends(mode) ? 'audit_only' : mode;
}

export interface ReplyAuditRow extends AuditKindRow { id: string; lead_id?: string | null; created_at?: string | null }
export interface ReplyRunRow { id: string; audit_id: string; status: string | null; created_at: string | null; answered?: number }

export type ReplyAuditSource = { kind: 'cached'; auditId: string } | { kind: 'in_flight'; auditId: string } | { kind: 'fresh' };

const DAY_MS = 86_400_000;
const ms = (iso: string | null | undefined): number => { const t = Date.parse(String(iso ?? '')); return Number.isFinite(t) ? t : NaN; };

/** Which audit does a text reply use? An in-flight check wins (never a second one), then a usable one inside the reuse window, else a fresh one. */
export function replyAuditSource(audits: ReplyAuditRow[], runs: ReplyRunRow[], nowMs: number): ReplyAuditSource {
  const reusable = new Set(audits.filter((a) => isReusableAudit(a)).map((a) => a.id));
  const mine = runs.filter((r) => reusable.has(r.audit_id));
  const newest = (a: ReplyRunRow, b: ReplyRunRow) => (ms(b.created_at) || 0) - (ms(a.created_at) || 0);
  const inFlight = mine.filter((r) => AUDIT_RUN_IN_FLIGHT.has(String(r.status))).sort(newest)[0];
  if (inFlight) return { kind: 'in_flight', auditId: inFlight.audit_id };
  const usable = mine.filter((r) => runIsUsable({ status: r.status, answered: r.answered })).sort(newest)[0];
  if (usable && nowMs - (ms(usable.created_at) || 0) < SALES_CHECK_AUDIT_REUSE_DAYS * DAY_MS) return { kind: 'cached', auditId: usable.audit_id };
  return { kind: 'fresh' };
}
