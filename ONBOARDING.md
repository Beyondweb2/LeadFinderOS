# LeadFinderOS — Product & Architecture Onboarding

> Read this first if you're a fresh session picking up work. It explains **what this product is**, **how the pieces fit**, and **the conventions/gotchas** that aren't obvious from the code. Paths are relative to the repo root `C:\Users\paulj\LeadFinderOS`.

---

## 1. What this product is (the one-paragraph version)

LeadFinderOS is a **two-sided web-design lead-gen + site-delivery engine**.

- **Operator side (Paul / the team):** find local businesses that have no/poor website, auto-generate a ready-made website for each, and reach out (mostly automated WhatsApp) inviting them to claim it.
- **Customer side (the business — a barber, salon, plumber, any trade):** receives a link to a **live, real website already built for them**, can tweak it, and **claims** it by making an account. Once claimed they manage/publish it and can pay for add-ons (custom domain, booking, SMS reminders).

The brand for the **customer-facing** product is **yoursites.uk**. The **operator tool** lives at **leadfinderos.pages.dev** (historically also "LeadFinder Pro" / a lovable.app URL). Both are the **same codebase and same Cloudflare Pages deploy** — separated at runtime by hostname (see §5).

> Naming note: much of the code says "barber" because barbers were the first vertical. The product now serves **all trades** (salon, plumber, generic). Treat "barber" in identifiers as legacy/first-vertical, not a scope limit. A recent push (`apex-yoursites-fix`) started de-barbering customer-facing surfaces.

---

## 2. The end-to-end flow

```
FIND            GENERATE                OUTREACH                    CLAIM                 OWN / MONETISE
search-leads →  generate-barber-site →  process-whatsapp-queue  →   /s/<token> (SiteByToken)  →  /barber (OwnerDashboard)
(operator)      (per lead, AI copy)     (templated WA sends)        begin-claim → /claim        edit/publish, Stripe add-ons
                + enrich-*              + Inbox replies             → claim-site (owner_id set)  custom subdomain, booking
```

1. **Find leads** — operator searches a city/category (`search-leads` + Google Places `google-place-details`); leads land in `outreach_leads`. Enrichment (`enrich-business`, `enrich-lead`, `extract-facebook`, `extract-email`, `check-website`, `scan-services`) fills in socials/website/services.
2. **Generate a site** — `generate-barber-site` reads the lead's real data, asks OpenAI (gpt-4o-mini) for honest site copy under strict "invent-nothing" rules, deep-enriches photos/reviews (Apify Google Maps), and writes a `generated_sites` row (`content` jsonb). Per-user cap: **40 generations / rolling 24h**.
3. **Outreach** — leads are queued; `process-whatsapp-queue` (pg_cron every ~10 min, one send per tick) sends an **approved WhatsApp template** with a claim link. Guards: 7am–9:30pm London window, 40/day global cap, randomised spacing, `WHATSAPP_TEST_MODE`. Replies come back via a webhook into `whatsapp_messages` and show in the **Inbox**. Bulk operations run server-side via `bulk-jobs`.
4. **Claim** — the WA message links to `yoursites.uk/s/<share_token>` (`SiteByToken`): the barber sees their real site + a claim prompt, can pre-edit colour/photos before signing up. Claiming: `begin-claim` (mints one-time token) → `/claim/<token>` (`Claim.tsx`) → `claim-site` (creates account from phone→synthetic email, atomically sets `generated_sites.owner_id`).
5. **Own & monetise** — after claim they land on `/barber` (`OwnerDashboard`) — the generic owner dashboard for **all trades** — where they edit/publish, connect a custom subdomain (`connect-subdomain`), enable booking, and pay via Stripe (`create-barber-checkout` + `stripe-webhook` flips `is_paid`). Booking pages live on **bookmybarber.uk**.

---

## 3. Tech stack

- **Frontend:** Vite + React 19 + TypeScript, React Router v6, TanStack Query, Tailwind + shadcn/ui (Radix), lucide-react, framer-motion, react-helmet-async. Single SPA (`src/`), lazy-loaded routes in `src/App.tsx`.
- **Backend:** Supabase — Postgres (RLS everywhere), Auth (one user pool; barbers use phone→synthetic email `<digits>@claimed.yoursites.uk`), Storage (`barber-site-images` bucket), **33 Deno edge functions** in `supabase/functions/`.
- **Hosting:** Cloudflare Pages (static SPA) + **Pages Functions** in `functions/` (`_middleware.ts`, `s/[token].ts`, `p/[slug].ts`) for host routing + SSR meta/OG injection for crawlers.
- **External:** OpenAI (site copy, AI openers, service scan), Apify (Google Maps deep enrich — reviews/photos), Google Places API, Stripe (payments), Meta WhatsApp Cloud API (outreach), Instantly.ai (email outreach), Resend (transactional email).

