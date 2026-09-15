import { SCORED_ENGINES } from './auditReport.ts';
import { namedInMode, type NamedMode } from './namedSignal.ts';
/* ============================================================
   PAID BASELINE, AS DELIVERY WORK

   A paid signup runs a 12-question (home town), 2-engine, 3-run baseline and the result went nowhere anyone
   could see. This folds it into the only question that matters for delivery: for each question, on
   each engine, how many of the three runs named the business — and who got named instead.

   COUNTS ONLY. No score, no verdict, no winnability. The winnability classifier is deliberately not
   used here, and not because its rule is wrong (it was inverted once and has since been fixed): it
   classifies from ONE run, and competitor lists differ between runs, so its output flips between
   identical runs. That is a sampling problem, and the whole point of a 3-run baseline is to average
   sampling out. A band here is a statement about counts you can check by eye, nothing more.

   Measured run-to-run swing with no work done between runs, from the three real baselines:
     SW2  0.15 -> 0.10 -> 0.15      MK  0.35 -> 0.35 -> 0.30
   ============================================================ */

/** Ordered worst-first: this IS the work order, so the enum order is the display order. */
export const BANDS = ['absent', 'one_engine', 'fragile', 'held', 'no_race'] as const;
export type Band = (typeof BANDS)[number];

export const BAND_LABEL: Record<Band, string> = {
  absent: 'ABSENT',
  one_engine: 'ONE ENGINE',
  fragile: 'FRAGILE',
  held: 'HELD',
  no_race: 'NO RACE',
};

/** Why this question is in this band, in plain words. Shown, so a band is never a black box. */
export const BAND_MEANING: Record<Band, string> = {
  absent: 'The engines answer this locally and never name you. The race exists and you are invisible.',
  one_engine: 'One engine names you every run and another never does — the same question already works elsewhere, so the difference is diagnosable.',
  fragile: 'You appear in some runs and not others. Present, but not reliably.',
  held: 'Named on every engine in every run. Nothing to do; keep it for the week-four comparison.',
  no_race: 'No engine answers this locally, so there is nothing to win. Do not spend time here.',
};

export interface EngineCounts {
  /** Runs in which the business was named. */
  named: number;
  /** Runs in which the engine gave a local answer at all. */
  answered: number;
  /** Runs this engine was asked in — the denominator. */
  runs: number;
}

export interface CompetitorCount {
  name: string;
  /** Cells (run x engine) that named this competitor. */
  times: number;
  /** Cells that produced a competitor list at all — the honest denominator. */
  of: number;
}

export interface BaselineQuestion {
  question: string;
  /** Keyed by engine name as stored ('chatgpt', 'gemini', …). */
  engines: Record<string, EngineCounts>;
  band: Band;
  /** Most recurrent first. A firm named in every cell is the actual incumbent worth studying. */
  competitors: CompetitorCount[];
  /** Highest `times` in `competitors`; the within-band sort key. */
  topCompetitorTimes: number;
}

export interface BaselineView {
  questions: BaselineQuestion[];
  runsCounted: number;
  namedCells: number;
  answeredCells: number;
  /** namedCells / answeredCells, or null when nothing was answered. Matches ai_audits.baseline. */
  namedRatePct: number | null;
  measuredAt: string | null;
  bandCounts: Record<Band, number>;
}

/** One `ai_audit_queue` row: a single question in a single run. */
export interface QueueRowLite {
  run_id: string | null;
  question: string | null;
  engines: string[] | null;
  status: string | null;
  result: Record<string, unknown> | null;
}

interface EngineResult {
  named?: unknown;
  competitors?: unknown;
}

/* SCORED_ENGINES, not every key present. Results sometimes carry a third engine (ai_overview
   appeared in 8 of the 75 real queue rows) and ai_audits.baseline deliberately excludes it — its
   questions map only ever holds chatgpt and gemini. Counting it here made my totals 61 and 67
   answered cells against the stored 60, i.e. this view would have contradicted the baseline it is
   meant to display. Same constant the report builder uses, so the two cannot drift. */
const isEngineKey = (k: string) => (SCORED_ENGINES as readonly string[]).includes(k);

