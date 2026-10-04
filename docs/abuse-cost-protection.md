# Abuse / API-cost / lead protection (2026-09-29)

Branch `security/abuse-cost-protection`. Paul's brief: protect against API-credit abuse, a malicious or
compromised Sales account, lead scraping, runaway jobs and direct API bypasses — **without friction for a
normal productive rep**. Paul's decisions (2026-09-29, not to be re-asked):

- **Two pause levels, one control.** "Pause paid prospecting" stops paid work people start + the drip's
  pre-send hook audits; **client measurement keeps running**. "Emergency stop" stops **everything paid**,
  client work included, until released. The automatic team cap restricts **Sales only**.
- **Claims:** warning at 100/day, hard 60/hour and 200/day. Abuse limits, not targets. Configurable.
- **Sales CSV export: removed** (screen and server). Admin keeps it, logged. **Copy Numbers stays** for
  calling: own leads only, per-copy / hour / day limits, every copy logged, a large one warns.
- **WhatsApp webhook:** build the enforcement, never invent the secret; show the risk until it is set.
- Provider billing controls are Paul's to set by hand (section 9).

## 1. The model — one ledger, one event log, one settings row, one guard

| Piece | Where | What |
|---|---|---|
| Ledger | `api_usage_log` (+ `action`, `actor_role`, `lead_id`, `outcome`, `reason`) | Every provider charge (as before) AND one `api_type = 'guard'` row per guarded attempt: who, role, action, lead, units, estimate, allowed / warned / refused, why. **The counters ARE the ledger** — no second store. A guard row is never a provider charge (`api_type is distinct from 'guard'` in every total; `admin-api-usage` and `search-leads` exclude it with `.or()`, since `.neq()` drops NULLs). |
| Events | `security_events` | Warnings, restrictions, refusals, exports, suspensions, mode / threshold changes, system alerts. `alert_key` = who:what:action:day, so repeats bump `occurrences` and email once a day. Admin reads (RLS); nobody signed in writes. |
| Settings | `protection_settings` (id 1) | `mode` (running / prospecting_paused / all_stop), `limits` (jsonb), `overrides` (per-user unlock until). Service role only. Seeded from `DEFAULT_PROTECTION_LIMITS` (`src/lib/protectionLimits.ts`) — the test holds them byte-equal. |
| Guard | SQL `guard_action(actor, action, lead, est_cost, units, fn)`; edge `_shared/protection.ts` `guardAction` | Suspension → mode (paid actions only) → Sales-only: not-allowed actions, per-copy rows, team cap, burst windows (`per_min`/`per_10min`/`per_hour`/`per_day`), `rows_per_day`, person spend (hour/day warn + hard), `warn_day`, `warn_rows`. Unknown action = paid. No settings row = refuse. ~1.5 ms in the database. |
| Suspension | `team_members.suspended_at` / `suspended_by` | Role row stays → the rep reads their leads, notes, history; every guarded action refuses on the next request. |
| Denials | SQL `record_denial`; edge `recordDenial` (in `requireAdmin`, `leadAccess`, `mayWriteLeadId`, `mayLookUpBusiness`, admin-users, niche-sample, scan-site-details, copy of a foreign lead) | Ten from one person in ten minutes (`denied_alert_10min`) → one emailed `denied_burst` a day. |
| Alerts | fn `security-admin` action `sweep` (cron `security-sweep-run`, every 5 min, CRON_SECRET) → SQL `security_sweep()` → `_shared/operator-alert.ts` | Raises team-spend / spike / Apify / unsigned-webhook events, emails every pending alert in ONE message, marks `alerted_at` only when Resend accepted it. Words: `src/lib/securityAlerts.ts`. |
| Admin screen | `/admin/api-usage` → `SecurityPanel` → fn `security-admin` (`overview`, `set_mode`, `set_limits`, `unlock_user`) → SQL `security_overview()` | Spend today by provider / person, team 24 h vs cap, last hour, Apify, warnings, restricted + suspended (with HELD queued openers), exports / copies, recent guarded activity, the one control, thresholds (editable, validated by `validateLimits`). |

