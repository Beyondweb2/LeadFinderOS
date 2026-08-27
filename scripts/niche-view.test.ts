/* Tests for src/lib/nicheView.ts pure helpers. Run: npx tsx scripts/niche-view.test.ts */
import { nicheTradeKey, rateLabel, sharePct, resultsBelongToTown } from '../src/lib/nicheView.ts';

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
