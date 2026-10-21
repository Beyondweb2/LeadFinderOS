-- AI DRAFT OUTCOMES — live check of the trigger (migration 20261115090000). Re-runnable, ALWAYS ROLLED BACK.
-- Each block takes a real draft row inside this transaction, drives a status change, and reads the outcome written.
-- Nothing is sent: only ai_reply_drafts / ai_reply_draft_outcomes rows change, and the rollback undoes them.
begin;

create temp table _r (check_name text, pass boolean, detail text) on commit drop;

-- word distance
insert into _r select 'distance: same', public.word_edit_distance('Hi there  Bob', 'Hi there Bob') = 0, null;
insert into _r select 'distance: one replaced', public.word_edit_distance('Hi there Bob', 'Hi there Rob') = 1, null;
insert into _r select 'distance: one added + one removed', public.word_edit_distance('a b c', 'b c d') = 2, null;
insert into _r select 'distance: empty', public.word_edit_distance('', 'a b') = 2, null;

do $$
declare d uuid; v_draft text; c int; o record;
begin
  -- take any draft row, reopen it as a pending draft with known text (inside this transaction only)
  select id into d from public.ai_reply_drafts order by created_at desc limit 1;
  if d is null then insert into _r values ('a draft row exists', false, 'no rows'); return; end if;
  update public.ai_reply_drafts set status = 'generating' where id = d;  -- no event: generating is not a closing state
  update public.ai_reply_drafts set status = 'pending', draft_text = 'Hello there, quick question for you', error = null, final_text = null, why = jsonb_build_object('intent', 'zz_test_intent') where id = d;
  delete from public.ai_reply_draft_outcomes where draft_id = d;

  -- regenerate
  update public.ai_reply_drafts set draft_text = 'Hello again, one quick question' , regenerations = coalesce(regenerations,0) + 1 where id = d;
  select * into o from public.ai_reply_draft_outcomes where draft_id = d order by created_at desc, id limit 1;
  insert into _r values ('regenerate logs the old version', o.outcome = 'regenerated' and o.draft_text = 'Hello there, quick question for you' and o.intent = 'zz_test_intent', o.outcome);

  -- sent edited via Approve & send
  update public.ai_reply_drafts set status = 'sending', final_text = 'Hello again, one short question' where id = d;
  update public.ai_reply_drafts set status = 'sent' where id = d;
  select * into o from public.ai_reply_draft_outcomes where draft_id = d and outcome like 'sent_%';
  insert into _r values ('sent edited, 1 word changed', o.outcome = 'sent_edited' and o.words_changed = 1 and o.final_text = 'Hello again, one short question', o.outcome || ' ' || coalesce(o.words_changed::text, 'null'));

  -- sent unchanged
  delete from public.ai_reply_draft_outcomes where draft_id = d;
  update public.ai_reply_drafts set status = 'pending' where id = d;   -- sent → pending: not a closing transition
  update public.ai_reply_drafts set status = 'sending', final_text = 'Hello again,   one quick question' where id = d;
  update public.ai_reply_drafts set status = 'sent' where id = d;
  select count(*) into c from public.ai_reply_draft_outcomes where draft_id = d and outcome = 'sent_unchanged' and words_changed = 0;
  insert into _r values ('sent unchanged (spacing ignored)', c = 1, c::text);

  -- queued for send hours → sent (queued), not discarded
  delete from public.ai_reply_draft_outcomes where draft_id = d;
  update public.ai_reply_drafts set status = 'pending', error = 'queued_for_send_hours' where id = d;
  update public.ai_reply_drafts set status = 'discarded' where id = d;
  select * into o from public.ai_reply_draft_outcomes where draft_id = d;
  insert into _r values ('queued approve = sent, queued', o.outcome = 'sent_unchanged' and o.queued, o.outcome);

  -- plain discard
  delete from public.ai_reply_draft_outcomes where draft_id = d;
  update public.ai_reply_drafts set status = 'pending', error = null, final_text = null where id = d;
  update public.ai_reply_drafts set status = 'discarded' where id = d;
  select * into o from public.ai_reply_draft_outcomes where draft_id = d;
  insert into _r values ('discard', o.outcome = 'discarded' and o.final_text is null, o.outcome);

  -- superseded
  delete from public.ai_reply_draft_outcomes where draft_id = d;
  update public.ai_reply_drafts set status = 'pending' where id = d;
  update public.ai_reply_drafts set status = 'superseded' where id = d;
  select count(*) into c from public.ai_reply_draft_outcomes where draft_id = d and outcome = 'superseded';
  insert into _r values ('superseded', c = 1, c::text);

  -- no AI text → nothing recorded
  delete from public.ai_reply_draft_outcomes where draft_id = d;
  update public.ai_reply_drafts set status = 'pending', draft_text = null where id = d;
  update public.ai_reply_drafts set status = 'discarded' where id = d;
  select count(*) into c from public.ai_reply_draft_outcomes where draft_id = d;
  insert into _r values ('no AI text: no outcome', c = 0, c::text);
end $$;

-- the summary answers nothing without an admin session (this connection has no auth.uid())
insert into _r select 'summary empty without admin', (select count(*) from public.ai_draft_outcome_summary(90)) = 0, null;

select check_name, pass, detail from _r order by pass, check_name;
rollback;
