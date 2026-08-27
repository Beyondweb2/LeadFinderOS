/* Tests for src/lib/nicheView.ts pure helpers. Run: npx tsx scripts/niche-view.test.ts */
import { nicheTradeKey, rateLabel, sharePct } from '../src/lib/nicheView.ts';

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
