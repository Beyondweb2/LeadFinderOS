/* AI HANDLES REPLIES (2026-10-11) — WhatsApp only, approve-to-send only. src/lib/aiReplyDraft.ts + fn ai-reply-drafts.
   Pins: switch off → no drafts · one draft per inbound · the hand-over cases · outside the 24h window · approve sends
   once only · discard sends nothing · the per-draft cost cap · and the failed-crawl fix (src/lib/crawlWriteRule.ts).
   Nothing here sends anything: the rules are pure and the function / Inbox are read as source. */
import { readFileSync } from 'node:fs';
import {
  aiReplyDecision, aiChipFor, needsApproving, rowSendable, checkAiReply, fallbackAiReply, buildAiReplyPrompt, worstCaseCallUsd, mayCallWithin,
  AI_REPLY_DRAFT_MAX_USD, AI_REPLY_MAX_PROMPT_CHARS, AI_REPLY_SYSTEM_PROMPT, type AiReplyContext, type AiReplyRow,
} from '../src/lib/aiReplyDraft.ts';
import { pickMove, type MoveEvidence } from '../src/lib/replyMove.ts';
import { leadCrawlWriteDecision, storedCrawlFailed } from '../src/lib/crawlWriteRule.ts';
import { passesQuickFilter, INBOX_QUICK_FILTERS } from '../src/lib/conversationState.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FN = read('supabase/functions/ai-reply-drafts/index.ts');
const MIG = read('supabase/migrations/20261022090000_ai_handles_replies.sql');
const INBOX = read('src/pages/Inbox.tsx');
const PANEL = read('src/components/AiDraftPanel.tsx');

