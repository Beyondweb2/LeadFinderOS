/* ═══════════════════════════════════════════════════════════
   SOLID CALLING (2026-11-16, v1-calling-solid): number normalisation + choice, calling hours, credit, and the app-level
   call manager (floating call bar, token refresh, quality warnings, dropped calls, outcomes).
   Pure rules are run; the hook, the bar and the edge functions are asserted on their text (no Twilio, no browser).
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  ALWAYS_CALLABLE, CALL_HOURS, NON_GEOGRAPHIC_WORDS, PREMIUM_WORDS, TWILIO_BALANCE_ALERT, TWILIO_BALANCE_BLOCK, balanceVerdict,
  browserCallAllowed, browserCallMarket, callDigits, callE164, callHoursVerdict, lowBalanceDedupeKey, pickCallNumber, splitPhones, ukNumberKind,
} from '../src/lib/callRules.ts';
import {
  CALL_FAILURE_WORDS, KEYPAD_KEYS, REDIAL_FAILURES, callQualityWords, disconnectReason, endedOutcomeWords, failureWordsForNumber,
  isKeypadKey, precheckConnection, SLOW_NETWORK_WORDS,
} from '../src/lib/callManager.ts';
import { DEFAULT_COUNTRY_SETTINGS } from '../src/lib/outreachMarkets.ts';
import { callErrorWords } from '../src/lib/callErrorWords.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('1. every number is E.164 before it is dialled');
{
  const cases: Array<[string, string | null, string | null, string]> = [
    ['07427 687854', 'UK', '+447427687854', 'UK mobile 07… → +447…'],
    ['+447427687854', 'UK', '+447427687854', 'already E.164'],
    ['+44 (0)7427 687854', 'UK', '+447427687854', '"+44 (0)" is cleaned'],
    ['+44 07427 687854', 'UK', '+447427687854', 'a trunk 0 after +44 is dropped'],
    ['0044 7427 687854', null, '+447427687854', '0044 international prefix'],
    ['020 7946 0123', 'UK', '+442079460123', 'London landline'],
    ['085 123 4567', 'Ireland', '+353851234567', 'Irish mobile 08… → +3538…'],
    ['087 123 4567', 'IE', '+353871234567', 'Irish mobile, IE label'],
    ['01 234 5678', 'Ireland', '+35312345678', 'Dublin landline'],
    ['+353 (0)86 123 4567', 'Ireland', '+353861234567', '"+353 (0)" is cleaned'],
    ['+353 85 123 4567', 'UK', '+353851234567', 'a +353 number on a UK-labelled lead keeps +353'],
    ['012-345 6789', 'Malaysia', '+60123456789', 'Malaysia unchanged'],
  ];
  for (const [raw, cc, want, label] of cases) ok(callE164(raw, cc) === want, `${label}: ${raw} → ${want} (got ${callE164(raw, cc)})`);
  ok(callDigits('', 'UK') === null && callDigits(null) === null, 'no number → null');
}

console.log('2. which countries browser calling reaches');
{
  ok(browserCallMarket('447427687854') === 'UK' && browserCallMarket('442079460123') === 'UK', 'UK mobile + landline');
  ok(browserCallMarket('353851234567') === 'IE' && browserCallMarket('35312345678') === 'IE', 'Ireland mobile + landline (Paul switched Ireland on in Twilio, 2026-11-16)');
  ok(browserCallMarket('3531800123456') === null && browserCallMarket('353818123456') === null, 'Irish 1800 / 0818 are not callable');
  ok(browserCallMarket('449012345678') === null, 'a UK 09 premium number is never a call market');
  ok(browserCallMarket('12125550123') === null, 'the USA is not callable');
  ok(ALWAYS_CALLABLE.has('UK') && ALWAYS_CALLABLE.has('IE') && !ALWAYS_CALLABLE.has('MY'), 'UK + Ireland always; Malaysia behind its switch');
  ok(browserCallAllowed('IE', null) && !browserCallAllowed('MY', DEFAULT_COUNTRY_SETTINGS) && !browserCallAllowed(null, DEFAULT_COUNTRY_SETTINGS), 'Malaysia off by default; absent market = no');
  ok(browserCallAllowed('MY', { ...DEFAULT_COUNTRY_SETTINGS, MY: { ...DEFAULT_COUNTRY_SETTINGS.MY, call_on: true } }), 'Malaysia with its switch on');
}

console.log('3. UK number kinds: flag non-geographic, never dial 09, prefer a mobile / landline');
{
  ok(ukNumberKind('447700900123') === 'mobile' && ukNumberKind('441234567890') === 'geographic', 'mobile, geographic');
  for (const d of ['448007747951', '448081234567', '443001234567', '443301234567', '448451234567', '448701234567', '447012345678', '447612345678'])
    ok(ukNumberKind(d) === 'non_geographic', `${d} is non-geographic`);
  ok(ukNumberKind('449012345678') === 'premium' && ukNumberKind('449091234567') === 'premium', '09 is premium');
  const free = pickCallNumber('+44 800 774 7951', 'UK');
  ok(free.digits === '448007747951' && free.kind === 'non_geographic' && free.warning === NON_GEOGRAPHIC_WORDS, 'the 0800 lead from 2026-11-16 is callable, flagged first');
  ok(/Freephone \/ non-geographic number/.test(NON_GEOGRAPHIC_WORDS) && /may not connect: try their mobile or landline/.test(NON_GEOGRAPHIC_WORDS), '…with the words Paul asked for');
  ok(browserCallMarket(free.digits) === 'UK', '…and the token + webhook rule lets it through (it was refused as "covers UK… only")');
  const prem = pickCallNumber('0905 123 4567', 'UK');
  ok(prem.digits === null && prem.premiumOnly && prem.warning === PREMIUM_WORDS, 'a 09 alone is never dialled, and says why');
  const two = pickCallNumber('0800 774 7951 / 07700 900123', 'UK');
  ok(two.digits === '447700900123' && two.kind === 'mobile' && two.count === 2 && /2 numbers/.test(two.warning ?? ''), 'freephone + mobile → the mobile rings, and the panel says which');
  const land = pickCallNumber('0905 123 4567, 01234 567890', 'UK');
  ok(land.digits === '441234567890' && !land.premiumOnly, '09 + landline → the landline; the 09 is skipped');
  ok(pickCallNumber('0300 123 4567 or 020 7946 0123', 'UK').digits === '442079460123', 'non-geographic + landline → the landline');
  ok(splitPhones('01234 567890 / 07700 900123').length === 2 && splitPhones('+44 (0)7700 900123').length === 1, 'the phone field splits on / , ; | & or');
  ok(pickCallNumber('07700 900123', 'UK').warning === null, 'one ordinary mobile → no warning');
}

console.log('4. calling hours in the prospect\'s own time');
{
  const at = (iso: string) => new Date(iso);
  ok(callHoursVerdict('UK', at('2026-11-16T10:00:00Z')).open, 'Monday 10:00 London → open');
  ok(!callHoursVerdict('UK', at('2026-11-16T20:30:00Z')).open, 'Monday 20:30 London → closed');
  ok(!callHoursVerdict('UK', at('2026-11-16T07:30:00Z')).open, 'Monday 07:30 London → closed');
  ok(callHoursVerdict('UK', at('2026-11-21T12:00:00Z')).open && !callHoursVerdict('UK', at('2026-11-21T17:30:00Z')).open, 'Saturday 9-5');
  ok(!callHoursVerdict('UK', at('2026-11-22T12:00:00Z')).open, 'never Sunday');
  ok(callHoursVerdict('UK', at('2026-07-13T18:30:00Z')).open && !callHoursVerdict('UK', at('2026-07-13T19:30:00Z')).open, 'British Summer Time is respected (19:30 BST open, 20:30 closed)');
  ok(callHoursVerdict('MY', at('2026-11-16T02:00:00Z')).open && !callHoursVerdict('UK', at('2026-11-16T02:00:00Z')).open, 'Malaysia read in Kuala Lumpur time');
  const shut = callHoursVerdict('IE', at('2026-11-16T21:00:00Z'));
  ok(!shut.open && /21:00/.test(shut.words) && /Ireland/.test(shut.words) && /No call was made/.test(shut.words), 'the refusal says their local time and that nothing was dialled');
  ok(CALL_HOURS.length === 7 && CALL_HOURS[0] === null, 'one week of hours, Sunday shut');
}

console.log('5. Twilio credit');
{
  ok(balanceVerdict(50) === 'ok' && balanceVerdict(TWILIO_BALANCE_ALERT - 0.01) === 'low' && balanceVerdict(TWILIO_BALANCE_BLOCK) === 'empty' && balanceVerdict(-3) === 'empty', 'ok / low / empty');
  ok(balanceVerdict(null) === 'unknown' && balanceVerdict(NaN) === 'unknown' && balanceVerdict(undefined) === 'unknown', 'an unread balance is unknown, never "ok"');
  ok(lowBalanceDedupeKey(new Date('2026-11-16T09:00:00Z')) === 'twilio_balance_low:2026-11-16', 'Paul is told once a day');
  const bal = read('supabase/functions/_shared/twilio-balance.ts');
  ok(/raiseOperatorAlert\(service, "team_update"/.test(bal) && /dedupeKey: lowBalanceDedupeKey\(\)/.test(bal), 'the alert goes through the one bell + email door, deduped');
  ok(/Balance\.json/.test(bal) && !/console\.(log|warn|error)\([^)]*authToken/.test(bal), 'reads the Balance resource; never logs the token');
}

console.log('6. the token function: one rule, blocks, refresh');
{
  const tk = code(read('supabase/functions/twilio-voice-token/index.ts'));
  ok(/pickCallNumber\(lead\.phone/.test(tk) && !/toWhatsAppDigits/.test(tk) && !/UK_CALLABLE/.test(tk), 'the number comes from the one calling rule');
  ok(/error: "premium_number"/.test(tk) && /error: "outside_hours"/.test(tk) && /error: "low_balance"/.test(tk), 'premium, hours and credit each refuse with their own reason');
  ok(/digits\?\.startsWith\("44"\) \? NON_GEOGRAPHIC_WORDS : NOT_CALLABLE_WORDS/.test(tk), 'a UK number that still cannot be called names its TYPE, not a country');
  ok(tk.indexOf('callHoursVerdict(') < tk.indexOf('from("call_logs").insert'), 'hours + credit are checked before any call row is written');
  ok(/OPTED_OUT_CALL_WORDS/.test(tk) && /WRONG_NUMBER_CALL_WORDS/.test(tk) && /checkSuppressed\(/.test(tk), 'Do Not Contact / wrong number blocked with plain words');
  ok(/body\.refresh === true/.test(tk) && /\.in\("status", \["dialing", "ringing", "in-progress"\]\)/.test(tk), 'refresh only for a rep with a live call row');
  const refresh = tk.slice(tk.indexOf('body.refresh === true'), tk.indexOf('const leadId'));
  ok(!/insert\(/.test(refresh) && /json\(\{ ok: true, refreshed: true, token: fresh \}\)/.test(refresh), '…writes no row and dials nothing');
  const wh = code(read('supabase/functions/twilio-webhook/index.ts'));
  ok(/browserCallMarket\(claimed\?\.phone\)/.test(wh) && /browserCallAllowed\(market/.test(wh) && !/\^44\[1237\]/.test(wh), 'the webhook asks the same rule before dialling');
}

console.log('7. the call manager rules');
{
  ok(precheckConnection({ onLine: false }).ok === false && precheckConnection({ onLine: false }).failure === 'offline', 'offline → stop before dialling');
  ok(precheckConnection({ onLine: true, connection: { rtt: 900 } }).warning === SLOW_NETWORK_WORDS && precheckConnection({ onLine: true, connection: { effectiveType: '2g' } }).ok, 'slow → warn, still call');
  ok(precheckConnection(null).ok && precheckConnection({ onLine: true }).warning === null, 'nothing known → no warning');
  ok(/Poor connection/.test(callQualityWords('high-rtt') ?? '') && /Poor connection/.test(callQualityWords('low-mos') ?? '') && /microphone/.test(callQualityWords('constant-audio-input-level') ?? ''), 'Twilio quality warnings → plain words');
  ok(callQualityWords('something-new') === null, 'an unknown warning shows nothing');
  ok(disconnectReason({ reconnecting: true, hungUpByRep: false }) === 'dropped' && disconnectReason({ reconnecting: false, hungUpByRep: false }) === 'ended', 'a disconnect mid-reconnect is a dropped call');
  ok(REDIAL_FAILURES.has('dropped') && REDIAL_FAILURES.has('offline') && !REDIAL_FAILURES.has('opted_out') && !REDIAL_FAILURES.has('outside_hours') && !REDIAL_FAILURES.has('low_balance'), 'Call again only where a redial helps');
  ok(/busy/i.test(endedOutcomeWords({ status: 'busy' }) ?? '') && /No answer/.test(endedOutcomeWords({ status: 'no-answer' }) ?? ''), 'busy / no answer from the call row');
  ok(endedOutcomeWords({ status: 'failed', error_code: '13227' }) === callErrorWords({ code: 13227 }), 'a refused call shows the real Twilio reason (13227 = country not allowed)');
  ok(endedOutcomeWords({ status: 'completed', answered_at: '2026-11-16T10:00:00Z' }) === null, 'an answered call has no outcome line');
  ok(failureWordsForNumber('non_geographic', 'x', 13227) === NON_GEOGRAPHIC_WORDS && failureWordsForNumber('non_geographic', 'x', 31009) === 'x' && failureWordsForNumber('mobile', 'x', 13227) === 'x', 'a refused freephone call names the number type; a network drop keeps its own words');
  ok(KEYPAD_KEYS.length === 12 && isKeypadKey('#') && !isKeypadKey('A') && !isKeypadKey('12'), 'the keypad sends only 0-9 * #');
  for (const k of ['mic_denied', 'no_mic', 'offline', 'dropped', 'opted_out', 'outside_hours', 'low_balance']) ok(!!CALL_FAILURE_WORDS[k], `words for ${k}`);
}

console.log('8. the hook and the floating call bar');
{
  const hook = code(read('src/hooks/useTwilioCall.ts'));
  ok(/tokenWillExpire/.test(hook) && /updateToken\(r\.token\)/.test(hook) && /refresh: true/.test(hook), 'the token is refreshed silently mid-call');
  ok(/codecPreferences: \['opus', 'pcmu'\]/.test(hook) && /edge: twilioEdgesFor\(browserTimeZone\(\)\)/.test(hook), 'Opus first, nearest edge (UK → Dublin)');
  ok(/call\.on\('reconnecting'/.test(hook) && /call\.on\('reconnected'/.test(hook) && /call\.on\('warning'/.test(hook) && /call\.on\('warning-cleared'/.test(hook), 'reconnecting + quality warnings are listened to');
  ok(/precheckConnection\(/.test(hook) && hook.indexOf('precheckConnection(') < hook.indexOf("invokeEdge<TokenOk | TokenNo>('twilio-voice-token'"), 'the pre-check runs before the token is asked for');
  ok(/sendDigits\(d\)/.test(hook) && /isKeypadKey\(d\)/.test(hook), 'keypad tones');
  ok(/reportClientError\(\{ functionName: 'browser-call'/.test(hook) && /logCallProblem\(code, extra\)/.test(hook), 'every failure is logged');
  const logs = hook.match(/logCallProblem\([^;]*?\)/g) ?? [];
  ok(logs.length >= 5 && logs.every((l) => !/phone|digits|tok\.token|r\.token/.test(l)), 'the log carries no number and no token');
  ok(/readOutcome\(thisCallId, run\)/.test(hook) && /from\('call_logs'\)\.select\('status, error_code, answered_at'\)/.test(hook), 'an unanswered call reads why from its own row');
  const live = read('src/components/LiveCall.tsx');
  ok(/data-testid="call-bar"/.test(live) && /call-bar-who/.test(live) && /end-call-timer/.test(live) && /call-bar-mute/.test(live) && /call-bar-keypad/.test(live) && /data-testid="end-call"/.test(live), 'the bar has who, timer, mute, keypad and End call');
  ok(/call-quality-warning/.test(live) && /Reconnecting…/.test(live), '…and shows the poor-connection warning and Reconnecting');
  ok(/call-ended-redial/.test(live) && /REDIAL_FAILURES\.has\(call\.failure\)/.test(live), 'a dropped call offers Call again from any page');
  ok(/<CallBar call=\{call\} panelLead=\{panelLead\} \/>/.test(live), 'the provider above every route draws it');
  const panel = read('src/components/CallPanel.tsx');
  ok(/pickCallNumber\(phone, country\)/.test(panel) && /call-number-warning/.test(panel) && /disabled=\{!view \|\| pick\.premiumOnly \|\| tpsBlocked\}/.test(panel), 'the panel flags the number before dialling and never offers a 09');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
