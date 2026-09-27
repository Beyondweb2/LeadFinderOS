/* ════════════════════════════════════════════════════════════════════════════════════════════════
   VOICE-NOTE SCRIPT (Paul, 2026-09-26) — the evidence pick, the website half, the prompt, the checks,
   and the structural promises: it never sends, it refuses before it spends, it reuses the shared
   research path, and the table is service-role only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  selectVoiceNoteEvidence, selectVoiceNoteFindings, buildVoiceNotePrompt, checkVoiceNoteScript, tidyScript,
  competitorNamed, wordCount, betterAttempt, VOICE_NOTE_SYSTEM_PROMPT, VOICE_NOTE_MODEL,
  classifyLeadWebsite, servicesNamed, serviceSupported, findingRecord, readsSearchVerbatim, isInterpretiveFinding,
  type VoiceNoteEvidence, type VoiceNoteSite,
} from '../src/lib/voiceNoteScript.ts';
import type { HookResult } from '../src/lib/hookScore.ts';
import type { ResearchFinding, WarmLeadResearch } from '../src/lib/warmLeadResearch.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');

const CTX = { business: 'Acme Plumbing', town: 'Leicester', trade: 'plumber' };
const res = (questionIndex: number, engine: string, status: HookResult['status'], competitors: string[], question = `Who is the best plumber in Leicester? (${questionIndex})`): HookResult =>
  ({ questionIndex, question, engine, label: engine === 'gemini' ? 'Google AI' : 'ChatGPT', status, competitors, answerExcerpt: `answer ${engine} ${questionIndex}` });

/* ─────────── 1. result selection ─────────── */
{
  const r = selectVoiceNoteEvidence([
    res(0, 'chatgpt', 'not_named', ['C1', 'C2', 'C3']),
    res(0, 'gemini', 'not_named', ['G1', 'G2', 'G3']),
    res(1, 'gemini', 'named', ['X']),
  ], CTX);
  ok(r.ok && r.evidence.engine === 'gemini' && r.evidence.competitors.join() === 'G1,G2,G3', 'A: a Google AI miss is preferred over a ChatGPT miss');
  ok(r.ok && r.evidence.engineLabel === 'Google AI', '…and labelled "Google AI"');
}
{
  const r = selectVoiceNoteEvidence([
    res(0, 'gemini', 'named', []), res(1, 'gemini', 'named', []), res(2, 'gemini', 'named', []),
    res(0, 'chatgpt', 'named', []), res(1, 'chatgpt', 'not_named', ['C1', 'C2', 'C3'], 'Can you recommend a reliable plumber in Leicester?'), res(2, 'chatgpt', 'not_named', ['D1', 'D2']),
  ], CTX);
  ok(r.ok && r.evidence.engine === 'chatgpt' && r.evidence.engineLabel === 'ChatGPT', 'B: Google AI named them in all three → the ChatGPT miss is used, labelled ChatGPT');
  ok(r.ok && r.evidence.question === 'Can you recommend a reliable plumber in Leicester?' && r.evidence.competitors.join() === 'C1,C2,C3', '…the strongest ChatGPT miss, with ITS OWN three names');
}
{
  // Tuple integrity: the Google AI miss has 2 names, the ChatGPT one for the SAME question has 3 others.
  const r = selectVoiceNoteEvidence([res(0, 'gemini', 'not_named', ['G1', 'G2']), res(0, 'chatgpt', 'not_named', ['C1', 'C2', 'C3'])], CTX);
  ok(r.ok && r.evidence.engine === 'gemini' && r.evidence.competitors.join() === 'G1,G2', 'two Google AI names are used as two — never topped up from the ChatGPT answer');
  ok(r.ok && !r.evidence.thin, '…and two names is not "thin"');
}
{
  const r = selectVoiceNoteEvidence([res(0, 'gemini', 'not_named', ['G1', 'G2']), res(1, 'gemini', 'not_named', ['H1', 'H2', 'H3'])], CTX);
  ok(r.ok && r.evidence.questionIndex === 1, 'within an engine, a miss with three names beats one with two');
}
{
  const r = selectVoiceNoteEvidence([res(0, 'gemini', 'not_named', ['G1']), res(0, 'chatgpt', 'not_named', ['C1', 'C2'])], CTX);
  ok(r.ok && r.evidence.engine === 'chatgpt' && r.evidence.competitors.length === 2, 'a Google AI miss with ONE name gives way to another genuine miss with two');
  ok(r.ok && /Google AI missed them too/.test(r.note ?? ''), '…and the operator is told why');
}
{
  const r = selectVoiceNoteEvidence([res(0, 'gemini', 'not_named', ['G1']), res(0, 'chatgpt', 'named', [])], CTX);
  ok(r.ok && r.evidence.thin && r.evidence.competitors.join() === 'G1', 'one name anywhere → allowed as a last resort, flagged thin');
  ok(r.ok && /Only one usable competitor/.test(r.note ?? ''), '…with a note to the operator');
}
{
  const r = selectVoiceNoteEvidence([res(0, 'gemini', 'not_named', []), res(0, 'chatgpt', 'not_named', [])], CTX);
  ok(!r.ok && r.code === 'no_competitors', 'misses with no usable names → refused, nothing manufactured');
  const n = selectVoiceNoteEvidence([res(0, 'gemini', 'named', ['X']), res(0, 'chatgpt', 'named', ['Y'])], CTX);
  ok(!n.ok && n.code === 'no_miss', 'named everywhere → refused');
  const e = selectVoiceNoteEvidence([res(0, 'gemini', 'failed', ['X'])], CTX);
  ok(!e.ok && e.code === 'no_results', 'only failed results → refused (a failure is never a miss)');
}
{
  const r = selectVoiceNoteEvidence([res(0, 'gemini', 'not_named', ['Acme Plumbing Ltd', 'G1', 'G1', 'G2'])], CTX);
  ok(r.ok && r.evidence.competitors.join() === 'G1,G2', 'the business itself and duplicates are removed from the names');
}