---

## 4. Repo map

```
src/
  App.tsx                    # all routes + the host-based render split (§5)
  pages/                     # 27 pages (see route table §5)
  components/
    barber/  BarberShell.tsx, LiveSiteEditor.tsx …   # owner dashboard shell (barber + plumber)
    salon/   SalonShell.tsx                           # owner dashboard shell (salon)
    dashboard/ CampaignStatsCard.tsx, CampaignStatsSection.tsx …
    SiteEditor.tsx, SiteImagePicker.tsx, CampaignPicker.tsx, OutreachTable.tsx …
  templates/
    shared/content.ts        # SiteContent — the ONE jsonb payload shape (§6)
    barber/  BarberSiteTemplate.tsx   # public site render (barber)  + assets/fonts
    salon/   SalonSiteTemplate.tsx    # public site render (salon)
    plumber/ PlumberSiteTemplate.tsx  # public site render (plumber)
    registry.ts              # template key → component/demo
  hooks/                     # useOutreach, useCampaigns, useCampaignStats, useInbox,
                             # useAuth, useSubscription, useBulkJobs, useBarberBranding …
  lib/                       # subdomain.ts (host rules), barberEdits.ts (pre-claim edits),
                             # leadStatus.ts, phoneAuth.ts, publicSite.ts …
  integrations/supabase/     # client + generated types
functions/                   # Cloudflare Pages Functions (host routing + SSR meta)
  _middleware.ts, s/[token].ts, p/[slug].ts
supabase/
  functions/                 # 33 Deno edge functions
    _shared/                 # whatsapp-send.ts, whatsapp-failure.ts, enrichment/ …
  migrations/                # SQL (⚠ applied MANUALLY — see §9)
```

---

## 5. Domains & routing (IMPORTANT — one deploy, split by hostname)

There is **no separate deploy per domain**. Every request hits the same Pages project; the hostname decides what renders — first in `functions/_middleware.ts` (Cloudflare, runs on every request), then again in `src/App.tsx` (client).

| Host | Renders | Where decided |
|---|---|---|
| `<label>.yoursites.uk` | that barber's site (`SubdomainSite`), OG rewritten to their business | middleware + App.tsx |
| `bookmybarber.uk[/slug]` | booking-only page (`BookingPage`/`BookingHome`) | middleware + App.tsx |
| `yoursites.uk` / `www` (apex) | **customer**: `/`,`/landing`,`/auth` → 302 to `/login`; `/s`,`/p`,assets pass through | `functions/_middleware.ts` |
| `leadfinderos.pages.dev` (+ pages.dev/localhost) | **operator app** (full `<Routes>`) | falls through (not a barber label) |

Host rules live in `src/lib/subdomain.ts` (`getBarberSubdomainLabel`, `RESERVED_SUBDOMAINS`, `isBookingHost`). ⚠️ **The reserved-subdomain list + label regex are duplicated in THREE places that must stay in sync:** `src/lib/subdomain.ts`, `functions/_middleware.ts`, and `supabase/functions/connect-subdomain`.

### Route table (`src/App.tsx`)
- **Customer / public (no operator chrome):** `/login` (canonical customer login; `/barber-login` is a kept alias), `/claim/:token`, `/s/:token` (claim view), `/p/:slug` (public site), `/barber` (OwnerDashboard), `/guide`, `/terms`, `/start`.
- **Operator (auth + admin gated):** `/` (Dashboard), `/outreach`, `/inbox`, `/find-leads` (Index), `/templates`, `/paid-clients`, `/feedback`, `/admin/*` (api-usage, clients, site-images, sites list, `/admin/sites/:id`), `/sites/:id` (rep site editor), `/auth` (operator login).
- Guards: `ProtectedRoute` (auth; `redirectTo` defaults `/landing`, customer routes pass `/login`), `RequireAdmin`, `SubscriptionGate`. `PublicRoute` for marketing/login.
- SSR meta: `functions/s/[token].ts` + `functions/p/[slug].ts` inject the barber's title/OG so WhatsApp/social previews aren't the LeadFinder default.

