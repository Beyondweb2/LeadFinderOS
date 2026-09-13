/* ============================================================
   BEFORE / AFTER — the day-28 re-measurement, computed instead of eyeballed.

   WHY THIS EXISTS. Nothing in the codebase compared two measurements. `ai_audit_runs.results.
   measurement` was tagged at creation "so the start-vs-re-measure before/after can find them
   later" and nothing ever read it, so every before/after — including the one paying clients are
   owed as guarantee evidence — was done by hand, reading run numbers out of the database.

   ⛔ THE NOISE FLOOR IS THE WHOLE POINT, NOT A CAVEAT. baselineView.ts records the measured
   run-to-run swing with NO WORK DONE between runs: SW2 0.15 → 0.10 → 0.15, MK 0.35 → 0.35 → 0.30.
   That is ±5 percentage points of pure sampling noise on real client baselines. So a movement of a
   few points is not evidence of anything, and presenting one to a client as improvement would be
   inventing a result the measurement cannot support — the same class of error as promising the
   outcome. Every verdict here is gated on NOISE_BAND_PP, and sub-band movement is reported as
   "within noise, not proven" whichever direction it points.

   ⛔ AND PER-QUESTION MOVEMENT IS ALMOST NEVER PROVABLE. One question on two engines in one run is
   two answer cells; the swing above is measured on sixty. So a question's row shows its movement
   for READING, and is marked unproven unless BOTH sides carry at least MIN_CELLS_FOR_QUESTION_CLAIM
   cells. The claim lives in the overall figure, which is what §5 of CLAUDE.md reports for ABLM
   ("0 → 3 of 18"), never in a single question.

   ⚠️ THE TWO SIDES ROUTINELY HAVE DIFFERENT DENOMINATORS, measured on real data 2026-08-31: ABLM's
   before is four runs of the same nine questions (8 cells per question) and its after is two runs
   covering those nine questions ONCE each (2 cells per question). So everything here works in
   RATES with the denominators printed, never in raw counts, and `unevenRuns` says so out loud.

   ⚠️ IT ONLY COMPARES WHAT WAS ASKED BOTH TIMES. A re-measure that REGENERATED its questions
   shares no exact strings with the original and produces an empty join — measured: ABLM's 2026-08-28
   measurement asks "Best accountants in Wisbech?" where the original asked "accountant in wisbech",
   zero overlap. That is reported as `incomparable` with both unmatched lists, never as "no change".

   SPA-ONLY. It imports baselineView, which imports the `@/` alias — see CLAUDE.md §4. Do not
   import this from an edge function without fixing that first.
   ============================================================ */
import { buildBaselineView, type QueueRowLite } from './baselineView.ts';
import { SCORED_ENGINES, citationIsClient, domainOfSafe } from './auditReport.ts';

/** Measured sampling swing, in percentage points — see the header. Movement inside this band is
 *  not evidence. Paul tunes it only against re-measured run data, never to make a result read
 *  better. */
export const NOISE_BAND_PP = 5;

/** Answer cells a SIDE needs before a single question's movement may be called proven. Two engines
 *  × one run = 2, which is why a one-run re-measure proves nothing per question. */
export const MIN_CELLS_FOR_QUESTION_CLAIM = 4;

export type Movement = 'improved' | 'dropped' | 'within_noise' | 'unchanged' | 'only_before' | 'only_after';

export interface SideCounts {
  /** Answer cells in which the business was named. */
  named: number;
  /** Answer cells the engine actually answered — the rate's denominator. */
  answered: number;
  /** Cells asked, answered or not. */
  cells: number;
  /** Cells in which the client's OWN site was cited as a source. */
  cited: number;
  /** named / answered as a percentage, or null when nothing was answered. */
  ratePct: number | null;
}

export interface QuestionMovement {
  /** The question as asked. The AFTER spelling wins when both sides have it. */
  question: string;
  before: SideCounts | null;
  after: SideCounts | null;
  /** Named-cell change. Null unless both sides asked it. */
  namedDelta: number | null;
  /** Named-RATE change in percentage points. Null unless both sides answered something. */
  ratePpDelta: number | null;
  citedDelta: number | null;
  movement: Movement;
  /** True when either side is too thin to support a per-question claim. */
  thin: boolean;
  /** Ready-to-read summary, e.g. "named 0 of 8 → 2 of 2". */
  label: string;
  /* ⛔ THE ORDER THE QUESTION WAS ASKED IN, so a row can be put back where it belongs.
     The fold used to return questions sorted by MOVEMENT only, which is the right order for a
     client reading their wins and the wrong one for analysis: the row order changed every time
     the numbers changed, so two viewings of the same audit could not be read against each other,
     and it never matched the order the questions appear anywhere else in the product.
     ⚠️ DERIVED FROM ROW ORDER, NOT FROM A TIMESTAMP — ai_audit_queue rows carry no created_at in
     QueueRowLite, and buildBaselineView re-sorts its own questions by BAND, so neither is a source
     of ask order. Both callers fetch `.order('id', { ascending: true })`, and queue rows are
     inserted in question order, so first appearance in the rows array IS the asked order. A
     caller that fetches unordered gets a stable but arbitrary order, which is still better than
     one that moves with the results. BEFORE decides; a question only asked after is appended. */
  askIndex: number;
}

