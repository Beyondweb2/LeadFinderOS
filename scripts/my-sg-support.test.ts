/* ============================================================
   MALAYSIA AND SINGAPORE (2026-10-14, feat/my-sg-support).

   Pins: Malaysian / Singapore numbers with and without a country code; the Singapore key and the Wrong-number match;
   no "No mobile" on a MY / SG mobile; send hours by country; the per-country switch and caps; the CSV import by
   country; the audit wording; and that the UK is unchanged throughout.

   Run: npx tsx scripts/my-sg-support.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';
import { countryFromAddress } from '../src/lib/leadCountry.ts';
import { coldWhatsAppVerdict, marksNoMobile } from '../src/lib/coldWhatsAppEligibility.ts';
import {
  callMarketOf, channelOn, checkCountryValue, countrySettingsFrom, DEFAULT_COUNTRY_SETTINGS, marketsOn, mobileMarketOf,
  windowForMarket, type Market,
} from '../src/lib/outreachMarkets.ts';
import { anyWindowOpen, LONDON_SEND_WINDOW, sendWindowForDigits, windowOpenForDigits } from '../src/lib/sendWindow.ts';
import { DEFAULT_DAILY_CAP } from '../src/lib/whatsappPace.ts';
import { decideContactRoute } from '../src/lib/contactRouting.ts';
import { isTextableMobile } from '../src/lib/smsStatus.ts';
import { qualifyPlace, placeSuffixForCountry } from '../src/lib/seedGuard.ts';
import { normalisePhoneKey } from '../src/types/outreach.ts';
import { phoneKeyLikeDb } from '../src/lib/inboundMatch.ts';
import { internationalPhone } from '../src/lib/lineType.ts';
import { isStopMessage } from '../src/lib/smsMessages.ts';
import { isOptOut, triageByRules } from '../src/lib/replyTriage.ts';
import { isDecline } from '../src/lib/inboundClassify.ts';
import {
  autoMapColumns, batchFromFileName, buildImportRows, buildResearchRows, countsByCountry, IMPORT_FIELD_LABEL, isResearchFile, parseCsv, reasonText,
  RESEARCH_FILE_DEFAULT_TRADE, RESEARCH_NOTE_MAX, withDefaultTrade, withImportCountry,
} from '../src/lib/csvLeadImport.ts';
import { SMS_SENDER_WORDS } from '../src/lib/outreachMarkets.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const MIG = read('supabase/migrations/20261025090000_my_sg_markets.sql');
const IMP = read('supabase/migrations/20261025090100_my_sg_import.sql');

console.log('\n── 1. phone numbers, with and without a country code ──');
const MY: Array<[string, string | null]> = [
  ['012-345 6789', '60123456789'], ['0123456789', '60123456789'], ['+60 12-345 6789', '60123456789'], ['0060 12 345 6789', '60123456789'],
  ['60123456789', '60123456789'], ['12 345 6789', '60123456789'], ['011-1234 5678', '601112345678'], ['+60 11-1234 5678', '601112345678'],
  ['03-1234 5678', '60312345678'], ['04-123 4567', '6041234567'], ['+60 (0)12-345 6789', '60123456789'], ['1800 88 1234', null], ['123', null],
];
for (const [raw, want] of MY) ok(toWhatsAppDigits(raw, 'Malaysia') === want, `Malaysia "${raw}" → ${want} (got ${toWhatsAppDigits(raw, 'Malaysia')})`);
const SG: Array<[string, string | null]> = [
  ['9123 4567', '6591234567'], ['8123 4567', '6581234567'], ['+65 9123 4567', '6591234567'], ['0065 9123 4567', '6591234567'],
  ['6591234567', '6591234567'], ['6123 4567', '6561234567'], ['1800 123 4567', null], ['5123 4567', null],
];
for (const [raw, want] of SG) ok(toWhatsAppDigits(raw, 'Singapore') === want, `Singapore "${raw}" → ${want} (got ${toWhatsAppDigits(raw, 'Singapore')})`);
for (const [raw] of [...MY, ...SG]) {
  for (const c of ['Malaysia', 'Singapore']) {
    const d = toWhatsAppDigits(raw, c) ?? '';
    ok(!/^44/.test(d) && !/^81/.test(d), `"${raw}" on a ${c} lead never becomes +44 / +81 (${d || 'null'})`);
  }
}
ok(internationalPhone('012-345 6789', 'Malaysia') === '+60123456789' && internationalPhone('9123 4567', 'Singapore') === '+6591234567'
  && internationalPhone('+65 9123 4567', 'Singapore') === '+6591234567', 'Add Lead stores a typed MY / SG number as E.164');
ok(internationalPhone('12345', 'Malaysia') === null && internationalPhone('9123 4567', 'Malaysia') === null, '…and refuses one that is not a valid number there');
ok(internationalPhone('0412 345 678', 'Australia') === '+61 412 345 678', 'Australia keeps the spaced form, unchanged');
ok(toWhatsAppDigits('07700 900123', 'UK') === '447700900123' && toWhatsAppDigits('+44 7700 900123', null) === '447700900123'
  && toWhatsAppDigits('0412 345 678', 'Australia') === '61412345678', 'UK and Australia unchanged');

console.log('\n── 2. the country Google\'s address names ──');
ok(countryFromAddress('12 Jalan Bukit Bintang, 55100 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia') === 'Malaysia', 'an address ending "Malaysia" is Malaysia');
ok(countryFromAddress('1 Raffles Place, #20-01, Singapore 048616') === 'Singapore', '"Singapore 048616" (country + postcode) is Singapore');
ok(countryFromAddress('10 Anson Rd, Singapore') === 'Singapore', 'a bare trailing "Singapore" too');
ok(countryFromAddress('1 High St, Leeds LS1 1AA, UK') === 'UK', 'UK unchanged');

console.log('\n── 3. the phone keys: SQL and TS, the Singapore Wrong-number match ──');
// phone_key is NOT changed — the new numbers already keep their code in it.
ok(!/create or replace function public\.phone_key\(/i.test(MIG), 'phone_key itself is not replaced (no index rebuild needed)');
for (const p of ['+65 9123 4567', '+60 12-345 6789']) ok(phoneKeyLikeDb(p) === toWhatsAppDigits(p, null), `phone_key("${p}") = the digits we send to (${phoneKeyLikeDb(p)})`);
ok(normalisePhoneKey('+65 9123 4567') === '6591234567' && normalisePhoneKey('+60 12-345 6789') === '60123456789', 'the browser\'s duplicate key agrees');
ok(MIG.includes("when length(public.phone_key(_phone)) = 10 and public.phone_key(_phone) ~ '^6[05]' then '+' || public.phone_key(_phone)")
  && MIG.indexOf("~ '^6[05]' then") < MIG.indexOf("~ '^[1-9]' then '+44'"), 'phone_e164_key: a 10-digit 60 / 65 key keeps its code, BEFORE the UK +44 branch');
/** phone_e164_key, the branches that matter here (the UK / AU ones are pinned by au-phone-key-parity). */
function e164Key(phone: string): string | null {
  const k = phoneKeyLikeDb(phone);
  if (k === null) return null;
  if (k.length === 10 && /^6[05]/.test(k)) return '+' + k;
  if (k.length === 10 && /^[1-9]/.test(k)) return '+44' + k;
  return '+' + k;
}
ok(e164Key('+65 9123 4567') === '+6591234567', 'THE SINGAPORE KEY: "+65 9123 4567" → +6591234567 (was +446591234567)');
ok(e164Key('+65 9123 4567') === '+' + toWhatsAppDigits('9123 4567', 'Singapore'), 'a Wrong-number mark on it is exactly what the senders check ("+" + the digits they dial)');
ok(e164Key('+60 4-123 4567') === '+6041234567' && e164Key('+60 12-345 6789') === '+60123456789', 'Malaysian keys keep +60 (10- and 11-digit)');
ok(e164Key('07700 900123') === '+447700900123' && e164Key('+44 7700 900123') === '+447700900123', 'UK keys unchanged');

