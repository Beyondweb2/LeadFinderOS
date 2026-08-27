/* ════════════════════════════════════════════════════════════════════════════════════════════
   NICHE VIEW — the outreach decision engine's shared types + pure helpers (Phase 1, 2026-08-28,
   Paul's spec). A NICHE is one trade folded across every town holding its audits: the automatic,
   repeatable version of the hand-run plumber recon (per-engine named rates, winnability counts,
   directory-vs-own-site source split).

   ⛔ DERIVED ON READ, NEVER STORED (the serveGate rule): the fold runs over the live audit rows in
   the market-view edge fn every time. No niche table, no stored verdict — a stored verdict freezes
   a stale rule.

   ⛔ THE FOLD IS BUSINESS-AUDITS-ONLY for the Phase-1 numbers, deliberately. Market audits carry
   real competitors/citations but their `named` flag was matched against a pseudo-name
   ("[market] Plumbers — Wythenshawe") and is meaningless — folding them in would dilute the named
   rates with structural zeros. They join in Phase 2 as separate intel, never mixed into the rates.

   ⛔ TWO STATISTICS, TWO RELIABILITIES (the sample-size honesty Paul mandated):
   - engine NAMED RATES + SOURCE SPLIT are per-ask counts — robust even from single-run audits;
   - per-question WINNABILITY flips ~18% on a single ask — only multi-run (majority) questions are
     trustworthy; single-run folds are INDICATIVE. Phase 1 reports the split; Phase 2's verdict
     tiers gate the confident wording on it.

   Pure + dependency-free: the edge fn and the SPA both import it. scripts/niche-view.test.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Fold a trade string to its niche key: lowercase, punctuation → space, each token stemmed of a
 *  trailing s — so Plumbers / plumber / plumbing DON'T all merge (plumbing keeps its g), but
 *  Plumbers/plumber/Plumber do. Same light stem the page plan uses. */
export function nicheTradeKey(trade: string | null | undefined): string {
  return String(trade ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length >= 4 && t.endsWith('s') ? t.slice(0, -1) : t))
    .join(' ');
}

export interface NicheEngineStats {
  engine: string;               // chatgpt | gemini | ai_overview | google_organic
  label: string;
  named: number;                // answered cells where the business was named
  answered: number;             // cells where this engine returned an answer
}

export interface NicheSourceSplit {
  engine: string;
  label: string;
  directory: number;            // isAggregatorUrl (Checkatrade/Yell/MyBuilder…)
  ownSite: number;              // the audited business's OWN domain
  authority: number;            // classifySource 'authority' (gov/NHS/…)
  other: number;                // everything else — mostly OTHER businesses' own sites
  total: number;
}

export interface NicheTopDomain { domain: string; count: number }

export interface NicheTownRow {
  town: string;
  businesses: number;           // distinct audited businesses in this town
  audits: number;
  cells: number;                // answered engine cells
}

export interface NicheAnalysis {
  trade: string;                // display form (most common raw spelling)
  tradeKey: string;
  sample: {
    audits: number;             // business audits with answers
    businesses: number;         // distinct business names
    towns: number;
    questions: number;          // distinct questions (per audit)
    cells: number;              // answered engine cells (all engines)
    multiRunAudits: number;     // baselines (baseline_target_runs > 1)
    multiRunQuestions: number;  // questions whose winnability comes from a majority fold
  };
  engines: NicheEngineStats[];
  winnability: Record<string, number>;   // open/named/contested/locked/no_local_race/unmeasured → question counts
  sources: NicheSourceSplit[];
  topDomains: Record<string, NicheTopDomain[]>;   // per engine, most-cited first
  towns: NicheTownRow[];
  marketAudits: number;         // market audits of this trade (NOT folded into the numbers — Phase 2 intel)
}

export const ENGINE_LABELS_NICHE: Record<string, string> = {
  chatgpt: 'ChatGPT', gemini: 'Gemini', ai_overview: 'Google AI Overview', google_organic: 'Google organic',
};

/** "109 of 476 (22.9%)" — the honest rate line; never a bare percentage without its n. */
export function rateLabel(named: number, answered: number): string {
  if (answered === 0) return 'no answers';
  return `${named} of ${answered} (${(100 * named / answered).toFixed(1)}%)`;
}

/** Percentage share for the source bars; 0 when the denominator is 0, never NaN. */
export function sharePct(part: number, total: number): number {
  return total > 0 ? Math.round((1000 * part) / total) / 10 : 0;
}
