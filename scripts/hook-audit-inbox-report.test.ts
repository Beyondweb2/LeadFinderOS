/* Hook audit Inbox card + report state + Quick AI Visibility Check report (Paul, 2026-09-26).
   Cases A–O from the brief:
     A historical 1-question / 2-answer audit   B current complete   C current running
     D report building                          E report ready       F old audit with no report
     G collapsed card                           H expanded card      I report table
     J featured search                          K 0/6 report         L 3/6 report
     M 5/6 report                               N 6/6 report         O incomplete
   Everything is driven through the real functions: scoreHookRun → scoreHookAuditForCard →
   hookReportState → HookVisibilityView (server-rendered), and buildReportData → renderReportHtml. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOOK_ENGINES, initialHookStateV2, type HookScoreRow } from '../src/lib/hookScore.ts';
import { hookReportState, hookStateNeedsPolling, hookRunInFlight, pickHookAudit, scoreHookAuditForCard, type HookCardAudit } from '../src/lib/hookVisibility.ts';
import { HookVisibilityView } from '../src/components/HookVisibilityView.tsx';
import { buildReportData } from '../src/lib/auditReport.ts';
import { renderReportHtml } from '../src/lib/aiAuditReportHtml.ts';
import { hookReportCopy } from '../src/lib/hookAudit.ts';
import { MEASURING_STALL_MS } from '../src/lib/measuringState.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  if (value) console.log(`PASS ${message}`);
  else { failures++; console.error(`FAIL ${message}`); }
}

const LEAD = 'lead-ees';
const BIZ = 'E.E.S Electrical Services';
const TOWN = 'Addlestone';
const TRADE = 'Electricians';
const Q = [
  'Who are the best electricians in Addlestone UK?',
  'Who would you recommend for an EICR in Addlestone UK?',
  'Can you recommend a reliable electrician for commercial properties in Addlestone UK?',
];
const RIVALS: Record<string, string[]> = {
  '0:chatgpt': ['Sparks Ltd'], '0:gemini': ['Volt Electrical'],
  '1:chatgpt': ['Bright Spark Co'], '1:gemini': ['EICR Masters'],
  '2:chatgpt': ['Commercial Power Ltd'], '2:gemini': ['Precision Electrical Services Limited', 'Addlestone Electricians', 'S G Electrical Surrey', "Pennington's Electrical Contractors"],
};
function cell(named: boolean, qi: number, e: string) {
  const r = RIVALS[`${qi}:${e}`];
  return { named, self_named: named, answer_text: named ? `Try ${BIZ} or ${r.join(', ')}. A long friendly paragraph from the model about how to choose.` : `If you are looking for reliable commercial electricians to handle maintenance, try ${r.join(', ')}.`, competitors: r, citations: [] };
}
const FAILED = { named: false, answer_text: '', competitors: [], error: 'timeout' };
/** grid[i] = [chatgpt, gemini]; true/false = named/not named, null = failed, undefined = not yet run. */
type G = boolean | null | undefined;
function rows(grid: Array<[G, G]>): HookScoreRow[] {
  return grid.map(([c, g], i) => {
    if (c === undefined && g === undefined) return { question: Q[i], status: 'pending', result: null, engines: [...HOOK_ENGINES] };
    return { question: Q[i], status: 'done', engines: [...HOOK_ENGINES], result: { chatgpt: c === null ? FAILED : cell(!!c, i, 'chatgpt'), gemini: g === null ? FAILED : cell(!!g, i, 'gemini') } };
  });
}

function audit(id: string, createdAt: string, runStatus: string, hook: unknown, extra: Partial<HookCardAudit> = {}) {
  return {
    id, lead_id: LEAD, short_code: `c${id.slice(-5)}`, created_at: createdAt,
    business_name: BIZ, business_type: TRADE, location_text: TOWN, audit_purpose: 'audit',
    baseline_target_runs: 1, is_measurement: false, baseline_contract: null, is_market: false,
    ai_audit_runs: [{ id: `run-${id}`, status: runStatus, run_number: 1, created_at: createdAt, results: { hook, competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } }],
    ...extra,
  } as HookCardAudit & { lead_id: string; short_code: string };
}

