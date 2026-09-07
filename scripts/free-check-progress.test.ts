/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE-CHECK PROGRESS — the stages, and especially the absences.

   Run: npx tsx scripts/free-check-progress.test.ts

   ⛔ WHAT THIS PINS: that "nothing happened" can never render as "it is working". The glue-pot
   incident was an email narrating a state nobody had checked; the fix is a display, and a display
   is only worth having if its optimistic states are unreachable without the evidence for them.
   Every test below is either a real recorded state or an absence.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  progressFor, emailStateFor, whatsappStateFor, reportUrlFor,
  type FreeCheckProgressInput,
} from '../src/lib/freeCheckProgress.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const base: FreeCheckProgressInput = {
  onboarding_id: 'o1', business_name: 'The Glue Pot', contact_email: 'x@y.com',
  submitted_at: '2026-09-07T04:20:30Z',
  notify_sent_at: null, notify_attempts: 0, notify_error: null,
  lead_id: 'l1', lead_name: 'The Glue Pot',
  audit_id: 'a1', audit_created_at: '2026-09-07T04:21:00Z',
  run_statuses: [], runs_target: 3,
  questions_total: 15, questions_done: 0,
  result_claimed_at: null, result_sent_to: null, result_email_status: null,
  result_provider_id: null, result_email_error: null, result_resend_count: null,
  no_audit_reason: null, whatsapp_status: null,
};
const P = (o: Partial<FreeCheckProgressInput>) => progressFor({ ...base, ...o });

console.log('── ABSENCES, MOST SPECIFIC FIRST ──');
{
  const p = P({ lead_id: null, audit_id: null });
  ok(p.stage === 'no_lead', 'no lead is its own stage, not "no audit"');
  ok(p.needsYou, 'no lead needs a person');
}
{
  // The real glue-pot shape: lead deduped onto another business, audit skipped with a reason.
  const p = P({ audit_id: null, audit_created_at: null, run_statuses: [], questions_total: 0,
    no_audit_reason: 'already audited within 7 days', lead_name: 'Test plumber' });
  ok(p.stage === 'no_audit', 'a lead with no audit is no_audit');
  ok(p.detail.includes('already audited within 7 days'), 'the recorded reason is printed');
  ok(p.detail.includes('Test plumber'), 'the matched lead is named, since the guard was about IT');
  ok(p.needsYou, 'no audit needs a person');
}
{
  const p = P({ audit_id: null, audit_created_at: null, no_audit_reason: null });
  ok(p.stage === 'no_audit' && p.detail.includes('no reason was recorded'),
    'a missing reason is stated, never invented');
}
{
  const p = P({ lead_name: 'The Glue Pot', audit_id: null, no_audit_reason: 'daily cap reached' });
  ok(!p.detail.includes('matched the existing lead'), 'no matched-lead clause when the names agree');
}

console.log('\n── RUNNING ──');
{
  const p = P({ run_statuses: ['complete', 'running', 'pending'], questions_done: 7 });
  ok(p.stage === 'running', 'any unsettled run means running');
  ok(p.runsDone === 1 && p.runsTarget === 3, 'run counts are reported');
  ok(p.detail.includes('run 2 of 3'), 'it names which run');
  ok(p.detail.includes('7 of 15'), 'and the question progress');
  ok(!p.needsYou, 'a running audit needs nobody');
}

console.log('\n── THE STATE THAT LOOKS FINISHED AND IS NOT ──');
{
  // SUPREME PLUMBERS, 2026-09-03: 3 of 3 runs done, no result. Nothing retries this.
  const p = P({ run_statuses: ['complete', 'complete', 'complete'], questions_done: 15 });
  ok(p.stage === 'stranded', 'all runs settled with no result is STRANDED, not complete');
  ok(p.stage !== 'running', 'and it must never read as still running');
  ok(p.needsYou, 'stranded needs a person');
  ok(/NO RESULT/i.test(p.detail), 'the detail says the result never went');
}
{
  const p = P({ run_statuses: ['failed', 'failed', 'failed'] });
  ok(p.stage === 'failed', 'every run failed is failed, not stranded');
  ok(p.needsYou, 'failed needs a person');
}
{
  const p = P({ run_statuses: ['complete', 'failed'] });
  ok(p.stage === 'stranded', 'a partial success with no result is still stranded, not failed');
}
{
  const p = P({ run_statuses: [] });
  ok(p.stage === 'unknown', 'an audit with no runs is unknown, never running or complete');
  ok(p.needsYou, 'and it needs a person');
}

