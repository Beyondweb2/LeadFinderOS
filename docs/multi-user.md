# Multi-user: ADMIN + SALES on one book (2026-09-27)

Built on branch `feat/multi-user-sales`. Paul's decisions for this work (asked 2026-09-27, not to be
re-asked): **overturn deep-clean step 7** (the multi-user surface is kept and extended, not deleted);
**leave the existing duplicate leads and block new ones** (merge later, if ever); **salespeople may
browse the unassigned pool**; **invites are a one-time link Paul sends himself** (no SMTP). Peer
pipelines are private by default: a rep sees another rep's lead only as "Already added · <name>".

## 1. The model

- **One book.** Every row keeps `user_id` = the data account (`team_members.is_book_owner`,
  `public.book_owner_id()`). Crons, queues, reports and dashboards read one book exactly as before.
- **Who works a lead** is `outreach_leads.assigned_to_user_id` (+ `assigned_at`, `added_by_user_id`).
- **Roles:** `admin`, `sales` only. Source: `public.user_roles` (deny-all writes for every signed-in
  role; only the service role, i.e. `admin-users`, writes it). `public.my_role()` in SQL,
  `resolveActor()` in `_shared/access.ts`, `useSubscription().role` in the SPA — all positive match.
  Pure rules: `src/lib/roleRules.ts` (`pickRole`, `canWorkLead`, `isClientLead`, `salesAuditRefusal`).
  A future `sales_manager` = one more role value + one branch in `canWorkLead` / `can_work_lead`.
- **Disable** = remove the `sales` role row (every RLS policy and edge function refuses on the next
  request) + ban the auth user (no refresh) + `team_members.status = 'disabled'`. Nothing deleted;
  `admin-users` refuses to delete a team member.

## 2. Permission matrix

⚠️ **Superseded by §9 (same day): Sales now uses the SAME Outreach and Inbox.** The SPA copy is
`PERMISSION_MATRIX` in `src/lib/access.ts` (shown on /team). Routes a salesperson may open:
`/outreach`, `/inbox`, `/find-leads`, `/coverage` (+ the redirect-only `/sales`,
`/sales/lead/:leadId`) — everything else redirects to `/outreach` before the page mounts (`RequireAccess`). **Presentation only**; the rows
below are what the server enforces.

| Feature | Admin | Sales |
|---|---|---|
| My leads / lead page | all prospects | own assigned prospects |
| Conversations, replies, templates, voice notes | all | own leads (send-whatsapp-message / -voice check the assignment) |
| Bulk outreach | Outreach table | `sales_queue_opener`: the admin's selected opener only, never-contacted own leads |
| Hook audit | yes | own leads only (`create-ai-audit` → `salesAuditRefusal`) |
| Check before calling (bulk AI check + website check) | no (admin bulk audits instead) | own active leads only, `SALES_CHECK_BATCH_MAX` per press, a daily allowance, recent results reused (`sales-prospect-check`, fix/07) |
| Full measurement / Discovery / Baseline / Remeasure | yes | no |
| Coverage, niche verdict | yes | yes (book-wide counts, no lead names) |
| Find Leads search | yes | yes (`search-leads` requires admin or sales) |
| Add a business | as before | `sales_add_lead` — refuses an existing one |
| Claim | (assigns) | unassigned + never contacted (`lead_contact_attempt_at`: any genuine attempt on any channel, 2026-09-28) + not archived + not a client |
| Campaigns | create / edit / delete (RLS, restrictive, 2026-09-28) | read all; set one on an own lead (`lead_set_campaign`); no create/edit/delete |
| Assign / reassign / unassign | `assign_lead`, Team "move all" | no |
| Notes, follow-up, call booked, call outcome, website control | all | own leads |
| Stages | all | interested, price_given, not_interested, won_pending_onboarding |
| Paid clients, delivery, website build, welcome packs, page generator, page plan, mockups, playbook | yes | no |
| Sales dashboard (`/sales-dashboard`, fn `sales-performance`, 2026-09-28) | anyone / everyone | own leads only, counts + won names, no money |
| Dashboard, revenue, Stripe/payment data, submissions | yes | no |
| Team, invites, disable | yes | no |
| API usage, Apify usage, queue controls, templates page | yes | no |

## 3. Database (migrations 20260927100000 … 100400, applied one at a time and read back)

