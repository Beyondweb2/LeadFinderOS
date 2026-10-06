# 07 — Security and permissions

*Live state 2026-10-05. Records: `docs/multi-user.md` (read before touching auth, RLS or any lead read/write),
`docs/abuse-cost-protection.md`, `docs/pre-sales-certification/fixes-01-security-inbound.md`, `security-reliability.md`
(the full report is on branch `cert/e-security-reliability`).*

## The ground truth

- **RLS (row-level security) is the only barrier to the internet.** `anon` and `authenticated` hold full table grants on the
  public tables and the anon key is in the JS bundle by design. Some tables are service-role-only purely by having zero
  policies (they read as `200 []`, not "denied"). Do not touch a policy "because it's single-user".
- **No UI-only security.** Hiding a button is presentation. Every rule below is enforced in SQL (RLS / SECURITY DEFINER
  functions) and/or in the edge function, server-side.
- **Roles come from `user_roles` only** (no signed-in user can write it; `admin-users` does as service role). SQL
  `my_role()`, edge `_shared/access.ts` (`resolveActor` / `requireAdmin` / `leadAccess`), SPA `useSubscription().role`; pure
  rules once in `src/lib/roleRules.ts`. Never a role from a request body, `user_metadata` or the browser.
- Live: **1 admin, 2 sales** accounts (one is the excluded "Test" rep); `team_members` has 3 rows.

## Role model

| | Admin (Paul) | Sales |
|---|---|---|
| Leads | the whole book (~5,550) | **only leads assigned to them** (`assigned_to_user_id`) via the `sales_leads` view; never `outreach_leads` (holds Stripe/amount/refund/delivery columns) |
| Writes to leads / audits | direct (RESTRICTIVE policies allow admin only) | only through SECURITY DEFINER functions (`claim_lead`, `sales_add_lead`, `lead_set_*`, `sales_queue_opener`…) which log to `lead_activity`; a direct update from a sales session is a SILENT 0-row success |
| Pages | everything | `/sales-dashboard`, `/outreach`, `/campaigns`, `/inbox`, `/find-leads`, `/coverage` (`src/lib/access.ts`); a new page is admin-only by default |
| Costs | sees them | never sees a cost (refusals say `USAGE_PAUSED_DETAIL`) |
| Bulk audits | admin `bulk-jobs` | only `sales-prospect-check` (own leads, allowance) — `perms.bulkAudits` false |
| CSV export | yes | none; Copy Numbers is logged (`log_data_access`) |
| Lead identity lookup | real ids | masked |
| Find email / paid Enrich | admin | admin-only |
| Client delivery, Paid Clients, Website Build, Team, API Usage & Security, AI Audit | admin | no |

- Every row keeps `user_id` = the book owner (the data account); who works a lead is `assigned_to_user_id`. The seller is
  `sold_by_user_id` (stamped at payment).
- A new edge function must call `requireAdmin` or resolve the role and check the lead with `leadAccess` / `canWorkLead`
  (`scripts/role-rules.test.ts` lists them). One that spends for a signed-in person must call `guardAction`.

## Critical protections (all certified 2026-10-05)

- **Salesperson sees own leads only** — and "not yours" is answered FIRST, so a rep never learns whether another person's
  lead exists, is archived or is a client (no existence oracle). Re-judged when results are shown (a reassigned lead
  disappears from the old rep).
- **Paul's saved templates / quick replies are private** — migration `20261006010000_templates_owner_only.sql` removed the
  sales read policy; a rep reads 0 templates.
- **Campaigns are owned and private**; another owner's campaign answers `not_found`, never a name.
- **Client separation** — reps never read client money/delivery columns; clients are skipped by sales checks; the Client tab
  is admin-only.
- **Crawl / run cross-lead protections** — `crawl-check` refuses ids that are not the rep's lead (`salesCrawlIdsRefusal`); a
  rep crawls only a lead they work, its own website; audit results attach only to their own lead.
- **Test-account exclusions** — test accounts and `ZZ QA` leads are in `metric_exclusions` (excluded by ROW, never by name);
  every WhatsApp sender asks `qaSendHold` (fixture → simulated; a real lead pressed by a test account → refused); a QA lead's
  client email goes only to the QA inbox (`qaEmailHold`).
- **Archived leads** — off both Outreach and Inbox lists, skipped by sales checks, never claimable; archiving stops contact
  in both queues and the reply/audit paths.
