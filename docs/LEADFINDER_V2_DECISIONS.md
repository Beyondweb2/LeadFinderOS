# LeadFinderOS V2: architecture decision record

*2026-10-07. Companion to `LEADFINDER_V2_ARCHITECTURE.md` (**A§n**) and `LEADFINDER_V2_RECON.md` (**R§n**).*

**Status values:**
- **Given**: Paul made the decision in the brief.
- **Proposed**: recommended here, and stands unless Paul objects.
- **Open**: needs Paul's input.

---

## Decisions

### ADR-1: One shared multi-tenant database per environment (Given)
- **Decision.** A single Supabase project per environment. Every tenant row carries `org_id`. A premium dedicated
  deployment runs the same code against a separate project.
- **Rationale.** One schema, one deploy, one place to fix things. The scale is small.
- **Rejected.**
  - A project per tenant as the standard. It would mean N migrations, N cron sets and N secret sets.
  - A schema per tenant. RLS and migrations become untestable.
- **Check against "serious technical reason".** None was found. Supabase RLS plus composite foreign keys is sufficient
  at this scale.

### ADR-2: Isolation in three independent layers (Proposed)
- **Decision.**
  - RLS on every table.
  - Composite foreign keys `(org_id, id)` on every org-scoped reference.
  - Server handlers that never accept `org_id` or a user identity from a request body.
  - Two supporting measures: explicit grants (nothing to `anon`), and the service client restricted to jobs, webhooks
    and core privileged code (A§5).
- **Rationale.** Legacy edge functions bypass RLS completely (R§7.1 S1). Composite foreign keys still protect when the
  service role is in use.
- **Rejected.**
  - RLS alone. Edge functions use the service role.
  - Handler checks alone. This is the legacy approach, and it is inconsistent.

### ADR-3: Org context comes from membership or from the claimed row, never from a master secret (Proposed)
- **Decision.**
  - The cron secret can only drain the job queue.
  - Jobs carry `org_id` and `initiated_by` from the moment they are created.
  - Webhooks resolve the org from the receiving identity or connection.
  - No endpoint accepts "act as user X".
- **Rationale.** R§7.1 S6.
- **Rejected.** Per-function internal keys that accept `acting_user_id`.

### ADR-4: AI Visibility is a platform module; Findable's methodology is configuration plus a tenant module (Proposed, with a commercial question Open)
- **Decision.**
  - The engine is a generic module: question sets, answers, analysis, series and comparison.
  - The purposes, shapes, guarantee and copy are Findable configuration and the `tenant-findable` module (A§12).
- **Rationale.** This keeps the methodology out of core and makes the engine testable on its own.
- **Open.** Whether *other* tenants may be sold this module (see Q1).

### ADR-5: Modules are code boundaries in one repository with entitlement rows, not plugins (Given / Proposed shape)
- **Decision.**
  - A typed registry.
  - `org_modules` decides entitlement.
  - All tables exist for all orgs.
  - Module SQL is assembled into one migration stream.
  - Import rules are enforced by CI.
- **Rejected.**
  - Runtime plugin loading.
  - Per-org schemas.
  - Separate deployables per module.
  - A feature-flag service. Permissions double as sub-capabilities.

### ADR-6: Lean core (Proposed)
- **Decision.** Core holds:
  - tenancy and RBAC;
  - entitlements and settings;
  - the CRM spine;
  - activities and events;
  - files and notifications;
  - integrations and the gateway;
  - metering and the guard;
  - jobs;
  - the audit log;
  - suppression and import/export.

  Communications is a foundation module. Prospecting, payments and commissions are modules (A§2).
- **Rejected.** Messaging in core. A tenant that does not message would still carry it.

### ADR-7: Fixed role set and permission checks only; no custom roles in V2 (Proposed)
- **Decision.**
  - Six org roles, defined in code.
  - Code checks permissions, never role names.
  - Rare exceptions go through per-membership overrides.
  - Platform roles are a separate table and grant no tenant data.
- **Rejected.**
  - Org-defined custom roles. They can wait.
  - Platform admin as an implicit member of every org. This is the legacy "admin is a global superuser" (R§7.1 S2).

