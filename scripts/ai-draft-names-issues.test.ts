/* REPLY DRAFTS NAME THE RIVALS AND THE REAL SITE ISSUE (2026-10-11, Paul) — src/lib/draftEvidence.ts, read by
   BOTH drafters: fn ai-reply-drafts (aiReplyDraft.ts) and fn warm-lead-reply ("Draft reply", warmReply.ts).

   The case that started it — Safety First Electrical (Rotherham): the draft said "it named a few other businesses"
   and "found some things we could fix". The audit had recorded nine named rivals; the crawl had called the site
   strong. Cause: the warm prompt never passed the names (it assumed the hook had already gone) and nothing refused a
   vague fault claim. Pins: names present · names unreadable · issues found · no issues · crawl failed · strong site.
   Pure: nothing here sends, calls a model or reads the database. */
import { readFileSync } from 'node:fs';
import {
  draftNames, draftEngineWords, draftSearch, conversationEngine, engineNamedIn, carryOn, offerLine, saysGoogleAiForGemini,
  OFFER_LINE_BOTH, OFFER_LINE_AFTER_ISSUES, namesLine, vagueSiteClaim, wrongEngineWords, offersRoutes, issueMentioned,
  GENERIC_SITE_LINE, NO_SITE_LINE, DRAFT_MAX_NAMES,
} from '../src/lib/draftEvidence.ts';
import { buildAiReplyPrompt, checkAiReply, fallbackAiReply, AI_REPLY_SYSTEM_PROMPT, type AiReplyContext } from '../src/lib/aiReplyDraft.ts';
import { buildReplyContext, buildReplyPrompt, checkReply, fallbackReply, latestInbound, REPLY_SYSTEM_PROMPT, VAGUE_CLAIM_PROBLEM, type ThreadMessage } from '../src/lib/warmReply.ts';
import type { AuditContext } from '../src/lib/warmLeadResearch.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* The real Safety First Electrical draft, word for word. */
const SAFETY_FIRST_DRAFT = "hi mate, i asked google ai for an electrician in rotherham and it named a few other businesses. i had a look at why you weren't coming up more often and found some things we could fix. that's the sort of thing we can sort out on the site you've already got, or we can build you a new one that's properly set up for ai visibility and seo. are you currently with an agency or do you own/manage the website yourself?";
/* What its audit recorded on the hook search (Gemini), including one firm spelt two ways. */
const RECORDED = ['GF Electrical Contractors Ltd', 'NIC Electrical Solutions Ltd', 'GF electrical contractors ltd', 'Glasby Electrical Ltd', 'Plexus Electrical'];

console.log('0. the shared rules');
{
  const n = draftNames(RECORDED, 'Rotherham');
  ok(n.length === DRAFT_MAX_NAMES && n.length === 3, 'at most three names');
  ok(n.filter((x) => /^gf electrical/i.test(x)).length === 1, 'one firm spelt two ways counts once (the report\'s rule)');
  ok(n[0] === 'GF Electrical Contractors Ltd' && n[1] === 'NIC Electrical Solutions Ltd' && n[2] === 'Glasby Electrical Ltd', 'order and first spelling kept');
  ok(draftNames([], 'Rotherham').length === 0 && draftNames(null).length === 0, 'nothing readable → no names (never invented)');
  ok(draftEngineWords('gemini') === 'gemini' && draftEngineWords('Gemini') === 'gemini' && draftEngineWords('chatgpt') === 'chatgpt', 'engine words follow the call script: Gemini is "gemini" (2026-10-13; was "google ai")');
  ok(draftEngineWords(null) === 'ai' && draftEngineWords('ai_overview') === 'ai', 'unknown engine → "ai"');
  ok(draftSearch('Electricians', 'Rotherham UK') === 'electrician in Rotherham', 'the search is said as a person says it');
  ok(namesLine('gemini', 'electrician in Rotherham', ['A Ltd', 'B Ltd', 'C Ltd']) === 'i asked gemini for an electrician in Rotherham and it recommended A Ltd, B Ltd and C Ltd', 'names line, casual');
  ok(/a few other businesses$/.test(namesLine('ai', 'electrician in Rotherham', [])), 'names line with nothing readable stays generic');
  ok(vagueSiteClaim(SAFETY_FIRST_DRAFT), 'the Safety First "found some things we could fix" is a vague claim');
  ok(vagueSiteClaim('i spotted a few issues on your site') && !vagueSiteClaim('your contact page has no phone number on it'), '…and a specific one is not');
  ok(wrongEngineWords('i asked chatgpt for…', 'gemini') && !wrongEngineWords('i asked gemini for…', 'gemini') && wrongEngineWords('i asked chatgpt', 'ai') && !wrongEngineWords('i asked ai', 'ai'), 'the wrong AI tool is caught (unsure = "ai": naming one tool as the one asked is wrong too)');
  ok(offersRoutes(SAFETY_FIRST_DRAFT, true) && !offersRoutes('we can help with that', true), 'the offer: both routes');
  ok(!/\b(?:wrong|broken|missing|problem|issue|fault)\b/i.test(GENERIC_SITE_LINE + NO_SITE_LINE), 'the general lines claim no fault');
}

