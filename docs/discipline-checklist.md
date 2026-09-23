# The discipline checklist — the original §3

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §3 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: The typecheck baseline is **9 errors**, enforced as a LIST by `scripts/check-typecheck-baseline.mjs` — "14" is stale.
> ⚠️ Corrected 2026-09-16: `deno check` cannot be run here (Deno is not installed); `scripts/check-edge-syntax.mjs` + `check-edge-undefined.mjs` are the local edge gates and the deploy is the real one.
> ⚠️ Corrected 2026-09-16: `generate-barber-site` was deleted from the repo on 2026-09-09; its "3 pre-existing errors" line is void.
> ⚠️ Corrected 2026-09-16: The commit trailer now names the model the session is actually running (CLAUDE.md §3), not a fixed "Opus 5".

## 3. The discipline checklist

Recon:
- [ ] Read the actual files before editing. Do not re-recon what a brief tells you is already verified.
- [ ] Grep to verify a list you were handed. Previous sessions got the reader list wrong three times.
- [ ] 🔴 **ANY PLAN APPROVED FOR BUILD MUST HAVE ITS NUMBERS RE-DERIVED FROM THE LIVE DATABASE BY
      THE SESSION THAT BUILDS IT.** Paul's rule, 2026-08-14, after the SECOND crossed-session
      approval: one referenced functions this repo does not contain (`deriveMarketState`), the
      other quoted populations that do not exist in production ("the 302", "Locksmith In"). An
      approval names intent; the building session re-establishes every fact. Both incidents were
      caught by grepping for the named symbols and counting the named rows FIRST — do that before
      accepting any scoped plan, including your own from an earlier session.

Git:
- [ ] `git fetch origin`, then prove `origin/main == HEAD` **before** branching. Print both.
- [ ] Branch per task off `main`. Branches are kept, never deleted.
- [ ] Prove every git step with **real command output**, using **variables** (`$o = (git rev-parse origin/main)`)
      — never a hand-typed hash.
- [ ] Prove `origin` is still unmoved immediately **before** pushing.
- [ ] **NEVER edit a source file with a PowerShell `Get-Content` / `Set-Content` round-trip.** Proven
      2026-07-30: removing a block from `AiAudit.tsx` that way double-encoded **194 lines** of
      non-ASCII (em dashes, curly quotes) — `Get-Content` decoded UTF-8 as cp1252 and `Set-Content`
      re-encoded the mojibake, also adding a BOM. Caught by the diff jumping to 296/465 and a
      `Select-String 'â€|â”€'` grep. Reversible (`GetEncoding(1252).GetBytes` → `UTF8.GetString`,
      write with `UTF8Encoding($false)`) but do not create the problem: use the Edit tool.
      🔴 **BIT AGAIN 2026-08-14, on THIS file, via a "harmless" one-line `-replace`** (commit
      `e488133b`): 640 lines mojibaked AND the intended correction silently never applied — the
      regex was built from real UTF-8 text and could not match the mis-decoded string, so the
      commit was pure damage that LOOKED like a fix. Caught a day later only because an Edit-tool
      old_string stopped matching. There is no safe PowerShell text edit on this repo's files;
      the rule has no exceptions for edits that look too small to matter.