export interface OverallSide {
  named: number;
  answered: number;
  cited: number;
  ratePct: number | null;
  runs: number;
  questions: number;
  measuredAt: string | null;
}

export interface MeasurementComparison {
  questions: QuestionMovement[];
  before: OverallSide;
  after: OverallSide;
  /** Overall named-rate change in percentage points. Null when a side answered nothing. */
  ratePpDelta: number | null;
  namedCellsDelta: number;
  /** The headline verdict. `incomparable` when no question was asked on both sides. */
  movement: Movement | 'incomparable';
  /** True when |ratePpDelta| is inside the measured swing — the movement is NOT proven. */
  withinNoise: boolean;
  noiseBandPp: number;
  /** True when the two sides asked their questions a different number of times. */
  unevenRuns: boolean;
  matchedCount: number;
  onlyBefore: string[];
  onlyAfter: string[];
  /** One honest sentence for the top of the view (and for a client document). */
  headline: string;
}

/** Case-insensitive question identity — the same rule askedKeys and dedupeQuestions use, so a
 *  re-cased question is not read as a different one. */
const qKey = (q: string) => q.trim().toLowerCase();

const isScored = (k: string) => (SCORED_ENGINES as readonly string[]).includes(k);

/** Percentage points, or null when there is no denominator. Never returns 0 for "unknown". */
function ratePct(named: number, answered: number): number | null {
  return answered > 0 ? (named / answered) * 100 : null;
}

/* CITED IS NOT IN buildBaselineView, so it gets its own pass over the same rows — using the SAME
   engine set and the SAME citation rule the report uses (citationIsClient, imported rather than
   restated). "Cited" here means the client's OWN site appeared as a source, which is a different
   claim from being named in the prose and moves independently of it. */
function citedByQuestion(
  rows: QueueRowLite[],
  businessName: string,
  ownWebsite: string,
): Map<string, number> {
  const ownDomain = ownWebsite ? domainOfSafe(ownWebsite) : '';
  const out = new Map<string, number>();
  for (const row of rows) {
    const q = (row.question ?? '').trim();
    if (!q) continue;
    const result = (row.result ?? {}) as Record<string, unknown>;
    let hits = 0;
    for (const engine of Object.keys(result).filter(isScored)) {
      const er = result[engine] as { citations?: unknown } | undefined;
      if (!er || typeof er !== 'object') continue;
      const cits = Array.isArray(er.citations) ? er.citations : [];
      /* ONE CELL COUNTS ONCE however many of its citations are the client's — this is "was the
         site cited in this answer", not "how many links did it get". */
      if (cits.some((c) => citationIsClient(c as { title?: string; url?: string }, businessName, ownDomain))) hits++;
    }
    out.set(qKey(q), (out.get(qKey(q)) ?? 0) + hits);
  }
  return out;
}

/** First appearance of each question key in the rows as given — the asked order (see askIndex). */
function askOrder(rows: QueueRowLite[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const q = (row.question ?? '').trim();
    if (!q) continue;
    const key = qKey(q);
    if (!out.has(key)) out.set(key, out.size);
  }
  return out;
}

/** Fold one side into per-question counts, reusing buildBaselineView for named/answered/runs. */
function sideCounts(
  rows: QueueRowLite[],
  businessName: string,
  ownWebsite: string,
): { byQuestion: Map<string, SideCounts>; overall: OverallSide; label: Map<string, string> } {
  const view = buildBaselineView(rows, { businessName });
  const cited = citedByQuestion(rows, businessName, ownWebsite);
  const byQuestion = new Map<string, SideCounts>();
  const label = new Map<string, string>();
  let citedTotal = 0;
  for (const q of view.questions) {
    const key = qKey(q.question);
    let named = 0, answered = 0, cells = 0;
    for (const engine of Object.keys(q.engines)) {
      const c = q.engines[engine];
      named += c.named;
      answered += c.answered;
      cells += c.runs;
    }
    const c = cited.get(key) ?? 0;
    citedTotal += c;
    byQuestion.set(key, { named, answered, cells, cited: c, ratePct: ratePct(named, answered) });
    label.set(key, q.question);
  }
  return {
    byQuestion,
    label,
    overall: {
      named: view.namedCells,
      answered: view.answeredCells,
      cited: citedTotal,
      ratePct: ratePct(view.namedCells, view.answeredCells),
      runs: view.runsCounted,
      questions: view.questions.length,
      measuredAt: view.measuredAt,
    },
  };
}