/** Everything the Inbox card sees, from audits + queue rows, exactly as the loader computes it. */
function inbox(audits: ReturnType<typeof audit>[], grid: Array<[G, G]>, nowMs = Date.parse('2026-09-26T10:05:00Z')) {
  const picked = pickHookAudit(audits)!;
  const state = (picked.runResults as { hook?: unknown }).hook;
  const card = scoreHookAuditForCard({ audit: picked.audit, state, runResults: picked.runResults, rows: rows(grid) });
  const report = hookReportState({ leadId: LEAD, audits, picked, score: card.score, nowMs });
  const view = (expanded = false) => renderToStaticMarkup(createElement(HookVisibilityView, {
    card, inFlight: hookRunInFlight(picked.runStatus), state, report, onRunNew: () => {}, defaultExpanded: expanded,
  }));
  return { picked, card, report, view };
}
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&times;/g, '×').replace(/&amp;/g, '&').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ');

const V1_EES = { version: 1, planned: [Q[2], Q[1], Q[0]], executed: 1, next_index: 1, stop_reason: 'visibility_gap_found', named_in: [], gap: { question_index: 0, question: Q[2], engine: 'gemini', target_named: false, named_instead: [], citations: [], named_on_engines: ['chatgpt'], answer_excerpt: '' } };
const V2 = initialHookStateV2(Q);

/* ── A. HISTORICAL: the real E.E.S shape (v1, one question, ChatGPT named, Google AI missed) ───── */
{
  const old = audit('a-old-00001', '2026-09-25T11:33:49Z', 'complete', V1_EES);
  const v1Rows: Array<[G, G]> = [[true, false], [undefined, undefined], [undefined, undefined]];
  // v1 planned order differs from Q; rebuild the one executed row under the question it asked.
  const picked = pickHookAudit([old])!;
  const r: HookScoreRow[] = [{ question: Q[2], status: 'done', engines: [...HOOK_ENGINES], result: { chatgpt: cell(true, 2, 'chatgpt'), gemini: cell(false, 2, 'gemini') } }];
  const card = scoreHookAuditForCard({ audit: picked.audit, state: V1_EES, runResults: picked.runResults, rows: r });
  ok(card.score.shape === 'adaptive_legacy' && card.score.expected === 2 && card.score.named === 1 && card.score.percent === 50, 'A: E.E.S v1 keeps its real denominator: 50% named (1/2)');
  const report = hookReportState({ leadId: LEAD, audits: [old], picked, score: card.score });
  const html = renderToStaticMarkup(createElement(HookVisibilityView, { card, inFlight: false, state: V1_EES, report, onRunNew: () => {} }));
  const t = text(html);
  ok(/Older quick check/.test(t), 'A: labelled "Older quick check" in plain sight');
  ok(/50% named \(1\/2\)/.test(t), 'A: shows 50% named (1/2), never out of 6');
  ok(/previous early-stop method/.test(t), 'A: says it used the previous early-stop method');
  ok(/Run new 3 × 2 audit/.test(t) && html.includes('data-testid="hook-run-new"'), 'A: the "Run new 3 × 2 audit" action is visible');
  ok(/View old details/.test(t), 'A: details button reads "View old details"');
  ok(report.kind === 'ready' && report.isCurrent && /Open report/.test(t), 'A: the old completed audit still has its own report');
  void v1Rows;
}

