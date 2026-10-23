/* READ-ONLY RECON. Two signals, and the pairing is the point:
     A (generation side, corpus-independent) — the question never names the trade, so the engines
       are free to answer it about somebody else. This is exactly the check seedRejectionReason
       makes and that nothing calls.
     B (measurement side) — what share of the firms the engines actually named carry the audited
       trade's vocabulary. Low share is the fault having bitten.
   A alone over-counts ("emergency lockout in X" names no trade and is a perfect locksmith
   question). B alone cannot see a trade the book has never audited (a motor garage). Together
   they are checkable. */
import { rows, byId, norm, tradeKey, townKey, tokens, usableName, type Row, type Audit } from './_markers';

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
const hasTradeWord = (text: string, trade: string) => {
  const st = stems(trade); if (!st.length) return true;
  const ws = tokens(text);
  return ws.some((w) => st.some((s) => w.startsWith(s)));
};
const firmOwn = (name: string, trade: string) =>
  hasTradeWord(name, trade) || tokens(name).some((w) => OWN.get(w) === trade);

type G = { audit: Audit; trade: string; q: string; firms: string[]; ownShare: number; namesTrade: boolean };
const perQ = new Map<string, G>();
for (const r of rows) {
  const a = byId.get(r.audit_id); if (!a) continue;
  const trade = tradeKey(a.business_type); if (!trade) continue;
  const firms = [...new Set(Object.values(r.comp).flat())].filter(usableName);
  if (firms.length < 3) continue;
  const ownShare = firms.filter((f) => firmOwn(f, trade)).length / firms.length;
  const k = `${r.audit_id}::${norm(r.question)}`;
  const prev = perQ.get(k);
  /* Worst run wins: a question that measured the wrong trade in any run is the finding. */
  if (!prev || ownShare < prev.ownShare) perQ.set(k, { audit: a, trade, q: r.question, firms, ownShare, namesTrade: hasTradeWord(r.question, trade) });
}
const G = [...perQ.values()];
const pc = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const ADRIFT = 0.34;   // fewer than a third of the named firms are in your trade

const noTrade = G.filter((g) => !g.namesTrade);
const adrift = G.filter((g) => g.ownShare < ADRIFT);
const both = G.filter((g) => !g.namesTrade && g.ownShare < ADRIFT);
console.log(`gradeable questions (distinct audit x question, >=3 usable named firms): ${G.length}`);
console.log(`A  question never names the trade            : ${noTrade.length}  (${pc(noTrade.length, G.length)})`);
console.log(`B  <${ADRIFT * 100}% of named firms are in the trade    : ${adrift.length}  (${pc(adrift.length, G.length)})`);
console.log(`A+B  named no trade AND measured another one : ${both.length}  (${pc(both.length, G.length)})   <-- the fault`);
console.log(`\nof questions that DO name the trade, ${pc(G.filter((g) => g.namesTrade && g.ownShare < ADRIFT).length, G.filter((g) => g.namesTrade).length)} still drift`);
console.log(`of questions that do NOT, ${pc(both.length, noTrade.length)} drift — ${(both.length / noTrade.length) / (G.filter((g) => g.namesTrade && g.ownShare < ADRIFT).length / G.filter((g) => g.namesTrade).length)}x the rate`);

const purpose = (a: Audit) => a.audit_purpose ?? (a.is_market ? '(legacy market)' : (a.baseline_target_runs ?? 0) > 1 ? `(legacy multi-run${a.is_measurement ? ' measurement' : ''})` : '(legacy single)');
const tally = (l: G[], f: (g: G) => string) => { const m = new Map<string, number>(); for (const g of l) m.set(f(g), (m.get(f(g)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
console.log('\n-- A+B by audit purpose --');
for (const [k, n] of tally(both, (g) => purpose(g.audit))) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log('\n-- A+B by trade --');
for (const [k, n] of tally(both, (g) => g.trade)) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log('\n-- the service terms that drift most (A+B), by distinct question text --');
for (const [k, n] of tally(both, (g) => norm(g.q).replace(/ in .*$/, '')).slice(0, 18)) console.log(`  ${String(n).padStart(3)}x  "${k}"`);

console.log('\n══ WORST: no trade word, zero firms in the trade ══');
for (const g of both.filter((x) => x.ownShare === 0).sort((a, b) => b.firms.length - a.firms.length).slice(0, 12)) {
  console.log(`\n"${g.q}"`);
  console.log(`   ${g.audit.business_name} · "${g.audit.business_type}" · ${purpose(g.audit)} · ${g.audit.id.slice(0, 8)}`);
  console.log(`   0 of ${g.firms.length} named firms are ${g.trade}s: ${g.firms.slice(0, 9).join(', ')}`);
}
