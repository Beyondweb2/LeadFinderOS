/* HOOK FIRST (Paul, 2026-10-26): the first reply that is not a no gets the hook with the report, nothing else.
   Real cases (prospect words as they came in; rivals anonymised): Green Driver (Gosport, site found) "Hiya, yes. Are you
   looking for manual driving lessons?"; A Wild Driving School (Corby, no website); a plumber with a site and real findings;
   an Australian lead; a plain "no thanks". Run: npx tsx scripts/hook-first-replies.test.ts */
import { pickMove, PITCH_NO_SITE_LINE, PITCH_SITE_Q, PITCH_AGENCY_Q, PITCH_SPECIALISE_LINE, PITCH_INSTEAD_LINE, type MoveEvidence, type MoveThreadMsg, type MovePlan } from '../src/lib/replyMove.ts';
import { checkAiReply, aiReplyDecision, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { autoSendVerdict, draftFactsFromPlan, theirMessagesSinceUs, threadHardReason, AUTO_SEND_CHOICES, type AutoSendFacts } from '../src/lib/aiAutoSend.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const REPORT = 'https://findable.live/r/ab12cd';
const opener: MoveThreadMsg = { from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' };
const them = (text: string, messageType = 'text'): MoveThreadMsg => ({ from: 'them', text, messageType });
const greenDriver: MoveEvidence = {
  businessName: 'Green Driver dot uk', trade: 'driving instructors', town: 'Gosport', engineWords: 'ai', named: { named: 0, valid: 6 },
  missed: { engine: 'gemini', question: 'Who is the best driving instructor in Gosport?' }, competitors: ['Rival A Driving', 'Rival B Driving', 'Rival C Driving'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true, reportUrl: REPORT,
  site: { state: 'clean', issues: [] },
};
const corby: MoveEvidence = {
  businessName: 'A Wild Driving School', trade: 'driving instructors', town: 'Corby', engineWords: 'ai', named: { named: 0, valid: 6 },
  missed: { engine: 'gemini', question: 'Who is the best driving instructor in Corby?' }, competitors: ['Rival A Driving', 'Rival B Driving', 'Rival C Driving'],
  hookAlreadySent: false, findings: [], hasWebsite: false, ownerName: null, foundOnGoogle: true, reportUrl: REPORT,
  site: { state: 'no_website', issues: [] },
};
const plumber: MoveEvidence = {
  businessName: 'ZZ Fixture Plumbing 26', trade: 'plumbers', town: 'Rugby', engineWords: 'ai', named: { named: 0, valid: 6 },
  missed: { engine: 'chatgpt', question: 'Who is the best plumber in Rugby?' }, competitors: ['Rival A Plumbing', 'Rival B Plumbing'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true, reportUrl: REPORT,
  site: { state: 'issues', issues: ['No phone number on the site', 'No page for Rugby'], pitch: ['There is no phone number on the site', 'There is no page for Rugby'] },
};
const aussie: MoveEvidence = { ...plumber, businessName: 'ZZ Fixture Plumbing AU', town: 'Geelong VIC', missed: { engine: 'chatgpt', question: 'Who is the best plumber in Geelong VIC?' }, prospectOnly: true };

const pm = (e: MoveEvidence, ...msgs: MoveThreadMsg[]) => pickMove({ thread: [opener, ...msgs], suppressed: false, aiSentSinceWin: 0, evidence: e });
const ctx = (p: MovePlan, e: MoveEvidence, latest: string): AiReplyContext => ({ businessName: e.businessName, latestInbound: latest, thread: [], plan: p, evidence: e });
const NO_EXPLAINING = /sorry|confusion|not after|I'm Paul|Fair question|slow reply/i;

console.log('1. Green Driver: "are you looking for manual lessons?" → the hook, no apology');
{
  const said = 'Hiya, yes. Are you looking for manual driving lessons?';
  const p = pm(greenDriver, them(said));
  const t = p.fixedText ?? '';
  ok(p.move === 'first_reply_pitch', `the hook (got ${p.move} / ${p.intent ?? ''})`);
  ok(t.startsWith('Hi mate,\n\nI asked google ai "Who is the best driving instructor in Gosport?" and it mentioned Rival A Driving, Rival B Driving and Rival C Driving.'), 'opens "Hi mate," then the question and the real names');
  ok(t.includes(PITCH_INSTEAD_LINE) && t.includes(PITCH_SPECIALISE_LINE), 'the instead line and the specialise line');
  ok(t.includes(`Here's the full report: ${REPORT}\n\n${PITCH_AGENCY_Q}`) && t.endsWith(PITCH_AGENCY_Q), 'the report link, then ONE question: the agency question');
  ok(!NO_EXPLAINING.test(t), 'no apology, no "not after lessons", no explaining');
  ok(!/•/.test(t), 'a clean site: no bullets, nothing invented');
  ok(checkAiReply(t, ctx(p, greenDriver, said)).length === 0, `the checker has nothing to say (${checkAiReply(t, ctx(p, greenDriver, said)).join(' | ')})`);
  for (const s of ['Manual or automatic?', 'Yes who\'s this?', 'Is it manual or Automatic you need and where do you live postcode wise ?', 'Hi. Yes, it is. You need driving lessons?', 'What are you selling?', 'how much is it?']) {
    const q = pm(greenDriver, them(s));
    ok(q.move === 'first_reply_pitch' && !NO_EXPLAINING.test(q.fixedText ?? '') && !/£/.test(q.fixedText ?? ''), `"${s}" → the hook as it stands`);
  }
  const chased = pm(greenDriver, them('Yes'), them('Hello??'));
  ok(chased.move === 'first_reply_pitch' && !/sorry/i.test(chased.fixedText ?? ''), 'they chased before the hook → the hook, no "sorry for the slow reply"');
}

console.log('2. Corby, no website → Paul\'s paragraph, word for word');
{
  const p = pm(corby, them('Yes it is'));
  const t = p.fixedText ?? '';
  ok(t.includes("Most local work comes from recommendations, and now AI is the one recommending. It leans on websites when it picks who to name, and I couldn't find one for you. Without one built for AI, you're hard to recommend."), 'the no-website paragraph, word for word');
  ok(t.endsWith(`Here's the full report: ${REPORT}\n\n${PITCH_SITE_Q}`) && PITCH_SITE_Q === "Do you have a website I've missed, or is that something you'd want sorted?", 'the report, then "Do you have a website I\'ve missed, or is that something you\'d want sorted?"');
  ok(!/well[\s-]built|more important than ever|\d+\s*%/i.test(t) && !/•/.test(t), 'never "well-built", "more important than ever" or a stat; no bullets');
  ok(PITCH_NO_SITE_LINE.length > 0 && checkAiReply('Without a well-built one you lose out.', ctx(p, corby, 'Yes it is')).some((w) => /well-built/.test(w)), 'the checker warns on "well-built"');
}

console.log('3. a plumber with a site and real findings → only those findings');
{
  const p = pm(plumber, them('Yes, how can I help?'));
  const t = p.fixedText ?? '';
  ok(/• There is no phone number on the site\n• There is no page for Rugby/.test(t), 'the two real findings as bullets');
  ok(t.endsWith(`Here's the full report: ${REPORT}\n\n${PITCH_AGENCY_Q}`), 'the report, then the agency question');
  ok(checkAiReply(t, ctx(p, plumber, 'Yes, how can I help?')).length === 0, 'the checker has nothing to say');
}

console.log('4. Australia: the hook, no report link, no price / sign-up / guarantee');
{
  const p = pm(aussie, them('Yes mate'));
  const t = p.fixedText ?? '';
  ok(p.move === 'first_reply_pitch' && t.length > 0, 'still the hook');
  ok(!t.includes('findable.live') && !/report/i.test(t), 'no report link');
  ok(!/£|\$|sign[\s-]?up|guarantee|money back/i.test(t), 'no price, sign-up or guarantee');
  ok(!p.auditPending, 'not marked "audit pending" just because the link is left out');
}

console.log('5. a no keeps its own handling: never the hook');
{
  for (const s of ['no thanks', 'No thanks mate', 'Not interested', 'no competition round here mate', "I'm not interested thanks"]) {
    const p = pm(greenDriver, them(s));
    ok(p.move !== 'first_reply_pitch' && !p.fixedText, `"${s}" → no hook (${p.move})`);
  }
  const d = aiReplyDecision({ inboundAt: new Date().toISOString(), lead: { amount_paid: null, status: 'replied', is_archived: false }, hadOutreach: true, plan: pm(greenDriver, them('no thanks')), nowMs: Date.now() });
  ok(d.kind === 'needs_you' && d.reason === 'not_interested', 'plain "no thanks" → Needs you, not interested, no draft (unchanged)');
  for (const s of ["I'm away until the 18th", 'Not right now', "Don't need any more customers", 'wrong number mate', 'Tak berminat', 'is this a bot?']) {
    ok(pm(greenDriver, them(s)).move !== 'first_reply_pitch', `"${s}" keeps its own handling`);
  }
  ok(pm(greenDriver, them('stop')).stop === true, 'stop → the stop');
}

console.log('6. what is already live stays');
{
  const bot = pm(greenDriver, them("I'm sorry, I didn't quite catch that. Could you please rephrase your message?"));
  ok(bot.noDraft === true && !bot.fixedText, 'a chatbot "didn\'t quite catch that" gets nothing');
  ok(pm(greenDriver, them('[sticker]', 'sticker')).noDraft === true && pm(greenDriver, them('[reaction]', 'reaction')).noDraft === true, 'a sticker or a reaction → no draft');
}

console.log('7. the report link is approve-to-send only');
{
  const thread = [opener, them('Yes it is')];
  const plan = pm(plumber, them('Yes it is'));
  const input = { thread, suppressed: false, aiSentSinceWin: 0, evidence: plumber };
  const facts: AutoSendFacts = {
    masterOn: true, intentsOn: AUTO_SEND_CHOICES.map((c) => c.key), dailyCap: 30, usedToday: 0, theirMessages: theirMessagesSinceUs(thread),
    draft: draftFactsFromPlan(plan, { kind: 'draft', text: plan.fixedText ?? '', problems: [], usedFallback: false, evidenceComplete: true }),
    latestInbound: 'Yes it is', threadHard: threadHardReason(input), digits: '447700900123', lead: { amount_paid: null, status: 'replied', is_archived: false },
    suppressed: false, personActiveAt: null, senderIsAdmin: true, nowMs: Date.now(),
  };
  const v = autoSendVerdict(facts);
  ok(!v.send && v.reason === 'has_link', `a hook with the report link never sends itself, every switch on (${v.send ? 'SENT' : v.reason})`);
  const noLink = autoSendVerdict({ ...facts, draft: { ...facts.draft, text: (plan.fixedText ?? '').replace(/\n\nHere's the full report: \S+/, '') } });
  ok(noLink.send === true, `positive control: the same hook without a link may send (${noLink.send ? 'send' : noLink.reason})`);
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
