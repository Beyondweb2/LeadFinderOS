# Deep clean — Phase 3 plan and progress (written 2026-09-16, evening)

The next session picks this up without re-deriving anything. Every fact below was measured on
2026-09-16 (repo at `main` = `880e26d5`, live DB via the Management API and PostgREST). Re-count a
number before quoting it to Paul; do not re-ask a decision listed in §1.

`INVENTORY_DEEP_CLEAN.md` (untracked, repo root) is the Phase 1 inventory this plan is built on —
§1a–§1g there list every dead file with the evidence. This file is the ORDER, the STATE and the
DECISIONS. CLAUDE.md §0/§3/§6 carry the rules.

---

## 1. Paul's standing decisions — DO NOT RE-ASK

| Keep / do | Detail |
|---|---|
| **Keep the `generated_sites` TABLE** | the live mockup product writes to it (`mockup/index.ts`, `_shared/mockup-trigger.ts`). Purge ONLY the barber rows (step 10), as `service_role` — the lock trigger refuses the postgres role and the Auth admin cascade |
| **Keep `check-website`** (+ `WebsiteStatusToggle`, `website_status_overrides`) | Findable's website tri-state needs detection |
| **Keep `no_whatsapp_needs_sms`** | the landline marker on 1,861 leads; its wording no longer mentions SMS (done in step 2) |
| **Keep the 5 barber WhatsApp templates in the display lists** | `LEGACY_WHATSAPP_TEMPLATES`, `TEMPLATE_DISPLAY`, barber bodies in `templateBodies.ts`, **`SUPERSEDED_BODIES`** — they render 71 historic transcripts. Only SENDABLE registries lose barber entries |
| **Keep `user_id` on every table and every RLS policy** | anon/authenticated hold full DML grants on all 56 tables; RLS is the only barrier. `has_role(admin)` sits in 14 tables' policies. Do not touch a policy "because single user" |
| **Keep `AdminApiUsage` + `admin-api-usage`, de-multi-usered** | drop "cost by user" only; keep spend today/month, cache stats, alerts |
| **Templates page stays** as the Inbox quick-reply source only | drop the "open the WhatsApp app" flow (`SingleWhatsAppDialog`, `TemplatePicker`, `AutoRotateToggle`, `useAutoRotateTemplate`, the dashboard task jump that opens it) |
| **i18n: remove the library, inline the strings, English only** | `i18next` + `react-i18next` out of `package.json` |
| **Purge the `barber-site-images` bucket** | public, 670 objects, 175.5 MB, last write 2026-07-11 |
| **DROP NO COLUMNS** | orphan columns are reported (INVENTORY §5), never dropped |
| **Merge each step into `main` as soon as it is approved**, one commit per step | `--no-ff`, prove `origin/main` unmoved first, push |
| **Show Paul the actual deletion list (files) for each step before deleting** | not a summary |
| **Stop before the SQL and the data/storage purges** | those go to Paul separately, one statement at a time, each with a read-back |
| `enrich-business` | "check whether the mockup photo pool uses it; if so keep" — **CHECKED 2026-09-16: it does NOT.** `_shared/mockup-pool.ts` imports `mapsEnrich` from `_shared/enrichment/sources.ts` directly (line 27) and never calls the function. `enrich-business` can go; `_shared/enrichment/sources.ts` must stay (audit engine) |
| Commit trailer | `Co-Authored-By: Claude <the model this session runs, as the harness names it> <noreply@anthropic.com>` |

---

## 2. Done (all merged into `main`, all pushed)