/* ── B. CURRENT COMPLETE: 3 questions, 6 valid results ──────────────────────────────────────── */
{
  const cur = audit('a-cur-00002', '2026-09-26T10:00:00Z', 'complete', V2);
  const { card, report, view } = inbox([cur], [[true, false], [true, true], [false, false]]);
  const s = card.score;
  ok(s.shape === 'six' && s.expected === 6 && s.complete && s.named === 3 && s.percent === 50, 'B: current audit scores X/6 (3/6 = 50%)');
  ok(s.perEngine.find((t) => t.engine === 'chatgpt')?.named === 2 && s.perEngine.find((t) => t.engine === 'gemini')?.named === 1, 'B: ChatGPT 2/3, Google AI 1/3');
  const t = text(view());
  ok(/50% named \(3\/6\)/.test(t) && /ChatGPT 2\/3/.test(t) && /Google AI 1\/3/.test(t), 'B: card headline and engine split');
  ok(!/Older/.test(t) && !/Run new/.test(t), 'B: a current audit is not labelled old and does not offer a rerun');
  ok(report.kind === 'ready' && report.isCurrent, 'B: report ready for this audit');
}

/* ── C. CURRENT RUNNING: compact progress, never a percentage ───────────────────────────────── */
{
  const cur = audit('a-run-00003', '2026-09-26T10:00:00Z', 'running', V2);
  const { report, view } = inbox([cur], [[true, false], [undefined, undefined], [undefined, undefined]]);
  const t = text(view());
  ok(/Checking AI results 2\/6/.test(t), 'C: "Checking AI results 2/6"');
  ok(!/%/.test(t), 'C: no percentage while running');
  ok(report.kind === 'running' && /Audit running/.test(t), 'C: report state says audit running');
  ok(hookStateNeedsPolling(report), 'C: keeps polling while running');
}

/* ── D. REPORT BUILDING: six results in, run still being released ───────────────────────────── */
{
  const cur = audit('a-bld-00004', '2026-09-26T10:00:00Z', 'processing', V2);
  const old = audit('a-old-00005', '2026-09-25T11:33:49Z', 'complete', V1_EES);
  const { report, view } = inbox([cur, old], [[true, false], [true, true], [false, false]]);
  const t = text(view());
  ok(report.kind === 'preparing', 'D: processing run → preparing');
  ok(/Preparing report…/.test(t), 'D: shows "Preparing report…"');
  ok(!/No public report yet/.test(t) && !/run an audit/i.test(t), 'D: never "No public report yet — run an audit" while preparing');
  ok(report.kind === 'preparing' && report.previous?.auditId === old.id, 'D: the older report is offered separately, labelled previous');
  ok(hookStateNeedsPolling(report), 'D: keeps polling while preparing');
  // Six results in while the run still says running is also "preparing".
  const cur2 = audit('a-bld-00006', '2026-09-26T10:00:00Z', 'running', V2);
  ok(inbox([cur2], [[true, false], [true, true], [false, false]]).report.kind === 'preparing', 'D: all six in but run not released → preparing');
  // Past the stall window: stop polling and say so.
  const slow = inbox([cur], [[true, false], [true, true], [false, false]], Date.parse('2026-09-26T10:00:00Z') + MEASURING_STALL_MS + 60_000).report;
  ok(slow.kind === 'slow' && !hookStateNeedsPolling(slow), 'D: past MEASURING_STALL_MS → "taking longer", polling stops');
}

/* ── E. REPORT READY: obvious Open report, the right audit ──────────────────────────────────── */
{
  const cur = audit('a-rdy-00007', '2026-09-26T10:00:00Z', 'complete', V2);
  const old = audit('a-old-00008', '2026-09-25T11:33:49Z', 'complete', V1_EES);
  const { report, view } = inbox([cur, old], [[true, false], [true, true], [false, false]]);
  const html = view();
  ok(report.kind === 'ready' && report.link.auditId === cur.id && report.isCurrent, 'E: ready resolves THIS audit, not the older one');
  ok(report.kind === 'ready' && report.link.url === `https://findable.live/r/${cur.short_code}`, 'E: the link is this audit’s short code');
  ok(html.includes('data-testid="hook-open-report"') && html.includes(`data-audit-id="${cur.id}"`) && /Open report/.test(text(html)), 'E: a clear "Open report" button carrying the audit id');
  ok(!hookStateNeedsPolling(report), 'E: polling stops once ready');
}

