ALTER TABLE public.generated_sites DISABLE TRIGGER USER;

with cleaned as (
  select id, created_at,
    coalesce(
      nullif(
        rtrim(
          left(trim(both '-' from regexp_replace(lower(coalesce(content->>'businessName','')), '[^a-z0-9]+', '-', 'g')), 40),
          '-'
        ),
        ''
      ),
      'barber-site'
    ) as base
  from public.generated_sites
),
numbered as (
  select id, base, row_number() over (partition by base order by created_at, id) as rn
  from cleaned
)
update public.generated_sites g
set site_name = n.base || case when n.rn = 1 then '' else '-' || n.rn::text end
from numbered n
where g.id = n.id;

ALTER TABLE public.generated_sites ENABLE TRIGGER USER;