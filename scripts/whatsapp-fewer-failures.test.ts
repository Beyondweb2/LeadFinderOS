/* FEWER FAILED WHATSAPP SENDS (2026-11-23, docs/whatsapp-fewer-failures.md). The quality cap, 15 an hour, one strike, the
   number-type hold and the UK-only queue. Pure rules plus source wiring. Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import { COLD_HOURLY_MAX, COLD_MIN_GAP_MIN, NUMBER_DAILY_COLD_CAP, SAFETY_DAILY_COLD_CAP, hourCapRetryAt, metaSafetyReason, numberDailyCap, safetyNetEmail } from '../src/lib/whatsappQualityCap.ts';
import { FAILURE_RUN_PAUSE, currentFailureRun, failureRunWindows, insideFailureRun, strikeSinceAfterRuns } from '../src/lib/whatsappPace.ts';
import { REFUSAL_RUN_PAUSE, queuePauseVerdict } from '../src/lib/queuePauseRules.ts';
import { coldVerdict, numberColdState, type ColdFacts, type ColdSendRow } from '../src/lib/whatsappColdGuard.ts';
import { countrySettingsFrom } from '../src/lib/outreachMarkets.ts';
import { isStrike, statusAfterStrike, struckOut, NOT_ON_WHATSAPP_CODE, STRIKE_DELIVERY_STATES, PROOF_DELIVERY_STATES, STRIKE_MOVES_STATUSES } from '../src/lib/whatsappOneStrike.ts';
import { isNewerUkMobileRange, likelihoodRank, likelihoodSendable, whatsAppLikelihood } from '../src/lib/whatsappLikelihood.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (!c) { f++; console.log('  FAIL ' + m); } else console.log('  PASS ' + m); };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const NOW = new Date('2026-11-24T12:00:00Z'); // 12:00 London
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const UK = '447700900123';
const row = (min: number, o: Partial<ColdSendRow> = {}): ColdSendRow =>
  ({ created_at: ago(min), phone: UK, template: 'initial_contact', user_id: null, delivery_status: 'delivered', ...o });
const settings = countrySettingsFrom([{ country: 'UK', whatsapp_on: true, whatsapp_daily_cap: 300 }] as never);
const GOOD = { meta_messaging_tier: 'TIER_2K', meta_number_status: 'CONNECTED', meta_can_send: 'LIMITED', meta_health_ok_at: NOW.toISOString() };
const facts = (sends: ColdSendRow[], health: ColdFacts['health'], meta: ColdFacts['meta'] = GOOD): ColdFacts => ({ stopReason: null, settings, sends, health, meta });
/** n sends spread one every `gap` minutes, the newest `start` minutes ago. */
const spread = (n: number, gap: number, start = 61) => Array.from({ length: n }, (_, i) => row(start + i * gap));