⛔ **A salesperson never sees a cost or a provider.** Every guard refusal they can receive is
`USAGE_PAUSED_DETAIL` ("Usage temporarily paused — contact Paul"); the Copy Numbers per-copy limit is the
one number they are told (it is a row count, not money).

## 2. Where the guard runs (action → function)

| Action | Paid | Function(s) | Notes |
|---|---|---|---|
| `lead_search` | yes | search-leads | Before the cache (counts pulls, not just money). Real Google cost logged by the function. |
| `place_details` | yes | google-place-details | Before the cache. Plus `mayLookUpBusiness`: Sales may not look up a business already in the book under someone else. |
| `enrich` | yes | enrich-business, check-website, bulk-jobs (admin create) | Plus `mayLookUpBusiness`; Sales may not force a cache-busting re-run. |
| `site_scrape` | no | extract-email, extract-facebook | Free website fetches; suspension + per-hour. |
| `hook_audit` / `hook_preview` | yes | create-ai-audit | AFTER the in-flight dedupe (a double-click answers `already_running`, free, uncounted); BEFORE any generation / town lookup. Sales hook carries `OUTREACH_AUDIT_EST_USD` (its Apify rows are billed to the book). At most `SALES_HOOKS_PER_LEAD_PER_DAY` per lead. |
| `audit_manual` | yes | create-ai-audit (admin), bulk-jobs (audit) | Admin: mode only. |
| `ai_draft` | yes | warm-lead-reply (research/draft), voice-note-script (generate) | Estimates `WARM_REPLY_EST_USD` / `VOICE_SCRIPT_EST_USD`, from billed rows (their OpenAI rows log under the book). |
| `prospect_preview` | yes | prospect-preview (generate) | No billed row to estimate from → count limit only. |
| `niche_check` | yes | niche-sample (start) | Admin-only; plus one sample in flight per niche (returns the first). |
| `admin_ai` | yes | scan-site-details | Admin-only for a person now (its only screen is the Page Generator). |
| `claim` | no | claim_lead (SQL) | After every existing refusal, before the write. |
| `lead_add` | no | sales_add_lead (SQL) | Suspension + per-hour. |
| `lead_lookup` | no | lead_identity_lookup (SQL) | Sales only; refused → every item answers `paused`. |
| `copy_numbers` / `export_csv` | no | log_data_access (SQL) | See section 4. |
| `whatsapp_send` | no | send-whatsapp-message (real sends, not dry runs), send-whatsapp-voice, send-whatsapp-media | Sales only: suspension. WhatsApp is not paid API — the pause modes never touch it. |
| `whatsapp_queue` | no | sales_queue_opener (SQL) | Suspension. |

Emergency stop only (`allStopRefusal`): review-reply, run-seo-scan, apply-seo-paste. (admin-ai-opener was on this list until it was deleted, 2026-09-30.)
Background: `process-ai-audit-queue` (all_stop → no new Apify start, no SEO scan, polling continues so
nothing strands past `MAX_RUN_AGE_MS`; prospecting_paused → only the baseline-priority set starts),
`process-whatsapp-queue` (audit-ahead only when running; a suspended rep's queued leads are HELD, fail
closed), `bulk-jobs` sweep (waits under either pause), `create-ai-audit` internal calls (all_stop only).
**Not covered by the stop** (named, admin-pressed, mixed read/write): page-generator, mockup. The
free-check lane keeps its own global caps (`FREE_CHECK_DAILY_LEAD_CAP` / `_AUDIT_CAP`); its audits start
through the queue, which the stop holds.

`scripts/abuse-cost-protection.test.ts` sweeps every function: one that calls a paid provider AND
resolves a signed-in caller must call `guardAction` / `allStopRefusal`, or be in a named exemption list.

