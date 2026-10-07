/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NO VALID COMPLETED AUDIT → NO CALL SCRIPT (Paul, 2026-10-07).

   The lead popup opens whatever state the prospect check is in, but the call script (and the voice note
   built from the same evidence) is shown ONLY when this lead has a completed, usable AI check. Before that,
   the Call tab says "Run the prospect check before using the call script" and points at the check's own
   controls (LeadHookPanel, the top of the Call tab).

   ⛔ THE GATE IS POSITIVE. It shows the script only on every one of:
        · the playbook's AI check reads `ready` (coldCallPlaybook.callCardAudit — the same reading the top of
          the call screen and the "Check before calling" results use),
        · it came from an audit (auditId) and that audit belongs to THIS lead (auditLeadId === leadId),
        · the result holds real evidence (evidence.kind is not 'none').
      Everything else — no playbook yet, no audit, queued, pending, running, failed, cancelled, a run with no
      result, an audit of another lead — is "no script". Never branch on the bad states and let `else` show it.
   ⛔ WHICH AUDIT is not decided here: resolveLeadReportAudit (auditReportResolver.ts) already chose it — newest
      usable audit of this lead, an older usable one still counting while a newer one runs. The age rule is the
      playbook's own: an answer older than PLAYBOOK_AUDIT_STALE_DAYS still shows the script, with the warning and
      the "When I checked…" wording. This file adds no second freshness rule.
   ⛔ PURE, relative imports with an explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { RUN_USABLE } from './queueAuditStatus.ts';

/** Where this lead's newest prospect check has got to — only for the words on the locked screen. */
export type CallAuditProgress = 'none' | 'queued' | 'running' | 'failed' | 'cancelled' | 'complete';

export interface ProgressAuditRow {
  id: string;
  lead_id: string | null;
  created_at: string | null;
  ai_audit_runs?: Array<{ status: string | null }> | null;
}

const RUNNING = new Set(['running', 'processing']);
const QUEUED = new Set(['pending', 'queued']);

/** The newest audit of THIS lead, read for its progress. Another lead's audit is never read. */
export function callAuditProgress(audits: readonly ProgressAuditRow[], leadId: string): CallAuditProgress {
  const mine = audits.filter((a) => a.lead_id === leadId).sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb !== ta ? tb - ta : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  const newest = mine[0];
  if (!newest) return 'none';
  const runs = (Array.isArray(newest.ai_audit_runs) ? newest.ai_audit_runs : []).map((r) => String(r.status));
  if (runs.some((s) => RUN_USABLE.has(s))) return 'complete';
  if (runs.some((s) => RUNNING.has(s))) return 'running';
  if (!runs.length || runs.some((s) => QUEUED.has(s))) return 'queued';
  if (runs.every((s) => s === 'cancelled')) return 'cancelled';
  if (runs.every((s) => s === 'failed' || s === 'cancelled')) return 'failed';
  return 'queued'; // a status nobody recognises: not finished — never "complete"
}

/** What the gate reads from a built playbook (structural, so ColdCallPlaybook fits). */
export interface GatePlaybook {
  audit: { state: 'ready' | 'running' | 'none' };
  auditId: string | null;
  auditLeadId: string | null;
  auditProgress: CallAuditProgress;
  evidence: { kind: 'gap' | 'named' | 'none' };
}

export type CallScriptLockReason = 'no_audit' | 'queued' | 'running' | 'failed' | 'cancelled' | 'no_result' | 'wrong_lead';

/** show: true carries no reason; show: false always carries the reason and its words. */
export interface CallScriptGate { show: boolean; reason: CallScriptLockReason | null; title: string; detail: string }

/** The one heading of the locked state. */
export const CALL_SCRIPT_LOCKED_TITLE = 'Run the prospect check before using the call script';

const DETAIL: Record<CallScriptLockReason, string> = {
  no_audit: 'This lead has no AI check yet. Run it from the AI result at the top of the Call tab. The script appears here when the result is in.',
  queued: 'The AI check is waiting to start. The script appears here when the result is in.',
  running: 'The AI check is running. The script appears here when the result is in, usually a few minutes.',
  failed: 'The last AI check did not finish. Run a new check from the AI result at the top of the Call tab.',
  cancelled: 'The last AI check was cancelled. Run a new check from the AI result at the top of the Call tab.',
  no_result: 'The AI check finished without a result the script can use. Run a new check from the AI result at the top of the Call tab.',
  wrong_lead: 'The AI result on file does not belong to this lead. Run a check for this lead from the AI result at the top of the Call tab.',
};

export function callScriptGate(leadId: string, p: GatePlaybook | null | undefined): CallScriptGate {
  if (p && p.audit.state === 'ready' && !!p.auditId && p.auditLeadId === leadId && p.evidence.kind !== 'none') return { show: true, reason: null, title: '', detail: '' };
  const reason: CallScriptLockReason = !p ? 'no_audit'
    : p.auditId && p.auditLeadId !== leadId ? 'wrong_lead'
    : p.auditProgress === 'queued' ? 'queued'
    : p.auditProgress === 'running' || p.audit.state === 'running' ? 'running'
    : p.auditProgress === 'failed' ? 'failed'
    : p.auditProgress === 'cancelled' ? 'cancelled'
    : p.auditProgress === 'complete' || p.auditId ? 'no_result'
    : 'no_audit';
  return { show: false, reason, title: CALL_SCRIPT_LOCKED_TITLE, detail: DETAIL[reason] };
}

/** Re-read the playbook while the script is locked on a check that is still going, so it appears by itself. */
export const CALL_SCRIPT_RECHECK_MS = 15_000;
export function callScriptRecheckMs(leadId: string, p: GatePlaybook | null | undefined): number | false {
  const g = callScriptGate(leadId, p);
  return !g.show && (g.reason === 'queued' || g.reason === 'running') ? CALL_SCRIPT_RECHECK_MS : false;
}
