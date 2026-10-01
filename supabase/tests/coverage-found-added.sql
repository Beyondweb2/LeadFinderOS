-- LIVE TEST of record_search_addition (migration 20260929190000). ALWAYS ROLLS BACK: it ends by raising.
-- Expect: own=true again=true second=true unrecorded_run=false someone_elses_run=false   (and added={"a": false, "c": true})
do $$
declare
  me uuid := '262c1d64-05ad-42e8-a81b-7d25553aeff3';     -- the "Test" salesperson (a real auth user)
  other uuid := 'c6e21a37-e342-4b99-9cf6-0489cb9af775';  -- the "test1" salesperson
  rec_run uuid; old_run uuid; r text := ''; got text;
begin
  insert into search_history (user_id, keyword, location, radius, results_count, no_website_count, found_with_website, found_without_website, found_keys)
    values (me, 'plumbers', 'wisbech', 5000, 3, 1, 2, 1, '{"a": false, "b": false, "c": true}') returning id into rec_run;
  insert into search_history (user_id, keyword, location, radius, results_count, no_website_count)
    values (me, 'plumbers', 'wisbech', 5000, 3, 1) returning id into old_run;

  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  r := r || 'own=' || public.record_search_addition(rec_run, 'c', true) || ' ';
  r := r || 'again=' || public.record_search_addition(rec_run, 'c', true) || ' ';
  r := r || 'second=' || public.record_search_addition(rec_run, 'a', false) || ' ';
  r := r || 'unrecorded_run=' || public.record_search_addition(old_run, 'a', false) || ' ';
  select added_keys::text into got from search_history where id = rec_run;
  r := r || 'added=' || got || ' ';
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  r := r || 'someone_elses_run=' || public.record_search_addition(rec_run, 'b', false);
  raise exception 'ROLLBACK_ONLY %', r;
end $$;
