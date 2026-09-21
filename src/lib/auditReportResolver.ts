/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ONE ANSWER TO "WHAT REPORT SHOULD INBOX SHOW FOR THIS LEAD?" (2026-09-21)

   Before this file, useInbox.ts answered that question FOUR separate times — auditByLeadId (the
   report pill/link), the crawlByLeadId fallback, hasSiteFaultLeadIds, each re-typing its own copy
   of `status === 'complete' || status === 'capped'` and its own "first match wins" loop. Every
   audit-logic change (hook run counts, Discovery run counts, finalisation timing) then had a real
   chance of silently breaking one of the four without touching the others — exactly the "one rule
   in N places" pattern CLAUDE.md §4 already names as a recorded, recurring bug class.

   THE RULE, in one place:
     · newest → oldest, by `created_at` (tie-broken by `id` so two audits sharing a timestamp
       always order the same way regardless of what order the caller's query happened to return
       them in — this must never depend on incidental array/query order);
     · a "usable" run is one in RUN_USABLE (queueAuditStatus.ts) — never a hand-typed literal;
     · the newest audit does not have to be the usable one: if it hasn't settled yet (or never
       will), an OLDER completed audit for the same lead still resolves. A newer audit being created
       or still running must never make an existing usable report disappear;
     · hook stop_reason, executed-question count, run_number and baseline_target_runs are NEVER
       inspected — only whether a run settled usable. A completed audit stays resolvable across every
       legitimate shape difference between hook / Discovery / baseline / measurement runs;
     · PURPOSE gates only what render-audit-report itself already refuses: `isInternalMeasurement`
       (auditKind.ts) — a Full Measurement / day-28 replay is an OPERATOR document that 403s at the
       public URL, so Inbox must never resolve one as "the report" (that would be a link the resolver
       calls valid and the renderer calls forbidden). Nothing else is excluded: an ordinary audit, a
       free check, a paid baseline, a Discovery scan and a hook are all reportable — the existing
       purpose taxonomy already decided that, this file only imports the one predicate that says so.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { auditKind, type AuditKindRow } from './auditKind';
import { RUN_USABLE } from './queueAuditStatus';

export interface ResolvableRun {
  status: string | null;
}

/** The columns any resolver function here reasons about. `AuditKindRow` brings the purpose/
 *  contract columns `auditKind` needs; deliberately narrow beyond that, same discipline as
 *  `AuditKindRow` itself — a caller cannot pass a whole row and have an unrelated column start
 *  mattering by accident. */
export interface ResolvableAudit extends AuditKindRow {
  id: string;
  lead_id: string | null;
  short_code: string | null;
  created_at: string | null;
  ai_audit_runs?: ResolvableRun[] | null;
}

export interface LeadReport {
  auditId: string;
  shortCode: string | null;
}

function hasUsableRun(audit: Pick<ResolvableAudit, 'ai_audit_runs'>): boolean {
  const runs = Array.isArray(audit.ai_audit_runs) ? audit.ai_audit_runs : [];
  return runs.some((r) => RUN_USABLE.has(String(r.status)));
}

/** Inbox-eligible purposes: everything EXCEPT a Full Measurement / day-28 replay. Reuses the same
 *  predicate render-audit-report, the Baseline screen and AuditPills already key on — see the file
 *  header for why a measurement must never be resolved here. */
function isInboxEligible(audit: AuditKindRow): boolean {
  return auditKind(audit) !== 'measurement';
}

/** Deterministic newest-first. Never trust the caller's query order — sort here, always. */
function byNewestFirst(a: ResolvableAudit, b: ResolvableAudit): number {
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (tb !== ta) return tb - ta;
  // Tie-break on id so two audits sharing a created_at millisecond still resolve the same way
  // on every call, not whichever the last unstable sort happened to leave first.
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function auditsForLead<T extends ResolvableAudit>(audits: readonly T[], leadId: string): T[] {
  return audits.filter((a) => a.lead_id === leadId).sort(byNewestFirst);
}

/** The newest USABLE audit for a lead, with no purpose filtering — for callers that reason about
 *  "has this lead's site been crawled/checked" rather than "what report should I show them"
 *  (crawlByLeadId's fallback, hasSiteFaultLeadIds): a measurement's crawl result is still real site
 *  data even though its report link must never be handed to the lead. */
export function newestUsableAudit<T extends ResolvableAudit>(audits: readonly T[], leadId: string): T | null {
  return auditsForLead(audits, leadId).find(hasUsableRun) ?? null;
}

/** The audit whose report Inbox should show for this lead — newest eligible usable audit, falling
 *  through to an older one when the newest hasn't settled (or never will). Null when none has. */
export function resolveLeadReportAudit<T extends ResolvableAudit>(audits: readonly T[], leadId: string): T | null {
  return auditsForLead(audits, leadId).filter(isInboxEligible).find(hasUsableRun) ?? null;
}

export function resolveLeadReport(audits: readonly ResolvableAudit[], leadId: string): LeadReport | null {
  const a = resolveLeadReportAudit(audits, leadId);
  return a ? { auditId: a.id, shortCode: a.short_code ?? null } : null;
}

/** All leads at once, for useInbox's per-render map — same rule, one pass over the full audit list
 *  instead of one full re-scan per lead. */
export function resolveReportsByLead(audits: readonly ResolvableAudit[]): Record<string, LeadReport> {
  const byLead = new Map<string, ResolvableAudit[]>();
  for (const a of audits) {
    if (!a.lead_id || !isInboxEligible(a)) continue;
    (byLead.get(a.lead_id) ?? byLead.set(a.lead_id, []).get(a.lead_id)!).push(a);
  }
  const out: Record<string, LeadReport> = {};
  for (const [leadId, group] of byLead) {
    const usable = group.sort(byNewestFirst).find(hasUsableRun);
    if (usable) out[leadId] = { auditId: usable.id, shortCode: usable.short_code ?? null };
  }
  return out;
}
