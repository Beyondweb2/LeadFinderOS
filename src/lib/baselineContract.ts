/* ============================================================
   THE BASELINE CONTRACT — what a paid client's week-eight re-measurement is, in writing.

   WHY THIS EXISTS. The paid baseline used the client's MAIN TOWN only, while the questionnaire
   now captures areas_list: a priority-ordered list of towns they want work from. A client with
   three towns got work aimed at three and a measurement of one. This module decides how a fixed
   question budget is spread across the towns they picked, and freezes that decision so week eight
   re-runs the identical set instead of re-deriving it from whatever the code does by then.

   IMPORTED BY EDGE FUNCTIONS: relative paths with an explicit .ts extension only, no @/ alias,
   and no dependencies — see CLAUDE.md §4.
   ============================================================ */

/** Which promise the client was actually sold. This is the ONLY field that changes what a refund
 *  hinges on, so it is recorded rather than inferred later:
 *
 *   'work'    — the current guarantee (since 2026-08-04): the audit, the work, and the week-eight
 *               re-measurement with evidence, or a full refund. It does NOT promise being named,
 *               so no particular question decides anything. Everything picked is measured and
 *               reported, and the scored set is deliberately absent.
 *   'outcome' — the LEGACY £49.99 promise: "named in more AI answers after 8 weeks than today, or
 *               you get it back". For these clients the exact measured set IS the refund test, so
 *               it is frozen in `scoredQuestions` and must never drift. */
export type GuaranteeKind = "work" | "outcome";

export interface AreaAllocation {
  town: string;
  questions: number;
  /** True for the client's own town. It carries the heavier share deliberately. */
  isMain: boolean;
}

export interface BaselineContract {
  /** Schema version, so a later shape change can be detected rather than guessed at. */
  version: 1;
  guarantee: GuaranteeKind;
  /** How the guarantee was decided, in words, so the stored row explains itself. */
  guaranteeReason: string;
  mainTown: string;
  /** Every area the client picked, in the priority order they picked them. */
  areasRequested: string[];
  /** What each measured town actually got. Sums to <= ceiling. */
  allocation: AreaAllocation[];
  /** Areas that could not be given the AREA_MIN_QUESTIONS floor and are therefore NOT measured.
   *  Named on screen as measured-but-not-scored: never dropped silently. */
  areasDropped: string[];
  /** The question ceiling in force when this contract was written. */
  ceiling: number;
  /** Questions carried verbatim from the outreach audit that sold them (the main town's set).
   *  Seed-preserving: these are re-run exactly, so the numbers that closed the sale are the
   *  numbers the re-measurement reports. */
  seededQuestions: string[];
  /** OUTCOME-GUARANTEE CLIENTS ONLY. The frozen set the refund test reads. Written once, never
   *  recomputed. Absent for 'work' clients, because nothing rides on which questions moved. */
  scoredQuestions?: string[];
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
export function allocateAreas(mainTown: string, areas: string[], ceiling: number): {
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

  const mainQuestions = Math.max(AREA_MIN_QUESTIONS, Math.floor(ceiling * MAIN_TOWN_SHARE));
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

/**
 * Which guarantee a client was sold, from what they PAID — evidence, not a guess.
 *
 * A payment below the current price is a legacy £49.99 sale, which carried the outcome promise.
 * Anything at or above the current price, or an explicit override, is the work guarantee. Decided
 * ONCE at baseline time and frozen in the contract: re-deriving it later, after another price
 * change, would silently move what a client is owed.
 */
export function decideGuarantee(
  amountPaidGbp: number | null | undefined,
  currentPriceGbp: number,
  override?: GuaranteeKind | null,
): { guarantee: GuaranteeKind; reason: string } {
  if (override === "outcome" || override === "work") {
    return { guarantee: override, reason: `set explicitly by the caller (${override})` };
  }
  const paid = typeof amountPaidGbp === "number" ? amountPaidGbp : 0;
  if (paid > 0 && paid < currentPriceGbp) {
    return {
      guarantee: "outcome",
      reason: `paid £${paid.toFixed(2)}, below the current £${currentPriceGbp} — legacy outcome-guarantee sale`,
    };
  }
  return {
    guarantee: "work",
    reason: paid > 0
      ? `paid £${paid.toFixed(2)} at or above the current £${currentPriceGbp} — work guarantee`
      : `no recorded payment below the current £${currentPriceGbp} — work guarantee (the default)`,
  };
}

/** Every question in a contract's measured set, main town first. Used to re-run the identical set
 *  at week eight without re-deriving anything. */
export function contractQuestionCount(c: BaselineContract): number {
  return c.allocation.reduce((s, a) => s + a.questions, 0);
}
