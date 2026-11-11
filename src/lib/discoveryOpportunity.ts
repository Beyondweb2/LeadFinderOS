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

import { isRealCompetitor, type EngineMap, type QueueRow } from './auditReport.ts';
import { oppQuestion, type OppRow } from './reportOpportunity.ts';
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

/* ⛔ REPLACED 2026-11-11 (Paul). This used to read classifyWinnability over a MERGED cell, which counted distinct
   firms across runs and so marked all 40 questions of London Domestic Maintenance "winnable". It now applies the ONE
   written rule in reportOpportunity.ts (Winnable / Possible / Hard over counts across every answer; fragmented alone is
   never enough). The Discovery screens, the paid-baseline function and the client reports all read that same rule.
   classifyWinnability itself was then RETIRED too (2026-11-11): page-generator, action-plan and market-view call the same
   rule through ruleVerdict, so every screen and report agrees. */
export function opportunityFor(question: string, rows: QueueRow[], ctx: OpportunityContext): Opportunity {
  const nctx = { businessName: ctx.businessName, trade: ctx.trade ?? null, town: ctx.location };
  const own = rows.filter((r) => r.question.trim() === question.trim());
  let namedRuns = 0, runs = 0;
  for (const row of own) {
    const result = (row.result ?? {}) as EngineMap;
    let anyEngine = false, namedHere = false;
    for (const raw of Object.values(result)) {
      if (!raw || typeof raw !== 'object') continue;
      anyEngine = true;
      namedHere = namedHere || cellNamed(raw, nctx);
    }
    if (anyEngine) { runs++; if (namedHere) namedRuns++; }
  }
  const q = oppQuestion(question, own as unknown as OppRow[], {
    businessName: ctx.businessName, services: [],
    isNamed: (c) => cellNamed(c as never, nctx),
    isRival: (n) => isRealCompetitor(n, ctx.location),
    isDirectoryHost: (h) => ctx.isAggregatorUrl('https://' + h),
  });
  const clientNamed = namedRuns > 0;
  const classification: OpportunityClass = clientNamed || q.tier === 'named' ? 'named' : q.tier === 'lots' ? 'winnable' : q.tier === 'some' ? 'possible' : 'low';
  const verdict = clientNamed || q.tier === 'named' ? 'named' : q.tier === 'lots' ? 'open' : q.tier === 'some' ? 'contested' : q.tier === 'nofirms' ? 'no-local-race' : q.tier === 'flagged' || q.tier === 'notoffered' ? 'unmeasured' : 'locked';
  const fragmentation = q.tier === 'lots' ? 'highly fragmented' : q.tier === 'little' ? 'dominant competitors' : 'mixed competition';
  return {
    classification, verdict, reason: q.reasons[0] ?? '', clientNamed, fragmentation, namedRuns, runs,
    engines: engineTallies(question, rows, ctx), competitors: q.firms.map((f) => f.name),
  };
}
