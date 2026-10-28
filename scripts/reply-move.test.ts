/* THE NEXT MOVE (2026-10-20, Paul) — src/lib/replyMove.ts: code picks the move, the model only phrases it.
   Runs every ZZ fixture (scripts/fixtures/ai-reply-eval.json: 25 anonymised real conversations + 32 odd replies) through
   pickMove and checks the hand-over decision; pins the loop guards, the capitals and the safeguards. Pure: no model, no DB. */
import { readFileSync } from 'node:fs';
import { pitchIssueLines } from '../src/lib/pitchIssueWords.ts';
import { pickMove, tidyCaps, auditLine, inboundLabel, firstReplyPitch, autoReplyFlags, isAutoReply, PITCH_AGENCY_Q, HOOK_VOICE_NOTE_Q, hookSiteLead, pitchText, PITCH_SITE_Q, PITCH_VOICE_Q, PITCH_SELF_MANAGED_REPLY, BOT_ANSWER, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { CONFIDENCE_LINE, GUARANTEE_LINE } from '../src/lib/offerFactSheet.ts';
import { checkAiReply, fallbackAiReply, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { conversationEngine, draftNames } from '../src/lib/draftEvidence.ts';
import { plainIssueTitle } from '../src/lib/websiteCheck.ts';
import { worstMiss } from '../src/lib/worstMiss.ts';

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
  ok(yesHook.intent === 'voice_yes' && !yesHook.allowPrice && !yesHook.points.join(' ').match(/sign|link|£/i), 'a bare "yes" to our offer → the voice note, never a sign-up link or a price');
  const keen = pm([opener, { from: 'them', text: 'Yes please, I\'m interested' }]);
  ok(keen.move === 'first_reply_pitch', 'the FIRST reply, even "interested" → the pitch (they have not heard it yet)');
  const keen2 = pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: "I'm interested, tell me more" }]);
  ok(keen2.intent === 'interested' && /quick call/.test(keen2.guide ?? '') && /voice note/.test(keen2.question ?? ''), 'interested later → the call, or a voice note if easier');
  const price = pm([opener, { from: 'them', text: 'how much is it?' }]);
  ok(price.move === 'first_reply_pitch' && !price.allowPrice && !/£/.test(price.fixedText ?? ''), 'a price question as the FIRST reply → the hook, no price (Paul, 2026-10-26)');
  const price2 = pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'how much is it?' }]);
  ok(price2.intent === 'how_much' && price2.topic === 'price' && price2.allowPrice && /word for word: "It's £99 to start/.test(price2.points[0]), 'a price question after the hook → the playbook price line, word for word');
  /* Ads are ads_question since 2026-10-21 (reply recon); a logo is still not on the sheet. */
  ok(pm([opener, { from: 'them', text: 'Can you do my logo as well?' }]).move === 'first_reply_pitch', 'an off-sheet question as the FIRST reply → the hook');
  const unknown = pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'Can you do my logo as well?' }]);
  ok(unknown.needsYou?.reason === 'question_not_on_sheet' && unknown.noDraft === true, 'a question the sheet does not answer → Needs you, no draft');
  const bot = pm([opener, { from: 'them', text: 'is this a bot?' }]);
  ok(bot.move === 'is_bot' && bot.guide === BOT_ANSWER, '"is this a bot" → honest, never denied');
  const provider = pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'I pay him to do it' }]);
  ok(provider.intent === 'agency' && /tied into a contract/.test(provider.question ?? ''), '"I pay him" → the contract question (never badmouthing whoever it is)');
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
ok(auditLine(ev) === 'I asked AI for a plumber in Rugby and it mentioned Rival A Plumbing and Rival B Plumbing.', '0 of 6 → the search and who AI mentioned');
ok(!/instead|not you/.test(auditLine({ ...ev, named: { named: 3, valid: 6 } }) ?? '') && !/3 of 6|gap in the rest/.test(auditLine({ ...ev, named: { named: 3, valid: 6 } }) ?? ''), '3 of 6 → no "instead", and never "X of Y" or "a gap in the rest"');
ok(/every time/.test(auditLine({ ...ev, named: { named: 6, valid: 6 } }) ?? ''), '6 of 6 → says AI names them');
ok(auditLine({ ...ev, named: null }) === null, 'no counts → no AI line at all');

