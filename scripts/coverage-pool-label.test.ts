/* ============================================================
   THE COVERAGE ROW'S POOL LABEL — hasLeadPool, and why absence must read as "yes".

   ⛔ WHY THIS EXISTS. A town can be Measured with NO lead pool: measured 2026-08-20, 20 of 42
   measured markets (48%) had none, because two of the three ways to start a market audit run a lead
   search and the panel's own audit button does not. The row therefore has to label its button from a
   fact that is INDEPENDENT of the grade, and get the unknown case right:

     * `pooledPairs` ABSENT (an older `coverage` deploy sends no `pooled`) must mean "assume a pool",
       not "no pool". Reading absence as no would relabel every row in the table with a priced
       "Find leads · ~9p" button during a deploy window — inventing a spend out of missing
       information. That is the absent-value shape CLAUDE.md records fourteen times, pointed at
       money.
     * The fold must be coverageKey's, so `Locksmiths` and `locksmiths` are ONE market. The real
       Eastbourne case had both spellings.
   ============================================================ */
import { coverageKey, hasLeadPool, type CoverageFacts } from '../src/lib/coverageState.ts';

let f = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? 'PASS  ' : 'FAIL  '} ${label}`);
  if (!cond) f++;
};

const town = (name: string) => ({
  id: name.toLowerCase(),
  name,
  region: 'x',
  county: null,
  population: 1,
  suppressed_at: null,
  suppressed_reason: null,
} as unknown as Parameters<typeof hasLeadPool>[1]);

const factsWith = (pooled: string[] | undefined): CoverageFacts => ({
  measuredCounts: new Map(),
  leadPairs: new Set(),
  workedPairs: new Set(),
  pooledPairs: pooled ? new Set(pooled) : undefined,
});

console.log('\n── the unknown case is the dangerous one ──');
{
  ok(hasLeadPool('locksmiths', town('Chester'), factsWith(undefined)) === true,
    'pooledPairs ABSENT reads as "assume a pool" — never as a priced Find-leads label');
  ok(hasLeadPool('locksmiths', town('Chester'), factsWith([])) === false,
    'an EMPTY set is a real answer ("no town has one") and is honoured');
}

console.log('\n── present/absent for a specific pair ──');
{
  const facts = factsWith([coverageKey('locksmiths', 'Chester')]);
  ok(hasLeadPool('locksmiths', town('Chester'), facts) === true, 'the pooled pair reads as pooled');
  ok(hasLeadPool('locksmiths', town('Wakefield'), facts) === false, 'a different town does not');
  ok(hasLeadPool('plumbers', town('Chester'), facts) === false, 'a different trade in the same town does not');
}

console.log('\n── the fold: case and plural drift must not split one market ──');
{
  /* The endpoint sends pairs RAW; coverageKey canonicalises on this side. If the label used raw
     strings, the real Eastbourne market that carries both `Locksmiths` and `locksmiths` would show
     a pool for one spelling and a priced search for the other. */
  const facts = factsWith([coverageKey('Locksmiths', 'Eastbourne')]);
  ok(hasLeadPool('locksmiths', town('Eastbourne'), facts) === true,
    'a pool stored under "Locksmiths" is found for "locksmiths"');
  const factsPl = factsWith([coverageKey('plumbers', 'Bourne')]);
  ok(hasLeadPool('plumber', town('Bourne'), factsPl) === true,
    'and "plumbers" folds to "plumber" (canonicalTrade), so the singular finds it');
}

console.log('\n── town keys ignore the noise coverageTownKey ignores ──');
{
  const facts = factsWith([coverageKey('locksmiths', 'Bourne uk')]);
  ok(hasLeadPool('locksmiths', town('Bourne'), facts) === true,
    '"Bourne uk" (as stored by a search) matches the town row "Bourne"');
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
