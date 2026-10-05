# manual-onboarding — the "pre-existing failure" (2026-10-05)

Branch `fix/manual-onboarding-test`, off `origin/main` `b812af1f`. Not merged, not deployed.

## What failed

One assertion in `scripts/manual-onboarding.test.ts`, section *SAME QUESTIONS*: every question text in
the operator's manual onboarding (`ONBOARDING_COPY`, `src/lib/manualOnboarding.ts`) must appear
word-for-word in the customer flow (findable-site `src/components/OnboardingFlow.tsx`). Missing:

> Each main service gets its own clear page. The towns you list tell us where to measure you and
> where real local pages make sense. That's the last thing we need.

## Root cause — neither the code nor the test was wrong

The test reads findable-site from the sibling folder `../findable-site`. In the worktree layout that is
`C:\Users\paulj\LeadFinderOS-wt\findable-site`, a **junction to `findable-site-wt/main-mirror`**, a
detached checkout at `4486079` (2026-10-02) — **3 commits behind findable-site `origin/master`**
(`f23d42e`).

The wording was changed on purpose, in both repos together, by fix/04 (the AI-measurement workstream):
LeadFinderOS `6c5409a4` and findable-site `31ab2c1` ("drop the page-per-town promise"). Both are merged.
findable-site master has the new sentence, byte for byte. The stale mirror still has the old one
("Each service becomes its own page on your site … one per town you want work from"), which is the
retired page-per-town promise.

So the production code is current and correct, the test is correct, and the failure came from the
out-of-date mirror copy the test compared against. Changing the code back to the mirror's wording would
have put the retired promise back.

## Change

- `scripts/manual-onboarding.test.ts`: the failure message now names the findable-site folder it
  compared against and points at `FINDABLE_SITE_DIR`, so the next stale-mirror failure explains itself.
  No assertion was changed.
- No production code was changed.
- `main-mirror` was **not** advanced (other sessions read it through the junction). Advancing it to
  findable-site `origin/master` makes the suite green with no environment variable.

## Tests run

Against a clean export of findable-site `origin/master` (`FINDABLE_SITE_DIR`):
- `manual-onboarding`: all assertions pass (65 of 65 strings found).
- Full `npm run check`: typecheck 9 errors = baseline 9 · edge syntax (470 files) OK · edge undefined
  (68 entrypoints) OK · import graph 0 unresolved, 0 edge-closure faults · build OK ·
  **313/313 suites passed**.

Against the default (stale) sibling mirror: `onboarding` 2/3 (manual-onboarding is the one failure),
`welcome` 3/3, `payment` 4/4, `client-state` 1/1.

## Rule

A cross-repo wording test that fails is first a question about **which** findable-site it read. Check
the mirror is at `origin/master` before changing either side.
