/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   WHO CLOSED THE SALE — the evidence the commission engine reads (2026-10-07, fix/close-flow-final-cleanup).
   Before: only 'link_generated' / 'link_reused' counted. Full Setup's 'link_generated' is timed by the CLIENT's submit, which can
   land after the seller's engagement ended — so a first payment after an end could read "not closed while engaged" although the
   seller sent the link while engaged. Now the seller's own timed Full Setup SEND ('link_shared', variant 'setup') is evidence too.
   Seller attribution itself (sold_by_user_id) is untouched and is not decided here.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { closedWhileEngaged, isSaleClosingEvent, type EngagementEvent, type SaleClosing } from '../src/lib/commission.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const A = 'seller-a', B = 'seller-b';
const ENDED: EngagementEvent[] = [{ kind: 'ended', at: '2026-09-10T00:00:00Z' }];
const ENDED_THEN_BACK: EngagementEvent[] = [{ kind: 'ended', at: '2026-09-10T00:00:00Z' }, { kind: 'resumed', at: '2026-09-20T00:00:00Z' }];
const PAY = '2026-10-05T12:00:00Z';
/** What earnings.ts does with the rows it reads. */
const closingsOf = (rows: { actor: string | null; at: string; kind: string; data?: { variant?: unknown } | null }[]): SaleClosing[] =>
  rows.filter((r) => isSaleClosingEvent(r)).map((r) => ({ actorUserId: r.actor, at: r.at }));

console.log('\n── WHICH EVENTS ARE CLOSING EVIDENCE ──');
ok(isSaleClosingEvent({ kind: 'link_generated' }) && isSaleClosingEvent({ kind: 'link_reused' }), 'the Agreement & Payment link events still count');
ok(isSaleClosingEvent({ kind: 'link_shared', data: { variant: 'setup' } }), 'a Full Setup SEND counts');
ok(!isSaleClosingEvent({ kind: 'link_shared', data: { channel: 'copy' } }) && !isSaleClosingEvent({ kind: 'link_shared', data: null }) && !isSaleClosingEvent({ kind: 'link_shared' }), 'a copy / email / WhatsApp of the agreement link on its own does not');
ok(!isSaleClosingEvent({ kind: 'link_shared', data: { variant: 'agreement' } }) && !isSaleClosingEvent({ kind: 'answers_saved' }) && !isSaleClosingEvent({ kind: 'link_refused' }) && !isSaleClosingEvent(null) && !isSaleClosingEvent(undefined), 'only a positive match: other variants, other kinds, nothing → no');

console.log('\n── NORMAL ROUTES, UNCHANGED (seller engaged throughout) ──');
ok(closedWhileEngaged(closingsOf([{ actor: A, at: '2026-09-01T00:00:00Z', kind: 'link_generated' }]), A, [], PAY), 'phone close: the seller\'s link before the payment → closed');
ok(closedWhileEngaged(closingsOf([{ actor: A, at: '2026-09-01T00:00:00Z', kind: 'link_shared', data: { variant: 'setup' } }, { actor: A, at: '2026-09-03T00:00:00Z', kind: 'link_generated' }]), A, [], PAY), 'full setup: the send and the client\'s sign-up, both the seller\'s → closed');
ok(!closedWhileEngaged(closingsOf([{ actor: A, at: '2026-10-06T00:00:00Z', kind: 'link_generated' }]), A, [], PAY), 'a link made AFTER the payment never counts');

