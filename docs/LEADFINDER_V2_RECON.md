# LeadFinderOS V2: architectural reconnaissance

*Written 2026-10-07. Read-only investigation of `origin/main` at `8f300d4f`, plus read-only queries against the live Supabase
project `ruusxpkkmwtljxxulhbq` (schema, policies, grants, cron, buckets, deployed-function list, auth settings). Nothing in the
application, database, infrastructure or deployment was changed.*

**Evidence conventions.**
- **[V]** means checked: the file was read, a grep was run, or the live database was queried.
- **[I]** means inferred from comments, docs or naming, without tracing the behaviour end to end.
- Paths are relative to the repo root. `SF/` means `supabase/functions/`. "Live" means the production database or the
  production edge deployment, read on 2026-10-07.

**What this document is not.** It is not a V2 design. Section 9 gives a provisional view of the core/module split, and that
is the only part that looks forward.

---

## 1. Executive summary

LeadFinderOS is a **single-business sales and delivery system for Findable**. It is not a platform with Findable configured on
top. Findable assumptions sit at three depths:

- the **data model**: one "book" of leads, one owner, and global uniqueness rules;
- the **integrations**: one key or account per provider;
- the **business rules**: price, guarantee, agreement, commission and lead stages, written as code constants, SQL CHECK
  constraints and triggers.

There is **no organisation, tenant or workspace concept anywhere** [V]. No table has such a column. The only "team" is the
one team that works the one book.

The codebase is **better engineered than its speed of growth suggests**:

- `src/lib` is a large (~74k lines), mostly **pure, well-tested domain kernel**: 353 test files, with only about 30 lib
  files that no test touches.
- The edge functions import that kernel directly, so most rules exist once.
- The database uses append-only ledgers, immutable pointers set by triggers, and one server-side spend guard. These are good
  patterns.

The debt is concentrated in four places:

1. **Monolith screens and hooks**: `AiAudit.tsx` (3.9k lines), `OutreachTable.tsx` (3.7k), `Inbox.tsx` (2.7k),
   `useOutreach.ts` (1.9k).
2. **Hand-kept mirrors**: an 11-place WhatsApp template registry, TS↔SQL commission tiers, and SPA↔findable-site offer
   copies.
3. **Retired-product residue** still deployed: barber/salon, Instantly, SMS.
4. **State that exists only in the live database**: crons, four tables, at least one RPC, and grants. A rebuild from
   migrations would not reproduce production.

| | Count (2026-10-07) | Source |
|---|---|---|
| Application code | ~140k lines `src` + ~53k lines `supabase/functions` | [V] line count |
| SQL migrations | 311 files, ~19k lines; history desynced, applied by hand | [V] |
| Tests | 353 `scripts/*.test.ts` + 38 SQL tests (SQL tests not run by `npm test`) | [V] |
| Commits | 7,076 since 2025-01-01 | [V] |
| Live tables (public) | 129, all RLS-enabled; 202 policies | [V] live |
| Live SQL functions | 437 (191 `SECURITY DEFINER`); 75 triggers | [V] live |
| Edge functions | 71 in source, **93 deployed** (22 deployed with no source) | [V] live |
| Cron jobs | 14, defined only in `cron.job` | [V] live |
| Storage buckets | 6 | [V] live |
| Auth users | 3 (1 admin, 2 sales); public sign-up **disabled** | [V] live |
| Leads / audits / messages | 5,598 / 1,619 / 5,909, **all `user_id` = one data account** | [V] live |

**The verdict in one line:** keep the domain kernel, the measurement engine, the crawl/site-audit engine, the protection
guard and the ledger patterns. Rebuild the tenancy, identity, credential and configuration layers from scratch. Turn
Findable's offer, agreement, guarantee, commission and copy into a tenant module. Do not port the monolith screens as they
are.

---

## 2. Current architecture

### 2.1 Topology

```
Operator SPA (React 19 + Vite 5 + Tailwind/shadcn, React Query)        app.leadfinderos.com
  Cloudflare Pages project `leadfinderos-next` (auto-deploys main)      (+ leadfinderos-next.pages.dev fallback;
  Pages Functions: functions/a/[slug].ts (301 → findable.live/report)    leadfinderos.pages.dev = STALE legacy project)
                   functions/r/[slug].ts (410 Gone)
        │ supabase-js, anon key + user JWT, region-pinned fetch (src/lib/edgeRegion.ts)
        ▼
Supabase project ruusxpkkmwtljxxulhbq
  Postgres (129 tables, RLS, 437 functions, 75 triggers) · Auth (email/password, invite-only)
  Storage (6 buckets) · Realtime (3 tables) · pg_cron (14 jobs) + pg_net + Vault (cron secrets)
  Edge functions (Deno, 71 in source, deployed BY HAND; every one uses the service role)
        │
        ├─ Apify (AI answers for ChatGPT/Gemini, SEO scan, Maps, social scrapes)
        ├─ Google Places / Geocoding / Search Console     ├─ OpenAI (gpt-4o, gpt-4o-mini)
        ├─ Meta WhatsApp Cloud API (one number/WABA)      ├─ Stripe (one account)
        ├─ Resend (email from findable.live)              ├─ Cloudflare Browser Rendering
        └─ Companies House                                └─ prospects' own websites (crawler)

findable.live (separate repo `findable-site`, Astro, Cloudflare Pages, manual deploy, no CI)
  onboarding/checkout start, agreement page, report/welcome-pack/results proxies, first-party analytics
  → calls edge fns: findable-onboarding, findable-checkout (via client-agreement), client-agreement, client-onboarding,
    render-audit-report, render-welcome-pack, render-remeasure-results, site-analytics
Client websites: separate Astro repos (GitHub Beyondweb2), Cloudflare Pages on a third account
findable-directory: separate SSR repo reading the same Supabase (2 deployed fns belong to it)
```

### 2.2 Frontend [V]

- **Entry point.** `src/main.tsx` sets up a PWA service worker (pass-through) and a production check that shows a reload bar
  when a newer bundle is deployed.
- **Provider stack.** `src/App.tsx` (294 lines) wraps the app in ErrorBoundary → React Query → `AuthProvider` →
  `SubscriptionProvider` (despite the name, this is now only the role provider) → accent theme → `LeadSearchProvider` →
  router.
- **Pages.** 21 of 24 pages are lazy-loaded.
- **Shell.** A single shell layout route: `ProtectedRoute` → `RequireAccess` → `AppLayout`.
- **Roles.** Only `admin` and `sales` (`src/lib/roleRules.ts`). The SPA reads the role through RPC `my_role`
  (`src/hooks/useSubscription.tsx`).
- **Permission matrix.** `src/lib/access.ts` holds `canOpenRoute`, `homeFor` and `leadPermissions`, which is about 20
  flags. The code says itself that this is **presentation only**: the real boundary is RLS plus the edge handlers.
- **Data access** happens in three ways:
  1. direct `supabase.from()` in hooks (`useOutreach.ts`, `useInbox.ts`, …);
  2. RPC wrappers (`src/lib/leadRpc.ts`). This is how salespeople write, through `lead_set_*`, `campaign_*` and
     `sales_*`;
  3. edge folds, via `invokeEdge` (`src/lib/edgeInvoke.ts`) or raw `functions.invoke`. The two styles are inconsistent:
     the raw calls skip the refresh-on-401 and the error mapping.
- **Cross-screen sync.** `src/lib/leadSync.ts` uses a window event plus a BroadcastChannel.
- **Realtime.** `useInbox.ts:417–470` subscribes to `whatsapp_messages`, `outreach_leads`, `lead_crawl_checks` and audit
  tables. `useNotifications.ts` subscribes to `notifications`.
- **State.** `usePersistedState` keeps UI configuration per user in local/session storage. `user_preferences` holds the
  server-side preferences.
- **i18n.** `src/i18n` is English only. About 22 strings go through `t()`; the rest are hard-coded English.
- **Branding is inconsistent.** The UI and `index.html` say "LeadFinder Pro", while `RequireAccess` says "LeadFinderOS". The
  favicon is Findable's.

### 2.3 Backend [V]

- **Every edge function creates a service-role client** (except the 410 stub `generate-report`). So **RLS never protects an
  edge function's reads or writes**. Every function scopes its data in handler code.
- **Shared auth helpers** live in `SF/_shared/access.ts`:
  - `resolveActor` (JWT, then role from `user_roles`);
  - `requireAdmin`;
  - `leadAccess` and `mayWriteLeadId` (an admin owns everything in the book; a salesperson only leads with
    `assigned_to_user_id` = self that are not clients);
  - `bookOwnerId` (`team_members.is_book_owner`);
  - `isInternalCall`, a constant-time comparison of `CRON_SECRET`.
- **These helpers are not used everywhere.** About 10 handlers re-implement the token or role check, and about 6 compare
  `CRON_SECRET` with a plain `===`.
- **Internal calls** use `x-cron-secret` + `x-internal-job`. Several functions also still accept a service-role bearer
  token as proof of an internal call. Internal keys reach the functions through `public.edge_internal_keys()`, a DB-only
  function that reads Vault. Live, its execute grant belongs to `service_role` only [V].
- **Spend and abuse guard.** `SF/_shared/protection.ts` calls SQL `guard_action`. That guard checks suspension, the global
  pause mode, burst limits, and per-person and team spend caps, with thresholds held in the singleton `protection_settings`
  row.
- **Code sharing.** About **190 `src/lib` modules are imported by edge functions** through relative
  `../../../src/lib/x.ts` imports. The kernel is one codebase compiled twice, by Vite and by Deno. Two lib files import
  edge code in the reverse direction: `src/lib/auditReport.ts` imports `_shared/market-match.ts` and `_shared/derivable.ts`,
  and `src/lib/townVerdict.ts` imports `_shared/place-details.ts`.

### 2.4 Scheduled jobs, queues, workers (live `cron.job`) [V]

| Job | Schedule | Calls |
|---|---|---|
| ai-audit-queue-run | 30 s | `process-ai-audit-queue` (Apify start/poll, folds, SEO scans, baselines, remeasures, result emails, automated audit replies) |
| whatsapp-queue-run | 1 min | `process-whatsapp-queue` (drip sends) |
| whatsapp-auto-replies-run | 1 min | auto-reply lane |
| bulk-jobs-sweep | 1 min | `bulk-jobs` |
| crawl-worker-run | 1 min | `crawl-worker` (exhaustive crawl frontier) |
| client-intake-run | 1 min | `client-intake` (paid-client auto-intake; also fired immediately by a trigger) |
| notify-onboarding-submit-run | 1 min | `notify-onboarding-submit` |
| conversation-triage-run | 2 min | `conversation-triage` (OpenAI filing of inbound) |
| security-sweep-run | 5 min | `security-admin` sweep |
| notify-follow-ups-due | hourly | SQL only |
| weekly-visibility-run | hourly :15 | `weekly-visibility` (weekly client checks) |
| daily-cron-run | 02:00 | `cron-run` housekeeping |
| performance-sync-run | 05:00 | `performance-sync` (Google Search Console) |
| business-summary-weekly | Mon 06:30 | `business-summary` (AI briefing) |

- **Queues are tables**, each claimed by a cron tick or by row status: `ai_audit_queue`, `whatsapp_sends`/`outreach_leads.status
  = 'queued'`, `bulk_jobs`, `crawl_jobs`/`crawl_urls`, `client_intake`, `sales_check_batches`/`_items`.
- **There is no external queue or worker host.** Everything runs as edge functions under pg_cron.
- **Several schedules were changed by hand** and differ from the migration that created them. For example,
  `whatsapp-queue-run` is `*/10` in its migration and 1 minute live.

### 2.5 Storage, realtime, auth [V]

