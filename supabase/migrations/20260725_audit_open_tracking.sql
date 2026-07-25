-- Audit report open-tracking. Columns live on ai_audits (the report identity behind the stable
-- /a/<auditId> pitch link — survives re-runs, unlike a per-run row). Written only by
-- render-audit-report via bump_audit_open(); render is defensive and works whether or not this
-- has been applied (RPC-missing → swallowed).

alter table public.ai_audits
  add column if not exists first_opened_at timestamptz,
  add column if not exists open_count integer not null default 0;

-- Atomic increment — sets first_opened_at once, bumps the counter. SECURITY DEFINER so the
-- service-role render fn can call it; no row is created, only an existing audit is touched.
create or replace function public.bump_audit_open(p_audit_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_audits
     set open_count = open_count + 1,
         first_opened_at = coalesce(first_opened_at, now())
   where id = p_audit_id;
$$;
