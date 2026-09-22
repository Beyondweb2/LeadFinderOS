# CLAUDE.md — the rules. Short on purpose.

**Read all of it — it is ~600 lines and it is the memory you don't have.** It holds RULES and
POINTERS. The stories behind them — every dated session record, every incident narrative, every
number that was measured on a particular day — live in **`docs/`** and are read ON DEMAND, by topic.
`docs/INDEX.md` maps every old section number (§N) to its file; a "§N" inside `docs/` means the
original numbering.

⛔ **THE ONE RULE ABOUT THIS FILE: a session record goes in `docs/`; CLAUDE.md gets a rule or a
pointer, never the story.** If a paragraph here starts telling what happened on a date, it belongs
in `docs/`. Split 2026-09-16 from 5,219 lines / 448 KB (~110,000 tokens read at the start of every
session, most of why a prompt took 20–30 minutes) to this. Keep it here.

Facts and warnings, not prose. Correct a stale line when you find one; add a rule when you learn one.

---

## 0. State of play (2026-09-16)

- **Product:** Findable — AI visibility for local UK businesses (§1). **Two paying customers, RG
  Locksmiths and Ronnie's Shoe Repairs; SC Plumbing & Gas refunded.** Re-count before quoting.
- **Repo:** `main` auto-deploys the SPA to Cloudflare Pages on push. **Edge functions deploy by
  hand** (`npx supabase functions deploy <name>`) and keep running old code until you do.
- **Gate: `npm run check`** = typecheck-vs-baseline (9 deliberate errors, compared as a LIST) +
  `check-edge-syntax` + `check-edge-undefined` + `check-import-graph` + `npm run build` + `npm test`
  (113 suites). **Honest green is 109/113** — the four known-stale suites are `coverage-lead-counts`,
  `report-attribution`, `verdict`, `site-origin` (needs Deno). Read the FAILED names, never the count.
- **Deno is not installed.** `deno check` cannot run here; the deploy is the only real gate for an
  edge function (§3, §4).
- **The deep clean is in progress — Phase 3, steps 1–3 done (Feedback, SMS, Instantly; all in
  `main`).** `docs/deep-clean-phase3-plan.md` is the plan for the rest — contact discovery, tour/i18n,
  barber branches in live functions, the multi-user surface, the 20 orphan function deletes, the
  SQL and purges that go to Paul one statement at a time — **and Paul's standing decisions, which
  are not to be re-asked.** `INVENTORY_DEEP_CLEAN.md` (untracked) is the Phase 1 evidence. Dead and
  not to be built on: the barber/salon product, Instantly, Twilio/SMS, contact discovery, the
  Feedback page, the multi-user surface. 22 functions are deployed with no source (2 belong to the
  findable-directory repo and stay).
- **Other Claude sessions may share this checkout.** Do task work in a `git worktree`
  (`C:/Users/paulj/LeadFinderOS-wt/<task>`, junction `node_modules` and `../findable-site` in);
  never switch branches in the primary checkout while another session may be open.
- **Windows host.** PowerShell is primary, Git Bash is available. Working tree is CRLF, repo is LF
  (`core.autocrlf=true`) — match on LF-normalised text when scripting an edit.
- **SQL:** you can run it yourself (§2). Storage, RLS and crons are NOT locally testable — read back.

---

## 1. The business — current facts only

Full history and reasoning: `docs/business-and-offer.md`, `docs/measurement.md`.

- **Offer: £99 to start, then a monthly — and TWO tiers since 2026-09-17** (`plan_tier` on
  `onboarding_responses`, decided by the questionnaire's site-access answer, read server-side; the
  browser never decides money). **KEEP YOUR SITE:** £99 + **£29.99/month** (`FINDABLE_MONTHLY_GBP`),
  the default. **NEW SITE:** £99 + **£99/month for 12 months, then £29.99** (`FINDABLE_NEW_SITE_
  MONTHLY_GBP`, `FINDABLE_NEW_SITE_TERM_MONTHS`), build + hosting included, the site is theirs. The
  monthly is a real, delayed Stripe subscription (`_shared/delayed-subscription.ts`) starting the day
  the claim window closes (four-week results + 14 days) — for new-site it is a **subscription
  SCHEDULE** (phase 0 trial → phase 1 £99×12 → phase 2 £29.99 open-ended), so Stripe drops the price
  itself, **no month-13 code**. ⛔ **The guarantee is identical on both tiers and applies to the £99
  ONLY** (`REMEASURE_CLAIM_SENTENCE`, byte-locked); they keep the site either way. ⛔ **The £9.99
  hosting add-on is RETIRED for new sign-ups** — hosting is inside the £99/mo on new-site; only a
  LEGACY row (`plan_tier` null + old `website_addon`) still bills it.
- **Constants own the words:** `src/lib/findableOffer.ts` — `FINDABLE_SETUP_PRICE_GBP`,
  `FINDABLE_MONTHLY_GBP`, `FINDABLE_GUARANTEE` (236 chars), `REMEASURE_CLAIM_SENTENCE`,
  `CARD_SAVED_NOTICE`. findable-site carries its own copies; `scripts/check-cross-repo-sync.mjs`
  (exists in BOTH repos) fails the build on drift. Change one repo, change the other.
- ⛔ **No surface may name one figure without the other — EXCEPT the generic pricing card** (Paul,
  2026-09-17): the monthly is path-dependent (£29.99 keep / £99 rebuild+host), so the home-page card
  and `OFFER_COPY` name only **£99 to start** and say a monthly follows whose amount is chosen in the
  flow. PATH-SPECIFIC surfaces (the flow's site-access panel, the pay screen, /terms, /refunds, the
  FAQ) name both figures for that path. Do not "fix" the card back to a single monthly. ⛔ **Binding
  copy counts from the results, never "week six".** ⛔ **Never claim an SEO score.** "Reply to your
  reviews" is a real promise (needs the client's GBP access).
