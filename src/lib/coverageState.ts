import { canonicalTrade } from './trades';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHICH TOWNS HAVE I WORKED, FOR THIS TRADE?

   ⛔ STATE IS DERIVED, NEVER MARKED. uk_towns deliberately holds no work state: which trade+town
   pairs are measured, have prospects, or have been contacted is already owned by ai_audits,
   ai_audit_runs, outreach_leads and whatsapp_messages. A status column here would be a second copy
   of a truth those tables own, and it would be the copy that goes stale — the operator would tick
   "done", the audit would later fail, and the list would still say done.
   Proven 2026-08-08: 69 trade+town pairs resolve cleanly with nothing marked by hand.

   ⛔ AND IT IS PER TRADE **AND** TOWN, NOT PER TOWN. Wisbech is finished for locksmiths and
   untouched for driving instructors. A per-town status would have to pick one and be wrong about
   the other, which is why the key is the pair.

   ⚠️ THE LADDER IS ORDERED BY EFFORT ALREADY SPENT, and each rung is a POSITIVE test. Nothing
   reaches a state by failing to be something else — the default is `untouched`, the rung that says
   we have done nothing, so a town whose data we cannot read is never reported as worked.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export type CoverageState =
  /** Prospects contacted. The furthest along: real outreach has left the building. */
  | 'worked'
  /** The town's market is measured — a market audit with at least one completed run. */
  | 'measured'
  /** Leads are in the CRM for this trade+town, but nothing measured and nobody contacted. */
  | 'leads'
  /** Nothing at all. */
  | 'untouched';

export const COVERAGE_STATES: CoverageState[] = ['worked', 'measured', 'leads', 'untouched'];

export const COVERAGE_LABEL: Record<CoverageState, string> = {
  worked: 'Worked',
  measured: 'Measured',
  leads: 'Leads found',
  untouched: 'Untouched',
};

/** Ordered by effort spent, so a summary reads left-to-right as a funnel. */
export const COVERAGE_ORDER: Record<CoverageState, number> = {
  worked: 0, measured: 1, leads: 2, untouched: 3,
};

export interface CoverageTown {
  id: string;
  name: string;
  region: string | null;
  population: number | null;
}

/** The facts each source contributes, already reduced to a trade+town key by the caller. */
export interface CoverageFacts {
  /** Pairs with a market audit that has at least one COMPLETED run. */
  measuredPairs: Set<string>;
  /** Pairs with at least one lead in outreach_leads. */
  leadPairs: Set<string>;
  /** Pairs where at least one lead has actually been contacted. */
  workedPairs: Set<string>;
}

/** Normalise a town name the way the audit book stores it: ONS parentheticals and case removed. */
export function coverageTownKey(name: string | null | undefined): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(uk|england|scotland|wales|gb)$/, '');
}

/**
 * The key both sides of the join must agree on.
 *
 * ⛔ THE TRADE IS CANONICALISED AND THE TOWN IS NORMALISED, on BOTH sides, by this one function.
 * business_type is stored as typed ("accountant" and "accountants" are 52 and 10 rows of one
 * trade), so a raw-string key would show Kettering twice and call each half untouched.
 * An UNMAPPED trade falls back to its normalised raw string rather than being dropped — an
 * unrecognised trade should show as itself, never silently join another trade's coverage.
 */
export function coverageKey(trade: string | null | undefined, town: string | null | undefined): string {
  const slug = canonicalTrade(trade)?.slug ?? coverageTownKey(trade);
  return `${slug}|${coverageTownKey(town)}`;
}

/**
 * Grade one town for one trade.
 *
 * ⚠️ `worked` implies leads and usually implies measured, but the states are EXCLUSIVE for display:
 * a town is shown at the furthest rung it has reached. The counts therefore sum to the town total,
 * which is what makes "6 of 87 done" readable at a glance rather than double-counting.
 */
export function coverageStateFor(trade: string, town: CoverageTown, facts: CoverageFacts): CoverageState {
  const key = coverageKey(trade, town.name);
  if (facts.workedPairs.has(key)) return 'worked';
  if (facts.measuredPairs.has(key)) return 'measured';
  if (facts.leadPairs.has(key)) return 'leads';
  return 'untouched';
}

export interface CoverageRow extends CoverageTown {
  state: CoverageState;
}

export interface CoverageSummary {
  total: number;
  counts: Record<CoverageState, number>;
  /** Everything past `untouched` — the number "6 of 87 done" reports. */
  started: number;
}

export function summarise(rows: CoverageRow[]): CoverageSummary {
  const counts: Record<CoverageState, number> = { worked: 0, measured: 0, leads: 0, untouched: 0 };
  for (const r of rows) counts[r.state]++;
  return { total: rows.length, counts, started: rows.length - counts.untouched };
}

export interface CoverageFilters {
  region: string | null;
  minPopulation: number;
  maxPopulation: number;
}

/**
 * Apply the operator's filters.
 *
 * ⛔ A NULL POPULATION IS EXCLUDED BY A SIZE FILTER, not treated as zero and not passed through.
 * The column is nullable because names can be seeded before populations are joined, and a town of
 * unknown size cannot honestly be said to be inside a 15k–210k band. Silently including it would
 * put an unknown quantity in a list whose whole purpose is deciding where to spend next.
 */
export function applyFilters(rows: CoverageRow[], f: CoverageFilters): CoverageRow[] {
  return rows.filter((r) => {
    if (f.region && r.region !== f.region) return false;
    if (r.population === null || r.population === undefined) return false;
    return r.population >= f.minPopulation && r.population <= f.maxPopulation;
  });
}