console.log('\n── COMPLETE MEANS THE RESULT WENT ──');
{
  const p = P({ run_statuses: ['complete', 'complete', 'complete'],
    result_claimed_at: '2026-09-07T04:40:00Z', result_sent_to: 'x@y.com', result_email_status: 'accepted' });
  ok(p.stage === 'complete', 'a claim with an accepted outcome is complete');
  ok(p.detail.includes('x@y.com'), 'and it names the address');
  ok(p.detail.includes('accepted by Resend'), 'and says ACCEPTED, never delivered');
  ok(!p.detail.toLowerCase().includes('delivered'), 'the word delivered never appears for email');
  ok(!p.needsYou, 'complete needs nobody');
}
{
  // A claim outranks unsettled runs: the prospect has their answer either way.
  const p = P({ run_statuses: ['complete', 'pending'], result_claimed_at: '2026-09-07T04:40:00Z',
    result_email_status: 'accepted' });
  ok(p.stage === 'complete', 'an accepted result is complete even if a run is still settling');
}

console.log('\n── THE CLAIM IS NOT THE SEND ──');
{
  /* The bug this split exists for: the stamp is written BEFORE the Resend call, so a claim alone
     never meant an email went. It used to render as "Result sent". */
  const p = P({ run_statuses: ['complete', 'complete', 'complete'],
    result_claimed_at: '2026-09-07T04:40:00Z', result_email_status: 'failed',
    result_email_error: 'resend HTTP 403: domain not verified' });
  ok(p.stage === 'send_failed', 'a claimed send that Resend refused is NOT complete');
  ok(p.needsYou, 'a failed send needs a person');
  ok(p.detail.includes('403'), 'the provider error is printed, not summarised away');
}
{
  const p = P({ run_statuses: ['complete', 'complete', 'complete'],
    result_claimed_at: '2026-09-07T04:40:00Z', result_email_status: 'attempting' });
  ok(p.stage === 'send_unknown', 'claimed with no recorded outcome is UNKNOWN, not complete');
  ok(p.needsYou, 'unknown needs a person');
}
{
  /* Rows written before the outcome field existed. They must not borrow the good news. */
  const p = P({ run_statuses: ['complete', 'complete', 'complete'],
    result_claimed_at: '2026-09-03T12:01:44Z', result_sent_to: 'paul@move37.fun',
    result_email_status: null });
  ok(p.stage === 'complete', 'an older row is still complete');
  ok(p.detail.includes('outcome not recorded'), 'but it says the outcome was never recorded');
  ok(!p.detail.includes('accepted by Resend'), 'and does not claim acceptance it cannot know');
}
{
  const p = P({ run_statuses: ['complete', 'complete', 'complete'],
    result_claimed_at: '2026-09-07T04:40:00Z', result_email_status: 'accepted', result_resend_count: 2 });
  ok(p.detail.includes('resent 2x'), 'hand resends are counted on the face of it');
}

console.log('\n── THE REPORT LINK ──');
ok(P({}).reportUrl === reportUrlFor('a1'), 'an audit gets a report link');
ok(P({ audit_id: null }).reportUrl === null, 'no audit means no link, not a broken one');
ok(reportUrlFor('a1').startsWith('https://findable.live/report/'),
  'the link is the prospect-facing proxy, never the Supabase URL');

console.log('\n── SENT IS NOT DELIVERED ──');
ok(emailStateFor({ notify_sent_at: '2026-09-07T04:21:01Z', notify_attempts: 1, notify_error: null }) === 'accepted',
  'a provider 2xx is ACCEPTED, never "delivered" — arrival is not in our database');
ok(emailStateFor({ notify_sent_at: null, notify_attempts: 0, notify_error: null }) === 'pending',
  'no attempts and no send is pending, never failed');
ok(emailStateFor({ notify_sent_at: null, notify_attempts: 3, notify_error: 'resend HTTP 403: nope' }) === 'failed',
  'attempts exhausted is failed');
ok(emailStateFor({ notify_sent_at: null, notify_attempts: 1, notify_error: 'not sent: they paid inside the delay window' }) === 'retired',
  'a deliberate non-send is retired, not failed');
ok(emailStateFor({ notify_sent_at: null, notify_attempts: 9, notify_error: 'not sent: they paid' }) === 'retired',
  'retired beats the attempt ceiling — a deliberate skip is not a lost email');

console.log('\n── WHATSAPP DOES DISTINGUISH DELIVERY ──');
ok(whatsappStateFor(null) === 'none', 'no row is none, not pending');
ok(whatsappStateFor('delivered') === 'accepted', 'delivered counts');
ok(whatsappStateFor('read') === 'accepted', 'read counts');
ok(whatsappStateFor('failed') === 'failed', 'failed counts');
ok(whatsappStateFor('queued') === 'pending', 'an unknown-but-present status is pending, never accepted');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
