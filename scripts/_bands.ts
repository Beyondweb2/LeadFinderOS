/* Would a wrong ABSENT be visible at measurement time? Fold to bands the same way
   buildBaselineView does, then cross with the off-trade signal. */
import { rows as ALLROWS, dirtyRow, DIRTY, byId, audits, norm, tradeKey, townKey, tokens, usableName, type Audit } from './_markers';
const rows = ALLROWS.filter((r) => !dirtyRow(r));
const OWN = new Map<string, string>();
{ const t = new Map<string, Map<string, { n: Set<string>; tw: Set<string> }>>();
  for (const r of rows) { const a = byId.get(r.audit_id); const tr = tradeKey(a?.business_type); if (!tr) continue;
    for (const nm of new Set(Object.values(r.comp).flat())) { if (!usableName(nm)) continue;
      for (const w of new Set(tokens(nm))) { let m = t.get(w); if (!m) { m = new Map(); t.set(w, m); }
        let s = m.get(tr); if (!s) { s = { n: new Set(), tw: new Set() }; m.set(tr, s); } s.n.add(norm(nm)); s.tw.add(townKey(a)); } } }
  for (const [w, m] of t) { let tot = 0, b = '', bn = 0, bt = 0;
    for (const [tr, s] of m) { tot += s.n.size; if (s.n.size > bn) { bn = s.n.size; b = tr; bt = s.tw.size; } }
    if (bn >= 4 && bn / tot >= 0.5 && bt >= 2) OWN.set(w, b); } }
const stems = (t: string) => t.split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, Math.max(5, w.length - 3)));
const namesTrade = (x: string, tr: string) => { const st = stems(tr); if (!st.length) return true; return tokens(x).some((w) => st.some((s) => w.startsWith(s))); };
const firmOwn = (n: string, tr: string) => namesTrade(n, tr) || tokens(n).some((w) => OWN.get(w) === tr);
const VALID = new Set(['locksmith', 'plumber', 'accountant', 'driving instructor', 'electrician', 'mobile mechanic']);

type Acc = { named: number; answered: number };
const per = new Map<string, { a: Audit; q: string; eng: Record<string, Acc>; firms: Set<string> }>();
for (const r of rows) {
  const a = byId.get(r.audit_id); if (!a) continue;
  const k = `${a.id}::${norm(r.question)}`;
  let p = per.get(k); if (!p) { p = { a, q: r.question, eng: {}, firms: new Set() }; per.set(k, p); }
  for (const e of ['chatgpt', 'gemini']) {
    if (!(e in r.named)) continue;
    (p.eng[e] ??= { named: 0, answered: 0 }); p.eng[e].answered++; if (r.named[e]) p.eng[e].named++;
  }
  for (const n of Object.values(r.comp).flat()) if (usableName(n)) p.firms.add(n);
}
const classify = (eng: Record<string, Acc>) => {
  const live = Object.values(eng).filter((e) => e.answered > 0);
  if (!live.length) return 'no_race';
  if (live.every((e) => e.named >= e.answered)) return 'held';
  if (live.every((e) => e.named === 0)) return 'absent';
  if (live.some((e) => e.named >= e.answered) && live.some((e) => e.named === 0)) return 'one_engine';
  return 'fragile';
};
const ADRIFT = 0.34;
const out = [...per.values()].filter((p) => VALID.has(tradeKey(p.a.business_type)));
const tab = new Map<string, { n: number; off: number; ex: typeof out }>();
for (const p of out) {
  const tr = tradeKey(p.a.business_type); const f = [...p.firms];
  const b = classify(p.eng);
  const share = f.length >= 3 ? f.filter((x) => firmOwn(x, tr)).length / f.length : null;
  const v = tab.get(b) ?? { n: 0, off: 0, ex: [] }; v.n++;
  if (share !== null && share < ADRIFT) { v.off++; if (b === 'absent') v.ex.push(p); }
  tab.set(b, v);
}
console.log('BAND x OFF-TRADE  (6 readable trades, all audits on file)');
for (const [b, v] of [...tab].sort((x, y) => y[1].n - x[1].n))
  console.log(`  ${b.padEnd(11)} ${String(v.n).padStart(4)} questions, ${String(v.off).padStart(3)} off-trade (${((v.off / v.n) * 100).toFixed(1)}%)`);
const abs = tab.get('absent')!;
console.log(`\n⚠️  ${abs.off} of ${abs.n} ABSENT questions (${((abs.off / abs.n) * 100).toFixed(1)}%) named almost no firm in the audited trade.`);
console.log('   Each is a page the operator would be sent to build for a race that is not theirs.\n');
for (const p of abs.ex.sort((a, b) => b.firms.size - a.firms.size).slice(0, 12)) {
  const tr = tradeKey(p.a.business_type);
  console.log(`  "${p.q}"  — ${p.a.business_name} ["${p.a.business_type}", ${p.a.audit_purpose ?? 'legacy'}]`);
  console.log(`      ${[...p.firms].filter((f) => !firmOwn(f, tr)).slice(0, 6).join(', ')}`);
}