console.log('\n── 4. storing E.164, and the duplicate check ──');
/** public.my_sg_e164, its regexes in TS (asserted present in the migration below). */
function mySgE164(phone: string, country: string): string | null {
  const d = phone.replace(/\D/g, '').replace(/^00/, '');
  const intl = /^\s*(\+|00)/.test(phone);
  if (!d) return null;
  if (intl && !/^6[05]/.test(d)) return null;
  if (country === 'Malaysia') {
    if (/^600?1([02-9][0-9]{7}|1[0-9]{8})$/.test(d)) return '+60' + d.replace(/^600?/, '');
    if (/^600?[3-9][0-9]{7,8}$/.test(d)) return '+60' + d.replace(/^600?/, '');
    if (!intl && /^0(1([02-9][0-9]{7}|1[0-9]{8})|[3-9][0-9]{7,8})$/.test(d)) return '+60' + d.slice(1);
    if (!intl && /^1([02-9][0-9]{7}|1[0-9]{8})$/.test(d)) return '+60' + d;
    return null;
  }
  if (country === 'Singapore') {
    if (/^65[3689][0-9]{7}$/.test(d)) return '+' + d;
    if (!intl && /^[3689][0-9]{7}$/.test(d)) return '+65' + d;
  }
  return null;
}
for (const frag of ["when d ~ '^600?1([02-9][0-9]{7}|1[0-9]{8})$' then '+60'", "when not intl and d ~ '^0(1([02-9][0-9]{7}|1[0-9]{8})|[3-9][0-9]{7,8})$' then '+60' || substr(d, 2)",
  "when not intl and d ~ '^1([02-9][0-9]{7}|1[0-9]{8})$' then '+60' || d", "when d ~ '^65[3689][0-9]{7}$' then '+' || d", "when not intl and d ~ '^[3689][0-9]{7}$' then '+65' || d",
  "when intl and d !~ '^6[05]' then null"]) ok(MIG.includes(frag), `my_sg_e164 has: ${frag}`);