- **Bulk-audit permissions** — sales bulk checks only via `sales-prospect-check` (own active leads, 50/day, 20/batch,
  prospecting pool, guard row per check); the admin `bulk-jobs` stays admin-only.
- **Admin-only functionality** — Team (invite / disable), API Usage & Security (limits, pause modes, suspension), Paid
  Clients, Website Build, AI Audit, Coverage niche check Run, paid Enrich, payment / delivery / client tab.
- **Abuse / cost guard** — one server guard (`guard_action`) for suspension, global pause (`prospecting_paused` /
  `all_stop`), bursts and spend; suspension = `team_members.suspended_at`; Disable removes the role row.
- **Sign out is GLOBAL** (`supabase.auth.signOut()` ends every session on that account) — to end only a test session,
  revoke it with `/auth/v1/logout?scope=local` using that session's token.
- **Opt-outs** — an explicit opt-out blocks every marketing send, paying clients included; suppression stays exactly as
  strict as it is.
- **Vault** — cleaned 2026-10-05 (two malformed entries whose names were key material deleted; 3 real secrets remain:
  `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, read by name by database functions).
- **Repository secrets scan (2026-10-05):** no real secret is committed in any tracked file; no `.env` is tracked. Old
  history contains only the public Supabase **anon** key (acceptable — it is public by design).

## 🔴 WhatsApp hold — read this before touching WhatsApp

**Current situation:**

- **Move37's production WhatsApp setup remains live.** All sending and the inbound webhook run on the Move37 Meta app /
  WhatsApp Business number (secrets `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
  test-mode pair `WHATSAPP_TEST_MODE` / `WHATSAPP_TEST_NUMBER` — names only).
- **The new Findable Meta / WhatsApp setup is pending** (Paul is creating it).
- **The new fail-closed `whatsapp-status` version is intentionally NOT deployed.** Live `whatsapp-status` is still **v114
  (2026-09-30)** — confirmed via the Management API on 2026-10-05. The new code (in `main`) verifies Meta's
  `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET` and **refuses every unsigned/unverifiable POST** — deploying it before the
  correct secret exists would cut off all inbound WhatsApp replies. The post-call reply matcher rides the same deploy, so it
  waits too.
- `WHATSAPP_APP_SECRET` is **not set**. ⛔ **Do not guess the App Secret**, do not set a placeholder, do not copy Move37's.
- ⚠️ Any routine "redeploy every function that reaches a shared module" must **skip `whatsapp-status`** until cutover.
  `send-whatsapp-message` and `process-whatsapp-queue` CAN be redeployed (they were on 2026-10-05).

**Future cutover order (do not reorder):**

1. Findable Meta app + WhatsApp Business number ready (Paul).
2. The exact **Findable App Secret** configured as `WHATSAPP_APP_SECRET` (Paul supplies it; Claude never prints it).
3. Deploy the held `whatsapp-status` (from `main`).
4. **Signed inbound QA**: a genuine signed reply is accepted; an unsigned POST → 401.
5. Deliberate **Move37 → Findable cutover** (access token, phone number id, verify token, webhook URL, templates re-registered
   under Findable with names matching exactly — a template lives in eleven places in code).

Compliance position on WhatsApp outreach: reviewed and NON-BLOCKING (Paul, 2026-10-02) — `docs/whatsapp-outreach-compliance.md`.

## Where secrets live (names only — never values)

| Platform | Secret names (examples) | Used for |
|---|---|---|
| Supabase → Edge Function secrets | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `OPENAI_API_KEY`, `APIFY_API_TOKEN` / `APIFY_TOKEN`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `COMPANIES_HOUSE_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FINDABLE_*_PRICE_ID`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `WHATSAPP_*`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_BROWSER_TOKEN`, `TEAM_APP_URL`, `FINDABLE_SITE_ORIGIN`, `FINDABLE_ALLOWED_ORIGINS`, `AUTO_AUDIT_REPLY_ENABLED` | every edge function |
| Supabase → Vault | `CRON_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | cron jobs / DB functions calling edge functions |
| Cloudflare Pages build env | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | the operator app bundle (public values) |
| Windows Credential Manager (this PC) | `Supabase CLI:supabase` (an `sbp_…` personal access token) | Claude's SQL / deploy access via the Management API and CLI |
| Provider dashboards | Stripe, Meta, Apify, OpenAI, Google Cloud, Resend, Companies House, Cloudflare, GitHub | the source of each key |

Never paste a secret value into a doc, a commit, a chat or a log. Name the SHAPE of a bad secret, never its value.
