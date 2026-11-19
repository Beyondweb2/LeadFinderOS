/* Quick check — one automatic retry when the provider didn't finish (Paul, 2026-11-16, v1-quickcheck-retry).
   The case: 16 Nov, 12 sales Quick checks failed with "run_age_exceeded" (Apify's AI search hung 3 × 12 min) and their
   links said "check back shortly" for ever. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LATE_RETRY_AFTER_MS, LATE_RETRY_MAX_AGE_MS, LINK_FAILED_WORDS, LINK_WAITING_WORDS, PROVIDER_FAILURE_ERRORS, alreadyRetried, failedOnProvider,
  isQuickCheck, lateRetryVerdict, reopenPatch, unavailableWords, type RetryAudit, type RetryRow,
} from '../src/lib/quickCheckRetry.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const quick: RetryAudit = { audit_purpose: 'audit', baseline_target_runs: null, is_market: false, is_measurement: false };
const failedAt = '2026-11-16T12:08:00Z';
const t0 = Date.parse(failedAt);
const rows = (err = 'run_age_exceeded', n = 1): RetryRow[] => Array.from({ length: n }, () => ({ status: 'failed', result: { error: err }, updated_at: failedAt }));
const run = (o: Record<string, unknown> = {}) => ({ status: 'failed', results: { error: 'run_age_exceeded', engines: [], ...o } });
const v = (o: Partial<Parameters<typeof lateRetryVerdict>[0]> = {}) => lateRetryVerdict({ audit: quick, runs: [run()], rows: rows(), newerAudit: false, nowMs: t0 + LATE_RETRY_AFTER_MS, ...o });

/* ── What is a Quick check ── */
ok(isQuickCheck(quick, 1, 1) && isQuickCheck(quick, 1, 3), 'one audit, one run, 1–3 asks');
ok(!isQuickCheck({ ...quick, audit_purpose: 'discovery' }, 1, 1) && !isQuickCheck({ ...quick, baseline_target_runs: 3 }, 1, 1)
  && !isQuickCheck({ ...quick, is_market: true }, 1, 1) && !isQuickCheck({ ...quick, is_measurement: true }, 1, 1)
  && !isQuickCheck(quick, 2, 1) && !isQuickCheck(quick, 1, 4) && !isQuickCheck(quick, 1, 0), 'a Discovery, baseline, market, measurement, multi-run or bigger audit is not');

/* ── Only a provider that didn't finish ── */
for (const e of ['run_age_exceeded', 'apify_TIMED-OUT', 'apify_FAILED', 'apify_ABORTED', 'stuck_running_reclaimed']) ok(PROVIDER_FAILURE_ERRORS.has(e) && failedOnProvider(run(), rows(e)), `${e} is a provider failure`);
for (const e of ['cost_cap', 'pool_cap', 'apify_reserve', 'refused:pool_cap', 'no_run_id', '']) ok(!failedOnProvider(run(), rows(e)), `"${e}" is not (a budget limit is never retried here)`);
ok(!failedOnProvider({ status: 'complete' }, rows()) && !failedOnProvider(run(), [...rows(), { status: 'done', result: {} }]), 'only a FAILED run whose every ask failed');

/* ── The verdict ── */
ok(v({ nowMs: t0 + 5 * 60_000 }).kind === 'retry_later', '5 minutes after the failure: the retry is coming (link says check back shortly)');
ok(v().kind === 'retry_now' && LATE_RETRY_AFTER_MS === 30 * 60_000, 'retried 30 minutes after the failure');
ok(v({ runs: [run({ late_retry: { at: 'x', kind: 'auto' } })] }).kind === 'final' && alreadyRetried(run({ late_retry: { kind: 'manual' } })), 'ONCE: a run already retried (automatic or the manual re-run) is final');
ok(JSON.stringify(v({ newerAudit: true })) === JSON.stringify({ kind: 'final', why: 'newer_audit' }), 'the rep pressed Run again (a newer audit) → no automatic retry');
ok(JSON.stringify(v({ nowMs: t0 + LATE_RETRY_MAX_AGE_MS + 1 })) === JSON.stringify({ kind: 'final', why: 'too_old' }), 'never resurrects an old failure');
ok(v({ rows: rows('cost_cap') }).kind === 'final' && v({ audit: { ...quick, audit_purpose: 'discovery' } }).kind === 'final', 'budget refusals and other audits are final');

