/* ONE STATUS RULE FROM THE MESSAGES + THE VISIBLE FLAG (Paul, 2026-10-21). Record: docs/lead-status-and-visible.md.
   The status rule itself is SQL (migration 20261118090000); its scenario replay is supabase/tests/lead-status-from-messages.sql
   (rolled back, 39 checks, run through the Management API). Here: the TS halves (the reply-kind tag, the Visible rule), and the
   wiring — every message table feeds the one rule, the drafter no longer writes a status, the Visible skip comes before any
   pitch, the Inbox shows the chip / filter / setting. Nothing here sends. */
import { readFileSync } from 'node:fs';
import { replyKinds, replyKindChanges, type TagMsg } from '../src/lib/replyKindTag.ts';
import { engineNamesThem, isVisible, parseVisibleRule, visibleCounts, DEFAULT_VISIBLE_RULE } from '../src/lib/visibleFlag.ts';
import { INBOX_QUICK_FILTERS, passesQuickFilter } from '../src/lib/conversationState.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SQL = read('supabase/migrations/20261118090000_lead_status_and_visible.sql');
const QA = read('supabase/tests/lead-status-from-messages.sql');
const FN = read('supabase/functions/ai-reply-drafts/index.ts');
const INBOX = read('src/pages/Inbox.tsx');
const SETTINGS = read('src/components/InboxSettings.tsx');

const at = (m: number) => new Date(Date.parse('2026-10-21T09:00:00Z') + m * 60_000).toISOString();
let n = 0;
const us = (m: number, sent = true): TagMsg => ({ id: `u${n++}`, direction: 'outbound', body: 'Hi, is this ZZ Fixture Plumbing?', message_type: 'template', created_at: at(m), sent });
const them = (m: number, body: string): TagMsg => ({ id: `t${n++}`, direction: 'inbound', body, message_type: 'text', created_at: at(m) });

console.log('1. the reply-kind tag (the 20 Oct reading, stored per message)');
{
  const yes = them(5, 'Hi yes it is');
  const k = replyKinds([us(0), yes]);
  ok(k.get(yes.id) === 'confirmed', 'a bare "yes it is" to the opener: confirmed (not a reply)');
  const help = them(5, 'Hi yes. How can I help?');
  ok(replyKinds([us(0), help]).get(help.id) === 'confirmed', '"yes, how can I help?": confirmed');
  const real = them(5, 'what is this about?');
  ok(replyKinds([us(0), real]).get(real.id) === null, 'a real question: a reply');
  const auto = them(1, 'Thank you for your message. We are away and will reply as soon as we can');
  ok(replyKinds([us(0), auto]).get(auto.id) === 'auto', 'an auto-responder: auto');
  const y1 = them(5, 'Yes'); const y2 = them(20, 'Yes');
  const kk = replyKinds([us(0), y1, us(10), y2]);
  ok(kk.get(y1.id) === 'confirmed' && kk.get(y2.id) === null, 'a "yes" AFTER we answered them is their answer: a reply');
  const failed = them(20, 'Yes');
  ok(replyKinds([us(0), them(5, 'Yes'), us(10, false), failed]).get(failed.id) === 'confirmed', 'a send that never went is not an answer');
  const stored = [{ ...us(0), reply_kind: null }, { ...them(5, 'Yep'), reply_kind: 'confirmed' }, { ...them(6, 'how much is it'), reply_kind: 'auto' }];
  const ch = replyKindChanges(stored);
  ok(ch.length === 1 && ch[0].id === stored[2].id && ch[0].reply_kind === null, 'only a tag that changed is written (and a wrong one is cleared)');
}

