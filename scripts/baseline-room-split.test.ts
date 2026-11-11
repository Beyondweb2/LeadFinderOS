/* The baseline picker's room split (Paul, 2026-11-12): hook searches always in, 3-4 main money searches even with little room
   (labelled "Main search, harder to get named"), about 14 with the most room, none where AI names no firms. */
import { recommendBaseline } from '../src/lib/baselineRecommendation.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const towns = ['Canterbury', 'Whitstable', 'Herne Bay', 'Faversham'];
const ctx = { primaryTown: 'Canterbury', areas: towns.slice(1), services: [] };
const svc = ['lock changes', 'mortice locks', 'key cutting', 'safe opening', 'garage door locks', 'upvc door locks', 'car key cutting', 'lockout help', 'door repair', 'window locks', 'key safes'];
const pool: { question: string; verdict: string }[] = [];
let n = 0;
for (const s of svc) for (const t of towns) {
  const v = n % 6 === 5 ? 'locked' : n % 6 === 4 ? 'no-local-race' : n % 3 === 0 ? 'open' : 'contested';
  pool.push({ question: `Who does ${s} in ${t}, UK?`, verdict: v }); n++;
}
const core = ['Can you recommend a good locksmith in Canterbury, UK?', 'Which locksmiths in Canterbury, UK have the best reviews?'];
pool.push({ question: core[0], verdict: 'locked' }, { question: core[1], verdict: 'locked' });
const hook = ['Who is the best locksmith in Whitstable, UK?'];
pool.push({ question: hook[0], verdict: 'locked' });

const rec = recommendBaseline({ hook, pool, ctx, trade: 'Locksmith', target: 20, core });
const verdictOf = (q: string) => pool.find((p) => p.question === q)?.verdict;
const rows = rec.questions;
ok(rows.length === 20, `20 chosen (${rows.length})`);
ok(rows.some((r) => r.question === hook[0] && r.source === 'hook'), 'every hook search is in, locked');
ok(!rows.some((r) => verdictOf(r.question) === 'no-local-race'), 'no search where AI names no firms');
const mains = rows.filter((r) => r.main);
ok(mains.length >= 2 && mains.length <= 4 && mains.every((r) => /^Main search, harder to get named/.test(r.reason)), `main searches kept even with little room, labelled (${mains.length})`);
const locked = rows.filter((r) => verdictOf(r.question) === 'locked' && r.source === 'discovery');
ok(locked.length === 0, 'no other little-room search is picked while searches with room are available');
const roomy = rows.filter((r) => r.source === 'discovery' && ['open', 'contested'].includes(verdictOf(r.question) ?? ''));
ok(roomy.length >= 12, `the rest (${roomy.length}) are searches with room to be named`);
const open = roomy.filter((r) => verdictOf(r.question) === 'open').length;
ok(open >= 10, `Lots-of-room searches come first (${open})`);

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURES`);
if (f) process.exit(1);
