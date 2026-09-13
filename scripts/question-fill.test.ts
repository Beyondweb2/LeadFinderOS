/* The generator's fill rule: exclude → dedupe (by intent) → slice → top up. Pins the two live
   faults of 2026-09-13 (12 → 11, 20 → 18) and the plural collision ("safe"/"safes"). */
import { fillToTarget, dedupeByIntent, questionIntentKey } from '../src/lib/questionFill.ts';
import { questionKey } from '../src/lib/seedGuard.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const T = ' in Newcastle upon tyne UK';

console.log('── Intent identity folds plurals, and nothing more ──');
ok(questionIntentKey(`safe installation${T}`) === questionIntentKey(`safes installation${T}`), 'safe / safes installation are one intent');
ok(questionIntentKey(`emergency lockout service${T}`) === questionIntentKey(`Emergency lockout services${T}!`), 'service / services, case and punctuation');
ok(questionIntentKey(`property management${T}`) === questionIntentKey(`properties management${T}`), '-ies folds to -y');
ok(questionIntentKey('gas boiler') !== questionIntentKey('ga boiler'), 'a three-letter word is never folded ("gas" is not "ga")');
ok(questionIntentKey('glass repair') === questionKey('glass repair'), 'a double-s word is left alone ("glass")');
ok(questionIntentKey(`lock repair${T}`) !== questionIntentKey(`lock replacement${T}`), 'different intents stay different');
ok(questionKey(`safe installation${T}`) !== questionKey(`safes installation${T}`), "…and the queue's own identity (questionKey) is deliberately UNCHANGED — the replay still matches byte-for-byte");

console.log('── The 12 → 11 fault: a collision between the two model calls is topped up, not lost ──');
{
  const money = [`locksmith${T}`, `emergency locksmith${T}`, `best locksmith for lock changes${T}`];
  const standard = [`Locksmith${T}`, `key cutting${T}`, `auto locksmith${T}`, `best locksmith${T}`, `lock replacement${T}`, `24 hour locksmith${T}`, `lock installation${T}`, `locksmith services${T}`, `affordable locksmith${T}`];
  const fallback = [`top rated locksmith${T}`, `which locksmith${T} do people recommend`, `locksmith${T} with great reviews`];
  const r = fillToTarget({ candidates: [...money, ...standard], target: 12, topUp: fallback });
  ok(r.questions.length === 12, `12 requested → 12 queued (got ${r.questions.length})`);
  ok(r.duplicates.length === 1 && r.duplicates[0] === `Locksmith${T}`, 'the case-duplicate is the one dropped');
  ok(r.toppedUp === 1 && r.questions.includes(`top rated locksmith${T}`), 'one template topped it up');
  ok(r.short === 0, 'not short');
  ok(r.questions.slice(0, 3).join('|') === money.join('|'), 'money questions keep their place at the front (the slice order is load-bearing)');
}

console.log('── The 20 → 18 fault, with the baseline exclusion in play ──');
{
  const baselineAsked = [`lock replacement${T}`, `emergency locksmith${T}`, `locksmith${T}`];
  const pool: string[] = [];
  for (let i = 0; i < 26; i++) pool.push(`service ${i}${T}`);
  // two plural collisions and one paraphrase of a judged question inside the pool
  pool.splice(5, 0, `safe installation${T}`, `safes installation${T}`);
  pool.splice(10, 0, `emergency lockout service${T}`, `emergency lockout services${T}`);
  pool.splice(15, 0, `Lock replacements${T}`);
  const fallback = Array.from({ length: 30 }, (_, i) => `template ${i}${T}`);
  const r = fillToTarget({ candidates: pool, target: 20, excluded: baselineAsked, topUp: fallback });
  ok(r.questions.length === 20, `20 requested → 20 queued (got ${r.questions.length})`);
  ok(r.duplicates.length === 2, `both plural twins dropped (${r.duplicates.length})`);
  ok(r.excluded.length === 1 && /Lock replacements/.test(r.excluded[0]), 'the plural paraphrase of a JUDGED question is excluded — the measure stays disjoint from the baseline');
  ok(!r.questions.some((q) => /lock replacement/i.test(q)), 'and it is not in the queued set');
  ok(r.toppedUp === 0, 'a pool with spare candidates needs no template');
}

console.log('── Top-up is exclusion- and dedupe-checked too, and running dry is reported ──');
{
  const r = fillToTarget({ candidates: [`a${T}`, `A${T}`], target: 4, excluded: [`c${T}`], topUp: [`a${T}`, `b${T}`, `c${T}`, `B${T}`] });
  ok(r.questions.join('|') === [`a${T}`, `b${T}`].join('|'), 'templates that repeat a kept question or a judged one are skipped');
  ok(r.short === 2 && r.toppedUp === 1, `short by 2 is REPORTED (short=${r.short}, toppedUp=${r.toppedUp}) — a thin set is never silent`);
}
{
  const r = fillToTarget({ candidates: [], target: 0 });
  ok(r.questions.length === 0 && r.short === 0, 'target 0 → nothing, not short');
  const r2 = fillToTarget({ candidates: ['', '   ', 'x'], target: 3 });
  ok(r2.questions.length === 1 && r2.short === 2, 'blanks are ignored, not counted, not duplicates');
}

console.log('── dedupeByIntent keeps the first spelling ──');
{
  const d = dedupeByIntent([`Safes installation${T}`, `safe installation${T}`, `key cutting${T}`]);
  ok(d.questions.length === 2 && d.questions[0] === `Safes installation${T}` && d.duplicates.length === 1, "the model's first casing survives");
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) process.exit(1);
