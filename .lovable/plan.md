## Goal

Enforce that every row in `public.generated_sites` has a distinct `site_name`, so the slug can be safely used as a public URL key.

## Change

Single migration:

```sql
ALTER TABLE public.generated_sites
  ADD CONSTRAINT generated_sites_site_name_key UNIQUE (site_name);
```

## Safety

- Prior backfill already deduped `site_name` values; the verification query returned zero duplicates, so the constraint will be accepted without error.
- Adds a unique btree index on `site_name`, which also speeds up lookups by slug.
- No data is modified; no RLS or grants change.

## Follow-up (not in this migration)

Once this constraint is in place, future inserts/updates that would collide will fail with a `unique_violation`. Any code path that assigns `site_name` should either pre-check or catch that error — worth a separate pass if/when we let users rename sites.
