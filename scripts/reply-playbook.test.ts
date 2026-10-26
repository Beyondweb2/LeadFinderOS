/* THE REPLY PLAYBOOK (Paul, 2026-10-20) — src/lib/replyPlaybook.ts + replyMove.ts pickMove. One scripted conversation per
   intent: code picks the intent, the rule-built draft (the playbook line) passes the checker, one question at most, the
   follow-up style, no money-back line unasked. Prints one preview draft per intent (PREVIEW lines). Pure: no model, no DB. */
import { readFileSync } from 'node:fs';
import { pickMove, firstReplyPitch, insertSiteLine, pitchText, PITCH_SPECIALISE_LINE, PITCH_NO_SITE_LINE, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { PLAYBOOK, NEW_INTENTS, readEndDate, nameFromReply, nearSameName, lowerBrands, startsWithBrand, type PlaybookIntent } from '../src/lib/replyPlaybook.ts';
import { checkAiReply, fallbackAiReply, buildAiReplyPrompt, AI_REPLY_SYSTEM_PROMPT, AI_BRAND, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { CONFIDENCE_LINE } from '../src/lib/offerFactSheet.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const PREVIEW = process.argv.includes('--preview');

const ev: MoveEvidence = { businessName: 'ZZ Fixture Plumbing 90', trade: 'plumbers', town: 'Rugby', engineWords: 'gemini', named: { named: 0, valid: 6 },
  competitors: ['Rival A Plumbing', 'Rival B Plumbing', 'Rival C Plumbing'], missed: { engine: 'gemini', question: 'who is the best plumber in Rugby UK' },
  hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true,
  site: { state: 'issues', issues: ['Some pages have no main heading', 'There is no phone number on the site'] } };
const noSiteEv: MoveEvidence = { ...ev, hasWebsite: false, site: { state: 'no_website', issues: [] } };
/* The lead after they sent the site we missed and it was checked (Paul, 2026-10-23). */
const sharedEv: MoveEvidence = { ...ev, websiteUrl: 'https://www.zzfixtureplumbing.co.uk/', site: { state: 'issues', issues: ['x', 'y'], pitch: ['Your homepage doesn\'t mention Rugby', "There's no phone number on your site"] } };
const opener: MoveThreadMsg = { from: 'us', text: 'Hi, is this ZZ Fixture Plumbing 90?', templateName: 'initial_contact' };
const pitchMsg: MoveThreadMsg = { from: 'us', text: [...firstReplyPitch(ev).lines, firstReplyPitch(ev).question].join('\n\n') };
const NOW = Date.parse('2026-10-20T10:00:00Z');
const said = (...msgs: Array<string | MoveThreadMsg>): MoveThreadMsg[] => msgs.map((m) => (typeof m === 'string' ? { from: 'them' as const, text: m } : m));
const us = (text: string): MoveThreadMsg => ({ from: 'us', text });
const after = (...rest: Array<string | MoveThreadMsg>) => [opener, ...said('Yes it is'), pitchMsg, ...said(...rest)];
const pm = (thread: MoveThreadMsg[], evidence: MoveEvidence = ev) => pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence, nowMs: NOW });
const draftOf = (thread: MoveThreadMsg[], evidence: MoveEvidence = ev) => {
  const plan = pm(thread, evidence);
  const latest = [...thread].reverse().find((m) => m.from === 'them')?.text ?? '';
  const ctx: AiReplyContext = { businessName: evidence.businessName, latestInbound: latest, thread: thread.map((m) => ({ from: m.from, text: m.text })), plan, evidence };
  const text = plan.noDraft || plan.stop ? null : fallbackAiReply(ctx);
  return { plan, text, warnings: text ? checkAiReply(text, ctx) : [] };
};
const qCount = (s: string) => (s.replace(/"[^"\n]*"/g, '').match(/\?/g) ?? []).length;

/* One scripted conversation per intent. */
const CASES: Array<{ intent: PlaybookIntent; thread: MoveThreadMsg[]; evidence?: MoveEvidence; label: string }> = [
  /* We never said we found no website: a link they send is the plain "thanks, I'll take a look". */
  { intent: 'website_given', label: 'they send their website', thread: after('our new one is www.zzfixtureplumbing2.co.uk') },
  /* We said we found no website, they sent one and the check has run on it: the site-shared reply (Paul, 2026-10-23). */
  { intent: 'site_shared', label: 'they send the website we missed (checked)', thread: [opener, ...said('Yes'), us(pitchText(firstReplyPitch(noSiteEv))), ...said('yes its www.zzfixtureplumbing.co.uk')], evidence: sharedEv },
  { intent: 'how_to_get_named', label: '"how can I get up on the AI search?"', thread: after('I manage it myself, how can I get up on the ai search?') },
  { intent: 'no_website', label: '"no, haven\'t got one"', thread: [opener, ...said('Yes'), us(firstReplyPitch(noSiteEv).lines.concat(firstReplyPitch(noSiteEv).question).join('\n\n')), ...said('No not got one')], evidence: noSiteEv },
  { intent: 'facebook_only', label: '"just facebook"', thread: after('we just have facebook') },
  { intent: 'agency', label: '"an agency does it"', thread: after('An agency does it for us') },
  { intent: 'in_contract', label: '"tied in until March"', thread: after('agency', us(PLAYBOOK.agency.line), 'Yeah tied in until March') },
  { intent: 'tied_no_date', label: '"yes, in a contract"', thread: after('agency', us(PLAYBOOK.agency.line), 'yes in a contract with them') },
  { intent: 'free_to_leave', label: '"no contract"', thread: after('agency', us(PLAYBOOK.agency.line), 'no contract, its rolling') },
  { intent: 'self_managed', label: '"I do it myself"', thread: after('I do it myself') },
  { intent: 'friend_built', label: '"my nephew built it"', thread: after('my nephew built it') },
  { intent: 'not_sure_who', label: '"not sure"', thread: after('not sure to be honest') },
  { intent: 'voice_yes', label: '"yes send a voice note"', thread: after('I do it myself', us(PLAYBOOK.self_managed.line), 'voice note please') },
  { intent: 'call_yes', label: '"call me"', thread: after('I do it myself', us(PLAYBOOK.self_managed.line), 'just call me') },
  { intent: 'interested', label: '"tell me more"', thread: after('agency', us(PLAYBOOK.agency.line), 'sounds interesting, tell me more') },
  { intent: 'go_on', label: '"go on then"', thread: [opener, ...said('Yes'), us('Thanks for getting back to me.'), ...said('go on then')] },
  { intent: 'what_we_do', label: '"what do you do?"', thread: after('what do you do exactly?') },
  { intent: 'how_much', label: '"how much?"', thread: after('how much is it?') },
  { intent: 'catch', label: '"what\'s the catch?"', thread: after("what's the catch?") },
  { intent: 'how_long', label: '"how long does it take?"', thread: after('how long does it take?') },
  { intent: 'who_are_you', label: '"who are you?"', thread: after('sorry who are you?') },
  { intent: 'examples', label: '"any examples?"', thread: after('have you got any examples?') },
  { intent: 'definitely', label: '"will I definitely be recommended?"', thread: after('will I definitely be recommended?') },
  { intent: 'own_site', label: '"do I own the site?"', thread: after('do I own the website?') },
  { intent: 'not_now', label: '"not right now"', thread: after('not right now') },
  { intent: 'too_expensive', label: '"too expensive"', thread: after('sounds too expensive for me') },
  { intent: 'think_about_it', label: '"I\'ll think about it"', thread: after("I'll think about it") },
  { intent: 'dont_need', label: '"don\'t need more customers"', thread: after("I don't need more customers, plenty of work") },
  { intent: 'does_ai_matter', label: '"nobody uses ai"', thread: after('nobody uses ai to find a plumber') },
  { intent: 'is_bot', label: '"is this a bot?"', thread: after('is this a bot?') },
  { intent: 'privacy', label: '"how did you get my number?"', thread: after('how did you get my number?') },
  { intent: 'send_email', label: '"send me an email"', thread: after('can you send me an email') },
  { intent: 'not_owner', label: '"I\'m not the owner"', thread: [opener, ...said("I'm not the owner, I just work here")] },
  { intent: 'busy', label: '"busy, call later"', thread: after("I'm busy at the moment, call me later") },
  { intent: 'number_sent', label: 'they send a number', thread: after('07700 900123') },
  { intent: 'which_tool', label: '"which ai did you use?"', thread: after('which ai did you use?') },
];

console.log('1. every intent: picked by code, a draft that passes the checker, one question at most');
const previews: string[] = [];
for (const c of CASES) {
  const d = draftOf(c.thread, c.evidence);
  ok(d.plan.intent === c.intent, `${c.intent}: ${c.label} → ${d.plan.intent ?? d.plan.move}`);
  ok(!!d.text && d.warnings.length === 0, `${c.intent}: the draft passes the checker${d.warnings.length ? ' — ' + d.warnings.join(' | ') : ''}`);
  ok(!!d.text && qCount(d.text) <= 1, `${c.intent}: at most one question`);
  /* site_shared and how_to_get_named are Paul's code-built words with "AI" in capitals (approved sheet, 2026-10-23). */
  if (!['site_shared', 'how_to_get_named'].includes(c.intent)) ok(!!d.text && !/\b(ChatGPT|Gemini|Google AI|AI)\b/.test(d.text) && !startsWithBrand(d.text), `${c.intent}: chatgpt / gemini / ai in lower case, never starting a sentence`);
  else ok(!!d.text && !AI_BRAND.test(d.text), `${c.intent}: names no AI tool`);
  if (!['how_much', 'catch'].includes(c.intent)) ok(!(d.text ?? '').includes('backed by a guarantee'), `${c.intent}: no money-back confidence line`);
  previews.push(`PREVIEW ${c.intent} | them: "${[...c.thread].reverse().find((m) => m.from === 'them')?.text}" | draft: "${(d.text ?? '').replace(/\n+/g, ' / ')}"`);
}
/* The reply recon's 18 have their own cases in scripts/reply-new-intents.test.ts. */
ok(new Set(CASES.map((c) => c.intent)).size === Object.keys(PLAYBOOK).filter((k) => !NEW_INTENTS.includes(k as PlaybookIntent)).length, 'a case for every playbook intent');

console.log('2. the first reply: the pitch, unless no / stop / angry, a wrong person or a direct question');
for (const x of ['Yes', "that's correct", 'Yes, how can I help?', 'Dom', 'hello?', 'Speaking', 'Yes please, interested', 'ok']) {
  const p = pm([opener, ...said(x)]);
  ok(p.move === 'first_reply_pitch' && !!p.fixedText && !p.allowPrice && !(p.fixedText ?? '').includes(CONFIDENCE_LINE), `first reply "${x}" → the pitch (no price, no money-back line)`);
}
ok((pm([opener, ...said('Yes this is Dom')]).fixedText ?? '').startsWith('Hi Dom,\n\nI asked AI "Who is the best plumber in Rugby?" and it mentioned Rival A Plumbing'), 'a name they give → "Hi Dom," then the worst search');
{
  const d = draftOf([opener, ...said('Dom here')]);
  ok(d.text?.startsWith('Hi Dom,') && d.warnings.length === 0, `the "Hi Dom," pitch passes the checker${d.warnings.length ? ' — ' + d.warnings.join(' | ') : ''}`);
}
ok((pm([opener, ...said('Yes it is')]).fixedText ?? '').startsWith('Hi mate,\n\nI asked AI'), 'no name given, none on the site → "Hi mate," (Paul, 2026-10-21)');
ok((pm([opener, ...said('Yes it is')], { ...ev, ownerName: 'Sarah Jones' }).fixedText ?? '').startsWith('Hi Sarah,\n\n'), 'an owner the site states → "Hi Sarah," (a name still wins)');
ok(nameFromReply('Yes this is Dom') === 'Dom' && nameFromReply('dom here') === 'Dom' && nameFromReply('Speaking') === null && nameFromReply('Yes it is') === null && nameFromReply('its me') === null && nameFromReply('Plumbing', 'ZZ Plumbing') === null, 'names are read only in clear forms; never "speaking", "me" or a business word');
ok(pm([opener, ...said('No thanks')]).noDraft === true && pm([opener, ...said('stop')]).stop, 'a no → Needs you, no draft; a stop → the stop');
ok(pm([opener, ...said('wrong number mate')]).move === 'close_politely' && !pm([opener, ...said('wrong number mate')]).noDraft, 'a wrong person → a short polite reply');
ok(pm([opener, ...said('how much do you charge?')]).move === 'first_reply_pitch' && pm([opener, ...said('who is this?')]).move === 'first_reply_pitch', 'a direct question on the first reply → the hook (Paul, 2026-10-26)');
ok(pm([opener, ...said("Yes, what's this about?")]).move === 'first_reply_pitch', '"what\'s this about?" → the pitch answers it');
/* "Do you do Instagram ads?" is ads_question since 2026-10-21; a logo is still not on the sheet. */
ok(pm([opener, ...said('Yes'), { from: 'us', text: 'Hi mate, I asked AI "x" and it mentioned A.' }, ...said('Can you do my logo as well?')]).noDraft === true, 'a question the playbook cannot answer (after the hook) → Needs you, no draft');
{
  const self = pitchText(firstReplyPitch({ ...ev, competitors: ['ZZ Fixture Plumbing 90 Ltd', 'Rival A Plumbing'] }));
  ok(!/ZZ Fixture Plumbing 90 Ltd/.test(self) && /Rival A Plumbing/.test(self), 'a rival with (nearly) their own name is never listed');
  ok(nearSameName('Smith Plumbing Ltd', 'Smith Plumbing') && nearSameName('Smiths Plumbing & Heating', 'Smith\'s Plumbing and Heating') && !nearSameName('Smith Plumbing', 'Jones Plumbing'), 'nearSameName: legal suffixes and spelling, never a different business');
}
function pitchText(p: { lines: string[]; question: string }) { return [...p.lines, p.question].join('\n\n'); }

console.log('3. the agency path: agency → contract → call / voice note; tied in is never pushed');
{
  const tied = pm(after('agency', us(PLAYBOOK.agency.line), 'Yeah tied in until March'));
  ok(tied.followUp?.endsOn === '2027-03-31' && tied.followUp.checkBackOn === '2027-03-17' && /Set the Next Action for 2027-03-17/.test(tied.note ?? ''), 'until March → ends 31 March, check back 17 March, noted for the person');
  const ask = pm(after('agency', us(PLAYBOOK.agency.line), 'yes in a contract'));
  const date = pm([...after('agency', us(PLAYBOOK.agency.line), 'yes in a contract'), us(PLAYBOOK.tied_no_date.line), ...said('another 6 months')]);
  ok(ask.intent === 'tied_no_date' && date.intent === 'in_contract' && date.followUp?.endsOn === '2027-04-20', 'no date → we ask it; "another 6 months" → noted');
  ok(pm(after('go on then')).intent === 'go_on' && /agency/.test(pm(after('go on then')).guide ?? ''), '"go on then" → the agency question');
  ok(/quick call/.test(pm(after('I do it myself', us(PLAYBOOK.self_managed.line), 'Hmm', us('Fair enough.'), 'ok go on')).guide ?? ''), '"go on" once we know who runs it → the call / voice note');
  ok(pm(after('my nephew built it', us(PLAYBOOK.friend_built.line), 'yeah happy to change')).intent === 'free_to_leave', 'happy to change → the call / voice note');
  ok(pm(after('my nephew built it', us(PLAYBOOK.friend_built.line), "I'll keep it with them")).noDraft === true, 'keep it with them → Needs you, no draft');
  ok(pm(after('not sure', us(PLAYBOOK.not_sure_who.line), 'yes about £40 a month')).intent === 'agency', 'pays someone monthly → the contract question');
  ok(!Object.values(PLAYBOOK).some((x) => /\b(rubbish|useless|rip[- ]?off|cowboys?|terrible|bad)\b/i.test(x.line)), 'never badmouths an agency');
  ok(readEndDate('until the 12th of March', NOW)?.endsOn === '2027-03-12' && readEndDate('end of the year', NOW)?.endsOn === '2026-12-31' && readEndDate('a while yet', NOW) === null, 'readEndDate: a day, the end of the year, nothing guessed');
}

console.log('4. no draft: stop, not interested, angry, off-topic, unmatched');
for (const [x, why] of [['stop', 'opt_out'], ['not interested', 'not_interested'], ['piss off', 'angry'], ['what football team do you support', 'question_not_on_sheet'], ['my van is blue', 'off_topic']] as const) {
  const p = pm(after(x));
  ok((p.stop || p.noDraft) && !draftOf(after(x)).text && p.needsYou?.reason === why, `"${x}" → no draft, Needs you (${why})`);
}

console.log('5. style');
ok(lowerBrands('I asked ChatGPT and Gemini. Google AI too. AI is big') === 'I asked chatgpt and gemini. google ai too. ai is big', 'lowerBrands');
ok(startsWithBrand('Fine. chatgpt named them') && !startsWithBrand('I asked chatgpt'), 'a sentence starting with a tool is caught');
{
  const thread = after('I do it myself', us('Good, that makes changes easy. Quick call?'), 'hmm maybe');
  const p = pm(thread);
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'x', thread: thread.map((m) => ({ from: m.from, text: m.text })), plan: { ...p, noDraft: false }, evidence: ev };
  ok(checkAiReply('Good, I can send a voice note instead?', ctx).some((w) => /Opens with "good" again/.test(w)), 'the same opener as our last message → warning');
  ok(checkAiReply('Gemini named three others.', { ...ctx, plan: pm(after('how long does it take?')) }).some((w) => /Starts a sentence/.test(w)), 'a follow-up starting a sentence with a tool → warning');
  ok(checkAiReply(insertSiteLine(PLAYBOOK.examples.line), { ...ctx, plan: pm(after('any examples?')) }).length === 0
    && checkAiReply('Our clients saw 40% more calls.', ctx).some((w) => /past results/.test(w)), 'the one results line is allowed; any other results claim still warns');
}