console.log('the number cap: 200 a day, 60 under the safety net (2026-11-23 pm)');
{
  ok(NUMBER_DAILY_COLD_CAP === 200 && SAFETY_DAILY_COLD_CAP === 60, '200 a day, 60 under the safety net');
  ok(numberDailyCap(GOOD, NOW).cap === 200 && numberDailyCap(GOOD, NOW).safety === null, 'a normal reading: 200');
  for (const h of ['red', 'yellow', 'green'] as const) {
    const v59 = coldVerdict('UK', facts(spread(199, 3, 61), h), NOW);
    ok(v59.go && v59.cap === 200, h + ': the quality colour sets no cap (199 sent, the 200th may go)');
  }
  const at200 = coldVerdict('UK', facts(spread(200, 1, 10), 'red'), NOW);
  ok(!at200.go && at200.code === 'quality_cap' && at200.used === 200, 'at 200 the number is held for the day');
  ok(!at200.go && !!at200.retryAt && at200.retryAt.getTime() > NOW.getTime(), '…until tomorrow’s window');
  ok(numberDailyCap({ ...GOOD, meta_messaging_tier: 'TIER_1K' }, NOW).cap === 60, 'Meta lowered the tier (2K → 1K): 60');
  ok(numberDailyCap({ ...GOOD, meta_number_status: 'FLAGGED' }, NOW).cap === 60 && numberDailyCap({ ...GOOD, meta_can_send: 'BLOCKED' }, NOW).cap === 60, 'flagged or blocked: 60');
  ok(numberDailyCap({ ...GOOD, meta_messaging_tier: 'TIER_10K' }, NOW).cap === 200 && numberDailyCap({ ...GOOD, meta_messaging_tier: 'TIER_UNLIMITED' }, NOW).cap === 200, 'a higher tier is never the safety net (and never above 200)');
  ok(numberDailyCap({ ...GOOD, meta_can_send: 'LIMITED' }, NOW).cap === 200, 'can_send LIMITED alone (the reading since 2 Nov) is not the safety net');
  ok(numberDailyCap(null, NOW).cap === 60 && numberDailyCap({ ...GOOD, meta_health_ok_at: ago(46) }, NOW).cap === 60, 'no reading or a stale one: 60, never unlimited');
  const s60 = coldVerdict('UK', facts(spread(60, 2), 'green', { ...GOOD, meta_messaging_tier: 'TIER_1K' }), NOW);
  ok(!s60.go && s60.cap === 60 && /safety limit/.test(s60.reason), 'under the safety net the 61st waits for tomorrow, and says why');
  ok(metaSafetyReason(GOOD) === null && /lowered the messaging limit/.test(metaSafetyReason({ ...GOOD, meta_messaging_tier: 'TIER_250' }) ?? ''), 'the reason words');
  const mail = safetyNetEmail('Meta lowered the messaging limit to 1,000 new people a day');
  ok(/dropped to 60 a day/.test(mail.subject) && mail.lines.join(' ').includes('normally 200'), 'the email says 60 now, 200 normally');
  const s = numberColdState(facts([...spread(10, 2), row(70, { phone: '60123456789' })], 'red'), NOW);
  ok(s.used === 11 && s.left === 189, 'the number cap counts every country’s cold sends (one number)');
}

console.log('20 an hour, at least 3 minutes apart');
{
  ok(COLD_HOURLY_MAX === 20 && COLD_MIN_GAP_MIN === 3 && 60 / COLD_MIN_GAP_MIN === COLD_HOURLY_MAX, 'the hour cap is 20 and the queue gap floor is 3 minutes (60 / 20)');
  const in19 = Array.from({ length: 19 }, (_, i) => row(2 + i * 3));
  ok(coldVerdict('UK', facts(in19, 'green'), NOW).go, '19 in the last hour: the next may go');
  const in20 = Array.from({ length: 20 }, (_, i) => row(1 + i * 2.9));
  const v = coldVerdict('UK', facts(in20, 'green'), NOW);
  ok(!v.go && v.code === 'hour_cap', '20 in the last hour: held');
  ok(!v.go && v.retryAt?.getTime() === Date.parse(ago(1 + 19 * 2.9)) + 3_600_000, '…until the oldest of them is an hour old');
  ok(hourCapRetryAt([], NOW) === null, 'nothing sent: no hold');
  ok(coldVerdict('UK', facts(Array.from({ length: 20 }, (_, i) => row(61 + i)), 'green'), NOW).go, 'sends older than an hour do not count');
}

