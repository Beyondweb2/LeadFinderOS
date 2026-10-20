/* THE NEXT MOVE (2026-10-20, Paul) — src/lib/replyMove.ts: code picks the move, the model only phrases it.
   Runs every ZZ fixture (scripts/fixtures/ai-reply-eval.json: 25 anonymised real conversations + 32 odd replies) through
   pickMove and checks the hand-over decision; pins the loop guards, the capitals and the safeguards. Pure: no model, no DB. */
import { readFileSync } from 'node:fs';
import { pickMove, tidyCaps, auditLine, inboundLabel, firstReplyPitch, autoReplyFlags, isAutoReply, PITCH_EMOTIONAL_Q, PITCH_POINTED_LINE, PITCH_AGENCY_VOICE, PITCH_SITE_Q, PITCH_VOICE_Q, PITCH_NO_SITE_LINE, PITCH_SELF_MANAGED_REPLY, BOT_ANSWER_SWITCH_OFF, BOT_ANSWER_SWITCH_ON, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { CONFIDENCE_LINE, GUARANTEE_LINE } from '../src/lib/offerFactSheet.ts';
import { checkAiReply, fallbackAiReply, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { conversationEngine, draftNames } from '../src/lib/draftEvidence.ts';
import { plainIssueTitle } from '../src/lib/websiteCheck.ts';

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
  ok(bot.move === 'is_bot' && /Never say you are not using AI/.test(bot.points.join(' ')), '"is this a bot" → honest, never denied');
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
ok(auditLine(ev) === 'I asked Gemini for a plumber in Rugby and it mentioned Rival A Plumbing and Rival B Plumbing.', '0 of 6 → the search and who AI mentioned');
ok(!/instead|not you/.test(auditLine({ ...ev, named: { named: 3, valid: 6 } }) ?? '') && !/3 of 6|gap in the rest/.test(auditLine({ ...ev, named: { named: 3, valid: 6 } }) ?? ''), '3 of 6 → no "instead", and never "X of Y" or "a gap in the rest"');
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
  ok(txt.includes('AI is recommending your competitors instead. I looked into why this might be happening and found a few things on your website: some pages have no main heading, your site is not secure (no padlock), and there is no phone number on the site.') && !/fourth/.test(txt), 'line 2: up to three crawl issue titles, in order');
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
  ok(!/instead|not you|pointed|3 of 6|gap in the rest/.test(above.lines.join(' ')) && / and it mentioned Rival A Plumbing and Rival B Plumbing.$/.test(above.lines[0]) && above.question === PITCH_AGENCY_VOICE, 'named in more than a third: the soft line (no "X of Y", no "gap"), no closer, no "instead"');
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
  ok(ans.fixedText === PITCH_SELF_MANAGED_REPLY && ans.question === PITCH_VOICE_Q, '"I do it myself" → "Nice one. Ok if I send a quick voice note on what I found?" (asks, never assumes)');
  const agencyAns = pm([opener, { from: 'them', text: 'Yes it is' }, pitchMsg, { from: 'them', text: 'Yes' }, agencyMsg, { from: 'them', text: 'An agency does it' }], { evidence: issuesEv });
  ok(agencyAns.move === 'offer_voice_note' && agencyAns.question === PITCH_VOICE_Q && !agencyAns.fixedText, 'an agency answer → thanks, then asks before the voice note');
  ok(PITCH_POINTED_LINE === 'Anyone asking AI that question gets pointed to them instead of you.', 'the line before the closer says "that question"');
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
  const g = pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'is there a guarantee' }]).points.join(' ');
  ok(g.includes("If we haven't improved your AI visibility at the 4-week re-check, you get your £99 back.") && !/hasn't gone up/.test(g), 'the guarantee reply: "If we haven\'t improved your AI visibility at the 4-week re-check, you get your £99 back."');
}
console.log('8. the bot answer follows the AI auto-reply switch (Paul, 2026-10-20)');
{
  const ask = [opener, { from: 'them' as const, text: 'Yes' }, hook, { from: 'them' as const, text: 'is this a bot?' }];
  const off = pm(ask, { evidence: { ...ev, aiAutoReplies: false } });
  const on = pm(ask, { evidence: { ...ev, aiAutoReplies: true } });
  const unset = pm(ask);
  ok(off.points.join(' ').includes(BOT_ANSWER_SWITCH_OFF) && /read and send every one myself/.test(BOT_ANSWER_SWITCH_OFF), 'switch OFF → "I read and send every one myself"');
  ok(on.points.join(' ').includes(BOT_ANSWER_SWITCH_ON) && !/every one myself/.test(on.points.join(' ')) && /may be automated/.test(BOT_ANSWER_SWITCH_ON), 'switch ON → replies may be automated, never "every one myself"');
  ok(unset.points.join(' ').includes(BOT_ANSWER_SWITCH_OFF), 'no switch value given (older callers, fixtures) → the switch-off answer; the function itself reads the switch and fails toward ON');
  const ctxOn: AiReplyContext = { businessName: ev.businessName, latestInbound: 'is this a bot?', thread: [], plan: on, evidence: { ...ev, aiAutoReplies: true } };
  ok(fallbackAiReply(ctxOn).includes(BOT_ANSWER_SWITCH_ON) && !/every one myself/.test(fallbackAiReply(ctxOn)), 'the rule-built fallback follows the switch too');
  ok(checkAiReply(BOT_ANSWER_SWITCH_OFF + ' Shall I send you a quick voice note explaining it?', ctxOn).some((x) => /auto-replies are switched on/.test(x)), 'switch ON and the draft says "I send every one myself" → warning');
  ok(!checkAiReply(BOT_ANSWER_SWITCH_OFF + ' Shall I send you a quick voice note explaining it?', { ...ctxOn, plan: off, evidence: { ...ev, aiAutoReplies: false } }).some((x) => /switched on/.test(x)), 'switch OFF → no warning');
  const FN = readFileSync(new URL('../supabase/functions/ai-reply-drafts/index.ts', import.meta.url), 'utf8');
  ok(/aiAutoReplies: await aiSwitchOn\(service\)/.test(FN) && /if \(error \|\| !data\) return true;/.test(FN), 'the function reads the switch for every draft and fails toward ON');
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'x', thread: [], plan: pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'ok' }]), evidence: ev };
  ok(checkAiReply('Our clients loved it and saw great results. Want a call?', ctx).some((x) => /past results/.test(x)), 'a past-results claim with no approved case study → warning');
  ok(checkAiReply("I'll send the voice note now.", ctx).some((x) => /timing/.test(x)), 'a timing promise ("now") → warning');
  ok(checkAiReply('It works 100%, if I fail you get your money back.', ctx).some((x) => /100%/.test(x)), '"100%" / "if I fail" → warning');
}

