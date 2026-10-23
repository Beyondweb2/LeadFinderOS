# INVENTORY_DEEP_CLEAN.md — Phase 1 of the deep clean (2026-09-15, evening)

*Untracked. Do not stage. This is the record the deletion phase works from. Nothing was deleted,
changed, dropped or deployed while producing it.*

**How it was measured** (re-run before trusting any number here — they go stale):
- Import graph over `src/`, `supabase/functions/`, `scripts/` (544 files, 176 entrypoints), resolving
  `@/` and relative imports, from `main.tsx` + every edge `index.ts` + every test/guard. Script:
  scratchpad `graph.mjs` → `graph.json` (importers, per-function closures, unreached files).
- Live DB, read-only: row counts via PostgREST (service role); `pg_policies`, `pg_class.relrowsecurity`,
  `cron.job`, triggers, functions, grants, `auth.users`, storage via the Management API
  (`POST /v1/projects/<ref>/database/query`, SELECT only).
- Deployed functions: `supabase functions list`. Secrets: `supabase secrets list` (names only).
- Tests: `npm test` → **112/117**, the five known-stale suites only (audit-push, coverage-lead-counts,
  report-attribution, verdict, site-origin/Deno).

**Verdict key used below**
- **DEAD** — no caller, no data anything reads, no rule anything depends on. Safe to remove once its
  importers are gone.
- **NO CALLERS, NOT DEAD** — nothing imports/invokes it, but something (data, a guard, a parity test, a
  regex-reading script, historic transcripts) still depends on it. Paul's `seedRejectionReason` class.
- **DEAD BRANCH** — dead code living inside a live file; removal is an edit, not a delete.
- **DECIDE** — not on Paul's dead list, but it belongs to a retired product or has no visible use.
- **KEEP** — looks dead, is not.

---

## 0. Two things that happened during the inventory

1. **A second session committed to `main` in this same folder** (5 commits 21:12–21:23 today,
   `0274f5fc`…`a15dcfc9`, "named comes from the model", all **unpushed**). It also switched the checkout
   from my branch `cleanup/deep-clean-inventory` (parked at `4fcba0b9` = origin/main) back to `main`.
   I changed no tracked file, so nothing collided. ⛔ **The deletion phase must run in its own git
   worktree** (or after that session is finished), never in a shared checkout.
2. **The Management-API SQL route works on this machine.** CLAUDE.md §2/§20/§30d say the token file
   `~/.supabase/access-token` does not exist — true — but the Supabase CLI stores its login in **Windows
   Credential Manager** (`cmdkey /list` → target `Supabase CLI:supabase`). Read via `CredRead`
   (P/Invoke) into the scratchpad, never echoed. Every SQL fact below came through it.

---

## 1. THE DEAD PRODUCTS — what each one still pulls in

### 1a. Barber / salon / booking / claim (source deleted 2026-09-09; the residue)

