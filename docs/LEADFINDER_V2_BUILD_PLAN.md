# LeadFinderOS V2: build plan and Sonnet work packets

*2026-10-07. Implements `LEADFINDER_V2_ARCHITECTURE.md` (**A§n**). Decisions are in `LEADFINDER_V2_DECISIONS.md`
(**ADR-n**). Nothing here has started. Before building, the architecture needs Paul's approval, and the open questions
Q2 and Q3 need answers.*

---

## 1. How the packets work

### Shape of a packet

Every packet is one Sonnet session and ends in **one reviewable commit (or a small PR) on its own branch** in the V2
repo. Each packet has:
- **Depends:** packets that must be merged first.
- **Builds:** the concrete scope. Anything outside it is out of scope.
- **Reuse:** the legacy files to port. Each is copied with a `// ported-from: LeadFinderOS@<sha>:<path>` header, and its
  tests come with it.
- **Done when:** the acceptance checks. CI must be green, including the cross-tenant suite and schema lint once those
  exist.
- **Review:** 🔶 means an Opus architecture review is needed *before* merge (and sometimes before starting, marked
  🔶pre).

### Standing rules for every Sonnet session

Put these in the V2 repo's `CLAUDE.md`:
1. Read the packet and the A§ sections it cites. Do not redesign. If the packet conflicts with the spec, **stop and
   report**. Do not improvise.
2. Every new table must have:
   - `org_id` (or appear on the GLOBAL allowlist);
   - `UNIQUE (org_id, id)`;
   - composite foreign keys;
   - RLS enabled and forced;
   - explicit grants;
   - policies that use `app.member_orgs()` / `app.can()`;
   - an entry in the cross-tenant suite (generated, so this is mostly automatic).
3. Handlers never read `org_id` or a user id from the body. Business code never reads provider keys. The service client
   is used only in jobs, webhooks and `core/privileged`.
4. Never deploy to production. A merge to `main` deploys to staging through CI. A production release is Paul's tagged
   approval.
5. Port; do not rewrite. If a ported file needs changing, change it in its own commit after the verbatim port, so the
   diff shows the change.

### Paul actions

Some packets need Paul to do something that code cannot, such as creating accounts, approving a real send, or clicking
a Meta setting. These are marked **[Paul]**.

---

## 2. Sequence at a glance

```
Phase 1 Foundation        WP-01 … WP-23
Phase 2 Core CRM          WP-24 … WP-36
Phase 3 Prospecting       WP-37 … WP-39
Phase 4 Comms + WhatsApp  WP-40 … WP-50     ──►  ★ Ethan/Stephan go-live (after WP-50)
Phase 5 Sales Team        WP-51 … WP-54
Phase 6 Email             WP-55 … WP-57     (moves before Phase 4 if their channel is email — Q2)
Phase 7 Website Intel     WP-58 … WP-61     (can run in parallel with 5/6 once Phase 2 is done)
Phase 8 AI Visibility     WP-62 … WP-70
Phase 9 Money & delivery  WP-71 … WP-76
Phase 10 Findable module  WP-77 … WP-81
Phase 11 Findable migration WP-82 … WP-90 ──►  ★ Findable on V2
Phase 12 Website Builder  WP-91 … WP-95
Phase 13 Retirement       WP-96
```

**Totals:**
- **96 packets**, plus 3 optional Phase 0 packets in the legacy repo. 50 of them come before Ethan/Stephan can go live
  (47 if they do not need Google Places sourcing).
- **32 are flagged for Opus review** 🔶. Most of them are the foundation, money and migration packets.

**Parallelism:**
- After WP-13, the foundation streams (integrations, metering, UI shell) can run as two or three concurrent sessions.
  Each must work in its own worktree.
- Phase 7 is independent of Phases 4–6.

---

## 3. Phase 0: legacy inputs (optional, LEGACY repo, read-only except G-fixes)

