/* AUDITS HEAL THEMSELVES (v1-audits-self-healing, 2026-11-19).
   The case: 19 Nov 16:13, 15 audits at once (each question = 2 Apify runs) filled the plan's 32 concurrent runs; at 4 min
   the hedges asked for more, Apify refused, each refusal was booked as a failed try, Gemini "failed" twice in seconds and
   7 questions finished without it — aborting normal runs that would have answered.
   A. the slot budget: the fewer of our ceiling and Apify's live free runs / memory; a missing reading falls back to ours.
   B. capacity refusals (wait) are told from real failures; Apify's own words are kept.
   C. while the normal run is alive a failed hedge never settles its engine (the 16:17 replay).
   D. the heal verdict: which audits, when (30 min / 2 h / 6 h), never twice, gives up after 3, never a budget refusal.
   E. the re-open plan asks ONLY the missing answers; the kept answers stay untouched; the merge.
   F. provider health: rates by engine, one alert per engine per 6 h, only on a drop with enough asks.
   G. the wiring: every start takes a slot, hedges go last, "plan full" is never a try, a healed run sends nothing,
      provider-caused incompletes no longer alert per audit, the sweep never charges a rep or contacts anyone. */
import { readFileSync } from 'node:fs';
import {
  APIFY_PLAN_MAX_RUNS, HEDGE_SPARE, OTHER_ACTORS_RESERVE, hedgeMayStart, isCapacityRefusal, slotBudget, slotCounter, startErrorText,
} from '../supabase/functions/_shared/enrichment/apify-slots.ts';
import { laneAgeLimitMs, scoredSettled, type Lanes } from '../supabase/functions/_shared/enrichment/ai-search-lanes.ts';
import {
  HEAL_BASE_KEY, HEAL_DELAYS_MS, HEAL_GRACE_MS, HEAL_ROUNDS, giveUpPatch, giveUpReason, healLine, healMerge, healReopenPlan, healStamp,
  healVerdict, isHealRun, rowMissing, type HealAudit, type HealRow, type HealRun,
} from '../src/lib/auditSelfHeal.ts';
import { RATE_ALERT_EVERY_MS, RATE_MIN_ASKS, engineOutcome, engineStats, healthLine, rateDropAlerts, rateDropKey, type HealthRow } from '../src/lib/providerHealth.ts';
import { causeAlertsPerAudit } from '../src/lib/auditAlerts.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* ── A. The slot budget ── */
ok(slotBudget({ ownLiveRuns: 0, ceiling: 24, live: null }) === 24, 'A: no Apify reading → our own ceiling');
ok(slotBudget({ ownLiveRuns: 30, ceiling: 24, live: null }) === 0, 'A: never negative');
ok(slotBudget({ ownLiveRuns: 10, ceiling: 24, live: { activeRuns: 26, maxRuns: 32, memoryUsedGb: 26, memoryMaxGb: 64 } }) === 32 - OTHER_ACTORS_RESERVE - 26,
  'A: Apify\'s live count wins when the account is busier than our own runs (other actors count)');
ok(slotBudget({ ownLiveRuns: 0, ceiling: 24, live: { activeRuns: 0, maxRuns: null, memoryUsedGb: 60, memoryMaxGb: 64 } }) === 0, 'A: memory is a limit too');
ok(slotBudget({ ownLiveRuns: 0, ceiling: 24, live: { activeRuns: 30, maxRuns: null, memoryUsedGb: null, memoryMaxGb: null } }) === 0 && APIFY_PLAN_MAX_RUNS === 32,
  'A: a missing plan figure is the Starter plan\'s 32');
const c = slotCounter(2);
ok(c.take() && c.take() && !c.take() && c.free === 0, 'A: the counter hands out exactly what it has');
c.giveBack(); ok(c.free === 1 && !c.take(2), 'A: give back, and a two-slot ask needs two');
ok(!hedgeMayStart({ free: 10, waitingQuestions: 1 }), 'A: no hedge while a question waits for its first run');
ok(!hedgeMayStart({ free: HEDGE_SPARE, waitingQuestions: 0 }) && hedgeMayStart({ free: HEDGE_SPARE + 1, waitingQuestions: 0 }), 'A: a hedge leaves HEDGE_SPARE free');

