/* READ-ONLY. Are head terms actually worse, and what cap would the real data support? */
import { rows as ALL, dirtyRow, byId, norm, type Audit } from './_markers';
import { isHeadIntent } from '../src/lib/seedGuard';
const rows = ALL.filter((r) => !dirtyRow(r));

const kind = (a: Audit) => a.audit_purpose
  ? a.audit_purpose
  : a.is_market ? 'market (legacy)'
  : (a.baseline_target_runs ?? 0) > 1 ? (a.is_measurement ? 'measurement (legacy)' : 'baseline (legacy)')
  : 'audit (legacy)';

/* One entry per (audit, question), with the named cells pooled across runs. */
type Q = { a: Audit; q: string; head: boolean; named: number; cells: number };
const per = new Map<string, Q>();
for (const r of rows) {
  const a = byId.get(r.audit_id); if (!a) continue;
  const bt = String(a.business_type ?? ''); if (!bt) continue;
  const k = `${a.id}::${norm(r.question)}`;
  let p = per.get(k);
  if (!p) { p = { a, q: r.question, head: isHeadIntent(r.question, bt), named: 0, cells: 0 }; per.set(k, p); }
  for (const e of ['chatgpt', 'gemini'] as const) {
    if (!(e in r.named)) continue;
    p.cells++; if (r.named[e]) p.named++;
  }
}
const qs = [...per.values()];

console.log('══ ARE HEAD TERMS HARDER TO WIN? (all audits, clean folds) ══');
for (const [label, sel] of [['head term', (x: Q) => x.head], ['service term', (x: Q) => !x.head]] as const) {
  const g = qs.filter(sel).filter((x) => x.cells > 0);
  const named = g.reduce((n, x) => n + x.named, 0);
  const cells = g.reduce((n, x) => n + x.cells, 0);
  console.log(`  ${label.padEnd(13)} ${String(g.length).padStart(4)} questions · named ${named}/${cells} cells = ${((named / cells) * 100).toFixed(1)}%`);
}

console.log('\n══ HEAD-TERM SHARE PER AUDIT, by kind ══');
const byAudit = new Map<string, Q[]>();
for (const q of qs) { const a = byAudit.get(q.a.id) ?? []; a.push(q); byAudit.set(q.a.id, a); }
const buckets = new Map<string, number[]>();
for (const [id, g] of byAudit) {
  if (g.length < 5) continue;                       // too few questions to have a "share"
  const k = kind(byId.get(id)!);
  const arr = buckets.get(k) ?? []; arr.push(g.filter((x) => x.head).length / g.length); buckets.set(k, arr);
}
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
for (const [k, xs] of [...buckets].sort((a, b) => b[1].length - a[1].length)) {
  const over = xs.filter((x) => x > 1 / 3).length;
  console.log(`  ${k.padEnd(22)} n=${String(xs.length).padStart(3)}  median ${(med(xs) * 100).toFixed(0).padStart(3)}%  worst ${(Math.max(...xs) * 100).toFixed(0)}%  over a THIRD: ${over} (${((over / xs.length) * 100).toFixed(0)}%)`);
}

console.log('\n══ WHAT A CAP OF 1/3 WOULD HAVE CUT, and was it good? ══');
/* For every audit over the cap, the head questions BEYOND the cap are what a spread rule drops.
   The question that matters: were those questions winning? */
let cutTotal = 0, cutNamed = 0, cutCells = 0, cutEverNamed = 0;
for (const [id, g] of byAudit) {
  if (g.length < 5) continue;
  const heads = g.filter((x) => x.head);
  const cap = Math.max(1, Math.floor(g.length / 3));
  if (heads.length <= cap) continue;
  /* Keep the best-performing head terms; the rule would keep SOME, so only the surplus is "cut". */
  const surplus = [...heads].sort((a, b) => (b.named / (b.cells || 1)) - (a.named / (a.cells || 1))).slice(cap);
  for (const s of surplus) {
    cutTotal++; cutNamed += s.named; cutCells += s.cells; if (s.named > 0) cutEverNamed++;
  }
}
console.log(`  questions the cap would drop : ${cutTotal}`);
console.log(`  of those, EVER named         : ${cutEverNamed}  (${((cutEverNamed / cutTotal) * 100).toFixed(1)}%)`);
console.log(`  their pooled named rate      : ${cutNamed}/${cutCells} = ${((cutNamed / cutCells) * 100).toFixed(1)}%`);
const keptRate = (() => { const g = qs.filter((x) => !x.head && x.cells > 0); return (g.reduce((n, x) => n + x.named, 0) / g.reduce((n, x) => n + x.cells, 0)) * 100; })();
console.log(`  vs service terms overall     : ${keptRate.toFixed(1)}%`);
