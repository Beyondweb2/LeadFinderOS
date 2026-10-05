/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OUTREACH: COMPACT AI CHECK ON THE ROWS (2026-10-05, improve/outreach-compact-audit-rows).
   docs/pre-sales-certification/outreach-compact-audit-rows.md.

   The "Check before calling" results panel is gone; each Outreach row says Waiting / Checking… /
   ChatGPT x · Gemini y / Check failed · Retry, with a "Call screen" button once ready; a one-line bar
   carries the batch counts, checks left today, Stop and "Open next ready".
   Pure rules (src/lib/outreachRowCheck.ts) against the REAL report fold (buildReportData), the real
   component rendered to markup, and the wiring of the page, the table, the card and the reads.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  rowScoreFromPerEngine, scoreLine, rowCheckState, nextReadyLead, readyCount, isCallableLead,
  NEXT_READY_EXCLUDED_STATUSES, type RowCheckState, type RowScore,
} from '../src/lib/outreachRowCheck.ts';
import { buildReportData } from '../src/lib/auditReport.ts';
import { leadEligibility, SALES_CHECK_BATCH_MAX, SALES_CHECK_DEFAULT_PER_REP_PER_DAY } from '../src/lib/salesCheck.ts';
import { CLIENT_STATUSES } from '../src/lib/roleRules.ts';
import { DEFAULT_PROTECTION_LIMITS } from '../src/lib/protectionLimits.ts';
import { AiCheckSummary, OutreachCheckBar } from '../src/components/OutreachAiCheck.tsx';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log(`  ✓ ${m}`); else { f++; console.log(`  ✗ FAIL ${m}`); } };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/* ── a real hook result: 3 questions × ChatGPT + Gemini ── */
const BIZ = 'ZZ QA Brookfoot Plumbing';
const RIVAL = 'ZZ Rival Pennine Plumbing';
const FINDING = 'No town named on the home page';
const QS = ['Who are the best plumbers in Halifax, UK?', 'Can you recommend a reliable plumber in Halifax, UK?', 'Which plumbers in Halifax, UK have the best reviews?'];
const cell = (named: boolean) => ({ named, self_named: named, position: named ? 1 : null, citations: [], competitors: [RIVAL],
  answer_text: named ? `${BIZ} is well reviewed, as is ${RIVAL}.` : `Try ${RIVAL} — ${FINDING}.` });
type Grid = Array<[boolean | null, boolean | null]>;
const rows = (g: Grid) => QS.map((q, i) => ({ id: `q${i}`, question: q, status: 'done', engines: ['chatgpt', 'gemini'],
  result: Object.fromEntries([['chatgpt', g[i][0]], ['gemini', g[i][1]]].filter(([, v]) => v !== null).map(([k, v]) => [k, cell(v as boolean)])) }));
const run = { id: 'r1', audit_id: 'a1', run_number: 1, status: 'complete', mention_rate: 0, results: { competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } };
const scoreOf = (g: Grid): RowScore | null => rowScoreFromPerEngine(buildReportData(rows(g) as never, run as never,
  { businessName: BIZ, businessType: 'plumbers', locationText: 'Halifax', specialisms: '', isAggregatorUrl: () => false, ownWebsite: 'https://zz-qa.example' })?.perEngine ?? null);

console.log('── the row score: ChatGPT x/3 · Gemini y/3, from the report\'s own fold ──');
{
  const s = scoreOf([[true, false], [false, false], [false, false]]);
  ok(scoreLine(s) === 'ChatGPT 1/3 · Gemini 0/3', `a checked row reads "ChatGPT 1/3 · Gemini 0/3" (got "${scoreLine(s)}")`);
  ok(scoreLine(scoreOf([[true, true], [true, true], [true, true]])) === 'ChatGPT 3/3 · Gemini 3/3', 'all named → 3/3 · 3/3');
  ok(scoreLine(scoreOf([[true, null], [false, false], [false, true]])) === 'ChatGPT 1/3 · Gemini 1/2', 'the denominator is the STORED answered count: a lost Gemini answer reads 1/2, not 1/3');
  ok(scoreLine(scoreOf([[false, null], [false, null], [false, null]])) === 'ChatGPT 0/3 · Gemini –', 'an engine with no answers reads "Gemini –", never 0/3');
  const six = rowScoreFromPerEngine([{ label: 'ChatGPT', named: 2, total: 9 }, { label: 'Gemini', named: 1, total: 9 }, { label: 'AI Overview', named: 5, total: 9 }]);
  ok(scoreLine(six) === 'ChatGPT 2/9 · Gemini 1/9', 'a three-run method change reads x/9 with no code change; AI Overview is never on the row');
  ok(rowScoreFromPerEngine([]) === null && rowScoreFromPerEngine(null) === null, 'nothing answered → no score (never 0/0)');
  const json = JSON.stringify(s);
  ok(!json.includes('Pennine') && !json.includes(FINDING) && !json.includes('well reviewed') && !json.includes('Halifax'),
    'the score object carries no rival name, no answer text, no finding, no question — numbers and engine labels only');
}