| ID | Title | Builds | Done when | Review |
|---|---|---|---|---|
| WP-00a | Live schema dump | read-only catalogue dump of production into `docs/v2-inputs/schema/` (tables, columns, policies, functions, triggers, crons, grants) | committed; diff vs migrations listed | — |
| WP-00b | `outreach_leads` column map | every column → writer, reader, V2 home (A§4.4) | table complete; unknowns listed | 🔶 (feeds WP-82) |
| WP-00c | Legacy security fixes | G2 delete orphan functions, G3 role checks, G5 scrub PII; G1 waits on the Findable Meta app | **[Paul]** approves each; legacy checks green | 🔶 |

These packets support the work but do not block Phases 1–10. WP-00b blocks WP-82.

---

## 4. Phase 1: Foundation

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-01 | Repo scaffold | — | new repo `leadfinderos`; pnpm workspaces; `apps/web` (Vite, React, TS strict); `packages/{kernel,core,providers,modules,tenant-findable,test-support}` empty with package.json; ESLint and Prettier; root `CLAUDE.md` with the standing rules | — | `pnpm i && pnpm check` passes on an empty app | — |
| WP-02 | CI pipeline | 01 | GitHub Actions: lint, typecheck (zero errors), unit tests, Deno install + `deno check supabase/functions/**`, build | — | CI green on main | — |
| WP-03 | Supabase local + environments | 02 | `supabase init`; `config.toml`; CI job running `supabase start` + `db reset`; **[Paul]** creates the staging and prod projects in a new Supabase org; GitHub environment secrets | — | CI resets a local DB; staging linked | — |
| WP-04 | Migration stream generator | 03 | `scripts/build-migrations.mjs` (module `db/*.sql` → `supabase/migrations/<ts>_<module>__<name>.sql`); CI check that the stream matches the sources; duplicate-timestamp check | — | adding a module SQL file without regenerating fails CI | — |
| WP-05 | Tenancy schema | 04 | `organisations`, `profiles`, `memberships`, `invitations`, `org_settings` (empty typed columns); `app` schema; `UNIQUE(org_id,id)` convention; revoke-all grants baseline | — | tables exist; anon has no grants | 🔶 |
| WP-06 | RBAC catalogue + helpers | 05 | `roles`, `permissions`, `role_permissions` seeded from `packages/core/rbac/catalogue.ts`; SQL `app.member_orgs()`, `app.my_membership(org)`, `app.can(org, perm)` (STABLE, SECURITY DEFINER, pinned search_path, checks membership status + module enabled) | `roleRules.ts` ideas only | unit SQL tests: suspended member → false; disabled module → false | 🔶 |
| WP-07 | Schema lint | 06 | `scripts/schema-lint.mjs` running catalogue queries after `db reset`: RLS on and forced; `org_id` or GLOBAL allowlist; composite FKs; SECURITY DEFINER allowlist + search_path; no anon grants; publication allowlist; cron jobs match the repo | — | a deliberately bad test table fails lint | 🔶 |
| WP-08 | Cross-tenant test harness | 06 | `packages/test-support`: seed two orgs × six roles; generic test that, for every org table, org-A tokens cannot SELECT/INSERT/UPDATE/DELETE org-B rows or reference them by FK; RPC/edge endpoint registry for the same | — | runs in CI; new tables are picked up automatically | 🔶 |
| WP-09 | Auth + invitations | 06 | invite-only Auth; `invite_member` / `accept_invitation` server functions; set-password page; TOTP enrolment; `get_session_context()` RPC (orgs, memberships, permissions, modules) | legacy SetPassword flow | invite → accept → membership active, covered by an e2e test | — |
| WP-10 | Edge request context | 06 | `packages/core/http`: JWT verify, `x-org-id` checked against membership, `RequestContext`, `requirePermission`, error envelope, CORS allowlist module, user-scoped client factory; lint rule: service client importable only from jobs/webhooks/core/privileged; lint rule: no `role ===` checks | `edgeInvokeCore` (client side) | a handler given a body `org_id` ignores it (test); a cross-org header → 403 | 🔶 |
| WP-11 | Module registry + entitlements | 06 | `ModuleManifest` type; core manifest; `modules`/`plans`/`plan_modules` seeded from the registry; `org_modules`; enable/disable service with dependency checks; `scripts/check-module-graph.mjs` | `check-import-graph.mjs` approach | enabling a module without its dependency is refused; core→module import fails CI | 🔶 |
| WP-12 | Org settings | 11 | typed `org_settings` (timezone, locale, currency, country, branding, contacts, default send window, default owner); `org_modules.settings` validation with zod per manifest; settings API | — | invalid settings are refused server-side | — |
| WP-13 | Jobs + fair runner | 06 | `jobs`, `job_runs`; SQL `claim_jobs(limit, per_org_cap)` with SKIP LOCKED + round-robin by org + priority; `job-runner` edge function (runner secret can only drain); handler registry from manifests; retry/backoff/dead; pg_cron schedule **in a migration** | legacy queue patterns | fairness test: org A with 1,000 jobs does not delay org B's single job beyond one tick | 🔶 |
| WP-14 | Domain events | 13 | `domain_events`; `emitEvent()`; dispatcher job fans out to subscribed handlers from manifests; idempotent per (event, handler) | — | event → handler job exactly once (test) | — |
| WP-15 | Module scheduler | 13, 11 | `scheduler` function: expands `ScheduleDef` into jobs per org with the module enabled; `initiated_by` = enabling membership | — | a disabled module produces no jobs | — |
| WP-16 | Integrations + Vault | 11 | `providers` catalogue from code; `integration_connections`; `app.connection_secret()` (service only, logged); store/rotate/revoke service; admin UI to create a connection (secret write-only) | — | secrets unreadable by `authenticated` (test); rotation keeps history | 🔶 |
| WP-17 | Provider gateway | 16 | `meteredCall(ctx, meter, est, fn)`: kill switch → guard → credential → token bucket (DB) → breaker → classify → usage row; a fake provider for tests; CI grep forbidding provider env reads outside `packages/providers` | `classifyFailure` taxonomy | the fake provider call writes a correct usage row; an open breaker fails fast | 🔶 |
| WP-18 | Usage ledger | 17 | `usage_events`, `price_book`, `usage_daily` + rollup job; org usage API (paged, no 1,000-row truncation) | `api_usage_log` shape | the rollup equals the raw sum (test) | — |
| WP-19 | Spend guard + limits | 18 | `org_limits`, `platform_limits`, `platform_flags`, `spend_reservations`; `app.guard_spend()` (atomic, reserving); pause modes per org and platform; priority classes; soft-limit notifications | **`guard_action`** + `protectionLimits.ts` logic | concurrency test: 20 parallel calls never exceed the hard cap; a soft cap notifies once | 🔶 |
| WP-20 | Audit log + alerts | 10 | `audit_log`; writer helper; denial threshold per org (port `record_denial` logic); platform alert email sender (platform Resend key, through the gateway) | `security_events` ideas | 10 denials → one alert | — |
| WP-21 | Observability baseline | 13, 20 | Sentry in SPA + edge (org/module tags, PII scrubbing); `app_errors` mirror; dead-job + unresolved-webhook alerts | — | a thrown handler error appears in Sentry with org tag (staging) | — |
| WP-22 | SPA shell | 09, 11 | router `/o/:orgSlug/*`; bootstrap from `get_session_context`; nav from manifests ∩ permissions; org switcher; login; "not on your plan" page; React Query setup | `usePersistedState`, `fetchAllRows` | switching org reloads context; hidden module routes 404 | — |
| WP-23 | Platform console v1 + members | 22, 19, 16 | platform staff table; console: orgs (create, suspend), invite owner, entitlements, limits, connections, usage by org; org-side Members page (invite, role, suspend); **support access grants** wired into `app.member_orgs()` with audit | `admin-users` behaviour | staff without a grant cannot read org data (test); a grant expires on time (test) | 🔶 |