- **Buckets:**
  - `whatsapp-media`: private, 20 MB. Readable by its own folder owner, by an admin, or by the assigned salesperson through
    `my_sales_media_paths()`.
  - `mockup-assets`: private, admin-only.
  - `prospect-previews`: private, service-only.
  - `avatars` and `lead-images`: public buckets, with writes limited to the owner's folder. `lead-images` holds 2 objects.
  - `barber-site-images`: **public read**, 670 objects, from the retired product.
- **Realtime publication:** `outreach_leads`, `whatsapp_messages`, `notifications`. Events are filtered by RLS.
- **Auth:**
  - email/password only (Google and phone disabled);
  - `disable_signup = true`, so accounts are created by invite through `admin-users` / `SetPassword`;
  - site URL `https://app.leadfinderos.com`;
  - JWT lifetime 1 h;
  - TOTP MFA enrolment enabled;
  - no custom SMTP host.

### 2.6 Webhooks (inbound) [V]

| Endpoint | Verification | Note |
|---|---|---|
| `stripe-webhook` | `constructEventAsync` with `STRIPE_WEBHOOK_SECRET`, or a QA simulation behind `CRON_SECRET` | still contains a barber `generated_sites`/`is_paid` branch |
| `whatsapp-status` (Meta) | Source: HMAC `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`, **fail-closed** (`src/lib/metaWebhookGate.ts`). **Live: v114, the older version that does not verify; the newer code is deliberately not deployed** until a Findable Meta app and secret exist (CLAUDE.md §8). | one callback URL for one number; never reads `phone_number_id` |
| `resend-webhook` | Svix signature, fails closed | matches on free-check result message id |
| `site-enquiry` | none (public form); origin + IP-hash rate limit | client websites' contact forms |

### 2.7 Deployment [V]

- **SPA:** a push to `main` auto-deploys to Cloudflare Pages `leadfinderos-next`. The Cloudflare account that owns it is not
  visible to this machine's wrangler login (handover doc 09).
- **Edge functions:** deployed by hand with `npx supabase functions deploy <name>`. A changed shared module means
  redeploying its whole import closure (`node scripts/check-import-graph.mjs --reached-by`).
- **SQL:** applied one statement at a time through the Management API, never `db push`.
- **findable-site:** a manual `wrangler pages deploy`, on a different Cloudflare account ("Paul@move37.fun's Account").
- **The gate is `npm run check`:**
  - typecheck against a 9-error baseline;
  - edge syntax, undefined-name and import-graph checks;
  - build;
  - 353 test suites.
- **Not covered by the gate:** Deno is not installed, so the deploy is the only type check edge functions get. The SQL tests
  are not run by `npm test`.

### 2.8 Logging, monitoring, analytics, caching [V]

- **Errors:** `client_error_reports` is written by the SPA and by some edge paths. Supabase function logs are kept for under
  a minute.
- **Security and abuse:**
  - `security_events` and `record_denial`, which emails Paul after 10 refusals in 10 minutes;
  - `security_sweep` every 5 minutes;
  - `log_data_access`, which audits number copies and exports.
- **Usage and cost:** `api_usage_log` (27k rows), `enrichment_usage` (16.7k), `ai_audit_runs.actor_cost_usd`, and
  `apify_account_usage` (a 15-minute snapshot of the Apify account limits). These are surfaced by `admin-api-usage` and
  `admin-overview`.
- **Analytics:**
  - Product analytics: `usage_events`, `feature_events`.
  - findable.live first-party analytics: `site_analytics_events`.
  - **No third-party telemetry** in the SPA (no Sentry, PostHog or GTM). `index.html` still has a Facebook
    domain-verification meta tag and a UTM-capture script from the marketing era.
- **Caches** are DB tables, and **all are global** (shared across users):
  - `search_cache`: 72 h
  - `geocode_cache`: 90 d
  - `phone_cache` (Place Details): 30 d
  - `enrichment_cache`: 30 d
  - `website_agency_checks`: 30 d
  - `companies_house_checks`
  - prospect crawl reuse: 7 d
  - SEO scan reuse: 24 h
- **Client-side caching:** React Query `staleTime` of 5 minutes.

### 2.9 Secrets and configuration [V]

