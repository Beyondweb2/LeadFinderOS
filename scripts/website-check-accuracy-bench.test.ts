// THE WEBSITE CHECK ACCURACY BENCH, AS A TEST (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
//
// Runs the REAL deep crawl (supabase/functions/_shared/crawl-job.ts) over 27 saved real lead sites (scripts/website-check-bench/
// cache, replayed: no site is contacted, no model is called) and scores every finding against the hand-checked answer key
// (truth.json). It fails when:
//   · the share of true findings drops under OVERALL_BAR;
//   · a check type a client can see is under ACCURACY_BAR (with at least MIN_SAMPLES labelled findings) — hide it in
//     src/lib/websiteCheckAccuracy.ts CLIENT_HIDDEN_KINDS, or fix it;
//   · a hidden kind reaches a client;
//   · too many findings are new or reworded since the key was made (UNLABELLED_MAX): label them — verify.ts proposes,
//     ev.ts shows the evidence, a person decides (the answer key is never written by code);
//   · the crawl asked for an address that was never saved (record it: run.ts --record).
import assert from 'node:assert/strict';
import { benchSite, loadSites } from './website-check-bench/run.ts';
import { scoreRun, rollUp, pct } from './website-check-bench/score.ts';
import { ACCURACY_BAR, CLIENT_HIDDEN_KINDS } from '../src/lib/websiteCheckAccuracy.ts';

const OVERALL_BAR = 95;
const MIN_SAMPLES = 3;
const UNLABELLED_MAX = 0.1;

/* Replay without waiting each page's recorded download time (only the page-speed check reads it; none fires on this set). */
if (!process.argv.includes('--fast')) process.argv.push('--fast');
const sites = loadSites();
const results: Awaited<ReturnType<typeof benchSite>>[] = [];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  for (;;) {
    const s = sites[next++];
    if (!s) return;
    results.push(await benchSite(s, 'replay'));
  }
}));

const misses = results.filter((r) => r.misses > 0);
assert.equal(misses.length, 0, `addresses the crawl asked for were never saved: ${misses.map((r) => r.slug).join(', ')} — run scripts/website-check-bench/run.ts --record`);

const rows = scoreRun(results);
const all = rows.reduce((s, r) => ({ right: s.right + r.right, wrong: s.wrong + r.wrong, unlabelled: s.unlabelled + r.unlabelled }), { right: 0, wrong: 0, unlabelled: 0 });
const overall = pct(all);
console.log(`website check bench: ${all.right}/${all.right + all.wrong} findings true (${overall.toFixed(1)}%), ${all.unlabelled} unlabelled, ${results.length} sites`);
for (const r of rollUp(rows, 'family').sort((a, b) => pct(a) - pct(b))) console.log(`  ${r.id.padEnd(32)} ${Number.isNaN(pct(r)) ? '  -' : `${Math.round(pct(r))}%`.padStart(4)}  ${r.right}/${r.right + r.wrong}`);

assert.ok(overall >= OVERALL_BAR, `only ${overall.toFixed(1)}% of findings are true (bar ${OVERALL_BAR}%)`);
const total = all.right + all.wrong + all.unlabelled;
assert.ok(all.unlabelled / total <= UNLABELLED_MAX, `${all.unlabelled} of ${total} findings are new or reworded since the answer key was made — label them (scripts/website-check-bench/verify.ts, ev.ts) before trusting the score:\n${rows.flatMap((r) => r.examples.filter((e) => /^(?:NEW|CHANGED) /.test(e)).map((e) => `  ${r.id}: ${e}`)).slice(0, 30).join('\n')}`);

for (const r of rows) {
  const n = r.right + r.wrong;
  if (n < MIN_SAMPLES || CLIENT_HIDDEN_KINDS.has(r.id)) continue;
  assert.ok(pct(r) >= ACCURACY_BAR * 100, `${r.id} is shown to clients but only ${r.right} of ${n} findings are true — fix it or add it to CLIENT_HIDDEN_KINDS:\n${r.examples.join('\n')}`);
}
for (const r of results) for (const i of r.issues) {
  assert.ok(!(CLIENT_HIDDEN_KINDS.has(i.id) && i.clientShown), `${i.id} is hidden from clients but reached the client view on ${r.slug}`);
}
for (const id of CLIENT_HIDDEN_KINDS) {
  const r = rows.find((x) => x.id === id);
  if (r && r.right + r.wrong >= 5 && pct(r) >= ACCURACY_BAR * 100) console.log(`  note: ${id} now measures ${Math.round(pct(r))}% on ${r.right + r.wrong} findings — it could be shown to clients again`);
}
console.log('website check accuracy bench passed');
process.exit(0);