---

## 6. Data model (key tables — all RLS'd)

- **`outreach_leads`** — the CRM row per business. `user_id` (owner/operator, NOT NULL), `business_name`, `phone`, `campaign_id` (nullable FK), `status` (see `src/types/outreach.ts` `LeadStatus`), `contact_method`, enrichment cols (facebook/instagram/email/website + `*_status`), `whatsapp_template` / `queued_at` / `whatsapp_sent_at` / `whatsapp_delivery_status` (queue-set), `is_archived`, `is_potential_work`, `sale_type`.
- **`generated_sites`** — the site. `lead_id` FK, `owner_id` (NULL until claimed; immutable after — protected-fields trigger), `content` **jsonb = `SiteContent`** (businessName, tagline, heroHeadline, about, `services[]`, `hours[]`, `accentColor`, hero/about/logo/gallery URLs, `imagePool[]`, socials, `showExamplePrices`, `servicesConfirmed`…), `site_name` (slug), `template` (`barber`|`salon`|`plumber`), `status` (draft/published/archived), `share_token`, `subdomain`, `is_paid`, `booking_only`, tracking (`first_opened_at`,`claimed_at`,`addon_interest_at`). **Everything editable lives in the one `content` blob — no separate services/images tables.**
- **`campaigns`** — grouping (`name`, `created_by`, `method`, `description`, `default_sale_type`, `default_template`). Team-readable; creator-editable.
- **`whatsapp_sends`** — audit of every queue send attempt (`template`, `message_id`, `delivery_status`, `test_mode`, `error`). Written by the QUEUE only.
- **`whatsapp_messages`** — Inbox log (`direction` in/out, `message_type` text|template, `template_name`, `status`). Written by queue (outbound templates) AND the Inbox reply sender.
- **`claim_tokens`** — one-time hashed claim tokens (7-day TTL). `whatsapp_outreach_state` — single-row queue state (`paused`, `next_send_at`). Plus `profiles`, `user_roles` (admin), `site_events`, `enrichment_cache`, `api_usage_log`, `bulk_jobs`, `instantly_poll_state`, `team_feedback`.

---

## 7. Key subsystems

- **Site generation** (`generate-barber-site`): admin/operator gated; reads lead → Apify/Google enrich → OpenAI copy (honesty-enforced server-side) → inserts `generated_sites`. Duplicate-guard: regenerating an existing lead's full site returns the existing row (no new insert). 40/24h per-user cap. Images uploaded to `barber-site-images` and re-hosted via `rehost-image`.
- **Templates vs shells:** *Templates* (`src/templates/*/…SiteTemplate.tsx`) render the **public** site (`/p/`, subdomain, `/s/` claim preview) and are pure functions of `SiteContent`. *Shells* (`components/barber/BarberShell`, `components/salon/SalonShell`) are the **authenticated owner dashboard** at `/barber`. Barber + plumber → BarberShell (dark/amber); salon → SalonShell. `LiveSiteEditor` is the tap-to-edit editor inside BarberShell; the template has an `editable` mode + `EditableText`/`onEditElement`/`onEditImage` callbacks.
- **WhatsApp outreach** (`process-whatsapp-queue`): the automated sender. Approved templates in a `TEMPLATES` allowlist (`booking_page_intro`, `no_website_barbers`, `barber_poor_website`, `booking_switch_barbers`), each with a Meta `lang`. Sends the template **name verbatim** to Meta; records to `whatsapp_sends` + mirrors an Inbox row via the `mirror_whatsapp_send_to_inbox()` DB trigger. `TEST_MODE` on = simulate (no real Meta call) but still writes rows + advances lead. Manual Inbox replies go through `send-whatsapp-message` (uses `_shared/whatsapp-send.ts` `WA_TEMPLATES`).
- **Claim & auth:** one Supabase user pool. Barbers sign in by **mobile number** (→ synthetic email). `begin-claim`/`claim-info`/`claim-site` handle the one-time claim. Pre-signup edits bridge via `src/lib/barberEdits.ts` (colour in localStorage, photo Files in a module singleton) → applied on claim.
- **Booking** (`create-booking`, `get-availability`, `send-reminders`): booking pages on bookmybarber.uk; SMS reminders are a paid add-on.
- **Payments** (`create-barber-checkout` → Stripe → `stripe-webhook`): flips `generated_sites.is_paid`, unlocks add-ons.
- **Metrics:** `useCampaignStats` (dashboard `CampaignStatsCard`) counts per-campaign funnel from **`outreach_leads.status`** (sent = not `not_contacted`; replied = replied-or-beyond) + `generated_sites` timestamps (opened/claimed/addon) grouped by `campaign_id`. It does NOT read the send tables. `whatsapp_sent_at` (queue-only) distinguishes automated from personal-number sends. Cards now also show per-template mini-funnels.
- **Email outreach:** `instantly-push` / `poll-instantly-replies` (Instantly.ai).