console.log('the failure-run breaker (23 Nov: 19 of 19 failed and the auto-pause never tripped)');
{
  const r = (min: number, s: string | null) => ({ created_at: ago(min), delivery_status: s });
  const today = Array.from({ length: 19 }, (_, i) => r(10 + i * 18, 'failed'));
  ok(currentFailureRun(today) === 19 && queuePauseVerdict(today).pause, '19 failed in a row: paused, at any pace');
  ok(/refusing the number/.test(queuePauseVerdict(today).reason ?? ''), '…and it says why');
  ok(FAILURE_RUN_PAUSE === 5 && REFUSAL_RUN_PAUSE === 8, 'five in a row protects leads from a strike; eight in a row pauses (2026-11-26)');
  const fails = (n: number, from = 5) => Array.from({ length: n }, (_, i) => r(from + i * 5, 'failed'));
  ok(!queuePauseVerdict(fails(7)).pause && queuePauseVerdict(fails(8)).pause, 'seven is not, eight is');
  ok(!queuePauseVerdict([...fails(4, 5), r(26, 'read'), ...fails(4, 30)]).pause, 'a delivery breaks the run');
  ok(queuePauseVerdict([...fails(4, 5), r(26, 'sent'), ...fails(4, 30)]).pause, 'a send still waiting for its report neither breaks nor extends it');
  ok(!queuePauseVerdict([...fails(5, 20), r(1, 'no_whatsapp'), r(2, 'no_whatsapp'), r(3, 'no_whatsapp')]).pause, 'not-on-WhatsApp failures never count');
  const mixed = [r(5, 'read'), r(10, 'failed'), r(15, 'delivered'), r(20, 'failed'), r(25, 'read'), r(30, 'read'), r(35, 'failed')];
  ok(!queuePauseVerdict(mixed).pause, 'normal days (a failure here and there) never pause');
  const lookback = new Date(NOW.getTime() - 72 * 3_600_000);
  ok(strikeSinceAfterRuns(mixed, lookback).getTime() === lookback.getTime(), 'no run: the one-strike pass looks back as before');
  const since = strikeSinceAfterRuns([...today, r(2, 'failed')], lookback);
  ok(since.getTime() === Date.parse(ago(2)) + 1, 'after a run, the pass starts after its last failure: those leads are not struck');
  const later = strikeSinceAfterRuns([...today, r(5, 'read'), r(3, 'failed')], lookback);
  ok(later.getTime() === Date.parse(ago(10)) + 1 && later.getTime() < Date.parse(ago(3)), '…and a lone failure after the number recovered is still judged');
}