/* ── F. OLD AUDIT WITH NO REPORT ───────────────────────────────────────────────────────────── */
{
  const old = audit('a-old-00009', '2026-09-25T11:33:49Z', 'failed', V1_EES);
  const picked = pickHookAudit([old])!;
  const r: HookScoreRow[] = [{ question: Q[2], status: 'done', engines: [...HOOK_ENGINES], result: { chatgpt: cell(true, 2, 'chatgpt'), gemini: cell(false, 2, 'gemini') } }];
  const card = scoreHookAuditForCard({ audit: picked.audit, state: V1_EES, runResults: picked.runResults, rows: r });
  const report = hookReportState({ leadId: LEAD, audits: [old], picked, score: card.score });
  const t = text(renderToStaticMarkup(createElement(HookVisibilityView, { card, inFlight: false, state: V1_EES, report, onRunNew: () => {} })));
  ok(report.kind === 'historical_no_report', 'F: an old failed check → historical_no_report');
  ok(/No public report generated for this historical check/.test(t), 'F: says no public report was generated for this historical check');
  ok(!/No audit exists/i.test(t) && !/No audit yet/.test(t), 'F: never claims no audit exists');
}

/* ── G / H. COLLAPSED BY DEFAULT, EXPANDED WITH A HEIGHT CAP ───────────────────────────────── */
{
  const cur = audit('a-col-00010', '2026-09-26T10:00:00Z', 'complete', V2);
  const { card, view } = inbox([cur], [[true, false], [true, true], [false, false]]);
  const collapsed = view(false);
  const tc = text(collapsed);
  ok(collapsed.includes('data-expanded="false"') && !collapsed.includes('hook-visibility-details'), 'G: details are hidden by default');
  ok(/Best missed search:/.test(tc) && tc.includes(card.score.hook!.question), 'G: collapsed shows the best missed search');
  ok(!tc.includes('Precision Electrical Services Limited') && !/A long friendly paragraph/.test(tc), 'G: no competitor list or model prose when collapsed');
  ok(/View details/.test(tc), 'G: "View details" action');
  const expanded = view(true);
  const te = text(expanded);
  ok(expanded.includes('hook-visibility-details') && /max-h-\[20vh\]/.test(expanded) && /overflow-y-auto/.test(expanded), 'H: expanded details sit in a height-capped, internally scrolling panel');
  ok(/Selected outreach search/.test(te) && te.includes('Precision Electrical Services Limited'), 'H: expanded shows the selected search and its competitors');
  ok(/Other Google AI misses/.test(te) && /Other ChatGPT misses/.test(te) && /Named searches/.test(te), 'H: expanded shows other misses by engine and the named searches');
  const card2 = [collapsed, expanded].join('');
  ok(!/Gemini/.test(text(card2)), 'H: the card never says Gemini');
}

/* ── Report fixtures ───────────────────────────────────────────────────────────────────────── */
function report(grid: Array<[G, G]>, extra: Record<string, unknown> = {}) {
  const run = { id: 'r1', run_number: 1, status: 'complete', mention_rate: 0, created_at: '2026-09-26T10:00:00Z', results: { hook: V2, competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } };
  const qr = rows(grid).map((r, i) => ({ id: `q${i}`, question: r.question, status: r.status, result: r.result }));
  const d = buildReportData(qr as never, run as never, { businessName: BIZ, businessType: TRADE, locationText: TOWN, specialisms: '', isAggregatorUrl: () => false, hasWebsite: true });
  const html = renderReportHtml({ ...(d as object), generatedAtLabel: '26 Sept 2026', ...extra } as never);
  return { d, html, t: text(html) };
}

