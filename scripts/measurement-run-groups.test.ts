/* ════════════════════════════════════════════════════════════════════════════════════════════════
   GROUPING RUNS INTO MEASUREMENTS — driven with RG's real shape, which is the shape that broke.

   Run: npx tsx scripts/measurement-run-groups.test.ts

   ⛔ THE ONE THIS EXISTS FOR: RG's measurement audit holds FIVE runs — three on 26 Aug plus single
   runs appended on 1 Sep and 8 Sep. Grouping by audit would offer all five as "the measurement",
   so ticking it would compare a date against itself. Grouping by day alone would merge two
   different audits measured on the same day. The group has to be audit × day.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  CELLS_PER_RUN,
  describeGroup,
  groupMeasurementRuns,
  pruneSelection,
  sideCellsPerQuestion,
  sideProvable,
  type AuditForGrouping,
  type RunForGrouping,
  defaultSelection,
} from '../src/lib/measurementRunGroups.ts';
import { MIN_CELLS_FOR_QUESTION_CLAIM } from '../src/lib/measurementCompare.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/* RG's real shape, from the live database 2026-09-08. */
const PROSPECT = '9f78ce36', BASELINE = 'f64920ce', MEASURE = 'f0aaa9cd';
const run = (id: string, audit: string, n: number, at: string, questions: number): RunForGrouping =>
  ({ id, audit_id: audit, run_number: n, created_at: at, questions });

const runs: RunForGrouping[] = [
  run('p1', PROSPECT, 1, '2026-07-29T09:46:00Z', 3),
  run('p2', PROSPECT, 2, '2026-08-11T06:48:00Z', 3),
  run('b1', BASELINE, 1, '2026-08-11T15:00:00Z', 12),
  run('b2', BASELINE, 2, '2026-08-11T15:05:00Z', 12),
  run('b3', BASELINE, 3, '2026-08-11T15:19:00Z', 12),
  run('m1', MEASURE, 1, '2026-08-26T06:50:00Z', 12),
  run('m2', MEASURE, 2, '2026-08-26T07:00:00Z', 12),
  run('m3', MEASURE, 3, '2026-08-26T07:07:00Z', 12),
  run('m4', MEASURE, 4, '2026-09-01T03:09:00Z', 12),
  run('m5', MEASURE, 5, '2026-09-08T05:50:00Z', 12),
];
const audits: AuditForGrouping[] = [
  { id: PROSPECT, baseline_target_runs: null, is_measurement: false },
  { id: BASELINE, baseline_target_runs: 3, is_measurement: false },
  { id: MEASURE, baseline_target_runs: 3, is_measurement: true },
];

const groups = groupMeasurementRuns(runs, audits);
const byKey = (k: string) => groups.find((g) => g.key === k)!;

console.log('── THE GROUPS RG ACTUALLY HAS ──');
ok(groups.length === 6, `six groups, not three audits and not five days (got ${groups.length})`);
for (const g of groups) console.log(`   ${g.day}  audit ${g.auditId}  runs ${g.runNumbers.join('+')}  ${describeGroup(g)}${g.shortfall ? '  SHORTFALL' : ''}`);

console.log('\n── THE FIVE-RUN AUDIT SPLITS BY DAY ──');
ok(byKey(`${MEASURE}:2026-08-26`).runCount === 3, '26 Aug is a 3-run group');
ok(byKey(`${MEASURE}:2026-09-01`).runCount === 1, '1 Sep is its own 1-run group');
ok(byKey(`${MEASURE}:2026-09-08`).runCount === 1, '8 Sep is its own 1-run group');
ok(groups.filter((g) => g.auditId === MEASURE).length === 3,
  'so the five-run audit offers THREE separately tickable measurements, never one block of five');
/* The bug this prevents: ticking "the measurement" and silently including the later runs. */
ok(!byKey(`${MEASURE}:2026-08-26`).runIds.includes('m4'),
  'the 26 Aug group does NOT contain the 1 Sep run');