- **Guarantee is outcome-conditional:** measure before, re-measure at four weeks on the same
  questions and engines, **judged in the home town only**; if the number has not gone up, they
  email within 14 days of their results and get the £99 back. `findable.live/refunds` is the
  customer-facing authority. ⛔ **No hedge beside it** ("the engines decide", "anyone who promises is
  guessing") — a promise with a disclaimer stapled on reads as walking it back.
- **"Gone up" = `movement === 'improved'`, beyond `NOISE_BAND_PP`.** Inside the band qualifies for the
  refund. Paul's reading; do not soften to "unchanged".
- ⛔ **RG Locksmiths is pinned at 8 weeks** (legacy outcome guarantee, `remeasure_due_date`
  2026-10-06, stored by hand). The 28-day default (`REMEASURE_OFFSET_DAYS`) only fills a NULL date.
- **Delivery works exactly two ways:** their site is WordPress and we get access, or they let us move
  it to our hosting. `src/lib/serveGate.ts` decides serve/flag/block — **derived, never stored**;
  blocks only on an explicit `migrate='no'` AND a known hand-edit platform; `no_website` serves
  outright. `findable-checkout` refuses a blocked row before Stripe. findable-site keeps a hand-kept
  mirror — change both.
- **The measurement model (`docs/measurement.md` §19):**
  | | Shape | `audit_purpose` | Compared? |
  |---|---|---|---|
  | Hook / free check | 3 q × 1 run (free check 3 × 3) | `audit` / `free_check` | never |
  | Baseline | 12 q, home town, × 3 runs, frozen | `baseline` | the before side |
  | Full measure | 20 q × 3 across home + areas, DISJOINT | `measurement` | never |
  | Day-28 replay | the baseline's ASKED set verbatim × 3 | `remeasure` | the after side |
  Order is structural: the full measure starts only from `onBaselineFrozen`; a paying lead with no
  frozen baseline is refused (`409 baseline_not_frozen`). `outreach_leads.baseline_audit_id` /
  `remeasure_audit_id` are claimed by DB TRIGGERS, immutable once set; one replay per lead, ever.
- **The four-week results sender** (`_shared/remeasure-results.ts`) is claim-first on
  `remeasure_results_sent_at` and **holds behind `REMEASURE_RESULTS_COPY_APPROVED = false`** until Paul
  approves the copy. **RG is due 2026-10-06** — approve before then or his results hold.
- **Named = the model's verdict** (`self_named` from `extract-competitors`), string-match fallback,
  one ruler on both sides of a comparison (`src/lib/namedSignal.ts`). A name that is only trade +
  town is **not judgeable** (`nameIsJudgeable`, `_shared/derivable.ts`) — the report replaces its hero
  with Paul's wording, never a caveat under a false headline.

---

## 2. How Paul works

- **Non-technical.** He does ideation, scoping, plan review, product judgement. You write and run
  all code. **He never runs terminal commands.**
- **Plain English, no jargon. Lead with the answer. Questions at the very end.**
- **Plan first, then stop** for a new piece of work. Once approved, build the whole thing.
- **Hard stop and ask** before anything irreversible he has not already authorised: merges, pushes,
  SQL, deletions, payments, deploys, access changes. If the brief authorises it, proceed.
- **Any plan approved earlier must have its numbers re-derived from the live database by the
  session that builds it.** An approval names intent; the builder re-establishes every fact.
- ✅ **You can run SQL yourself, and he asked you to.** Route: `POST
  https://api.supabase.com/v1/projects/ruusxpkkmwtljxxulhbq/database/query` with `{"query": "..."}`
  and `Authorization: Bearer <token>`. **The token is in Windows Credential Manager** (`cmdkey /list`
  → target `Supabase CLI:supabase`; read it with a PowerShell `CredRead` P/Invoke into the session
  scratchpad). It is NOT at `~/.supabase/access-token`. Never echo it, never commit it.
  - Additive/idempotent DDL and read-only SELECTs: run them. **Anything destructive (drop, truncate,
    delete, rewrite rows): show him first.** If he says "SQL to me", hand him one copy-pasteable block.
  - **Verify by reading the schema back**, not by trusting the 201. Say what you verified.
  - Service-role DATA writes go through PostgREST with the **legacy `service_role` JWT**
    (`npx supabase projects api-keys --output json`) — `auth.role() = 'service_role'` is what some
    triggers (e.g. the `generated_sites` lock) accept; the Auth admin API and the postgres role are not.
- **Screenshots need him.** The in-app Browser pane does not display here; `read_page` /
  `get_page_text` / `javascript_tool` work. Use text proof and say nobody has *seen* it.
- **An authed page cannot load the normal way** (no session at localhost:8080; RLS blocks anon). If
  you must render one: a throwaway Vite harness patching `fetch` with the service key for Supabase
  URLs only, real hook + component in a `MemoryRouter`, read-only, deleted before commit, and tell him.
- **Report faithfully.** Tests failing → say so with output. Step skipped → say that. Done and
  verified → state it plainly.

---

## 3. The discipline checklist

**Recon**
- [ ] Read the actual files before editing. Grep to verify any list you were handed.
- [ ] Re-derive numbers from the live DB before building an approved plan (§2).
- [ ] Before asserting what a function receives, read its **callers**; before asserting a column is
      empty, read its **writer**. One layer is never enough.

**Git**
- [ ] `git fetch origin`; prove `origin/main == HEAD` **before** branching. Print both with variables,
      never a hand-typed hash. Branch per task off `main`; branches are kept.
- [ ] Work in a **worktree** when another session may be open (§0).
- [ ] ⛔ **Never edit a source file with a PowerShell `Get-Content`/`Set-Content` round-trip or
      `-replace`** — it mojibakes every non-ASCII character and can silently not apply. Twice recorded.
      Use the Edit tool, or a Node script that reads/writes UTF-8 explicitly.
- [ ] Commit with `-F <file>`. **End with `Co-Authored-By: Claude <the model this session is actually
      running, as the harness names it> <noreply@anthropic.com>`** — e.g. today `Claude Fable 5.1`.
      Never copy the trailer from an older commit.
- [ ] Merge `--no-ff`. Prove `origin` is unmoved immediately before pushing.
- [ ] **Never stage** `HANDOFF.md`, `ONBOARDING.md`, `HANDOVER_NEXT.md`, `RECON_*.md`,
      `INVENTORY_DEEP_CLEAN.md`, `SQL_FOR_PAUL_*.sql`, `scripts/_*.ts`. Stage files explicitly; never
      `git add -A`.

**Checks — run `npm run check` before claiming anything works, and know what it cannot see**
- [ ] Typecheck baseline is **9 errors as a LIST** (`scripts/typecheck-baseline.txt`). Do not fix them.
- [ ] tsc at baseline ≠ compiles — `npm run build` catches a stray backtick inside a template
      literal that tsc recovers from. ⛔ **Never put a backtick inside a template literal, not even in
      a comment or an HTML comment inside one.** Bitten three times.
- [ ] `npm run typecheck` does **not** cover `supabase/functions`. `check-edge-syntax.mjs` parses,
      `check-edge-undefined.mjs` catches an undefined NAME (TS2304 only), and
      **`check-import-graph.mjs` fails on a deleted or extensionless MODULE import in any gated file
      and on `@/` inside an edge closure.** `node scripts/check-import-graph.mjs --reached-by <file>`
      prints the redeploy list for a shared module; `--orphans` lists files nothing imports. Types
      are still the deploy's job.
- [ ] Every `src/lib` file reachable from an edge function uses **relative imports with an explicit
      `.ts`** — never `@/`, never extensionless. Grep the closure before deploying.
- [ ] Tests for code you delete are deleted in the same commit. New client-facing renderer → add it to
      `client-copy-claims.test.ts`; new operator screen → its `OPERATOR_SCREENS`.

**Deploy**
- [ ] **SQL first, confirmed by read-back, then deploy** anything that reads/writes the new schema.
- [ ] Edge functions do not auto-deploy. After changing a shared module (`_shared/`, `src/lib/`),
      **walk the transitive import closure and redeploy every function that reaches it — then NAME
      THEM in the report.** Follow real `from "…"` statements, not `grep -l` (matches comments).
- [ ] Verify a deploy by a marker **only the new code produces** (§4). For `send-whatsapp-message`
      the OPTIONS preflight returns `x-swm-build`/`x-swm-caps` — bump `BUILD_ID` in the same commit.
- [ ] A **new edge function gets its `config.toml` `verify_jwt` entry in the same commit.** Absent =
      platform default TRUE = internal callers die silently the day a key rotates.
- [ ] **Deploy order is a price guard:** when a price RISES deploy display before charge; when it
      FALLS, charge before display. Ask which way the gap embarrasses you.
- [ ] 🔴 **findable-site has NO CI.** `npm run deploy` (astro build + wrangler) is the only way it
      ships, and it ships the working tree. If `findable-site.pages.dev` is also stale, nothing was
      deployed — stop waiting for Cloudflare.

---

## 4. Traps — the rules. The incidents behind each are in `docs/traps.md` (§4) unless pointed elsewhere.

**Verifying**
- **The deploy check:** fetch the live HTML → read the chunk name → fetch that chunk → assert a marker
  from YOUR change → retry once (~90 s lag; Cloudflare can also sit 15+ minutes — prove where live IS
  by checking the previous deploy's marker before calling it a bug). Local vs live hash comparison is
  invalid. No cache-buster (it can return a STALER file). A shared component has its OWN chunk; a lazy
  route lives in its own chunk — check the chunk your code is in.
- **A 200 with all the right strings can be the wrong document** (`/a/*` fell back to the home page).
  Assert on something ONLY the target has (`class="src"`), check the byte count.
- **A negative can be your own check's fault**: CSS `text-transform`, `·` vs `&middot;`, whitespace
  wrapped mid-sentence, a label emitted in single quotes by Vite. **Grep the source for your own needle
  and normalise whitespace before believing "absent".**
- **Grep hit counts lie**: `bing` matches plum*bing*, `acca` matches M*acca*-Gas, `claim` matches
  `claimTemplatePayload`, `grep -l <module>` matches COMMENTS. Word boundaries; print the surrounding
  characters; match the import statement.
- **Not seeing something is not evidence it isn't there**: the anon key gets `200 []` from RLS;
  grep output here can path-mangle lines. `Read` the file.
- **"Identical everywhere" is a tell, not a result** — twice it meant the fix never reached the data.
  **When a model "gets it wrong", check what it was SHOWN before rewriting what it was TOLD.**
- **A stale comment is a load-bearing bug.** Verify the claim, don't inherit it (three recorded: the
  address mask, `templateNeedsAudit`, the `.first allowlist entry is canonical` belief).
- **The timestamp method** (deploy time vs newest commit in the closure) has false positives AND
  false negatives. It is a hint, never proof.
- **`TaskStop` can report success while the process runs on** — verify a kill by process count.

**Constants and money**
- ⛔ **A rate copied from a price list is a guess until a billed row agrees.** A cost constant names
  the PRODUCT and the TIER and cites a billed row; never validate it against data it wrote (the SEO
  $0.12 echo). Google bills once at the highest tier any requested field touches. Verified: Text
  Search Enterprise $0.035, Place Details Enterprise $0.020 (Essentials-only $0.005), per-question
  audit $0.0104, SEO scan $0.02–0.08 band, geocoding $0.005, gpt-4o-mini $0.15/$0.60 per 1M.
- **A constant the sync check cannot parse is unguardable** — make anything that must match another
  a named `const`; never write the declaration pattern in a comment (the regex takes the first match).
- **A `const` read before its declaration throws at module load** (TDZ) — in `findableOffer.ts` that
  is the checkout. Ordering is structural.
- **Never write a cap or a price as a number in prose** — name the constant. Two comments went stale.
- **Costs are per question, not per run** (`AI_SEARCH_USD_PER_QUESTION`); `enrichment_usage`
  already includes correction rows, so sum everything or use `actor_cost_usd`.
- **Apify is a single point of failure with a monthly cap** — every question and every SEO scan
  stops together at 100%. `/ai-audit` shows it (`apify-usage-status`); recompute the percentage from
  used/cap, never trust a stored `usage_pct`. `capped`/`daily_cap` tokens are OURS; anything else is
  the vendor.

**Shape rules that have each bitten more than once**
- 🔴 **An absent value falling through as a real one — 16 recorded instances.** Never branch on the
  known states and let `else` carry the rest. Enumerate the absent case; assert on the grade you WANT
  (`=== 'established'`), never on the one you exclude. On a spending or sending path, absent means
  "do not". On a picker, absent must not mean "offer ungated".
- 🔴 **One rule written in N places — six recorded copies.** Extract the rule into a leaf and import
  it; the test to write is **"is there only one of it"** (`questionnaire-complete.test.ts`,
  `audit-kind.test.ts`, `template-picker-parity.test.ts` sweep are the pattern).
- 🔴 **A guard keyed to today's instance expires silently** (`templateName === "initial_contact"`).
  Test the PROPERTY that makes something dangerous, never the identifier.
- 🔴 **Ask not whether the guard is correct but whether the case it guards can reach it.** Two
  correct gates sat on paths their case never took (the cooldown, the search gate, the free-check
  email's four-day-old audit). Enumerate the arrivals; drive every combination including the null one.
- **A correctness decision must never read a client-side cache that races its own fetch** (the
  duplicate-openers incident). The database is the dedupe.
- 🔴 **N callers that READ "does it exist yet?" and then spend will all spend.** The guard is one
  conditional WRITE that only one caller can win (`approved → starting`, `startClaimFilter`); the
  losers wait on the claimed state. Read-then-create is never idempotent under a 30-second backstop
  (`docs/paid-baseline-flow.md`).
- **A parent reload that flips a page-level `loading` flag unmounts every dialog under it** — a
  mutation chain inside that dialog runs on detached and its errors reach nobody. Refresh in place;
  never toggle the first-load spinner for a re-read. Chains go in a pure controller behind a
  single-flight guard (`paidBaselineFlow.ts`).
- 🔴 **`supabase.functions.invoke` sends the ANON KEY when `getSession()` has no token** — an expired
  access token whose refresh failed retryably keeps the session, fires no SIGNED_OUT and answers
  `session: null`; the gateway accepts the anon JWT and the handler 401s while React still shows the
  operator signed in. Protected calls go through `invokeEdge` (`src/lib/edgeInvoke.ts`): session
  first, explicit bearer, one refresh-and-retry, genuine 401 → local sign-out. A failed load is an
  error state with retry, never an empty list (`docs/paid-baseline-flow.md`).
- **A conditionally-shown question owns its answer's LIFETIME** — hiding a field is not clearing it,
  and clearing state is not the same as not SENDING it (derive the payload from the show condition).
- **Cutting question count saves money, not time** — questions run in parallel; the wall clock is one
  Apify scrape (~3–6 min). Never lower `MAX_RUN_AGE_MS` (12 min) — a retry storm is recorded.
- 🔴 **A secondary step must never hold a settled run.** Competitor cleaning is optional to the
  measurement; it is capped by `RETRY_CLEAN_CAP` on BOTH paths (`_shared/run-finalise.ts`) and an
  exhausted receipt (`complete:false`, `gave_up_at`) RELEASES the run. The 2026-09-20 storm: the
  finaliser held six runs `pending` for an OpenAI 429 and re-invoked the cleaner every tick — 3,000+
  attempts per run, "running 40/40" for a day, three hooks and two pitches blocked (`docs/traps.md`).

**Edge functions and the platform**
- **The service-role-bearer branch in every function is DEAD** since the ~2026-08-11 key rotation and
  no key you can send satisfies gateway and handler at once. Working callers: **CRON_SECRET via
  `x-cron-secret`**, or an operator's own admin JWT (`admin/generate_link` magiclink → the clicked-link
  GET → `access_token` in the `Location` fragment; a real sign-in — tell Paul, revoke after).
  ⛔ Do not spend a session re-probing this.
- **`sb_secret_…` keys are for `apikey` only; the legacy `service_role` JWT still works for
  `/rest/v1`** and is what scripts use. Say WHICH key.
- **The CLI has no `functions logs`, but the Management API does:** `GET /v1/projects/<ref>/analytics/
  endpoints/logs.all?sql=select timestamp, event_message from function_logs …` (same bearer as §2)
  — **retention is under a minute**, so read it WHILE the fault is happening. Otherwise a refusal that
  is only `console.error`'d is undiagnosable — write it to `client_error_reports` (`error_id` + `context`; ⚠️ **the table has no `message` column**
  until `SQL_FOR_PAUL_client_error_message.sql` runs, so ten call sites currently record nothing).
