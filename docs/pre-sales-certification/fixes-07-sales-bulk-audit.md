# Fix workstream 7 — Salesperson bulk check ("Check before calling")

- **Date:** Sunday 4 October 2026. **Branch:** `fix/07-sales-bulk-audit`, cut from `integration/pre-sales-wave1`
  `4cd1a466` (`origin` = local, proved before branching). Worktree `C:/Users/paulj/LeadFinderOS-wt/fix-07-sales-bulk-audit`.
- **Not merged. Not deployed.** No migration applied: the migration ran live only inside a rolled-back block (§9), and a
  read-back afterwards showed nothing left. No edge function deployed. No paid check was run. No message, email,
  Stripe, Meta or vault change. Ronnie and MCL were not touched.
- **Findings:** M-034 (Session E E-04) and the per-rep attribution half of M-057 (E-20). Design source: the master plan's
  *Product decision — a salesperson bulk-check flow* (`cert/master-launch-plan`).

---

## 1. What a salesperson does

1. **Outreach → tick their leads → "Check before calling (N)"** in the selection toolbar (sales only).
2. A dialog says what will happen before anything starts:
   - research only, nothing is sent;
   - recent results are reused for free;
   - how many checks are left today;
   - leads that can't be checked are skipped with a reason.
   There is an optional "Check again even if checked recently".
3. **"Check before calling" panel** above the table, with live progress. Each lead shows Waiting / Checking… / Ready /
   Failed / Skipped in plain words. A ready lead shows **the call screen's own one-line result** (for example "Google
   AI did not name them — it named X and Y") and the website finding.
