# LeadFinderOS V2: architecture specification

*Written 2026-10-07. Design only. Nothing was built, migrated, deployed or changed. The primary input is
`docs/LEADFINDER_V2_RECON.md` (cited below as **R§n**). Decisions, rejected alternatives and open questions are in
`docs/LEADFINDER_V2_DECISIONS.md` (cited as **ADR-n**). The build sequence and Sonnet work packets are in
`docs/LEADFINDER_V2_BUILD_PLAN.md` (cited as **WP-n**).*

**How to read this.**
- §1 is the whole design on one page.
- §2–§9 are the platform: core, modules, data, security, roles, integrations, metering and communications.
- §10–§15 are the modules and Findable.
- §16–§20 are the delivery: migration, repo, deployment, observability and the MVP.

Words used in a fixed sense:
- **organisation** (or **org**): a tenant.
- **business**: a real-world company that a tenant prospects or serves.
- **platform**: LeadFinderOS itself, operated by Paul.

---

## 1. The design on one page

1. **One Supabase project per environment, shared by all tenants**, with `org_id` on every tenant row (ADR-1). A
   dedicated deployment for a premium customer is the same codebase pointed at a different project. It is not a fork.
2. **Isolation is enforced in three layers, and no single layer is trusted alone (§5):**
   - **Postgres RLS** on every org-scoped table.
   - **Composite foreign keys** `(org_id, id)`, so a row in one org cannot point at a row in another.
   - **Server handlers that never take `org_id` from the request.** For a user, the org comes from the user's membership.
     For a job or webhook, it comes from the row the server claimed.
3. **Core is small.** It contains:
   - tenancy, identity and RBAC;
   - module entitlements and settings;
   - the CRM spine: businesses, contacts, leads, deals, customers, pipeline, tasks, activity, campaigns;
   - files and notifications;
   - the credential store and the provider gateway;
   - usage metering with the spend guard;
   - jobs and domain events;
   - the audit log and suppression.

   Everything else is a module (§2, §3).
4. **Modules are code in one repository**, listed in a typed registry. An org turns a module on with one row
   (`org_modules`). Modules do not mean per-org schemas, plugins or forks. Every org has every table, and an
   entitlement decides what it can use (ADR-5).
5. **Every paid provider call goes through one gateway**, `meteredCall`. The gateway:
   - resolves the credential;
   - checks the guard;
   - applies rate limits and a circuit breaker;
   - writes a `usage_events` row tagged with org, user, module, provider, operation, units and cost.

   Business code never reads a provider key (§7, §8).
6. **Communication identity belongs to the org.**
   - WhatsApp numbers and WABAs belong to the org.
   - Email sending domains and mailboxes belong to the org.
   - Inbound traffic is routed by the receiving identity, never by the phone number alone (§9).
7. **Findable is tenant #1.** Its offer, guarantee, agreement, copy, commission plan, templates and domains become:
   - **configuration rows**;
   - a **Findable module** (`packages/tenant-findable`);
   - **findable-site**, which remains Findable's external public site.

   None of it is in core (§15).
8. **Reuse:** the pure domain kernel (phone, names, template variables, lead state), the AI visibility engine, the
   crawl and site-audit engine, the spend guard and the ledger patterns are **ported with provenance**. They are not
   rewritten (§17).
9. **Order of delivery:** Foundation, then Core CRM, then Communications + WhatsApp. **That is the earliest point
   Ethan/Stephan can use V2.** After that: Sales Team → Website Intelligence → AI Visibility → Payments/Agreements/
   Commissions/Delivery → Findable module → **Findable migration** → Website Builder → legacy retirement (§16).

---

## 2. LeadFinderOS Core

### 2.1 The test for "core"

Something is core only if **all three** of these are true:
- every tenant needs it on day one;
- at least two modules depend on it;
- it is part of the security or cost boundary.

If any of the three is false, it is a module.

### 2.2 What is in core, and why

| Core component | In core because | Notes |
|---|---|---|
| **Authentication** (Supabase Auth, invite-only, TOTP) | Security boundary | Reuses the legacy settings (R§2.5). Public sign-up stays off until self-serve exists. |
| **Organisations, memberships, invitations** | Security boundary; everything hangs off them | §4.2 |
| **Roles and permissions (RBAC)** | Security boundary | Fixed role set plus a permission catalogue (§6). |
| **Module registry and entitlements** | Every module depends on it | §3 |
| **Org settings** (locale, timezone, currency, country, branding, owner contacts) | Every module needs locale, timezone and currency (R§4.3 "Locale") | Typed core settings plus one settings document per module. |
| **CRM spine:** businesses, contacts, leads, deals, customers, pipeline stages, tasks / next actions, notes, activity log, campaigns, tags | Every tenant sells. Nearly every module attaches to a business or a lead | Kept thin. Money, delivery and measurement live in modules (§4.4). |
| **Activity log + domain events** | The one timeline. Modules communicate through events, not triggers | Replaces the three legacy logs and the ~25-trigger chain on `outreach_leads` (R§11). |
| **Files / media** (Storage, org-prefixed paths) | Used by WhatsApp media, the builder, imports and agreements | §5.7 |
| **Notifications** (in-app; email through the platform transactional sender) | Used by every module | Notification kinds are a registry, not a CHECK constraint. |
| **Integrations framework:** provider catalogue, connections, secret store, provider gateway | The cost boundary and the identity boundary | §7 |
| **Usage metering, spend guard, quotas and limits** | The cost boundary; decision 3 requires it from day one | §8. Reuses the logic of `guard_action` (R§6.3). |
| **Jobs framework** (job table, fair claim, retries, schedules in migrations) | Every module runs background work | §16.4, §18 |
| **Audit log** (security and data-access events) | Security boundary | Reuses `security_events` / `log_data_access` (R§7.3). |
| **Suppression list** (org-level, plus a platform list) | A compliance boundary that every outbound channel must check | §9.6. The list is core even though the channels are modules. |
| **CSV import / export of CRM data** | Every tenant has existing data on day one | Reuses the safe-import pattern of `import_leads`. |
| **Platform administration** (orgs, plans, entitlements, limits, health, support access) | Operating the platform | §5.9 |

### 2.3 Assessed and kept out of core

| Candidate | Decision | Why |
|---|---|---|
| **Communication abstraction** (conversations, messages, identities, templates, outbound queue) | **Foundation module `comms`**. It is enabled automatically by any channel module | A tenant without messaging (for example a crawler-only customer) should not carry it. It is still one shared model, so WhatsApp and Email do not each invent one. |
| **Lead sourcing (Google Places search)** | **Module `prospecting`**. It is likely enabled for every tenant | It is cost-producing and UK-tuned (R§3 F1). A tenant may import leads instead. Keeping it out of core keeps Google out of core. |
| **Deal value, payments, Stripe** | **Module `payments`** | Core holds the deal and its status. Money movement is optional. |
| **Commission** | **Module `commissions`** | Many tenants have no commissioned sellers. |
| **Pipeline automation rules** ("reply → stage X") | Core holds the *event*. Automation lives in the module that produces the event | This avoids a rules engine in core. |
| **Reporting dashboards** | Core holds one generic CRM overview. Rich dashboards belong to their modules | This avoids recreating the three competing metric folds (R§8.1). |
| **Territory / coverage / niche** | **Module `territory`** | Distinct from lead search (R§10). |
| **AI drafting helpers** | **Module `ai_assist`** | Cost-producing and optional. |
| **i18n framework** | Core holds locale fields and en-GB copy only. No translation framework yet | No non-English tenant exists. R§2.2 shows a half-built one that should not be repeated. |
| **Any Findable rule:** price, guarantee, agreement, measurement shapes, report copy | **Never core** | §15 |

---

## 3. Module architecture

### 3.1 What a module is

A module is a directory in the V2 repository, `packages/modules/<key>/`. It contains:
- `manifest.ts`: the registry entry (§3.2);
- `server/`: the module's edge handlers and job handlers, which import core and declared dependencies only;
- `domain/`: pure logic, ported legacy kernel files, and their tests;
- `ui/`: routes, navigation entries and components;
- `db/`: the module's migration SQL files. They are assembled into the single migration stream (§3.6).

There is no runtime plugin loading and no marketplace. A module is only a boundary inside one codebase that we control
(ADR-5).

### 3.2 The registry (code is the source of truth)

```ts
// packages/core/modules/registry.ts (shape, not final code)
export interface ModuleManifest {
  key: ModuleKey;                       // 'whatsapp', 'ai_visibility', …
  name: string;
  kind: 'foundation' | 'product' | 'tenant';    // tenant = e.g. 'findable'; enabled only for named orgs
  dependsOn: ModuleKey[];               // hard dependencies; enabling requires them
  enhances?: ModuleKey[];               // soft: lights up extra UI if the other is on
  permissions: PermissionDef[];         // 'whatsapp.send', 'whatsapp.inbox.read', …
  defaultRoleGrants: Record<RoleKey, PermissionKey[]>;
  settingsSchema: ZodSchema;            // validates org_modules.settings
  meters: MeterDef[];                   // 'ai_visibility.answer' (unit: question×engine×run)
  jobs: JobKindDef[];                   // kinds this module's runner handles
  schedules?: ScheduleDef[];            // cron-like, run per org that has the module on
  providers?: ProviderKey[];            // which integrations it needs
  routes: RouteDef[]; nav: NavDef[];    // UI (lazy-loaded)
  activityKinds: ActivityKindDef[];     // namespaced 'whatsapp.message_sent'
  notificationKinds: NotificationKindDef[];
}
```

- A CI check, `check-module-graph`, fails the build when:
  - a module imports another module that is not in its `dependsOn`;
  - core imports any module;
  - anything except the registry imports `tenant-*`.
- This extends the existing `check-import-graph.mjs` idea (R§2.3).
- The DB table `modules` (global) is **generated from the registry** by a seed migration, so SQL can reference module
  keys. Nobody edits it by hand.

### 3.3 Organisation entitlements

`org_modules(org_id, module_key, status, settings jsonb, limits jsonb, enabled_at, enabled_by, plan_source)`

- **`status`** is one of:
  - `enabled`;
  - `disabled`: data is kept and read-only, jobs stop and the UI is hidden;
  - `suspended`: platform action, for example non-payment.
- **Enabling** validates the dependencies: they are enabled first, or in the same transaction. **Disabling** is refused
  while an enabled module depends on this one.
- **`settings`** is validated against `settingsSchema` on every write by the server. A version field allows migration
  of the settings document.
- **`limits`** overrides the plan's default allowances for this module (§8.4).
- **Plans** (`plans`, `plan_modules`, global) are bundles of modules and allowances. An org has one plan, and
  `org_modules` can add or override. Plans are a convenience for selling. **The entitlement truth is `org_modules`.**
  Billing reads the plan. Access checks read `org_modules`.

### 3.4 Capability checks: one function, three places