| Step | Branch | Commit → merge | What went |
|---|---|---|---|
| Gate | `cleanup/import-graph-gate` | `a8ade595` → `250b227a` | `scripts/check-import-graph.mjs` in `npm run check` |
| 1 Feedback | `cleanup/feedback` | `7ad62f79` → `86f1c379` | `Feedback.tsx`, `useTeamFeedback.ts`, `send-feedback` fn, route, nav, i18n keys, config.toml block |
| 2 SMS | `cleanup/sms` | `6aea3a90` → `ac37237b` | `process-sms-queue`, `twilio-inbound`, `_shared/enrichment/whatsapp.ts`, `SingleSMSDialog`, SMS buttons, `generateSMSUrl`, `'sms'` channel unions, SMS campaign method, dashboard SMS row + `sms_sends` read, config.toml blocks. Wording: "landline — flagged, not queued" |
| 3 Instantly | `cleanup/instantly` | `f4f0bb02` → `880e26d5` | `instantly-push`, `poll-instantly-replies`, `_shared/instantly-vars.ts`, `_shared/push-selection.ts`, `PushToInstantlyDialog`, `pushCrawlTargets.ts`, `crawlForPush`, bulk-jobs' whole `audit_and_push` job type, 4 tests (`instantly-vars`, `push-selection`, `push-crawl-targets`, `audit-push`), config.toml blocks. `RECHECK_AFTER_DAYS` moved into `src/lib/crawlBatch.ts` |

Also done before Phase 3: Meta Pixel out of `index.html`, Dashboard Full Reset button gone
(`06a4f815`), stray login `hawarmustafa878@gmail.com` deleted, CLAUDE.md split (`3b9f7aaf`).

**Gate state after step 3:** typecheck 9/9 baseline, edge syntax, edge undefined-name, import graph
(526 files / 40 entrypoints / 0 unresolved), build, **109/113 suites** — the four known-stale are
`coverage-lead-counts`, `report-attribution`, `verdict`, `site-origin` (Deno). `audit-push` was the
fifth and went with Instantly.

**Still Paul's from steps 1–3 (not done as of writing):**
- `select cron.unschedule('instantly-poll-run');` — **the cron is STILL ACTIVE** (`*/20 * * * *`,
  checked 2026-09-16 evening). `SQL_FOR_PAUL_unschedule_instantly_poll.sql` has it with read-backs.
  It calls the deployed `poll-instantly-replies` v28 every 20 minutes until then.
- Secrets `INSTANTLY_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER`.
- `functions delete` for `send-feedback`, `process-sms-queue`, `twilio-inbound`, `instantly-push`,
  `poll-instantly-replies` (step 8).
- Tables `team_feedback`, `sms_sends`, `sms_outreach_state`, `instantly_poll_state`; DB fns
  `invoke_sms_queue`, `invoke_instantly_poll`, `is_operator` (step 9).

---

## 3. The method, every step

1. `git fetch origin`; prove `main == origin/main`; branch `cleanup/<step>` off `main`. Paul has
   closed other sessions, so the primary checkout is fine; if another session may be open, use a
   worktree (CLAUDE.md §0).
2. Derive the file list from the repo (grep + `node scripts/check-import-graph.mjs --reached-by
   <file>`), not from this document alone. **Show Paul the list — files, sizes, edits, comment-only
   rewordings, what is kept — and wait for "approved as scoped".**
3. `git rm` the files; make the edits with the Edit tool or a Node script (never PowerShell text
   round-trips; the working tree is CRLF — match on LF-normalised text). Delete tests with their
   subjects in the same commit.
4. `npm run check`. Read the FAILED suite NAMES — only the four known-stale may fail.
5. Sweep: `grep -rnE "<deleted symbols|files>" src supabase scripts` — code references must be zero;
   comments citing a deleted thing as HISTORY may stay, present-tense ones get reworded.
6. Commit with `-F <file>`; merge `--no-ff` into `main` after re-proving `origin/main` unmoved; push.
7. Edge functions changed in the step are NOT redeployed by the merge. Record the redeploy list
   (from `--reached-by`) in the commit message; deploy when Paul says so, and verify by a marker only
   the new code produces (CLAUDE.md §3/§4). Deleted functions keep running until step 8.

---

## 4. Step 4 — contact discovery (email scraping, social enrichment)

Measured 2026-09-16. Callers verified by grepping `functions.invoke('…')` / `functions/v1/…`.

**Delete whole (12 files, ~2,700 lines):**

