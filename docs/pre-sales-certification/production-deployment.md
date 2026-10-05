# Pre-sales release — controlled production deployment

- **Date:** Monday 5 October 2026, 01:30–02:15 UTC. Deploy worktree `C:/Users/paulj/LeadFinderOS-wt/deploy-pre-sales-final`
  (branch `release/pre-sales-final`); findable-site worktree `C:/Users/paulj/findable-site-wt/deploy-pre-sales`.
- **Authority:** `final-certification.md` (verdict READY FOR CONTROLLED DEPLOYMENT) and Paul's deployment brief of the same day.
- Nothing was added, redesigned or refactored. Ronnie and MCL were only read.

---

## Verdict

### PRODUCTION DEPLOYMENT INCOMPLETE

Everything in the certified release is **deployed and verified**: 10 migrations, 38 edge functions, the operator app,
findable-site, the vault clean-up and one live paid prospect check. Nothing failed, and **no rollback is required**.

It is recorded as incomplete for one reason only. Four admin screens on the brief's minimum list were **not seen
rendered**: Paid Client, Website Build, Welcome Pack and API Usage & Security. They need Paul's admin sign-in, and signing
in as the admin account was refused by this session's permission rules. Their deployed code is verified by markers
(§7), but nobody has looked at them live. **Paul: open each once on app.leadfinderos.com.** If they load, the deployment
is complete.

`whatsapp-status` is **HELD / NOT DEPLOYED**, on purpose (§6). That hold does not make the deployment incomplete.

---

## 1. Source and merge commits

| | Commit |
|---|---|
| Certified candidate `integration/pre-sales-final` | `0d556cea` |
| `main` before | `c0e85078` (unmoved since certification; merge-base of the candidate = `origin/main`) |
| **Merge to `main`** (`--no-ff`, "Merge integration/pre-sales-final: certified pre-sales release") | **`c5c4a1b5`** — tree byte-identical to `0d556cea` |
| findable-site `master` before | `4486079` |
| findable-site certified `integration/pre-sales-wave1` | `978c806` (its change `31ab2c1` was **not** on `master` and **not** live — checked against the live `OnboardingFlow` chunk with a positive control) |
| **findable-site merge to `master`** (`--no-ff`) | **`f23d42e`** — tree byte-identical to `978c806` |

Pre-deploy checks: `git fetch`; certified commit present; `main` had **no** commits beyond the candidate's base; candidate
worktree clean; `origin` proved unmoved immediately before each push.

**Gate re-run on the merge (`npm run check`, `FINDABLE_SITE_DIR` = findable-site certified branch):** typecheck 9 = the
baseline list; edge syntax, edge names and import graph clean; production build OK; **310 / 310 suites**.

**Order deviation from the brief, on purpose:** the brief lists "merge, push main" before the migrations, but pushing
`main` auto-deploys the operator app, which needs SQL #8 and the new functions first (certification §13; Paul's
backend-before-frontend rule). So the merge was built locally, the SQL and the 38 functions went out from that exact
tree, and **then** `main` was pushed. The deployed edge code equals `main` (`c5c4a1b5`).

## 2. Recovery baseline (recorded before any change)

| | Before |
|---|---|
| Operator app (app.leadfinderos.com and leadfinderos-next.pages.dev) | entry chunk `index-0sdipN6O.js`, built from `main` `c0e85078` |
| findable-site production | Cloudflare Pages deployment `c796cb8b` (branch `master`, commit `4486079`) |
| Edge functions | 89 deployed. Versions of the 38 before → after are in §5. `whatsapp-status` v114 (2026-09-30). |
| Migrations | none of the ten applied (columns, tables, policy and functions read live) |
| Vault | 5 entries, of which 2 malformed (names = key material) |

## 3. Migrations — applied one at a time, in certification §12 order, each read back

Each file was byte-identical to the certified one (same tree). Before #4 and #8 the live definitions of the functions
they replace were diffed against the files they were written from. `monthly_update_save` / `_mark_sent` equal
`20261006100000`. Live `lead_log_contact` / `lead_record_call` / `lead_set_follow_up` differ from the new versions
**only** by the new guard blocks, so nothing newer was overwritten.

