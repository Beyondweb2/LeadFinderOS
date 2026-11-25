/* ============================================================
   The research templates (Paul, 2026-11-25, src/lib/researchTemplates.ts).
   A web-dev follow-up to test against initial_question (per campaign), its close, the Findable ChatGPT pair, and two saved
   replies (the town result with blanks, the opt-out goodbye).

   Pins: exact wording in both body tables; variables in both registries; follow-ups only; manual only (bulk, queue, Outreach);
   not approved at Meta → free text inside the 24 hours only (the one shape rule, the sender passes it); audience by campaign
   style (picker + sender); the per-campaign question choice; the ChatGPT evidence gate (engine, "today", two names); the
   saved replies' blanks are refused by the Inbox; the migration is additive and admin-only; nothing old was removed.

   Run: npx tsx scripts/research-templates.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { WA_TEMPLATES, WA_TEMPLATE_BODIES, templateAwaitingApproval } from '../supabase/functions/_shared/whatsapp-send.ts';
import { READABLE_TEMPLATE_BODIES } from '../src/lib/templateBodies.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { getTemplateSendability } from '../src/lib/whatsappTemplates.ts';
import { isColdOutreachTemplate, NEEDS_PRIOR_WHATSAPP } from '../src/lib/coldOutreach.ts';
import { MANUAL_ONLY_TEMPLATES } from '../src/lib/goneCold.ts';
import { planBulkSend } from '../src/lib/inboxBulkSend.ts';
import { inWindowShape } from '../src/lib/inWindowFreeText.ts';
import { unresolvedTokens } from '../src/lib/leadUtils.ts';
import {
  CHATGPT_CHECK_QUESTION, CHATGPT_NAMED, CHATGPT_NOT_NAMED, OPT_OUT_GOODBYE, RESEARCH_TEMPLATES, RESEARCH_TEMPLATE_APPROVED,
  SAVED_REPLIES, WAITING_META_REASON, WEBDEV_TOWN_READY, WEBDEV_WHICH_TOWN, audienceRefusal, chatgptClaimRefusal, savedRepliesFor,
  webdevQuestionOf, webdevQuestionRefusal, windowOnlyTemplate,
} from '../src/lib/researchTemplates.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('── the wording, byte for byte ──');
const EXPECT: Record<string, string> = {
  [WEBDEV_WHICH_TOWN]: "Great.. I'm Paul. I built a tool that finds local businesses with weak sites. Which town do you want clients in?",
  [WEBDEV_TOWN_READY]: 'Here it is, your town is ready, free 7 days: leadfinderos.com/?ref=wa',
  [CHATGPT_CHECK_QUESTION]: "I'm Paul. I checked who ChatGPT suggests for 'plumbers in Leeds' today. Want to see what it said?",
  [CHATGPT_NAMED]: "It named Acme Plumbing and Leeds Pipes. You weren't in this answer. Answers change each time, but there are things that make you show up more often. Want a short voice note?",
  [CHATGPT_NOT_NAMED]: "You weren't in ChatGPT's answer. Answers change each time, but there are things that make you show up more often. Want a short voice note?",
};
for (const t of RESEARCH_TEMPLATES) {
  const want = EXPECT[t];
  const args = ['Biz', '', 'plumber', 'Acme Plumbing and Leeds Pipes', '', 'Leeds'] as const;
  ok(WA_TEMPLATE_BODIES[t]?.(...args) === want, `${t}: sender body table`);
  ok(READABLE_TEMPLATE_BODIES[t]?.(...args) === want, `${t}: Inbox body table`);
  ok(!!WHATSAPP_TEMPLATES.find((x) => x.value === t), `${t}: in the one sendable list`);
  ok(!!WA_TEMPLATES[t] && WA_TEMPLATES[t].lang === 'en', `${t}: sender registry, English`);
  ok(new RegExp(`\\b${t}: \\{ lang: "en", vars: ${JSON.stringify(WA_TEMPLATES[t].vars).replace(/[[\]]/g, '\\$&').replace(/,/g, ', ')} \\}`).test(read('supabase/functions/process-whatsapp-queue/index.ts')), `${t}: queue mirror has the same variables`);
  ok(!isColdOutreachTemplate(t) && NEEDS_PRIOR_WHATSAPP.has(t), `${t}: a follow-up, never a first touch`);
  ok(MANUAL_ONLY_TEMPLATES.has(t), `${t}: manual only`);
  ok(!templateAwaitingApproval(t), `${t}: not blocked at the payload door (so it can go as free text inside the window)`);
  ok(RESEARCH_TEMPLATE_APPROVED[t] === false && windowOnlyTemplate(t), `${t}: not approved at Meta → window only`);
}
ok(JSON.stringify(WA_TEMPLATES[CHATGPT_CHECK_QUESTION].vars) === '["trade_plural","town"]', 'chatgpt_check_question: {{1}} trade plural, {{2}} town');
ok(JSON.stringify(WA_TEMPLATES[CHATGPT_NAMED].vars) === '["competitors"]', 'chatgpt_named: {{1}} the joined names');
for (const t of [WEBDEV_WHICH_TOWN, WEBDEV_TOWN_READY, CHATGPT_NOT_NAMED]) ok(WA_TEMPLATES[t].vars.length === 0, `${t}: no variables`);
ok(!windowOnlyTemplate('initial_question') && !windowOnlyTemplate('polite_hook') && !windowOnlyTemplate(null), 'other templates are not window-only');
ok(!!WA_TEMPLATES.initial_question && !!WHATSAPP_TEMPLATES.find((x) => x.value === 'initial_question'), 'nothing old removed: initial_question still there');

console.log('── window only until Meta approves ──');
const version = { ok: true as const, text: 'words' };
const wo = { reason: WAITING_META_REASON };
const closed = inWindowShape({ origin: 'inbox', windowOpen: false, allowClosedText: false, typed: false, version, windowOnly: wo });
ok(closed.as === 'refuse' && 'error' in closed && closed.error === 'template_waiting_meta' && closed.reason === WAITING_META_REASON, 'window closed → refused, never the template');
ok(inWindowShape({ origin: 'inbox', windowOpen: true, allowClosedText: false, typed: false, version, windowOnly: wo }).as === 'text', 'window open → free text');
const noText = inWindowShape({ origin: 'inbox', windowOpen: true, allowClosedText: false, typed: false, version: { ok: false, why: 'marker' } as never, windowOnly: wo });
ok(noText.as === 'refuse', 'window open but no free-text version → refused, never the template');
ok(inWindowShape({ origin: 'inbox', windowOpen: false, allowClosedText: false, typed: false, version }).as === 'template', 'without windowOnly the old rule is unchanged');
const swm = read('supabase/functions/send-whatsapp-message/index.ts');
ok(/windowOnly: windowOnlyTemplate\(templateName\) \? \{ reason: WAITING_META_REASON \} : null/.test(swm), 'the sender passes the switch to the one shape rule');
ok(/const BUILD_ID = "2026-11-25a-research-templates"/.test(swm), 'BUILD_ID bumped');

console.log('── manual only ──');
for (const t of RESEARCH_TEMPLATES) {
  ok(!getTemplateSendability(t, { shareToken: null }, {}).ok, `${t}: refused on a screen that is not the one-lead Inbox`);
  const bulk = planBulkSend([{ key: 'k', label: 'ZZ QA', leadId: 'l1', phone: '+447700900000' }], t, { auditByLeadId: {} });
  ok(bulk.send.length === 0, `${t}: Inbox bulk send skips it`);
}
/* The live sales_queue_opener is the newest migration that redefines it (20261227090000_polite_hook3.sql). */
const queueFn = read('supabase/migrations/20261227090000_polite_hook3.sql');
for (const t of RESEARCH_TEMPLATES) ok(!queueFn.includes(`'${t}'`), `${t}: in no queue (sales_queue_opener) list`);

