/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE RUN STAGGER — the predicate, and the three things that must still hold around it.

   🔴 WHAT CHANGED (2026-09-13). Repeat runs used to start only when the previous one FINISHED, so a
   client waited ~40 minutes from payment to measured. The gap was never a sampling safeguard: the
   runs were already ~4 minutes apart and the noise band was measured on runs 5-29 minutes apart
   (CLAUDE.md §25). They now start RUN_STAGGER_MS apart whether or not the previous one has landed.

   ⛔ THIS FILE PINS THE ARITHMETIC, NOT THE PLUMBING. The predicate lives in an edge function that
   talks to the database, so what is testable here is the decision it makes from the facts: how long
   since the newest run started, how many exist, how many are usable.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { RUN_STAGGER_MS } from '../supabase/functions/_shared/audit-baseline.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/** The predicate as advanceBaseline evaluates it, in the same order. */
function decide(i: { target: number; usable: number; started: number; msSinceNewest: number }):
  'finalise' | 'waiting_in_flight' | 'waiting_stagger' | 'waiting_no_data' | 'start_run' {
  /* The real order, clause for clause. Both waiting branches carry `usable < target`, so a finished
     audit falls past them to the finalise test at the bottom. */
  if (i.usable < i.target && i.started >= i.target) return 'waiting_in_flight';
  if (i.usable < i.target && i.started > 0 && i.msSinceNewest < RUN_STAGGER_MS) return 'waiting_stagger';
  /* ⛔ NOT "start run 1". advanceBaseline never opens a baseline — startPaidBaseline does, on the
     Stripe webhook. With zero runs this function has nothing to extend and says so. Modelling it as
     a start would describe a system that does not exist. */
  /* ⛔ AND IT ONLY BITES ONCE EVERY RUN HAS STARTED. Before the narrowing this fired whenever
     nothing had landed yet — which under a stagger is the NORMAL case three minutes in — and run 2
     would have kept waiting for run 1. The stagger would have looked present and done nothing. */
  if (i.usable === 0 && i.started === 0) return 'waiting_no_data';
  if (i.usable >= i.target) return 'finalise';
  return 'start_run';
}

console.log('-- the stagger is three minutes, and it is measured not picked --');
ok(RUN_STAGGER_MS === 180_000, 'RUN_STAGGER_MS is 3 minutes');
ok(RUN_STAGGER_MS > 60_000, 'and never below a minute — under that there is no measured behaviour to appeal to');

console.log('\n-- the decision --');
const T = 3;
ok(decide({ target: T, usable: 0, started: 0, msSinceNewest: 0 }) === 'waiting_no_data',
   "no runs at all -> waiting_no_data (run 1 is startPaidBaseline's job, never this one)");
ok(decide({ target: T, usable: 0, started: 1, msSinceNewest: 1_000 }) === 'waiting_stagger', '1s after run 1 -> wait');
ok(decide({ target: T, usable: 0, started: 1, msSinceNewest: 179_999 }) === 'waiting_stagger', 'a millisecond early -> wait');
ok(decide({ target: T, usable: 1, started: 1, msSinceNewest: 180_000 }) === 'start_run', 'at exactly 3 min -> start run 2');
/* ⛔ THE POINT OF THE WHOLE CHANGE: run 2 starts while run 1 is STILL RUNNING. Under the old rule
   this case returned waiting_in_flight and the client waited for run 1 to land. */
ok(decide({ target: T, usable: 1, started: 1, msSinceNewest: 200_000 }) === 'start_run',
   'run 1 landed, 3+ min gone -> start run 2');
/* ⛔ THE CHANGE ITSELF: run 1 has NOT landed (usable 0 of the started 2) and run 3 starts anyway.
   Under the old rule this returned waiting_in_flight and the client waited. */
ok(decide({ target: T, usable: 1, started: 2, msSinceNewest: 200_000 }) === 'start_run', '3 min after run 2 -> start run 3 while run 2 is still going');

console.log('\n-- and it stops at the target --');
/* ⛔ WITHOUT THIS THE STAGGER WOULD FAN OUT FOR EVER: every tick past the last run is 3+ minutes
   since the newest start, so "all runs started" must be checked BEFORE the stagger. */
ok(decide({ target: T, usable: 0, started: 3, msSinceNewest: 9_999_999 }) === 'waiting_in_flight',
   'all 3 started, none landed, hours later -> wait, never a 4th run');
ok(decide({ target: T, usable: 2, started: 3, msSinceNewest: 9_999_999 }) === 'waiting_in_flight', '2 of 3 landed -> still waiting');
ok(decide({ target: T, usable: 3, started: 3, msSinceNewest: 9_999_999 }) === 'finalise', 'all 3 usable -> finalise');
/* Overlap means runs can land out of order; completion counts usable runs, never "the previous one
   finished", so a finished-late run 1 cannot block the freeze. */
ok(decide({ target: T, usable: 3, started: 4, msSinceNewest: 0 }) === 'finalise', 'a 4th run existing does not stop the freeze');

console.log('\n-- a single-run audit is untouched --');
ok(decide({ target: 1, usable: 0, started: 1, msSinceNewest: 0 }) === 'waiting_in_flight', 'target 1: never a second run');
ok(decide({ target: 1, usable: 1, started: 1, msSinceNewest: 0 }) === 'finalise', 'target 1: finalises on the one run');

console.log("-- the case the narrowing exists for --");
/* ⛔ THE REGRESSION THIS PINS: run 1 started 3+ minutes ago and has NOT landed. If this ever returns
   waiting_no_data again, the stagger is inert and every client is back to ~40 minutes. */
ok(decide({ target: 3, usable: 0, started: 1, msSinceNewest: 200_000 }) === 'start_run',
   'run 1 started 3+ min ago and has NOT landed -> start run 2 anyway');
ok(decide({ target: 3, usable: 0, started: 2, msSinceNewest: 200_000 }) === 'start_run',
   'two started, none landed, 3+ min -> start run 3 anyway');
ok(decide({ target: 3, usable: 0, started: 3, msSinceNewest: 200_000 }) === 'waiting_in_flight',
   'all three started, none landed -> wait, never a fourth');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