---

## 5. Phase 2: Core CRM

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-24 | Kernel port 1 + port-drift | 01 | `packages/kernel`: phone key (ONE definition + SQL twin + parity test), `waNumber`, `lineType`, `displayName`, `nameMatch`, London/zone day helpers (one), HTML escape (one); `scripts/port-drift.mjs` | the listed `src/lib` files + tests | ported tests green in Vite and Deno; drift script lists none | — |
| WP-25 | Businesses + contacts | 08, 24 | `businesses`, `contacts`, `contact_points` (normalised via kernel, unique per org), composite FKs, RLS | — | the cross-tenant suite covers them; duplicate place_id in the same org refused, in another org allowed | — |
| WP-26 | Pipeline, leads, deals, customers | 25 | `pipeline_stages` + default template seeded per org on creation; `leads` (one open per business), `deals`, `customers`; lifecycle cache on businesses | — | constraints tested | 🔶 |
| WP-27 | Tasks, notes, tags, activities | 26 | `tasks` (one open next action per lead, partial unique), `notes`, `tags`/`taggings`, `activities` (append-only trigger), activity kind registry | `nextActionView.ts`, `nextActionWrite.ts` | a second open next action is refused; activities cannot be updated | — |
| WP-28 | CRM core services | 27, 14 | server functions: `createBusiness`, `addLead`, `assignLead`, `moveLeadStage` (no downgrade via categories), `setNextAction`, `markLost(reason)`, `markDealWon` → customer; each emits an activity + a domain event | **`leadState.ts`** (generalised to categories), `lostReason.ts`, `strongStatuses.ts` | state derivation tests ported and passing | — |
| WP-29 | CRM RLS scopes | 28 | `read_all` / `read_assigned` / `write_assigned` policies; sales sees only assigned; viewer read-only | `access.ts` permission ideas | the role matrix test (6 roles × CRUD × own/other/other-org) passes | 🔶 |
| WP-30 | Import / export | 28 | CSV import (preview, mapping, dedupe per org by phone key/place/website, idempotent batches, owner = importer), export (permission `data.export`, audited) | `import_leads` validation rules | re-importing the same file creates 0 rows | — |
| WP-31 | Lead list UI | 29, 22 | paged list, filters by stage category/owner/campaign/tag, saved views (ORG-USER), bulk assign | — | handles 10k rows paged | — |
| WP-32 | Lead panel UI | 31 | business + contact details, timeline (activities), tasks, notes, stage control, next action | decisions recorded in legacy `LeadDetailDialog` headers (not code) | one lead worked end to end in staging | — |
| WP-33 | Pipeline board + stage settings | 31 | board by stage; settings page to rename/reorder/add stages with a category | — | renaming a stage does not change automation (test on category) | — |
| WP-34 | Campaigns | 28 | `campaigns` (unique per org), attach leads, archive; UI | `campaign_*` behaviour | duplicate names across orgs allowed | — |
| WP-35 | Notifications | 14 | `notifications` (ORG-USER), kind registry, realtime channel, bell UI, email digest preference | `notify_person` behaviour | an assignee gets a notification on assignment | — |
| WP-36 | Files | 25 | `files` table, private buckets with `org/<org_id>/` policies, signed upload/download functions | — | a cross-org path read is refused (test) | — |

