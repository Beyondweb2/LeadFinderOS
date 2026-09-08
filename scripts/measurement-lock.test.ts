/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LOCKED BASELINE — the properties that make the diff worth trusting.

   Run: npx tsx scripts/measurement-lock.test.ts

   ⛔ THE ONE THIS EXISTS FOR: a malformed or empty lock must read as NO LOCK, never as one that
   calls every proposal identical. A lock whose diff always says "0 of 0 match, identical" is
   worse than no lock at all — it would sign off the exact drift it was added to catch.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  describeLock,
  diffAgainstLock,
  isUsableLock,
  lockFromRows,
  type MeasurementLock,
} from '../src/lib/measurementLock.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/* RG's real 12, abbreviated to five for readability; the shapes are what matter. */
const Q = [
  'lock changes locksmiths in Huntingdon UK',
  'emergency lockouts locksmiths in Huntingdon UK',
  'upvc door locksmiths in Huntingdon UK',
  'window locks locksmiths in Huntingdon UK',
  'best locksmiths in Huntingdon UK',
];
const row = (runId: string, question: string) => ({ run_id: runId, question });

console.log('── BUILDING A LOCK FROM THE RUNS THAT ACTUALLY RAN ──');
{
  /* Three runs of the same five questions - RG's real shape. */
  const rows = ['r1', 'r2', 'r3'].flatMap((r) => Q.map((q) => row(r, q)));
  const lock = lockFromRows(rows, { sourceAuditId: 'f64920ce', measuredAt: '2026-08-11T15:00:00Z', now: '2026-09-08T06:00:00Z' })!;
  ok(lock.questions.length === 5, 'the five distinct questions, deduped across runs');
  ok(lock.runs === 3, 'and it records that they were measured over 3 runs');
  ok(JSON.stringify(lock.questions) === JSON.stringify(Q), 'in the order they were queued');
  ok(lock.sourceAuditId === 'f64920ce' && lock.measuredAt === '2026-08-11T15:00:00Z',
    'traceable to the audit and the date it was measured');
  ok(isUsableLock(lock), 'and it is usable');
  ok(/5 questions × 3 runs/.test(describeLock(lock)), `describeLock reads: ${describeLock(lock)}`);
}
{
  /* Misspellings survive - a tidied question measures something else. */
  const lock = lockFromRows([row('r1', 'accoutnant in wisbech')], { sourceAuditId: 'a', measuredAt: null })!;
  ok(lock.questions[0] === 'accoutnant in wisbech', 'a misspelling is kept verbatim, not corrected');
}
{
  const lock = lockFromRows([row('r1', '  padded  '), row('r1', 'PADDED')], { sourceAuditId: 'a', measuredAt: null })!;
  ok(lock.questions.length === 1 && lock.questions[0] === 'padded',
    'case and whitespace collapse to one entry, keeping the first occurrence trimmed');
}
ok(lockFromRows([], { sourceAuditId: 'a', measuredAt: null }) === null,
  'no rows gives NULL, never an empty lock — an empty lock would call every proposal identical');
ok(lockFromRows([row('r1', '   ')], { sourceAuditId: 'a', measuredAt: null }) === null,
  'and neither does a blank question');

console.log('\n── THE DIFF: A TRUE LIKE-FOR-LIKE ──');
const lock = lockFromRows(['r1', 'r2', 'r3'].flatMap((r) => Q.map((q) => row(r, q))),
  { sourceAuditId: 'f64920ce', measuredAt: '2026-08-11T15:00:00Z' })!;
{
  const d = diffAgainstLock(lock, Q);
  ok(d.identical, 'the exact locked set is identical');
  ok(d.matched.length === 5 && d.missing.length === 0 && d.added.length === 0, 'five matched, nothing dropped or new');
  ok(/true like-for-like/.test(d.summary), `and the summary says so: ${d.summary}`);
}
{
  /* Order is not identity - the comparison joins on the text. */
  const d = diffAgainstLock(lock, [...Q].reverse());
  ok(d.identical, 'a REORDERED set is still identical — order is not part of identity');
}
{
  const d = diffAgainstLock(lock, [...Q, ...Q]);
  ok(d.identical, 'and a duplicated set collapses rather than reading as new questions');
}