---

## 8. Auth, roles, gating

- **Operators**: `user_roles` row `role='admin'` → full operator app. `RequireAdmin` gates admin routes; `SubscriptionGate` + `useSubscription` gate paid operator features. Non-admins are diverted to `/barber` (if a site owner) or `/login`.
- **Customers (site owners)**: authenticated non-admins with a `generated_sites.owner_id = auth.uid()`. Land on `/barber` (OwnerDashboard). RLS: owners read/write only their own site.
- Leads are strictly private per operator (`outreach_leads` RLS `auth.uid() = user_id`).

---

## 9. Dev, deploy & the workflow conventions

- **Frontend deploy:** push to `main` → Cloudflare auto-deploys. Verify with `npx tsc --noEmit`.
- **Edge functions:** `npx supabase functions deploy <name>` (manual). Verify Deno with `deno check supabase/functions/<name>/index.ts`. NOTE: `generate-barber-site` has 3 **pre-existing** supabase-js generics errors (lines ~59/693/895) — prove pre-existing via `git stash` + re-check, don't "fix".
- **⚠️ MIGRATIONS ARE APPLIED MANUALLY** in the Supabase SQL editor. `supabase db push` is **broken** (history desynced) — see the header of `supabase/migrations/20260701160000_backfill_drifted_objects.sql`. So a migration file existing does **not** mean it's live; and a re-run of an idempotent `create or replace` snapshot can silently revert newer changes. When a DB function/trigger misbehaves, check the LIVE definition (`select pg_get_functiondef('public.<fn>'::regproc);`) before assuming the repo == prod.
- **Working style this project uses:** one **branch per task** off latest `origin/main`; build + tsc/deno-check + show diff, then STOP for review; ship as a separate step (commit → `git fetch` + confirm origin unmoved → `git merge --no-ff` → push). Branches are **kept, never deleted**. Commit/PR co-author: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Multi-line git messages: prefer a message file (`git commit/merge -F file`) — PowerShell here-strings have mis-parsed multi-line `-m` values.
- **Never touch** `Downloads\Barber app\leadfinderapp` (a different, separate app).

---

## 10. Known open items / gotchas (as of this handover)

- **`booking_switch_barbers` shows 0 sends at Meta** — under investigation. Send code sends the name verbatim (not remapped), so the disconnect is either TEST_MODE (simulated, check `whatsapp_sends.delivery_status='simulated'`/`test_mode`) or Meta rejecting the template (name/language not approved at Meta — `lang:"en"` is hardcoded; check `delivery_status` `failed_*` + `error` code `132xxx`). Reconcile with:
  ```sql
  select delivery_status, test_mode, count(*) n, count(message_id) with_meta_id, max(error) err
  from whatsapp_sends where template='booking_switch_barbers' group by 1,2 order by n desc;
  ```
- **`mirror_whatsapp_send_to_inbox()` live drift** — Inbox showed `[booking_switch_barbers]`; the CASE branch exists in migration `20260706140000` but the LIVE function may be stale (manual-migration issue). Check `pg_get_functiondef`; re-run that migration's `CREATE OR REPLACE` if the branch is missing (fixes future sends only).
- **`/barber` dashboard route still says "barber"** and is surfaced to customers in claim/Stripe emails + BarberShell. A full rename was deliberately deferred (touches the route + ~7 refs + email copy). Login was moved to `/login`; the dashboard route was left.
- **De-barbering is in progress** — customer login + owner dashboard were made trade-neutral; other "barber"-named identifiers/components remain by design (first-vertical naming).

---

*This is an orientation doc, not exhaustive. When in doubt, read the file — and for anything DB, trust the live Supabase state over the migration files (§9).*