console.log('5b. no AI brand in a prospect-facing draft (Paul, 2026-10-21)');
for (const c of CASES) {
  const d = draftOf(c.thread, c.evidence);
  if (c.intent === 'which_tool') continue;
  ok(!!d.text && !AI_BRAND.test(d.text), `${c.intent}: names no AI tool`);
}
for (const [label, e] of [['issues', ev], ['no website', noSiteEv], ['no audit', { ...ev, named: null }], ['soft', { ...ev, named: { named: 3, valid: 6 } }]] as const) {
  const t = pitchText(firstReplyPitch(e as MoveEvidence));
  ok(!AI_BRAND.test(t), `the pitch (${label}) names no AI tool`);
}
ok(PITCH_SPECIALISE_LINE === 'I specialise in getting local businesses to show up in those results, so the customers go to you instead.', 'the confidence line is Paul\'s 2026-10-21 wording');
ok(!AI_BRAND.test(PITCH_NO_SITE_LINE) && /^Most local work comes from recommendations/.test(PITCH_NO_SITE_LINE) && /couldn't find one for you/.test(PITCH_NO_SITE_LINE), 'the no-website line names no tool (Paul\'s words, 2026-10-26)');
{
  const t = pitchText(firstReplyPitch(ev));
  ok(t.includes('I asked AI "Who is the best plumber in Rugby?" and it mentioned Rival A Plumbing, Rival B Plumbing and Rival C Plumbing.'), 'first message: I asked AI "<question>" and it mentioned A, B and C');
  ok(!/recommended by AI|get recommended|guarantee|money back/i.test(t), 'the pitch promises no result and carries no guarantee');
}
{
  const w = draftOf(after('which ai did you use?'));
  ok(w.plan.intent === 'which_tool' && w.plan.brandsAllowed === true && /\bgemini\b/.test(w.text ?? '') && w.warnings.length === 0, `"which ai?" → the reply names the engine (the missed search's own), no warning${w.warnings.length ? ' — ' + w.warnings.join(' | ') : ''}`);
  for (const q of ['what tool was that?', 'was it chatgpt?', 'Which AI?', 'what app did you use']) ok(pm(after(q)).intent === 'which_tool', `"${q}" → which_tool`);
  ok(pm(after('what ai visibility?')).intent !== 'which_tool', '"what ai visibility" is not a which-tool question');
  const meas = draftOf(after('how do you measure it?'));
  ok(meas.plan.read === 'question:measurement' && !AI_BRAND.test(meas.text ?? ''), 'the measurement answer says "the main AI tools", no brand (they did not ask which)');
}
{
  const plan = pm(after('I do it myself'));
  const ctx: AiReplyContext = { businessName: ev.businessName, latestInbound: 'I do it myself', thread: [], plan, evidence: ev };
  ok(checkAiReply('Good, I asked gemini again and it still named others. Quick call?', ctx).some((x) => /Names an AI tool/.test(x)), 'the checker warns on a brand name in a draft');
  ok(checkAiReply(pitchText(firstReplyPitch(ev)).replace('I asked AI', 'I asked Gemini'), { ...ctx, plan: pm([opener, ...said('Yes')]) }).some((x) => /Names an AI tool/.test(x)), '…in the pitch too');
  ok(/never name one/i.test(buildAiReplyPrompt(ctx)) && /Never name an AI tool/.test(AI_REPLY_SYSTEM_PROMPT), 'the model is told never to name a tool');
  const wctx: AiReplyContext = { ...ctx, plan: pm(after('which ai did you use?')) };
  ok(!/never name one/i.test(buildAiReplyPrompt(wctx)) && !checkAiReply('That one was gemini. I check the same questions on chatgpt and gemini. Want a voice note showing what it said?', wctx).some((x) => /Names an AI tool/.test(x)), 'they asked which tool → no brand warning');
}
if (process.argv.includes('--preview-pitch')) {
  const thread = (x: string) => [opener, ...said(x)];
  const d = (t: MoveThreadMsg[], e: MoveEvidence = ev) => fallbackAiReply({ businessName: e.businessName, latestInbound: '', thread: t.map((m) => ({ from: m.from, text: m.text })), plan: pm(t, e), evidence: e });
  console.log('\n=== PREVIEW no name, first reply "Yes it is" ===\n' + d(thread('Yes it is')));
  console.log('\n=== PREVIEW named, first reply "Yes this is Sarah" ===\n' + d(thread('Yes this is Sarah')));
  console.log('\n=== PREVIEW no website, first reply "Yes" ===\n' + d(thread('Yes'), noSiteEv));
  console.log('\n=== PREVIEW "which tool did you use?" after the pitch ===\n' + d(after('which tool did you use?')) + '\n');
}

console.log('6. the function and the docs');
{
  const FN = readFileSync(new URL('../supabase/functions/ai-reply-drafts/index.ts', import.meta.url), 'utf8');
  ok(/plan\.stop \|\| plan\.noDraft/.test(FN) && /ctx\.plan\.stop \|\| ctx\.plan\.noDraft/.test(FN), 'Draft reply and Regenerate write no draft for a no-draft intent');
  ok(/why\?\.win === "call_time_agreed"/.test(FN), 'a call time agreed resets the loop guard (the win)');
  ok(!/next_action/.test(FN), '⛔ the function never writes a Next Action (human-set only)');
  const DOC = readFileSync(new URL('../docs/reply-playbook.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const missing = (Object.entries(PLAYBOOK) as Array<[string, { line: string }]>).filter(([, x]) => !DOC.includes(x.line));
  ok(!missing.length, `docs/reply-playbook.md quotes every playbook line${missing.length ? ' — missing: ' + missing.map((m) => m[0]).join(', ') : ''}`);
}

if (PREVIEW) console.log('\n' + previews.join('\n'));
console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