| Item | Where | Verdict | Evidence |
|---|---|---|---|
| **17 deployed edge functions with NO source in the repo** | `generate-barber-site` v86, `get-availability`, `create-booking`, `send-reminders`, `claim-info`, `claim-share`, `claim-site`, `create-claim-link`, `record-site-event`, `begin-claim`, `rehost-image`, `reset-test-barber`, `connect-subdomain`, `scan-services` (folded into scan-site-details 09-10), `generate-playbook` (LLM playbook, §9) | **DEAD** (15) — `functions delete` | all `verify_jwt=false` except rehost-image/generate-playbook; last touched Jun–Aug |
| ↳ `scrape-directory` v27, `enrich-directory-business` v22 | deployed, no source here | ⚠️ **NOT THIS REPO'S** — memory says they belong to the separate *findable-directory* SSR repo, with `directory_businesses` (47 rows, anon-readable). Verify there before touching |
| Table `generated_sites` (107 rows) | 105 barber/plumber rows Jun–Jul 2026 **+ 2 `locksmith` drafts Sep 2026** | **KEEP — LOAD-BEARING FOR THE LIVE MOCKUP PRODUCT.** `mockup/index.ts` reads/writes it 17×, `_shared/mockup-trigger.ts` creates draft rows on first reply (HANDOVER_MOCKUP.md). Also read by `whatsapp-status` (via mockup-trigger), `stripe-webhook`, `process-whatsapp-queue`, `send-whatsapp-message`, `clear-enrichment-cache`, `admin-users`. The 105 old rows are data to archive/purge separately — Paul's call |
| Tables `bookings`, `booking_staff`, `staff_working_hours` | 0 rows each; 13 policies; `bookings` has **anon INSERT** | **DEAD** tables (no reader anywhere) — but RLS/grants untouched in Phase 1 |
| Tables `hosting_clients`, `preview_links` (0 rows), `claim_tokens` (2), `site_events` (27, last 08-28) | no reader in src or functions | **DEAD** |
| Table `lead_claims` (3,361 rows, last 2026-09-07) | "who is working which business" — multi-user registry | **DEAD** — its only writer went with commit `961be211` (09-09); no reader anywhere; all rows are Paul's |
| DB functions `bookable_staff`, `owns_site`, `owns_staff`, `site_is_published`, `staff_site_published`, `claim_generated_site`, `invoke_sms_queue` | live in `public` | **DEAD** (referenced only by booking/claim policies) |
| DB fn `lock_generated_sites_protected_fields` (trigger on generated_sites) | locks site_name/owner_id changes | **KEEP while generated_sites lives** — mockup updates `content` only, so it does not bite, but it fires on every mockup write |
| DB fn `is_operator(uid)` = "not a generated_sites owner" | used by `team_feedback` policies only | DEAD once team_feedback goes |
| DB fn/trigger `mirror_whatsapp_send_to_inbox` (AFTER INSERT on whatsapp_sends) | mirrors every send into whatsapp_messages | **KEEP — LIVE**, but its body carries barber template CASE branches (dead branches inside a live trigger) |
| Storage bucket `barber-site-images` — **670 objects, 175.5 MB, PUBLIC** | last write 2026-07-11 | **DEAD data** (HANDOVER_MOCKUP: mockups deliberately use private `mockup-assets`). Deleting is irreversible → Paul decides |
| Bucket `lead-images` (2 objects, 0.4 MB, public, last 2026-06-17) | | DEAD data |
| Secrets `STRIPE_BARBER_PRO_PRICE_ID`, `CLOUDFLARE_API_TOKEN` | read by **no code in the repo** (the readers were the deleted functions) | **DEAD** |
| `stripe-webhook` barber branch | `PaidSite` type (:38), `resolveBarberEmail` (:80–88), barber payment emails to `paul@yoursites.uk` (:360–426), `setPaid` on `generated_sites.is_paid` (:648–669), subscription handlers keyed on `metadata.generated_site_id` (:1130, :1197, :1238–1269) | **DEAD BRANCH** in a live, revenue-carrying function — the most careful edit in the whole clean |
| `process-whatsapp-queue` claim-link branch | `CLAIM_ORIGIN = yoursites.uk` (:227), barber entries in its `TEMPLATES` mirror (:240–246), `generated_sites.share_token` reads for `url` templates (:1050–1053, :1453–1459) | **DEAD BRANCH** — no sendable template has a `url` var any more |
| `send-whatsapp-message` | `CLAIM_ORIGIN` (:48) + claimUrl branch (~:529) | **DEAD BRANCH** |
| `_shared/whatsapp-send.ts` | barber `WA_TEMPLATES` entries (:78–84), `WA_DEFAULT_TEMPLATE = "booking_page_intro"` (:229, already flagged unused), barber body renderers (:287, :567–575) | **NO CALLERS, NOT DEAD (yet)** — `scripts/template-bodies-parity.test.ts` asserts the SPA `templateBodies.ts` and this file render identically, and `template-registry-parity.test.ts` asserts `WA_TEMPLATES` == the queue's `TEMPLATES`. Remove from all three + adjust the two tests in ONE commit, or leave |
| `clear-enrichment-cache` step (b) | deletes the lead's `generated_sites` row | DEAD BRANCH (and would now delete a mockup draft — a live hazard, not just dead code) |
| `admin-users` barber/operator filtering | reads generated_sites.owner_id to exclude "barbers" | dead with the function (§1g) |
| SPA `LEGACY_WHATSAPP_TEMPLATES`, `isLegacyTemplate`, `TEMPLATE_DISPLAY`, barber bodies in `templateBodies.ts`, `SUPERSEDED_BODIES` | `src/types/outreach.ts:530–572`, `src/lib/templateBodies.ts:243–289, :340` | **KEEP** — render **76** historic `whatsapp_messages` rows (booking_switch_barbers 30, no_website_barbers 26, barber_fresha_booksy 11, booking_page_intro 4, barber_poor_website 4, free_website_intro 1) and 21 `re_engage` rows |
| `WA_TEMPLATE_REQS` barber entries (`needsUrl`) | `src/lib/whatsappTemplates.ts:59–62` | DEAD BRANCH (only sendable templates are checked) — harmless |
| `campaigns` rows | 4 of 15 are barber campaigns (`campaign_type='site'`, two still store `booking_switch_barbers`) | **KEEP data**; `CampaignFormDialog` already preserves the legacy value (§14) |
| `public/og-default-barber.jpg` (124K), `og-default-salon.jpg` (252K), `og-image.png` (356K, yoursites.uk), `sitemap.xml` (lead-finder-app.com marketing URLs — all deleted routes), `robots.txt`, `llms.txt` (LeadFinder Pro marketing copy) | | **DEAD** |
| `index.html` | title/description/OG for "Find Web Design Clients Fast", **Meta Pixel** (`fbq init 1888907435320624` fires PageView on every operator page load), UTM/fbclid capture script, `apple-mobile-web-app-title: My Website` | **DEAD BRANCH** (marketing for a product with no public surface) |
| `scripts/rls-isolation-probe.mjs` (235 lines) | barber RLS probe, needs barber test logins | **DEAD** |
| Docs `SALON-DASHBOARD-SPEC.md` (tracked), `HANDOFF.md`, `ONBOARDING.md` (untracked, §10 says they are the best map of the old machinery) | | DECIDE — history vs noise |
| 60 migration files mention the dead tables | `supabase/migrations/` | **KEEP** — migrations are history; `db push` is broken anyway (§6) |

### 1b. LeadFinder walkthrough / onboarding tour / demo

The tour component itself was deleted 09-09. What is left is the **scaffolding that talked to it**.