console.log('── one state per row ──');
{
  const map = (status: string) => ({ auditId: 'a', runId: 'r', status });
  const item = (status: string, extra: Record<string, unknown> = {}) => ({ lead_id: 'l', status, ...extra });
  const k = (m: ReturnType<typeof map> | null, i: ReturnType<typeof item> | null) => rowCheckState(m, i).kind;
  ok(k(null, null) === 'not_checked', 'no audit, no batch item → Not checked');
  ok(k(null, item('queued')) === 'waiting' && k(null, item('starting')) === 'waiting', 'queued / starting → Waiting');
  ok(k(null, item('running')) === 'checking' && k(map('processing'), null) === 'checking' && k(map('pending'), null) === 'checking', 'running item or in-flight audit → Checking…');
  ok(k(map('complete'), null) === 'ready' && k(map('capped'), null) === 'ready', 'a finished audit → ready (scores)');
  ok(rowCheckState(map('complete'), item('reused', { audit_source: 'reused' })).cached === true && rowCheckState(map('complete'), null).cached === false, 'a reused (cached) result is marked reused; an ordinary one is not');
  const failed = rowCheckState(null, item('failed', { message: 'The AI check took too long — check it again later.' }));
  ok(failed.kind === 'failed' && /too long/.test(failed.message ?? ''), 'a failed item → Check failed, with the server\'s own words as the tooltip');
  ok(k(map('complete'), item('failed')) === 'ready', 'an older real result beats a failed re-check (the result on the lead is real)');
  ok(k(null, item('skipped')) === 'skipped', 'a skipped item → Skipped');
  ok(k(map('failed'), null) === 'failed' && k(map('cancelled'), null) === 'failed', 'a failed / cancelled audit run → Check failed · Retry');
  ok(k(map('mystery'), null) === 'not_checked', 'an unknown run status is never read as ready');
}

console.log('── the row markup: compact, scores only ──');
{
  const ready = { kind: 'ready', cached: false, message: null } as RowCheckState;
  const s = scoreOf([[true, false], [false, false], [false, false]]);
  const html = renderToStaticMarkup(createElement(AiCheckSummary, { state: ready, score: s, onCallScreen: () => {}, onRetry: () => {} }));
  const t = text(html);
  ok(/ChatGPT 1\/3/.test(t) && /Gemini 0\/3/.test(t), 'the checked row shows ChatGPT and Gemini');
  ok(/Call screen/.test(t) && /data-testid="row-call-screen"/.test(html), 'the checked row has a Call screen button');
  ok(!/Pennine|Rival|named them|did not name|website|Website|crawl|finding|missed/i.test(t), 'no rival name, no headline, no website finding, no missed query in the row');
  ok(t.length <= 60, `the whole ready row summary is one short line (${t.length} chars: "${t}")`);
  const cachedT = text(renderToStaticMarkup(createElement(AiCheckSummary, { state: { ...ready, cached: true }, score: s, onCallScreen: () => {} })));
  ok(!/reused/i.test(cachedT) && /ChatGPT 1\/3/.test(cachedT) && cachedT === t, 'a cached result looks exactly like a fresh ready result — no visible "reused" (final release)');
  const st = (kind: RowCheckState['kind']) => text(renderToStaticMarkup(createElement(AiCheckSummary, { state: { kind, cached: false, message: 'x' }, onRetry: () => {}, onCallScreen: () => {} })));
  ok(st('waiting') === 'Waiting', 'waiting → "Waiting"');
  ok(st('checking') === 'Checking…', 'checking → "Checking…"');
  ok(st('failed') === 'Check failed · Retry', 'failed → "Check failed · Retry"');
  ok(st('not_checked') === 'Not checked' && st('skipped') === 'Skipped', 'not checked / skipped → one word');
  ok(!/Call screen/.test(st('waiting') + st('checking') + st('failed') + st('not_checked')), 'Call screen is offered only once a result is ready');
  /* 32 rows, mixed states: every summary stays one short line. */
  const kinds: RowCheckState['kind'][] = ['ready', 'waiting', 'checking', 'failed', 'not_checked', 'skipped', 'ready', 'ready'];
  const lens = Array.from({ length: 32 }, (_, i) => {
    const kind = kinds[i % kinds.length];
    return text(renderToStaticMarkup(createElement(AiCheckSummary, { state: { kind, cached: i % 5 === 0, message: null }, score: kind === 'ready' ? s : undefined, onCallScreen: () => {}, onRetry: () => {} }))).length;
  });
  ok(lens.every((n) => n <= 60), `32 mixed-state rows: every summary ≤ 60 characters (longest ${Math.max(...lens)})`);
  const comp = code('src/components/OutreachAiCheck.tsx');
  ok(!/competitor|rival|headline|finding|crawl|answer_text|citation/i.test(comp), 'the row component has no field that could carry rivals, answers, findings or the crawl');
  ok(!/<p[\s>]|<ul|<li/.test(comp), 'no paragraphs or lists in the row or the bar — no audit card');
}

