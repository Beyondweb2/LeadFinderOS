/* LEAN FIRST REPLIES (Paul, 2026-10-23; docs/reply-playbook.md §5e) — the site-shared reply, the "how can I get up on AI"
   reply, the Australia guard, the logged structure and the voice-note script's offer rules. The real conversation is
   Quick Drive School of Motoring (Rotherham, 2026-10-20 → 22). Pure: no model, no DB. */
import { pickMove, firstReplyPitch, pitchText, prospectOnlyPlan, siteSharedReply, GOOGLE_LISTING_NO_LINK, SITE_SHARED_KNOWN_Q, PITCH_AGENCY_Q,
  type MoveEvidence, type MoveThreadMsg, type MovePlan } from '../src/lib/replyMove.ts';
import { checkAiReply, fallbackAiReply, isFollowUp, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { pitchIssueLine, PITCH_MAX_WORDS } from '../src/lib/pitchIssueWords.ts';
import { buildVoiceNotePrompt, checkVoiceNoteScript, SPOKEN_PRICE_LINE, SPOKEN_GUARANTEE_LINE, VOICE_NOTE_SYSTEM_PROMPT, type VoiceNoteEvidence, type VoiceNoteSite } from '../src/lib/voiceNoteScript.ts';
import { spokenLength } from '../src/lib/spokenLength.ts';
import { GUARANTEE_LINE } from '../src/lib/offerFactSheet.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

/* Quick Drive as the drafter saw it on 2026-10-20: no website on record, named 0 of 2, Gemini's miss. */
const QD: MoveEvidence = { businessName: 'QuickDrive School of Motoring', trade: 'Driving instructors', town: 'Rotherham', engineWords: 'ai', named: { named: 0, valid: 2 },
  missed: { engine: 'gemini', question: 'who are the best driving instructors in Rotherham UK' },
  competitors: ['MA Driving School', 'Strive2Drive Driving Academy', 'Madinah Driving School'], hookAlreadySent: false, findings: [], hasWebsite: false,
  ownerName: null, foundOnGoogle: true, site: { state: 'no_website', issues: [] } };
const opener: MoveThreadMsg = { from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' };
const pitch: MoveThreadMsg = { from: 'us', text: pitchText(firstReplyPitch(QD)) };
const shared: MoveThreadMsg[] = [
  { from: 'them', text: 'https://quickdriveacademy.co.uk/' },
  { from: 'them', text: 'Quick Drive School of Motoring\nhttps://g.page/r/CVfIJVCWlYOPEBM/review' },
  { from: 'them', text: 'https://www.facebook.com/share/p/1CTNZPaGyW/?mibextid=wwXIfr' },
];
const pm = (thread: MoveThreadMsg[], evidence: MoveEvidence) => pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence });
const ctxOf = (plan: MovePlan, evidence: MoveEvidence, thread: MoveThreadMsg[]): AiReplyContext =>
  ({ businessName: evidence.businessName, latestInbound: [...thread].reverse().find((m) => m.from === 'them')?.text ?? '', thread: thread.map((m) => ({ from: m.from, text: m.text })), plan, evidence });

console.log('1. the no-website pitch Quick Drive would get today');
{
  const p = firstReplyPitch(QD);
  const t = pitchText(p);
  ok(t.includes("Most local work comes from recommendations, and now AI is the one recommending. It leans on websites when it picks who to name, and I couldn't find one for you. Without one built for AI, you're hard to recommend.") && !/Gemini|Google AI/.test(t), 'Paul\'s no-website words (2026-10-26), no brand');
  ok(p.question === "Do you have a website I've missed, or is that something you'd want sorted?" && p.structure === 'pitch_no_site', 'the one question, structure pitch_no_site');
}