- `app_role` gains `sales`.
- `team_members` (name, status, book owner, invited/disabled by, `daily_send_limit` — nothing sets a
  limit yet; `sales_queue_opener` honours one if set). RLS: admin reads all, a member reads own row.
- `lead_activity` — append-only (no write policy; only the SECURITY DEFINER functions insert).
  Kinds: added, claimed, assigned/unassigned (from→to), note, stage_changed, follow_up_set,
  call_booked, call_outcome, website_control_set, audit_run, bulk_queued.
- `outreach_leads` + `assigned_to_user_id, assigned_at, added_by_user_id, website_control,
  website_control_note, next_action_note`. `whatsapp_messages` + `sent_by_user_id`.
- **`sales_leads` view** — security_barrier, SELECT-only grant, no anon. No money/delivery columns
  (`amount_paid` is a literal NULL), never a client (`lead_is_client`), only `assigned_to = auth.uid()`
  for sales.
- **Restrictive policies**: `outreach_leads` (all commands) and INSERT/UPDATE/DELETE on `ai_audits`,
  `ai_audit_runs`, `ai_audit_queue` require `my_role() = 'admin'`. Without them the old
  `auth.uid() = user_id` policies would let a sales login insert its own leads (dodging one-record)
  or its own audit-queue rows (spending Apify money). `lead_claims`/`lead_notes` (dead, `SELECT true`)
  closed the same way.
- **Additive sales SELECT policies**: hook audits (+ runs, queue) on own leads; messages on own leads
  or their phones; crawl checks; page hits; the book's templates; own activity.