/* ── B. Capacity refusals ── */
ok(isCapacityRefusal('Apify start HTTP 429'), 'B: 429 waits');
ok(isCapacityRefusal('Apify start HTTP 402 actor-memory-limit-exceeded: By launching this job you will exceed the memory limit'), 'B: a memory limit waits');
ok(isCapacityRefusal('Apify start HTTP 402 too-many-concurrent-runs'), 'B: a concurrent-run limit waits');
ok(!isCapacityRefusal('Apify start HTTP 402 not-enough-usage-to-run-paid-actor'), 'B: out of credit is NOT a wait (the refusal alert must see it)');
ok(!isCapacityRefusal('Apify start HTTP 400 invalid-input') && !isCapacityRefusal(null), 'B: a bad request is a real failure');
ok(startErrorText(402, { error: { type: 'actor-memory-limit-exceeded', message: 'x' } }) === 'HTTP 402 actor-memory-limit-exceeded: x' && startErrorText(500, null) === 'HTTP 500',
  'B: Apify\'s own type and message are kept');

/* ── C. A failed hedge never settles while the normal run is alive (the 16:17 replay) ── */
const replay: Lanes = { chatgpt: { state: 'done', tries: 1 }, gemini: { state: 'failed', tries: 2, error: 'start_failed' }, ai_overview: { state: 'running', tries: 1 } };
ok(!scoredSettled(replay, true), 'C: Gemini\'s refused hedge does NOT end the question while the normal run can still answer');
ok(scoredSettled(replay, false), 'C: once the normal run is gone, a failed lane settles (the question ends with what came back)');
ok(scoredSettled({ chatgpt: { state: 'done', tries: 1 }, gemini: { state: 'done', tries: 1 } }, true), 'C: both hedges back → settled even with the normal run alive');
ok(!scoredSettled({ chatgpt: { state: 'done', tries: 0 } }, true), 'C: no lane for an engine → not settled');

ok(laneAgeLimitMs('gemini', 12 * 60_000, true) === 5 * 60_000 && laneAgeLimitMs('gemini', 12 * 60_000, false) === 12 * 60_000 && laneAgeLimitMs('ai_overview', 12 * 60_000, true) === 12 * 60_000,
  'C: a hedge is cut at 5 min; a lane that is the only run for its engine (healed ask, failed normal run) gets the full 12');
ok(read('supabase/functions/process-ai-audit-queue/index.ts').includes('laneAgeLimitMs(lane, MAX_RUN_AGE_MS, !!normal)'), 'C: the queue passes whether the normal run is alive');

/* ── D. The heal verdict ── */
const audit: HealAudit = { audit_purpose: 'audit', baseline_target_runs: null, is_market: false, is_measurement: false };
const settled = '2026-11-19T16:23:00Z';
const t0 = Date.parse(settled);
const geminiMissing = (o: Partial<HealRow> = {}): HealRow => ({
  id: 'q1', status: 'done', updated_at: settled,
  result: { chatgpt: { answer_text: 'Try A, B and C.', firms_read: true }, ai_overview: { answer_text: 'x' }, _missing_engines: ['gemini'], _lanes: {}, _cost_usd: 0.01 }, ...o,
});
const failedRow = (err = 'start_failed'): HealRow => ({ id: 'q2', status: 'failed', updated_at: settled, result: { error: err } });
const run = (status = 'complete', results: Record<string, unknown> = {}): HealRun => ({ status, results: { summary: {}, competitor_cleaning: { complete: true }, ...results } });
const v = (o: Partial<Parameters<typeof healVerdict>[0]> = {}) => healVerdict({ audit, runs: [run()], rows: [geminiMissing()], newerAudit: false, nowMs: t0 + HEAL_DELAYS_MS[0], ...o });

ok(JSON.stringify(rowMissing(geminiMissing())) === '["gemini"]' && JSON.stringify(rowMissing(failedRow())) === '["chatgpt","gemini"]' && rowMissing(failedRow('cost_cap')) === 'blocked',
  'D: what an ask is missing (an engine, the whole ask, or blocked by a budget refusal)');
