-- Booking-only pages (Phase 1): a generated_sites row that is a BOOKING CONTAINER
-- with no public marketing site. The booking page lives at bookmybarber.uk/<slug>;
-- /p/<slug> and any yoursites.uk subdomain redirect to it instead of rendering the
-- marketing template.
--
-- The row is still status='published' so the existing booking engine works
-- unchanged (get-availability / create-booking require a published row); the
-- booking_only flag is what hides the marketing surfaces.

alter table public.generated_sites
  add column if not exists booking_only boolean not null default false;

-- The public resolvers (PublicSite, SubdomainSite, the Pages middleware) read this
-- via the anon key to decide whether to show marketing or redirect to booking.
grant select (booking_only) on public.generated_sites to anon;

-- Lock booking_only like the other identity/state fields: only service_role + admins
-- may change it (an owner can't flip their row in/out of booking-only mode).
create or replace function public.lock_generated_sites_protected_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  if new.owner_id     is distinct from old.owner_id
     or new.lead_id      is distinct from old.lead_id
     or new.site_name    is distinct from old.site_name
     or new.is_paid      is distinct from old.is_paid
     or new.subdomain    is distinct from old.subdomain
     or new.booking_only is distinct from old.booking_only then
    raise exception 'owner_id, lead_id, site_name, is_paid, subdomain and booking_only cannot be changed by the site owner';
  end if;
  return new;
end;
$$;
