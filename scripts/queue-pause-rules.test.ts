/* WHEN THE WHATSAPP QUEUE PAUSES ITSELF (Paul, 2026-11-26: "outreach has stopped" emails for a week; docs/queue-pause-rules-2026-11-26.md).
   Pure rules plus source pins on the queue and the number watcher. Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AUTO_RESUME_AFTER_MIN, DANGER_CODES, LEAD_CODES, MESSAGE_CODES, REFUSAL_RUN_PAUSE, TEMPORARY_CODES,
  autoResumeAt, autoResumeVerdict, failureKind, londonDayStartIso, pauseAlert, pauseNote, qualityDropPause, queuePauseVerdict,
  refusalRun, stuckBellKey, temporaryBackoffMinutes, temporaryInARow, type SendRow,
} from '../src/lib/queuePauseRules.ts';
import { META_ERROR_MEANINGS } from '../src/lib/sendErrorMeaning.ts';
import { COUNTRY_SYSTEMIC_CODES } from '../src/lib/countryAutoPause.ts';

let failures = 0;
const ok = (c: boolean, label: string) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const NOW = new Date('2026-11-26T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const r = (min: number, s: string | null, code: number | null = null): SendRow => ({ created_at: ago(min), delivery_status: s, error_code: code });

console.log('1. every failure is one kind');
{
  ok(failureKind(r(1, 'failed', 131026)) === 'lead' && failureKind(r(1, 'no_whatsapp')) === 'lead', 'not on WhatsApp → the lead');
  ok(failureKind(r(1, 'failed', 131049)) === 'lead' && failureKind(r(1, 'failed', 131050)) === 'lead' && failureKind(r(1, 'failed', 130403)) === 'lead', 'per-person limit, stopped marketing, blocked us → the lead');
  ok(failureKind(r(1, 'failed_temporary', 130429)) === 'temporary' && failureKind(r(1, 'failed_temporary', 131000)) === 'temporary' && failureKind(r(1, 'failed_temporary')) === 'temporary', 'rate limit, Meta "try again", a timeout with no code → temporary');
  ok(failureKind(r(1, 'failed_temporary', 190)) === 'danger' && failureKind(r(1, 'failed_temporary', 131042)) === 'danger' && failureKind(r(1, 'failed', 131048)) === 'danger', 'token, billing, spam limit → danger');
  ok(failureKind(r(1, 'failed_temporary', 132001)) === 'message', 'a template problem → our message, handled per template');
  ok(failureKind(r(1, 'failed')) === 'unexplained', 'a delivery failure with no code → unexplained');
  ok(failureKind(r(1, 'read')) === null && failureKind(r(1, 'sent')) === null && failureKind(r(1, 'simulated')) === null, 'not a failure → null');
  const all = [...Object.keys(DANGER_CODES).map(Number), ...TEMPORARY_CODES, ...LEAD_CODES, ...MESSAGE_CODES];
  ok(new Set(all).size === all.length, 'no code is in two lists');
  ok(all.every((c) => META_ERROR_MEANINGS[c]), "every listed code has Meta's own words (never an invented meaning)");
  ok(COUNTRY_SYSTEMIC_CODES.filter((c) => c < 132000).every((c) => DANGER_CODES[c]), 'every account-level code the country rule treats as systemic is danger here too');
}

console.log('2. only real danger pauses');
{
  const notOnWa = Array.from({ length: 12 }, (_, i) => r(5 + i * 3, 'no_whatsapp'));
  ok(!queuePauseVerdict(notOnWa).pause, '22 Nov: a batch of numbers not on WhatsApp never pauses (12 of 12)');
  const temp = Array.from({ length: 20 }, (_, i) => r(5 + i, 'failed_temporary', 130429));
  ok(!queuePauseVerdict(temp).pause, 'twenty rate-limit replies never pause');
  const lead = Array.from({ length: 20 }, (_, i) => r(5 + i, 'failed', 131049));
  ok(!queuePauseVerdict(lead).pause, 'twenty per-person limits never pause');
  const one = queuePauseVerdict([r(30, 'read'), r(10, 'failed_temporary', 190)], (c) => META_ERROR_MEANINGS[c] ?? null);
  ok(one.pause && one.kind === 'auth' && one.code === 190 && /access token/.test(one.reason ?? ''), 'one expired-token reply pauses, says so in words');
  ok(queuePauseVerdict([r(10, 'failed_temporary', 131042)]).kind === 'billing', 'billing');
  ok(queuePauseVerdict([r(10, 'failed_temporary', 368)]).kind === 'blocked', 'restricted account');
  ok(queuePauseVerdict([r(10, 'failed', 131048)]).kind === 'spam_limit', 'spam limit');
  const refused = Array.from({ length: 20 }, (_, i) => r(5 + i * 15, 'failed'));
  ok(queuePauseVerdict(refused).kind === 'refused', '23 Nov: twenty unexplained failures in a row with nothing delivered → refused');
  ok(refusalRun([...Array.from({ length: 7 }, (_, i) => r(5 + i, 'failed')), r(20, 'read')]) === 7 && REFUSAL_RUN_PAUSE === 8, 'seven in a row is not enough');
  ok(refusalRun([r(3, 'failed'), r(4, 'no_whatsapp'), r(5, 'failed_temporary', 130429), r(6, 'failed')]) === 2, 'lead and temporary failures neither extend nor break a run');
}

console.log('3. temporary errors wait longer each time');
{
  ok([1, 2, 3, 4, 5, 9].map(temporaryBackoffMinutes).join(',') === '5,10,20,40,60,60', '5, 10, 20, 40, then 60 minutes');
  ok(temporaryInARow([r(1, 'failed_temporary', 130429), r(2, 'failed_temporary'), r(3, 'read'), r(4, 'failed_temporary')]) === 2, 'counts only the latest unbroken temporary errors');
}

console.log('4. it starts again by itself only where the cause clears');
{
  ok(AUTO_RESUME_AFTER_MIN.billing === null && AUTO_RESUME_AFTER_MIN.blocked === null, 'billing and restrictions wait for a person');
  ok(autoResumeAt('refused', NOW, false)?.toISOString() === new Date(NOW.getTime() + 120 * 60_000).toISOString(), 'a refusal run rests 2 hours');
  ok(autoResumeAt('refused', NOW, true) === null, 'a second pause the same day waits for a person');
  ok(autoResumeAt('billing', NOW, false) === null, 'billing has no resume time');
  const base = { paused: true, pauseSource: 'auto', kind: 'refused', pausedAt: ago(130), resumeAt: ago(10), healthOkAt: ago(2), numberLimited: false, coldStopAt: null };
  ok(autoResumeVerdict(base, NOW).resume, 'time passed + a clean reading after the pause → resumes');
  ok(!autoResumeVerdict({ ...base, healthOkAt: ago(140) }, NOW).resume, 'no reading since the pause → stays paused');
  ok(!autoResumeVerdict({ ...base, resumeAt: ago(-5) }, NOW).resume, 'before its time → stays paused');
  ok(!autoResumeVerdict({ ...base, numberLimited: true }, NOW).resume && !autoResumeVerdict({ ...base, coldStopAt: ago(1) }, NOW).resume, 'number blocked / cold stop on → stays paused');
  ok(!autoResumeVerdict({ ...base, pauseSource: 'person' }, NOW).resume, 'a person’s pause is never undone by the queue');
  ok(!autoResumeVerdict({ ...base, kind: 'billing' }, NOW).resume && !autoResumeVerdict({ ...base, kind: null }, NOW).resume, 'billing / unknown kind never resumes itself');
  ok(!autoResumeVerdict({ ...base, resumeAt: null }, NOW).resume, 'no resume time → stays paused');
}

console.log('5. a quality FLIP is not a drop');
{
  ok(!qualityDropPause('GREEN', 'RED', ago(60), NOW).pause, 'GREEN for an hour then RED (the 18–26 Nov flips) → no pause');
  ok(qualityDropPause('GREEN', 'RED', ago(25 * 60), NOW).pause, 'GREEN for over a day then RED → pause');
  ok(qualityDropPause('YELLOW', 'RED', null, NOW).kind === 'quality', 'no earlier change on record → it had held → pause');
  ok(!qualityDropPause('RED', 'GREEN', null, NOW).pause && !qualityDropPause(null, 'RED', null, NOW).pause && !qualityDropPause('UNKNOWN', 'RED', null, NOW).pause, 'going up, or from an unknown reading, never pauses');
}

console.log('6. the email: once per problem per day, why + the one thing to do');
{
  const resumeAt = autoResumeAt('refused', NOW, false);
  const a = pauseAlert({ kind: 'refused', reason: 'X failed.' }, resumeAt, NOW);
  const b = pauseAlert({ kind: 'refused', reason: 'Y failed.' }, null, new Date(NOW.getTime() + 3 * 3_600_000));
  ok(a.dedupeKey === b.dedupeKey && a.dedupeKey === 'queue-auto-pause:refused:2026-11-26', 'same problem, same day → one email');
  ok(pauseAlert({ kind: 'billing', reason: 'Z' }, null, NOW).dedupeKey !== a.dedupeKey, 'a different problem gets its own');
  ok(a.lines[0].startsWith('Why: ') && a.lines[1].startsWith('What to do: ') && /start again by itself at 14:00/.test(a.lines[2]), 'why, what to do, and when it starts again (London time)');
  ok(/until someone presses Resume/.test(pauseAlert({ kind: 'billing', reason: 'Z' }, null, NOW).lines[2]), 'billing says it waits for Resume');
  ok(/What to do: /.test(pauseNote('auth', 'R.', null)) && /Press Resume/.test(pauseNote('auth', 'R.', null)), 'the queue screen shows the same why + what to do');
  ok(stuckBellKey('s1', NOW) === stuckBellKey('s1', new Date(NOW.getTime() + 5 * 3_600_000)) && stuckBellKey('s1', NOW) !== stuckBellKey('s2', NOW), 'stuck bell: once per sender per day');
  ok(londonDayStartIso(new Date('2026-07-01T10:00:00Z')) === '2026-06-30T23:00:00.000Z' && londonDayStartIso(NOW) === '2026-11-26T00:00:00.000Z', 'London midnight, summer and winter');
}

console.log('7. wiring');
{
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(!/autoPauseVerdict\(|failureRunVerdict\(/.test(q), 'the old burst rule and breaker are not asked any more');
  ok(/const v = queuePauseVerdict\(rows, \(c\) => META_ERROR_MEANINGS\[c\] \?\? null\)/.test(q) && /select\("created_at, delivery_status, error_code"\)/.test(q), 'the tick reads the codes and asks the one rule');
  ok(q.indexOf('autoResumeVerdict({') < q.indexOf('if (pausedNow) return json({ ok: true, skipped: "paused"'), 'auto-resume is decided before the pause guard');
  ok(/\.eq\("id", 1\)\.eq\("paused", true\)\.eq\("pause_changed_source", "auto"\)/.test(q), 'it only ever undoes the queue’s own pause');
  ok(/auto_pause_kind: null, auto_resume_at: null/.test(q.slice(q.indexOf('if (mode === "pause" || mode === "resume")'))), 'a person’s pause / resume clears the kind and the resume time');
  ok(/temporaryBackoffMinutes\(temporaryInARow\(/.test(q), 'a temporary error pushes the next send back');
  ok(/else if \(sendKind === "danger"\) \{[\s\S]{0,700}status: "queued", queued_at: nowIso, whatsapp_delivery_status: "failed_temporary"/.test(q), 'an account problem never uses up the lead’s attempts');
  ok(/else if \(sendKind === "lead" && failCode !== undefined && failCode !== 131026\) \{[\s\S]{0,500}status: "whatsapp_failed"/.test(q), 'a lead Meta names is marked and skipped');
  const st = q.slice(q.indexOf('async function alertStuckSenders('), q.indexOf('async function personName('));
  ok(/bellOnly\(/.test(st) && !/raiseOperatorAlert\(/.test(st), 'the stuck alert is a bell, never an email');
  const nh = read('supabase/functions/whatsapp-number-health/index.ts');
  ok(/qualityDropPause\(prevRating, reading\.rating,/.test(nh) && /if \(prevRating !== reading\.rating && prev\?\.paused !== true\)/.test(nh), 'the watcher asks the quality-drop rule on a change');
  ok(/dedupeKey: "wa-cold-stop:" \+ londonDayKey\(/.test(nh) && /dedupeKey: "wa-safety-cap:" \+ londonDayKey\(/.test(nh), 'stop + safety emails: once per London day');
  ok(/!stoppedNow && cleanNow && Number\.isFinite\(stopAtMs\) && Date\.now\(\) - stopAtMs >= COLD_STOP_MIN_REST_MIN \* 60_000/.test(nh), 'the cold stop clears itself only on a clean reading, after an hour');
  const mig = read('supabase/migrations/20261230090000_queue_auto_pause_kind.sql');
  ok(/add column if not exists auto_pause_kind text/.test(mig) && /add column if not exists auto_resume_at timestamptz/.test(mig) && !/drop |update |delete /i.test(mig), 'the migration only adds two columns');
  const lim = read('src/lib/whatsappQualityCap.ts');
  ok(/NUMBER_DAILY_COLD_CAP = 200/.test(lim) && /COLD_HOURLY_MAX = 20/.test(lim), '200 a day and 20 an hour are unchanged');
}

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
