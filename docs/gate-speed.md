# Full gate speed (2026-11-10, branch `chore/claude-md-cleanup`)

`npm run check` = typecheck vs baseline · edge syntax · edge undefined names · import graph · vite build · every suite in
`scripts/*.test.ts` + `check-cross-repo-sync.mjs`. Nothing was removed from it; the same 497 suites run and are graded the same way.

## Why it was slow (measured before the change, 16-core PC, other sessions possibly busy)

| Step | Before |
|---|---|
| typecheck vs baseline | 32 s |
| edge syntax + undefined + import graph | 9 s |
| vite build | 23 s |
| tests (497 suites, 8 workers) | 270 s |
| **Total (all serial)** | **335 s** |

- **The test launcher, not the tests.** Median suite 4.2 s, but a suite's own work is well under a second. `tsx` was not a dependency,
  so every suite ran `cmd.exe → npx → npm (finds tsx in the npx cache, may ask the registry) → tsx CLI → node` — four processes and an
  npm boot, ~500 times. Sum of suite times: 2,152 s.
- Fixed 8 workers on a 16-core machine.
- Every step ran one after another; none reads another's output (no suite reads `dist/`).
- `test:changed` started a separate runner per selected suite, in series.
- One genuinely slow suite: `exhaustive-crawl.test.ts` (41 s; real crawl-logic work, left alone).

## What changed (nothing checks less)

1. `tsx` is a pinned devDependency (4.23.15, the version npx was fetching). The runner starts each suite as
   `node --import tsx <file>` (one process, no shell). No local tsx → it falls back to `npx tsx`, never to a skip.
2. Workers = cores − 2 (cap 14). `TEST_CONCURRENCY=<n>` overrides it when other sessions are running gates.
3. Slowest suites from the last run start first (`node_modules/.cache/run-tests-timings.json`; order cannot change a result).
4. `npm run check` = `scripts/gate.mjs`: all six steps in parallel; every step runs to the end; any red step fails the gate (the old
   `&&` chain stopped at the first red step and hid the rest). The old serial chain stays as `npm run check:serial`.
5. Typecheck runs the local tsc with `--incremental` (cache in `node_modules/.cache`). tsc re-reports cached errors, so the baseline
   comparison sees the same list; a tsc that dies without a TS error is a failure, never "0 errors".
6. `test:changed` runs all its selected suites in ONE parallel runner call (`run-tests.mjs --exact …`).
7. `npm test -- --slowest` prints the 15 slowest suites.

## After

Same machine, same day, one full run (`npm run check`), cold typecheck cache:

| Step (now in parallel) | Before | After |
|---|---|---|
| typecheck vs baseline | 32 s | 49 s cold (CPU shared with the other steps) · **3 s warm** |
| edge checks | 9 s | 23 s (in parallel) |
| vite build | 23 s | 34 s (in parallel) |
| tests, 497 suites | 270 s | **30 s** (497/497 pass, as before) |
| **Total wall clock** | **335 s** | **49 s** (expect ~35 s once the typecheck cache is warm) |

Median suite 4.2 s → ~0.4 s. The long pole is now the cold typecheck, then `exhaustive-crawl.test.ts` (30 s).
Checked: a suite printing `FAIL` and a suite that throws both still fail `npm test` and `npm run test:changed` (exit 1);
a warm incremental typecheck reports the identical 9-error baseline list.

## Not done (ideas, not needed now)

- Merging the ~500 suites into fewer processes would save more, but suites share globals and call `process.exit`; not safe.
- `exhaustive-crawl.test.ts` could be split; it is one suite on one worker and no longer sets the wall clock.

## Trap found on the way

The primary checkout's `node_modules` was behind `package-lock.json` (no `exceljs`), so a worktree junctioned to it failed typecheck
and build on clean `origin/main`. Run `npm ci` in your own worktree unless the primary's is current.
