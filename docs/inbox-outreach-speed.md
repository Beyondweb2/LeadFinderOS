# Inbox + Outreach load speed (2026-09-27)

Paul: "inbox and outreach page must load quicker, find the issues and fix all". Measured on the live
app as the admin (one-time magic-link session, signed out after), then in the database with API-style
JWT claims, before any change.

## What was slow (live, before)

| Page | What | Time |
|---|---|---|
| Inbox | `audit_gemini_signal` read | 500 (57014 statement timeout) or 3.5–8.8 s — **pre-existing** (same without the sales policies) |
| Inbox | `ai_audits → ai_audit_runs(results->summary, results->crawl_check)` embed | 500 ×3, then OK at ~34 s |
| Inbox | the whole load fetched **twice**: the realtime subscription's `SUBSCRIBED` → `reconcile()` re-read messages + leads + audits while the first load was still running | every visit |
| Both | 1,000-row pages fetched **one after another** (5,222 leads = 6 round trips ≈ 9 s on Outreach) | |
| Both | `process-whatsapp-queue` `status`: ~15 DB reads **in sequence**, and called 2–3× per page (queue panel, selected-opener hook, Inbox first-reply panel) | 6–18 s |

Also found: the Outreach audit map (1,572 audits) and `outreach_history` (5,333 rows) were
**unpaginated** — PostgREST returned 1,000 of each, silently.

## Root causes in the database

- Both Inbox reads needed ~1 MB and made Postgres detoast ~100 MB: every run's full `results`
  (2,042 rows, 47 MB) to project two small keys, and every queue row's `result` (8,251 rows, 53 MB)
  to count Gemini answers.
- Owner policies `auth.uid() = user_id` re-parse `request.jwt.claims` for every row.

## The fix

**Database** (`supabase/migrations/20260927110000_inbox_outreach_speed.sql`, applied in three steps
with `lock_timeout 3s`, read back):
1. Plain nullable columns `ai_audit_runs.results_summary / results_crawl_check` and
   `ai_audit_queue.gemini_answered / gemini_self_named`, kept equal to the big column by BEFORE
   INSERT/UPDATE-OF triggers (`fill_ai_audit_run_parts`, `fill_ai_audit_queue_parts`).
2. Backfill in batches of 300 (runs 2,037 filled; the other 5 have neither key), the queue's
   `updated_at` trigger paused per batch so no row looks freshly touched.
3. Verified zero differences (runs, queue, and the per-audit Gemini counts via EXCEPT), then the
   view reads the new columns, and eight owner SELECT policies use `(select auth.uid())`
   (ai_audits, ai_audit_runs, ai_audit_queue, outreach_leads, outreach_history, lead_page_hits,
   templates, whatsapp_messages). Security suites re-run: 70/70 + 8/8.

⛔ **Why not `generated always … stored`:** adding one rewrites the table under ACCESS EXCLUSIVE; for
these two tables it ran past 100 s in a rolled-back test and queued live reads behind it (the test
was terminated). Never add a stored generated column to a large live table; use column + trigger +
batched backfill.

**Code:**
- `fetchAllRowsParallel` (`src/lib/fetchAllRows.ts`): first page alone (its length = the page size,
  so a server cap below 1,000 cannot leave gaps), then waves of 6, stop at the first short page,
  dedupe by id. Test: `scripts/fetch-all-rows-parallel.test.ts` (identical to the sequential loader
  for 0…12,345 rows and cap 500). Used for Inbox messages/leads/audits, Outreach active + archived
  leads (now also read together), outreach history, the Outreach audit map.
- Inbox reads `audit_summary:results_summary, crawl_check:results_crawl_check` (same aliases); the
  Call Playbook reads `results_crawl_check`. The fallback projection keeps the old `results->` form.
- Inbox first connect: `catchUpAfterFirstLoad` waits for the in-flight load, then reads only messages
  (`created_at`) and leads (`updated_at`) changed since it started (−60 s), plus the audit list. A
  later reconnect/focus still runs the full `reconcile()`.
- Queue status: one shared React Query read (`src/lib/queueStatus.ts`, 30 s reuse, explicit refresh
  is fresh); `process-whatsapp-queue` runs its status reads in one `Promise.all` (also every cron
  tick). Payload unchanged.

## Measured after (live, the same requests, from a script as the admin — the in-app browser tab was hidden and throttled, so its timings were not used)

| Read | Before | After |
|---|---|---|
| Inbox audits embed | 500 (statement timeout) after ~9 s | 200, 1.5 s (2 pages) |
| Inbox Gemini signal | 500, or 3.5–8.8 s | 200, 2–3 s |
| Inbox messages (6 pages) | 5.9–7.1 s | 2.1–3.0 s |
| Inbox full load | everything fetched twice | once + a small catch-up; 0 errors |
| Outreach active leads (6 pages, 16 MB) | 6.2–13.6 s | 3.9–4.9 s |
| Queue status (warm) | 6–18 s, called 2–3x | 1.5–2.7 s, called once (`x-queue-timing`: auth 0.5–1.3 s, reads 0.8–1.3 s) |

## Still open

- **Outreach downloads 16 MB of lead JSON** (`select('*')`, ~110 columns, ~3 KB/lead; the values are
  ~4 MB, the rest is repeated keys). Narrowing the select is the next real win, but every Outreach
  component and the lead dialog read fields off the row — do it as its own change with a field audit.
- `LeadSearchContext` loads checked_businesses / outreach_history / lead names twice on every page
  load, and its outreach_history read is unpaginated.
- A freshly deployed function's first call is a cold start (~5 s once).

## Found, not changed

`ai_audit_runs` and `ai_audit_queue` are NOT in the `supabase_realtime` publication — the Inbox's
subscriptions to them never fire; report availability relies on focus/reconnect `reconcile()`.