console.log('9. Nola: counted over every engine in the score, led by the missed search (Paul, 2026-10-20)');
{
  /* Nola's Driving School, live 2026-10-19: ChatGPT 1/1, Gemini 0/1, Google AI 0/1 = 33%. The drafter read 1 of 2 (Google AI
     left out) and wrote "named you in 1 of 2 answers, so there's a gap in the rest" with no competitors. */
  const nola: MoveEvidence = {
    businessName: "Nola's Driving School", trade: 'Driving instructors', town: 'Halstead', engineWords: 'gemini',
    named: { named: 1, valid: 3 },
    competitors: ['Driving 4CE Driving School', 'Reliant Driver Training', 'One Direction Driving School'],
    missed: { engine: 'gemini', question: 'who is the best driving instructor for beginners in Halstead UK' },
    hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true,
    site: { state: 'issues', issues: ['Some pages are unfinished, with sample text on them'] },
  };
  const LEAD = 'I asked Gemini "Who is the best driving instructor for beginners in Halstead?" and it mentioned Driving 4CE Driving School, Reliant Driver Training and One Direction Driving School.';
  const p = pm([{ from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' }, { from: 'them', text: 'Yes' }], { evidence: nola });
  ok(p.move === 'first_reply_pitch' && p.closer === 'emotional', '1 of 3 (Google AI counted) → the FULL pitch, ending on the emotional question');
  ok((p.fixedText ?? '').startsWith(LEAD), 'line 1 is the missed search: the engine, the question and that answer\'s three names');
  ok(!/named you in|gap in the rest|\d+ of \d+/.test(p.fixedText ?? ''), 'never "named you in X of Y" or "a gap in the rest"');
  const ctx: AiReplyContext = { businessName: nola.businessName, latestInbound: 'Yes', thread: [], plan: p, evidence: nola };
  const w = checkAiReply(fallbackAiReply(ctx), ctx);
  ok(w.length === 0, `Nola's pitch draft passes the checker${w.length ? ' — ' + w.join(' | ') : ''}`);
  const half = pm([{ from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' }, { from: 'them', text: 'Yes' }], { evidence: { ...nola, named: { named: 1, valid: 2 } } });
  ok(half.closer !== 'emotional' && /^I asked Gemini "Who is the best driving instructor for beginners in Halstead\?" and it mentioned Driving 4CE/.test(half.fixedText ?? '') && !/instead|not you/.test(half.fixedText ?? '') && !/named you in|gap in the rest/.test(half.fixedText ?? ''), 'more than a third (1 of 2) → the soft version, still without "X of Y" or "gap"');
  ok(checkAiReply("When I asked Gemini for a driving instructor in Halstead it named you in 1 of 2 answers, so there's a gap in the rest.", ctx).some((x) => /X of Y/.test(x)), 'a draft saying "named you in 1 of 2 answers … gap in the rest" → warning');
  ok(/^I asked ChatGPT for a driving instructor in Halstead/.test(firstReplyPitch({ ...nola, engineWords: 'chatgpt' }).lines[0]), 'the missed search was Gemini but the conversation already named ChatGPT → never two tools: trade + town on ChatGPT');
  ok(/^I asked Gemini for driving instructors in Halstead and/.test(firstReplyPitch({ ...nola, missed: { engine: 'gemini', question: 'Driving instructors in Halstead UK' } }).lines[0]), 'a search phrase (not a question) follows "for", the trade lower case, no "UK"');
}

console.log('9b. the site line: hedged, and a list that reads in parallel (Paul, 2026-10-20)');
{
  const t = (id: string, title = '') => plainIssueTitle({ id, title, severity: 'medium', count: 1 } as unknown as Parameters<typeof plainIssueTitle>[0]);
  ok(t('search_crawler_refused') === 'Our check could not read your site, which AI tools may also struggle with' && !/turned away/i.test(t('search_crawler_refused')), 'a refused crawler is OUR check failing, hedged: never "turned away the AI search tools"');
  ok(t('name_unclear', 'Business name not found on the homepage') === 'Your business name is not on your homepage' && t('town_missing', 'Homepage does not mention Halstead') === 'Your homepage does not mention Halstead', 'noun-phrase titles become whole sentences');
  const ven = firstReplyPitch({ ...ev, site: { state: 'issues', issues: ['Some main pages have no description for Google', 'Several of your pages are the same text with only the town or service swapped', t('name_unclear', 'Business name not found on the homepage')] } });
  ok(ven.lines[1].endsWith('found a few things on your website: some main pages have no description for Google, several of your pages are the same text with only the town or service swapped, and your business name is not on your homepage.'), 'three issues: three whole sentences, ", and" before the last');
}

console.log('10. Ven: multi-message and non-English auto-responders (Paul, 2026-10-20)');
{
  const op: MoveThreadMsg = { from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short', at: '2026-10-19T10:09:00Z' };
  /* Ven Language Services, live 2026-10-19: three messages in 72 seconds; the drafter wrote "Cheers for your reply… voice note or call?". */
  const ven: MoveThreadMsg[] = [op,
    { from: 'them', text: 'Buenas noches', at: '2026-10-19T19:30:02Z' },
    { from: 'them', text: 'Thanks for contacting Ven Language Services', at: '2026-10-19T19:30:19Z' },
    { from: 'them', text: 'Are you interested in Spanish lessons?...', at: '2026-10-19T19:31:14Z' }];
  const venEv: MoveEvidence = { ...ev, businessName: 'Ven Language Services Ltd-Muswell Hill', trade: 'Language schools', town: 'London', named: { named: 0, valid: 3 }, competitors: ['Rival A School', 'Rival B School'], missed: { engine: 'gemini', question: 'best Language schools in London UK' } };
  ok(autoReplyFlags(ven).slice(1).every(Boolean), 'all three burst messages read as one auto-reply');
  const p = pm(ven, { evidence: venEv });
  ok(p.move === 'auto_reply' && p.label === 'Auto-reply' && !!p.fixedText && !/cheers for your reply/i.test(p.fixedText ?? ''), 'Ven → Auto-reply (not a real reply), drafted as the first-reply pitch, never "Cheers for your reply"');
  ok((p.fixedText ?? '').startsWith('I asked Gemini for best language schools in London and it mentioned Rival A School and Rival B School'), 'the pitch leads with the missed search');
  ok(!p.allowPrice && !/interested/.test(p.read), 'their "Are you interested in Spanish lessons?" is never read as interest');
  const later = pm([...ven, { from: 'them', text: 'Yes it is', at: '2026-10-20T09:00:00Z' }], { evidence: venEv });
  ok(later.move === 'first_reply_pitch' && !later.allowPrice, 'a real "Yes it is" after the burst → the first-reply pitch, never a price (the burst was not a clear yes)');
  ok(!autoReplyFlags([op, { from: 'them', text: 'Buenas noches' }, { from: 'them', text: 'Are you interested in Spanish lessons?...' }]).some(Boolean), 'no timestamps → no burst is read (each message stands alone)');
  ok(!autoReplyFlags([op, { from: 'them', text: 'Yes', at: '2026-10-19T19:30:02Z' }, { from: 'them', text: 'who is this?', at: '2026-10-19T19:30:09Z' }]).some(Boolean), 'two quick messages from a person (no auto-reply wording) → not an auto-reply');
  const es = pm([op, { from: 'them', text: '¡Hola! Gracias por contactarnos. Te responderemos lo antes posible.' }], { evidence: venEv });
  ok(es.move === 'auto_reply' && es.label === 'Auto-reply' && !!es.fixedText, 'a Spanish auto-reply → Auto-reply, drafted as the first-reply pitch');
  ok(isAutoReply('Merci pour votre message, nous vous répondrons dans les plus brefs délais.') && isAutoReply('Obrigado pelo contato, responderemos em breve') && isAutoReply('Danke für Ihre Nachricht, wir melden uns bald.'), 'French, Portuguese and German auto-replies too');
  ok(!isAutoReply('Hola, yes this is me') && !isAutoReply("Buenas, who is this?"), 'a person (a greeting, or a question at the end) is never an auto-reply');
  const replied = pm([op, { from: 'them', text: 'Yes it is' }, { from: 'us', text: 'pitch' }, { from: 'them', text: 'Gracias por su mensaje. Le responderemos lo antes posible.' }], { evidence: venEv });
  ok(replied.move === 'auto_reply' && !replied.fixedText && !replied.autoDraft, 'an auto-reply AFTER a real reply → the old rule: nothing drafted');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