---

## 6. Phase 3: Prospecting

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-37 | Places provider + caches | 17 | `providers/google-places` (text search, details, geocode; key in header only); global `places_cache`, `geocode_cache`, `place_details_cache` (service only); price book rows | `search-leads` request shapes, cache TTLs | a cache hit writes a usage row with cost 0 actual | — |
| WP-38 | Search service | 37, 28 | tiling/radius search, website verdict, `search_runs` + `search_results_seen` per org (found/added), add-to-CRM | tiling and verdict logic from `search-leads`, `LeadSearchContext` (logic only) | org B cannot see that org A searched (test) | — |
| WP-39 | Search UI | 38, 22 | search form (trade vocabulary from org settings), results, add to CRM with campaign | — | metered per member in staging | — |

---

## 7. Phase 4: Communications + WhatsApp

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-40 | Comms schema | 25, 16 | `comm_identities`, `conversations` (unique identity+address), `messages` (unique provider id), `message_templates`, `outbound_messages` (idempotency key; cold unique per campaign+contact point), `conversation_reads`, `suppressions`, `platform_suppressions`, `webhook_events` | — | constraints + cross-tenant tests | 🔶pre |
| WP-41 | Kernel port 2 (messaging rules) | 24 | `coldOutreach`, `ukColdDestination` → `coldDestination(country)`, `templateVars`, `templateRouting`, `sendWindow` (per identity tz), `inboundMatch.chooseInboundLead`, `classifyFailure`, `metaWebhookGate`, opt-out phrase detection | listed files + tests | ported tests green | — |
| WP-42 | Outbound pipeline | 40, 41, 19 | `requestSend()` (policy checks → outbound row → job), send-window gate, identity daily cap, member limit, **dry-run mode**, failure classification + retry | queue guard order from `process-whatsapp-queue` | a suppressed contact is refused with a reason; dry run stops before the provider | 🔶 |
| WP-43 | WhatsApp connection (mode A) + webhook | 40, 16 | connection form (token, app secret, WABA id, phone_number_id) → Vault; verify call; `/webhooks/meta/:connectionId` with per-connection HMAC (fail closed), verify-token handshake, `webhook_events` idempotency, routing by `phone_number_id` | `metaWebhookGate.ts` | forged signature → 401; two identities in two orgs route correctly (test) | 🔶 |
| WP-44 | WhatsApp adapter | 43, 42, 17 | send template/text/media through the gateway (metered as `message`), status updates → `messages` timeline | `_shared/whatsapp-send.ts` (payload building) | status webhooks update the right message | — |
| WP-45 | Templates sync + UI | 44 | pull templates from the WABA, store bodies/variables/status; create-template request form; variable mapping to typed sources | `templateBodies` shapes | statuses match Meta in staging | — |
| WP-46 | Inbound processing | 44, 28 | resolve contact (org-scoped), upsert conversation, store message, opt-out → org suppression, `message.inbound_received` event → `moveLeadStage(engaged)`, notify assignee; unknown sender → new contact, default owner | `whatsapp-inbound.ts` logic | opt-out phrase suppresses; a reply moves the stage; no cross-org match (test) | — |
| WP-47 | Inbox UI | 46, 22 | conversation list (filters: mine/unassigned/unread), thread, composer (free text inside 24 h, else template), assign, star | — | used end to end in staging | — |
| WP-48 | Media + voice | 47, 36 | inbound media download to `org-media`, outbound media, voice-note record + remux | `oggOpus.ts` | a voice note plays on a phone (staging, test number) | — |
| WP-49 | Campaign launch | 42, 34 | launch = queue approved opener for campaign leads with a WhatsApp contact point; pacing; per-identity cap | `sales_queue_opener` behaviour | relaunching does not double-send (test) | — |
| WP-50 | Go-live readiness | 21, 23, 47, 49 | go-live checklist doc; staging rehearsal on a Meta test number; tenant DPA/terms placeholder; **[Paul]** first real send in a test org | — | checklist signed off by Paul | 🔶 |