| # | File | Read-back (live) | Result |
|---|---|---|---|
| 1 | `20261006010000_templates_owner_only.sql` | `templates` policies = 4 owner policies, **no `sales_select_templates`** | ✅ |
| 2 | `20261006010100_inbound_lead_candidates.sql` | function exists, security invoker; EXECUTE: service_role yes, anon / authenticated no | ✅ |
| 3 | `20261006020000_quick_close_link_sharing.sql` | `lead_activity_kind_check` = all 31 previous kinds + `payment_link_shared`; `quick_close_events_kind_check` = all 7 previous + `link_shared`, `link_share_failed`, `link_superseded` | ✅ |
| 4 | `20261007030000_payment_client_state.sql` | 5 columns present; `client_contacted_via` CHECK; both monthly-update functions contain the `service_ended` refusal; anon no / authenticated yes; 0 rows hold a value | ✅ |
| 5 | `20261007040000_audit_budget_pools.sql` | `enrichment_usage.budget_pool` text + CHECK (guarantee / client / prospecting) + index | ✅ |
| 6 | `20261007040100_onboarding_service_truth.sql` | `services_not_offered`, `top_requests` text | ✅ |
| 7 | `20261007040200_remeasure_date_guard.sql` | `trg_outreach_leads_remeasure_date_guard` BEFORE UPDATE; the 4 stored re-measure dates have the **same fingerprint before and after** | ✅ |
| 8 | `20261007105000_call_workspace_guards.sql` | one `lead_set_follow_up` with 7 args incl. `_expected jsonb` and the `stale_next_action` check; call-log functions dedupe (window 10 s); privileges right. The two database callers that still pass 6 args (`lead_set_call_booked`, `assign_lead_with_brief`) **resolve** (rolled-back probe: the refusal came from inside the function, not "does not exist") | ✅ |
| 9 | `20261007200000_first_contact_activation.sql` | `first_contact_owed_since` timestamptz; **0** rows stamped | ✅ |
| 10 | `20261006070000_sales_prospect_checks.sql` | both tables; RLS on; exactly 2 SELECT policies; authenticated INSERT / UPDATE = false; anon SELECT = false; one-active-batch index; `sales_check` = `{"paid":true,"per_day":30}`; every **other** protection limit byte-identical before / after | ✅ |

Ronnie and MCL were not used for any migration test.

## 4. Vault clean-up — done

