/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OPPORTUNITY PER QUESTION — the existing deterministic winnability classifier over a set of runs.

   ONE RULE, TWO SCREENS. This was `opportunityFor` inside src/pages/Baseline.tsx; the paid-client
   Discovery step needs the same verdict, so it lives here and both import it (CLAUDE.md §4: one rule
   written in N places). No provider call — it reads answers already collected.

   ⛔ INFORMATION, NEVER SELECTION. The balanced baseline generator does not read these verdicts
   (src/lib/baselineMix.ts). A baseline built from the easiest questions would flatter the client.

   IMPORTED BY AN EDGE FUNCTION (paid-baseline): relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { classifyWinnability, type EngineMap, type QueueRow } from './auditReport.ts';

export type OpportunityClass = 'named' | 'winnable' | 'possible' | 'low';

export const OPPORTUNITY_GROUP_LABELS: Record<OpportunityClass, string> = {
  winnable: 'Winnable',
  possible: 'Possible',
  named: 'Already strong / named',
  low: 'Weak / low signal',
};

export interface Opportunity {
  classification: OpportunityClass;
  reason: string;
  clientNamed: boolean;
  fragmentation: string;
  /** In how many of the runs the client was named by any engine, of how many runs answered. */
  namedRuns: number;
  runs: number;
}

export function opportunityFor(
  question: string, rows: QueueRow[], ctx: { businessName: string; location: string; website: string; isAggregatorUrl: (u: string) => boolean },
): Opportunity {
  const own = rows.filter((r) => r.question.trim() === question.trim());
  const merged: EngineMap = {};
  let namedRuns = 0, runs = 0;
  for (const row of own) {
    const result = (row.result ?? {}) as EngineMap;
    let anyEngine = false, namedHere = false;
    for (const [engine, raw] of Object.entries(result)) {
      if (!raw || typeof raw !== 'object') continue;
      anyEngine = true;
      namedHere = namedHere || !!raw.named || !!raw.self_named;
      const cur = merged[engine] ?? { named: false, position: null, competitors: [], citations: [], answer_text: '' };
      cur.named = cur.named || !!raw.named;
      cur.self_named = cur.self_named || raw.self_named;
      cur.position = cur.position == null ? raw.position : raw.position == null ? cur.position : Math.min(cur.position, raw.position);
      cur.competitors = [...new Set([...cur.competitors, ...(raw.competitors ?? [])])];
      cur.citations = [...cur.citations, ...(raw.citations ?? [])].filter((c, i, a) => a.findIndex((x) => x.url === c.url) === i);
      cur.answer_text = cur.answer_text || raw.answer_text;
      merged[engine] = cur;
    }
    if (anyEngine) { runs++; if (namedHere) namedRuns++; }
  }
  const result = classifyWinnability(merged, { businessName: ctx.businessName, locationText: ctx.location, ownWebsite: ctx.website, isAggregatorUrl: ctx.isAggregatorUrl });
  const classification: OpportunityClass = result.clientNamed ? 'named' : result.verdict === 'open' ? 'winnable' : result.verdict === 'contested' ? 'possible' : 'low';
  const fragmentation = result.U >= 6 ? 'highly fragmented' : result.C === 0 && result.U >= 2 ? 'fragmented across engines' : result.U <= 3 && result.C >= 2 ? 'dominant competitors' : 'mixed competition';
  return { classification, reason: result.reason, clientNamed: result.clientNamed, fragmentation, namedRuns, runs };
}
