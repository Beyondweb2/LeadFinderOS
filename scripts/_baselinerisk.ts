import { rows as ALLROWS, dirtyRow, DIRTY, byId, norm, tradeKey, tokens, type Audit } from './_markers';
const rows = ALLROWS.filter((r) => !dirtyRow(r));

const stems = (t: string) => t.split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, Math.max(5, w.length - 3)));
const namesTrade = (text: string, trade: string) => { const st = stems(trade); if (!st.length) return true; return tokens(text).some((w) => st.some((s) => w.startsWith(s))); };

/* Every DISTINCT question ever asked, with the audit that asked it. */
const qs = new Map<string, { a: Audit; q: string }>();
for (const r of rows) { const a = byId.get(r.audit_id); if (a) qs.set(`${a.id}::${norm(r.question)}`, { a, q: r.question }); }

const isBaseline = (a: Audit) => a.audit_purpose === 'baseline' || (!a.audit_purpose && (a.baseline_target_runs ?? 0) > 1 && !a.is_measurement && !a.is_market && !!a.lead_id);
const kind = (a: Audit) => a.audit_purpose ? a.audit_purpose : isBaseline(a) ? 'baseline (legacy)' : a.is_market ? 'market (legacy)' : (a.baseline_target_runs ?? 0) > 1 ? 'measurement (legacy)' : 'audit (legacy)';

const g = new Map<string, { total: number; noTrade: number; ex: string[] }>();
for (const { a, q } of qs.values()) {
  const tr = tradeKey(a.business_type); if (!tr) continue;
  const k = kind(a);
  const v = g.get(k) ?? { total: 0, noTrade: 0, ex: [] }; v.total++;
  if (!namesTrade(q, tr)) { v.noTrade++; if (v.ex.length < 6) v.ex.push(`"${q}"  [${a.business_type} · ${a.business_name}]`); }
  g.set(k, v);
}
console.log('QUESTIONS THAT NEVER NAME THE AUDITED TRADE, by measurement kind');
for (const [k, v] of [...g].sort((x, y) => y[1].total - x[1].total)) {
  console.log(`\n  ${k}: ${v.noTrade} of ${v.total} (${((v.noTrade / v.total) * 100).toFixed(1)}%)`);
  for (const e of v.ex) console.log(`      ${e}`);
}

console.log('\n\n═══ THE ONE FROZEN BASELINE ON A PAYING CLIENT — full question set ═══');
const bl = [...new Set([...qs.values()].filter((x) => isBaseline(x.a)).map((x) => x.a.id))];
for (const id of bl) {
  const a = byId.get(id)!; const tr = tradeKey(a.business_type);
  const set = [...qs.values()].filter((x) => x.a.id === id);
  const miss = set.filter((x) => !namesTrade(x.q, tr));
  console.log(`\n${a.business_name} · "${a.business_type}" · ${a.location_text} · ${a.audit_purpose ?? '(legacy)'} · frozen ${a.baseline_completed_at ? a.baseline_completed_at.slice(0,10) : 'NO'} · ${a.id.slice(0,8)}`);
  console.log(`   ${set.length} questions, ${miss.length} never name the trade:`);
  for (const m of miss) console.log(`      x  "${m.q}"`);
}