- Re-checked immediately before: the two entries are referenced by **no** cron job, database function or view (by id or
  name). Neither id appears anywhere in the code outside the docs, and no edge or app code reads the vault. All 15 database
  functions that read the vault do so **by name**, only `CRON_SECRET`, `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
  (each read count equals its name count).
- Deleted exactly the two ids recorded in `wave1-integration.md` §5.7 (`d896f9c2…`, `6c9a19be…`), guarded by `name ~ '^eyJ'`.
- Read-back: malformed entries **0**; 3 entries remain (the three names above); all three still decrypt. Cron runs after the
  deletion: all succeeded (§9).
- No key was rotated. No name or value was printed.

## 5. Edge functions — 38 deployed, `whatsapp-status` held

**Closure recomputed** from the merged tree (`check-import-graph --reached-by` for all 120 changed `src/` and
`supabase/functions/` files) = 59 functions:
- the certified **38** — identical set;
- `whatsapp-status` — held;
- **20** reached only through `src/lib/protectionLimits.ts`. Verified type-only for them: `_shared/protection.ts` imports
  only unchanged names (`guardRefusalDetail`, `isProtectionMode`, `USAGE_PAUSED_DETAIL`, types). Not redeployed, as
  certified.

**Deployed** (from `c5c4a1b5`): `process-ai-audit-queue` first (01:41 UTC), then in the certified order: `stripe-webhook`,
`paid-client-hub`, `quick-close`, `sales-prospect-check`, `security-admin`, `findable-onboarding`, and the rest.
**38 / 38 ACTIVE with a new version.** No other function's version changed.

| Function | v before → after | | Function | v before → after |
|---|---|---|---|---|
| admin-overview | 38 → 39 | | process-whatsapp-queue | 198 → 199 |
| backfill-lead-towns | 38 → 39 | | prospect-preview | 16 → 17 |
| business-summary | 32 → 33 | | quick-close | 13 → 14 |
| check-website | 61 → 62 | | render-audit-report | 146 → 147 |
| client-agreement | 3 → 4 | | render-remeasure-results | 46 → 47 |
| conversation-triage | 21 → 22 | | render-welcome-pack | 30 → 31 |
| crawl-check | 18 → 19 | | run-seo-scan | 73 → 74 |
| create-ai-audit | 167 → 168 | | sales-earnings | 14 → 15 |
| enrich-business | 106 → 107 | | sales-performance | 45 → 46 |
| extract-competitors | 49 → 50 | | **sales-prospect-check** | **new → 1** |
| findable-checkout | 73 → 74 | | scan-site-details | 46 → 47 |
| findable-onboarding | 139 → 140 | | security-admin | 7 → 8 |
| market-view | 98 → 99 | | send-whatsapp-message | 156 → 157 |
| niche-sample | 10 → 11 | | site-enquiry | 5 → 6 |
| notify-onboarding-submit | 46 → 47 | | stripe-webhook | 161 → 162 |
| page-generator | 84 → 85 | | submissions | 86 → 87 |
| paid-baseline | 41 → 42 | | voice-note-script | 19 → 20 |
| paid-client-hub | 57 → 58 | | warm-lead-reply | 23 → 24 |
| process-ai-audit-queue | **242 → 243** | | weekly-visibility | 8 → 9 |

**Markers in the deployed bundles** (Management API `functions/<slug>/body`; each needle grepped in the source first):

| Function | Marker | Live |
|---|---|---|
| process-ai-audit-queue | `autoMarkSixOfSixNotInterested`, `autoMarkHookLeadNotInterested`, `hook-not-interested` (old `main` had the 6/6 rule: 2 hits) | **0 / 0 / 0** |
| process-ai-audit-queue | `budgetPoolFor`, `POOL_DAILY_CAP_USD`, `APIFY_RESERVE_PCT` (absent anywhere in old `main`) | present |
| process-ai-audit-queue | `.is("service_terminated_at", null)` (ended clients never re-measured) | present |
| create-ai-audit | `budgetPoolFor` | present |
| sales-prospect-check | OPTIONS `x-sales-check-build: sales-prospect-check-1`; `SALES_CHECK_BATCH_MAX` | present |
| security-admin | `withDefaultActions`, `sales_check` | present |
| findable-checkout, quick-close | `quickCloseClosedRefusal` | present |
| stripe-webhook | `stampFirstContactOwed`, `subscription_claim` | present |
| paid-client-hub | `record_first_contact`, `first_contact_owed_since`, `services_not_offered` | present |
| crawl-check | `salesCrawlIdsRefusal` | present |
| page-generator | `NOT_OFFERED_PREAMBLE`, `measuredQuestionRefusal` | present |
| paid-baseline | `NOT_OFFERED_PREAMBLE`, `services_not_offered` | present |
| site-enquiry | `x-site-enquiry-build: site-enquiry-registry-1` (on its by-design 403 for an unlisted origin) | present |
| render-welcome-pack | "a separate measure", "separate from your AI visibility", "&mdash; not measured yet", "we never estimate one", both ownership lines | present |
| paid-baseline, process-ai-audit-queue, render-remeasure-results (every function reaching the results sender) | `REMEASURE_RESULTS_COPY_APPROVED = false` present, `= true` absent | **hold live** |

## 6. WhatsApp — `whatsapp-status`: HELD / NOT DEPLOYED

- `whatsapp-status` still **v114, 2026-09-30** — not deployed, by design: its certified fail-closed code needs the Findable
  App Secret, which does not exist yet.
- `WHATSAPP_APP_SECRET` is **not set**; no secret was added, guessed or changed. The Move37 secrets (`WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, test-mode pair) are in place. No WABA, number, webhook
  or Meta setting was touched. **Current Move37 production WhatsApp was not intentionally changed.**
- `send-whatsapp-message` and `process-whatsapp-queue` were redeployed as part of the certified 38. The sender's OPTIONS
  answers 200 (`x-swm-build 2026-10-04a-qa` — the certified source did not bump `BUILD_ID`, so the header alone does not
  tell old from new; the version bump and the other markers do). `whatsapp-queue-run` and `whatsapp-auto-replies-run` ran
  22 / 22 clean after the deploy. No WhatsApp was sent during the deployment (outside the 07:00–21:30 send window too).