for (const [raw, want] of MY) ok(mySgE164(raw, 'Malaysia') === (want ? '+' + want : null), `SQL stores Malaysia "${raw}" as ${want ? '+' + want : 'unchanged (unreadable)'}`);
for (const [raw, want] of SG) ok(mySgE164(raw, 'Singapore') === (want ? '+' + want : null), `SQL stores Singapore "${raw}" as ${want ? '+' + want : 'unchanged (unreadable)'}`);
ok(mySgE164('+44 7700 900123', 'Malaysia') === null, 'a UK "+44" number on a Malaysia lead is left exactly as typed');
ok(phoneKeyLikeDb(mySgE164('012-345 6789', 'Malaysia')) === phoneKeyLikeDb('+60 12-345 6789'), 'DUPLICATES: "012-345 6789" (stored E.164) and "+60 12-345 6789" are one key');
ok(phoneKeyLikeDb(mySgE164('9123 4567', 'Singapore')) === phoneKeyLikeDb('+65 9123 4567'), 'DUPLICATES: "9123 4567" and "+65 9123 4567" are one key');
ok(/before insert or update of phone, country on public\.outreach_leads/.test(MIG) && /if new\.country in \('Malaysia', 'Singapore'\) and new\.phone is not null then/.test(MIG)
  && /new\.phone := coalesce\(public\.my_sg_e164\(new\.phone, new\.country\), new\.phone\);/.test(MIG), 'the trigger rewrites ONLY a Malaysia / Singapore row, and only a number it can read');

console.log('\n── 5. markets: no "No mobile" on a Malaysia / Singapore mobile ──');
ok(mobileMarketOf('60123456789') === 'MY' && mobileMarketOf('601112345678') === 'MY' && mobileMarketOf('6591234567') === 'SG' && mobileMarketOf('6581234567') === 'SG', 'MY 01x and SG 8/9 mobiles are mobiles');
ok(mobileMarketOf('60312345678') === null && mobileMarketOf('6561234567') === null && mobileMarketOf('6531234567') === null, 'MY / SG landlines and SG VoIP are not mobiles');
ok(mobileMarketOf('447700900123') === 'UK' && mobileMarketOf('441614960000') === null && mobileMarketOf('61412345678') === 'AU' && mobileMarketOf(null) === null, 'UK mobile yes; UK landline, null no (Australia is its own market since 2026-10-22)');
ok(callMarketOf('60312345678') === 'MY' && callMarketOf('6561234567') === 'SG' && callMarketOf('441614960000') === 'UK', 'calling reaches landlines too');
const off = DEFAULT_COUNTRY_SETTINGS;
const on = countrySettingsFrom([{ country: 'MY', whatsapp_on: true, sms_on: true, call_on: true }, { country: 'SG', whatsapp_on: true, sms_on: true, call_on: true }]);
const vOff = coldWhatsAppVerdict('012-345 6789', 'Malaysia', marketsOn(off, 'whatsapp'));
ok(vOff.eligible === false && vOff.reason === 'country_off' && !marksNoMobile(vOff.reason), 'switched off: a Malaysian mobile is country_off — NEVER flagged No mobile');
ok(coldWhatsAppVerdict('9123 4567', 'Singapore', marketsOn(on, 'whatsapp')).eligible, 'switched on: a Singapore mobile is eligible');
const land = coldWhatsAppVerdict('03-1234 5678', 'Malaysia', marketsOn(on, 'whatsapp'));
ok(land.eligible === false && land.reason === 'not_a_uk_mobile' && marksNoMobile(land.reason), 'a Malaysian landline is still No mobile');
ok(coldWhatsAppVerdict('07700 900123', 'UK').eligible && !coldWhatsAppVerdict('0161 496 0000', 'UK').eligible
  && (coldWhatsAppVerdict('0161 496 0000', 'UK') as { reason: string }).reason === 'landline', 'UK unchanged (no markets passed = the UK alone)');