- **Functions** (all role-checked inside, all `revoke … from public, anon`): `my_sales_lead_ids`,
  `my_sales_audit_ids`, `my_sales_message_phones` (the policies' sets), `my_role`,
  `book_owner_id`, `can_work_lead`, `lead_first_contact_at`, `lead_identity_lookup`, `claim_lead`
  (row lock, `FOR UPDATE`), `assign_lead` (admin), `sales_add_lead`, `lead_set_stage`,
  `lead_set_follow_up`, `lead_set_call_booked`, `lead_add_note`, `lead_record_call`,
  `lead_set_website_control`, `sales_pool`, `team_directory`, `sales_queue_opener`.
- **Triggers**: `trg_outreach_leads_identity` (BEFORE INSERT: a place id already in the book is
  refused, advisory-locked; updates are not checked); `trg_whatsapp_messages_assign` (a sent/read or
  inbound message on an UNASSIGNED lead assigns it to the sender if a team member, else the book
  owner; never reassigns; never blocks the message).
- **Found in the audit and closed**: the pg_cron invokers (`invoke_whatsapp_queue` etc.) were
  EXECUTE-able by anon — revoked (cron runs as postgres; runs verified succeeding after).

### One business = one record

- **Identity**: place id, then `phone_key(phone)` (digits, `0`/`44`/`0044` removed), then Maps URL.
  Name alone never matches (chains). The trigger enforces place id for EVERY insert path; phone and
  Maps URL are enforced for sales adds in `sales_add_lead` (a shared phone can be ambiguous; the
  free-check lane keeps its town rule). The admin's browser dedupe is unchanged.
- **Existing duplicates left alone** (Paul): 83 place ids on 172 rows (39 groups contacted more than
  once), 124 repeated phones, measured 2026-09-27.
- **Contacted = genuine stored history** (`lead_first_contact_at`): an outbound message
  sent/delivered/read, ANY inbound message, a successful `whatsapp_sends` row — by lead OR by the same
  phone — the lead's legacy send stamps, or a questionnaire on file. Never: found, crawled, audited,
  added. A contacted lead is never claimable, whatever its assignment.

### Migration outcome (2026-09-27)

Backfill filled the NEW column only (`updated_at` untouched): **2,880 leads → the book owner (Paul)**
(contacted by the rule above, or a client), **2,431 unassigned**, of 5,311. Message authorship was
not rewritten.

### The sales policies cost the admin nothing (migration 20260927100500)

The first sales SELECT policies called `can_work_lead(lead_id)` / `sales_can_see_phone(phone)` per row.
They were replaced within the hour by policies that compare against SETS computed once per statement
(`my_sales_lead_ids()`, `my_sales_audit_ids()`, `my_sales_message_phones()` — SECURITY DEFINER,
return nothing at once for a non-sales caller) behind a `(select my_role())` initplan. EXPLAIN on the
Inbox's audits+runs read as the admin: the sales branch is evaluated once and its subplan is
`never executed`. ⛔ Never put a per-row function call in a sales policy.

⚠️ **Pre-existing, found while verifying (not caused by this work):** the Inbox's `audit_gemini_signal`
read and its `ai_audits → ai_audit_runs(results->…)` embed run close to the `authenticated` role's
8 s statement timeout (measured WITHOUT the sales policies: gemini 3.5–8.7 s, audits 1.5–3.7 s, the
cost being the detoast of every run's `results` plus the per-row `auth.uid()` in the old policies),
so under the Inbox's parallel load one of them intermittently answers 500 (57014).

## 4. Edge functions (all 26 redeployed — see the commit)

- `_shared/access.ts`: `resolveActor` (operator-auth + role), `requireAdmin`, `userTeamRole`,
  `leadAccess` (admin: exactly the old `lead.user_id === caller`; sales: assigned + not a client,
  book = the lead's owner), `mayWriteLeadId`, `bookOwnerId`, `isInternalCall`.
- **Admin-only now**: `paid-client-hub`, `paid-baseline`, `page-generator`, `submissions` (was:
  every signed-in user got every questionnaire + amount paid), `apify-usage-status` (was: callable
  with the anon key), `admin-users`, and `coverage` suppress/unsuppress.
- **Role required** (a disabled account is refused even with a live token): `google-place-details`,
  `check-website`, `extract-email`, `extract-facebook`, `review-reply`, `scan-site-details`,
  `playbook-evidence` (was: anon-callable; `check-directory-listings` now sends CRON_SECRET),
  `search-leads` (admin OR sales).
- **Sales on own leads**: `send-whatsapp-message` (+ `sent_by_user_id`; BUILD_ID `2026-09-27b`),
  `send-whatsapp-voice`, `voice-note-script`, `warm-lead-reply`, `prospect-preview`,
  `enrich-business`/`enrich-lead` (were: any lead id), `create-ai-audit` (hook only, audit filed in the
  book), `process-whatsapp-queue` (`contact_check` only), `coverage`/`market-view` (book-wide read).

## 5. Screens

- `/sales` SalesHome — needs attention (replies, follow-ups due/overdue, calls), pipeline counts, my
  leads with filters + "Send opener to N", the available pool with Claim, recent activity.
- `/sales/lead/:id` SalesLead — owner, stage, conversation, reply / template (Preview = dry run) /
  voice note, voice-note script, call playbook, hook check + run, next action, call booked, call
  outcome, website control, INTERNAL note, activity timeline. The admin can open it too (Inbox → CRM).
- `/team` — invite (link), new link, disable / re-enable, move all leads, the matrix.
- `/set-password` — where an invite lands.
- Find Leads — sales: Add (new) / Claim / Yours / "[PS] Already added · Paul"; admin: unchanged
  buttons + an owner marker. Inbox header: `LeadOwnerControl` (owner + assign + CRM link).
- Stages are a READING of `status` (`salesStageOf`); the only new status is
  `won_pending_onboarding` (not money: `isPaidLead` ignores it; grants nothing).

## 6. Tests

- `scripts/role-rules.test.ts`, `scripts/access-matrix.test.ts`, `scripts/sales-crm.test.ts` (in
  `npm test`).
- **Re-running the security tests** against the live database:
  `supabase/tests/multi-user-rls.sql` (70 checks) and `supabase/tests/multi-user-queue.sql` (8). Send
  each file as one query to the Management API (CLAUDE.md §2). Each starts `begin;` and ends by
  RAISING its results, so it can never commit; fake users are on `example.invalid`. 2026-09-27:
  70/70 and 8/8 on the live schema.
- **Concurrency** (two real sessions, same lead): A's claim 25 ms and held; B's claim waited
  5,959 ms on A's row lock. (A was rolled back, so B then won; the in-transaction test shows a second
  claim after a committed first one gets `already_owned`.)

## 7. Known limitations (2026-09-27)

- **The Inbox list** does not show owner avatars (the header does). ~~The Inbox is admin-only~~ — Sales uses it since §9.
- ~~Sales cannot see inbound media~~ — fixed the same day, see §8.
- A disabled user's **access token** stays valid until expiry (≤1 h), but every RLS policy and edge
  function refuses them at once (role row removed); the ban stops refreshes.
- **Per-user send limits**: the column and the check exist; no limit is set. The global WhatsApp cap
  is shared by the whole team (one number).
- `request-call`, `stripe-webhook`, `notify-onboarding-submit` still email the admin address, not
  the lead's owner.
- ~~Sales-added leads skip the browser's Place Details top-up~~ — fixed 2026-09-28: Sales looks the
  place up BEFORE the add and `sales_add_lead` stores the phone, address, rating and town
  (docs/sales-flow-reliability.md).
- Auth config: `site_url` must be the production app and the redirect allow-list must include
  `/set-password`, or invite links land on localhost.

## 8. Sales and WhatsApp media (2026-09-27, migration 20260927120000)

- **Why it failed:** every stored file sits under the BOOK OWNER's folder (inbound:
  `<lead owner>/<sha256(wamid)>.<ext>`; sent voice notes: `<book owner>/voice-out-<id>.ogg`), and the
  bucket's only read policy was "own folder or admin". A salesperson owns no folder, so
  `createSignedUrl` refused; the sales thread also never asked (it showed "[voice note]").
- **The rule:** storage policy `whatsapp media read assigned sales` (SELECT only, additive; the admin
  policy is untouched) = `bucket_id = 'whatsapp-media'` AND `(select my_role()) = 'sales'` AND
  `name in (select my_sales_media_paths())`. The set is built from `whatsapp_messages.media_path`:
  media → message → lead in `my_sales_lead_ids()` (assigned to the caller, not a client); a message
  with NO lead id counts through the rep's own phones. Never from the object's name, so a guessed
  path matches nothing. Disabled (role row removed) and reassigned fall out on the next request.
- **One viewer:** `src/components/WhatsAppMedia.tsx` (`InboundMedia`, `isPlayableVoice`), moved out of
  Inbox.tsx and used by Inbox and SalesLead. It asks Storage under the caller's session; a refusal
  shows "Attachment unavailable".
- **Limit:** a signed link already issued stays valid until it expires (5 minutes). A reassigned or
  disabled rep cannot get a NEW link; one fetched in the last five minutes still opens.
- **Tests:** `scripts/sales-media-access.test.ts` (shape, in `npm test`);
  `supabase/tests/sales-media-rls.sql` (23 checks on the live schema, always rolled back: own image,
  voice note and document open; Paul's, another rep's, a paid client's, an unreferenced object,
  another private bucket, anon, a reassigned lead and a disabled account refused; admin sees all).

## 9. One workflow: Sales uses the same Outreach and Inbox (2026-09-27, migration 20260927140000)

Paul: *"I do not want two different CRMs/workflows for Admin and Sales."* The dedicated My Leads
workspace (`/sales` SalesHome, `/sales/lead/:id` SalesLead) is **deleted**; a salesperson opens the
normal Outreach and Inbox — the same pages, the same components — with fewer admin-only controls.

- **Routes/nav.** Sales: Outreach, Inbox, Find Leads, Coverage (sidebar in that order; home =
  `/outreach`). `/sales` → `/outreach`; `/sales/lead/:id` → Outreach with that lead's detail open
  (`LegacySalesLeadRedirect`, the `launch` intent). **Review Replies is admin-only** at the menu, the
  route and the server (`review-reply` answers 403 `admin_only` before any OpenAI spend).
- **Reads.** `leadSourceFor(role)` (`src/lib/outreachLeadColumns.ts`): admin → `outreach_leads` with the
  speed pass's `OUTREACH_LIST_SELECT` (unchanged); sales → the `sales_leads` view with
  `SALES_LIST_SELECT` (the same list cut to the view) and, for one lead's detail, `SALES_DETAIL_SELECT`
  (every view column, named — never `*`). The Inbox does the same (`inboxLeadTableFor`). The browser
  never receives `notes`, payment, delivery or `user_id`: the view does not have them, and
  `amount_paid` is a literal NULL.
- **Writes.** Sales has no direct write on `outreach_leads` — and a direct update from a sales session
  is a **silent 0-row success**, so the UI would lie. Every salesperson edit is translated by
  `planSalesPatch` (`src/lib/salesPatchPlan.ts`, positive match; any unknown key → nothing written)
  and run by `salesPatchLead` (`src/lib/leadRpc.ts`) through the ownership-checked functions.
  `useOutreach` routes every writer for a salesperson (update, status, next action, archive, star)
  and refuses the admin-only ones (remove, reset, import, campaigns, phone lookups) out loud.
- **New functions (additive, `_require_work` first, anon revoked, each logs `lead_activity`):**
  `lead_mark_interested` (the ⭐ flag — "Interested" is a star on both roles' screens, not a status),
  `lead_set_details` (contact name / trade / town only; NULL = leave alone), `lead_set_archived`
  (archive/restore; not-interested archives, as the admin's does). `lead_set_follow_up` now accepts
  every `next_action_type` value (the enum is the allowlist). `lead_activity.kind` gained
  `marked_interested`, `details_set`, `archived_set`. No RLS policy changed.
- **`process-whatsapp-queue`**: sales may also call `suppress_lead` — only for a lead they work
  (`leadAccess`) — so "not interested" stops contact for a salesperson as it does for the admin.
- **The shared lead detail** (`LeadDetailDialog`, both roles, Outreach and Inbox) carries
  **`LeadCrmPanel`**: Hook Audit (run + evidence), owner (admin reassigns via `assign_lead`; sales sees
  it), next action + follow-up note, call booked, record a call, website control, internal notes
  (never sent), the activity timeline. Everything the old SalesLead page held; nothing moved in the data.
- **What Sales does not get** (`leadPermissions`, `src/lib/access.ts`): record editing (name,
  contact fields, contact-method tag), remove/reset, import, enrichment admin (enrich, find emails,
  phone lookups, fix town, bulk trade), bulk audits, campaigns, product, the crawl check (admin-only
  server), client delivery (cockpit, questionnaire, playbook, welcome pack, payment, Mark Paid, SEO
  scan), queue/automation settings (queue panel, Send now, the first-reply rule, the hook/contact
  follow-up lanes, Remove-from-queue), the AI Audit page, the admin's private note. Statuses: the four
  lead_set_stage allows plus the star; the rest show disabled.
- **Available to claim** is a tab inside Outreach (`AvailableToClaim`: `sales_pool` + `claim_lead`).
- **Tests:** `scripts/sales-shared-workflow.test.ts` (120 checks), `scripts/access-matrix.test.ts`
  (rewritten), `scripts/initial-opener-select.test.ts` (rewritten, see whatsapp-templates.md);
  live: `supabase/tests/sales-shared-workflow.sql` — 37/37 on 2026-09-27 (own-lead edits, Paul's
  lead / a client / another rep refused, direct UPDATE = 0 rows, view scope and columns, anon, admin
  reassign keeps the record and history); `multi-user-rls.sql` 70/70 (its team-directory count now
  counts real members — the real Test salesperson made the old fixed 3 stale), `multi-user-queue.sql`
  11/11 (now with the chosen template), `sales-media-rls.sql` 23/23.
- **Live verification (2026-09-27, main `a2134d9d`, leadfinderos-next).** Deployed: migration 140000
  (all 15 statements, the 1-arg `sales_queue_opener` refusal last — after the frontend was live),
  `send-whatsapp-message` (preflight `2026-09-27c` / `any_approved_opener`), `process-whatsapp-queue`,
  `review-reply`, `warm-lead-reply` (bundle markers read back). Sales Test via a one-time link: `/sales`
  → Outreach; nav Outreach/Inbox/Find Leads/Coverage; claimed Cardiff Bay Dental from Available to
  claim; note, follow-up (note kept), call booked, call outcome, website control, star — all through
  the lead functions, zero browser requests to `outreach_leads`; Hook Audit run and its rivals shown;
  both openers dry-run OK on an own lead; Inbox lists only own leads, both openers enabled. Refused:
  Paul's lead/messages, the table, `notes`, a direct PATCH (0 rows), `lead_set_details` on Paul's lead,
  review-reply / paid-client-hub / submissions / admin-users / queue settings (403). No real message
  was sent or queued (dry run is the same send path; the batch queue is proven by the rolled-back SQL
  suite). Admin: full nav, queue panel, all bulk tools, both openers in the queue dialog with no global
  control, payment/playbook/private note in the detail, reassigned Cardiff Bay Dental back to
  Unassigned (same record, 9 activity rows kept), Inbox automation + Send now, Review Replies opens.
  Both QA sessions ended with `logout?scope=local` (refresh refused after). ⚠️ Cardiff Bay Dental keeps
  the QA values (star, follow-up 2 Oct, call booked 1 Oct, website control "agency", QA note) — clear
  them by hand if wanted.
