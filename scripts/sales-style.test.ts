/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES STYLE (Paul, 2026-09-30) — the house style every generator of sales words is held to.

   Pinned here:
     1. salesStyleProblems catches the filler Paul listed and passes the plain version of the same line;
        competitor names are never read as our words ("Premier Plumbing" is a firm, not filler).
     2. ONE COPY OF THE RULES: every model prompt that writes sales words carries SALES_STYLE_RULES
        verbatim, and no generator restates the list.
     3. Every DETERMINISTIC generator (call script + objections, the short voice note, the warm-reply
        fallback, the prospect-preview message, the WhatsApp site findings) passes it, for five trades.
     4. No invented personalisation: only the competitors the evidence holds, no placeholder, no
        "undefined", no adjective on the search, and a plain line when a piece is missing.
     5. The voice-note checker refuses a draft with an adjective on the search.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { HOUSE_STYLE_EXAMPLE, SALES_STYLE_RULES, salesStyleProblems, searchFillerCount } from '../src/lib/salesStyle.ts';
import { buildColdCallPlaybook, type PlaybookInput } from '../src/lib/coldCallPlaybook.ts';
import { VOICE_NOTE_SYSTEM_PROMPT, checkVoiceNoteScript, shortVoiceNote, type VoiceNoteEvidence, type VoiceNoteSite } from '../src/lib/voiceNoteScript.ts';
import { REPLY_SYSTEM_PROMPT, buildReplyContext, fallbackReply } from '../src/lib/warmReply.ts';
import { RESEARCH_SYSTEM_PROMPT } from '../src/lib/warmLeadResearch.ts';
import { buildSiteFindings } from '../src/lib/siteFindings.ts';
import { suggestedMessage } from '../src/lib/prospectPreview/copy.ts';
import { selectFindings as selectCardFindings } from '../src/lib/prospectPreview/findings.ts';
import { eesHeadline, eesResearch } from './prospect-preview-fixtures.ts';
import { CRAWL_CHECK_VERSION, type CrawlSignals } from '../src/lib/crawlCheck.ts';
import { readFileSync } from 'node:fs';
import { planHookQuestions } from '../src/lib/hookAudit.ts';
import { topUpHookQuestions } from '../src/lib/hookScore.ts';

let f = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log('  ✓ ' + msg);
  else { f++; console.log('  ✗ ' + msg); }
};

console.log('── 1. THE CHECK ──');
{
  const bad: Array<[string, RegExp]> = [
    ['I was looking for a reliable plumber in Leeds and it named three firms.', /filler adjective on the search/],
    ['i asked google ai for a trusted electrician in Rugby', /filler adjective on the search/],
    ['Hi, I came across your business online.', /came across/],
    ['I hope this message finds you well.', /finds you well/],
    ['We can unlock more customers for you.', /unlock/],
    ['It will boost your online presence.', /online presence/],
    ['We help every trusted local business.', /trusted local business/],
    ['We are the premier AI visibility agency.', /premier/],
    ['Stand out in today\'s competitive landscape.', /competitive landscape/],
    ['Our AI-powered platform is a game-changer.', /AI-powered/],
    ['Hi, how are you today?', /how are you today/],
    ['Have I caught you at a bad time?', /bad time/],
    ['Great news!', /exclamation/],
    ["That's why your competitors are being recommended.", /as the cause/],
    ['This is the reason you are not showing up.', /as the cause/],
    ['AI skipped you because of your website.', /as the cause/],
    ['Dear Sir, I am writing to introduce Findable.', /I am writing to|Dear Sir/],
    ['Just reaching out to touch base.', /reach out|touch base/],
    ['I look forward to hearing from you.', /corporate sign-off/],
  ];
  for (const [text, re] of bad) {
    const p = salesStyleProblems(text);
    ok(p.some((x) => re.test(x)), 'caught: "' + text + '"');
  }
  const good = [
    'I asked Google AI for a plumber in Leeds and it named A, B and C, but not you.',
    'i asked google ai for an emergency locksmith in Dover.',
    'Who repairs car keys in Dover?',
    HOUSE_STYLE_EXAMPLE.replace(/\[[^\]]+\]/g, 'Rugby'),
    "I had a look at why you weren't coming up and found a few things that could be holding you back.",
    "It depends which route makes sense, which is why I'm asking about the website.",
  ];
  for (const text of good) ok(salesStyleProblems(text).length === 0, 'passes: "' + text.slice(0, 70) + '"');
  ok(salesStyleProblems('It named Premier Plumbing Ltd and Leading Edge Electrics.', ['Premier Plumbing Ltd', 'Leading Edge Electrics']).length === 0,
    'a competitor called "Premier …" is a name, not filler');
  ok(searchFillerCount('Can you recommend a reliable electrician in Addlestone?') === 1 && searchFillerCount('electrician in Addlestone') === 0,
    'searchFillerCount counts the adjectives on a search (for ranking only; a stored question is never rewritten)');
}

