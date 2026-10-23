// Throwaway (never staged): render the same NON-six-answer fixtures with two checkouts' renderers and
// print a hash per case. Usage: npx tsx scripts/_bytecompare.ts <repoRoot>
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const lib = (f: string) => import(pathToFileURL(`${root}/src/lib/${f}`).href);
const { buildReportData } = await lib('auditReport.ts');
const { renderReportHtml } = await lib('aiAuditReportHtml.ts');
const { initialHookStateV2 } = await lib('hookScore.ts');

const BIZ = 'Acme Roofing Services';
const Q = ['roof repair in Leeds', 'best roofer in Leeds', 'emergency roofer near Leeds'];
const cell = (named: boolean, rivals: string[]) => ({ named, self_named: named, answer_text: named ? `You could try ${BIZ} or ${rivals.join(', ')}. They are well reviewed and cover the whole city.` : `Good local options include ${rivals.join(', ')}. Compare quotes, reviews and guarantees before choosing one.`, competitors: rivals, citations: [] });
const rows = (grid: Array<[boolean, boolean]>) => grid.map(([c, g], i) => ({ id: `q${i}`, question: Q[i], status: 'done', result: { chatgpt: cell(c, ['Leeds Roof Co', 'Top Tiles Ltd']), gemini: cell(g, ['Leeds Roof Co', 'Slate Masters']) } }));
const ctx = (extra: Record<string, unknown> = {}) => ({ businessName: BIZ, businessType: 'roofer', locationText: 'Leeds', specialisms: '', isAggregatorUrl: () => false, hasWebsite: true, ...extra });
const run = (results: Record<string, unknown>) => ({ id: 'r1', run_number: 1, status: 'complete', mention_rate: 0, created_at: '2026-10-01T10:00:00Z', results: { competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] }, ...results } });
const render = (qr: unknown[], rn: unknown, cx: unknown, extra: Record<string, unknown> = {}) => {
  const d = buildReportData(qr as never, rn as never, cx as never);
  return renderReportHtml({ ...(d as object), generatedAtLabel: '1 October 2026', showOffer: true, offerUrl: '#', auditId: 'a1', requestCallUrl: '#', ...extra } as never);
};
const V1 = { version: 1, planned: [Q[0], Q[1], Q[2]], executed: 1, next_index: 1, stop_reason: 'visibility_gap_found', named_in: [], gap: { question_index: 0, question: Q[0], engine: 'gemini', target_named: false, named_instead: ['Leeds Roof Co'], citations: [], named_on_engines: [], answer_excerpt: 'Good local options include Leeds Roof Co. Compare quotes before choosing one.' } };
const grid: Array<[boolean, boolean]> = [[true, false], [false, false], [true, true]];
const cases: Record<string, () => string> = {
  plainAudit: () => render(rows(grid), run({}), ctx()),
  plainNoWebsite: () => render(rows(grid), run({}), ctx({ hasWebsite: false })),
  plainWithFaults: () => render(rows(grid), run({}), ctx(), { crawlFaults: [{ title: 'Your pages have no clear heading', detail: 'No H1 heading.', minor: false }], siteChecked: true }),
  paidBaseline: () => render(rows(grid), run({}), ctx(), { paidSummary: 'baseline' }),
  v1Hook: () => render(rows([[true, false]]).slice(0, 1), run({ hook: V1 }), ctx(), { crawlFaults: [{ title: 'Thin pages', detail: '2 pages under 120 words.', minor: false }] }),
  sixMeasuring: () => render(rows(grid), run({ hook: initialHookStateV2(Q) }), ctx(), { measuring: { runsDone: 0, runsTarget: 1 } }),
  sixNameCheck: () => render(rows(grid), run({ hook: initialHookStateV2(Q) }), ctx(), { nameNotJudgeable: true }),
  sixIncomplete: () => render(rows(grid).map((r, i) => i === 2 ? { ...r, status: 'failed', result: null } : r), run({ hook: initialHookStateV2(Q) }), ctx()),
};
for (const [k, f] of Object.entries(cases)) {
  const html = f();
  console.log(k.padEnd(16), createHash('sha256').update(html).digest('hex').slice(0, 16), html.length);
}
