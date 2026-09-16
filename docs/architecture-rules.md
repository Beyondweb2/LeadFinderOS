# Architecture rules — the reasoning behind each rule (original §6)

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §6 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 6. Architecture rules that must not be broken

- **Never add a `trade` (or `trades`) field to `DirectoryFact`** (`src/lib/directoryFacts.ts`).
  *Why:* the moment a fact says "Checkatrade is for plumbers", the file becomes the hardcoded list the evidence
  layer exists to replace — and it would be wrong by construction, because Checkatrade has 657 citations for
  plumbers and zero for accountants. That is a fact about the **evidence**, not about Checkatrade.
- **Facts are per-host. Evidence is per-trade. The join can only SUBTRACT.**
  Citations decide *which* hosts matter. `directoryFacts` only says *what a host is* and *who may action it* —
  things you can only learn by visiting the site. A fact may remove or downgrade a host the evidence surfaced.
  It may never add one. `townOnly` is legitimate on that test (geographic scope of the site); `trade` is not.
- **Unknown hosts route to WHO'S WINNING, never to tasks.** An unclassified host is almost always a
  competitor's own site. Surfacing it as intelligence means a new competitor appears automatically with no
  entry to write; making it a task would invent work.
- **No winnability scoring anywhere.** It reads a single run, and competitor lists differ between runs, so its
  output flips between identical inputs. Counts only.
- **No outcome promises in anything customer-facing.** Say what was measured, what was done, and what changed.
- **Migrations are applied ONE AT A TIME, never with `supabase db push`** — that is broken here
  (history desynced) and would try to apply every migration missing from the remote history table.
  Run the single migration's statements through the Management API (§2), or hand them to Paul.
  **A migration file existing does not mean it is live.** For DB functions, check the live
  definition: `select pg_get_functiondef('public.<fn>'::regproc);`
- **Counts and rates come from `whatsapp_messages`, never `outreach_leads.status`.** `isSentStatus` and
  `isRepliedStatus` in `src/types/outreach.ts` are traps for aggregates. **`paid` means `amount_paid > 0`,
  everywhere.**
- **Paginate PostgREST reads** — it truncates at `db-max-rows` silently. Use `src/lib/fetchAllRows.ts` with
  `.order('id')` as a unique tiebreaker.
- 🔴 **`instantly-push`'s INTERNAL GATE IS NARROWER THAN EVERY OTHER ONE, ON PURPOSE. Do not
  "make it consistent".** It accepts **CRON_SECRET + `x-internal-job` ONLY** — not the service key,
  which every other internal branch (bulk-jobs included) also accepts. The reason is blast radius:
  this is the function that **sends email**, and a key whose job is database access should not also
  be a licence to email 1,000 prospects. Built 2026-08-08 for `audit_and_push`.
  - `acting_user_id` is read **only inside** the internal branch, so a stolen JWT cannot name a
    different actor. UUID-checked, then confirmed to be a real user.
  - **No admin escalation on the internal path** — owner-scoped only. bulk-jobs' create already
    filters a job to leads the creator owns, so narrowing costs the flow nothing.
  - Suppression, the completed-audit gate and the already-pushed stamp run **after** auth and are
    identical on both paths. Auth decides *whose leads may be read*, never *who is safe to contact*.
  - ⚠️ **`mode: 'auth_probe'` exists because there was no other honest way to test this.** Every
    other mode either sends email or calls a paid API, so exercising the gate would have meant
    emailing someone to find out whether the auth was right. It reaches no Instantly endpoint, reads
    no lead, writes nothing, and reports only which branch admitted the caller.
  - ⚠️ **PROVING A 401 PROVES NOTHING BY ITSELF.** Nine non-internal shapes were refused
    2026-08-08 — and the OLD code would have refused all nine identically, so the negatives were
    worthless until the new bytes were shown to be live. The marker that did it: **`x-cron-secret` in
    the OPTIONS preflight's `Access-Control-Allow-Headers`**, which exists only in the new version and
    needs no credential to read. Same rule as §4's report trap — assert on something only the target
    can produce.
  - ⚠️ **The positive path cannot be tested from here** — CRON_SECRET is not readable without
    asking Paul to hand over a secret. It is proven by the first real job. **The failure mode is
    safe**: a broken gate means `push failed (HTTP 401)` on every item and **zero emails sent**,
    never a wrong send.