| File | Lines | Callers today |
|---|---|---|
| `supabase/functions/extract-email/index.ts` | 341 | `useFindEmails`, `useOutreachFindEmails` (both go) |
| `supabase/functions/extract-facebook/index.ts` | 202 | `enrich-business` only |
| `supabase/functions/enrich-lead/index.ts` | 263 | none |
| `supabase/functions/enrich-business/index.ts` | 597 | `useEnrichBusiness` (3 calls), `Index.tsx:348`, **`bulk-jobs` `enrich` job type** (see below) |
| `supabase/functions/_shared/apify-stub.ts` | 76 | `enrich-lead` only |
| `supabase/functions/_shared/enrichment/socialImages.ts` | 177 | `enrich-business`, `enrich-lead`, `useEnrichBusiness` (type import) |
| `src/hooks/useFindEmails.ts` | 81 | Find Leads "Find emails" |
| `src/hooks/useOutreachFindEmails.ts` | 157 | OutreachTable Find-emails button + "Select N with email" |
| `src/lib/crawlBatch.ts` | 77 | the hook + `LeadsTable`? — grep `crawlBatchPlan|CRAWL_MAX_PER_RUN|RECHECK_AFTER_DAYS` first |
| `src/hooks/useEnrichBusiness.ts` | 212 | `LeadEnrichButtons`, `Index.tsx` |
| `src/hooks/useSearchEnrichment.ts` | 31 | Find Leads |
| `src/components/SearchLeadContact.tsx` | 55 | Find Leads result row |
| `scripts/crawl-batch.test.ts` | 114 | test of the deleted leaf |

**Edits:**
- `src/components/LeadEnrichButtons.tsx` (167): the "Enrich (~$0.035)" and "Find email" buttons go;
  **KEEP the WhatsApp-capability chip** (`line_type` mobile/landline, ~lines 89–93) — it reads the
  offline classifier, not contact discovery. Either trim the component to the chip or move the chip.
- `src/components/OutreachTable.tsx`: the Find-emails button block (~:1990–2075: the button, the
  "Finding… (n/m)" state, the `targeting: N statuses` `<details>` picker, the "Select N with email"
  button and `handleSelectAllWithEmail` / `leadsWithEmail`), the `useOutreachFindEmails` destructure
  (~:1650–1670), `crawlStatuses` state, `Mail` icon import if unused after.
- `src/pages/Index.tsx:348` enrich-business call and whatever renders its result.
- `src/types/outreach.ts`: `CRAWLABLE_STATUSES_DEFAULT`, `CRAWL_STATUS_OPTIONS` (~:700–705) and the
  long comment above them that names the email channel.
- **`bulk-jobs` `enrich` job type** calls `enrich-business` over HTTP (`bulk-jobs/index.ts:195`) —
  with the function gone, `enrich` goes too: `JOB_CAPS.enrich`, the `enrich` branch in `runItem`,
  `job_type: "enrich" | "audit"` → `"audit"`, `BulkJobType` in `useBulkJobs.ts`, the "Bulk enrich"
  label in `bulkJobProgress.ts`, and whatever SPA button starts an enrich job (grep
  `onBulkJob('enrich'` / `'enrich'` in `OutreachTable.tsx`). Live: **0 `enrich` rows in `bulk_jobs`**.
  The `bulk_jobs.job_type` CHECK constraint keeps the value (DB-only, step 9 at most).
- `clear-enrichment-cache` fn (148) + `useOutreach.resetToFreshMultiple` ("Reset to fresh",
  `useOutreach.ts:1204`): **DECIDE with Paul in the list.** Its step (b) deletes the lead's
  `generated_sites` row — today that would delete a live mockup draft. Recommendation: delete the
  function and the action.
- `config.toml`: entries for every deleted function (check each exists).
- Docs: `PHASE2-ENRICHMENT-SPEC.md` (tracked) — delete or move to `docs/` as history; Paul's call.

**Keep (say so in the list):** `google-place-details` (phone/address on lead add), `check-website`,
`_shared/enrichment/{ai-search,apify,apify-usage,runner,seo-scan-core,sources,websiteClassify}.ts`
(the audit engine — 19 functions reach them), tables `enrichment_cache`/`enrichment_usage`/
`api_usage_log` (spend cap and cost accounting), columns `email_status`/`email_method`/
`email_last_checked_at` (448 leads), `facebook_*`/`instagram_*`/`enrichment_source`/`image_url`,
the `email` column itself (onboarding and free check write it), `contact_method='email'` (278 leads).

**Redeploy after merge:** whichever live functions import a module you touched — expected `bulk-jobs`
only. Run `--reached-by` on every edited `_shared` file to be sure.

---

