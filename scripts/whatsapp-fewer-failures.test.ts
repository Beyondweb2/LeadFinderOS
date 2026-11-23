/* FEWER FAILED WHATSAPP SENDS (2026-11-23, docs/whatsapp-fewer-failures.md). The quality cap, 15 an hour, one strike, the
   number-type hold and the UK-only queue. Pure rules plus source wiring. Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import { COLD_HOURLY_MAX, QUALITY_DAILY_CAP, hourCapRetryAt, qualityDailyCap } from '../src/lib/whatsappQualityCap.ts';
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
const settings = countrySettingsFrom([{ country: 'UK', whatsapp_on: true, whatsapp_daily_cap: 150 }] as never);
const facts = (sends: ColdSendRow[], health: ColdFacts['health']): ColdFacts => ({ stopReason: null, settings, sends, health });
/** n sends spread one every `gap` minutes, the newest `start` minutes ago. */
const spread = (n: number, gap: number, start = 61) => Array.from({ length: n }, (_, i) => row(start + i * gap));

console.log('the quality cap');
{
  ok(QUALITY_DAILY_CAP.red === 60 && QUALITY_DAILY_CAP.yellow === 100 && QUALITY_DAILY_CAP.green === 150, 'RED 60, YELLOW 100, GREEN 150');
  ok(qualityDailyCap('red') === 60 && qualityDailyCap('yellow') === 100 && qualityDailyCap('green') === 150, 'each rating maps to its cap');
  ok(qualityDailyCap('unreadable') === 60 && qualityDailyCap(null) === 60 && qualityDailyCap(undefined) === 60, 'a reading we do not have is RED, never unlimited');
  const red59 = coldVerdict('UK', facts(spread(59, 2), 'red'), NOW);
  ok(red59.go && red59.cap === 60, 'RED: 59 sent today, the 60th may go, the cap shown is 60');
  const red60 = coldVerdict('UK', facts(spread(60, 2), 'red'), NOW);
  ok(!red60.go && red60.code === 'quality_cap' && red60.used === 60 && red60.cap === 60, 'RED: at 60 the number is held for the day');
  ok(!red60.go && !!red60.retryAt && red60.retryAt.getTime() > NOW.getTime(), '…until tomorrow’s window');
  ok(coldVerdict('UK', facts(spread(60, 2), 'yellow'), NOW).go, 'YELLOW: 60 is not the limit');
  ok(!coldVerdict('UK', facts(spread(100, 1), 'yellow'), NOW).go, 'YELLOW: 100 is');
  const s = numberColdState(facts([...spread(10, 2), row(70, { phone: '60123456789' })], 'red'), NOW);
  ok(s.used === 11 && s.left === 49, 'the number cap counts every country’s cold sends (one number)');
}

console.log('15 an hour');
{
  ok(COLD_HOURLY_MAX === 15, 'the hour cap is 15');
  const in14 = Array.from({ length: 14 }, (_, i) => row(2 + i * 3));
  ok(coldVerdict('UK', facts(in14, 'green'), NOW).go, '14 in the last hour: the next may go');
  const in15 = Array.from({ length: 15 }, (_, i) => row(2 + i * 3));
  const v = coldVerdict('UK', facts(in15, 'green'), NOW);
  ok(!v.go && v.code === 'hour_cap', '15 in the last hour: held');
  ok(!v.go && v.retryAt?.getTime() === Date.parse(ago(2 + 14 * 3)) + 3_600_000, '…until the oldest of them is an hour old');
  ok(hourCapRetryAt([], NOW) === null, 'nothing sent: no hold');
  ok(coldVerdict('UK', facts(Array.from({ length: 15 }, (_, i) => row(61 + i)), 'green'), NOW).go, 'sends older than an hour do not count');
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
  ok(/numberCold \? numberCold\.left : 0\)/.test(q), 'the pacing spreads no more than the number has left (RED 60 over the day)');
  ok(/QUEUE_MARKETS\.filter\(\(m\) => channelOn/.test(q) && !/\(\["UK", \.\.\.ABROAD_MARKETS\] as Market\[\]\)\.filter\(\(m\) => channelOn\(countrySettings, m, "whatsapp"\)\)\.map/.test(q), 'abroad caps no longer speed the UK up');
  ok(/if \(numberCold\?\.block && !qaDrill\) return json/.test(q), 'the number’s limits hold every lane');
  ok(q.indexOf('service.rpc("apply_whatsapp_one_strike"') > 0 && q.indexOf('service.rpc("apply_whatsapp_one_strike"') < q.indexOf('if (paused) return json({ ok: true, skipped: "paused"'), 'the one-strike pass runs before anything is picked, even when paused');
  ok(/whatsappStruckOut\(service, String\(lead\.id\), toNumber\)/.test(q) && /skipped: "strike_check_failed"/.test(q), 'a per-lead strike check before the send; unreadable sends nothing');
  ok(/likelihoodSendable\(likelihoodOf\(r\), numberGreen\)/.test(q) && /a\.k - b\.k \|\| a\.i - b\.i/.test(q), 'high-risk held unless GREEN; low risk first, fair order kept inside a band');
  ok(/numberCap: numberCold \?/.test(q), 'the status read carries the number cap for the screen');
  ok(/const struck = await whatsappStruckOut\(service, resolvedLeadId \?\? null, to\);/.test(sw) && /struck !== false/.test(sw), 'a person’s cold template is refused for a struck-out number (and when it cannot be checked)');
  ok(!/fetch\(|graph\.facebook/.test(g), 'the gate never calls Meta: the rating is the cached reading');
  ok(!q.includes('whatsapp-status/'), 'the held webhook is not touched');
}

console.log(f ? `\n${f} FAILED` : '\nall passed');
if (f) process.exit(1);
