/* ============================================================
   INDIA READINESS — the country-portability fixes of 2026-09-28, and that the UK path is unchanged.

   Pins:
     · +91 phones: every stored form reaches WhatsApp as 91…; the UK rule is byte-identical to the
       old hand-kept copy on every UK input; a typed Indian number is stored the way Google stores one;
     · the lead's country comes from Google's address, never from the form's hidden choice;
     · a bare Indian city is geocoded with an India bias, and UK inputs keep their GB bias;
     · audit questions name "Pune India", never "Pune UK" — and UK questions are unchanged;
     · the queue sends an Indian number in India's hours (10:00–19:00 IST) and a UK one in London's
       (07:00–21:30) — filtered before the look-ahead, in every lane;
     · Sales can queue an Indian mobile; the UK rule in sales_queue_opener is unchanged;
     · the admin's name dedupe does not collide across countries; place id stays country-blind;
     · Add a lead asks for the country (no hard-coded UK).

   Run: npx tsx scripts/india-readiness.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';
import { internationalPhone, classifyLineType } from '../src/lib/lineType.ts';
import { countryFromAddress, leadCountryFor, indiaStateFromAddress } from '../src/lib/leadCountry.ts';
import { resolveGeoBias, qualifierInfo, normCountry } from '../supabase/functions/_shared/geobias.ts';
import { qualifyPlace, placeSuffixForCountry } from '../src/lib/seedGuard.ts';
import { sendWindowForDigits, windowOpenForDigits, anyWindowOpen, INDIA_SEND_WINDOW, LONDON_SEND_WINDOW } from '../src/lib/sendWindow.ts';
import { salesAddPayload } from '../src/lib/salesAddPayload.ts';
import { queuedLeadLine } from '../src/lib/queueLine.ts';
import { nameMatches } from '../src/lib/nameMatch.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/* The UK rule as it stood in all four copies before 2026-09-28 — kept here verbatim so the new leaf is
   proven identical on UK input, not merely "similar". */
function legacyToWhatsAppNumber(raw: string, country?: string | null): string | null {
  let s = (raw || '').replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return s.slice(1).replace(/\D/g, '') || null;
  const cc = (country || 'UK').toUpperCase();
  if (s.startsWith('0')) {
    if (cc === 'UK' || cc === 'GB') return '44' + s.slice(1);
    return s.replace(/\D/g, '');
  }
  return s.replace(/\D/g, '') || null;
}

console.log('\n── +91: every stored form of an Indian number reaches WhatsApp as 91… ──');
for (const [raw, want] of [
  ['+91 98765 43210', '919876543210'], ['98765 43210', '919876543210'], ['098765 43210', '919876543210'],
  ['+919876543210', '919876543210'], ['0091 98765 43210', '919876543210'], ['919876543210', '919876543210'],
  ['080 2345 6789', '918023456789'],
] as const) ok(toWhatsAppDigits(raw, 'India') === want, `India "${raw}" → ${want} (got ${toWhatsAppDigits(raw, 'India')})`);
ok(toWhatsAppDigits('+91 98765 43210', 'UK') === '919876543210', 'a +91 number on a lead labelled UK keeps its own code — no 44 rewrite');
ok(toWhatsAppDigits('+91 98765 43210', null) === '919876543210', '…and on a lead with no country');
ok(!/^44/.test(toWhatsAppDigits('098765 43210', 'India') ?? ''), 'an India lead\'s 0… number is never turned into a UK 44… number');

console.log('\n── UK +44: the new leaf is identical to the old rule on every UK input ──');
const ukInputs = ['07700 900123', '+44 7700 900123', '0044 7700 900123', '447700900123', '01632 960001', '+44 (0)20 7946 0000', '', ' ', '-', '+', '7700900123', '(01234) 567890'];
for (const c of ['UK', 'GB', null, undefined, 'USA', 'Australia']) {
  const diffs = ukInputs.filter((r) => toWhatsAppDigits(r, c as string | null) !== legacyToWhatsAppNumber(r, c as string | null));
  ok(diffs.length === 0, `country ${String(c)}: identical on ${ukInputs.length} inputs${diffs.length ? ' — differs on ' + JSON.stringify(diffs) : ''}`);
}
ok(toWhatsAppDigits('07700 900123', 'UK') === '447700900123', 'UK 07… → 447… (unchanged)');

