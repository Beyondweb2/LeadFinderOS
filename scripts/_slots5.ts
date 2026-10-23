/* READ-ONLY. Is SLOT CHURN computable? Per question, per engine, across the runs of one audit:
   how many names come back, how many are held every run, how many rotate. */
import { rows as ALL, dirtyRow, byId, norm, tradeKey, usableName } from './_markers';
const rows = ALL.filter((r) => !dirtyRow(r));

/* One bucket per (audit, question, engine); each RUN contributes one observation. */
type Obs = { trade: string; engine: string; runs: Map<string, Set<string>> };
const buckets = new Map<string, Obs>();
for (const r of rows) {
  const a = byId.get(r.audit_id); if (!a) continue;
  const trade = tradeKey(a.business_type); if (!trade) continue;
  for (const [engine, names] of Object.entries(r.comp)) {
    if (engine === 'ai_overview') continue;
    const k = `${r.audit_id}::${norm(r.question)}::${engine}`;
    let b = buckets.get(k); if (!b) { b = { trade, engine, runs: new Map() }; buckets.set(k, b); }
    b.runs.set(String(r.run_id), new Set(names.filter(usableName).map((n) => norm(n))));
  }
}

/* Only a question asked 2+ times can show churn at all. */
const multi = [...buckets.values()].filter((b) => b.runs.size >= 2);
console.log(`question x engine buckets            : ${buckets.size}`);
console.log(`  ...asked in 2+ runs (churn-readable): ${multi.length}  (${((multi.length / buckets.size) * 100).toFixed(1)}%)`);

type Row = { trade: string; engine: string; slots: number; held: number; rotating: number; runs: number };
const out: Row[] = [];
for (const b of multi) {
  const runs = [...b.runs.values()];
  const count = new Map<string, number>();
  for (const s of runs) for (const n of s) count.set(n, (count.get(n) ?? 0) + 1);
  const slots = Math.round(runs.reduce((n, s) => n + s.size, 0) / runs.length);   // typical names per answer
  /* HELD = present in every run. ROTATING = present in some but not all. */
  const held = [...count.values()].filter((c) => c === runs.length).length;
  const rotating = [...count.values()].filter((c) => c > 0 && c < runs.length).length;
  out.push({ trade: b.trade, engine: b.engine, slots, held, rotating, runs: runs.length });
}

const agg = new Map<string, Row[]>();
for (const r of out) { const a = agg.get(r.trade) ?? []; a.push(r); agg.set(r.trade, a); }
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
console.log('\ntrade                      questions   names/answer   held every run   rotating   churn');
for (const [t, g] of [...agg].filter(([, g]) => g.length >= 20).sort((a, b) => b[1].length - a[1].length)) {
  const s = mean(g.map((x) => x.slots)), h = mean(g.map((x) => x.held)), r = mean(g.map((x) => x.rotating));
  console.log(`${t.padEnd(26)}${String(g.length).padStart(6)}   ${s.toFixed(1).padStart(10)}   ${h.toFixed(1).padStart(12)}   ${r.toFixed(1).padStart(8)}   ${(r / Math.max(h + r, 0.001) * 100).toFixed(0).padStart(4)}%`);
}
console.log('\nchurn = rotating / (held + rotating): the share of named slots that are not the same firm every time.');

const byEng = new Map<string, Row[]>();
for (const r of out) { const a = byEng.get(r.engine) ?? []; a.push(r); byEng.set(r.engine, a); }
console.log('\nBY ENGINE — is the churn where the page lever works?');
for (const [e, g] of byEng) {
  const s = mean(g.map((x) => x.slots)), h = mean(g.map((x) => x.held)), r = mean(g.map((x) => x.rotating));
  console.log(`  ${e.padEnd(10)} n=${String(g.length).padStart(4)}  ${s.toFixed(1)} names/answer  ${h.toFixed(1)} held  ${r.toFixed(1)} rotating  churn ${(r/Math.max(h+r,0.001)*100).toFixed(0)}%  FREE SLOTS ${(s-h).toFixed(1)}`);
}
