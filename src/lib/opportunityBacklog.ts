/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE OPPORTUNITY BACKLOG — ongoing improvements (Paul, 2026-09-30, docs/baseline-workflow.md).

   Two kinds of measurement, never mixed:
     OFFICIAL BASELINE / RE-MEASURE — the frozen 20, used for the guarantee, apples-to-apples.
     ONGOING OPPORTUNITY CHECKS     — flexible, new questions welcome, used to decide what to improve.
   This module is the second kind. Its rows live in client_opportunities; nothing in the guarantee
   path (remeasure-results, measurementCompare, the replay) reads that table or these checks, and an
   opportunity check is its own Discovery audit, never the baseline or the replay.

   The cycle: find opportunity → choose action → implement → record what changed → wait → recheck →
   record the result → choose the next one.

   Pure, no imports. IMPORTED BY AN EDGE FUNCTION (paid-baseline): relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const OPPORTUNITY_STATUSES = ['new', 'planned', 'in_progress', 'implemented', 'waiting_recheck', 'improved', 'no_change', 'not_pursuing'] as const;
export type OpportunityStatus = typeof OPPORTUNITY_STATUSES[number];
export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  new: 'New', planned: 'Planned', in_progress: 'In progress', implemented: 'Implemented',
  waiting_recheck: 'Waiting for recheck', improved: 'Improved', no_change: 'No change', not_pursuing: 'Not pursuing',
};
/** Work that is live: counted as "active improvements" on the client summary. */
export const ACTIVE_STATUSES: readonly OpportunityStatus[] = ['planned', 'in_progress', 'implemented'];

/* ⛔ THE ACTIONS ARE A CLOSED LIST OF GENUINE WORK, each with why it MAY help. Never fake reviews,
   fake locations, cloned town pages, AI-only text, keyword stuffing, llms.txt as a default, fake
   citations or schema stuffing — none of those is here and none can be saved (normaliseOpportunity
   drops an unknown action). "May", never "will": we cannot see why an engine names a business. */
export const IMPROVEMENT_ACTIONS = [
  { key: 'strengthen_service_page', label: 'Strengthen the existing service page', why: 'A clearer, fuller page about the service may give AI more real information to use when it answers this question.' },
  { key: 'add_service_detail', label: 'Add genuine service detail', why: 'Real detail — what is included, typical jobs, who it is for — can make it easier for AI to match the business to the question.' },
  { key: 'location_evidence', label: 'Improve location evidence', why: 'Genuine proof the business works in this area (jobs done there, the address, the area served) may help AI connect it to the town.' },
  { key: 'internal_linking', label: 'Improve internal linking', why: 'Linking related pages helps crawlers find and understand the relevant page.' },
  { key: 'entity_clarity', label: 'Clarify business / entity information', why: 'Consistent name, address, phone and trade everywhere may reduce doubt about who the business is.' },
  { key: 'case_evidence', label: 'Add genuine project / case evidence', why: 'Real examples of work are evidence the service is offered, and may give AI something concrete to use.' },
  { key: 'structured_data', label: 'Improve structured data (accurately)', why: 'Accurate business and service markup can make facts easier to read. Accurate only — never stuffed.' },
  { key: 'crawlability', label: 'Fix crawlability', why: 'A page that cannot be fetched or rendered cannot be read at all.' },
  { key: 'profile_consistency', label: 'Improve third-party profile consistency', why: 'Directories and profiles that AI may read for this trade should state the same, correct facts; mixed facts can make the business harder to identify.' },
  { key: 'warranted_new_page', label: 'Create a genuinely warranted service / location page', why: 'Only where the business really offers the service or serves the area — a real page, never a cloned town page.' },
] as const;
export type ImprovementAction = typeof IMPROVEMENT_ACTIONS[number]['key'];
export const ACTION_BY_KEY: Record<string, typeof IMPROVEMENT_ACTIONS[number]> = Object.fromEntries(IMPROVEMENT_ACTIONS.map((a) => [a.key, a]));

/** The editable fields, cleaned. Anything unknown is dropped; lengths are capped. */
export interface OpportunityPatch {
  question?: string; service?: string | null; area?: string | null; intent?: string | null;
  evidence_gap?: string | null; suggested_action?: string | null; action_note?: string | null;
  status?: OpportunityStatus; what_changed?: string | null; recheck_due?: string | null;
}
const cap = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : null) || null;

export function normaliseOpportunity(raw: Record<string, unknown>): OpportunityPatch {
  const out: OpportunityPatch = {};
  if (typeof raw.question === 'string' && raw.question.trim()) out.question = raw.question.trim().replace(/\s+/g, ' ').slice(0, 300);
  for (const k of ['service', 'area', 'intent'] as const) if (k in raw) out[k] = cap(raw[k], 120);
  for (const k of ['evidence_gap', 'action_note', 'what_changed'] as const) if (k in raw) out[k] = cap(raw[k], 2000);
  if ('suggested_action' in raw) out.suggested_action = typeof raw.suggested_action === 'string' && ACTION_BY_KEY[raw.suggested_action] ? raw.suggested_action : null;
  if (typeof raw.status === 'string' && (OPPORTUNITY_STATUSES as readonly string[]).includes(raw.status)) out.status = raw.status as OpportunityStatus;
  if ('recheck_due' in raw) out.recheck_due = typeof raw.recheck_due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.recheck_due) ? raw.recheck_due : null;
  return out;
}

/** Counts for the client summary. */
export function backlogCounts(items: Array<{ status: string }>): { total: number; active: number; waiting: number; improved: number } {
  return {
    total: items.filter((i) => i.status !== 'not_pursuing').length,
    active: items.filter((i) => (ACTIVE_STATUSES as readonly string[]).includes(i.status)).length,
    waiting: items.filter((i) => i.status === 'waiting_recheck').length,
    improved: items.filter((i) => i.status === 'improved').length,
  };
}
