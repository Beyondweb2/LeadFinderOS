-- VOICE-NOTE SCRIPT: PAUL'S OWN VERSION (2026-10-23, Paul, lean first replies + voice-note scripts v7).
-- The Inbox's Voice-note script panel lets the person edit a generated script and "Save my version". That version is
-- kept beside the generated one (never replacing it), and becomes one of the voice samples the next script learns from.
--
-- Additive only: three nullable columns, no default, no rewrite of the table (it is small: one row per generated script).
-- voice_note_scripts keeps RLS on with NO policies: service role only; the edge function voice-note-script writes these
-- columns after its own lead-access check.

set local lock_timeout = '5s';

alter table public.voice_note_scripts add column if not exists final_script text;
alter table public.voice_note_scripts add column if not exists final_saved_at timestamptz;
alter table public.voice_note_scripts add column if not exists final_saved_by uuid;

comment on column public.voice_note_scripts.final_script is 'The person''s own edited version of this script ("Save my version"). Null = never edited. Never sent anywhere.';
comment on column public.voice_note_scripts.final_saved_at is 'When the edited version was last saved.';
comment on column public.voice_note_scripts.final_saved_by is 'Who saved the edited version (auth user id).';
