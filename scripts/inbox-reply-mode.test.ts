/* THE INBOX REPLY MODE (2026-10-21, Paul): Manual / Draft for approval / Auto, replacing "When a prospect replies" and the
   "AI handles replies" switch. The rule (src/lib/inboxReplyMode.ts), the Level 2 additions (evidence complete, the simple
   first reply), the migration and the wiring, read as source. Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import {
  INBOX_REPLY_MODES, INBOX_REPLY_MODE_LABELS, botMaySaySendsEveryOne, modeDrafts, modeMayAutoSend, parseInboxReplyMode,
} from '../src/lib/inboxReplyMode.ts';
import {
  AUTO_SEND_CHOICES, autoSendVerdict, draftFactsFromPlan, draftFactsFromRow, evidenceComplete, isSimpleFirstReply, theirMessagesSinceUs,
  threadHardReason, type AutoSendFacts,
} from '../src/lib/aiAutoSend.ts';
import { pickMove, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');

console.log('1. the three modes');
{
  ok(JSON.stringify(INBOX_REPLY_MODES) === '["manual","draft","auto"]', 'exactly Manual, Draft for approval, Auto');
  ok(INBOX_REPLY_MODE_LABELS.manual === 'Manual' && INBOX_REPLY_MODE_LABELS.draft === 'Draft for approval' && INBOX_REPLY_MODE_LABELS.auto === 'Auto', 'the labels Paul named');
  for (const raw of [null, undefined, '', 'send', 'audit_only', 'AUTO', 7]) ok(parseInboxReplyMode(raw) === 'manual', `unknown ${JSON.stringify(raw)} reads as Manual (nothing happens)`);
  ok(modeMayAutoSend('auto') && !modeMayAutoSend('draft') && !modeMayAutoSend('manual'), 'only Auto may ever send by itself');
  ok(modeDrafts('draft') && modeDrafts('auto') && !modeDrafts('manual'), 'Manual drafts nothing');
}

console.log('2. the bot answer');
{
  ok(botMaySaySendsEveryOne('manual') && botMaySaySendsEveryOne('draft'), '"I read and send every one myself" is allowed only in Manual and Draft for approval');
  ok(!botMaySaySendsEveryOne('auto') && !botMaySaySendsEveryOne(null) && !botMaySaySendsEveryOne(undefined) && !botMaySaySendsEveryOne('x'), '…never in Auto, and never when the mode cannot be read');
  const FN = strip(read('supabase/functions/ai-reply-drafts/index.ts'));
  ok(/select\("ai_reply_mode"\)[\s\S]{0,120}if \(error \|\| !data\) return true;[\s\S]{0,40}return !botMaySaySendsEveryOne\(/.test(FN), 'the drafter reads the mode for the bot answer and fails toward "may be automated"');
}

console.log('3. the first reply pitch sends itself only on a plain "yes" or "how can I help"');
{
  for (const t of [['Yes'], ['Yes it is'], ['yeah that\'s right 👍'], ['How can I help?'], ['Hi, yes speaking. How can I help you?'], ['Yes', 'How can I help you?', '?'], ['Hello, what can I do for you'], ['Correct'], ['yep thanks']]) {
    ok(isSimpleFirstReply(t), `simple: ${JSON.stringify(t)}`);
  }
  for (const t of [['Dave'], ['Hello?'], ['What is this about?'], ['Interested'], ['Yes, how much is it?'], ['Who is this?'], ['Yes but I already have someone'], [], ['?']]) {
    ok(!isSimpleFirstReply(t), `NOT simple: ${JSON.stringify(t)}`);
  }
  ok(JSON.stringify(theirMessagesSinceUs([{ from: 'them', text: 'a' }, { from: 'us', text: 'b' }, { from: 'them', text: 'c' }, { from: 'them', text: 'd' }])) === '["c","d"]', 'their messages since our last one, oldest first');
  ok(AUTO_SEND_CHOICES[0].key === 'first_reply_pitch', 'the first-reply pitch is the first switch (the first candidate)');
}

console.log('4. evidence complete');
{
  ok(evidenceComplete('done', 'issues') && evidenceComplete('done', 'clean') && evidenceComplete('done', 'no_website') && evidenceComplete('done', 'profile'), 'a complete audit + a read site (or none to read) is complete');
  for (const [a, s] of [['failed', 'clean'], ['running', 'clean'], ['none', 'clean'], ['done', 'unreadable'], ['done', 'not_checked'], ['done', null], [null, 'clean']] as Array<[string | null, string | null]>) {
    ok(!evidenceComplete(a, s), `not complete: audit ${a}, site ${s}`);
  }
  ok(draftFactsFromRow({ kind: 'draft', draft_text: 'x', why: { evidence: { ready: true, audit: 'done', crawl: 'final', complete: true } } }).evidenceComplete === true, 'the stored draft carries it to the send-time check');
  ok(draftFactsFromRow({ kind: 'draft', draft_text: 'x', why: { evidence: { ready: true, audit: 'done', crawl: 'final' } } }).evidenceComplete === false, 'a draft from before this release reads as not complete');
}

console.log('5. the verdict: the new checks');
{
  const NOW = Date.parse('2026-10-22T10:00:00Z');
  const ev: MoveEvidence = {
    businessName: 'ZZ Fixture Plumbing 91', trade: 'plumbers', town: 'Rugby', engineWords: 'gemini', named: { named: 0, valid: 6 },
    competitors: ['Rival A Plumbing'], hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true,
    site: { state: 'issues', issues: ['Some pages have no main heading'] },
  };
  const opener: MoveThreadMsg = { from: 'us', text: '[initial_contact]', templateName: 'initial_contact' };
  const facts = (said: string[], o: Partial<AutoSendFacts> = {}, complete = true): AutoSendFacts => {
    const thread: MoveThreadMsg[] = [opener, ...said.map((t) => ({ from: 'them' as const, text: t }))];
    const input = { thread, suppressed: false, aiSentSinceWin: 0, evidence: ev, nowMs: NOW };
    const plan = pickMove(input);
    return {
      masterOn: true, intentsOn: AUTO_SEND_CHOICES.map((c) => c.key), dailyCap: 30, usedToday: 0, theirMessages: theirMessagesSinceUs(thread),
      draft: draftFactsFromPlan(plan, { kind: 'draft', text: plan.fixedText ?? 'A clean draft.', problems: [], usedFallback: false, evidenceComplete: complete }),
      latestInbound: said[said.length - 1], threadHard: threadHardReason(input), digits: '447700900123', lead: { amount_paid: null, status: 'replied', is_archived: false },
      suppressed: false, personActiveAt: null, senderIsAdmin: true, nowMs: NOW, ...o,
    };
  };
  const why = (v: ReturnType<typeof autoSendVerdict>) => (v.send ? 'send' : v.reason);
  ok(why(autoSendVerdict(facts(['Yes it is']))) === 'send', 'control: a plain "Yes it is" with complete evidence, everything on → sends');
  ok(why(autoSendVerdict(facts(['How can I help?']))) === 'send', 'control: "How can I help?" → sends');
  ok(why(autoSendVerdict(facts(['Yes it is'], {}, false))) === 'evidence_incomplete', 'the audit or website check not complete → waits for approval');
  ok(why(autoSendVerdict(facts(['Dave']))) === 'not_simple_first_reply', 'a first reply that is just a name → waits for approval');
  ok(why(autoSendVerdict(facts(['Hello?']))) === 'not_simple_first_reply', '"Hello?" → waits for approval');
  ok(why(autoSendVerdict(facts(['Yes it is'], { masterOn: false }))) === 'master_off', 'Draft for approval / Manual (not Auto) → never sends');
}

console.log('6. the migration');
{
  const MIG = read('supabase/migrations/20261117090000_inbox_reply_mode.sql');
  const M = strip(MIG);
  ok(/set ai_reply_mode = case when ai_handles_replies is true then 'draft' else 'manual' end/.test(M), 'today\'s state (AI on, audit only) becomes Draft for approval; AI off becomes Manual');
  ok(/alter column ai_reply_mode set default 'manual'/.test(M) && /check \(ai_reply_mode in \('manual', 'draft', 'auto'\)\)/.test(M), 'three values only; a new row is Manual');
  ok(!/ai_reply_mode = 'auto'/.test(M.replace(/new\.ai_reply_mode/g, '')) , 'the migration never sets Auto');
  ok(/check \(first_reply_mode = 'audit_only'\)/.test(M) && /set first_reply_mode = 'audit_only' where first_reply_mode is distinct from 'audit_only'/.test(M), '"Audit and reply" is retired: the database refuses it, so no path can arm the old template reply');
  ok(/update public\.whatsapp_auto_replies set status = 'cancelled'[\s\S]{0,120}where status in \('awaiting_audit', 'pending'\)/.test(M), 'any pitch still parked for the old automatic send is retired');
  ok(/new\.ai_handles_replies := new\.ai_reply_mode <> 'manual'/.test(M) && /new\.auto_reply_enabled := new\.ai_reply_mode <> 'manual'/.test(M) && /new\.first_reply_mode := 'audit_only'/.test(M), 'the old columns follow the mode (every deployed reader stays true)');
  ok(/new\.ai_reply_mode := case when new\.ai_handles_replies is true then 'draft' else 'manual' end/.test(M), 'an old writer of the switch alone moves the mode to Draft / Manual, never Auto');
  ok(/old\.ai_reply_mode = 'manual'\) then\s+new\.ai_handles_replies_since := now\(\)/.test(M), 'leaving Manual starts the clock (no backlog drafted)');
  ok(/if new\.ai_reply_mode is distinct from 'auto' or new\.ai_handles_replies is not true then\s+update public\.inbox_scheduled_sends set status = 'cancelled', cancel_reason = 'ai_mode_not_auto'[\s\S]{0,120}status in \('scheduled', 'held'\)/.test(M), 'switching to Manual or Draft for approval cancels everything waiting to auto-send at once');
  ok(/after update of ai_reply_mode, ai_handles_replies, ai_auto_send_intents on public\.whatsapp_outreach_state/.test(M), '…on a change of the mode itself');
  ok(!/ai_auto_send_intents\s*=/.test(M), 'the migration switches no reply type on');
}

console.log('7. the wiring');
{
  const SH = strip(read('supabase/functions/_shared/ai-auto-send.ts'));
  ok(/masterOn: modeMayAutoSend\(parseInboxReplyMode\(data\.ai_reply_mode\)\) && data\.ai_handles_replies === true/.test(SH), 'automatic sending needs the mode Auto (draft time AND send time read the same state)');
  const FN = strip(read('supabase/functions/ai-reply-drafts/index.ts'));
  ok(/evidenceComplete: a\.why\.evidence\?\.complete === true/.test(FN) && /theirMessages: theirMessagesSinceUs\(a\.input\.thread\)/.test(FN), 'the worker passes the evidence and their messages to the rule');
  ok(/complete: v\.state === "ready" && evidenceComplete\(v\.audit, site\)/.test(FN) && /site: found\.check\.state/.test(FN), 'every draft records whether its evidence was complete');
  ok(/action === "set_mode"/.test(FN) && /ai_reply_mode: raw/.test(FN) && /INBOX_REPLY_MODES as readonly string\[\]\)\.includes\(raw\)/.test(FN), 'set_mode stores only a known mode (admin only, handleSettings)');
  ok(/if \(actor\.role !== "admin"\) return json\(\{ ok: false, error: "admin_only" \}, 403\);[\s\S]{0,400}if \(set === "audit"\)[\s\S]{0,400}\} else if \(set\)/.test(FN), '…and only for an admin (the audit switch too)');
  const DRAIN = strip(read('supabase/functions/inbox-scheduled-send/index.ts'));
  ok(/theirMessages: theirMessagesSinceUs\(thread\)/.test(DRAIN) && /recent\.error\) return "ai_facts_unreadable"/.test(DRAIN), 'the send-time check reads their messages again (unreadable = dropped)');
  const UI = read('src/components/InboxReplyModeControl.tsx');
  ok(/INBOX_REPLY_MODES\.map/.test(UI) && !/'send'|set_first_reply_mode|Audit and reply/.test(strip(UI)), 'the control offers the three modes and nothing that sends the old template reply');
  ok(/\{mode === 'auto' && auto && <AutoSendSwitches/.test(UI), 'the per-type switches show only under Auto');
  ok(/action: 'set_mode', mode: next/.test(UI) && /invalidateQueries\(\{ queryKey: QUEUE_STATUS_KEY \}\)/.test(UI), 'it saves through set_mode and refreshes the shared status');
  const SET = read('src/components/InboxSettings.tsx');
  ok(/<InboxReplyModeControl channel=\{channel\} \/>/.test(SET) && !/AutoReplyToggle|AiRepliesToggle/.test(strip(SET)), 'Settings holds the one control; the two old controls are gone');
  const READOUT = read('src/components/AiDraftOutcomes.tsx');
  ok(/sent by AI today/.test(READOUT) && !/set_auto_send/.test(READOUT), 'Draft outcomes shows the auto-sent counts; the switches moved to Settings');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
if (f) process.exit(1);