ok(MIG.includes("when coalesce(_country, 'UK') = 'UK' and _pk ~ '^7[0-9]{9}$' then 'UK'") && MIG.includes("when _pk ~ '^601([02-9][0-9]{7}|1[0-9]{8})$' then 'MY'")
  && MIG.includes("when _pk ~ '^65[89][0-9]{7}$' then 'SG'"), 'SQL mobile_market is the same rule (UK half = the old test)');
for (const fn of ['sales_queue_opener', 'queue_sms_openers']) {
  const at = MIG.indexOf(`FUNCTION public.${fn}(`);
  const body = MIG.slice(at, MIG.indexOf('$function$', MIG.indexOf('$function$', at) + 10));
  ok(at > 0 && /then v_reason := 'country_off';/.test(body) && !/v_reason in \([^)]*country_off/.test(body), `${fn}: country_off is a skip, never in the "mark No mobile / No SMS" list`);
}
ok(MIG.includes("and public.outreach_channel_on(public.mobile_market(o.country, public.phone_key(o.phone)), 'whatsapp')"), 'campaign_candidates "sendable" uses the same rule');

console.log('\n── 6. send hours by recipient country ──');
const at = (iso: string) => new Date(iso);
ok(sendWindowForDigits('60123456789').tz === 'Asia/Kuala_Lumpur' && sendWindowForDigits('6591234567').tz === 'Asia/Singapore', 'a MY / SG mobile uses its own time zone');
ok(sendWindowForDigits('447700900123') === LONDON_SEND_WINDOW && sendWindowForDigits('61298765432') === LONDON_SEND_WINDOW, 'everything else keeps the London window (an Australian mobile has its own, scripts/australia-whatsapp.test.ts)');
ok(windowOpenForDigits('60123456789', at('2026-10-14T01:00:00Z')) && !windowOpenForDigits('60123456789', at('2026-10-14T00:59:00Z')), 'Malaysia opens 09:00 local (01:00 UTC)');
ok(windowOpenForDigits('6591234567', at('2026-10-14T10:59:00Z')) && !windowOpenForDigits('6591234567', at('2026-10-14T11:00:00Z')), 'Singapore closes 19:00 local (11:00 UTC)');
ok(!anyWindowOpen(at('2026-10-14T02:00:00Z')) && !anyWindowOpen(at('2026-10-14T02:00:00Z'), off), '03:00 London: no tick while Malaysia / Singapore are off (UK unchanged)');
ok(anyWindowOpen(at('2026-10-14T02:00:00Z'), on), '…and the tick runs for a switched-on Malaysia / Singapore at 10:00 their time');
ok(windowForMarket('MY', countrySettingsFrom([{ country: 'MY', send_start_min: 600, send_end_min: 1080 }]), LONDON_SEND_WINDOW).startMin === 600, 'hours are adjustable per country');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/const anyWindowOpen = windowOpen \|\| marketWindowOpen\(ABROAD_MARKETS, "whatsapp", new Date\(\), countrySettings\);/.test(q), 'the WhatsApp queue opens for a switched-on country in its own hours');
ok(/\.find\(leadSendable\) \?\? null;[\s\S]*\.find\(leadSendable\) \?\? null;/.test(q), 'BOTH follow-up lanes use the per-country hours (not London)');
const sq = read('supabase/functions/process-sms-queue/index.ts');
ok(/inItsHours\(l\) && !suspended/.test(sq) && /return m === "MY" \|\| m === "SG" \? marketOpen\(m\) && !atCap\.has\(m\) : ukOpen;/.test(sq), 'the SMS queue texts each country in its own hours (UK unchanged)');

