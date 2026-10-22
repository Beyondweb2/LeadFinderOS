/* ONE STATUS RULE FROM THE MESSAGES + THE VISIBLE FLAG (Paul, 2026-10-21). Record: docs/lead-status-and-visible.md.
   The status rule itself is SQL (migration 20261118090000); its scenario replay is supabase/tests/lead-status-from-messages.sql
   (rolled back, 39 checks, run through the Management API). Here: the TS halves (the reply-kind tag, the Visible rule), and the
   wiring — every message table feeds the one rule, the drafter no longer writes a status, the Visible skip comes before any
   pitch, the Inbox shows the chip / filter / setting. Nothing here sends. */
import { readFileSync } from 'node:fs';
import { replyKinds, replyKindChanges, type TagMsg } from '../src/lib/replyKindTag.ts';
import { engineNamesThem, isVisible, parseVisibleRule, parseVisibleShare, visibleCounts, visibleRuleKey, DEFAULT_VISIBLE_RULE } from '../src/lib/visibleFlag.ts';
import { isPlainConfirm, pickMove, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
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
  /* Per engine, MORE THAN HALF of its own answers (Paul, 2026-10-21). */
  ok(engineNamesThem({ named: 1, answers: 1 }) && engineNamesThem({ named: 2, answers: 2 }) && engineNamesThem({ named: 2, answers: 3 }), '1/1, 2/2, 2/3: named');
  ok(!engineNamesThem({ named: 1, answers: 2 }) && !engineNamesThem({ named: 1, answers: 3 }) && !engineNamesThem({ named: 0, answers: 2 }), '1/2, 1/3, 0/2: not named');
  ok(!isVisible({ gemini: { named: 1, answers: 2 }, overview: { named: 0, answers: 1 } }, 'either'), 'GSI Driving School (Gemini 1/2, Google AI 0/1, ChatGPT 2/2 ignored): NOT Visible — gets the pitch');
  ok(!isVisible({ gemini: { named: 1, answers: 2 }, overview: { named: 1, answers: 2 } }, 'either'), 'engines are judged separately, never pooled (1/2 + 1/2 is not 2/4 of anything)');
  ok(parseVisibleShare('x') === 'half' && !engineNamesThem({ named: 2, answers: 3 }, 'two_thirds') && engineNamesThem({ named: 3, answers: 3 }, 'two_thirds')
    && !engineNamesThem({ named: 2, answers: 3 }, 'all') && engineNamesThem({ named: 3, answers: 3 }, 'all'), 'the threshold is a setting: two-thirds / every answer');
  ok(visibleRuleKey('either', 'half') === 'either:half', 'a lead is re-judged when either setting changes');
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
  ok(/x-ai-reply-drafts": "2026-10-(?:21[h-z]|2[2-9][a-z]|3[01][a-z])-[a-z-]+"/.test(FN), 'deploy marker bumped (this release or a later one)');
  ok(/visible_rule, visible_min_share/.test(FN) && /isVisible\(visibleCounts\(rows \?\? \[\]\), vs\.rule, vs\.share\)/.test(FN), 'the tick judges with the rule AND the threshold setting');
}

console.log('5. the Inbox: chip, Show filter, setting');
{
  ok(INBOX_QUICK_FILTERS.some((q) => q.value === 'visible' && q.label === 'Visible'), '"Visible" is in the Show filter');
  ok(passesQuickFilter('visible', { unread: false, waitingSinceMs: null, visible: true }) && !passesQuickFilter('visible', { unread: false, waitingSinceMs: null }), 'the filter keeps only Visible leads');
  ok(/<EngineChips scores=\{c\.engineScores\} visible=\{c\.visible\} \/>/.test(INBOX) && /\{active\.visible && <VisibleChip \/>\}/.test(INBOX), 'the chip on the row and in the thread');
  ok(/<InboxVisibleRuleControl \/>/.test(SETTINGS), 'the rule is a setting in Inbox Settings');
}

console.log('6. GSI Driving School: "Yes", then "How can I help" an hour later, gets the first-reply pitch (Paul, 2026-10-21)');
{
  /* The live thread, 21 Oct (times as stored). Before the fix the second message read as a second reply and got
     "No playbook reply fits: answer it yourself". Counts without ChatGPT: Gemini 1/2 + Google AI 0/1 = 1 of 3. */
  const thread: MoveThreadMsg[] = [
    { from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short', messageType: 'template', at: '2026-10-21T08:02:03Z' },
    { from: 'them', text: 'Yes', messageType: 'text', at: '2026-10-21T08:26:07Z' },
    { from: 'them', text: 'How can I help', messageType: 'text', at: '2026-10-21T09:35:13Z' },
  ];
  const e = { businessName: 'GSI Driving School', trade: 'Driving instructors', town: 'Woking', engineWords: 'ai', named: { named: 1, valid: 3 },
    competitors: ['PassMeFast', 'LPOD Academy', "driveJohnson's"], hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true,
    site: { state: 'issues', issues: ['the hidden business details on some pages are broken'] } } as unknown as MoveEvidence;
  const run = (t: MoveThreadMsg[]) => pickMove({ thread: t, suppressed: false, aiSentSinceWin: 0, evidence: e });
  const p = run(thread);
  ok(p.move === 'first_reply_pitch' && !p.needsYou && !p.noDraft, `"How can I help" an hour after "Yes": the pitch (got ${p.move}${p.needsYou ? ` / ${p.needsYou.label}` : ''})`);
  ok(/recommending your competitors instead/i.test(p.fixedText ?? ''), '…the full pitch: 1 of 3 without ChatGPT allows "AI is recommending your competitors instead"');
  ok(run(thread.slice(0, 2)).move === 'first_reply_pitch', '"Yes" alone: the pitch (unchanged)');
  /* Once the pitch has gone, a later "how can I help" is not pitched again (and is never "No playbook reply fits"). */
  const after = run([...thread.slice(0, 2), { from: 'us', text: p.fixedText ?? 'pitch', messageType: 'text', at: '2026-10-21T08:40:00Z' }, thread[2]]);
  ok(after.move !== 'first_reply_pitch' && after.needsYou?.reason !== 'off_topic', `after the pitch went, "How can I help" is the next step, not a repeat pitch or Needs you (got ${after.move})`);
  /* 4. Plain confirms and "how can I help" never fall to "No playbook reply fits". */
  for (const s of ['Yes', 'Yes it is', 'How can I help?', 'Hi yes, how can I help you', 'Yeah speaking', 'What can I do for you?']) ok(isPlainConfirm(s, null), `a plain confirm: "${s}"`);
  for (const s of ['How much is it?', 'Who is this?', 'Not interested', 'Yes but how much']) ok(!isPlainConfirm(s, null), `not a plain confirm: "${s}"`);
  const late = run([thread[0], { from: 'them', text: 'Hi yes, how can I help you?', messageType: 'text', at: '2026-10-21T10:00:00Z' }]);
  ok(late.move === 'first_reply_pitch', '"Hi yes, how can I help you?" as a first reply: the pitch');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