- 🔴 **`audit_and_push` — THE TWO-PHASE JOB, AND THE THREE RULES THAT COST MONEY.**
  `bulk-jobs` job type added 2026-08-08. Triage → phase A (audit, `skip_seo`) → phase B (one Instantly
  call for the whole set). Cap **25 on ACTIONABLE items**, so a selection full of already-pushed
  leads is not refused.
  - **ALREADY IN INSTANTLY = no audit and no push.** Re-auditing is money spent preparing a pitch
    that has already gone out.
  - ⛔ **A FINISHED AUDIT HANDS OVER, IT DOES NOT COMPLETE.** `resolveAwaiting` returns the item to
    `pending` + `phase: 'push'` and does **not** touch `done_count`. **`done` on this job type means
    PUSHED.** Marking it done would be the 2026-08-08 bug in a new place: paid for the audit, never
    sent the email, counter reads complete.
  - ⛔ **AN ITEM INSTANTLY DID NOT TAKE IS NEVER RECORDED AS PUSHED.** Outcomes map from
    instantly-push's own **id lists**; a lead in none of them fails with "gave no reason". A
    **missing `pushedIds`** — the real state if instantly-push is deployed older than bulk-jobs —
    fails loudly rather than guessing either way.
  - ⚠️ **DEPLOY ORDER: SQL → `instantly-push` → `bulk-jobs` → SPA.** `bulk_jobs.job_type` carries a
    CHECK constraint (§8: it lives only in the DB, not in migrations) that rejects the new value, and
    the SPA's `action: 'triage'` 400s against an older bulk-jobs.
  - ⚠️ `purpose: 'market'` stays keyed on the **param** `skip_seo`, not on the derived value —
    audit_and_push forces `skip_seo` but is **not** a market batch, and deriving both from one flag
    would have hitched cross-audit intent coverage onto a cost decision.
  - ✅ **Seventh instance of the absent-value shape, caught by writing the test first.** The triage
    ladder ends in `cannot` and `push_now` requires a positive; `scripts/audit-push.test.ts` drives
    every rung with null / empty / whitespace and asserts none reaches the bucket that emails.

- ⚠️ **THE BULK-JOB PROGRESS LINE CALLED EVERY BULK AUDIT "site generation" FOR MONTHS.** It was
  `job_type === 'enrich' ? 'enrich' : 'site generation'` — a two-branch expression over a set that
  has had four members since `audit` was added. Nothing broke, which is why it survived: the label
  was wrong and the numbers beside it were right. Now `src/lib/bulkJobProgress.ts`, which labels from
  a map and renders an **unknown job type raw** rather than borrowing the last branch's name. It also
  derives the phase from `items` (never stored) and reports **no phase** when there are no items.

- ⛔ **THE GUARANTEE IS BYTE-IDENTICAL ACROSS BOTH REPOS, AND A SCRIPT NOW ENFORCES IT.**
  `FINDABLE_GUARANTEE` (`src/lib/findableOffer.ts`) and findable-site's `GUARANTEE`
  (`src/lib/site.ts`) **had drifted** — this repo's ended at "…you will be named." while the site's
  carried "The engines decide that, and anyone who promises it is guessing." So the sentence a
  customer **agreed to at Stripe checkout** was not the sentence on the page that sold it to them.
  Both files already carried a comment asking for them to be kept in sync; a comment cannot fail a
  build. Run **`node scripts/check-cross-repo-sync.mjs`** — it exists in **both** repos, each reading
  across to the other, and exits non-zero on any difference. It covers the **guarantee AND the price**
  (`FINDABLE_SETUP_PRICE_GBP` vs `SETUP_PRICE_GBP`), and exits **2** if the sibling repo is absent.
  Proven by injecting a drift in each value on each side — four cases, all caught by both scripts.
  🔴 **A THIRD COPY EXISTS THAT NO SCRIPT CAN REACH: the Stripe PAYMENT LINK's own description**,
  typed into Stripe's dashboard. The founder link's copy is **out of date** — it drops "at week eight
  with before-and-after evidence" and the entire "The engines decide that…" clause. Edit it in Stripe
  by hand whenever the constant changes.
  ✅ **Stripe renders the full 222-character string untruncated** — verified 2026-08-06 by creating a
  real Checkout Session and reading `document.body.innerText`. Stripe documents no length limit for
  `line_items[].price_data.product_data.description`, so this could only be answered empirically; the
  page HTML is a JS-rendered shell and contains nothing, so fetching it proves nothing.
  ⚠️ **STRIPE ADAPTIVE PRICING CANNOT BE TURNED OFF FOR PAYMENT LINKS.** Stripe's docs:
  *"Adaptive Pricing is always enabled for Payment Links. Manage Adaptive Pricing for Checkout in your
  payment settings in the Dashboard."* So the Dashboard toggle governs **Checkout Sessions only** —
  the `findable-checkout` path. The founder link is a Payment Link and is not covered by it.
  Observed 2026-08-06 from a Thai IP: the Checkout Session presented **THB 4,582.95** with a stated
  4% conversion fee; the founder Payment Link showed **£19.99 only**, minutes apart in the same
  browser. One observation does not disprove the docs — treat the link as capable of converting.
- 🔴 **ONE RULE WRITTEN OUT IN N PLACES IS THE OTHER RECURRING SHAPE, AND EVERY COPY LOOKS CORRECT
  FROM INSIDE ITS OWN FILE.** Measured: **five** copies of "is the questionnaire complete" (two still
  demanded a column dropped on 2026-08-22, so a paying client read "awaiting details" for ever and
  every real first payment was emailed as unpaid); **four** copies of the literal `"audit_reply"`;
  **two** constants in two repos, which drifted the guarantee a customer had agreed to at checkout.
  ⚠️ **A CHECK CANNOT SAVE YOU HERE — EXTRACT THE RULE INTO A LEAF AND IMPORT IT.** A static sweep
  for "a column nothing writes" misses it (the column is still written when a value arrives), and
  the copies do not diverge until the product moves. The test to write is not "is the predicate
  right" but **"is there only one of it"** — grep the importers and fail the build on a local copy:
  `questionnaire-complete.test.ts` and `audit-kind.test.ts` are the pattern.