- [ ] Commit with `-F <file>` (PowerShell mis-parses multi-line `-m`). End with:
      `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- [ ] Merge `--no-ff`.
- [ ] **Never stage `HANDOFF.md`, `ONBOARDING.md`, `HANDOVER_NEXT.md`, `RECON_PAGEDB.md` or
      `RECON_FOR_CLAUDE.md`.** Untracked on purpose. Stage files explicitly; never `git add -A` blind.

Checks:
- [ ] `npm run typecheck` — **baseline is 14 errors** (was 15 until 2026-07-30; one `TS2352` cast in
      `useOutreach.ts` went away when three hand-rolled lead updates became one function). Flag any
      change from 14. Do not "fix" the 14.
      **Compare the error LISTS, not the counts.** A count that matches can still hide one new error
      masking one removed one. `... | Select-String "error TS" | ForEach-Object {...} | Sort-Object`
      into a file for each side, then `Compare-Object`.
- [ ] **`npm run typecheck` PASSING AT BASELINE DOES NOT MEAN IT COMPILES.** Proven 2026-07-30: a
      stray backtick inside `playbookDoc.ts`'s CSS template literal terminated the string early and
      broke the Vite build outright — and `tsc` still reported exactly 14, the clean baseline. Vite
      (SWC) said "Expected a semicolon"; tsc recovered and reported the same 14 semantic errors.
      **Always run `npm run build` as well** — it is the only check that catches this class of fault.
      Related: never put a backtick inside a template literal, even in a comment inside one.
      🔴 **THAT LAST SENTENCE BIT AGAIN ON 2026-09-12, IN `aiAuditReportHtml.ts`, IN AN HTML COMMENT
      EXPLAINING THE CODE.** Writing `` `startBtn` `` inside a `<!-- -->` that lives inside the
      returned template literal TERMINATED THE STRING, and tsc reported nine syntax errors — the
      same COUNT as the clean baseline, so a count-only check would have read green. **Put prose
      about a template literal OUTSIDE it**, or name variables without backticks.
- [ ] **`deno check --sloppy-imports` on EVERY changed edge function file.** Capture the exit code
      **directly**, not through a pipe — a pipe reports the pipe's status, not Deno's.
      **`npm run typecheck` does NOT cover `supabase/functions`.** That gap put checkout down for 15 hours.
- [ ] `generate-barber-site` has 3 **pre-existing** supabase-js generics errors (~lines 59/693/895). Prove
      pre-existing with `git stash` + re-check. Don't fix them.
- [ ] `google-place-details` has **4 pre-existing** errors (1 × `TS2353` on `logUsage`'s insert, 3 ×
      `TS2345` passing the client to `logUsage`). Proven by `git stash` 2026-07-30. Line numbers move
      as the file changes — **match on the message, not the line.**

Deploy:
- [ ] **SQL FIRST, CONFIRMED, THEN DEPLOY.** When a task involves both SQL and code that depends on
      it, **run the SQL (§2) and verify it by reading the schema back** before deploying anything
      that reads or writes the new schema. If you cannot run it, hand it to Paul and **WAIT for his
      confirmation** — "assume the columns exist" is not confirmation either way. Proven 2026-08-04: `findable-onboarding` v18
      deployed before its five new columns existed and **every submission — including ones carrying
      no new fields — died `save_failed` for ~20 minutes**, because the insert always carried the new
      keys and the single-pass column-shedding fallback couldn't recover. The fix (v19) also made the
      code defensive both ways: null-valued new keys are omitted from inserts, and the fallback is
      multi-pass. "Assume the columns exist" is not confirmation.
- [ ] Edge functions **do not auto-deploy**: `npx supabase functions deploy <name>` by hand.
- [ ] **Redeploy every function that imports a shared module you changed**, and prove each one. They keep
      running old code until you do.
- [ ] SPA auto-deploys on push to `main` (Cloudflare Pages) to **`leadfinderos-next.pages.dev`** —
      verify THERE by bundle marker (`node scripts/verify-live.mjs`). ⛔ Never against the legacy
      `leadfinderos.pages.dev`, which is frozen on an old bundle and always looks "not live".
- [ ] 🔴 **findable-site DOES NOT. IT HAS NO CI AT ALL — `npm run deploy` IS THE ONLY WAY IT SHIPS.**
      `"deploy": "astro build && npx wrangler pages deploy dist --project-name=findable-site"`.
      There is no `.github/workflows`, no git integration, nothing watching `master`.
      🔴 **THIS COST TWO ROUNDS ON 2026-09-13.** The hero-button commit was pushed, confirmed on
      `origin/master`, and then watched for twenty minutes on a domain that was never going to
      change — reported to Paul twice as "Cloudflare is sitting on the build", which §4 makes an
      easy and wrong thing to believe. The assumption was that both repos behave like this one.
      ⛔ **THE TELL, AND IT WAS IN THE FIRST PROBE: `findable-site.pages.dev` WAS ALSO STALE.**
      A slow production rollout off a SUCCESSFUL build shows the new content on the preview domain
      first. **Both stale means nothing was ever deployed**, not that deploying is slow. Check the
      preview domain before blaming the pipeline, and if it is stale too, stop waiting.
      ⚠️ And `npm run deploy` ships whatever is in the working tree at HEAD, not the commit you
      pushed — wrangler warns `--commit-dirty` for exactly that reason. Build, verify the dist, then
      deploy.

---