/** Loose match so "MK Plumbing & Heating Ltd" is not listed as its own competitor. */
function isSelf(name: string, businessName: string): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = norm(name);
  const b = norm(businessName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function classify(engines: Record<string, EngineCounts>): Band {
  const live = Object.values(engines).filter((e) => e.answered > 0);
  // Nothing answered anywhere: the engines do not treat this as a local question.
  if (live.length === 0) return 'no_race';
  const allNamedEvery = live.every((e) => e.named >= e.answered);
  if (allNamedEvery) return 'held';
  const noneNamedEver = live.every((e) => e.named === 0);
  if (noneNamedEver) return 'absent';
  // A clean split: at least one engine always names, at least one never does.
  const someAlways = live.some((e) => e.named >= e.answered);
  const someNever = live.some((e) => e.named === 0);
  if (someAlways && someNever) return 'one_engine';
  return 'fragile';
}

/**
 * Fold the per-run queue rows into one row per question.
 *
 * `runsCounted` comes from the DISTINCT run ids present, not from a stored target, so a baseline
 * that only completed two of three runs reports out of two rather than silently understating.
 */
export function buildBaselineView(
  rows: QueueRowLite[],
  /* ⛔ `namedMode` EXISTS FOR COMPARISONS, AND THE DEFAULT IS 'auto'. A single view of one
     measurement should always use the best signal it has. A BEFORE-AND-AFTER must not: reading
     the replay with the model and the baseline with the old string match is not a comparison, it
     is two different rulers, and that number decides a refund. compareMeasurements picks the mode
     once, for both sides — see namedSignal.ts. */
  opts: { businessName?: string | null; measuredAt?: string | null; namedMode?: NamedMode } = {},
): BaselineView {
  const businessName = (opts.businessName ?? '').trim();
  const namedMode: NamedMode = opts.namedMode ?? 'auto';
  const runIds = new Set<string>();
  for (const r of rows) if (r.run_id) runIds.add(r.run_id);

  interface Acc {
    engines: Record<string, EngineCounts>;
    competitorCells: number;
    competitors: Map<string, { display: string; times: number }>;
  }
  const byQuestion = new Map<string, Acc>();

  for (const row of rows) {
    const q = (row.question ?? '').trim();
    if (!q) continue;
    let acc = byQuestion.get(q);
    if (!acc) { acc = { engines: {}, competitorCells: 0, competitors: new Map() }; byQuestion.set(q, acc); }

    const result = (row.result ?? {}) as Record<string, unknown>;
    /* Engines come from the RESULT, falling back to the row's requested engines. A row that failed
       has no result, so it must still advance `runs` — otherwise a failed run silently shrinks the
       denominator and a question looks better than it is. */
    const engineKeys = Object.keys(result).filter(isEngineKey);
    const keys = engineKeys.length
      ? engineKeys
      : (row.engines ?? []).filter((e) => (SCORED_ENGINES as readonly string[]).includes(e));

    for (const engine of keys) {
      const cur = acc.engines[engine] ?? { named: 0, answered: 0, runs: 0 };
      cur.runs += 1;
      const er = result[engine] as EngineResult | undefined;
      if (er && typeof er === 'object') {
        // `answered` is not stored per row: an engine that returned a result answered.
        cur.answered += 1;
        if (namedInMode(er, namedMode)) cur.named += 1;
        if (Array.isArray(er.competitors)) {
          acc.competitorCells += 1;
          for (const raw of er.competitors) {
            const name = typeof raw === 'string' ? raw.trim() : '';
            if (!name || isSelf(name, businessName)) continue;
            const key = name.toLowerCase();
            const hit = acc.competitors.get(key);
            if (hit) hit.times += 1; else acc.competitors.set(key, { display: name, times: 1 });
          }
        }
      }
      acc.engines[engine] = cur;
    }
  }

  const questions: BaselineQuestion[] = [];
  let namedCells = 0;
  let answeredCells = 0;
  for (const [question, acc] of byQuestion) {
    for (const e of Object.values(acc.engines)) { namedCells += e.named; answeredCells += e.answered; }
    const competitors = [...acc.competitors.values()]
      .map((c) => ({ name: c.display, times: c.times, of: acc.competitorCells }))
      .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
    questions.push({
      question,
      engines: acc.engines,
      band: classify(acc.engines),
      competitors,
      topCompetitorTimes: competitors[0]?.times ?? 0,
    });
  }

  // Band order IS the work order; within a band, the most entrenched incumbent first.
  const bandIndex = (b: Band) => BANDS.indexOf(b);
  questions.sort((a, b) =>
    bandIndex(a.band) - bandIndex(b.band)
    || b.topCompetitorTimes - a.topCompetitorTimes
    || a.question.localeCompare(b.question));

  const bandCounts = BANDS.reduce((m, b) => { m[b] = 0; return m; }, {} as Record<Band, number>);
  for (const q of questions) bandCounts[q.band] += 1;

  return {
    questions,
    runsCounted: runIds.size,
    namedCells,
    answeredCells,
    namedRatePct: answeredCells > 0 ? Math.round((namedCells / answeredCells) * 100) : null,
    measuredAt: opts.measuredAt ?? null,
    bandCounts,
  };
}
