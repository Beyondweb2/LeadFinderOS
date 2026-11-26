-- 2026-11-26 (docs/queue-pause-rules-2026-11-26.md, src/lib/queuePauseRules.ts): the queue says WHAT kind of problem paused it and
-- WHEN it may start again by itself. Additive, one-row table, idempotent. NULL = no auto-pause / a person resumes it.
alter table public.whatsapp_outreach_state add column if not exists auto_pause_kind text;
alter table public.whatsapp_outreach_state add column if not exists auto_resume_at timestamptz;
comment on column public.whatsapp_outreach_state.auto_pause_kind is 'Why the queue paused itself: auth | billing | blocked | spam_limit | refused | quality (queuePauseRules.ts). NULL when not auto-paused.';
comment on column public.whatsapp_outreach_state.auto_resume_at is 'When an auto-pause may start again by itself, if Meta''s health reading is clean by then. NULL = a person resumes it.';