console.log('the per-lead check leaves out failures inside a run (the 25 leads restored on 23 Nov)');
{
  const r = (min: number, s: string | null) => ({ created_at: ago(min), delivery_status: s });
  /* 22 Nov 13:19 read, 13:24 failed, 13:27 + 13:30 read, then 25 failures in a row (with a "sent" between). */
  const rows = [r(100, 'read'), r(95, 'failed'), r(92, 'read'), r(89, 'read'),
    ...Array.from({ length: 25 }, (_, i) => r(85 - i * 3, 'failed')), r(20, 'sent')];
  const w = failureRunWindows(rows);
  ok(w.length === 1 && w[0][0] === Date.parse(ago(85)) && w[0][1] === Date.parse(ago(85 - 24 * 3)), 'one window: the first to the last failure of the run');
  ok(insideFailureRun(Date.parse(ago(40)), w) && !insideFailureRun(Date.parse(ago(95)), w), 'a failure inside it is left out; the lone 13:24 failure is still a strike');
  ok(failureRunWindows([r(30, 'failed'), r(20, 'failed'), r(10, 'read'), r(5, 'failed')]).length === 0, 'no run of 5: nothing is left out');
  ok(failureRunWindows([...Array.from({ length: 5 }, (_, i) => r(60 - i, 'failed')), r(40, 'read'), ...Array.from({ length: 6 }, (_, i) => r(30 - i, 'failed'))]).length === 2, 'two runs, two windows');
  const g2 = read('supabase/functions/_shared/cold-whatsapp-gate.ts');
  ok(/failureRunWindows\(/.test(g2) && /insideFailureRun\(Date\.parse\(r\.created_at\), windows\)/.test(g2) && /if \(qErr\) return null;/.test(g2), 'whatsappStruckOut uses the windows, and refuses when it cannot read them');
}

console.log('one strike');
{
  ok(NOT_ON_WHATSAPP_CODE === 131026, '131026 is the not-on-WhatsApp code');
  ok(isStrike({ delivery_status: 'failed', error_code: null }), 'a delivery failure with no code (the held webhook keeps none) is a strike');
  ok(isStrike({ delivery_status: 'failed', error_code: 131026 }) && isStrike({ delivery_status: 'no_whatsapp' }), '131026 and no_whatsapp are strikes');
  ok(!isStrike({ delivery_status: 'failed', error_code: 131049 }), 'a per-user marketing limit is about us, not the number: no strike');
  ok(!isStrike({ delivery_status: 'failed', error_code: 132001 }), 'a template error is no strike');
  ok(!isStrike({ delivery_status: 'failed_temporary', error_code: 131000 }), 'a temporary refusal at send time is retried, not struck');
  ok(!isStrike({ delivery_status: 'failed', test_mode: true }), 'a test send is never a strike');
  ok(struckOut([{ delivery_status: 'failed' }]), 'one failure, nothing else: struck out');
  ok(!struckOut([{ delivery_status: 'failed' }, { delivery_status: 'read' }]), 'a number that ever had a message delivered is on WhatsApp');
  ok(!struckOut([{ delivery_status: 'failed' }], true), 'a number that wrote to us is on WhatsApp');
  ok(!struckOut([{ delivery_status: 'sent' }]), 'no failure: not struck');
  for (const s of ['', 'not_contacted', 'queued', 'initial_contact', 'whatsapp_failed', 'no_whatsapp']) ok(statusAfterStrike(s) === 'no_whatsapp', `${s || '(blank)'} → No WhatsApp`);
  for (const s of ['replied', 'interested', 'client', 'not_interested', 'email_sent']) ok(statusAfterStrike(s) === s, `${s} keeps its status`);
}

console.log('the SQL twin says the same');
{
  const m = read('supabase/migrations/20261228090000_whatsapp_one_strike.sql');
  ok(m.includes(`ws.delivery_status in ('failed', 'no_whatsapp')`) && STRIKE_DELIVERY_STATES.join(',') === 'failed,no_whatsapp', 'same strike states');
  ok(m.includes('ws.error_code is null or ws.error_code = 131026'), 'same codes');
  ok(m.includes(`d.delivery_status in ('delivered', 'read', 'played')`) && PROOF_DELIVERY_STATES.join(',') === 'delivered,read,played', 'same proof of delivery');
  ok(m.includes(`in ('', 'not_contacted', 'queued', 'initial_contact', 'whatsapp_failed', 'no_whatsapp')`) && STRIKE_MOVES_STATUSES.join(',') === ',not_contacted,queued,initial_contact,whatsapp_failed,no_whatsapp', 'same statuses move');
  ok(m.includes(`m.direction = 'inbound'`), 'a lead who wrote to us is left alone');
  ok(/revoke execute on function public\.apply_whatsapp_one_strike\(timestamptz, boolean\) from public, anon, authenticated/.test(m)
    && /grant execute on function public\.apply_whatsapp_one_strike\(timestamptz, boolean\) to service_role/.test(m), 'service role only');
  ok(/_dry_run boolean default true/.test(m), 'a dry run unless asked');
  ok(!/\bdelete\b|\bdrop table\b|\btruncate outreach/i.test(m), 'deletes nothing');
}

console.log('how likely a number is on WhatsApp');
{
  ok(isNewerUkMobileRange('447300000000') && isNewerUkMobileRange('447400000000') && isNewerUkMobileRange('447600000000'), '073 / 074 / 076 are the newer ranges');
  ok(!isNewerUkMobileRange('447624000000'), '07624 (Isle of Man mobiles) is not');
  ok(!isNewerUkMobileRange('447700900123') && !isNewerUkMobileRange('447500000000') && !isNewerUkMobileRange(null), '077–079, 075 and nothing are not');
  ok(whatsAppLikelihood('447700900123', 'https://a.co.uk') === 'low_risk', 'older range with a website: low');
  ok(whatsAppLikelihood('447700900123', '') === 'medium_risk' && whatsAppLikelihood('447400000000', 'a.co.uk') === 'medium_risk', 'one of the two: medium');
  ok(whatsAppLikelihood('447400000000', null) === 'high_risk', 'newer range, no website: high');
  ok(likelihoodRank('low_risk') < likelihoodRank('medium_risk') && likelihoodRank('medium_risk') < likelihoodRank('high_risk'), 'low goes first');
  ok(!likelihoodSendable('high_risk', false) && likelihoodSendable('high_risk', true) && likelihoodSendable('medium_risk', false), 'high waits for GREEN; the rest go');
}

console.log('wiring');
{
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  const g = read('supabase/functions/_shared/cold-whatsapp-gate.ts');
  const sw = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(/const QUEUE_MARKETS: readonly Market\[\] = \["UK"\];/.test(q), 'the queue is UK only');
  ok(/if \(!QUEUE_MARKETS\.includes\(rowMarket\(r\) as Market\)\) return false;/.test(q), '…an abroad lead is never picked');
  ok(/numberCold \? numberCold\.left : 0\)/.test(q), 'the pacing spreads no more than the number has left (200 over the day)');
  ok(/Math\.max\(pace\.gapFloorMin, COLD_MIN_GAP_MIN, Math\.round\(baseGap \* jitter\)\)/.test(q), 'the pacing gap is never under 3 minutes');
  ok(/const v = queuePauseVerdict\(/.test(q) && /Math\.max\(lookback, resumedAt\)/.test(q), 'the breaker is wired into the auto-pause and starts fresh after a Resume');
  ok(/strikeSinceAfterRuns\(/.test(q) && /_since: strikeSince\.toISOString\(\)/.test(q), 'the one-strike pass skips failures inside a run');
  ok(/const a = pauseAlert\(/.test(q) && /raiseOperatorAlert\(service, "team_update", \{ \.\.\.a,/.test(q), 'Paul is emailed when the queue pauses itself (once per problem per day)');
  const nh = read('supabase/functions/whatsapp-number-health/index.ts');
  ok(/if \(safetyNow && !safetyBefore\)/.test(nh) && /safetyNetEmail\(safetyNow\)/.test(nh), 'the watcher emails Paul on the turn into the safety net');
  ok(/sentToday: sendsBy\.count\.get\(k\) \?\? 0/.test(q) && /share: e\.queued > 0/.test(q), 'each sender’s line carries sent today and a fair share');
  ok(/QUEUE_MARKETS\.filter\(\(m\) => channelOn/.test(q) && !/\(\["UK", \.\.\.ABROAD_MARKETS\] as Market\[\]\)\.filter\(\(m\) => channelOn\(countrySettings, m, "whatsapp"\)\)\.map/.test(q), 'abroad caps no longer speed the UK up');
  ok(/if \(numberCold\?\.block && !qaDrill\) return json/.test(q), 'the number’s limits hold every lane');
  ok(q.indexOf('service.rpc("apply_whatsapp_one_strike"') > 0 && q.indexOf('service.rpc("apply_whatsapp_one_strike"') < q.indexOf('if (pausedNow) return json({ ok: true, skipped: "paused"'), 'the one-strike pass runs before anything is picked, even when paused');
  ok(/whatsappStruckOut\(service, String\(lead\.id\), toNumber\)/.test(q) && /skipped: "strike_check_failed"/.test(q), 'a per-lead strike check before the send; unreadable sends nothing');
  ok(/likelihoodSendable\(likelihoodOf\(r\), numberGreen\)/.test(q) && /fairQueueOrder\(scanned, lastQueueSendBySender, \(r\) => likelihoodRank\(likelihoodOf\(r\)\)\)/.test(q), 'high-risk held unless GREEN; low risk first, fair order kept inside a band');
  ok(/numberCap: numberCold \?/.test(q), 'the status read carries the number cap for the screen');
  ok(/const struck = await whatsappStruckOut\(service, resolvedLeadId \?\? null, to\);/.test(sw) && /struck !== false/.test(sw), 'a person’s cold template is refused for a struck-out number (and when it cannot be checked)');
  ok(!/fetch\(|graph\.facebook/.test(g), 'the gate never calls Meta: the rating is the cached reading');
  ok(!q.includes('whatsapp-status/'), 'the held webhook is not touched');
}

console.log(f ? `\n${f} FAILED` : '\nall passed');
if (f) process.exit(1);