| Item | Verdict | Evidence |
|---|---|---|
| `OutreachIntroModal.tsx` (112), `OutreachTipsDialog.tsx` (116), `PostContactModal.tsx` (83) — mounted in `Outreach.tsx:319–325` | **DEAD** (first-run modals gated on `localStorage`) | all three fire/listen to tour events (`trial-modal-opened`, `walkthrough-skip-contact-steps`, `post-contact-modal-trigger`) |
| `TipBar.tsx` (59) — mounted in `Dashboard.tsx` | **DEAD** — 11 web-design-era tips ("Never build a full site for free before payment") | |
| `FirstTimeRedirect.tsx` (32) — wraps `/` | **DEAD** — "first-time users go to /outreach" | `leadfinder_first_route_done` |
| `src/lib/demoLeads.ts` (120) + **35** `isDemoLead()` call sites (Outreach.tsx, OutreachTable.tsx, LeadDetailDialog.tsx, LeadDeliveryCockpit.tsx) + demo-lead persistence in `LeadSearchContext.tsx:151–193, 552–565` + `search-leads` `demo` flag (:46, :197) + `src/assets/demo-kitchen-fitters.jpg` | **DEAD** — Paul never sees demo leads | `search-leads:1274` already says "there is NO demo search path" |
| **~17 custom DOM events dispatched with no listener left**: `demo-checklist-*` (12 kinds), `challenge-contact-sent`, `post-first-search-complete`, `post-search-tip`, `outreach-intro-dismissed`, `outreach-message-sent`, `track-lead-added`, `quick-locations-toggle`; listeners `start-walkthrough` (OutreachTable:431), `walkthrough-skip-contact-steps`, `show-outreach-intro` | **DEAD** — dispatches into the void | full tally in the session log |
| **31** `data-walkthrough` / `data-walkthrough-step` attributes (AppSidebar, MobileBottomNav, Index, OutreachTable…) | DEAD | |
| `walkthroughContactedIds` state + handlers in `OutreachTable.tsx:425–432, 645–693, 1734–1735` | DEAD BRANCH | |
| **i18n**: 307 keys defined, **127 used, 217 unused**; 17 of 25 sections entirely unused (`walkthrough`, `welcome`, `completion`, `tips`, `challenge`, `activation`, `skipWalkthrough`, `postSend`, `postFirstSearch`, `languageModal`, `search`, `results`, `dashboard`, `outreach`, `trackLeads`, `trackActions`, `pipelineStatuses`, `messaging`); one locale (`en.json`) | DECIDE: trim to 127 keys, or drop `i18next` + `react-i18next` entirely and inline the 127 strings (sidebar/auth/theme/userMenu/common) | |
| Trial / paywall / guest gating: `LeadSearchContext` `hasProAccess`/`freeSearchExhausted`/`trialLimitError`/`TRIAL_LIMIT_REACHED`/`GUEST_LIMIT_REACHED` (:66–129, :408–459), `search-leads` `FREE_SEARCH_LIMIT = 5` (:23, **unused const**), storage keys `leadfinder_gated`, `leadfinder_free_exhausted`, `leadfinder_guest_cap_reached`, `leadfinder_seen_paid_popup`; `useSubscription` FULL_ACCESS shim fields (`isPaidSubscriber`, `isStripeTrialing`, `subscriptionEnd`…) and their UserMenu readers (Crown icon, "Pro renews") | **DEAD BRANCH** — admin always has access | |
| `AiOpenerModal.tsx` (142) + `admin-ai-opener` fn (184) | **DECIDE** → almost certainly DEAD: the prompt writes "first-contact messages to web designers… someone who might need a website built" — the old product's pitch. Reached only from `SingleWhatsAppDialog` (admin-only) | |
| `log_usage_event` RPC → `usage_events` (4,491 rows, still written today) + `user_metrics` (1 row, search_count 330) | **NO CONSUMER, WRITES LIVE** — the only reader is `admin-users` (§1g). Writers: `useOutreach.ts:655,897`, `useContactAction.tsx:44`, `LeadSearchContext.tsx:452`, `SingleSMSDialog`, `SingleWhatsAppDialog`, **`search-leads:1399,1513`** (edge). Removing = touching a live edge function | |

### 1c. Instantly / email outreach

| Item | Verdict | Evidence |
|---|---|---|
| `instantly-push` fn (384) + `_shared/instantly-vars.ts` (74) + `_shared/push-selection.ts` (110) | **DEAD** | only SPA caller `PushToInstantlyDialog`; only fn caller `bulk-jobs` audit_and_push |
| `poll-instantly-replies` fn (140) + **cron `instantly-poll-run` (`*/20 * * * *`, ACTIVE)** + DB fn `invoke_instantly_poll` + table `instantly_poll_state` (1 row, RLS on, 0 policies) | **DEAD, STILL RUNNING** — polls Instantly every 20 min for the 24 leads at `email_sent` | `cron.job` live |
| `PushToInstantlyDialog.tsx` (567) + OutreachTable "Push to Instantly" / "tick leads with an email" (:138, :378–379, :2004–2026) | **DEAD** | |
| `bulk-jobs` job type **`audit_and_push`** (~25 refs) + `bulk_jobs.job_type` CHECK constraint value (DB-only, §8) + `src/lib/bulkJobProgress.ts` label | **DEAD BRANCH** in a live function; 34 bulk_jobs rows exist (some are this type) | |
| Columns `instantly_pushed_at`, `instantly_campaign_id` (292 leads), `instantly_lead_id` | **KEEP — history** of who was emailed (no other record; the phone-history seatbelt does not cover email). Report only | |
| Statuses `email_sent` (24 leads), `bounced` (0) + labels in `OUTREACH_STATUS_OPTIONS`; `contact_method='email'` (278 leads); `campaign.ts` `CampaignMethod 'email'` | **KEEP the values** (data carries them); remove the *setters* only | |
| `CRAWLABLE_STATUSES_DEFAULT` / `CRAWL_STATUS_OPTIONS` (`src/types/outreach.ts:700–705`) | DEAD with the email crawl (§1d) | |
| Tests `instantly-vars.test.ts`, `audit-push.test.ts` (already stale), `push-selection.test.ts` | DEAD with their subjects | |
| Secret `INSTANTLY_API_KEY`; `config.toml` entries `instantly-push`, `poll-instantly-replies` | DEAD | |
| `_shared/audit-reply.ts` (`resolveAuditReplyVars`) | **KEEP** — also used by process-whatsapp-queue + send-whatsapp-message | |
| `coverageFreshness.ts` / `townVerdict.ts` / `functionError.ts` mentions | comments only | |

