/* ============================================================
   COUNTRY REFUSALS IN PLAIN WORDS + A NUMBER'S OWN CODE WINS (2026-10-22, fix/country-refusals, docs/country-refusals.md).

   Pins: a full international number typed without "+" is read by its code on a Malaysia / Singapore / Australia lead
   (and nothing without a code is guessed); the plain-words refusal for each kind of number; the lead-card mismatch
   warning; no stale "UK mobiles only" wording left; the SQL migration changes only the country argument; the UK, MY,
   SG and AU reading of every number without a code is unchanged.

   Run: npx tsx scripts/country-refusals.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { bareInternationalMarketOf, toWhatsAppDigits } from '../src/lib/waNumber.ts';
import { mobileMarketOf } from '../src/lib/outreachMarkets.ts';
import { labelMarketOf, phoneCountryMismatch, phoneProblemWords, prefixMarketOf, COUNTRY_OFF_WORDS, NOT_A_MOBILE_WE_MESSAGE_WORDS } from '../src/lib/phoneCountry.ts';
import { coldWhatsAppVerdict } from '../src/lib/coldWhatsAppEligibility.ts';
import { decideContactRoute } from '../src/lib/contactRouting.ts';
import { LAUNCH_SKIP_TEXT } from '../src/lib/campaignRules.ts';
import { QUEUE_SKIP_LABEL } from '../src/lib/salesCrm.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const ALL = new Set(['UK', 'MY', 'SG', 'AU'] as const);

console.log('\n── 1. a number with its own code is read as that country ──');
const CASES: Array<[string, string, string | null]> = [
  // [raw, label, digits]
  ['447700900123', 'Malaysia', '447700900123'], ['447700900123', 'Singapore', '447700900123'], ['447700900123', 'Australia', '447700900123'],
  ['6591234567', 'Malaysia', '6591234567'], ['61412345678', 'Malaysia', '61412345678'], ['60123456789', 'Australia', '60123456789'],
  ['60123456789', 'Singapore', '60123456789'], ['61412345678', 'Singapore', '61412345678'], ['6591234567', 'Australia', '6591234567'],
  ['+44 7700 900123', 'Malaysia', '447700900123'], ['+60 12-345 6789', 'UK', '60123456789'], ['+61 412 345 678', 'UK', '61412345678'],
  ['+65 9123 4567', 'USA', '6591234567'], ['+44 7700 900123', 'USA', '447700900123'], ['60123456789', '', '60123456789'],
];
for (const [raw, label, want] of CASES) {
  const got = toWhatsAppDigits(raw, label || null);
  ok(got === want, `"${raw}" on a ${label || 'blank'} lead → ${want} (got ${got})`);
}
console.log('\n── 2. nothing without a code is guessed; same-country readings unchanged ──');
const SAME: Array<[string, string, string | null]> = [
  ['012-345 6789', 'Malaysia', '60123456789'], ['12 345 6789', 'Malaysia', '60123456789'], ['9123 4567', 'Singapore', '6591234567'],
  ['6123 4567', 'Singapore', '6561234567'], ['0412 345 678', 'Australia', '61412345678'], ['412 345 678', 'Australia', '61412345678'],
  ['61412345678', 'Australia', '61412345678'], ['07700 900123', 'UK', '447700900123'], ['0412 345 678', 'UK', null],
  ['07700 900123', 'Malaysia', null], ['07700 900123', 'Australia', null], ['07700 900123', 'USA', '07700900123'],
  ['1300 123 456', 'Australia', null], ['1800 88 1234', 'Malaysia', null], ['9876543210', 'India', '919876543210'],
];
for (const [raw, label, want] of SAME) {
  const got = toWhatsAppDigits(raw, label);
  ok(got === want, `"${raw}" on a ${label} lead → ${want} (got ${got})`);
}
ok(bareInternationalMarketOf('447700900123') === 'UK' && bareInternationalMarketOf('6591234567') === 'SG' && bareInternationalMarketOf('61412345678') === 'AU'
  && bareInternationalMarketOf('60123456789') === 'MY' && bareInternationalMarketOf('91234567') === null && bareInternationalMarketOf('412345678') === null,
  'bareInternationalMarketOf: only the full international shapes');
ok(prefixMarketOf('0060 12 345 6789') === 'MY' && prefixMarketOf('+1 415 555 0100') === null && prefixMarketOf('07700 900123') === null, 'prefixMarketOf: "00" counts as "+"; a foreign or national number names none');

console.log('\n── 3. a mislabelled mobile is now eligible (the cold verdict reads the same digits) ──');
ok(coldWhatsAppVerdict('447700900123', 'Malaysia', ALL).eligible === true, 'a bare 44 UK mobile on a Malaysia lead is eligible');
ok(coldWhatsAppVerdict('6591234567', 'Australia', ALL).eligible === true, 'a bare 65 Singapore mobile on an Australia lead is eligible');
ok(coldWhatsAppVerdict('07700 900123', 'Malaysia', ALL).eligible === false, 'a UK national mobile on a Malaysia lead is still NOT guessed');

console.log('\n── 4. the plain words ──');
const W = (raw: string, c: string | null) => phoneProblemWords(raw, c) ?? '(null)';
const words: Array<[string, string | null, RegExp]> = [
  ['', 'UK', /^No phone number\.$/],
  ['03-1234 5678', 'Malaysia', /Malaysian landline/],
  ['+60 3-1234 5678', 'UK', /Malaysian landline[\s\S]*country says UK but the number looks like a Malaysian number \(\+60\)/],
  ['020 7946 0000', 'UK', /UK landline/],
  ['6123 4567', 'Singapore', /Singapore landline/],
  ['3123 4567', 'Singapore', /VoIP/],
  ['02 9876 5432', 'Australia', /Australian landline/],
  ['1300 123 456', 'Australia', /1300/],
  ['0412 345 678', 'UK', /No UK number starts 04[\s\S]*Australia/],
  ['+1 415 555 0100', 'UK', /\+1 number — another country/],
  ['07700 900123', 'USA', /country says USA and the number has no country code/],
  ['91234567', '', /Country not set, and the number has no country code/],
  ['07700 900123', 'Malaysia', /can't be read as a Malaysian mobile[\s\S]*looks like a UK mobile \(07…\)/],
  ['012-345 6789', 'UK', /UK landline[\s\S]*If this is a Malaysian mobile \(01x…\), set the country to Malaysia or add \+60/],
  ['9123 4567', 'UK', /can't be read as a UK mobile[\s\S]*If this is a Singapore mobile/],
];
// A hint never changes what is read: those three stay unreadable / a landline exactly as before.
ok(toWhatsAppDigits('012-345 6789', 'UK') === '44123456789' && toWhatsAppDigits('9123 4567', 'UK') === '91234567' && toWhatsAppDigits('07700 900123', 'Malaysia') === null,
  'the hints are words only: the numbers are read exactly as before');
for (const [raw, c, re] of words) ok(re.test(W(raw, c)), `"${raw}" (${c || 'blank'}) → ${W(raw, c)}`);
ok(phoneProblemWords('+60 12-345 6789', 'UK') === null && phoneProblemWords('0412 345 678', 'Australia') === null && phoneProblemWords('07700 900123', 'UK') === null,
  'a mobile of one of our markets has no problem words (the switch decides)');
for (const [raw, c] of words) ok(!/UK mobiles only|UK only/i.test(W(raw, c)), `no "UK only" in the words for "${raw}"`);

console.log('\n── 5. the lead-card mismatch ──');
const mm = phoneCountryMismatch('+60 12-345 6789', 'UK');
ok(mm?.prefix === 'MY' && /country says UK but the number looks like a Malaysian number \(\+60\)\. It is read by its code/.test(mm.words), `UK label, +60 number → ${mm?.words}`);
ok(/country says USA but the number looks like a UK number \(\+44\)/.test(phoneCountryMismatch('+44 7700 900123', 'USA')?.words ?? ''), 'a "USA" lead with a +44 number is warned (349 live)');
ok(/^Country not set/.test(phoneCountryMismatch('+61 412 345 678', '')?.words ?? ''), 'a blank country with a +61 number is warned');
ok(phoneCountryMismatch('+60 12-345 6789', 'Malaysia') === null && phoneCountryMismatch('012-345 6789', 'UK') === null && phoneCountryMismatch('', 'UK') === null,
  'no warning when they agree, or when the number has no code (never a guess)');
ok(labelMarketOf('United Kingdom').kind === 'market' && labelMarketOf('USA').kind === 'other' && labelMarketOf(null).kind === 'blank', 'labelMarketOf');
const dlg = read('src/components/LeadDetailDialog.tsx');
ok(/phoneCountryMismatch\(lead\.phone, lead\.country\)/.test(dlg) && /workspace-phone-country-mismatch/.test(dlg), 'the lead card header draws the warning');

console.log('\n── 6. routing reasons and list wording ──');
const r1 = decideContactRoute({ phone: '03-1234 5678', country: 'Malaysia', email: null }, 'message');
ok(/Malaysian landline/.test(r1.options.find((o) => o.channel === 'whatsapp')!.reason), 'WhatsApp reason names the Malaysian landline');
const au = decideContactRoute({ phone: '0412 345 678', country: 'Australia', email: null, markets: { whatsapp: ALL, sms: ALL, call: ALL } }, 'link');
ok(/never go to Australia/.test(au.options.find((o) => o.channel === 'sms')!.reason), 'SMS reason for an Australian mobile: texts never go to Australia');
ok(/never go to Australia/.test(au.options.find((o) => o.channel === 'call')!.reason), 'call reason for an Australian mobile: browser calls never go to Australia');
ok(LAUNCH_SKIP_TEXT.not_a_uk_mobile === NOT_A_MOBILE_WE_MESSAGE_WORDS && QUEUE_SKIP_LABEL.not_a_uk_mobile === NOT_A_MOBILE_WE_MESSAGE_WORDS
  && LAUNCH_SKIP_TEXT.country_off === COUNTRY_OFF_WORDS && QUEUE_SKIP_LABEL.country_off === COUNTRY_OFF_WORDS, 'one wording for the two skip tokens in both lists');
ok(/Australia/.test(NOT_A_MOBILE_WE_MESSAGE_WORDS) && /Australia/.test(COUNTRY_OFF_WORDS), 'the list words name Australia');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/.*$/gm, '');
for (const f of ['src/lib/contactRouting.ts', 'src/components/WhatsAppQueuePanel.tsx', 'src/lib/campaignRules.ts', 'src/lib/salesCrm.ts', 'src/lib/coldWhatsAppEligibility.ts',
                 'supabase/functions/process-whatsapp-queue/index.ts', 'supabase/functions/send-whatsapp-message/index.ts']) {
  ok(!/UK mobiles only|outreach is UK only|UK mobiles, and to Malaysia/.test(strip(read(f))), `no stale "UK only" wording in ${f}`);
}
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
const s = read('supabase/functions/send-whatsapp-message/index.ts');
ok(/phoneProblemWords\(lead\.phone as string \| null, lead\.country as string \| null\)/.test(q), 'the drip names what is wrong');
ok(/phoneProblemWords\(rawPhone, country\)/.test(s) && /const BUILD_ID = "2026-10-22b-country-refusals"/.test(s), 'send-whatsapp-message names what is wrong; BUILD_ID bumped');

console.log('\n── 7. SQL: an explicit UK code is UK whatever the label (only the country argument changed) ──');
const mig = read('supabase/migrations/20261123090000_phone_prefix_country.sql');
ok(/create or replace function public\.phone_market_country\(_country text, _phone text\)/.test(mig), 'phone_market_country is defined');
for (const fn of ['campaign_candidates', 'queue_sms_openers', 'sales_queue_opener']) ok(new RegExp(`FUNCTION public\\.${fn}\\(`).test(mig), `${fn} is re-created`);
ok(!/mobile_market\((o|v_lead)\.country,/.test(mig), 'no caller passes the raw country any more');
const migCode = mig.replace(/^\s*--.*$/gm, '');
ok((migCode.match(/mobile_market\(public\.phone_market_country\(/g) ?? []).length === 5, 'all five calls go through phone_market_country');
ok(!/function public\.(whatsapp_my_sg_no_auto_retry|country_whatsapp_auto_pause|set_outreach_country|mobile_market|phone_key)\(/i.test(migCode)
  && !/(update|insert into|alter table)\s+public\.outreach_country_settings/i.test(migCode), 'the auto-off rule, the no-auto-retry trigger, mobile_market and the country settings are not touched');
ok(mobileMarketOf(toWhatsAppDigits('+44 7700 900123', 'USA')) === 'UK', 'TS twin: a +44 mobile on a USA lead is a UK mobile');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
