/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE "PAID £99" EMAIL IS SUPPRESSED BY THE EMAIL'S OWN RECORD, NEVER BY THE MONEY.

   🔴 THE BUG THIS PINS (2026-09-14). The guard read `alreadyPaid` — "the lead already carried money
   before this event, so the payment is not new" — and decided the email on that alone. But the
   money is written BEFORE the email is sent, so they are not the same fact. Anything that kills the
   handler in between (timeout, cold-start kill, a Resend call outliving the request) leaves the
   lead paid and the email unsent; the retry then reads the money, calls the payment old, and
   suppresses the only notification there will ever be. On a first real payment that means a
   customer paid £99 and nobody was told.

   ⛔ AND THE SKIP WAS INVISIBLE. It reached `console.log` alone, and the CLI has no `functions
   logs`, so "no PAID email and no trace" could equally mean the webhook never arrived or that it
   arrived and chose not to send. Four outcomes now write four rows.

   ⚠️ SOURCE-STRUCTURE TEST, AND IT SAYS SO. The handler talks to Stripe and Supabase, so what is
   checkable here is which fact the branch reads and that every outcome is recorded. The live proof
   is a replayed event.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBHOOK = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..',
  'supabase', 'functions', 'stripe-webhook', 'index.ts',
);
const src = fs.readFileSync(WEBHOOK, 'utf8');

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('-- the branch reads the EMAIL record, not the money --');
ok(/if \(!paidEmailAlreadySent\) \{/.test(src),
   'the send is gated on paidEmailAlreadySent');
/* 🔴 THE REGRESSION IN ONE LINE. If this ever reads `if (!alreadyPaid)` again, a crash between the
   money write and the Resend call silently loses the notification for ever. */
ok(!/if \(!alreadyPaid\) \{[\s\S]{0,80}notifyOfFindablePayment/.test(src),
   'the send is NOT gated on alreadyPaid — the money is written first, so it cannot be the key');
ok(/\.eq\("error_id", "payment_email_sent"\)/.test(src),
   'it decides by looking for this row\'s own payment_email_sent trace');
ok(/\.contains\("context", \{ onboarding_id: onboardingId \}\)/.test(src),
   'scoped to THIS onboarding row, never "any PAID email ever sent"');

console.log('\n-- the money only narrows the question, it never answers it --');
/* alreadyPaid survives as the cheap pre-test: true for every duplicate, so a first payment never
   pays for the trace lookup. It must gate the READ and nothing else. */
ok(/if \(alreadyPaid\) \{[\s\S]{0,400}payment_email_sent/.test(src),
   'the trace lookup runs only when the lead already carries money (a first payment costs no read)');

console.log('\n-- and an unknown answer SENDS --');
/* ⛔ THE DIRECTION IS THE POINT. A duplicate "PAID £99" is an inbox annoyance; a missed one means a
   customer paid and nobody was told. The two wrong answers are not equal, so a failed read must
   fall to the noisy side. `paidEmailAlreadySent` starts false and the catch does not set it. */
ok(/let paidEmailAlreadySent = false;/.test(src), 'it starts false, so a read that never runs sends');
const lookup = src.slice(src.indexOf('let paidEmailAlreadySent'), src.indexOf('THE WEBSITE ADD-ON'));
ok(lookup.length > 200, `the lookup block was found (${lookup.length} chars)`);
ok(/catch \(e\) \{[\s\S]*?console\.error/.test(lookup) && !/catch[\s\S]*?paidEmailAlreadySent = true/.test(lookup),
   'the catch never sets it true — a failed check can only ever cause an extra email, never silence');

console.log('\n-- every outcome writes a row, so silence has exactly one meaning --');
for (const [id, what] of [
  ['payment_email_sent', 'sent (with the provider id)'],
  ['payment_email_failed', 'refused or threw'],
  ['payment_email_skipped', 'deliberately not sent'],
] as const) {
  ok(src.includes(`"${id}"`), `${id} — ${what}`);
}
/* The skip must carry WHY and WHAT WAS THERE, or the row is only a different kind of silence. */
const skipIdx = src.indexOf('payment_email_skipped');
const skipBlock = src.slice(skipIdx, skipIdx + 600);
ok(/reason:/.test(skipBlock), 'the skip row says why');
ok(/amount_on_lead_gbp:/.test(skipBlock), 'and what the lead already carried');
ok(/onboarding_id:/.test(skipBlock), 'and which onboarding row it belongs to');

console.log('\n-- the sender still comes from the verified domain --');
/* Yesterday's fault, still pinned here because this block is where it bit. */
ok(/from: FROM_OPERATOR,/.test(src), 'the PAID email reads FROM_OPERATOR');
ok(/const FROM_OPERATOR = "Findable alerts <alerts@findable\.live>";/.test(src),
   'which is the verified domain, not the retired lead-finder-app.com');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