4. **"Open the next ready lead"** opens that lead's workspace **on the call script**. Each ready row also has:
   - **Call screen**;
   - **Call** (a `tel:` link — logging is the workspace's own "Log this call");
   - **Next Action** (opens the workspace's own Next Action form);
   - **Skip** (hides the row from "next ready" on this device only).
5. Nothing is sent, nothing is set. The results also appear on the Outreach row and the call screen, because they are
   ordinary audits on the lead.

---

## 2. Architecture

| Piece | Path | Role |
|---|---|---|
| Rules (pure) | `src/lib/salesCheck.ts` | Batch maximum, reuse windows, who may be checked, the per-lead plan, run outcomes, plain-English reasons, allowance. |
| Engine | `supabase/functions/_shared/sales-check.ts` | Start / advance / cancel / view / admin overview, plus the `create-ai-audit` request body. Every outside call is injected, so tests drive the real code. |
| Door | fn `sales-prospect-check` (+ `config.toml`, `verify_jwt = true`) | Sign-in (`resolveActor` on every call); a positive sales-role match; `requireAdmin` for the overview. Wires the real guard, pool, suppression, `create-ai-audit` and `crawl-check`. Deploy marker: OPTIONS `x-sales-check-build: sales-prospect-check-1`. |
| Data | `sales_check_batches`, `sales_check_items` (migration `20261006070000_sales_prospect_checks.sql`) | The job state. Written only by the function (service role); readable by the owning rep and the admin. |
| Allowance | guard action `sales_check` (`protection_settings.limits.actions.sales_check.per_day`) | The rep's daily count of fresh checks; Paul edits it on API Usage & Security. |
| Rep UI | `src/hooks/useSalesChecks.ts`, `src/components/SalesCheckPanel.tsx`, the Outreach toolbar button | Asks only; never decides. |
| Results line | `callCardAudit` (`src/lib/coldCallPlaybook.ts`) + `loadCallCardSummaries` (`src/hooks/useColdCallPlaybook.ts`) | **One copy** of the call card's headline, used by both the call screen and the panel. |
| Admin UI | `src/components/SalesChecksAdminCard.tsx` on API Usage & Security | Batches, reps, fresh / reused / failed / skipped, estimated and actual spend, problems. |

**What one check is.** It is the same hook check the rep's single "Run the AI check" button makes: 3 questions, ChatGPT
and Google AI, 1 run, `hook_audit` + `fresh_audit`, filed under the book owner, `audit_purpose = 'audit'`. The **free
website crawl** comes with it:
- for a new check, the audit queue crawls at finalise (the existing automatic crawl — never twice);
- for a reused result whose crawl is missing, stale or shallow, the function calls `crawl-check` itself (internal door,
  standard profile, the lead's own website).

It is never a baseline and never the 20 × 3 client method.

**Why not the admin bulk runner.** `bulk-jobs` is untouched and stays admin-only (`perms.bulkAudits` is still false for
sales — tested). It keys on `outreach_leads.user_id`, the whole book. It takes archived leads and clients. It runs
through `create-ai-audit`'s internal door with no per-rep guard. It counts a 100-lead job as one guard row (E-04).

**Why the internal door, with the guards re-applied here (a deliberate departure from the master plan's "through
`create-ai-audit`'s per-rep path").**
- The per-rep path's `hook_audit` guard has `per_10min` = 10 (Paul's 29 Sep limits), so a 20-lead batch through it
  would refuse half the leads.
- Re-checking a lead before each start, and continuing a batch, need a door that does not depend on a browser token.
- So every guard that path applies is applied here, per lead, at the moment it is processed, and tested:
  - the lead is the rep's (`assigned_to_user_id`), not a client, not archived, not suppressed;
  - the town gate (also still enforced inside `create-ai-audit`);
  - in-flight dedupe and reuse;
  - the usage guard (a **new action** `sales_check`, one row per fresh check: suspension, pause modes, team and
    per-person spend caps, and the per-day allowance);
  - the prospecting pool and its Apify reserve.
- `create-ai-audit` and `process-ai-audit-queue` are **not edited**.

---

## 3. Permissions

| Lead in the batch | Answer | What the rep sees |
|---|---|---|
| Their own active lead (assigned to them) | checked | name, phone, website, result |
| Another rep's lead | skipped `not_yours` | "Not one of your leads — skipped."; no name, phone, website or audit id |
| Paul's lead (unassigned or his) | skipped `not_yours` | the same |
| An id that is not a lead | skipped `not_yours` | the same — no existence oracle; no foreign key, so it never fails the batch |
| A client (paid, or a client status) | skipped `client` | the reason only |
| Archived | skipped `archived` | the reason (it is still theirs, in their Archived list) |
| Asked not to be contacted (suppression) | skipped `suppressed` | the reason; nothing spent |
| Not interested / opted out | skipped `not_interested` | the reason |
| Won, awaiting onboarding | skipped `already_won` | the reason |
| No name / trade / town | skipped `missing_…` | "add it, then check again" |
| Town not confirmed by Google | skipped `town_unverified` (new checks only) | "confirm it on the lead" |

- **Privacy order:** "not yours" is answered **first**, so a rep never learns whether another person's lead exists, is
  archived or is a client. Ownership is `assigned_to_user_id`, never `user_id`.
- **Re-judged when the result is shown:** a lead reassigned or archived after its check started is hidden from the old
  rep (no name, no audit id).
- The admin cannot use the sales path (`sales_only`); a role-less account is refused; Team → Disable stops the rep at the
  next request.
- **Database:** RLS is on.
  - Exactly two policies, both SELECT: own rows, or the admin.
  - `anon`: no access.
  - `authenticated`: SELECT only — insert / update / delete / truncate revoked.

---

## 4. Batch limit

**`SALES_CHECK_BATCH_MAX` = 20** leads per press — the brief's recommendation, kept.
- One batch is about a rep-hour of calls.
- Its worst case, 20 fresh checks, is about 5% of the prospecting pool's daily ceiling.
- Above the maximum the server **refuses** (`too_many`), never slices.
- Duplicate ids collapse first; the dialog says the same before the press.

---

## 5. Freshness and reuse

| Thing | Rule | Constant |
|---|---|---|
| A finished AI check on the lead | Reused if younger than **14 days**. That keeps a reused answer well inside the call screen's own 30-day staleness flag and the drip's 30-day repeat window; AI answers move week to week. | `SALES_CHECK_AUDIT_REUSE_DAYS` |
| "Check again" | Buys a new check only for a result at least **2 days** old; anything younger is still reused. | `SALES_CHECK_REFRESH_MIN_DAYS` |
| What counts as a result | A hook / ordinary audit, a free check, or a legacy single run, whose run is `complete` — or `capped` **with at least one answered question**. Never a baseline, measurement, replay, Discovery or weekly check. | `isReusableAudit`, `runIsUsable` |
| A check already running on the lead | Waited on, never duplicated (attached; it ends as "reused"). | `AUDIT_RUN_IN_FLIGHT` |
| The website crawl | Reused if fresh (`CRAWL_FRESH_MS`, 30 days), current version, a real read, **with sales evidence**. Otherwise crawled now — free. A new check is crawled by the audit queue at finalise. No website → no crawl. | `crawlUsable` |

A reused result costs nothing, makes no guard row and does not count toward the allowance (tested). The rep sees
"Reused — checked 3 days ago, no new check needed".

---

## 6. Budget, allowance and cost

**Cost of one fresh check:**
- **$0.0331**, measured: `OUTREACH_AUDIT_EST_USD`, the average of 579 real 3-question hook runs.
- At most one ~$0.005 Google town lookup per lead per 30 days (cached; the same as the single check).
- The crawl is free.

The order, before **any** spend, for a lead that needs a new check (serialised inside a batch, so parallel items
cannot overshoot):
1. **The rep's allowance** — fresh checks they started in the last 24 hours against
   `protection_settings.limits.actions.sales_check.per_day`.
   - **Default 40** (`DEFAULT_PROTECTION_LIMITS`; the migration adds it to the live row only if absent).
   - A missing or malformed value is the default, never unlimited. Paul can set 0.
   - Refusal: "Today's checking allowance is used — try again tomorrow or ask Paul."
2. **The prospecting pool** (WS-4).
   - Its rolling-24-hour ceiling (`POOL_DAILY_CAP_USD.prospecting`, $12), read with the paged, pool-filtered
     `rollingSpendUsd`.
   - The Apify reserve: prospecting stops at `APIFY_RESERVE_PCT.prospecting` (85%).
   - Refusal: "Today's checking budget is used — your leads are still here, try tomorrow or ask Paul."
   - An unreadable pool refuses (fail closed): "Couldn't confirm today's allowance…".
3. **The usage guard** (`guard_action(rep, 'sales_check', lead, $0.0331)`): suspension, Paul's pause modes, the team
   cap, the person's spend caps, and `per_day` again.
   - **This row is the per-rep attribution:** `api_usage_log` with `user_id` = the rep, `action = 'sales_check'`, the
     lead and the estimate.
4. Only then `create-ai-audit`.
   - If it does not start (refused, timeout), the allowance slot is released.

**Client measurement is untouched.** A bulk check is `audit_purpose = 'audit'`, which is the prospecting pool by WS-4's
positive rule. It never draws from the guarantee pool ($10/day, baselines and re-measures) or the client pool ($8/day).
Tested through the real runner: with prospecting at its cap, a baseline and a re-measure are still allowed, even with
Apify past the prospecting reserve.

**What it means in money (for Paul):**

| | Per day | Per month (22 working days) |
|---|---|---|
| One rep, full allowance (40) | $1.32 | $29 |
| Two reps | $2.65 | $58 |
| Five reps | $6.62 | **$146** |

⚠️ **The binding limit is Apify's monthly cap, not the daily pool.** With a ~$100 cap, prospecting stops at 85% (~$85
for **all** prospecting: single checks, free checks and bulk). Two reps at full allowance fit. Five do not unless the cap
rises, or the per-rep allowance drops to about 15. Reuse lowers the real figure (a lead is paid for once per 14 days).

**Cost visibility:**
- The rep never sees a cost — only "Checks left today: N of M".
- The admin card (API Usage & Security) shows per rep and per batch:
  - leads, fresh, reused, failed, skipped;
  - **estimated** spend (booked per fresh check);
  - **actual** spend (`ai_audit_runs.actor_cost_usd` of those runs, once finished);
  - the failed and skipped leads with their reasons.
- No secret or provider key is read.

---

## 7. Job lifecycle

**Batch:** `active` (something still waits to start) → `waiting` (every check started, some still running) →
`finished`.

**Item:** `queued` → `starting` (claimed) → `running` → `done` / `reused` / `failed`; or `skipped` with a reason.

**Exactly one piece of work per lead — the database is the dedupe:**

| Case | What stops a second piece of work |
|---|---|
| Double click, network-timeout retry | The browser sends one request id per press, and re-sends **the same id** after a dropped connection. `(actor, client_request_id)` is UNIQUE, so the second answer is the same batch (`replayed`). |
| Two tabs / overlapping batches | One `active` batch per rep (partial unique index): the second press gets `409 batch_active` and the first batch is shown. Once every check has started (`waiting`), a new batch may begin. |
| The same lead twice in one press | Collapsed before insert; `(batch_id, lead_id)` UNIQUE. |
| Two advances at once (two tabs polling) | A batch lock (`locked_until`, conditional update) **and** a per-item claim (`queued → starting`, conditional). Tested: three simultaneous advances → one check per lead. |
| A process dying mid-call | A `starting` item older than 3 minutes is recovered. If its audit exists, it is attached (never a second paid check). Otherwise it goes back in line; after 2 attempts it is "couldn't start". |

**Progress:** the open Outreach page asks the server to move its batches on every `SALES_CHECK_POLL_MS` (5 s). A refresh
or navigation loses nothing: the state is the database's. Checks that have started run on the audit queue regardless.
Leads not yet started wait until the rep next has Outreach open — starting 20 takes about a minute, and the panel says
"Checks already started finish on their own, even if you leave this page". There is no new cron.

**Stop:** leads not yet started → skipped "Stopped before it started". Started checks are already paid and finish.

**Failures** (each lead on its own; a failed lead never hides the others):

| Case | Result |
|---|---|
| No website | Still checked (the AI half); "No website on file". |
| Website timeout / unreadable | The crawl's own `unavailable`; "Website couldn't be read". |
| Provider timeout / network error starting the check | Failed `start_failed`; the slot is released. |
| AI check failed | Failed `audit_failed`. |
| Capped with no answer | Failed `audit_not_run`: "didn't run, nothing spent". |
| Never finishes | Failed `audit_timeout` after 45 minutes. |
| Not in town | Failed with `create-ai-audit`'s own sentence. |
| Budget exhausted mid-batch | The remaining new checks are skipped with the sentence; reuses continue. |
| Stale session | The shared invoker refreshes once, then asks the rep to sign in. Nothing is lost. |
| Reassigned / archived before its turn | Refused, nothing started. |
| Reassigned / archived during its check | No further work; hidden from the old rep. |

---

## 8. Never contacts anyone

- **No sender in the import closure:** the test walks every real `from "…"` import of the function. No
  WhatsApp / email / auto-reply module; no file posts to Meta or Resend, inserts a WhatsApp row or updates a lead.
- The function calls exactly two functions: `create-ai-audit` and `crawl-check`. The crawl call carries no `run_id` and
  no `job_id` (WS-1's M-006 stays closed).
- The `create-ai-audit` body has no `queue_pitch_on_complete`, no purpose, no supplied questions and no audit or run id.
- **The two ways a finished audit can message a lead are refused for new checks:**
  - `whatsapp_outreach_state.audit_complete_template` set (or unreadable) → `auto_message_on`. **Live today: null**, so
    off.
  - A pitch parked `awaiting_audit` on the lead → `pitch_waiting`.
- The engine writes only its two tables, `lead_activity` ("AI check run" / "website checked", under the rep) and, via
  the crawl, `lead_crawl_checks`. Tested: no `outreach_leads` write at all — no status, no Interested, no Replied, no Next
  Action. No follow-up is created because a check finished.
- ⚠️ **The one existing side effect, kept and surfaced (decision for Paul, §12):** the audit queue's 6/6 rule
  (`autoMarkSixOfSixNotInterested`, Paul 2026-09-25) moves a lead that **both engines named in all six answers** to Not
  interested. It applies to every hook check, the rep's single button included. A bulk check uses the same hook, so it
  applies here too. It sends nothing. The rep's panel shows "ChatGPT and Google AI named them".

---

## 9. Tests

**New — `scripts/sales-prospect-check.test.ts`, 171 assertions, all passing.** The real engine against an in-memory
database (`scripts/fake-supabase.ts`), with recording fake providers, so spend and sends are **counted**:

| Area | Covered |
|---|---|
| Rules | Max refused (not sliced); duplicates collapse; privacy order; ownership by assignment; reasons; reuse / refresh windows; in-flight attach; zero-answer capped not reused; baselines never reused; allowance default / malformed / zero; one copy of the allowance number |
| Authorization | Own accepted; rep B's, Paul's (both kinds), client, archived, nonexistent refused; suppressed refused; one paid check only; no leak in the view; admin and role-less refused; rep B cannot read or stop rep A's batch |
| Batch | Max server-side; duplicates; double submit at once; retry with the same id; overlap 409; three concurrent advances → one per lead; reload; Stop |
| Budget | Allowance per rep, across batches, not across reps; pool cap; Apify reserve; unreadable pool; Paul's pause; the real runner shows prospecting exhaustion leaves baseline / re-measure / client pools allowed; actor on every item and guard row; lead history under the rep |
| Caching | Recent audit + crawl reused; audit reused with a free crawl; stale → fresh; in-flight waited on; refresh window; reuse → zero provider calls and zero allowance |
| State | Reassigned / archived before and during; failed / capped / timeout; not-in-town sentence; town gate; network error; slot released; interrupted start recovered without a second check |
| Results | Body filed under the book owner on its own lead id; a Facebook "website" not crawled; each item points at its own lead's audit; a client's baseline run untouched |
| No contact | `auto_message_on`, `pitch_waiting`; only the allowed tables written; no lead row written; import-closure sweep; the two function targets; no run / job id on the crawl |
| Wiring | Migration dedupe, revokes, the two SELECT policies, the jsonb action equal to the defaults and added only if absent; `config.toml`; sales-only permission; `bulkAudits` still admin-only; the panel calls nothing; same request id on retry; no cost shown; the call card's line equals `callCardAudit` |
| Admin overview | Per rep: leads / fresh / reused / skipped; estimated and actual spend; refusals visible; no secret |

**Mutation-checked** (each break made the suite fail):
- ownership by book owner;
- the allowance gate not serialised;
- the auto-message guard removed;
- the pitch guard removed;
- suppression ignored;
- the view showing other leads' names;
- the budget check skipped;
- no re-check of a running item.

One survivor, by design: removing the per-item claim alone is still covered by the batch lock (two layers).

**Updated:**
- `scripts/abuse-cost-protection.test.ts`: the seed check is now "seed + actions later migrations add".
- `scripts/fake-supabase.ts`, additive: date-aware comparisons, `gte/gt/lte/lt`, `delete`, partial unique indexes,
  `insert().select().maybeSingle()`. Its other users still pass.

**Gate:** `npm run check` (with `FINDABLE_SITE_DIR` at findable-site `integration/pre-sales-wave1`):
- typecheck 9 = the baseline;
- edge syntax 469 files;
- edge names 68 entrypoints;
- import graph 0 faults;
- build OK;
- **309 / 309 suites**.

A strict tsc pass (Deno shim) over the new function shows no error in any new file.

**Wave 1 regression, re-run by name, all passing:**

| Suite | Covers |
|---|---|
| `wave1-integration` (94) | Build Quick Close 5/5, payment replay, ended client |
| `role-rules`, `sales-shared-workflow`, `campaign-ownership`, `crawl-check-access`, `offboarding-role-removal` | Cross-rep isolation |
| `templates-privacy` | Saved texts |
| `quick-close`, `quick-close-links` | Quick Close |
| `payment-client-state` | Payment and client state |
| `call-workspace` | The call workspace and archived tasks |
| `ai-measurement-reliability`, `ai-measurement-truth` | Guarantee-budget separation |
| `service-route-terms`, `website-build-launch`, `website-build-standard`, `website-build-claims` | Website Build gate, Build / Optimise |

**Live, rolled back** (`docs/pre-sales-certification/fixes-07-rollback-qa.sql`; the runner inlines the migration; QA
accounts "Test" = rep A and "test1" = rep B):

| Check | Result |
|---|---|
| The action added | `{"paid": true, "per_day": 40}`; every other limit unchanged |
| Second active batch / same request id / same lead twice / bad status / bad request id | refused (all five) |
| A waiting batch beside an active one | allowed |
| Grants | authenticated SELECT only; anon none; two SELECT policies |
| Rep A | sees own 2 items, 0 of rep B's; insert and update refused |
| Rep B | 0 of rep A's |
| Admin | all 3 |
| Anon read | refused |
| Live `guard_action(rep A, 'sales_check')` | allowed; row `action = sales_check`, `actor_role = sales`, est 0.0331 |
| At the allowance | `rate_limit` |
| Rep B unaffected | allowed |
| Under `prospecting_paused` | `paused` |

**Read back afterwards:** neither table exists; the action is absent; mode `running`; 0 fixture leads; 0 `sales_check`
guard rows; 0 activity rows.

**What no test here can prove (needs the deploy):**
- that the gateway accepts the internal calls (the same pattern `bulk-jobs` uses live);
- the real `create-ai-audit` answer shape;
- a real crawl;
- a real paid check end to end.

---

## 10. Visual QA

The **real Outreach page** as the "Test" salesperson, rendered in a throwaway Vite harness:
- the Supabase client and sign-in mocked;
- `sales-prospect-check` answered by **the real engine running in the browser** over an in-memory database;
- fake providers;
- QA fixture leads only ("ZZ QA …").

It was driven in headless Chromium at **1366 px and 390 px**. The browser pane would not draw (window hidden), so the
screenshots came from the headless run and were looked at by this session. **Nobody else has seen it.** The harness was
deleted before commit and `launch.json` restored.

| Checked | Result (both widths unless noted) |
|---|---|
| Selection | Only the rep's 8 leads listed (rep B's absent); "Check before calling (7)" beside Copy Numbers / Queue WhatsApp |
| Batch action | The dialog: research only, nothing sent; 14-day reuse; "40 of 40 left today"; skip reasons; "Check again" option |
| Progress | Bar; "AI checks running — 1 ready so far"; per-lead "Checking…" with "Asking ChatGPT and Google AI — usually a few minutes" |
| Reused result | "Ready" + "Reused — checked 3 days ago, no new check needed" + "Website check reused" |
| Failed lead | Red "Failed" with the server's sentence ("…about 41 km from Halifax…"); **no Call screen button** |
| Skipped | "Town not confirmed — confirm it on the lead…", "No trade on this lead — add it…" |
| Results | "Google AI did not name them — it named …", "ChatGPT and Google AI named them", "Website: Sitemap points at a different web address" |
| Allowance reached (`per_day` = 2) | "Today's checking allowance is used — try again tomorrow or ask Paul." on the rest; "Checks left today: 0 of 2"; the reused lead still ready |
| Call transition | "Open the next ready lead" → Brookfoot's workspace on **Scripts**, whose call card shows the same result, and the opening line uses it |
| No contact | The only calls in the whole flow: `sales-prospect-check`, the fake `create-ai-audit`, and read RPCs. No send / email / payment / Quick Close |
| Sideways scroll | None (`scrollWidth = clientWidth`: 1366 / 1366 and 390 / 390) at the toolbar, panel and results |
| Console | No errors |
| Admin card | Test · 1 batch · 9 leads · 4 fresh · 1 reused · 1 failed · 3 skipped · estimated $0.13 · actual $0.13 |

**Polish applied from the screenshots:**
- a finished lead says "Website checked with the AI check", not "follows";
- "No website on file" is no longer said twice.

**Minor, not changed:** on a phone, a ready row's "Skip" wraps to its own line under the three buttons.

---

## 11. Deployment (for the deploy session — none of this was done)

**Depends on Wave 1 being deployed first:**
- WS-1's `crawl-check` (M-006);
- WS-4's pools: `create-ai-audit`, `process-ai-audit-queue`, the runner, and SQL `20261007040000_audit_budget_pools.sql`.

`main` has neither, so **rebase this branch onto `main` after `integration/pre-sales-wave1` merges.**

1. **SQL** — after Wave 1's nine, `20261006070000_sales_prospect_checks.sql`.
   - The filename sorts before Wave 1's 202610070…; apply it **after** them. Nothing depends on the order, but
     migrations here are applied one at a time, never by `db push`.
   - Additive: two tables, indexes, two SELECT policies, revokes and grants, and one jsonb key added only if absent.
   - Read back:
     - `to_regclass` for both tables;
     - `pg_policies` → exactly two (SELECT);
     - `has_table_privilege('authenticated', 'public.sales_check_items', 'INSERT')` = false;
     - `protection_settings.limits->'actions'->'sales_check'` = `{"paid":true,"per_day":40}`.
2. **Edge functions**, after the SQL:
   - **`sales-prospect-check`** (new);
   - **`security-admin`** — `validateLimits` now requires the `sales_check` action; deploy after the SQL so a save from
     an old screen cannot fail.

   `src/lib/protectionLimits.ts` also reaches 49 other functions through `_shared/protection.ts`. **There it is a
   type-only change** (one more member of the `GuardAction` union); they need no redeploy for it:
   `admin-overview admin-users agency-check apify-usage-status apply-seo-paste bulk-jobs business-summary check-website
   companies-house-check conversation-triage coverage crawl-check create-ai-audit directory-presence enrich-business
   enrich-lead extract-email extract-facebook feedback-submit google-place-details market-view niche-sample
   page-generator paid-baseline paid-client-hub performance-sync process-ai-audit-queue process-whatsapp-queue
   prospect-preview quick-close review-reply run-seo-scan sales-earnings sales-performance scan-site-details
   search-leads send-whatsapp-media send-whatsapp-message send-whatsapp-voice social-profiles submissions
   template-request voice-note-script warm-lead-reply weekly-visibility`.
   Most are in Wave 1's own list anyway.

   `coldCallPlaybook.ts` (the `callCardAudit` extraction) reaches no edge function.
3. **SPA** (`main` → Cloudflare), after the function: the button calls it.
4. **Verify:**
   - OPTIONS `…/functions/v1/sales-prospect-check` → `x-sales-check-build: sales-prospect-check-1`;
   - the Outreach chunk contains "Check before calling";
   - the API Usage chunk contains "salespeople, last 7 days".
5. **First live check (needs Paul's yes — it is a real paid run, about 3p):** as the "Test" account, on a QA fixture lead
   only. Expect:
   - one `api_usage_log` row with `action = 'sales_check'`;
   - one ordinary hook audit on that lead;
   - the item `done`;
   - zero WhatsApp / email rows.

   Press again: "reused", no new row.

---

## 12. For Paul

**Decisions:**
1. **Per-rep allowance.** 40 fresh checks a day (about $1.32) is the launch value. Change it on API Usage & Security →
   thresholds → "pre-call checks". With more than two reps, the Apify monthly cap is the real limit (§6) — lower it to
   about 15, or raise the cap.
2. **Apify monthly cap.** Raise or confirm about $100 before rollout (already on Wave 1's list; not changed here).
3. **The 6/6 rule on bulk checks** (§8). Today a lead both engines named in all six answers is moved to Not interested
   by the existing hook rule — the single check does the same. Keep it (recommended: there is nothing to sell, and it
   sends nothing), or ask for bulk checks to be exempt (a queue change).

**Manual actions:** the deploy steps in §11, and a yes for the one ~3p live check on a QA lead.

**Not done here (named):**
- No WhatsApp follow-up from the panel. By design: call-first, research only.
- No cron to start queued items while nobody has Outreach open. Started checks always finish; starting 20 takes about a
  minute.
- `enrichment_usage` still carries no actor column. Per-rep cost on this path comes from the guard rows (estimate) and
  each item's run (actual), which E-20 asked for; the ledger itself is unchanged.