/* ─────────── 1. ai-reply-drafts (aiReplyDraft.ts) ─────────── */
console.log('1. ai-reply-drafts');
const base: AiReplyContext = {
  firstName: null, businessName: 'Safety First Electrical', latestInbound: 'Hi. Yes it is. How can I help?',
  thread: [{ from: 'us', text: '[initial_contact]' }, { from: 'them', text: 'Hi. Yes it is. How can I help?' }],
  search: { trade: 'Electricians', town: 'Rotherham' }, competitors: draftNames(RECORDED, 'Rotherham'), engineWords: 'gemini', hasWebsite: true,
  namedEverywhere: false, hookAlreadySent: false, findings: [], ownershipKnown: false,
};
const ISSUE = { title: 'Contact page has no phone number', said: 'Your contact page has no phone number on it, only a form.' };
const cases: Array<[string, AiReplyContext]> = [
  ['names present', base],
  ['names unreadable', { ...base, competitors: [] }],
  ['issues found', { ...base, findings: [ISSUE] }],
  ['no issues', { ...base, findings: [] }],
  ['crawl failed (no findings handed over)', { ...base, findings: [] }],
  ['strong site (no findings handed over)', { ...base, findings: [] }],
];
for (const [name, c] of cases) {
  const fb = fallbackAiReply(c);
  const probs = checkAiReply(fb, c);
  ok(probs.length === 0, `${name}: the rule-built draft passes every check${probs.length ? ' — ' + probs.join(' | ') : ''}`);
  ok(!vagueSiteClaim(fb), `${name}: never "found some things"`);
  if (c.competitors.length) ok(fb.includes('GF Electrical Contractors Ltd, NIC Electrical Solutions Ltd and Glasby Electrical Ltd'), `${name}: names the three rivals`);
  else ok(/it named a few other businesses/.test(fb) && !/Ltd/.test(fb), `${name}: no names readable → "a few other businesses", nothing invented`);
  if (c.findings.length) ok(issueMentioned(fb, c.findings[0]) && !fb.includes(GENERIC_SITE_LINE), `${name}: says the real issue, not the general line`);
  else ok(fb.includes(GENERIC_SITE_LINE), `${name}: the general line, no fault claimed`);
  ok(/i asked gemini for an electrician in Rotherham/.test(fb), `${name}: the engine wording is the audit's ("gemini")`);
}
{
  const p = buildAiReplyPrompt(base);
  ok(/AI NAMED INSTEAD \(name these, at most three, spelt exactly like this\): GF Electrical Contractors Ltd, NIC Electrical Solutions Ltd, Glasby Electrical Ltd/.test(p), 'the prompt carries the three names');
  ok(/AI TOOL: say it as "gemini"/.test(p), '…and the AI tool');
  ok(/GENERAL LINE/.test(p) && /OFFER:/.test(p), '…the general line when nothing was found, and the offer');
  ok(/no names could be read/.test(buildAiReplyPrompt({ ...base, competitors: [] })), 'unreadable names: the prompt says so, never a guess');
  ok(/WEBSITE ISSUES \(actually found by our crawl/.test(buildAiReplyPrompt({ ...base, findings: [ISSUE] })), 'issues found: listed as the crawl\'s own');
  ok(/Never say you "found some things"/.test(AI_REPLY_SYSTEM_PROMPT), 'the system prompt forbids the vague claim');
  const bad = checkAiReply(SAFETY_FIRST_DRAFT, base);
  ok(bad.some((x) => /without saying what/.test(x)), 'the Safety First draft is now flagged: vague site claim');
  ok(bad.some((x) => /Does not name who AI recommended/.test(x)), '…and: rivals not named');
  ok(checkAiReply(fallbackAiReply(base).replace('gemini', 'chatgpt'), base).some((x) => /different AI tool/.test(x)), 'a draft naming the wrong AI tool is flagged');
  ok(checkAiReply(fallbackAiReply({ ...base, findings: [ISSUE] }).replace(/i had a look[^\n]*/, 'i had a look at your website too'), { ...base, findings: [ISSUE] }).some((x) => /website issues found/.test(x)), 'issues found but not said → flagged');
}
{
  const FN = read('supabase/functions/ai-reply-drafts/index.ts');
  ok(/findings: found\.status === "findings" \? found\.findings\.slice\(0, 2\)/.test(FN), 'only a crawl that FOUND something hands over issues (failed / clean / strong → none), at most 2');
  ok(/engineWords: conversationEngine\(sentRows\.map\(/.test(FN) && /audit\?\.engine \?\? null\)\.words/.test(FN), 'the engine words: what our sent messages named, else the audit\'s hook engine');
  const dry = FN.slice(FN.indexOf('async function handleDryRun'), FN.indexOf('async function handleSettings'));
  ok(/actor\.role !== "admin"/.test(dry) && !/from\("ai_reply_drafts"\)|whatsapp_messages"\)\.insert|sendViaGraph/.test(dry), 'dry_run: admin only, writes no draft row, sends nothing');
}

/* ─────────── 2. "Draft reply" (warmReply.ts / warm-lead-reply) ─────────── */
console.log('2. Draft reply (warm-lead-reply)');
const NOW = Date.parse('2026-10-11T09:00:00Z');
const msg = (id: string, direction: 'inbound' | 'outbound', text: string, hoursAgo: number): ThreadMessage => ({ id, direction, text, at: new Date(NOW - hoursAgo * 3600_000).toISOString() });
const thread = [msg('o1', 'outbound', 'Hi, is this Safety First Electrical?', 3), msg('i1', 'inbound', 'Hi. Yes it is. How can I help?', 1)];
const audit: AuditContext = { auditId: 'a1', reportUrl: null, createdAt: null, trade: 'Electricians', town: 'Rotherham', competitors: draftNames(RECORDED, 'Rotherham'), engine: 'gemini', namedEverywhere: false, namedDatapoints: 1, totalDatapoints: 6, unavailableReason: null };
const wctx = (over: Partial<Parameters<typeof buildReplyContext>[0]> = {}) => buildReplyContext({
  businessName: 'Safety First Electrical', contactFirstName: null, trade: 'Electricians', town: 'Rotherham', website: 'http://www.safetyfirstelectrical.org.uk/',
  latest: latestInbound(thread)!, thread, research: null, audit, salesFacts: {}, reportUrl: null, hookTemplate: null, variant: 0, avoidText: null, crawlFindings: [], ...over,
});
const wcases: Array<[string, ReturnType<typeof wctx>]> = [
  ['names present', wctx()],
  ['names unreadable', wctx({ audit: { ...audit, competitors: [] } })],
  ['issues found', wctx({ crawlFindings: [ISSUE] })],
  ['no issues', wctx()],
  ['crawl failed', wctx({ crawlFindings: [] })],
  ['strong site', wctx({ crawlFindings: [] })],
];
for (const [name, c] of wcases) {
  const fb = fallbackReply(c)!;
  const chk = checkReply(fb, c);
  ok(chk.problems.length === 0, `${name}: the rule-built draft passes every check${chk.problems.length ? ' — ' + chk.problems.join(' | ') : ''}`);
  ok(!vagueSiteClaim(fb), `${name}: never "found some things"`);
  if (c.audit!.competitors.length) ok(fb.includes('GF Electrical Contractors Ltd, NIC Electrical Solutions Ltd and Glasby Electrical Ltd'), `${name}: names the three rivals`);
  else ok(/it named a few other businesses/.test(fb), `${name}: "a few other businesses", nothing invented`);
  if ((c.crawlFindings ?? []).length) ok(issueMentioned(fb, ISSUE) && !fb.includes(GENERIC_SITE_LINE), `${name}: the crawl's real issue`);
  else ok(fb.includes(GENERIC_SITE_LINE), `${name}: the general line`);
  ok(/i asked gemini for an electrician in Rotherham/.test(fb), `${name}: "gemini" (the audit's hook engine)`);
}
{
  const p = buildReplyPrompt(wctx());
  ok(/Paul has NOT told them this yet\. AI NAMED INSTEAD \(name these, at most three, spelt exactly like this\): GF Electrical Contractors Ltd/.test(p), 'before the hook, the prompt carries the names (the cause of the Safety First draft)');
  ok(/AI TOOL: say it as "gemini"/.test(p) && /STAGE: Paul has NOT sent them the AI check yet/.test(p), '…the AI tool and the stage');
  ok(/GENERAL LINE/.test(p), 'no research, no crawl issue → the general line');
  ok(/CRAWL FINDINGS/.test(buildReplyPrompt(wctx({ crawlFindings: [ISSUE] }))), 'no research but the crawl found something → the crawl\'s issue');
  const after = buildReplyPrompt(wctx({ hookTemplate: 'audit_followup' }));
  ok(!/AI NAMED INSTEAD/.test(after) && /do not list them again/.test(after), 'after the hook, the names are not repeated');
  ok(/say you "found some things"/.test(REPLY_SYSTEM_PROMPT), 'the system prompt forbids the vague claim');
  const bad = checkReply(SAFETY_FIRST_DRAFT, wctx());
  ok(bad.problems.includes(VAGUE_CLAIM_PROBLEM), 'the Safety First draft is now flagged: vague site claim');
  ok(bad.problems.some((x) => /does not name who AI recommended/.test(x)), '…and: rivals not named');
  ok(checkReply(fallbackReply(wctx())!.replace('gemini', 'chatgpt'), wctx()).problems.some((x) => /different AI tool/.test(x)), 'the wrong AI tool is flagged');
  const FN = read('supabase/functions/warm-lead-reply/index.ts');
  ok(/const crawlFindings = found\.status === "findings"/.test(FN) && /crawlFindings,\n\s+\}\);/.test(FN), 'warm-lead-reply hands over only a crawl that FOUND something');
  const SR = read('supabase/functions/_shared/site-research.ts');
  ok(/competitors: sameAudit && vars\.ok \? draftNames\(vars\.rivals/.test(SR) && /engine: sameAudit && vars\.ok \? vars\.hookEngine : null/.test(SR), 'the audit context de-duplicates the names and keeps the engine they came from');
}

/* ─────────── 3. one engine per conversation, "gemini", and the tidy (Paul, 2026-10-13) ─────────── */
console.log('3. one engine per conversation, "gemini", the tidy');
{
  // What a SENT message named.
  ok(engineNamedIn('Hi mate, I asked chatgpt for a plumber in Rugby. It came back with A, B and C') === 'chatgpt', 'a sent message naming ChatGPT → chatgpt');
  ok(engineNamedIn('i asked Google AI for a plumber in Rugby') === 'gemini' && engineNamedIn('i asked gemini for a plumber') === 'gemini', 'an old "Google AI" message and a "gemini" one are both Gemini');
  ok(engineNamedIn('the Google AI Overview showed other firms') === null, 'the AI Overview is not Gemini');
  ok(engineNamedIn('AI tools like ChatGPT and Gemini name a few firms') === null, 'a line naming both claims neither');
  ok(engineNamedIn('[template: audit_followup]', 'audit_followup') === 'chatgpt' && engineNamedIn('[initial_contact]', 'initial_contact') === null, 'no text on hand → the template\'s own approved claim (audit_followup says chatgpt)');

  // The rule.
  const sentChat = [{ text: 'Hi, is this Safety First?' }, { text: 'I asked chatgpt for an electrician in Rotherham. It came back with A, B and C' }];
  ok(conversationEngine(sentChat, 'gemini').words === 'chatgpt' && conversationEngine(sentChat, 'gemini').source === 'sent_message', 'hook sent saying chatgpt, names from Gemini → the follow-up says chatgpt (what they were told)');
  ok(conversationEngine([{ text: 'i asked gemini for an electrician' }], 'chatgpt').words === 'gemini', '…and the other way round');
  ok(conversationEngine([{ text: 'Hi, is this Safety First?' }], 'gemini').words === 'gemini' && conversationEngine([{ text: 'Hi' }], 'gemini').source === 'audit', 'sent messages named no tool → the engine the rival names came from');
  ok(conversationEngine([{ text: 'i asked chatgpt' }, { text: 'i asked google ai' }], 'gemini').words === 'ai', 'sent messages named different tools → "ai", never a mix');
  ok(conversationEngine([], null).words === 'ai' && conversationEngine([], 'ai_overview').source === 'unsure', 'no engine known → "ai"');

  // Both drafters use it.
  const chatThread = [msg('o1', 'outbound', 'I asked chatgpt for an electrician in Rotherham. It came back with GF Electrical Contractors Ltd', 5), msg('i1', 'inbound', 'Hi. Who are you?', 1)];
  const w = wctx({ thread: chatThread, latest: latestInbound(chatThread)!, hookTemplate: 'audit_followup' });
  ok(w.engineWords === 'chatgpt', 'Draft reply: the context takes the engine the sent hook named');
  ok(/AI TOOL: say it as "chatgpt"/.test(buildReplyPrompt(w)) && /i asked chatgpt/.test(fallbackReply(w)!), '…its prompt and its rule-built draft say chatgpt');
  ok(checkReply(fallbackReply(w)!.replace('chatgpt', 'gemini'), w).problems.some((x) => /different AI tool/.test(x)), '…and a draft switching to gemini is flagged');
  const u = wctx({ audit: { ...audit, engine: null } });
  ok(u.engineWords === 'ai' && /i asked ai for/.test(fallbackReply(u)!) && /say it as "ai"/.test(buildReplyPrompt(u)), 'unsure → the draft says "ai"');
  const a2 = { ...base, engineWords: 'chatgpt', hookAlreadySent: true };
  ok(/i asked chatgpt/.test(fallbackAiReply(a2)) && checkAiReply(fallbackAiReply(a2).replace('chatgpt', 'gemini'), a2).some((x) => /different AI tool/.test(x)), 'AI handles replies: the same rule, the same check');

  // "gemini", never "google ai" (the Overview keeps its name).
  ok(saysGoogleAiForGemini('i asked google ai for a plumber') && !saysGoogleAiForGemini('it showed in the google ai overview') && !saysGoogleAiForGemini('i asked gemini'), '"google ai" for Gemini is caught; the AI Overview is not');
  ok(checkAiReply(fallbackAiReply(base).replace('gemini', 'google ai'), base).some((x) => /say "gemini"/.test(x)), 'AI handles replies flags "google ai"');
  ok(checkReply(fallbackReply(wctx())!.replace('gemini', 'google ai'), wctx()).problems.some((x) => /say "gemini"/.test(x)), 'Draft reply flags "google ai"');
  ok(!/google ai(?! overview)/i.test(AI_REPLY_SYSTEM_PROMPT + REPLY_SYSTEM_PROMPT), 'neither drafter\'s system prompt teaches "google ai"');

  // The tidy: no "aI tools", and the offer joins on to the issues.
  ok(carryOn('AI tools may find it harder.') === 'AI tools may find it harder' && carryOn('Your contact page has no phone.') === 'your contact page has no phone' && carryOn("I'd fix it") === "I'd fix it" && carryOn('SEO titles repeat') === 'SEO titles repeat', 'carryOn: lower-cases a word, never an acronym or "I"');
  const AI_ISSUE = { title: 'AI crawlers blocked', said: 'AI tools like ChatGPT are blocked from reading the site by its robots file.' };
  const fbAi = fallbackAiReply({ ...base, findings: [AI_ISSUE] });
  ok(!/\baI\b/.test(fbAi) && /and AI tools like ChatGPT are blocked/.test(fbAi), 'AI handles replies: "AI tools", never "aI tools"');
  const fbWarm = fallbackReply(wctx({ crawlFindings: [AI_ISSUE] }))!;
  ok(!/\baI\b/.test(fbWarm), 'Draft reply: never "aI tools"');
  ok(!/\bdo that\b/.test(fbAi) && fbAi.includes(OFFER_LINE_AFTER_ISSUES), 'after real issues the offer joins on ("that\'s the sort of thing we fix…"), never "do that"');
  ok(!/\bdo that\b/.test(fallbackAiReply(base)) && fallbackAiReply(base).includes(GENERIC_SITE_LINE + '\n\n' + OFFER_LINE_BOTH), 'after the general line: "we can help with that…", which points at "what we help with"');
  ok(offerLine(false, true) === offerLine(false, false) && offersRoutes(OFFER_LINE_AFTER_ISSUES, true) && offersRoutes(OFFER_LINE_BOTH, true), 'every offer line still offers both routes (or building one with no site)');
  ok(!/\bdo that\b/.test(fbWarm) && /that's the sort of thing we fix/.test(fbWarm), 'Draft reply: the same join after the issues');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