/* ─────────── 2. the website half ─────────── */
const F = (over: Partial<ResearchFinding>): ResearchFinding => ({
  id: 'crawl:blocked_crawlers', kind: 'crawl_indexing', category: 'technical', title: 'AI search crawlers are blocked',
  detail: 'The site refuses OAI-SearchBot and PerplexityBot.', evidence: ['OAI-SearchBot', 'PerplexityBot'], keyDetails: ['OAI-SearchBot', 'PerplexityBot'],
  pageUrl: null, strength: 5, source: 'crawl', verified: true, ...over,
});
const research = (findings: ResearchFinding[], status: WarmLeadResearch['status'] = 'complete'): WarmLeadResearch => ({
  version: 1, generatedAt: '2026-09-26T10:00:00Z', website: 'https://acme.example', sourceCrawlAt: null, status,
  businessSummary: null, locationSignals: { homeTown: null, serviceAreas: [], positioning: 'local', quotes: [] }, services: [],
  strongestFindings: findings, technicalFindings: [], contentFindings: [], localVisibilityFindings: [],
  ownershipClues: [], providerClues: [], usefulQuestions: [], warnings: [], sources: [], technicallyClean: findings.length === 0,
  contentHash: null, timings: { researchMs: 0, fetchMs: 0, analyseMs: null },
});
const blocked = F({});
ok(selectVoiceNoteFindings(research([blocked]), 'https://acme.example').mode === 'findings' && selectVoiceNoteFindings(research([blocked]), 'https://acme.example').findings[0] === blocked, 'a strong measured finding is used');
ok(selectVoiceNoteFindings(research([]), 'https://acme.example').mode === 'clean', 'nothing strong → the "nothing obviously broken" fallback');
ok(selectVoiceNoteFindings(research([], 'failed'), 'https://acme.example').mode === 'unread', 'an unreadable site with nothing measured → nothing specific is said');
ok(selectVoiceNoteFindings(null, null).mode === 'no_website', 'no website → the no-website line');
ok(selectVoiceNoteFindings(research([F({ id: 'model:x', kind: 'hours_conflict', source: 'model' })]), 'https://acme.example').mode === 'clean', 'a model reading may not author an hours conflict (the warm drafter\'s rule)');
ok(selectVoiceNoteFindings(research([blocked, F({ id: 'rule:hours', kind: 'hours_conflict', source: 'rule', title: 'Opening hours conflict', keyDetails: ['9AM - 9PM', 'Open 24 hours'] }), F({ id: 'rule:thin', kind: 'thin_or_duplicate', source: 'rule', title: 'Thin pages' })]), 'https://acme.example').findings.length <= 2, 'at most two findings reach a voice note');