console.log('2. the Visible rule');
{
  const one = { named: 1, answers: 1 }; const none = { named: 0, answers: 1 }; const noAnswer = { named: 0, answers: 0 };
  ok(DEFAULT_VISIBLE_RULE === 'either' && parseVisibleRule('nonsense') === 'either' && parseVisibleRule('both') === 'both', 'default: Gemini or Google AI');
  ok(isVisible({ gemini: one, overview: noAnswer }, 'either'), 'Gemini named in its answer: Visible');
  ok(isVisible({ gemini: none, overview: one }, 'either'), 'Google AI named: Visible');
  ok(!isVisible({ gemini: none, overview: noAnswer }, 'either'), '"No AI answer shown" is never named');
  ok(!isVisible({ gemini: null, overview: null }, 'either'), 'no audit answers: not Visible');
  ok(!isVisible({ gemini: { named: 1, answers: 3 }, overview: null }, 'either') && engineNamesThem({ named: 3, answers: 3 }), 'a partial naming on a 3-question audit is not Visible; every answer is');
  ok(!isVisible({ gemini: one, overview: none }, 'both') && isVisible({ gemini: one, overview: one }, 'both'), '"both" needs both engines');
  ok(!isVisible({ gemini: one, overview: one }, 'off'), '"off" never marks Visible');
  const c = visibleCounts([{ gemini_answered: true, gemini_self_named: true, overview_answered: false, overview_self_named: true }]);
  ok(c.gemini.named === 1 && c.overview.answers === 0 && c.overview.named === 0, 'counts: an overview with no answer is not counted as named (the chips\' ruler)');
  const vf = read('src/lib/visibleFlag.ts');
  ok(!/chatgpt/i.test(vf.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'ChatGPT is not in the rule (code, comments stripped)');
}

console.log('3. the ONE status rule (SQL) is fed by every message table');
{
  ok(/create trigger trg_lead_status_from_message\s+after insert or update of status, lead_id, reply_kind, direction on public\.whatsapp_messages/.test(SQL), 'WhatsApp messages feed it (insert, status change, late lead link, reply tag)');
  ok(/create trigger trg_lead_status_from_message\s+after insert or update of status, lead_id, direction on public\.sms_messages/.test(SQL), 'texts feed it too');
  ok(/before update of status on public\.outreach_leads/.test(SQL) && /auth\.role\(\), ''\) = 'authenticated'/.test(SQL), 'a system write the messages contradict is corrected; a person\'s choice stands');
  ok(/w\.status in \('sent', 'delivered', 'read'\)/.test(SQL) && !/'queued'/.test(SQL.slice(SQL.indexOf('lead_conversation_signal'), SQL.indexOf('lead_status_target'))), 'only a send that really went counts (never queued / failed)');
  ok(/exception when others then\s+-- ⛔ Never lose a message/.test(SQL), 'a fault in the rule never loses the message');
  ok(/v_t is distinct from r\.status and v_t <> 'initial_contact'/.test(SQL), 'the repair never moves a lead into Contacted (no follow-up lane)');
  const repair = SQL.slice(SQL.indexOf('create or replace function public.repair_lead_statuses_from_messages'), SQL.indexOf('-- ── JOB 2'));
  ok(!/insert into public\.(whatsapp_messages|sms_messages|ai_reply_drafts|inbox_scheduled_sends|whatsapp_auto_replies)/.test(repair), 'the repair writes no message, draft or queue row');
  for (const name of ['their reply: Replied', 'our free text goes: You replied', 'a late sender write cannot say You replied', 'a voice note / AI-sent reply: You replied',
    'our send failed: back to Replied', 'a burst: Replied', 'linked later: You replied', 'we answer their yes: You replied', 'auto-reply: Contacted',
    'a pitch: Report sent stands', 'our text: You replied', 'a not-yet-sent row: still Replied', 'receipts: still You replied', 'repair writes no draft']) {
    ok(QA.includes(name), `scenario replayed in the SQL test: ${name}`);
  }
}

console.log('4. the drafter tags, never writes a status; Visible comes before any pitch');
{
  ok(!/undoReplied/.test(FN) && !/from\("outreach_leads"\)\.update\(\{ status: "initial_contact" \}/.test(FN), 'the old back-to-Contacted write is gone');
  ok(/async function tagReplies/.test(FN) && /update\(\{ reply_kind: ch\.reply_kind \}\)/.test(FN), 'it tags each inbound instead');
  const tick = FN.slice(FN.indexOf('async function handleTick'), FN.indexOf('async function loadPhases'));
  ok(tick.indexOf('refreshVisibleFlags(') > 0 && tick.indexOf('refreshVisibleFlags(') < tick.indexOf('ai_reply_draft_candidates'), 'the tick judges Visible BEFORE it handles new replies');
  const proc = FN.slice(FN.indexOf('async function processInbound'), FN.indexOf('async function refreshEvidenceLessPitches'));
  ok(proc.indexOf('VISIBLE_SKIP_REASON') > 0 && proc.indexOf('VISIBLE_SKIP_REASON') < proc.indexOf('writeDraft('), 'a Visible lead gets no draft and no Needs you…');
  ok(/const stopping = decision\.kind === "needs_you" && decision\.stop/.test(proc), '…but a stop still opts them out');
  ok((FN.match(/VISIBLE_NO_PITCH_ERROR, detail: VISIBLE_NO_PITCH_DETAIL/g) ?? []).length === 2, 'Draft reply and Regenerate refuse a pitch on a Visible lead');
  ok(/rpc\("apply_lead_visible"/.test(FN) && !/ai_visible_at:/.test(FN), 'the flag is written only through apply_lead_visible');
  ok(/x-ai-reply-drafts": "2026-10-21g-status-visible"/.test(FN), 'deploy marker bumped');
}

console.log('5. the Inbox: chip, Show filter, setting');
{
  ok(INBOX_QUICK_FILTERS.some((q) => q.value === 'visible' && q.label === 'Visible'), '"Visible" is in the Show filter');
  ok(passesQuickFilter('visible', { unread: false, waitingSinceMs: null, visible: true }) && !passesQuickFilter('visible', { unread: false, waitingSinceMs: null }), 'the filter keeps only Visible leads');
  ok(/<EngineChips scores=\{c\.engineScores\} visible=\{c\.visible\} \/>/.test(INBOX) && /\{active\.visible && <VisibleChip \/>\}/.test(INBOX), 'the chip on the row and in the thread');
  ok(/<InboxVisibleRuleControl \/>/.test(SETTINGS), 'the rule is a setting in Inbox Settings');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
