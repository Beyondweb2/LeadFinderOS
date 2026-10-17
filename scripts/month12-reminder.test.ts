/* THE PAYMENT-12 REMINDER (v5 clause 9A.5, 2026-10-17) — src/lib/month12Reminder.ts + finalPaymentDates.ts.
   Real agreement texts (v3 / v4 / v5 templates), fast-forwarded days, every "no", the email's words. */
import { readFileSync } from 'node:fs';
import { versionTemplateText, agreementVersion } from '../src/lib/clientAgreement.ts';
import { addMonthsClamped, addDays, type TimelineFacts } from '../src/lib/clientTimeline.ts';
import { finalPaymentDates, MONTH12_REMINDER_LEAD_DAYS } from '../src/lib/finalPaymentDates.ts';
import {
  MONTH12_PROMISE_SENTENCE, signedAgreementPromisesReminder, month12ReminderVerdict, month12ReminderEmail, type Month12Input,
} from '../src/lib/month12Reminder.ts';
import { FINDABLE_CONTINUING_GBP } from '../src/lib/findableOffer.ts';

let fails = 0;
const ok = (c: unknown, label: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${label}`); };

console.log('── 1. which signed agreements promise it ──');
const v5 = versionTemplateText('v5'), v4 = versionTemplateText('v4'), v3 = versionTemplateText('v3');
const clause = (v: string, n: string) => agreementVersion(v).body.find((b) => b.kind === 'clause' && (b as { num?: string }).num === n) as { text: string } | undefined;
ok(clause('v5', '9A.5')?.text.endsWith(MONTH12_PROMISE_SENTENCE), 'v5 9A.5 ends with the promise, word for word');
ok(signedAgreementPromisesReminder(v5), 'the v5 text promises the payment-12 reminder');
ok(!signedAgreementPromisesReminder(v4), 'v4 does not (its 9A.5 has no reminder)');
ok(!signedAgreementPromisesReminder(v3), 'v3 does not (its 9A.3 reminder is a different promise, not sent from here)');
ok(!signedAgreementPromisesReminder(null) && !signedAgreementPromisesReminder(''), 'no signed text → never sent');
ok(signedAgreementPromisesReminder(v5.replace(/\n/g, '\r\n').replace(/ /g, '  ')), 'whitespace / line endings do not hide it');

console.log('── 2. the dates (one rule, reusable for the handover) ──');
// Payment Start 2026-01-15 (results 2025-12-31 + 15). Payment 12 = 11th monthly = anchor + 10 months.
const base: TimelineFacts = { terms: 'csa_v5_option_b', route: 'build', initialPaidAt: '2025-11-20T10:00:00Z', accessDate: '2025-12-01',
  resultsSentAt: '2025-12-31T12:00:00Z', guaranteeCeasedAt: null, recurringPaidAt: [] };
const paidN = (n: number, first = '2026-01-15') => Array.from({ length: n }, (_, i) => `${addMonthsClamped(first, i)}T10:00:00Z`);
const d0 = finalPaymentDates(base)!;
ok(d0 && d0.finalPaymentDay === '2026-11-15' && !d0.finalPaymentActual, `no monthly yet: payment 12 expected 2026-11-15 — got ${d0?.finalPaymentDay}`);
ok(d0.reminderFromDay === addDays('2026-11-15', -MONTH12_REMINDER_LEAD_DAYS) && d0.reminderLastDay === '2026-11-14', 'reminder window: 30 days before → the day before payment 12');
ok(d0.ownershipTransferDay === null, 'ownership transfer day unknown until payment 12 is actually taken');
const d10 = finalPaymentDates({ ...base, recurringPaidAt: paidN(10) })!;
ok(d10.finalPaymentDay === '2026-11-15' && !d10.finalPaymentActual, '10 monthlies paid: payment 12 still expected 2026-11-15');
const d11 = finalPaymentDates({ ...base, recurringPaidAt: paidN(11) })!;
ok(d11.finalPaymentActual && d11.ownershipTransferDay === '2026-11-15', 'all 11 monthlies: payment 12 actual, ownership day known');
const late = finalPaymentDates({ ...base, recurringPaidAt: [...paidN(9), '2026-10-28T10:00:00Z'] })!;
ok(late.finalPaymentDay === '2026-11-28', `a late 11th payment moves payment 12 (and the reminder) with it — got ${late.finalPaymentDay}`);
ok(finalPaymentDates({ ...base, route: null }) === null && finalPaymentDates({ ...base, resultsSentAt: null, guaranteeCeasedAt: null }) === null, 'unknown → null, never a guessed date');

console.log('── 3. who is sent it, fast-forwarded ──');
const input = (o: Partial<Month12Input> = {}, f: Partial<TimelineFacts> = {}): Month12Input => ({
  facts: { ...base, recurringPaidAt: paidN(10), ...f }, agreedText: v5, notifyEmail: 'paul@move37.fun', subscriptionStatus: 'active', alreadyRecorded: false, ...o,
});
const at = (day: string, i = input()) => month12ReminderVerdict(i, `${day}T09:00:00Z`);
ok(!at('2026-10-15').send && (at('2026-10-15') as { reason: string }).reason === 'too_early', '31 days before: not yet');
ok(at('2026-10-16').send, '30 days before: sent');
ok(at('2026-11-14').send, 'the day before payment 12: sent');
ok((at('2026-11-15') as { reason: string }).reason === 'too_late', 'on the payment-12 day: never (it must be BEFORE)');
ok((at('2026-12-01') as { reason: string }).reason === 'too_late', 'after payment 12 is due: never');
ok((at('2026-11-01', input({}, { recurringPaidAt: paidN(11) })) as { reason: string }).reason === 'payment12_made', 'payment 12 already taken: never');
ok((at('2026-11-01', input({ agreedText: v4 })) as { reason: string }).reason === 'no_promise', 'a v4 signer: never');
ok((at('2026-11-01', input({ agreedText: v3 }, { terms: 'csa_v3_option_b' })) as { reason: string }).reason === 'no_promise', 'a v3 signer: never');
ok((at('2026-11-01', input({ subscriptionStatus: 'canceled' })) as { reason: string }).reason === 'cancelled', 'cancelled subscription: never');
ok((at('2026-11-01', input({}, { endedAt: '2026-09-01T00:00:00Z' })) as { reason: string }).reason === 'ended', 'service ended: never');
ok((at('2026-11-01', input({}, { refundedAt: 'refunded' })) as { reason: string }).reason === 'refunded', 'refunded: never');
ok((at('2026-11-01', input({ alreadyRecorded: true })) as { reason: string }).reason === 'already_sent', 'already reminded: never twice');
ok((at('2026-11-01', input({}, { continuingDecision: 'continue' })) as { reason: string }).reason === 'decided', 'opt-in already recorded: not needed');
ok((at('2026-11-01', input({}, { route: 'optimise' })) as { reason: string }).reason === 'not_build', 'not Build: never');
ok((at('2026-11-01', input({ notifyEmail: 'not an email' })) as { reason: string }).reason === 'no_email', 'no valid email for notices: not sent');
const sent = at('2026-11-01');
ok(sent.send && sent.to === 'paul@move37.fun' && sent.dates.finalPaymentDay === '2026-11-15', 'sent to the Email for notices, naming payment 12');

console.log('── 4. the words match the signed v5 text ──');
const m = month12ReminderEmail({ businessName: 'ZZ QA Build', payment12Day: '2026-11-15' });
ok(/remind/.test(m.text) && /before payment 12/.test(m.text) && /opt in/.test(m.text), 'it is the reminder before payment 12 that they can opt in (9A.5)');
ok(m.text.includes(`£${FINDABLE_CONTINUING_GBP} a month`) && /does not automatically continue after payment 12/.test(m.text), 'the optional £29.99 service; Build does not continue automatically (9A.2)');
ok(/hosting, reasonable technical maintenance and small routine updates/.test(m.text), 'what it includes, in 9A.3\'s words');
ok(/30 days notice/.test(m.text) && /up to 30 days after the minimum term/.test(m.text), 'cancel on 30 days (9A.4); live up to 30 days if not (9A.5)');
ok(/transfers to you/.test(m.text), 'the website transfers on final payment (8.4)');
ok(!/continues at|will continue|automatically renew|£29\.99 continues/i.test(m.text), 'never says the £29.99 continues');
ok(/15 November 2026/.test(m.text) && /ZZ QA Build/.test(m.subject), 'names the payment-12 day and the business');

console.log('── 5. the server half ──');
const shared = readFileSync('supabase/functions/_shared/month12-reminder.ts', 'utf8');
const fn = readFileSync('supabase/functions/month12-reminder/index.ts', 'utf8');
const sql = readFileSync('supabase/migrations/20261106090000_month12_reminder.sql', 'utf8');
ok(/from\("month12_reminders"\)\.insert\(/.test(shared) && shared.indexOf('month12_reminders").insert(') < shared.indexOf('sendAccessDateEmail(v.to'), 'the row is CLAIMED before the email is sent');
ok(/lead_id uuid primary key/.test(sql), 'one row per client, ever (primary key)');
ok(/qaEmailHold\(service, c\.leadId, v\.to\)/.test(shared) && /if \(!c \|\| c\.isQa\) continue;/.test(shared), 'QA: the scheduled run skips QA leads; every send asks qaEmailHold');
ok(/if \(!\(await remindersEnabled\(service\)\)\) return \{ enabled: false/.test(shared) && /enabled boolean not null default false/.test(sql), 'kill switch: off by default, run sends nothing while off');
ok(/if not coalesce\(\(select enabled from public\.month12_reminder_settings/.test(sql), '…and the cron invoker does not even post while off');
const dry = shared.slice(shared.indexOf('export async function dryRun'), shared.indexOf('/* ── RUN / DRILL'));
ok(!/\.insert\(|\.update\(|\.upsert\(|sendOperatorAlert|sendAccessDateEmail/.test(dry), 'the dry run writes and sends nothing');
ok(/x-cron-secret/.test(fn) && /not_authorised/.test(fn), 'internal only (CRON_SECRET)');
ok(/\[functions\.month12-reminder\]\r?\nverify_jwt = false/.test(readFileSync('supabase/config.toml', 'utf8')), 'config.toml entry in the same commit');

if (fails) { console.log(`\n${fails} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