**★ Ethan/Stephan go-live happens here.** Steps: create the org (WP-23), connect their WABA (WP-43), sync and approve
templates (WP-45), set limits (WP-19), and invite their members (WP-23).

---

## 8. Phase 5: Sales Team

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-51 | Sales module + workspace | 32, 47 | manifest + permissions; salesperson home: my leads by next action, call screen (log outcome → activity + stage), pre-call research slot (hidden unless an enhancing module is on) | call-screen decisions (not copy) | a sales user works only assigned leads | — |
| WP-52 | Manager view | 51 | team pipeline, bulk assign/reassign, workload | — | a manager without admin rights can run assignments | — |
| WP-53 | Performance + targets | 51 | ONE metrics fold (activities, contacts, replies, meetings, wins by category); `sales_targets`; dashboard | `salesPerformance.ts` (the fold) | fold tests ported | — |
| WP-54 | Team board | 51 | posts, recipients, acknowledgements | `team_posts` behaviour | — | — |

## 9. Phase 6: Email

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-55 | Transactional email identity | 17, 40 | Resend provider; org domain verification (DNS records shown in UI); fallback sender; notifications/emails sent from the org identity | sender-domain handling | an email from a verified org domain passes DKIM in staging | — |
| WP-56 | Mailbox connections | 16, 40 | Google OAuth (Gmail send + read) connection, token refresh job, `needs_reauth` flow; email `comm_identity` | — | send + receive on a test mailbox | 🔶 |
| WP-57 | Sequences + replies | 56, 42 | `email_sequences`/steps/enrolments; stop-on-reply; reply polling → conversations; unsubscribe link + header → suppression | — | a reply stops the sequence; unsubscribe suppresses | — |

