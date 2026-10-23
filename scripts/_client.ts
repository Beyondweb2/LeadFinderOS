import { rows as ALLROWS, dirtyRow, DIRTY, byId, audits, norm, tradeKey, townKey, tokens, usableName } from './_markers';
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

for (const who of ['White Sparks', 'AD Locksmithing']) {
  const mine = audits.filter((a) => (a.business_name ?? '').includes(who)).sort((x, y) => x.created_at.localeCompare(y.created_at));
  console.log(`\n\n████ ${who} — ${mine.length} audits ████`);
  for (const a of mine) {
    const tr = tradeKey(a.business_type);
    const qrs = new Map<string, { q: string; firms: string[] }>();
    for (const r of rows.filter((r) => r.audit_id === a.id)) {
      const firms = [...new Set(Object.values(r.comp).flat())].filter(usableName);
      const k = norm(r.question); const p = qrs.get(k);
      if (!p || firms.length > p.firms.length) qrs.set(k, { q: r.question, firms });
    }
    if (!qrs.size) continue;
    console.log(`\n  ${a.audit_purpose ?? '(legacy)'} · ${a.id.slice(0, 8)} · ${a.created_at.slice(0, 10)} · target_runs ${a.baseline_target_runs} · frozen ${a.baseline_completed_at ? 'YES' : 'no'} · ${qrs.size} questions`);
    for (const { q, firms } of qrs.values()) {
      const own = firms.filter((f) => firmOwn(f, tr)).length;
      const share = firms.length ? own / firms.length : -1;
      const flag = firms.length < 3 ? '   ' : share < 0.34 ? ' ⛔' : share < 0.7 ? ' ⚠️' : '   ';
      console.log(`   ${flag} ${namesTrade(q, tr) ? 'trade-word' : 'NO-TRADE  '}  ${firms.length ? `${own}/${firms.length} in-trade` : 'no firms  '}  "${q}"`);
      if (firms.length >= 3 && share < 0.34) console.log(`          off-trade firms: ${firms.filter((f) => !firmOwn(f, tr)).slice(0, 7).join(', ')}`);
    }
  }
}