console.log('── the reads behind the scores ──');
{
  const hook = code('src/hooks/useOutreachRowScores.ts');
  ok(!/crawl|lead_crawl_checks|whatsapp|invokeEdge|functions\.invoke|\.rpc\(|\.insert\(|\.update\(|\.delete\(|service_role/i.test(hook), 'reads only: no crawl, no messages, no function call, no write, no service key (RLS applies)');
  ok(/resolveLeadReportAudit\(audits, id\)/.test(hook) && /buildReportData\(/.test(hook) && /rowScoreFromPerEngine\(report\?\.perEngine/.test(hook), 'the same audit and the same fold as the call screen; only perEngine leaves the hook');
  const table = read('src/components/OutreachTable.tsx');
  ok(/const scoreLeads = paginatedLeads\.filter\(/.test(table) && /useOutreachRowScores\(scoreLeads,/.test(table), 'scores are read for the page on screen only — never the whole book');
}

console.log('── the big panel is gone; bulk checking stays ──');
{
  const outreach = read('src/pages/Outreach.tsx');
  const table = read('src/components/OutreachTable.tsx');
  ok(!existsSync(path.join(ROOT, 'src/components/SalesCheckPanel.tsx')), 'SalesCheckPanel.tsx is deleted');
  ok(!/SalesCheckPanel|sales-check-panel|sales-check-items/.test(outreach + table), 'nothing renders the results panel');
  ok(/data-testid="sales-check-button"/.test(table) && /onSalesCheck\(Array\.from\(selectedIds\)\)/.test(table), 'select leads → "Check before calling" is still on the selection toolbar');
  ok(/<SalesCheckDialog/.test(outreach) && /checks\.start\(checkIds, refresh\)/.test(outreach), 'the press still opens the confirm dialog and starts the server batch');
  const dialog = read('src/components/SalesCheckDialog.tsx');
  ok(/SALES_CHECK_BATCH_MAX/.test(dialog) && /tooMany/.test(dialog) && SALES_CHECK_BATCH_MAX === 20, 'max per batch is still SALES_CHECK_BATCH_MAX (20), refused above it');
  ok(SALES_CHECK_DEFAULT_PER_REP_PER_DAY === 30 && Number(DEFAULT_PROTECTION_LIMITS.actions.sales_check.per_day) === 30, 'fresh checks per rep per day still default to 30');
  ok(/SALES_CHECK_AUDIT_REUSE_DAYS/.test(dialog), 'the dialog still says recent results are reused');
  ok(/salesCheckView=\{perms\.salesChecks \? checks\.view : null\}/.test(outreach), 'the batch view reaches the table only for the selling salesperson');
  ok(/allowance=\{salesCheckView\?\.allowance \?\? null\}/.test(table), 'checks left today are on the one-line bar');
  const bar = text(renderToStaticMarkup(createElement(OutreachCheckBar, {
    batch: { status: 'waiting', counts: { total: 12, queued: 3, running: 4, done: 4, reused: 1, failed: 0, skipped: 0 } },
    allowance: { limit: 30, remaining: 22 }, onStop: () => {}, ready: 5, hasNext: true, onOpenNext: () => {}, openedCount: 0, onStartOver: () => {},
  })));
  ok(/Checking 12 ?: 5 ready · 4 checking · 3 waiting/.test(bar) && /Checks left today: 22 ?\/30/.test(bar) && /Stop/.test(bar) && /Open next ready \(5\)/.test(bar), `the bar: counts, allowance, Stop, Open next ready ("${bar}")`);
  ok(!/\$|£|usd|cost|spend/i.test(bar), 'no cost on the bar');
  const empty = text(renderToStaticMarkup(createElement(OutreachCheckBar, { batch: null, allowance: null, ready: 0, hasNext: false, onOpenNext: () => {}, openedCount: 2, onStartOver: () => {} })));
  ok(/No ready lead left/.test(empty) && /Start over/.test(empty), 'nothing left → "No ready lead left" and Start over');
  const engine = read('supabase/functions/_shared/sales-check.ts');
  ok(!/\.from\("outreach_leads"\)\s*\.update/.test(engine), 'no status change from an audit: the engine still never writes a lead (unchanged here)');
}

console.log('── Open next ready ──');
{
  const ready: RowCheckState = { kind: 'ready', cached: false, message: null };
  const none: RowCheckState = { kind: 'not_checked', cached: false, message: null };
  const list = [
    { id: 'a', status: 'contacted' }, { id: 'b', status: 'not_contacted' }, { id: 'c', status: 'not_interested' },
    { id: 'd', status: 'not_contacted', is_archived: true }, { id: 'e', status: 'contacted', amount_paid: 99 },
    { id: 'f', status: 'won_pending_onboarding' }, { id: 'g', status: 'interested' }, { id: 'h', status: 'payment_received' },
  ];
  const isReady = new Set(['b', 'c', 'd', 'e', 'f', 'g', 'h']);
  const stateOf = (l: { id: string }) => (isReady.has(l.id) ? ready : none);
  ok(nextReadyLead(list, stateOf, new Set())?.id === 'b', 'the first READY lead in the list as shown (a is not checked)');
  ok(nextReadyLead(list, stateOf, new Set(['b']))?.id === 'g', 'opened leads are passed over; not interested, archived, paid, won and clients are never offered');
  ok(nextReadyLead(list, stateOf, new Set(['b', 'g'])) === null, 'nothing left → null');
  ok(readyCount(list, stateOf) === 2 && readyCount(list, stateOf, new Set(['b'])) === 1, 'the count is what is left to walk');
  const actor = 'rep';
  ok([...NEXT_READY_EXCLUDED_STATUSES].every((s) => !leadEligibility(actor, { id: 'x', assigned_to_user_id: actor, status: s, business_name: 'B', search_keyword: 't', search_location: 'x' }).ok),
    'every status it skips is one the sales check refuses too (one idea of "not a call to make")');
  ok([...CLIENT_STATUSES].every((s) => NEXT_READY_EXCLUDED_STATUSES.has(s)), 'every client status is skipped');
  ok(!isCallableLead({ id: 'z', amount_paid: '50' }) && isCallableLead({ id: 'z', amount_paid: null, status: 'contacted' }), 'paid means amount_paid > 0');
  const table = read('src/components/OutreachTable.tsx');
  ok(/nextReadyLead<OutreachLead>\(filteredAndSortedLeads, rowCheck, nextOpened\)/.test(table), 'it walks filteredAndSortedLeads — the owner scope, every filter and the sort already applied');
  ok(/data-testid="outreach-next-ready"/.test(read('src/components/OutreachAiCheck.tsx')) && /<OutreachCheckBar/.test(table), 'the button lives in the one-line bar at the top of the list');
}

console.log('── ownership unchanged ──');
{
  const outreach = read('src/pages/Outreach.tsx');
  const table = read('src/components/OutreachTable.tsx');
  ok(/const scopedLeads = useMemo\(\(\) => scopeLeads\(allLeads, ownerScope, role, user\?\.id\)/.test(outreach) && /leads=\{scopedLeads\}/.test(outreach), 'the table still receives only the scoped list (My leads / Unassigned / a rep / All team for Paul; own for a rep)');
  ok(/onOwnerScopeChange=\{role === 'admin' \? setOwnerScopeChoice : undefined\}/.test(outreach), 'only the admin can change whose leads are shown');
  ok(!/salesCheckView\?\.items[\s\S]{0,200}business_name/.test(table), 'batch items are matched to rows by lead id only — an item for a lead not in the list draws nothing');
  ok(/aiCheck=\{isDemoLead\(lead\.id\) \? undefined : aiCheckFor\(lead\)\}/.test(table) && /aiCheckFor\(lead, 'mt-1/.test(table), 'the phone card and the desktop row draw the same summary');
}

console.log('── filters and select all untouched ──');
{
  const table = read('src/components/OutreachTable.tsx');
  ok(/checked=\{selectedIds\.size === filteredAndSortedLeads\.length && filteredAndSortedLeads\.length > 0\}/.test(table) && /onCheckedChange=\{handleSelectAll\}/.test(table), 'Select all still selects the filtered list');
  ok(/const paginatedLeads = filteredAndSortedLeads\.slice\(/.test(table), 'the rows on screen are still a page of the filtered, sorted list');
}

console.log(f ? `\n${f} FAILED` : '\nall passed');
if (f) process.exit(1);
