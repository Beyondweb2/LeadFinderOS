/* ============================================================
   phone_key — SQL AND TS AGREE, AUSTRALIA INCLUDED (2026-10-07, migration 20261014100000).

   The database decides identity with public.phone_key (the lead lookup, the phone lock, contact / claim /
   suppression joins, the inbound lead match). The app keeps two mirrors: src/lib/inboundMatch.ts
   phoneKeyLikeDb and src/types/outreach.ts normalisePhoneKey. This suite:
     · reads the NEWEST phone_key definition from the migrations and runs ITS OWN regexes, in its own order,
       on a table of numbers — so the SQL and the mirrors are compared, not two hand-written copies;
     · proves the two forms of an Australian number now meet ("+61 412 345 678" ≡ "0412 345 678") and that no
       UK, Indian or US key moved;
     · mirrors phone_e164_key's new branches and checks them against what the senders dial ('+' +
       toWhatsAppDigits): an Australian number is "+61…", never "+4…";
     · checks my_sales_message_phones offers the 61 forms (and still the UK ones);
     · checks the reindex migration exists for both expression indexes.

   Run: npx tsx scripts/au-phone-key-parity.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { phoneKeyLikeDb } from '../src/lib/inboundMatch.ts';
import { normalisePhoneKey } from '../src/types/outreach.ts';
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const MIGS = path.join(ROOT, 'supabase/migrations');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/** The newest migration that (re)defines `fn`, and that definition's text up to the end of its body. */
function newestDefinition(fn: string): { file: string; body: string } {
  const files = fs.readdirSync(MIGS).filter((f) => f.endsWith('.sql')).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = read(`supabase/migrations/${files[i]}`);
    const at = sql.search(new RegExp(`create or replace function public\\.${fn}\\(`, 'i'));
    if (at >= 0) {
      const close = sql.indexOf('$$;', sql.indexOf('$$', at) + 2);
      return { file: files[i], body: sql.slice(at, close + 3) };
    }
  }
  throw new Error(`no definition of ${fn}`);
}

console.log('\n── the newest public.phone_key, run with its own regexes ──');
const pk = newestDefinition('phone_key');
ok(pk.file === '20261014100000_au_phone_key.sql', `newest phone_key is this pass's migration (${pk.file})`);
// regexp_replace(<inner>, '<pattern>', '' [, 'g']) — the literal patterns, innermost (= applied first) first.
const patterns = [...pk.body.matchAll(/,\s*'([^']+)',\s*''/g)].map((m) => m[1]);
ok(JSON.stringify(patterns) === JSON.stringify(['\\D', '^00', '^44(?=\\d{10}$)', '^61(?=[23478]\\d{8}$)', '^0']),
  `the steps are: digits, 00, 44+10, 61+9 (2/3/4/7/8), trunk 0 (read: ${JSON.stringify(patterns)})`);
ok(/select case when length\(d\) < 7 then null else d end/.test(pk.body), 'under seven digits is still no key');
ok(/language sql immutable parallel safe/.test(pk.body), 'still IMMUTABLE PARALLEL SAFE (the indexes need it)');
function sqlPhoneKey(phone: string | null): string | null {
  let d = phone ?? '';
  patterns.forEach((p, i) => { d = d.replace(new RegExp(p, i === 0 ? 'g' : ''), ''); });
  return d.length < 7 ? null : d;
}

const TABLE: Array<[string, string | null]> = [
  // Australia — both forms of one number meet
  ['+61 412 345 678', '412345678'], ['0412 345 678', '412345678'], ['0061 412 345 678', '412345678'], ['61412345678', '412345678'],
  ['+61 2 9876 5432', '298765432'], ['(02) 9876 5432', '298765432'], ['+61 8 9123 4567', '891234567'], ['(08) 9123 4567', '891234567'],
  // UK — unchanged
  ['07700 900123', '7700900123'], ['+44 7700 900123', '7700900123'], ['0044 7700 900123', '7700900123'], ['447700900123', '7700900123'],
  ['0161 496 0000', '1614960000'], ['+44 161 496 0000', '1614960000'], ['01632 960001', '1632960001'],
  // India / US / Ireland — unchanged (keep their own code)
  ['+91 98765 43210', '919876543210'], ['+1 415 555 0100', '14155550100'], ['+353 86 123 4567', '353861234567'],
  // a Brasília mobile written without +55 has a 9 after the 61 — untouched
  ['61 98765 4321', '61987654321'],
  // junk
  ['12345', null], ['', null],
];
for (const [phone, want] of TABLE) {
  const sql = sqlPhoneKey(phone);
  ok(sql === want, `SQL phone_key("${phone}") = ${want} (got ${sql})`);
  ok(phoneKeyLikeDb(phone) === sql, `phoneKeyLikeDb agrees on "${phone}" (${phoneKeyLikeDb(phone)})`);
}
// normalisePhoneKey is the Outreach "shared phone" key: it differs from phone_key only in ways that are not
// this pass's business (it strips every leading 0, and 44 at any length) — it must agree on every real number.
for (const [phone, want] of TABLE.filter(([, w]) => w !== null)) {
  ok(normalisePhoneKey(phone) === want, `normalisePhoneKey("${phone}") = ${want} (got ${normalisePhoneKey(phone)})`);
}
ok(sqlPhoneKey('+61 412 345 678') === sqlPhoneKey('0412 345 678'), 'THE POINT: "+61 412 345 678" and "0412 345 678" are one key');
{
  // No collision: a 61-stripped key is 9 digits starting 2/3/4/7/8; a UK key from a valid UK number is 10 digits.
  const ukKeys = ['07700 900123', '+44 20 7946 0000', '0161 496 0000', '01632 960001'].map(sqlPhoneKey);
  ok(ukKeys.every((k) => k !== null && k.length === 10), 'UK keys are 10 digits — never the 9-digit Australian shape');
}