## 10. Phase 7: Website Intelligence

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-58 | Crawl kernel port | 24 | `safeFetch`, `crawlCheck`, `crawlUrl`, `fullCrawl`, `agencyDetect`, `siteEvidence`; platform crawler UA | listed files + tests | ported tests + SSRF tests green | — |
| WP-59 | Crawl schema + job | 58, 13 | `websites`, `crawl_jobs`, `crawl_pages` (incl. parsed JSON-LD), step-wise crawl job with caps + 7-day reuse per org | `crawl-job.ts`, `crawl-worker` | a 500-page site crawls over many ticks without timeouts | — |
| WP-60 | Findings + UI | 59 | `site_findings` (versioned rules), technical SEO rules, AI-crawler access facts, website panel on the business | `siteAudit.ts`, `siteFindings.ts` | findings match legacy on 3 fixture sites | — |
| WP-61 | SEO scan sub-capability | 60, 17 | Apify SEO actor via the gateway → normalised findings `source='seo_actor'`; permission `website_intel.seo_scan` | `run-seo-scan` | metered; refused without the permission | — |

## 11. Phase 8: AI Visibility

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-62 | Measurement kernel port | 24 | `namedSignal`, `nameMatch`, `derivable.nameIsJudgeable`, `measurementCompare`, `pooledRuns`, `baselineReplay`, `seedGuard`, `competitorCleaning`, `sourceType`, `knownEntities`, `auditBudget` → `packages/modules/ai_visibility/domain` | listed files + tests | ported tests green | — |
| WP-63 | AI visibility schema | 62, 25 | programs, question sets, audits, answers (unique audit/q/engine/run), citations, competitors, series (claim-once pointer trigger), comparisons | pointer trigger pattern | a second replay claim is refused | 🔶pre |
| WP-64 | Answer-engine + LLM providers | 17 | `providers/apify` (`answerEngine.ask` for chatgpt/gemini via the scraper actor), `providers/openai` (`llm.complete`, server-chosen model); price-book rows citing billed rows | `_shared/enrichment/*` request/parse | parse tests on recorded responses | — |
| WP-65 | Question sets | 63, 64 | generate (prompt per program), seed guard, dedupe, freeze; manual edit before freeze | `create-ai-audit` question logic | a frozen set cannot change | — |
| WP-66 | Audit runner | 65, 13 | step-wise job: questions × engines × runs; per-answer analysis (named, competitors via LLM, citations, classification); priority class per program | `process-ai-audit-queue` drain logic, `extract-competitors` prompt | a 3-question audit completes in staging; cost attributed | — |
| WP-67 | Series + replay + comparison | 66, 15 | series creation from a baseline; replay scheduling via `replay_due_at`; replay uses the ASKED set verbatim; comparison with a configurable noise band | `audit-baseline.ts` (`advanceBaseline`, `fireDueRemeasures`) | replay asks exactly the baseline's questions (test) | — |
| WP-68 | Report data + public report | 67 | `buildReportData` port; generic report template; `public-report` function (`/r/<code>`, internal → 403, measuring state) | `auditReport.ts`, `measuringState.ts` | a short code resolves only its own report | — |
| WP-69 | Golden parity vs legacy | 68 | export ~30 legacy audits' raw answers as fixtures; assert V2 verdicts, named counts and movement equal legacy | — | 100% parity or each difference explained | 🔶 |
| WP-70 | AI visibility UI | 68 | run audits, view answers/rivals/citations, series and comparison | — | — | — |

