/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE INBOX'S AI VISIBILITY CARD — which audit it reads and how it scores it (2026-09-25).

   Pure, no React, no Supabase. src/hooks/useHookVisibility.ts loads the rows; this file decides.

   ⛔ THE SCORE IS scoreHookRun (hookScore.ts), CALLED WITH THE REPORT'S OWN RULER: the audit's
   business name, trade and town as the NamedContext. So a result cannot be named here and not
   named on the report, in the 6/6 rule or in the send guard.
   ⛔ COMPETITOR NAMES GO THROUGH THE REPORT'S GATES, PER CELL. The run-level suppression
   (assessCompetitorCleanliness.suppressNames) blanks every list when the run's names are provably
   uncleaned, provable junk is dropped, and the business is never listed as its own rival. Each
   filter works on ONE cell's list. Nothing moves a name from one question or engine to another.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { type HookScore } from './hookScore';
import { resolveLeadReportAudit, type ResolvableAudit } from './auditReportResolver';
import { RUN_USABLE } from './queueAuditStatus';
import { MEASURING_STALL_MS, SETTLED_RUN_STATUSES } from './measuringState';
import { shortReportUrl } from './reportSlug';
import { REPORT_PUBLIC_ORIGIN } from './findableOffer';
/* The audit picker and the scorer moved to the edge-reachable leaf src/lib/auditScore.ts (2026-10-22) so the ai-reply-drafts
   tick stores the SAME score the card shows. Re-exported here so every caller keeps its import. */
import { pickHookAudit, type HookCardAudit } from './auditScore';
export { isOutreachAudit, pickHookAudit, scoreHookAuditForCard, type HookCardAudit, type HookCardScore } from './auditScore';

/** The hook state stored on the run. `results.hook` is selected as a projection by the loader. */
export function hookStateOf(runResults: unknown): unknown {
  return (runResults as { hook?: unknown } | null | undefined)?.hook ?? null;
}

/** Is the run still being worked on? The card keeps refreshing while it is. Once the run is terminal,
 *  anything short of six valid results is INCOMPLETE and stays that way. Polling would never fix it.
 *  ⛔ SETTLED IS A POSITIVE LIST (measuringState.ts, the report's own rule): a status nobody
 *  recognises counts as still in flight, so the card never declares a result final on a state it
 *  could not identify. `processing` (results in, competitors and crawl being written) is in flight. */