- **The future action, in this order:** Findable Meta ready → the exact Findable App Secret configured →
  controlled `whatsapp-status` deployment → signed inbound QA test (and an unsigned POST → 401) → deliberate Move37 →
  Findable cutover. The post-call reply matcher rides `whatsapp-status` and waits for the same day.

## 7. Frontend

**Operator app** — `main` push `c0e85078..c5c4a1b5` → Cloudflare Pages (`leadfinderos-next`). New entry chunk
**`index-Bruvx6eJ.js`** on **both** `https://app.leadfinderos.com/` and `https://leadfinderos-next.pages.dev/` (the stale
`leadfinderos.pages.dev` was not used). Full crawl of the live app: 110 chunks, 0 fetch failures. Markers present:
"Check before calling" (entry, Outreach), "Checks left today" (Outreach), "Strong AI visibility" (call card), "We improve AI
visibility or you get your money back" (QuickCloseDialog), "Not confirmed by the client" (WebsiteBuild), "salespeople, last
7 days" and "pre-call checks" (AdminApiUsage), "payments in total" / "-month minimum" / "six weeks" (QuickCloseDialog,
findableOffer); `autoMarkSixOfSix` absent.

**findable-site** — `master` push `4486079..f23d42e`; `astro build` OK (19 pages); deployed with
`wrangler pages deploy dist --project-name=findable-site --branch=master` on "Paul@move37.fun's Account" (confirmed with
`wrangler whoami`) → deployment `ce99e331`. Live `findable.live/onboarding` now serves `OnboardingFlow.ZnkmNft-.js` with
`services_not_offered` / `top_requests` (the old chunk `OnboardingFlow.DUl-9GR9.js` had neither). Home page carries the
guarantee headline; `/refunds/` 200 with the 14-day sentence. `findable-onboarding` was deployed before the site.

## 8. Live production checks

**As the excluded "Test" salesperson** (`sales-test@leadfinder.invalid`). Sessions were minted with the Auth admin API
(magic link, no password), and **both were revoked afterwards**: one by logout (204); the browser one by deleting its
`auth.sessions` row. No Test-rep session from today remains.

| # | Check | Result |
|---|---|---|
| 1 | Login works | ✅ magic link → app.leadfinderos.com → "Good morning, Test", Sales dashboard |
| 2 | Salesperson sees only own prospects | ✅ via `sales_leads` (what the app reads): 26 rows, **all** assigned to Test; none of the 2,821 leads assigned to the other rep or the rest of the 5,547-lead book. A direct `outreach_leads` read returns 0 rows. |
| 3 | Paul's saved Quick Replies private | ✅ the rep reads **0** templates; Paul's 15 exist (service role) |
| 4 | Outreach loads | ✅ |
| 5 | "Check before calling" appears | ✅ panel and button |
| 6 | Allowance 30/day | ✅ server: `{"used":1,"limit":30}`; screen: "Checks left today: 29 of 30" |
| 7 | Batch max 20 | ✅ server answers `max: 20` |
| 8 | Cached result | ✅ "1 ready (1 reused)"; second press = `reused`, US$0, no guard row |
| 9 | Call workspace opens | ✅ via "Open the next ready lead": identity-first opener ("Hi, is that Dawson Plumbing & Heating? It's Test from Findable."), the finding, no website → **Build only** |
| 10 | Quick Close Build | ⚠️ **partly**: the dialog opens on production ("Question 1 of 6 … saved as you go", known facts filled). Not answered further: answering writes, and finishing creates a live Stripe Checkout link (brief: no payment objects). Build 5/5 → payment-ready is proved by the certification suites. |
| 11 | Optimise flow loads | ⚠️ **code only**: no QA lead with a website was available to the Test rep, so the Optimise script was not rendered live. Its text is in the live bundle ("Findable Optimise", "payments in total", "-month minimum"). |
| 12 | Six weeks / 42 days wording | ✅ call screen: "£99 today, then £99 a month starting six weeks after today … 12 payments in total … a 12-month minimum" + the guarantee line |
| 13 | Paid Client area loads | ⚠️ **not rendered** — admin only (see Verdict); `PaidClients` chunk live, `paid-client-hub` markers live |
| 14 | Website Build loads | ⚠️ **not rendered** — admin only; `WebsiteBuild` chunk with "Not confirmed by the client" live |
| 15 | Welcome Pack SEO grade separate | ✅ in the deployed renderer (§5); ⚠️ not rendered for a client |
| 16 | Admin API Usage / Security page loads | ⚠️ **not rendered** — admin only; `AdminApiUsage` chunk with "pre-call checks" / "salespeople, last 7 days" live |
| 17 | No new console / runtime errors | ✅ on the rep pages visited (dashboard, Outreach, call screen, Quick Close): no console errors (capture confirmed working) |