console.log('2. site shared (Paul, 2026-10-23)');
{
  /* Not checked yet: the lead still has no website, so nothing has been read on THAT site. */
  const notYet = pm([opener, { from: 'them', text: 'Yes it is …how can I help ?' }, pitch, ...shared], QD);
  ok(notYet.move === 'site_shared' && notYet.noDraft === true && notYet.needsYou?.reason === 'site_not_checked' && /press Crawl site, then Regenerate/.test(notYet.note ?? ''),
    `not checked yet → Needs you, no draft, "press Crawl site, then Regenerate" (got ${notYet.move}/${notYet.needsYou?.reason})`);
  /* Checked (the person added the site and crawled it). The map pin and Facebook link beside it do not get in the way. */
  const checked: MoveEvidence = { ...QD, hasWebsite: true, websiteUrl: 'https://quickdriveacademy.co.uk', site: { state: 'issues', issues: ['a', 'b'],
    pitch: ["Your site doesn't use the name on your Google listing (it says Quick Drive Academy)", "There's no address on your homepage, and no named owner", 'A line on your site reads "Welcome, !" where a name should be'] } };
  const thread = [opener, { from: 'them' as const, text: 'Yes it is …how can I help ?' }, pitch, ...shared];
  const p = pm(thread, checked);
  ok(p.move === 'site_shared' && !!p.fixedText && p.structure === 'site_shared_list', `checked → the site-shared reply, code-built (got ${p.move}/${p.structure})`);
  const text = p.fixedText ?? '';
  ok(text.startsWith('Ah thanks, I missed that one. Had a proper look and a few things could be holding you back with AI:\n• ' + GOOGLE_LISTING_NO_LINK), 'Paul\'s opening, then "Your Google listing doesn\'t link to your website" first (we said we could not find one)');
  ok((text.match(/^• /gm) ?? []).length === 4 && text.endsWith(PITCH_AGENCY_Q), 'up to four real lines, the agency question last');
  ok(!/main heading|meta|schema|so AI can'?t be sure/i.test(text), 'no jargon, never how AI decides');
  const w = checkAiReply(text, ctxOf(p, checked, thread));
  ok(w.length === 0, `it passes the checker (the site's own name is not a stranger)${w.length ? ' — ' + w.join(' | ') : ''}`);
  ok(!isFollowUp(p), '"AI" keeps its capitals in the site-shared reply');
  const one = siteSharedReply(['Your homepage doesn\'t mention Rotherham'], { googleNoLink: false, whoKnown: false });
  ok(one.text.startsWith("Ah thanks, I missed that one. Had a proper look and one thing could be holding you back: your homepage doesn't mention Rotherham.") && one.structure === 'site_shared_sentence', 'one real issue → one sentence');
  const none = siteSharedReply([], { googleNoLink: false, whoKnown: true });
  ok(none.text === `Ah thanks, I missed that one. Had a proper look and nothing obvious is wrong with it.\n\n${SITE_SHARED_KNOWN_Q}` && none.structure === 'site_shared_plain', 'nothing found → said plainly, never invented; who runs it known → the call / voice note');
  /* A link with no "no website" from us is the ordinary website-given answer. */
  const withSite: MoveEvidence = { ...checked };
  const ordinary = pm([opener, { from: 'them', text: 'Yes' }, { from: 'us', text: pitchText(firstReplyPitch(withSite)) }, { from: 'them', text: 'our new one is www.quickdrive2.co.uk' }], withSite);
  ok(ordinary.intent === 'website_given', 'a link when we never said "no website" → website_given, as before');
}

console.log('3. "how can I get up on the AI search?" (Quick Drive, 2026-10-22)');
{
  const agencyQ: MoveThreadMsg = { from: 'us', text: 'Ah thanks, I missed that one. Had a proper look and a few things could be holding you back with AI:\n• x\n• y\n\nAre you with an agency, or do you manage the website yourself?' };
  const thread = [opener, { from: 'them' as const, text: 'Yes it is' }, pitch, ...shared, agencyQ, { from: 'them' as const, text: 'I mange it myself tbh …how can I get up on the ai search ?' }];
  const p = pm(thread, QD);
  ok(p.intent === 'how_to_get_named', `the real message → how_to_get_named (got ${p.intent ?? p.move})`);
  ok((p.fixedText ?? '').startsWith('Good, that makes it easier. The main thing I work on is a website AI can read properly') && /Voice note, or a quick call\?$/.test(p.fixedText ?? ''), 'it answers the agency part too, then the how, then voice note or call');
  ok(!/£|guarantee|payments/i.test(p.fixedText ?? '') && !p.allowPrice, 'no price');
  ok(((p.fixedText ?? '').replace(/"[^"\n]*"/g, '').match(/\?/g) ?? []).length === 1, 'one question');
  const plain = pm([opener, { from: 'them' as const, text: 'Yes' }, pitch, { from: 'them' as const, text: 'how can you help?' }], QD);
  ok(plain.intent === 'how_to_get_named' && (plain.fixedText ?? '').startsWith('Good question.'), '"how can you help?" after the pitch → "Good question." version');
  ok(pm([opener, { from: 'them', text: 'Yes, how can I help?' }], QD).move === 'first_reply_pitch', '"how can I help" on the first reply is still the pitch');
}

console.log('4. Australia is prospect-only (Paul, 2026-10-23)');
{
  const au: MoveEvidence = { ...QD, town: 'Melton VIC', prospectOnly: true, hasWebsite: true, site: { state: 'clean', issues: [] } };
  const after = [opener, { from: 'them' as const, text: 'Yes' }, { from: 'us' as const, text: pitchText(firstReplyPitch(au)) }];
  for (const ask of ['how much is it?', "what's the catch?", 'is there a guarantee?', 'will I definitely be recommended?', 'can I pay after results?']) {
    const p = pm([...after, { from: 'them', text: ask }], au);
    ok(p.noDraft === true && p.needsYou?.reason === 'prospect_only' && !p.fixedText, `"${ask}" → Needs you, no draft (got ${p.intent ?? p.move}/${p.needsYou?.reason})`);
  }
  const keen = pm([...after, { from: 'them', text: 'sounds interesting, tell me more' }], au);
  ok(!keen.noDraft && keen.allowPrice === false, 'any other reply still drafts, but may never state a price');
  ok(!/£|guarantee|sign/i.test(pitchText(firstReplyPitch(au))), 'the Australian pitch carries no price, guarantee or sign-up');
  /* The property, not the intent list: any plan carrying a £ is refused for a prospect-only lead. */
  const made = prospectOnlyPlan({ move: 'playbook', topic: null, needsYou: null, stop: false, autoDraft: true, points: ['Say: it is £99'], question: null, allowPrice: true, label: null, read: 'x' }, { prospectOnly: true });
  ok(made.noDraft === true && made.needsYou?.reason === 'prospect_only', 'a new line that carries a £ is caught too (judged on what it says)');
  ok(prospectOnlyPlan(made, { prospectOnly: false }) === made, 'a UK lead is untouched');
}

console.log('5. the pitch words and the length rule');
{
  ok(pitchIssueLine({ id: 'location_unclear', title: 'Arundel QLD is not mentioned on the site', saw: 'Arundel QLD does not appear anywhere in the text of any of the 6 pages read (read in full).' }) === "Your site doesn't mention Arundel QLD", 'the town keeps its capital');
  ok(pitchIssueLine({ id: 'ct_schema_mismatch', title: 'The business details in your page code don’t match the page' }) === null && pitchIssueLine({ id: 'no_sitemap', title: 'No XML sitemap found' }) === null, 'page code and sitemaps are left out, never said in jargon');
  ok(pitchIssueLine({ id: 'search_crawler_refused', title: 'The site refused AI search crawlers' }) === "My check couldn't read your website, and AI tools may struggle with it too", 'our check failing is hedged');
  ok(PITCH_MAX_WORDS === 115, 'the length rule is 115 words (Paul, 2026-10-26: list more)');
}

console.log('6. the voice-note script: the offer word for word, none for Australia (Paul, 2026-10-23)');
{
  const EV: VoiceNoteEvidence = { questionIndex: 0, question: 'who are the best driving instructors in Rotherham UK', engine: 'gemini', engineLabel: 'Gemini', competitors: QD.competitors, answerExcerpt: '', thin: false };
  const SITE: VoiceNoteSite = { mode: 'no_website', findings: [], source: 'none', sourceLabel: null, services: [], serviceEvidence: '', points: [] };
  const P = buildVoiceNotePrompt({ business: QD.businessName, trade: 'Driving instructors', area: 'Rotherham', website: null, evidence: EV, site: SITE,
    thread: [{ from: 'us', text: '[initial_contact_short]' }, { from: 'them', text: 'how can I get up on the ai search ?' }], voiceSamples: ['Ahh okay, are you still doing lessons?'] });
  ok(P.includes(`THE OFFER (say these words exactly): "${SPOKEN_PRICE_LINE}."`) && P.includes(`"${GUARANTEE_LINE}"`), 'the prompt carries the price and the guarantee word for word');
  ok(/CONVERSATION SO FAR/.test(P) && /THEM: how can I get up on the ai search/.test(P) && /Paul's opening message/.test(P), 'the prompt carries the conversation (the opener said as what it is)');
  ok(/PAUL'S OWN WORDS \(his tone and rhythm only; never copy a claim/.test(P), 'Paul\'s own words as tone only');
  ok(/AI tends to lean on websites when it names businesses/.test(P), 'no website → Option 2 words');
  const PA = buildVoiceNotePrompt({ business: QD.businessName, trade: 'Driving instructors', area: 'Melton VIC', website: null, evidence: EV, site: SITE, prospectOnly: true });
  ok(!PA.includes(SPOKEN_PRICE_LINE) && !PA.includes(GUARANTEE_LINE) && /PROSPECT-ONLY/.test(PA), 'Australia: no offer, no guarantee in the prompt');
  ok(/99%/.test(VOICE_NOTE_SYSTEM_PROMPT) && /never a percentage/.test(VOICE_NOTE_SYSTEM_PROMPT), 'the prompt says "most", never a percentage');

  const base = "hi mate, it's Paul from Findable. good question. i specialise in AI visibility for local businesses. when i asked AI for a driving instructor in Rotherham it named MA Driving School, Strive2Drive Driving Academy and Madinah Driving School, but not you. some AI tools get their answers by reading websites, and most websites aren't set up for that. AI tends to lean on websites when it names businesses, and i couldn't find one for you. it matters more than ever to have a site AI can read, so it's able to recommend you. first i run a discovery audit to find the questions worth going for, then i build you a new site to give you the best chance of being named for them. ";
  const offer = `it's ${SPOKEN_PRICE_LINE}. ${SPOKEN_GUARANTEE_LINE} `;
  const close = 'shall we have a quick call this week to go through it?';
  const good = checkVoiceNoteScript(base + offer + close, { evidence: EV, site: SITE, town: 'Rotherham', offerExpected: true });
  ok(good.problems.length === 0, `a full script with the exact offer passes (${good.problems.join(' | ') || 'ok'})`);
  ok(checkVoiceNoteScript(base + close, { evidence: EV, site: SITE, town: 'Rotherham', offerExpected: true }).problems.some((x) => /price in the sheet's words/.test(x)), 'the full script without the offer is sent back');
  ok(checkVoiceNoteScript(base + "it's £99 to start and £99 monthly. " + SPOKEN_GUARANTEE_LINE + ' ' + close, { evidence: EV, site: SITE, offerExpected: true }).problems.some((x) => /price in the sheet's words|monthly/.test(x)), 'a reworded price, or "monthly", is sent back');
  ok(checkVoiceNoteScript(base + `it's ${SPOKEN_PRICE_LINE}. we guarantee you'll be named. ` + close, { evidence: EV, site: SITE, offerExpected: true }).problems.some((x) => /guarantee/.test(x)), 'a reworded guarantee is sent back');
  ok(checkVoiceNoteScript(base + offer + close, { evidence: EV, site: SITE, prospectOnly: true }).problems.some((x) => /prospect-only/.test(x)), 'Australia: any price or guarantee is sent back');
  ok(checkVoiceNoteScript(base.replace('most websites', '99% of websites') + offer + close, { evidence: EV, site: SITE, offerExpected: true }).problems.some((x) => /percentage/.test(x)), '"99% of websites" is sent back');
  ok(checkVoiceNoteScript(base.replace("so it's able to recommend you", 'so AI will recommend you') + offer + close, { evidence: EV, site: SITE, offerExpected: true }).problems.some((x) => /what AI will do/.test(x)), '"AI will recommend you" is sent back');
  ok(checkVoiceNoteScript(base.replace('best chance of being named', 'best chance to win') + offer + close, { evidence: EV, site: SITE, offerExpected: true }).problems.some((x) => /"win"/.test(x)), '"win" is sent back');
  ok(spokenLength(base + offer + close).seconds <= 120, `the sample is under two minutes (${spokenLength(base + offer + close).label})`);
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