/** Grade a movement against the noise band. `null` delta (no denominator) is never a claim. */
function gradeDelta(ppDelta: number | null, proven: boolean): Movement {
  if (ppDelta === null) return 'within_noise';
  if (ppDelta === 0) return 'unchanged';
  if (!proven || Math.abs(ppDelta) <= NOISE_BAND_PP) return 'within_noise';
  return ppDelta > 0 ? 'improved' : 'dropped';
}

function fmtSide(s: SideCounts | null): string {
  if (!s) return 'not asked';
  return `${s.named} of ${s.answered || s.cells}`;
}

/** How a comparison's rows may be ordered. `asked` is the analysis default; `movement` is the
 *  client-reading order (wins first) the fold used to hardcode. */
export const MEASUREMENT_ORDERS = ['asked', 'movement'] as const;
export type MeasurementOrder = typeof MEASUREMENT_ORDERS[number];

export const MEASUREMENT_ORDER_LABELS: Record<MeasurementOrder, string> = {
  asked: 'As asked',
  movement: 'Biggest movers',
};

/** Client-reading rank: improved, then unproven/unchanged, then dropped, then the unmatched. */
const MOVEMENT_RANK: Record<Movement, number> = {
  improved: 0, within_noise: 1, unchanged: 2, dropped: 3, only_after: 4, only_before: 5,
};

/**
 * Order a comparison's questions for display or export. PURE — returns a new array, so the same
 * comparison can be rendered in one order and exported in another without either mutating it.
 *
 * ⚠️ EVERY ORDER IS TOTAL. Ties fall through to askIndex and then to the question text, so the
 * same data always yields the same sequence — which is the whole point of the 'asked' order: two
 * exports of one measurement must be diffable, and a sort that leaves ties to the engine's
 * discretion is not.
 */
export function sortMeasurementQuestions(
  questions: QuestionMovement[],
  order: MeasurementOrder = 'asked',
): QuestionMovement[] {
  const out = [...questions];
  if (order === 'movement') {
    out.sort((x, y) =>
      MOVEMENT_RANK[x.movement] - MOVEMENT_RANK[y.movement]
      || Math.abs(y.ratePpDelta ?? 0) - Math.abs(x.ratePpDelta ?? 0)
      || x.askIndex - y.askIndex
      || x.question.localeCompare(y.question));
    return out;
  }
  out.sort((x, y) => x.askIndex - y.askIndex || x.question.localeCompare(y.question));
  return out;
}

/**
 * Compare two measurements of the same business.
 *
 * @param beforeRows every `ai_audit_queue` row belonging to the BEFORE run ids
 * @param afterRows  every `ai_audit_queue` row belonging to the AFTER run ids
 *
 * The caller decides which runs are which — the two sides may be different runs of one audit or
 * runs of two different audits, because both shapes exist in real data.
 */
