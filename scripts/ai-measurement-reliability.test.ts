/* ============================================================
   FIX/04 — MEASUREMENT RELIABILITY: COMPLETENESS, BUDGET POOLS, RECOVERY, RE-MEASURE SAFETY
   (2026-10-04, docs/pre-sales-certification/fixes-04-ai-measurement.md).

   Session C (C-09..C-12) and the master plan (M-010, M-027, M-031..M-033):
     · a guarantee measurement is COMPLETE only at questions × runs × engines (20 × 3 × 2 = 120);
       partial / capped / failed are named, never fabricated, and retried cell by cell;
     · prospecting spend can no longer refuse a client's baseline or re-measure (budget pools, an
       Apify reserve kept for the guarantee) — proven against a fake ledger through the real runner;
     · the day-28 verdict compares matched questions only and holds on an engine drop-out;
     · ended clients are never re-measured; two cron ticks cannot make two replays; the date picker
       cannot clear a re-measure; held results are swept later through the same claim;
     · the results copy claims no cause; the hook report says what the guarantee is judged on.

   Run: npx tsx scripts/ai-measurement-reliability.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { measurementHealth, needsAttention, failureReason, type HealthRow, type HealthRun } from '../src/lib/measurementHealth';
import { APIFY_RESERVE_PCT, POOL_DAILY_CAP_USD, apifyUsedPct, budgetDecision, budgetPoolForPurpose, poolLedgerFilter } from '../src/lib/auditBudget';
import { runEnrichSource } from '../supabase/functions/_shared/enrichment/runner';
import { compareMeasurements, ENGINE_BALANCE_MIN_RATIO } from '../src/lib/measurementCompare';
import { remeasureResultsDecision, resultsEmailParagraphs, resultsDocumentMeaning } from '../src/lib/remeasureResults';
import { isRemeasureDue } from '../src/lib/remeasureDue';
import type { QueueRowLite } from '../src/lib/baselineView';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

/* ── a 20 × 3 × 2 measurement, built row by row ── */
const QS = Array.from({ length: 20 }, (_, i) => `Question ${i + 1} about a locksmith in Canterbury?`);
const RUNS: HealthRun[] = [1, 2, 3].map((n) => ({ id: `run${n}`, run_number: n, status: 'complete' }));
const cell = (named = false) => ({ answer_text: 'some answer', named, citations: [] });
function rowsFor(fn: (run: number, q: number) => Partial<HealthRow> | null = () => null): HealthRow[] {
  const out: HealthRow[] = [];
  let id = 0;
  for (const r of RUNS) for (let q = 0; q < QS.length; q++) {
    const base: HealthRow = { id: ++id, run_id: r.id, question: QS[q], status: 'done', result: { chatgpt: cell(), gemini: cell() } };
    out.push({ ...base, ...(fn(Number(r.run_number), q) ?? {}) });
  }
  return out;
}

