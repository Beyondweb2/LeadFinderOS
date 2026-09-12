/* ============================================================
   THE BASELINE CONTRACT — what a paid client's day-28 re-measurement is, in writing.

   WHY THIS EXISTS. The paid baseline used the client's MAIN TOWN only, while the questionnaire
   now captures areas_list: a priority-ordered list of towns they want work from. A client with
   three towns got work aimed at three and a measurement of one. This module decides how a fixed
   question budget was spread across the towns they picked (v1), and freezes that decision so day 28
   re-runs the identical set instead of re-deriving it from whatever the code does by then.

   IMPORTED BY EDGE FUNCTIONS: relative paths with an explicit .ts extension only, no @/ alias,
   and no dependencies — see CLAUDE.md §4.
   ============================================================ */

/* ⛔ `GuaranteeKind` / `decideGuarantee` WERE DELETED 2026-09-12. They graded a client 'work' or
   'outcome' from what they paid, and since 2026-09-12 the guarantee is outcome-conditional for
   everyone: the judged set is the pointer's ASKED set (outreach_leads.baseline_audit_id → the
   baseline's first-run queue rows), read by baselineReplay.ts, never a field in this document.
   Contracts written before that date still carry `guarantee` / `scoredQuestions` and are read
   as history — RG Locksmiths' frozen contract is untouched. */

export interface AreaAllocation {
  town: string;
  questions: number;
  /** True for the client's own town. It carries the heavier share deliberately. */
  isMain: boolean;
}

export interface BaselineContract {
  /** Schema version, so a later shape change can be detected rather than guessed at.
   *  1 = the 2026-08-04 multi-town, seeded shape. 2 = since 2026-09-12: home town only, unseeded,
   *  the picked areas recorded but measured in the FULL MEASURE instead. */
  version: 1 | 2;
  /** v1 ONLY — history. See the note above. */
  guarantee?: 'work' | 'outcome';
  /** v1 ONLY. */
  guaranteeReason?: string;
  mainTown: string;
  /** Every area the client picked, in the priority order they picked them. */
  areasRequested: string[];
  /** What each measured town actually got. Sums to <= ceiling. */
  allocation: AreaAllocation[];
  /** v1: areas that could not be given the AREA_MIN_QUESTIONS floor and were NOT measured.
   *  v2: EVERY picked area — none is measured by the baseline; they are measured by the full
   *  measure and named here so the document says so rather than an area quietly vanishing. */
  areasDropped: string[];
  /** v2 ONLY. The areas handed to the full measure — the same list as areasRequested, kept as a
   *  separate field so the intent is explicit in the stored row. */
  areasMeasuredInFullMeasure?: string[];
  /** The question ceiling in force when this contract was written. */
  ceiling: number;
  /** v1 ONLY — history. Seeding from the outreach hook was dropped on 2026-09-12: the hook is
   *  throwaway and never compared, so the baseline is generated fresh. */
  seededQuestions?: string[];
  /** OUTCOME-GUARANTEE CLIENTS ONLY. The frozen set the refund test reads: the questions from the
   *  audit that SOLD them, verbatim, as actually queued. Written once, never recomputed. Absent for
   *  'work' clients, because nothing rides on which questions moved.
   *  NOT "the main town's share": the promise was "named in more AI answers after 8 weeks than
   *  today", and "today" is the audit they were shown — so the scored set is the seed, not whatever
   *  the new allocation happens to put first. */
  scoredQuestions?: string[];
  /** The audit the scored set came from, so day 28 can compare against the exact measurement
   *  that was sold rather than re-deriving a "before". Outcome clients only. */
  scoredFromAuditId?: string | null;
  /** THE MONEY QUESTIONS IN THIS MEASUREMENT, verbatim as queued — the buying-moment queries the
   *  generator was asked to add (moneyQuestions.ts). Present only for baselines created after
   *  2026-08-31; ABSENT on every earlier contract, and absent must be read as "not recorded", NOT
   *  as "there were none" (the absent-value rule — an old baseline genuinely has none, but a
   *  consumer cannot tell those two apart from this field alone, so it should say which it means).
   *
   *  ⛔ WHY IT IS RECORDED AT ALL: money questions can be authority-locked by directories, so they
   *  may be harder to move than a head term. Flagging them lets the day-28 before/after be
   *  computed on ALL questions or on STANDARD QUESTIONS ONLY — a decision deliberately NOT made
   *  here. Nothing in the guarantee reads this field.
   *  ⛔ AND IT IS NOT THE REFUND TEST. `scoredQuestions` below is, and money questions cannot enter
   *  it by construction: it is seedQuestions ∩ askedQuestions, and money questions are GENERATED,
   *  never seeded. This field and that one are disjoint by the way each is built, not by a filter
   *  that could later be edited away.
   *  ⚠️ Intersected with the questions ACTUALLY QUEUED, using the same askedKeys pass that builds
   *  scoredQuestions — so it can never name a question the guards rejected. */
  moneyQuestions?: string[];
  /** The town that audit measured. May differ from mainTown: RG Locksmiths was sold on a Wisbech
   *  audit and has since asked for Huntingdon, St Neots and Peterborough. Recorded so nobody has to
   *  remember that the refund test lives in a different town from the delivery areas. */
  scoredTown?: string | null;
  createdAt: string;
}