ok(!byKey(`${MEASURE}:2026-08-26`).runIds.includes('m5'),
  'nor the 8 Sep run — otherwise a side would be compared against itself');

console.log('\n── AND TWO AUDITS ON ONE DAY STAY APART ──');
ok(byKey(`${PROSPECT}:2026-08-11`).runCount === 1 && byKey(`${BASELINE}:2026-08-11`).runCount === 3,
  '11 Aug holds a 1-run prospecting group AND the 3-run baseline, kept separate (different question sets)');
ok(byKey(`${PROSPECT}:2026-08-11`).questions === 3 && byKey(`${BASELINE}:2026-08-11`).questions === 12,
  'and their question counts differ, which is why merging them would be wrong');

console.log('\n── RUN COUNT AND CELL ARITHMETIC ──');
ok(CELLS_PER_RUN === 2, 'two scored engines per run');
ok(byKey(`${BASELINE}:2026-08-11`).cellsPerQuestion === 6, 'a 3-run group is 6 answer cells per question');
ok(byKey(`${MEASURE}:2026-09-08`).cellsPerQuestion === 2, 'a 1-run group is 2');
ok(sideProvable(6), '6 cells supports a per-question claim');
ok(!sideProvable(2), '2 does not — which is why a 1-run side reads unproven whatever it shows');
ok(!sideProvable(MIN_CELLS_FOR_QUESTION_CLAIM - 1) && sideProvable(MIN_CELLS_FOR_QUESTION_CLAIM),
  'and the threshold is exactly the comparison fold\'s MIN_CELLS_FOR_QUESTION_CLAIM — the picker warns on the same rule the result applies');

console.log('\n── COMBINING GROUPS INTO ONE SIDE ──');
ok(sideCellsPerQuestion([byKey(`${MEASURE}:2026-09-01`), byKey(`${MEASURE}:2026-09-08`)]) === 4,
  'two 1-run groups pooled make 4 cells — two thin days CAN make a provable side');
ok(sideCellsPerQuestion([]) === 0, 'an empty side contributes nothing, never a phantom cell');

console.log('\n── SHORTFALL: FEWER RUNS THAN THE AUDIT WAS CONFIGURED FOR ──');
ok(byKey(`${MEASURE}:2026-09-08`).shortfall === true, '1 of a target 3 is a shortfall');
ok(byKey(`${MEASURE}:2026-08-26`).shortfall === false, '3 of 3 is not');
ok(byKey(`${PROSPECT}:2026-07-29`).shortfall === false,
  'a single-run PROSPECTING audit is not a shortfall — it was never meant to repeat');
{
  /* Absence is not evidence of a missing run: an audit we did not fetch has no known target. */
  const g = groupMeasurementRuns([run('x1', 'unknown-audit', 1, '2026-09-01T00:00:00Z', 5)], audits);
  ok(g[0].targetRuns === null && g[0].shortfall === false,
    'a run whose audit is absent still groups, with no target and NO shortfall warning');
  ok(g[0].isMeasurement === false, 'and is not claimed to be a measurement');
}

console.log('\n── ORDER AND KEYS ──');
ok(groups[0].day === '2026-07-29', 'oldest first — the before side is at the top');
ok(groups[groups.length - 1].day === '2026-09-08', 'newest last');
ok(new Set(groups.map((g) => g.key)).size === groups.length, 'keys are unique (safe as React keys)');
ok(groups.every((g) => g.key === `${g.auditId}:${g.day}`), 'and stable across reloads — no array index in them');

console.log('\n── A PERSISTED SELECTION IS PRUNED, NEVER SILENTLY SHRUNK ──');
const live = new Set(runs.map((r) => r.id));
ok(JSON.stringify(pruneSelection(['b1', 'b2', 'b3'], live)) === JSON.stringify(['b1', 'b2', 'b3']),
  'a still-valid selection restores intact');
ok(JSON.stringify(pruneSelection(['b1', 'deleted', 'b3'], live)) === JSON.stringify(['b1', 'b3']),
  'a run that no longer exists is dropped');