console.log('\n── 1. COMPLETENESS: 120 of 120, or named for what it is ──');
const full = measurementHealth({ runs: RUNS, rows: rowsFor(), targetRuns: 3, frozen: false });
ok(full.expectedCells === 120 && full.answeredCells === 120, '20 questions × 3 runs × 2 engines = 120 expected, 120 answered');
ok(full.missing.length === 0 && full.state === 'running', 'all answered, not yet frozen → about to freeze (running)');
ok(measurementHealth({ runs: RUNS, rows: rowsFor(), targetRuns: 3, frozen: true }).state === 'complete', 'frozen with 120/120 → COMPLETE');
const engineGap = measurementHealth({ runs: RUNS, rows: rowsFor((r, q) => (r === 2 && q === 4 ? { result: { chatgpt: cell() } } : null)), targetRuns: 3, frozen: false });
ok(engineGap.state === 'partial' && engineGap.answeredCells === 119 && engineGap.retryableRowIds.length === 0, 'an engine with no answer → PARTIAL 119/120, not retryable (re-asking would double the engine that answered)');
ok(engineGap.label.includes('119 of 120'), 'the label says "119 of 120 answers"');
const capped = measurementHealth({ runs: RUNS, rows: rowsFor((r, q) => (r === 3 && q >= 10 ? { status: 'failed', result: { error: 'daily_cap' } } : null)), targetRuns: 3, frozen: false });
ok(capped.state === 'capped' && capped.answeredCells === 100 && capped.retryableRowIds.length === 10, 'ten questions refused by the budget → CAPPED 100/120, ten rows retryable');
ok(needsAttention(capped.state) && !!capped.action, 'capped needs Paul, with an action sentence');
const apify402 = measurementHealth({ runs: RUNS, rows: rowsFor((r) => (r === 1 ? { status: 'failed', result: { error: 'Apify start failed: HTTP 402 usage limit' } } : null)), targetRuns: 3, frozen: false });
ok(apify402.state === 'capped', "Apify's own cap (HTTP 402) is a cap, not a provider failure");
const provider = measurementHealth({ runs: RUNS, rows: rowsFor((r, q) => (q === 0 ? { status: 'failed', result: { error: 'apify_FAILED' } } : null)), targetRuns: 3, frozen: false });
ok(provider.state === 'failed_retryable' && provider.retryableRowIds.length === 3, 'a provider failure → FAILED (retryable), only the failed rows are offered');
const inflight = measurementHealth({ runs: RUNS, rows: rowsFor((r, q) => (r === 3 && q === 0 ? { status: 'running', result: null } : null)), targetRuns: 3, frozen: false });
ok(inflight.state === 'running', 'a row still in flight → RUNNING (never a failure)');
ok(measurementHealth({ runs: RUNS.slice(0, 1), rows: rowsFor().filter((r) => r.run_id === 'run1'), targetRuns: 3, frozen: false }).state === 'running', 'runs not started yet → RUNNING, their cells "not started", never failed');
ok(measurementHealth({ runs: RUNS, rows: rowsFor(), targetRuns: 3, frozen: false, permanentError: 'no questions to repeat' }).state === 'failed_permanent', 'nothing retryable → PERMANENTLY FAILED');
ok(measurementHealth({ runs: RUNS, rows: rowsFor((r, q) => (r === 1 && q === 0 ? { result: { gemini: cell() } } : null)), targetRuns: 3, frozen: true }).state === 'partial', 'a measurement frozen short of 120 (accepted, or legacy) reads PARTIAL, never complete');
ok(failureReason({ error: 'cost_cap' }) === 'capped' && failureReason({ error: 'apify_reserve' }) === 'capped' && failureReason({ error: 'run_age_exceeded' }) === 'provider_failed', 'failure reasons classify positively');
const cancelled = measurementHealth({ runs: [{ id: 'x', run_number: 1, status: 'cancelled' }, ...RUNS.map((r) => ({ ...r, run_number: Number(r.run_number) + 1 }))], rows: rowsFor(), targetRuns: 3, frozen: false });
ok(cancelled.countedRunIds.join(',') === 'run1,run2,run3', 'a cancelled run is never counted');