/** No area is measured with fewer than this. One question is a coin toss, not a measurement. */
export const AREA_MIN_QUESTIONS = 2;
/** Share of the ceiling the client's own town takes. It is where they trade and where "near me"
 *  resolves; the extra areas are ambitions of decreasing strength (hence priority order). */
export const MAIN_TOWN_SHARE = 0.5;

/**
 * Spread `ceiling` questions across the main town and the picked areas.
 *
 * Main town takes MAIN_TOWN_SHARE, the rest split the remainder in priority order, each getting at
 * least AREA_MIN_QUESTIONS or nothing at all. TOTAL IS CAPPED: a client picking eight towns costs
 * exactly what a client picking three costs, and gets thinner coverage per town rather than a
 * bigger bill. Cost scaling with a client's ambition against a fixed price is the wrong risk.
 */
export function allocateAreas(
  mainTown: string,
  areas: string[],
  ceiling: number,
  /** Minimum the MAIN town must get, whatever the share works out to. Used for a legacy
   *  outcome-guarantee client, whose seeded questions ARE the refund test and must all survive the
   *  allocation — the extra areas take what is left. 0 (the default) restores the plain share. */
  mainFloor = 0,
): {
  allocation: AreaAllocation[];
  dropped: string[];
} {
  const main = (mainTown ?? "").trim();
  if (!main || ceiling < 1) return { allocation: [], dropped: [] };

  // De-duplicate against the main town and against each other, preserving priority order.
  const extras: string[] = [];
  for (const raw of areas ?? []) {
    const a = (raw ?? "").trim();
    if (!a) continue;
    if (a.toLowerCase() === main.toLowerCase()) continue;
    if (extras.some((x) => x.toLowerCase() === a.toLowerCase())) continue;
    extras.push(a);
  }
  if (extras.length === 0) {
    return { allocation: [{ town: main, questions: ceiling, isMain: true }], dropped: [] };
  }
  /* A floor at or above the ceiling means the scored set fills the budget on its own: measure the
     main town only and report every extra area as dropped, rather than shaving the refund test. */
  if (mainFloor >= ceiling) {
    return { allocation: [{ town: main, questions: ceiling, isMain: true }], dropped: extras };
  }

  const mainQuestions = Math.min(
    ceiling,
    Math.max(AREA_MIN_QUESTIONS, Math.floor(ceiling * MAIN_TOWN_SHARE), mainFloor),
  );
  let remaining = ceiling - mainQuestions;
  /* How many extras can be measured AT ALL. Anything past that is dropped rather than measured on
     one question, and the caller names the dropped ones on screen. */
  const affordable = Math.floor(remaining / AREA_MIN_QUESTIONS);
  const measured = extras.slice(0, Math.max(0, affordable));
  const dropped = extras.slice(measured.length);

  const allocation: AreaAllocation[] = [{ town: main, questions: mainQuestions, isMain: true }];
  for (const town of measured) allocation.push({ town, questions: AREA_MIN_QUESTIONS, isMain: false });
  remaining -= measured.length * AREA_MIN_QUESTIONS;
  // Spend anything left over in priority order, so the budget is never silently under-used.
  for (let i = 1; i < allocation.length && remaining > 0; i++) {
    allocation[i].questions += 1;
    remaining -= 1;
    if (i === allocation.length - 1 && remaining > 0) i = 0; // wrap, still priority-first
  }
  return { allocation, dropped };
}

/** Every question in a contract's measured set, main town first. Used to re-run the identical set
 *  at day 28 without re-deriving anything. */
export function contractQuestionCount(c: BaselineContract): number {
  return c.allocation.reduce((s, a) => s + a.questions, 0);
}
