/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A REFUNDED CLIENT CANNOT BE CHARGED FOR ANOTHER AUDIT, FROM ANY CALLER.

   🔴 THE FRAGILITY THIS PINS (2026-09-13). A refund deliberately leaves
   `onboarding_responses.status = 'paid'` alone — it is the record of what they bought — and
   `ensureBaselinesForPaidOnboardings` selects exactly that, every 30-second tick, with no idea what
   the LEAD's status is. The only thing that stopped it buying a fresh baseline for someone just
   refunded was the pointer already existing. Clear a wrong pointer, or delete the audit
   (ON DELETE SET NULL does it for you), and it would have started paying again.

   ⛔ THE GUARD IS AT startPaidBaseline, NOT AT THE BACKSTOP, AND THAT IS THE WHOLE POINT. There are
   TWO callers — the queue backstop and the Stripe webhook. Guarding the one where the fault was
   noticed is the guard-written-as-today's-instance mistake CLAUDE.md records four times over
   (the template-name seatbelt, the market cooldown, the search gate, pitchEverSent). This file
   asserts the property that makes it safe: every caller goes through the one function that refuses.

   ⚠️ THIS IS A SOURCE-STRUCTURE TEST, AND IT SAYS SO. startPaidBaseline talks to the database, so
   what is checkable here is that the refusal exists, reads the shared constant, and stands in front
   of the spend — not that Supabase returned the row. The live proof is the deployed function.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFUNDED_STATUS } from '../src/lib/leadPayment';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN = path.join(ROOT, 'supabase', 'functions');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const baseline = fs.readFileSync(path.join(FN, '_shared', 'audit-baseline.ts'), 'utf8');

/** The body of startPaidBaseline, so "before the spend" is a real ordering claim. */
const startIdx = baseline.indexOf('export async function startPaidBaseline');
const body = baseline.slice(startIdx, baseline.indexOf('\nexport ', startIdx + 10));

console.log('-- the refusal exists, in the one place every caller passes through --');
ok(startIdx > -1, 'startPaidBaseline is where it is expected to be');
const guardAt = body.indexOf('REFUNDED_STATUS');
ok(guardAt > -1, 'it refuses on REFUNDED_STATUS');
/* ⛔ THE SHARED CONSTANT, NEVER THE LITERAL. A second copy of the string 'refunded' is a second
   thing to change when it moves, and the five readers that already act on it would drift apart. */
ok(/import \{ REFUNDED_STATUS \} from "\.\.\/\.\.\/\.\.\/src\/lib\/leadPayment\.ts"/.test(baseline),
   'imported from the shared leaf with an explicit .ts extension (the edge-import rule)');
ok(REFUNDED_STATUS === 'refunded', 'and the constant is the status five readers already test');

console.log('\n-- and it stands IN FRONT of everything that costs money --');
/* 🔴 THE MARKER HAS TO BE THE SPEND ITSELF, NOT A WORD NEAR IT. My first version of this test
   asserted the guard came before the strings 'create-ai-audit' and 'baseline_contract' — and it
   FAILED, because both appear earlier in comments and in the read that looks for an existing
   baseline. Neither costs a penny. That is CLAUDE.md §4's grep-matches-comments trap inside the very
   test meant to prove an ordering, and it would have been "fixed" by weakening the guard.
   The function spends in exactly ONE place: the POST to create-ai-audit. That fetch is the line the
   refusal has to stand in front of, and it is the only thing worth asserting. */
const spendAt = body.search(/fetch\(/);
ok(spendAt > -1, 'the function has exactly one place it spends: the POST to create-ai-audit');
ok((body.match(/fetch\(/g) ?? []).length === 1, 'and still only one — a second would need its own check');
ok(guardAt < spendAt, `the refusal stands IN FRONT of the spend (guard @${guardAt}, spend @${spendAt})`);
/* ⛔ ANTI-VACUITY. If the slice ever stops containing the work, the ordering check above compares
   against -1 and passes for free — the failure mode that made pay-footnote.test.mjs green over a
   402-character slice containing neither thing it claimed to check. */
ok(body.length > 2000, `the slice really covers the function (${body.length} chars)`);

console.log('\n-- both callers go through it: there is no second door --');
const callers: string[] = [];
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : (e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []));
for (const file of walk(FN)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const _ of src.matchAll(/(?<!function )startPaidBaseline\(/g)) {
    callers.push(path.relative(FN, file).split(path.sep).join('/'));
  }
}
ok(callers.length >= 2, `every call site found (${callers.length}: ${[...new Set(callers)].join(', ')})`);
/* ⛔ ONE DEFINITION, so a caller cannot bypass the refusal by construction. If a second
   `export async function startPaidBaseline` ever appears, this is the line that notices. */
const defs = (baseline.match(/export async function startPaidBaseline/g) ?? []).length;
ok(defs === 1, 'exactly one definition of startPaidBaseline — no caller can route around the guard');

console.log('\n-- the replay is refused for a refunded lead too, at both layers --');
/* The date is never even consulted: refunded is tested first, so a refunded client with a past due
   date is refused AS REFUNDED rather than as something else. */
ok(/\.neq\("status", "refunded"\)/.test(baseline), 'fireDueRemeasures excludes refunded in the query');
const due = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'remeasureDue.ts'), 'utf8');
ok(/REMEASURE_STOP_STATUS/.test(due), 'and the pure predicate refuses it independently of the query');

console.log('\n-- the webhook records a refund made in Stripe --');
const webhook = fs.readFileSync(path.join(FN, 'stripe-webhook', 'index.ts'), 'utf8');
ok(/case "charge\.refunded"/.test(webhook), 'charge.refunded is handled');
ok(/stripe_payment_intent_id/.test(webhook), 'it resolves by payment intent, which is 1:1 with the money');
/* ⚠️ A PARTIAL REFUND MUST NOT DELETE A CLIENT. Stripe sends this event for one too, and moving the
   status on a £20 goodwill refund would drop them from every revenue figure and cancel the
   re-measure they are still owed. */
ok(/fullyRefunded/.test(webhook), 'a partial refund is distinguished from a full one');
ok(/if \(fullyRefunded\) patch\.status = "refunded";/.test(webhook),
   'and only a FULL refund moves the status the five readers act on');
ok(/refund_lead_unresolved/.test(webhook), 'a refund it cannot place is reported, never swallowed');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