console.log('\n── 2. BUDGET POOLS: prospecting cannot starve the guarantee ──');
ok(budgetPoolForPurpose('baseline') === 'guarantee' && budgetPoolForPurpose('remeasure') === 'guarantee', 'baseline and remeasure are the GUARANTEE pool');
ok(budgetPoolForPurpose('discovery') === 'client' && budgetPoolForPurpose('weekly_check') === 'client' && budgetPoolForPurpose('measurement') === 'client', 'discovery / weekly check / full measure are CLIENT work');
ok(budgetPoolForPurpose('audit') === 'prospecting' && budgetPoolForPurpose(null) === 'prospecting' && budgetPoolForPurpose('something_new') === 'prospecting', 'hook audits and any unknown or missing purpose are PROSPECTING (absent → the most restricted pool)');
const exhausted = budgetDecision({ pool: 'prospecting', poolSpentUsd: POOL_DAILY_CAP_USD.prospecting, estCostUsd: 0.0125 });
ok(!exhausted.allowed && exhausted.reason === 'pool_cap' && /checking budget is used/.test(exhausted.message), 'prospecting at its ceiling is refused with the plain sentence');
ok(budgetDecision({ pool: 'guarantee', poolSpentUsd: 0, estCostUsd: 0.0125 }).allowed, 'the guarantee pool is judged on its OWN spend');
const apifyHigh = { usedUsd: 36, capUsd: 40 };   // 90%
ok(apifyUsedPct(apifyHigh) === 90, 'the Apify percentage is recomputed from used / cap');
ok(!budgetDecision({ pool: 'prospecting', poolSpentUsd: 0, estCostUsd: 0.01, apify: apifyHigh }).allowed, `prospecting stops at the Apify reserve (${APIFY_RESERVE_PCT.prospecting}%)`);
ok(budgetDecision({ pool: 'guarantee', poolSpentUsd: 0, estCostUsd: 0.01, apify: { usedUsd: 39.6, capUsd: 40 } }).allowed, 'the guarantee may still run at 99% of the Apify month');
ok(budgetDecision({ pool: 'prospecting', poolSpentUsd: 0, estCostUsd: 0.01, apify: { usedUsd: null, capUsd: null } }).allowed, 'an unknown Apify reading never refuses');
ok(!budgetDecision({ pool: 'prospecting', poolSpentUsd: 0, estCostUsd: 0.5, repAllowance: { spentUsd: 1, capUsd: 1.2 } }).allowed, 'Session 7 primitive: a per-rep allowance refuses on its own');
ok(poolLedgerFilter('prospecting').or === 'budget_pool.is.null,budget_pool.eq.prospecting' && poolLedgerFilter('guarantee').eq === 'guarantee', 'legacy ledger rows (no pool) count as PROSPECTING, never against a client');