**The approved live paid check (one, as Paul authorised).** QA lead `ae3c9517` "Dawson Plumbing & Heating Solutions",
Halifax: assigned to Test, in `metric_exclusions`, **no phone, no email, no website, no campaign, never messaged**, so no
contact path exists at all. It was archived, so it was un-archived for the check and **re-archived after** (read back:
archived, `not_contacted`, Next Action none).

| Expected | Result |
|---|---|
| Audit starts | ✅ batch `9e019001…`, item → `done` in ~3 min |
| Stored on the right QA lead | ✅ audit `e93676cc…` (`lead_id` = the QA lead, `audit_purpose = audit`), run `d0b5fd3b…` complete |
| Cost attribution | ✅ guard row `api_usage_log`: `action = sales_check`, user = Test, `actor_role = sales`, est. US$0.0331, `allowed`. Ledger: 3 `ai_search` + corrections, all **`budget_pool = prospecting`**; run `actor_cost_usd` **US$0.028**; plus one Google town lookup US$0.005 (pool-less = prospecting). **Total ≈ US$0.033.** |
| Reaches Outreach | ✅ panel row "Ready", "Google AI did not name them — it named …" |
| Reaches call workspace | ✅ the same line + the script built from it |
| No email | ✅ by construction: the engine's import closure has no email sender (certified sweep), and the lead has no email address. There is no email-log table to read, so this is not a row-level proof. The only notification is the in-app "Audit finished" bell to the Test rep. |
| No WhatsApp | ✅ 0 messages, 0 sends, 0 auto-replies on the lead |
| No payment link | ✅ 0 `quick_close_events` |
| No Next Action / status change | ✅ lead row diff = only `is_archived` (ours), `updated_at`, and the town lookup's `town_fetched_at` / `lat` / `lng`. Status `not_contacted`, Next Action none, lost reason none. History = one `audit_run` by the rep. |
| 6/6 → not Not interested | **Result was 0 of 6**, so 6/6 was not exercised live. Proved instead by the deployed queue having no status rule (§5) and by production: **0** moves to Not interested since the deploy. |

Only **one** paid check was run. The second press was a free reuse.

## 9. Production smoke (02:09 UTC)

- Cron since the deploy: every job clean — `ai-audit-queue-run` 42 / 42, `whatsapp-queue-run` 22 / 22,
  `whatsapp-auto-replies-run` 22 / 22, `bulk-jobs-sweep` 22, `crawl-worker-run` 22, `notify-onboarding-submit-run` 22,
  `conversation-triage-run` 11, `security-sweep-run` 4, `daily-cron-run` 1, `notify-follow-ups-due` 1; **0 failures**.
- Internal calls (`net._http_response`): 143 × 200. Three had no status: pg_net's 5-second client timeout while the job ran
  on (the audit queue during the check, the 02:00 daily cron) — the normal pattern (21 of 2,214 in the prior week).
- Audit queue: 3 rows in 2 h, all `done`; no baseline or re-measure in flight; 5 open paid clients.
- `client_error_reports` since the deploy: **none**. Results emails sent since the deploy: **0**. WhatsApp since the
  deploy: **none**.

## 10. Apify

- The external cap **can** be read: `apify_account_usage` is captured from Apify's API every 15 minutes (96 snapshots in
  24 h). Latest (01:32 UTC): **US$28.87 used of a US$40.00 monthly cap** (72%), cycle 17 Sep – 16 Oct.