/* ── I / J / L. THE 3/6 REPORT: table, featured search ─────────────────────────────────────── */
{
  const { d, html, t } = report([[true, false], [true, true], [false, false]]);
  const rowsHtml = html.match(/<div class="qrow"><span class="qrow-q">/g) ?? [];
  ok(/The questions we asked/.test(t) && rowsHtml.length === 3, 'I: the table has exactly 3 question rows');
  ok(Q.every((q) => html.includes(q.replace(/'/g, '&#39;'))), 'I: all three questions are visible');
  const head = html.match(/<div class="qrow qrow-head">([\s\S]*?)<\/div>/)?.[1] ?? '';
  ok(/ChatGPT/.test(head) && /Google AI/.test(head), 'I: columns are ChatGPT and Google AI');
  const marks = html.slice(html.indexOf('The questions we asked')).match(/class="qm qm-(yes|no|na)"/g) ?? [];
  ok(marks.length === 6 && !marks.some((m) => m.includes('qm-na')), 'I: each row has a ChatGPT and a Google AI status (6 marks)');
  ok(/50\s*%/.test(t) && /of AI answers named/.test(t) && /3 of 6 answers/.test(t) && /3 questions × 2 AI engines/.test(t), 'L: 3/6 → 50%, raw count and method under it');
  ok(/You're being named, but not consistently\./.test(t), 'L: verdict "being named, but not consistently"');
  const g = d!.hook!.gap!;
  ok(g.engine === 'gemini' && g.question === Q[2], 'J: the featured search is the strongest Google AI miss');
  ok(/Asked Google AI/.test(t) && t.includes(`wasn’t named`), 'J: featured block names the engine and has the "wasn’t named" strip');
  ok(RIVALS['2:gemini'].every((n) => html.includes(n.replace(/'/g, '&#39;'))), 'J: the businesses named are that exact result’s own list');
  ok(!html.includes('Commercial Power Ltd'), 'J: never another engine’s competitors for the same question');
  ok(!/A long friendly paragraph/.test(t) && !/If you are looking for reliable commercial electricians/.test(t), 'J: no raw model prose on the quick report');
  ok(!/Gemini/.test(t.replace(/<style[\s\S]*?<\/style>/g, '')), 'the quick report never says Gemini');
  ok(!/Where you show up, and where you don/.test(t) && !/Why you&rsquo;re not in the answer/.test(html), 'the long "the fix" section is dropped from the quick report');
}

/* ── K / M / N. 0/6, 5/6, 6/6 ──────────────────────────────────────────────────────────────── */
{
  const k = report([[false, false], [false, false], [false, false]]);
  ok(/\b0\s*%/.test(k.t) && /0 of 6 answers/.test(k.t) && /You're not being named in these AI searches yet\./.test(k.t), 'K: 0/6 → 0% and the not-named verdict');
  const m = report([[true, true], [true, true], [true, false]]);
  ok(/83\s*%/.test(m.t) && /5 of 6 answers/.test(m.t), 'M: 5/6 → 83%');
  ok(m.d!.hook!.gap!.engine === 'gemini' && m.d!.hook!.gap!.question === Q[2], 'M: the one Google AI miss is featured');
  const n = report([[true, true], [true, true], [true, true]]);
  ok(/100\s*%/.test(n.t) && /6 of 6 answers/.test(n.t), 'N: 6/6 → 100%, 6 of 6 answers');
  ok(/You're being named consistently in this quick check\./.test(n.t), 'N: consistent verdict');
  ok(!n.html.includes('class="chatcard evcard"') && !/wasn’t named/.test(n.t), 'N: no manufactured miss');
  ok((n.html.slice(n.html.indexOf('The questions we asked')).match(/qm-yes/g) ?? []).length === 6, 'N: the table shows all six ticks');
  // Percentages derive from the counts, never hard-coded.
  const pct = (grid: Array<[G, G]>) => report(grid).d!.hook!.score!.percent;
  ok(pct([[true, false], [false, false], [false, false]]) === 17 && pct([[true, true], [false, false], [false, false]]) === 33 && pct([[true, true], [true, true], [false, false]]) === 67, '1/6 → 17%, 2/6 → 33%, 4/6 → 67%');
  // Website: nothing found + a completed crawl → the truthful line; no crawl → silence.
  ok(/No technical faults found/.test(report([[true, true], [true, true], [true, true]], { siteChecked: true }).t), 'website: completed clean crawl → a truthful "no technical faults" line');
  ok(!/Your website/i.test(report([[true, true], [true, true], [true, true]]).t), 'website: no completed crawl → nothing invented');
  const many = Array.from({ length: 8 }, (_, i) => ({ title: `Issue ${i + 1}`, detail: 'Detail.', minor: false }));
  const w = report([[true, false], [true, true], [false, false]], { crawlFaults: many });
  ok(/Website issues we can fix/.test(w.t) && /Issue 5/.test(w.t) && !/Issue 6/.test(w.t), 'website: capped at 5 findings');
}

/* ── O. INCOMPLETE: 5 valid + 1 failure → no score, no public report, no hook ──────────────── */
{
  const grid: Array<[G, G]> = [[true, false], [true, true], [false, null]];
  const o = report(grid);
  ok(!o.d!.hook && o.d!.hookIncomplete === true, 'O: incomplete v2 → no summary, hookIncomplete set');
  ok(/This check didn’t finish/.test(o.t) && !/%/.test(o.t.replace(/100%/g, '')), 'O: the public page shows the incomplete notice and no percentage');
  ok(!/of AI answers named/.test(o.t) && !/out of \d+ answers?/.test(o.t), 'O: never the ordinary count hero');
  ok(!/If that number has not gone up/.test(o.t), 'O: no refund line about a number that is not shown');
  ok(!/Gemini/.test(o.t), 'O: the incomplete page says Google AI, not Gemini');
  const cur = audit('a-inc-00011', '2026-09-26T10:00:00Z', 'complete', V2);
  const { card, report: st, view } = inbox([cur], grid);
  ok(!card.score.complete && card.score.percent === null && card.score.hook === null, 'O: the card has no percentage and no hook');
  ok(st.kind === 'incomplete' && /Incomplete quick check/.test(text(view())) && /Run new 3 × 2 audit/.test(text(view())), 'O: Inbox says "Incomplete quick check" with a rerun action, no Open report');
  ok(!view().includes('hook-open-report'), 'O: no Open report for an incomplete check');
}

/* ── Copy is the report's, not the card's own ───────────────────────────────────────────────── */
{
  const { d } = report([[false, false], [false, false], [false, false]]);
  const c = hookReportCopy(d!.hook!, BIZ);
  ok(/not your full AI visibility measurement/.test(c.caveat), 'the quick-check caveat says it is not the full measurement');
}

/* ── Inbox wiring: the rerun never queues a pitch; the bar no longer says "run an audit" ──── */
{
  const src = readFileSync(resolve(import.meta.dirname, '..', 'src/pages/Inbox.tsx'), 'utf8');
  const i = src.indexOf('const startHookRerun');
  const body = src.slice(i, src.indexOf('};', src.indexOf("invoke('create-ai-audit'", i)));
  ok(i > 0 && body.includes('hook_audit: true') && body.includes('fresh_audit: true'), 'rerun: creates a fresh hook audit');
  ok(!body.includes('queue_pitch_on_complete'), 'rerun: never passes queue_pitch_on_complete (nothing is sent)');
  ok(!src.includes('No public report yet — run an audit for this lead.'), 'Inbox: the misleading "No public report yet — run an audit" line is gone');
}

if (failures) throw new Error(`${failures} hook inbox/report checks failed`);
console.log('hook-audit-inbox-report: all checks passed');