- **Secret storage:**
  - Supabase edge secrets, read through `Deno.env.get`;
  - Vault, which holds the cron invokers' keys and `CRON_SECRET`;
  - the Cloudflare Pages build environment for `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **No secrets are committed.** The cost investigation swept for key shapes and found only a fixture test key.
- **Configuration is almost entirely source constants.** `src/config/` has two files: `findableSite.ts` and `operatorApp.ts`.
  Prices, terms, caps, windows, templates and copy are TypeScript constants. Some are mirrored in SQL. The only runtime
  configuration row is `protection_settings`, a singleton.
- **The env var inventory is in §6.2.**

---

## 3. Feature inventory

**Status key:**
- **Active**: used in production and edited recently.
- **Partial**: works, but is incomplete or has known gaps.
- **Legacy**: superseded but still reachable.
- **Abandoned**: unreachable, or retired with code left behind.

| # | Feature | What it does | Where | Key dependencies | Status | Coupling |
|---|---|---|---|---|---|---|
| F1 | **Lead sourcing (Find Leads)** | Google Places text search by trade + town, tiling/radius, region mode, website verdict, agency detection, Companies House age, add to CRM with campaign | `src/pages/Index.tsx`, `src/contexts/LeadSearchContext.tsx` (791), `LeadsTable.tsx`; fns `search-leads`, `check-website`, `agency-check`, `companies-house-check` | Google Places/Geocode, Apify (opt-in), `search_cache`, `search_history` (found/added keys), `guard_action` | Active | trades list fixed to UK trades (`src/lib/trades.ts`); place-id is globally unique across the whole DB |
| F2 | **CRM / Outreach** | One lead table for both roles: pipeline status, derived sales state, owner/assignment, archive, CSV import, bulk actions, lead popup (Call · Details · Close · History) | `Outreach.tsx`, `OutreachTable.tsx` (3,670), `LeadDetailDialog.tsx`, `LeadCrmPanel.tsx`, `useOutreach.ts` (1,931); libs `leadState.ts`, `salesCrm.ts`, `access.ts`, `leadRpc.ts`, `salesPatchPlan.ts` | `outreach_leads` (admin) / `sales_leads` view (sales), `lead_activity`, ~40 `lead_*` SECURITY DEFINER RPCs, triggers | Active, the heart of the product | `outreach_leads` is also the client, payment, delivery and baseline-pointer table (see §5) |
| F3 | **Lead state & Next Action** | Sales state derived (New → Contacted → Replied → Interested → Meeting → Won → Client / Not interested / Wrong number); one human-set Next Action with time; follow-up reminders; lost reason | `src/lib/leadState.ts` (`salesStateOf`, `outcomePlan`), `nextActionView.ts`, `nextActionWrite.ts`, `lostReason.ts`; SQL `lead_set_follow_up`, `notify_due_follow_ups`, CHECK `outreach_leads_booking_is_the_meeting` | `outreach_leads` columns | Active, clean | status vocabulary is a closed TS union + text column with no CHECK |
| F4 | **Campaigns** | Owned, private, globally-unique-named containers; launch = queue the approved opener for the owner's leads | `Campaigns.tsx`, `campaigns/*`, `useMyCampaigns`; SQL `campaign_*` (migrations `20261006120000`, `20261008100000`) | `campaigns`, `sales_queue_opener` | Active | campaign names unique across the whole DB; `useCampaigns.ts:18` still offers a `'site'` (barber) kind |
| F5 | **WhatsApp outbound queue** | Drip opener queue: London send window, 400/day global cap, pacing, UK-mobile-only cold gate, contact/suppression checks, template variable safety, first-reply automation | `SF/process-whatsapp-queue` (2,221), `SF/_shared/whatsapp-send.ts` (1,119), `WhatsAppQueuePanel`; libs `templateVars.ts`, `templateRouting.ts`, `coldOutreach.ts`, `ukColdDestination.ts`, `sendWindow.ts`, `waNumber.ts` | Meta Graph API (one number), `whatsapp_sends`, `whatsapp_outreach_state` (singleton), `contact_suppressions` | Active | one number / one cap / one state row; templates registered under one WABA |
| F6 | **WhatsApp Inbox** | Threads, template + free-text sends (24 h window), voice notes (WebM→Ogg remux), media attachments, inbound media storage, unread counts, conversation state, triage | `Inbox.tsx` (2,710), `useInbox.ts` (892); fns `send-whatsapp-message`, `-voice`, `-media`, `whatsapp-status`, `conversation-triage`; `SF/_shared/whatsapp-inbound.ts`; lib `oggOpus.ts` | Meta, `whatsapp_messages`, bucket `whatsapp-media`, realtime | Active (most-edited page) | inbound owner resolution assumes one book; live webhook unsigned (§7) |
| F7 | **AI drafting helpers** | Warm-lead reply drafter (site research + draft, never sends), voice-note script, reply triage, client-fact extraction | fns `warm-lead-reply`, `voice-note-script`, `conversation-triage`; `SF/_shared/site-research.ts`; libs `warmLeadResearch.ts`, `warmReply.ts`, `replyTriage.ts` | OpenAI | Active | prompts and house style are Findable's (`salesStyle.ts`) |
| F8 | **Templates** | Meta template catalogue (11 hand-kept places), DB custom text templates, rep template requests | `src/types/outreach.ts`, `whatsappTemplates.ts`, `templateBodies.ts`, `Templates.tsx`, fn `template-request`; table `templates`, `template_requests`, `whatsapp_template_status` | Meta template status API | Active; registry is the biggest mirror debt | template names = Findable's Meta registrations |
| F9 | **AI visibility audit engine** | Hook audit (3 q × ChatGPT+Gemini), free check, Discovery, Baseline (20 q × 3 runs, frozen), full measure, 4-week replay, weekly check; question generation (OpenAI), competitor extraction (OpenAI), named-signal judgement, SEO scan | fns `create-ai-audit` (2,294), `process-ai-audit-queue` (1,627), `extract-competitors`, `run-seo-scan`, `paid-baseline`, `weekly-visibility`, `niche-sample`; `SF/_shared/audit-baseline.ts` (1,402), `SF/_shared/enrichment/*`; ~60 libs (`namedSignal.ts`, `nameMatch.ts`, `measurementCompare.ts`, `baselineReplay.ts`, `seedGuard.ts`, `hookScore.ts`, `auditKind.ts`, `auditBudget.ts`) | **Apify `google-search-scraper` with ChatGPT/Gemini toggles** (not the OpenAI/Gemini APIs), OpenAI, `ai_audits`/`_runs`/`_queue`, pointer triggers on `outreach_leads` | Active, mature | methodology is Findable's product; the engine is generic |
| F10 | **Client report & documents** | Live HTML report at `findable.live/r/<code>`, welcome pack, four-week results, agreement page/PDF, request-a-call | `src/lib/aiAuditReportHtml.ts` (2,897), `auditReport.ts` (1,308), `welcomePackHtml.ts`, `remeasureResultsHtml.ts`, `agreementPageHtml.ts`; fns `render-audit-report`, `render-welcome-pack`, `render-remeasure-results`, `request-call` | public, UUID/short-code addressed | Active | Findable copy, CTA, guarantee, domain throughout |
| F11 | **Website crawl / site audit** | Crawlability as AI crawlers, thin/duplicate pages, robots, exhaustive crawl (500-page cap, 7-day reuse), grouped findings, agency detection | fns `crawl-check`, `crawl-worker`, `agency-check`; libs `crawlCheck.ts`, `crawlUrl.ts`, `fullCrawl.ts`, `siteAudit.ts`, `siteEvidence.ts`, `siteFindings.ts`, `agencyDetect.ts`; `SF/_shared/safe-fetch.ts`, `crawl-job.ts` | prospects' sites (honest UA naming findable.live), `lead_crawl_checks`, `crawl_jobs`/`crawl_urls` | Active, clean | crawler UA names findable.live |
| F12 | **Directory / citation presence** | Per-lead presence on directories the AI engines cite for that trade | `src/lib/directoryPresence.ts` (1,150), `presenceSources.ts`, `directoryFacts.ts` (64 hand-kept UK hosts); fn `directory-presence`; SQL `presence_trade_citation_hosts` | Apify Google organic, `lead_directory_presence` | Partial: fn has no SPA or cron caller found [V]; CLAUDE.md says the Paid Client panel waits on other work | UK directory list |
| F13 | **Social profiles / email find / enrichment** | Find socials (graded, one canonical pick by trigger), find email, paid enrich (admin only), Facebook/Instagram images | fns `social-profiles`, `extract-email`, `extract-facebook`, `enrich-business`, `clear-enrichment-cache`; `SF/_shared/social-find.ts`; lib `socialProfiles.ts` | Apify, prospects' sites, `lead_social_profiles`, `enrichment_cache` | Active (kept by Paul's decision 2026-09-30, overturning cleanup step 4); `enrich-lead` + `apify-stub.ts` are dead | `extract-email`/`-facebook` fetch caller-supplied URLs without `safe-fetch` |
| F14 | **Coverage / niche / market** | Trade × town coverage ladder (found vs added), niche verdict, niche sample (3 towns × 4 q × 3 runs) | `Coverage.tsx`, `NichePanel.tsx`; fns `coverage`, `market-view`, `niche-sample`; libs `coverageState.ts`, `nicheView.ts`, `nicheSample.ts`, `townVerdict.ts`; table `uk_towns` | Google Places, audit tables | Active | UK towns (ONS data), London clock |
| F15 | **Sales "Check before calling"** | Per-rep batch hook audits with allowance (50/day), reuse window, pool + guard | fn `sales-prospect-check`, `SF/_shared/sales-check.ts`, `src/lib/salesCheck.ts`; tables `sales_check_batches`/`_items` | create-ai-audit (internal), crawl-check | Active | allowance in `protection_settings` |
| F16 | **Cold-call playbook / Quick Close** | Call script, outcome logging, close on the call or send full setup, payment-link generation, handoff to Paul | `src/lib/coldCallPlaybook.ts` (839), `quickClose.ts` (957), `callScript.ts`; fn `quick-close`; `QuickCloseDialog`, `ClosePanel` | `findable-checkout` (via anon key), Stripe, Resend, WhatsApp | Active (HEAD merge) | Findable offer and wording throughout |
| F17 | **Sign-up, agreement, checkout** | Public onboarding questionnaire, e-signed agreement (v1/v3/v4 coexisting), agreement-before-payment gate, Stripe Checkout, delayed subscription with `trial_end` + `cancel_at` (no subscription schedules), legacy checkout cutover | fns `findable-onboarding` (1,458), `client-agreement`, `findable-checkout`, `stripe-webhook` (2,023), `legacy-checkout-cutover`; libs `findableOffer.ts`, `clientAgreement.ts` (790), `clientTimeline.ts`, `signupGate.ts`, `paymentState.ts`; `SF/_shared/delayed-subscription.ts`; findable-site `OnboardingFlow.tsx` | Stripe, Resend, `onboarding_responses`, `client_agreement_*`, `payment_ledger`, `client_payment_holds` | Active | **entirely Findable**: offer, routes, agreement text, VAT status |
| F18 | **Paid clients / delivery** | Paid Clients list, Client Hub (intake, onboarding links, missing info, discovery, official baseline, measurement health, opportunities, monthly update, timeline, termination), auto-intake on payment, welcome pack, Send to Paul | `PaidClients.tsx`, `ClientHub.tsx`, `client*` components; fns `paid-client-hub` (1,462), `client-intake`, `client-onboarding`, `paid-baseline`; libs `clientIntake.ts`, `clientMissingInfo.ts`, `deliveryStage.ts`, `handoffReadiness.ts` | ~22 tables, Resend, WhatsApp | Active | Findable service delivery |
| F19 | **Website Build** | Build command centre for a paid client: recon, mapping to a template, master build prompt, preview gate (pages.dev, noindex, seed scrub), launch; simple view + `?view=advanced` | `WebsiteBuild.tsx` (1,690), libs `websiteBuildState.ts` (1,021), `buildPack.ts` (1,065), `buildExecution.ts`, `templateMapping.ts`, `websiteTemplates.ts`; column `outreach_leads.website_build` | Claude (by hand, outside the app), Cloudflare Pages on another account | Active, but **one template** (MCLocksmiths-derived) | `websiteTemplates.ts:390–398` contains a real client's email, phone and postal address as example text |
| F20 | **Page generator / page plan / review replies** | Service+town pages and Q&A from baseline questions (gpt-4o), page-plan queue, review-reply drafts | fns `page-generator` (1,282), `review-reply`, `scan-site-details`; libs `pagePlan.ts`, `pagePlanQueue.ts`, `qaAnswerGuard.ts`; tables `client_pages`, `client_page_questions` | OpenAI | Active (moved into Paid Clients 2026-10-06) | Findable delivery |
| F21 | **Mockups / prospect preview** | Prospect homepage mock-up from their photos into a template; evidence card + screenshots | fns `mockup`, `prospect-preview`; libs `mockup*.ts`, `src/lib/prospectPreview/*`; `src/mockup/templates/locksmith.html`; table `generated_sites`, buckets `mockup-assets`, `prospect-previews` | Apify, OpenAI, Cloudflare Browser Rendering | Mockups: **partial / orphaned** (route has no inbound link [V]); prospect preview: active inside AI Audit | `generated_sites` is shared with the retired barber product |
| F22 | **Sales team & commission** | Team page (invite, roles, suspend, disable), salesperson onboarding records, team board (posts/tasks), Sales Dashboard, commission (monthly tiers 30/40/50 %, 20 % × next 6 recurring), payment ledger, engagement events, attribution review | `Team.tsx`, `SalesDashboard.tsx`, `team/*`; fns `admin-users`, `sales-performance`, `sales-earnings`; libs `commission.ts` (746), `salesPerformance.ts`, `saleAttribution.ts`; SQL `stamp_monthly_commission_for`, `monthly_tier_rate`; tables `payment_ledger`, `commission_payouts`, `team_members`, `team_engagement_events`, `sale_*` | Stripe (backfill) | Active | rates in TS and SQL; UK bank holidays as a literal list to 2027; GBP |
| F23 | **Admin control centre** | KPIs, what needs you, intelligence, lost reasons, client health, traffic, AI weekly briefing (numbers validated against facts), API cost by funding owner, security panel (pause modes, thresholds, suspend) | `Dashboard.tsx`, `components/admin/*`, `AdminApiUsage.tsx`, `SecurityPanel`; fns `admin-overview`, `business-summary`, `admin-api-usage`, `security-admin`; libs `adminMetrics.ts` (1,130), `apiCostAccounting.ts` | OpenAI | Active | `PROVIDER_MIGRATIONS` encodes Move37 vs Findable account history |
| F24 | **Notifications** | Per-user in-app notifications (21 kinds), hourly follow-up reminders, operator emails | table `notifications` (realtime), SQL `notify_person`, `lead_recipient`; `SF/_shared/operator-alert.ts` | Resend | Active | operator email hardcoded |
| F25 | **Search Console / own visibility** | Daily GSC snapshots per connected client and for findable.live itself | fn `performance-sync`, `SF/_shared/google-search-console.ts`; tables `client_search_connections`, `search_console_*`, `own_site_search_*` | Google service account | Partial (few or no connected clients [I]) | `sc-domain:findable.live` seeded |
| F26 | **Client-site enquiry forms** | Contact forms on client websites relayed by email | fn `site-enquiry`, `SF/_shared/site-enquiry.ts` (`CLIENT_SITES`) | Resend | Active (one client site) | recipient list hand-kept in code |
| F27 | **Feedback & What's New** | Team feedback inbox, changelog shown in-app | `FeedbackAndNews.tsx`, `AdminFeedback.tsx`, fn `feedback-submit`, `src/lib/whatsNew.ts` (1,197, changelog as code) | Resend | Active (rebuilt after cleanup step 1) | — |
| F28 | **Compliance groundwork** | TPS/CTPS check table, business-type evidence, salesperson compliance (right to work, VAT, Companies House no.) | `tpsCheck.ts`, `phone_tps_checks`, `lead_business_type_records`, `salesperson_onboarding*` | none (no TPS provider) | Partial / dormant (TPS postponed; onboarding checklist no longer blocks selling) | UK-specific |
| F29 | **Barber/salon site + booking product** | Generated barber sites, claim links, bookings, staff hours, subdomains | tables `generated_sites`, `bookings`, `booking_staff`, `staff_working_hours`, `claim_tokens`, `preview_links`, `hosting_clients`, bucket `barber-site-images`; residue in `stripe-webhook`, `whatsapp-send.ts`, queue (`CLAIM_ORIGIN = yoursites.uk`) | — | **Abandoned**, but data, a public bucket, public policies and ~20 deployed functions remain | — |
| F30 | **Instantly email, SMS/Twilio, self-serve SaaS billing, India market, weekly commission, LLM playbook, `/r/` profile pages** | Earlier product lines | migrations; tables `instantly_poll_state`, `sms_*`; `functions/r/[slug].ts` (410) | — | **Abandoned / retired**; tables and deployed functions linger | — |

**Not in the product (checked [V]):**
- no email outreach channel (Instantly is gone);
- no general task manager (only the Next Action plus team-board tasks);
- no file manager;
- no third-party CRM sync;
- no public API for customers;
- no org-level settings screen;
- no self-serve sign-up or billing for LeadFinderOS itself. That existed and was deleted in
  `20260612200000_leadfinderos_strip_billing_acquisition.sql`.

---

## 4. Findable coupling

### 4.1 How deep it goes

Case-insensitive counts over `src` + `supabase/functions` [V]:

| Term | Hits | Files |
|---|---|---|
| `findable` | 1,457 | 204 |
| `findable.live` | 228 | 75 |
| `£` | 382 | 90 |
| `GBP` | 535 | 79 |
| `guarantee` | 526 | 117 |
| `agreement` | 836 | 72 |
| `commission` | 393 | 47 |
| `Europe/London` | ~88 | 50 |
| `en-GB` | 181 | 112 |

Other counts:
- 68 files import `findableOffer`.
- About 316 user-visible strings name "Paul" ("Speak to Paul", "Paul takes it from here", "Owner: Paul").
- Most named-client mentions (RG, Ronnie, ABLM) are in comments that record incidents.

### 4.2 A: genuinely Findable-only (belongs in a Findable module, not core)

| Item | Evidence | Why it is Findable's |
|---|---|---|
| The offer: £99 setup, £99/month, Build 12 / Optimise 6 payments, £29.99 continuing | `src/lib/findableOffer.ts:36,53,64,93,95`; `SF/_shared/offer-price.ts`; SQL `20260929170000_service_route.sql`; Stripe price env vars `FINDABLE_*_PRICE_ID` | commercial product |
| The guarantee and its wording, "gone up" rule, 14-day claim window | `findableOffer.ts:286–295,546`; `clientTimeline.ts` (`guaranteeNumberWentUp`, `REFUND_WINDOW_DAYS`…); `numberWentUp` | Findable's promise |
| The client agreement v1/v3/v4 and commercial-terms stamps | `src/lib/clientAgreement.ts` (790; "Findable is not VAT registered", notice email); `clientTimeline.ts:34,38`; SQL CHECK `commercial_terms in ('csa_v3_option_b'…)` | legal text of one company |
| AI-visibility methodology as sold | measurement model (Hook / Discovery / Baseline 20×3 / replay at 4 weeks), `SCORED_ENGINES`, frozen sets | Findable's service design (the *engine* is generic, see B) |
| Report, welcome-pack, results and sales copy | `aiAuditReportHtml.ts`, `welcomePackHtml.ts`, `remeasureResults*`, `templateBodies.ts`, `callScript.ts`, `coldCallPlaybook.ts`, `salesStyle.ts` (`HOUSE_STYLE_EXAMPLE`), `newClientEmail.ts` | brand voice |
| Website Build route rules (domain authority, ownership/transfer terms) | `src/lib/domainAuthority.ts` (byte-identical in findable-site), `serveGate.ts`, `buildRoutes.ts` | Findable's delivery terms |
| Move37 cost history | `src/lib/apiCostAccounting.ts:20–96` (`PROVIDER_MIGRATIONS`, `COST_OWNERS`) | one business's account migration |
| Hidden-offer audit ids | `src/lib/buyOffer.ts:23–26` (ABLM, Paul's own business), imported by `render-audit-report` | hardcoded business data |
| Historical client exceptions | RG pinned 8-week remeasure, ended/refunded clients, `metric_exclusions` rows | data, not product |

### 4.3 B: generally useful, but implemented in a Findable-specific way

These are the capabilities that should survive into the core with configuration:

| Capability | How it is hardwired today | What would need to become config/data |
|---|---|---|
| **Pricing / packages** | constants in `findableOffer.ts`; `offerPrice()` takes no arguments (`SF/_shared/offer-price.ts`); `ServiceRoute = 'build' \| 'optimise'` closed union; GBP-only `amount_gbp` columns | a per-tenant packages/offer record (currency, amounts, term counts, Stripe price ids or Connect account) |
| **Commission engine** | `src/lib/commission.ts` (30/40/50 % tiers, 20 % × 6 recurring, `UK_BANK_HOLIDAYS` literal to 2027) **mirrored** in SQL `monthly_tier_rate()` + stamp trigger; pinned by `scripts/monthly-commission-tiers.test.ts` | a per-tenant commission plan (tiers, trailing count, period, timezone, holiday source), with ONE source of truth |
| **Pipeline stages / lead statuses** | `LeadStatus` closed union (`src/types/outreach.ts:11–54`) with funnel-specific values (`site_sent`, `already_visible`, `report_sent`…); `outreach_leads.status` text column with **no CHECK**; `lead_activity.kind`, `notifications.kind`, `quick_close_events.kind`, `lost_reason` as global CHECKs | core stages + tenant-defined stages/labels; activity kinds as extensible vocabulary |
| **WhatsApp templates** | names are Findable's Meta registrations, held in 11 places (`SF/_shared/whatsapp-send.ts:77`, a duplicate `TEMPLATES` map in `SF/process-whatsapp-queue/index.ts:247` despite importing the first, `src/types/outreach.ts:525/638`, `whatsappTemplates.ts:71`, `templateBodies.ts:406/485`, `Inbox.tsx:192`, …) | a per-tenant template table (name, language, variable order, body snapshot, WABA/number), read at runtime |
| **Operator identity / alert inbox** | `paul@findable.live` hardcoded in ~12 edge sites (`feedback-submit:14`, `stripe-webhook:130`, `request-call:17`, `_shared/operator-alert.ts:9`, `paid-client-hub:870`…); `alerts@`/`reports@findable.live` senders ×22; `QA_EMAIL_SINK` on move37.fun (`src/lib/qaSafety.ts:73`) | tenant settings: owner name, alert recipients, sender domain, QA sink |
| **Domains & public origins** | `FINDABLE_SITE_ORIGIN`, `REPORT_PUBLIC_ORIGIN` and ≥4 literal copies; `site-analytics` origin allowlist; crawler UA "+https://findable.live"; findable-checkout `BUILT_IN_ORIGINS` | tenant domain record (public site, report host, sender domain) |
| **"The book owner"** | `team_members.is_book_owner` with a **unique partial index allowing ONE row**; `book_owner_id()` in 14 migrations; `_shared/free-check-lead.ts:93–103` resolves the owner a second, different way (newest lead's `user_id`) | per-tenant owner / default assignee |
| **Spend & abuse limits** | singleton `protection_settings` (id = 1) with team caps and per-user overrides in jsonb | per-tenant limits + platform-level ceilings |
| **Locale** | `Europe/London` ~88×, `en-GB` 181×, `PAYMENT_START_HOUR_UK`, London send window 07:00–21:30, UK-mobile cold gate (`ukColdDestination.ts` + SQL `sales_queue_opener`), `uk_towns`, Companies House, TPS, UK trade credentials (`tradeCredentials.ts`) | tenant timezone/locale/country; pluggable company registry and do-not-call checks (AU groundwork exists: `leadCountry.ts`, `au-*` tests) |
| **Trades list** | fixed UK local-trade list (`src/lib/trades.ts`); prompts assume plumbers/locksmiths | per-tenant market vocabulary |
| **Public site ↔ app duplication** | 13 constants + the agreement text byte-locked between this repo and findable-site (`scripts/check-cross-repo-sync.mjs`, `scripts/check-agreement-parity.ts`) | public pages read offer/agreement from the API instead of holding copies |
| **Crawler identity** | UA `LeadFinderOS-SiteCheck/1.0 (+https://findable.live)` | platform identity, not a tenant's |

**How concentrated it is.** Findable's identity is concentrated in about 15 modules: findableOffer, offer-price,
clientAgreement, clientTimeline, commission, the report and copy renderers, salesStyle, the template registry,
`src/config/*`, and operator-alert. That is good news. The bad news is that the *identity values* (emails, origins, the
owner) are still scattered as literals across about 15 edge functions, and the *structural* assumptions (one owner, one
number, one Stripe account, singleton settings) are in the schema itself.

---

## 5. Data model

### 5.1 Main entities (live, grouped)

| Domain | Tables | Notes |
|---|---|---|
| **Users & roles** | `auth.users` (3), `user_roles` (role enum `admin`, `moderator`, `user`, `sales`; only admin/sales used), `profiles`, `team_members` (status, suspended, **is_book_owner**, daily_send_limit not enforced), `user_preferences`, `salesperson_onboarding*`, `team_engagement_events` (append-only) | role = global, not scoped to anything |
| **Leads (the book)** | `outreach_leads` (5,598 rows, ~150+ columns): identity, contact, place, status, star, next action, owner (`user_id` = book owner), `assigned_to_user_id`, `added_by_user_id`, `sold_by_user_id`, campaign, **plus** Stripe ids, amount paid, refund, contract term, delivery stage, website build JSON, baseline/remeasure pointers, handoff | **one table is lead + deal + client + delivery project**. Sales never reads it; reads `sales_leads` (security-barrier view without money columns) |
| **Lead satellites** | `lead_activity` (append-only event log), `lead_notes`, `lead_claims` (legacy), `lead_social_profiles`, `lead_crawl_checks`, `lead_directory_presence(_runs)`, `lead_page_hits`, `lead_business_type_records`, `outreach_activities`/`outreach_history`/`outreach_events` (legacy logs) | three generations of activity log coexist |
| **Messaging** | `whatsapp_messages` (inbox; user_id NULL = system/unmatched), `whatsapp_sends` (outbound ledger, daily cap source), `whatsapp_outreach_state` (**singleton**), `whatsapp_auto_replies`, `whatsapp_conversation_reads`, `whatsapp_template_status`, `conversation_triage`, `contact_suppressions` (**global** unique phone/email), `templates`, `template_requests`, `onboarding_link_events`, `report_link_events` | keyed by phone, not by a channel/number |
| **Campaigns** | `campaigns` (owner = `created_by`, globally unique name key) | |
| **Audits & measurement** | `ai_audits` (1,619), `ai_audit_runs`, `ai_audit_queue` (8.9k, 80 MB, the biggest table), `weekly_check_sets/runs`, `niche_samples`, `client_opportunities`, `business_reports` (legacy slugs, anon-readable when published) | pointers `baseline_audit_id`/`remeasure_audit_id` on `outreach_leads` claimed by triggers, immutable |
| **Crawl & site** | `crawl_jobs`, `crawl_urls`, `website_agency_checks` (global, PK domain), `companies_house_checks` (global, PK place_id), `prospect_previews` | |
| **Websites** | `generated_sites` (barber-era + mockups; `owner_id` = a barber end customer), `client_pages`, `client_page_questions`, `site_enquiries`, `directory_businesses` (anon-readable; findable-directory repo) | Website Build state is a JSON column on `outreach_leads` |
| **Clients, agreements, money** | `onboarding_responses` (questionnaire + plan_tier), `client_agreement_versions/links/acceptances/emails` (immutable), `client_service_terms`, `client_service_events` (append-only), `client_payment_holds`, `client_intake`, `client_handoff_sends`, `client_info_requests`, `client_monthly_updates`, `client_onboarding_links`, `client_search_connections`, `payment_ledger` (7 rows; commission stamped by trigger), `commission_payouts`, `quick_close_events` (immutable), `sale_creations`, `sale_attribution_reviews(_events)` | strong append-only/immutability design |
| **Team** | `team_posts`, `team_post_recipients`, `team_post_events`, `notifications`, `feedback_items`, `team_feedback` (superseded) | |
| **Settings & protection** | `protection_settings` (**singleton**), `security_events`, `metric_exclusions`, `admin_job_runs`, `admin_summaries` | |
| **Usage & cost** | `api_usage_log` (27k; `api_type='guard'` rows are estimates, never charges), `enrichment_usage` (budget pools), `apify_account_usage`, `usage_events`, `user_metrics`, `feature_events`, `site_analytics_events` | |
| **Caches & reference** | `search_cache`, `geocode_cache`, `phone_cache`, `enrichment_cache`, `uk_towns` (733), `search_history`, `checked_businesses`, `copied_phones`, `website_status_overrides` | caches are global, deny-all to clients |
| **Retired** | `bookings`, `booking_staff`, `staff_working_hours`, `claim_tokens`, `preview_links`, `hosting_clients`, `sms_sends`, `sms_outreach_state`, `instantly_poll_state`, `call_requests`, `personal_actions`, `_legacy_interested_backup_20261001`, `_one_next_action_backup_20261002` | candidates to leave behind |

There is no separate deal, client, project, conversation, channel or organisation entity. A "conversation" is the set of
`whatsapp_messages` rows that share a phone number. A "client" is an `outreach_leads` row with `amount_paid > 0` (see
`isPaidLead`).

### 5.2 How the database assumes one business

1. **Ownership means "the book".**
   - Every lead, audit and message carries the same `user_id` (live: 100% under `9d5a7629…`) [V].
   - Who works a lead is `assigned_to_user_id`.
   - `book_owner_id()` and the single-row `is_book_owner` index make "the owner" a schema-level singleton.
2. **Admin is global.**
   - `my_role() = 'admin'` passes `admin_only_outreach_leads` (FOR ALL) and `can_work_lead` for every row in the database.
   - Nothing scopes an admin to a subset of data.
3. **Global uniqueness and dedupe:**
   - `guard_lead_identity` refuses a `place_id` that exists on any lead anywhere, using an advisory lock.
   - Campaign names are unique across the whole database.
   - `contact_suppressions` is global.
   - `ai_audits.short_code`, `generated_sites.share_token`/`subdomain` and `business_reports.slug` share one namespace.
4. **Singletons:** `protection_settings`, `whatsapp_outreach_state`, `sms_outreach_state` and `instantly_poll_state` (each
   `id = 1`). `own_site_search_property` is seeded only with `'findable'`.
5. **Business rules live in SQL:**
   - the £99 / 12 / 6 route lock trigger;
   - the commission tier function and stamp trigger;
   - the `csa_v3_option_b` CHECK;
   - GBP columns;
   - UK VAT and Companies House number regexes on salesperson onboarding;
   - the UK-mobile regex in `sales_queue_opener`.
6. **Team-wide reads assume one team.** `profiles`, `lead_notes`, `lead_claims` and `uk_towns` are readable by any
   authenticated user (`USING (true)`). `team_directory()` returns everyone.
7. **Cron invokers are global.** Each one calls one function for the whole database, with one `CRON_SECRET` and one service
   key from Vault. Nothing iterates over tenants.

### 5.3 What makes proper multi-tenancy hard

- **No tenant key exists, so one has to be added to almost all 129 tables.** It would also have to be added to:
  - every RLS policy (202);
  - every SECURITY DEFINER function (191);
  - every trigger that resolves "the owner" or checks global uniqueness;
  - every edge function, because they all use the service role and so RLS will not help them;
  - every cron fan-out.
- **`outreach_leads` is overloaded.** Splitting lead, deal, client and project apart is effectively a precondition for
  making modules optional. It is also the riskiest table to touch.
- **State that exists only in the live database:**
  - the 14 cron schedules;
  - `edge_internal_keys()`;
  - `client_agreement_acceptances`, `client_listings`, `lead_crawl_checks` and `lead_page_hits`, which have no CREATE TABLE in
    the repo [V];
  - the `bulk_jobs.job_type` CHECK;
  - hand-edited grants.

  The migrations are not a faithful description of production. The schema has to be extracted from the live database, not
  from the repo.
- **The generated client types lag the database.** `src/integrations/supabase/types.ts` is reportedly 39 columns behind, and
  the code casts `supabase as any` in many places, so the compiler gives no help.

---

## 6. External services and cost exposure

### 6.1 Service map

None of these was printed with a secret value. "Ownership" below comes from `docs/api-cost-ownership.md` and
`docs/handover/09`.

| Service | Purpose | Where used | Auth / credential (env name) | Owner / payer | Cost-incurring actions | Usage tracking | Attributable per user/org today? | Customer-supplied credentials feasible? | Risks |
|---|---|---|---|---|---|---|---|---|---|
| **Apify** | AI answers (ChatGPT + Gemini via `apify~google-search-scraper`), SEO scan (`smart-digital~complete-seo-audit-tool`), Maps (`compass~crawler-google-places`), contact/social scrapers, directory presence | `SF/_shared/enrichment/*`, `process-ai-audit-queue`, `run-seo-scan`, `check-website`, `enrich-business`, `directory-presence`, `mockup` | Bearer `APIFY_TOKEN` (alias `APIFY_API_TOKEN`; token in URL query in `apify-stub.ts`) | Paul's account since 2026-09-17 (Move37 before) | ≈ $0.0104–0.014 per question per run; SEO scan ≈ $0.04; hook audit ≈ $0.033; directory query $0.05; retries ×3 | `enrichment_usage`, `api_usage_log`, `ai_audit_runs.actor_cost_usd` (measured), `apify_account_usage` (account snapshot) | by `user_id`, but **queue work is billed to the book owner**; rep cost is an estimate guard row only | **No**: single global token; `refreshApifyUsage` assumes one account | **Single point of failure**: monthly account cap (US$40 live per handover) stops every audit and SEO scan for everyone at 100 %; prospecting stops at 85 % |
| **Google Maps Platform** (Places v1 Text Search / Details, Geocoding) | Lead discovery, phone/website/address, town derivation, name→place | `search-leads`, `niche-sample`, `google-place-details`, `backfill-lead-towns`, `_shared/place-*.ts`, `free-check-lead.ts` | `GOOGLE_MAPS_API_KEY` (header; query string for Geocode) | Paul's billing account since 2026-09-18 (free trial) | Text Search Enterprise $0.035/page, Details $0.020, Geocode $0.005 | `api_usage_log` with `cache_hit` | yes, `user_id` on search/details rows | No | free allowance and `DAILY_BUDGET_USD = 10` region budget are **global**; shared `search_cache` means one tenant's results serve another |
| **OpenAI** | question generation, competitor extraction, page generator, review replies, SEO paste, site details, warm replies, voice scripts, triage, business summary | ~12 functions + `_shared/site-research.ts`, `openai-usage.ts` | `OPENAI_API_KEY` | Paul since 2026-09-21 | gpt-4o $2.50/$10 per M tokens; gpt-4o-mini $0.15/$0.60; `extract-competitors` lets the caller choose the model | `api_usage_log` via `logOpenAiUsage` | partial (`user_id` often null for queue/internal) | No | `page-generator` and `mockup` sit outside the emergency stop; a past retry storm cost $41.75/day |
| **Meta WhatsApp Cloud API** (Graph v21.0) | all WhatsApp sends, media upload/download, template status, webhook | `_shared/whatsapp-send.ts`, `process-whatsapp-queue`, `send-whatsapp-*`, `whatsapp-status`, `_shared/template-status.ts`, `template-request` | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TEST_MODE`, `WHATSAPP_TEST_NUMBER` | **Move37's Meta app is live**; Findable app pending | per conversation / template (Meta pricing) | `whatsapp_sends` rows only; **no cost modelled** | sender recorded (`sent_by_user_id`) | No: one number, one WABA, inbound never routed by `phone_number_id` | one quality rating and tier for everyone; 400/day global cap; live webhook unsigned (§7) |
| **Stripe** | checkout, delayed subscription (`trial_end` + `cancel_at`), webhook, refunds/disputes, earnings backfill, legacy cutover | `findable-checkout`, `stripe-webhook`, `quick-close`, `sales-earnings`, `legacy-checkout-cutover`, `_shared/delayed-subscription.ts` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FINDABLE_SETUP_PRICE_ID`, `FINDABLE_NEW_SITE_PRICE_ID`, `FINDABLE_HOSTING_PRICE_ID`, `FINDABLE_STANDARD_MONTHLY_PRICE_ID` | Findable's account (Claude has no access) | fees (revenue side) | `payment_ledger` | per seller | No (would need Stripe Connect or per-tenant keys) | prices and products are Findable's; one webhook secret |
| **Resend** | operator alerts, agreements, terms notices, free-check and results emails, enquiries | `_shared/operator-alert.ts`, `client-agreement.ts`, `client-terms.ts`, `free-check-result.ts`, `remeasure-results.ts`, 8 functions; `resend-webhook` | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Findable (sending domain findable.live) | plan-based | none | no | No (one domain) | all operator mail to one hardcoded inbox |
| **Cloudflare Browser Rendering** | prospect-preview and mockup screenshots | `_shared/prospect-preview-shot.ts`, `_shared/mockup-shot.ts` | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_BROWSER_TOKEN` | which CF account is not established [I] | browser time | **none** | no | No | untracked spend |
| **Companies House** | business age for no-website results | `_shared/companies-house.ts`, `companies-house-check` | `COMPANIES_HOUSE_API_KEY` (Basic) | Paul | free; 600 req / 5 min per key | none | no | No | shared rate limit |
| **Google Search Console** | client + own-site performance | `_shared/google-search-console.ts`, `performance-sync` | `GOOGLE_SERVICE_ACCOUNT_JSON` | Paul | free | none | n/a | technically yes (each client grants the one service account) | one service account identity |
| **Supabase** | DB, auth, storage, realtime, edge, cron, Vault; Management API used by scripts and sessions | everywhere | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `CRON_SECRET`; SPA `VITE_SUPABASE_*` | Findable/Paul (operator login on move37.fun) | plan + compute (Micro instance) + egress | none | n/a | n/a | the legacy `service_role` JWT is still accepted by queue functions as proof of cron |
| **Cloudflare Pages** | SPA, findable.live, client sites | — | build env / wrangler logins | **three accounts**: `leadfinderos-next` (owner not confirmed), "Paul@move37.fun's Account" (findable.live), `beyondwebcraft` (client sites) | plan | none | n/a | n/a | account sprawl; findable.live email routing forwards to move37.fun |
| **Prospects' websites** | crawl, agency check, email/social find | `crawl-check`, `agency-check`, `extract-email`, `extract-facebook`, `social-find.ts`, `directory-presence` | none | — | $0 (logged as `website_scrape`) | `api_usage_log` | yes | n/a | SSRF surface where `safe-fetch` is not used (`extract-email`, `extract-facebook`) |

**Not used** [V]:
- Anthropic and Gemini are never called directly. Gemini answers come through Apify.
- Twilio and Instantly are retired.
- None of these appear: Sentry, PostHog, SendGrid, DataForSEO, SerpAPI, Firecrawl, Hunter or ElevenLabs.

### 6.2 Env var inventory, by service (names only)

| Service | Names |
|---|---|
| Supabase / internal | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `CRON_SECRET`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_BUILD` |
| Apify | `APIFY_TOKEN`, `APIFY_API_TOKEN`, `APIFY_MODE`, `APIFY_MAX_PLACES`, `DISCOVERY_SOURCE` |
| Google | `GOOGLE_MAPS_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON` |
| OpenAI | `OPENAI_API_KEY` |
| Meta | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TEST_MODE`, `WHATSAPP_TEST_NUMBER` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FINDABLE_SETUP_PRICE_ID`, `FINDABLE_NEW_SITE_PRICE_ID`, `FINDABLE_HOSTING_PRICE_ID`, `FINDABLE_STANDARD_MONTHLY_PRICE_ID` |
| Resend | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` |
| Cloudflare | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_BROWSER_TOKEN` |
| Companies House | `COMPANIES_HOUSE_API_KEY` |
| App config | `TEAM_APP_URL`, `FINDABLE_SITE_ORIGIN`, `FINDABLE_ALLOWED_ORIGINS`, `AUTO_AUDIT_REPLY_ENABLED` |

### 6.3 Spend controls that already exist [V]

- **`guard_action`.** Limits live in the `protection_settings` row, seeded from `src/lib/protectionLimits.ts`:
  - per-person: $6/h warn and $15/h hard; $15/day warn and $35/day hard;
  - team: $12/h warn, $50/day warn and a $100/day cap (Sales only);
  - burst limits per action;
  - modes `running` / `prospecting_paused` / `all_stop`.
- **Audit budget pools.** Per user over a rolling 24 h: guarantee $10, client $8, prospecting $12. Apify reserve
  percentages are 100, 95 and 85. There is also a $1 cap per run (`src/lib/auditBudget.ts`,
  `SF/process-ai-audit-queue/index.ts:82`).
- **Per-source caps:**
  - enrichment $2/day per user;
  - Place Details for towns $6;
  - place search $2;
  - region search $10/day (global);
  - triage $0.50/day;
  - weekly check $0.25 per client and $2 in total;
  - free check 10 leads and 10 audits per day (global).
- **Sales check allowance:** 50 per rep per day.
- **WhatsApp:** `DAILY_CAP = 400` per number; `team_members.daily_send_limit` exists but is not enforced.
- **Provider-side backstops are manual:** the Apify monthly cap, Google quotas and budget alerts, and the OpenAI monthly
  limit.

### 6.4 What happens when several external businesses use it

Every provider is one shared account behind one global credential. Concretely:

1. **One business can stop every business.** Apify is the hardest dependency. One tenant's bulk audits fill the monthly
   cap. At 85% everyone's prospecting stops. At 100% every client's guarantee measurement stops too, and Apify starts
   answering HTTP 402.
2. **Caps and pools are keyed by `user_id`, and queue work runs as the book owner.** Every business's hook audits would
   compete for one $12 prospecting pool. The team caps in `protection_settings` are global, so there is no per-business
   limit.
3. **Cost cannot be split by business.**
   - There is no org column on any usage row.
   - Meta, Cloudflare, Resend and Companies House costs are not logged at all.
   - Rep-level Apify and OpenAI spend is an estimate only.
   - The admin month total in `admin-api-usage` truncates at 1,000 rows.
4. **WhatsApp is one identity.** All tenants would message from Findable's number, under Findable's templates, sharing one
   quality rating and messaging tier and one 400/day cap.
5. **Shared caches.** `search_cache`, `phone_cache`, `enrichment_cache`, `website_agency_checks` and
   `companies_house_checks` would be shared. That saves money, but it is a data-isolation decision: it reveals what another
   tenant searched for or recently enriched.
6. **Bring-your-own keys need a credential resolver.** Every caller reads `Deno.env.get` directly, so each would have to be
   refactored to resolve credentials per tenant. Account-level reads would need the same change: the Apify limits snapshot,
   the Google free-allowance maths and the Stripe price ids.

**Unit economics (from code constants and the docs, not from billed rows):**
- a hook audit costs about $0.03;
- a 20-question × 3-run baseline costs about $0.6–0.9 in Apify;
- a cold opener carries roughly one hook audit;
- 400 sends a day is about $13/day in Apify (the comment in `process-whatsapp-queue`).

The scaling axis is **audits**, not seats.

---

## 7. Security and multi-tenant concerns

The findings are ordered by how much they matter for multi-business use.

### 7.1 Structural (these block multi-tenancy outright)

| # | Finding | Evidence |
|---|---|---|
| S1 | **RLS is the only barrier, and every edge function bypasses it.** `anon` has INSERT/SELECT/UPDATE/DELETE grants on 79 public tables and `authenticated` on 102 (TRUNCATE/TRIGGER/REFERENCES revoked); the anon key is in the bundle. All edge functions use the service role, so isolation inside them depends entirely on hand-written handler checks (§2.3), implemented inconsistently | live grants query [V]; `SF/*/index.ts` |
| S2 | **Admin is a global superuser** (`my_role()='admin'` passes every restrictive policy; `can_work_lead` true for all rows); `leadAccess` also assumes the admin *is* the book owner (`lead.user_id === actor.id`, `SF/_shared/access.ts:144`), so a second admin cannot work the book | `20260927100100_multi_user_sales.sql`; access.ts |
| S3 | **Policies are permissive and additive.** Old owner policies (`auth.uid() = user_id`, roles `{public}`) still exist on `outreach_leads`, `ai_audits`, `templates`, etc., combined with newer RESTRICTIVE admin-only write policies. The effective rule is correct today only because the restrictive policies exist; adding a tenant dimension means re-reasoning every table's policy set | live `pg_policies` (202 policies) [V] |
| S4 | **`USING (true)` team-wide reads** on `profiles`, `lead_notes`, `lead_claims`, `uk_towns`; `team_directory()` returns everyone. Fine for one team; a cross-tenant leak in a shared database | live policies [V] |
| S5 | **One credential per provider**, shared across all users (§6). There is no per-tenant secret store | §6 |
| S6 | **`CRON_SECRET` is a master key.** Internal doors trust `body.user_id` (`SF/create-ai-audit/index.ts:398–401`), `body.acting_user_id` (`SF/enrich-business/index.ts:203–204`), and skip ownership (`SF/extract-competitors/index.ts:304–338`). Several functions also accept the service-role JWT as a bearer (`process-whatsapp-queue:482–484`, `process-ai-audit-queue:139–140`, `cron-run`). In a multi-tenant system this one secret would act as any user of any tenant | — |

### 7.2 Concrete gaps worth fixing regardless of V2 (reported, not changed)

| # | Finding | Evidence |
|---|---|---|
| G1 | **Live `whatsapp-status` (v114) does not verify Meta's signature**; the fail-closed version exists in source but is deliberately held until a Findable Meta app/secret exists. Anyone who knows the URL can post fake inbound messages/statuses | CLAUDE.md §8; `SF/whatsapp-status/index.ts:53` comment; live version list [V] |
| G2 | **22 deployed edge functions with no source**, several with `verify_jwt=false`: `create-booking`, `get-availability`, `send-reminders`, `claim-site`, `begin-claim`, `claim-info`, `claim-share`, `create-claim-link`, `record-site-event`, `connect-subdomain`, `reset-test-barber`, `generate-barber-site`, `scan-services`, `send-feedback`, `instantly-push`, `poll-instantly-replies`, `process-sms-queue`, `twilio-inbound`, `generate-playbook`, `rehost-image` (+ `scrape-directory`, `enrich-directory-business` = findable-directory). They run unreviewable code with the service role | live function list diffed against `supabase/functions` [V] |
| G3 | Paid-API functions with **no team-role check** (any valid JWT, incl. a disabled account whose role row was removed, until its token expires): `backfill-lead-towns` (Google, no `guardAction`), `apply-seo-paste` (gpt-4o, no caller found), `extract-competitors` user path (client-chosen model), `run-seo-scan` (Apify), `clear-enrichment-cache` (deletes cache by client-supplied prefixes) | each `index.ts` [V for run-seo-scan; others per agent report] |
| G4 | **Public barber endpoints and data**: anon INSERT on `bookings`, anon SELECT on `booking_staff`/`staff_working_hours`/published `generated_sites` (column grants), public bucket `barber-site-images` (670 objects) | live policies/buckets [V] |
| G5 | **Real client personal data in source**: an email, phone and postal address used as example text | `src/lib/websiteTemplates.ts:231–232, 390–398` [V] |
| G6 | `extract-email` / `extract-facebook` fetch caller-supplied URLs without `_shared/safe-fetch.ts` (SSRF surface) | per agent report [I: not exploited] |
| G7 | Public, bearer-UUID capabilities: `render-audit-report` (any audit UUID), `findable-onboarding` `prefill` (lead UUID), `findable-checkout` (lead/onboarding UUID). Acceptable by design for one business; a tenant-scoped design needs signed or tenant-qualified tokens | handlers [V] |
| G8 | `admin-users` `delete_user` refuses only self and team members, so it could delete another admin outside `team_members` | `SF/admin-users/index.ts:319–349` |
| G9 | Keys in URL query strings (Apify stub, Geocoding) can leak into logs | `SF/_shared/apify-stub.ts`, `search-leads` |
| G10 | Per-isolate in-memory rate limiters (`SF/_shared/rate-limiter.ts`) do not hold across isolates; the real limits are `guard_action` | — |
| G11 | `Access-Control-Allow-Origin: *` on every function (no shared CORS module) | each function |
| G12 | Realtime topic policy still targets the dropped `subscriptions` table; `outreach_leads` is in the realtime publication although Sales never reads it (filtered by RLS, so admin-only in practice) | migrations; live publication [V] |

### 7.3 What is already good and should be kept

- Roles come only from `user_roles`. No signed-in role can write that table. Nothing takes a role from the request body or
  from `user_metadata`.
- Salespeople write only through role-checked SECURITY DEFINER functions, which log to `lead_activity`. Sales reads go
  through a security-barrier view that hides the money columns.
- Public sign-up is disabled, accounts are invite-only, and TOTP enrolment is on.
- Stripe and Resend webhooks verify signatures and fail closed. The newer Meta gate also fails closed (once deployed).
- Append-only and immutable ledgers: agreements, service events, quick-close events, payment and commission stamps,
  engagement events, sale creation and attribution reviews.
- The audit trail covers number copies and exports, and denials alert the operator.
- `edge_internal_keys()` is executable by `service_role` only [V].

---

## 8. Technical debt

### 8.1 Highest-impact debt

| Debt | Evidence | Why it matters for V2 |
|---|---|---|
| **Monolith screens/hooks** | `AiAudit.tsx` 3,933, `OutreachTable.tsx` 3,670, `Inbox.tsx` 2,710, `useOutreach.ts` 1,931 (≈41 callbacks), `useInbox.ts` 892 | most change goes here; queries + derivation + writes + UI in one file; do not port as-is |
| **Overloaded `outreach_leads`** | lead + deal + client + payment + delivery + build JSON + measurement pointers in one row, with ~25 triggers | blocks optional modules and tenant scoping |
| **Hand-kept mirrors** | 11-place template registry (+ a fully duplicated `TEMPLATES` map in the queue); `MONTHLY_TIERS` ↔ `monthly_tier_rate()`; SPA caps mirrored from edge (`OutreachTable.tsx:166,170`); `aggregators.ts` port; SQL `phone_key()` ↔ `inboundMatch.phoneKeyLikeDb`; 13 constants + agreement text mirrored into findable-site | each mirror needs a parity test; 192 "mirror" mentions [V] |
| **Duplicated helpers that disagree** | four phone keys (`metricExclusions.ts:27` last-10-digits vs DB `phone_key()`), three London-day helpers, five trade singularisers, conflicting engine labels ("Google AI" vs "Gemini"), ~13 host/domain helpers, ~7 HTML escapers, three metrics folds each claiming to be the only definition (`adminMetrics.ts`, `salesPerformance.ts`, dead `useDashboardMetrics.ts`) | silent inconsistency between screens |
| **Live-DB-only state** | 14 crons, `edge_internal_keys()`, four tables with no CREATE in repo, hand-run `SQL_FOR_PAUL_*` files, desynced migration history; migrations numbered ahead of today (`20261014…`–`20261016…`) because parallel sessions pre-assign numbers | production cannot be rebuilt from git |
| **Retired products still deployed** | barber branch in `stripe-webhook` (`notifyOfPayment` → `paul@yoursites.uk`, bookmybarber links, `:46–61, 517–561`); barber templates in `whatsapp-send.ts:78–84`; `CLAIM_ORIGIN = "https://yoursites.uk"` in the queue (`:235`) and `send-whatsapp-message` (`:62`); 22 orphan deployed functions; barber tables and public bucket; Instantly/SMS tables | security surface and confusion |
| **Bidirectional src/lib ↔ edge coupling** | ~190 lib modules compiled into Deno; lib → `_shared` imports in `auditReport.ts`, `townVerdict.ts`; ~24 lib files use `@/` and are SPA-only | the kernel is shareable but not yet a package |
| **Comment-as-spec style** | nearly every file opens with long ⛔/🔴 decision essays; only 2 real TODOs exist | invaluable as history; a large share of line counts; several are stale (below) |

### 8.2 Dead or legacy code (verified to have no importers unless noted)

- **Frontend, nothing imports it** [V]:
  - `src/components/RequireAdmin.tsx`;
  - `src/hooks/useDashboardMetrics.ts`. Its `FOUNDER_PRICE_GBP` is still read *as text* by the cross-repo sync check, so
    the file is dead at runtime but not deletable without changing that check;
  - `components/dashboard/AuditFunnelCard.tsx`, which depends only on the dead hook;
  - `lib/marketAuditThreshold.ts`, `measurementRuns.ts`, `saleType.ts`, `seoFindingText.ts`;
  - the unused shadcn `alert.tsx`.
- **Unreachable UI** [V]:
  - the `onGenerateSite` barber/salon menu in `OutreachMobileCard.tsx:346–390` (no caller passes the prop);
  - the `start-walkthrough` listener in `OutreachTable.tsx:590–597` (nothing dispatches the event);
  - the `'site'` campaign kind (`useCampaigns.ts:18`);
  - `public/og-default-barber.jpg` and `og-default-salon.jpg`;
  - the UTM capture and Facebook verification meta in `index.html`.
- **Routes with no way in.** `/baseline-setup/:leadId` and `/mockups` have no in-app link. Twelve routes exist only as
  redirects.
- **Edge functions:**
  - `enrich-lead` (stubbed Apify, no caller) together with `_shared/apify-stub.ts`;
  - `generate-report` (a 410 stub);
  - `apply-seo-paste` (no caller found);
  - `directory-presence` (no SPA or cron caller found);
  - `legacy-checkout-cutover` (one-off; run by hand).
- **Versions that coexist:**
  - agreement v1/v3/v4 and commercial terms v3/v4. These are needed, because signed clients keep their version;
  - commission rules `flat_30_v0`, `weekly_tier_v1` and `monthly_tier_v1/v3`;
  - legacy 42-day monthly timing;
  - `STALE_OFFER_TEMPLATES`;
  - Website Build simple vs `?view=advanced`;
  - hook-audit shapes that are "SUPERSEDED FOR NEW AUDITS".
- **Three activity logs coexist.** `outreach_activities` and `outreach_history` are legacy; `lead_activity` is current.
  There are also the backup tables `_legacy_interested_backup_20261001` and `_one_next_action_backup_20261002`.
- **Abandoned designs visible in migrations:**
  - self-serve SaaS: subscriptions, trials, affiliates, funnel, the "10-outreach challenge" (created and dropped);
  - the barber booking engine, created twice;
  - Phase A/B/C team claims;
  - the India market (added and removed within weeks);
  - orphaned SQL functions `validate_affiliate_code`, `challenge_10_record_contact`, `log_walkthrough_event`.
- **Deep clean Phase 3 status:**
  - steps 1–3 are done;
  - step 4 is **overturned** for socials and email (that code is live by decision, not left over);
  - step 5 (tour/i18n/WhatsApp-app dialog) and step 6 (barber branches in live functions) are **not done**;
  - step 7 is overturned;
  - steps 8–10 (orphan functions, SQL, storage) are not done.

### 8.3 Stale documentation and comments that now mislead [V]

- `findableOffer.ts` header cites `scripts/check-guarantee-sync.mjs`, which no longer exists, and says the price is
  "guarded by nothing". It is locked now.
- `aiAuditReportHtml.ts:435` has a TODO naming `findable.uk` and a constant that has been removed.
- `src/config/findableSite.ts` refers to `publicSite.ts`, which no longer exists.
- `useDashboardMetrics.ts:75` refers to a constant that has been removed.
- The `SF/crawl-check` header says admin-only, but the code allows sales.
- CLAUDE.md §8 lists "`classifySource` grades every `.org` as authority" and "3-run measurement repeats only 20
  questions". The code now appears to fix both (`src/lib/sourceType.ts` allowlist; `_shared/audit-baseline.ts:427–436`).
- Root `PHASE2-ENRICHMENT-SPEC.md` and `SALON-DASHBOARD-SPEC.md` describe products that have been removed. `TASKS.md` is
  from July.

### 8.4 Quality signals

- **Typecheck.** 9 errors are accepted as a fixed list. One is real: `OutreachStatusBadge` is missing six statuses, and a
  runtime fallback covers it.
- **Tests:**
  - 353 test files and no test framework;
  - about 224 read source text with `readFileSync`, and about 28 are pure source-grep;
  - only 4 use a fake Supabase, so almost **nothing tests database or edge behaviour end to end**;
  - the 38 SQL tests and `scripts/sender-domain.test.mjs` are never run by `npm test`.
- **No Deno type check before deploy.**

---

## 9. Reuse assessment

| System / feature | Classification | Why |
|---|---|---|
| Pure domain kernel in `src/lib` (as a whole) | **REUSE WITH REFACTOR** | pure, tested, already shared by SPA+edge; needs packaging (no `@/`, no lib→`_shared` imports), de-duplication (§8.1) and Findable copy separated from logic |
| Phone / number rules (`waNumber.ts`, `lineType.ts`, SQL `phone_key()` + parity test, `inboundMatch.chooseInboundLead`) | **REUSE** | correct, refuse-rather-than-guess, tested; settle on ONE phone key |
| Name rules (`displayName.ts`, `nameMatch.ts`) | **REUSE** | measured on real names, dependency-free |
| Template variable safety (`templateVars.ts`, `templateRouting.ts`) | **REUSE** | block-on-unsafe result type; routes by property not name |
| Lead state derivation (`leadState.ts`, `nextActionView.ts`, `strongStatuses.ts`) | **REUSE WITH REFACTOR** | excellent pattern (derived, never stored, no downgrades); stage vocabulary must become configurable |
| Lead/CRM data layer (`outreach_leads` + `lead_*` RPCs + `sales_leads` view) | **REIMPLEMENT** | behaviour is right; the overloaded table, global identity lock and book-owner assumptions cannot carry tenants |
| CRM UI (`OutreachTable`, `LeadDetailDialog`, `useOutreach`) | **REIMPLEMENT** | monoliths; keep the decisions recorded in their headers |
| Campaigns | **REUSE WITH REFACTOR** | small and clean; uniqueness must become per-tenant |
| WhatsApp send engine (`_shared/whatsapp-send.ts`, queue guards, send window, cold-destination gate, suppression, `classifyFailure`) | **OPTIONAL PRODUCT MODULE** (reuse with refactor) | mature, hard-won rules; needs per-tenant channel (number/WABA/token), template table, per-tenant cap |
| WhatsApp Inbox (UI + `useInbox`) | **REIMPLEMENT** (UI) / **REUSE** (inbound matcher, media storage, `oggOpus.ts` voice remux, 24 h window leaf) | the leaves are clean; the page is a monolith |
| Template registry (11 places) | **REIMPLEMENT** | replace with a data table + a Meta sync |
| AI drafting helpers (warm reply, voice script, triage) | **OPTIONAL PRODUCT MODULE** | generic value; prompts are Findable-flavoured |
| AI visibility engine (questions, runs, queue drain, named signal, noise band, replay, competitor cleaning, budget pools) | **OPTIONAL PRODUCT MODULE** (reuse with refactor) | the most valuable and most tested IP; generic for any AI-visibility offering; decouple from `outreach_leads` pointers and Findable purposes |
| Findable measurement model + guarantee (Hook/Discovery/Baseline/replay sold as a guarantee) | **FINDABLE MODULE** | the commercial wrapper around the engine |
| Client report / welcome pack / results renderers | **FINDABLE MODULE** (renderers), REUSE the data builders (`buildReportData`) | copy and CTA are Findable's; split data from template |
| Crawl / site audit engine (`crawlCheck`, `crawlUrl`, `fullCrawl`, `siteAudit`, `siteEvidence`, `safe-fetch`, `crawl-job`, `agencyDetect`) | **OPTIONAL PRODUCT MODULE** ("Website Intelligence") — **REUSE** | the most product-independent cluster; deterministic, tested |
| SEO scan (Apify actor + grading) | **OPTIONAL PRODUCT MODULE** | thin wrapper over a paid actor; consider folding into Website Intelligence |
| Directory / citation presence | **OPTIONAL PRODUCT MODULE** (reuse with refactor) | valuable for local-visibility; the directory list is UK-specific data |
| Lead sourcing (Places search, tiling, cache, coverage found/added) | **REUSE WITH REFACTOR** (core) | works; caches and budgets must become tenant-aware |
| Enrichment (socials, email find, paid enrich, Companies House, agency check) | **OPTIONAL PRODUCT MODULE** ("Research / Enrichment") | live by decision; Companies House is a UK plug-in |
| Coverage / niche / market view | **REUSE WITH REFACTOR** | generic territory planning; UK town table is data |
| Sales check before calling | **OPTIONAL PRODUCT MODULE** (part of Sales Team) | depends on the AI visibility engine |
| Cold-call playbook / Quick Close | **FINDABLE MODULE** (logic reusable as a generic "close flow" later) | wording, routes and checkout are Findable's |
| Sign-up / agreement / checkout / delayed subscription / payment holds | **FINDABLE MODULE** with REUSE of the patterns | e-sign-before-pay, immutable acceptances, webhook hold, `trial_end`+`cancel_at` subscription — reusable patterns, Findable content |
| Paid clients / client hub / intake / delivery stage | **FINDABLE MODULE** (a generic "client delivery" module is plausible later) | Findable's service delivery |
| Website Build | **FINDABLE MODULE** | one template, Claude-driven by hand, Findable's route rules |
| Page generator / page plan / review replies | **FINDABLE MODULE** (or optional "AI content" module) | OpenAI content tools tied to the baseline |
| Mockups / prospect preview | **OPTIONAL PRODUCT MODULE** (prospect preview); **REMOVE** the orphan Mockups route unless revived | preview is active; mockups are orphaned and sit on barber-era `generated_sites` |
| Sales team (roles, invites, suspend, team board, Sales dashboard) | **OPTIONAL PRODUCT MODULE** (reuse with refactor) | sound access model (role-checked functions, masked reads); needs tenant-scoped roles |
| Commission engine + payment ledger + stamping + engagement windows | **OPTIONAL PRODUCT MODULE** (reuse with refactor) | rigorous (stamped once, append-only, refunds reverse); collapse TS+SQL to one source; plan as data |
| Protection guard (`guard_action`, pause modes, burst limits, budget pools, denial alerts) | **REUSE WITH REFACTOR** (core) | essential for a multi-tenant cost model; make limits per tenant + platform ceiling |
| Usage/cost ledger (`api_usage_log`, `enrichment_usage`, `actor_cost_usd`) | **REUSE WITH REFACTOR** (core) | add tenant id; log Meta/Cloudflare/Resend; drop Move37 accounting |
| Admin control centre / AI briefing | **REIMPLEMENT** (UI) / REUSE `adminMetrics.ts` folds | one fold per metric is the right rule; three competing folds exist today |
| Notifications | **REUSE WITH REFACTOR** (core) | simple and correct; kinds as data |
| Search Console sync | **OPTIONAL PRODUCT MODULE** | generic; own-site row is Findable data |
| Client-site enquiry relay | **FINDABLE MODULE** | hand-kept site list |
| Feedback / What's New | **REUSE WITH REFACTOR** | small; changelog-as-code should become data |
| Compliance groundwork (TPS, salesperson onboarding records) | **FINDABLE MODULE** / UK plug-in | dormant; UK-specific |
| `fetchAllRows`, `edgeInvokeCore`, `usePersistedState`, `saveQueue`, `prospectPreview/color.ts` | **REUSE** | generic, correct utilities |
| Barber/salon product, bookings, claim links, `barber-site-images`, Instantly, SMS, self-serve billing residue, 22 orphan deployed functions, legacy activity logs, backup tables, dead files in §8.2 | **REMOVE** | retired; do not enter V2 |

---

## 10. Provisional core vs module boundaries

*This is provisional and based on what exists. It is not a design.*

**What appears to be core** (every installation needs it):
- tenancy and identity: organisation, members, roles scoped to the organisation, invites, suspension;
- the lead/contact record and its activity log;
- the derived sales state and the human-set Next Action;
- campaigns as containers;
- lead sourcing, if Google Places is accepted as a core dependency;
- notifications;
- the protection guard and the usage/cost ledger, both tenant-scoped;
- a credential store with a provider registry;
- tenant settings: locale, timezone, currency, branding, sender identity;
- the generic utilities.

**Modules the code already suggests:**

| Module | Built from | Depends on |
|---|---|---|
| **WhatsApp Outreach** | queue, sender, inbound webhook, inbox, voice/media, suppression, template sync | core lead + a tenant channel credential |
| **AI Visibility** | question generation, runs, named signal, measurement compare/replay, competitor extraction, budget pools, report data | Apify + OpenAI credentials; optionally Website Intelligence |
| **Website Intelligence** | crawl check, exhaustive crawl, site audit findings, agency detection, SEO scan | nothing paid except the SEO actor |
| **Research / Enrichment** | socials, email find, paid enrich, Companies House (UK plug-in), directory presence | Apify; registry plug-ins per country |
| **Sales Team** | team roles, assignment, team board, check-before-calling, sales dashboard | core; AI Visibility for checks |
| **Commission & Payments ledger** | ledger, stamping, engagement windows, attribution review | a payments provider |
| **AI Assist** | warm-reply drafter, voice-note script, reply triage, business summary | OpenAI |
| **Client Delivery** | paid clients, intake, missing info, delivery stage, monthly update | a payments event; possibly generic later |
| **Findable** (tenant module, not core) | offer, guarantee, agreement versions, checkout and sign-up flow, report/welcome/results copy, Website Build, page generator, Quick Close wording, house style, findable.live integration | — |

**Things the current list of candidate modules leaves out:**
1. **Territory & market planning**: Coverage, niche check, found/added. This is distinct from lead search.
2. **Agreements & e-signature**: versioned, immutable, signed before payment. A reusable capability that is currently
   inside the Findable flow.
3. **Prospect Preview**: personalised outreach artefacts.
4. **Reputation**: review-reply drafting, which today sits inside Paid Clients.
5. **Search Performance**: Search Console.
6. **Compliance**: suppression, TPS/do-not-call, consent, data-access audit. Partly core, partly plug-ins per country.
7. **Email Outreach** does not exist today. Only transactional email exists, through Resend. A V2 email module would be new
   work, apart from the suppression list and sender-domain handling.

---

## 11. Dependency map (what drags what)

```
AI Visibility audit
  → requires Apify (single account; monthly cap = global kill switch), OpenAI (questions, competitor cleaning)
  → reads outreach_leads (trade, town, name, website), uk_towns, onboarding_responses (paid clients)
  → writes ai_audits / ai_audit_runs / ai_audit_queue, enrichment_usage, api_usage_log
  → triggers (DB) baseline/full-measure/remeasure pointer claims ON outreach_leads (immutable)
  → triggers crawl-check, extract-competitors, run-seo-scan, free-check / results emails (Resend),
    automated audit_reply WhatsApp (Meta), notifications (audit_finished)
  → consumed by: client report (public), Sales check, Quick Close script, Inbox hook card, Coverage/niche,
    weekly check, Paid Client baseline, page generator