## 5. Step 5 — tour / demo scaffolding, i18n, and the open-the-WhatsApp-app flow

Counts measured 2026-09-16.

**Tour scaffolding — delete whole:**

| File | Lines | Mounted from |
|---|---|---|
| `src/components/OutreachIntroModal.tsx` | 112 | `Outreach.tsx` (~:319–325) |
| `src/components/OutreachTipsDialog.tsx` | 116 | `Outreach.tsx` |
| `src/components/PostContactModal.tsx` | 83 | `Outreach.tsx` |
| `src/components/TipBar.tsx` | 59 | `Dashboard.tsx` |
| `src/components/FirstTimeRedirect.tsx` | 32 | wraps `/` in `App.tsx` |
| `src/lib/demoLeads.ts` | 120 | **32 `isDemoLead()` call sites** in `Outreach.tsx`, `OutreachTable.tsx`, `LeadDetailDialog.tsx`, `LeadDeliveryCockpit.tsx`; demo-lead persistence in `LeadSearchContext.tsx` (~:151–193, :552–565); `search-leads` demo branch — grep `demo` there |

**Tour residue — edits:** ~27 `demo-checklist-*` event dispatches, `challenge-contact-sent`,
`post-first-search-complete`, `post-search-tip`, `outreach-intro-dismissed`, `outreach-message-sent`,
`outreach-first-contact-click` (all with no listener left — grep `dispatchEvent(new CustomEvent(`);
36 `data-walkthrough` / `data-walkthrough-step` attributes (`AppSidebar`, `MobileBottomNav`, `Index`,
`OutreachTable`, `OutreachMobileCard`…); `walkthroughContactedIds` state + `highlightLead` in
`OutreachTable.tsx`; the `localStorage` first-run keys (`leadfinder_first_route_done` etc.).

**Trial / paywall / guest gating (multi-user-era, dead):** `LeadSearchContext` `hasProAccess` /
`freeSearchExhausted` / `trialLimitError` / `TRIAL_LIMIT_REACHED` / `GUEST_LIMIT_REACHED`
(~:66–129, :408–459); `search-leads` `FREE_SEARCH_LIMIT = 5` (:23, unused). Verify each before
listing — the inventory measured these on 09-15.

**`AiOpenerModal.tsx` (142) + `admin-ai-opener` fn (184):** inventory says almost certainly dead
(its prompt pitches website building to web designers). **Paul has not decided — put it in the step-5
list as DECIDE with that one sentence.** Mounted from `OutreachTable.tsx` (`aiOpenerLead`,
`setAiOpenerLead`, the `onAiOpener` prop on `SingleWhatsAppDialog`).

**i18n — remove the library, inline the strings:**
- Only **8 files** import `react-i18next` / `i18next`: `AppSidebar.tsx`, `MobileBottomNav.tsx`,
  `OutreachIntroModal.tsx` (deleted above), `OutreachTipsDialog.tsx` (deleted), `PostContactModal.tsx`
  (deleted), `UserMenu.tsx`, `Auth.tsx`, `src/i18n/index.ts`.
- **85 `t('…')` call sites** in total; 307 keys in `src/i18n/locales/en.json`, 127 used before this
  step, fewer after the modals go. Inline each remaining `t('key')` with the English string from
  `en.json`, delete `src/i18n/`, remove the `import '@/i18n'` side-effect (grep `@/i18n` in
  `main.tsx`/`App.tsx`), remove `"i18next"` and `"react-i18next"` from `package.json`, `npm install`
  so the lockfile follows.
