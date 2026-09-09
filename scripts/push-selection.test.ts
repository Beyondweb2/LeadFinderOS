/* ============================================================
   HOW MANY TO PUSH, AND WHICH ONES.

   Run: npx tsx scripts/push-selection.test.ts

   ⛔ WHAT THIS GUARDS. Two controls that decide how many real businesses get a cold email, and in
   what order. Both replaced a 200-lead cap that sliced by UUID, so the same lead could sit unsent
   for months while newer ones went out ahead of it.

   ⛔ IT IMPORTS THE SHIPPED MODULE. scripts/audit-push.test.ts has to RESTATE bulk-jobs' ladder
   because that lives inside a Deno entrypoint the SPA cannot load; this logic was pulled out into
   a Deno-free leaf precisely so the test could prove the deployed rule instead of a copy of it.
   ============================================================ */
import {
  applySendLimit, oldestFirst, resolveSendLimit,
} from '../supabase/functions/_shared/push-selection.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('\n── OLDEST FIRST: "the ones deepest in outreach list" ──');
{
  /* The Outreach table is created_at DESC, so the deepest row is the oldest one. */
  const rows = [
    { id: 'c', created_at: '2026-09-01T00:00:00Z' },
    { id: 'a', created_at: '2026-07-23T00:00:00Z' },
    { id: 'b', created_at: '2026-08-15T00:00:00Z' },
  ];
  ok(oldestFirst(rows).map((r) => r.id).join('') === 'abc', 'sorted oldest -> newest');
  ok(rows.map((r) => r.id).join('') === 'cab', 'the input array is not mutated');
}
{
  /* ⛔ A TOTAL ORDER, because the limit slices this list and the preview and the create are two
     separate queries. Without a unique tiebreaker they can pick a DIFFERENT N and the confirm
     screen describes a job that never ran. */
  const same = '2026-08-01T00:00:00Z';
  const rows = [{ id: 'z', created_at: same }, { id: 'm', created_at: same }, { id: 'a', created_at: same }];
  ok(oldestFirst(rows).map((r) => r.id).join('') === 'amz', 'identical timestamps break the tie on id');
  ok(oldestFirst([...rows].reverse()).map((r) => r.id).join('') === 'amz', 'and the result does not depend on input order');
}

console.log('\n── ⛔ AN UNDATED LEAD SORTS LAST, NOT FIRST ──');
/* Its age is unknown. Putting an unknown-age lead ahead of a provably old one invents evidence —
   and it matches what Paul sees, since Postgres puts NULLs first on a DESC order, i.e. at the TOP
   (shallowest) of his table. */
for (const missing of [null, undefined, '', '   '] as (string | null | undefined)[]) {
  const rows = [
    { id: 'undated', created_at: missing },
    { id: 'old', created_at: '2026-07-01T00:00:00Z' },
    { id: 'new', created_at: '2026-09-01T00:00:00Z' },
  ];
  ok(oldestFirst(rows).map((r) => r.id).join(',') === 'old,new,undated',
     `created_at ${JSON.stringify(missing)} sorts last`);
}
ok(oldestFirst([{ id: 'b', created_at: null }, { id: 'a', created_at: undefined }])
     .map((r) => r.id).join('') === 'ab',
   'two undated rows still order deterministically by id');

