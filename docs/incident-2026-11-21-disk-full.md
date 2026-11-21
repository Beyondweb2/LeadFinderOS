# Incident 2026-11-21 — V1 down: database disk full

**What reps saw:** app.leadfinderos.com stuck on a spinner (seen on /inbox) from about 18:00 local (UTC+7).

**Cause:** the V1 Supabase project (`ruusxpkkmwtljxxulhbq`) had a **2 GB disk** (plan includes up to 8 GB) and **Micro** compute.
Usage reached 1.93 GB of 2 GB. Supabase autoscale (grow at 90%) did not run because a 4-hour disk cooldown was in progress.
The database went unhealthy: auth and REST returned 522 after ~20 s, SQL connections timed out. Supabase status page: all operational.
Not caused by the gone_cold deploys (cc274bb0, f4f1f8a5) — nothing was rolled back.

**Biggest tables then:** `cron.job_run_details` 286 MB (1.4M rows since June, never cleaned), `crawl_urls` 261 MB,
`ai_audit_queue` 111 MB, `ai_audit_runs` 92 MB (+ their TOAST).

**What was done:**
1. Paul restarted the project (failed), then upgraded compute Micro → **Small** (memory had been ~78% on Micro). It came back at 18:45.
2. It came back in Supabase **read-only mode** (`default_transaction_read_only = on` in postgresql.auto.conf): pages load, saves fail.
3. With Paul's OK: kept the last 7 days of cron history, truncated the rest (inside `begin transaction read write`). DB 1004 MB → 737 MB.
4. Nightly job `cron-history-cleanup` (03:40 UTC) deletes cron history older than 7 days — `supabase/migrations/20261225090000_cron_history_cleanup.sql`.

**Still Paul's:** set Disk size to 8 GB in Settings → Infrastructure once the 4-hour cooldown ends.

**Gotchas for next time:**
- `supabase db query` refuses writes in agent mode without `--yes`; it injects a comment after line 1, so keep a `do $$` block on one line.
- In read-only mode a write needs an explicit `begin transaction read write; …; commit;` — `set session characteristics` in the same request is too late.
- The web app loading fine signed-out does not mean V1 is up: probe `/auth/v1/health` with the publishable key from the live bundle.