- **The non-2xx triage table (`send-whatsapp-message`):** 200 + `ok:false` = a designed refusal with
  its reason · "non-2xx status code" = the handler answered 4xx/500 · **"Failed to send a request"
  = no CORS headers at all, the handler crashed outside its own catch.** Different layers.
- **A `catch` cannot see what its `try` declared** (`scripts/edge-catch-scope.test.ts` guards it).
- **supabase-js errors are plain objects** — `String(e)` is `[object Object]`; read `.message`.
- **`CREATE TABLE IF NOT EXISTS` against a table in a different shape is a silent no-op**; diff the
  live columns. **`.neq()` drops NULLs** — use `.or("col.is.null,col.neq.x")`.
- **PostgREST truncates at 1,000 rows silently** — `src/lib/fetchAllRows.ts`, `.order('id')`. A
  `.in()` over many keys can hit the cap too; read the distinct set once and intersect in memory.
- **RLS enabled with no policies reads as "no data"** (`200 []`), not "denied". Check `pg_policies`,
  not the prose. Route such reads through an edge function on the service role.
- **An allowlist is not an address book** — never read `ALLOWED_ORIGINS[0]` as canonical; when a
  fallback must guess an outward-facing address, refuse (`resolveSiteOrigin`).
- **UTC end-of-day formats as the next day in BST** — pass `timeZone: 'UTC'` for a stored day.
- **Stripe's hosted page is a JS shell** — verify an itemisation from the create-session response
  (`amount_total`), never from a fetch of the page. A `prod_` id where a `price_` id belongs kills
  checkout; name the SHAPE of a bad secret, never its value.
