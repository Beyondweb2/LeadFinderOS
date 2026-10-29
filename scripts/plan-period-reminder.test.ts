/* THE PLAN-PERIOD REMINDER (v6 clause 9A.5, 2026-10-29) — src/lib/planPeriodReminder.ts.
   Real agreement texts (v5 / v6 templates), fast-forwarded days, every "no", the email's words, the server's guards. */
import { readFileSync } from 'node:fs';
import { versionTemplateText, agreementVersion } from '../src/lib/clientAgreement.ts';
import { addMonthsClamped, minimumTerm, type TimelineFacts } from '../src/lib/clientTimeline.ts';
import { signedAgreementPromisesReminder } from '../src/lib/month12Reminder.ts';
import {
  PLAN_PERIOD_PROMISE_SENTENCE, PLAN_PERIOD_REMINDER_LEAD_DAYS, signedAgreementPromisesPlanPeriodReminder, planPeriodEnd,
  planPeriodReminderVerdict, planPeriodReminderEmail, type PlanPeriodInput,
} from '../src/lib/planPeriodReminder.ts';
import { FINDABLE_CONTINUING_GBP } from '../src/lib/findableOffer.ts';

let fails = 0;
const ok = (c: unknown, label: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${label}`); };

console.log('── 1. which signed agreements promise it ──');
const v6 = versionTemplateText('v6'), v5 = versionTemplateText('v5'), v4 = versionTemplateText('v4');
const clause = (v: string, n: string) => agreementVersion(v).body.find((b) => b.kind === 'clause' && (b as { num?: string }).num === n) as { text: string } | undefined;
ok(clause('v6', '9A.5')?.text.endsWith(PLAN_PERIOD_PROMISE_SENTENCE), 'v6 9A.5 ends with the promise, word for word');
ok(signedAgreementPromisesPlanPeriodReminder(v6), 'the v6 text promises the Plan Period reminder');
ok(!signedAgreementPromisesPlanPeriodReminder(v5) && !signedAgreementPromisesPlanPeriodReminder(v4), 'v5 / v4 do not (v5 is fn month12-reminder)');
ok(!signedAgreementPromisesReminder(v6), 'the v5 payment-12 reminder never matches v6 — no client gets both');
ok(!signedAgreementPromisesPlanPeriodReminder(null) && !signedAgreementPromisesPlanPeriodReminder(''), 'no signed text → never sent');

console.log('── 2. when the Plan Period ends ──');
const base: TimelineFacts = { terms: 'csa_v6_option_b', route: 'build', initialPaidAt: '2026-11-01T10:00:00Z', accessDate: '2026-11-05',
  resultsSentAt: '2026-12-03T12:00:00Z', guaranteeCeasedAt: null, recurringPaidAt: [] };
const paidN = (n: number, first = '2026-12-18') => Array.from({ length: n }, (_, i) => `${addMonthsClamped(first, i)}T10:00:00Z`);
// Payment Start = results 2026-12-03 + 15 = 2026-12-18. 6 months: 5 monthlies → final = anchor + 4 months.
const six = planPeriodEnd('six', base, null)!;
ok(six && six.endDay === '2027-04-18' && !six.ended, `6 months: final payment expected 2027-04-18 — got ${six?.endDay}`);
ok(six.reminderFromDay === '2027-03-19' && six.reminderLastDay === '2027-04-17', `window: ${PLAN_PERIOD_REMINDER_LEAD_DAYS} days before → the day before`);
const sixDone = planPeriodEnd('six', { ...base, recurringPaidAt: paidN(5) }, null)!;
ok(sixDone.ended && sixDone.endDay === '2027-04-18', '6 months: all 5 monthlies taken → the Plan Period has ended');
const twelve = planPeriodEnd('twelve', base, null)!;
ok(twelve.endDay === '2027-10-18', `12 months: 11 monthlies → final 2027-10-18 — got ${twelve.endDay}`);
ok(minimumTerm(base).finalPaymentDay === '2027-10-18', 'the route default (Build, 11) is unchanged for every other caller');
const full = planPeriodEnd('full', base, '2026-12-10T15:00:00Z')!;
ok(full.endDay === '2027-06-10' && !full.ended, `pay in full: go-live + 6 months — got ${full?.endDay}`);
ok(planPeriodEnd('full', base, null) === null, 'pay in full with no go-live day → no date (never a guess)');
ok(planPeriodEnd('legacy_twelve', base, null) === null && planPeriodEnd(null, base, null) === null, 'old plan / no plan → not this reminder');

console.log('── 3. who is sent it, fast-forwarded ──');
const input = (o: Partial<PlanPeriodInput> = {}, f: Partial<TimelineFacts> = {}): PlanPeriodInput => ({
  facts: { ...base, ...f }, plan: 'full', agreedText: v6, notifyEmail: 'paul@move37.fun', subscriptionStatus: null,
  siteFirstLiveAt: '2026-12-10T15:00:00Z', alreadyRecorded: false, ...o,
});
const at = (day: string, i = input()) => planPeriodReminderVerdict(i, `${day}T09:00:00Z`);
const r = (v: ReturnType<typeof at>) => (v.send ? 'send' : v.reason);
ok(r(at('2027-05-10')) === 'too_early', 'full: a day before the window → too early');
ok(r(at('2027-05-11')) === 'send', 'full: first day of the window (30 days before 2027-06-10) → send');
ok(r(at('2027-06-09')) === 'send' && r(at('2027-06-10')) === 'too_late', 'full: the day before the end → send; the end day → too late');
ok(r(at('2027-05-20', input({ alreadyRecorded: true }))) === 'already_sent', 'already recorded → never a second one');
ok(r(at('2027-05-20', input({ agreedText: v5, plan: 'legacy_twelve' }))) === 'no_promise', 'a v5 client (old plan) → never this reminder');
ok(r(at('2027-05-20', input({ plan: null }))) === 'not_v6_plan', 'no plan on the signed acceptance → not sent');
ok(r(at('2027-05-20', input({ siteFirstLiveAt: null }))) === 'no_date', 'pay in full, site not recorded live → not sent');
ok(r(at('2027-05-20', input({}, { refundedAt: '2026-12-20T10:00:00Z' }))) === 'refunded', 'refunded → not sent');
ok(r(at('2027-05-20', input({}, { endedAt: '2027-01-01T10:00:00Z' }))) === 'ended', 'service ended → not sent');
ok(r(at('2027-05-20', input({}, { continuingDecision: 'continue' }))) === 'decided', 'opt-in already decided → not sent');
ok(r(at('2027-05-20', input({ notifyEmail: 'not-an-email' }))) === 'no_email', 'no valid email → not sent');
ok(r(at('2027-05-20', input({}, { route: 'optimise' }))) === 'not_build', 'not Build → not sent');
const sixIn = input({ plan: 'six', subscriptionStatus: 'active', siteFirstLiveAt: null });
ok(r(at('2027-03-19', sixIn)) === 'send' && r(at('2027-03-18', sixIn)) === 'too_early', '6 months: window opens 30 days before the final payment');
ok(r(at('2027-03-25', { ...sixIn, subscriptionStatus: 'canceled' })) === 'cancelled', '6 months: subscription cancelled → not sent');
ok(r(at('2027-04-17', { ...sixIn, facts: { ...base, recurringPaidAt: paidN(5) } })) === 'period_over', '6 months: final payment already taken → not sent');

console.log('── 4. the email says only what v6 says ──');
const mf = planPeriodReminderEmail({ businessName: 'ZZ QA Build', plan: 'full', endDay: '2027-06-10' });
const ms = planPeriodReminderEmail({ businessName: 'ZZ QA Build', plan: 'six', endDay: '2027-04-18' });
ok(/ZZ QA Build/.test(mf.subject) && /Plan Period/.test(mf.subject), 'subject names the business and the Plan Period');
ok(mf.text.includes(`£${FINDABLE_CONTINUING_GBP} a month`) && ms.text.includes(`£${FINDABLE_CONTINUING_GBP} a month`), 'the only price is the optional service (FINDABLE_CONTINUING_GBP)');
ok(/6 months from the date your website first went live/.test(mf.text) && /10 June 2027/.test(mf.text), 'pay in full: 6 months from go-live, the day in words');
ok(/final payment, due on 18 April 2027/.test(ms.text), '6 months: the final payment day');
for (const [n, m] of [['full', mf], ['six', ms]] as const) {
  ok(/9A\.2/.test(m.text) && /9A\.3/.test(m.text) && /9A\.4/.test(m.text) && /9A\.5/.test(m.text) && /8\.4/.test(m.text), `${n}: cites the clauses it restates`);
  ok(!/£99|£499|£49\.99|guarantee|cancel any time|no commitment/i.test(m.text), `${n}: no other price, no guarantee, no invented terms`);
}

console.log('── 5. the server: once, QA-safe, switch, dry run writes nothing ──');
const shared = readFileSync('supabase/functions/_shared/plan-period-reminder.ts', 'utf8');
const fn = readFileSync('supabase/functions/plan-period-reminder/index.ts', 'utf8');
const sql = readFileSync('supabase/migrations/20261129110000_plan_period_reminder.sql', 'utf8');
ok(shared.indexOf('plan_period_reminders").insert(') > 0 && shared.indexOf('plan_period_reminders").insert(') < shared.indexOf('sendAccessDateEmail(v.to'), 'the row is CLAIMED before the email is sent');
ok(/lead_id uuid primary key/.test(sql), 'one row per client, ever (primary key)');
ok(/qaEmailHold\(service, c\.leadId, v\.to\)/.test(shared) && /if \(!c \|\| c\.isQa\) continue;/.test(shared), 'QA: the scheduled run skips QA leads; every send asks qaEmailHold');
ok(/if \(!\(await remindersEnabled\(service\)\)\) return \{ enabled: false/.test(shared), 'kill switch: run sends nothing while off');
ok(/if not coalesce\(\(select enabled from public\.plan_period_reminder_settings/.test(sql), '…and the cron invoker does not even post while off');
const dry = shared.slice(shared.indexOf('export async function dryRun'), shared.indexOf('/* ── RUN / DRILL'));
ok(!/\.insert\(|\.update\(|\.upsert\(|sendOperatorAlert|sendAccessDateEmail/.test(dry), 'the dry run writes and sends nothing');
ok(/drill[\s\S]*if \(!c\.isQa\) return \{ verdict: "not_a_qa_lead"/.test(shared), 'the drill refuses a real client');
ok(/x-cron-secret/.test(fn) && /not_authorised/.test(fn), 'internal only (CRON_SECRET)');
ok(/\[functions\.plan-period-reminder\]\r?\nverify_jwt = false/.test(readFileSync('supabase/config.toml', 'utf8')), 'config.toml entry in the same commit');
ok(/old\.site_first_live_at is not null[\s\S]*new\.site_first_live_at := old\.site_first_live_at/.test(sql), 'go-live day is immutable once stamped');
ok(!/whatsapp/i.test(shared), 'email only — never WhatsApp');

if (fails) { console.log(`\n${fails} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