- **The cap is US$40, not the planned ~US$150.** Prospecting stops at 85% (≈ US$34), so this cycle about US$5 of
  prospecting remains (~150 fresh checks across all reps, single checks and free checks). Client work stops at 95%;
  guarantee work runs to 100%. Internal pools unchanged: guarantee $10/day, other client $8/day, prospecting $12/day.
- The Apify account was not touched. **MANUAL ACTION — CONFIRM / RAISE APIFY MONTHLY CAP TO ~US$150** before the reps use
  bulk checks.

## 11. Stripe, Ronnie, MCL, results email

- **Stripe:** no Stripe key or CLI is available to this session, so nothing was read or changed in Stripe. Both items
  stay manual (§13).
- **Ronnie** (`0ff7954f…`): ended 2026-10-04 (`client_ended_early`), £49.99, `payment_received`; no Stripe customer, no
  subscription id, no subscription claim; re-measure date 2026-10-13 is stored, but the live scheduler skips ended clients
  (`.is("service_terminated_at", null)` in the deployed `process-ai-audit-queue`); 0 audits / queue rows since the deploy.
  Not altered.
- **MCL** (`6d0585ac…` "MCLocksmiths centre"): ended 2026-10-03, £99; has a Stripe customer, **no subscription id and no
  subscription claim** in our database; re-measure date 2026-10-20 stored, skipped by the same filter. Not altered.
  Stripe's own view not checked (no access) — manual.
- **Results email:** the hold is live in all three functions that reach the sender (§5). 0 sent. Nothing was sent to any
  client.

## 12. Rollback reference

Nothing needs rolling back. If it ever does:
- **Operator app:** `git revert -m 1 c5c4a1b5` on `main` and push (auto-deploys); or roll back in the Cloudflare
  dashboard, project `leadfinderos-next`, to the deployment whose entry is `index-0sdipN6O.js`. (The wrangler login on
  this machine cannot see that project.)
- **Edge functions:** redeploy the 38 from a worktree of `c0e85078` (the old version numbers are in §5);
  `sales-prospect-check` can simply be left (nothing calls it on the old app) or deleted.
- **findable-site:** roll back to Cloudflare deployment `c796cb8b` (commit `4486079`), or redeploy `4486079` with
  `--branch=master`.
- **Migrations:** all additive except #1 (dropped `sales_select_templates` — re-create from
  `20260927100500` only if Paul wants reps to read his saved texts again, which was the leak) and #8 (the 6-arg
  `lead_set_follow_up` is gone; the old app's calls resolve to the new 7-arg one, so no rollback is needed for it).
  #7's trigger can be dropped with `drop trigger trg_outreach_leads_remeasure_date_guard on public.outreach_leads`.
- **Vault:** the two deleted entries were unused copies of key material held as names. There is nothing to restore.

## 13. Outstanding manual actions

1. **Paul — open the four admin screens once** (Paid Client, Website Build, a client's Welcome Pack, API Usage &
   Security) on app.leadfinderos.com. If they load, the deployment is complete.
2. **Confirm / raise the Apify monthly cap to ~US$150** (it is US$40; ≈US$5 of prospecting left this cycle).
3. **Stripe:** deactivate the two old Payment Links from Paul's old "Pricing" text (WS-1 §4.2); look once for any
   subscription / schedule on MCL's Stripe customer. No Stripe access was available here.
4. **Results email copy approval** (`final-certification.md` §8), then a deliberate commit flips
   `REMEASURE_RESULTS_COPY_APPROVED`. Still held.
5. **WhatsApp cutover sequence** (§6) when the Findable Meta App and its App Secret exist.
6. Optional: one Optimise call script and a full Build Quick Close on a QA lead with a website, when a Stripe test path is
   wanted — not done live here, to avoid creating a live Checkout session.
7. An unused one-time admin sign-in link was generated for the admin check and never opened. It expires on its own.

## 14. Production URLs verified

`https://app.leadfinderos.com/` (production), `https://leadfinderos-next.pages.dev/` (fallback, same build),
`https://findable.live/` (`/onboarding`, `/refunds/`), and `https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/*` (edge).