`can(ctx, permission)` is true when:
- the member is active;
- the role grants the permission (or a membership-level grant adds it);
- **the permission's module is enabled for the org**.

It is evaluated in three places:
1. **SQL:** `app.can(org_id, 'perm')`, a STABLE SECURITY DEFINER function, used inside RLS policies and inside SECURITY
   DEFINER RPCs.
2. **Edge handlers:** `requirePermission(ctx, 'perm')`, which wraps the SQL function so there is one definition.
3. **UI:** from a bootstrap payload (`get_session_context()`), only to show or hide things. **The UI decides nothing.**

Sub-capabilities are permissions too, for example `website_intel.seo_scan` and `ai_visibility.run_baseline`. This
avoids a second "feature flag" system. Platform-level kill switches (provider down, module paused for everyone) are
separate: they live in `platform_flags`, read by the gateway and the job runner.

### 3.5 Dependencies (the initial graph)

```
core
 ├─ comms (foundation) ──┬─ whatsapp
 │                       └─ email_outreach
 ├─ prospecting
 ├─ territory ─────────── needs prospecting
 ├─ research (enrichment, socials, Companies House plug-in, directory presence)
 ├─ website_intel (crawl, site audit, technical SEO; sub-capability seo_scan)
 ├─ ai_visibility ─────── enhances website_intel, research
 ├─ ai_assist ─────────── enhances comms
 ├─ sales_team ────────── enhances ai_visibility / website_intel (pre-call research)
 ├─ payments (Stripe, payment ledger)
 ├─ agreements (versioned e-sign) ── enhances payments (sign-before-pay gate)
 ├─ commissions ───────── needs sales_team, payments
 ├─ delivery (customer projects, intake, missing info, stage) ── enhances payments, agreements
 ├─ website_builder ───── needs delivery; enhances website_intel, ai_visibility
 ├─ search_performance (Search Console)
 └─ tenant-findable ───── needs ai_visibility, payments, agreements, delivery, comms; enhances the rest
```

### 3.6 Migrations owned by modules

- **One migration stream**, `supabase/migrations/`, applied by the Supabase CLI with a clean history from day one.
  `db push` in CI. No hand-applied SQL. No DB-only objects (R§5.3).
- A module's SQL lives in `packages/modules/<key>/db/*.sql` and is **copied into the stream by a generator script**
  with a module-prefixed name, `<timestamp>_<module>__<name>.sql`. CI fails if the stream and the module sources
  disagree.
- **All tables exist for all orgs.** A disabled module means unused rows, not missing tables. This keeps one schema to
  reason about. Per-org DDL would make RLS and migrations untestable.
- Cron schedules, Vault-backed settings, grants and realtime publication membership **are written in migrations**. A
  CI check compares `cron.job`, grants and the publication against the repo after `db reset` in CI (the lesson of
  R§5.3).

### 3.7 Background jobs owned by modules

- Modules declare `JobKindDef` (kind, handler, max attempts, timeout, concurrency per org, priority class).
- **One runner** claims jobs **fairly across orgs** (§16.4). Each handler receives a `JobContext` built from the
  claimed row: `orgId`, `initiatedBy`, `jobId`, `module` and the metering context.
- Schedules declared by a module (for example "weekly visibility check") are expanded by a platform scheduler into
  jobs **per org that has the module enabled**. There is never a single global run over "the book" (R§5.2 point 7).

### 3.8 UI routing and navigation

- One SPA. Each module exports lazy routes and nav entries. The shell builds the navigation from the bootstrap
  context: `enabled modules ∩ permissions`.
- The URL carries the org: `/o/:orgSlug/...`. Switching org is a navigation, never hidden state. Deep links survive.
- A route whose module is disabled renders a "not available on your plan" page. **The server refuses anyway.**

### 3.9 API boundaries between modules

1. **Core never imports a module.**
2. **A module may read core tables directly** (RLS still applies) and **write core tables only through core service
   functions**, for example `createActivity`, `moveLeadStage`, `createTask` or `markDealWon`. That keeps invariants,
   such as one open Next Action per lead, in one place.
3. **Modules talk to each other by:**
   - **(a)** calling a declared dependency's exported service functions; or
   - **(b)** **domain events.** Core and modules append to `domain_events`, for example `deal.won`,
     `payment.succeeded`, `message.inbound_received` or `visibility.baseline_frozen`. The runner fans each event out
     to subscribed handlers as jobs.
4. **Database triggers are used only for integrity:** org consistency, immutability, `updated_at`, and short-code
   assignment. **Never for workflow.** R§11 shows what workflow-by-trigger does: about 25 triggers on one table, and a
   payment that silently starts five things.

### 3.10 Billing and usage linkage

- Each module declares its meters. Every `usage_events` row carries `module`.
- A plan can include allowances per meter. The overage policy per meter is block, warn or bill.
- Module-level spend is visible to org admins (their own org only) and to platform staff (all orgs).

---

## 4. Multi-tenant data model

### 4.1 Scope vocabulary

| Scope | Meaning | RLS shape |
|---|---|---|
| **GLOBAL / PLATFORM** | Platform-owned. Readable by all signed-in users or by none. Written only by migrations or platform staff | Read: `true` or none. Write: service or platform staff only |
| **GLOBAL CACHE** | Provider responses for public data. Never exposed to tenants | No policies (service only) |
| **ORG** | Belongs to one org; `org_id NOT NULL` | `app.is_member(org_id)` plus a permission. A row-level narrowing (for example "assigned to me") where the permission requires it |
| **ORG-USER** | Belongs to one user inside one org (`org_id` + `user_id`) | The owner only, plus the org admin where stated |
| **USER** | Belongs to the person across orgs (`auth.users`, `profiles`) | Self. Co-members see a minimal public profile through a function |

### 4.2 Tenancy and identity

| Entity | Scope | Key fields / rules |
|---|---|---|
| `organisations` | GLOBAL (each row readable by its members) | `id`, `slug` (unique), `name`, `status` (active/suspended/closed), `country`, `timezone`, `locale`, `currency`, `plan_id`, `created_at` |
| `org_settings` | ORG (1:1) | typed core settings: branding (name, logo file, accent), owner/alert contacts, default send window, business hours, legal name, privacy contact. **Not** module settings |
| `profiles` | USER | display name, avatar, phone (optional). No role here |
| `memberships` | ORG | `(org_id, user_id)` unique; `role_key`; `status` (invited/active/suspended/removed); `title`; `daily_limits` override; `joined_at`. **The only link between a user and org data** |
| `membership_permission_overrides` | ORG | optional grant or deny of single permissions (used rarely; for example a salesperson allowed to export) |
| `invitations` | ORG | email, role, token hash, expires, accepted_at |
| `roles`, `permissions`, `role_permissions` | GLOBAL | seeded from code (core + module manifests). Not editable per org in V2 (ADR-7) |
| `platform_staff` | GLOBAL | `user_id`, `platform_role` (owner/support/billing). **Grants no org data access by itself** (§5.9) |
| `support_access_grants` | GLOBAL (staff + target org admins can read) | staff_user_id, org_id, scope (read/write), reason, approved_by (org admin or break-glass), starts, expires |
| `modules`, `plans`, `plan_modules` | GLOBAL | seeded from the registry |
| `org_modules` | ORG | §3.3 |

There is **no "book owner"**. Each org setting names a `default_owner_membership_id`, used where a record needs an
owner and no human initiated it (an inbound message from an unknown number, for example). This replaces
`is_book_owner` and the second resolver in `free-check-lead.ts` (R§4.3).

### 4.3 The CRM spine (core)

```
organisations
  └─ businesses ──< contacts
        │   └──< contact_points (phone/email/handle, normalised)
        ├──< leads (≤1 open per business)          ──> campaigns
        │        └──< tasks (≤1 open "next action" per lead)
        ├──< deals ──> pipeline stage (category won/lost/open)
        │        └──> customers (on win)
        ├──< activities (append-only, any subject)
        └──< notes, tags, files
```