- **`findable-onboarding` silently drops any answer key not in its lists** (`answers`, `NEWER_COLS`,
  `optional`) — three places to add a field; only a live end-to-end test sees it.

**Measurement and documents**
- **The measurement can be right while the document lies** — check DATA vs RENDERING before calling
  an audit invalid. **Questions can measure the wrong intent** — `seedGuard.ts` (research intent,
  two tiers; teaching trades keep "learn to drive").
- **A catch-all error message is worse than none** — `explainAuditFailure` prints the raw error.
- **The four-minute gap between repeat runs was never a sampling safeguard**; `NOISE_BAND_PP = 5` was
  measured minutes apart. Do not restore sequencing as protection; do not stagger to zero until
  `run_number` has a unique index (§docs/measurement.md §25).

---

## 5. Established findings — what actually works (`docs/findings.md`)

- **ChatGPT reads directories. Gemini reads businesses' own websites.** Two levers.
- Corrected book-wide (2026-09-15, judgeable names only): **941 businesses, Gemini 9.7%, ChatGPT
  33.2%, ratio 3.43×**. Re-derive before quoting — these are snapshots.
- **Being cited is not being named.** Directories are trade-specific and only citations can say
  which (Checkatrade: plumbers yes, accountants 1 of 80). **A business with no website cannot be named
  by Gemini at all.**
