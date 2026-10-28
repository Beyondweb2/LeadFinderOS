/* THE VOICE-NOTE HOOK (Paul, 2026-10-27): two shapes, shorter and more human, always "Hi mate,", the engine as "chatgpt" /
   "googleAI", the real names, real findings only, the report line, then "Can I send you a quick voice note…?". The sender's
   name is added at send time (hookSignature.ts). Pure: no model, no DB. Run: npx tsx scripts/hook-voice-note.test.ts */
import { firstReplyPitch, pitchText, pickMove, tidyCaps, HOOK_VOICE_NOTE_Q, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { checkAiReply, fallbackAiReply, finishDraft, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { lowerBrands } from '../src/lib/replyPlaybook.ts';
import { signHook } from '../src/lib/hookSignature.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const URL = 'https://findable.live/r/k4m2p9';
const base: MoveEvidence = { businessName: 'ZZ QA Plumbing 97', trade: 'plumbers', town: 'Rugby', engineWords: 'ai', named: { named: 0, valid: 6 },
  missed: { engine: 'chatgpt', question: 'Who is the best plumber in Rugby?' }, competitors: ['Rival A Plumbing', 'Rival B Plumbing', 'Rival C Plumbing'],
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true, reportUrl: URL };
const site = (pitch: string[], found = pitch.length): MoveEvidence => ({ ...base, site: { state: 'issues', issues: pitch, pitch, found } });
const noSite: MoveEvidence = { ...base, hasWebsite: false, site: { state: 'no_website', issues: [] } };
const FOUR = ["There's no phone number on your site", "Your homepage doesn't mention Rugby", 'Some links on your site are broken', "Your services don't have their own pages"];
const OLD = /AI is recommending your competitors instead|I specialise in getting local businesses|Without one built for AI|Are you with an agency|Do you have a website I've missed/;

const T0 = Date.parse('2026-10-27T10:00:00Z');
const opener: MoveThreadMsg = { from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short', messageType: 'template', at: new Date(T0 - 3_600_000).toISOString() };
const draft = (e: MoveEvidence, said = 'Yes it is') => {
  const thread: MoveThreadMsg[] = [opener, { from: 'them', text: said, messageType: 'text', at: new Date(T0).toISOString() }];
  const plan = pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence: e, nowMs: T0 + 60_000 });
  const ctx: AiReplyContext = { businessName: e.businessName, latestInbound: said, thread: thread.map((m) => ({ from: m.from, text: m.text })), plan, evidence: e };
  const text = fallbackAiReply(ctx);
  return { plan, text, warnings: checkAiReply(text, ctx) };
};

console.log('1. the no-website shape, exactly');
{
  const d = draft(noSite);
  ok(d.text === `Hi mate,\n\nI asked chatgpt "Who is the best plumber in Rugby?" and it named Rival A Plumbing, Rival B Plumbing and Rival C Plumbing, not you.\n\nHere's the full result: ${URL}\n\n${HOOK_VOICE_NOTE_Q}`, 'Paul\'s no-website text, word for word');
  ok(!/website/i.test(d.text), 'never the word "website"');
  ok(d.plan.move === 'first_reply_pitch' && d.plan.structure === 'pitch_no_site' && d.plan.closer === 'voice_note' && d.warnings.length === 0, `pitch_no_site, voice_note, no checker warning${d.warnings.length ? ' — ' + d.warnings.join(' | ') : ''}`);
  ok(signHook(d.text, 'Sam').endsWith(`${HOOK_VOICE_NOTE_Q}\n\nSam`), 'the sender\'s name goes on its own last line when it is sent');
}

console.log('2. the site-found shape, exactly');
{
  const d = draft(site(FOUR.slice(0, 2), 5));
  ok(d.text === `Hi mate,\n\nI asked chatgpt "Who is the best plumber in Rugby?" and it named Rival A Plumbing, Rival B Plumbing and Rival C Plumbing, not you.\n\nI had a look at your site and a couple of things could be holding you back:\n• ${FOUR[0]}\n• ${FOUR[1]}\n\nThere's more in the full report: ${URL}\n\n${HOOK_VOICE_NOTE_Q}`, 'Paul\'s site-found text, word for word ("There\'s more" when the check found more)');
  ok(d.plan.structure === 'pitch_list' && d.warnings.length === 0, `pitch_list, no checker warning${d.warnings.length ? ' — ' + d.warnings.join(' | ') : ''}`);
  const all = draft(site(FOUR.slice(0, 2), 2));
  ok(all.text.includes(`• ${FOUR[1]}\n\nHere's the full result: ${URL}\n\n`) && !all.text.includes("There's more"), 'every finding listed → "Here\'s the full result"');
}

console.log('3. one finding vs four');
{
  const one = draft(site([FOUR[0]]));
  ok(one.text.includes(`I had a look at your site and one thing could be holding you back:\n• ${FOUR[0]}\n\n`) && one.warnings.length === 0, 'one finding → "one thing", one bullet');
  const four = draft(site(FOUR, 6));
  ok((four.text.match(/^• /gm) ?? []).length === 4 && four.text.includes('a few things could be holding you back:') && four.warnings.length === 0, `four findings → "a few things", four bullets, no warning${four.warnings.length ? ' — ' + four.warnings.join(' | ') : ''}`);
  const five = firstReplyPitch(site([...FOUR, 'A fifth thing'], 5));
  ok((pitchText(five).match(/^• /gm) ?? []).length === 4, 'never more than four bullets');
}

console.log('4. no solid findings: the no-website shape, never "your site is missing"');
for (const state of ['clean', 'not_checked', 'unreadable'] as const) {
  const t = pitchText(firstReplyPitch({ ...base, site: { state, issues: [] } }));
  ok(!/•|had a look|website|couldn'?t find|missing/i.test(t) && t.endsWith(HOOK_VOICE_NOTE_Q), `${state}: no bullets, no claim about the site`);
}

console.log('5. Australia: no report link, no price, sign-up or guarantee');
{
  const au: MoveEvidence = { ...site(FOUR.slice(0, 2), 5), town: 'Geelong VIC', missed: { engine: 'chatgpt', question: 'Who is the best plumber in Geelong VIC?' }, prospectOnly: true };
  const d = draft(au);
  ok(d.plan.move === 'first_reply_pitch' && !!d.text, 'still the hook');
  ok(!/findable\.live|https?:|full report|full result|There's more/i.test(d.text), 'no report link or report line');
  ok(!/£|\$|sign[\s-]?up|guarantee|money back/i.test(d.text) && !d.plan.auditPending, 'no price, sign-up or guarantee; not flagged audit pending');
}

console.log('6. the engine: chatgpt / googleAI / AI');
{
  ok(draft({ ...noSite, missed: { engine: 'gemini', question: 'Who is the best plumber in Rugby?' } }).text.includes('\n\nI asked googleAI "Who'), 'gemini → "googleAI"');
  ok(draft({ ...noSite, missed: { engine: 'ai_overview', question: 'Who is the best plumber in Rugby?' } }).text.includes('\n\nI asked googleAI "Who'), "Google's AI answers → \"googleAI\"");
  const unknown = draft({ ...noSite, missed: { engine: 'perplexity', question: 'Who is the best plumber in Rugby?' } });
  ok(unknown.text.includes('\n\nI asked AI "Who') && unknown.warnings.length === 0, 'unknown engine → "AI"');
  ok(draft({ ...noSite, engineWords: 'gemini' }).text.includes('\n\nI asked AI "Who'), 'the conversation already named the other tool → "AI"');
}

console.log('7. the tidy steps keep "googleAI" and "chatgpt" exactly');
{
  const g = 'Hi mate,\n\nI asked googleAI "Who?" and it named A, not you.';
  ok(tidyCaps(g) === g && finishDraft(g) === g, 'tidyCaps / finishDraft keep "googleAI"');
  ok(tidyCaps('I asked chatgpt "Who?"') === 'I asked chatgpt "Who?"', 'tidyCaps keeps "chatgpt"');
  ok(lowerBrands('I asked googleAI "Who?"').includes('googleAI'), 'the follow-up lower-casing does not touch "googleAI"');
  ok(tidyCaps('i asked googleai and gemini') === 'I asked googleai and Gemini', 'only the exact hook spelling is protected');
}

console.log('8. "Hi mate," always, "not you" only when true, the old lines gone');
{
  ok(draft(noSite, 'Yes this is Dom').text.startsWith('Hi mate,\n\n') && draft({ ...noSite, ownerName: 'Kylie' }).text.startsWith('Hi mate,\n\n'), 'a name they gave or the site states → still "Hi mate,"');
  const noMissed = pitchText(firstReplyPitch({ ...noSite, missed: null, named: { named: 3, valid: 6 } }));
  ok(!/not you/.test(noMissed) && /and it named Rival A Plumbing/.test(noMissed), 'no missed search on record, named in more than a third → no "not you" (the old handling)');
  for (const [label, e] of [['no website', noSite], ['site found', site(FOUR, 6)], ['no audit', { ...base, named: null }]] as const) {
    const t = pitchText(firstReplyPitch(e));
    ok(!OLD.test(t) && t.startsWith('Hi mate,') && t.endsWith(HOOK_VOICE_NOTE_Q), `${label}: "Hi mate,", the voice-note question, none of the old long lines`);
    ok((t.replace(/"[^"\n]*"/g, '').match(/\?/g) ?? []).length === 1, `${label}: one question`);
  }
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
