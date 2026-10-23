import { rows as ALLROWS, dirtyRow, DIRTY, byId, norm, tradeKey, townKey, tokens, usableName, type Audit } from './_markers';
const rows = ALLROWS.filter((r) => !dirtyRow(r));

const OWN = new Map<string, string>();
{
  const t = new Map<string, Map<string, { n: Set<string>; tw: Set<string> }>>();
  for (const r of rows) {
    const a = byId.get(r.audit_id); const tr = tradeKey(a?.business_type); if (!tr) continue;
    for (const nm of new Set(Object.values(r.comp).flat())) {
      if (!usableName(nm)) continue;
      for (const w of new Set(tokens(nm))) {
        let m = t.get(w); if (!m) { m = new Map(); t.set(w, m); }
        let s = m.get(tr); if (!s) { s = { n: new Set(), tw: new Set() }; m.set(tr, s); }
        s.n.add(norm(nm)); s.tw.add(townKey(a));
      }
    }
  }
  for (const [w, m] of t) {
    let total = 0, best = '', bn = 0, bt = 0;
    for (const [tr, s] of m) { total += s.n.size; if (s.n.size > bn) { bn = s.n.size; best = tr; bt = s.tw.size; } }
    if (bn >= 4 && bn / total >= 0.5 && bt >= 2) OWN.set(w, best);
  }
}
const stems = (trade: string) => trade.split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, Math.max(5, w.length - 3)));
const hasTradeWord = (text: string, trade: string) => { const st = stems(trade); if (!st.length) return true; return tokens(text).some((w) => st.some((s) => w.startsWith(s))); };
const firmOwn = (name: string, trade: string) => hasTradeWord(name, trade) || tokens(name).some((w) => OWN.get(w) === trade);

type G = { audit: Audit; trade: string; q: string; firms: string[]; ownShare: number; namesTrade: boolean };
const perQ = new Map<string, G>();
for (const r of rows) {
  const a = byId.get(r.audit_id); if (!a) continue;
  const trade = tradeKey(a.business_type); if (!trade) continue;
  const firms = [...new Set(Object.values(r.comp).flat())].filter(usableName);
  if (firms.length < 3) continue;
  const ownShare = firms.filter((f) => firmOwn(f, trade)).length / firms.length;
  const k = `${a.id}::${norm(r.question)}`; const prev = perQ.get(k);
  if (!prev || ownShare < prev.ownShare) perQ.set(k, { audit: a, trade, q: r.question, firms, ownShare, namesTrade: hasTradeWord(r.question, trade) });
}
const ALL = [...perQ.values()];

/* ⛔ THE CLASSIFIER'S OWN SELF-CHECK, AND IT MUST COME FIRST. It reads a trade off firm NAMES, so
   it can only see trades whose firms put the trade in their name. A cocktail bar is not called
   "hospitality" and a menopause clinic is not called "online menopause clinic" — for those the
   score is near zero on EVERY question, which reads as "every question measured the wrong trade"
   and is really "I cannot see this trade at all". Median own-share per trade is the test: a trade
   the classifier can read scores high on its typical question. */
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const byTrade = new Map<string, G[]>();
for (const g of ALL) { const a = byTrade.get(g.trade) ?? []; a.push(g); byTrade.set(g.trade, a); }
console.log('CLASSIFIER VALIDITY per trade (median share of named firms carrying the trade vocabulary)');
const VALID = new Set<string>();
for (const [t, gs] of [...byTrade].sort((a, b) => b[1].length - a[1].length)) {
  const m = med(gs.map((g) => g.ownShare));
  const ok = m >= 0.5 && gs.length >= 20;
  if (ok) VALID.add(t);
  console.log(`  ${ok ? 'USE ' : 'DROP'}  median ${(m * 100).toFixed(0).padStart(3)}%  n=${String(gs.length).padStart(4)}  ${t}`);
}

const G = ALL.filter((g) => VALID.has(g.trade));
const ADRIFT = 0.34;
const pc = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : 'n/a');
const noTrade = G.filter((g) => !g.namesTrade);
const adrift = G.filter((g) => g.ownShare < ADRIFT);
const both = G.filter((g) => !g.namesTrade && g.ownShare < ADRIFT);
console.log(`\n═══ POPULATION: ${G.length} questions across the ${VALID.size} readable trades ═══`);
console.log(`A  the question never names the trade        : ${String(noTrade.length).padStart(4)}  (${pc(noTrade.length, G.length)})`);
console.log(`B  under ${ADRIFT * 100}% of named firms are in the trade : ${String(adrift.length).padStart(4)}  (${pc(adrift.length, G.length)})`);
console.log(`A+B  no trade word AND it measured elsewhere  : ${String(both.length).padStart(4)}  (${pc(both.length, G.length)})`);
const namesIt = G.filter((g) => g.namesTrade);
const driftNamed = namesIt.filter((g) => g.ownShare < ADRIFT).length;
console.log(`\nDrift rate when the question NAMES the trade : ${pc(driftNamed, namesIt.length)}  (${driftNamed}/${namesIt.length})`);
console.log(`Drift rate when it does NOT                  : ${pc(both.length, noTrade.length)}  (${both.length}/${noTrade.length})`);
console.log(`                                     ratio   : ${(((both.length / noTrade.length) / (driftNamed / namesIt.length)) || 0).toFixed(1)}x`);

const purpose = (a: Audit) => a.audit_purpose ?? (a.is_market ? '(legacy market)' : (a.baseline_target_runs ?? 0) > 1 ? `(legacy multi-run${a.is_measurement ? ' measurement' : ''})` : '(legacy single)');
const tally = (l: G[], f: (g: G) => string) => { const m = new Map<string, number>(); for (const g of l) m.set(f(g), (m.get(f(g)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
console.log('\n-- A+B by purpose --'); for (const [k, n] of tally(both, (g) => purpose(g.audit))) console.log(`  ${String(n).padStart(3)}  ${k}`);
console.log('\n-- A+B by trade --');   for (const [k, n] of tally(both, (g) => g.trade)) console.log(`  ${String(n).padStart(3)}  ${k}`);
console.log('\n══ WORST ══');
for (const g of both.sort((a, b) => (a.ownShare - b.ownShare) || (b.firms.length - a.firms.length)).slice(0, 16)) {
  console.log(`\n"${g.q}"  [${(g.ownShare * 100).toFixed(0)}% in-trade]`);
  console.log(`   ${g.audit.business_name} · "${g.audit.business_type}" · ${purpose(g.audit)} · ${g.audit.id.slice(0, 8)}`);
  console.log(`   ${g.firms.filter((f) => !firmOwn(f, g.trade)).slice(0, 8).join(', ')}`);
}
