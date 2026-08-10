/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE TRADES, AS A FIXED LIST.

   ⛔ WHY A FIXED LIST AND NOT A FUZZY MATCH. Paul's call, and the right one: a learning mapping
   would quietly merge two trades that should be separate. "Mobile valeting" and "car detailing"
   are the live example — a £20 wash and a £200 detail are not the same purchase and their
   competitor sets should not be mixed — and no similarity score should be allowed to decide that.

   ⛔ WHAT THIS FIXES. business_type is stored as whatever was typed, so the same trade appears
   under several spellings and every per-trade view double-counts. Measured 2026-08-08 across
   ai_audits:
       52 "plumber"      10 "plumbers"
       41 "locksmiths"
       19 "accountant"    9 "accountants"
       15 "driving instructors"   2 "driving instructor"
       12 "electrician"   4 "electricians"
       10 "mobile mechanics"
        5 "mobile valeting and detailing"
   That is 69 trade+town pairs presenting as more than they are — Kettering would appear twice for
   the same trade in a coverage view keyed on the raw string.

   ⚠️ THIS IS A DISPLAY AND GROUPING LAYER ONLY. Nothing here rewrites a stored business_type: the
   audits, the questions and the reports keep the exact words that were used, because those are the
   record of what was measured. canonicalTrade() maps a stored string ONTO this list at read time,
   which is the same reason serveGate derives its verdict rather than storing it.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface Trade {
  /** Stable key. Never rendered, never changes once used — coverage state is grouped on it. */
  slug: string;
  /** What the operator sees. */
  label: string;
  /** Lowercased spellings that map here. The canonical label is matched implicitly. */
  aliases: string[];
}

/* ⛔ ADD A TRADE HERE WHEN A NEW NICHE STARTS. One entry, one line — that is the "obvious way to
   add one" Paul asked for, and it is deliberately a code change rather than a UI form: adding a
   trade is a decision about what the business sells, made a handful of times a year, not data
   entry. A form would invite exactly the near-duplicate entries this list exists to prevent. */
export const TRADES: Trade[] = [
  { slug: "plumber", label: "Plumbers", aliases: ["plumber", "plumbers", "plumbing"] },
  { slug: "locksmith", label: "Locksmiths", aliases: ["locksmith", "locksmiths"] },
  { slug: "electrician", label: "Electricians", aliases: ["electrician", "electricians"] },
  { slug: "accountant", label: "Accountants", aliases: ["accountant", "accountants", "bookkeeper", "bookkeepers"] },
  { slug: "driving-instructor", label: "Driving instructors", aliases: ["driving instructor", "driving instructors", "driving school", "driving schools"] },
  { slug: "mobile-mechanic", label: "Mobile mechanics", aliases: ["mobile mechanic", "mobile mechanics"] },
  /* ⚠️ ONE TRADE FOR NOW, AND THIS IS THE ONE TO REVISIT. The five existing audits were run as
     "mobile valeting and detailing", so splitting the slug today would orphan them from their own
     history. Paul's read is that these are two purchases; when he wants them separate, add a
     "car-detailing" entry and move its aliases across — the audits keep their stored wording either
     way, so nothing is lost by waiting. */
  { slug: "mobile-valeting", label: "Mobile valeting & detailing", aliases: ["mobile valeting and detailing", "mobile valeting", "car valeting", "valeting"] },
];

/** Normalise the way market-view's own `norm()` does, so the two agree about what a trade string is.
 *  Declared ABOVE the index because the index is built with it — see the block below. */
function norm(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const BY_ALIAS = new Map<string, Trade>();
for (const t of TRADES) {
  /* ⛔ KEYED ON THE NORMALISED FORM, BECAUSE THAT IS WHAT THE LOOKUP USES. They used to disagree:
     keys were raw-lowercased, lookups were normalised. Invisible for every name without
     punctuation, and silently fatal for one with it.
     "Mobile valeting & detailing" — the label in the trade PICKER — normalises to
     "mobile valeting detailing" and matched neither its own raw key nor the alias
     "mobile valeting and detailing". So canonicalTrade(its own label) returned NULL, and the
     Coverage page graded that trade 0 of 590 untouched while a Cambridge market audit and its leads
     sat in the database.
     ⚠️ FOUND BY READING REAL OUTPUT, NOT BY A TEST. Every other label round-trips, so the suite
     passed and the page was quietly wrong — the shape CLAUDE.md keeps recording. The round trip is
     now asserted for ALL labels, which is the assertion that would have caught it. */
  BY_ALIAS.set(norm(t.label), t);
  BY_ALIAS.set(t.slug, t);
  for (const a of t.aliases) BY_ALIAS.set(norm(a), t);
}

/**
 * Map a stored business_type onto the fixed list.
 *
 * ⚠️ RETURNS null FOR ANYTHING UNRECOGNISED, and that is deliberate: an unknown trade must show as
 * unknown, never be guessed into the nearest neighbour. "kava cafe, pool bar" (one real audit,
 * Paul's own bar) has no business being folded into a trade he sells to. Absence is not an answer
 * here either — the caller decides what to do with an unmapped string, and the honest thing on
 * screen is to list it separately rather than silently attach it to Plumbers.
 */
export function canonicalTrade(businessType: string | null | undefined): Trade | null {
  const n = norm(businessType ?? "");
  if (!n) return null;
  return BY_ALIAS.get(n) ?? null;
}

/** Convenience for grouping: the slug, or the raw normalised string when unrecognised. */
export function tradeKey(businessType: string | null | undefined): string {
  return canonicalTrade(businessType)?.slug ?? norm(businessType ?? "") ?? "";
}

/* ── THE SIZE BAND THE COVERAGE LIST DEFAULTS TO ─────────────────────────────────────────────────
   ⛔ 210k, NOT 200k. Norwich is 200,770 and Paul has worked it — a 200k ceiling would have hidden a
   town he had already done, and the first thing he would have done is wonder where it went. A
   default that hides real work is worse than one that shows a few towns too many.
   ⚠️ The TABLE is seeded 12k–250k, deliberately wider than this, so the edges can be examined by
   changing a filter rather than re-seeding. Soham at ~11k is below the seed floor and stays out:
   it proved the floor is real. */
export const TOWN_BAND_DEFAULT_MIN = 15_000;
export const TOWN_BAND_DEFAULT_MAX = 210_000;
/** What the table actually holds — the outer bound of any filter the UI can offer. */
export const TOWN_SEED_MIN = 12_000;
export const TOWN_SEED_MAX = 250_000;
