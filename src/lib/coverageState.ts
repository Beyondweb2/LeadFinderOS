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

/**
 * How many leads are in the CRM for each trade+town.
 *
 * ⛔ COUNTED FROM THE SAME `pairs.leads` THE RUNG IS DERIVED FROM, so the badge and the state can
 * never disagree. The endpoint sends ONE ENTRY PER LEAD ROW (not per pair), which is why the
 * multiplicity is there to count at all — `new Set(...)` was throwing it away.
 *
 * ⛔ IT IS NOT A SEPARATE READ, AND THAT IS THE POINT. A second query for counts could return a
 * different answer than the one that graded the row — and the two would disagree silently, on the
 * page whose entire job is deciding where to spend next. Same facts, one fetch, one truth.
 *
 * ⚠️ WHAT A ROW COUNTS AS ONE LEAD: the endpoint filters `is_archived = false` and skips any lead
 * missing a trade OR a town, so an unattributable lead is counted in NO town rather than guessed
 * into one. Dedupe is already handled at write time — addLead refuses a duplicate on
 * google_maps_url, business_name or place_id — so a row IS a distinct business, and this is a count
 * of businesses rather than of add attempts.
 */
export function countLeadsByPair(pairs: readonly { trade: string; town: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of pairs) {
    const key = coverageKey(p.trade, p.town);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
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

/* ══ THE TWO ACTIONS ON A COVERAGE ROW, AND WHY THEY ARE TWO ═══════════════════════════════════
   ⛔ "FIND LEADS" USED TO OPEN THE MARKET VIEW. One button did the wrong one of two jobs: it carried
   `mode=market`, so clicking the thing labelled Find leads never ran a lead search — it opened the
   market read, and on an untouched town it opened a spend confirm on top of that. Two jobs, one
   control, and the label described neither reliably.

   They are now separate, and the hrefs are built HERE rather than inline in the page, so the one
   property that matters can be asserted in a test: **the Find-leads href carries no `mode=market`
   and no `confirm=search`, ever.** Inline template strings in the JSX are how the two would drift
   back together.

   ⚠️ FIND LEADS SPENDS ON ARRIVAL, DELIBERATELY, AND THAT IS PAUL'S CALL 2026-08-11. A normal search
   is ~$0.11 of Google Places quota — and NOTHING within 72 hours of the last search of the same
   trade and town, because search-leads short-circuits on its own cache. The dialog that used to
   guard it is gone from this path on purpose: it was guarding the wrong flow, and a confirm on every
   navigation is what made the button feel like it did nothing. */

/** Where "Find leads" goes: the NORMAL lead search, pre-filled and run once on arrival.
 *  `run=search` is a ONE-SHOT INTENT, consumed and stripped by Find Leads exactly as `confirm=search`
 *  is — left in the URL it would re-run a paid search on every refresh and back button. */
export function findLeadsHref(trade: string, town: string): string {
  const q = new URLSearchParams({
    mode: 'leads',
    keyword: trade,
    location: town,
    run: 'search',
  });
  return `/find-leads?${q.toString()}`;
}

/** Where "Market view" goes: the market read for this trade and town — unchanged behaviour,
 *  including the arrival confirm on the rungs that have nothing measured. */
export function marketViewHref(trade: string, town: string, state: CoverageState): string {
  const q = new URLSearchParams({ mode: 'market', trade, town });
  if (wantsSearchConfirm(state)) q.set('confirm', 'search');
  return `/find-leads?${q.toString()}`;
}

/**
 * Should a "Market view" click on this row arrive with the lead-search confirm already open?
 *
 * ⚠️ IT USED TO BE ASKED OF THE FIND-LEADS BUTTON, because that button opened the market view. The
 * rule has not changed; the control it belongs to has. Find leads never carries this param at all —
 * see findLeadsHref.
 *
 * ⛔ WHAT WENT WRONG. The link carried `confirm=search` unconditionally, so clicking Find leads on a
 * town Paul had already measured opened a "Run the lead search? ~$0.14" modal ON TOP of the market
 * he had clicked through to READ. A dialog he did not ask for, covering the numbers he did, on the
 * page he uses all day. §6c's rule is about persisting a dialog; this is the same harm arriving by
 * another route.
 *
 * ⚠️ POSITIVE TEST, and on the rungs that mean NOTHING HAS BEEN MEASURED. `untouched` and `leads`
 * both have no completed market audit behind them, so their pool is stale or absent and the confirm
 * is the entire reason the link exists. Written this way round deliberately: a fifth rung added
 * later falls to `false`, which loses nobody a dialog they cannot re-open — the note on the market
 * panel carries the button. Written as `!== 'measured'` it would join the auto-modal side instead.
 *
 * ⚠️ AND IT IS ONLY A HINT. Coverage grades `measured` off a COMPLETED run, so a town whose audits
 * all failed still reads `leads` here and still carries the param. The decision that matters is
 * openArrivalSearchConfirm() in marketView.ts, which reads the market's own audit count once the
 * view has loaded. Same split as serveGate: the panel is presentation, the reader is the block.
 */
export function wantsSearchConfirm(state: CoverageState): boolean {
  return state === 'untouched' || state === 'leads';
}

export interface CoverageSummary {
  total: number;
  counts: Record<CoverageState, number>;
  /** Everything past `untouched` — the number "6 of 87 done" reports. */
  started: number;
}

/* Generic over the row so callers keep their own extra fields — the page carries suppression
   state alongside, and a signature fixed to CoverageRow would silently drop it. */
export function summarise(rows: readonly CoverageRow[]): CoverageSummary {
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
export function applyFilters<T extends CoverageRow>(rows: readonly T[], f: CoverageFilters): T[] {
  return rows.filter((r) => {
    if (f.region && r.region !== f.region) return false;
    if (r.population === null || r.population === undefined) return false;
    return r.population >= f.minPopulation && r.population <= f.maxPopulation;
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE MUTATION'S CACHE PATCH — pure, so it can be tested without a browser.

   ⛔ IT LIVES HERE RATHER THAN INSIDE useCoverage FOR THE SAME REASON THE GRADING DOES: a cache
   patch that only exists inside a hook closure cannot be asserted, and CLAUDE.md §6c is explicit
   that the mutation is the risky half of a React Query migration — "losing my place annoys me, a
   stale list makes me act on wrong data."

   ⛔ IT TAKES THE ROW THE SERVER RETURNED. Re-deriving what we assume the server wrote is how a
   cache starts lying: the previous implementation invented `new Date().toISOString()` for
   suppressed_at, a timestamp no row ever held.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** What the endpoint returns from suppress/unsuppress. Partial on purpose — see below. */
export interface SuppressionPatch {
  id?: string | null;
  suppressed_at?: string | null;
  suppressed_reason?: string | null;
}

export interface SuppressibleTown {
  id: string;
  suppressed_at: string | null;
  suppressed_reason: string | null;
}

/**
 * Patch one town's suppression from the server's own row.
 *
 * ⛔ RETURNS null WHEN IT CANNOT DO SO HONESTLY — no row, no id, or an id nothing matches. null
 * means "refetch instead", never "nothing changed": an endpoint deployed older than this code
 * returns no `town`, and guessing there would leave the operator looking at a list that disagrees
 * with the database. The absent value gets its own branch rather than falling through the else,
 * which is the shape CLAUDE.md records seven times.
 */
export function applySuppressionPatch<T extends SuppressibleTown>(
  towns: readonly T[],
  townId: string,
  updated: SuppressionPatch | null | undefined,
): T[] | null {
  if (!updated || !updated.id) return null;
  if (!towns.some((t) => t.id === townId)) return null;
  return towns.map((t) => (t.id === townId
    ? { ...t, suppressed_at: updated.suppressed_at ?? null, suppressed_reason: updated.suppressed_reason ?? null }
    : t));
}