WhatsApp opener (queue)
  → requires Meta (one number), a completed hook audit for audit-derived template vars (Apify cost per send)
  → reads outreach_leads (queued), contact_suppressions, whatsapp_messages (contact history), team_members (suspension)
  → writes whatsapp_sends → trigger mirrors into whatsapp_messages → triggers assign_lead_on_contact,
    onboarding/report link events, notifications
  → inbound via whatsapp-status → resolveOwner (book owner) → lead status 'replied' → first-reply audit intent →
    possibly mockup (scan-site-details, OpenAI) → conversation-triage (OpenAI) → suppression on opt-out phrases

Payment (Stripe checkout.session.completed)
  → requires a signed agreement (client_agreement_acceptances) and a decided route (onboarding_responses.plan_tier)
  → writes outreach_leads (amount, status, contract), payment_ledger → trigger stamps commission
  → trigger trg_client_intake_on_paid → client_intake → client-intake fn → crawl-check
  → trigger trg_outreach_leads_sold_by → seller attribution / review
  → starts paid baseline (create-ai-audit), delayed subscription (Stripe), new-client email (Resend),
    WhatsApp confirmation (Meta), first-contact owner (book owner)

Sales rep actions
  → every write via lead_* SECURITY DEFINER RPCs → lead_activity → notifications
  → every paid action via guard_action (protection_settings singleton) → api_usage_log 'guard' rows
  → reads via sales_leads view + my_sales_* helper sets inside RLS