console.log('\n── AN ENDED ENGAGEMENT ──');
const phoneEnded = closingsOf([{ actor: A, at: '2026-09-01T00:00:00Z', kind: 'link_generated' }]);
ok(closedWhileEngaged(phoneEnded, A, ENDED, PAY), 'phone: link made while engaged, payment after the end → closed (existing rule)');
const setupLate = closingsOf([{ actor: A, at: '2026-09-01T00:00:00Z', kind: 'link_shared', data: { variant: 'setup' } }, { actor: A, at: '2026-09-25T00:00:00Z', kind: 'link_generated' }]);
ok(closedWhileEngaged(setupLate, A, ENDED, PAY), 'FULL SETUP: sent while engaged, the client submitted after the end → closed (the gap, now covered)');
const before = (rows: typeof setupLate) => rows.filter((r) => true); // the old filter read only link_generated / link_reused
const oldEvidence: SaleClosing[] = [{ actorUserId: A, at: '2026-09-25T00:00:00Z' }];
ok(!closedWhileEngaged(oldEvidence, A, ENDED, PAY) && before(setupLate).length === 2, 'BEFORE: the client\'s late submit alone read "not closed while engaged"');
ok(!closedWhileEngaged(closingsOf([{ actor: A, at: '2026-09-15T00:00:00Z', kind: 'link_shared', data: { variant: 'setup' } }]), A, ENDED, PAY), 'a Full Setup sent AFTER the engagement ended is not closing evidence');
console.log('\n── RE-ENGAGED ──');
ok(closedWhileEngaged(closingsOf([{ actor: A, at: '2026-09-22T00:00:00Z', kind: 'link_generated' }]), A, ENDED_THEN_BACK, PAY), 're-engaged ended lead via the PHONE route: a link after the resume → closed');
ok(closedWhileEngaged(closingsOf([{ actor: A, at: '2026-09-22T00:00:00Z', kind: 'link_shared', data: { variant: 'setup' } }]), A, ENDED_THEN_BACK, PAY), 're-engaged ended lead via the FULL SETUP route: a send after the resume → closed');
ok(!closedWhileEngaged(closingsOf([{ actor: A, at: '2026-09-15T00:00:00Z', kind: 'link_shared', data: { variant: 'setup' } }]), A, ENDED_THEN_BACK, PAY), '…but not a send made in the gap between the end and the resume');

console.log('\n── NO STEALING, NO FALSE SELLER ──');
ok(!closedWhileEngaged(closingsOf([{ actor: B, at: '2026-09-01T00:00:00Z', kind: 'link_shared', data: { variant: 'setup' } }, { actor: B, at: '2026-09-02T00:00:00Z', kind: 'link_generated' }]), A, ENDED, PAY), 'another salesperson\'s sends / links are never the seller\'s closing');
ok(!closedWhileEngaged(closingsOf([{ actor: null, at: '2026-09-01T00:00:00Z', kind: 'link_shared', data: { variant: 'setup' } }]), A, ENDED, PAY), 'an event with no actor is nobody\'s');
ok(!closedWhileEngaged(closingsOf([]), A, ENDED, PAY) && !closedWhileEngaged(undefined, A, ENDED, PAY), 'an organic / self-service signup (no seller events) earns no closing');
ok(closedWhileEngaged(closingsOf([{ actor: A, at: '2026-09-01T00:00:00Z', kind: 'link_shared', data: { variant: 'setup' } }, { actor: A, at: '2026-09-01T00:00:01Z', kind: 'link_shared', data: { variant: 'setup' } }, { actor: A, at: '2026-09-02T00:00:00Z', kind: 'link_generated' }]), A, [], PAY), 'repeat sends are harmless: closing is a yes/no, never counted twice');

console.log('\n── THE WIRING ──');
const earn = read('supabase/functions/_shared/earnings.ts');
ok(/\.in\("kind", \["link_generated", "link_reused", "link_shared"\]\)/.test(earn) && /\.filter\(\(x\) => isSaleClosingEvent\(x\)\)/.test(earn), 'earnings reads link_shared too, and keeps ONLY the Full Setup sends');
const sc = read('supabase/functions/_shared/setup-link-creator.ts');
ok(/already_recorded/.test(sc) && /eq\("onboarding_id", onboardingId\)\.eq\("kind", "link_generated"\)/.test(sc), 'the sign-up creation event is still written at most once per sign-up (no duplicate seller events)');
const qc = read('supabase/functions/quick-close/index.ts');
ok(!/kind: "link_generated"/.test(qc.slice(qc.indexOf('mode === "share_setup"'))), 'a Full Setup SEND does not write a link_generated (it cannot create a second creation / sale_creations row)');

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
