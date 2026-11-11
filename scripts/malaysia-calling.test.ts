/* ═══════════════════════════════════════════════════════════
   MALAYSIA CALLING (2026-11-11, fix/malaysia-calling).
   Stephan saw "Twilio error 31000" calling Malaysia. Our call_logs showed his 2 and 4 Nov calls refused by Twilio with
   13227 (Malaysia not switched on in Voice geo permissions) — the browser only ever saw the SDK's catch-all 31000.
   This suite pins: plain words for every code (never a raw code), the real server code read from under a 31000,
   the nearest Twilio edge from the rep's time zone, the hook wiring, and number formatting for every country we call.
   ═══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { callErrorCode, callErrorWords, micFailureKey, twilioEdgesFor, CALL_SIGNALING_TIMEOUT_MS } from '../src/lib/callErrorWords.ts';
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';
import { callMarketOf } from '../src/lib/outreachMarkets.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('1. plain words, never a raw code');
{
  const codes = [31000, 31005, 31009, 13227, 13224, 21215, 31486, 31480, 31404, 31603, 31201, 31205, 20104, 31208, 31402, 53000, 53405, 31500, 31503, 99999, 0];
  ok(codes.every((c) => !/\d{4,}/.test(callErrorWords({ code: c, message: `Raw twilio text ${c}` }))), 'no sentence contains a 4+ digit code or Twilio\'s own text');
  ok(!/\d{4,}/.test(callErrorWords(null)) && callErrorWords(undefined).length > 20, 'nothing at all → a generic plain sentence');
  ok(/not allowed to call this country/i.test(callErrorWords({ code: 13227 })) && /Paul/.test(callErrorWords({ code: 13227 })), '13227 (geo permission) says the country is not allowed and that Paul fixes it');
  ok(!/press Call again/i.test(callErrorWords({ code: 13227 })), '…and does NOT tell the rep to keep retrying');
  ok(/connection/i.test(callErrorWords({ code: 31000 })) && /VPN/.test(callErrorWords({ code: 31000 })), 'a bare 31000 is the dropped connection, with what to do');
  ok(/busy/i.test(callErrorWords({ code: 31486 })), 'busy');
  ok(/microphone/i.test(callErrorWords({ code: 31208 })), 'microphone');
  ok(/expired/i.test(callErrorWords({ code: 20104 })), 'expired session → press Call again');
  ok(/could not be dialled/i.test(callErrorWords({ code: 31404 })), 'a bad number points at the lead\'s number');
}

console.log('2. the real code under a catch-all 31000 / 31005 wins');
{
  ok(callErrorCode({ code: 31000, originalError: { code: 13227 } }) === 13227, '31000 carrying 13227 → 13227');
  ok(callErrorCode({ code: 31005, originalError: { error: { code: 13227 } } }) === 13227, '31005 carrying a gateway error 13227 → 13227');
  ok(/not allowed to call this country/i.test(callErrorWords({ code: 31000, message: 'UnknownError', originalError: { code: 13227 } })), 'so the geo-permission refusal reads as one, not as a connection drop');
  ok(callErrorCode({ code: 31486, originalError: { code: 31000 } }) === 31486, 'a precise top code is kept');
  ok(callErrorCode({ code: '31000' }) === 31000 && callErrorCode({}) === null, 'string codes read; no code → null');
}

console.log('3. microphone failures are told apart');
{
  ok(micFailureKey({ name: 'NotAllowedError' }) === 'mic_denied' && micFailureKey(null) === 'mic_denied', 'blocked → mic_denied');
  ok(micFailureKey({ name: 'NotFoundError' }) === 'no_mic', 'no microphone → no_mic');
  ok(micFailureKey({ name: 'NotReadableError' }) === 'mic_busy', 'in use by another app → mic_busy');
}

console.log('4. nearest Twilio edge from the rep\'s own clock');
{
  ok(twilioEdgesFor('Asia/Kuala_Lumpur')[0] === 'singapore' && twilioEdgesFor('Asia/Kuching')[0] === 'singapore', 'Malaysia → Singapore');
  ok(twilioEdgesFor('Asia/Singapore')[0] === 'singapore', 'Singapore → Singapore');
  ok(twilioEdgesFor('Australia/Sydney')[0] === 'sydney' && twilioEdgesFor('Australia/Perth')[0] === 'sydney', 'Australia → Sydney');
  ok(twilioEdgesFor('Europe/London')[0] === 'dublin', 'UK → Dublin');
  ok(twilioEdgesFor('America/New_York')[0] === 'ashburn' && twilioEdgesFor('America/Los_Angeles')[0] === 'umatilla', 'USA → Ashburn / Umatilla');
  ok(twilioEdgesFor(null).join() === 'roaming' && twilioEdgesFor('Etc/UTC').join() === 'roaming', 'unknown → roaming (Twilio picks)');
  const valid = new Set(['sydney', 'sao-paulo', 'dublin', 'frankfurt', 'tokyo', 'singapore', 'ashburn', 'umatilla', 'roaming']);
  const zones = ['Asia/Kuala_Lumpur', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'America/Chicago', 'America/Denver', 'America/Sao_Paulo', 'Indian/Mauritius', ''];
  ok(zones.every((z) => { const e = twilioEdgesFor(z); return e.length >= 1 && e.every((x) => valid.has(x)) && e[e.length - 1] === 'roaming' && new Set(e).size === e.length; }), 'every list holds only real Twilio edges, no repeats, roaming last');
  ok(CALL_SIGNALING_TIMEOUT_MS > 0, 'signalling reconnection is on (edge fallback needs it)');
}

console.log('5. the call hook uses all of it and shows no raw Twilio text');
{
  const hook = read('src/hooks/useTwilioCall.ts');
  ok(/edge: twilioEdgesFor\(browserTimeZone\(\)\)/.test(hook) && /maxCallSignalingTimeoutMs: CALL_SIGNALING_TIMEOUT_MS/.test(hook) && /enableImprovedSignalingErrorPrecision: true/.test(hook), 'Device gets the edge list, reconnection and precise errors');
  ok((hook.match(/fail\('network', callErrorWords\(/g) ?? []).length === 3, 'device error, call error and a failed start all show plain words');
  ok(!/Call error: \$\{|Could not start the call: \$\{/.test(hook), 'Twilio\'s own message is never put on screen');
  ok(/fail\(micFailureKey\(me\)\)/.test(hook) && /no_mic:/.test(hook) && /mic_busy:/.test(hook), 'microphone failures each have their own words');
}

console.log('6. numbers for every country we call');
{
  const MY = 'Malaysia', SG = 'Singapore';
  const cases: Array<[string, string | null, string | null, string]> = [
    ['012-345 6789', MY, '60123456789', 'MY mobile 01x local'],
    ['011-1234 5678', MY, '601112345678', 'MY 011 mobile (11 digits)'],
    ['+60 12-345 6789', MY, '60123456789', 'MY +60'],
    ['+60 (0)12-345 6789', MY, '60123456789', 'MY +60 (0)'],
    ['0060123456789', MY, '60123456789', 'MY 0060'],
    ['03-2161 1234', MY, '60321611234', 'MY KL landline'],
    ['12-345 6789', MY, '60123456789', 'MY mobile with its 0 dropped'],
    ['+60 12-345 6789', 'UK', '60123456789', 'MY +60 number on a UK-labelled lead keeps +60'],
    ['9123 4567', SG, '6591234567', 'SG mobile'],
    ['6123 4567', SG, '6561234567', 'SG landline'],
    ['+65 9123 4567', null, '6591234567', 'SG +65, no label'],
    ['07700 900123', 'UK', '447700900123', 'UK mobile'],
    ['020 7946 0123', null, '442079460123', 'UK London, no label'],
    ['0412 345 678', 'Australia', '61412345678', 'AU mobile'],
    ['+1 212 555 0123', 'USA', '12125550123', 'USA +1'],
  ];
  for (const [raw, cc, want, label] of cases) ok(toWhatsAppDigits(raw, cc) === want, `${label}: ${raw} → ${want}`);
  ok(callMarketOf('60123456789') === 'MY' && callMarketOf('601112345678') === 'MY' && callMarketOf('60321611234') === 'MY', 'Malaysian mobiles (incl. 011) and landlines are callable as MY');
  ok(callMarketOf('6591234567') === 'SG' && callMarketOf('447700900123') === 'UK', 'SG and UK callable');
  ok(callMarketOf('61412345678') === null && callMarketOf('12125550123') === null, 'Australia and USA are not browser-callable (refused with a plain reason, never mis-dialled)');
  ok(toWhatsAppDigits('012-345 6789', MY) !== '44123456789', 'a Malaysian local number on a Malaysia lead is never turned into a UK number');
}

console.log('7. the server dials the stored E.164 number with our caller ID');
{
  const wh = read('supabase/functions/twilio-webhook/index.ts');
  ok(/<Number[^`]*>\+\$\{claimed\.phone\}<\/Number>/.test(wh), 'the dialled number is "+" + the stored digits (E.164)');
  ok(/callerId="\$\{xmlEscape\(env\.smsFrom\)\}"/.test(wh), 'caller ID is our own Twilio number');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