ok(v({ nowMs: t0 + 60_000 }).kind === 'retry_later', 'D: a minute after it settled the re-run is coming');
ok(JSON.stringify(v()) === JSON.stringify({ kind: 'retry_now', round: 1 }) && HEAL_DELAYS_MS[0] === 30 * 60_000, 'D: round 1 at 30 minutes');
const r1 = run('complete', { self_heal: { rounds: [{ at: settled, round: 1, missing: ['gemini'] }] } });
ok(v({ runs: [r1], nowMs: t0 + HEAL_DELAYS_MS[1] - 1 }).kind === 'retry_later' && v({ runs: [r1], nowMs: t0 + HEAL_DELAYS_MS[1] }).kind === 'retry_now', 'D: round 2 at 2 hours after the last settle');
const r3 = run('complete', { self_heal: { rounds: [1, 2, 3].map((n) => ({ at: settled, round: n, missing: ['gemini'] })) } });
ok(JSON.stringify(v({ runs: [r3] })) === JSON.stringify({ kind: 'final', why: 'give_up_now' }) && HEAL_ROUNDS === 3, 'D: after 3 re-runs it gives up');
ok(JSON.stringify(v({ runs: [run('complete', { self_heal: { rounds: [], gave_up: { at: settled, reason: 'x' } } })] })) === JSON.stringify({ kind: 'final', why: 'gave_up' }), 'D: a gave-up stamp is final');
ok(v({ runs: [run('complete', { late_retry: { kind: 'auto' } })], nowMs: t0 + HEAL_DELAYS_MS[1] }).kind === 'retry_now', 'D: the old one-retry counts as round 1 (next is the 2 h round)');
ok(v({ newerAudit: true }).kind === 'final', 'D: the rep pressed Run again → no automatic re-run');
ok(v({ nowMs: t0 + HEAL_DELAYS_MS[0] + HEAL_GRACE_MS + 1 }).kind === 'final', 'D: never resurrects an old audit');
ok(v({ rows: [failedRow('cost_cap')], runs: [run('failed')] }).kind === 'final', 'D: a budget refusal is never healed');
ok(v({ audit: { ...audit, baseline_target_runs: 3 } }).kind === 'final' && v({ audit: { ...audit, audit_purpose: 'discovery' } }).kind === 'final'
  && v({ runs: [run(), run()] }).kind === 'final', 'D: baselines, Discoveries and multi-run audits are not healed');
ok(v({ runs: [run('running')] }).kind === 'final', 'D: an audit still running is left alone');
const full = { id: 'q3', status: 'done', updated_at: settled, result: { chatgpt: { answer_text: 'a', firms_read: true }, gemini: { answer_text: 'b', firms_read: true } } };
const twelve = Array.from({ length: 12 }, (_, i) => ({ ...full, id: `f${i}` }));
ok(v({ rows: [...twelve.slice(0, 11), geminiMissing()] }).kind === 'final', 'D: one missing answer of 24 is not "incomplete" → not re-run');
ok(v({ rows: [failedRow()], runs: [run('failed')] }).kind === 'retry_now', 'D: an audit whose every ask failed is re-run (the old Quick check case)');

/* ── E. Only the missing answers ── */
const plan = healReopenPlan(run(), [geminiMissing(), { ...full, id: 'q9' }], 1, '2026-11-19T16:53:00Z', 3);
const p0 = plan.rows[0];
const lanes = (p0.patch.result as Record<string, Record<string, { state: string; kept?: boolean }>>)._lanes;
ok(plan.rows.length === 1 && p0.from === 'done' && p0.patch.status === 'running', 'E: only the ask with a missing answer is re-opened');
ok(lanes.gemini.state === 'pending' && lanes.chatgpt.state === 'done' && lanes.chatgpt.kept === true && !('ai_overview' in lanes), 'E: Gemini alone is asked again; ChatGPT is kept; Google AI is not re-asked');
const base = (p0.patch.result as Record<string, Record<string, unknown>>)[HEAL_BASE_KEY];
ok((base.chatgpt as { answer_text: string }).answer_text === 'Try A, B and C.' && !('_lanes' in base), 'E: the answer in hand is the base, untouched');
ok(!('competitor_cleaning' in plan.run.results) && plan.run.status === 'running' && healStamp(plan.run).rounds.length === 1, 'E: the run re-opens, stamped, and the firm reading will read the new answers');
const pf = healReopenPlan(run('failed'), [failedRow()], 1, 'x', 3).rows[0];
ok(pf.from === 'failed' && pf.patch.status === 'pending' && pf.patch.attempts === 2 && pf.patch.result === null, 'E: a failed ask goes back to pending with one start left');
const merged = healMerge(base, { gemini: { answer_text: 'Gemini names A and D.' }, chatgpt: { answer_text: 'DIFFERENT' } }, ['gemini'], 1);
ok((merged.gemini as { answer_text: string }).answer_text === 'Gemini names A and D.' && (merged.chatgpt as { answer_text: string }).answer_text === 'Try A, B and C.' && !('_missing_engines' in merged),
  'E: Gemini comes back → filled; ChatGPT is never replaced; nothing missing any more');