- **Tested NEGATIVE — never present as levers:** website quality, schema markup (35% vs 32%), reviews,
  Bing Places (zero citations ever).
- **The only supported lever:** presence in the sources AI reads for that trade, plus a website where
  there isn't one. **First before/after: ABLM 0 → 3 of 18, all Gemini, on town pages** — one client,
  evidence not proof. The claim lives in the overall figure, never a single question.
- **RG Locksmiths is the mirror experiment** (ChatGPT 20/36, Gemini 3/36 on one generic question):
  success needs a NEW service+town question naming him on Gemini.
- Question wording: `businessType` is stored PLURAL on 83% of audits; the WhatsApp variable rules in
  `templateVars.ts` (article check, `pluraliseTrade`, uncountables) exist for that.

---

## 6. Architecture rules that must not be broken (`docs/architecture-rules.md` for the reasoning)

**Evidence and verdicts**
- **Never add `trade` to `DirectoryFact`.** Facts are per-host; evidence is per-trade; the join can
  only SUBTRACT. Unknown hosts route to WHO'S WINNING, never to tasks. **No winnability scoring**;
  counts only. Known nationals/directories (`knownEntities.ts`) CLASSIFY, never add.
- **The niche verdict is the ONLY market verdict** (top of Coverage; `market-view` `niche`, free).
  Coverage rows are `worked` / `leads` / `untouched`. **Opening a view never spends**; only buttons
  that price themselves on their face may.
- **`named` reads `cellNamed()` everywhere** — model verdict, string-match fallback, one ruler per
  comparison; the hand-check refusal lifts on a majority of model-read cells. Never zero on absence.
- **Competitor names come only from `extract-competitors` (LLM).** No regex extractor, ever. A dirty
  run withholds rival names from the client report (`competitorCleaning.ts`); RG's frozen baseline
  `f64920ce` stays suppressed by the junk rule — do not re-extract evidence.
- **`classifySource` grades any `.org` as authority** — known report-accuracy bug, not yet fixed.

**Derived, never stored** — `serveGate`, `townVerdict`, `nameIsJudgeable`, `needsQ2`, the free-check
progress stage, the coverage rung, `townRequiredFor`/`audienceUsefulFor`. A stored verdict freezes
old rows at a stale rule.

**The market model is the MARKET, never the delivery** (`src/lib/marketModel.ts`, 2026-09-20).
`local` / `national` / `hybrid` all HARD-FORCE their own prompt block; only a null scope is
classified by the model. A national set is an INTENT MIX (provider / problem / service / audience /
category / comparison / terminology, weighted), never one sentence pattern — the pattern is what made
a 20-question national audit twenty paraphrases. ⛔ **Never inject a town into a national question**,
and ⛔ **`dropMissingTown` must never bind hybrid** (it deleted the wider half and topped it up with
local templates). `offTradeReason`'s third door — the operator's own topics/sectors/audience — is
national/hybrid ONLY; the local guard was measured on 3,198 questions and stays tight. One context
shape (`auditQuestionContext.ts`) builds BOTH the preview and the confirm request: a second
hand-written payload is how a field shapes the reviewed questions and never reaches the stored audit.
`FULL_MEASURE_QUESTIONS` stays 20 — raising it is a spend decision, not a code one.

**DISCOVERY is the third manual mode AND THE FLEXIBLE OPPORTUNITY/RESEARCH AUDIT: 1–80
questions × 1–3 runs, default 40 × 3** (`DISCOVERY_MIN/MAX_QUESTIONS`, `DISCOVERY_QUESTIONS`,
`DISCOVERY_MIN/MAX/DEFAULT_RUNS`, `audit_purpose = 'discovery'`; 2026-09-20, dials 2026-09-21).
⛔ **THE DIALS LIVE HERE AND NOWHERE ELSE** — the full measure stays 20 × 3 and the paid baseline
stays frozen, because raising the measure's count raises the Apify bill on every paying client.
⛔ **Never present it as a measurement**, at any run count. ⛔ **The marker is the PURPOSE, never
the count** (`GENERATOR_ABSOLUTE_MAX_QUESTIONS` is also 40, so a count-based marker would capture
any caller asking for the maximum). ⛔ **80 is honest ONLY because generation is BATCHED**
(`planGenerationBatches` in `src/lib/auditPlan.ts`, each call ≤ the per-call cap); a policy
ceiling above what one call returns is the fault that killed the old 10..75 full-measure dial.
⛔ **Out of range is REFUSED, not clamped** (`question_count_out_of_range`, `runs_out_of_range`,
`too_many_questions` — 400, nothing started), and only for this purpose. The operator picks WHICH
generated questions run (`src/lib/questionSelection.ts`, indexes not text) and the screen quotes
`expectedResponses(q × runs × engines)`, the same function the run records. No money split, no SEO scan
(`seoScanAllowed` is baseline-only), no audit reuse, and it can never be a hook (`isHookAudit`
requires `ORDINARY_AUDIT_PURPOSE`). `audit_purpose` is plain nullable text with no CHECK — no
migration. Runs are operator-chosen 1-3 (`DISCOVERY_MAX_RUNS`), clamped server-side, replayed
verbatim by `advanceBaseline` — the chosen number IS `baselineTargetRuns`, so it controls
execution. `docs/measurement.md` §32. ⛔ Branch `full-measure-dials` (`2646b390`) put these
dials on the FULL MEASURE instead — **do not merge it**.

🔴 **A REPEAT'S QUESTION CAP COMES FROM THE STORED AUDIT, NEVER FROM THE CALLER** — three recorded
truncations (baseline 10→5, measurement 40→20, discovery 40→5, the last measured live on audit
`9a0c2b79`). `create-ai-audit` reads `audit_purpose` for any explicit `audit_id` and raises
`MAX_QUESTIONS` from it; it can only RAISE. ⛔ **Never re-teach a CALLER to declare what it is
repeating** — that is the guard-keyed-to-today's-instances trap, and it has now expired three times.
Same rule in `advanceBaseline`: a repeat sends the purpose that is STORED, with the two-column
reading kept only for rows written before the column existed.