/* ── Re-opening: one more start per ask, the run stamped ── */
const p = reopenPatch(run(), 'provider_did_not_finish', '2026-11-16T12:40:00Z', 3);
ok(p.run.status === 'running' && !('error' in p.run.results) && (p.run.results.late_retry as { kind: string }).kind === 'auto' && 'engines' in p.run.results, 'the run goes back to running, old error dropped, stamped, the rest kept');
ok(p.row.status === 'pending' && p.row.attempts === 2 && p.row.result === null, 'each ask back to pending with ONE start left (attempts = 3 - 1)');
const hooked = reopenPatch(run({ hook: { sequential: true, version: 2, next_index: 1, executed: 1, planned: ['a', 'b', 'c'], stop_reason: 'provider_failure' } }), 'x', '2026-11-16T12:40:00Z', 3);
const h = hooked.run.results.hook as Record<string, unknown>;
ok(!('stop_reason' in h) && h.next_index === 1 && Array.isArray(h.planned), 'a step-by-step check\'s "provider_failure" stop is cleared, so the retried ask is read (else the report says "didn\'t finish")');
const notNamed = reopenPatch(run({ hook: { stop_reason: 'not_named' } }), 'x', '2026-11-16T12:40:00Z', 3);
ok((notNamed.run.results.hook as Record<string, unknown>).stop_reason === 'not_named', 'any other stop is left alone');
ok(lateRetryVerdict({ audit: quick, runs: [p.run], rows: rows(), newerAudit: false, nowMs: t0 + LATE_RETRY_AFTER_MS }).kind === 'final', 'after re-opening it can never be retried again');

/* ── The public link ── */
ok(unavailableWords({ anyInFlight: true, verdict: null }) === LINK_WAITING_WORDS, 'in flight → check back shortly');
ok(unavailableWords({ anyInFlight: false, verdict: { kind: 'retry_later', atMs: 0 } }) === LINK_WAITING_WORDS, 'retry coming → check back shortly');
ok(unavailableWords({ anyInFlight: false, verdict: { kind: 'final', why: 'retried' } }) === LINK_FAILED_WORDS && LINK_FAILED_WORDS === 'This check couldn’t be completed, ask your contact to run it again.', 'still failed → "This check couldn’t be completed, ask your contact to run it again."');

/* ── Wiring ── */
const render = read('supabase/functions/render-audit-report/index.ts');
ok(!render.includes('return no("This audit hasn’t completed yet — check back shortly.")') && /return no\(unavailableWords\(\{ anyInFlight, verdict \}\)\)/.test(render), 'the report link picks its words from the rule');
const proc = read('supabase/functions/process-ai-audit-queue/index.ts');
ok(proc.includes('lateRetries = await sweepSelfHeal(service, MAX_ATTEMPTS)'), 'the queue tick runs the sweep (since 19 Nov the self-heal: scripts/audits-self-healing.test.ts)');
const sweep = read('supabase/functions/_shared/quick-check-retry.ts');
ok(sweep.includes('.eq("id", run.id).eq("status", run.status).select("id")'), 'the re-open is a claim (still in the settled status it was read in): never twice');
ok(!/sales_check_items|startAudit|ai_audits"\)\.insert|whatsapp|sendOperatorAlert/.test(sweep), 'the sweep never charges the rep, starts a new audit, or contacts anyone');
const alerts = read('supabase/functions/_shared/audit-alerts.ts');
ok(alerts.includes('if (retry && (retry.verdict.kind === "retry_now" || retry.verdict.kind === "retry_later")) return;'), 'no "incomplete" alert while the retry is still coming — only the final failure counts');
const row = read('src/components/OutreachAiCheck.tsx');
ok(/data-testid="row-ai-retry"><RotateCcw className="h-3 w-3" \/>Run again<\/Button>/.test(row), 'the rep sees a "Run again" button on a failed row');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall passed');