const NOW = Date.parse('2026-10-11T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const lead = { amount_paid: null, status: 'replied', is_archived: false };

console.log('1. flags always, drafts only behind the switch (2026-10-20)');
{
  const FLAGS = read('supabase/migrations/20261109090000_reply_flags_always.sql');
  ok(/default false/.test(MIG.match(/ai_handles_replies boolean[^;]*/)?.[0] ?? ''), 'the switch still defaults OFF in the database');
  ok(/reply_flags_since timestamptz not null default now\(\)/.test(FLAGS) && /m\.created_at >= s\.since/.test(FLAGS), 'flags read NEW replies only (from when the migration ran)');
  ok(!/set_enabled|ai_handles_replies\s*=/.test(FLAGS.replace(/--[^\n]*/g, '')), 'the migration never turns the switch on');
  /* The tick's per-reply work is processInbound (2026-10-21: new replies and replies that waited for their audit share it). */
  const tick = FN.slice(FN.indexOf('async function processInbound'), FN.indexOf('async function refreshEvidenceLessPitches'));
  const iGate = tick.indexOf('!env.switchOn || Date.parse(c.inbound_at) < env.since'); const iWrite = tick.indexOf('writeDraft(');
  ok(iGate > 0 && iGate < iWrite, 'the tick writes a model draft only after the switch gate (off → no model call)');
  ok(!/writeDraft\(/.test(tick.slice(0, iGate)), '…and no model call happens on the flag path before it');
  const refresh = FN.slice(FN.indexOf('async function refreshEvidenceLessPitches'), FN.indexOf('/* ───────────────────────── person actions'));
  ok(refresh.indexOf('plan.fixedText') > 0 && refresh.indexOf('plan.fixedText') < refresh.indexOf('writeDraft('), 'the pitch refresh rewrites only a code-built pitch (no model call)');
}
/* 2026-10-21: the switch is the Inbox mode; the clock is stamped by the database when the mode leaves Manual (trg_inbox_reply_mode_sync). */
ok(/old\.ai_reply_mode = 'manual'\) then\s+new\.ai_handles_replies_since := now\(\)/.test(readFileSync(new URL('../supabase/migrations/20261117090000_inbox_reply_mode.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')), 'turning it on starts the clock: older replies are never drafted (no backlog spend)');
ok(/if \(actor\.role !== "admin"\) return json\(\{ ok: false, error: "admin_only" \}, 403\)/.test(FN), 'only an admin can read or flip the switch');

console.log('2. one draft per inbound; a newer inbound replaces the old draft');
ok(/create unique index if not exists ai_reply_drafts_one_per_inbound on public\.ai_reply_drafts \(inbound_message_id\)/.test(MIG), 'unique index: one row per inbound message');
ok(/ai_reply_drafts_one_open_per_phone on public\.ai_reply_drafts \(user_id, phone\)\s*where status in \('generating', 'pending', 'sending'\)/.test(MIG), 'unique index: one OPEN row per conversation');
{
  const tick = FN.slice(FN.indexOf('async function handleTick'));
  const sup = tick.indexOf('status: "superseded"'); const ins = tick.indexOf('.from("ai_reply_drafts").insert('); const spend = tick.indexOf('writeDraft(');
  ok(sup > 0 && sup < ins, 'the older pending draft is superseded before the new row is claimed');
  ok(ins > 0 && ins < spend, 'the row is claimed (insert) BEFORE any model call — a second tick cannot spend on the same inbound');
  ok(/if \(insErr \|\| !claimed\) continue;/.test(tick), 'a lost claim is skipped, never retried into a second draft');
}
ok(/distinct on \(m\.user_id, m\.phone\)/.test(MIG) && /interval '30 seconds'/.test(MIG), 'only the newest inbound per conversation, after it settles (a burst gets one draft)');

console.log('3. the decision: stops, flags, auto-replies, the window');
const ev: MoveEvidence = { businessName: 'ZZ Fixture Electrical 01', trade: 'electricians', town: 'Leeds', engineWords: 'gemini', named: { named: 0, valid: 6 }, competitors: ['Rival A Electrical'], hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true };
const planFor = (body: string, o: { suppressed?: boolean; messageType?: string } = {}) => pickMove({ thread: [{ from: 'us', text: 'Hi, is this ZZ Fixture Electrical 01?', templateName: 'initial_contact' }, { from: 'them', text: body, messageType: o.messageType ?? 'text' }], suppressed: o.suppressed ?? false, aiSentSinceWin: 0, evidence: ev });
const decide = (body: string, o: { suppressed?: boolean; messageType?: string; inboundAt?: string; lead?: typeof lead | null; hadOutreach?: boolean } = {}) =>
  aiReplyDecision({ inboundAt: o.inboundAt ?? ago(2), lead: o.lead === undefined ? lead : o.lead, hadOutreach: o.hadOutreach ?? true, plan: planFor(body, o), nowMs: NOW });
for (const [body, reason] of [['STOP', 'opt_out'], ['please stop messaging me', 'opt_out'], ['scrub me off your list', 'opt_out'], ['fuck off', 'angry'], ['No. Bugger off!', 'angry'], ['f*** off', 'angry']] as const) {
  const d = decide(body);
  ok(d.kind === 'needs_you' && d.stop === true && d.reason === reason, `stop: "${body}" → Needs you, no draft (${reason})`);
}
ok((() => { const d = decide('hi', { suppressed: true }); return d.kind === 'needs_you' && d.stop && d.reason === 'do_not_contact'; })(), 'Do Not Contact → a stop');
for (const [body, reason] of [['No thanks mate', 'not_interested'], ['wrong number mate', 'wrong_person'], ['my solicitor will be in touch', 'legal'],['Tak berminat', 'other_language'], ['https://maps.app.goo.gl/xxx', 'link'], ['can I cancel if it does not work?', 'paul_looks']] as const) {
  const d = decide(body);
  ok(d.kind === 'needs_you' && !d.stop && d.reason === reason, `Needs you: "${body}" → ${reason}${d.kind === 'needs_you' ? '' : ' — got ' + d.kind}`);
}
ok((() => { const d = decide('[audio]', { messageType: 'audio' }); return d.kind === 'needs_you' && d.reason === 'media'; })(), 'a voice note → Needs you (listen first)');
for (const body of ['How much is it?', 'Can you give me a call tomorrow', 'Yes please, sounds good', 'Yes it is', 'I pay him to do the website']) ok(decide(body).kind === 'draft', `drafted (no hand-over): "${body}"`);
/* The first auto-reply to the opener: they have not confirmed who they are, so its draft is the first-reply pitch (Paul,
   2026-10-20, Ven). A repeated auto-reply still gets nothing (reply-move.test.ts, loop guards). */
{
  const d = decide('Thanks for contacting us, we will get back to you');
  const p = planFor('Thanks for contacting us, we will get back to you');
  ok(d.kind === 'draft' && p.move === 'auto_reply' && p.label === 'Auto-reply' && !!p.fixedText, 'an auto-responder to the opener → labelled Auto-reply, drafted as the first-reply pitch');
  const rep = pickMove({ thread: [{ from: 'us', text: 'Hi, is this ZZ Fixture Electrical 01?', templateName: 'initial_contact' }, { from: 'them', text: 'Thanks for your message, we will reply soon' }, { from: 'us', text: 'No rush, speak soon.' }, { from: 'them', text: 'Thanks for your message, we will reply soon' }], suppressed: false, aiSentSinceWin: 0, evidence: ev });
  ok(aiReplyDecision({ inboundAt: ago(2), lead, hadOutreach: true, plan: rep, nowMs: NOW }).kind !== 'draft' && !rep.fixedText, 'a repeated auto-reply → never drafted');
}
ok(decide('hi', { lead: { amount_paid: 99, status: 'paid', is_archived: false } }).kind === 'skipped', 'a paying client never gets a prospect draft');
ok(decide('hi', { hadOutreach: false }).kind === 'skipped' && decide('hi', { lead: null }).kind === 'skipped', 'not our outreach / no lead → nothing');
ok(/input\.suppressed = await isSuppressed\(service, \{ phone: c\.phone, leadId: c\.lead_id \}\); \/\/ fails closed/.test(FN), 'Do Not Contact is the shared suppression check, which fails closed');
{
  const tick = FN.slice(FN.indexOf('async function handleTick'));
  ok(/if \(decision\.stop && decision\.reason !== "do_not_contact"\) optedOut = await applyStop\(/.test(tick), 'a stop / angry reply opts out at once (the existing recordOptOut)');
  const stop = FN.slice(FN.indexOf('async function applyStop'), FN.indexOf('async function tagReplies'));
  ok(/recordOptOut\(service/.test(stop) && /whatsapp_auto_replies/.test(stop) && /skipped_suppressed/.test(stop) && /\.eq\("status", "queued"\)/.test(stop), '…and cancels queued follow-ups: the waiting pitch and the drip queue');
  ok(!/whatsapp_messages"\)\.insert|sendViaGraph/.test(stop), '…and sends nothing');
}

console.log('4. outside the 24-hour window → "Needs a template", no free text');
ok(decide('Yes please', { inboundAt: ago(25 * 60) }).kind === 'needs_template', 'a draftable reply older than 24h → needs a template');
ok(decide('STOP', { inboundAt: ago(25 * 60) }).kind === 'needs_you', '…but a stop is a stop whatever the window');
{
  const row: AiReplyRow = { id: 'd1', phone: '447700900001', lead_id: 'l', kind: 'draft', status: 'pending', inbound_at: ago(25 * 60), draft_text: 'hi' };
  ok(aiChipFor(row, NOW)?.label === 'Needs a template' && !needsApproving(row, NOW), 'a pending draft whose window has since closed reads "Needs a template", never "Needs approving"');
  ok(aiChipFor({ ...row, inbound_at: ago(5) }, NOW)?.label === 'Needs approving', 'inside the window it reads "Needs approving"');
  ok(aiChipFor({ ...row, status: 'sent' }, NOW) === null && aiChipFor({ ...row, status: 'discarded' }, NOW) === null, 'sent / discarded rows show nothing');
  ok(aiChipFor({ ...row, kind: 'needs_you', inbound_at: ago(5) }, NOW)?.label === 'Needs you' && aiChipFor({ ...row, kind: 'needs_you' }, NOW)?.label === 'Needs you', 'a Needs you flag stays a flag whatever the window');
  ok(rowSendable({ ...row, kind: 'needs_you', inbound_at: ago(5), draft_text: 'Sure' }, NOW) && !rowSendable({ ...row, kind: 'needs_you', inbound_at: ago(5), draft_text: 'x', why: { stop: true } as never }, NOW), 'a Needs you row with a draft can be approved; a stop never');
}
ok(/if \(!serviceWindowState\(d\.inbound_at\)\.open\) return json\(\{ ok: false, error: "window_closed"/.test(FN), 'claim refuses a closed window before anything is sent');
ok(/STOP_REASONS\.has\(d\.reason/.test(FN) && /error: "suppressed"/.test(FN), 'claim refuses a stop and a suppressed number');

console.log('5. the "Needs approving" filter');
ok(INBOX_QUICK_FILTERS.some((x) => x.value === 'needs_approving' && x.label === 'Needs approving'), 'the filter exists');
ok(passesQuickFilter('needs_approving', { unread: false, waitingSinceMs: 1, needsApproving: true }) && !passesQuickFilter('needs_approving', { unread: true, waitingSinceMs: 1 }), 'it keeps only conversations with a draft to approve');
ok(INBOX.includes("INBOX_QUICK_FILTERS.filter((f) => (f.value !== 'needs_approving' && f.value !== 'needs_you') || aiOn)"), 'Needs approving and Needs you: WhatsApp only (hidden on the SMS tab)');
ok(INBOX_QUICK_FILTERS.some((x) => x.value === 'needs_you' && x.label === 'Needs you') && passesQuickFilter('needs_you', { unread: false, waitingSinceMs: null, needsYou: true }) && !passesQuickFilter('needs_you', { unread: true, waitingSinceMs: 1 }), 'the Needs you filter keeps only flagged conversations');
ok(/NEEDS YOU SORTS TO THE TOP/.test(INBOX) && /data-testid="needs-you-reason"/.test(INBOX), 'Needs you sorts to the top and shows its reason on the row');
/* The list row is the memoised ConversationRow (2026-10-16, speed): aiRow = ai.forPhone(c.phone), st = stateByKey.get(c.key). */
ok(/aiRow=\{ai\.forPhone\(c\.phone\)\}/.test(INBOX) && /st=\{stateByKey\.get\(c\.key\)\}/.test(INBOX)
  && /<AiDraftChip row=\{aiRow\} compact \/>/.test(INBOX) && /\(!aiChipFor\(aiRow\) \|\| st\?\.failed\) && <ConvStateChip/.test(INBOX), 'the list shows "Needs approving" in place of "Waiting" (a failed send still shows)');

console.log('6. approve sends ONCE; discard sends nothing; the function itself never sends');
ok(!/sendViaGraph|graph\.facebook\.com|whatsapp-send\.ts|from\("whatsapp_messages"\)\.insert|from\("whatsapp_sends"\)/.test(FN), 'ai-reply-drafts has no send path and writes no message row');
{
  const claim = FN.slice(FN.indexOf('async function handleClaim'), FN.indexOf('async function handleComplete'));
  ok(/\.update\(\{ status: "sending", claimed_by: actor\.id/.test(claim) && /\.eq\("id", d\.id\)\.eq\("status", "pending"\)\.select\("id"\)\.maybeSingle\(\)/.test(claim), 'the claim is ONE conditional write pending → sending');
  ok(/if \(!won\) return json\(\{ ok: false, error: "already_claimed"/.test(claim), 'the loser of the claim is refused (a second click / tab / person sends nothing)');
  ok(/already_answered/.test(claim), 'a conversation someone already answered closes the draft instead of sending');
}
{
  const complete = FN.slice(FN.indexOf('async function handleComplete'), FN.indexOf('async function handleDiscard'));
  ok(/d\.claimed_by !== actor\.id/.test(complete), 'only the person who claimed it may complete it');
  ok(/m\.direction === "outbound" && m\.phone === d\.phone/.test(complete) && /approved_by: actor\.id, approved_at:/.test(complete) && /final_text: m\.body/.test(complete), 'complete believes the message LOG (outbound, same phone, after the claim) and records the final text, who and when');
}
{
  const approve = INBOX.slice(INBOX.indexOf('const approveAiDraft'), INBOX.indexOf('const regenerateAiDraft'));
  const iClaim = approve.indexOf("action: 'claim'"); const iSend = approve.indexOf('await send({'); const iDone = approve.indexOf("action: 'complete'");
  ok(iClaim > 0 && iClaim < iSend && iSend < iDone, 'Inbox: claim → the existing send → complete, in that order');
  ok((approve.match(/await send\(/g) ?? []).length === 1 && /catch \(e\) \{\n\s+toast\(\{ title: 'Not sent'/.test(approve), '…one send call, and a refused claim returns before it');
  ok(!/send-whatsapp-message|sendWhatsAppRequest/.test(approve), '…and the send is the Inbox\'s own send (useInbox.send), unchanged');
  const discard = INBOX.slice(INBOX.indexOf('const discardAiDraft'));
  ok(!/await send\(|send-whatsapp/.test(discard.slice(0, discard.indexOf('};'))), 'Discard calls no send');
}
{
  const discard = FN.slice(FN.indexOf('async function handleDiscard'), FN.indexOf('async function handleRegenerate'));
  ok(/status: "discarded", discarded_by: actor\.id, discarded_at:/.test(discard) && /\.eq\("status", "pending"\)/.test(discard), 'discard records who and when, only on an open draft');
}
ok(/stale|AI_REPLY_SENDING_STALE_MS/.test(FN) && /status: "sent", sent_message_id: m\.id/.test(FN) && /send_not_completed/.test(FN), 'an abandoned claim is settled from the message log — sent if a message exists, else back to pending — never re-sent');
ok(/Approve &amp; send/.test(PANEL) && /Regenerate/.test(PANEL) && /Discard/.test(PANEL), 'the panel has Approve & send, Regenerate and Discard');

console.log('7. cost: capped per draft and logged');
ok(worstCaseCallUsd(AI_REPLY_SYSTEM_PROMPT.length + AI_REPLY_MAX_PROMPT_CHARS) <= AI_REPLY_DRAFT_MAX_USD, 'one call at the longest prompt fits inside the per-draft cap');
ok(!mayCallWithin(AI_REPLY_DRAFT_MAX_USD - 0.0001, 10_000), 'a call that could push the draft over the cap is not made');
ok(/max_tokens: AI_REPLY_MAX_OUTPUT_TOKENS/.test(FN), 'the model output is capped');
{
  const w = FN.slice(FN.indexOf('async function writeDraft'), FN.indexOf('function whyOf'));
  ok(w.indexOf('mayCallWithin(') < w.indexOf('callReplyModel('), 'the cap is checked BEFORE each call');
  ok(/logOpenAiUsage\(service, \{ functionName: "ai-reply-drafts", apiType: "openai_ai_reply_draft"/.test(w), 'every call is logged to api_usage_log');
}
ok(/cost_usd: w\.spentUsd/.test(FN) && /cost_usd numeric/.test(MIG), 'the draft row stores its own cost');
ok(/guardAction\(service, actor\.id, "ai_draft"/.test(FN), 'Regenerate (a person asking for a model call) asks the usage guard');
ok(/mode !== "running"/.test(FN), 'paid AI paused → hand over instead of spending');

console.log('8. the draft: code picks the move, the model phrases it, the checker warns');
{
  const plan = planFor('Yes it is');
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'Yes it is', thread: [{ from: 'us', text: 'Hi, is this ZZ Fixture Electrical 01?' }, { from: 'them', text: 'Yes it is' }], plan, evidence: ev };
  const fb = fallbackAiReply(ctx);
  ok(plan.move === 'first_reply_pitch' && /Rival A Electrical/.test(fb) && (fb.match(/\?/g) ?? []).length === 1, 'bare "yes it is" → the full pitch: the search line + ONE question (Paul, 2026-10-20)');
  ok(checkAiReply(fb, ctx).length === 0, `the rule-built draft passes the checks${checkAiReply(fb, ctx).length ? ' — ' + checkAiReply(fb, ctx).join(' | ') : ''}`);
  ok(!/£|https?:|sign/i.test(fb), '…no price, no link, no sign-up on a bare yes');
  const p = buildAiReplyPrompt(ctx);
  ok(/POINTS \(say these, in this order, nothing else\)/.test(p) && /QUESTION \(end with exactly this one question/.test(p), 'the prompt hands the model the points and the one question');
  ok(/At most 3 short lines/.test(AI_REPLY_SYSTEM_PROMPT) && /never deny it/.test(AI_REPLY_SYSTEM_PROMPT) && /What time is best to call tomorrow\?/.test(AI_REPLY_SYSTEM_PROMPT), 'the system prompt: 3 lines, never deny AI, Paul\'s own examples');
}
{
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'Yes it is', thread: [], plan: planFor('Yes it is'), evidence: ev };
  const w = (t: string) => checkAiReply(t, ctx);
  ok(w('Great, it is £49.99 a month. Want a call?').some((x) => /price before|not on the fact sheet/.test(x)), 'a price before a price question / not on the sheet → warning');
  ok(w('We will get you on the first page of Google. Want a call?').some((x) => /ranking/.test(x)), 'a ranking / first page promise → warning');
  ok(w('Sign up here https://findable.live/agree/x').some((x) => /link/.test(x)), 'a link → warning');
  ok(w('Is that ok? What time suits?').some((x) => /more than one question/.test(x)), 'two questions → warning');
  ok(w('No I am not a bot, I am a real person.').some((x) => /Denies being AI-assisted/.test(x)), 'denying AI help → warning');
  ok(w('When I asked Gemini it named Smith And Sons Plumbing instead.').some((x) => /not in the audit/.test(x)), 'a business not in the audit → warning');
  ok(w('Lots of people search in Bristol for that.').some((x) => /not the audit's town/.test(x)), 'a different town → warning');
  ok(w('Your site has broken links. Want a call?').some((x) => /crawl does not record/.test(x)), 'a website issue the crawl did not record → warning');
  ok(w('Hi Dave, quick one. Want a call?').some((x) => /does not state that name/.test(x)), 'a first name the site does not state → warning');
  const named = { ...ctx, evidence: { ...ev, named: { named: 3, valid: 6 } } };
  ok(checkAiReply('When I asked Gemini it named others instead. Want a call?', named).some((x) => /more than a third/.test(x)), '"named others instead" when named in half the answers → warning');
}
ok(/rowSendable\(activeAi\)/.test(INBOX) && /action: 'draft'/.test(INBOX) && /action: 'mark_opted_out'/.test(INBOX), 'Inbox: Draft reply (always) and Mark opted out (a stop) go through ai-reply-drafts');

console.log('9. a failed crawl never overwrites the last good one');
const DAY = 86_400_000;
ok(leadCrawlWriteDecision({ mode: 'standard', created_at: ago(60), failed: false }, { mode: 'standard', failed: true }, NOW, 30 * DAY) === 'keep_last_good', 'failed standard over a good one → keep the good one');
ok(leadCrawlWriteDecision({ mode: 'full', created_at: ago(60 * 24 * 60), failed: false }, { mode: 'full', failed: true }, NOW, 30 * DAY) === 'keep_last_good', 'failed FULL crawl over a good one → keep the good one');
ok(leadCrawlWriteDecision({ mode: 'standard', created_at: ago(60), failed: true }, { mode: 'standard', failed: true }, NOW, 30 * DAY) === 'replace', 'failed over failed → the newer failure is stored');
ok(leadCrawlWriteDecision(null, { mode: 'standard', failed: true }, NOW, 30 * DAY) === 'replace', 'failed with nothing stored → stored (nothing good to keep)');
ok(leadCrawlWriteDecision({ mode: 'standard', created_at: ago(60), failed: false }, { mode: 'standard', failed: false }, NOW, 30 * DAY) === 'replace', 'a good crawl replaces as before');
ok(leadCrawlWriteDecision({ mode: 'full', created_at: ago(60), failed: false }, { mode: 'standard', failed: false }, NOW, 30 * DAY) === 'preserve_full', 'the old rule stands: a standard crawl never replaces a fresh full one');
ok(storedCrawlFailed({ fetch_failed: 'true' }) && storedCrawlFailed({ completeness: 'failed' }) && !storedCrawlFailed({ fetch_failed: null, completeness: 'complete' }), 'the stored row\'s own failed state is read from the two JSON paths');
{
  const cc = read('supabase/functions/crawl-check/index.ts');
  ok(/decision === "keep_last_good"/.test(cc) && /last_failed_attempt: \{ at: checkedAt/.test(cc) && /last_failed_attempt: null/.test(cc), 'crawl-check keeps the good row, notes the failed attempt, and clears the note on a good crawl');
  const job = read('supabase/functions/_shared/crawl-job.ts');
  ok(/if \(job\.lead_id && !keepLastGood\)/.test(job) && /kind: "full_crawl_failed"/.test(job), 'the full crawl\'s finalize does the same');
  ok(/add column if not exists last_failed_attempt jsonb/.test(MIG), 'the note column exists');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