Website Build
  → requires paid client (outreach_leads), onboarding, crawl, baseline questions, domain authority rule
  → stored as outreach_leads.website_build JSON (paid-client-hub must be deployed before SPA when shape changes)
  → output deployed outside the app (separate repos, third Cloudflare account); enquiry forms → site-enquiry (Resend)
```

**Features that look independent but are deeply coupled:**
- **The client report.** It looks like a renderer, but it imports Findable offer constants, edge `_shared` modules,
  `buyOffer` hard-coded ids and lead data. It can also kick off a crawl when someone opens it.
- **WhatsApp templates.** Audit-derived variables tie sending to the audit engine, so a cold opener carries an Apify cost.
- **Commission.** It depends on the Stripe webhook, the ledger trigger, quick-close link events (to decide whether the seller
  was engaged), `team_engagement_events` and a London calendar. TS and SQL each hold a copy of the tier table.
- **Coverage and Sales.** Both read the whole book through `bookOwnerId`.
- **`outreach_leads` itself.** About 25 triggers fire on it: identity lock, owner on add, assignment readiness, sold-by,
  attribution review, client intake, pointer guards, status hygiene, notifications. Almost every module writes to it.
- **The two repositories.** findable-site holds copies of the offer, agreement, serve gate, domain rule and trade words.
  `npm test` reads its source through `scripts/findable-site-dir.mjs`.

---

## 12. V2 migration risks (Findable moving from legacy to V2)

| Risk | Why it is high | Notes |
|---|---|---|
| **Message history and inbound routing** | conversations are keyed by phone, owner resolved heuristically; media in `whatsapp-media/<userId>/…`; the Meta webhook URL is a single endpoint that must be switched atomically; the Meta app itself is mid-migration (Move37 → Findable) | dual-running two systems on one number is not possible; plan a single cutover |
| **Outreach queue & automation in flight** | 14 crons, queued leads, first-reply intents, pending audit replies, delayed audits, weekly checks; any double-run sends duplicate real messages | freeze/drain order matters; the queue "structurally cannot send a second message" only within one system |
| **Payments & subscriptions** | live Stripe subscriptions carry metadata (lead id, route) that the webhook resolves against `outreach_leads`; webhook endpoint switch; payment holds; legacy payment links | historical clients (Ronnie, MCL, RG, SC, BS4) have hand-set exceptions that must not be re-ruled |
| **Commission ledger** | stamped rates and month sequence are immutable by design; recomputing in V2 would change earned commission | migrate stamped rows verbatim |
| **Audit history & guarantee evidence** | frozen baselines, immutable pointers, replay of the ASKED set, `NOISE_BAND_PP` labels; a client's guarantee claim depends on byte-faithful history | ai_audit_queue is 80 MB; keep ids stable |
| **Public URLs that must resolve forever** | `findable.live/r/<code>`, `/report/<uuid>`, legacy name+hex slugs, `/w/<code>`, `/results/<id>`, `/agree/<token>`, `/details/<token>`, 64 `yoursites.uk/a/<id>` links | short codes and UUIDs must survive; proxies live in findable-site |
| **Agreements** | immutable signed acceptances, version pinning (v1/v3/v4), parity with findable.live's public `/agreement` | legal record; no re-rendering drift |
| **Authentication** | 3 users (operator login on move37.fun; data account separate); invite links; Auth redirect URLs on two hosts; JWT-dependent edge callers | small user count makes this low volume but high consequence |
| **Live-DB-only objects** | crons, `edge_internal_keys`, four tables without migrations, grants, Vault secrets | V2 must be built from a live schema dump, not from the repo |
| **Generated websites & build state** | `website_build` JSON, client site repos on another Cloudflare account, enquiry recipient list in code, `generated_sites` shared with barber data | |
| **Salesperson data** | team members, engagement events, onboarding records, attribution reviews | small volume |
| **Cost and quota continuity** | provider accounts recently moved from Move37 to Paul; Apify cap US$40; caches warm-up cost if not migrated | |
| **The overloaded lead row** | splitting lead/deal/client/project during migration multiplies the mapping risk for every downstream feature | consider migrating as-is into a Findable tenant first, splitting later [I] |
| **Cross-repo coupling** | findable-site, findable-directory (reads the same DB) and client-site repos would all need repointing | findable-directory owns 2 deployed functions and reads `directory_businesses` anonymously |

---

## 13. Recommended next investigations

All of these are still read-only. They were not done in this pass.

1. **Dump the live schema as the source of truth.** Use `pg_dump --schema-only` or catalogue queries, and diff it against
   the migrations. List every object that exists only in the database.
2. **Read every policy, table by table.** Classify each table: owner, admin, sales, service-only or public. Find the
   effective rule once permissive and restrictive policies are combined, especially on tables where both kinds coexist.
3. **Audit the 22 orphan deployed functions.** Download their bodies through the Management API, check which are publicly
   callable, and check whether any live caller still exists (findable-site, findable-directory, old links).
4. **Inventory `outreach_leads` column by column.** Name the writer and reader of each column and give it a domain (lead,
   deal, client, delivery, measurement). This is the input to any split.
5. **Get real billed costs.** Pull a billed month from the Apify, Google, OpenAI, Meta and Cloudflare dashboards and compare
   it with `api_usage_log`, to calibrate per-audit and per-message unit economics.
6. **Read findable-site and findable-directory** to the same depth: what they read and write, and their auth model.
7. **Check the Meta and Stripe account setup.** Can WhatsApp numbers and WABAs be provisioned per tenant (embedded signup or
   Tech Provider)? Is Stripe Connect viable for tenant billing?
8. **Separate the tests.** Mark which of the 353 suites test pure behaviour, which can be ported, and which only grep source
   text and would not carry over.
9. **Confirm the dead-code list (§8.2)** with a build-graph tool (`scripts/check-import-graph.mjs --orphans`) before
   anyone deletes anything.

---

## 14. Open questions and decisions required

1. **Shared database or separate projects?** Should tenants share one Supabase project with a tenant key, or get one
   project each? This decides almost everything in §5.3 and §7.1.
2. **Credentials: platform-owned or bring-your-own?** Decide per provider: Apify, Google, OpenAI, Meta, Stripe, Resend. Does
   LeadFinderOS resell usage, pass costs through, or require tenants' own keys?
3. **WhatsApp.** Does each tenant connect its own number and WABA? If so, LeadFinderOS needs Meta Tech Provider or
   embedded-signup status.
4. **Shared caches.** Should `search_cache`, `phone_cache` and enrichment results be shared across tenants (cheaper) or
   isolated (private)?
5. **Global identity rules.** Is "one place id belongs to one lead" a per-tenant rule? Can two tenants pursue the same
   business? Is the suppression list global (safer legally) or per tenant?
6. **Is AI Visibility a LeadFinderOS module, or Findable's IP?** If other tenants can buy it, the measurement engine,
   question generator and report become platform product, and Findable becomes their first customer.
7. **Where Findable-specific code lives.** As a tenant module inside the V2 codebase, or as a separate extension package
   or repo?
8. **Is findable-site part of the platform?** Should public pages (sign-up, report hosting, agreement) be a
   platform-provided, white-label capability?
9. **Configurable pipeline stages.** Fixed core stages with tenant labels, or fully tenant-defined stages?
10. **Commission and payouts.** Are they a platform module that every tenant configures, or Findable-only?
11. **Migration strategy for Findable.** Lift-and-shift into a Findable tenant and then refactor, or split the data model at
    migration time?
12. **The live security gaps (§7.2: G1 unsigned Meta webhook, G2 orphan functions, G3 unguarded paid functions, G5 personal
    data in source).** Should these be fixed in the legacy system now, independently of V2? This document only reports
    them.

---

### Appendix: how this was produced

- **Code.** Seven parallel read-only investigations covered the frontend, edge functions a–m, edge functions n–z,
  migrations/RLS, external services/costs, Findable coupling/debt, and the `src/lib` catalogue. Their key claims were then
  spot-checked directly:
  - the queue cap;
  - client personal data in `websiteTemplates.ts`;
  - the dead `RequireAdmin` and `useDashboardMetrics`;
  - the missing role check in `run-seo-scan`;
  - the execute grants on `edge_internal_keys`.
- **Live database.** Read-only `SELECT` queries through the Management API covered tables, row estimates, RLS flags,
  policies, grants, functions (security definer), triggers, cron jobs, buckets, the realtime publication, role counts and
  owner distribution. Auth settings and the deployed-function list were read with GET requests. No secrets were printed.
- **Coverage.** Directly or through the investigations: all edge functions, all pages and routes, the whole `src/lib` and
  `src/hooks` catalogue, all migrations, the config and the root Pages Functions. Spot-read only: the 197 component files
  and the 353 test files. Not read at all: the findable-site and findable-directory internals beyond their calls into this
  backend.