/* The real runner, against a fake ledger: a day of prospecting already at its ceiling. */
type UsageRow = { user_id: string; cost_usd: number; budget_pool: string | null; created_at: string };
function fakeService(usage: UsageRow[], opts: { noPoolColumn?: boolean } = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const service = {
    from(table: string) {
      const filters: Array<(r: UsageRow) => boolean> = [];
      let poolFilterUsed = false;
      const b = {
        select: () => b,
        eq: (col: string, v: unknown) => { if (col === 'budget_pool') poolFilterUsed = true; filters.push((r) => (r as unknown as Record<string, unknown>)[col] === v); return b; },
        gte: (col: string, v: string) => { filters.push((r) => (r as unknown as Record<string, string>)[col] >= v); return b; },
        or: () => { poolFilterUsed = true; filters.push((r) => r.budget_pool == null || r.budget_pool === 'prospecting'); return b; },
        order: () => b,
        range: () => b,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async () => ({ error: null }),
        insert: async (row: Record<string, unknown>) => {
          if (opts.noPoolColumn && 'budget_pool' in row) return { error: { message: 'column "budget_pool" of relation "enrichment_usage" does not exist' } };
          inserted.push({ table, ...row }); return { error: null };
        },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
          if (opts.noPoolColumn && poolFilterUsed) return Promise.resolve({ data: null, error: { message: 'column enrichment_usage.budget_pool does not exist' } }).then(res, rej);
          const rows = table === 'enrichment_usage' ? usage.filter((r) => filters.every((f) => f(r))) : [];
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
  return { service, inserted };
}
const now = new Date().toISOString();
const ledger: UsageRow[] = [
  { user_id: 'owner', cost_usd: 6, budget_pool: null, created_at: now },            // before pools existed
  { user_id: 'owner', cost_usd: POOL_DAILY_CAP_USD.prospecting - 6, budget_pool: 'prospecting', created_at: now },
];
const start = (pool: 'guarantee' | 'prospecting', svc: ReturnType<typeof fakeService>) => runEnrichSource({
  service: svc.service, userId: 'owner', type: 'ai_search', cacheKey: `k-${pool}`, estCostUsd: 0.0125,
  capUsd: POOL_DAILY_CAP_USD[pool], budgetPool: pool, noCacheWrite: () => true,
  run: async () => ({ result: { runId: 'r' }, costUsd: 0.0125 }),
});
const f1 = fakeService(ledger);
const g = await start('guarantee', f1);
ok(!g.capReached && g.result?.runId === 'r', 'PROSPECTING EXHAUSTED DOES NOT BLOCK A CLIENT BASELINE / RE-MEASURE: the guarantee start runs');
ok(f1.inserted.some((r) => r.table === 'enrichment_usage' && r.budget_pool === 'guarantee'), 'its spend is booked to the guarantee pool');
const p = await start('prospecting', fakeService(ledger));
ok(p.capReached === true, 'the same moment, a prospecting start is refused');
const f2 = fakeService(ledger, { noPoolColumn: true });
const g2 = await start('guarantee', f2);
ok(!g2.capReached, 'BEFORE the budget SQL runs: the guarantee is still never refused by prospecting spend');
ok(f2.inserted.some((r) => r.table === 'enrichment_usage' && !('budget_pool' in r)), '…and the ledger row is still written (retried without the column), so spend is never lost');
ok((await start('prospecting', fakeService(ledger, { noPoolColumn: true }))).capReached === true, '…while prospecting falls back to the old shared ceiling');
const st = read('supabase/functions/_shared/audit-budget.ts');
ok(/export async function budgetState/.test(st) && /pooledLedger/.test(st), 'the client budget state is observable (budgetState, shown in the hub)');

console.log('\n── 3. THE DAY-28 VERDICT: matched questions, both engines ──');
const side = (namedEvery: number, opts: { geminiFrom?: number; geminiMissingRun?: number; extraQ?: boolean } = {}): QueueRowLite[] => {
  const rows: QueueRowLite[] = [];
  for (let r = 1; r <= 3; r++) for (let q = 0; q < 20; q++) {
    const named = q % namedEvery === 0;
    const result: Record<string, unknown> = { chatgpt: { answer_text: named ? 'Try Acme Locks' : 'Try others', named, citations: [] } };
    if (q >= (opts.geminiFrom ?? 0) && r !== opts.geminiMissingRun) result.gemini = { answer_text: 'Try others', named: false, citations: [] };
    rows.push({ run_id: `r${r}`, question: QS[q], engines: ['chatgpt', 'gemini'], status: 'done', result });
  }
  if (opts.extraQ) rows.push({ run_id: 'r1', question: 'An extra question only asked once?', engines: ['chatgpt'], status: 'done', result: { chatgpt: { answer_text: 'Acme Locks', named: true, citations: [] } } });
  return rows;
};
const opts = { businessName: 'Acme Locks', trade: 'locksmith', town: 'Canterbury' };
const balanced = compareMeasurements(side(4), side(4), opts);
ok(balanced.engineShort.length === 0 && balanced.matchedCount === 20, 'same questions, both engines on both sides → balanced');
const geminiDrop = compareMeasurements(side(4), side(4, { geminiMissingRun: 3 }), opts);
ok(geminiDrop.engineShort.includes('gemini') && !geminiDrop.engineShort.includes('chatgpt'), `Gemini dropping out of one replay run (40 of 60, below ${ENGINE_BALANCE_MIN_RATIO} of before) → Gemini short`);
ok(compareMeasurements(side(4), side(4, { geminiFrom: 8 }), opts).engineShort.includes('gemini'), 'Gemini missing on eight questions → short as well');
const terms = { current: true } as const;
const runsDone = [{ status: 'complete' }, { status: 'complete' }, { status: 'complete' }];
const d1 = remeasureResultsDecision({ replayRuns: runsDone, replayTarget: 3, comparison: geminiDrop, terms, copyApproved: true });
ok(!d1.send && d1.kind === 'engine_imbalance', 'an engine drop-out HOLDS the results — it cannot read as "gone up"');
ok(remeasureResultsDecision({ replayRuns: runsDone, replayTarget: 3, comparison: balanced, terms, copyApproved: true }).send === true, 'a balanced comparison may send (copy approved)');
const noEngineCount = { ...balanced } as Record<string, unknown>; delete noEngineCount.engineShort;
ok(remeasureResultsDecision({ replayRuns: runsDone, replayTarget: 3, comparison: noEngineCount as never, terms, copyApproved: true }).send === false, 'a comparison with no engine count HOLDS (absent means do not, on a sending path)');
ok(remeasureResultsDecision({ replayRuns: runsDone, replayTarget: 3, comparison: balanced, terms }).send === false, 'still held while REMEASURE_RESULTS_COPY_APPROVED is false');
const extra = compareMeasurements(side(4), side(4, { extraQ: true }), opts);
ok(extra.after.answered === balanced.after.answered && extra.after.named === balanced.after.named, 'a question asked only on one side moves NEITHER total (matched questions only)');
ok(extra.onlyAfter.length === 1, '…and is reported as asked only after');

console.log('\n── 4. RE-MEASURE SAFETY ──');
const due = { baseline_audit_id: 'b', remeasure_audit_id: null, remeasure_due_date: '2026-10-13', status: 'payment_received', is_archived: false, amount_paid: 99 };
ok(isRemeasureDue(due, '2026-10-13').due === true, 'a paid client with a due date fires');
const ended = isRemeasureDue({ ...due, service_terminated_at: '2026-10-04T10:00:00Z' }, '2026-10-13');
ok(!ended.due && ended.due === false && (ended as { reason: string }).reason === 'service_ended', 'AN ENDED CLIENT NEVER STARTS A RE-MEASURE (the predicate says so, not only the query)');
ok(isRemeasureDue({ ...due, remeasure_audit_id: 'r' }, '2026-10-13').due === false, 'a replay already claimed → not due (the second cron tick)');
const ab = read('supabase/functions/_shared/audit-baseline.ts');
ok(/\.is\("service_terminated_at", null\)/.test(ab) && /delivery_checklist, service_terminated_at"\)/.test(ab), 'the firing query filters ended clients and reads the column the predicate checks');
ok(/out\.error === "already_remeasured"/.test(ab), 'two cron invocations: the loser of the database claim is a race resolved, not a second replay');
const cai = read('supabase/functions/create-ai-audit/index.ts');
ok(/already_remeasured/.test(cai), 'create-ai-audit turns the one-replay-per-lead index refusal into already_remeasured');
ok(/questions: plan\.questions/.test(ab) && /the baseline's ASKED set, verbatim/.test(ab), 'the replay asks the frozen baseline questions verbatim');
const cockpit = read('src/components/LeadDeliveryCockpit.tsx');
ok(/<Calendar mode="single" required /.test(cockpit), 'the date picker is required (a re-click cannot deselect)');
ok(/if \(!d\) return;/.test(cockpit) && !/remeasure_due_date: iso \} as Partial<OutreachLead>\);\n  \};/.test(cockpit.replace(/if \(stored && !window\.confirm[\s\S]*?return;\n/, '')) === false || /window\.confirm\(`Move this client/.test(cockpit), 'an empty selection is ignored and moving a stored date asks first');
ok(!/Re-measure due \(8 wks\)/.test(cockpit), 'the stale "(8 wks)" label is gone');
const guard = read('supabase/migrations/20261007040200_remeasure_date_guard.sql');
ok(/new\.remeasure_due_date is null/.test(guard) && /new\.baseline_audit_id is not null/.test(guard) && /app\.allow_remeasure_clear/.test(guard), 'the database refuses clearing the date of a lead with a baseline, unless said out loud');
const rr = read('supabase/functions/_shared/remeasure-results.ts');
ok(/if \(!audit\.baseline_completed_at\) return \{ kind: "skipped"/.test(rr), 'a replay that has not FROZEN never sends results (failure cannot consume success)');
ok(/export async function sweepUnsentRemeasureResults/.test(rr) && /quietHold: true/.test(rr), 'held results are swept later through the same claim-first sender, quietly');
ok(/snapRunsOf/.test(rr) && /onlyRuns\(baselineRowsAll, baselineFrozenRuns\)/.test(rr), 'the verdict reads only the frozen runs of each side');
const q = read('supabase/functions/process-ai-audit-queue/index.ts');
ok(/resultsSweepDue\(Date\.now\(\)\)/.test(q) && /sweepUnsentRemeasureResults\(service\)/.test(q), 'the queue runs the held-results sweep');

console.log('\n── 5. FAILURE, RETRY, RECOVERY (the engine) ──');
ok(/const isGuarantee = budgetPoolForPurpose\(storedPurpose\) === "guarantee"/.test(ab), 'the completion rule applies to the guarantee measurements only');
ok(/if \(isGuarantee && inFlight\.length === 0 && !settling\)/.test(ab), 'C-11: a guarantee measurement with nothing in flight is no longer "waiting" for ever');
ok(/guaranteeFreezeGate\(service, auditId, audit, source\)/.test(ab) && /if \(!gate\.freeze\)/.test(ab), 'the freeze waits for 120/120 (or an accepted partial)');
ok(/\.update\(\{ status: "pending", attempts: 0, result: null \}\)\s*\.in\("id", ids\)\.eq\("status", "failed"\)/.test(ab), 'a retry re-queues ONLY rows still failed — the claim (no duplicate successful cell)');
ok(!/retryMissingCells[\s\S]{0,4000}functions\/v1\/create-ai-audit/.test(ab.slice(ab.indexOf('export async function retryMissingCells'), ab.indexOf('export async function partialAcceptedFor'))), 'a retry never creates a run or an audit (no second baseline pointer)');
ok(/if \(loaded\.frozenAt\) return \{ ok: false, requeued: 0, reason: "frozen" \}/.test(ab), 'a frozen measurement is never retried');
ok(/MAX_AUTO_CELL_RETRIES = 1/.test(ab), 'one automatic retry round, then held for Paul');
ok(/order\("baseline_last_attempt_at", \{ ascending: true, nullsFirst: true \}\)/.test(ab), 'the stalled sweep rotates (held measurements cannot starve new ones)');
const pb = read('supabase/functions/paid-baseline/index.ts');
ok(/action === "retry_missing"/.test(pb) && /action === "accept_partial"/.test(pb) && /action === "send_results"/.test(pb), 'Paul can retry, accept a partial (with a reason) and send results from the hub');
ok(/error: "retry_first"/.test(pb), 'accepting as partial is refused while missing cells can still be re-asked');
ok(/maybeSendRemeasureResults\(service, replayId, \{ quietHold: false \}\)/.test(pb), '"Send results" uses the same claim-first sender');
const ds = read('src/lib/deliveryStage.ts');
ok(/'fix_baseline', 'Baseline stopped/.test(ds) && /'fix_remeasure', 'Re-measure stopped/.test(ds), 'a stopped baseline / re-measure is Paul\'s step (Needs attention), not "running"');
ok(/'wait_remeasure_run', 'Re-measure running'/.test(ds), '"Remeasure done — send results" only once the replay has frozen');
const cs = read('supabase/functions/_shared/client-setup.ts');
ok(/select\("id,baseline_completed_at,baseline_error"\)/.test(cs), 'Paid Clients reads the engine\'s own stop record');

console.log('\n── 6. BUDGET WIRING ──');
ok(/capUsd: POOL_DAILY_CAP_USD\[audit\.pool\],\s*budgetPool: audit\.pool/.test(q), 'each question start is capped by its OWN pool');
ok(/reserve\.reason === "apify_reserve"/.test(q), 'the Apify reserve is enforced at start');
ok(!/const DAILY_CAP_USD = 12\.0/.test(q), 'the single shared $12 ceiling is gone from the queue');
ok(/budgetPoolForPurpose\(a\.audit_purpose\) === "guarantee" \? 0/.test(q), 'guarantee rows are offered the start slots first');
ok(/error: "prospecting_budget_used"/.test(cai), 'a person starting a prospecting audit with the pool used is told so up front');
const mig = read('supabase/migrations/20261007040000_audit_budget_pools.sql');
ok(/add column if not exists budget_pool text/.test(mig) && /'guarantee', 'client', 'prospecting'/.test(mig), 'the budget-pool column migration exists (additive, idempotent)');

console.log('\n── 7. SCORING, COMPETITORS, CLIENT WORDS ──');
ok(/aggregateRuns\(service, usable\.slice\(0, target\)\.map\(\(r\) => r\.id\), \{/.test(ab), 'the frozen snapshot reads "named" with the client report\'s ruler (business, trade, town)');
ok(/cellNamed\(result\?\.\[e\], namedCtx\)/.test(q), 'each run\'s stored mention_rate uses the same ruler');
ok(/cellNamed\(er, namedCtx\)/.test(read('supabase/functions/page-generator/index.ts')), 'the page generator\'s "already named" uses the same ruler');
ok(/mergedEngine\(qRows, \{ businessName/.test(read('supabase/functions/_shared/action-plan.ts')), 'the action plan uses the same ruler');
const ec = read('supabase/functions/extract-competitors/index.ts');
ok(/nameMatches\(name, businessName/.test(ec), 'the client can no longer be listed as its own competitor (spelling-tolerant self check)');
ok(/if \(firms\.has\(fk\)\) continue;/.test(ec) && /DUP_KEY_MIN_CHARS = 4/.test(ec), 'obvious duplicate spellings of one firm are merged (never two different firms)');
const rf = read('supabase/functions/_shared/run-finalise.ts');
ok(/markCleaningExhausted/.test(rf) && /an exhausted cleaning/i.test(rf), 'a failed competitor cleanup still releases the run — the answer cells stay valid');
const copyIn = { businessName: 'Acme Locks', town: 'Canterbury', beforeNamed: 2, beforeAnswered: 120, afterNamed: 30, afterAnswered: 120, questions: 20, wentUp: true, withinNoise: false, documentUrl: 'https://findable.live/results/x', weeks: 4 };
const words = [...resultsEmailParagraphs(copyIn), ...resultsDocumentMeaning(copyIn)].join(' ');
ok(!/we built|are what the engines|because of|thanks to/i.test(words), 'the results copy no longer claims Findable CAUSED the rise (C-28)');
ok(!/guarantee(d)? (that )?(AI|ChatGPT|Gemini) will|rank(ing)?s? (you )?(first|top)/i.test(words), 'no guaranteed recommendation / ranking language');
const html = read('src/lib/aiAuditReportHtml.ts');
ok(/Your guarantee is judged on a full \$\{BASELINE_QUESTIONS\}-question measurement we run after you join, not on this quick check\. \$\{esc\(REMEASURE_CLAIM_SENTENCE\)\}/.test(html), 'the hook report says the guarantee is judged on the full measurement, then the byte-locked sentence (C-06)');
ok(/d\.hidePitch \|\| d\.paidSummary \|\| quickIncomplete/.test(html), 'a paying client\'s own report carries no "Request a call" pitch (C-34)');

if (failures) { console.log(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll passed.');