## 3. Thresholds — as seeded 2026-09-29 (live values are the row; change them on the Admin screen)

Evidence (api_usage_log, 45 days to 2026-09-29): Paul's heaviest real working day ≈ $20 (19 Sep), the
record day $41.75 was the OpenAI retry storm (20 Sep); heaviest hour $5.98 (14 Sep, 226 place lookups);
peak 376 lookups/day, 18 searches/day, 195 hook audits/day (a bulk run). The two Sales test accounts
had spent $2.21 in total. A very productive rep (30 searches, 300 lookups, 40 hooks) ≈ $12/day.

| Key | Value | Why |
|---|---|---|
| `user_hour_warn_usd` / `user_hour_hard_usd` | 6 / 15 | Paul's heaviest hour ≈ 6; hard ≈ 2.5× it |
| `user_day_warn_usd` / `user_day_hard_usd` | 15 / 35 | productive rep ≈ 12; hard ≈ 1.75× Paul's heaviest real day |
| `team_hour_warn_usd` | 12 | spike alert (background jobs included) |
| `team_day_warn_usd` / `team_day_cap_usd` | 50 / 100 | cap restricts Sales only; above the storm day |
| `denied_alert_10min` | 10 | one mistake never alerts |
| `apify_warn_pct` | 90 | the account cap is the single point of failure |
| `lead_search` | 10/min, 60/hour | Paul's peak day was 18 |
| `place_details` | 40/min, 500/hour | Paul's peak hour 226 |
| `enrich` | 150/hour | a bulk enrich of a results page fits (the runner's own per-caller $ cap still applies) |
| `site_scrape` | 300/hour | Find emails over big result pages |
| `hook_audit` | 10 per 10 min, 80/day | five concurrent is normal |
| `hook_preview`, `ai_draft` | 30/hour | |
| `prospect_preview` | 20/hour | |
| `claim` | 60/hour, 200/day, warn 100/day | Paul |
| `lead_add` | 200/hour | |
| `lead_lookup` | 120/hour | one Find Leads search = 1–2 lookups |
| `copy_numbers` | 200 per copy, 10/hour, 1000 rows/day, warn over 100 | |
| `export_csv` | sales not allowed | Paul |

Simulated in `supabase/tests/abuse-cost-protection.sql`: a very productive day, a bulk prospecting hour
and five concurrent hooks are NORMAL; over the warning line WARNS (still works, one email a day); over the
hard line RESTRICTS paid actions only (notes, reads, WhatsApp still work); a 45-lookup loop stops at the
per-minute line; hook spam stops at the 10-minute line; the 61st claim in an hour and the 201st in a day
are refused and assign nothing; a Sales CSV export and a copy of another lead's number are refused and
recorded; ten refusals in ten minutes raise one alert; the admin is never limited.

## 4. Lead data

- **`claim_lead`** is limited (above). **`sales_pool`** lost its authenticated grant (no caller since
  2026-09-28; it paged the whole unassigned pool). The four old suites that used it as an oracle grant it
  inside their own rolled-back transaction.
- **`lead_identity_lookup`** is now a masked wrapper over `_lead_identity_rows` (the old body, internal
  only): for Sales the lead id only for `yours` / `claimable`, the owner id only for `yours`; `owned` /
  `protected` answer state + owner NAME. `sales_add_lead` reads the UNMASKED rows (masking must never let a
  duplicate in) and masks its answer.
- **Place-detail reconstruction closed**: `mayLookUpBusiness` (`_shared/access.ts`) in google-place-details,
  enrich-business, check-website — a business already in the book is looked up only by the rep it is
  assigned to (every matching row must be theirs). Fail closed.
- **Messages**: the Sales policy matches on phone only for a message with NO lead (`lead_id is null`) —
  exactly the media rule. A thread filed under another lead (a duplicate row, a client) is that lead's.
- **Export CSV**: admin only (`leadPermissions().exportData`; Outreach button and Find Leads menu not
  rendered for Sales; `log_data_access` refuses a Sales `export_csv`). Admin exports are logged first; a
  failed log downloads nothing.
- **Copy Numbers**: `logDataAccess` BEFORE the clipboard; every id must be in `my_sales_lead_ids()`.
- Remaining by design: a rep can read THEIR OWN leads through `sales_leads` directly (it is their data).
  Reads of the view are not counted — the claim limit is what bounds how much becomes "their own".

## 5. Suspension (Team page: "Suspend Sales access" / "Reactivate")

`admin-users` `team_suspend` / `team_unsuspend`: sets / clears `suspended_at` (+ `suspended_by`), records
`suspended_by_admin` / `reactivated_by_admin` with the count of their queued leads. Never removes the role,
never bans, never deletes. Refused on the next request: every guarded action in section 2 (searches,
lookups, enrichment, hook audits, AI drafts, previews, claims, adds, Find Leads lookups, Copy Numbers,
WhatsApp sends / voice / media, queueing). Kept: sign-in, reading their leads, notes, statuses, follow-ups,
history, attribution, commission history. **Existing sessions**: the guard reads `suspended_at` on every
call, so an open session stops working for protected actions at once — no token revocation needed.
**Queued openers** of a suspended rep are held by the drip and listed on the Admin screen (reassign or
remove them). **Hook audits already running** finish (the money is spent). Disable (unchanged) is the
full lock-out: role removed + ban.

## 6. WhatsApp webhook signature

`src/lib/metaSignature.ts` (`validMetaSignature`): HMAC-SHA256 over the RAW BYTES, `sha256=<hex>`,
constant-time; missing / malformed / wrong → false; an empty secret verifies nothing. `whatsapp-status`
refuses 401 before parsing whenever `WHATSAPP_APP_SECRET` is set. Unset (true on 2026-09-29): it still
accepts (refusing would drop every genuine receipt and reply), the Admin screen shows a red banner, and
the sweep emails `webhook_unsigned` once.
**Superseded 2026-10-04 (M-003, `docs/pre-sales-certification/fixes-01-security-inbound.md`):** the
webhook now FAILS CLOSED — unset secret = every POST refused 401 (`src/lib/metaWebhookGate.ts`). The
"still accepts" behaviour above was proved exploitable live by the certification.

## 7. Re-running the tests

- `npx tsx scripts/abuse-cost-protection.test.ts` (in `npm test`).
- `supabase/tests/abuse-cost-protection.sql` — send the whole file as ONE query to the Management API
  (CLAUDE.md §2). Always rolled back (it RAISES its results). Inside one transaction `now()` never moves,
  so it simulates a session by inserting past ledger rows and asking the guard once.

## 8. Known limits (2026-09-29)

- Reads of `sales_leads` (own leads) are not rate-counted; the claim limit bounds the set.
- `page-generator` and `mockup` do not check the emergency stop (admin-pressed, mixed read/write).
- An admin AI-draft / hook billed to the book shows under Paul in "by person"; a rep's shows as an
  ESTIMATE under the rep (marked *), the real rows under Paul.
- The in-memory per-isolate limiters in search-leads / google-place-details / admin-users remain as a
  courtesy; the database guard is the real limit.
- `admin-api-usage`'s month total still truncates at PostgREST's 1,000 rows (pre-existing); the Security
  section's totals are SQL and complete.

## 9. Provider backstops — for Paul to set by hand

See the final report of this pass (Google Cloud quota + budget alert, OpenAI monthly limit, Apify cap,
Meta App Secret → `WHATSAPP_APP_SECRET`).

## 10. Deploy and live QA (2026-09-28 UTC, merged to main `793b3ee4`)

- **SQL**: `20260929100000_abuse_cost_protection.sql` applied in one transaction after regenerating it from
  the live definitions (identical); `20260929100100_guard_suspended_alert_once.sql` after live QA. Read
  back: 5 ledger columns, suspension columns, settings row, `sales_pool` not executable by authenticated,
  `guard_action` service-only, claim / add / queue guarded, the India +91 rule kept, the new message
  policy text. All 15 SQL suites on the live schema: **524/524**, no fixtures left.
- **Edge**: 37 functions deployed from a tree containing `origin/main` `b23fb48d` — security-admin,
  admin-ai-opener, admin-api-usage, admin-users, apify-usage-status, apply-seo-paste, bulk-jobs,
  check-website, coverage, create-ai-audit, enrich-business, enrich-lead, extract-email, extract-facebook,
  google-place-details, market-view, niche-sample, page-generator, paid-baseline, paid-client-hub,
  playbook-evidence, process-ai-audit-queue, process-whatsapp-queue, prospect-preview, review-reply,
  run-seo-scan, sales-performance, scan-site-details, search-leads, send-whatsapp-media,
  send-whatsapp-message (preflight `x-swm-build: 2026-09-29a`), send-whatsapp-voice, submissions,
  template-request, voice-note-script, warm-lead-reply, whatsapp-status. Markers read from the deployed
  bodies. Every cron call after the deploy answered 200.
- **Cron**: `security-sweep-run` (`*/5 * * * *`, `invoke_security_sweep()`). First two sweeps emailed 3
  and 4 alerts (Resend accepted; `alerted_at` set).
- **SPA**: leadfinderos-next served the new chunks on the second poll (Team, AdminApiUsage,
  dataAccessLog, Index, salesCrm carry the new strings).
- **Live QA (Sales Test account, direct calls like a compromised browser; admin via a one-time session;
  both ended with `logout?scope=local`)**:
  - NORMAL: own leads read; a Find Leads search ran; Paul's lead and a client came back masked (state +
    owner name, no ids).
  - ABUSE: place details / enrich of Paul's lead and a client → 403 `not_your_lead` (no spend); Sales
    CSV export → refused + alert; copy of Paul's number → refused; `sales_pool` → permission denied;
    `outreach_leads`, `api_usage_log`, `security_events` → `[]`; `protection_settings`, `guard_action` →
    permission denied; 11 admin-only calls → 403 each + one `denied_burst` alert; admin-users, niche
    start, scan-site-details → 403.
  - BURST: lookup limit set to 2 more → the third answered `paused` (restored).
  - WARNING: warning line lowered → the search still ran, logged `warned`, alert emailed (restored).
  - RESTRICTED: hard line lowered → search 429 with the one sentence and ZERO Google calls; the CRM
    still read (restored).
  - SUSPENDED (Team action `team_suspend`, Test's session already open): search, place details, claim,
    lookup (`paused`), add, queue opener, Copy Numbers, hook audit, AI draft, voice script, prospect
    preview — all refused; own leads and team row still read. `team_unsuspend` → search works again.
  - PAUSE: "prospecting paused" refused both Sales and admin searches; "running" restored them.
  - Found in QA and fixed: a suspended account raised one alert PER ACTION (ten lines) → now one per
    person per day (follow-up migration).
  - Cleanup: the QA guard rows (41) and events (39) deleted; the two real Google charges of the QA
    searches kept (true spend); thresholds verified byte-equal to the defaults; mode running; no overrides.
- **Latency**: the guard costs ~1.5 ms in the database (20-call average) and ~20 ms on a guarded RPC
  (median, interleaved 8×: 276 vs 255 ms from this machine, whose ~250 ms is network distance). An edge
  function adds one in-region round trip.
- Observed, not changed: a revoked session's token is answered 503 `auth_unavailable` by
  `_shared/operator-auth.ts` instead of 401 (pre-existing classification; suspension does not rely on it).
