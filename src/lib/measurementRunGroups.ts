/* ════════════════════════════════════════════════════════════════════════════════════════════════
   GROUPING RUNS INTO MEASUREMENTS — so "all 3 runs of 11 Aug" is one thing you can tick.

   ⛔ WHY THE GROUP IS (AUDIT × DAY) AND NOT JUST THE AUDIT. Grouping by audit alone is the obvious
   choice and it is wrong on real data: RG's measurement audit f0aaa9cd carries FIVE runs — three
   on 26 Aug (the measurement as designed) plus single runs appended on 1 Sep and 8 Sep. Grouping
   by audit would offer those five as one block, so ticking "the 26 Aug measurement" would silently
   drag in two later runs and compare a date against itself. Grouping by day alone is wrong the
   other way: two different audits measured on one day are two different question sets.

   ⛔ AND THE RUN COUNT IS THE POINT, NOT DECORATION. A side built from ONE run gives two answer
   cells per question, which is below MIN_CELLS_FOR_QUESTION_CLAIM — so every row reads "unproven"
   however large the movement, and the operator has no way to see why from a list of #1 #2 #3.
   That is exactly what happened: a 3-run day was compared against a 1-run day and the whole
   screen read "within noise", which was read as a broken run-count config. The group carries its
   run count, and `shortfall` says when it holds fewer runs than the audit was configured for.

   PURE. No React, no Supabase — the shapes are structural so a test can drive it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** What the grouper needs about one run. Structural: matches the run rows both views already hold. */
export interface RunForGrouping {
  id: string;
  audit_id: string;
  run_number: number;
  created_at: string;
  /** Questions in this run — used for the group's question count, not for grouping. */
  questions?: number;
}

/** What the grouper needs about the audits those runs belong to. */
export interface AuditForGrouping {
  id: string;
  /** How many runs this audit was configured to make. null/0/1 all mean "a single run". */
  baseline_target_runs?: number | null;
  is_measurement?: boolean | null;
}

export interface MeasurementGroup {
  /** Stable key: audit id + day. Safe as a React key and as a persisted selection id. */
  key: string;
  auditId: string;
  /** YYYY-MM-DD, the day every run in this group was measured. */
  day: string;
  runIds: string[];
  runNumbers: number[];
  /** Runs in this group — the number that decides whether a claim is provable. */
  runCount: number;
  /** Distinct questions asked, taken as the max across the group's runs. */
  questions: number;
  /** Answer cells per question this side would contribute, at two scored engines. */
  cellsPerQuestion: number;
  /** The audit's configured run target, when it has one. */
  targetRuns: number | null;
  /** True when this group holds FEWER runs than its audit was configured to make. */
  shortfall: boolean;
  /** True when the audit is a measurement (or a paid baseline, which repeats too). */
  isMeasurement: boolean;
  /** Earliest run timestamp, for ordering. */
  firstAt: string;
}

/** Two engines are scored (chatgpt, gemini) — see SCORED_ENGINES in auditReport. One run of one
 *  question therefore yields two answer cells, and that arithmetic is what the noise band was
 *  measured against. */
export const CELLS_PER_RUN = 2;

const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * Group runs into measurement sessions, oldest first.
 *
 * ⚠️ A run whose audit is not in `audits` still groups. It gets `targetRuns: null` and never a
 * shortfall — absence is not evidence of a missing run (the audit simply was not fetched), and
 * flagging it would put a warning on a group that may be perfectly complete.
 */
export function groupMeasurementRuns(
  runs: RunForGrouping[],
  audits: AuditForGrouping[] = [],
): MeasurementGroup[] {
  const auditById = new Map(audits.map((a) => [a.id, a]));
  const buckets = new Map<string, RunForGrouping[]>();
  for (const r of runs) {
    if (!r.id || !r.audit_id || !r.created_at) continue;
    const key = `${r.audit_id}:${dayOf(r.created_at)}`;
    const list = buckets.get(key);
    if (list) list.push(r); else buckets.set(key, [r]);
  }

  const out: MeasurementGroup[] = [];
  for (const [key, list] of buckets) {
    const sorted = [...list].sort((a, b) => a.run_number - b.run_number || a.created_at.localeCompare(b.created_at));
    const audit = auditById.get(sorted[0].audit_id);
    const target = Number(audit?.baseline_target_runs ?? 0) > 1 ? Number(audit!.baseline_target_runs) : null;
    const runCount = sorted.length;
    out.push({
      key,
      auditId: sorted[0].audit_id,
      day: dayOf(sorted[0].created_at),
      runIds: sorted.map((r) => r.id),
      runNumbers: sorted.map((r) => r.run_number),
      runCount,
      questions: sorted.reduce((m, r) => Math.max(m, r.questions ?? 0), 0),
      cellsPerQuestion: runCount * CELLS_PER_RUN,
      targetRuns: target,
      /* Only a KNOWN target can be fallen short of. */
      shortfall: target !== null && runCount < target,
      isMeasurement: audit?.is_measurement === true || target !== null,
      firstAt: sorted.map((r) => r.created_at).sort()[0],
    });
  }
  out.sort((a, b) => a.firstAt.localeCompare(b.firstAt) || a.auditId.localeCompare(b.auditId));
  return out;
}