### ADR-8: Support access by time-boxed, audited grants; no impersonation (Proposed)
- **Decision.** Staff act under their own identity, under a grant that the org can see.
- **Rejected.** "Log in as" impersonation. Its actions are misattributed, and it recreates "internal credentials act as
  any user".

### ADR-9: Business identity is per org (Proposed)
- **Decision.** `place_id` and website uniqueness apply per org. Two tenants may pursue the same business.
- **Rationale.** The tenants are independent businesses. A global lock would leak "someone else has this lead".
- **Rejected.** The legacy global identity lock (R§5.2).

### ADR-10: Configurable pipeline stages over fixed semantic categories (Proposed)
- **Decision.**
  - Orgs name and order their own stages.
  - Every stage maps to one of eight categories.
  - Automation and metrics key on the category.
  - Sales state stays *derived*, with no downgrades (the legacy pattern).
- **Rejected.**
  - Fully free-form stages. Automation would have nothing stable to key on.
  - The legacy closed union with a text column that has no CHECK (R§4.3).

### ADR-11: Global caches for public provider data, service-only (Proposed)
- **Decision.** Places, geocode, place details, Companies House and agency-check caches are shared and never exposed to
  tenants. A cache hit is metered with an actual cost of 0.
- **What is never shared:** search history (found/added), AI answers, crawl results, enrichment tied to a tenant's
  contacts.
- **Rejected.** Fully isolated caches. They cost more and protect nothing that is not already public.

### ADR-12: Platform-managed credentials by default; org-owned where identity is involved (Given / Proposed per provider)
- **Platform-managed:** OpenAI, Apify, Google Places and Companies House.
- **Org-owned:**
  - WhatsApp: the org's WABA and number.
  - Outreach email: the org's mailbox.
  - Payments: the org's Stripe account.
- **Transactional email:** sent through the platform's Resend account, from the org's own verified domain.
- **BYOK:** the gateway supports it everywhere. It is offered only where it is commercially useful (A§7.3).
- **Thin interfaces, only where a second provider is realistic:**
  - LLM;
  - answer engine;
  - company registry per country;
  - channel adapters.

### ADR-13: Tenant payments use the org's own Stripe account (Proposed)
- **Decision.**
  - For the MVP, the org supplies a restricted key and a webhook endpoint per connection.
  - Stripe Connect (Standard) comes later.
  - Findable's existing account becomes its connection, so live subscriptions are not moved.
- **Rejected.** Running every tenant's payments through the platform's Stripe account. That would put us in the
  regulated role of collecting money for tenants, and Findable's subscriptions would have to be re-created.

### ADR-14: Usage metering from day one; billing for usage later (Given / Proposed)
- **Decision.**
  - `usage_events` is written for every gateway call, including cache hits, refusals and BYOK calls.
  - Prices are held in a price book, with each unit price citing a billed row.
  - Allowances, soft limits and hard limits are set per org.
  - A reservation-based guard prevents overshoot.
  - Statements come later.
- **Rejected.** Deriving cost later from provider dashboards. That cannot be attributed to an org.

### ADR-15: WhatsApp connection mode A (org-owned Meta app) for the MVP; mode B (Tech Provider + Embedded Signup) later (Proposed, Open on timing)
- **Rationale.**
  - Mode A needs no Meta review on our side.
  - Findable is already moving to its own Meta app (R§2.6), which is mode A.
  - Mode B makes onboarding self-serve, but needs Tech Provider approval.

### ADR-16: Suppression at both org level and platform level, with a narrow platform list (Proposed)
- **Decision.**
  - The org list holds normal opt-outs. It is enforced for every channel.
  - The platform list holds only erasure requests, legal instructions, complaints about the platform, and abuse.
  - Platform entries are matched by hash, and the reason is never shown to tenants.
- **Rationale.** Each org is a separate data controller. Platform reputation still needs protecting (A§9.6).
- **Rejected.**
  - Global-only, which is the legacy model.
  - Org-only. It leaves no way to honour a platform-level erasure.

### ADR-17: Website Intelligence is one module; SEO scan is a sub-capability (Proposed)
- **Rationale.**
  - The crawler is the foundation of every check.
  - The SEO actor is a thin paid wrapper.
  - One website, page and finding model.
