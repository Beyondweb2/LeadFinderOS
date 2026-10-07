/* ============================================================
   COLD WHATSAPP OUTREACH IS UK-ONLY (2026-10-15). India removed from active outreach; Australia stays supported
   for search / phone handling / AI checks but its cold WhatsApp stays OFF.

   Pins the PROPERTY (the destination digits), not an identifier:
     · isUkColdDestination accepts a UK mobile only — India, Australia, a UK landline, junk and null are refused;
     · a historical India number still normalises (replies, Inbox matching) and so does an Australian one —
       normalising a number is not permission to cold-message it;
     · the queue and send-whatsapp-message both refuse a cold template to a non-UK destination, on any country
       label, and a continuation template is not blocked by it;
     · no India send window and no India line anywhere in the queue path.

   Run: npx tsx scripts/outreach-uk-only.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { isUkColdDestination, NOT_A_UK_MOBILE } from '../src/lib/ukColdDestination.ts';
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';
import { isColdOutreachTemplate } from '../src/lib/coldOutreach.ts';
import { windowOpenForDigits } from '../src/lib/sendWindow.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log('\n── the property: only a UK mobile may receive a cold WhatsApp ──');
ok(NOT_A_UK_MOBILE === 'not_a_uk_mobile', 'the reason code is the unchanged stored token');
for (const raw of ['07700 900123', '+44 7911 123456', '0044 7911 123456', '447700900123']) {
  ok(isUkColdDestination(toWhatsAppDigits(raw, 'UK')), `UK mobile "${raw}" → allowed`);
}
ok(isUkColdDestination(toWhatsAppDigits('07700 900123', null)), 'a UK mobile on a lead with no country → allowed');
ok(isUkColdDestination(toWhatsAppDigits('+44 7700 900123', 'USA')), 'a UK mobile on a mislabelled lead → allowed (the digits decide, not the country column)');
for (const [raw, c] of [['+91 98765 43210', 'India'], ['098765 43210', 'India'], ['+91 98765 43210', 'UK'], ['+91 98765 43210', null]] as const) {
  ok(!isUkColdDestination(toWhatsAppDigits(raw, c)), `India "${raw}" (${String(c)}) → refused`);
}
for (const [raw, c] of [['0412 345 678', 'Australia'], ['+61 412 345 678', 'Australia'], ['+61 412 345 678', 'UK']] as const) {
  ok(!isUkColdDestination(toWhatsAppDigits(raw, c)), `Australia "${raw}" (${String(c)}) → refused (Australian cold WhatsApp stays off)`);
}
for (const bad of ['441632960001', '442079460000', '+14155550100', '353861234567', '4477009001', '44770090012345', '', ' ', null, undefined]) {
  ok(!isUkColdDestination(bad as string | null | undefined), `not a UK mobile: ${JSON.stringify(bad)} → refused (a landline, another country, junk or absent is never allowed)`);
}

console.log('\n── normalisation is preserved (historical replies), but it is not permission ──');
ok(toWhatsAppDigits('+91 98765 43210', 'India') === '919876543210' && toWhatsAppDigits('98765 43210', 'India') === '919876543210', 'a historical India number still normalises to 91…');
ok(toWhatsAppDigits('0412 345 678', 'Australia') === '61412345678' && toWhatsAppDigits('+61 412 345 678', 'Australia') === '61412345678', 'Australian numbers still normalise to 61…');
ok(toWhatsAppDigits('07700 900123', 'UK') === '447700900123', 'UK unchanged');

console.log('\n── no India send window ──');
{
  const at = (iso: string) => new Date(iso);
  ok(windowOpenForDigits('919876543210', at('2026-09-28T04:30:00Z')) === windowOpenForDigits('447700900123', at('2026-09-28T04:30:00Z')), 'a +91 number is read in exactly the same window as a UK one');
  const sw = read('src/lib/sendWindow.ts');
  ok(!/Asia\/Kolkata|INDIA_SEND_WINDOW/.test(sw), 'src/lib/sendWindow.ts has no India window');
  ok(!/indiaWindowOpen|isIndianNumber|IST/.test(read('src/lib/queueLine.ts') + read('src/lib/queueStatus.ts')), 'queueLine / queueStatus have no India line');
}

console.log('\n── the two cold-send chokepoints refuse a non-UK destination ──');
{
  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  const m = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(/isColdOutreachTemplate\(templateName\) && !isUkColdDestination\(toNumber\)/.test(q), 'process-whatsapp-queue: cold template + non-UK digits → skipped');
  ok(/skipped: NOT_A_UK_MOBILE/.test(q) && /whatsapp_delivery_status: NOT_A_UK_MOBILE/.test(q), '…with the reason on the row, never sent');
  ok(q.indexOf('!isUkColdDestination(toNumber)') < q.indexOf('await checkSuppressed(service, { phone: `+${toNumber}`'), '…and BEFORE suppression, history and the send');
  ok(/isColdOutreachTemplate\(templateName\) && !isUkColdDestination\(to\)/.test(m), 'send-whatsapp-message: cold template + non-UK digits → refused');
  const at = m.indexOf('!isUkColdDestination(to)');
  ok(!/allowResend/.test(m.slice(at, m.indexOf('}', m.indexOf('error: NOT_A_UK_MOBILE', at)))), '…not overridable by allow_resend');
  ok(at < m.indexOf('opener_contact_block'), '…and before the contact guard and the build');
}
ok(isColdOutreachTemplate('video_template') && isColdOutreachTemplate('initial_contact') && isColdOutreachTemplate('some_new_template') && !isColdOutreachTemplate('audit_reply'), 'the guard keys on isColdOutreachTemplate (unknown = cold; a reply into a live thread is a continuation and is not blocked)');

console.log('\n── no surface still names India as a current outreach market ──');
{
  const add = read('src/components/AddLeadDialog.tsx');
  ok(!/value: 'India'/.test(add) && !/\+91 98765/.test(add.replace(/\/\*[\s\S]*?\*\//g, '')), 'Add a lead does not offer India or show a +91 example');
  const lp = read('src/lib/locationPicker.ts');
  ok(!/value: 'India'[^\n]*primary: true/.test(lp) && /value: 'India'[^\n]*primary: false/.test(lp), 'India is not a primary Find Leads country (still searchable under the others)');
  ok(!/UK (or|and|\+) Ind/i.test(read('src/lib/whatsNew.ts') + read('src/lib/salesCrm.ts') + read('src/lib/campaignRules.ts')), 'no "UK and India" / "UK or Indian" wording on an active surface');
  const mig = read('supabase/migrations/20261015090000_outreach_uk_only.sql').replace(/--[^\n]*/g, '');
  ok(!/\^91/.test(mig) && (mig.match(/\^7\[0-9\]\{9\}/g) ?? []).length === 2, 'the migration is UK-only in both functions');
}

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