**Three audit actions, one meaning each** (`src/lib/auditLifecycle.ts`, 2026-09-20): **Run again**
(a NEW audit, same purpose/questions/order/run count — a confirmation, never an editor), **Start new
audit** (the wizard prefilled, everything re-choosable, spends nothing), **Delete audit**. "Re-audit"
and "Re-run" are gone. `auditRepeatable` is a POSITIVE list of `audit` + `discovery`;
`auditDeletable` refuses `baseline` and `remeasure` — ⛔ **deleting one nulls
`outreach_leads.baseline_audit_id` (ON DELETE SET NULL) and `claim_baseline_pointer` is AFTER INSERT
only, so nothing can re-claim it.** Delete cancels work in flight via the existing `cancelRun` first;
runs and queue rows go by CASCADE, every other reference by SET NULL, so the lead survives.

**Absence is never an answer** — `serveGate` flags, never blocks, on a skipped question; `clientHeld`
`heldValue()` is the only way the client sheet holds a value; `townVerdict` gates only on
`unverifiable`; `firstReplyMode` resolves anything unknown to `audit_only`; `seoScanAllowed()` is a
positive allowlist of `baseline`; `isColdOutreachTemplate` treats unknown as COLD.

**Money and customers**
- **`paid` means `amount_paid > 0`, everywhere** (`isPaidLead`); `refunded` is the one status that
  removes a lead from revenue and keeps the amount. The dashboard's paying-customer count adds a
  floor (`PAYING_FLOOR_GBP`, derived) and churn (positive match on `canceled`/`incomplete_expired`).
  A cleared amount writes `null`, never `0`.
- **Counts and rates come from `whatsapp_messages`, never `outreach_leads.status`**; a send is
  `isRealSend` (`sent`/`delivered`/`read`, positive). `onboarding_responses` is read only through the
  `submissions` endpoint.
- **The browser never decides money**: `findable-checkout` reads the add-on tick from the ROW; the
  AI line stays inline `price_data` because it is the guarantee's only carrier.
- **Owner-scoped rows are owned by the DATA account** `pauljsales455@outlook.com` (`9d5a7629…`),
  resolved from the data (newest lead's `user_id`), never from `ADMIN_EMAIL` (`paul@move37.fun`, owns
  nothing) and never hardcoded. A row under the wrong owner is invisible, not wrong.

**Auth, RLS, `user_id`**
- **`user_id` stays on every table.** `anon` and `authenticated` hold full DML GRANTS on all 56
  public tables and the anon key is in the JS bundle — **RLS is the only barrier to the internet.**
  Ten tables are service-role-only purely by having zero policies. `has_role(admin)` is inside 14
  tables' policies; `RequireAdmin` is the positive operator gate. Do not touch a policy "because single
  user".
- **`whatsapp_sends.user_id` NULL = the queue sent it; set = the Inbox button.** That column is the
  sender diagnostic. `whatsapp_messages.user_id` NULL = system-sent or unmatched inbound.
- **Edge auth:** handler-side, always. Internal callers use CRON_SECRET + `x-internal-job`. Every
  function is listed in `config.toml`.
- **The Dashboard "Full Reset" is gone**; `reset_my_account()` still exists in the DB until Phase 3.

**WhatsApp**
- **One sendable list: `WHATSAPP_TEMPLATES` (`src/types/outreach.ts`).** Legacy barber names stay in
  `LEGACY_WHATSAPP_TEMPLATES`/`templateBodies.ts`/`SUPERSEDED_BODIES` because they render historic
  transcripts. **A template lives in eleven places** — `WA_TEMPLATES` + bodies (`whatsapp-send.ts`),
  the queue's mirror, `WHATSAPP_TEMPLATES`, `WA_TEMPLATE_REQS`, `CONTINUATION_TEMPLATES`,
  `READABLE_TEMPLATE_BODIES`, Inbox `TEMPLATE_DISPLAY`, `SIGNUP_TEMPLATES`/`REPORT_LINK_TEMPLATES`,
  and the named-template tests. The parity tests (`template-registry`, `template-bodies`,
  `template-picker`, `template-routing`) fence them. **Names match Meta exactly**, `payment_recieved`
  included; each mirror follows ITS OWN registration.
- **Cold vs continuation** (`coldOutreach.ts`): a cold template is refused for any phone with ANY
  non-failed message history, whatever lead row it arrives on; a follow-up must be named in
  `CONTINUATION_TEMPLATES` or it is refused for its whole audience. The queue is template-blind on
  "already sent" — it structurally cannot send a second message to a lead; second messages go from
  the Inbox. `contact_check` fails CLOSED.
- **The send window binds the QUEUE only** (07:00–21:30 London); the reply path answers Meta's 24-hour
  window and still counts against `DAILY_CAP`. Name the constants; never write the numbers.
- **`mode: "dry_run"`** on `send-whatsapp-message` builds the real payload and stops before the Graph
  POST — the same code path, refusals reported. Use it before a first real send. `test_send` costs a
  real message and is the only proof Meta accepts a template.
- **Greeting names:** `displayName.ts` — `greet` (full peel) vs `identify` (legal suffix, then trailing
  town from the lead row, then "Services"); `IDENTIFY_NAME_TEMPLATES` is the one place that decides.
- **First-reply rule is three-way** (`whatsapp_outreach_state.first_reply_mode`): off / audit only /
  audit + send; `audit_only` rows are terminal by status. **Never merge the three audit entry points**
  (row pill, Inbox button with auto-pitch, bulk) — share input resolution only.

**Reports and documents**
- **Every report renders live** from `render-audit-report` at `findable.live/report/<auditId>`.
  Internal measurements (`isInternalMeasurement`) answer **403**; the per-question pages are
  operator-only; a mid-flight audit shows "still measuring" (`measuringState`), never a partial count;
  `hasWebsite` is tri-state from the lead's `website`/`place_id` — false is never inferred from blank.
- **The leak boundary is structural**: `clientRequestDoc.ts` never imports the ranking. Operator copy
  contains competitors — never send it.
- **Client-facing copy is scanned** by `client-copy-claims.test.ts` (no eight weeks, no £49.99, no
  founder, no hedge, no Bing). Add every new renderer. Things no script can check and are hand-kept:
  the Stripe Payment Link, every Meta-registered body.
- **Page generator**: anti-stuffing is CODE (phrase/town/noun-spam caps, measured); "based here" only on
  the real home-town page; Q&A `structured` (all blanks) for regulated trades and for ANY blank trade,
  `advice` otherwise with every figure/credential/first-person commitment held for confirmation;
  competitor names never on a client page; neighbourhoods are an operator field, never mined.

**State and navigation**
- **The URL is for WHAT you are looking at; `usePersistedState` for HOW the page is configured.**
  ⛔ Never persist an open dialog. A modal must not arrive over the thing that was clicked.
