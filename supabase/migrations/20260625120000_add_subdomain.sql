-- Phase 1 custom subdomains: a paid barber's chosen <subdomain>.yoursites.uk.
--
-- `subdomain` holds just the label (e.g. "joesbarbers"), lowercased. The public
-- resolver (Pages middleware + the client subdomain gate) looks a site up by it.
-- Only the connect-subdomain edge function (service_role) ever writes it — owners
-- cannot set/steal one via their own session (protected-fields trigger below).

alter table public.generated_sites
  add column if not exists subdomain text;

-- Case-insensitive uniqueness — one barber per label. Partial (non-null only) so
-- the many sites without a subdomain don't collide on NULL.
create unique index if not exists generated_sites_subdomain_key
  on public.generated_sites (lower(subdomain))
  where subdomain is not null;

-- anon needs column-level SELECT on `subdomain` to resolve a site by it (same
-- pattern as site_name / share_token). RLS still limits anon to published rows.
grant select (subdomain) on public.generated_sites to anon;

-- Lock `subdomain` like the other identity fields: only service_role (the
-- connect-subdomain function) + admins may change it. A site owner sending
-- subdomain in a normal content/status update is rejected.
create or replace function public.lock_generated_sites_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- service_role (connect-subdomain, stripe-webhook, reset-test-barber) + admins bypass.
  if auth.role() = 'service_role' or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  if new.owner_id  is distinct from old.owner_id
     or new.lead_id   is distinct from old.lead_id
     or new.site_name is distinct from old.site_name
     or new.is_paid   is distinct from old.is_paid
     or new.subdomain is distinct from old.subdomain then
    raise exception 'owner_id, lead_id, site_name, is_paid and subdomain cannot be changed by the site owner';
  end if;
  return new;
end;
$$;