console.log('── audience ──');
ok(audienceRefusal(WEBDEV_WHICH_TOWN, 'findable') !== null && audienceRefusal(WEBDEV_WHICH_TOWN, null) !== null, 'web-dev wording refused for a Findable / no campaign lead');
ok(audienceRefusal(WEBDEV_WHICH_TOWN, 'leadfinderos') === null && audienceRefusal(WEBDEV_TOWN_READY, 'leadfinderos') === null, 'web-dev wording allowed for a LeadFinderOS-style lead');
ok(audienceRefusal(CHATGPT_NAMED, 'leadfinderos') !== null && audienceRefusal(CHATGPT_NAMED, 'findable') === null && audienceRefusal(CHATGPT_NAMED, null) === null, 'ChatGPT wording never to a web dev');
const pick = (t: string, campaign: { report_style?: string | null; webdev_question?: string | null } | null) =>
  getTemplateSendability(t, { shareToken: null }, { oneLead: true, campaign, reportSlug: 'a1' }).ok;
ok(!pick(WEBDEV_WHICH_TOWN, null) && pick(CHATGPT_NOT_NAMED, null), 'one-lead picker: a lead with no campaign is a local business');
ok(/LFOS_ONLY_TEMPLATES\.has\(templateName\) \|\| FINDABLE_ONLY_TEMPLATES\.has\(templateName\)/.test(swm) && /audienceRefusal\(templateName, rtStyle\)/.test(swm), 'the sender checks the audience too');
ok(/rtLeadErr\) return json\(\{ ok: false, error: "campaign_unreadable"/.test(swm) && /rtCampErr\) return json\(\{ ok: false, error: "campaign_unreadable"/.test(swm), 'an unreadable campaign refuses');

console.log('── A vs the old question, per campaign ──');
const lfosOld = { report_style: 'leadfinderos', webdev_question: 'initial_question' };
const lfosNew = { report_style: 'leadfinderos', webdev_question: 'webdev_which_town' };
ok(webdevQuestionOf(null) === 'initial_question' && webdevQuestionOf({ webdev_question: 'nonsense' }) === 'initial_question', 'absent / unknown = the old question');
ok(pick('initial_question', lfosOld) && !pick(WEBDEV_WHICH_TOWN, lfosOld), 'campaign on old: only initial_question offered');
ok(!pick('initial_question', lfosNew) && pick(WEBDEV_WHICH_TOWN, lfosNew), 'campaign on new: only webdev_which_town offered');
ok(webdevQuestionRefusal('initial_question', { report_style: 'findable', webdev_question: 'webdev_which_town' }) === null, 'a Findable campaign is not touched');
ok(getTemplateSendability('initial_question', { shareToken: null }, {}).ok, 'other screens (no campaign given) keep initial_question as it was');
const inbox = read('src/pages/Inbox.tsx');
ok(/oneLead: !!active\?\.leadId, campaign: active\?\.leadId \? activeCampaign : undefined/.test(inbox), 'Inbox one-lead picker supplies the lead and its campaign');
const mig = read('supabase/migrations/20261229090000_campaign_webdev_question.sql');
ok(/add column if not exists webdev_question text not null default 'initial_question'/.test(mig), 'migration: additive column, old question by default');
ok(/my_role\(\) is distinct from 'admin'/.test(mig) && /revoke all on function public\.campaign_set_webdev_question\(uuid, text\) from public, anon/.test(mig), 'migration: admin only, not anon');
ok(!/\bdrop\b|\bdelete\b|\btruncate\b/i.test(mig.split('\n').filter((l) => !l.startsWith('--')).join('\n')), 'migration: nothing destructive');
ok(/campaign_set_webdev_question/.test(read('src/components/campaigns/CampaignEditDialog.tsx')), 'campaign settings: the choice is saved through the admin function');

console.log('── the ChatGPT evidence gate ──');
const now = Date.parse('2026-11-25T12:00:00Z');
const fresh = now - 2 * 3600_000;
ok(chatgptClaimRefusal(CHATGPT_CHECK_QUESTION, { hookEngine: 'chatgpt', rivalCount: 3, auditDoneAt: fresh, now }) === null, 'ChatGPT hook, today → allowed');
ok(chatgptClaimRefusal(CHATGPT_CHECK_QUESTION, { hookEngine: 'gemini', rivalCount: 3, auditDoneAt: fresh, now }) !== null, 'a Google AI hook → refused (the message says ChatGPT)');
ok(chatgptClaimRefusal(CHATGPT_NOT_NAMED, { hookEngine: null, rivalCount: 0, auditDoneAt: fresh, now }) !== null, 'no hook engine → refused');
ok(chatgptClaimRefusal(CHATGPT_CHECK_QUESTION, { hookEngine: 'chatgpt', rivalCount: 3, auditDoneAt: now - 25 * 3600_000, now }) !== null, '"today" but the audit is over a day old → refused');
ok(chatgptClaimRefusal(CHATGPT_CHECK_QUESTION, { hookEngine: 'chatgpt', rivalCount: 3, auditDoneAt: null, now }) !== null, 'unreadable audit time → refused');
ok(chatgptClaimRefusal(CHATGPT_NAMED, { hookEngine: 'chatgpt', rivalCount: 1, auditDoneAt: null, now }) !== null, 'fewer than two names → the named one is refused');
ok(chatgptClaimRefusal(CHATGPT_NOT_NAMED, { hookEngine: 'chatgpt', rivalCount: 0, auditDoneAt: null, now }) === null, 'the no-names one needs no names (and no "today")');
ok(chatgptClaimRefusal(WEBDEV_WHICH_TOWN, { hookEngine: null, rivalCount: 0, auditDoneAt: null }) === null, 'the gate is for the ChatGPT wording only');
ok(/chatgptClaimRefusal\(templateName, \{ hookEngine: rt\.hookEngine, rivalCount: rt\.rivals\.length, auditDoneAt: doneAt \}\)/.test(swm), 'the sender reads the lead’s own audit for the gate');
ok(swm.indexOf('chatgpt_claim_unsupported') < swm.indexOf('const shape = inWindowShape('), 'the gate runs before the payload / dry run');

console.log('── saved replies ──');
ok(OPT_OUT_GOODBYE === "No problem at all, I won't message again.", 'the opt-out goodbye, exactly');
const town = SAVED_REPLIES.find((r) => r.id === 'webdev_town_result')!;
ok(town.text === 'Just ran {{town}} + {{trade}}: {{N}} with broken or slow sites. Want a 20-sec voice note showing them?', 'the town result, with blanks');
ok(unresolvedTokens(town.text).length === 3, 'its three blanks are caught by the Inbox send guard');
ok(unresolvedTokens('Just ran Leeds + plumbers: 14 with broken or slow sites. Want a 20-sec voice note showing them?').length === 0, 'filled in → sendable');
ok(savedRepliesFor('findable').map((r) => r.id).join() === 'opt_out_goodbye' && savedRepliesFor('leadfinderos').length === 2, 'the town result only for web-dev leads; the goodbye for everyone');
ok(/insertWarmDraft\(active\.key, OPT_OUT_GOODBYE\)/.test(inbox) && /data-testid="ai-opt-out-goodbye"/.test(read('src/components/AiDraftPanel.tsx')), 'a stop offers “Put goodbye in box” (never sends by itself)');
ok(/const left = unresolvedTokens\(body\);/.test(inbox), 'the Inbox still refuses free text with blanks left');

console.log(f ? `\n${f} FAILED` : '\nall passed');
process.exit(f ? 1 : 0);
