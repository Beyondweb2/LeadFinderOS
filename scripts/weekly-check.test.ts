/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WEEKLY VISIBILITY CHECK (release 4) — separate from the guarantee, frozen, capped, honest.
   Run: npx tsx scripts/weekly-check.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  chooseWeeklySet, weeklyStart, summariseWeek, compareWeeks, weeklyAffordable, weekOf, weekCoverage, coverageLabel,
  WEEKLY_CHECK_QUESTIONS, WEEKLY_CLIENT_CAP_USD, WEEKLY_TOTAL_CAP_USD, WEEKLY_MOVE_MIN, type WeekSummary,
} from '../src/lib/weeklyCheck.ts';
import { auditKind, isInternalMeasurement, isClientBaseline, seoScanAllowed, freeCheckSendGate, WEEKLY_CHECK_AUDIT_PURPOSE } from '../src/lib/auditKind.ts';
import { clientHealthOf, WEEKLY_STOPPED_REFUNDED } from '../src/lib/clientHealth.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

console.log('── separate from the guarantee ──');
{
  const row = { audit_purpose: WEEKLY_CHECK_AUDIT_PURPOSE, baseline_target_runs: 1 };
  ok(auditKind(row) === 'weekly_check', "'weekly_check' is its own kind");
  ok(!['baseline', 'measurement', 'remeasure'].includes(WEEKLY_CHECK_AUDIT_PURPOSE), 'the pointer triggers (baseline / measurement / remeasure, read live) can never claim it');
  ok(isInternalMeasurement(row), 'it is internal to the operator app');
  const renderer = read('supabase/functions/render-audit-report/index.ts');
  ok(/audit_purpose === WEEKLY_CHECK_AUDIT_PURPOSE\) \{\s*console\.log\(`\[render-audit-report\] REFUSED weekly check/.test(renderer),
    'the public renderer refuses it explicitly (measurement audits are served publicly since 15634d49, so nothing is inherited)');
  ok(!isClientBaseline(row), 'it is never the client baseline');
  ok(!seoScanAllowed(WEEKLY_CHECK_AUDIT_PURPOSE), 'it buys no SEO scan');
  ok(!freeCheckSendGate(WEEKLY_CHECK_AUDIT_PURPOSE).send && !freeCheckSendGate(WEEKLY_CHECK_AUDIT_PURPOSE, { forced: true }).send, 'nothing is ever sent for it, even forced');
  const create = read('supabase/functions/create-ai-audit/index.ts');
  ok(/const isWeeklyCheck: boolean = isInternal && body\.purpose === WEEKLY_CHECK_AUDIT_PURPOSE/.test(create), 'create-ai-audit accepts it from internal callers only');
  ok(/!isRemeasure && !isWeeklyCheck && !freshAudit/.test(create), '…and never bolts it onto an old audit');
  ok(/isWeeklyCheck \? WEEKLY_CHECK_AUDIT_PURPOSE/.test(create), '…and stores it as its purpose');
  const queue = read('supabase/functions/process-ai-audit-queue/index.ts');
  ok(/audit_purpose === WEEKLY_CHECK_AUDIT_PURPOSE\) \{\s*console\.log\(`\[process-ai-audit-queue\] auto-report skipped/.test(queue), 'the queue never publishes a public report for it');
  const fn = read('supabase/functions/weekly-visibility/index.ts');
  ok(!/from\("outreach_leads"\)\.(update|upsert|insert)/.test(fn) && !/from\("ai_audits"\)\.(insert|update|upsert)/.test(fn) && !/remeasure_audit_id|remeasure_due_date/.test(fn),
    'the weekly function never writes a lead or an audit row directly, and never reads or writes the re-measure fields');
  ok(/admin_job_claim/.test(fn) && /apifyPct/.test(fn) && /mode === "all_stop"/.test(fn) && /weeklyAffordable/.test(fn), 'it is single-flight, respects the Apify cap, the emergency stop and the spend caps');
  const mig = read('supabase/migrations/20261001130000_weekly_visibility.sql');
  ok(/unique \(lead_id, week_start\)/.test(mig) && /weekly_check_sets\.questions is frozen/.test(mig), 'one check per client per week, and a frozen set cannot be edited (both in the database)');
}

console.log('\n── the frozen set ──');
{
  const hook = ['locksmith in Canterbury', 'emergency locksmith Canterbury', 'lock change Canterbury'];
  const base = ['Locksmith in Canterbury', 'car locksmith Canterbury', ...Array.from({ length: 12 }, (_, i) => `q${i}`)];
  const s = chooseWeeklySet(hook, base)!;
  ok(s.questions.length === WEEKLY_CHECK_QUESTIONS, `${WEEKLY_CHECK_QUESTIONS} questions`);
  ok(s.questions.slice(0, 3).join('|') === hook.join('|') && s.fromHook === 3, 'the Hook Audit questions come first');
  ok(s.questions[3] === 'car locksmith Canterbury', 'a baseline duplicate of a hook question is not asked twice');
  ok(JSON.stringify(chooseWeeklySet(hook, base)) === JSON.stringify(s), 'deterministic — the same inputs give the same set');
  ok(chooseWeeklySet(['a'], ['b', 'c']) === null, 'too few real questions → no set (never padded)');
}

console.log('\n── when it starts ──');
{
  const none = { checklist: {}, implementedOpportunities: 0, websiteBuild: null };
  ok(!weeklyStart({ route: 'build', ...none }).ok, 'Build: not before the new site is live');
  ok(!weeklyStart({ route: 'build', ...none, websiteBuild: { production_url: 'https://x.co.uk' } }).ok, 'Build: a URL alone is not "live" — it needs the production check');
  ok(weeklyStart({ route: 'build', ...none, websiteBuild: { production_url: 'https://x.co.uk', qa: { production_checked: true } } }).ok, 'Build: live and checked → starts');
  ok(!weeklyStart({ route: 'optimise', ...none }).ok, 'Optimise: a frozen baseline alone never starts it');
  ok(weeklyStart({ route: 'optimise', ...none, checklist: { gbp: true } }).ok, 'Optimise: a delivered improvement (Google profile) starts it');
  ok(weeklyStart({ route: 'optimise', ...none, implementedOpportunities: 1 }).ok, 'Optimise: an implemented opportunity starts it');
  ok(!weeklyStart({ route: 'optimise', ...none, checklist: { baseline_sent: true, remeasure: true } }).ok, 'bookkeeping ticks (baseline sent) are not improvements');
  ok(weeklyStart({ route: null, ...none, checklist: { directories: true } }).ok, 'no route on record (legacy) is treated as Optimise — they keep their own site');
}

console.log('\n── scoring a week, and the trend ──');
{
  const q = ['q1', 'q2', 'q3', 'q4'];
  const row = (question: string, chat: boolean, gem: boolean, comp: string[] = []) => ({ id: question, run_id: 'r', question, status: 'done', result: { chatgpt: { named: chat, competitors: comp }, gemini: { named: gem, competitors: [] } } });
  const w1 = summariseWeek('2026-09-28', q, [row('q1', true, false, ['Rival A']), row('q2', false, false, ['Rival A', 'Rival B']), row('q3', true, true), row('q4', false, false)] as never, { name: 'Biz', location: 'Town' });
  ok(w1.named.chatgpt === 2 && w1.named.gemini === 1, 'named per engine out of the questions answered');
  ok(w1.competitors[0].name === 'Rival A' && w1.competitors[0].count === 2, 'rivals counted');
  const w0: WeekSummary = { ...w1, week: '2026-09-21', named: { chatgpt: 2, gemini: 1 }, perQuestion: w1.perQuestion };
  ok(compareWeeks(w1, null).trend === 'first_week', 'first week: nothing to compare');
  ok(compareWeeks(w1, w0).trend === 'flat', 'no change → flat');
  const up: WeekSummary = { ...w1, named: { chatgpt: 2 + WEEKLY_MOVE_MIN, gemini: 1 }, perQuestion: w1.perQuestion.map((x) => ({ ...x, named: { chatgpt: true, gemini: x.named.gemini } })) };
  const c = compareWeeks(up, w1);
  ok(c.trend === 'improving' && c.nowNamed.includes('q2') && c.nowNamed.includes('q4'), `+${WEEKLY_MOVE_MIN} on an engine → improving, with the questions now named`);
  const small: WeekSummary = { ...w1, named: { chatgpt: 3, gemini: 1 } };
  ok(compareWeeks(small, w1).trend === 'flat', '+1 is within week-to-week noise → flat');
  ok(compareWeeks(w1, up).trend === 'slipping', `−${WEEKLY_MOVE_MIN} → slipping`);
  ok(compareWeeks(w1, w0).stillAbsent.includes('q4'), 'a question neither engine named is "still absent"');
  // A short week (only 2 of the 4 asked) against a full one: no false movement.
  const shortWeek = summariseWeek('2026-09-21', q, [row('q1', true, false), row('q3', true, true)] as never, { name: 'Biz', location: 'Town' });
  const full = summariseWeek('2026-09-28', q, [row('q1', true, false), row('q2', true, false), row('q3', true, true), row('q4', true, false)] as never, { name: 'Biz', location: 'Town' });
  const cmp = compareWeeks(full, shortWeek);
  ok(cmp.delta.chatgpt === 0 && cmp.trend === 'flat', 'more questions asked this week is not "improving": deltas count only questions answered both weeks');
  ok(shortWeek.answered.chatgpt === 2 && full.answered.chatgpt === 4, 'answered counts show how many were actually asked');
  // Partial weeks are labelled with the real counts (RG's first week: 5 of 10).
  const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
  const rg = summariseWeek('2026-09-28', ten, ten.slice(0, 5).map((x, i) => row(x, i === 4, i === 4)) as never, { name: 'Biz', location: 'Town' });
  const cov = weekCoverage(rg);
  ok(cov.partial && cov.asked === 10 && cov.answered.chatgpt === 5 && cov.answered.gemini === 5, 'a 5-of-10 week is PARTIAL, with the real answered counts');
  ok(coverageLabel(cov) === 'Partial — 5 of 10 questions answered', 'labelled "Partial — 5 of 10 questions answered" — never presented as ten');
  ok(rg.named.chatgpt === 1 && rg.perQuestion.slice(5).every((p) => p.named.chatgpt === null && p.named.gemini === null), 'unanswered questions stay unknown (null), never counted as absent');
  const allTen = summariseWeek('2026-10-05', ten, ten.map((x) => row(x, false, false)) as never, { name: 'Biz', location: 'Town' });
  ok(coverageLabel(weekCoverage(allTen)) === null, 'a complete week carries no partial label');
  const failed = summariseWeek('2026-10-05', ten, [] as never, { name: 'Biz', location: 'Town' });
  ok(weekCoverage(failed).none && /^No answers came back \(0 of 10/.test(coverageLabel(weekCoverage(failed)) ?? ''), 'a week with no answers says so — it is not "named 0 of 10"');
  ok(compareWeeks(failed, rg).trend === 'not_comparable' && compareWeeks(failed, rg).delta.chatgpt === null, 'a failed week against a partial one is "not comparable", never "flat"');
  const next = summariseWeek('2026-10-05', ten, ten.map((x, i) => row(x, i === 4 || i === 7, i === 4)) as never, { name: 'Biz', location: 'Town' });
  const vs = compareWeeks(next, rg);
  ok(vs.delta.chatgpt === 0 && vs.trend === 'flat', 'full week vs RG partial: only the 5 shared questions compare (t7 newly named is not counted as a gain)');
  ok(!vs.nowNamed.includes('t7'), '…and t7 is not listed as "now named": it was never answered the week before');
  const panel = read('src/components/admin/clientHealth.tsx');
  ok(!/answered\[e\.key\] \|\| w\.thisWeek!\.questions/.test(panel) && /'no answers'/.test(panel), 'the panel never falls back to the set size when an engine answered nothing');
}

console.log('\n── a refunded client (RG, 2026-09-30) ──');
{
  const fn = read('supabase/functions/weekly-visibility/index.ts');
  ok(/select\("id, business_name,[^"]*\bstatus\b[^"]*"\)/.test(fn) && /filter\(\(l\) => isPaidLead\(l\) && !l\.is_archived && !l\.service_terminated_at/.test(fn),
    'weekly-visibility reads the status and keeps only isPaidLead clients — a refunded client is never scheduled');
  const baselineSrc = read('supabase/functions/_shared/audit-baseline.ts');
  ok(/\.neq\("status", "refunded"\)/.test(baselineSrc), 'the official re-measure never fires for a refunded client either');
  const ten = Array.from({ length: 10 }, (_, i) => `t${i}`);
  const row = (question: string) => ({ id: question, run_id: 'r', question, status: 'done', result: { chatgpt: { named: false }, gemini: { named: false } } });
  const summary = summariseWeek('2026-09-28', ten, ten.slice(0, 5).map(row) as never, { name: 'RG', location: 'Huntingdon' });
  const extras = {
    sets: [{ lead_id: 'RG', questions: ten, frozen_at: '2026-09-30T10:06:18Z', start_reason: 'First improvements live: directories, Google profile' }],
    runs: [{ lead_id: 'RG', week_start: '2026-09-28', status: 'complete', summary, cost_usd: 0.0675, estimate_usd: 0.14, reason: 'only 5 of 10 questions were queued' }],
    opportunities: [], directoryIssues: [],
  };
  const input = { leadId: 'RG', route: null, websiteBuild: null, checklist: { gbp: true, directories: true }, baselineStarted: true, remeasureDue: '2026-10-06', remeasured: false, payment: 'Refunded', refunded: true, todayDay: '2026-10-10' } as const;
  const h = clientHealthOf(input, extras);
  ok(h.weekly.state === 'stopped' && h.weekly.reason === WEEKLY_STOPPED_REFUNDED, 'a refunded client\'s weekly check reads "Stopped — refunded"');
  ok(h.weekly.thisWeek === summary && h.weekly.coverageLabel === 'Partial — 5 of 10 questions answered', 'its past result is kept as history, still labelled Partial');
  ok(!h.blockers.some((b) => /re-measure overdue|baseline not started/.test(b)), 'no delivery blocker is raised for a refunded client (the re-measure is not "overdue")');
  const other = clientHealthOf({ ...input, leadId: 'X', refunded: false, payment: 'Paid' }, { ...extras, sets: extras.sets.map((s) => ({ ...s, lead_id: 'X' })), runs: extras.runs.map((r) => ({ ...r, lead_id: 'X' })) });
  ok(other.weekly.state === 'has_results', 'an active client with the same history is unaffected');
}

console.log('\n── cost caps ──');
{
  ok(weeklyAffordable(10, 0).ok && weeklyAffordable(10, 0).estimateUsd <= WEEKLY_CLIENT_CAP_USD, `10 questions fit the $${WEEKLY_CLIENT_CAP_USD} per-client cap`);
  ok(!weeklyAffordable(10, WEEKLY_TOTAL_CAP_USD - 0.05).ok, 'the weekly total cap stops new checks');
  ok(!weeklyAffordable(10, null).ok, 'an unreadable spend refuses (fail closed)');
  ok(weekOf(Date.parse('2026-10-04T22:30:00Z')) === '2026-09-28' && weekOf(Date.parse('2026-10-04T23:30:00Z')) === '2026-10-05', 'the week turns at London midnight on Monday (BST)');
}

console.log('\n── client health: facts and blockers, no score ──');
{
  const extras = { sets: [], runs: [], opportunities: [{ lead_id: 'A', status: 'new', implemented_at: null }], directoryIssues: [{ lead_id: 'A' }, { lead_id: 'A' }] };
  const h = clientHealthOf({ leadId: 'A', route: 'build', websiteBuild: null, checklist: {}, baselineStarted: false, remeasureDue: '2026-09-01', remeasured: false, payment: 'Payment failed', refunded: false, todayDay: '2026-09-30' }, extras);
  ok(h.siteLive === false && h.weekly.state === 'waiting_to_start' && /new site/.test(h.weekly.reason), 'Build client with no live site: waiting, and says why');
  ok(h.blockers.includes('Official baseline not started') && h.blockers.includes('Monthly payment failed') && h.blockers.some((b) => /re-measure overdue/.test(b)) && h.blockers.includes('New site not live yet'), 'blockers are plain sentences from real statuses');
  ok(h.openImprovements === 1 && h.directoryIssues === 2, 'open items and directory issues counted');
  ok(!('score' in h), 'no health score');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