ok(pruneSelection(['gone-1', 'gone-2'], live).length === 0,
  'and a wholly stale selection restores as empty rather than as a phantom side');
ok(pruneSelection([], live).length === 0, 'an empty saved selection stays empty');

console.log('\n── DEGENERATE INPUT ──');
ok(groupMeasurementRuns([], audits).length === 0, 'no runs, no groups');
ok(groupMeasurementRuns([{ id: '', audit_id: 'a', run_number: 1, created_at: '2026-01-01' }], audits).length === 0,
  'a run with no id is skipped rather than grouped under a blank key');
ok(groupMeasurementRuns([{ id: 'r', audit_id: '', run_number: 1, created_at: '2026-01-01' }], audits).length === 0,
  'so is one with no audit');

console.log('\n── THE DEFAULT SELECTION: RG\'S REAL SHAPE ──');
{
  const d = defaultSelection(groups);
  console.log('   ' + d.note);
  ok(d.reason === 'measurements', 'it picks COMPLETE MEASUREMENTS, not the oldest and newest days');
  /* The whole point: the old default took the 29 Jul 3-question probe and the 8 Sep single run. */
  ok(JSON.stringify(d.before) === JSON.stringify(['b1', 'b2', 'b3']), 'BEFORE = all three 11 Aug baseline runs');
  ok(JSON.stringify(d.after) === JSON.stringify(['m1', 'm2', 'm3']), 'AFTER = all three 26 Aug measurement runs');
  ok(!d.before.includes('p1') && !d.before.includes('p2'), 'the 3-question prospecting runs are NOT in the before side');
  ok(!d.after.includes('m4') && !d.after.includes('m5'), 'nor the 1 Sep / 8 Sep single appended runs in the after side');
  ok(d.before.length === 3 && d.after.length === 3, 'three runs each side — a clean 3-vs-3');
}

console.log('\n── THE DEFAULT DEGRADES HONESTLY ──');
{
  const thin = groupMeasurementRuns([
    run('x1', PROSPECT, 1, '2026-07-29T09:46:00Z', 3),
    run('y1', MEASURE, 4, '2026-09-01T03:09:00Z', 12),
    run('y2', MEASURE, 5, '2026-09-08T05:50:00Z', 12),
  ], audits);
  const d = defaultSelection(thin);
  ok(d.reason === 'largest_question_set', 'with no complete measurement it uses the biggest question set');
  ok(JSON.stringify(d.before) === JSON.stringify(['y1']) && JSON.stringify(d.after) === JSON.stringify(['y2']),
    'the two 12-question runs, not the 3-question probe');
  ok(/No two complete measurements/.test(d.note), 'and the note says so rather than implying a measurement');
}
{
  const one = groupMeasurementRuns([run('z1', MEASURE, 1, '2026-09-01T00:00:00Z', 12)], audits);
  const d = defaultSelection(one);
  ok(d.reason === 'none' && d.before.length === 0 && d.after.length === 0,
    'a single group ticks NOTHING — never one side against itself');
}
ok(defaultSelection([]).reason === 'none', 'no groups, no selection');
{
  const flat = groupMeasurementRuns([
    run('q1', 'audit-a', 1, '2026-01-01T00:00:00Z', 0),
    run('q2', 'audit-b', 1, '2026-02-01T00:00:00Z', 0),
  ], []);
  const d = defaultSelection(flat);
  ok(d.reason === 'oldest_newest', 'falls back to oldest vs newest as the last resort');
  ok(/oldest measured day/.test(d.note), 'and says that is what it did');
}
{
  for (const gs of [groups, groupMeasurementRuns([run('a', MEASURE, 1, '2026-01-01T00:00:00Z', 12), run('b', MEASURE, 2, '2026-02-01T00:00:00Z', 12)], audits)]) {
    const d = defaultSelection(gs);
    ok(typeof d.note === 'string' && d.note.length > 10, `reason '${d.reason}' carries a readable note`);
  }
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
