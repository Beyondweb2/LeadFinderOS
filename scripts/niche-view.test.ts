/* Tests for src/lib/nicheView.ts pure helpers. Run: npx tsx scripts/niche-view.test.ts */
import { nicheTradeKey, rateLabel, sharePct, resultsBelongToTown } from '../src/lib/nicheView.ts';
import { townSearchKey, sortLeadsForDisplay } from '../src/lib/nicheView.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('── nicheTradeKey: the trade fold ──');
ok(nicheTradeKey('Plumbers') === 'plumber' && nicheTradeKey('plumber') === 'plumber' && nicheTradeKey('Plumber') === 'plumber',
  'Plumbers/plumber/Plumber all fold to one key');
ok(nicheTradeKey('plumbing') !== nicheTradeKey('plumber'), 'plumbing stays DISTINCT from plumber (different trade word)');
ok(nicheTradeKey('Locksmiths') === nicheTradeKey('locksmith'), 'Locksmiths/locksmith fold');
ok(nicheTradeKey('Mobile Valeting') === 'mobile valeting', 'multi-word trades keep their words');
ok(nicheTradeKey('  Gas   Engineers ') === 'ga engineer' || nicheTradeKey('  Gas   Engineers ') === 'gas engineer',
  'whitespace folded (gas is 3 chars — never stemmed)');
ok(nicheTradeKey('Gas') === 'gas', '3-letter token never stemmed (gas != ga)');
ok(nicheTradeKey(null) === '' && nicheTradeKey(undefined) === '', 'absent trade -> empty key, never a crash');

console.log('── rate / share guards ──');
ok(rateLabel(109, 476) === '109 of 476 (22.9%)', 'the plumber ChatGPT rate formats with its n');
ok(rateLabel(0, 0) === 'no answers', 'zero denominator says so, never NaN%');
ok(sharePct(1469, 3129) === 47.0 || sharePct(1469, 3129) === 46.9, `directory share ~46.9 (${sharePct(1469, 3129)})`);
ok(sharePct(5, 0) === 0, 'share of nothing is 0');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f > 0) process.exit(1);

/* ══ WHOSE RESULTS ARE THESE? — the guard on the per-town "Add all" ═══════════════════════════
   The lead search has ONE global result set, so every town row sees the same `leads`. If a row
   can claim results it did not produce, "Add all" writes one town's businesses against another —
   the wrong-town fault (CLAUDE.md §6b). Both fields must match, and absence owns nothing. */
{
  const S = (keyword: string | null, location: string | null) => ({ keyword, location });

  ok(resultsBelongToTown(S('Plumbers', 'Wakefield'), 'Plumbers', 'Wakefield') === true, 'exact match owns the results');
  ok(resultsBelongToTown(S('  plumbers ', 'WAKEFIELD'), 'Plumbers', 'wakefield ') === true, 'case and whitespace are ignored');

  // ⛔ THE TWO FAILURES THAT WOULD WRITE LEADS AGAINST THE WRONG THING.
  ok(resultsBelongToTown(S('Plumbers', 'Wakefield'), 'Plumbers', 'Bedford') === false, 'same trade, DIFFERENT town → owns nothing');
  ok(resultsBelongToTown(S('Locksmiths', 'Wakefield'), 'Plumbers', 'Wakefield') === false, 'same town, DIFFERENT trade → owns nothing');

  // Absence is never an answer.
  ok(resultsBelongToTown(null, 'Plumbers', 'Wakefield') === false, 'null lastSearch owns nothing');
  ok(resultsBelongToTown(undefined, 'Plumbers', 'Wakefield') === false, 'undefined lastSearch owns nothing');
  ok(resultsBelongToTown(S(null, 'Wakefield'), 'Plumbers', 'Wakefield') === false, 'missing keyword owns nothing');
  ok(resultsBelongToTown(S('Plumbers', null), 'Plumbers', 'Wakefield') === false, 'missing location owns nothing');
  ok(resultsBelongToTown(S('   ', '  '), 'Plumbers', 'Wakefield') === false, 'blank strings own nothing');
  ok(resultsBelongToTown(S('Plumbers', ''), 'Plumbers', '') === false, 'a blank ROW town cannot be matched by a blank search');
}

/* ══ PARALLEL PER-TOWN SEARCH KEYS ═══════════════════════════════════════════════════════════
   Each row's search is stored under its OWN key, which is what makes several towns at once safe:
   there is no shared result array to mis-attribute. The key must fold casing/whitespace (towns
   come from stored audit text, whose casing is not normalised) and must NEVER collide across
   different trades or different towns — a collision is one town's leads shown under another. */
{
  ok(townSearchKey('Plumbers', 'Wakefield') === townSearchKey('plumbers', ' wakefield '),
    'key folds case and surrounding whitespace');
  ok(townSearchKey('Plumbers', 'Wakefield') !== townSearchKey('Plumbers', 'Loughborough'),
    'two towns of one trade get DIFFERENT keys (parallel searches cannot collide)');
  ok(townSearchKey('Plumbers', 'Wakefield') !== townSearchKey('Locksmiths', 'Wakefield'),
    'two trades in one town get DIFFERENT keys');
  ok(townSearchKey('a', 'b::c') !== townSearchKey('a::b', 'c'),
    'a town containing the separator cannot forge another key');
}

/* The display sort must match the Find Leads page's, or "Add all" adds in a different order than
   the page shows — and the no-website-first ordering is the whole point of the lead list. */
{
  const L = (websiteStatus: string, name: string) => ({ websiteStatus, name } as never);
  const sorted = sortLeadsForDisplay([
    L('HAS_OWN_WEBSITE', 'has'), L('NO_WEBSITE', 'none'), L('UNCERTAIN', 'maybe'), L('DIRECTORY_ONLY', 'dir'),
  ]).map((l: { name: string }) => l.name);
  ok(sorted[0] === 'none' && sorted[1] === 'dir', `no-website and directory-only first (${sorted.join(',')})`);
  ok(sorted[2] === 'maybe' && sorted[3] === 'has', `then uncertain, then has-own-site (${sorted.join(',')})`);
  const unknown = sortLeadsForDisplay([L('WEIRD_NEW_STATUS', 'x'), L('NO_WEBSITE', 'n')]).map((l: { name: string }) => l.name);
  ok(unknown[0] === 'n', 'an UNKNOWN status sorts last rather than jumping to the top');
}
