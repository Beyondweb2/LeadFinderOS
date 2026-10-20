/* THE NEXT MOVE (2026-10-20, Paul) — src/lib/replyMove.ts: code picks the move, the model only phrases it.
   Runs every ZZ fixture (scripts/fixtures/ai-reply-eval.json: 25 anonymised real conversations + 32 odd replies) through
   pickMove and checks the hand-over decision; pins the loop guards, the capitals and the safeguards. Pure: no model, no DB. */
import { readFileSync } from 'node:fs';
import { pickMove, tidyCaps, auditLine, inboundLabel, firstReplyPitch, PITCH_EMOTIONAL_Q, PITCH_POINTED_LINE, PITCH_AGENCY_VOICE, PITCH_SITE_Q, PITCH_VOICE_Q, PITCH_NO_SITE_LINE, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { CONFIDENCE_LINE, GUARANTEE_LINE } from '../src/lib/offerFactSheet.ts';
import { checkAiReply, fallbackAiReply, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { conversationEngine, draftNames } from '../src/lib/draftEvidence.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

interface Fx { id: string; businessName: string; trade: string; town: string; hasWebsite: boolean; ownerName: string | null; audit: null | { engine: string; namedAnswers: number; validAnswers: number; competitors: string[] }; findings: { title: string; said: string }[]; thread: { from: 'us' | 'them'; text: string; templateName: string | null; messageType: string }[]; expect: { outcome: string; topic: string | null } }
const FX = JSON.parse(readFileSync(new URL('./fixtures/ai-reply-eval.json', import.meta.url), 'utf8')) as Fx[];
const evidenceOf = (x: Fx): MoveEvidence => {
  const sent = x.thread.filter((m) => m.from === 'us').map((m) => ({ text: m.text, templateName: m.templateName }));
  return { businessName: x.businessName, trade: x.audit ? x.trade : null, town: x.audit ? x.town : null, engineWords: conversationEngine(sent, x.audit?.engine ?? null).words,
    named: x.audit && x.audit.validAnswers > 0 ? { named: x.audit.namedAnswers, valid: x.audit.validAnswers } : null,
    competitors: draftNames(x.audit?.competitors ?? [], x.town), hookAlreadySent: x.thread.some((m) => m.from === 'us' && !!m.templateName && !/^initial_/.test(m.templateName)),
    findings: x.findings ?? [], hasWebsite: x.hasWebsite, ownerName: x.ownerName, foundOnGoogle: true };
};

console.log('1. every ZZ fixture: the right hand-over decision');
ok(FX.length >= 55 && FX.every((x) => /^ZZ Fixture/.test(x.businessName)), `${FX.length} fixtures, every one a ZZ fixture`);
/* Known, deliberate deviation: an unclear statement goes to Needs you (unsure = Needs you), never a guessed draft. */
const SAFE_SIDE = new Set(['zz-real-06']);
let right = 0;
for (const x of FX) {
  const p = pickMove({ thread: x.thread, suppressed: false, aiSentSinceWin: 0, evidence: evidenceOf(x) });
  const got = p.read === 'no reply' || p.needsYou?.reason === 'already_replied' ? 'none' : p.stop ? 'stop' : p.move === 'auto_reply' ? 'auto_reply' : p.move === 'ack' ? 'ack' : p.needsYou ? 'needs_you' : 'draft';
  const exp = x.expect.outcome;
  const match = got === exp || (exp === 'ack' && got === 'draft') || (exp === 'draft' && got === 'needs_you' && p.needsYou?.reason === 'paul_looks') || (SAFE_SIDE.has(x.id) && got === 'needs_you');
  if (match) right++;
  ok(match, `${x.id}: expected ${exp}, got ${got} (${p.move})`);
  if (exp === 'stop') ok(p.stop && !p.autoDraft, `${x.id}: a stop writes no draft`);
  if (x.expect.topic === 'price' && got === 'draft') ok(p.allowPrice && p.topic === 'price', `${x.id}: a price question may get the sheet's price`);
}
console.log(`  (${right}/${FX.length} hand-over decisions right)`);

console.log('2. safeguards');
const ev: MoveEvidence = { businessName: 'ZZ Fixture Plumbing 90', trade: 'plumbers', town: 'Rugby', engineWords: 'gemini', named: { named: 0, valid: 6 }, competitors: ['Rival A Plumbing', 'Rival B Plumbing'], hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true };
const opener: MoveThreadMsg = { from: 'us', text: 'Hi, is this ZZ Fixture Plumbing 90?', templateName: 'initial_contact' };
const hook: MoveThreadMsg = { from: 'us', text: 'Happy to explain it here or jump on a quick call if you\'d rather', templateName: 'audit_followup_call' };
const pm = (thread: MoveThreadMsg[], o: Partial<{ aiSentSinceWin: number; evidence: MoveEvidence }> = {}) => pickMove({ thread, suppressed: false, aiSentSinceWin: o.aiSentSinceWin ?? 0, evidence: o.evidence ?? ev });
{
  const yesOpener = pm([opener, { from: 'them', text: 'Yes it is' }]);
  ok(yesOpener.move === 'first_reply_pitch' && !!yesOpener.fixedText && !yesOpener.allowPrice && yesOpener.label === 'Only confirmed', 'bare "yes it is" → the full first-reply pitch (code-built), never a price, labelled "Only confirmed"');
  const yesHook = pm([opener, { from: 'them', text: 'Yes it is' }, hook, { from: 'them', text: 'yes' }]);
  ok(yesHook.move === 'offer_voice_note' && !yesHook.allowPrice && !yesHook.points.join(' ').match(/sign|link|£/i), 'a bare "yes" to our offer → the voice note, never a sign-up link or a price');
  const keen = pm([opener, { from: 'them', text: 'Yes please, I\'m interested' }]);
  ok(keen.move === 'offer_voice_note' && /voice note/.test(keen.question ?? '') && (keen.question ?? '').indexOf('voice note') < (keen.question ?? '').indexOf('call'), 'interested → voice note first, call after');
  const price = pm([opener, { from: 'them', text: 'how much is it?' }]);
  ok(price.move === 'answer_fact' && price.topic === 'price' && /word for word: "It's £99 to start/.test(price.points[0]), 'a price question → the sheet\'s price, word for word');
  const unknown = pm([opener, { from: 'them', text: 'Do you do Instagram ads as well?' }]);
  ok(unknown.needsYou?.reason === 'question_not_on_sheet', 'a question the sheet does not answer → Needs you');
  const bot = pm([opener, { from: 'them', text: 'is this a bot?' }]);
  ok(bot.move === 'is_bot' && /Never say you are not using AI/.test(bot.points[0]), '"is this a bot" → honest, never denied');
  const provider = pm([opener, { from: 'them', text: 'I pay him to do it' }]);
  ok(provider.move === 'objection_provider' && /Do not offer a new website/.test(provider.points[0]), '"I pay him" → no new-site pitch, no second agency question');
  ok(pm([opener, { from: 'them', text: 'Thank you for your message, we are away until Monday' }]).label === 'Auto-reply', 'an auto-responder is labelled Auto-reply');
  ok(inboundLabel('Yes it is', 'text') === 'Only confirmed' && inboundLabel('Thank you for your message, we will get back to you shortly', 'text') === 'Auto-reply' && inboundLabel('How much?', 'text') === null, 'inboundLabel: the Inbox label');
}
console.log('3. loop guards');
{
  const replied = pm([opener, { from: 'them', text: 'Yes please' }, { from: 'us', text: 'Shall I send a voice note?', templateName: null }]);
  ok(replied.needsYou?.reason === 'already_replied' && !replied.autoDraft, 'never twice without a prospect message');
  const limit = pm([opener, { from: 'them', text: 'Yes please' }], { aiSentSinceWin: 3 });
  ok(limit.needsYou?.reason === 'ai_limit' && !limit.autoDraft, 'three AI messages without a call or voice note → Needs you');
  const auto2 = pm([opener, { from: 'them', text: 'Thanks for your message, we will reply soon' }, hook, { from: 'them', text: 'Thanks for your message, we will reply soon' }]);
  ok(auto2.move === 'auto_reply' && !auto2.autoDraft && auto2.needsYou?.reason === 'repeat_auto_reply', 'no reply to repeated auto-replies');
}
console.log('4. "named others instead" only at a third or fewer');
ok(/named Rival A Plumbing and Rival B Plumbing instead/.test(auditLine(ev) ?? ''), '0 of 6 → names who AI put forward instead');
ok(!/instead/.test(auditLine({ ...ev, named: { named: 3, valid: 6 } }) ?? '') && /3 of 6/.test(auditLine({ ...ev, named: { named: 3, valid: 6 } }) ?? ''), '3 of 6 → no "instead": says where they stand');
ok(/every time/.test(auditLine({ ...ev, named: { named: 6, valid: 6 } }) ?? ''), '6 of 6 → says AI names them');
ok(auditLine({ ...ev, named: null }) === null, 'no counts → no AI line at all');

console.log('5. capitals in code');
ok(tidyCaps('hi mate, im paul. ill call you tomorrow') === "Hi mate, I'm paul. I'll call you tomorrow", 'sentence starts, I\'m, I\'ll');
ok(tidyCaps('i asked chatgpt and gemini\nwhat time suits?') === 'I asked ChatGPT and Gemini\nWhat time suits?', 'every line starts with a capital; ChatGPT / Gemini');
ok(tidyCaps('see findable.live or email paul@findable.live. call 07700 900123') === 'See findable.live or email paul@findable.live. Call 07700 900123', 'links, emails and numbers untouched');
ok(tidyCaps('https://findable.live/r/abc is yours') === 'https://findable.live/r/abc is yours', 'a link at the start stays as it is');
ok(tidyCaps("i've got it, i'd say so") === "I've got it, I'd say so", "I've / I'd");

console.log('6. the first-reply pitch (Paul, 2026-10-20)');
{
  const issuesEv: MoveEvidence = { ...ev, site: { state: 'issues', issues: ['Some pages have no main heading', 'Your site is not secure (no padlock)', 'There is no phone number on the site', 'A fourth issue'] } };
  const noSiteEv: MoveEvidence = { ...ev, hasWebsite: false, site: { state: 'no_website', issues: [] } };
  const p1 = firstReplyPitch(issuesEv);
  const txt = p1.lines.join(' ');
  ok(p1.lines[0] === 'I asked Gemini for a plumber in Rugby and it mentioned Rival A Plumbing and Rival B Plumbing.', 'line 1: I asked <engine> for <trade in town> and it mentioned <rivals>');
  ok(txt.includes('AI is recommending your competitors instead. I looked into why this might be happening and found a few things on your website: some pages have no main heading, your site is not secure (no padlock) and there is no phone number on the site.') && !/fourth/.test(txt), 'line 2: up to three crawl issue titles, in order');
  ok(p1.lines[p1.lines.length - 1] === PITCH_POINTED_LINE && p1.question === PITCH_EMOTIONAL_Q && p1.closer === 'emotional', 'ends: the pointed line, then ONE emotional question');
  ok(!/agency|voice note|guarantee|money back|£|confident/i.test(txt + p1.question), 'no agency question, voice note, guarantee or price in the pitch');
  const caps = firstReplyPitch({ ...issuesEv, trade: 'Driving instructors', site: { state: 'issues', issues: ['Some pages are unfinished, with sample text on them', 'Lots of your pages are near enough the same'] } });
  ok(caps.lines[0].startsWith('I asked Gemini for a driving instructor in Rugby'), 'a capitalised stored trade is said lower case ("a driving instructor")');
  ok(caps.lines[1].includes('some pages are unfinished, with sample text on them; and lots of your pages are near enough the same.'), 'a title with its own comma: the list uses semicolons');
  const none = firstReplyPitch(noSiteEv);
  ok(none.lines[1].endsWith(PITCH_NO_SITE_LINE) && none.question === PITCH_EMOTIONAL_Q && !/agency/i.test(none.lines.join(' ')), 'no website: the no-site line, the emotional question, never the agency question');
  for (const state of ['clean', 'not_checked', 'unreadable'] as const) {
    const c = firstReplyPitch({ ...ev, site: { state, issues: [] } });
    ok(/, not you\.$/.test(c.lines[0]) && !/looked into why/.test(c.lines.join(' ')) && c.question === PITCH_EMOTIONAL_Q, `${state}: line 1 ends "not you", no "looked into why"`);
  }
  const above = firstReplyPitch({ ...issuesEv, named: { named: 3, valid: 6 } });
  ok(!/instead|not you|pointed/.test(above.lines.join(' ')) && /3 of 6/.test(above.lines[0]) && above.question === PITCH_AGENCY_VOICE, 'named in more than a third: the neutral line, no closer, no "instead"');
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'Yes it is', thread: [], plan: pm([opener, { from: 'them', text: 'Yes it is' }], { evidence: issuesEv }), evidence: issuesEv };
  const d = fallbackAiReply(ctx);
  const warn = checkAiReply(d, ctx);
  ok(d.includes(PITCH_EMOTIONAL_Q) && (d.match(/\?/g) ?? []).length === 1 && warn.length === 0, `the pitch draft: one question, no checker warning${warn.length ? ' — ' + warn.join(' | ') : ''}`);
  const short = pm([{ from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' }, { from: 'them', text: 'Yes it is. How can we help' }], { evidence: issuesEv });
  ok(short.move === 'first_reply_pitch', 'initial_contact_short with no stored text is still the opener (the KSM miss)');
  const pitchMsg: MoveThreadMsg = { from: 'us', text: d, templateName: null };
  const next = pm([opener, { from: 'them', text: 'Yes it is' }, pitchMsg, { from: 'them', text: 'Yes of course' }], { evidence: issuesEv });
  ok(next.move === 'pitch_next' && next.fixedText === PITCH_AGENCY_VOICE && next.closer === 'agency', 'the reply after the closer → the agency question + voice note offer, word for word');
  const noSitePitch: MoveThreadMsg = { from: 'us', text: fallbackAiReply({ ...ctx, evidence: noSiteEv, plan: pm([opener, { from: 'them', text: 'Yes' }], { evidence: noSiteEv }) }), templateName: null };
  const nextNoSite = pm([opener, { from: 'them', text: 'Yes' }, noSitePitch, { from: 'them', text: 'Definitely' }], { evidence: noSiteEv });
  ok(nextNoSite.fixedText === PITCH_SITE_Q, 'no website: the reply after the closer → "Do you have a website I\'ve missed?"');
  const no = pm([opener, { from: 'them', text: 'Yes it is' }, pitchMsg, { from: 'them', text: 'no' }], { evidence: issuesEv });
  ok(no.needsYou?.reason === 'not_interested', 'a bare "no" to the closer → Needs you (not interested), no follow-up');
  const agencyMsg: MoveThreadMsg = { from: 'us', text: PITCH_AGENCY_VOICE, templateName: null };
  const ans = pm([opener, { from: 'them', text: 'Yes it is' }, pitchMsg, { from: 'them', text: 'Yes' }, agencyMsg, { from: 'them', text: 'I do it myself' }], { evidence: issuesEv });
  ok(ans.move === 'offer_voice_note' && ans.question === null && /Never say when/.test(ans.points.join(' ')), 'their answer to the agency question → the voice note, no timing promised, no second question');
  const siteNo = pm([opener, { from: 'them', text: 'Yes' }, { from: 'us', text: PITCH_SITE_Q, templateName: null }, { from: 'them', text: 'No not got one' }]);
  ok(siteNo.question === PITCH_VOICE_Q, 'no website to show → "Ok if I send a quick voice note on what I found?"');
}
console.log('7. the confidence line: only where Paul said');
{
  const has = (p: { points: string[]; confidence?: boolean }) => p.confidence === true && p.points.join(' ').includes(CONFIDENCE_LINE);
  ok(CONFIDENCE_LINE.toLowerCase().includes(GUARANTEE_LINE.toLowerCase()) && !/100|if i fail/i.test(CONFIDENCE_LINE), 'the line quotes the sheet\'s guarantee verbatim; never "100%" or "if I fail"');
  ok(has(pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'how much is it?' }])), 'a price question → the confidence line');
  ok(has(pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'does it actually work?' }])), '"does it work" → the confidence line');
  ok(has(pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: "what's the catch" }])), '"what\'s the catch" → the confidence line');
  ok(has(pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'is there a guarantee' }])), 'the guarantee → the confidence line (said once)');
  ok(has(pm([opener, { from: 'them', text: 'who is this?' }])), '"who is this?" → the confidence line');
  ok(!pm([opener, { from: 'them', text: 'Yes it is' }]).confidence, 'never in the first pitch');
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'x', thread: [], plan: pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'ok' }]), evidence: ev };
  ok(checkAiReply('Our clients loved it and saw great results. Want a call?', ctx).some((x) => /past results/.test(x)), 'a past-results claim with no approved case study → warning');
  ok(checkAiReply("I'll send the voice note now.", ctx).some((x) => /timing/.test(x)), 'a timing promise ("now") → warning');
  ok(checkAiReply('It works 100%, if I fail you get your money back.', ctx).some((x) => /100%/.test(x)), '"100%" / "if I fail" → warning');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