console.log('\n── THE AMOUNT: ABSENT IS "ALL", GARBAGE IS REFUSED ──');
const INF = Number.POSITIVE_INFINITY;
for (const absent of [undefined, null, '', '   '] as unknown[]) {
  const r = resolveSendLimit(absent, INF);
  ok(r.ok && r.limit === INF, `${JSON.stringify(absent)} means no limit`);
}
{
  const r = resolveSendLimit(undefined, 25);
  ok(r.ok && r.limit === 25, 'absent takes the caller\'s default when there is one');
}
for (const [label, raw] of [
  ['a word', 'abc'], ['zero', 0], ['negative', -5], ['a fraction', 2.5],
  ['NaN', Number.NaN], ['Infinity itself', Number.POSITIVE_INFINITY],
  ['an object', {}], ['a boolean', true],
] as [string, unknown][]) {
  const r = resolveSendLimit(raw, INF);
  /* ⛔ REFUSED, NOT DEFAULTED. A "limit" of "abc" quietly becoming "send everything" is the
     absent-value fault on the one control that decides how many strangers get emailed. */
  ok(!r.ok, `${label} is refused rather than treated as absent`);
  if (!r.ok) ok(r.reason.includes('how many to send'), `  and the reason names the control (${r.reason.slice(0, 50)})`);
}
{
  ok((() => { const r = resolveSendLimit(50, INF); return r.ok && r.limit === 50; })(), 'a number is taken as given');
  ok((() => { const r = resolveSendLimit('50', INF); return r.ok && r.limit === 50; })(), 'a numeric string is taken as given');
  ok((() => { const r = resolveSendLimit(' 7 ', INF); return r.ok && r.limit === 7; })(), 'whitespace around a number is trimmed');
  ok((() => { const r = resolveSendLimit(1, INF); return r.ok && r.limit === 1; })(), '1 is a legal amount');
}

console.log('\n── ⛔ A TYPED AMOUNT MAY ONLY LOWER A SPEND CAP, NEVER RAISE ONE ──');
/* The audit-first path buys an audit per lead; its 25 is a money guard and a number typed into a
   box must not be able to lift it. */
{
  const up = resolveSendLimit(500, 25, 25);
  ok(up.ok && up.limit === 25, '500 against a hard cap of 25 stays 25');
  const down = resolveSendLimit(10, 25, 25);
  ok(down.ok && down.limit === 10, '10 against a hard cap of 25 lowers it to 10');
  const noneGiven = resolveSendLimit(undefined, INF, 25);
  ok(noneGiven.ok && noneGiven.limit === 25, 'an absent amount cannot exceed the hard cap either');
}

console.log('\n── THE SLICE: READY-TO-SEND FIRST, "cannot" NEVER COUNTED ──');
const g = (lead_id: string, bucket: 'push_now' | 'needs_audit' | 'cannot') => ({ lead_id, bucket });
{
  /* Already-audited leads cost nothing and go out in this run's upload, so they take the allowance
     before any audit is bought. */
  const rows = [g('n1', 'needs_audit'), g('p1', 'push_now'), g('n2', 'needs_audit'), g('p2', 'push_now')];
  const run = applySendLimit(rows, 2);
  ok(run.has('p1') && run.has('p2') && !run.has('n1'), 'both push_now leads take the two slots');
}
{
  /* ⛔ A selection full of already-pushed leads must not consume the allowance for the sendable
     ones — that is a whole run producing no email while reading as complete. */
  const rows = [g('c1', 'cannot'), g('c2', 'cannot'), g('p1', 'push_now')];
  const run = applySendLimit(rows, 2);
  ok(run.size === 1 && run.has('p1'), 'the two "cannot" rows do not eat the limit');
}
{
  /* Within a bucket the caller's order (oldest first) survives the slice. */
  const rows = ['a', 'b', 'c', 'd'].map((id) => g(id, 'push_now'));
  const run = applySendLimit(rows, 2);
  ok(run.has('a') && run.has('b') && !run.has('c'), 'the slice takes the FIRST two, i.e. the oldest');
}
{
  const rows = [g('p1', 'push_now'), g('n1', 'needs_audit')];
  ok(applySendLimit(rows, INF).size === 2, 'no limit sends every actionable lead');
  ok(applySendLimit(rows, 0).size === 0, 'a limit of 0 sends nothing');
  ok(applySendLimit(rows, -3).size === 0, 'a negative limit sends nothing, it does not wrap');
  ok(applySendLimit([], 10).size === 0, 'an empty selection is not an error');
  ok(applySendLimit([g('c1', 'cannot')], INF).size === 0, 'no limit still cannot send an ineligible lead');
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) throw new Error(`${f} failures`);