/** "3 runs · 12 questions · 6 answer cells per question" — the line that makes a 1-run side obvious. */
export function describeGroup(g: MeasurementGroup): string {
  const runs = `${g.runCount} run${g.runCount === 1 ? '' : 's'}`;
  const qs = g.questions ? ` · ${g.questions} question${g.questions === 1 ? '' : 's'}` : '';
  return `${runs}${qs} · ${g.cellsPerQuestion} answer cell${g.cellsPerQuestion === 1 ? '' : 's'} per question`;
}

/**
 * Is a side strong enough for per-question claims?
 *
 * Mirrors MIN_CELLS_FOR_QUESTION_CLAIM (4) in measurementCompare — deliberately restated as a
 * question about the SELECTION rather than imported as a rule about the RESULT, so the picker can
 * warn BEFORE the money is spent and the comparison read. The two are pinned equal by the test.
 */
export function sideProvable(cellsPerQuestion: number): boolean {
  return cellsPerQuestion >= 4;
}

/** Cells per question a whole side contributes, given the groups (or loose runs) selected. */
export function sideCellsPerQuestion(groups: MeasurementGroup[]): number {
  return groups.reduce((n, g) => n + g.cellsPerQuestion, 0);
}

/**
 * Which selection ids survive a reload?
 *
 * ⛔ A STALE ID IS DROPPED, NEVER KEPT. A persisted selection can name a run that has since been
 * deleted or belongs to an audit no longer fetched. Keeping it would build a side out of fewer
 * runs than the screen shows ticked — a 3-run comparison that is quietly a 2-run one, which is
 * the exact failure this whole feature exists to make visible. Returns only ids present in
 * `available`, and the caller can compare lengths to tell the operator something was dropped.
 */
export function pruneSelection(saved: readonly string[], available: ReadonlySet<string>): string[] {
  return saved.filter((id) => available.has(id));
}

/* ── THE DEFAULT SELECTION ────────────────────────────────────────────────────────────────────
   ⛔ OLDEST DAY vs NEWEST DAY IS THE WRONG DEFAULT, AND RG IS THE PROOF. His oldest day is a
   1-run, 3-QUESTION prospecting audit from 29 Jul and his newest is a single run appended on
   8 Sep — so the default compared a 3-question probe against one run, which shares only some
   questions and can prove nothing. The two real measurements (11 Aug and 26 Aug, both 12
   questions × 3 runs) sat in the middle and were never picked.

   So the default prefers COMPLETE MEASUREMENTS: groups that repeat as their audit intended.
   Between two of those, oldest is before and newest is after. Everything else is a fallback, and
   the screen says which rule was applied — a default nobody can explain is one nobody trusts. */

export type DefaultSelectionReason = 'measurements' | 'largest_question_set' | 'oldest_newest' | 'none';

export interface DefaultSelection {
  before: string[];
  after: string[];
  reason: DefaultSelectionReason;
  /** One line for the screen, so the operator can see WHY these runs are ticked. */
  note: string;
}

const EMPTY: DefaultSelection = { before: [], after: [], reason: 'none', note: 'No two measurements to compare yet.' };

/**
 * Which runs to tick when the operator has made no choice.
 *
 * ⚠️ NEVER SPENDS AND NEVER NARROWS SILENTLY. It only pre-ticks; every group stays reassignable,
 * and the note names the rule so a surprising pair can be corrected rather than puzzled over.
 */
export function defaultSelection(groups: MeasurementGroup[]): DefaultSelection {
  if (groups.length < 2) return EMPTY;

  /* 1. Complete measurements — a group that made all the runs its audit was configured for, and
        was configured to repeat at all. This is what a before/after is supposed to compare. */
  const complete = groups.filter((g) => g.isMeasurement && !g.shortfall && g.runCount > 1);
  if (complete.length >= 2) {
    const before = complete[0], after = complete[complete.length - 1];
    return {
      before: before.runIds,
      after: after.runIds,
      reason: 'measurements',
      note: `Comparing the oldest complete measurement (${before.day}, ${before.runCount} runs) `
        + `against the newest (${after.day}, ${after.runCount} runs).`,
    };
  }

  /* 2. No two complete measurements: fall back to the biggest QUESTION SET, since a comparison can
        only move on questions asked both times, and a 3-question probe against a 12-question
        measurement is mostly unmatched rows. Ties keep the more-repeated group. */
  const maxQ = Math.max(...groups.map((g) => g.questions));
  const biggest = groups.filter((g) => g.questions === maxQ);
  if (maxQ > 0 && biggest.length >= 2) {
    const before = biggest[0], after = biggest[biggest.length - 1];
    return {
      before: before.runIds,
      after: after.runIds,
      reason: 'largest_question_set',
      note: `No two complete measurements yet, so comparing the oldest and newest ${maxQ}-question runs `
        + `(${before.day}, ${before.runCount} run${before.runCount === 1 ? '' : 's'} → ${after.day}, `
        + `${after.runCount} run${after.runCount === 1 ? '' : 's'}).`,
    };
  }

  /* 3. Last resort, the old behaviour, stated as such. */
  const before = groups[0], after = groups[groups.length - 1];
  return {
    before: before.runIds,
    after: after.runIds,
    reason: 'oldest_newest',
    note: `Comparing the oldest measured day (${before.day}) against the newest (${after.day}).`,
  };
}