## 12. Phase 9: Money, agreements, delivery, commissions

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-71 | Stripe connection + webhook | 16, 40 | org restricted key + `/webhooks/stripe/:connectionId` (per-connection signing secret, fail closed, idempotent); metadata ids verified to belong to the org | `stripe-webhook` verification | a forged event or another org's lead id is refused | 🔶 |
| WP-72 | Products, checkout, ledger, subscriptions | 71, 28 | products/prices mirror; checkout session; `payments` + append-only `payment_ledger`; delayed subscriptions and schedules; holds; `payment.succeeded` event → `markDealWon` | `delayed-subscription.ts`, `paymentState.ts`, `isPaidLead` rule | Stripe test mode: pay → ledger → deal won → customer | 🔶 |
| WP-73 | Agreements | 36, 72 | templates, immutable versions (text + hash), links (random tokens), acceptances (immutable, IP/UA/time), sign-before-pay gate option | `clientAgreement.ts` mechanism, acceptance immutability | an acceptance cannot be altered; the gate blocks checkout | — |
| WP-74 | Delivery | 28, 72 | `projects`, `project_events`, `intake_requests`, `info_requests`; auto-create a project on `deal.won` (configurable) | `clientIntake.ts`, `deliveryStage.ts`, `clientMissingInfo.ts` | payment → project created (event, not trigger) | — |
| WP-75 | Commission engine | 53, 72 | `commission_plans` (versioned jsonb), engine in TS (port), stamping job on `payment.succeeded`, reversal on refund, engagement events, holiday calendar as data | **`commission.ts`**, legacy stamped rows as fixtures | golden test: V2 stamps equal legacy stamped rows | 🔶 |
| WP-76 | Commission UI + payouts | 75 | earned vs projected, expected payment dates, payouts, attribution review | `saleAttribution.ts` | — | — |

## 13. Phase 10: Findable module

| ID | Title | Depends | Builds | Reuse | Done when | Review |
|---|---|---|---|---|---|---|
| WP-77 | Findable org seed | 72, 75, 63 | idempotent seed script for the Findable org: settings, domains, programs (Hook / Free check / Discovery / Baseline / Full / Replay), products/prices, commission plan versions, agreement versions v1/v3/v4 verbatim, pipeline stages | `findableOffer.ts` values, `clientAgreement.ts` text | the seed is re-runnable; values match legacy constants (test reads legacy) | 🔶 |
| WP-78 | Guarantee | 67, 77 | `tenant-findable/guarantee`: eligibility, "gone up" = `improved`, claim window, home-town judging, claims table | `clientTimeline.ts`, `numberWentUp` | legacy guarantee tests ported and passing | — |
| WP-79 | Findable documents | 68, 77 | report, welcome pack and four-week results templates + copy; client-copy claims scan | `aiAuditReportHtml.ts`, `welcomePackHtml.ts`, `remeasureResultsHtml.ts`, `client-copy-claims.test.ts` | rendered output matches legacy on fixtures (modulo platform URLs) | — |
| WP-80 | Public endpoints for findable-site | 77, 73 | org-scoped public API: offer, sign-up/onboarding, agreement view/accept, checkout start | `findable-onboarding`, `findable-checkout`, `client-agreement` behaviour | findable-site staging branch works against V2 staging | 🔶 |
| WP-81 | Findable sign-up + delivery rules | 80, 74 | route choice, serve gate, domain authority, house style for the sales screens, Quick Close copy | `serveGate.ts`, `domainAuthority.ts`, `quickClose.ts` (copy), `salesStyle.ts` | parity tests ported | — |

## 14. Phase 11: Findable migration (Opus designs, Sonnet executes)

| ID | Title | Depends | Builds | Done when | Review |
|---|---|---|---|---|---|
| WP-82 | Migration mapping spec | 00b, 81 | **Opus writes**: legacy table/column → V2 entity mapping, id-preservation list (audit UUIDs, short codes, agreement tokens, onboarding tokens), what is left behind, cutover order | Paul approves | 🔶pre (Opus-owned) |
| WP-83 | Import: people + org | 82 | users → memberships (re-invite, no password copy), team data, salesperson records | dry run in staging | — |
| WP-84 | Import: CRM | 83 | `outreach_leads` split → businesses/contacts/contact_points/leads/deals/customers/tasks/notes; `lead_activity` → activities; campaigns | row counts reconcile; spot-check 50 leads | 🔶 |
| WP-85 | Import: comms | 84 | `whatsapp_messages`/`whatsapp_sends` → conversations/messages; templates; media copied to `org-media`; suppressions | counts + media checksums | — |
| WP-86 | Import: measurement | 84 | `ai_audits`/runs → audits/answers/citations/competitors; pointers → series; short codes kept | every public `/r/` code resolves on V2 staging; comparisons equal | 🔶 |
| WP-87 | Import: money + agreements + commission | 84 | payments, ledger, subscriptions (ids only; Stripe is not touched), agreement versions/acceptances verbatim, commission entries verbatim, payouts | sums and counts reconcile to the penny | 🔶 |
| WP-88 | Import: delivery + misc | 84 | client hub data → projects/intake/info requests; exclusions; Search Console connections | counts reconcile | — |
| WP-89 | Cutover runbook + rehearsals | 83–88 | runbook: freeze legacy queues, final delta import, switch the Meta webhook, switch the Stripe webhook endpoint, repoint findable-site, verify, unfreeze; two full rehearsals on staging | Paul approves the runbook; rehearsals clean | 🔶 |
| WP-90 | Cutover | 89 | **[Paul]** executes with the session; legacy read-only | post-cutover checks green for 7 days | — |