console.log('\n── THE DIFF CATCHES REAL DRIFT ──');
{
  const d = diffAgainstLock(lock, Q.slice(0, 3));
  ok(!d.identical, 'dropping two questions is not identical');
  ok(d.missing.length === 2 && d.matched.length === 3, 'and they are named as dropped');
  ok(/2 dropped/.test(d.summary) && /lose their before side/.test(d.summary),
    'the summary says what dropping costs');
}
{
  /* ABLM's real drift: same intent, different wording, zero overlap. */
  const ablm = lockFromRows([row('r1', 'accountant in wisbech')], { sourceAuditId: 'ablm', measuredAt: null })!;
  const d = diffAgainstLock(ablm, ['Best accountants in Wisbech?']);
  ok(d.matched.length === 0 && d.missing.length === 1 && d.added.length === 1,
    'a re-worded question is a DIFFERENT question — matched 0, which is exactly what happened to ABLM');
  ok(!d.identical, 'and never reads as like-for-like');
}
{
  const d = diffAgainstLock(lock, [...Q, 'lock changes locksmiths in St neots UK']);
  ok(d.added.length === 1 && d.missing.length === 0 && !d.identical,
    'an ADDED question is flagged, even though nothing was lost — it has no before side');
}

console.log('\n── ABSENCE IS NEVER "IDENTICAL" ──');
{
  const d = diffAgainstLock(null, Q);
  ok(!d.identical, 'no lock is NOT identical');
  ok(d.matched.length === 0 && d.added.length === 5, 'everything reads as new, nothing as matched');
  ok(/No locked baseline/.test(d.summary), 'and the summary says there is nothing to compare against');
}
{
  const d = diffAgainstLock(lock, []);
  ok(!d.identical && d.missing.length === 5, 'an EMPTY proposal drops everything rather than matching everything');
}

console.log('\n── A MALFORMED STORED LOCK READS AS NO LOCK ──');
/* The column is jsonb: anything can be in it. Each of these must fail validation, because a lock
   that validates with no questions makes every future diff say "identical". */
for (const bad of [
  null, undefined, {}, [], 'a string', 42,
  { version: 1, questions: [], sourceAuditId: 'a', runs: 3 },
  { version: 1, questions: ['q'], sourceAuditId: '', runs: 3 },
  { version: 1, questions: ['q'], sourceAuditId: 'a', runs: 0 },
  { version: 1, questions: ['  '], sourceAuditId: 'a', runs: 3 },
  { version: 1, questions: ['q', 7], sourceAuditId: 'a', runs: 3 },
  { version: 2, questions: ['q'], sourceAuditId: 'a', runs: 3 },
  { questions: ['q'], sourceAuditId: 'a', runs: 3 },
] as unknown[]) {
  ok(!isUsableLock(bad), `rejected: ${JSON.stringify(bad)?.slice(0, 52) ?? String(bad)}`);
}
ok(isUsableLock({ version: 1, questions: ['q'], sourceAuditId: 'a', runs: 1, lockedAt: 'x', measuredAt: null } as MeasurementLock),
  'and a minimal well-formed lock IS accepted');

console.log('\n── THE RUN COUNT TRAVELS WITH THE LOCK ──');
ok(lock.runs === 3, 'so a re-measure can be held to the same repeat count, not just the same wording');
{
  const one = lockFromRows([row('r1', Q[0])], { sourceAuditId: 'a', measuredAt: null })!;
  ok(one.runs === 1, 'a 1-run baseline records 1 run — never a flattering 3');
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
