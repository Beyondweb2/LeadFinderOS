/* AI HANDLES REPLIES (2026-10-11) — WhatsApp only, approve-to-send only. src/lib/aiReplyDraft.ts + fn ai-reply-drafts.
   Pins: switch off → no drafts · one draft per inbound · the hand-over cases · outside the 24h window · approve sends
   once only · discard sends nothing · the per-draft cost cap · and the failed-crawl fix (src/lib/crawlWriteRule.ts).
   Nothing here sends anything: the rules are pure and the function / Inbox are read as source. */
import { readFileSync } from 'node:fs';
import {
  aiReplyDecision, aiChipFor, needsApproving, checkAiReply, fallbackAiReply, buildAiReplyPrompt, worstCaseCallUsd, mayCallWithin,
  AI_REPLY_DRAFT_MAX_USD, AI_REPLY_MAX_PROMPT_CHARS, AI_REPLY_SYSTEM_PROMPT, OWNERSHIP_QUESTION, type AiReplyContext, type AiReplyRow,
} from '../src/lib/aiReplyDraft.ts';
import { GENERIC_SITE_LINE, OFFER_LINE_BOTH } from '../src/lib/draftEvidence.ts';
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
const base = { enabled: true, body: 'Yeah go on what did you find', messageType: 'text', inboundAt: ago(2), lead, suppressed: false, hadOutreach: true, nowMs: NOW };
const kindOf = (o: Partial<typeof base>) => aiReplyDecision({ ...base, ...o });

console.log('1. switch off → no drafts');
ok(kindOf({ enabled: false }).kind === 'skipped', 'off: the rule skips');
ok(/default false/.test(MIG.match(/ai_handles_replies boolean[^;]*/)?.[0] ?? ''), 'the switch defaults OFF in the database');
ok(/where id = 1 and ai_handles_replies\)/.test(MIG), 'the candidate query returns nothing while the switch is off');
{
  const tick = FN.slice(FN.indexOf('async function handleTick'));
  ok(tick.indexOf('ai_handles_replies !== true') > 0 && tick.indexOf('ai_handles_replies !== true') < tick.indexOf('ai_reply_draft_candidates'), 'the tick stops before reading candidates when the switch is off');
}
ok(/ai_handles_replies_since = new Date\(\)\.toISOString\(\)/.test(FN.replace(/patch\.ai_handles_replies_since/, 'ai_handles_replies_since')) && /m\.created_at >= s\.since/.test(MIG), 'turning it on starts the clock: older replies are never drafted (no backlog spend)');
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

console.log('3. hand-over cases → "Needs you", no draft');
const handover: Array<[string, Partial<typeof base>, string]> = [
  ['stop', { body: 'STOP' }, 'opt_out'],
  ['please stop messaging me', { body: 'please stop messaging me' }, 'opt_out'],
  ['not interested', { body: 'Not interested thanks' }, 'not_interested'],
  ['no thanks', { body: 'No thanks mate' }, 'not_interested'],
  ['call request', { body: 'Can you give me a call tomorrow' }, 'call_request'],
  ['price', { body: 'How much is it?' }, 'price'],
  ['angry', { body: 'who the f*** gave you my number, this is spam' }, 'angry'],
  ['angry (swearing)', { body: 'fuck off' }, 'angry'],
  ['legal', { body: 'I will report you to trading standards' }, 'legal'],
  ['solicitor', { body: 'my solicitor will be in touch' }, 'legal'],
  ['photo, no words', { body: '[image]', messageType: 'image' }, 'media'],
  ['Do Not Contact / opted out', { suppressed: true }, 'do_not_contact'],
];
for (const [name, o, reason] of handover) {
  const d = kindOf(o);
  ok(d.kind === 'needs_you' && d.reason === reason, `hand-over: ${name} → Needs you (${reason})${d.kind === 'needs_you' ? '' : ' — got ' + d.kind}`);
}
ok(kindOf({ lead: { amount_paid: 99, status: 'paid' } }).kind === 'skipped', 'a paying client never gets a prospect draft');
ok(kindOf({ hadOutreach: false }).kind === 'skipped', 'a message that is not a reply to our outreach gets nothing');
ok(kindOf({ lead: null }).kind === 'skipped', 'no lead → nothing');
ok(kindOf({ body: 'Thanks for contacting us, we will get back to you' }).kind === 'skipped', 'an auto-responder gets nothing');
ok(kindOf({}).kind === 'draft', 'an ordinary reply in the window → a draft');
ok(kindOf({ body: 'Yes it is, who is this?' }).kind === 'draft', 'the opener answer ("Yes it is, who is this?") → a draft');
ok(/const suppressed = await isSuppressed\(service, \{ phone: c\.phone, leadId: c\.lead_id \}\); \/\/ fails closed/.test(FN), 'Do Not Contact is the shared suppression check, which fails closed');

