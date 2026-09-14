/* Tests for src/lib/nicheView.ts pure helpers. Run: npx tsx scripts/niche-view.test.ts */
import { nicheTradeKey, rateLabel, sharePct, resultsBelongToTown } from '../src/lib/nicheView.ts';
import { townSearchKey, sortLeadsForDisplay } from '../src/lib/nicheView.ts';
import { nicheVerdict, type NicheAnalysis } from '../src/lib/nicheView.ts';

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


/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE SLOTS — the verdict this screen exists for (2026-09-14).

   🔴 IT USED TO GRADE ON NAMED RATES and fired "harder — ChatGPT already names them 64.4%" for
   Electricians: the engine pages cannot move, quoted because it was the biggest number on the row,
   answering a question nobody asked. A client does not need to WIN — AI returns a handful of names
   and they need to be one of them.

   ⛔ MEASURED, NOT CHOSEN. Across every churn-readable question on file, Gemini returns 3.7 names
   per answer and holds 1.3 every run; ChatGPT returns 5.2 and holds 2.4. So the engine the work
   moves is also the one with half the entrenchment — the reason to read slots on Gemini comes from
   the book, not from one client.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
{
  const base = (trade: string, readable: number, names: number, held: number): NicheAnalysis => ({
    trade, tradeKey: trade.toLowerCase(),
    sample: { audits: 40, businesses: 30, towns: 12, questions: 200, cells: 900, multiRunAudits: 4, multiRunQuestions: readable },
    engines: [{ engine: 'chatgpt', label: 'ChatGPT', named: 400, answered: 600 },
              { engine: 'gemini', label: 'Gemini', named: 100, answered: 600 }],
    winnability: { open: 120, locked: 10 },
    sources: [{ engine: 'gemini', label: 'Gemini', directory: 5, ownSite: 0, authority: 3, other: 60, total: 68 }],
    topDomains: {}, marketAudits: 0,
    slots: readable > 0 ? [{ engine: 'gemini', label: 'Gemini', readableQuestions: readable, namesPerAnswer: names, heldEveryRun: held }] : [],
  } as unknown as NicheAnalysis);

  console.log('\n-- the real trades, from the measured churn --');
  /* 🔴 THE CASE THAT PROMPTED THIS. Electricians is the LOOSEST trade in the book (1.3 held of 4.0)
     and the old rule called it "harder". */
  const elec = nicheVerdict(base('Electricians', 63, 4.0, 1.3));
  ok(elec.kind === 'worth_outreach', `Electricians reads worth_outreach, not "harder" (${elec.kind})`);
  ok(/about 3 slots rotate on Gemini/.test(elec.headline), 'and says how many slots rotate');
  ok(!/ChatGPT/.test(elec.headline), 'the headline never quotes ChatGPT');
  ok(!/harder/.test(elec.headline), 'and the word "harder" is gone');
  const plumb = nicheVerdict(base('Plumbers', 110, 4.6, 2.2));
  ok(plumb.kind === 'worth_outreach', `Plumbers reads worth_outreach (${plumb.kind})`);
  ok(/about 2 slots rotate/.test(plumb.headline), 'with 2 free slots, not 3');

  console.log('\n-- the tight and closed ends --');
  ok(nicheVerdict(base('Tilers', 40, 4.0, 2.6)).kind === 'mixed', '1.4 free slots is tight');
  const shut = nicheVerdict(base('Mobile mechanics', 40, 4.0, 3.4));
  ok(shut.kind === 'avoid', '0.6 free slots is avoid');
  /* ⛔ THE NUMBER MUST NOT ARGUE WITH THE VERDICT. Rounding 0.6 to "about 1 slot" put "1 slot
     rotates" directly beside "the same firms hold every slot". */
  ok(/0\.6 slots rotate/.test(shut.headline), 'and it shows 0.6, not a rounded 1');

  console.log('\n-- ⛔ NOT MEASURED IS ITS OWN STATE, never a soft "tight" --');
  /* Only 7.1% of question×engine buckets on file carry repeat runs, so this is the common case. */
  const none = nicheVerdict(base('Roofers', 0, 0, 0));
  ok(none.kind === 'no_verdict', 'no repeat data at all → no_verdict, not mixed');
  ok(/not enough repeat data/.test(none.headline), 'and says so in those words');
  const thin = nicheVerdict(base('Tilers', 3, 4.1, 1.2));
  ok(thin.kind === 'no_verdict', `3 readable questions is below the floor → no_verdict (${thin.kind})`);
  ok(/need 8/.test(thin.headline), 'the headline names the floor it missed');
  ok(/3-run baselines/.test(thin.headline), 'and what to do about it');
  /* Plenty of spread but no repeats must STILL refuse: spread is not repetition. */
  ok(nicheVerdict(base('Roofers', 0, 0, 0)).kind === 'no_verdict', 'a wide but single-run niche is still unmeasured');

  console.log('\n-- openShare / lockedShare are supporting detail, not the verdict --');
  const locked = base('Locksmiths', 60, 4.2, 1.8);
  (locked as { winnability: Record<string, number> }).winnability = { open: 5, locked: 200 };
  ok(nicheVerdict(locked).kind === 'worth_outreach',
     'a heavily "locked" niche with free slots is still worth outreach — locked measured the wrong thing');
  ok(nicheVerdict(locked).reasons.some((r) => /open/.test(r)), 'and the open/locked split survives in the reasons');
}