console.log('\n── phone_e164_key: what the senders dial ──');
const e164 = newestDefinition('phone_e164_key');
ok(e164.file === '20261014100000_au_phone_key.sql', `newest phone_e164_key is this pass's migration (${e164.file})`);
ok(/when length\(public\.phone_key\(_phone\)\) = 10 and public\.phone_key\(_phone\) ~ '\^\[1-9\]' then '\+44' \|\| public\.phone_key\(_phone\)/.test(e164.body), 'the UK branch is unchanged');
ok(/regexp_replace\(coalesce\(_phone, ''\), '\\D', '', 'g'\) ~ '\^\(00\)\?61\[23478\]\[0-9\]\{8\}\$' then '\+61' \|\| public\.phone_key\(_phone\)/.test(e164.body), 'an Australian international number → +61…');
ok(/regexp_replace\(coalesce\(_phone, ''\), '\\D', '', 'g'\) ~ '\^04\[0-9\]\{8\}\$' then '\+61' \|\| public\.phone_key\(_phone\)/.test(e164.body), 'an Australian national mobile (04…) → +61…');
ok(/else '\+' \|\| public\.phone_key\(_phone\)/.test(e164.body) && /set search_path to 'public'/.test(e164.body), 'everything else exactly as before; search_path kept');
/** The SQL above, in TS (the regexes are the ones asserted). */
function sqlE164(phone: string): string | null {
  const k = sqlPhoneKey(phone);
  const d = phone.replace(/\D/g, '');
  if (k === null) return null;
  if (k.length === 10 && /^[1-9]/.test(k)) return '+44' + k;
  if (k.length === 9 && /^(00)?61[23478][0-9]{8}$/.test(d)) return '+61' + k;
  if (k.length === 9 && /^04[0-9]{8}$/.test(d)) return '+61' + k;
  return '+' + k;
}
for (const phone of ['+61 412 345 678', '0412 345 678', '0061 412 345 678', '+61 2 9876 5432'])
  ok(sqlE164(phone) === '+' + toWhatsAppDigits(phone, 'Australia'), `phone_e164_key("${phone}") = "+" + what an Australia lead is sent to (${sqlE164(phone)})`);
for (const phone of ['07700 900123', '+44 7700 900123', '0044 7700 900123'])
  ok(sqlE164(phone) === '+' + toWhatsAppDigits(phone, 'UK'), `UK unchanged: phone_e164_key("${phone}") = ${sqlE164(phone)}`);
ok(sqlE164('+91 98765 43210') === '+919876543210', 'India unchanged');
ok(!/^\+4\d{8}$/.test(sqlE164('0412 345 678') ?? ''), 'an Australian mobile is never the bare "+4…" key');

console.log('\n── my_sales_message_phones: a rep can read an Australian lead\'s messages ──');
{
  const f = newestDefinition('my_sales_message_phones');
  ok(f.file === '20261014100000_au_phone_key.sql', `newest my_sales_message_phones is this pass's migration (${f.file})`);
  ok(/values \('44' \|\| s\.k\), \(s\.k\), \('0' \|\| s\.k\), \('\+44' \|\| s\.k\)\)/.test(f.body), 'the UK forms are offered as before');
  ok(/values \('61' \|\| s\.k\), \('\+61' \|\| s\.k\)\) as au\(v\) where s\.k ~ '\^\[23478\]\[0-9\]\{8\}\$'/.test(f.body), 'an Australian-shaped key adds 61… and +61… (whatsapp_messages.phone is 61412345678)');
  ok(/if public\.my_role\(\) is distinct from 'sales' then return; end if;/.test(f.body) && /security definer set search_path = public/.test(f.body) && /where l\.id in \(select public\.my_sales_lead_ids\(\)\)/.test(f.body),
    'still sales-only, SECURITY DEFINER, the rep\'s own leads only');
  ok('61' + sqlPhoneKey('0412 345 678') === toWhatsAppDigits('0412 345 678', 'Australia'), 'the 61 form it offers is exactly the stored message phone');
}

console.log('\n── the two expression indexes are rebuilt ──');
{
  const idx = read('supabase/migrations/20261014100100_au_phone_key_reindex.sql');
  ok(/^reindex index concurrently public\.idx_outreach_leads_phone_key;$/m.test(idx) && /^reindex index concurrently public\.idx_whatsapp_messages_phone_key;$/m.test(idx),
    'REINDEX CONCURRENTLY both phone_key indexes');
  const all = fs.readdirSync(MIGS).filter((f) => f.endsWith('.sql')).map((f) => read(`supabase/migrations/${f}`)).join('\n');
  const uses = [...all.matchAll(/create (unique )?index[^;]*phone_key\([^;]*;/gi)].map((m) => m[0]);
  ok(uses.length === 2 && uses.every((u) => /idx_(outreach_leads|whatsapp_messages)_phone_key/.test(u)), `exactly the two indexes use phone_key (found ${uses.length})`);
  ok(!/generated always as[^;]*phone_key/i.test(all), 'no generated column uses phone_key');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
