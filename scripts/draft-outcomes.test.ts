/* AI DRAFT OUTCOMES (2026-10-21) — every AI draft records what happened to it. One writer: the trigger in migration
   20261115090000 (read here as source; the live behaviour is supabase/tests/ai-draft-outcomes.sql, always rolled back).
   Pins: every closing path is recorded (sent, resolved = ordinary Send, discarded, queued-for-send-hours, superseded),
   a rewrite logs 'regenerated', the trigger can never block the draft's own update, the table is service-role only, the
   readout is admin only, and the readout's fold (src/lib/draftOutcomes.ts). */
import { readFileSync } from 'node:fs';
import { summariseDraftOutcomes, intentLabel, pct, type DraftOutcomeRow } from '../src/lib/draftOutcomes.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIG = read('supabase/migrations/20261115090000_ai_draft_outcomes.sql');
const TOGGLE = read('src/components/AiRepliesToggle.tsx');
const READOUT = read('src/components/AiDraftOutcomes.tsx');
const FN = read('supabase/functions/ai-reply-drafts/index.ts');

console.log('the one writer (trigger)');
{
  ok(/create trigger trg_ai_reply_draft_outcome before update on public\.ai_reply_drafts/.test(MIG), 'a BEFORE UPDATE trigger on ai_reply_drafts');
  ok(/new\.status = 'sent'/.test(MIG) && /new\.status = 'resolved'/.test(MIG) && /new\.status = 'discarded'/.test(MIG) && /new\.status = 'superseded'/.test(MIG), 'sent, resolved, discarded and superseded are all recorded');
  ok(/old\.status = 'pending' and new\.status = 'pending' and old\.draft_text is not null\s+and new\.draft_text is distinct from old\.draft_text/.test(MIG), 'a rewrite of an open draft records the old version as regenerated');
  ok(/new\.error = 'queued_for_send_hours' and new\.final_text is not null/.test(MIG), 'an approve queued for send hours counts as sent, not discarded');
  ok(/'queued_for_send_hours'/.test(read('src/pages/Inbox.tsx')), '…and the Inbox still closes a queued approve with that exact error');
  ok(/if new\.final_text is null and m\.template_name is null then new\.final_text := m\.body/.test(MIG), 'a draft answered by the ordinary Send keeps the text that was sent');
  ok(/exception when others then\s+raise warning/.test(MIG), 'a failure to record never blocks the draft update');
  ok(/word_edit_distance\(d\.draft_text, p_final\)/.test(MIG) && /when v_changed = 0 then 'sent_unchanged' else 'sent_edited'/.test(MIG), 'unchanged ⇔ 0 words changed');
  ok(/status: "resolved"/.test(FN) && /status: "discarded"/.test(FN) && /status: "superseded"/.test(FN) && /status: "sent"/.test(FN), 'the function still closes drafts with the statuses the trigger reads');
}

console.log('access');
{
  ok(/alter table public\.ai_reply_draft_outcomes enable row level security/.test(MIG) && !/create policy/i.test(MIG), 'the log is service-role only (RLS on, no policies)');
  ok(/revoke all on public\.ai_reply_draft_outcomes from anon, authenticated/.test(MIG), 'grants revoked');
  ok(/public\.my_role\(\) is distinct from 'admin' then return/.test(MIG), 'the summary answers nothing to a non-admin');
  ok(/revoke all on function public\._ai_draft_record_outcome/.test(MIG), 'the recorder cannot be called by a person');
  ok(/<AiDraftOutcomes \/>/.test(TOGGLE) && /if \(!visible\) return null/.test(TOGGLE), 'the readout sits inside the admin-only switch, hidden with it');
  ok(/onOpenChange/.test(READOUT) && !/setInterval|refetchInterval/.test(READOUT), 'read on open, never polled');
}

console.log('the fold');
{
  const rows: DraftOutcomeRow[] = [
    { intent: 'first_reply_pitch', versions: 12, sent_unchanged: 6, sent_edited: 4, regenerated: 1, discarded: 1, superseded: 0, not_used: 0, avg_words_changed: 7.5, avg_share_changed: 0.2 },
    { intent: 'go_on', versions: 3, sent_unchanged: 0, sent_edited: 2, regenerated: 0, discarded: 0, superseded: 1, not_used: 0, avg_words_changed: 3, avg_share_changed: 0.1 },
    { intent: 'unknown_question', versions: 2, sent_unchanged: 0, sent_edited: 0, regenerated: 0, discarded: 2, superseded: 0, not_used: 0, avg_words_changed: null, avg_share_changed: null },
  ];
  const s = summariseDraftOutcomes(rows);
  ok(s.sent === 12 && s.unchanged === 6 && s.edited === 6, 'totals add up');
  ok(s.unchangedShare === 0.5 && pct(s.unchangedShare) === '50%', 'share unchanged = unchanged ÷ sent');
  ok(s.intents[0].intent === 'first_reply_pitch' && s.intents[1].intent === 'go_on', 'most edited first');
  ok(s.intents[1].editedShare === 1 && s.intents[2].editedShare === null, 'edited share per intent; null when nothing sent');
  ok(s.other === 1 && s.discarded === 3, 'superseded/not used and discarded are counted');
  ok(summariseDraftOutcomes([]).unchangedShare === null && pct(null) === '—', 'no data → no percentage');
  ok(intentLabel('first_reply_pitch') === 'First reply pitch' && intentLabel('') === 'Unknown', 'intent labels');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