## 15. Phase 12: Website Builder

| ID | Title | Depends | Builds | Review |
|---|---|---|---|---|
| WP-91 | Builder schema | 74, 60 | site_projects, revisions (content model), deployments, domains, templates (platform + org) | 🔶pre |
| WP-92 | Facts + IA steps | 91 | facts from CRM/intake/crawl with held-for-confirmation; page plan (one intent per page, service × area) — reuse `qaAnswerGuard`, `pagePlan`, site-quality-gate rule | — |
| WP-93 | Content + schema steps | 92, 64 | guarded LLM content, anti-stuffing caps, JSON-LD from verified facts | — |
| WP-94 | Build + quality gate | 93, 60 | Astro build from revision; gate via `website_intel` on the preview; noindex preview | — |
| WP-95 | Deploy + domains | 94 | Cloudflare Pages per site (platform account), custom domain verification, hand-off record; template port with client PII removed | 🔶 |

## 16. Phase 13: Retirement

| ID | Title | Depends | Builds |
|---|---|---|---|
| WP-96 | Legacy retirement | 90 (+30 days) | archive dump, unschedule crons, remove functions, keep public URL proxies (`/r/`, `/report/`, legacy slugs) pointed at V2, pause the legacy project |

---

## 17. The Opus review gates, in one list

| Gate | Why Opus |
|---|---|
| WP-05, 06, 07, 08, 10 | the tenancy and security foundation. Everything rests on these. |
| WP-11 | module boundaries and dependency rules |
| WP-13, 19 | fairness and spend-guard concurrency (subtle races) |
| WP-16, 17 | credential handling and the gateway contract |
| WP-23 | support access is a deliberate hole in isolation |
| WP-26, 29 | the lead/deal/customer split and the role matrix |
| WP-40 (pre), 42, 43 | communications identity, policy order, webhook routing |
| WP-50 | the first external tenant goes live |
| WP-56 | OAuth token storage |
| WP-63 (pre), 69 | measurement integrity (guarantee evidence) |
| WP-71, 72, 75 | money and commission correctness |
| WP-77, 80 | Findable configuration fidelity, and the public API surface |
| WP-82 (pre, Opus-owned), 84, 86, 87, 89 | the migration |
| WP-91 (pre), 95 | builder model; hosting and domains |

---

## 18. Highest-risk areas (watch these)

1. **Tenant isolation under the service role** (WP-10, 13, 17, 43, 71): jobs and webhooks are where a wrong `org_id`
   is most likely. Composite foreign keys and the cross-tenant suite are the backstop. Do not let them be weakened "to
   get a packet green".
2. **The spend guard under concurrency and shared provider accounts** (WP-19, WP-66): Apify remains one platform
   account. One tenant can still hurt others if allowances are set wrong. Set allowances below the account cap from day
   one.
3. **WhatsApp identity and webhook routing** (WP-43–46): org-owned Meta setup is manual and error-prone. A misrouted
   inbound message is a data leak.
4. **Measurement and commission parity** (WP-69, 75): guarantee evidence and earned commission must not change
   silently. Golden tests against legacy data are mandatory.
5. **The Findable cutover** (WP-82–90): one Meta number and one Stripe account switch once. Public URLs must resolve
   forever. Rehearse twice.
