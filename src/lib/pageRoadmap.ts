/* ════════════════════════════════════════════════════════════════════════════════════════════
   PAGE ROADMAP — the content roadmap that falls out of the measurement data automatically.

   For a business's measured questions, join to the pages that already exist (client_pages via
   client_page_questions, keyed on the VERBATIM question text) and answer, per question:
     • named / not-named per engine (ChatGPT, Gemini, Google AI Overview), as a rate over runs;
     • the TWO FAILURE MODES the audit already captures — "absent" (nobody, or off-intent) vs
       "named-but-wrong" (the engine named competitors instead), surfaced via each engine's
       competitors list on the not-named answers;
     • whether a PAGE exists for it — and the questions with NO page ARE the content roadmap.

   ⛔ PURE + DEPENDENCY-FREE (same rule as pagePlan.ts): the SPA and any edge function import this,
   so the in-app roadmap view and a script read cannot drift. The DB fetch lives in the caller;
   this only folds rows + page keys into the roadmap. Matched on normalised question text so a
   measurement audit links to a page created from the same question, regardless of which audit
   measured it.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** One engine's outcome for a question, aggregated across the audit's runs. */
export interface EngineScore {
  named: number;      // answers where the business WAS named
  total: number;      // answers seen for this engine (0 = engine never answered, e.g. no AI Overview)
  /** Competitors named on the NOT-named answers — the "named-but-wrong" failure mode. Absent list = "absent". */
  namedInstead: string[];
}

export interface RoadmapRow {
  question: string;
  engines: Record<string, EngineScore>;
  hasPage: boolean;
  pageSlug: string | null;
}

export interface PageRoadmap {
  rows: RoadmapRow[];
  /** Measured questions with NO page — the content roadmap, in worst-visibility-first order. */
  gaps: RoadmapRow[];
  covered: RoadmapRow[];
}

/** A single engine's result on one measured answer, as stored in ai_audit_queue.result[engine]. */
export interface EngineResult { named?: boolean | null; competitors?: string[] | null }
/** One measured queue row: the verbatim question + its per-engine results. */
export interface MeasuredRow { question: string; result: Record<string, EngineResult> | null }

const norm = (s: string): string => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Total named-share across all engines — drives worst-first ordering of the roadmap. */
function overallShare(engines: Record<string, EngineScore>): number {
  let named = 0, total = 0;
  for (const e of Object.values(engines)) { named += e.named; total += e.total; }
  return total === 0 ? 0 : named / total;
}

export function buildPageRoadmap(
  rows: readonly MeasuredRow[],
  pageQuestionTexts: readonly string[],
  engines: readonly string[] = ['chatgpt', 'gemini', 'ai_overview'],
): PageRoadmap {
  // question text (verbatim) → { pageSlug } for pages that already exist. Keyed normalised.
  const pageByQ = new Set(pageQuestionTexts.map(norm));

  // Fold the queue rows (one per question per run) by question, per engine.
  const byQ = new Map<string, { question: string; engines: Record<string, EngineScore> }>();
  for (const row of rows) {
    const q = String(row.question ?? '').trim();
    if (!q) continue;
    const key = norm(q);
    let entry = byQ.get(key);
    if (!entry) {
      entry = { question: q, engines: {} };
      for (const e of engines) entry.engines[e] = { named: 0, total: 0, namedInstead: [] };
      byQ.set(key, entry);
    }
    const res = row.result ?? {};
    for (const e of engines) {
      const r = res[e];
      if (!r || typeof r !== 'object') continue; // engine didn't answer this row (e.g. no AI Overview)
      entry.engines[e].total += 1;
      if (r.named === true) entry.engines[e].named += 1;
      else for (const c of (r.competitors ?? [])) {
        const name = String(c ?? '').trim();
        if (name && !entry.engines[e].namedInstead.includes(name)) entry.engines[e].namedInstead.push(name);
      }
    }
  }

  const rowsOut: RoadmapRow[] = [...byQ.values()].map((v) => ({
    question: v.question,
    engines: v.engines,
    hasPage: pageByQ.has(norm(v.question)),
    pageSlug: null, // slug is attached by the caller if it has the map; the roadmap only needs has/hasn't
  }));

  // Worst-visibility first — the questions where you're least named come top of the roadmap.
  rowsOut.sort((a, b) => overallShare(a.engines) - overallShare(b.engines));

  return {
    rows: rowsOut,
    gaps: rowsOut.filter((r) => !r.hasPage),
    covered: rowsOut.filter((r) => r.hasPage),
  };
}
