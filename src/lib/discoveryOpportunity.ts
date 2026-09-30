/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OPPORTUNITY PER QUESTION — the existing deterministic winnability classifier over a set of runs.

   ONE RULE, TWO SCREENS. This was `opportunityFor` inside src/pages/Baseline.tsx; the paid-client
   Discovery step needs the same verdict, so it lives here and both import it (CLAUDE.md §4: one rule
   written in N places). No provider call — it reads answers already collected.

   🔴 TWO RULERS ON ONE ROW (fixed 2026-09-30). "named in N of M runs" counted `named || self_named`
   per run, while the verdict read cellNamed() of a MERGED cell whose self_named was OR-ed as
   `false || undefined` → undefined — so a run whose model verdict said "not named" could fall back
   to another run's string match. The count and the verdict could disagree about the same answers.
   Now every answer is judged ONCE, by cellNamed(cell, ctx) — the report's ruler (answer text first
   when the business can be judged, then the model's verdict, then the stored flag) — per engine and
   per run; the counts ARE those judgements, and the merged cell the classifier reads carries the same
   answer as an explicit boolean. The verdict thresholds are unchanged.

   ⛔ THE COUNTS ARE PER ENGINE (ChatGPT 0/3 · Gemini 1/3), never one pooled "3/3". "3/3" alone read
   as "named 3 of 3" when it meant "3 of 3 measured" (Paul, 2026-09-30).

   IMPORTED BY AN EDGE FUNCTION (paid-baseline): relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { classifyWinnability, type EngineMap, type QueueRow } from './auditReport.ts';
import { cellNamed } from './namedSignal.ts';

export type OpportunityClass = 'named' | 'winnable' | 'possible' | 'low';

export const OPPORTUNITY_GROUP_LABELS: Record<OpportunityClass, string> = {
  winnable: 'Winnable',
  possible: 'Possible',
  named: 'Already named',
  low: 'Weak / low signal',
};

/** The engines a paid measurement is scored on (auditReport SCORED_ENGINES). */
export const TALLY_ENGINES = ['chatgpt', 'gemini'] as const;

/** One engine's record for one question: answers received and answers that named the business. */
export interface EngineTally { engine: string; complete: number; named: number }

export interface Opportunity {
  classification: OpportunityClass;
  /** The classifier's own verdict: named / open / contested / locked / no-local-race. */
  verdict: string;
  reason: string;
  clientNamed: boolean;
  fragmentation: string;
  /** In how many of the runs the client was named by any engine, of how many runs answered. */
  namedRuns: number;
  runs: number;
  /** Per engine: answers received (complete) and answers naming the business (named). */
  engines: EngineTally[];
  /** Firms the engines named instead (operator screens only — never a client page). */
  competitors: string[];
}

export interface OpportunityContext {
  businessName: string; location: string; website: string; trade?: string;
  isAggregatorUrl: (u: string) => boolean;
}

/** Per-engine tallies for one question's rows, with the one ruler. Pure. */
export function engineTallies(question: string, rows: QueueRow[], ctx: Pick<OpportunityContext, 'businessName' | 'location' | 'trade'>): EngineTally[] {
  const nctx = { businessName: ctx.businessName, trade: ctx.trade ?? null, town: ctx.location };
  const own = rows.filter((r) => r.question.trim() === question.trim());
  return TALLY_ENGINES.map((engine) => {
    let complete = 0, named = 0;
    for (const row of own) {
      const raw = ((row.result ?? {}) as EngineMap)[engine];
      if (!raw || typeof raw !== 'object') continue;
      complete++;
      if (cellNamed(raw, nctx)) named++;
    }
    return { engine, complete, named };
  });
}

export function opportunityFor(question: string, rows: QueueRow[], ctx: OpportunityContext): Opportunity {
  const nctx = { businessName: ctx.businessName, trade: ctx.trade ?? null, town: ctx.location };
  const own = rows.filter((r) => r.question.trim() === question.trim());
  const merged: EngineMap = {};
  let namedRuns = 0, runs = 0;
  for (const row of own) {
    const result = (row.result ?? {}) as EngineMap;
    let anyEngine = false, namedHere = false;
    for (const [engine, raw] of Object.entries(result)) {
      if (!raw || typeof raw !== 'object') continue;
      anyEngine = true;
      const isNamed = cellNamed(raw, nctx);
      namedHere = namedHere || isNamed;
      const cur = merged[engine] ?? { named: false, self_named: false, position: null, competitors: [], citations: [], answer_text: '' };
      /* The merged cell carries the SAME judgement as the counts, as an explicit boolean in both
         fields, so the classifier's cellNamed(merged) cannot fall back to a different ruler. */
      cur.named = !!cur.named || isNamed;
      cur.self_named = !!cur.self_named || isNamed;
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
  return {
    classification, verdict: result.verdict, reason: result.reason, clientNamed: result.clientNamed, fragmentation, namedRuns, runs,
    engines: engineTallies(question, rows, ctx), competitors: (result.namedFirms ?? []).slice(0, 5),
  };
}
