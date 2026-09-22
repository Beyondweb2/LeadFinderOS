/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NAMED IS ONE NUMBER — the summary and the detail read the same predicate, and a citation is not it.

   🔴 THE FAULT (MCLocksmiths, 2026-09-22). The internal baseline view printed "Gemini 1/3" over
   "Named in the answer — 0 of 3" for the same three cells. The summary (buildBaselineView) and the
   hero read cellNamed() — the model's verdict, string fallback — while the detail line read a raw
   nameMatches() over answer_text. Two rulers, 4 of 20 questions disagreeing.

   Run: npx tsx scripts/named-one-ruler.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { buildReportData, type EngineResult, type QueueRow } from '../src/lib/auditReport';
import { buildBaselineView } from '../src/lib/baselineView';
import { cellNamed } from '../src/lib/namedSignal';

const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

const BIZ = 'MCLocksmiths centre';
const OWN = 'https://mc-locksmiths.com/';
const clientCite = { title: 'MC Locksmiths | Canterbury', url: 'https://mc-locksmiths.com/services' };
const cell = (o: Partial<EngineResult>): EngineResult => ({ named: false, position: null, competitors: ['Keytek'], citations: [], answer_text: 'Keytek Locksmiths covers Canterbury.', ...o });

/* Q1 — mixed across three runs. ChatGPT: r1 model says named; r2 model says NOT named although the
   client is cited as a source and the stored string match said true; r3 no model verdict, stored
   string match true (fallback). Canonical: named 2 of 3, cited 1 of 3. Gemini never names. */
const q1 = 'Who offers 24 hour locksmith services in Canterbury?';
const q1Runs: Array<Record<string, EngineResult>> = [
  { chatgpt: cell({ self_named: true, named: true, answer_text: 'MCLocksmiths centre and Keytek both cover Canterbury.' }), gemini: cell({ self_named: false }) },
  /* 2026-09-22: the answer TEXT is the ruler when trade/town are known (named-text-primary.test.ts),
     so this citation-only cell must not name the business in its prose. */
  { chatgpt: cell({ self_named: false, named: true, citations: [clientCite], answer_text: 'Keytek covers Canterbury. [1]' }), gemini: cell({ self_named: false }) },
  { chatgpt: cell({ named: true, answer_text: '**MCLocksmiths centre** 5.0 · Keytek' }), gemini: cell({ named: false }) },
];
/* Q2 — citation-only in every run: the model read each answer and said the client is not one of
   the businesses it presents, but the client's own site is cited as a source (the stored string
   match, which also matched source titles at scan time, said true). Canonical: named 0, cited 3. */
const q2 = 'Who provides locksmith services in Ramsgate?';
const q2Runs: Array<Record<string, EngineResult>> = [1, 2, 3].map(() => ({
  chatgpt: cell({ self_named: false, named: true, citations: [clientCite] }),
  gemini: cell({ self_named: false, named: false }),
}));

const queueRows: QueueRow[] = [];
const liteRows: Array<{ run_id: string; question: string; engines: string[]; status: string; result: Record<string, unknown> }> = [];
for (let r = 0; r < 3; r++) {
  for (const [q, runs] of [[q1, q1Runs], [q2, q2Runs]] as const) {
    queueRows.push({ id: `${q}-${r}`, question: q, status: 'done', result: runs[r] });
    liteRows.push({ run_id: `run-${r + 1}`, question: q, engines: ['chatgpt', 'gemini'], status: 'done', result: runs[r] });
  }
}

const report = buildReportData(queueRows, { id: 'run-3', audit_id: 'a', run_number: 3, status: 'complete', mention_rate: null, results: null }, {
  businessName: BIZ, businessType: 'Locksmiths', locationText: 'Canterbury', specialisms: '', isAggregatorUrl: () => false, ownWebsite: OWN,
});
const view = buildBaselineView(liteRows, { businessName: BIZ });

type Eng = { label: string; named: number; recommended?: number | null; cited?: number | null; runs: number; counted: boolean };
const breakdown = (report as unknown as { questionBreakdown: Array<{ question: string; perEngine: Eng[] }> }).questionBreakdown;
const engineOf = (q: string, label: string) => breakdown.find((b) => b.question === q)!.perEngine.find((e) => e.label === label)!;
const viewOf = (q: string, engine: string) => view.questions.find((v) => v.question === q)!.engines[engine];

// Summary and detail cannot disagree — for every question and every scored engine.
for (const q of [q1, q2]) for (const [engine, label] of [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini']] as const) {
  const e = engineOf(q, label); const v = viewOf(q, engine);
  check(`summary == detail for "${q.slice(0, 30)}…" ${label}`, v.named === e.named && e.named === (e.recommended ?? 0) && v.runs === 3 && e.runs === 3);
}
// Mixed three-run cell counts correctly under the canonical ruler.
check('mixed runs: ChatGPT named 2 of 3 (model true, model false, string fallback true)', engineOf(q1, 'ChatGPT').named === 2 && engineOf(q1, 'ChatGPT').recommended === 2 && viewOf(q1, 'chatgpt').named === 2);
check('mixed runs: the model’s "not named" beats a stored string match and a client citation', cellNamed(q1Runs[1].chatgpt) === false && engineOf(q1, 'ChatGPT').cited === 1);
check('mixed runs: Gemini named 0 of 3 in both places', engineOf(q1, 'Gemini').named === 0 && viewOf(q1, 'gemini').named === 0);
// Citation-only never counts as named, in either place; cited is its own number.
check('citation-only: named 0 of 3 in summary and detail', engineOf(q2, 'ChatGPT').named === 0 && engineOf(q2, 'ChatGPT').recommended === 0 && viewOf(q2, 'chatgpt').named === 0);
check('citation-only: cited 3 of 3 is still reported', engineOf(q2, 'ChatGPT').cited === 3);
// The overall baseline total equals the per-cell canonical sum, in both surfaces.
const perCell = queueRows.reduce((n, r) => n + ['chatgpt', 'gemini'].filter((e) => cellNamed(r.result![e])).length, 0);
check('overall: view total = per-cell canonical sum', view.namedCells === perCell && view.answeredCells === 12 && perCell === 2);
check('overall: report hero total = per-cell canonical sum', (report as unknown as { named: number; total: number }).named === perCell && (report as unknown as { total: number }).total === 12);
check('overall: rate is the same fraction in both', view.namedRatePct === Math.round((perCell / 12) * 100));
// The predicate itself.
check('predicate: absent model verdict falls back to the stored match', cellNamed({ named: true }) === true && cellNamed({ named: false }) === false);
check('predicate: a model verdict wins in both directions', cellNamed({ self_named: true, named: false }) === true && cellNamed({ self_named: false, named: true }) === false);
check('predicate: an empty cell is never named', cellNamed(null) === false && cellNamed(undefined) === false);

let failures = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
if (failures) throw new Error(`${failures} failures`);
