## Backfill `site_name` on `generated_sites`

Run a one-time data update that populates `site_name` for every row in `public.generated_sites` using a slug derived from `content->>'businessName'`.

### What it does
- Lowercases `businessName`, replaces non-alphanumerics with `-`, trims leading/trailing `-`, truncates to 40 chars.
- Falls back to `'barber-site'` when the slug is empty.
- De-duplicates by appending `-2`, `-3`, … to later rows sharing the same base (ordered by `created_at`, then `id`); the first keeps the bare base.

### How it runs
- Executed via the data tool (UPDATE on existing table, no schema change).
- Note: `set local request.jwt.claims` and the `begin/commit` wrapper are dropped — the data tool runs as service_role in its own transaction, so they're unnecessary. The `UPDATE` itself is unchanged.

### Safety
- Earlier check confirmed no duplicate `site_name` values currently exist, so overwriting is safe.
- `lock_generated_sites_protected_fields` trigger blocks `site_name` changes for non-service callers; service_role bypasses it, so the update will succeed.

Approve to run the UPDATE.
