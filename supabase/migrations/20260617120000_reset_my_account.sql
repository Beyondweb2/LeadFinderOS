-- True per-account clean-slate reset. ADDITIVE (defines functions only; deletes
-- nothing at migration time). The wipe runs only when reset_my_account() is
-- called (the dashboard "Full Reset" button), always scoped to the CALLER via
-- auth.uid() — never global, never another user.
--
-- Design: a SECURITY DEFINER function runs all deletes in ONE statement-set
-- (atomic — a single failure rolls the whole thing back, so it can never
-- half-fail). FK cascades do most of the child cleanup for us:
--   outreach_leads ──CASCADE──▶ generated_sites ──CASCADE──▶ bookings,
--                                                            booking_staff ─▶ staff_working_hours,
--                                                            claim_tokens, site_events
--                  ──CASCADE──▶ preview_links, hosting_clients, outreach_activities(by lead)
-- We still delete sites explicitly first (to also catch owner_id-only sites that
-- aren't linked to one of the caller's leads), then the leads, then the flat
-- user-scoped tables, then zero the metrics counters (the row is kept).

-- ── internal worker: wipes ONE account. NOT exposed to clients. ──────────────
create or replace function public._reset_account_for(v_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if v_uid is null then
    raise exception 'reset target is null';
  end if;

  -- 1. Sites I generated (linked to my leads) OR own outright. Cascades to
  --    bookings, booking_staff, staff_working_hours, claim_tokens, site_events.
  delete from public.generated_sites
   where owner_id = v_uid
      or lead_id in (select id from public.outreach_leads where user_id = v_uid);

  -- 2. My leads (Outreach + Track Leads + Paid Clients all live here). Cascades
  --    preview_links, hosting_clients, lead-linked outreach_activities, and any
  --    remaining linked sites.
  delete from public.outreach_leads where user_id = v_uid;

  -- 3. My team-readable, business-keyed rows (not reachable via lead cascade).
  delete from public.lead_claims where user_id = v_uid;
  delete from public.lead_notes  where user_id = v_uid;

  -- 4. Flat user-scoped logs / history.
  delete from public.outreach_history    where user_id = v_uid;
  delete from public.outreach_activities where user_id = v_uid;
  delete from public.outreach_events     where user_id = v_uid;
  delete from public.lead_contacts       where user_id = v_uid;
  delete from public.copied_phones       where user_id = v_uid;
  delete from public.search_history      where user_id = v_uid;
  delete from public.checked_businesses  where user_id = v_uid;

  -- 5. Zero the metrics counters (keep the row so the dashboard still has one).
  update public.user_metrics
     set search_count = 0,
         businesses_added_count = 0,
         messages_sent_count = 0,
         replies_count = 0,
         last_search_at = null,
         last_active_at = now(),
         updated_at = now()
   where user_id = v_uid;
end;
$$;

-- Lock the worker down: no client may call it with an arbitrary uid.
revoke all on function public._reset_account_for(uuid) from public, anon, authenticated;

-- ── public entry point: wipes ONLY the caller's account. ─────────────────────
create or replace function public.reset_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  perform public._reset_account_for(v_uid);
end;
$$;

revoke all on function public.reset_my_account() from public, anon;
grant execute on function public.reset_my_account() to authenticated;
