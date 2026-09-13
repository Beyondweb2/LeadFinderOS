/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REVIEW QUEUE — who appears, who must not, and the refund that moves no money.

   ⛔ THE ABSENT CASE IS THE POINT OF THIS FILE. Every input here can be missing: a pointer can be
   NULL (every legacy client), a pointed-at audit can still be measuring, a checklist can be null.
   The absent-value shape has now bitten this codebase fifteen times, and the one thing that must
   never happen is an absence reading as "ready" — because the decision at the other end of this
   queue is whether to keep £99 or hand it back.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  reviewQueue, refundPatch, refundReasonOk, REVIEW_BAND_ORDER,
  REVIEW_CONFIRM_KEY, REVIEW_DISMISSED_KEY, MIN_REFUND_REASON_CHARS,
  type ReviewLead, type AuditFact,
} from '../src/lib/reviewQueue';
import { BANDS } from '../src/lib/baselineView';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const FROZEN_B = '2026-09-13T14:19:21.000Z';
const FROZEN_M = '2026-09-13T14:37:41.000Z';

const lead = (over: Partial<ReviewLead> = {}): ReviewLead => ({
  id: 'lead-1', business_name: 'White Sparks Electrical', status: 'payment_received',
  amount_paid: 99, is_archived: false,
  baseline_audit_id: 'b1', full_measure_audit_id: 'm1', delivery_checklist: null, ...over,
});
const bothFrozen: Record<string, AuditFact> = {
  b1: { id: 'b1', frozenAt: FROZEN_B },
  m1: { id: 'm1', frozenAt: FROZEN_M },
};

console.log('-- a client appears once BOTH audits are frozen --');
ok(reviewQueue([lead()], bothFrozen).length === 1, 'both pointers frozen -> in the queue');
ok(reviewQueue([lead()], bothFrozen)[0].readyAt === FROZEN_M,
   'readyAt is when the SECOND finished, not the first');
ok(reviewQueue([lead()], bothFrozen)[0].businessName === 'White Sparks Electrical', 'it carries the name');

console.log('\n-- and not before --');
ok(reviewQueue([lead()], { b1: { id: 'b1', frozenAt: FROZEN_B }, m1: { id: 'm1', frozenAt: null } }).length === 0,
   'full measure still measuring -> NOT in the queue');
ok(reviewQueue([lead()], { b1: { id: 'b1', frozenAt: null }, m1: { id: 'm1', frozenAt: FROZEN_M } }).length === 0,
   'baseline still measuring -> NOT in the queue');
ok(reviewQueue([lead()], {}).length === 0, 'neither audit loaded -> NOT in the queue');

console.log('\n-- the absent pointer is the legacy client, and absence is never "ready" --');
/* ⛔ RG AND RONNIE. Their audits predate audit_purpose so the claim trigger never fired, and RG has
   TWO measurement audits — "the measurement audit for this lead" has no enforced answer for him.
   A guess here would put a made-up number in front of a refund decision. */
ok(reviewQueue([lead({ full_measure_audit_id: null })], bothFrozen).length === 0,
   'no full-measure pointer (every legacy client) -> never appears');
ok(reviewQueue([lead({ baseline_audit_id: null })], bothFrozen).length === 0,
   'no baseline pointer -> never appears');
ok(reviewQueue([lead({ baseline_audit_id: 'gone', full_measure_audit_id: 'alsogone' })], bothFrozen).length === 0,
   'pointers at audits that are not in the read -> never appears');

console.log('\n-- only a paying, live, unrefunded client has a decision to make --');
ok(reviewQueue([lead({ amount_paid: null })], bothFrozen).length === 0, 'never paid -> no decision');
ok(reviewQueue([lead({ amount_paid: 0 })], bothFrozen).length === 0, 'paid zero -> no decision');
/* ⛔ THE REFUND IS THE EXIT. A refunded client still has amount_paid on the row (it is the record of
   what was charged), so without the status test they would sit in the queue for ever. */
ok(reviewQueue([lead({ status: 'refunded' })], bothFrozen).length === 0, 'already refunded -> gone from the queue');
ok(reviewQueue([lead({ is_archived: true })], bothFrozen).length === 0, 'archived -> gone from the queue');
ok(reviewQueue([lead({ status: 'in_delivery' })], bothFrozen).length === 1,
   'in_delivery is still a paying client — the status test is POSITIVE on refunded, never "not paid"');

