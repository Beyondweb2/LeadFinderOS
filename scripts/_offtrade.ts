/* READ-ONLY RECON: how often does a measured question name firms from a different trade? */
import { audits, rows, byId, norm, tradeKey, townKey, tokens, usableName, MARKER, type Row } from './_markers';

/* ── TWO TABLES, DELIBERATELY ASYMMETRIC ──────────────────────────────────────────────────────
   "Your trade is absent" must not fire on a recall failure, so own-trade membership is generous.
   "Another trade is present" is an accusation, so it uses the strict table. A single threshold
   would have to be wrong in one direction or the other. */
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

/** The trade's own word, by stem — corpus-independent, so a thin trade is not penalised. */
const stems = (trade: string) => trade.split(' ').filter((w) => w.length >= 4)
  .map((w) => w.slice(0, Math.max(5, w.length - 3)));
const ownHit = (name: string, trade: string) => {
  const ws = tokens(name); const st = stems(trade);
  return ws.some((w) => st.some((s) => w.startsWith(s) || s.startsWith(w.slice(0, 6)) && w.length >= 5)) || ws.some((w) => OWN.get(w) === trade);
};
const alienTrades = (name: string, trade: string) => {
  const s = new Set<string>();
  for (const w of tokens(name)) { const m = MARKER.get(w); if (m && m.trade !== trade) s.add(m.trade); }
  return s;
};

type Verdict = { firms: string[]; own: number; alien: number; alienTrade: string | null };
const judge = (r: Row, trade: string): Verdict | null => {
  const firms = [...new Set(Object.values(r.comp).flat())].filter(usableName);
  if (firms.length < 3) return null;                       // too few to say anything
  let own = 0, alien = 0; const votes = new Map<string, number>();
  for (const f of firms) {
    if (ownHit(f, trade)) { own++; continue; }
    const a = alienTrades(f, trade);
    if (a.size === 1) { alien++; const k = [...a][0]; votes.set(k, (votes.get(k) ?? 0) + 1); }
  }
  let alienTrade: string | null = null, top = 0;
  for (const [k, v] of votes) if (v > top) { top = v; alienTrade = k; }
  return { firms, own, alien, alienTrade };
};

/* One row per QUESTION per AUDIT (a question is asked once per run; the runs agree by design). */
const perQ = new Map<string, { r: Row; trade: string; v: Verdict; runs: number }>();
for (const r of rows) {
  const a = byId.get(r.audit_id); const trade = tradeKey(a?.business_type); if (!trade) continue;
  const v = judge(r, trade); if (!v) continue;
  const k = `${r.audit_id}::${norm(r.question)}`;
  const prev = perQ.get(k);
  /* Keep the run with the most evidence; count how many runs agreed it was off-trade. */
  if (!prev || v.firms.length > prev.v.firms.length) perQ.set(k, { r, trade, v, runs: (prev?.runs ?? 0) + 1 });
  else prev.runs++;
}

const gradeable = [...perQ.values()];
const noOwn = gradeable.filter((g) => g.v.own === 0);
const strong = noOwn.filter((g) => g.v.alien >= Math.ceil(g.v.firms.length / 2) && g.v.alienTrade);

const pc = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
console.log(`gradeable questions (>=3 usable named firms): ${gradeable.length}`);
console.log(`  no firm carries the audited trade's vocabulary : ${noOwn.length}  (${pc(noOwn.length, gradeable.length)})`);
console.log(`  ...AND half or more carry ONE other trade's    : ${strong.length}  (${pc(strong.length, gradeable.length)})  <- measuring a different trade`);

const purpose = (a: ReturnType<typeof byId.get>) => a?.audit_purpose ?? (a?.baseline_target_runs && a.baseline_target_runs > 1 ? `(legacy multi-run${a.is_measurement ? ', measurement' : ''})` : '(legacy)');
const tally = (list: typeof gradeable, f: (g: typeof gradeable[0]) => string) => {
  const m = new Map<string, number>(); for (const g of list) m.set(f(g), (m.get(f(g)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]);
};
console.log('\n-- the strong set by audit purpose --');
for (const [k, n] of tally(strong, (g) => purpose(byId.get(g.r.audit_id)))) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log('\n-- the strong set by audited trade --');
for (const [k, n] of tally(strong, (g) => g.trade)) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log('\n-- and which trade it actually measured --');
for (const [k, n] of tally(strong, (g) => `${g.trade}  ->  ${g.v.alienTrade}`)) console.log(`  ${String(n).padStart(4)}  ${k}`);

console.log('\n══ WORST EXAMPLES (every firm off-trade, most firms first) ══');
const worst = strong.filter((g) => g.v.own === 0 && g.v.alien === g.v.firms.length)
  .sort((a, b) => b.v.firms.length - a.v.firms.length).slice(0, 14);
for (const g of worst) {
  const a = byId.get(g.r.audit_id)!;
  console.log(`\n"${g.r.question}"`);
  console.log(`   ${a.business_name} · trade "${a.business_type}" · ${purpose(a)} · audit ${a.id.slice(0, 8)}`);
  console.log(`   measured ${g.v.alienTrade} instead — ${g.v.firms.length}/${g.v.firms.length} firms: ${g.v.firms.slice(0, 8).join(', ')}`);
}
