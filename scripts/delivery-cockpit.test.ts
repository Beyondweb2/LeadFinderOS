/* ============================================================
   THE DELIVERY COCKPIT'S CLOCK — regression suite (2026-08-18).

   The 8-week re-measure date is the guarantee clock; the whole business turns on it being visible
   and correct. Its arithmetic (UTC, no BST drift — CLAUDE.md §4) and its amber/red thresholds are
   pinned here, driven with a fixed `nowMs` so the test is deterministic (no Date.now in the lib).
   ============================================================ */
import {
  addDaysISO, defaultRemeasureDue, remeasureStatus, checklistDone,
  REMEASURE_OFFSET_DAYS, REMEASURE_AMBER_DAYS, DELIVERY_CHECKLIST_ITEMS,
} from '../src/lib/deliveryCockpit.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

console.log('── The 8-week default ──');
ok(REMEASURE_OFFSET_DAYS === 56, 'offset is 56 days (8 weeks)');
ok(defaultRemeasureDue('2026-08-11') === '2026-10-06', 'RG: baseline 11 Aug → due 6 Oct');
ok(addDaysISO('2026-08-11', 56) === '2026-10-06', 'addDaysISO 56d');

console.log('── UTC, no BST drift (the end-of-day-UTC bug) ──');
// 25 Oct 2026 is the BST→GMT switch; adding days across it must not shift the day.
ok(addDaysISO('2026-10-20', 10) === '2026-10-30', 'crossing the DST boundary keeps the day exact');
ok(addDaysISO('2026-02-28', 1) === '2026-03-01', 'month boundary (2026 not a leap year)');
ok(addDaysISO('2026-08-11T15:00:00Z', 56) === '2026-10-06', 'a full-ISO baseline still yields a clean date');

console.log('── The traffic light (amber ≤7, red overdue) ──');
const at = (dueISO: string, nowISO: string) => remeasureStatus(dueISO, day(nowISO));
ok(at('2026-10-06', '2026-08-18').state === 'ok', 'seven weeks out = green');
ok(at('2026-10-06', '2026-09-29').state === 'amber' && at('2026-10-06', '2026-09-29').daysUntil === 7, 'exactly 7 days out = amber (boundary inclusive)');
ok(at('2026-10-06', '2026-09-28').state === 'ok', '8 days out = still green');
ok(at('2026-10-06', '2026-10-06').state === 'amber' && at('2026-10-06', '2026-10-06').label === 'due today', 'due today = amber, not red');
ok(at('2026-10-06', '2026-10-07').state === 'red' && at('2026-10-06', '2026-10-07').label === 'overdue by 1 day', 'one day past = red');
ok(at('2026-10-06', '2026-10-16').state === 'red' && at('2026-10-06', '2026-10-16').daysUntil === -10, 'ten days past = red, daysUntil negative');
ok(remeasureStatus(null, day('2026-08-18')).state === 'none', 'no due date = none, never a false green');
ok(REMEASURE_AMBER_DAYS === 7, 'amber threshold is 7 days');

console.log('── Checklist counting (unknown keys ignored) ──');
ok(checklistDone(null) === 0, 'null checklist = 0');
ok(checklistDone({}) === 0, 'empty = 0');
ok(checklistDone({ directories: true, pages: true, gbp: false }) === 2, 'counts only the trues among known items');
ok(checklistDone({ directories: true, bogus: true } as Record<string, boolean>) === 1, 'an unknown key never inflates the count');
ok(DELIVERY_CHECKLIST_ITEMS.length === 5 && DELIVERY_CHECKLIST_ITEMS.map((i) => i.key).includes('remeasure'), 'five milestones incl. re-measure');

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