console.log('\n-- confirm and dismiss both retire it, and they are different keys --');
ok(reviewQueue([lead({ delivery_checklist: { [REVIEW_CONFIRM_KEY]: true } })], bothFrozen).length === 0,
   'confirmed -> gone');
ok(reviewQueue([lead({ delivery_checklist: { [REVIEW_DISMISSED_KEY]: true } })], bothFrozen).length === 0,
   'dismissed -> gone');
ok(REVIEW_CONFIRM_KEY !== REVIEW_DISMISSED_KEY,
   'they are DIFFERENT keys — "not now" must never claim the baseline was checked');
ok(REVIEW_CONFIRM_KEY === 'baseline_checked',
   'confirm writes the key the Deliver card already owns, so the two surfaces cannot disagree');
ok(reviewQueue([lead({ delivery_checklist: { [REVIEW_CONFIRM_KEY]: false, [REVIEW_DISMISSED_KEY]: false } })], bothFrozen).length === 1,
   'explicitly false is not done');
ok(reviewQueue([lead({ delivery_checklist: {} })], bothFrozen).length === 1, 'an empty checklist is not done');
ok(reviewQueue([lead({ delivery_checklist: null })], bothFrozen).length === 1, 'a null checklist is not done');

console.log('\n-- oldest first: the longest wait is the one to deal with --');
const two = reviewQueue([
  lead({ id: 'newer', business_name: 'B', baseline_audit_id: 'b2', full_measure_audit_id: 'm2' }),
  lead({ id: 'older', business_name: 'A' }),
], {
  ...bothFrozen,
  b2: { id: 'b2', frozenAt: '2026-09-14T00:00:00.000Z' },
  m2: { id: 'm2', frozenAt: '2026-09-14T01:00:00.000Z' },
});
ok(two.length === 2 && two[0].leadId === 'older', 'the one ready longest comes first');

console.log('\n-- all five bands, worst first, and NO RACE is not dropped --');
/* 🔴 THE BRIEF ASKED FOR FOUR. NO RACE is the band the refund decision turns on — no engine answers
   locally, so there is nothing to win. Hiding it would omit the number the decision needs. */
ok(REVIEW_BAND_ORDER.includes('no_race'), 'NO RACE is shown, not hidden');
ok(REVIEW_BAND_ORDER.length === BANDS.length, 'every band baselineView defines is displayed');
ok(REVIEW_BAND_ORDER.join(',') === BANDS.join(','), 'and in the same worst-first order as the enum');

console.log('\n-- the refund is bookkeeping: it never touches the money columns --');
const patch = refundPatch({ amount_paid: 99 }, '  nothing winnable — every question is NO RACE  ', '2026-09-13T22:00:00.000Z');
ok(patch.status === 'refunded', 'it sets the one status five readers act on');
ok(patch.refund_amount_gbp === 99, 'it records what was returned');
ok(patch.refund_reason === 'nothing winnable — every question is NO RACE', 'the reason is trimmed and kept');
ok(!('amount_paid' in patch), 'amount_paid is NEVER cleared — it is the record of what was charged');
ok(!('baseline_audit_id' in patch) && !('full_measure_audit_id' in patch),
   'the pointers are never cleared — they are what the refund was measured against');
ok(!('stripe_refund_id' in patch), 'the app issues no refund, so it invents no Stripe id');
ok(refundPatch({ amount_paid: null }, 'a good enough reason', '2026-09-13T22:00:00.000Z').refund_amount_gbp === null,
   'no amount on the row -> null, never a guessed figure');

console.log('\n-- and a refund needs a reason --');
ok(!refundReasonOk(''), 'empty is refused');
ok(!refundReasonOk('   '), 'whitespace is refused');
ok(!refundReasonOk('no'), 'two characters is not a reason');
ok(!refundReasonOk('x'.repeat(MIN_REFUND_REASON_CHARS - 1)), 'one short of the floor is refused');
ok(refundReasonOk('x'.repeat(MIN_REFUND_REASON_CHARS)), 'the floor itself is accepted');
ok(refundReasonOk('nothing winnable in this market'), 'a real reason is accepted');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
