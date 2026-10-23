import { rows as ALL, dirtyRow, byId, norm, tradeKey } from './_markers';
import { nicheVerdict, type NicheAnalysis } from '../src/lib/nicheView';
const rows = ALL.filter((r) => !dirtyRow(r));
const TRADES = ['electrician', 'plumber'];
for (const want of TRADES) {
  const buckets = new Map<string, Map<string, Set<string>>>();
  const eng: Record<string, [number, number]> = {};
  const biz = new Set<string>(); const towns = new Set<string>(); const auds = new Set<string>();
  for (const r of rows) {
    const a = byId.get(r.audit_id); if (!a || tradeKey(a.business_type) !== want) continue;
    auds.add(a.id); biz.add(String(a.business_name ?? '').toLowerCase()); towns.add(norm(a.location_text));
    for (const e of ['chatgpt', 'gemini'] as const) {
      if (e in r.named) { eng[e] = eng[e] ?? [0, 0]; eng[e][1]++; if (r.named[e]) eng[e][0]++; }
    }
    for (const [e, names] of Object.entries(r.comp)) {
      if (e !== 'gemini') continue;
      const k = `${r.audit_id}::${norm(r.question)}`;
      let b = buckets.get(k); if (!b) { b = new Map(); buckets.set(k, b); }
      b.set(String(r.run_id), new Set(names.map((n) => norm(n)).filter((n) => n.length >= 3)));
    }
  }
  let qs = 0, names = 0, held = 0;
  for (const runs of buckets.values()) {
    const per = [...runs.values()]; if (per.length < 2) continue;
    const c = new Map<string, number>(); for (const s of per) for (const n of s) c.set(n, (c.get(n) ?? 0) + 1);
    qs++; names += per.reduce((n, s) => n + s.size, 0) / per.length;
    held += [...c.values()].filter((x) => x === per.length).length;
  }
  const n = {
    trade: want === 'electrician' ? 'Electricians' : 'Plumbers', tradeKey: want,
    sample: { audits: auds.size, businesses: biz.size, towns: towns.size, questions: buckets.size, cells: (eng.chatgpt?.[1] ?? 0) + (eng.gemini?.[1] ?? 0), multiRunAudits: 4, multiRunQuestions: qs },
    engines: Object.entries(eng).map(([e, v]) => ({ engine: e, label: e === 'chatgpt' ? 'ChatGPT' : 'Gemini', named: v[0], answered: v[1] })),
    winnability: { open: 100, locked: 5 },
    sources: [{ engine: 'gemini', label: 'Gemini', directory: 5, ownSite: 0, authority: 2, other: 60, total: 67 }],
    topDomains: {}, marketAudits: 0,
    slots: qs > 0 ? [{ engine: 'gemini', label: 'Gemini', readableQuestions: qs, namesPerAnswer: names / qs, heldEveryRun: held / qs }] : [],
  } as unknown as NicheAnalysis;
  const v = nicheVerdict(n);
  console.log(`\n${v.kind.toUpperCase()}`);
  console.log(v.headline);
  console.log(`   (from ${qs} churn-readable questions · ${(names/qs).toFixed(1)} names · ${(held/qs).toFixed(1)} held · tier ${v.tier})`);
}