console.log('\n── one rule: every copy delegates to src/lib/waNumber.ts ──');
ok(/return toWhatsAppDigits\(raw, country\);/.test(read('supabase/functions/_shared/whatsapp-send.ts')), '_shared/whatsapp-send.ts toWhatsAppNumber delegates');
ok(/return toWhatsAppDigits\(raw, country\);/.test(read('supabase/functions/process-whatsapp-queue/index.ts')), 'the queue\'s mirror delegates');
ok(/return toWhatsAppDigits\(raw, country\);/.test(read('src/hooks/useInbox.ts')), 'useInbox normalizeWaNumber delegates');
ok(/return toWhatsAppDigits\(raw, country\);/.test(read('src/hooks/useColdCallPlaybook.ts')), 'useColdCallPlaybook waDigits delegates');
ok(/formatPhoneForWhatsApp\(l\.phone, l\.country\)/.test(read('src/components/OutreachTable.tsx')), 'the queue-suppression key passes the lead\'s country');

console.log('\n── a typed number is stored the way Google stores one; line type ──');
ok(internationalPhone('98765 43210', 'India') === '+91 98765 43210', '"98765 43210" (India) → "+91 98765 43210"');
ok(internationalPhone('098765 43210', 'India') === '+91 98765 43210', '"098765 43210" (India) → "+91 98765 43210"');
ok(internationalPhone('+91 98765 43210', 'India') === '+91 98765 43210', 'already international: unchanged');
ok(internationalPhone('+44 7700 900123', 'India') === null, 'a UK number typed on an India lead is refused, not relabelled');
ok(internationalPhone('12345', 'India') === null, 'an invalid number answers null');
ok(classifyLineType('+91 98765 43210', 'India').lineType === 'mobile' && classifyLineType('+91 98765 43210', 'India').whatsappEligible, 'an Indian mobile is WhatsApp-eligible');
ok(classifyLineType('+91 80 2345 6789', 'India').lineType === 'landline', 'a Bengaluru landline is classified landline (not queued)');
ok(classifyLineType('07911 123456', 'UK').lineType === 'mobile' && classifyLineType('07700 900123', 'UK').lineType === 'unknown', 'UK unchanged (07911 mobile; the 07700 900 drama range stays unknown/eligible)');