const again = healMerge(base, null, ['gemini'], 2);
ok(JSON.stringify(again._missing_engines) === '["gemini"]' && (again.chatgpt as { answer_text: string }).answer_text === 'Try A, B and C.', 'E: nothing back → the ask keeps what it had, Gemini still missing');
ok(isHealRun(plan.run.results) && isHealRun({ late_retry: { kind: 'manual' } }) && !isHealRun({}), 'E: a healed run is known (its finalising sends nothing)');
ok(giveUpReason(['gemini']) === 'Gemini didn\'t answer after 3 automatic re-runs (30 minutes, 2 hours and 6 hours later). Run the audit again later.', 'E: the plain give-up reason');
ok((healStamp({ status: 'complete', results: giveUpPatch(r3, [geminiMissing()], 'now') }).gave_up?.reason ?? '').startsWith('Gemini didn\'t answer'), 'E: the give-up stamp carries it');
ok(healLine({ kind: 'retry_later', atMs: 0, round: 2 }, { rounds: [] }, () => '18:53') === 'Re-running the missing answers automatically at 18:53 (try 2 of 3).', 'E: the lead says when it re-runs');

/* ── F. Provider health ── */
const h = (status: string, cg: string | null, gm: string | null, o: Partial<HealthRow> = {}): HealthRow => ({ status, updated_at: settled, chatgpt: cg, gemini: gm, ...o });
ok(engineOutcome(h('failed', null, null, { error: 'cost_cap' }), 'gemini') === null, 'F: a budget refusal is not the provider\'s fault');
ok(engineOutcome(h('failed', null, null, { error: 'start_failed' }), 'gemini') === 'missed' && engineOutcome(h('done', 'a', ''), 'gemini') === 'missed', 'F: failed or empty = missed');
ok(engineOutcome(h('done', 'a', 'b'), 'ai_overview') === null && engineOutcome(h('done', 'a', 'b', { aio_lane: 'done' }), 'ai_overview') === 'answered', 'F: Google AI counts only where it was asked');
const day = [...Array.from({ length: 9 }, () => h('done', 'a', 'b')), ...Array.from({ length: 7 }, () => h('done', 'a', null))];
const st = engineStats(day);
ok(st[0].rate === 1 && st[1].asked === 16 && st[1].answered === 9, 'F: rates by engine');
ok(healthLine(st) === 'ChatGPT 100% (16 of 16) · Gemini 56% (9 of 16)', 'F: the admin line');
const alerts = rateDropAlerts(st, t0);
ok(alerts.length === 1 && alerts[0].title === 'Gemini answered 56% of AI searches in the last hour' && alerts[0].dedupeKey === rateDropKey('gemini', t0), 'F: one alert, for the engine that dropped');
ok(rateDropKey('gemini', t0) === rateDropKey('gemini', t0 + 60_000) && rateDropKey('gemini', t0) !== rateDropKey('gemini', t0 + RATE_ALERT_EVERY_MS), 'F: at most once per 6 hours per engine');
ok(rateDropAlerts(engineStats(day.slice(9, 9 + RATE_MIN_ASKS - 1)), t0).length === 0, 'F: too few asks never alert');
ok(rateDropAlerts([{ engine: 'ai_overview', asked: 50, answered: 1, rate: 0.02 }], t0).length === 0, 'F: Google AI (display only) never alerts');
ok(!causeAlertsPerAudit('search_timeout') && !causeAlertsPerAudit('search_failed') && causeAlertsPerAudit('openai_refused') && causeAlertsPerAudit('firms_unread'),
  'F: the AI search not answering no longer alerts per audit; refusals and unread answers still do');