- Also dead strings: `userMenu.proRenews`, `proTrialEnds`, `nav.affiliates`, `common.admin` (the
  last two are read by `MobileBottomNav`'s admin items — step 7 removes those items; coordinate).

**The open-the-WhatsApp-app flow (decision 3):** `src/components/SingleWhatsAppDialog.tsx` (321),
`TemplatePicker.tsx` (160), `AutoRotateToggle.tsx` (25), `src/hooks/useAutoRotateTemplate.ts` (45);
in `OutreachTable.tsx` the `whatsappDialogLead` state, `setWhatsappDialogLead`, `launchTemplate` /
`launchLink` / `launchIntent` handling (`Outreach.tsx` `LaunchIntent` type), `handleDialogSent`, the
dialog mount, `generateWhatsAppUrl` in `leadUtils.ts` if no caller remains; `useContactAction` /
`useOutreachAttempt` (the manual "open the app" attempt logger writing `outreach_events`) — check
whether anything else calls them; `dashboardTasks.ts` `JumpTarget` `'whatsapp'` jump that opened the
dialog (`useDashboardMetrics`/`NextActionsCard`). **The Templates page (`/templates`,
`useTemplates`) stays.** `SingleWhatsAppDialog.tsx` is also a `log_usage_event` writer (see step 7).

**Redeploy:** `search-leads` if its demo/trial branches change; nothing else edge-side.

---

## 6. Step 6 — barber branches inside LIVE functions (stripe-webhook LAST)

These are dead branches in functions that are live and load-bearing. One function per commit is
allowed within the step; **`stripe-webhook` is its own commit, its own deploy, marker-verified,
last.** Verified symbol locations 2026-09-16:

| Function / file | Barber residue | Note |
|---|---|---|
| `_shared/whatsapp-send.ts` | barber `WA_TEMPLATES` entries (~:78–84, `booking_page_intro` etc.), `WA_DEFAULT_TEMPLATE = "booking_page_intro"` (:239, unused), barber body renderers (`bookingPageIntroBody` :613 and siblings ~:567–575), the `share_token` comment (:43) | **Reached by 9 functions** — `create-ai-audit`, `findable-onboarding`, `mockup`, `process-ai-audit-queue`, `process-whatsapp-queue`, `send-whatsapp-message`, `stripe-webhook`, `submissions`, `whatsapp-status`. All nine redeploy. ⚠️ Check `scripts/template-registry-parity.test.ts` / `template-bodies-parity.test.ts` first: they compare `WA_TEMPLATES` against `WHATSAPP_TEMPLATES` and the bodies against `templateBodies.ts` — the legacy barber bodies stay on the SPA side (decision), so the parity tests may need the legacy set excluded on the server side |
| `process-whatsapp-queue/index.ts` | `CLAIM_ORIGIN = "https://yoursites.uk"` (:226), barber entries in its `TEMPLATES` mirror (:239–246), `generated_sites.share_token` reads for `url` templates (~:1055–1059, :1458–1523 — the `claimUrl` branch) | live drip; deploy and verify by `mode:"status"` needs CRON_SECRET/admin JWT — use the OPTIONS/marker approach |
| `send-whatsapp-message/index.ts` | `CLAIM_ORIGIN` (:48), the `share_token` / `claimUrl` branch (~:519–526) | bump `BUILD_ID`; verify via `x-swm-build` on OPTIONS |
| `clear-enrichment-cache` | step (b) deletes the lead's `generated_sites` row | gone in step 4 if Paul agrees; otherwise remove the branch here |
| `stripe-webhook/index.ts` | `PaidSite` type (:34), `resolveBarberEmail` (:72–88), `notifyOfPayment` barber email to `paul@yoursites.uk` (:359–~426), `setPaid` on `generated_sites.is_paid` (~:648–669), `metadata.generated_site_id` discriminators (:1131, :1197, :1238–1269), header comment (:16–26) | ⛔ **LAST.** The Findable branch keys on the ABSENCE of `generated_site_id`; removing the barber branch must leave every Findable event path byte-identical. Test with Stripe CLI/test event if available, else deploy and watch the next real event's `client_error_reports` |
| `src/lib/whatsappTemplates.ts` `WA_TEMPLATE_REQS` barber entries (`needsUrl`, ~:59–62) | harmless dead branch | delete |
| `index.html` | title/description/OG for "Find Web Design Clients Fast", `og:image`/`og:url` on yoursites.uk, `facebook-domain-verification` meta, `apple-mobile-web-app-title: My Website`, the UTM/fbclid capture script (~:40–70) | marketing residue; Paul decides the new title |
| `public/` | `og-default-barber.jpg` (126 KB), `og-default-salon.jpg` (254 KB), `og-image.png` (364 KB, yoursites), `sitemap.xml` (deleted marketing routes), `robots.txt`, `llms.txt` (LeadFinder Pro copy); `sw.js` + `manifest.webmanifest` + icons = PWA shim → **DECIDE: does Paul install the dashboard as an app?** | |
| `scripts/rls-isolation-probe.mjs` (235) | barber RLS probe needing barber logins | delete |
| `SALON-DASHBOARD-SPEC.md` (tracked) | history vs noise | Paul's call; move to `docs/` if kept |
| `mirror_whatsapp_send_to_inbox` trigger | barber CASE branches inside a LIVE trigger body | **SQL — step 9**, Paul, after reading `pg_get_functiondef` |

---

## 7. Step 7 — the multi-user surface (RLS and `user_id` untouched)

| Item | Lines | Action |
|---|---|---|
| `src/components/dashboard/AdminZone.tsx` | 705 | delete; remove its mount and `isAdmin &&` gate in `Dashboard.tsx` |
| `supabase/functions/admin-users/index.ts` | 387 | delete (only caller AdminZone); config.toml entry |
| `supabase/functions/admin-api-usage/index.ts` | 195 | **keep, de-multi-user**: drop `costByUser`, `searchesByUser`, `costByUserToday`, the `userIds` lookup (~:73–79, :116, :138–171, :180); keep totals, cache stats, alerts |
| `src/pages/AdminApiUsage.tsx` | 269 | keep; drop the `costByUser` type + the per-user table (~:19, :254) |
| `src/components/MobileBottomNav.tsx:84` | | remove the two admin items — `/admin` (redirects to the dashboard) and **`/admin/affiliates` (no route → NotFound, a live bug)** |
| `isAdmin` gates | 33 uses in 10 files | each gate becomes "always on" or is removed **one by one, reading what it hides** — never a blind search-and-replace. `useSubscription.isAdmin` and `RequireAdmin.tsx` STAY (the positive operator gate) |
| `AiOpenerModal` + `admin-ai-opener` | 142 + 184 | if not settled in step 5 |
| `profiles` (2 rows) + `handle_new_user_profile` trigger + `useAvatar.ts` (97) + `avatars` bucket (0 objects) + `UserMenu` avatar upload / change-password | | **DECIDE** — cosmetic, never used. Recommend delete the avatar code, leave the table (SQL step) |
| `log_usage_event` RPC → `usage_events` (4,491 rows, written today) + `user_metrics` (1 row) + `reset_my_metrics` | writers in `LeadSearchContext.tsx`, `useContactAction.tsx`, `useOutreach.ts`, `SingleWhatsAppDialog.tsx`, `search-leads` | the only READER is `admin-users`. Once that goes: remove the 5 writer call sites (SPA + `search-leads` → redeploy `search-leads`); tables/RPCs to step 9 |
| `useDashboardMetrics(isAdmin)` param | | drop the param once no gate reads it |
| Tables `lead_claims` (3,361 rows), `lead_notes` (0), `personal_actions` (0), `lead_contacts` (0) | | no reader anywhere → step 9 |
| `campaigns.created_by` + its policies | | KEEP |
| `useSubscription.tsx` FULL_ACCESS shim billing fields | | no callers; keep `isAdmin`; trimming is optional |

---

## 8. Step 8 — `functions delete` the orphan deploys (needs Paul's word, then run them)

Measured 2026-09-16 with `npx supabase functions list`: **62 deployed, 40 with source, 22 without.**

**Delete (20):** `begin-claim`, `claim-info`, `claim-share`, `claim-site`, `connect-subdomain`,
`create-booking`, `create-claim-link`, `generate-barber-site`, `generate-playbook`, `get-availability`,
`record-site-event`, `rehost-image`, `reset-test-barber`, `scan-services`, `send-reminders` (the
barber era, 15) + `send-feedback`, `process-sms-queue`, `twilio-inbound`, `instantly-push`,
`poll-instantly-replies` (Phase 3 steps 1–3, 5).

⛔ **Do NOT delete `scrape-directory` v27 or `enrich-directory-business` v22** — they belong to the
separate *findable-directory* repo (memory: `findable-directory.md`), deployed to the same project.

Command per function: `npx supabase functions delete <name> --project-ref ruusxpkkmwtljxxulhbq`.
Verify with `functions list` afterwards (expect 42 → 40 after step 4's deletions land too). Unschedule
`instantly-poll-run` BEFORE deleting `poll-instantly-replies`, or the cron errors every 20 minutes.

Steps 4–7 add more (`extract-email`, `extract-facebook`, `enrich-lead`, `enrich-business`,
`clear-enrichment-cache` if agreed, `admin-users`, `admin-ai-opener` if agreed) — delete those in the
same pass, after their source is gone from `main`.

---

## 9. Step 9 — SQL, to Paul one statement at a time (each with a read-back)

Nothing here runs from a session. Hand each block over, wait for "done", read the catalogue back.
Order suggested; every line is Paul's call:

1. `select cron.unschedule('instantly-poll-run');` — **first, still active.**
2. Dead DB functions: `invoke_instantly_poll`, `invoke_sms_queue`, `reset_my_account`,
   `_reset_account_for`, `reset_my_metrics`, `bookable_staff`, `owns_site`, `owns_staff`,
   `site_is_published`, `staff_site_published`, `claim_generated_site`; `is_operator` only AFTER
   `team_feedback` is dropped (its policies use it). ⛔ NOT `lock_generated_sites_protected_fields`
   (keeps firing while `generated_sites` lives), NOT `has_role`, NOT `handle_new_user_profile` unless
   `profiles` goes.
3. `mirror_whatsapp_send_to_inbox`: rewrite without the barber CASE branches — read
   `pg_get_functiondef` first, keep every live branch byte-identical.
4. Dead tables (dropping a table drops its policies — that is the one RLS change Paul has to accept,
   and only for tables with no reader): `team_feedback`, `sms_sends`, `sms_outreach_state`,
   `instantly_poll_state`, `bookings`, `booking_staff`, `staff_working_hours`, `hosting_clients`,
   `preview_links`, `claim_tokens`, `site_events`, `lead_claims`, `lead_notes`, `personal_actions`,
   `lead_contacts`; after step 7 also `usage_events`, `user_metrics` (and `profiles` if decided).
   ⛔ NOT `outreach_events` (read by `useDashboardMetrics`), NOT `outreach_history` (lead-add
   dedupe), NOT `client_listings` (read by `usePlaybook`), NOT `enrichment_*` / `api_usage_log`.
5. `bulk_jobs.job_type` CHECK constraint: may keep `audit_and_push`/`enrich`/`site_gen` — 27 old
   rows carry those values, so tightening it needs those rows deleted first. Recommend leave.
6. `lead_status` enum (22 values, nothing reads it) — report only, leave.
7. **No column drops. Ever, in this clean.**

---

## 10. Step 10 — storage and data purges (Paul's explicit call, each)

| Purge | Size | How |
|---|---|---|
| Bucket `barber-site-images` | 670 objects, 175.5 MB, public, last write 2026-07-11 | Storage API as service_role: list → delete in batches → delete bucket. Irreversible |
| Bucket `lead-images` | 2 objects, 0.4 MB | same |
| `generated_sites` barber rows | 105 rows (Jun–Jul 2026, barber/plumber); **keep the 2 Sep 2026 `locksmith` mockup drafts and any newer mockup row** | `DELETE` via PostgREST **as `service_role`** (legacy JWT) — the lock trigger refuses everything else. Select the ids by `created_at < '2026-08-01'` AND template/type = barber first, show Paul the count |
| `campaigns` barber rows (4) | | **KEEP** (data; `CampaignFormDialog` preserves the legacy template value) |
| Secrets | `STRIPE_BARBER_PRO_PRICE_ID`, `CLOUDFLARE_API_TOKEN`, `INSTANTLY_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER`, `SMS_TEST_MODE` | `npx supabase secrets unset <NAME>` — only after the functions that read them are deleted. ⚠️ `FINDABLE_WEBSITE_PRICE_ID` stays (Stripe record of earlier charges) |

---

## 11. After Phase 3

- Update CLAUDE.md §0 (honest green count, "deep clean done"), §3 (drop the "17 functions deployed
  with no source" line), §6 (`user_id` block: `has_role` count if any table went), §7 (cron list).
- Regenerate nothing: no columns dropped, `types.ts` stays as it is (it already lags the DB by 39
  columns — INVENTORY §5).
- `INVENTORY_DEEP_CLEAN.md` stays untracked as Paul's record; move it into `docs/` only if he wants
  it in the repo.
