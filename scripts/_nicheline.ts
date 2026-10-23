/* What the screen will say, built from the REAL per-trade churn measured off the book. */
import { nicheVerdict, type NicheAnalysis } from '../src/lib/nicheView';
const mk = (trade: string, names: number, held: number, readable: number, extra: Partial<NicheAnalysis['sample']> = {}): NicheAnalysis => ({
  trade, tradeKey: trade.toLowerCase(),
  sample: { audits: 40, businesses: 30, towns: 12, questions: 200, cells: 900, multiRunAudits: 4, multiRunQuestions: readable, ...extra },
  engines: [{ engine: 'chatgpt', label: 'ChatGPT', named: 300, answered: 600 }, { engine: 'gemini', label: 'Gemini', named: 100, answered: 600 }],
  winnability: { open: 120, locked: 10, contested: 40, named: 30 },
  sources: [{ engine: 'gemini', label: 'Gemini', directory: 5, ownSite: 0, authority: 3, other: 60, total: 68 }],
  topDomains: {},
  slots: readable > 0 ? [{ engine: 'gemini', label: 'Gemini', readableQuestions: readable, namesPerAnswer: names, heldEveryRun: held }] : [],
} as unknown as NicheAnalysis);

/* The measured figures, gemini-only, from scripts/_slots5.ts over every clean fold on file. */
for (const [t, n, h, r] of [
  ['Electricians', 4.0, 1.3, 63], ['Plumbers', 4.6, 2.2, 110], ['Locksmiths', 4.2, 1.8, 146],
  ['Accountants', 5.0, 2.2, 62], ['Mobile mechanics', 4.0, 3.4, 12],
] as const) {
  const v = nicheVerdict(mk(t, n, h, r));
  console.log(`[${v.kind.toUpperCase().padEnd(14)}] ${v.headline}`);
}
console.log('\n-- and the honest default, which most niches will hit --');
for (const [t, n, h, r] of [['Roofers', 0, 0, 0], ['Tilers', 4.1, 1.2, 3]] as const) {
  const v = nicheVerdict(mk(t, n, h, r));
  console.log(`[${v.kind.toUpperCase().padEnd(14)}] ${v.headline}`);
}