/* ─────────── 3. the prompt ─────────── */
const EV: VoiceNoteEvidence = { questionIndex: 0, question: 'Who is the best plumber in Leicester?', engine: 'gemini', engineLabel: 'Google AI', competitors: ['Smith & Sons Plumbing', 'Leicester Heating Co', 'PipeFix'], answerExcerpt: '', thin: false };
const OWN_SITE = { source: 'own_site' as const, sourceLabel: null, services: [] as string[], serviceEvidence: '' };
const SITE_F: VoiceNoteSite = { ...OWN_SITE, mode: 'findings', findings: [blocked], serviceEvidence: 'OAI-SearchBot | PerplexityBot' };
const SITE_C: VoiceNoteSite = { ...OWN_SITE, mode: 'clean', findings: [] };
const P = buildVoiceNotePrompt({ business: 'Acme Plumbing', trade: 'Plumbers', area: 'Leicester', website: 'acme.example', evidence: EV, site: SITE_F });
ok(P.includes('ENGINE NAME (say exactly this): Google AI') && EV.competitors.every((c) => P.includes(c)), 'the prompt carries the engine label and exactly the picked competitors');
ok(P.includes('say it like "a plumber"'), 'a plural trade is given in speakable form');
ok(P.includes('AI search crawlers are blocked') && P.includes('OAI-SearchBot'), 'the finding goes in with its concrete details');
const PC = buildVoiceNotePrompt({ business: 'Acme Plumbing', trade: 'plumber', area: 'Leicester', website: 'acme.example', evidence: EV, site: SITE_C });
ok(/nothing obviously broken/.test(PC) && !/WEBSITE POINTS \(use/.test(PC), 'no finding → the fallback instruction, no website points');
ok(/never say a website issue is why/i.test(VOICE_NOTE_SYSTEM_PROMPT) && /No em dash/.test(VOICE_NOTE_SYSTEM_PROMPT) && /No price/.test(VOICE_NOTE_SYSTEM_PROMPT), 'the system prompt forbids causation, dashes and price');
ok(VOICE_NOTE_MODEL === 'gpt-4o', 'the stronger writing model');

/* ─────────── 4. the checks ─────────── */
const GOOD = "hi mate, i was looking for a plumber in Leicester and asked Google AI who the best one was. it came back with Smith & Sons Plumbing, Leicester Heating Co and PipeFix, but not you, which isn't ideal because that can mean potential customers going elsewhere. so i had a quick look at your site to see what might be contributing, and one thing stood out. some of the AI search crawlers, like OAI-SearchBot and PerplexityBot, are actually blocked from reading it, which could be making it harder for AI to properly understand the business. that's the sort of thing i work on, i specialise in AI visibility for local businesses, so if you want mate i'm happy to explain what i'd change to give you a better chance of getting named in those searches.";
const g = checkVoiceNoteScript(GOOD, { evidence: EV, site: SITE_F, town: 'Leicester' });
ok(g.problems.length === 0, `a good script passes (${g.problems.join(' | ')})`);
ok(g.wordCount > 110 && g.wordCount < 140, `word count is sensible (${g.wordCount})`);

const missing = checkVoiceNoteScript(GOOD.replace(' and PipeFix', ''), { evidence: EV, site: SITE_F });
ok(missing.problems.some((p) => /PipeFix/.test(p)), 'a dropped competitor is a problem');
const wrongEngine = checkVoiceNoteScript(GOOD.replace('asked Google AI', 'asked ChatGPT'), { evidence: EV, site: SITE_F });
ok(wrongEngine.problems.some((p) => /came from Google AI/.test(p)) && wrongEngine.problems.some((p) => /Does not say it was Google AI/.test(p)), 'saying ChatGPT for a Google AI result is a problem');
const gptEv = { ...EV, engine: 'chatgpt', engineLabel: 'ChatGPT' };
ok(checkVoiceNoteScript(GOOD.replace('asked Google AI', 'asked ChatGPT'), { evidence: gptEv, site: SITE_F }).problems.length === 0, '…and correct for a ChatGPT result');
ok(checkVoiceNoteScript(GOOD, { evidence: gptEv, site: SITE_F }).problems.some((p) => /came from ChatGPT/.test(p)), 'saying Google AI for a ChatGPT result is a problem');
const causal = checkVoiceNoteScript(GOOD.replace('which could be making it harder', "and that's why Google AI isn't recommending you, it makes it harder"), { evidence: EV, site: SITE_F });
ok(causal.problems.some((p) => /reason/.test(p)), 'causation ("that\'s why Google AI isn\'t recommending you") is a problem');
ok(checkVoiceNoteScript(GOOD + ' it is only £99 to start.', { evidence: EV, site: SITE_F }).problems.some((p) => /price/.test(p)), 'a price is a problem');
ok(checkVoiceNoteScript(GOOD + ' have a look at findable.live', { evidence: EV, site: SITE_F }).problems.some((p) => /link/.test(p)), 'a link is a problem');
const invented = checkVoiceNoteScript(GOOD, { evidence: EV, site: SITE_C });
ok(invented.problems.some((p) => /blocked crawlers/.test(p)), 'claiming blocked crawlers with NO supporting finding is a problem (invented finding)');
const fallback = "hi mate, i was looking for a plumber in Leicester and asked Google AI who it'd recommend. it came back with Smith & Sons Plumbing, Leicester Heating Co and PipeFix, but not you, and that's potentially work going elsewhere. i had a look through the site to see what might be contributing and there isn't anything obviously broken, but there are definitely a few things i'd strengthen around how clearly it tells Google and AI what you do, where you work and why it should trust the business. i specialise in AI visibility for local businesses, so if you want mate i'm happy to explain what i'd change to give you a better chance of getting named in those searches instead.";
const fb = checkVoiceNoteScript(fallback, { evidence: EV, site: SITE_C });
ok(fb.problems.length === 0, `the honest fallback passes with no finding (${fb.problems.join(' | ')})`);
const noPrimary = checkVoiceNoteScript(fallback, { evidence: EV, site: SITE_F });
ok(noPrimary.problems.some((p) => /main website finding/.test(p)), 'ignoring the supplied strongest finding is a problem');
ok(checkVoiceNoteScript(GOOD.replace('Smith & Sons Plumbing', 'Block Paving Co'), { evidence: { ...EV, competitors: ['Block Paving Co', 'Leicester Heating Co', 'PipeFix'] }, site: SITE_F }).problems.length === 0, 'a competitor called "Block…" is not read as a blocked-crawler claim');

// Length is a target, not a gate.
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
const lenOnly = (n: number) => checkVoiceNoteScript(`asked Google AI ai visibility Smith & Sons Plumbing Leicester Heating Co PipeFix ${words(n)}`, { evidence: EV, site: SITE_C });
ok(lenOnly(72).problems.length === 0 && lenOnly(72).warnings.some((w) => /outside/.test(w)), '86 words: a note only, never a rewrite');
ok(lenOnly(120).problems.length === 0 && lenOnly(120).warnings.length === 0, '134 words: no problem, no warning');
ok(lenOnly(124).problems.length === 0 && lenOnly(124).warnings.some((w) => /outside/.test(w)), '~138 words: a note only, never a rewrite');
ok(lenOnly(140).problems.some((p) => /Far too long/.test(p)), '~154 words: over 140 is shortened (Paul, 2026-09-27)');
ok(lenOnly(30).problems.some((p) => /Far too short/.test(p)) && lenOnly(170).problems.some((p) => /Far too long/.test(p)), 'plainly wrong-sized scripts are sent back');

ok(tidyScript('"hi mate — i was looking – for a plumber"') === 'hi mate, i was looking, for a plumber', 'dashes are replaced mechanically and wrapping quotes dropped');
ok(checkVoiceNoteScript(GOOD.replace('ideal because', 'ideal — because'), { evidence: EV, site: SITE_F }).problems.length === 0, 'a dash alone never causes a rewrite');
ok(competitorNamed('asked and got Leicester Heating and PipeFix', 'Leicester Heating Ltd'), 'a legal suffix may be dropped when naming a competitor');
ok(!competitorNamed('asked and got Leicester and PipeFix', 'Leicester Heating Ltd'), '…but not the name itself');
ok(wordCount("i'm happy to explain what i'd change") === 7, 'contractions count as one word');
const a = { script: 'a', wordCount: 1, problems: ['x', 'y'], warnings: [] };
const b = { script: 'b', wordCount: 1, problems: ['x'], warnings: [] };
ok(betterAttempt(a, b) === b && betterAttempt(b, a) === b, 'the attempt with fewer factual problems is kept');

/* ─────────── 4b. Paul's corrections (2026-09-26) ─────────── */
// 1. A directory / profile page is not "your website".
ok(classifyLeadWebsite('https://tradehq.co.uk/firebeardelectrical').source === 'directory_profile' && classifyLeadWebsite('https://tradehq.co.uk/firebeardelectrical').label === 'TradeHQ', 'TradeHQ is a directory profile, labelled TradeHQ');
ok(classifyLeadWebsite('www.checkatrade.com/trades/acme').source === 'directory_profile', 'Checkatrade is a directory profile');
ok(classifyLeadWebsite('https://m.facebook.com/acmeplumbing').source === 'social_profile' && classifyLeadWebsite('https://m.facebook.com/acmeplumbing').label === 'Facebook', 'Facebook is a social profile');
ok(classifyLeadWebsite('https://www.rpelectrics.com/').source === 'own_site', 'a business domain is their own site');
ok(classifyLeadWebsite('').source === 'none' && classifyLeadWebsite(null).source === 'none', 'no website → none');
{
  const prof = selectVoiceNoteFindings(research([blocked]), 'https://tradehq.co.uk/firebeardelectrical', 'Shrewsbury');
  ok(prof.mode === 'profile' && prof.findings.length === 0 && prof.sourceLabel === 'TradeHQ', 'a profile page is never mined for findings, even when research exists');
  const pp = buildVoiceNotePrompt({ business: 'Firebeard Electrical', trade: 'Electricians', area: 'Shrewsbury', website: 'https://tradehq.co.uk/firebeardelectrical', evidence: EV, site: prof });
  ok(pp.includes('WEBSITE SOURCE: a TradeHQ profile page, NOT their own website') && pp.includes('just their TradeHQ profile') && !pp.includes('{LABEL}'), 'the prompt says it is a TradeHQ profile, not their website');
  const bad = checkVoiceNoteScript(fallback.replace("i had a look through the site to see what might be contributing and there isn't anything obviously broken", "i had a look at your website and there isn't anything obviously broken"), { evidence: EV, site: prof });
  ok(bad.problems.some((x) => /Calls the TradeHQ profile their website/.test(x)), 'calling the TradeHQ profile "your website" is a problem');
  const good = "hi mate, i was looking for a plumber in Leicester and asked Google AI who it'd recommend. it came back with Smith & Sons Plumbing, Leicester Heating Co and PipeFix, but not you, and that can mean potential customers going elsewhere. i had a look to see what might be contributing, and i couldn't actually find a website of your own, just your TradeHQ profile. without your own site there's a lot less for AI to go on about what you do and where you work. i specialise in AI visibility for local businesses, so if you want mate i'm happy to explain what i'd change to give you a better chance of getting named in those searches.";
  const g2 = checkVoiceNoteScript(good, { evidence: EV, site: prof });
  ok(g2.problems.length === 0, `an honest profile script passes (${g2.problems.join(' | ')})`);
}
// 2. Services need evidence.
{
  const missing = F({ id: 'rule:missing_core', kind: 'missing_core_service_pages', source: 'rule', title: 'No pages for the core services',
    detail: 'None of the pages linked from the homepage is about electrical work such as rewiring, fuse boards, testing or emergency call-outs. The menu is about other things.',
    keyDetails: ['electrical work such as rewiring, fuse boards, testing or emergency call-outs', 'contact us', 'legal notice'] });
  const site = selectVoiceNoteFindings(research([missing]), 'https://jg-electrics.co.uk', 'Woking');
  const pr = buildVoiceNotePrompt({ business: 'JG Electrics', trade: 'Electricians', area: 'Woking', website: 'https://jg-electrics.co.uk', evidence: EV, site });
  ok(site.mode === 'findings' && !/rewiring|fuse board/i.test(pr), 'the rule\'s generic examples ("rewiring, fuse boards") never reach the prompt');
  ok(pr.includes('SERVICES THEY OFFER: none confirmed'), '…and the model is told no services are confirmed');
  ok(!findingRecord(missing).details.some((d) => /such as/.test(d)), '…nor the "Based on" record');
  const script = "hi mate, i was looking for an electrician in Woking and asked Google AI who it'd recommend. it came back with Smith & Sons Plumbing, Leicester Heating Co and PipeFix, and you weren't in there, which could mean work going elsewhere. i had a look at your site to see what might be contributing. there aren't really pages for the actual work, like rewiring or fuse boards, the menu's mostly contact us and legal bits. i specialise in AI visibility for local businesses, so if you want mate i'm happy to explain what i'd change to give you a better chance of getting named in those searches.";
  const c1 = checkVoiceNoteScript(script, { evidence: EV, site, trade: 'Electricians' });
  ok(c1.problems.some((x) => /"rewiring"/.test(x)) && c1.problems.some((x) => /"fuse boards"/.test(x)), `naming rewiring / fuse boards with no evidence is a problem (${c1.problems.join(' | ')})`);
  const withServices = { ...site, services: ['Full and partial rewires', 'Fuse board upgrades'], serviceEvidence: site.serviceEvidence + ' | Full and partial rewires | Fuse board upgrades' };
  ok(!checkVoiceNoteScript(script, { evidence: EV, site: withServices, trade: 'Electricians' }).problems.some((x) => /service/.test(x)), '…but fine when their own site lists those services');
  const bq = { ...EV, question: 'Who does emergency boiler repairs in Leicester?' };
  ok(!checkVoiceNoteScript(GOOD.replace('who the best one was', 'who does emergency boiler repairs'), { evidence: bq, site: SITE_F, trade: 'plumber' }).problems.some((x) => /service/.test(x)), '…and fine when the service is in the search itself');
  ok(servicesNamed('the work you do and your main services').length === 0, 'generic wording names no service');
  ok(serviceSupported('rewiring', 'full rewires') && !serviceSupported('boiler repairs', 'full rewires'), 'service support is by word stem');
}
// 3. Lost work is a possibility, never a fact.
{
  const hard = GOOD.replace('that can mean potential customers going elsewhere', "that's work going straight to someone else");
  ok(checkVoiceNoteScript(hard, { evidence: EV, site: SITE_F }).problems.some((x) => /lost work as a fact/.test(x)), '"that\'s work going straight to someone else" is rejected');
  ok(checkVoiceNoteScript(GOOD.replace('that can mean potential customers going elsewhere', "you're losing jobs to them"), { evidence: EV, site: SITE_F }).problems.some((x) => /lost work as a fact/.test(x)), '"you\'re losing jobs" is rejected');
  ok(checkVoiceNoteScript(GOOD.replace('that can mean potential customers going elsewhere', "that's someone local ringing them instead"), { evidence: EV, site: SITE_F }).problems.some((x) => /lost work as a fact/.test(x)), '"someone ringing them instead" is rejected');
  ok(!checkVoiceNoteScript(GOOD, { evidence: EV, site: SITE_F }).problems.some((x) => /lost work/.test(x)), '"that can mean potential customers going elsewhere" is fine');
  ok(!checkVoiceNoteScript(GOOD.replace('that can mean potential customers going elsewhere', 'that could be work going to someone else'), { evidence: EV, site: SITE_F }).problems.some((x) => /lost work/.test(x)), '"that could be work going to someone else" is fine');
  ok(/LOST WORK IS A POSSIBILITY, NEVER A FACT/.test(VOICE_NOTE_SYSTEM_PROMPT), 'the prompt says so too');
}

// 4. The first live script (RP Electrics, 2026-09-26): quoting the crawler "ChatGPT-User" is not an engine claim.
{
  const rp = "hi mate, i was looking for an electrician in Woking on Google AI, specifically for commercial work, and it suggested Smith & Sons Plumbing, Leicester Heating Co, and PipeFix. if AI's recommending others, that could be potential customers going elsewhere. i had a quick look at your site and noticed some of the AI search crawlers are blocked, like OAI-SearchBot and ChatGPT-User. that might be making it harder for AI to properly understand your site. i specialise in AI visibility for local businesses, so if you'd like, i can explain what i'd change to give you a better chance of being named in those searches. just let me know.";
  const c = checkVoiceNoteScript(rp, { evidence: EV, site: SITE_F });
  ok(!c.problems.some((x) => /ChatGPT|Google AI/.test(x)), `naming the ChatGPT-User crawler is not claiming ChatGPT was asked (${c.problems.join(' | ')})`);
  ok(checkVoiceNoteScript(rp.replace('on Google AI', 'on ChatGPT'), { evidence: EV, site: SITE_F }).problems.some((x) => /came from Google AI/.test(x)), '…while actually saying ChatGPT for a Google AI result is still caught');
}

/* ─────────── 4c. tone and evidence pass (Paul, 2026-09-27) — the three real v1 scripts are the fixtures ─────────── */
{
  const FB_EV = { ...EV, question: 'emergency electrician in Shrewsbury UK who can come today', competitors: ['Able Group (Shrewsbury Service)', 'Shrewsbury Emergency Electricians', 'Whitfield Plumbing & Electrical'] };
  const FB_SITE = selectVoiceNoteFindings(null, 'https://tradehq.co.uk/firebeardelectrical', 'Shrewsbury');
  const FB_V1 = 'hi mate, i was looking for an electrician in Shrewsbury and asked Google AI about "emergency electrician in Shrewsbury UK who can come today". it suggested Able Group, Shrewsbury Emergency Electricians, and Whitfield Plumbing & Electrical, but not Firebeard Electrical. now, if AI\'s pointing folks to other companies, that could be potential customers going elsewhere. i had a quick look, and i couldn\'t find a website of your own, just your TradeHQ profile. without your own site, there\'s a lot less for AI to go on about what you do and where you work. i specialise in AI visibility for local businesses. if you fancy, i can share what i\'d change to give you a better shot at being named in those searches.';
  const fb = checkVoiceNoteScript(FB_V1, { evidence: FB_EV, site: FB_SITE, business: 'Firebeard Electrical' });
  ok(fb.problems.some((x) => /word for word or in quotes/.test(x)), 'Firebeard v1: the quoted, verbatim search is rejected');
  ok(fb.problems.some((x) => /Refers to the business by name/.test(x)), 'Firebeard v1: "but not Firebeard Electrical" is rejected');
  const FB_OK = "hi mate, i was looking for an emergency electrician in Shrewsbury and asked Google AI who it'd recommend. it came back with Able Group, Shrewsbury Emergency Electricians and Whitfield Plumbing & Electrical, but you didn't come up. that can mean potential customers going elsewhere. so i had a quick look, and i couldn't find a website of your own, just your TradeHQ profile. without your own site there's a lot less for AI to go on about what you do and where you work. i specialise in AI visibility for local businesses, so if you want mate i'm happy to explain what i'd change to give you a better chance of coming up in those searches.";
  const fbOk = checkVoiceNoteScript(FB_OK, { evidence: FB_EV, site: FB_SITE, business: 'Firebeard Electrical' });
  ok(fbOk.problems.length === 0, `a paraphrased, second-person Firebeard script passes (${fbOk.problems.join(' | ')})`);
  ok(readsSearchVerbatim('i asked google ai who they would recommend for an emergency electrician in shrewsbury uk who can come today', FB_EV.question), 'reading the search unquoted is still caught');
  ok(readsSearchVerbatim('i asked about an emergency electrician in shrewsbury uk', FB_EV.question), '"<town> uk" copied from the query is caught');
  ok(!readsSearchVerbatim(FB_OK, FB_EV.question), 'a paraphrase keeping "emergency" and the town is fine');

  // JG v1: an evaluative verdict and 144 words.
  const JG_V1 = "hi mate, i was looking for an electrician in Woking on Google AI, and it came up with BETEC Electrical Contractors, Big Green Electrical, and EA Electrical Ltd. if AI's recommending them instead, that could mean potential customers going elsewhere. i had a quick look at your site, and a couple of things stood out. none of the pages linked from your homepage are about the services you offer, like re-wires or fuseboard changes, so there's less on the site that clearly says what you do and where. also, i noticed you mention being fully insured and qualified, but there's no evidence or details there. that's probably not ideal for showing up in searches. i specialise in AI visibility for local businesses, so if you want, i can explain what i'd change to give you a better chance of being named in those searches.";
  const jgEv = { ...EV, competitors: ['BETEC Electrical Contractors', 'Big Green Electrical', 'EA Electrical Ltd'] };
  const jgSite = { ...SITE_C, services: ['Full and partial re-wires', 'Consumer unit (fuseboard) changes'], serviceEvidence: 'Full and partial re-wires | Consumer unit (fuseboard) changes' };
  const jg = checkVoiceNoteScript(JG_V1, { evidence: jgEv, site: jgSite, business: 'JG Electrics', trade: 'Electricians' });
  ok(jg.problems.some((x) => /judgement/.test(x)), 'JG v1: "there\'s no evidence or details there" is a judgement, rejected');
  ok(!checkVoiceNoteScript(JG_V1.replace("but there's no evidence or details there", "but it doesn't really show much detail around those qualifications"), { evidence: jgEv, site: jgSite, business: 'JG Electrics' }).problems.some((x) => /judgement/.test(x)), '…the observable version is fine');
  ok(checkVoiceNoteScript(JG_V1.replace('there\'s no evidence', 'you have weak evidence of qualifications'), { evidence: jgEv, site: jgSite }).problems.some((x) => /judgement/.test(x)), '"weak evidence of qualifications" is rejected');

  // RP v1: the polished ending.
  const RP_END = checkVoiceNoteScript(GOOD.replace("so if you want mate i'm happy to explain", "so if you'd like, i can explain").concat(' just let me know.'), { evidence: EV, site: SITE_F });
  ok(RP_END.problems.some((x) => /polished ending/.test(x)), 'RP v1: "if you\'d like, i can explain … just let me know" is rejected');
  ok(!checkVoiceNoteScript(GOOD, { evidence: EV, site: SITE_F }).problems.some((x) => /polished/.test(x)), 'Paul\'s "if you want mate i\'m happy to explain" is fine');
  ok(checkVoiceNoteScript(GOOD.replace('hi mate', 'hi mate mate mate'), { evidence: EV, site: SITE_F }).warnings.some((w) => /mate/.test(w)), '"mate" more than twice is noted');

  // Concrete first.
  const weak = F({ id: 'model:1', kind: 'weak_evidence', source: 'model', title: 'Weak Evidence of Qualifications', detail: 'The site says the business is fully insured and qualified but shows no detail.', keyDetails: ['We are fully insured and hold all current qualifications.'] });
  const missingPages = F({ id: 'rule:missing_core', kind: 'missing_core_service_pages', source: 'rule', title: 'No pages for the core services', keyDetails: ['contact us', 'legal notice'] });
  const both = selectVoiceNoteFindings(research([missingPages, weak]), 'https://jg-electrics.co.uk', 'Woking');
  ok(both.findings.length >= 1 && both.findings.every((f) => !isInterpretiveFinding(f)), 'a concrete finding exists → the interpretive one is not used');
  const onlyWeak = selectVoiceNoteFindings(research([F({ ...weak, source: 'rule', id: 'rule:weak', strength: 5 })]), 'https://jg-electrics.co.uk', 'Woking');
  const pw = buildVoiceNotePrompt({ business: 'JG Electrics', trade: 'Electricians', area: 'Woking', website: 'x', evidence: EV, site: onlyWeak });
  ok(onlyWeak.findings.length === 1 && pw.includes('OBSERVATION ONLY') && !pw.includes('Weak Evidence of Qualifications'), 'no concrete finding → the interpretive one goes in as observation, without its verdict title');
  ok(/OBSERVATION, NOT JUDGEMENT/.test(VOICE_NOTE_SYSTEM_PROMPT) && /NEVER READ THE SEARCH OUT WORD FOR WORD/.test(VOICE_NOTE_SYSTEM_PROMPT) && /Never say the business's own name/.test(VOICE_NOTE_SYSTEM_PROMPT), 'the prompt carries the four tone rules');
  ok(/if you want mate i'm happy to explain what i'd change to give you a better chance of coming up in those searches/.test(VOICE_NOTE_SYSTEM_PROMPT), 'the approved ending direction is in the prompt');
  ok(/business: hook\.business/.test(read('supabase/functions/voice-note-script/index.ts')), 'the function passes the business name to the checks');
}

/* ─────────── 5. structure ─────────── */
const FN = read('supabase/functions/voice-note-script/index.ts');
const UI = read('src/components/VoiceNoteScriptButton.tsx');
const SHARED = read('supabase/functions/_shared/site-research.ts');
for (const [name, src] of [['voice-note-script function', FN], ['VoiceNoteScriptButton', UI]] as const) {
  ok(!/send-whatsapp-(message|voice)['"]/.test(strip(src)), `${name}: never invokes a sender`);
  ok(!/graph\.facebook\.com|sendViaGraph|whatsapp-send\.ts/.test(src), `${name}: no Graph call, no import of the sender module`);
  ok(!/from\(["']whatsapp_(?:messages|sends)["']\)/.test(src), `${name}: never touches a message row`);
}
ok(!/onSend|doSend|onDraft|setDraft/.test(UI), 'the button has no send or composer callback — Copy and Regenerate only');
const gen = FN.match(/async function handleGenerate[\s\S]*?\n}\n/)?.[0] ?? '';
ok(gen.length > 0 && gen.indexOf('if (!hook.ok) return') > 0 && gen.indexOf('if (!hook.ok) return') < gen.indexOf('runSiteResearch(') && gen.indexOf('runSiteResearch(') < gen.indexOf('callModel('), 'no honest hook result → refused BEFORE any site read or model call');
ok(/runSiteResearch\(service, lead, operatorId, false,/.test(gen), 'the research is the shared path, never forced to refresh');
ok(/websiteKind\.source === "own_site"\s*\? await runSiteResearch/.test(gen), 'a directory / social profile is never researched as their site');
ok(!/mode: "full"|crawl-worker|createCrawlJob/.test(FN + SHARED), 'no crawl job is ever started');
ok(/resolveOperator\(req\)/.test(FN) && /l\.user_id === operatorId/.test(FN), 'a signed-in operator who owns the lead');
ok(/score\.shape === "six" && !score\.complete/.test(FN), 'an incomplete six-result hook is refused, never quoted in part');
ok(/cleanliness\.suppressNames \? \[\] : names\.filter\(\(n\) => !isProvableJunkName\(n\)\)/.test(FN), 'the report\'s suppression and junk gates are applied to each result\'s own names');
ok(/audit_purpose/.test(FN) && /is_measurement === true/.test(FN), 'baselines and measurements are never used as hook evidence');
ok(/regenerated_from: previous\?\.id \?\? null/.test(FN) && /data\.lead_id === lead\.id/.test(FN), 'a regenerate links to the script it replaced, same lead only');
const MIG = read('supabase/migrations/20260926150000_voice_note_scripts.sql');
ok(/enable row level security/.test(MIG) && /revoke all on table public\.voice_note_scripts from anon, authenticated/.test(MIG) && !/create policy/i.test(MIG), 'the table is service-role only');
ok(/hook_engine text not null check \(hook_engine in \('chatgpt', 'gemini'\)\)/.test(MIG) && /competitors text\[\] not null/.test(MIG), 'the evidence tuple is stored with the script');
ok(/\[functions\.voice-note-script\]\nverify_jwt = true/.test(read('supabase/config.toml')), 'config.toml names the new function');
{
  const INBOX = read('src/pages/Inbox.tsx');
  const prominent = INBOX.match(/<VoiceNoteScriptButton key=\{active\.key\} leadId=\{active\.leadId\} prominent \/>/g) ?? [];
  ok(prominent.length === 1 && (INBOX.match(/<VoiceNoteScriptButton/g) ?? []).length === 1, 'the Inbox shows ONE voice-note script button, the prominent one, keyed by conversation');
  const openBranch = INBOX.slice(INBOX.indexOf('{win.open ? ('), INBOX.indexOf('Outside the 24h window'));
  const closedBranch = INBOX.slice(INBOX.indexOf('Outside the 24h window') - 1500, INBOX.indexOf('Outside the 24h window'));
  ok(openBranch.includes('prominent />') && openBranch.indexOf('prominent />') < openBranch.indexOf('<VoiceNoteRecorder'), '…in the OPEN window, beside the recorder');
  ok(!closedBranch.includes('VoiceNoteScriptButton'), 'closed-window threads do not get an equal active control');
}
ok(/<VoiceNoteScriptButton leadId=\{lead\.id\} \/>/.test(read('src/components/LeadDetailDialog.tsx')), 'the lead popup shows the button');

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
