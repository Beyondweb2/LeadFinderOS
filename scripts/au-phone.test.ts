/* ============================================================
   AUSTRALIAN PHONES (2026-10-07, improve/au-location-parity) — the safety half of the Australia pass.

   Pins:
     · every stored form of an Australian number reaches WhatsApp as 61… on an Australia lead
       (0412 345 678, +61 412 345 678, 0061…, 0011 61…, 61… typed without "+", the 9 digits a spreadsheet
       left), and a 13 / 1300 / 1800 / mistyped number answers null — never bare digits another country owns;
     · ⛔ NO "04…" NUMBER EVER BECOMES 44…, on any country, through any helper (toWhatsAppDigits,
       formatPhoneForWhatsApp, generateWhatsAppUrl) — the UK has no 04 numbers;
     · every valid UK form is unchanged (07… → 447…, +44 / 0044 / 44…);
     · line type: an Australian mobile is MOBILE, an Australian landline is a landline (not WhatsApp), 13 / 1300
       numbers are never WhatsApp-eligible; "0061 4…" parses on an Australia lead; the edge copy carries the same rule;
     · a typed Australian number is stored the way Google stores one ("+61 412 345 678");
     · cold WhatsApp eligibility is NOT widened: sales_queue_opener's cold test is UK-only (India removed 2026-10-15), and the
       refusal says honestly that Australia is not switched on.

   Run: npx tsx scripts/au-phone.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';
import { classifyLineType, internationalPhone } from '../src/lib/lineType.ts';
import { formatPhoneForWhatsApp, generateWhatsAppUrl } from '../src/lib/leadUtils.ts';
import { QUEUE_SKIP_LABEL } from '../src/lib/salesCrm.ts';
import { LAUNCH_SKIP_TEXT } from '../src/lib/campaignRules.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log('\n── an Australia lead: every stored form reaches WhatsApp as 61… ──');
for (const [raw, want] of [
  ['0412 345 678', '61412345678'], ['0412345678', '61412345678'], ['+61 412 345 678', '61412345678'],
  ['+61412345678', '61412345678'], ['0061 412 345 678', '61412345678'], ['0011 61 412 345 678', '61412345678'],
  ['61412345678', '61412345678'], ['412 345 678', '61412345678'], ['(02) 9876 5432', '61298765432'],
  ['+61 2 9876 5432', '61298765432'], ['(08) 9123 4567', '61891234567'], ['03 9123 4567', '61391234567'],
] as const) ok(toWhatsAppDigits(raw, 'Australia') === want, `Australia "${raw}" → ${want} (got ${toWhatsAppDigits(raw, 'Australia')})`);
ok(toWhatsAppDigits('0412 345 678', 'AU') === '61412345678', 'the ISO code AU is read as Australia too');
for (const raw of ['1300 123 456', '13 12 34', '1800 123 456', '12345', '07700 900123'])
  ok(toWhatsAppDigits(raw, 'Australia') === null, `Australia "${raw}" → null (not a WhatsApp destination; never bare digits)`);
ok(toWhatsAppDigits('', 'Australia') === null && toWhatsAppDigits(null, 'Australia') === null, 'blank → null');
ok(toWhatsAppDigits('+44 7700 900123', 'Australia') === '447700900123', 'a +44 number on an Australia lead keeps its own code');
ok(toWhatsAppDigits('0011 44 7700 900123', 'Australia') === '447700900123', 'Australia\'s 0011 international prefix is read as "+"');

console.log('\n── ⛔ no 04… number ever becomes 44… ──');
const fours = ['0412 345 678', '0412345678', '04 1234 5678', '0499999999', '0400 000 000'];
for (const c of ['UK', 'GB', null, undefined, '', 'Australia', 'USA', 'India', 'Canada']) {
  for (const raw of fours) {
    const d = toWhatsAppDigits(raw, c as string | null);
    ok(!(d ?? '').startsWith('44'), `toWhatsAppDigits("${raw}", ${JSON.stringify(c)}) does not start 44 (got ${d})`);
    const f = formatPhoneForWhatsApp(raw, c as string | null);
    ok(!f.startsWith('44'), `formatPhoneForWhatsApp("${raw}", ${JSON.stringify(c)}) does not start 44 (got "${f}")`);
  }
}
ok(toWhatsAppDigits('0412 345 678', 'UK') === null && toWhatsAppDigits('0412 345 678', null) === null, 'a UK / blank-country 04… number → null (refused, not guessed)');
ok(!/wa\.me\/44/.test(generateWhatsAppUrl('0412 345 678', 'hi')) && /wa\.me\/61412345678\?/.test(generateWhatsAppUrl('0412 345 678', 'hi', 'Australia')),
  'generateWhatsAppUrl: no country → never wa.me/44…; with Australia → wa.me/61412345678');
ok(toWhatsAppDigits('+61 412 345 678', 'UK') === '61412345678' && toWhatsAppDigits('+61 412 345 678', null) === '61412345678',
  'a +61 number on a lead labelled UK (or blank) keeps its own code');

console.log('\n── UK unchanged ──');
for (const [raw, want] of [['07700 900123', '447700900123'], ['+44 7700 900123', '447700900123'], ['0044 7700 900123', '447700900123'],
  ['447700900123', '447700900123'], ['01632 960001', '441632960001'], ['020 7946 0000', '442079460000']] as const) {
  ok(toWhatsAppDigits(raw, 'UK') === want, `UK "${raw}" → ${want}`);
  ok(formatPhoneForWhatsApp(raw, 'UK') === want, `formatPhoneForWhatsApp UK "${raw}" → ${want}`);
}
ok(formatPhoneForWhatsApp('07700 900123') === '447700900123', 'formatPhoneForWhatsApp with no country still reads a 07… number as UK');
ok(formatPhoneForWhatsApp('0044 7700 900123', 'UK') === '447700900123', 'formatPhoneForWhatsApp: "0044 …" is no longer mangled into 440044…');
ok(/return toWhatsAppDigits\(phone, country\) \?\? '';/.test(read('src/lib/leadUtils.ts')), 'formatPhoneForWhatsApp is the one rule (src/lib/waNumber.ts), for every country');
ok(/generateWhatsAppUrl\(lead\.phone, message, lead\.country\)/.test(read('src/components/SingleWhatsAppDialog.tsx')), 'the WhatsApp Web dialog passes the lead\'s country');
ok(/const d = l\?\.phone \? formatPhoneForWhatsApp\(l\.phone, l\.country\) : ''; return d \? `\+\$\{d\}` : '';/.test(read('src/components/OutreachTable.tsx')),
  'Outreach\'s suppression key is empty (never a bare "+") for a number the rule cannot place');

console.log('\n── line type: mobile vs landline ──');
for (const raw of ['0412 345 678', '+61 412 345 678', '0061412345678', '0011 61 412 345 678', '0412345678']) {
  const r = classifyLineType(raw, 'Australia');
  ok(r.lineType === 'mobile' && r.whatsappEligible, `Australia "${raw}" → mobile, WhatsApp-eligible (got ${r.lineType})`);
}
for (const raw of ['(02) 9876 5432', '+61 2 9876 5432', '(08) 9123 4567', '03 9123 4567']) {
  const r = classifyLineType(raw, 'Australia');
  ok(r.lineType === 'landline' && !r.whatsappEligible, `Australia "${raw}" → landline, never WhatsApp (got ${r.lineType})`);
}
for (const raw of ['1300 123 456', '13 12 34', '1800 123 456']) {
  const r = classifyLineType(raw, 'Australia');
  ok(!r.whatsappEligible && r.lineType !== 'mobile', `Australia "${raw}" → not a mobile, not WhatsApp-eligible (got ${r.lineType})`);
}
ok(classifyLineType('+61 412 345 678', 'UK').lineType === 'mobile' && classifyLineType('+61 412 345 678', null).lineType === 'mobile', 'an international +61 mobile is a mobile whatever the lead\'s country');
ok(classifyLineType('+61 2 9876 5432', null).lineType === 'landline', '…and a +61 landline a landline');
ok(classifyLineType('07911 123456', 'UK').lineType === 'mobile' && classifyLineType('01632 960001', 'UK').lineType !== 'mobile', 'UK unchanged');
{
  const client = read('src/lib/lineType.ts');
  const edge = read('supabase/functions/_shared/line-type.ts');
  const body = (s: string) => (s.match(/function auInternational\(raw: string, iso: string \| undefined\): string \{\n\s+return iso === ["']AU["'] \? raw\.replace\(\/\^\\s\*00\(\?!11\)\/, ["']\+["']\) : raw;\n\}/) ?? [''])[0].replace(/"/g, "'");
  ok(!!body(client) && body(client) === body(edge), 'the edge line-type copy carries the identical "0061 → +61" rule (client and edge behave the same)');
  ok(/parsePhoneNumberFromString\(auInternational\(raw, iso\), iso \?\? \("GB" as CountryCode\)\)/.test(edge), '…and the edge copy uses it');
}

console.log('\n── a typed Australian number is stored the way Google stores one ──');
ok(internationalPhone('0412 345 678', 'Australia') === '+61 412 345 678', '"0412 345 678" → "+61 412 345 678"');
ok(internationalPhone('0061 412 345 678', 'Australia') === '+61 412 345 678', '"0061 412 345 678" → "+61 412 345 678"');
ok(internationalPhone('(02) 9876 5432', 'Australia') === '+61 2 9876 5432', 'a Sydney landline → "+61 2 9876 5432"');
ok(internationalPhone('07700 900123', 'Australia') === null, 'a UK number typed on an Australia lead is refused, not relabelled');
{
  const d = read('src/components/AddLeadDialog.tsx');
  ok(/value: 'Australia', label: 'Australia'/.test(d) && /value: 'UK', label: 'United Kingdom'/.test(d) && !/value: 'India'/.test(d) && /country: 'UK', businessName/.test(d),
    'Add a lead offers Australia (UK still the default; India is no longer offered, 2026-10-15)');
  ok(/if \(f\.country !== 'UK' && f\.phone\.trim\(\)\) \{\n\s+const intl = internationalPhone\(f\.phone, f\.country\);/.test(d), '…and stores an Australian typed number in +61 form through internationalPhone');
}

console.log('\n── cold WhatsApp is NOT widened to Australia; the words are honest ──');
{
  const latest = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
    .filter((f) => /create or replace function public\.sales_queue_opener/i.test(read(`supabase/migrations/${f}`))).pop()!;
  const sqo = read(`supabase/migrations/${latest}`);
  ok(/'not_a_uk_mobile'/.test(sqo) && !/\^61/.test(sqo.slice(sqo.indexOf('function public.sales_queue_opener'))), `the newest sales_queue_opener (${latest}) still refuses anything but a UK mobile (no 61 clause, no 91 clause)`);
  ok(!/\^91/.test(sqo.slice(sqo.indexOf('function public.sales_queue_opener'))), 'and the newest definition has no India (91) alternative');
  ok(/Australia/.test(QUEUE_SKIP_LABEL.not_a_uk_mobile) && /not a UK mobile/.test(QUEUE_SKIP_LABEL.not_a_uk_mobile) && !/Indian/.test(QUEUE_SKIP_LABEL.not_a_uk_mobile), 'the queue refusal says "not a UK mobile" (no India) and that Australia is not switched on');
  ok(/Australia/.test(LAUNCH_SKIP_TEXT.not_a_uk_mobile) && !/^not a mobile number$/.test(LAUNCH_SKIP_TEXT.not_a_uk_mobile), 'the campaign launch no longer calls an Australian mobile "not a mobile number"');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
