/* Would the new trade guard have rejected questions that were GOOD? Run it over every question
   ever asked, and judge each rejection against what the engines actually returned. */
import { rows as ALL, dirtyRow, byId, norm, tradeKey, tokens, usableName } from './_markers';
import { offTradeReason } from '../src/lib/seedGuard';
const rows = ALL.filter((r) => !dirtyRow(r));
const stems = (t: string) => t.split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, Math.max(5, w.length - 3)));
const firmOwn = (n: string, tr: string) => { const st = stems(tr); return tokens(n).some((w) => st.some((s) => w.startsWith(s))); };

const per = new Map<string, { q: string; bt: string; trade: string; firms: Set<string>; biz: string; purpose: string }>();
for (const r of rows) {
  const a = byId.get(r.audit_id); if (!a) continue;
  const bt = String(a.business_type ?? ''); if (!bt) continue;
  const k = `${a.id}::${norm(r.question)}`;
  let p = per.get(k);
  if (!p) { p = { q: r.question, bt, trade: tradeKey(bt), firms: new Set(), biz: String(a.business_name ?? ''), purpose: a.audit_purpose ?? 'legacy' }; per.set(k, p); }
  for (const n of Object.values(r.comp).flat()) if (usableName(n)) p.firms.add(n);
}
const all = [...per.values()];
const rejected = all.filter((p) => offTradeReason(p.q, p.bt));
console.log(`questions on file (clean folds): ${all.length}`);
console.log(`the guard would have rejected  : ${rejected.length}  (${((rejected.length / all.length) * 100).toFixed(1)}%)\n`);

/* The judgement: what did the engines actually name? A rejection is GOOD if the firms were not in
   the trade, and a FALSE REJECTION if they were. */
const withEvidence = rejected.filter((p) => p.firms.size >= 3);
const good = withEvidence.filter((p) => [...p.firms].filter((f) => firmOwn(f, p.trade)).length / p.firms.size < 0.34);
const bad = withEvidence.filter((p) => [...p.firms].filter((f) => firmOwn(f, p.trade)).length / p.firms.size >= 0.7);
console.log(`of those, ${withEvidence.size ?? withEvidence.length} have >=3 named firms to judge by:`);
console.log(`   rightly rejected (engines answered off-trade): ${good.length}`);
console.log(`   FALSE rejection  (>=70% of firms in trade)   : ${bad.length}`);
console.log(`   ambiguous in between                         : ${withEvidence.length - good.length - bad.length}`);

const tally = new Map<string, { n: number; ex: string[] }>();
for (const p of bad) { const v = tally.get(p.trade) ?? { n: 0, ex: [] }; v.n++; if (v.ex.length < 8) v.ex.push(p.q); tally.set(p.trade, v); }
console.log('\n══ FALSE REJECTIONS by trade — good questions this would have thrown away ══');
for (const [t, v] of [...tally].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`\n  ${t}: ${v.n}`);
  for (const e of v.ex) console.log(`     "${e}"`);
}
console.log('\n══ RIGHTLY REJECTED (sample) ══');
for (const p of good.slice(0, 10)) console.log(`  "${p.q}"  [${p.bt} · ${p.biz}]`);
