/* THE SERVICE-QUESTION LINE (Paul, 2026-10-26): a reply to a question about the service ends with FINDABLE_SITE_LINE, once,
   before the one question. Not the hook, not a no, not Australia, not an auto-reply / sticker / reaction.
   Real phrasings, the rule-built draft (no model), the checker, and the model safety net (ensureSiteLine).
   Pure: no model, no DB. Nothing here sends. Run: npx tsx scripts/service-question-link.test.ts */
import { readFileSync } from 'node:fs';
import { pickMove, firstReplyPitch, insertSiteLine, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { FINDABLE_SITE_LINE, PLAYBOOK } from '../src/lib/replyPlaybook.ts';
import { checkAiReply, ensureSiteLine, fallbackAiReply, AI_BRAND, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { AUTO_SEND_CHOICES, autoSendable, autoSendVerdict, draftFactsFromPlan, type AutoSendFacts } from '../src/lib/aiAutoSend.ts';
import { GUARANTEE_LINE } from '../src/lib/offerFactSheet.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const ev: MoveEvidence = { businessName: 'ZZ QA Plumbing 91', trade: 'plumbers', town: 'Rugby', engineWords: 'gemini', named: { named: 0, valid: 6 },
  missed: { engine: 'gemini', question: 'Who is the best plumber in Rugby?' }, competitors: ['Rival A Plumbing', 'Rival B Plumbing', 'Rival C Plumbing'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true,
  site: { state: 'issues', issues: ['Some pages have no main heading'] } };
const au: MoveEvidence = { ...ev, businessName: 'ZZ QA Plumbing AU', town: 'Geelong VIC', prospectOnly: true };
const T0 = Date.parse('2026-10-26T10:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const opener: MoveThreadMsg = { from: 'us', text: '', templateName: 'initial_contact', messageType: 'template', at: at(-600) };
const pitchMsg: MoveThreadMsg = { from: 'us', text: [...firstReplyPitch(ev).lines, firstReplyPitch(ev).question].join('\n\n'), at: at(-300) };
const them = (text: string, min = 0, messageType = 'text'): MoveThreadMsg => ({ from: 'them', text, messageType, at: at(min) });
/** After the pitch went (the hook is done): a real follow-up question. */
const later = (m: MoveThreadMsg): MoveThreadMsg[] => [opener, them('Yes it is', -400), pitchMsg, m];
const draftOf = (thread: MoveThreadMsg[], e: MoveEvidence = ev) => {
  const plan = pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence: e, nowMs: T0 + 60_000 });
  const latest = [...thread].reverse().find((m) => m.from === 'them')?.text ?? '';
  const ctx: AiReplyContext = { businessName: e.businessName, latestInbound: latest, thread: thread.map((m) => ({ from: m.from, text: m.text })), plan, evidence: e };
  const text = plan.noDraft || plan.stop ? null : fallbackAiReply(ctx);
  return { plan, ctx, text, warnings: text ? checkAiReply(text, ctx) : [] };
};
const qCount = (s: string) => (s.replace(/"[^"\n]*"/g, '').match(/\?/g) ?? []).length;
const once = (s: string) => s.split(FINDABLE_SITE_LINE).length === 2;
const beforeQuestion = (s: string) => { const i = s.indexOf(FINDABLE_SITE_LINE); const q = s.lastIndexOf('?'); return q < 0 || (i >= 0 && i < q && !s.slice(i + FINDABLE_SITE_LINE.length, q).includes('.')); };

console.log('1. the line itself: the plain one (findable.live shows a sample report, not examples of sites)');
{
  ok(FINDABLE_SITE_LINE === 'You can see more about what we do at findable.live.', 'the plain line, word for word');
  ok(!/example/i.test(FINDABLE_SITE_LINE), 'never claims examples');
  ok(!AI_BRAND.test(FINDABLE_SITE_LINE) && !/£|guarantee|money back|sign[\s-]?up/i.test(FINDABLE_SITE_LINE), 'no brand, price, guarantee or sign-up');
}

console.log('2. service questions get it: once, near the end, before the one question, no checker warning');
for (const [say, intent] of [
  ['what do you do?', 'what_we_do'], ['How does it work?', 'what_we_do'], ['who are you?', 'who_are_you'],
  ['how much is it?', 'how_much'], ['can I see examples?', 'examples'], ['is this a scam?', 'privacy'], ['is this legit?', null],
  ['Can you explain it here please', 'explain_here'],
] as const) {
  const d = draftOf(later(them(say)));
  ok(d.plan.siteLine === true && (intent === null || d.plan.intent === intent), `"${say}" → ${d.plan.intent ?? d.plan.move}, marked for the line`);
  ok(!!d.text && once(d.text) && beforeQuestion(d.text), `"${say}": the line once, just before the question: ${JSON.stringify(d.text)}`);
  ok(!!d.text && qCount(d.text) <= 1, `"${say}": one question at most`);
  ok(d.warnings.length === 0, `"${say}": no checker warning${d.warnings.length ? ` (${d.warnings.join(' | ')})` : ''}`);
  ok(!!d.text && !AI_BRAND.test(d.text), `"${say}": no AI brand name`);
}

console.log('3. every existing rule still holds');
{
  const price = draftOf(later(them('how much is it?')));
  const { body } = { body: PLAYBOOK.how_much.line.replace(/ Quick call, or a voice note to go through it\?$/, '') };
  ok(!!price.text && price.text.includes(body), 'the price line is still word for word');
  ok(!!price.text && price.text.toLowerCase().includes(GUARANTEE_LINE.toLowerCase()), 'the guarantee is only the sheet\'s words');
  const scam = draftOf(later(them('is this a scam?')));
  ok(!!scam.text && !/guarantee|£/i.test(scam.text), 'the scam answer stays the privacy answer (no price, no guarantee) plus the line');
  ok(['who_are_you', 'what_we_do', 'explain_here'].every((k) => autoSendable(k)), 'the auto-send switches are unchanged (the playbook entries carry no link flag)');
  ok(!PLAYBOOK.what_we_do.linkOk && !PLAYBOOK.who_are_you.linkOk && !PLAYBOOK.how_much.linkOk, 'the playbook entries themselves are untouched');
}

console.log('3b. a draft carrying the line is approve-to-send, never sent by itself (the link rule)');
{
  const d = draftOf(later(them('what do you do?')));
  const facts: AutoSendFacts = {
    masterOn: true, intentsOn: AUTO_SEND_CHOICES.map((c) => c.key), dailyCap: 30, usedToday: 0, theirMessages: 1,
    draft: draftFactsFromPlan(d.plan, { kind: 'draft', text: d.text, problems: [], usedFallback: false, evidenceComplete: true }),
    latestInbound: 'what do you do?', threadHard: null, digits: '447700900123', lead: { amount_paid: null, status: 'replied', is_archived: false, assigned_to_user_id: null },
    suppressed: false, personActiveAt: null, senderIsAdmin: true, sendAsUserId: 'admin-1', nowMs: T0 + 60_000,
  } as AutoSendFacts;
  const v = autoSendVerdict(facts);
  ok(v.send === false && v.reason === 'has_link', `"what do you do?" with the line: held for approval (${v.send ? 'send' : v.reason})`);
  const clean = autoSendVerdict({ ...facts, draft: { ...facts.draft, text: 'I build sites. Quick call?' } });
  ok(clean.reason !== 'has_link', 'the same draft without the line is not held for a link');
}

console.log('4. NOT for: a no, Australia, the hook, auto-replies, stickers or reactions');
{
  const no = draftOf(later(them('no thanks')));
  ok(no.text === null && !no.plan.siteLine, '"no thanks": no draft, no line');
  const notInt = draftOf(later(them('not interested mate')));
  ok(notInt.text === null && !notInt.plan.siteLine, '"not interested": no draft, no line');
  for (const say of ['what do you do?', 'who are you?', 'can I see examples?', 'is this a scam?']) {
    const d = draftOf(later(them(say)), au);
    ok(!d.plan.siteLine && !(d.text ?? '').includes('findable.live'), `Australia, "${say}": no site link`);
  }
  const auPrice = draftOf(later(them('how much is it?')), au);
  ok(auPrice.text === null && !auPrice.plan.siteLine, 'Australia, "how much is it?": still no draft (prospect-only), no line');
  /* The hook: their FIRST reply to the opener gets the pitch exactly as before, even when it is a service question. */
  for (const say of ['yes', 'what do you do?', 'how much is it?', 'who is this?']) {
    const d = draftOf([opener, them(say)]);
    ok(d.plan.move === 'first_reply_pitch' && !d.plan.siteLine && !(d.text ?? '').includes(FINDABLE_SITE_LINE), `hook reply to "${say}": unchanged, no line`);
  }
  const hook = draftOf([opener, them('yes')]);
  const expected = fallbackAiReply({ ...hook.ctx, plan: { ...hook.plan } });
  ok(hook.text === expected && hook.plan.fixedText === hook.text?.replace(/\s+$/, '') || hook.text === expected, 'the hook text is the pitch as it stands');
  const sticker = draftOf(later(them('[sticker]', 0, 'sticker')));
  ok(!sticker.plan.siteLine && sticker.text === null, 'a sticker: nothing');
  const reaction = draftOf(later(them('', 0, 'reaction')));
  ok(!reaction.plan.siteLine && reaction.text === null, 'a reaction: nothing');
  const auto = draftOf([opener, them('Thank you for your message. We will get back to you as soon as possible.')]);
  ok(!auto.plan.siteLine && !(auto.text ?? '').includes(FINDABLE_SITE_LINE), 'an automated reply: no line');
}

console.log('5. the model safety net');
{
  const p = { siteLine: true };
  ok(ensureSiteLine('Happy to explain. Quick call, or a voice note?', p) === `Happy to explain. ${FINDABLE_SITE_LINE} Quick call, or a voice note?`, 'put in before the question when the model left it out');
  ok(ensureSiteLine('Happy to explain.\n\nQuick call, or a voice note?', p) === `Happy to explain.\n\n${FINDABLE_SITE_LINE} Quick call, or a voice note?`, 'line breaks kept');
  ok(ensureSiteLine(`Sure. ${FINDABLE_SITE_LINE} Call?`, p) === `Sure. ${FINDABLE_SITE_LINE} Call?`, 'never twice');
  ok(ensureSiteLine('No problem.', p) === `No problem. ${FINDABLE_SITE_LINE}`, 'no question: last');
  ok(ensureSiteLine('Quick call?', { siteLine: false }) === 'Quick call?', 'not a service question: untouched');
  ok(insertSiteLine('A. B?') === `A. ${FINDABLE_SITE_LINE} B?`, 'the plan text gets it before the question');
  const d = draftOf(later(them('what do you do?')));
  ok(checkAiReply('I build sites. Quick call?', d.ctx).some((w) => w.includes(FINDABLE_SITE_LINE)), 'the checker warns when the line is missing');
  ok(checkAiReply(`I build sites. ${FINDABLE_SITE_LINE} ${FINDABLE_SITE_LINE} Quick call?`, d.ctx).some((w) => w.includes('once')), '…or there twice');
  ok(!checkAiReply(`I build sites. ${FINDABLE_SITE_LINE} Quick call?`, d.ctx).some((w) => /link/i.test(w)), 'findable.live is an allowed link here');
  const fn = readFileSync('supabase/functions/ai-reply-drafts/index.ts', 'utf8').replace(/\r\n/g, '\n');
  ok(/const candidate = ensureSiteLine\(finishDraft\(r\.reply, evidenceNames\(ctx\.evidence\), \{ followUp: isFollowUp\(ctx\.plan\) \}\), ctx\.plan\);/.test(fn), 'the edge function runs every model draft through ensureSiteLine');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