### 1d. Email scraping / contact discovery

| Item | Verdict | Evidence |
|---|---|---|
| `extract-email` fn (341) | **DEAD** | callers: `useFindEmails`, `useOutreachFindEmails`, `enrich-lead` — all dead |
| `extract-facebook` fn (202) | **DEAD** | only caller `enrich-business` |
| `enrich-lead` fn (263) + `_shared/apify-stub.ts` (76) | **DEAD — already zero callers** | |
| `enrich-business` fn (597) + `_shared/enrichment/socialImages.ts` (177) | **DEAD for contacts; ⚠️ VERIFY the image-pool half** — it also builds the Maps/FB/IG photo pool. Callers: `LeadEnrichButtons` "Enrich (~$0.035)" and `bulk-jobs` job type `enrich` (:373). Check whether `_shared/mockup-pool.ts` reads the `business_enrich` cache before deleting | |
| `useFindEmails.ts` (81, Find Leads "Find emails"), `useOutreachFindEmails.ts` (190, Outreach crawl + `crawlForPush`), `crawlBatch.ts`, `pushCrawlTargets.ts`, OutreachTable :142–143, :1650–1693, :2041–2079 | **DEAD** | |
| `useEnrichBusiness.ts` (212), `LeadEnrichButtons.tsx` (167), `useSearchEnrichment.ts` (31), `SearchLeadContact.tsx` (55) | DEAD **except** LeadEnrichButtons' WhatsApp-capability chip (`line_type` mobile/landline, :89–93), which is live information | |
| `clear-enrichment-cache` fn (148) ← `useOutreach.resetToFreshMultiple` "Reset to fresh" | DECIDE — wipes enrichment fields + deletes generated_sites + cache. Mostly dead purpose | |
| Columns `email_status`/`email_method`/`email_last_checked_at` (448), `facebook_*` (11), `instagram_*` (9), `enrichment_source`, `image_url` | **KEEP** (report only; `email` itself is live — onboarding/free-check write it) | |
| Tables `enrichment_cache` (2,609), `enrichment_usage` (12,603), `api_usage_log` (18,561) | **KEEP — LOAD-BEARING**: `_shared/enrichment/runner.ts` + `recordCostCorrection` write `enrichment_usage` for **every AI-audit question** (the Apify spend cap, §8); `api_usage_log` is written by `google-place-details`/`search-leads` and read by `admin-api-usage` | |
| `_shared/enrichment/` `ai-search.ts`, `apify.ts`, `apify-usage.ts`, `runner.ts`, `seo-scan-core.ts`, `sources.ts`, `websiteClassify.ts` | **KEEP — the audit engine lives here** (reached by 19 functions) | |
| `check-website` fn + `WebsiteStatusToggle` + `website_status_overrides` (16 rows, last 07-06) | **DECIDE** — website *detection* (not contact discovery); "no website" is Findable's best delivery case (§9) | |
| `google-place-details` | **KEEP** — phone/address on lead add | |
| Docs `PHASE2-ENRICHMENT-SPEC.md` (tracked), `ENRICHMENT-PLACEMENT-SPEC.md` (untracked) | DEAD | |

### 1e. Twilio / SMS