| Entity | Scope | Purpose and key rules |
|---|---|---|
| `businesses` | ORG | **The real-world company record:** name, trade/category, address, town, country, `place_id`, website, primary phone, lifecycle (`prospect` / `customer` / `former_customer` / `disqualified`, **derived** from leads, deals and customers, stored only as a cache column refreshed by core functions). **Unique `(org_id, place_id)` and `(org_id, normalised_website_host)` where present.** Two orgs may hold the same business (ADR-9) |
| `contacts` | ORG | A person, or "the business line", at a business. `business_id` nullable (a contact can exist before it is linked) |
| `contact_points` | ORG | `(org_id, kind, normalised_value)` unique. kind = phone/email/whatsapp/handle; line type (mobile/landline from `lineType.ts`); verified/invalid flags. **This is the inbound matching key**: one phone key function, ported from legacy, ONE definition used in SQL and TS (R§8.1 "four phone keys") |
| `leads` | ORG | **The sales pursuit of a business:** `stage_id`, `owner_membership_id`, `assigned_membership_id`, `source` (import/search/inbound/referral), `campaign_id`, `starred`, `lost_reason_key`, `opened_at`, `closed_at`. At most one **open** lead per business (partial unique index). Reopening creates a new lead, so the history survives. **No money, no delivery, no measurement pointers** |
| `pipeline_stages` | ORG | `key`, `label`, `order`, **`category`** ∈ {`new`, `attempting`, `engaged`, `meeting`, `proposal`, `won`, `lost`, `disqualified`}. Orgs edit labels and add stages. **Automation and metrics key on the category, never on the label** (ADR-10). Seeded per org from a template |
| `deals` | ORG | **An opportunity to sell something:** `business_id`, `lead_id`, `title`, `value_minor`, `currency`, `status` (open/won/lost), `won_at`, `seller_membership_id`, `product_key` (free text, or a reference to a module's offer), `expected_close`. One lead can produce several deals over time |
| `customers` | ORG | **An ongoing relationship:** `business_id` (unique per org), `status` (active/paused/ended), `since`, `ended_at`, `end_reason`, `account_manager_membership_id`. Created by core `markDealWon` when the first deal is won |
| `campaigns` | ORG | Container plus owner; unique `(org_id, lower(name))`; `channel_hint`; `status` (draft/active/archived). Launching is a module action (comms) |
| `tasks` | ORG | `subject_type/subject_id`, `assignee_membership_id`, `type` (call/meeting/follow_up/custom), `due_at`, `status`, `is_next_action`. **A partial unique index allows one open next action per lead.** This replaces the legacy `call_booked_at` mirror rules (memory: one-next-action) |
| `notes` | ORG | body, author, subject; editable, with edits logged as activities |
| `activities` | ORG, append-only | `subject_type/id`, `kind` (namespaced, from the registry), `actor_membership_id` or `actor_system`, `payload jsonb`, `occurred_at`. **The one timeline** (R§5.1: three logs today) |
| `domain_events` | ORG, append-only, internal | `type`, `payload`, `subject`, `created_at`, `dispatched_at`. Not user-readable |
| `tags`, `taggings` | ORG | lightweight labels |
| `files` | ORG | `bucket`, `path` (`org/<org_id>/<module>/…`), mime, size, sha256, uploaded_by, subject. Storage RLS reads this table (§5.7) |
| `notifications` | ORG-USER | recipient membership, kind (registry), payload, read_at |
| `user_preferences`, `saved_views` | ORG-USER | per-person UI configuration (R§2.2 `usePersistedState` stays local) |
| `suppressions` | ORG | `(org_id, channel or 'all', normalised_value)`; reason (opt_out/complaint/manual/legal/wrong_number); source message; created_by. §9.6 |
| `platform_suppressions` | GLOBAL (service only) | erasure requests, legal blocks, platform abuse; matched by hash; §9.6 |
| `audit_log` | ORG (platform rows have `org_id` null) | security and data-access events: login, role change, export, number reveal, support access, denials. Append-only |

**Sales state stays derived.** The legacy `salesStateOf` (R§3 F3, "derived, never stored, no downgrades") is ported.
The input becomes `leads.stage_id` plus conversation facts plus tasks. The output is the stage category. Automatic
moves (first reply → `engaged`) are done by **comms event handlers calling `moveLeadStage`**, with the "no downgrades"
rule applied once in core.

### 4.4 Fixing the overloaded lead (`outreach_leads`, R§5.1)

| Legacy concern on `outreach_leads` | V2 home | Scope |
|---|---|---|
| identity, contact, place, website, town, trade | `businesses`, `contacts`, `contact_points` | ORG |
| status, star, owner, assignment, campaign, next action, lost reason | `leads`, `tasks` | ORG |
| sold_by, amount, won | `deals` (+ `commissions` module) | ORG |
| "is a client", contract, termination | `customers` (+ `agreements` for terms) | ORG |
| Stripe ids, amount paid, refund, payment holds | `payments` module: `payment_accounts`, `payments`, `payment_ledger`, `subscriptions` | ORG |
| delivery stage, intake, handoff, missing info | `delivery` module: `projects`, `project_tasks`, `intake_requests` | ORG |
| website build JSON | `website_builder`: `site_projects`, `site_revisions` | ORG |
| baseline / remeasure pointers | `ai_visibility`: `visibility_series` (immutable pointers, §12) | ORG |
| onboarding questionnaire, plan tier | `tenant-findable`: `findable_signups` (+ generic `agreements`) | ORG |

### 4.5 Module-owned entities (summary; detail in each module section)

| Module | Main entities (all ORG-scoped) |
|---|---|
| comms | `comm_identities`, `conversations`, `messages`, `message_templates`, `outbound_messages`, `conversation_reads` (ORG-USER) |
| whatsapp | `whatsapp_identity_details` (WABA, phone_number_id, quality, tier), `whatsapp_template_sync` |
| email_outreach | `email_mailboxes`, `email_sequences`, `email_sequence_steps`, `email_enrolments` |
| prospecting | `search_runs` (org), `search_results_seen` (org: found/added markers); global `places_cache` |
| territory | `territory_cells`, `niche_samples`; global `geo_places` (uk_towns generalised) |
| research | `business_social_profiles`, `business_registry_matches`, `directory_presence_runs/results`; global caches |
| website_intel | `websites`, `crawl_jobs`, `crawl_pages`, `site_findings`, `seo_scans` |
| ai_visibility | `visibility_question_sets`, `visibility_audits`, `visibility_answers`, `visibility_citations`, `visibility_competitors`, `visibility_series`, `visibility_comparisons` |
| sales_team | `sales_targets`, `team_posts` (+ recipients/events), `prechecks` (allowance batches), `attribution_reviews` |
| commissions | `commission_plans` (versioned), `commission_entries` (immutable, stamped), `commission_payouts`, `engagement_events` (append-only) |
| payments | `payment_accounts` (link to the org's Stripe connection), `products/prices` mirror, `checkouts`, `payments`, `payment_ledger` (append-only), `subscriptions`, `payment_holds` |
| agreements | `agreement_templates`, `agreement_versions` (immutable text + hash), `agreement_links`, `agreement_acceptances` (immutable) |
| delivery | `projects` (customer, type, stage, owner), `project_events`, `intake_requests`, `info_requests` |
| website_builder | `site_projects`, `site_revisions`, `site_deployments`, `site_domains`, `site_templates` (GLOBAL platform templates + ORG private) |
| search_performance | `search_console_connections`, `search_performance_daily` |
| tenant-findable | `findable_signups`, `findable_guarantee_claims`, report/welcome/results template config |

### 4.6 Global data

| Global entity | Why global | Exposure |
|---|---|---|
| `roles`, `permissions`, `role_permissions`, `modules`, `plans` | platform catalogue | read by all signed-in users |
| `providers`, `price_book` | platform catalogue; unit prices cite a billed row (CLAUDE.md "a rate is a guess until a billed row agrees") | staff only |
| `geo_places` (towns, regions, countries) | reference data | read by all |
| `places_cache`, `geocode_cache`, `place_details_cache`, `registry_cache` (Companies House), `agency_check_cache` | provider responses about **public** businesses; sharing saves money and reveals nothing if never exposed (ADR-11) | **no policies**, service only. A cache hit is metered at cost 0 actual, with the list price recorded as `est_cost` for billing |
| `platform_flags` (kill switches), `platform_limits` | platform control | staff, the gateway and the runner |
| `platform_suppressions` | legal/erasure | service only |
| `short_codes` namespace (public report and document links) | public URLs need one namespace | resolved by a public function that returns only the document the code points to |

**Not global, despite being global in legacy:** search history (found/added), campaign names, place-id uniqueness,
suppression, protection settings, the outreach state and the send cap (R§5.2).

---

## 5. Security and tenant isolation

### 5.1 Threat model, in one paragraph

**What matters most:** a member of org A reading or writing org B's data. **What comes next:** a background job or
webhook acting for the wrong org, a leaked internal secret acting as anyone, a disabled user still acting, and a
platform admin silently reading tenant data. The legacy system has every one of these exposures in some form (R§7.1
S1–S6), and is safe today only because there is one tenant.

### 5.2 The layers

| Layer | Mechanism | Prevents |
|---|---|---|
| **1. Grants** | `REVOKE ALL ON ALL TABLES FROM anon, authenticated`. Default privileges are revoked too. `authenticated` is granted per table, explicitly, in the table's migration. **`anon` gets nothing on any table.** Public endpoints are edge functions | R§7.1 S1: anon DML on 79 tables |
| **2. RLS** | RLS on every table, forced (`FORCE ROW LEVEL SECURITY` on tenant tables). The policy pattern is in §5.3. **No permissive `USING (true)` on tenant data** | R§7.1 S3/S4 |
| **3. Composite FKs** | Every org-scoped table has `UNIQUE (org_id, id)`. Every reference to another org-scoped row is `FOREIGN KEY (org_id, x_id) REFERENCES x (org_id, id)` | A bug or forged id linking org A's message to org B's conversation. **This is structural, so it works even under the service role** |
| **4. Server context** | Handlers build `RequestContext {userId, orgId, membership, permissions}` from the JWT plus `x-org-id` **checked against `memberships`**. Job and webhook handlers build `JobContext` from the claimed row. **`org_id`, `user_id` or `acting_user_id` in a request body is never trusted** | R§7.1 S6 (`body.user_id`, `acting_user_id`) |
| **5. Least-privileged clients** | **User-initiated handlers use a user-scoped Supabase client** (the user's JWT), so RLS applies to them too. **The service client is importable only from `server/jobs/**`, `server/webhooks/**` and `core/privileged/**`** (enforced by the module-graph check). Privileged writes go through SECURITY DEFINER functions that take `p_org_id` and re-check | R§2.3: every legacy function uses the service role |
| **6. Audit and alerting** | denials, exports, support access and role changes → `audit_log`; threshold alerts per org and platform-wide | detection |
| **7. Schema lint in CI** | catalogue queries after `db reset`: every public table has RLS on; every table has `org_id` or is in the GLOBAL allowlist; every org FK is composite; every SECURITY DEFINER function sets `search_path` and is on an allowlist; no grant to `anon`; the realtime publication matches the allowlist | regressions |
| **8. Cross-tenant test suite** | two seeded orgs, a user per role in each; for every table and every RPC/edge endpoint, assert that org-A credentials cannot read, write, reference or enumerate org-B rows (generated from the catalogue so new tables are covered automatically) | regressions |

### 5.3 RLS pattern

```sql
-- helper: STABLE, SECURITY DEFINER, search_path pinned; reads memberships once per statement
create function app.member_orgs() returns uuid[] ...;          -- active memberships of auth.uid()
create function app.can(p_org uuid, p_perm text) returns bool ...;  -- role ∪ overrides, ∧ module enabled, ∧ member active

-- typical table
alter table leads enable row level security; alter table leads force row level security;
create policy leads_select on leads for select to authenticated using (
  org_id = any(app.member_orgs())
  and ( app.can(org_id,'leads.read_all')
        or (app.can(org_id,'leads.read_assigned') and assigned_membership_id = app.my_membership(org_id)) )
);
create policy leads_write on leads for update to authenticated using (...same...) with check (org_id = any(app.member_orgs()) and app.can(org_id,'leads.write'));
```

Rules:
- **Policies are restrictive by construction.** There is one SELECT policy and one write policy per table, so nothing
  is OR-ed in by accident. Legacy additive policies are the anti-pattern (R§7.1 S3).
- **Sensitive columns** (money, provider ids) **live in module tables with their own permission, not in columns that
  are masked by a view.** The lead split (§4.4) makes this possible.
- **A suspended member gets nothing** the moment `memberships.status` changes. `app.member_orgs()` checks status on
  every statement, so there is no wait for JWT expiry (R§7.2 G3 "disabled account until token expires").

### 5.4 How privileged server code knows its org

| Caller | Org comes from | Never from |
|---|---|---|
| A user, through the SPA | `x-org-id` header **verified against an active membership** for `auth.uid()`; the URL slug resolves to the same id | the body |
| A scheduled job | the `jobs` row it claimed (`org_id`, `initiated_by`), written when the schedule was expanded per org | an env var, the "book owner" |
| A domain-event handler | the `domain_events` row | — |
| A webhook (Meta) | the **receiving identity**: `phone_number_id` → `comm_identities` → `org_id` | the sender's number, payload metadata |
| A webhook (Stripe) | the **connection** whose secret verified the signature (`/webhooks/stripe/:connectionId`) → `org_id`. `metadata.lead_id` is then **checked to belong to that org** | metadata alone |
| A webhook (Resend, platform) | the provider message id → the `messages`/`outbound_messages` row → `org_id` | — |
| A public link (report, agreement, sign-up) | the token → the row → `org_id`. Tokens are random (128-bit) or signed; short codes resolve only to their own document | a guessable id (R§7.2 G7) |

**Internal calls.** The cron invoker calls `job-runner` with a **runner secret that can do exactly one thing: drain
the queue.** It carries no user, no org and no payload authority. There is no endpoint that accepts "do X as user Y"
from a secret (fixes R§7.1 S6). Function-to-function calls become jobs or direct imports, not HTTP calls with a master
key.

### 5.5 Background jobs and the service role

- The runner uses the service client, because it must claim across orgs. **Each handler receives a
  `ScopedDb(orgId)`.** That wrapper exposes typed repository functions which always apply `org_id = $orgId` on reads
  and set it on writes, plus the composite FKs as a backstop. Raw `.from()` on the service client is lint-forbidden
  outside `core/privileged`.
- **Metering and the guard run for jobs too**, charged to the job's org and `initiated_by` (§8).

### 5.6 Realtime

- Publication allowlist: `messages`, `conversations`, `notifications`, `leads` (light columns only, through a
  dedicated `lead_changes` table if needed).
- Postgres-changes subscriptions are filtered by RLS. The client also subscribes with an `org_id=eq.<id>` filter, for
  efficiency only.
- Broadcast/presence channels, if used, are named `org:<org_id>:…` and authorised by a `realtime.messages` policy that
  checks `app.member_orgs()`.

### 5.7 Storage

- Buckets are private: `org-files` (general), `org-media` (messages), `org-sites` (builder assets). Public buckets
  exist only for genuinely public assets (`public-site-assets`, under `org/<org_id>/…`).
- Every object path starts with `org/<org_id>/`. The storage policy checks
  `(storage.foldername(name))[2]::uuid = any(app.member_orgs())` **plus** the module permission.
- Customer-facing downloads use short-lived signed URLs issued by an edge function after a permission check.

### 5.8 Webhooks

Every webhook does the same five things:
1. Verify the signature, **failing closed** (the legacy `metaWebhookGate.ts` pattern, R§7.3).
2. Insert into `webhook_events (provider, provider_event_id unique, org_id, connection_id, payload, received_at)`. A
   duplicate is acknowledged and dropped.
3. Resolve the org by the rules in §5.4.
4. Enqueue a job.
5. Answer 200 fast.

Unresolvable events are stored with `org_id null` and flagged. They are never guessed onto an org.

### 5.9 Platform administration and support access

- **Platform roles live in `platform_staff`, not in memberships.** A platform role gives access to the **platform
  console**: orgs, plans, entitlements, limits, provider health, usage across orgs (aggregates and cost), job and
  webhook queues (metadata, not payloads), and audit.
- **A platform role does not give access to tenant business data** (leads, messages, documents). Platform staff
  appear in no `member_orgs()`.
- **Support access** is a `support_access_grants` row:
  - approved by an org owner or admin, or self-approved by the platform owner as **break-glass** with a mandatory
    reason;
  - time-boxed (default 2 h);
  - scoped `read` or `write`;
  - while active, `app.member_orgs()` includes that org for that staff user with a `support_read` / `support_write`
    pseudo-role;
  - every grant, and every request made under it, is written to `audit_log` and **visible to the org's admins**.
- **No "log in as user" impersonation in V2.** Support sees the org through its own identity under a grant. Actions
  are attributed to the staff member, not to the tenant user. This avoids the failure mode where internal credentials
  act as arbitrary users.
- **Paul as Findable's operator:** Paul has a normal `owner` membership in the Findable org, and **separately** a
  `platform_owner` row. Day to day, Findable work is done through the membership. **The two are never conflated.**

### 5.10 Edge function hygiene (cross-cutting)

- One CORS module with an origin allowlist per environment. Not `*` (R§7.2 G11).
- One `safeFetch` for every outbound fetch of a user- or tenant-supplied URL. SSRF protection (R§7.2 G6) is
  lint-enforced: no raw `fetch(` on non-provider URLs.
- **Never put keys in query strings** (R§7.2 G9). The gateway rejects URL-embedded secrets in tests.
- Every function is declared in `config.toml` with `verify_jwt` set explicitly. Deploys are by CI from git only, so a
  function without source is impossible (R§7.2 G2).

---

## 6. Roles and permissions

### 6.1 Platform roles vs organisation roles

| | Platform roles | Organisation roles |
|---|---|---|
| Stored in | `platform_staff` | `memberships.role_key` |
| Grants | the platform console; support grants on request | access to one org's data, by permission |
| Values | `platform_owner`, `platform_support`, `platform_billing` | `owner`, `admin`, `manager`, `sales`, `delivery`, `viewer` |
| Defined | code | code (fixed set); permissions per role from core + module manifests |

### 6.2 Organisation roles (default grants)

| Role | Intent | Highlights |
|---|---|---|
| **owner** | the business owner. At least one per org; cannot be removed by an admin | everything in the org, including billing, integrations, deleting the org, and approving support access |
| **admin** | runs the system | everything except deleting the org, transferring ownership and changing billing |
| **manager** | runs a team | read all leads/deals; assign; see team performance; no integrations or settings |
| **sales** | works assigned leads | `leads.read_assigned`, `leads.write_assigned`, `comms.send` (on assigned), `tasks.*` (own), `deals.create`; **no export, no money totals beyond own commission** |
| **delivery** | serves customers | `customers.read`, `delivery.*`, `website_builder.*`, `ai_visibility.read`; no prospecting |
| **viewer** | read-only stakeholder | `*.read_all` for enabled modules; no contact-point reveal or export |

### 6.3 Permission naming and checks

- The format is `<module>.<resource>.<action>[_scope]`, for example `leads.read_assigned`, `comms.send`,
  `whatsapp.templates.manage`, `ai_visibility.run.baseline` or `integrations.manage`.
- **Roles decide nothing in code.** Code checks only permissions. `if role === 'admin'` is lint-forbidden. This avoids
  the legacy failure where `admin` was a global superuser (R§7.1 S2).
- **Record narrowing** (assigned to me / my team) is a permission scope (`_assigned`, `_team`), evaluated in RLS.
- **Sensitive actions** are separate permissions so a role can be narrowed: `contacts.reveal` (number copy, legacy
  `log_data_access`), `data.export`, `members.manage`, `integrations.manage` and `billing.manage`.
- **Custom roles per org are deferred** (ADR-7). `membership_permission_overrides` covers the exceptions.

---

## 7. External integrations

### 7.1 Shape

```
business code ──> providers/<p>.<op>(ctx, args)          (typed, thin)
                    └─> gateway.meteredCall(ctx, meter, estUnits, fn)
                          1. platform_flags kill switch?            → refuse(provider_paused)
                          2. guard_spend(org,user,module,op,est)    → allow / warn / refuse   (§8)
                          3. resolveCredential(org, provider)       → org connection | platform env
                          4. rate limit (DB token bucket per connection) + circuit breaker per connection
                          5. call; classify result (ok / transient / permanent / quota / auth)
                          6. usage_events row (units, est cost, actual if reported, cache_hit, credential_mode)
                          7. on auth error → connection.status = needs_reauth, notify org admins
```

- `CallContext = {orgId, userId|null, module, operation, jobId|null, requestId, priority}`. There is no default for
  `orgId`. **A call without an org context does not compile.**
- A CI grep fails on `Deno.env.get('<PROVIDER_KEY>')` outside `packages/providers/` (R§6.4 point 6).

### 7.2 Records

| Entity | Scope | Fields |
|---|---|---|
| `providers` | GLOBAL (from code) | key, kind (llm / answer_engine / crawl / places / registry / messaging / email / payments / hosting / analytics), modes allowed (`platform`, `org`), secret field names, webhook style |
| `integration_connections` | ORG (or platform when `org_id` is null) | provider, mode, status (`pending` / `active` / `needs_reauth` / `revoked` / `error`), display label, non-secret config (WABA id, phone_number_id, Stripe account id, domain), `secret_id` (Vault), `webhook_secret_id`, `last_verified_at`, `last_error`, created_by |
| `connection_health_checks` | ORG | periodic verify results |

**Secrets** are stored in **Supabase Vault**. Only `app.connection_secret(connection_id)` can read them. It is
SECURITY DEFINER, granted to `service_role` only, and every read is logged with the job or request id. Secrets never
go to the browser. After entry, the UI shows the last 4 characters only. **Rotation** writes a new Vault secret and
moves the pointer. **Revocation** deletes the secret and sets the status to `revoked`. **Platform-managed keys** (our
Apify, OpenAI and Google) stay as edge environment secrets, read only inside `packages/providers`.

### 7.3 Per-provider model (ADR-12)

| Provider | Default mode | BYOK? | Abstraction | Notes |
|---|---|---|---|---|
| **OpenAI** (LLM) | platform | later, optional (large tenants) | **yes, a thin `llm.complete(model, …)`** with a model registry and a price book. A second provider (Anthropic) is plausible | the model is chosen by the server, never by the client (R§7.2 G3 `extract-competitors`) |
| **Apify** (answer engines, SEO actor, scrapers) | platform | no in V2 | **yes, an `answerEngine.ask(engine, question, locale)` interface**. The method of getting ChatGPT/Gemini answers may change (direct APIs). Scrapers stay concrete | **The biggest shared-fate risk** (§8.6) |
| **Google Places / Geocoding** | platform | no | none (single provider) | global caches |
| **Companies House** | platform | no | a `companyRegistry` interface per country (UK now; AU later per R§4.3) | rate limit shared: token bucket |
| **Meta WhatsApp** | **org-owned identity** | inherent | a `channel` adapter (comms) | §9.3: the org's own WABA and number. Connection mode A: the org's own Meta app (MVP). Mode B: our Tech Provider app with Embedded Signup (later) |
| **Email: transactional** (Resend) | platform account, **org-verified sending domain** | no | an `emailSender` interface | notifications, agreements, reports. Resend does not permit cold outreach, so it is **never used for prospecting** |
| **Email: outreach** | **org-owned mailbox** (Google Workspace / Microsoft 365 OAuth, or SMTP) | inherent | a `mailbox` adapter | §9.4 |
| **Stripe: tenant payments** | **org-owned account** | inherent | none (Stripe only) | MVP: the org's restricted key + per-connection webhook. Later: Stripe Connect (Standard) (ADR-13). **Findable keeps its existing Stripe account as its connection**, so its live subscriptions do not move |
| **Stripe: platform billing** (charging orgs for LeadFinderOS) | platform account | — | none | Can wait (§20) |
| **Cloudflare** (Browser Rendering; Pages for the builder) | platform | later, for agencies wanting their own account | none | metered by browser-seconds and deploys |
| **Google Search Console** | org connection (OAuth per customer property) or the platform service account granted per property | — | none | token refresh job |

### 7.4 Token refresh, errors and rate limits

- OAuth connections (Google, Microsoft) store refresh tokens. A `connections.refresh` job runs ahead of expiry. A
  failure flips the status to `needs_reauth` and notifies the org admins.
- **Error classes** are normalised by the gateway: `transient` (retry with backoff and jitter, at most N),
  `rate_limited` (back off; the bucket is drained), `quota_exhausted` (provider account limit; trip the breaker for
  that connection; alert), `auth` (needs_reauth), `permanent` (no retry). The legacy `classifyFailure` for WhatsApp is
  reused (R§9).
- **Rate limits** are Postgres token buckets per `(connection, bucket_key)`, not in-memory (R§7.2 G10).
- **Circuit breaker:** per connection, with state in `provider_circuit (connection_id, state, opened_at, failures)`.
  When open, calls fail fast with `provider_unavailable`. A half-open probe runs every N minutes.

---

## 8. Cost and usage metering

### 8.1 The event

```
usage_events (append-only, ORG)
  id, org_id, membership_id null, initiated_by_system bool,
  module, provider, operation, meter_key,
  units numeric, unit_type ('question_run','token_in','token_out','page','request','message','browser_second', …),
  est_cost_micros bigint, actual_cost_micros bigint null, cost_source ('estimate'|'provider_reported'|'reconciled'),
  price_book_id, cache_hit bool, credential_mode ('platform'|'org'),
  job_id null, request_id, subject_type null, subject_id null,
  outcome ('ok'|'error'|'refused'), occurred_at
```

- **Every** gateway call writes one row, including refusals (`outcome='refused'`, cost 0) and errors (cost charged if
  the provider bills failures).
- **BYOK calls are metered too** (cost borne by the org, `credential_mode='org'`), so usage is visible and quotas can
  still apply.
- `price_book (provider, operation, unit_type, unit_price_micros, effective_from, source_note)` is GLOBAL. Estimates
  come from it, and the monthly reconciliation job writes `actual_cost_micros` where the provider reports cost (Apify
  run cost, OpenAI usage) or apportions the billed total.
- Rollups: `usage_daily (org_id, module, provider, operation, day, units, est_cost, actual_cost)`, maintained by the
  job runner. **No admin total from a 1,000-row page** (R§6.4 point 3).
- Unmetered providers in legacy (Meta, Cloudflare, Resend, Companies House, R§6.4) **are metered in V2 from day
  one**, even where unit cost is 0, because units matter for quotas and abuse.

### 8.2 Attribution

| Situation | `org_id` | `membership_id` | `initiated_by_system` |
|---|---|---|---|
| A user clicks "run check" | the user's org | the user | false |
| A job created by a user's action (bulk audit) | the job's org | `jobs.initiated_by` | false |
| A schedule (weekly check, replay at 4 weeks) | the schedule's org | the membership that enabled it (owner if unknown) | **true** |
| Inbound-triggered automation (first-reply audit) | the identity's org | null | true |
| Platform maintenance (cache warm, health check) | `null` (platform) | null | true |

There is **never** a fallback to "the book owner" (R§6.4 point 2).

### 8.3 The guard (reuse `guard_action`, made per org)

`app.guard_spend(org, membership, module, operation, est_cost_micros, priority) → allow | warn | refuse(reason)` is
one atomic SQL function. It:
1. checks the platform kill switch and `platform_limits` (the per-provider platform ceiling);
2. checks org status (suspended → refuse);
3. checks org limits (`org_limits`): per meter, module, provider or total; day or month; soft and hard;
4. checks the member's limits inside the org (legacy per-person caps, now an org setting);
5. checks burst limits per (org, operation);
6. **reserves** the estimate in a reservation row (`spend_reservations`), so concurrent calls cannot overshoot. The
   gateway settles it to actual afterwards.

Pause modes (`running` / `prospecting_paused` / `all_stop`, R§6.3) become **per-org and platform-wide** flags. Budget
pools by purpose (legacy guarantee/client/prospecting) become **priority classes** on meters: `committed` (work owed
to a paying customer), `client`, `prospecting`. When a platform provider account nears its cap, lower classes are
refused first (the legacy Apify reserve 100/95/85 %, generalised).

### 8.4 Quotas, allowances, caps

- `org_limits (org_id, scope_type: total|module|provider|meter, scope_key, period: day|month, soft_micros|soft_units,
  hard_micros|hard_units, on_hard: refuse|require_approval)`.
- Plan allowances (`plan_modules.allowances`) seed `org_limits` and can be overridden per org.
- **Soft** crossing → a notification to org admins (once per period per scope) and a platform alert above a threshold.
- **Hard** crossing → refuse with a clear reason the UI can show ("Monthly AI visibility allowance reached").
- Monthly allowances reset on the org's billing anchor day (stored on the org).
- **Future billing:** a monthly statement job folds `usage_daily` against the plan into `usage_statements` (org,
  period, lines). Whether to charge overage is a commercial decision (§20, ADR-14).

### 8.5 Admin visibility

- **Org admins:** usage by module, provider and person; limits; trend for this month vs last.
- **Platform staff:** cost by org and provider; margin against the plan price (once billing exists); top spenders;
  spike alerts (§19).

### 8.6 Provider failure isolation (the Apify problem)

One shared Apify account means one tenant can exhaust everyone's capacity (R§6.4 point 1). V2 mitigates this, but does
not fully solve it:
1. **Per-org monthly allowances** sum below the platform account cap, with headroom.
2. **Priority classes:** paying-customer measurement outranks prospecting platform-wide.
3. **Fair claiming** in the job runner (§16.4), so one org's bulk run cannot starve others.
4. A platform circuit breaker plus an alert at 70/85/95 % of the account cap (the snapshot reused from
   `apify_account_usage`).
5. **The option to move a premium tenant to its own Apify connection** (org mode) later. The gateway already supports
   it, even though V2 does not offer it on day one.

---

## 9. Outreach and communications

### 9.1 The model (module `comms`)

| Entity | Purpose |
|---|---|
| `comm_identities` | A sender identity of an org: `channel` (whatsapp / email / sms later), `connection_id`, `address` (E.164 or email), `display_name`, provider ids, `status`, `daily_cap`, **send window (tz, start, end)**, `is_default`. Replaces the singleton `whatsapp_outreach_state` (R§5.2) |
| `conversations` | `(org_id, comm_identity_id, external_address)` unique. Holds contact_id, business_id, lead_id (current link, changeable), assigned_membership_id, status, `last_inbound_at` (for the 24 h window), `last_message_at`, unread state. **Keyed by identity + address, not by phone alone** (R§5.1) |
| `messages` | conversation_id, direction, kind (template / text / media / voice / system), `template_id` + **body snapshot** (legacy 442c283c pattern), `file_id`, `provider_message_id` (unique per provider), status timeline, error class, `sent_by_membership_id` (null = system), `outbound_id` |
| `message_templates` | ORG: `comm_identity_id` (WhatsApp templates belong to a WABA), name, language, category, body, **variables schema** (typed sources: `business.name`, `lead.town`, `audit.rival_count` …), provider status (synced), version. **Replaces the 11-place registry** (R§8.1) |
| `outbound_messages` | The queue and ledger: identity, contact_point, template + resolved variables, campaign_id, lead_id, `scheduled_for`, `status`, attempts, `idempotency_key` unique, **`policy_verdict`** (which checks passed), `requested_by` |
| `conversation_reads` | ORG-USER read markers |

### 9.2 The outbound pipeline (one path for every channel)

```
request (Inbox send / campaign launch / automation)
  → policy checks (pure functions, ported):
      suppression (org ∪ platform) · contact history (cold vs continuation, coldOutreach.ts)
      · destination rules per identity country (ukColdDestination.ts generalised)
      · template variable safety (templateVars.ts — block on unsafe) · module entitlement · permission
      · per-identity daily cap · per-member limit
  → outbound_messages row (idempotency key = campaign/lead/template or client UUID)
  → send window gate (per identity tz) — queue only; replies inside a provider service window go now
  → job: channel adapter send → provider id → messages row → activity + domain event
  → status webhooks update messages; failures classified; transient retried with backoff
```

- The legacy rule "**the queue cannot send a second message to a lead**" (R§12) becomes the database constraint
  `unique (org_id, campaign_id, contact_point_id)` on cold outbound rows, plus the cold/continuation classifier.
- `mode: dry_run` (legacy) is kept. It runs the same path and stops before the provider call. That makes it the
  standard pre-flight for a new identity or template.

### 9.3 WhatsApp

- **Org-owned identity.** Each org connects its own WABA and number. Findable's number is Findable's; Ethan's is his.
  No tenant ever sends from another tenant's number (decision 4).
- **Connection modes:**
  - **Mode A, org-owned Meta app (MVP):** the org's Business Manager owns the app, system user and token; we store the
    token and app secret per connection. The webhook URL is `/webhooks/meta/:connectionId`, verified with **that
    connection's app secret**. There is no Meta review dependency on us. Setup is manual, done by platform support with
    a checklist.
  - **Mode B, platform Tech Provider app + Embedded Signup (later):** one app and one webhook. Routing is by
    `phone_number_id` → identity. This needs Meta Tech Provider approval (ADR-15).
  - Both modes route inbound by **the receiving `phone_number_id`**, which legacy never reads (R§2.6).
- **Templates** are created and synced per WABA through the API. Their status is stored per template. Senders read the
  table, never a constant.
- **Quality rating and messaging tier** are synced per identity. A drop in quality alerts org admins and can auto-pause
  cold sends on that identity.
- **Media:** inbound media is downloaded to `org-media/org/<org_id>/conversations/<id>/…`. The voice-note remux
  (`oggOpus.ts`) is reused.

### 9.4 Email

- **Transactional** (notifications, agreements, reports, results) goes through the platform Resend account, from the
  org's verified domain (`comm_identities` channel `email`, kind `transactional`, DKIM verified through the Resend
  domains API). If the org has no verified domain, the fallback sender is `<org-slug>@mail.<platform-domain>` with the
  org's display name and `reply-to` set to the org.
- **Outreach email** (module `email_outreach`): **the org's own mailbox**, connected by OAuth (Gmail API / Microsoft
  Graph) or SMTP/IMAP. It covers:
  - sequences (steps, delays, stop-on-reply);
  - per-mailbox daily caps and warm-up limits;
  - reply detection by polling or push from the mailbox, so replies land in `conversations`;
  - **unsubscribe link plus `List-Unsubscribe` header, mandatory**.

  Not on platform Resend (provider rules and deliverability). This is new work: legacy has no email outreach (R§3).

### 9.5 Inbound routing

1. webhook → identity → org (§5.4);
2. match `contact_points` in **that org only**, with the legacy `chooseInboundLead` "refuse rather than guess" logic;
3. upsert the conversation (identity, address);
4. insert the message (idempotent on provider id);
5. opt-out detection (phrases plus button payloads) → org suppression (and an `opt_out` activity);
6. a domain event `message.inbound_received` → lead stage automation (category `engaged`), notifications to the
   assignee, and optional triage (`ai_assist`).

An unknown sender gets a new contact with `business_id null` and the conversation assigned to the org's default owner.

### 9.6 Suppression: org, platform, or both

| Option | Pro | Con |
|---|---|---|
| **Org only** | Correct in law: each org is a separate data controller, and an opt-out from Findable is not an opt-out from Ethan's business. Leaks nothing between tenants | A person who opts out of tenant A can still be contacted by tenant B. That is legal, but it can look like "the platform" spamming them |
| **Platform only** | The strongest protection for recipients and for the platform's reputation | Wrong in law and commercially: one org's opt-out silently blocks another org's lawful relationship; it reveals cross-tenant signals; tenants cannot reason about their own list |
| **Both (recommended)** | The org list carries normal opt-outs. The platform list carries only what is genuinely about the person, not the relationship: **erasure requests made to the platform, legal or regulator instructions, complaints about the platform, abuse traps**. Checked by hash. A tenant sees "blocked by platform policy" and no reason | Needs a small staff process for adding to the platform list |

**Recommendation: both, with a narrow platform list** (ADR-16).
- The org list is mandatory for every channel.
- A STOP reply suppresses **the channel and the org**, not every channel. Org admins can set it to "all channels".
- **Wrong-number and not-a-business stay org-level:** a fact about a number, but not one the person asked to share.

### 9.7 Calling and SMS

- **Calling:** out of scope as a channel. Calls are logged as activities and tasks, as legacy does (no `tel:` links,
  per memory).
- **SMS:** not built. The `comm_identities.channel` enum leaves room, and legacy SMS is retired (R§3 F30).

---

## 10. Sales Team module

### 10.1 Core vs module

| In core | In `sales_team` | In `commissions` |
|---|---|---|
| memberships and roles (`sales`, `manager`) | the salesperson workspace (focused lead list, call screen, "what to do now") | `commission_plans` as **versioned data** (tiers, trailing count, period, basis, timezone, holiday calendar) |
| lead assignment and owner | the manager view: team pipeline, assignment tools, bulk reassignment | `commission_entries`: **stamped once, immutable, plan version recorded**; refunds write reversal entries |
| tasks / next actions | targets (per member, per period, by stage category or deal value) | earned vs projected (projected = open deals × probability by stage category; earned = paid ledger entries) |
| activity log | performance metrics (activity counts, conversion by stage category, response time) from **one fold module** | expected payment dates (from the plan's payout rules and a holiday calendar from `geo` data, not a literal list to 2027, R§4.3) |
| deals (seller field) | leaderboards (opt-in per org, off by default) | payouts (`commission_payouts`) and statements |
| | pre-call research ("check before calling"): uses whichever of `website_intel` / `ai_visibility` / `research` is enabled, with a per-member daily allowance | engagement windows (`engagement_events`, append-only) — the legacy "seller engaged at time of payment" rule, generalised as a plan option |
| | team board (posts, acknowledgements) | attribution review (held sales, evidence, override with reason) |
| | salesperson onboarding records (country plug-in fields) | |

### 10.2 Commission: one source of truth

- The legacy rates live in TS **and** SQL (`monthly_tier_rate()`), with a test pinning the two together (R§4.3). In V2:
  - **the TypeScript engine computes**;
  - **SQL stores**: the plan rules as jsonb, each entry with `plan_version` and `inputs`;
  - stamping is a **job triggered by `payment.succeeded`**, not a trigger.
- Re-stamping is impossible: `unique (payment_ledger_id, membership_id, entry_kind)`.
- Immutability is enforced by a trigger that refuses UPDATE and DELETE (an integrity trigger, which is allowed).

---

## 11. Website Intelligence (one module, layered capabilities)

**Decision: one module, `website_intel`, with SEO scanning as a sub-capability** (`website_intel.seo_scan`, separately
metered). The crawler is the foundation of every website check. The third-party SEO actor is a thin, paid wrapper
(R§9), so a separate module would duplicate the website, page and finding model (ADR-17).

| Layer | What it is | Source |
|---|---|---|
| `websites` | ORG: business_id, root URL, canonical host, platform detected (WordPress/Wix…), agency detected | `agencyDetect.ts` |
| `crawl_jobs` / `crawl_pages` | bounded crawl (prospect: cap + 7-day reuse; customer: exhaustive with cap); per page: status, canonical, robots/meta-robots, title, description, headings, word count, content hash, internal links, **structured data blocks (parsed JSON-LD types and fields)** | `crawlCheck.ts`, `crawlUrl.ts`, `fullCrawl.ts`, `crawl-job.ts`, `safe-fetch.ts` |
| `site_findings` | `rule_key`, severity, affected pages, evidence, first_seen / last_seen; **rules are deterministic and versioned** | `siteAudit.ts`, `siteFindings.ts`, `siteEvidence.ts` |
| Technical SEO checks | indexability, canonical conflicts, duplicate/thin content, broken internal links, redirect chains, sitemap/robots, structured-data validity, NAP consistency against the CRM record | ported + extended |
| AI crawler access | robots rules for named AI crawlers, fetchability as those agents — **facts about access, not a score** | `crawlCheck.ts` |
| `seo_scans` (sub-capability) | the Apify actor result, normalised into `site_findings` with `source='seo_actor'` | `run-seo-scan` |

- **No invented metrics:** no "AI ranking score" and no "visibility index" from the crawler. AI visibility evidence
  comes **only** from `ai_visibility` measurements, which are actual answers.
- The crawler's User-Agent is a **platform identity**, `LeadFinderOS-SiteCheck/1.0 (+https://<platform-domain>/bot)`,
  not findable.live (R§4.3).

---

## 12. AI Visibility module

### 12.1 Generic engine vs methodology

| Generic engine (`ai_visibility`) | Methodology / product rules (per org config, or `tenant-findable`) |
|---|---|
| Question sets: generate (LLM, prompt per org template), seed guard (research intent), dedupe, **freeze** | **Which purposes exist** and their shapes: Findable's Hook 3×1, Free check 3×3, Discovery, Baseline 20×3 frozen, Full measure, Replay at 4 weeks verbatim |
| Answer collection: `answerEngine.ask(engine, question, locale)` × runs; engines configurable (ChatGPT, Gemini…) | **Which engines count** for a claim (`SCORED_ENGINES`) |
| Per-answer analysis: named verdict (`namedSignal`, model verdict with string-match fallback, one ruler per comparison), `nameIsJudgeable`, competitor extraction + cleaning, citation extraction + source classification | Home-town-only judging; the hero rule when a name is not judgeable (copy) |
| **Series:** an immutable `visibility_series` (subject business, baseline audit, replay audit) with claim-once pointers (legacy trigger pattern, now on the series row, not the lead) | **When** a replay is due (28 days; RG's 8-week exception is *data* on that series) |
| Comparison: same questions and engines, pooled runs, `movement` with a **configurable noise band** (default `NOISE_BAND_PP` = 5) | **"Gone up" = `improved`** as the guarantee condition; claim window; refund flow |
| Budget: metered per question × engine × run; priority class per purpose | Per-purpose priority (guarantee = `committed`) |
| Report **data** builder (`buildReportData`): facts, answers, rivals, citations, movement | Report **templates**, copy, CTA, domain, branding |

The engine knows nothing about prices, guarantees, refunds or Findable wording. `purpose` is an org-defined key, and
each one maps to a **shape** (questions, runs, engines, frozen?, comparable_as: none/before/after). Findable's
measurement table (CLAUDE.md §1) becomes four rows of `visibility_programs` config in the Findable org, plus a little
`tenant-findable` code for the guarantee decision.

### 12.2 Entities (ORG)

```
visibility_programs (org, key, shape jsonb, engines, priority, report_template_key)
visibility_question_sets (org, business, program, questions jsonb, locale, frozen_at, source)
visibility_audits (org, business, program, question_set, status, runs_planned, started_at, finished_at, short_code)
visibility_answers (org, audit, question_idx, engine, run_no, answer_text, raw_ref, named bool, named_method, judgeable)
  unique (audit, question_idx, engine, run_no)          -- fixes legacy run_number race (CLAUDE.md §8)
visibility_citations (org, answer, url, host, source_class)
visibility_competitors (org, answer, name, cleaned, rank)
visibility_series (org, business, program, baseline_audit_id, replay_audit_id, replay_due_at)  -- pointers claim-once
visibility_comparisons (org, series, before, after, movement, delta_pp, noise_band_pp, computed_at)
```

Reports: `/r/<short_code>` is served by the platform report function. It renders the org's report template, on the
org's domain where one is configured (Findable: findable.live proxies to it, as today). Internal measurements answer
403. "Still measuring" is shown, never a partial result (both legacy rules, R§3 F10).

---

## 13. Website Builder

### 13.1 Relationships

```
customers ─< projects (delivery) ─1:1─ site_projects ─< site_revisions ─< site_deployments
                                        ├─< site_domains (client-owned; verification + DNS state)
                                        └─> site_templates (platform or org-private)
leads/businesses ──(optional) prospect preview: a site_revision with status 'preview', noindex, never deployed to a client domain
```

- A site belongs to **the org that builds it**. The **domain belongs to the end client** (recorded on `site_domains`
  as ownership and transfer terms), in line with "the site is theirs" (CLAUDE.md §1).
- `site_revisions` hold a **content model**, not HTML: business facts (each marked *verified* or *needs confirmation*),
  services, areas, the page plan, page content, internal-link graph, schema blocks. HTML is a build artefact.
- `site_deployments`: target (Cloudflare Pages project under the platform account by default), commit/build id, URL,
  status, quality-gate result.

### 13.2 Generation pipeline (each step is a job; each output is a revision)

1. **Facts.** From CRM, intake and crawl. Unverified facts (figures, credentials, first-person commitments) are
   **held** for confirmation. This reuses `qaAnswerGuard.ts`.
2. **Information architecture.** Service × area pages, one search intent per page (reusing the site quality gate's
   intent-ownership rule), "based here" only on the real home-town page, and internal linking rules.
3. **Content.** LLM generation inside guards: the anti-stuffing caps (code, measured) and no competitor names.
4. **Structured data.** LocalBusiness/Service/FAQ JSON-LD built from verified facts only.
5. **Build.** A static site generator (Astro, as legacy client sites).
6. **Quality gate.** Run `website_intel` on the preview: crawlable, indexable when live, canonical, valid schema, no
   broken links, `noindex` while preview.
7. **Deploy and hand-off.**

- **No ranking, citation or recommendation is promised anywhere in generated copy or UI.** Client-facing copy is
  scanned (the legacy `client-copy-claims` pattern).

---

## 14. Configuration and settings (how a tenant differs without forks)

There are four mechanisms. **Use the lowest one that works:**
1. **Org settings** (typed core): locale, timezone, currency, branding, contacts and default send window.
2. **Module settings** (`org_modules.settings`, schema-validated): for example the noise band, programs and allowances.
3. **Org data**: pipeline stages, templates, commission plans, agreement versions, products/prices, report templates.
4. **Tenant module code** (`packages/tenant-findable`): only for behaviour that cannot be data. For example, the
   guarantee decision function and the Findable sign-up flow's server rules.

A rule that appears in mechanism 4 for one tenant and is later wanted by a second tenant is **promoted** into a
product module as data or config. That is the only route by which tenant code becomes platform code.

---

## 15. Findable configuration: where each Findable-specific thing goes

| Legacy item (R§4) | Classification | V2 home |
|---|---|---|
| £99 setup, £29.99 / £99 monthly, 12-month term, Build/Optimise routes, Stripe price ids | **CONFIGURATION** | `payments` products/prices in the Findable org; the route choice is a Findable sign-up rule (module) |
| `FINDABLE_*` constants file (`findableOffer.ts`) and the cross-repo sync check | **CONFIGURATION** (values) + **EXTERNAL** (findable-site reads the offer from a public V2 endpoint instead of copies) | removes the mirror (R§4.3 last rows) |
| Guarantee wording, "gone up" = `improved`, claim window, home-town judging | **FINDABLE MODULE** | `tenant-findable/guarantee` (uses `ai_visibility` comparisons); wording as org copy config |
| Measurement model (Hook / Free check / Discovery / Baseline / Full / Replay) | **CONFIGURATION** | `visibility_programs` rows in the Findable org |
| RG pinned 8-week replay, ended/refunded client exceptions, `metric_exclusions` | **CONFIGURATION / DATA** | the series row `replay_due_at`; customer status; exclusions table in the org |
| Client agreement v1/v3/v4, VAT statement, notice address, commercial-terms stamps | **CONFIGURATION** (versions in `agreements`) | the immutable acceptance records migrate verbatim |
| Agreement-before-payment gate, delayed subscription / schedules | **PRODUCT MODULE** (`agreements` + `payments` generic patterns), Findable config enables the gate | reusable patterns (R§9) |
| Commission tiers 30/40/50 %, 20 % × 6, monthly periods, engagement rule | **CONFIGURATION** | a `commission_plans` version in the Findable org; stamped history migrated verbatim |
| WhatsApp templates (Meta names incl. `payment_recieved`), bodies, variables | **CONFIGURATION** | `message_templates` on Findable's identity, synced from its WABA |
| `salesStyle.ts` house style, call script, cold-call playbook, Quick Close wording | **FINDABLE MODULE** (copy) on generic `sales_team` screens; Quick Close's *mechanism* (send a payment link + log the outcome) is generic `payments` | |
| Report, welcome pack, four-week results HTML + copy + CTA | **FINDABLE MODULE** (templates) over the generic report data builder | |
| findable.live domain, report host, `alerts@`/`reports@` senders, `paul@findable.live` alert inbox | **CONFIGURATION** | `org_settings` contacts; `comm_identities` (email); `org_domains` |
| findable-site (public site, onboarding UI, proxies) | **EXTERNAL BUSINESS LOGIC** | stays Findable's own repo; calls V2 public endpoints scoped to the Findable org |
| Serve gate / domain authority / delivery routes (WordPress access or move hosting) | **FINDABLE MODULE** (rules), on generic `delivery` + `website_builder` data | |
| Paid client hub, intake, missing info, monthly update | **PRODUCT MODULE** `delivery` (generic) + Findable checklist config | |
| Page generator / page plan / review replies | **PRODUCT MODULE**: page plan → `website_builder`; review replies → `ai_assist` | |
| Website Build (one template, MCL-derived) | **PRODUCT MODULE** `website_builder`; the template becomes a platform template **after removing real client personal data** (R§7.2 G5) | |
| Trades list (UK local trades), `uk_towns`, Companies House, TPS, UK mobile cold gate | **CONFIGURATION** (org market vocabulary, country) + **country plug-ins** in `research` / `comms` | |
| `PROVIDER_MIGRATIONS` (Move37 → Findable cost history), `buyOffer` hidden ids | **REMOVE/LEGACY** (history stays in legacy; the hidden-offer list becomes an org setting if still wanted) | |
| Barber/salon, Instantly, SMS, self-serve SaaS residue, orphan functions, 3 legacy activity logs, backup tables | **REMOVE/LEGACY** | do not enter V2 |
| Changelog-as-code (`whatsNew.ts`), "Speak to Paul" strings | **REMOVE/LEGACY** (changelog becomes platform data; owner name comes from org settings) | |
| Operator email `QA_EMAIL_SINK`, QA simulator | **CONFIGURATION** (platform staging setting) | |

---

## 16. Legacy → V2 strategy

### 16.1 Principles

1. **Legacy keeps running Findable** until the Findable migration phase. It gets fixes only, plus the four security
   fixes recommended now (R§7.2 G1, G2, G3, G5), which are independent of V2 (ADR-21).
2. **No dual-running on one WhatsApp number or one Stripe webhook.** Each external endpoint has one owner system at a
   time, and it is switched once, at cutover.
3. **Port pure logic with provenance. Reimplement data layers and screens.** Never port a monolith screen.
4. **Ethan/Stephan's org starts on V2 with empty data**, so Findable's migration is off the critical path.
5. **Findable migrates by import into a fresh org, keeping ids where public URLs depend on them** (audit UUIDs, short
   codes, agreement tokens). The overloaded lead is **split at import** by a tested mapping, because by then the V2
   model is fixed and proven by tenant 2. A lift-and-shift into V2 would import the debt (ADR-20).

### 16.2 Phases

| # | Phase | Builds | Reuses from legacy | Reimplements | Depends on | Tests | Exit criteria |
|---|---|---|---|---|---|---|---|
| **0** | **Legacy hardening + inputs** (optional, parallel, in the LEGACY repo) | G1/G2/G3/G5 fixes; live schema dump; `outreach_leads` column inventory | — | — | — | legacy `npm run check` | security gaps closed; schema dump and column map committed to docs |
| **1** | **Foundation** | V2 repo, CI, staging + prod Supabase projects; orgs, memberships, invitations, RBAC, `app.*` helpers, grants/RLS conventions, schema lint, cross-tenant test harness, module registry + entitlements, org settings, audit log, jobs + fair runner + schedules, domain events, credential store, provider gateway skeleton, `usage_events` + guard + limits, observability baseline, platform console (orgs, entitlements, limits) | `guard_action` logic, `protection` modes, `fetchAllRows`, `edgeInvokeCore`, `safe-fetch`, CORS lessons | auth context, all tables, all policies | — | **cross-tenant suite green; schema lint green**; job runner fairness test; guard concurrency test | two orgs with users exist in staging; a fake metered provider call is attributed and capped per org |
| **2** | **Core CRM** | businesses, contacts, contact points, leads, pipeline stages, deals, customers, tasks/next action, notes, activities, tags, campaigns, files, notifications, CSV import/export; lean CRM UI (list, lead panel, pipeline board, tasks) | phone key + `waNumber`, `lineType`, `displayName`, `nameMatch`, `leadState` (generalised), `nextActionView/Write`, `lostReason`, import validation | the CRM data layer and UI (R§9: REIMPLEMENT) | 1 | domain unit tests (ported); RLS per role; import idempotency; "one open next action" constraint | a sales and a manager user in a test org can work a pipeline end to end; nothing crosses orgs |
| **3** | **Prospecting** | Places search (tiling, radius), found/added per org, global caches, add-to-CRM | `search-leads` logic, tiling, website verdict, `trades.ts` as org vocabulary | the cache/attribution layer | 1, 2 | metering per org; cache isolation (no tenant-visible cache) | a search is charged to the right org and member |
| **4** | **Comms + WhatsApp** | comms model, identities, templates + Meta sync, outbound pipeline + policy checks, send window per identity, inbound webhook (mode A), inbox (lean), media, voice notes, opt-out → suppression, dry run | `whatsapp-send.ts` (send + `classifyFailure`), `coldOutreach`, `ukColdDestination`, `templateVars`, `templateRouting`, `sendWindow`, `inboundMatch.chooseInboundLead`, `metaWebhookGate`, `oggOpus` | queue, inbox UI, registry (as data) | 1, 2 | webhook signature tests; idempotency; cross-org inbound routing test (two identities); dry-run parity; suppression | **a real message sent and received on a test number in a test org** (Paul runs the first real send) |
| **★** | **Ethan/Stephan go-live (earliest)** | org created, members invited, their WABA connected, templates approved, limits set | | | 1–4 (+3 if they need search) | go-live checklist | they work leads and message from their own number; usage visible per org |
| **5** | **Sales Team** | salesperson workspace, manager view, assignment tools, targets, performance fold, pre-call research hook, team board | `salesPerformance` fold (one), team board logic | screens | 2, 4 | metric fold tests | managers can run a team without admin rights |
| **6** | **Email (transactional + outreach)** | org sending domains (Resend), mailbox connections (OAuth), sequences, reply detection | sender-domain handling | everything else (new) | 4 | deliverability checks in staging; unsubscribe | only if a tenant needs it; can move ahead of 5 |
| **7** | **Website Intelligence** | websites, crawl jobs/pages, findings, AI-crawler access, SEO scan sub-capability | `crawlCheck`, `crawlUrl`, `fullCrawl`, `siteAudit`, `siteEvidence`, `siteFindings`, `agencyDetect`, `crawl-job`, `safe-fetch` (**REUSE**) | storage layer | 1, 2 | ported tests; SSRF tests | prospect and customer crawls per org, metered |
| **8** | **AI Visibility** | programs, question sets, audits, answers, analysis, series, comparisons, report data, generic report template | the measurement engine (`namedSignal`, `nameMatch`, `measurementCompare`, `baselineReplay`, `seedGuard`, `competitorCleaning`, `sourceType`, `auditBudget`, `extract-competitors` prompts, enrichment answer collection) | queue/drain against the job runner; pointers on series | 1, 2, 7 (enhances) | **golden tests: replay legacy audit inputs and assert identical verdicts/movement** | a baseline and replay for a test business produce the same comparison as legacy on the same answers |
| **9** | **Payments, Agreements, Delivery, Commissions** | Stripe connection (org key + webhook), products/prices, checkout, ledger, subscriptions/schedules, holds; agreement versions/links/acceptances; customer projects, intake, info requests; commission plans/entries/payouts | `delayed-subscription.ts`, `paymentState`, `clientAgreement` (mechanism), `clientIntake`, `deliveryStage`, `commission.ts` (engine) | storage, triggers → events | 2, 5 | **commission golden test against legacy stamped rows**; webhook idempotency; refund reversal | a test org can sell, collect, sign and stamp commission on Stripe test mode |
| **10** | **Findable module** | Findable programs, guarantee, sign-up rules, report/welcome/results templates, house style, public endpoints for findable-site | renderers' copy, `clientTimeline`, `serveGate`, `domainAuthority` | wiring | 8, 9 | client-copy claims scan ported; parity of rendered report against legacy for sample audits | Findable org in staging reproduces live behaviours on imported sample data |
| **11** | **Findable migration** | import scripts (dry run → staging rehearsal ×2 → production), id preservation, Meta webhook switch, Stripe webhook switch, findable-site repoint, legacy queue freeze/drain | — | — | 10 | **row-count and checksum reconciliation per entity**; URL resolution sweep of every public code; commission and guarantee evidence equality | one cutover window; legacy read-only afterwards |
| **12** | **Website Builder** | site projects, revisions, deployments, domains, templates, pipeline, quality gate | `buildPack`, `templateMapping`, `qaAnswerGuard`, page plan rules, site quality gate | storage + pipeline | 7, 9 | quality-gate tests; copy-claims scan | a site built and deployed to a preview from a test customer |
| **13** | **Legacy retirement** | freeze, archive DB dump, decommission functions/crons, keep public URL proxies | | | 11 | | legacy project paused; public URLs still resolve |

### 16.3 When

- **The earliest safe point for Ethan/Stephan is after Phase 4.** If they only need CRM + prospecting + WhatsApp, it is
  Foundation, Core CRM, Prospecting and Comms/WhatsApp. If their channel is email rather than WhatsApp, **Phase 6
  replaces Phase 4** for them.
- **Findable can migrate after Phase 10**, as Phase 11. It needs AI Visibility, Payments, Agreements, Delivery and
  Commissions, because Findable's live clients depend on all of them. **Website Builder is not a prerequisite.**
  Findable's build work can continue in legacy or by hand until Phase 12.

### 16.4 The job runner (referenced throughout)

- `jobs(org_id null for platform, module, kind, payload, priority, run_at, status, attempts, max_attempts,
  locked_by, locked_until, idempotency_key unique, initiated_by, parent_job_id, last_error)`.
- The claim uses `FOR UPDATE SKIP LOCKED`, **round-robin across orgs**: claim at most `k` per org per tick, ordered by
  priority then age. It respects per-org, per-kind concurrency from the manifest.
- Long work (crawls, multi-run audits) is **step-wise**: each tick does a bounded step and re-enqueues. This is the
  legacy poll pattern, and it suits edge function time limits.
- Every job writes a `job_runs` row (start, end, outcome, error class). Failed jobs go `dead` after max attempts and
  alert (§19).

---

## 17. Repository strategy

**Recommendation: a new repository, `leadfinderos` (V2), as a pnpm-workspace monorepo. Legacy stays frozen in its own
repo. Legacy kernel files are copied with provenance, not shared as a package** (ADR-18).

```
leadfinderos/
  apps/web/                       React SPA (Vite) — shell, core UI, module UIs via packages
  supabase/
    migrations/                   generated stream (core + modules), CLI-applied
    functions/<name>/index.ts     thin entrypoints: http handlers, webhooks, job-runner
    config.toml                   every function, verify_jwt explicit
  packages/
    kernel/                       pure, dependency-free domain logic PORTED from legacy (phone, names,
                                  template vars, lead state, time/zone helpers…) — explicit .ts imports,
                                  no aliases, runs in Vite + Deno
    core/                         tenancy, rbac, settings, crm services, activities, events, jobs, files,
                                  notifications, audit, suppression, metering, guard, integrations
    providers/                    one dir per provider; the ONLY place that reads provider keys
    modules/<key>/                manifest, domain, server, ui, db
    tenant-findable/              Findable-only code (imported only by the registry)
    test-support/                 seeded two-org fixtures, RLS harness, fakes for providers
  scripts/                        checks: module graph, schema lint, migration stream, env-key grep, port drift
  docs/
```

- **Why not extend the legacy repo (a sibling app in it)?** Legacy's 190 relative `../../../src/lib` imports, its 9
  accepted type errors, its Findable constants and its hand-deploy habits would leak into V2 through convenience.
  A clean repo makes "contaminating V2 with legacy debt" a deliberate act, not an accident.
- **Why not a shared package consumed by both?** Legacy would have to be refactored to consume it. That is a change to
  the running system that the brief rules out, and it couples V2's release cadence to legacy's.
- **How fixes port:**
  - Every copied file starts with `// ported-from: LeadFinderOS@<sha>:src/lib/<file>.ts`.
  - `scripts/port-drift.mjs` (in V2) reads the legacy repo path and lists ported files whose legacy source changed
    after the recorded sha. It runs weekly, or before each phase.
  - Bug fixes made in legacy after porting are re-applied by a small Sonnet packet.
  - The duplication ends at Phase 13.
- **Deno compatibility is a CI gate in V2.** CI installs Deno and runs `deno check` on every function. Legacy cannot
  (CLAUDE.md §0).
- **findable-site** stays a separate repo (Findable's public site). It stops holding offer and agreement copies and
  reads them from a V2 public endpoint, so the cross-repo sync check retires.

---

## 18. Deployment architecture (sized for now)

| Concern | Choice | Why |
|---|---|---|
| **Database, auth, storage, realtime, cron, Vault** | **Supabase**: one project for **staging**, one for **production**, in a new Supabase organisation owned by the platform (not Findable/Move37) | the team knows it; the legacy kernel already runs on Deno edge; scale is small |
| **Backend** | Supabase Edge Functions (Deno): `api-*` handlers per module area, `webhooks-*`, `job-runner`, `public-*` (reports, agreements, sign-up) | same platform; no second host to operate |
| **Long-running work** | step-wise jobs under pg_cron → `job-runner` every 30 s (one schedule) + `scheduler` every minute | proven legacy pattern without a worker host. **Escape hatch (ADR-19):** if a job type cannot be made step-wise inside edge limits, add one small Node worker (Fly.io/Railway) that claims the same `jobs` table. Not in MVP |
| **Frontend** | Cloudflare Pages: `app.<platform-domain>` (prod), `staging.app.<platform-domain>`, per-branch previews against staging | as legacy |
| **Public documents** | `public-*` functions behind the platform domain (`r.<platform-domain>`) and per-org custom domains proxied by the org's own site (findable.live keeps proxying) | |
| **CI/CD** | GitHub Actions: lint, typecheck (zero errors, no baseline), `deno check`, unit tests, schema lint + cross-tenant suite against `supabase start` in CI, build. **Merge to `main` → deploy to staging automatically** (migrations, all functions, SPA). **Production = a tagged release, approved by Paul**, with the same steps | removes the hand-deploy closure trap and DB-only state (R§2.7, R§5.3) |
| **Secrets** | platform provider keys → Supabase function secrets per environment; org secrets → Vault; deploy tokens → GitHub environment secrets (prod protected) | |
| **Environments** | local (`supabase start` in Docker, or a staging branch database if Docker is unavailable on Paul's machine), staging (test Stripe, a Meta test number, low provider caps), production | |
| **Backups** | Supabase daily backups + PITR on production once a paying external tenant is live | |

---

## 19. Observability (lightweight)

| Signal | Where it lands | Alert |
|---|---|---|
| **Errors** (SPA + edge) | **Sentry** (one project per app; org_id and module as tags; no PII in breadcrumbs). Mirrored into `app_errors` for the platform console | new issue / spike → email |
| **Failed jobs** | `job_runs` + `jobs.status='dead'` | any dead job → platform alert; per-org digest |
| **Provider failures** | `usage_events.outcome='error'` + `provider_circuit` state | breaker opens → platform alert; org admins notified if their connection |
| **Message delivery** | `messages` status timeline; failure classes | failure rate per identity > threshold; quality-rating drop |
| **Crawl failures** | `crawl_jobs.status`, error class | only in aggregate (sites fail often by nature) |
| **AI failures** | `visibility_answers` missing, plus engine error rates in `usage_events` | engine error rate > threshold; a committed-priority run late |
| **Spend spikes** | hourly job: org spend vs trailing 7-day hourly baseline, plus soft/hard limit crossings | ×3 baseline or a hard limit hit → alert |
| **Suspicious activity** | `audit_log` denials, exports, number reveals, login anomalies (legacy `record_denial` threshold, per org) | threshold → org owner + platform |
| **Org usage** | `usage_daily` → org admin usage page + platform console | — |
| **Webhooks** | `webhook_events` with resolution status | unresolved events → platform alert |

- **Alert delivery:** email through the platform transactional sender to the platform alert address and org owners.
  A Slack webhook is optional later.
- **Not now:** no APM, tracing or log pipeline. Supabase logs are short-lived (R§2.8), so **anything worth diagnosing
  must be written to a table or Sentry by design.** The legacy lesson "a refusal that is only `console.error`'d is
  undiagnosable" becomes a lint rule in handlers.

---

## 20. V2 MVP

**The goal is the smallest V2 that Ethan/Stephan can use safely, without Findable migrating.**

### MUST HAVE before the first external tenant

- Tenancy: orgs, memberships, invitations, roles/permissions, suspension, **RLS + composite FKs + schema lint +
  cross-tenant test suite green**.
- Platform console (minimal): create org, invite owner, set modules and limits, see usage and errors, support-access
  grants.
- Org settings: name, branding basics, timezone, locale, currency, alert contacts.
- Core CRM: businesses, contacts, leads, pipeline stages (default template, editable labels), tasks/next action, notes,
  activity timeline, campaigns, CSV import/export.
- Metering + guard + org limits + kill switches. **Every paid call attributed.**
- Jobs runner with fairness; schedules in migrations.
- Credential store (Vault) + gateway; **their** WhatsApp identity (mode A) **or** their email mailbox, whichever
  channel they use.
- Comms for that channel: identity, templates, outbound pipeline with suppression and policy checks, inbound routing,
  basic inbox, opt-out.
- Prospecting (Places search) **if they need sourcing**. Otherwise CSV import only.
- Observability: Sentry, job and webhook failure alerts, spend alerts.
- Legal minimum: the platform terms / data processing agreement with the tenant (not a code item, but it gates
  go-live).

### SHOULD HAVE soon after

- Sales Team module (workspace, manager view, targets).
- Website Intelligence (crawl + findings), because it is cheap to port and useful for any local-business seller.
- Second channel (email or WhatsApp, whichever they lack).
- Transactional email from the org's own domain.
- Usage page for org admins; soft-limit notifications.
- Lead dedupe/merge tools.

### CAN WAIT

- AI Visibility (needed for Findable; for others it is a commercial decision, ADR-4 open).
- Payments, Agreements, Commissions, Delivery (needed for Findable's migration; for Ethan only if they sell through
  the system).
- Website Builder.
- Territory/niche, Research/enrichment, AI assist, Search performance.
- Platform billing (Stripe subscriptions for LeadFinderOS itself); usage statements.
- Meta Embedded Signup (mode B), Stripe Connect, BYOK beyond what exists, custom roles, white-label public pages, i18n.

