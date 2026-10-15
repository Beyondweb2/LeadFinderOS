/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE BATCH-AUDIT PLAN — who gets audited, in what order, at what cost, and whether that fits.
   Pure and dependency-light so scripts/audit-batch-plan.test.ts can drive the real decision rather
   than a restatement of it: this is the module that decides how much money a press spends.

   ⛔ IT DOES NOT DECIDE WHO IS ELIGIBLE. That rule lives in OutreachTable (a lead with a business
   type, a location, and NO existing audit) and is deliberately untouched here — this module takes
   the already-eligible list and answers "which of them, in what order, and can we afford it".
   Splitting the ALREADY-audited leads into completed / failed / in-progress is presentation only:
   none of them re-enter the batch, exactly as before.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** The per-lead fields this module needs. A structural type so the caller's row satisfies it. */
export interface BatchLead {
  id: string;
  /** The lead's added-date — outreach_leads.created_at. The oldest-first sort key. */
  created_at?: string | null;
  website?: string | null;
}

/** How an already-audited lead's newest run ended. Mirrors ai_audit_runs.status. */
export type AuditRunState = 'complete' | 'capped' | 'failed' | 'pending' | 'running';

export interface AlreadyAuditedSplit {
  /** complete OR capped — a usable audit. "Genuinely done". */
  completed: number;
  /** failed — the audit ran and died. Still excluded from the batch (unchanged), now VISIBLE. */
  failed: number;
  /** pending/running — in flight right now. */
  inProgress: number;
  total: number;
}

/**
 * Split the selected leads that already hold an audit, by how their newest run ended.
 * ⚠️ An UNRECOGNISED or absent status counts as `inProgress`, never as `completed`: calling an
 * unknown state "done" is the absent-value fault pointed at the one number that says whether work
 * still needs doing (CLAUDE.md §6).
 */
export function splitAlreadyAudited(
  selectedIds: Iterable<string>,
  auditsByLead: Record<string, { status?: string | null } | undefined>,
): AlreadyAuditedSplit {
  let completed = 0, failed = 0, inProgress = 0;
  for (const id of selectedIds) {
    const st = auditsByLead[id]?.status;
    if (st === undefined) continue;            // no audit at all — not in this split
    if (st === 'complete' || st === 'capped') completed++;
    else if (st === 'failed') failed++;
    else inProgress++;
  }
  return { completed, failed, inProgress, total: completed + failed + inProgress };
}

/**
 * Eligible leads in the order they will be audited: OLDEST-ADDED FIRST, so a lead that has sat in
 * the CRM for months is audited before one added this morning.
 * ⚠️ A MISSING created_at SORTS LAST, not first. Treating an unknown date as epoch-zero would put
 * every date-less lead at the front of every batch and starve the real backlog — the opposite of
 * what "oldest first" is for. `id` is the tiebreaker so the order is stable across renders.
 */
export function oldestFirst<T extends BatchLead>(leads: readonly T[]): T[] {
  const key = (l: T) => {
    const t = Date.parse(l.created_at ?? '');
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  return [...leads].sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id));
}

export interface BatchCost {
  /** Leads in the run. */
  leads: number;
  /** The MOST the questions can cost: leads × the picked question count × the per-question rate. */
  questionsUsd: number;
  /** Same figure — a hook audit buys no site scan, so there is nothing to add (2026-10-15). */
  totalUsd: number;
}

/**
 * What this run costs AT MOST — computed over the leads ACTUALLY in it, never scaled from an average.
 *
 * ⛔ A HOOK AUDIT RUNS NO SITE SCAN (2026-10-15). The estimate used to add a scan per lead with an own website;
 * create-ai-audit skips the scan for every purpose but a paid baseline (seoScanAllowed), so that line was
 * money the press never spends. It is gone, with the rate and the own-website test that fed it.
 * ⛔ AND IT IS A CEILING. Questions are asked one at a time and stop at the first answer that does not name the
 * lead, so the real bill is usually below this: `questionsPerLead` is the MOST a lead can be asked.
 */
export function estimateBatchCost(
  leads: readonly BatchLead[],
  questionsPerLead: number,
  rates: { usdPerQuestion: number },
): BatchCost {
  const q = Math.max(0, questionsPerLead);
  const questionsUsd = leads.length * q * rates.usdPerQuestion;
  return { leads: leads.length, questionsUsd, totalUsd: questionsUsd };
}

export interface BudgetVerdict {
  /** null = we could not read the figure. NEVER rendered as "fine" — see `unknown`. */
  remainingUsd: number | null;
  /** True when the run's cost exceeds what is left. */
  exceeds: boolean;
  /** True when the figure is unavailable, so the caller can say so rather than imply headroom. */
  unknown: boolean;
}

/**
 * Does `costUsd` fit inside `remainingUsd`?
 * ⛔ AN UNREADABLE BUDGET IS `unknown`, NOT `exceeds: false`. A missing Apify snapshot must never
 * render as "you have room" — that is the absent-value fault on a spend guard. The caller shows a
 * "couldn't check" line instead of a green one, and nothing is blocked (a snapshot outage must not
 * stop the operator working).
 */
export function budgetVerdict(costUsd: number, remainingUsd: number | null | undefined): BudgetVerdict {
  if (remainingUsd == null || !Number.isFinite(remainingUsd)) {
    return { remainingUsd: null, exceeds: false, unknown: true };
  }
  return { remainingUsd, exceeds: costUsd > remainingUsd, unknown: false };
}

/** Apify monthly headroom from the usage snapshot. Null when either half is missing. */
export function monthlyRemainingUsd(
  usage: { monthlyUsageUsd?: number | null; maxMonthlyUsageUsd?: number | null } | null | undefined,
): number | null {
  const used = usage?.monthlyUsageUsd;
  const cap = usage?.maxMonthlyUsageUsd;
  if (used == null || cap == null || !Number.isFinite(used) || !Number.isFinite(cap)) return null;
  return Math.max(0, cap - used);
}

export interface TakeVerdict {
  /** The number actually used — clamped to [0, eligible] and to the job cap. */
  take: number;
  /** True when the typed number was above the job cap, so the UI can SAY SO rather than truncate. */
  overCap: boolean;
  /** True when the typed number was above the eligible count. */
  overEligible: boolean;
}

/**
 * Resolve the operator's typed "audit this many" against the eligible count and the job cap.
 * ⛔ OVER THE CAP IS REPORTED, NOT SILENTLY TRUNCATED. bulk-jobs REFUSES a create above the cap
 * outright ("Too many leads — max N per audit job"), so a UI that quietly clamped would either
 * hide a refusal or promise a run size the server will reject. The flag exists so the dialog can
 * say which it is before anything is pressed.
 */
export function resolveTake(typed: number | null | undefined, eligible: number, jobCap: number): TakeVerdict {
  const n = Number(typed);
  const wanted = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return {
    take: Math.max(0, Math.min(wanted, eligible, jobCap)),
    overCap: wanted > jobCap,
    overEligible: wanted > eligible,
  };
}