console.log('\n── country from Google\'s address, not the hidden form choice ──');
ok(countryFromAddress('12, MG Road, Pune, Maharashtra 411001, India') === 'India', 'Pune address → India');
ok(countryFromAddress('120 Gloucester Ave, Grimsby DN34 5BT, UK') === 'UK', 'Grimsby address → UK');
ok(countryFromAddress('1 Main St, Tampa, FL 33602, USA') === 'USA', 'Tampa address → USA');
ok(countryFromAddress('Pune') === null && countryFromAddress(null) === null && countryFromAddress('Somewhere, Atlantis') === null, 'no address / unknown country → null (never guessed)');
ok(leadCountryFor('120 Gloucester Ave, Grimsby DN34 5BT, UK', 'USA') === 'UK', 'a UK address on a search labelled USA stores UK (the 349-row bug)');
ok(leadCountryFor(null, 'India') === 'India', 'no address → the search\'s country');
ok(indiaStateFromAddress('12, MG Road, Pune, Maharashtra 411001, India') === 'Maharashtra', 'state read from the address: Maharashtra');
ok(indiaStateFromAddress('Sector 29, Gurugram, Haryana 122001, India') === 'Haryana', '…Haryana');
ok(indiaStateFromAddress('120 Gloucester Ave, Grimsby DN34 5BT, UK') === null, 'no state for a UK address');
{
  const base = { lead: { id: 'p1', name: 'Smile Dental', googleMapsUrl: 'https://maps.google.com/?cid=1' }, email: null, searchKeyword: 'dentist', searchLocation: 'Pune, India', listType: 'no_website', campaignId: null };
  const p = salesAddPayload({ ...base, country: 'UK', details: { phone: '+91 98765 43210', address: '12, MG Road, Pune, Maharashtra 411001, India', derivedTown: 'Pune', townNote: null } });
  ok(p.country === 'India' && p.phone === '+91 98765 43210' && p.derived_town === 'Pune', 'Sales add (Find Leads): India lead carries country India, +91 phone, town Pune — even if the form said UK');
  const u = salesAddPayload({ ...base, country: 'UK', details: { phone: '+44 7700 900123', address: '1 High St, Wisbech PE13 1AA, UK', derivedTown: 'Wisbech', townNote: null } });
  ok(u.country === 'UK', 'Sales add (Find Leads): UK lead still UK');
  const n = salesAddPayload({ ...base, country: 'India', details: null });
  ok(n.country === 'India', 'Sales add: a failed lookup keeps the search\'s country');
}
ok(/countryFromAddress\(details\.address\)/.test(read('src/hooks/useOutreach.ts')) && /updates\.country = addressCountry/.test(read('src/hooks/useOutreach.ts')), 'Admin add: the Place Details write stores the address\'s country');
ok(/resolvedCountry: countryFromAddress\(debug\.resolvedLocation/.test(read('supabase/functions/search-leads/index.ts')), 'search-leads reports the country Google resolved');
ok(/data\.resolvedCountry/.test(read('src/contexts/LeadSearchContext.tsx')), '…and Find Leads stores it on the search the adds read');
ok(/data-testid="find-leads-country"/.test(read('src/components/SearchForm.tsx')), 'Find Leads shows the country it searches (no hidden setting)');

console.log('\n── Find Leads geocode bias: India scoped to India, UK unchanged ──');
ok(resolveGeoBias('Pune', 'India') === 'IN' && resolveGeoBias('Kochi', 'India') === 'IN' && resolveGeoBias('Gurugram', 'India') === 'IN', 'a bare Indian city with country India → IN bias (was GB)');
ok(normCountry('India') === 'IN', 'normCountry("India") → IN');
ok(qualifierInfo('Pune, India').country === 'IN', '"Pune, India" is recognised as India (wrong-country guard active)');
ok(qualifierInfo('Bengaluru, Karnataka').country === 'IN' && qualifierInfo('Bengaluru, Karnataka').appendCountry === 'India', '"Bengaluru, Karnataka" → India, appended');
ok(qualifierInfo('Kochi, Keralam, India').country === 'IN' && qualifierInfo('Kochi, Keralam').appendCountry === 'India', 'Google\'s own spelling "Keralam" is recognised');
ok(qualifierInfo('Lahore, Punjab').country === null, 'Punjab alone does not force India (Pakistan has one)');
for (const [loc, c, want] of [['Reading', 'UK', 'GB'], ['Reading', undefined, 'GB'], ['Manchester', 'UK', 'GB'], ['Washington', undefined, 'GB'], ['Reading, Berkshire', 'UK', null], ['Reading', 'USA', 'US'], ['Sydney', 'Australia', 'AU']] as const)
  ok(resolveGeoBias(loc, c) === want, `UK/other unchanged: ${loc} (${String(c)}) → ${String(want)}`);
{
  const sl = read('supabase/functions/search-leads/index.ts');
  ok(/keyBias && keyBias !== 'GB' \? `\$\{location\}##\$\{keyBias\}` : location/.test(sl), 'a non-GB bias is part of the results cache key; a GB one adds nothing (UK keys unchanged)');
}

console.log('\n── Hook Audit: "Pune India", never "Pune UK"; UK wording unchanged ──');
ok(placeSuffixForCountry('India') === 'India' && placeSuffixForCountry('UK') === 'UK' && placeSuffixForCountry(null) === 'UK' && placeSuffixForCountry('Narnia') === 'UK', 'suffix: India → India; UK, blank, unknown → UK (as before)');
{
  const q = ['Who are the best dentists in Pune?', 'dental clinic in Pune for root canal', 'emergency dentist Pune India'];
  const r = qualifyPlace(q, 'Pune', placeSuffixForCountry('India')).questions;
  ok(r[0] === 'Who are the best dentists in Pune India?' && r[1] === 'dental clinic in Pune India for root canal', 'India questions pinned with India');
  ok(r[2] === 'emergency dentist Pune India', 'never "Pune India India" (idempotent)');
  ok(!r.some((x) => /\bUK\b/.test(x)), 'no "UK" in an India question');
  const u = qualifyPlace(['locksmith in Wisbech', 'locksmith Wisbech UK'], 'Wisbech');
  const u2 = qualifyPlace(['locksmith in Wisbech', 'locksmith Wisbech UK'], 'Wisbech', placeSuffixForCountry('UK'));
  ok(u.questions[0] === 'locksmith in Wisbech UK' && u.questions[1] === 'locksmith Wisbech UK' && JSON.stringify(u) === JSON.stringify(u2), 'UK questions exactly as before');
}
{
  const cai = read('supabase/functions/create-ai-audit/index.ts');
  ok((cai.match(/qualifyPlace\([^)]*placeSuffixForCountry\(country\)\)/g) ?? []).length === 2 && !/qualifyPlace\((localised|spread)\.questions, town\)/.test(cai), 'both create-ai-audit call sites pass the lead\'s country');
  ok(/abroadQ && locationText && !mentionsCountryWord\(locationText, abroadQ\)/.test(cai), 'the generator prompt names the place "Pune India" for an India lead');
  ok(/\$\{locationText\} UK`/.test(cai), '…and still "<town> UK" for a UK lead');
}

console.log('\n── Send window: India lead → India hours, UK lead → UK hours ──');
const at = (iso: string) => new Date(iso);
ok(sendWindowForDigits('919876543210') === INDIA_SEND_WINDOW && sendWindowForDigits('447700900123') === LONDON_SEND_WINDOW && sendWindowForDigits(null) === LONDON_SEND_WINDOW, 'window chosen from the destination digits; anything not +91 is London');
// 2026-09-28 is BST (UTC+1); IST is UTC+5:30.
ok(windowOpenForDigits('919876543210', at('2026-09-28T04:30:00Z')) === true, 'India lead at 10:00 IST (05:30 London) → open');
ok(windowOpenForDigits('447700900123', at('2026-09-28T04:30:00Z')) === false, 'UK lead at 05:30 London → closed (unchanged)');
ok(windowOpenForDigits('919876543210', at('2026-09-28T13:29:00Z')) === true && windowOpenForDigits('919876543210', at('2026-09-28T13:30:00Z')) === false, 'India closes at 19:00 IST exactly');
ok(windowOpenForDigits('919876543210', at('2026-09-28T17:00:00Z')) === false, 'India lead at 22:30 IST (18:00 London) → held, although London is open');
ok(windowOpenForDigits('447700900123', at('2026-09-28T17:00:00Z')) === true, 'UK lead at 18:00 London → open (unchanged)');
ok(windowOpenForDigits('447700900123', at('2026-09-28T06:00:00Z')) === true && windowOpenForDigits('447700900123', at('2026-09-28T05:59:00Z')) === false, 'UK opens at 07:00 London (BST)');
ok(windowOpenForDigits('447700900123', at('2026-09-28T20:29:00Z')) === true && windowOpenForDigits('447700900123', at('2026-09-28T20:30:00Z')) === false, 'UK closes at 21:30 London (BST)');
ok(windowOpenForDigits('447700900123', at('2026-12-01T07:00:00Z')) === true && windowOpenForDigits('447700900123', at('2026-12-01T06:59:00Z')) === false, 'UK in GMT: 07:00 London is 07:00 UTC');
ok(anyWindowOpen(at('2026-09-28T04:30:00Z')) && !anyWindowOpen(at('2026-09-28T22:00:00Z')), 'the tick runs while either window is open, and not at 23:00 London / 03:30 IST');
{
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(/const WINDOW_START = 7;/.test(q) && /const WINDOW_END_MIN = 21 \* 60 \+ 30;/.test(q), 'the London constants are unchanged');
  ok(/if \(!anyWindowOpen && !force\) return json\(\{ ok: true, skipped: "outside_window"/.test(q), 'the outer gate opens for either window');
  ok(/const scanned = scannedAll\.filter\(leadWindowOpen\);[\s\S]{0,400}const candidates = interleaveByCampaign\(scanned\)\.slice\(0, QUEUE_LOOKAHEAD\)/.test(q), 'opener lane: held leads are filtered BEFORE the fair order and look-ahead slice');
  ok(/const hookLead = \(\(hookRows \?\? \[\]\)[^\n]*\.find\(leadWindowOpen\)/.test(q) && /const contactLead = \(\(contactRows \?\? \[\]\)[^\n]*\.find\(leadWindowOpen\)/.test(q), 'hook and contact lanes take the oldest lead whose own window is open');
  // 2026-09-29: the same London-window condition, now also held by the paid-action pause (docs/abuse-cost-protection.md).
  ok(/if \(\(windowOpen \|\| force\) && auditAheadMode === "running"\) try \{/.test(q), 'audit-ahead still runs only in the London window (UK spend unchanged)');
  ok(/windowOpenForDigits\(toWhatsAppNumber\(/.test(q) && !/leadWindowOpen[^\n]*\.country\b(?![^\n]*toWhatsAppNumber)/.test(q), 'the window is chosen from the send digits, not from the country column');
  ok(/indiaWindowOpen: sendWindowOpen\(INDIA_SEND_WINDOW\)/.test(q), 'queue_state reports the India window');
}
ok(/10am IST/.test(queuedLeadLine({ paused: false, windowOpen: true, windowStartHour: 7, indiaWindowOpen: false }, '+91 98765 43210').text), 'an Indian lead\'s queued line says India hours, not "sending now" while London is open');
ok(queuedLeadLine({ paused: false, windowOpen: false, windowStartHour: 7, indiaWindowOpen: true }, '+44 7700 900123').text.includes('7am UK'), 'a UK lead\'s line is unchanged');
ok(queuedLeadLine({ paused: true, windowOpen: true, windowStartHour: 7, indiaWindowOpen: true }, '+91 98765 43210').tone === 'paused', 'paused still outranks everything');

console.log('\n── Sales can queue an Indian mobile; UK rule unchanged ──');
{
  const m = read('supabase/migrations/20260929010000_sales_queue_opener_india.sql');
  ok(m.includes("elsif not ((coalesce(v_lead.country, 'UK') = 'UK' and v_pk ~ '^7[0-9]{9}$') or v_pk ~ '^91[6-9][0-9]{9}$') then v_reason := 'not_a_uk_mobile';"), 'the one changed line: UK mobile as before, OR an Indian mobile by number');
  ok(!m.includes("<> 'UK' or v_pk !~"), 'the old UK-only line is gone from the new definition');
  for (const g of ["'not_yours'", "'archived'", "'client'", "'not_new'", "'already_contacted'", "'opted_out'", "'daily_limit'", "'no_phone'"]) ok(m.includes(g), `…every other guard kept: ${g}`);
  ok(/'not a UK or Indian mobile'/.test(read('src/lib/salesCrm.ts')), 'the refusal reads "not a UK or Indian mobile"');
}

console.log('\n── Dedupe: names never collide across countries; place id stays the identity ──');
{
  const o = read('src/hooks/useOutreach.ts');
  ok(/const sameCountry = \(c: string \| null \| undefined\) => \(c \|\| 'UK'\) === \(country \|\| 'UK'\);/.test(o), 'one sameCountry rule (null = the UK default)');
  ok(/\(h\.business_name === lead\.name && sameCountry\(h\.country\)\) \|\| \(lead\.googleMapsUrl && h\.google_maps_url === lead\.googleMapsUrl\)/.test(o), 'history pre-filter: name within the country, Maps URL country-blind');
  ok(/nameQ\.or\('country\.is\.null,country\.eq\.UK'\)/.test(o) && /nameQ\.eq\('country', country\)/.test(o), 'database name check scoped to the country');
  ok(/\.eq\('place_id', lead\.id\)\.limit\(1\)\.maybeSingle\(\)/.test(o), 'place id check unchanged and first');
  ok(/select\('id, business_name, google_maps_url, country'\)/.test(o), 'the history read carries the country');
}

console.log('\n── Add a lead (Sales + Admin share it) asks for the country ──');
{
  const d = read('src/components/AddLeadDialog.tsx');
  ok(!/country: 'UK', address/.test(d) && /country: f\.country, address/.test(d), 'no hard-coded UK; the chosen country is sent');
  ok(/data-testid="add-lead-country"/.test(d) && /value: 'India'/.test(d) && /country: 'UK', businessName/.test(d), 'a Country field, UK by default, India offered');
  ok(/if \(f\.country !== 'UK' && f\.phone\.trim\(\)\)/.test(d) && /internationalPhone\(f\.phone, f\.country\)/.test(d), 'a non-UK number is stored in international form; a UK one exactly as typed');
}

console.log('\n── Free-check / backfill place resolver sends a real region code ──');
ok(/regionCode: normCountry\(country \?\? "UK"\) \?\? "GB"/.test(read('supabase/functions/_shared/place-resolve.ts')), 'regionCode via normCountry (India → IN; UK → GB as before)');

console.log('\n── Naming: a title is not a name (live Jaipur hook, 2026-09-28) ──');
{
  const ctx = { trade: 'lawyer', town: 'Jaipur' };
  const rival = 'Top picks: **Advocate Hemant Sharma:** frequently recommended for civil matters. Advocate Shruti Goyal handles family law.';
  ok(!nameMatches(rival, 'Advocate Umesh Sharma', ctx), '"Advocate Umesh Sharma" is NOT named by an answer about other advocates (was 6/6)');
  ok(nameMatches('You could try Advocate Umesh Sharma in Jaipur.', 'Advocate Umesh Sharma', ctx), '…and IS named when the answer names him');
  ok(nameMatches('Umesh Sharma is a well-regarded advocate.', 'Umesh Sharma Advocate', ctx), 'a name with the title last still matches its core');
  ok(nameMatches('Try MC Locksmiths centre, they are quick.', 'MCLocksmiths centre', { trade: 'locksmith', town: 'Canterbury' }), 'UK unchanged: the lone-token rule still names MCLocksmiths');
}

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