console.log('\n── 7. the per-country switch and caps ──');
ok(!channelOn(off, 'MY', 'whatsapp') && !channelOn(off, 'SG', 'sms') && !channelOn(off, 'MY', 'call') && channelOn(off, 'UK', 'whatsapp'), 'defaults: UK on, Malaysia / Singapore off');
ok(!channelOn(countrySettingsFrom([{ country: 'MY', whatsapp_on: null }]), 'MY', 'whatsapp'), 'a NULL switch is off (only an explicit true is on)');
for (const m of ['MY', 'SG'] as Market[]) {
  const s = DEFAULT_COUNTRY_SETTINGS[m];
  ok((s.whatsapp_daily_cap ?? 1e9) < DEFAULT_DAILY_CAP && (s.sms_daily_cap ?? 1e9) < DEFAULT_DAILY_CAP, `${m} starts with lower caps than the UK team cap`);
}
ok(checkCountryValue('whatsapp_daily_cap', '40').ok && !checkCountryValue('whatsapp_daily_cap', 5000).ok && !checkCountryValue('send_end_min', -1).ok, 'caps / hours are validated, refused never clamped');
ok(/insert into public\.outreach_country_settings[\s\S]*\('UK', true, true, true[\s\S]*\('MY', false, false, false, 50, 25, 540, 1140, 'Asia\/Kuala_Lumpur'\)[\s\S]*\('SG', false, false, false, 50, 25, 540, 1140, 'Asia\/Singapore'\)[\s\S]*on conflict \(country\) do nothing/.test(MIG),
  'the seed matches the defaults (UK on; MY / SG off, 50 / 25, 09:00-19:00) and never overwrites a setting');
ok(/if public\.my_role\(\) is distinct from 'admin' then raise exception 'admin_only'/.test(MIG) && /revoke all on public\.outreach_country_settings from anon, authenticated;/.test(MIG),
  'only the admin changes a country; nobody writes the table directly');

console.log('\n── 8. what the Inbox offers ──');
const base = { email: null, status: 'not_contacted', line_type: null, whatsapp_delivery_status: null, whatsapp_ever_delivered: null, smsConfigured: true, voiceConfigured: true, smsAllowed: true };
const offRoute = decideContactRoute({ ...base, phone: '+60 12-345 6789', country: 'Malaysia' });
ok(!offRoute.options.find((o) => o.channel === 'whatsapp')!.available && /Malaysia is switched off/.test(offRoute.options.find((o) => o.channel === 'whatsapp')!.reason), 'switched off: WhatsApp says the country is switched off');
const onMk = { whatsapp: marketsOn(on, 'whatsapp'), sms: marketsOn(on, 'sms'), call: marketsOn(on, 'call') };
const onRoute = decideContactRoute({ ...base, phone: '+60 12-345 6789', country: 'Malaysia', markets: onMk });
ok(['whatsapp', 'sms', 'call'].every((c) => onRoute.options.find((o) => o.channel === c)!.available), 'switched on: WhatsApp, SMS and calling are offered');
ok(/delivery depends on the local networks accepting our sender/.test(onRoute.options.find((o) => o.channel === 'sms')!.reason), 'the SMS option warns that delivery depends on the sender being accepted');
const uk = decideContactRoute({ ...base, phone: '07700 900123', country: 'UK' });
ok(uk.options.find((o) => o.channel === 'sms')!.reason.startsWith('A UK mobile'), 'UK wording unchanged');
ok(isTextableMobile('9123 4567', 'Singapore', marketsOn(on, 'sms')) && !isTextableMobile('9123 4567', 'Singapore', marketsOn(off, 'sms')) && isTextableMobile('07700 900123', 'UK', marketsOn(off, 'sms')), 'the SMS button follows the switch (UK always as before)');

console.log('\n── 9. the CSV import by country ──');
for (const frag of ["when lower(c_country_in) in ('malaysia', 'my', 'mys') then 'Malaysia'", "when lower(c_country_in) in ('singapore', 'sg', 'sgp') then 'Singapore'",
  String.raw`when coalesce(c_phone, '') ~ '^\s*(\+|00)\s*60' then 'Malaysia'`, String.raw`when coalesce(c_phone, '') ~ '^\s*(\+|00)\s*65' then 'Singapore'`,
  "c_phone := coalesce(public.my_sg_e164(c_phone, c_country), 'unreadable:' || c_phone);",
  "where coalesce(l.country, 'UK') in ('UK', 'Australia', 'Malaysia', 'Singapore')) s"]) ok(IMP.includes(frag), `import_leads_v2 has: ${frag.slice(0, 90)}`);
ok(/if c_phone ~ '\[A-Za-z\]' or c_pk is null/.test(IMP), 'an unreadable MY / SG number ("unreadable:" + the text) is refused invalid_phone, never repaired the UK way');

console.log('\n── 10. audit wording ──');
ok(placeSuffixForCountry('Malaysia') === 'Malaysia' && placeSuffixForCountry('Singapore') === 'Singapore' && placeSuffixForCountry('UK') === 'UK', 'the place words');
ok(qualifyPlace(['plumber in Johor Bahru'], 'Johor Bahru', 'Malaysia').questions[0] === 'plumber in Johor Bahru, Malaysia', '"plumber in Johor Bahru, Malaysia"');
ok(qualifyPlace(['plumber in Singapore'], 'Singapore', 'Singapore').questions[0] === 'plumber in Singapore', 'Singapore is never pinned twice');
ok(qualifyPlace(['plumber in Leeds'], 'Leeds', 'UK').questions[0] === 'plumber in Leeds UK' && qualifyPlace(['ca in Pune'], 'Pune', 'India').questions[0] === 'ca in Pune India', 'UK / India wording unchanged');
ok(/Malaysia: "my"/.test(read('supabase/functions/_shared/enrichment/ai-search.ts')), 'the AI search is asked from Malaysia');

console.log('\n── 11. opt-outs in Malay and Chinese (WhatsApp and SMS) ──');
for (const w of ['berhenti', 'Berhenti.', 'henti', 'jangan hantar', 'Jangan hantar lagi!', '停止', '退订', '取消订阅', '不要再发', '停止。', 'STOP'])
  ok(isStopMessage(w), `SMS: "${w}" as the whole text opts out`);
for (const w of ['Tolong jangan hantar mesej lagi', 'jangan ganggu saya', 'berhenti hantar mesej', 'buang nombor saya', '请不要再发信息给我', '停止发送', '停止', 'berhenti', 'please stop messaging me'])
  ok(isOptOut(w) && triageByRules(w, { isClient: false }).suppress === true, `WhatsApp / SMS phrase: "${w}" opts out`);
for (const w of ['Boleh berhenti kat kedai esok?', 'saya nak tahu harga', '停车场在哪里', 'one-stop shop', 'Can you stop by on Monday?'])
  ok(!isOptOut(w), `not an opt-out: "${w}"`);
ok(isDecline('tak berminat') && isDecline('没兴趣') && isDecline('jangan hantar') && !isDecline('berminat, boleh terangkan?'), 'Malay / Chinese declines stop the automation (never a pitch)');
ok(/if \(isStopMessage\(body\) \|\| isOptOut\(body\)\) \{/.test(read('supabase/functions/twilio-webhook/index.ts')), 'an inbound text opts out on the STOP words OR the shared phrases');

console.log('\n── 12. the admin panel and the SMS sender warning ──');
{
  const panel = read('src/components/CountrySendingSettings.tsx');
  ok(/\{teamControls && <CountrySendingSettings \/>\}/.test(read('src/components/WhatsAppQueuePanel.tsx')), 'the country panel sits in the WhatsApp queue panel, admin (team controls) only');
  ok(/\['whatsapp_on', 'WhatsApp'\], \['sms_on', 'SMS'\], \['call_on', 'Browser calls'\]/.test(panel) && /checkCountryValue\('whatsapp_daily_cap'/.test(panel), 'a switch per channel and the country caps, validated by the one rule');
  ok(/\+44 7400 420187/.test(SMS_SENDER_WORDS) && /delivery depends on sender registration/.test(SMS_SENDER_WORDS), 'the SMS warning names the sender and says delivery depends on registration');
  ok(/explain_offer \/ explain_offer_v2/.test(panel), 'the panel names the templates not to use in Malaysia / Singapore');
}

console.log('\n── 13. the CSV import screen: a country per file and per row, counts by country ──');
{
  const rows = [{ row: 2, phone: '012-345 6789' }, { row: 3, phone: '9123 4567', country: 'Singapore' }];
  const out = withImportCountry(rows, 'Malaysia');
  ok(out[0].country === 'Malaysia' && out[1].country === 'Singapore', 'the file\'s country fills a blank Country; a row\'s own always wins');
  ok(withImportCountry(rows, null) === rows, '"Work it out from each row" changes nothing (as before)');
  const by = countsByCountry([
    { i: 0, row: 2, outcome: 'new', country: 'Malaysia' }, { i: 1, row: 3, outcome: 'invalid', reasons: ['invalid_phone'], country: 'Malaysia' },
    { i: 2, row: 4, outcome: 'new', country: 'Singapore' }, { i: 3, row: 5, outcome: 'new', country: 'UK' },
  ]);
  ok(JSON.stringify(by.map((c) => [c.country, c.rows, c.adding, c.unreadablePhones])) === JSON.stringify([['UK', 1, 1, 0], ['Malaysia', 2, 1, 1], ['Singapore', 1, 1, 0]]),
    'preview counts by country, with the numbers that could not be read');
  ok(reasonText('invalid_phone', { country: 'Malaysia' }, false) === 'Phone number could not be read as a Malaysia number' && reasonText('invalid_phone', {}, false) === 'Phone number not recognised',
    'an unreadable number says which country it was read in (UK wording unchanged)');
  const c = read('supabase/migrations/20261025090200_csv_import_country_rows.sql');
  ok(c.includes("'outcome', 'invalid', 'reasons', to_jsonb(c_errs), 'country', c_country)") && c.includes("'outcome', v_outcome, 'country', o ->> 'country',"),
    'the server names the country on every result row');
  const d = read('src/components/CSVImportDialog.tsx');
  ok(/withImportCountry\(withDefaultTrade\(research \? buildResearchRows\(parsed\) : buildImportRows\(parsed, mapping\), defaultTrade\), importCountry \|\| null\)/.test(d) && /data-testid="csv-country"/.test(d) && /<CountryCounts rows=\{preview\.rows\} \/>/.test(d),
    'the import screen has the country picker and the by-country preview');
  ok(/data-testid="csv-batch"/.test(d) && /data-testid="csv-trade"/.test(d) && /data-testid="csv-owner"/.test(d), 'batch name, default trade and owner are kept');
  ok(IMPORT_FIELD_LABEL.notes && /whythislead/.test(read('src/lib/csvLeadImport.ts')), '"Why this lead" is still read as the note');
}

console.log('\n── 14. a researched lead file (Ethan\'s language-school shape — made-up rows) ──');
{
  const head = ['id', 'name', 'country', 'city', 'segment', 'website', 'english_evidence', 'whatsapp_number', 'whatsapp_url', 'website_absence_evidence',
    'hypothesis_1', 'hypothesis_2', 'proposed_offer', 'owner_name', 'owner_role', 'owner_evidence', 'social_date_precision'];
  const q = (v: string) => '"' + v.replace(/"/g, '""') + '"';
  const line = (o: Record<string, string>) => head.map((h) => q(o[h] ?? '')).join(',');
  const csv = '﻿' + head.join(',') + '\n' + [
    line({ id: 'T001', name: 'Test Bahasa Centre', country: 'Malaysia', city: 'Kuala Lumpur', segment: 'English website', website: 'https://example-test.my/',
      english_evidence: 'English site lists adult and kids classes. It also says more.', whatsapp_number: '+60123456789', whatsapp_url: 'https://wa.me/60123456789',
      hypothesis_1: 'Hypothesis: parents may search for kids English classes nearby.', hypothesis_2: 'Hypothesis: second idea.',
      proposed_offer: 'Test prompts across AI assistants. Then rerun.', owner_name: 'Ann Tan', owner_role: 'Founder (per About page)',
      owner_evidence: 'Not established in inspected public sources; about page names no owner.', social_date_precision: 'Not established' }),
    line({ id: 'T002', name: 'Test SG Tutors', country: 'Singapore', city: 'Singapore', website: 'Not established', english_evidence: 'Social posts mention IELTS.',
      whatsapp_number: '+6591234567', website_absence_evidence: 'Exact-name searches found no owned domain. More text.',
      hypothesis_1: 'Hypothesis: referrals from schools.', proposed_offer: 'A clear course page could help.', owner_name: 'Not established', owner_role: 'Teacher' }),
  ].join('\n');
  const parsed = parseCsv(csv);
  ok(isResearchFile(parsed.headers) && !isResearchFile(['business_name', 'phone', 'country']), 'the research shape is recognised by its columns (an ordinary file is not)');
  const rows = buildResearchRows(parsed);
  const [a, b] = rows;
  ok(a.business_name === 'Test Bahasa Centre' && a.country === 'Malaysia' && a.town === 'Kuala Lumpur' && a.website === 'https://example-test.my/' && a.phone === '+60123456789',
    'name / country / city / website / whatsapp_number are read');
  ok(a.contact_name === 'Ann Tan (Founder)' && b.contact_name === undefined, 'owner + role is the contact; "Not established" owner → no contact (a role alone is not a name)');
  ok(b.website === undefined && b.phone === '+6591234567' && b.country === 'Singapore', '"Not established" website is empty');
  ok(a.notes === 'Why this lead: Parents may search for kids English classes nearby.\nWebsite: English site lists adult and kids classes.\nOffer: Test prompts across AI assistants.',
    'the note: hypothesis_1 (no "Hypothesis:"), the website evidence, the offer — first sentences only');
  ok(/^Why this lead: Referrals from schools\.\nNo website: Exact-name searches found no owned domain\.\nOffer: /.test(b.notes ?? ''), 'no website → website_absence_evidence');
  ok(a.extra?.segment === 'English website' && a.extra?.hypothesis_2 === 'Hypothesis: second idea.' && a.extra?.whatsapp_url === 'https://wa.me/60123456789'
    && a.extra?.id === 'T001' && !('social_date_precision' in (a.extra ?? {})) && !('name' in (a.extra ?? {})),
    'every other non-empty column is kept as extra data (a bare "Not established" is dropped; used columns are not repeated)');
  ok(rows.every((r) => !Object.values({ ...r, ...(r.extra ?? {}) }).some((v) => typeof v === 'string' && /^not established\.?$/i.test(v))), 'no value is a bare "Not established"');
  ok(rows.every((r) => (r.notes ?? '').length <= RESEARCH_NOTE_MAX), 'the note is short');
  ok(batchFromFileName('ethan-language-schools.csv') === 'Ethan - language schools' && RESEARCH_FILE_DEFAULT_TRADE === 'Language schools', 'batch defaults to the file name; trade to Language schools');
  ok(withDefaultTrade(rows, RESEARCH_FILE_DEFAULT_TRADE).every((r) => r.trade === 'Language schools'), '…filled on every row');
  const plain = parseCsv('business_name,phone,notes\nPlain Co,07700 900123,Not established\n');
  ok(JSON.stringify(buildImportRows(plain, autoMapColumns(plain.headers).mapping)) === JSON.stringify([{ row: 2, business_name: 'Plain Co', phone: '07700 900123', notes: 'Not established' }]),
    'an ordinary import is read exactly as before (no extra, nothing blanked)');
  const mig = read('supabase/migrations/20261025090200_csv_import_country_rows.sql');
  ok(/alter table public\.outreach_leads add column if not exists import_extra jsonb;/.test(mig) && mig.includes("o ->> 'country', 'manual', v_batch, o -> 'extra')")
    && mig.includes("if length(c_extra::text) > 20000 then c_errs := c_errs || 'too_long:extra'::text; end if;"), 'the server stores extra on a NEW lead only, size-capped');
  ok(!/import_extra/.test(read('src/lib/outreachLeadColumns.ts')) && !/import_extra/.test(read('src/components/LeadDetailDialog.tsx')), 'import_extra is not drawn or listed anywhere');
  const d = read('src/components/CSVImportDialog.tsx');
  ok(/research \? buildResearchRows\(parsed\) : buildImportRows\(parsed, mapping\)/.test(d) && /setBatchName\(batchFromFileName\(f\.name\)\)/.test(d), 'the import screen uses the research reader and the defaults');
  ok(!/queue|sales_queue_opener|send-whatsapp/i.test(read('src/lib/csvLeadImport.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'import only — nothing is queued or sent');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