console.log('── 2. ONE COPY OF THE RULES ──');
{
  ok(VOICE_NOTE_SYSTEM_PROMPT.includes(SALES_STYLE_RULES), 'the voice-note prompt carries the shared rules');
  ok(REPLY_SYSTEM_PROMPT.includes(SALES_STYLE_RULES), 'the warm-reply prompt carries the shared rules');
  ok(/plain English a tradesperson uses/.test(RESEARCH_SYSTEM_PROMPT) && /useful_questions:[^\n]*Short and spoken/.test(RESEARCH_SYSTEM_PROMPT),
    'the site research asks for plain-English findings and spoken questions');
  ok(SALES_STYLE_RULES.length < 2600, 'the shared block stays short (' + SALES_STYLE_RULES.length + ' chars)');
  for (const file of ['src/lib/voiceNoteScript.ts', 'src/lib/warmReply.ts']) {
    const src = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    ok(/from '\.\/salesStyle\.ts'/.test(src), file + ' imports the rules and the check from salesStyle.ts (relative, edge-reachable)');
  }
  const leaf = readFileSync(new URL('../src/lib/salesStyle.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/^\s*import /m.test(leaf), 'salesStyle.ts is a leaf (no imports), safe in every edge closure');
}

console.log('── 3. DETERMINISTIC COPY, FIVE TRADES ──');
const NOW = Date.parse('2026-09-30T10:00:00Z');
const DAY = 86_400_000;
const CLEAN: CrawlSignals = {
  homeUrl: 'https://x.co.uk/', fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot',
  clientRendered: { flagged: false, visibleChars: 4000, htmlBytes: 30000, appShell: false },
  missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0,
};
const crawl = (s: CrawlSignals) => ({ result: { version: CRAWL_CHECK_VERSION, signals: s }, createdAtMs: NOW - DAY });
const TRADES = [
  { name: 'Acme Locksmiths', trade: 'Locksmiths', spoken: 'a locksmith', town: 'Canterbury', website: 'https://acme.co.uk', engine: 'Gemini', rivals: ['Canterbury Lock & Key', 'KeyPoint Locksmiths', 'Lockout Kent', 'Fourth Name Ltd'], signals: { ...CLEAN, searchBlocked: ['OAI-SearchBot'] } as CrawlSignals },
  { name: 'Rugby Plumbing Co', trade: 'Plumbers', spoken: 'a plumber', town: 'Rugby', website: 'https://rugbyplumb.co.uk', engine: 'Google AI', rivals: ['Dunchurch Plumbing', 'Premier Heating Rugby', 'R&K Plumbers'], signals: { ...CLEAN, thinPages: 2, thinPageUrls: ['https://rugbyplumb.co.uk/a', 'https://rugbyplumb.co.uk/b'] } as CrawlSignals },
  { name: 'Spark Electrical', trade: 'Electrician', spoken: 'an electrician', town: 'Leeds', website: 'https://www.facebook.com/sparkleeds', engine: 'ChatGPT', rivals: ['Leeds Electrical Services', 'Headingley Electrics'], signals: null },
  { name: 'Pass First Driving School', trade: 'Driving instructors', spoken: 'a driving instructor', town: 'Dover', website: null, engine: 'Google AI', rivals: ['Dover Driving School', 'White Cliffs Driving', 'Easy Pass Kent'], signals: null },
  { name: 'Smith & Co Accountants', trade: 'Accountants', spoken: 'an accountant', town: 'Shrewsbury', website: 'https://smithco.co.uk', engine: 'Google AI', rivals: ['Whittingham Riddell', 'Dyke Yaxley', 'Hudson Accountants'], signals: CLEAN },
];
for (const t of TRADES) {
  const input: PlaybookInput = {
    lead: { id: 'l-' + t.name, business_name: t.name, phone: '07700 900000', website: t.website, category: t.trade, derived_town: t.town, status: 'contacted' },
    reportAudit: { id: 'a-' + t.name, short_code: 'abc123', created_at: new Date(NOW - DAY).toISOString(), business_name: t.name, business_type: t.trade, location_text: t.town + ' UK' },
    report: { hook: { questionsTested: 3, gap: { question: `can you recommend a reliable ${t.trade.toLowerCase()} in ${t.town} UK who can come today`, engineLabel: t.engine, namedInstead: t.rivals, answerExcerpt: '' }, tested: [] } },
    runCrawls: [], leadCrawl: t.signals ? crawl(t.signals) : null, messages: [], nowMs: NOW, callerName: 'Sam',
  };
  const p = buildColdCallPlaybook(input);
  const script = p.callScript.join('\n');
  const said = script + '\n' + p.objections.map((o) => o.answer).join('\n');
  ok(salesStyleProblems(said, t.rivals).length === 0, t.trade + ': call script + objections pass the house style ' + JSON.stringify(salesStyleProblems(said, t.rivals)));
  ok(script.includes('for ' + t.spoken + ' in ' + t.town + ' and it named'), t.trade + ': the search is said plainly ("' + t.spoken + ' in ' + t.town + '"), not "reliable … who can come today"');
  ok(t.rivals.slice(0, 3).every((r) => script.includes(r)) && !script.includes('Fourth Name'), t.trade + ': exactly the first three competitors from the evidence, no more');
  ok(!/undefined|null|\{\{|\[[a-z ]+\]|NaN/.test(said), t.trade + ': no placeholder or missing value leaks into the words');
  ok(/Google AI|ChatGPT/.test(script) && !/\bGemini\b/.test(script), t.trade + ': the engine is said as the product says it');

  // LinkedIn and email: the SAME facts, written for the channel.
  const { linkedin, email } = p.messages;
  const words = (x: string) => x.split(/\s+/).filter(Boolean).length;
  ok(salesStyleProblems(linkedin + '\n' + email.subject + '\n' + email.body, t.rivals).length === 0, t.trade + ': LinkedIn + email pass the house style ' + JSON.stringify(salesStyleProblems(linkedin + ' ' + email.body, t.rivals)));
  ok(t.rivals.slice(0, 3).every((r) => linkedin.includes(r) && email.body.includes(r)) && !linkedin.includes('Fourth Name') && !email.body.includes('Fourth Name'), t.trade + ': LinkedIn + email name exactly the call\'s three competitors');
  ok(linkedin.includes('for ' + t.spoken + ' in ' + t.town) && email.subject === 'Asked ' + (t.engine === 'Gemini' ? 'Google AI' : t.engine) + ' for ' + t.spoken + ' in ' + t.town, t.trade + ': the same engine and plain search in LinkedIn and the email subject');
  ok(words(linkedin) <= 70 && !/https?:\/\//.test(linkedin) && /\?$/.test(linkedin), t.trade + ': LinkedIn is short (' + words(linkedin) + ' words), no link, ends on a question');
  ok(words(email.body) <= 170 && email.body.includes('https://findable.live/r/abc123') && /\nFindable$/.test(email.body), t.trade + ': the email is plain and a little longer (' + words(email.body) + ' words), with the real report link and a plain sign-off');
  ok(!linkedin.includes(t.name) && !email.body.includes(t.name), t.trade + ': neither says the business\'s own name back to them');
  ok(!/undefined|null|\{\{/.test(linkedin + email.body + email.subject), t.trade + ': no placeholder leaks into LinkedIn or email');
  if (p.findings.length) ok(email.body.includes(p.findings[0].explanation.charAt(0).toLowerCase() + p.findings[0].explanation.slice(1).replace(/\.$/, '')), t.trade + ': the email uses the call\'s strongest finding in its own words');

  // The short voice note: the same facts, the right ownership question.
  const site: Pick<VoiceNoteSite, 'mode' | 'source' | 'sourceLabel'> = t.website === null ? { mode: 'no_website', source: 'none', sourceLabel: null }
    : /facebook/.test(t.website) ? { mode: 'profile', source: 'social_profile', sourceLabel: 'Facebook' } : { mode: 'findings', source: 'own_site', sourceLabel: null };
  const engineLabel = t.engine === 'Gemini' ? 'Google AI' : t.engine;
  const short = shortVoiceNote({ engineLabel, competitors: t.rivals.slice(0, 3), trade: t.trade, area: t.town + ' UK', site })!;
  ok(!!short && salesStyleProblems(short, t.rivals).length === 0, t.trade + ': short voice note passes the house style');
  const ev: VoiceNoteEvidence = { questionIndex: 0, question: 'x', engine: t.engine === 'ChatGPT' ? 'chatgpt' : 'gemini', engineLabel, competitors: t.rivals.slice(0, 3), answerExcerpt: '', thin: false };
  const fullSite: VoiceNoteSite = { ...site, findings: [], services: [], serviceEvidence: '' } as VoiceNoteSite;
  const facts = checkVoiceNoteScript(short, { evidence: ev, site: fullSite, town: t.town, trade: t.trade, business: t.name }).problems
    .filter((x) => !/too short|main website finding/i.test(x));
  ok(facts.length === 0, t.trade + ': short voice note passes the voice note\'s own fact checks (names, engine, ownership question) ' + JSON.stringify(facts));
  ok(short.split('\n').length === 3 && short.split(/\s+/).length <= 55, t.trade + ': short voice note is three lines, about 20 seconds (' + short.split(/\s+/).length + ' words)');
}
ok(shortVoiceNote({ engineLabel: 'Google AI', competitors: [], trade: 'plumber', area: 'Rugby', site: { mode: 'clean', source: 'own_site', sourceLabel: null } }) === null, 'short voice note: no competitor names → none (never "other firms")');
ok(shortVoiceNote({ engineLabel: 'Google AI', competitors: ['A Ltd'], trade: '', area: 'Rugby', site: { mode: 'clean', source: 'own_site', sourceLabel: null } }) === null, 'short voice note: no readable trade → none');

// The WhatsApp {{6}} site findings (Meta-registered template variable) and the prospect-preview message.
for (const [label, s] of [
  ['blocked crawlers', { ...CLEAN, searchBlocked: ['OAI-SearchBot', 'PerplexityBot'] }],
  ['thin pages', { ...CLEAN, thinPages: 3 }],
  ['duplicate pages', { ...CLEAN, duplicates: { clusterSize: 5, similarityPct: 91 } as CrawlSignals['duplicates'] }],
  ['empty homepage', { ...CLEAN, clientRendered: { flagged: true, visibleChars: 80, htmlBytes: 30000, appShell: true } }],
] as Array<[string, CrawlSignals]>) {
  const text = buildSiteFindings(s, { seed: label }) ?? '';
  ok(!!text && salesStyleProblems(text).length === 0, 'site findings (' + label + ') pass the house style');
}
for (const kind of ['strong', 'content', 'clean'] as const) {
  const msg = suggestedMessage(eesHeadline(), selectCardFindings(eesResearch(kind)), true);
  ok(salesStyleProblems(msg, eesHeadline().competitors).length === 0, 'prospect-preview message (' + kind + ') passes the house style');
}

console.log('── 4. THE WARM-REPLY FALLBACK ──');
{
  for (const t of TRADES) {
    const ctx = buildReplyContext({
      businessName: t.name, contactFirstName: null, trade: t.trade, town: t.town, website: t.website,
      latest: { id: 'in1', direction: 'inbound', text: 'what do you mean?', at: '2026-09-30T09:00:00Z' },
      thread: [{ id: 'in1', direction: 'inbound', text: 'what do you mean?', at: '2026-09-30T09:00:00Z' }],
      research: null, audit: null, salesFacts: {}, reportUrl: null, hookTemplate: 'audit_followup_call', variant: 0, avoidText: null,
    });
    const fb = fallbackReply(ctx) ?? '';
    ok(!!fb && salesStyleProblems(fb).length === 0 && /^i asked ai for (a|an) /.test(fb), t.trade + ': fallback reply is plain and leads from the search');
  }
}

console.log('── 5. THE VOICE-NOTE CHECK REFUSES FILLER ON THE SEARCH ──');
{
  const ev: VoiceNoteEvidence = { questionIndex: 0, question: 'reliable electrician for commercial work in Woking UK', engine: 'gemini', engineLabel: 'Google AI', competitors: ['BETEC Electrical Contractors', 'Big Green Electrical', 'EA Electrical Ltd'], answerExcerpt: '', thin: false };
  const site: VoiceNoteSite = { mode: 'clean', findings: [], source: 'own_site', sourceLabel: null, services: [], serviceEvidence: '' };
  // The real v2 script from 2026-09-27 (voice_note_scripts), opening line.
  const old = 'hi mate, i was trying to find a reliable electrician for commercial work in Woking and asked Google AI. it came up with BETEC Electrical Contractors, Big Green Electrical, and EA Electrical Ltd, but you didn\'t come up.\ni had a look at what might be holding you back, and nothing\'s obviously broken on the site, but there\'s a few things i\'d tighten up around how clearly it tells AI what you do and where.\ni actually specialise in AI visibility for local businesses.\nquick one mate, do you own and control the website yourself, or is it managed by an agency?';
  const plain = old.replace('i was trying to find a reliable electrician for commercial work in Woking and asked Google AI', 'i asked Google AI for an electrician in Woking');
  ok(checkVoiceNoteScript(old, { evidence: ev, site, town: 'Woking', trade: 'Electricians', business: 'JG Electrics' }).problems.some((p) => /filler adjective on the search/.test(p)), 'the real "reliable electrician" line is now sent back');
  ok(checkVoiceNoteScript(plain, { evidence: ev, site, town: 'Woking', trade: 'Electricians', business: 'JG Electrics' }).problems.length === 0, 'the plain version passes every check');
}

console.log('── 6. THE HOOK ASKS GENUINE SEARCHES ──');
{
  const generated = [
    'Can you recommend a reliable electrician in Addlestone UK?',
    'trusted electrician for rewiring in Addlestone UK',
    'highly rated electrician in Addlestone UK',
    'Can you recommend an electrician in Addlestone UK?',
    'emergency electrician in Addlestone UK',
    'who is the best electrician in Addlestone UK',
  ];
  const plan = planHookQuestions(generated, { town: 'Addlestone' });
  ok(plan.length === 3 && plan.every((q) => searchFillerCount(q) === 0), 'the plan takes the plain searches over "reliable / trusted / highly rated" ones: ' + JSON.stringify(plan));
  const filler = planHookQuestions(['reliable plumber in Rugby UK', 'trusted plumber in Rugby UK'], { town: 'Rugby' });
  ok(filler.length === 2, 'a set that is all filler still plans (never refuses to run; the words asked are stored as asked)');
  const topped = topUpHookQuestions([], { trade: 'Electricians', place: 'Addlestone UK' });
  ok(topped.length === 3 && topped.every((q) => searchFillerCount(q) === 0 && !/recommended local/i.test(q)), 'the fallback questions are plain: ' + JSON.stringify(topped));
}

if (f > 0) { console.log('\n' + f + ' FAILURE' + (f === 1 ? '' : 'S')); process.exit(1); }
console.log('\nALL PASS');