- **`useOutreach` is the one hook not on React Query** — its own piece of work; do not tack it on.
- **The shell mounts once** (`<Route element={<AppLayout/>}>`); page-level caches must survive it.

**Data hygiene**
- **Paginate every PostgREST read** (`fetchAllRows`, `.order('id')`).
- **Migrations are applied one at a time**, never `supabase db push` (history desynced). A migration
  file existing does not mean it is live — read the live definition.
- **Guards that decide from the database, fail closed** (addLead dedupe; contact_check; the
  free-check dedupe). Ambiguity creates a new lead rather than matching wrongly.
- **`no_whatsapp_needs_sms` (1,861 leads) is the landline marker** — keep the status; only its
  wording mentions SMS. `no_whatsapp` = mobile with no WhatsApp.
- **`generated_sites` is written by the live mockup product** — purge only barber rows, as
  service_role (the lock trigger refuses the postgres role and the Auth admin cascade).
- **`enrichment_usage` / `_shared/enrichment/*` are the audit engine and its spend cap**, not
  contact discovery. Do not delete with the enrichment product.

---

## 7. Where the code lives (`docs/code-map.md` for the long form)

| Thing | Path |
|---|---|
| Offer, guarantee, prices | `src/lib/findableOffer.ts` (+ `_shared/offer-price.ts`; findable-site `src/lib/site.ts`) |
| Audit kinds, SEO allowlist | `src/lib/auditKind.ts` (`audit_purpose` is the marker) |
| Named signal | `src/lib/namedSignal.ts`, `_shared/derivable.ts` (`nameIsJudgeable`) |
| Measurement folds | `src/lib/measurementCompare.ts`, `measurementRunGroups.ts`, `measurementExport.ts`, `baselineView.ts`, `pooledRuns.ts` |
| Baseline/replay engine | `_shared/audit-baseline.ts` (`advanceBaseline`, `fireDueRemeasures`), `src/lib/baselineReplay.ts`, `fullMeasure.ts`, `questionFill.ts`, `remeasureDue.ts`, `remeasureFill.ts` |
| Results sender + document | `_shared/remeasure-results.ts`, `src/lib/remeasureResults.ts`, `remeasureResultsHtml.ts`, fn `render-remeasure-results` |
| Client report | `src/lib/auditReport.ts` (`buildReportData`), `aiAuditReportHtml.ts`, fn `render-audit-report`, `measuringState.ts` |
| Report gates | `competitorCleaning.ts`, `knownEntities.ts`, `sourceType.ts`, `seedGuard.ts` |
| WhatsApp registries | `_shared/whatsapp-send.ts`, `process-whatsapp-queue` mirror, `src/types/outreach.ts`, `src/lib/whatsappTemplates.ts`, `templateBodies.ts`, `templateVars.ts`, `templateRouting.ts`, `coldOutreach.ts`, `rivalHook.ts`, `displayName.ts`, `firstReplyMode.ts` |
| Senders | fn `send-whatsapp-message` (Inbox, `dry_run`, `test_send`), `process-whatsapp-queue` (drip, first-reply lane, `contact_check`, `suppress_lead`), `_shared/whatsapp-inbound.ts` (via `whatsapp-status`) |
| Free check | `_shared/free-check-lead.ts`, `free-check-audit.ts`, `free-check-result.ts`, `same-business.ts`, `src/lib/freeCheckProgress.ts`, fns `findable-onboarding`, `submissions`, `notify-onboarding-submit` |
| Town | `src/lib/townVerdict.ts`, `_shared/place-details.ts`, `place-town.ts`, `place-resolve.ts`, `town-distance.ts`, fn `backfill-lead-towns`, table `uk_towns` |
| Serve gate | `src/lib/serveGate.ts` (+ findable-site mirror) |
| Dashboard | `src/hooks/useDashboardMetrics.ts`, `useCampaignStats.ts`, `src/lib/templateAttribution.ts`, `armComparison.ts`, `realSend.ts`, `leadPayment.ts`, `dashboardTasks.ts`, `deliveryCockpit.ts` |
| Coverage / niche | `src/pages/Coverage.tsx`, `NichePanel.tsx`, `src/lib/nicheView.ts`, `coverageState.ts`, fns `coverage`, `market-view` |
| Playbook (evidence, not LLM) | `src/lib/buildPlaybook.ts`, `directoryFacts.ts` (64 entries), `playbookDoc.ts`, `clientRequestDoc.ts`, fn `playbook-evidence` |
| Page generator | `src/lib/pagePlan.ts`, `pagePlanQueue.ts`, `qaAnswerGuard.ts`, fn `page-generator`, tables `client_pages`/`client_page_questions` |
| Mockup product (live) | fn `mockup`, `_shared/mockup-*.ts`, `src/pages/Mockups.tsx`, `src/mockup/templates/`, table `generated_sites`, bucket `mockup-assets` |
| Audit engine | fns `create-ai-audit`, `process-ai-audit-queue`, `extract-competitors`, `run-seo-scan`, `_shared/enrichment/*` |
| Harness | `scripts/run-tests.mjs`, `check-typecheck-baseline.mjs`, `check-edge-syntax.mjs`, `check-edge-undefined.mjs`, `check-cross-repo-sync.mjs` |

- Live operator app **`https://leadfinderos-next.pages.dev`** — ⚠️ **`leadfinderos.pages.dev` is a
  STALE Cloudflare project that still answers 200 with an old bundle.** A deploy check against it
  reports "not live" forever (recorded 2026-09-20). Supabase ref `ruusxpkkmwtljxxulhbq`; public site
  `https://findable.live` (separate repo `../findable-site`, Astro, deploys by `npm run deploy`).
- **Report URL has THREE resolving forms, all forever:** the SHORT `findable.live/r/<code>` (the one
  every template/email/Inbox now sends; `ai_audits.short_code`, unique, trigger-assigned + backfilled,
  6 unambiguous chars), the UUID `findable.live/report/<auditId>`, and the legacy name+8-hex slug.
  `reportSlug.ts` owns the alphabet/length/`shortReportUrl`; the resolver is in `render-audit-report`.
  Always-resolving raw upstream: `…/functions/v1/render-audit-report?slug=<code|auditId>`.
- `/playbook/:id` resolves an AUDIT id first, then a lead (ABLM has no lead row). Three entry points;
  the two AI-Audit ones are the only audit-keyed ones — keep at least one.
