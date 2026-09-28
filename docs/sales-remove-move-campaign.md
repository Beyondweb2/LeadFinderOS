# Sales: "No phone listed", Remove from my leads, Move to campaign (2026-09-28)

Paul's brief, from the live Sales Outreach. Branch `fix/sales-remove-move-phone`; merged `de5dad15`.
Migration `20260928230000_sales_remove_and_move_campaign.sql`.

## 1. "No phone listed" — JB7 Plumbing and Heating Limited

- **How it entered:** Find Leads (Plumber / Manchester, search cached 06:46 UTC) → Add, by the Sales
  account `test1` (`c6e21a37`) at **06:48 UTC** — about 50 minutes BEFORE the Place-Details-before-add fix
  went live (merge `b3d3c85b` 07:35 UTC, push after). No `phone_cache` row existed: the lookup never ran.
  It is a pre-fix lead, not a live bug.
- **Did Google have a phone?** Yes. One controlled lookup (as Sales Test, `google-place-details`,
  2026-09-28 10:57): +44 7928 486113, Whalley Range M14 7EN, 4.8 / 430 reviews, town Manchester. Written
  onto JB7's empty fields only (service role, `phone is null and address is null` guard). JB7 already had
  a logged "spoke to owner" call by test1 (10:18) — made without a stored number.
- **The live path works:** the only lead added since the fix (MB & Son Recovery and Repairs, test1, 10:38,
  Find Leads) arrived with phone, address, rating and town.