/* ── G. Wiring ── */
const q = read('supabase/functions/process-ai-audit-queue/index.ts');
ok(q.includes('const slots = slotCounter(slotBudget({ ownLiveRuns, ceiling: AUDIT_IN_FLIGHT_CEILING, live: apifyLive }))'), 'G: one slot budget per tick, from our runs and Apify\'s live reading');
ok(q.includes('if (!slots.take()) { lanes[lane] = { ...l, error: "waiting_for_slot" }; continue; }') && q.includes('if (headroomLeft < 2 || !slots.take(2))'), 'G: every start takes a slot; none = wait');
ok(q.includes('if (isHedge && !hedgeMayStart('), 'G: hedges go last');
/* 19 Nov 17:08: a local `const slots` inside pollLanes shadowed the scheduler; slots.take() threw (temporal dead zone)
   and no healed Gemini lane ever started. The edge checks cannot see a shadow, so this pins it. */
ok((q.match(/\b(const|let|var) slots\b/g) ?? []).length === 1 && !/\(slots\)|slots:\s/.test(q), 'G: the scheduler `slots` is declared once and never shadowed');
ok(q.includes('- claimed.length - idleRows.size) - laneExtra)') && q.includes('if (rowRuns === 0) idleRows.add(row.id); else idleRows.delete(row.id);'),
  'G: a row waiting with no Apify run does not hold a new question\'s slot');
ok(/if \("wait" in s\) \{[\s\S]{0,400}lanes\[lane\] = \{ \.\.\.l, error: "waiting_for_slot" \};/.test(q) && !/if \("wait" in s\) \{[\s\S]{0,400}tries \+ 1/.test(q), 'G: "plan full" keeps the lane pending, never a try');
ok(q.includes('if (isCapacityRefusal(msg)) {') && q.includes('update({ status: "pending" }).eq("id", row.id).eq("status", "running")'), 'G: a full plan at a question\'s first start re-queues it, attempts untouched');
ok(q.includes('if (scoredSettled(lanes, !!normal)) break;') && q.includes('if (!scoredSettled(lanes, !!normal)) {'), 'G: settling knows the normal run is alive');
ok(q.includes('const healedRun = isHealRun(existingResults);') && (q.match(/!healedRun && /g) ?? []).length === 4, 'G: a healed run arms no free-check result, pitch, stalled flag or baseline step');
ok(q.includes('lateRetries = await sweepSelfHeal(service, MAX_ATTEMPTS)') && q.includes('await checkRateDrop(service)'), 'G: the tick runs the heal sweep and the rate check');
ok(q.includes('const result = healMerge(healBase as Record<string, unknown>, fresh, asked,') && q.includes('update({ status: "done", attempts, result })'), 'G: a healed ask ends done with its kept answers');
const sweep = read('supabase/functions/_shared/quick-check-retry.ts');
ok(sweep.includes('.eq("id", run.id).eq("status", run.status).select("id")') && sweep.includes('.eq("id", p.id).eq("status", p.from)'), 'G: the re-open is a claim (never twice)');
ok(!/sales_check_items|ai_audits"\)\.insert|whatsapp|sendOperatorAlert|create-ai-audit/.test(sweep), 'G: the sweep never charges a rep, starts a new audit, or contacts anyone');
const al = read('supabase/functions/_shared/audit-alerts.ts');
ok(al.includes('if (!causeAlertsPerAudit(cause)) return;'), 'G: the per-audit incomplete alert skips AI-search causes');
const st2 = read('supabase/functions/apify-usage-status/index.ts');
ok(st2.indexOf('const gate = await requireAdmin(req, service);') < st2.indexOf('await healthReport(service)'), 'G: the health view is behind the admin check');
const hook = read('src/components/HookVisibilityView.tsx');
ok(hook.includes("{report.heal ?? 'Run it again later.'}"), 'G: the lead says when it re-runs (or why it gave up) instead of only "Run it again later"');

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