- **Hard rule:** no invented AI-ranking scores.

### ADR-18: New V2 monorepo; legacy logic is copied with provenance, not shared (Proposed)
- **Rejected.**
  - A sibling app inside the legacy repo. Legacy debt would leak in.
  - A shared package consumed by legacy. That forces legacy refactors.
  - A full rewrite of pure logic. It wastes tested work.
- **Mitigation.** A port-drift script plus a provenance header on every ported file. The duplication ends at legacy
  retirement.

### ADR-19: Supabase Edge plus a pg_cron job runner, with no separate worker host in the MVP (Proposed)
- **Escape hatch.** One Node worker claiming the same `jobs` table, if a job cannot be made step-wise.
- **Rejected for now.**
  - Node/Workers as the backend. It means a second platform, and the ported kernel already runs on Deno.
  - An external queue such as SQS or Redis. Unneeded at this scale.

### ADR-20: Findable migrates last, by import into a fresh org, splitting the lead at import (Proposed)
- **Rationale.**
  - By the time Findable migrates, the V2 model has been proven by tenant 2.
  - Ids that back public URLs are preserved.
  - Lift-and-shift would import the overloaded row and the trigger chain.
- **Rejected.**
  - Lift-and-shift, then refactor.
  - Migrating Findable first. That would put Ethan behind the riskiest work.

### ADR-21: Close four legacy security gaps now, independently of V2 (Proposed; needs Paul's go-ahead because it touches live)
- **The four gaps:**
  - G1: unsigned Meta webhook. Its fix needs the Findable Meta app.
  - G2: 22 orphan deployed functions.
  - G3: paid functions with no role check.
  - G5: client personal data in source.
- **Rationale.** Legacy runs for many more months.

### ADR-22: Workflow through domain events and jobs; database triggers only for integrity (Proposed)
- **Rejected.** The legacy pattern of about 25 workflow triggers on one table (R§11).

### ADR-23: Communications keyed by identity plus address (Proposed)
- **Decision.** A conversation is unique on `(comm_identity, external_address)`. Templates belong to an identity, or to
  its WABA. The send window and cap belong to the identity.
- **Rejected.** The legacy model: phone-keyed conversations and singleton outreach state.

---

## Decisions still open (need Paul)

1. **Q1. Will AI Visibility be sold to other tenants?**
   - The engine is built as a module either way.
   - If yes, Findable's competitors could license Findable's measurement engine. You might want exclusivity, or a
     market or trade restriction.
   - If no, the module is enabled only for Findable, and some generality could be skipped.
2. **Q2. What does Ethan/Stephan's business actually need on day one?**
   - Which channel: WhatsApp, email, or both?
   - Do they need Google Places lead sourcing, a team of salespeople, payments, or AI visibility?
   - Their country: UK only?

   This sets the exact MVP cut and decides whether Phase 4 or Phase 6 comes first.
3. **Q3. Platform name, domain and legal entity.** V2 needs a platform domain for the app, report links, the crawler
   bot page and fallback email. It also needs an entity that contracts with tenants and owns the new Supabase,
   Cloudflare, Stripe, Meta and Apify accounts. Today the accounts are spread across Move37, Findable and Paul
   personally (R§6.1).
4. **Q4. Commercial model for usage.**
   - **Included allowances plus hard caps:** simplest, with no usage billing.
   - **Allowances plus billed overage.**
   - **Pass-through cost plus margin.**

   The data model supports all three. This choice only changes the MVP's platform console and terms.
5. **Q5. Is Meta Tech Provider status worth pursuing now?** It enables self-serve WhatsApp onboarding (mode B), but
   carries a review and business-verification burden. Mode A works for the first few tenants.
6. **Q6. Go-ahead for ADR-21:** fixing the four legacy security gaps in the live system now.
7. **Q7. Cross-tenant contact policy.** Is it acceptable that two tenants may contact the same business (ADR-9)? If
   your tenants could be competitors (for example, resellers of the same service), do you want an optional "territory
   exclusivity" rule? It can be added later, as data.