- **Same pre-fix gap:** 82 roofers added by Sales Test on 2026-09-27 13:54–13:57 (Doncaster / Stockport),
  all with a place id, none looked up, no phone or email. A backfill = 82 Place Details calls ≈ $1.64
  (Enterprise $0.020) — NOT run, needs Paul's approval. Admin path: 14 of ~5,400 leads have no phone; 11
  are genuine (Google's answer, cached, had none), `Damien Smith Locksmiths Newbury & Thatcham` (`cec8fd5b`)
  has +44 7783 072251 in `phone_cache` but not on the lead, `101 Locksmiths` (`17764f58`) was never looked
  up — both added 2026-09-27 ~10:51–10:55. The admin add queues its lookup in the browser AFTER the insert
  (`useOutreach.addLead`), so a closed tab loses it; left as is (admin path, 2 rows).
- **Honest "No phone listed":** Ancoats Barber Shop — Google's fresh answer has no phone.
- **Right field:** the row reads `lead.phone`; `SALES_LIST_COLUMNS` and the `sales_leads` view carry it.

## 2. Remove from my leads — `sales_remove_leads(uuid[])`, sales only

- **Existing model used:** ownership = `assigned_to_user_id`; the claim rule = `lead_contact_attempt_at`
  (every channel, docs/sales-flow-reliability.md §5); archive = `is_archived` (out of both queues,
  `lead_set_archived`); no hard delete for Sales.
- **Per lead, under the row lock:** never contacted → unassigned (`lead_unassigned`, reason
  `removed_from_my_leads`), back in Available to claim if otherwise eligible; contacted → archived, owner
  KEPT (`archived_set`, same reason) — never unassigned, so it can never look untouched, and never
  claimable. Status is never rewritten; no contact row is ever written. Refused: not theirs or a client
  (`not_yours`), an opener waiting (`queued`), `won_pending_onboarding` or a questionnaire on file
  (`onboarding`), the admin (`sales_only`).
- **UI:** the lead workspace (Work tab, bottom card, closes the workspace after) and the Outreach
  selection bar, both behind a confirmation that lists the three outcomes. Words in `salesCrm.ts`.
- ⚠️ **Gap, left for Paul:** the Outreach page shows active AND archived leads in one list for both roles
  (`allLeads` in `Outreach.tsx`), with no archived marker or filter. So a CONTACTED lead that is removed is
  archived correctly but stays visible in the rep's list. An untouched one leaves at once.

## 3. Move to campaign — `leads_set_campaign(uuid[], uuid)`, both roles

- Runs `lead_set_campaign` (the workspace card's function) on each lead: own non-client leads, existing
  campaign, the one `outreach_leads.campaign_id`, one `details_set` row per change; not-yours skipped and
  counted; an unknown campaign moves nothing. Sales' picker is pick-only (`hideCreate`). The admin's bulk
  path (direct update) is unchanged. `perms.moveToCampaign` (both) / `perms.campaigns` (admin: create/edit).

## 4. Tests and deploy

- `scripts/sales-remove-move-campaign.test.ts` (in `npm test`); `sales-shared-workflow.test.ts` updated
  (assignCampaign now routes Sales to the RPC; `LeadWorkPanel` takes `onRemoved`).
- `supabase/tests/sales-remove-move-campaign.sql` — **36/36 live, rolled back** (run with the migration
  inside the same transaction before it was applied).
- Gate: 218/226 — the same eight failures as untouched main `2bbff199` (217/225).
- Order: migration (6 statements, one at a time; read back: both SECURITY DEFINER, anon false,
  authenticated true, bodies md5-equal to the file) → main `de5dad15` → leadfinderos-next entry
  `index-Ntz8t-Je.js` → `index-BF8YxgB3.js` (markers in Outreach / useSalesCrm / salesCrm chunks).
- **Live QA (Sales Test, one-time link, logout 204, refresh refused after):** five leads "QA SRM Test n
  (delete me)", fictional 07700 9009xx. Campaign: one lead 313 ms, three 326 ms, view + column agree,
  test1's and Paul's refused (`not_your_lead`, Paul's unchanged), `sales-performance` 200 shows the
  campaign. Remove: untouched → released and in `sales_pool`; a logged no-answer call → archived, still
  Test's, not in the pool; test1's and a paying client refused. Production UI as Sales Test: bulk move
  (options = existing campaigns only), bulk remove, workspace remove (closed, list 85 → 84 → 83),
  Available to claim shows the released two and not the contacted one, 375 px with no sideways scroll,
  no console errors. Cleaned: 5 leads + 12 activity rows deleted by id; 0 left.
- ⚠️ One `bulk_queued` activity row was found on a QA lead at clean-up — an opener queue call this
  session never made (it needs a template picked in a dialog). No WhatsApp message or send row exists
  for any 07700 9009xx number and the lead is deleted. Most likely the test1 account (in live use
  today) on the QA lead assigned to it; the logs endpoint could not confirm it.

## 5. Closeout pass (2026-09-28, later) — merge `a6a45c01`

- **Archived leads off the Sales list:** Sales Outreach shows ACTIVE leads by default; archived ones are
  under Filters → "Archived (removed or not interested)" (`rowsForArchiveView`, `src/lib/outreachLoad.ts`).
  The admin keeps the unified list. Live as Sales Test: a contacted, removed QA lead was absent from
  "Outreach (84)" and the only row under "Archived (1)"; owner, history and contact kept; not claimable.
- **Phone backfill (the 82 pre-fix Test roofers):** `google-place-details` as Sales Test, one at a time,
  blank fields only. 82 attempted · 80 phones · 2 genuinely none on Google (Roof Rhino Ltd, PRECISION
  ROOFERS LTD — address/town filled) · 0 failed · $1.64 in `api_usage_log` (82 × $0.020, 0 cache hits),
  trigger `backfill_presfix_sales_20260928`. 82 addresses, 82 towns, 76 ratings.
- **Damien Smith Locksmiths:** +44 7783 072251 copied from `phone_cache` (no Google call; phone only).
- **test1** (`c6e21a37`): a Sales account Paul invited at 06:42:45 today and opened 31 s after his own
  admin sign-in, same browser — his second role-QA login (display name "test1"), not a hired rep. It added
  JB7 and MB & Son, logged a call, and at 10:50 queued `initial_contact` on MB & Son (a REAL business,
  still queued; the WhatsApp queue has been PAUSED since 2026-09-27 10:05, so nothing sends until it is
  un-paused). The earlier QA-lead `bulk_queued` row was deleted with the lead; nothing retained attributes it.
- **QA cleanup:** removed "QA Domain Test Plumbing" (`f67133ec`) and its questionnaire (`96f1af3c`) —
  QA Tester / qa-tester@example.com / 07700 900741 / example.com, no payment, nothing else referenced it.
  Retained campaigns "roofers 2" (82 real roofers) and "test" (49 real dentists, Paul's).
- **Paid-client writes admin-only** (migration `20260928240000`): restrictive INSERT/UPDATE/DELETE on
  `client_pages`, `client_page_questions`, `client_listings`. Before: a Sales login could create page
  records against its own lead, a paying client's and Paul's (proven live, rolled back). After:
  `supabase/tests/client-tables-admin-only.sql` 32/32; live Sales POSTs 403 (42501), PATCH 0 rows; the
  service-role server path still writes. All 14 SQL suites re-run green (434 checks).
- **config.toml:** the 12 missing functions recorded at their live `verify_jwt` (send-whatsapp-message
  and enrich-business false, ten true), checked against callers; no redeploy (production already ran
  them). `scripts/function-config-complete.test.ts`.
- Gate: 219/227, the same eight known failures.
