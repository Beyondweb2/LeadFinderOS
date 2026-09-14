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

console.log('\n-- a LINKED payment can never produce a no-lead subject --');
/* 🔴 THE FAULT THIS PINS (2026-09-14). The subject read `opts.note ? " (NOT LINKED)" : ""` — one tag
   inferred from whether ANY note existed, while `note` carries two unrelated things: a payment with
   no CRM lead, and a linked payment whose post-payment details are outstanding. The second is the
   NORMAL state of every first payment, so every real customer's PAID email was subject-tagged as
   unlinked when it was linked perfectly well. A tag describing a different condition from the one
   that produced it is worse than no tag. */
ok(/subject: `PAID \$\{amount\} — \$\{name\}\$\{opts\.noLead \? " \(NO LEAD\)" : ""\}`/.test(src),
   'the tag reads opts.noLead, its own fact');
ok(!/opts\.note \? " \(NOT LINKED\)"/.test(src),
   'it is NOT inferred from whether a note exists');
ok(/noLead: !findableLeadId,/.test(src),
   'and the caller sets it from the lead id alone — linked means no tag, always');
ok(/noLead\?: boolean;/.test(src), 'it is a declared field, not a stringly-typed guess');

console.log('\n-- the outstanding test matches the rules that actually gate delivery --');
/* 🔴 business_address WAS REMOVED FROM THE QUESTIONNAIRE ON 2026-08-22 (a paying customer was
   trapped hand-typing an address on mobile); it is collected at delivery instead, so it is null at
   the moment of EVERY payment by design. Testing for it fired "details not yet collected" on every
   real first payment — and dragged the subject tag along with it.
   ⛔ needsQ2() is `has(confirmed_location) && has(services)` and startPaidBaseline waits on exactly
   those two. All three must agree, or this email contradicts the dashboard and the measurement
   about the same customer. */
const outstandingLine = src.match(/const outstanding = [^;]+;/)?.[0] ?? '';
ok(outstandingLine.length > 0, `the outstanding test was found (${JSON.stringify(outstandingLine)})`);
ok(!/business_address/.test(outstandingLine),
   'it no longer requires business_address — a field the product stopped collecting');
/* ⛔ AND SINCE 2026-09-14 IT DOES NOT STATE THE RULE AT ALL — it imports it. Four copies of
   "is this questionnaire complete" existed and two had gone stale; the fix was to delete the
   copies, so what this pins now is that this file reads the shared one.
   `scripts/questionnaire-complete.test.ts` pins the rule itself and all four importers. */
ok(/questionnaireComplete\(ob\)/.test(outstandingLine),
   'it calls the one shared predicate rather than restating town + services');
ok(/from "\.\.\/\.\.\/\.\.\/src\/lib\/questionnaireComplete\.ts"/.test(src),
   'imported with the explicit .ts extension, or the bundler refuses at deploy');
/* And the SELECT must not fetch what the test no longer reads — a column named in a query is the
   next person's evidence that it still matters. */
ok(!/\.select\("confirmed_location, services, business_address"\)/.test(src),
   'and the select stops asking for it too');


console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