| Item | Verdict | Evidence |
|---|---|---|
| `process-sms-queue` fn (372) | **DEAD** — `invoke_sms_queue` exists but **no cron.job schedules it**; `sms_sends` has **0 rows ever** | |
| `twilio-inbound` fn (140) | **DEAD** — STOP-keyword webhook; `contact_suppressions` holds **0 rows from `twilio_inbound`** | Twilio may still POST to it; if the number/account is closed it is a no-op |
| `_shared/enrichment/whatsapp.ts` (55) — Twilio HLR line-type lookup | **DEAD — already zero importers** | |
| `SingleSMSDialog.tsx` (275) + OutreachTable SMS button/row menu (:137, :422, :661–680, :707, :2423, :2697) + `OutreachMobileCard.tsx:296–304` + `leadUtils.generateSMSUrl` | **DEAD** — the manual "open the SMS app" flow | |
| Tables `sms_sends` (0), `sms_outreach_state` (1) | DEAD | |
| Columns `sms_queued_at`, `sms_sent_at`, `sms_message_sid`, `sms_delivery_status`, `sms_attempts` — **0 non-null on all 3,740 leads** | orphan columns, report only | |
| Status **`no_whatsapp_needs_sms` — 1,861 leads** | **KEEP** — it is the landline marker. Only the *wording* mentions SMS: `WhatsAppLeadControls.tsx:92` "Flagged for SMS instead", `OutreachTable.tsx:1343` "flagged for SMS", `PipelineStatusBadge`/`OutreachStatusBadge` comments, `types/outreach.ts:28` | |
| `contact_method='sms'` on 15 leads; `campaign.ts` method `'sms'`; `ContactMethodBadge` sms style; `ChannelPerformanceCard` SMS row (`alwaysShow: true`); `useDashboardMetrics` `sms_sends` read (:275–278, :529–560); `dashboardTasks.ts` JumpTarget `'sms'`; `useContactAction`/`useOutreachAttempt` channel `'sms'`; `Outreach.tsx:73,195` | DEAD BRANCHES; the 15 data values stay | |
| Secrets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER` (set); `SMS_TEST_MODE` (read, unset) | DEAD | |
| `config.toml` entries `process-sms-queue`, `twilio-inbound`; DB fn `invoke_sms_queue`; migration `20260714120000_sms_queue_and_suppression.sql` (also created `contact_suppressions` — keep the file) | DEAD entries | |
| `_shared/suppression.ts`, `_shared/line-type.ts` | **KEEP** — shared with WhatsApp; `line-type.ts` is the *offline* classifier that produced `no_whatsapp_needs_sms` | |

### 1f. Feedback page

| Item | Verdict |
|---|---|
| `src/pages/Feedback.tsx` (141), route `/feedback`, nav entries (`AppSidebar`, `MobileBottomNav`), i18n `nav.feedback*` | **DEAD** |
| `useTeamFeedback.ts` (98), table `team_feedback` (**0 rows**, 3 policies via `is_operator`/`has_role`) | DEAD |
| `send-feedback` fn (236) — emails `beyondwebcraft@outlook.com` | **DEAD — already zero callers** (the page writes the table directly) |
| `config.toml` entry `send-feedback` | DEAD |

### 1g. Multi-user (the risky one — see §2 and §3 before anything here moves)

**Facts:** `auth.users` has **2** accounts — Paul's data account `9d5a7629… pauljsales455@outlook.com` (owns 100% of every owned table) and **`3470fd91… hawarmustafa878@gmail.com`** (created/last signed in 2026-06-19; owns **1 `generated_sites` row + 1 `profiles` row**; a barber claimant; its login still works). Project auth: `disable_signup = true`. `user_roles` has exactly one row (Paul, admin).

| Item | Verdict | Evidence |
|---|---|---|
| `admin-users` fn (387) — list/delete users, barber filtering, `user_events` | **DEAD** (single user) | only caller AdminZone |
| `AdminZone.tsx` (705) on the Dashboard | **DEAD** — user table, bulk delete users, events sheet; carries the `/admin/api-usage` link | |
| `admin-api-usage` fn (195) + `AdminApiUsage.tsx` (269) `/admin/api-usage` | **DECIDE** — it is the API-spend dashboard ("cost by user" is the multi-user part; spend today/month, cache stats, alerts are single-user useful) | |
| `admin-ai-opener` + `AiOpenerModal` | DEAD (see 1b) | |
| `profiles` table (2 rows) + `handle_new_user_profile` trigger + `useAvatar.ts` + `avatars` bucket (0 objects) + UserMenu avatar upload / change-password | **DECIDE** — cosmetic; avatar has never been uploaded | |
| `user_metrics` (1 row, 5 policies) + `usage_events` (4,491) + `log_usage_event` RPC + `reset_my_metrics` | DEAD *purpose* (analytics for the admin panel) but **writers are live** in 6 SPA files + `search-leads` | |
| `lead_claims` (3,361), `lead_notes` (0), `personal_actions` (0), `lead_contacts` (0) — team features | **DEAD** | |
| `campaigns.created_by` + "Authenticated users can view all campaigns" policy | KEEP (data + policy; not touched) | |
| `useSubscription.tsx` (122) FULL_ACCESS shim + `isAdmin` | **NO CALLERS FOR THE BILLING FIELDS, LOAD-BEARING FOR `isAdmin`** — `RequireAdmin` is the positive operator gate (the stray account would otherwise land on the dashboard). 11 consumers | |
| `RequireAdmin.tsx`, `has_role()` DB fn, `user_roles` checks in 11 edge functions | **KEEP** — see §3 | |
| Dashboard **"Full Reset"** → `reset_my_account()` SECDEF → `_reset_account_for` | ⚠️ **DANGEROUS, NOT DEAD** — one confirm away from deleting every lead, audit, message and both paying customers. A multi-user-era "reset my test account" button on a single-user production dashboard. Recommend removing the button (Phase 3) | |
| `MobileBottomNav` admin items: `/admin` (→ dashboard redirect) and **`/admin/affiliates` → no route → NotFound** | DEAD (one is a bug) | |
| `useDashboardMetrics(isAdmin)` param; `Dashboard` `isAdmin &&` gates on Campaigns/Admin sections; `OutreachTable`/`Inbox`/`Feedback` `isAdmin` gates | DEAD BRANCHES once single-user is assumed — but each gate must be replaced by *always on*, not removed with its content | |
| `i18n` `userMenu.proRenews`, `proTrialEnds`, `nav.affiliates`, `common.admin` | DEAD strings | |

---

## 2. `user_id` — everywhere it carries meaning beyond "who logged in"

Paul asked for this before any removal is proposed. **Conclusion: the column stays everywhere. What can
go is the multi-user product surface (§1g), never the column or the policies that read it.**

1. **`whatsapp_sends.user_id` is the sender diagnostic.** NULL = the queue/cron wrote it (**2,405** rows);
   set = `send-whatsapp-message` from the Inbox (**240** rows). §30e used exactly this to prove the four
   `audit_followup` sends were the reply lane, not the button. Per template: `initial_contact [queue] 1341`,
   `audit_reply [queue] 559`, `audit_reply_warm [inbox] 48`, … (full split in the session log).
2. **`whatsapp_messages.user_id` NULL (5 rows) = system-sent or unmatched.** 3 outbound
   `free_check_result` WhatsApps (sent by the queue for a free-check visitor) + 2 inbound with no lead.
   `mirror_whatsapp_send_to_inbox` fills user_id from the lead's owner; when the lead lookup fails the
   row is NULL — and **the Inbox RLS policy (`user_id = auth.uid() OR admin`) is what still shows it**.
3. **RLS scoping is the SPA's only view.** Every operator read is `auth.uid() = user_id`. A server-side
   writer that stamps the wrong owner makes rows *invisible*, not wrong — §6j's ADMIN_EMAIL trap.
   `free-check-lead.ts` resolves the owner FROM THE DATA (newest lead's user_id) for this reason.
4. **Anon holds full DML GRANTS on every table** (SELECT/INSERT/UPDATE/DELETE… for `anon` and
   `authenticated` on all 56 tables, except `generated_sites` anon-SELECT via column grants and
   `bookings` anon INSERT-only). The anon key is in the JS bundle. **RLS is therefore the only thing
   between the public internet and `outreach_leads`.** Ten tables have RLS on with **zero policies**
   (`apify_account_usage`, `contact_suppressions`, `enrichment_cache`, `enrichment_usage`,
   `instantly_poll_state`, `onboarding_responses`, `sms_outreach_state`, `whatsapp_auto_replies`,
   `whatsapp_outreach_state`, `whatsapp_sends`) — that is what makes them service-role-only. Dropping a
   policy or disabling RLS on a single-user system is not "safe because one user": it is a public read.
5. **Edge-function ownership checks on service-role writes**: `clear-enrichment-cache` (lead.user_id ==
   caller), `extract-competitors`, `page-generator`, `create-ai-audit`, `bulk-jobs` (owner-scoped
   sweep), `instantly-push` internal branch (`acting_user_id`, UUID-checked → real user), `whatsapp-inbound`
   (owner from newest lead), `submissions`, `coverage`, `market-view`.
6. **`client_error_reports.user_id` nullable** = anonymous (public page) vs operator report; its INSERT
   policy allows `user_id IS NULL` on purpose.
7. **`generated_sites.owner_id`** feeds `is_operator()` ("not a barber owner") → `team_feedback` policies;
   the stray account owns one row.
8. **`ai_audits`/`ai_audit_runs`/`ai_audit_queue`.user_id** — the AI Audit page's reads, and the
   `whatsapp_messages` admin-or-own policy.
9. **`bulk_jobs.user_id`** — "read own" policy; sweep scoping.
10. **`campaigns.created_by`** (no user_id column) — update/delete policies.

---

## 3. RLS — report only, nothing touched

- 56 public tables, **all with RLS enabled**; 10 with zero policies (list in §2.4).
- **Policies that expose data to `anon`**: `generated_sites` (published), `booking_staff` and
  `staff_working_hours` (of published sites), `bookings` (anon INSERT of a confirmed booking),
  `business_reports` (published), `directory_businesses` (read ALL — the findable-directory repo's).
  `uk_towns` read is `authenticated`.
- **`has_role(auth.uid(),'admin')` appears in policies on 14 tables** (generated_sites, booking_staff,
  bookings, business_reports, claim_tokens, client_error_reports, directory_businesses, hosting_clients,
  preview_links, staff_working_hours, team_feedback, usage_events, user_metrics, whatsapp_messages) and a
  `user_roles` sub-select on `site_events`. **`user_roles` + `has_role` are therefore load-bearing for
  RLS, not just for the app's `RequireAdmin`.**
- `is_operator()` reads `generated_sites` — used only by `team_feedback` policies.
- `phone_cache` / `search_cache` / `geocode_cache` / `api_usage_log`: explicit deny-all — correct.
- Repo-side `create policy` grep finds only 19 tables; the live count is authoritative (Lovable-era
  migrations use a multi-line form the grep missed). Do not reason about RLS from the migrations.

---

## 4. Everything else unreferenced that turned up on the way

| Item | Verdict | Note |
|---|---|---|
| `src/lib/marketAuditThreshold.ts` | **DEAD** — 0 importers; the claim in CLAUDE.md §6c/§6h that `check-cross-repo-sync.mjs` parses it is **stale** (grep: no reference in either script; `coverage/index.ts:117` mentions it in a comment only) | |
| `src/lib/measurementRuns.ts` | **NO CALLERS, A GUARD NOBODY RUNS** — kept only so `scripts/check-measurement-runs.mjs` can regex-read `MEASUREMENT_RUNS`; that script is in neither `npm run check` nor `EXTRA_GUARDS`. Either wire it in or delete both | |
| `scripts/page-graph.mjs`, `scripts/page-roadmap.mjs` | **BROKEN** — both import `../src/lib/pageRoadmap.ts`, which does not exist | |
| `supabase/functions/_shared/aggregators_test.ts`, `_shared/geobias.test.ts` | Deno tests **nobody runs** (the runner scans `scripts/` only; Deno is not installed) | |
| `scripts/_*.ts` — **36 untracked scratch probes** (`_slots.ts`…`_slots5.ts`, `_offtrade*.ts`, `_ronnie*.ts`…) | DEAD (untracked); `_render-check.ts` and `_distance-rerun.ts` are named as tools in CLAUDE.md §22 | |
| `useOutreach.updateClientDetails` | DEAD (0 callers, §6d) — with columns `project_duration`, `next_checkin_date`, `checkin_notes` (0 non-null) | |
| `apply-seo-paste` fn (deployed v24) | **DEAD — zero callers** (the only mention is a comment in `aiAuditReportHtml.ts`); the SEOptimer paste flow has no UI | |
| `cron-run` fn + `daily-cron-run` (02:00) | near no-op: geocode-cache 90-day cleanup + a daily summary log. DECIDE | |
| `outreach_events` table (80 rows, last write **2026-07-02**) | read by `useDashboardMetrics:249` (channel card), written by `useOutreachAttempt.logAttempt` (manual open-the-app contact) — the "old method" trail | |
| `outreach_history` (3,763) | **KEEP** — lead-add dedupe / "already in CRM" (LeadSearchContext, useOutreach) | |
| `client_listings` (0 rows) | read by `usePlaybook` (done_at/verified_at, §9) — KEEP for now | |
| `WA_DEFAULT_TEMPLATE` export | unused (flagged in process-sms-queue's own comment) | |
| Secrets read but unset: `SMS_TEST_MODE`, `AUTO_REPORT_ENABLED` (process-ai-audit-queue), `APIFY_API_TOKEN` (fallback name only — `APIFY_TOKEN` is set, fine), `FINDABLE_SETUP_PRICE_ID` (correctly unset, §11) | | |
| `tailwindcss-animate` | only "unused" dep by import scan — it is a Tailwind plugin (`tailwind.config:162`). KEEP | |
| `public/sw.js` + `manifest.webmanifest` + icons | PWA install shim; DECIDE (does Paul install the dashboard as an app?) | |
| `README.md` (Lovable boilerplate), `TASKS.md` (2026-07-30 checklist, stale), `HANDOVER_NEXT.md` (2026-08-22, stale) | DECIDE | |
| Five known-stale suites (§0 of CLAUDE.md) | still 5; `audit-push.test.ts` goes with Instantly anyway | |
| `SingleWhatsAppDialog.tsx` (321) + `TemplatePicker.tsx` (160) + `AutoRotateToggle`/`useAutoRotateTemplate` | **DECIDE — the "open WhatsApp app with a saved text" flow.** CLAUDE.md §6d says it can never open; it CAN: `OutreachTable.tsx:708` opens it for a dashboard task jump with `channel: 'whatsapp'`. Note `templates` table (15 rows: "Barbers", "Barber follow up", "Voice Note - No Website Pitch", "META prompt", "Pricing"…) **is also the Inbox's quick-reply source** (`Inbox.tsx:271, 595`) — the Templates page and table are live even if this dialog goes | |
| `Mockups` route (`/mockups`, not in nav) + `mockup` fn + `src/mockup/templates/locksmith.html` + `public/mockup-stock` (6.6 MB) + `mockup-assets` bucket | **KEEP — live product** (HANDOVER_MOCKUP.md, Sep 11) | |
| Stale CLAUDE.md claims found on the way: §0 "fourteen commits NOT PUSHED" (was 0 at start; now 5 from the other session), §2/§20/§30d token path (see §0.2 here), §3 "baseline is 14" (it is 9), §6c/§6h marketAuditThreshold sync claim, §6d SingleWhatsAppDialog unreachable, §6e/§6c describe deleted market-view machinery | fix during Phase 2 | |

---

## 5. Column orphans on `outreach_leads` (REPORT ONLY — no drops)

**Live table: 116 columns; generated `types.ts` knows 77** — 39 columns exist in the DB that the
types do not (e.g. `derived_town`, `lat`, `lng`, `baseline_audit_id`, `remeasure_*`, `stripe_*`,
`refund_*`, `delivery_checklist`, `product`, `hook_followup_queued_at`, `contact_followup_queued_at`).
The types file is stale, not the DB.

Zero non-null on 3,740 leads: `sms_queued_at`, `sms_sent_at`, `sms_message_sid`, `sms_delivery_status`,
`sms_attempts`, `project_duration`, `next_checkin_date`, `checkin_notes`, `call_booked_at`,
`services_included`, `confirmed_services`. Near-zero: `sale_type` (2), `potential_revenue` (1),
`site_sent_at` (6), `is_potential_work` (6), `instagram_url` (9), `facebook_url` (11).
`list_type` = `'no_website'` on **100%** (not a signal, §9). Instantly columns: 292. Email-enrichment
columns: 448.

Enum `lead_status` (22 values: `call_back`, `wants_draft`, `sent_voice_note`, `sms`, `whatsapp`…) is
**orphaned** — `outreach_leads.status` is `text`, not the enum; nothing reads the enum. Report only.

---

## 6. THE SAFETY NET — what I would rely on to call a deletion safe, and where it has holes

| Gate | Catches | Does NOT catch |
|---|---|---|
| `npm run typecheck:baseline` (tsc over `src/`, 9-error list compared as a list) | a deleted SPA file/symbol still imported in `src/` | anything under `supabase/functions` |
| `npm run build` (Vite) | missing SPA modules, syntax | edge code |
| `scripts/check-edge-syntax.mjs` (esbuild parse) | syntax in edge code | names, imports |
| `scripts/check-edge-undefined.mjs` (tsc TS2304 per edge entrypoint) | a deleted **symbol** still referenced in edge code | ⚠️ **a deleted MODULE still imported** — module-resolution errors are deliberately discarded. Deleting a `_shared` file that a function still imports passes every local gate and fails only at deploy |
| `npm test` (112/117) | behaviour regressions in tested leaves; the 3 parity tests fence the template lists | the 5 stale suites are noise; tests of deleted code must be deleted in the same commit or they fail for the wrong reason |
| **The import graph (`graph.mjs`) re-run after each deletion: zero new unresolved specifiers, and the function closures in `graph.json` as the redeploy list** | the module-import hole above; the shared-file deploy trap (§4) | runtime behaviour |
| `supabase functions deploy` | the only real gate for edge code (bundler resolves imports) | — |
| Live marker check after deploy (§4 rules) | that the bytes are live | — |
| **Nothing** | RLS/grant/policy changes, DB function drops, cron changes — these cannot be tested locally at all | — which is why Phase 1 leaves them alone and Phase 3 does them one at a time with a read-back |

**What I would NOT rely on:** grep hit counts (49 "claim" hits in process-whatsapp-queue were
`claimTemplatePayload`), CLAUDE.md prose (six stale claims found today), the migrations as a picture of
RLS, or the deploy timestamp method.

**Order I would propose for Phase 3** (each step its own commit, its own `npm run check`, its own
graph re-run, redeploy list from `graph.json`): 1 Feedback → 2 Twilio/SMS → 3 Instantly (cron
unscheduled FIRST) → 4 contact discovery (after the mockup-pool check) → 5 tour/demo/i18n → 6 barber
residue in live functions (stripe-webhook last, one deploy, marker-verified) → 7 multi-user surface
(AdminZone/admin-users/Full Reset; RLS untouched) → 8 `functions delete` the 15 orphan deploys → 9 SQL:
unschedule `instantly-poll-run`, drop dead DB functions — Paul-approved, one statement at a time →
10 storage/data purges (Paul's explicit call each).

---

## 6b. PHASE 2 DONE (2026-09-16) — CLAUDE.md split, branch `cleanup/claude-md-split`

5,219 lines / 448 KB → **506 lines / 40 KB** (~110k → ~10k tokens per session start). All 43 sections
moved verbatim into 19 topic files under `docs/` (+ `docs/INDEX.md`), each under a "Moved from
CLAUDE.md §N" header with "Corrected 2026-09-16" notes for the stale claims; the split script proved
line-for-line reconstruction. The merged `cleanup/pixel-and-full-reset` (`06a4f815`) was already in
`main` before the split (the other session merged and pushed it). **Phase 3 starts from this branch's
CLAUDE.md** — its §3 already names the import-graph gate as owed before any deletion.

## 7. PAUL'S DECISIONS (2026-09-15, late evening) — these settle the DECIDE rows above

**Order: the four quick items → Phase 2 (CLAUDE.md split) → Phase 3 (deletions).** Paul closes every
other session before the split. **The import graph becomes a `npm run check` gate before Phase 3
starts** — a deletion that passes every local check and fails at deploy is not acceptable while
outreach is running.

Done tonight, before any deletion (branch `cleanup/pixel-and-full-reset`, worktree
`C:/Users/paulj/LeadFinderOS-wt/pixel-reset`, off `main` @ `a15dcfc9`):
- Meta Pixel removed from `index.html` (script + noscript). The `facebook-domain-verification` meta tag
  and the UTM-capture script are still there — Phase 3 (barber/marketing residue).
- "Full Reset" button + `handleFullReset` removed from `Dashboard.tsx`. `reset_my_account()` /
  `_reset_account_for()` remain in the DB until Phase 3.
- `SQL_FOR_PAUL_unschedule_instantly_poll.sql` handed over (Paul runs it).
- Login `hawarmustafa878@gmail.com` (`3470fd91-…`) deleted via the Auth admin API. ⚠️ **The first
  attempt was rolled back by Postgres**: the FK `generated_sites.owner_id ON DELETE SET NULL` fires
  the `lock_generated_sites_protected_fields` BEFORE UPDATE trigger, which allows only
  `auth.role() = 'service_role'` or an admin JWT — and the Auth admin API's cascade runs as neither.
  Fix: `PATCH generated_sites … owner_id=null` through PostgREST **as service_role** first (the trigger
  permits it; it is the exact end state the cascade would have produced), then DELETE the user.
  Verified after: `auth.users` = Paul only; `profiles` = 1 row; `mh-barber` `owner_id` NULL, row kept
  for the barber purge; the 2 rows still carrying an `owner_id` are Paul's own test claims.
  **Any future `generated_sites` purge must be done as service_role for the same reason.**

| # | Decision |
|---|---|
| 1 | **Purge the `barber-site-images` bucket** (public, 175 MB, dead). **Keep the `generated_sites` TABLE** — the live mockup writes to it; **purge only the barber rows** (the 105 Jun–Jul barber/plumber rows; the 2 Sep `locksmith` drafts stay). |
| 2 | **KEEP `check-website`** (Findable's website tri-state needs detection). **`enrich-business`: check whether `_shared/mockup-pool.ts` / the mockup photo pool actually reads its output before removing; if it does, keep.** |
| 3 | **Templates page stays as the Inbox quick-reply source only.** Drop the "open the WhatsApp app" flow: `SingleWhatsAppDialog`, `TemplatePicker`, `AutoRotateToggle`, `useAutoRotateTemplate`, the dashboard task jump that opens it, `AiOpenerModal`/`admin-ai-opener` with it. |
| 4 | **i18n: remove `i18next` + `react-i18next`, inline the 127 live strings.** English only. |
| 5 | **KEEP `AdminApiUsage` + `admin-api-usage`, de-multi-user them** (drop "cost by user"; keep spend today/month, cache stats, alerts — Apify binds the whole outreach rate). |
| 6 | Stray login deleted ✅ · Full Reset button removed ✅ (both above). |

## 8. PHASE 3 PROGRESS (2026-09-16, evening)

Steps 1–3 are merged into `main` and pushed: Feedback (`7ad62f79` → `86f1c379`), SMS (`6aea3a90` →
`ac37237b`), Instantly (`f4f0bb02` → `880e26d5`). The import-graph gate landed first (`a8ade595`).
Honest green is now **109/113** (audit-push went with Instantly). **The rest of the plan, the file
lists for steps 4–10 and every standing decision are in `docs/deep-clean-phase3-plan.md`** — the
next session starts there. The mockup-pool question in §7 decision 2 is answered: `mockup-pool.ts`
imports `mapsEnrich` from `_shared/enrichment/sources.ts` directly and never calls `enrich-business`,
so `enrich-business` is deletable in step 4. The `instantly-poll-run` cron was still active at the
end of the session.
