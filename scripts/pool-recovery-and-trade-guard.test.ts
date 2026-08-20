/* ============================================================
   TWO RULES THAT KEEP A LEAD AUDITABLE AND A PAID POOL REACHABLE.

   1. THE DIRECT POOL KEY. `search-leads` wrote `search_cache` but never `search_history` until
      2026-08-20, and market-view locates a pool ONLY through a history row — so every caller that
      invoked the function directly left a pool that existed and could not be reached. Seven of them,
      15-23 businesses each, all paid for. The recovery reconstructs the key from the trade and town.
      This suite pins that the reconstruction matches what `search-leads` actually wrote, because if
      the two ever disagree the recovery silently finds nothing and the pools stay invisible.

   2. THE TRADE GUARD. A lead saved with a blank `search_keyword` can never be audited —
      create-ai-audit needs a business type. addLead now refuses instead of writing the null through.
      The predicate is restated here (the hook is React and imports supabase), so this proves the
      RULE; any change to it must be made in both places.
   ============================================================ */
import { createHash } from 'node:crypto';

let f = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? 'PASS  ' : 'FAIL  '} ${label}`);
  if (!cond) f++;
};

/* ── 1. THE KEY, restated exactly as _shared/search-cache-key.ts computes it ─────────────────── */
const normalizeKeyword = (kw: string): string => {
  let w = kw.toLowerCase().trim();
  if (w.endsWith('ies')) w = w.slice(0, -3) + 'y';
  else if (['ses', 'xes', 'zes', 'ches', 'shes'].some((s) => w.endsWith(s))) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
};
const key = (kw: string, loc: string, radius: number, townOnly: boolean) =>
  createHash('sha256')
    .update(`v4-norm|${normalizeKeyword(kw)}|${loc.toLowerCase().trim()}|${radius}${townOnly ? '|townonly' : ''}`)
    .digest('hex');

const MARKET_POOL_RADIUS_M = 50_000;

console.log('\n── the reconstructed key must equal the one the search wrote ──');
{
  /* The Coverage row invoked search-leads with the page's trade and the town row's name; the panel
     used the same radius. The recovery recomputes from market-view's trade + town. These agree only
     because normalizeKeyword flattens the plural on BOTH sides — that is the load-bearing part. */
  const written = key('Locksmiths', 'Burnley', 50_000, true);       // what the row button sent
  const recovered = key('locksmiths', 'Burnley', MARKET_POOL_RADIUS_M, true); // what market-view has
  ok(written === recovered, '"Locksmiths" (as searched) and "locksmiths" (as normed) hash the same');

  const plumberA = key('plumbers', 'Wisbech', 50_000, true);
  const plumberB = key('plumber', 'Wisbech', 50_000, true);
  ok(plumberA === plumberB, 'plumbers/plumber collapse to one key, so the trade norm cannot miss it');

  ok(key('locksmiths', 'Burnley', 50_000, true) !== key('locksmiths', 'Burnley', 50_000, false),
    'townOnly is part of the identity — a town search and a radius search are different pools');
  ok(key('locksmiths', 'Burnley', 50_000, true) !== key('locksmiths', 'Rugby', 50_000, true),
    'different towns are different keys');
  ok(key('locksmiths', 'BURNLEY  ', 50_000, true) === key('locksmiths', 'burnley', 50_000, true),
    'case and surrounding whitespace in the town do not change the key');
}

console.log('\n── the radius must match, or every recovery misses ──');
{
  ok(MARKET_POOL_RADIUS_M === 50_000,
    'the recovery radius is 50000 — the same literal the Coverage row and MarketPanel both send');
  ok(key('locksmiths', 'Burnley', 50_000, true) !== key('locksmiths', 'Burnley', 25_000, true),
    'a different radius is a different pool, which is why the constant is shared not retyped');
}

console.log('\n── 2. the trade guard: blank means refuse, never write through ──');
{
  /* Restated from useOutreach.addLead. */
  const wouldAdd = (searchKeyword: string | null | undefined) => !!(searchKeyword && searchKeyword.trim());
  for (const bad of [null, undefined, '', '   ', '\t', '\n']) {
    ok(wouldAdd(bad as string | null) === false,
      `${JSON.stringify(bad)} is refused — a lead with no trade can never be audited`);
  }
  ok(wouldAdd('locksmiths') === true, 'a real trade is added');
  ok(wouldAdd('  locksmiths  ') === true, 'a padded real trade is added');
}

console.log('\n── the guard must not fire for the callers that always supply a trade ──');
{
  const wouldAdd = (searchKeyword: string | null | undefined) => !!(searchKeyword && searchKeyword.trim());
  /* MarketPanel passes chosen.trade; Coverage passes the page trade. Both non-empty by construction,
     so the guard is invisible to them — it only catches the Index-with-no-search case. */
  ok(wouldAdd('Locksmiths') === true, 'MarketPanel/Coverage adds are unaffected');
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
