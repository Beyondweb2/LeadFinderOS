-- Lead state audit (2026-09-30, docs/lead-state-model.md): three Next Action types the Work panel now
-- offers — Email, Send information, Meeting. Additive only; every older value stays readable.
-- lead_set_follow_up casts to this type, so it accepts them with no change. Applied live 2026-09-30
-- one statement at a time and read back from pg_enum.
alter type public.next_action_type add value if not exists 'email';
alter type public.next_action_type add value if not exists 'send_info';
alter type public.next_action_type add value if not exists 'meeting';