- **Cron jobs live only in the DB** (`cron.job`): `ai-audit-queue-run` (30 s), `bulk-jobs-sweep`,
  `whatsapp-queue-run`, `whatsapp-auto-replies-run`, `notify-onboarding-submit-run` (1 min each),
  `daily-cron-run` (02:00), and `instantly-poll-run` (dead product — Paul unschedules it). The
  `bulk_jobs.job_type` CHECK constraint is DB-only too. A rebuild from migrations loses them.

---

## 8. Known open problems — the short list (`docs/open-problems.md` has the long record)

- `client_error_reports` has no `message` column; ten writers record nothing until the SQL runs.
- ✅ **The OpenAI 429 is CLEARED** (was open 2026-09-20 → 2026-09-21; it was a billing/spend-limit
  refusal, not a rate limit, fixed by Paul topping the key up). Verified live: competitor extraction
  succeeded on 8/8 cells and question generation no longer falls back to templates
  (`docs/measurement.md` §32). The hardening it prompted stays — audits finalise regardless
  (`_shared/run-finalise.ts`) and the receipt keeps 400 chars of the error.
- 🔴 **Apify has no headroom for a big discovery run**: $17.02 of $19.00 (89.6%) on 2026-09-21,
  resets 16 Oct. An 80 × 3 is ~$1.74 at the measured ~$0.00725 per question-run — it fits on paper
  and leaves ~20p for everything else, and **at 100% every audit question and SEO scan stops,
  paying clients included** (§4). ⛔ Do not run MCLocksmiths at 80 × 3 until the cap is raised.
- `classifySource` grades every `.org` as authority (report accuracy).
- A 3-run measurement repeats only 20 questions when the set is longer (`BASELINE_MAX_QUESTION_COUNT`
  clamp on repeats) — a spend decision, not a code one.
- The AI Audit list reloads its whole dataset every 5 s while a run drains; paging the LIST is owed.
- `uk_towns` lacks the major cities; the corrected BUA22 insert is parked (gate switches on for the
  biggest markets the day it runs).
- `run_number` is a read-then-write with no unique index — the stagger stays sequential until it has one.
- Nothing sends the four-week results by WhatsApp (email only); the email itself waits on copy approval.
- **The gate is red on `origin/main` itself (2026-09-22), none of it paid-baseline:** `typecheck:baseline`
  has 3 errors above the list (`Inbox.tsx` ×2, `OutreachTable.tsx` — a Lucide `title` prop),
  `check-edge-undefined` flags `page-generator/index.ts:898,903` (`user`), and `explain-offer`,
  `new-site-tier`, `remeasure-results`, `onboarding-audit-fields` fail beside the four known-stale
  suites (142/151). Fix or re-baseline in their own task; read the FAILED names.
- Two stranded free checks may still need the card's resend pressed.
- `FINDABLE_ALLOWED_ORIGINS` may not contain `findable.live` — unfalsifiable and no longer depended on.
- Website clicks other than the report link are untracked, by design for now.
- Deep clean Phase 3, steps 4–10 are owed: `docs/deep-clean-phase3-plan.md` has the order, the file
  lists and Paul's decisions. The `instantly-poll-run` cron is still active until Paul unschedules it.

---

## 9. Parked branches, other docs

- **Do not merge:** `edge-check-gate` (`d3fd6713`), `findable-product-rename` (`a8365707`),
  `short-signup-url` (`c8896003`).
- `HANDOFF.md`, `ONBOARDING.md` (untracked) describe the deleted barber product — the best map of it,
  nothing else. `HANDOVER_NEXT.md` is from 2026-08-22 and stale. `HANDOVER_MOCKUP.md` (tracked,
  2026-09-11) is the live mockup product's record. There is no `DEPLOY.md`; §3 is the deploy rule.

---

## 10. The records — read the one for the thing you are about to touch

`docs/INDEX.md` maps every old § to its file. One line each:

| Touching… | Read first |
|---|---|
| The price, the guarantee, checkout, Stripe, the site origin, the report CTA | `docs/business-and-offer.md` (§1, §11, §12, §13, §13b, §26) |
| Baselines, replays, the pointer, the results sender, the noise band, named-by-model | `docs/measurement.md` (§17, §18, §19, §24, §25, §31) |
| Prepare Baseline, `baseline_status`, the `starting` claim, the hub poller, the approve gate | `docs/paid-baseline-flow.md` (2026-09-22) |
| Any WhatsApp template, sender, greeting name, the Inbox list, the reply rule | `docs/whatsapp-templates.md` (§6g, §16, §29, §30–30e, §32) |
| The client report, wrong-town history, partial results, the name that scores itself | `docs/reports.md` (§6b, §22, §27) |
| The manual audit wizard, the market model, how a national/hybrid question set is built | `docs/market-model-audits.md` |
| The free-check lane, its dedupe, its emails, where it meets the baseline | `docs/free-check.md` (§6j, §15, §21) |
| Dashboard numbers, the campaign card, the client card, stored tasks | `docs/dashboard.md` (§6h, §14, §23) |
| The page generator, the page-plan queue, Q&A modes | `docs/page-generator.md` (§6i) |
| Coverage, the town gate, state persistence, the DELETED market view | `docs/state-coverage-market.md` (§6c–§6f; §6e is archive) |
| findable-site's home page and copy rules | `docs/findable-site.md` (§20, §28) |
| Why a trap rule exists — the incident | `docs/traps.md` (§4) |
| Why an architecture rule exists — the reasoning | `docs/architecture-rules.md` (§6) |
| The full open-problems record, incl. the WhatsApp cap model and the auth matrix | `docs/open-problems.md` (§8) |
| The long code map, the playbook documents | `docs/code-map.md` (§9) |
| The measured findings in detail | `docs/findings.md` (§5) |
| How things stood on 2026-09-09, the harness repair | `docs/state-of-play-2026-09-09.md` (§0) |
| The original §2 / §3 / §7 / §10 text | `docs/how-paul-works.md`, `docs/discipline-checklist.md`, `docs/parked-branches.md`, `docs/other-docs.md` |
| The deep clean: what is done, what is next, Paul's standing decisions | `docs/deep-clean-phase3-plan.md` (+ `INVENTORY_DEEP_CLEAN.md`, untracked, the Phase 1 evidence) |

**When you finish a piece of work:** write the record into the matching `docs/` file (or a new one,
added to `docs/INDEX.md`), and put here only the rule it taught or the pointer to it.