export function compareMeasurements(
  beforeRows: QueueRowLite[],
  afterRows: QueueRowLite[],
  opts: { businessName?: string | null; ownWebsite?: string | null } = {},
): MeasurementComparison {
  const businessName = (opts.businessName ?? '').trim();
  const ownWebsite = (opts.ownWebsite ?? '').trim();
  const b = sideCounts(beforeRows, businessName, ownWebsite);
  const a = sideCounts(afterRows, businessName, ownWebsite);
  /* BEFORE's order is the spine — it is the measurement the after side is being compared against,
     so its questions keep their positions and anything new is appended after them. */
  const bOrder = askOrder(beforeRows);
  const aOrder = askOrder(afterRows);
  const askIndexOf = (key: string): number => {
    const bi = bOrder.get(key);
    if (bi !== undefined) return bi;
    const ai = aOrder.get(key);
    return ai === undefined ? Number.MAX_SAFE_INTEGER : bOrder.size + ai;
  };

  const keys = new Set<string>([...b.byQuestion.keys(), ...a.byQuestion.keys()]);
  const questions: QuestionMovement[] = [];
  const onlyBefore: string[] = [];
  const onlyAfter: string[] = [];
  let matched = 0;

  for (const key of keys) {
    const bs = b.byQuestion.get(key) ?? null;
    const as = a.byQuestion.get(key) ?? null;
    const question = a.label.get(key) ?? b.label.get(key) ?? key;
    if (bs && !as) {
      onlyBefore.push(question);
      questions.push({
        question, before: bs, after: null, namedDelta: null, ratePpDelta: null, citedDelta: null,
        movement: 'only_before', thin: true,
        label: `${fmtSide(bs)} → not asked again`,
        askIndex: askIndexOf(key),
      });
      continue;
    }
    if (as && !bs) {
      onlyAfter.push(question);
      questions.push({
        question, before: null, after: as, namedDelta: null, ratePpDelta: null, citedDelta: null,
        movement: 'only_after', thin: true,
        label: `not asked before → ${fmtSide(as)}`,
        askIndex: askIndexOf(key),
      });
      continue;
    }
    if (!bs || !as) continue;
    matched++;
    const ppDelta = bs.ratePct === null || as.ratePct === null ? null : as.ratePct - bs.ratePct;
    /* ⛔ THIN MEANS UNPROVABLE, NOT UNIMPORTANT. Both sides must carry enough cells before a single
       question's movement may be called improved or dropped — see the header. */
    const thin = bs.answered < MIN_CELLS_FOR_QUESTION_CLAIM || as.answered < MIN_CELLS_FOR_QUESTION_CLAIM;
    questions.push({
      question,
      before: bs,
      after: as,
      namedDelta: as.named - bs.named,
      ratePpDelta: ppDelta,
      citedDelta: as.cited - bs.cited,
      movement: gradeDelta(ppDelta, !thin),
      thin,
      label: `named ${fmtSide(bs)} → ${fmtSide(as)}`,
      askIndex: askIndexOf(key),
    });
  }

  /* ⛔ THE FOLD RETURNS ASKED ORDER. It used to return movement order, which meant every consumer
     inherited a client-reading sequence whether or not it wanted one, and a caller that needed
     like-for-like rows had no way back to the original order (the information was thrown away).
     Ordering is a PRESENTATION choice now: sortMeasurementQuestions applies it, and the default
     for reading a comparison is the order the questions were asked. */
  questions.sort((x, y) => x.askIndex - y.askIndex || x.question.localeCompare(y.question));

  const ratePpDelta = b.overall.ratePct === null || a.overall.ratePct === null
    ? null
    : a.overall.ratePct - b.overall.ratePct;
  const withinNoise = ratePpDelta === null || Math.abs(ratePpDelta) <= NOISE_BAND_PP;
  /* Uneven sampling: the same question asked a different number of times each side. Real and
     common (ABLM: 8 cells before, 2 after) — it does not invalidate the comparison, but it must be
     visible, because it is why the rate is the honest figure and the raw count is not. */
  const unevenRuns = matched > 0 && questions.some(
    (q) => q.before && q.after && q.before.cells !== q.after.cells,
  );

  const movement: Movement | 'incomparable' = matched === 0
    ? 'incomparable'
    : gradeDelta(ratePpDelta, true);

  const pp = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} points`;
  let headline: string;
  if (matched === 0) {
    headline = 'These two measurements share no questions, so they cannot be compared. '
      + 'A re-measure has to ask the same questions to be a before-and-after.';
  } else if (ratePpDelta === null) {
    headline = 'One of the two measurements has no answered questions, so there is nothing to compare yet.';
  } else if (withinNoise) {
    headline = `Named in ${a.overall.named} of ${a.overall.answered} answers, against `
      + `${b.overall.named} of ${b.overall.answered} before (${pp(ratePpDelta)}). `
      + `That is inside the ±${NOISE_BAND_PP}-point swing we see between repeat measurements with no work done, `
      + 'so it is not proven movement.';
  } else {
    const dir = ratePpDelta > 0 ? 'up' : 'down';
    headline = `Named in ${a.overall.named} of ${a.overall.answered} answers, against `
      + `${b.overall.named} of ${b.overall.answered} before — ${dir} ${pp(ratePpDelta)}, `
      + `which is beyond the ±${NOISE_BAND_PP}-point swing between repeat measurements.`;
  }

  return {
    questions,
    before: b.overall,
    after: a.overall,
    ratePpDelta,
    namedCellsDelta: a.overall.named - b.overall.named,
    movement,
    withinNoise,
    noiseBandPp: NOISE_BAND_PP,
    unevenRuns,
    matchedCount: matched,
    onlyBefore,
    onlyAfter,
    headline,
  };
}