export function hookRunInFlight(runStatus: string | null): boolean {
  return !SETTLED_RUN_STATUSES.has(String(runStatus ?? ''));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REPORT STATE FOR THE OPEN CONVERSATION (2026-09-26).

   🔴 WHY THE INBOX SAID "No public report yet — run an audit" BESIDE A VISIBLE RESULT. Two causes,
   both measured on the live project:
     1. The report bar read useInbox's audit cache, which is patched ONLY by realtime events on
        ai_audits / ai_audit_runs. Neither table is in the `supabase_realtime` publication (it holds
        outreach_leads and whatsapp_messages only), so those subscriptions never fire. The bar
        changed only when the window regained focus or something refetched the whole Inbox.
     2. The card scores the queue rows, and the six results land BEFORE the run is released: the run
        stays `processing` while extract-competitors and the crawl finish. So the card could show
        "50% named (3/6)" while the run, and therefore the report, was not ready yet.
   So the bar now reads THIS state, computed from the card's own poll of the lead's audits: one
   read, one clock, and the bar and the card cannot disagree.

   ⛔ "READY" MEANS THE PUBLIC PAGE WILL RENDER A RESULT. The report is rendered live by
   render-audit-report from a usable run (RUN_USABLE), so nothing is "generated" later. It is ready
   the moment the run is complete or capped, and a six-result hook is ready only when it is COMPLETE
   (six valid answers). A v2 run that ended short renders the incomplete notice, not a report.
   ⛔ "OPEN REPORT" OPENS THE REPORT OF THE AUDIT IT NAMES. `ready.auditId` is the audit the link
   resolves; `isCurrent` says whether that is the audit the card is showing. A newer audit that is
   still running never borrows an older audit's link as "ready". The older one is offered separately,
   labelled as the previous report.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface HookReportLink {
  auditId: string;
  shortCode: string | null;
  url: string;
}

export type HookReportState =
  /** The card's audit is still asking. `checked` counts settled results, never a partial score. */
  | { kind: 'running'; checked: number; expected: number; previous: HookReportLink | null }
  /** Every result is in (or the run is being finalised). The report is being prepared. */
  | { kind: 'preparing'; previous: HookReportLink | null }
  /** Preparing for longer than MEASURING_STALL_MS: polling stops and the operator can refresh. */
  | { kind: 'slow'; previous: HookReportLink | null }
  /** A usable report. `isCurrent` = it belongs to the audit the card is showing. */
  | { kind: 'ready'; link: HookReportLink; isCurrent: boolean }
  /** A six-result hook that ended without six valid results: no score, no public report. */
  | { kind: 'incomplete'; previous: HookReportLink | null }
  /** The card's run failed or was cancelled. */
  | { kind: 'failed'; previous: HookReportLink | null }
  /** An older-format check whose run produced nothing usable, so it never had a public report. */
  | { kind: 'historical_no_report'; previous: HookReportLink | null }
  /** No audit at all for this lead. */
  | { kind: 'none' };

export function reportLinkFor(a: { id: string; short_code?: string | null }): HookReportLink {
  const shortCode = a.short_code ?? null;
  return { auditId: a.id, shortCode, url: shortCode ? shortReportUrl(shortCode) : `${REPORT_PUBLIC_ORIGIN}/report/${a.id}` };
}

type ReportAudit = HookCardAudit & ResolvableAudit;

/** The newest usable eligible report among the lead's audits, excluding one audit id. The SAME
 *  resolver the Inbox's report link uses (auditReportResolver.ts), so the rule lives in one place. */
function reportAmong(audits: readonly ReportAudit[], leadId: string, excludeId: string | null): HookReportLink | null {
  const a = resolveLeadReportAudit(audits.filter((x) => x.id !== excludeId), leadId);
  return a ? reportLinkFor(a) : null;
}

export function hookReportState(input: {
  leadId: string;
  audits: readonly ReportAudit[];
  picked: { audit: HookCardAudit; runStatus: string | null; runCreatedAt: string | null } | null;
  score: HookScore | null;
  nowMs?: number;
}): HookReportState {
  const { leadId, audits, picked, score } = input;
  const now = input.nowMs ?? Date.now();
  if (!picked) {
    const any = reportAmong(audits, leadId, null);
    return any ? { kind: 'ready', link: any, isCurrent: true } : { kind: 'none' };
  }
  const previous = reportAmong(audits, leadId, picked.audit.id);
  const status = String(picked.runStatus ?? '');
  const six = score?.shape === 'six';

  if (hookRunInFlight(picked.runStatus)) {
    const started = Date.parse(String(picked.runCreatedAt ?? ''));
    if (Number.isFinite(started) && now - started > MEASURING_STALL_MS) return { kind: 'slow', previous };
    const allIn = !!score && score.expected > 0 && score.valid + score.failed === score.expected;
    if (status === 'processing' || allIn) return { kind: 'preparing', previous };
    return { kind: 'running', checked: score ? score.valid + score.failed : 0, expected: score?.expected ?? 0, previous };
  }
  if (RUN_USABLE.has(status)) {
    // ⛔ A six-result hook is a report only when all six results are valid. Anything less is incomplete.
    if (six && !score?.complete) return { kind: 'incomplete', previous };
    const link = reportAmong(audits, leadId, null) ?? reportLinkFor(picked.audit);
    return { kind: 'ready', link, isCurrent: link.auditId === picked.audit.id };
  }
  // Settled and not usable: failed or cancelled.
  return six ? { kind: 'failed', previous } : { kind: 'historical_no_report', previous };
}

/** Should the card keep polling? Only while the answer can still change on its own: running or
 *  preparing. Ready, failed, incomplete and slow are final until someone acts. */
export function hookStateNeedsPolling(state: HookReportState): boolean {
  return state.kind === 'running' || state.kind === 'preparing';
}