console.log('4. outside the 24-hour window → "Needs a template", no free text');
ok(kindOf({ inboundAt: ago(25 * 60) }).kind === 'needs_template', 'a reply older than 24h → needs a template');
{
  const row: AiReplyRow = { id: 'd1', phone: '447700900001', lead_id: 'l', kind: 'draft', status: 'pending', inbound_at: ago(25 * 60), draft_text: 'hi' };
  ok(aiChipFor(row, NOW)?.label === 'Needs a template' && !needsApproving(row, NOW), 'a pending draft whose window has since closed reads "Needs a template", never "Needs approving"');
  ok(aiChipFor({ ...row, inbound_at: ago(5) }, NOW)?.label === 'Needs approving', 'inside the window it reads "Needs approving"');
  ok(aiChipFor({ ...row, status: 'sent' }, NOW) === null && aiChipFor({ ...row, status: 'discarded' }, NOW) === null, 'sent / discarded rows show nothing (plain "Waiting" stays)');
  ok(aiChipFor({ ...row, kind: 'needs_you', inbound_at: ago(5) }, NOW)?.label === 'Needs you', 'a hand-over reads "Needs you"');
}
ok(/if \(!serviceWindowState\(d\.inbound_at\)\.open\) return json\(\{ ok: false, error: "window_closed"/.test(FN), 'claim refuses a closed window before anything is sent');

console.log('5. the "Needs approving" filter');
ok(INBOX_QUICK_FILTERS.some((x) => x.value === 'needs_approving' && x.label === 'Needs approving'), 'the filter exists');
ok(passesQuickFilter('needs_approving', { unread: false, waitingSinceMs: 1, needsApproving: true }) && !passesQuickFilter('needs_approving', { unread: true, waitingSinceMs: 1 }), 'it keeps only conversations with a draft to approve');
ok(/INBOX_QUICK_FILTERS\.filter\(\(f\) => f\.value !== 'needs_approving' \|\| aiOn\)/.test(INBOX), 'WhatsApp only (hidden on the SMS tab)');
ok(/<AiDraftChip row=\{ai\.forPhone\(c\.phone\)\} compact \/>/.test(INBOX) && /\(!aiChipFor\(ai\.forPhone\(c\.phone\)\) \|\| stateByKey\.get\(c\.key\)\?\.failed\) && <ConvStateChip/.test(INBOX), 'the list shows "Needs approving" in place of "Waiting" (a failed send still shows)');

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

console.log('8. the draft: the brief\'s structure, nothing invented');
const ctx: AiReplyContext = {
  firstName: null, businessName: 'Safety First Electrical', latestInbound: 'Yes it is, who is this?',
  thread: [{ from: 'us', text: 'Hi, is this Safety First Electrical?' }, { from: 'them', text: 'Yes it is, who is this?' }],
  search: { trade: 'an electrician', town: 'Leeds' }, competitors: ['Spark Bros', 'Leeds Electric'], namedEverywhere: false, hookAlreadySent: false,
  findings: [{ title: 'Placeholder blocks', said: 'Your projects page still shows placeholder blocks like Project 1 and Project 2.' }], ownershipKnown: false,
  engineWords: 'ai', hasWebsite: true,
};
{
  const fb = fallbackAiReply(ctx);
  ok(/Spark Bros/.test(fb) && /placeholder/i.test(fb) && fb.endsWith(OWNERSHIP_QUESTION), 'rule-built draft: search + names → the real issue → the agency question');
  ok(checkAiReply(fb, ctx).length === 0, `the rule-built draft passes the checks${checkAiReply(fb, ctx).length ? ' — ' + checkAiReply(fb, ctx).join(' | ') : ''}`);
  const bare = { ...ctx, search: null, competitors: [], findings: [] };
  const fb2 = fallbackAiReply(bare);
  ok(!/AI|placeholder|issue/i.test(fb2.replace(OWNERSHIP_QUESTION, '').replace(GENERIC_SITE_LINE, '').replace(OFFER_LINE_BOTH, '')) && fb2.includes(GENERIC_SITE_LINE) && fb2.endsWith(OWNERSHIP_QUESTION), 'no audit, no crawl → no AI claim and no site issue is invented (the general line instead)');
  const p = buildAiReplyPrompt(bare);
  ok(/SEARCH: none on record\. Leave the AI part out\./.test(p) && /WEBSITE ISSUES: none to mention\. Do not claim any fault\./.test(p), 'the prompt says to leave the absent parts out');
}
ok(checkAiReply('Hi mate, it is £99 a month, see https://findable.live — are you with an agency?', ctx).some((x) => /price or a link/.test(x)), 'a draft with a price or a link is flagged');
ok(checkAiReply('Hi mate, i asked AI and it named Spark Bros. Your projects page shows placeholder blocks. Want a call?', ctx).some((x) => /agency/.test(x)), 'a draft that does not ask the agency question is flagged');
ok(/selectFindings\(/.test(FN) && /, 3\);/.test(FN.slice(FN.indexOf('selectFindings('), FN.indexOf('selectFindings(') + 400)), 'site issues come from the call script\'s own rule (selectFindings), at most 3');

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