console.log('5. capitals in code');
ok(tidyCaps('hi mate, im paul. ill call you tomorrow') === "Hi mate, I'm paul. I'll call you tomorrow", 'sentence starts, I\'m, I\'ll');
ok(tidyCaps('i asked chatgpt and gemini\nwhat time suits?') === 'I asked ChatGPT and Gemini\nWhat time suits?', 'every line starts with a capital; ChatGPT / Gemini');
ok(tidyCaps('see findable.live or email paul@findable.live. call 07700 900123') === 'See findable.live or email paul@findable.live. Call 07700 900123', 'links, emails and numbers untouched');
ok(tidyCaps('https://findable.live/r/abc is yours') === 'https://findable.live/r/abc is yours', 'a link at the start stays as it is');
ok(tidyCaps("i've got it, i'd say so") === "I've got it, I'd say so", "I've / I'd");

console.log('6. the first-reply hook (Paul, 2026-10-27: the voice-note hook)');
{
  const PITCH_LINES = ["Your main pages don't say clearly what you do", "Your site isn't secure (no padlock)", "There's no phone number on your site", 'Some links on your site are broken', 'A fifth issue'];
  const issuesEv: MoveEvidence = { ...ev, site: { state: 'issues', issues: ['Some pages have no main heading', 'Your site is not secure (no padlock)', 'There is no phone number on the site', 'Linked pages that return an error', 'A fifth issue'], pitch: PITCH_LINES } };
  const noSiteEv: MoveEvidence = { ...ev, hasWebsite: false, site: { state: 'no_website', issues: [] } };
  const p1 = firstReplyPitch(issuesEv);
  const txt = p1.lines.join(' ');
  const qOutsideQuotes = (s: string) => (s.replace(/"[^"\n]*"/g, '').match(/\?/g) ?? []).length;
  ok(p1.lines[1] === 'I asked AI for a plumber in Rugby and it named Rival A Plumbing and Rival B Plumbing.', 'line 1: I asked AI <search> and it named <rivals> (no missed search on record: no "not you")');
  ok(p1.lines[2] === `${hookSiteLead(4)}\n${PITCH_LINES.slice(0, 4).map((l) => '• ' + l).join('\n')}` && !/fifth/.test(txt), 'line 2: the site lead-in, then up to FOUR real issues, one "• " line each');
  ok(p1.lines.length === 3 && p1.question === HOOK_VOICE_NOTE_Q && p1.closer === 'voice_note' && p1.structure === 'pitch_list', 'then the voice-note question; structure pitch_list');
  ok(!/specialise|recommending your competitors|agency|Without one built/i.test(txt + p1.question), 'none of the old long lines');
  ok(!/guarantee|money back|£|confident|refund|promise/i.test(txt + p1.question), 'no guarantee, money back, price or promise in the hook');
  ok(!/main heading|meta description|description for google|robots|schema|sitemap|canonical/i.test(pitchText(p1)), 'no jargon in the hook');
  const text = pitchText(p1);
  ok(qOutsideQuotes(text) === 1 && text.endsWith(HOOK_VOICE_NOTE_Q) && text.startsWith('Hi mate,\n\n'), 'one message: "Hi mate," first, the voice-note question the ONLY question, last');
  const one = firstReplyPitch({ ...issuesEv, site: { state: 'issues', issues: ['x'], pitch: ['Your business name is written different ways across your site'] } });
  ok(one.lines[2] === 'I had a look at your site and one thing could be holding you back:\n• Your business name is written different ways across your site' && one.structure === 'pitch_list', 'one real issue: one bullet');
  const town = firstReplyPitch({ ...issuesEv, site: { state: 'issues', issues: ['x', 'y'], pitch: ["Your site doesn't mention Sunbury", "Your site doesn't say which areas you cover"] } });
  ok(town.lines[2].includes("• Your site doesn't mention Sunbury") && town.lines[2].startsWith('I had a look at your site and a couple of things'), 'a town keeps its capital; two issues → "a couple of things"');
  /* The length rule: past PITCH_MAX_WORDS the lowest issue goes, never below two. */
  const long = 'Your site mentions being accredited but doesn\'t say who by, and several other quite long words go here too and then a few more';
  const longP = firstReplyPitch({ ...issuesEv, site: { state: 'issues', issues: ['a', 'b', 'c', 'd'], pitch: [long, long + ' 2', long + ' 3', long + ' 4'] } });
  const bullets = (longP.lines[2].match(/^• /gm) ?? []).length;
  ok(bullets >= 2 && bullets < 4, `the length rule: four very long issues → cut, never below two (got ${bullets})`);
  const caps = firstReplyPitch({ ...issuesEv, trade: 'Driving instructors' });
  ok(caps.lines[1].startsWith('I asked AI for a driving instructor in Rugby'), 'a capitalised stored trade is said lower case ("a driving instructor")');
  const none = firstReplyPitch(noSiteEv);
  ok(none.lines.length === 2 && none.question === HOOK_VOICE_NOTE_Q && none.closer === 'voice_note' && none.structure === 'pitch_no_site' && !/website|agency/i.test(none.lines.join(' ') + none.question), 'no website: the short shape, never "website", never the agency question');
  for (const state of ['clean', 'not_checked', 'unreadable'] as const) {
    const c = firstReplyPitch({ ...ev, site: { state, issues: [] } });
    ok(c.lines.length === 2 && !/•|had a look|website|couldn'?t find/i.test(c.lines.join(' ')) && c.structure === 'pitch_plain', `${state}: the no-website shape, no bullets, never a claim the site is missing`);
  }
  const above = firstReplyPitch({ ...issuesEv, named: { named: 3, valid: 6 } });
  ok(!/instead|not you|3 of 6|gap in the rest/.test(above.lines.slice(1, 3).join(' ')) && above.lines[2].startsWith(hookSiteLead(4)) && above.question === HOOK_VOICE_NOTE_Q, 'more than a third, no missed search: the same shape, no "not you"');
  {
    const softEv: MoveEvidence = { ...issuesEv, named: { named: 3, valid: 6 } };
    const softCtx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'Yes it is', thread: [], plan: pm([opener, { from: 'them', text: 'Yes it is' }], { evidence: softEv }), evidence: softEv };
    const sw = checkAiReply(fallbackAiReply(softCtx), softCtx);
    ok(sw.length === 0, `the soft version passes the checker${sw.length ? ' — ' + sw.join(' | ') : ''}`);
    ok(checkAiReply('AI is recommending your competitors instead.', softCtx).some((x) => /more than a third/.test(x)), 'the soft version saying "AI is recommending your competitors instead" → still a warning');
  }
  /* ⛔ The hook always opens "Hi mate," (Paul, 2026-10-27), even when the site states an owner. */
  ok(firstReplyPitch({ ...issuesEv, ownerName: 'Kylie' }).lines[0] === 'Hi mate,' && p1.lines[0] === 'Hi mate,', 'always "Hi mate,", a stated owner included');
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'Yes it is', thread: [], plan: pm([opener, { from: 'them', text: 'Yes it is' }], { evidence: { ...issuesEv, ownerName: 'Kylie' } }), evidence: { ...issuesEv, ownerName: 'Kylie' } };
  const d = fallbackAiReply(ctx);
  const warn = checkAiReply(d, ctx);
  ok(d.startsWith('Hi mate,\n\nI asked AI') && qOutsideQuotes(d) === 1 && warn.length === 0, `the hook draft: greeting, one question, the bullet list, no checker warning${warn.length ? ' — ' + warn.join(' | ') : ''}`);
  ok(ctx.plan.structure === 'pitch_list', 'the plan records which structure was sent (why.structure)');
  ok(checkAiReply(d + '\n\nWould you rather those customers came to you?', ctx).some((x) => /more than one question/.test(x)), 'a second question → the checker still warns');
  const short = pm([{ from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' }, { from: 'them', text: 'Yes it is. How can we help' }], { evidence: issuesEv });
  ok(short.move === 'first_reply_pitch', 'initial_contact_short with no stored text is still the opener (the KSM miss)');
  /* The hook now ends on the voice-note offer, so a yes is a yes to the voice note. */
  const pitchMsg: MoveThreadMsg = { from: 'us', text: d, templateName: null };
  const yes = pm([opener, { from: 'them', text: 'Yes it is' }, pitchMsg, { from: 'them', text: 'Yes go on' }], { evidence: issuesEv });
  ok(yes.intent === 'voice_yes', `"yes go on" to the hook → the voice-note yes (got ${yes.intent ?? yes.move})`);
  const no = pm([opener, { from: 'them', text: 'Yes it is' }, pitchMsg, { from: 'them', text: 'no thanks' }], { evidence: issuesEv });
  ok(no.needsYou?.reason === 'not_interested', 'a clear no to the hook → Needs you (not interested), no follow-up');
  const noSitePitch: MoveThreadMsg = { from: 'us', text: fallbackAiReply({ ...ctx, evidence: noSiteEv, plan: pm([opener, { from: 'them', text: 'Yes' }], { evidence: noSiteEv }) }), templateName: null };
  const yesNoSite = pm([opener, { from: 'them', text: 'Yes' }, noSitePitch, { from: 'them', text: 'yeah sure' }], { evidence: noSiteEv });
  ok(yesNoSite.intent === 'voice_yes', `no website, "yeah sure" → the voice-note yes (got ${yesNoSite.intent ?? yesNoSite.move})`);
  /* A pitch already SENT in the old wording still gets its old next step. */
  const oldPitch: MoveThreadMsg = { from: 'us', text: 'I asked Gemini for a plumber in Rugby and it mentioned Rival A Plumbing.\n\nAnyone asking AI that question gets pointed to them instead of you.\nWould you rather those customers came to you?', templateName: null };
  const next = pm([opener, { from: 'them', text: 'Yes it is' }, oldPitch, { from: 'them', text: 'Yes of course' }], { evidence: issuesEv });
  ok(next.move === 'pitch_next' && next.fixedText === PITCH_AGENCY_Q, 'a reply to an OLD (already sent) pitch → the agency question, as before');
  const oldAgency: MoveThreadMsg = { from: 'us', text: 'Hi mate,\n\nI asked AI for a plumber in Rugby.\n\nAre you with an agency, or do you manage the website yourself?', templateName: null };
  ok(pm([opener, { from: 'them', text: 'Yes it is' }, oldAgency, { from: 'them', text: 'I do it myself' }], { evidence: issuesEv }).intent === 'self_managed', 'an old hook that asked the agency question still gets its answer');
}

console.log('6b. the worst result leads (Paul, 2026-10-20)');
{
  const t = (cells: Array<[string, string, boolean | null, string[]]>) => {
    const qs = [...new Set(cells.map((c) => c[0]))];
    return qs.map((question) => ({ question, perEngine: cells.filter((c) => c[0] === question).map(([, engine, named, names]) => ({ engine, label: engine, named, names })) }));
  };
  const chatWorst = worstMiss({ tested: t([['q1', 'chatgpt', false, ['A', 'B', 'C']], ['q1', 'gemini', false, ['D']], ['q2', 'chatgpt', true, []], ['q2', 'gemini', false, ['E', 'F']]]), gap: { question: 'q1', engine: 'gemini' } });
  ok(chatWorst?.engine === 'chatgpt' && chatWorst.question === 'q1' && chatWorst.names.join() === 'A,B,C', 'the not-named answer with the most names wins, with its own question and names (ChatGPT here)');
  const neverNamed = worstMiss({ tested: t([['q1', 'chatgpt', true, ['A', 'B', 'C', 'D']], ['q1', 'gemini', false, ['E']]]), gap: null });
  ok(neverNamed?.engine === 'gemini' && neverNamed.names.join() === 'E', 'an answer that NAMED them is never picked, however many names it has');
  const tie = worstMiss({ tested: t([['q1', 'chatgpt', false, ['A', 'B']], ['q2', 'gemini', false, ['C', 'D']]]), gap: null });
  ok(tie?.engine === 'gemini' && tie.question === 'q2', 'a tie → Gemini before ChatGPT');
  const tieGap = worstMiss({ tested: t([['q1', 'gemini', false, ['A', 'B']], ['q2', 'gemini', false, ['C', 'D']]]), gap: { question: 'q2', engine: 'gemini' } });
  ok(tieGap?.question === 'q2', "a tie → the report's own hook gap first");
  const tieQ = worstMiss({ tested: t([['q1', 'gemini', false, ['A', 'B']], ['q2', 'gemini', false, ['C', 'D']]]), gap: null });
  ok(tieQ?.question === 'q1', 'then the earlier question (deterministic)');
  ok(worstMiss({ tested: t([['q1', 'chatgpt', true, []], ['q1', 'gemini', null, []]]), gap: null }) === null && worstMiss(null) === null, 'nothing missed (or no answer) → none');
  ok(worstMiss({ tested: [{ question: 'q1', perEngine: [{ engine: 'ai_overview', named: false, names: ['A', 'B', 'C', 'D'] }, { engine: 'gemini', named: false, names: ['E'] }] }], gap: null })?.engine === 'gemini', "Google's AI Overview is never the engine we say we asked");
  const AR = readFileSync(new URL('../supabase/functions/_shared/audit-reply.ts', import.meta.url), 'utf8');
  ok(/worstMiss\(\{ tested: data\?\.hook\?\.tested \?\? \[\], gap: hookGap/.test(AR) && /usableRivals\(excludeSelfRivals\(worst\.names, business, nameMatches\)\)/.test(AR), "audit-reply reads the report's cleaned per-answer names, self excluded");
  const FN = readFileSync(new URL('../supabase/functions/ai-reply-drafts/index.ts', import.meta.url), 'utf8');
  ok(/worst\?\.engine \?\? audit\?\.engine/.test(FN) && /draftNames\(worst \? worst\.rivals/.test(FN) && /missed: worst \?/.test(FN), 'the drafter uses the worst answer for the engine, the names and the question');
  ok(/ownerName: \(found\.check\.summary\?\.owner\?\.name \?\? ""\)\.trim\(\)\.split\(\/\\s\+\/\)\[0\] \|\| null/.test(FN), 'the greeting name comes only from the crawl\'s stated owner, first name only');
}

console.log('7. the confidence line: only where Paul said');
{
  const has = (p: { points: string[]; confidence?: boolean }) => p.confidence === true && p.points.join(' ').includes(CONFIDENCE_LINE);
  ok(CONFIDENCE_LINE.toLowerCase().includes(GUARANTEE_LINE.toLowerCase()) && !/100|if i fail/i.test(CONFIDENCE_LINE), 'the line quotes the sheet\'s guarantee verbatim; never "100%" or "if I fail"');
  const priceLine = pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'how much is it?' }]);
  ok(priceLine.confidence === true && (priceLine.guide ?? '').includes("backed by a guarantee: we improve ai visibility or you get your money back."), 'a price question → the confidence line inside the price line');
  ok(has(pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'does it actually work?' }])), '"does it work" → the confidence line');
  ok(pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: "what's the catch" }]).intent === 'catch', '"what\'s the catch" → the catch line (the £99 back)');
  ok(has(pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'is there a guarantee' }])), 'the guarantee → the confidence line (said once)');
  ok(pm([opener, { from: 'them', text: 'who is this?' }]).move === 'first_reply_pitch', '"who is this?" as the FIRST reply → the hook (Paul, 2026-10-26)');
  ok(pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'who is this?' }]).intent === 'who_are_you', '"who is this?" after the hook → "I\'m Paul, I run Findable…"');
  for (const x of ['Yes', 'yeah go on', 'ok', 'hmm', 'Dom here']) ok(!pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: x }]).points.join(' ').includes(CONFIDENCE_LINE), `never the money-back line unasked ("${x}")`);
  ok(!pm([opener, { from: 'them', text: 'Yes it is' }]).confidence, 'never in the first pitch');
  const g = pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'is there a guarantee' }]).points.join(' ');
  ok(g.includes("If we haven't improved your AI visibility at the 4-week re-check, you get your £99 back.") && !/hasn't gone up/.test(g), 'the guarantee reply: "If we haven\'t improved your AI visibility at the 4-week re-check, you get your £99 back."');
}
console.log('8. the bot answer: Paul\'s one line, never a denial (the playbook, 2026-10-20)');
{
  const ask = [opener, { from: 'them' as const, text: 'Yes' }, hook, { from: 'them' as const, text: 'is this a bot?' }];
  const on = pm(ask, { evidence: { ...ev, aiAutoReplies: true } });
  const off = pm(ask, { evidence: { ...ev, aiAutoReplies: false } });
  ok(on.guide === BOT_ANSWER && off.guide === BOT_ANSWER && /I use AI to help write and check my messages/.test(BOT_ANSWER) && !/every one myself/.test(BOT_ANSWER), 'one answer whatever the switch: AI helps write and check, never "every one myself"');
  const ctxOn: AiReplyContext = { businessName: ev.businessName, latestInbound: 'is this a bot?', thread: [], plan: on, evidence: { ...ev, aiAutoReplies: true } };
  const fb = fallbackAiReply(ctxOn);
  ok(fb.startsWith('I use ai to help write') && checkAiReply(fb, ctxOn).length === 0, `the rule-built fallback is the line, and passes the checker${checkAiReply(fb, ctxOn).length ? ' — ' + checkAiReply(fb, ctxOn).join(' | ') : ''}`);
  ok(checkAiReply("It's Paul from Findable. I use AI to help write some messages, but I read and send every one myself.", ctxOn).some((x) => /auto-replies are switched on/.test(x)), 'switch ON and a draft saying "I send every one myself" → still a warning');
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'x', thread: [], plan: pm([opener, { from: 'them', text: 'Yes' }, hook, { from: 'them', text: 'how long does it take?' }]), evidence: ev };
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
  const LEAD = 'I asked googleAI "Who is the best driving instructor for beginners in Halstead?" and it named Driving 4CE Driving School, Reliant Driver Training and One Direction Driving School, not you.';
  const p = pm([{ from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' }, { from: 'them', text: 'Yes' }], { evidence: nola });
  ok(p.move === 'first_reply_pitch' && p.closer === 'voice_note' && (p.fixedText ?? '').endsWith(HOOK_VOICE_NOTE_Q), '1 of 3 (Google AI counted) → the hook, ending on the voice-note question');
  ok((p.fixedText ?? '').startsWith(`Hi mate,\n\n${LEAD}`), 'line 1 (after "Hi mate,") is the missed search: the engine, the question and that answer\'s three names');
  ok(!/named you in|gap in the rest|\d+ of \d+/.test(p.fixedText ?? ''), 'never "named you in X of Y" or "a gap in the rest"');
  const ctx: AiReplyContext = { businessName: nola.businessName, latestInbound: 'Yes', thread: [], plan: p, evidence: nola };
  const w = checkAiReply(fallbackAiReply(ctx), ctx);
  ok(w.length === 0, `Nola's pitch draft passes the checker${w.length ? ' — ' + w.join(' | ') : ''}`);
  const half = pm([{ from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' }, { from: 'them', text: 'Yes' }], { evidence: { ...nola, named: { named: 1, valid: 2 } } });
  const hw = checkAiReply(half.fixedText ?? '', { ...ctx, plan: half, evidence: { ...nola, named: { named: 1, valid: 2 } } });
  ok(/^Hi mate,\n\nI asked googleAI "Who is the best driving instructor for beginners in Halstead\?" and it named Driving 4CE.*, not you\./.test(half.fixedText ?? '') && !/named you in|gap in the rest|instead/.test(half.fixedText ?? '') && hw.length === 0, `more than a third (1 of 2) → "not you" is still true of the missed answer; no "X of Y", "gap" or "instead"; no warning${hw.length ? ' — ' + hw.join(' | ') : ''}`);
  ok(checkAiReply("When I asked Gemini for a driving instructor in Halstead it named you in 1 of 2 answers, so there's a gap in the rest.", ctx).some((x) => /X of Y/.test(x)), 'a draft saying "named you in 1 of 2 answers … gap in the rest" → warning');
  ok(firstReplyPitch({ ...nola, engineWords: 'chatgpt' }).lines[1].startsWith('I asked AI "Who is the best driving instructor for beginners in Halstead?" and it named Driving 4CE'), 'the worst answer was Gemini but the conversation already named ChatGPT → "AI": never two tools, never an engine that named them');
  ok(/^I asked googleAI for driving instructors in Halstead and/.test(firstReplyPitch({ ...nola, missed: { engine: 'gemini', question: 'Driving instructors in Halstead UK' } }).lines[1]), 'a search phrase (not a question) follows "for", the trade lower case, no "UK"');
}

console.log('9b. the site line: hedged, and a list that reads in parallel (Paul, 2026-10-20)');
{
  const t = (id: string, title = '') => plainIssueTitle({ id, title, severity: 'medium', count: 1 } as unknown as Parameters<typeof plainIssueTitle>[0]);
  /* 2026-10-26: OUR check being refused is couldn't check, never an issue line; robots.txt's own block is said plainly. */
  ok(t('robots_blocks_ai_search') === 'Your site tells an AI or search tool not to read it' && !/turned away|our check/i.test(t('robots_blocks_ai_search')), 'a robots.txt block is said plainly: never "turned away", never about our check');
  ok(t('name_unclear', 'Business name not found on the homepage') === 'Your business name is not on your homepage' && t('town_missing', 'Homepage does not mention Halstead') === 'Your homepage does not mention Halstead', 'noun-phrase titles become whole sentences');
  /* The pitch's own words (pitchIssueWords.ts, Paul 2026-10-23): keyed by id, plain, a town keeps its capital, jargon left out. */
  const iss = (id: string, title = '', saw = '') => ({ id, title, saw, severity: 'medium', count: 1, pages: [], meaning: '' });
  const ven = pitchIssueLines([iss('missing_description', 'Missing meta description'), iss('vs_town_swapped_pages', 'Area pages are the same text'),
    iss('name_unclear', 'Business name not found on the homepage', 'We could not find “Ven Language Services” on the homepage (title: “Ven Languages | Muswell Hill”).'),
    iss('ct_schema_mismatch', 'The business details in your page code don’t match the page'), iss('location_unclear', 'Sunbury VIC is not mentioned on the site', 'Sunbury VIC does not appear anywhere in the text of any of the 6 pages read (read in full).')]);
  ok(ven.join(' | ') === "Lots of your pages are the same text with only the town swapped | Your site doesn't use the name on your Google listing (it says Ven Languages) | Your site doesn't mention Sunbury VIC",
    `the pitch's issue lines: plain, the site's own name quoted, the page-code one left out, the town capitalised (got ${ven.join(' | ')})`);
  ok(pitchIssueLines([iss('vs_address_not_on_key_pages')], [iss('ct_no_people')])[0] === "There's no address on your homepage, and no named owner", 'no address + no named owner (a minor finding) → one line');
  ok(pitchIssueLines([iss('ct_placeholder_content', 'Unfinished placeholder blocks', 'A page reads “Welcome, !”')])[0] === 'A line on your site reads "Welcome, !" where a name should be', 'an empty greeting the check quoted is said as it is');
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
  ok((p.fixedText ?? '').startsWith('Hi mate,\n\nI asked googleAI for best language schools in London and it named Rival A School and Rival B School, not you.'), 'the pitch leads with the missed search');
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