- 🔴 **AN ABSENT VALUE FALLING THROUGH AS THOUGH IT WERE A REAL ONE. THIS HAS NOW HAPPENED SIX
  TIMES, in six unrelated files, and it will happen again.** The shape is always the same: code
  branches on the *known* values and lets everything else drop into the `else`, where the default
  means something the data never said.
  | Where | The absent value | What it was silently treated as |
  |---|---|---|
  | `findable-onboarding` | a null questionnaire column | "they said no" |
  | `clientHeld.ts` (pre-fix) | `''` / whitespace / placeholder | "we hold this" |
  | `market-view` (pre-fix) | tier `unknown` (below the evidence bar) | "AI names them" → subtracted |
  | `offTradeMark` (**caught before shipping**, 2026-08-06) | a pool row with no `primaryType` | "Google does not call this a locksmith" |
  | `marketPlainRead` (Soham, 2026-08-07) | a pool Places returned **0** businesses for | "every one is already named by AI" |
  | `MeasureMarket` gate (Soham, 2026-08-07) | the gate skipped when no search ran | a fresh EMPTY pool = "fine, proceed" → 2 paid audits |
  The market one is the clearest: the branch kept `tier === "thin"` and dropped the rest, so
  `unknown` — which is what *every* entry is below the bar — was subtracted as established. **The
  guard inverted in exactly the case it was written for.**
  ⚠️ **The test: never branch on the states you expect and let `else` carry the rest.** Enumerate
  the absent case explicitly, and when a value is graded, assert on the grade you *want*
  (`=== 'established'`), never on the one you want to exclude (`=== 'thin'`). A new grade added
  later joins the wrong side of a negative test and nothing throws.
  ✅ **THE FOURTH ONE WAS CAUGHT BY APPLYING THIS RULE RATHER THAN BY AN INCIDENT** — the first time
  that has happened. `primaryType` arrived in `search-leads`' field mask on 2026-08-06, so **every
  pool row cached before that has none**. Marking a row "not the trade" on a missing type would have
  flagged an entire market as non-locksmiths — the Norwich subtraction again, in a new file.
  `offTradeMark` asserts on the grade it WANTS (a known type differing from a known modal type) and
  returns nothing for an untyped row whatever the consensus. `scripts/off-trade.test.ts` asserts a
  20-row pre-field-mask pool produces **zero** marks. Write the absent case into the test, not the
  comment.
  🔴 **SOHAM ADDED TWO MORE, AND ONE OF THEM IS A NEW SHAPE: A GUARD THAT IS SKIPPED RATHER THAN
  WRONG.** The search gate was correct — it just sat inside `if (!poolFresh)`, so it only ran on the
  path where a search ran, and a pool that was FRESH AND EMPTY (exactly what the gate is for) could
  never reach it. **Ask not only "is the guard right?" but "can the case it guards reach it?"**
  Reported twice before it was found, because both the review and the test exercised only the search
  path. A separate lesson from the same market: **every ratio in `marketView.ts` was correctly
  guarded against a zero denominator and it still printed "lockrite.org (47 of 0)"** — the total was
  only ever *interpolated into a sentence*, never divided by. A guard on the arithmetic is not a
  guard on the copy; grep for printed denominators separately.
- ⛔ **ABSENCE IS NEVER AN ANSWER — the second place this rule lives.** `serveGate` was the first (a
  skipped question flags, never blocks). `src/lib/clientHeld.ts` is the second: `heldValue()` is the
  ONLY way the client sheet decides it holds a value, and null / undefined / `''` / whitespace / an
  empty array / an array of blanks / buildPlaybook's placeholders (`NOT HELD — ask the client`,
  `none`) all mean "we do not have it". A null column inside a **submitted** row means what no
  questionnaire means, for that field — `findable-onboarding` writes `incomplete` rows by design and
  deletes null-valued new keys from the insert, so partial rows are normal.
  `ASKING_PHRASES` in that file is the enforcement table; the suite asserts the asks vanish when a
  column is held **and come back when it is not**, which catches a "fix" that deletes an ask instead
  of suppressing it. Don't re-derive this rule per-caller.
  ⚠️ **`onboarding_responses` had ZERO rows on 2026-08-06** (`client_listings` too). So the
  no-questionnaire path is not an edge case — it is the only path that has ever rendered, and any
  questionnaire-driven branching is untested until Paul submits one for real.
  ✅ **NO LONGER ZERO — 2 rows as of 2026-08-10** (`gbp_exists` = `not_sure` and `yes`). Small, but it
  means the questionnaire path has now rendered for real and the line above has stopped being true.
  **Re-count before quoting it; do not inherit either number.**

---

