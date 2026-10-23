/* THE REPLY RECON'S 18 NEW INTENTS + THE DETECTION FIXES (Paul, 2026-10-21; reply recon 2026-10-20 §5a/§5b; docs/reply-playbook.md).
   One scripted conversation per intent: code picks it, the rule-built draft passes the checker, Paul's wording is pinned, the
   Needs-you ones never auto-draft. Then B4, B6–B11 and the prospect voice note. `--preview` prints one draft per intent.
   Pure: no model, no DB. Nothing here sends. */
import { readFileSync } from 'node:fs';
import { pickMove, firstReplyPitch, PITCH_AGENCY_Q, type MoveEvidence, type MoveThreadMsg, type MovePlan } from '../src/lib/replyMove.ts';
import { PLAYBOOK, NEW_INTENTS, NEEDS_YOU_INTENTS, NEW_SITE_CHECK_BACK, VOICE_NOTE_FROM_THEM, RE, type PlaybookIntent } from '../src/lib/replyPlaybook.ts';
import { checkAiReply, fallbackAiReply, AI_BRAND, aiReplyDecision, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const PREVIEW = process.argv.includes('--preview');

const ev: MoveEvidence = { businessName: 'ZZ Fixture Driving 90', trade: 'driving instructor', town: 'Rugby', engineWords: 'gemini', named: { named: 0, valid: 6 },
  missed: { engine: 'gemini', question: 'Who is the best driving instructor in Rugby?' }, competitors: ['Rival A Driving', 'Rival B Driving', 'Rival C Driving'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true,
  site: { state: 'issues', issues: ['Some pages have no main heading', 'There is no phone number on the site'] } };
const plumber: MoveEvidence = { ...ev, businessName: 'ZZ Fixture Plumbing 90', trade: 'plumbers', missed: { engine: 'gemini', question: 'Who is the best plumber in Rugby?' } };
const T0 = Date.parse('2026-10-21T10:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const opener: MoveThreadMsg = { from: 'us', text: '', templateName: 'initial_contact', messageType: 'template', at: at(-600) };
const pitchMsg: MoveThreadMsg = { from: 'us', text: [...firstReplyPitch(ev).lines, firstReplyPitch(ev).question].join('\n\n'), at: at(-300) };
const them = (text: string, min = 0): MoveThreadMsg => ({ from: 'them', text, messageType: 'text', at: at(min) });
const us = (text: string, min = -100): MoveThreadMsg => ({ from: 'us', text, at: at(min) });
/** First reply to the opener. */
const first = (t: string): MoveThreadMsg[] => [opener, them(t)];
/** After the pitch went. */
const later = (...rest: MoveThreadMsg[]): MoveThreadMsg[] => [opener, them('Yes it is', -400), pitchMsg, ...rest];
const pm = (thread: MoveThreadMsg[], e: MoveEvidence = ev) => pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence: e, nowMs: T0 + 60_000 });
const draftOf = (thread: MoveThreadMsg[], e: MoveEvidence = ev) => {
  const plan = pm(thread, e);
  const latest = [...thread].reverse().find((m) => m.from === 'them')?.text ?? '';
  const ctx: AiReplyContext = { businessName: e.businessName, latestInbound: latest, thread: thread.map((m) => ({ from: m.from, text: m.text })), plan, evidence: e };
  const text = plan.noDraft || plan.stop ? null : fallbackAiReply(ctx);
  return { plan, text, warnings: text ? checkAiReply(text, ctx) : [] };
};
const qCount = (s: string) => (s.replace(/"[^"\n]*"/g, '').match(/\?/g) ?? []).length;

const CASES: Array<{ intent: PlaybookIntent; thread: MoveThreadMsg[]; evidence?: MoveEvidence; label: string }> = [
  { intent: 'thinks_customer', label: '"Are you looking for driving lessons?"', thread: first('Yes it is. Are you looking for driving lessons? Andy.') },
  { intent: 'straight_answer_then_pitch', label: '"What are you selling?"', thread: first('What are you selling?') },
  { intent: 'wrong_trade', label: '"we don\'t do locksmithing"', thread: later(them("Thank you , but we don't do locksmithing cheers")) },
  { intent: 'moved_area', label: '"I\'m not in Sowerby bridge anymore"', thread: later(them("Hi, I'm not in Sowerby bridge anymore. Sorry")) },
  { intent: 'closed_retired', label: '"No longer trading pal"', thread: first('No longer trading pal 👍') },
  { intent: 'fully_booked', label: '"fully booked, waiting list"', thread: later(them("Yes, but I'm fully booked for the foreseeable future, there's a waiting list")) },
  { intent: 'word_of_mouth', label: '"all word of mouth"', thread: later(them('My work is all word of mouth to be honest')) },
  { intent: 'already_show_up', label: '"I already show up on ai search"', thread: later(them('I already show up on ai search because of my 70 5 star reviews on Google')) },
  { intent: 'new_site_being_built', label: '"getting a new website built"', thread: later(them('Thankyou we are In process of getting a new website built')) },
  { intent: 'proof_request', label: '"send the evidence first"', thread: later(them('Please send the specific issues you found and screenshots. I would like to review the evidence first.')) },
  { intent: 'explain_here', label: '"please explain here"', thread: later(them('You can explain me here as we are little busy')) },
  { intent: 'pay_on_results', label: '"only pay after results"', thread: later(them('I would only agree if payment is made after we achieve results')) },
  { intent: 'ads_question', label: '"do you do google ads?"', thread: later(them('Do you handle google ads?')) },
  { intent: 'do_it_myself', label: '"I\'ll learn it and do it myself"', thread: later(them("I'll probably learn what you're on about and do it my self")) },
  { intent: 'where_based', label: '"are you uk based?"', thread: later(them("Are you uk based I've been with so many companies all promises the world")) },
  { intent: 'call_now', label: '"you free now?"', thread: later(them('You free now?')) },
  { intent: 'sorry_wrong_day', label: '"it\'s a Sunday mate"', thread: later(them("It's a Sunday mate have a day off")) },
  { intent: 'acknowledge_wait', label: '"Will ring later"', thread: later(them('Will ring later')) },
  { intent: 'they_chased', label: '"just wanted to follow up" three days on', thread: [opener, them('Hello! Yes it is', -4320), them('Hellooo, just wanted to follow up', 0)] },
];

console.log('1. every new intent: picked by code, a draft that passes the checker, Paul\'s rules');
ok(new Set(CASES.map((c) => c.intent)).size === NEW_INTENTS.length && NEW_INTENTS.every((i) => !!PLAYBOOK[i]), `a case and a playbook line for each of the ${NEW_INTENTS.length} new intents`);
const previews: string[] = [];
for (const c of CASES) {
  const d = draftOf(c.thread, c.evidence);
  const pitchStyle = d.plan.move === 'first_reply_pitch';
  ok(d.plan.intent === c.intent, `${c.intent}: ${c.label} → ${d.plan.intent ?? d.plan.move}`);
  ok(!!d.text && d.warnings.length === 0, `${c.intent}: the draft passes the checker${d.warnings.length ? ' — ' + d.warnings.join(' | ') : ''}`);
  ok(!!d.text && qCount(d.text) <= 1, `${c.intent}: at most one question`);
  ok(!!d.text && !AI_BRAND.test(d.text), `${c.intent}: names no AI tool`);
  /* A FIRST reply to our opener keeps "AI" in capitals (Paul, 2026-10-23); a later follow-up says "ai". */
  if (!pitchStyle && !d.plan.firstReply) ok(!!d.text && !/\bAI\b/.test(d.text), `${c.intent}: a follow-up says "ai", lower case`);
  if (!pitchStyle && d.plan.firstReply && /\bai\b/i.test(d.text ?? '')) ok(/\bAI\b/.test(d.text ?? '') && !/\bai\b/.test(d.text ?? ''), `${c.intent}: a first reply says "AI" in capitals`);
  ok(!/\bmonthly\b/i.test(d.text ?? '') && !/\bfree\b(?!\s+now)/i.test(d.text ?? ''), `${c.intent}: never "monthly", never "free"`);
  if (NEEDS_YOU_INTENTS.includes(c.intent)) ok(!!d.plan.needsYou && d.plan.autoDraft === false && !d.plan.noDraft, `${c.intent}: Needs you, the line is only the suggested text`);
  previews.push(`PREVIEW ${c.intent}${d.plan.needsYou ? ' [Needs you: ' + d.plan.needsYou.label + ']' : ''}\n  them:  "${[...c.thread].reverse().find((m) => m.from === 'them')?.text}"\n  draft: "${(d.text ?? '').replace(/\n+/g, ' / ')}"${d.plan.note ? `\n  note:  ${d.plan.note}` : ''}`);
}

console.log("2. Paul's wording (2026-10-21)");
{
  ok(draftOf(first('Are you looking for driving lessons?')).text === "Ha, sorry for the confusion, I'm not after lessons myself. I'm Paul from Findable. I checked how AI recommends driving instructors in Rugby. Ok if I send you what came back?",
    'thinks_customer: Paul\'s line word for word ("lessons", trade + town from the lead)');
  ok(/I'm not after a plumber myself\. .*recommends plumbers in Rugby/.test(draftOf(first('Do you need a plumber?'), plumber).text ?? ''), 'thinks_customer for another trade: "a plumber", "plumbers in Rugby"');
  ok(!Object.values(PLAYBOOK).some((x) => /not after anything from you/i.test(x.line)), 'never "I\'m not after anything from you"');
  ok(PLAYBOOK.ads_question.line.includes('ask AI') && !AI_BRAND.test(PLAYBOOK.ads_question.line), 'ads_question: "AI", no brands');
  ok(PLAYBOOK.sorry_wrong_day.line === "Fair enough, sorry for the message. I'll leave you in peace." && !/day\b/i.test(PLAYBOOK.sorry_wrong_day.line.replace('Fair', '')), 'sorry_wrong_day: Paul\'s line, no weekday');
  const wb = draftOf(later(them('where are you based?'))).text ?? '';
  ok(wb === "Findable is a UK company, but we work with businesses worldwide. The site's findable.live if you want a look. Quick call, or shall I send a voice note?" && !/I'm in the UK/i.test(wb), 'where_based: Paul\'s line, never "I\'m in the UK"');
  for (const [label, t] of [['proof_request', later(them('Can you send me screenshots as evidence?'))], ['examples', later(them('have you got any examples?'))]] as const) {
    const d = draftOf(t as MoveThreadMsg[]);
    ok(d.text?.includes("I've had good reviews and great feedback from the businesses I've worked with, and I built this site for a locksmith recently: https://mclocksmiths-new.pages.dev/") && /report/.test(d.text) && d.warnings.length === 0,
      `${label}: offers the report, the proof words, the one site link, no warning`);
    ok(!/\bABLM\b|\d+\s*%|\bclients?\s+(saw|got)\b/i.test(d.text ?? ''), `${label}: no client name, no numbers or result claim`);
  }
  ok(!draftOf(later(them('have you got any examples?')), { ...ev, named: null }).text?.includes('report I did'), 'no search on record: never "the report I did for you"');
  ok(/regular checks/.test(PLAYBOOK.how_much.line) && !Object.values(PLAYBOOK).some((x) => /\bcheck/i.test(x.line) && /\bmonthly\b/i.test(x.line)), '"regular checks", never "monthly", in every line about checks');
  ok(!/\bfree\b/i.test(PLAYBOOK.new_site_being_built.line + NEW_SITE_CHECK_BACK), 'new_site_being_built never says "free"');
  const sa = draftOf(first('What are you selling?')).text ?? '';
  ok(sa.startsWith("Hi mate,\n\nFair question. I'm Paul from Findable, and yes, I offer a service. Here's why I got in touch:\n\nI asked AI \"Who is the best driving instructor in Rugby?\"") && sa.endsWith(PITCH_AGENCY_Q),
    'straight_answer_then_pitch: "Hi mate," + the straight answer + the pitch + its one question');
  ok((draftOf(first('Yes this is Dom, what are you selling?')).text ?? '').startsWith('Hi Dom,'), '…a name they gave opens it ("Hi Dom,")');
  const ch = draftOf([opener, them('Hello! Yes this is Dom', -4320), them('Hellooo, just wanted to follow up', 0)]).text ?? '';
  ok(ch.startsWith('Hi Dom,\n\nSorry for the slow reply.\n\nI asked AI'), 'they_chased: the same greeting rule, then sorry, then the pitch');
  ok((draftOf([opener, them('Hello! Yes it is', -4320), them('any update?', 0)]).text ?? '').startsWith('Hi mate,\n\nSorry for the slow reply.'), '…no name: "Hi mate,"');
  ok(pm(later(them('Yes', -50), them('??', 0))).needsYou?.reason === 'chased', 'chased after the pitch went: Needs you (answer their earlier message), no re-pitch');
  const site = pm(later(them('Thankyou we are In process of getting a new website built', -60), us(PLAYBOOK.new_site_being_built.line, -50), them('an agency is doing it', 0)));
  ok(site.intent === 'new_site_being_built' && site.guide === NEW_SITE_CHECK_BACK && site.followUp?.checkBackOn === '2026-11-18' && /Next Action/.test(site.note ?? ''), 'new site: after their answer, the 4-week check back, NOTED, never written');
  ok(pm(later(them("I've already got a company who deal with it all, just having a new website built"))).guide === NEW_SITE_CHECK_BACK, '…said who builds it already: straight to the check back');
  const wt = pm(later(them("I'm an auto locksmith. Those are all domestic.")));
  ok(wt.intent === 'wrong_trade' && wt.needsYou?.reason === 'wrong_trade' && /Fix the trade on the lead/.test(wt.note ?? ''), 'wrong_trade: Needs you, note says fix the trade on the lead first');
  const refs = pm(later(them('You got references / a website to look at?')));
  ok(refs.intent === 'proof_request' && refs.needsYou?.reason === 'cant_send', 'references (we cannot send them): Needs you, the proof line as the suggested text');
  ok(pm(later(them('Can you send me screenshots as evidence?'))).needsYou === null, 'screenshots of the search (the report has them): a draft');
}

{
  ok(draftOf(later(them('Will ring later'))).text === 'No problem, speak soon.', 'acknowledge_wait: "Will ring later" → "No problem, speak soon." (Paul, R085)');
  for (const t of ["I'll give you a call tomorrow", "I'll ring you after 5"]) ok(pm(later(them(t))).intent === 'acknowledge_wait', `acknowledge_wait: "${t}"`);
  ok(pm(later(them("I'm busy at the moment, call me later"))).intent === 'busy' && pm(later(them('Can I call you ?'))).intent === 'call_now', '…"call me later" stays busy, "can I call you?" stays call_now');
}

console.log('3. the Needs-you cases are never auto-drafted, but "Draft reply" still has the suggested text');
for (const [label, t] of [['pay_on_results', 'show us what you can do FOC first'], ['call_now', 'Can I call you ?'], ['wrong_trade', "We're not a locksmith"]] as const) {
  const p = pm(later(them(t)));
  const d = aiReplyDecision({ inboundAt: at(0), lead: { status: 'replied' }, hadOutreach: true, plan: p, nowMs: T0 + 60_000 });
  ok(p.intent === label && d.kind === 'needs_you' && !p.noDraft && !!p.guide, `${label}: "${t}" → Needs you (${p.needsYou?.label}) with a suggested reply`);
}

console.log('4. detection fixes (§5a)');
for (const t of ['Why', 'Why??', 'What?', 'Is this an electrical call or a cold call for business?', 'Yep. Are you going to try and sell me a website?']) {
  ok(pm(first(t)).intent === 'straight_answer_then_pitch', `B4: "${t}" → straight_answer_then_pitch`);
}
ok(pm(first("Yes, who's this please?")).intent === 'who_are_you', 'B4: "Yes, who\'s this please?" → who_are_you');
{
  const askTime = (q: string, a: string) => pm([opener, them('Yes it is', -400), pitchMsg, them('call me', -200), us(q, -100), them(a, 0)]);
  ok(askTime('Can we schedule a call tomorrow? what time works for you?', 'Yes 6').move === 'set_call', 'B6: "what time works for you?" → "Yes 6" is the time');
  ok(askTime('Sorry i cant call after 5pm, can we do any earlier?', 'Yeah tomorrow at 5').move === 'set_call', 'B6: "can we do any earlier?" → "Yeah tomorrow at 5"');
  ok(askTime('Are you free to call later?', '6pm').move === 'set_call', 'B6: "are you free to call?" → "6pm"');
  ok(pm(later(them('are you free to call?'))).intent === 'call_now', 'B6: them asking "are you free to call?" → call_now (Needs you)');
}
for (const t of ['I have an seo guy already so he would have to check over all this', 'Someone manages the website for me, massive marketing', 'my business partner is in marketing']) {
  ok(RE.agencyStrong.test(t), `B7: agency reads "${t.slice(0, 45)}"`);
}
{
  const formAuto = pm(first('Thanks for your message. To book, please fill out our form at www.zzfixturebooking.co.uk'));
  ok(formAuto.move === 'auto_reply' && formAuto.intent !== 'website_given', 'B8: "fill out our form [link]" is an auto-reply, not their website');
  const feeAuto = pm(first("Thank you for contacting us. Our consultation fee is £75. We'll reply as soon as we can."));
  ok(feeAuto.move === 'auto_reply' && feeAuto.intent !== 'how_much', 'B8: a consultation-fee auto-reply is not a price question');
  ok(pm(first('Thank you for contacting Brill DrivingSchool! Please let us know how we can help you.')).move === 'auto_reply', 'B8: a plain auto-reply is still an auto-reply');
  const burst = pm([opener, them('Thank you for contacting Brill DrivingSchool! Please let us know how we can help you.', -0.5), them('Yeah', 0)]);
  ok(burst.move === 'first_reply_pitch' && burst.label !== 'Auto-reply', 'an auto-reply then "Yeah" in one burst: a real reply, the pitch');
}
for (const t of ["No thanks, I'm full", "Thanks anyway but I am fine. Busy with recommendations", "No thank you, I've a waiting list for 6 months", 'Not interested, we get loads from word of mouth']) {
  const p = pm(later(them(t)));
  ok(p.noDraft === true && p.needsYou?.reason === 'not_interested', `B9: "${t}" → not interested, no draft`);
}
for (const t of ['Underhand tactics, no thank you', 'That was rude', 'come on bro, copy and paste AI slop']) {
  const p = pm(later(them(t)));
  ok((p.noDraft || p.stop) && !(p.fixedText || p.guide), `B10: "${t}" → complaint, no draft (${p.needsYou?.reason})`);
}
ok(pm(later(them('stop spamming me'))).stop === true, 'B10: "spamming" still stops (the opt-out stays as strict as it was)');
{
  const audio = pm([opener, them('Yes', -400), pitchMsg, us('Would you like to jump on a call or like any more information?', -100), them('[audio]', 0)]);
  ok(audio.move === 'media' && audio.needsYou?.reason === 'media' && audio.intent !== 'voice_yes', 'B11: "[audio]" after our offer is media, never "yes to the voice note"');
  ok(audio.fixedText === VOICE_NOTE_FROM_THEM && VOICE_NOTE_FROM_THEM === "Sorry, I can't listen to voice notes on here. Can you type it, or shall I give you a quick call?", 'a voice note from them: Needs you, Paul\'s suggested text');
  const typed = pm([opener, them('Yes', -400), pitchMsg, { from: 'them', text: '', messageType: 'audio', at: at(0) }]);
  ok(typed.fixedText === VOICE_NOTE_FROM_THEM, '…a typed audio message too');
  ok(pm([opener, them('Yes', -400), pitchMsg, them('[image]', 0)]).needsYou?.reason === 'media', 'B11: "[image]" is media');
  ok(pm([opener, them('No thanks', -1), them('[reaction]', 0)]).noDraft === true, 'a reaction is never answered');
}
ok(pm(later(them("Hi Paul it's there but I have only just seen it sorry. Yes this is the number for ZZ Fixture Driving 90"))).needsYou?.reason !== 'third_party', '"Yes this is the number for <them>" confirms their own business');
ok(pm(later(them("I'm out of action for a while. This is the number for Leon's locks"))).needsYou?.reason === 'third_party', 'another business\'s number: Needs you, run the check on that one');

console.log('5. the docs');
{
  const DOC = readFileSync(new URL('../docs/reply-playbook.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const missing = NEW_INTENTS.filter((i) => !DOC.includes(PLAYBOOK[i].line));
  ok(!missing.length, `docs/reply-playbook.md quotes every new line${missing.length ? ' — missing: ' + missing.join(', ') : ''}`);
}

if (PREVIEW) console.log('\n' + previews.join('\n'));
void ({} as MovePlan);
if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASS');
