/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CALL SCRIPT (Paul's tested opener, 2026-10-06) — src/lib/callScript.ts via coldCallPlaybook.ts.

   Pinned here, case by case:
     · plumber, three competitors, real website issues  · electrician, no strong website issue
     · no competitor in the result                      · only one competitor
     · no website                                       · the agency path, the high-cost price angle
     · the self-managed path
   And for every case: the script NEVER says "Paul from Findable", "I messaged you", a prior WhatsApp day
   or date, a website finding the crawl did not make, or a competitor the stored answer did not name.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { buildColdCallPlaybook, type PlaybookInput, type PlaybookMessage, type PlaybookReport } from '../src/lib/coldCallPlaybook.ts';
import {
  AGENCY_CONTRACT_QUESTION, AGENCY_COST_QUESTION, AGENCY_PRICE_ANGLE_OVER_GBP, FIRST_QUESTION, MAX_SPOKEN_FINDINGS, PRICE_ANGLE_LINE,
  afterFirstQuestion, noStrongIssueLine, priceAngleApplies, spokenFinding, spokenScriptText, type CallScript,
} from '../src/lib/callScript.ts';
import { CRAWL_CHECK_VERSION, type CrawlSignals } from '../src/lib/crawlCheck.ts';
import { FINDABLE_MONTHLY_GBP } from '../src/lib/findableOffer.ts';
import { salesStyleProblems } from '../src/lib/salesStyle.ts';

let f = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };

const NOW = Date.parse('2026-10-06T10:00:00Z');
const DAY = 86_400_000;

const CLEAN: CrawlSignals = {
  homeUrl: 'https://example-trade.co.uk/', fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot',
  clientRendered: { flagged: false, visibleChars: 4000, htmlBytes: 30000, appShell: false },
  missingH1: true, noJsonLd: true, duplicates: null, thinPages: 0,
};
/** Three real findings: AI crawlers blocked, near-duplicate town pages, thin service pages. */
const ISSUES: CrawlSignals = {
  ...CLEAN, searchBlocked: ['OAI-SearchBot', 'PerplexityBot'],
  duplicates: { clusterSize: 9, sampleSize: 10, similarityPct: 93 },
  thinPages: 2, thinPageUrls: ['https://example-trade.co.uk/boiler-repair/', 'https://example-trade.co.uk/bathrooms/'],
  checkedPages: [{ url: 'https://example-trade.co.uk/boiler-repair/', kind: 'service', words: 70, hasH1: true, readable: true }, { url: 'https://example-trade.co.uk/bathrooms/', kind: 'service', words: 64, hasH1: true, readable: true }],
};
const crawl = (signals: CrawlSignals) => ({ result: { version: CRAWL_CHECK_VERSION, signals }, createdAtMs: NOW - DAY });
const gap = (q: string, rivals: string[], engineLabel = 'Gemini'): PlaybookReport => ({ hook: { questionsTested: 3, gap: { question: q, engineLabel, namedInstead: rivals, answerExcerpt: '' }, tested: [] } });

function input(o: { name: string; trade: string; town: string; website: string | null; rivals: string[]; signals: CrawlSignals | null; messages?: PlaybookMessage[]; engine?: string }): PlaybookInput {
  return {
    lead: { id: 'lead-' + o.name, business_name: o.name, phone: '07700 900000', website: o.website, category: o.trade, derived_town: o.town, status: 'contacted' },
    reportAudit: { id: 'aud-' + o.name, short_code: 'abc123', created_at: new Date(NOW - DAY).toISOString(), business_name: o.name, business_type: o.trade, location_text: o.town + ' UK' },
    report: gap(`${o.trade.toLowerCase()} in ${o.town} UK`, o.rivals, o.engine),
    runCrawls: [], leadCrawl: o.signals ? crawl(o.signals) : null, messages: o.messages ?? [], nowMs: NOW, callerName: 'Paul James',
  };
}

const NEVER = /Paul from Findable|from Findable|I messaged you|messaged you|on WhatsApp|quicker to explain on the phone|on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|yesterday|earlier today|\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i;

/** The rules every script must keep, whatever the evidence. */
function invariants(label: string, s: CallScript, findingsAllowed: string[], rivals: string[], business: string) {
  const said = spokenScriptText(s);
  ok(!NEVER.test(said), `${label}: never "from Findable", "I messaged you", WhatsApp or a day/date${NEVER.test(said) ? ' — found "' + said.match(NEVER)![0] + '"' : ''}`);
  ok(/^Hi mate, /.test(s.opener[0]), `${label}: opens "Hi mate, …"`);
  ok(!/Gemini/.test(said), `${label}: the spoken script says Google AI, never Gemini`);
  ok(s.firstQuestion.question === FIRST_QUESTION, `${label}: the FIRST question is always "${FIRST_QUESTION}"`);
  /* Website points: every finding line said is a finding the crawl made (or the honest no-fault line). */
  const allowed = new Set([...findingsAllowed, noStrongIssueLine(true), noStrongIssueLine(false)]);
  const findingLines = s.found.lines.map((l) => l.replace(/^And (\w)/, (_, c: string) => c.toUpperCase()));
  ok(s.found.lines.length <= MAX_SPOKEN_FINDINGS, `${label}: at most ${MAX_SPOKEN_FINDINGS} website points`);
  ok(findingLines.every((l) => allowed.has(l) || /a lot less for AI to go on/.test(l)), `${label}: no invented website finding`);
  /* Competitors: whatever follows "it mentioned" is exactly the stored answer's names, in order, max three. */
  const m = s.opener[0].match(/it mentioned (.+), but not you\./);
  const expected = rivals.filter((r) => r.toLowerCase() !== business.toLowerCase()).slice(0, 3);
  const joined = expected.length <= 1 ? (expected[0] ?? '') : expected.slice(0, -1).join(', ') + ' and ' + expected[expected.length - 1];
  ok(m ? m[1] === joined : expected.length === 0, `${label}: competitors are exactly the stored answer's (${expected.length ? joined : 'none'}) — none invented`);
  ok(salesStyleProblems(said, rivals).length === 0, `${label}: passes the house style ${JSON.stringify(salesStyleProblems(said, rivals))}`);
  ok(s.objections.every((o) => o.answer.split(/(?<=[.?!])\s+/).length <= 5), `${label}: every objection answer is short enough to say mid-call`);
}

console.log('── 1. PLUMBER, THREE COMPETITORS, REAL WEBSITE ISSUES ──');
{
  const rivals = ['Brian Slattery Plumbers', 'Sunnybank Plumbing', 'Calder Heating', 'Elland Drains'];
  const p = buildColdCallPlaybook(input({ name: 'Rugby Plumbing Co', trade: 'Plumbers', town: 'Rugby', website: 'https://example-trade.co.uk', rivals, signals: ISSUES }));
  const s = p.script;
  ok(s.opener[0] === 'Hi mate, I was looking for a plumber in Rugby, so I asked Google AI and it mentioned Brian Slattery Plumbers, Sunnybank Plumbing and Calder Heating, but not you.', 'the opener, in Paul\'s structure, with the first three REAL names: ' + s.opener[0]);
  ok(s.opener[1] === "I had a look into why they were being named and you weren't, and I found a few potential reasons.", 'then: "I had a look into why … a few potential reasons."');
  ok(p.findings.length >= 2 && s.found.lines.length === Math.min(p.findings.length, MAX_SPOKEN_FINDINGS), 'WHAT WE FOUND says the crawl\'s own findings (' + s.found.lines.length + ')');
  ok(s.found.lines.length < 2 || /^And /.test(s.found.lines[s.found.lines.length - 1]), '…the last one introduced with "And"');
  ok(s.found.lines.some((l) => /turning away some of the AI search crawlers/.test(l)), '…in plain words (blocked crawlers), no jargon');
  ok(s.bridge[0].startsWith('More people are using AI to find local businesses now, and this is exactly what we specialise in') && /much better chance of showing up in those answers/.test(s.bridge[1]), 'then the bridge and the offer to explain');
  invariants('plumber', s, p.findings.map((x) => spokenFinding(x)), rivals, 'Rugby Plumbing Co');
}

console.log('── 2. ELECTRICIAN, NO STRONG WEBSITE ISSUE ──');
{
  const rivals = ['Leeds Sparks', 'Volt Electrical'];
  const p = buildColdCallPlaybook(input({ name: 'Bright Electrics', trade: 'Electrician', town: 'Leeds', website: 'https://example-trade.co.uk', rivals, signals: CLEAN }));
  const s = p.script;
  ok(p.findings.length === 0, 'the crawl found nothing strong');
  ok(s.found.lines.length === 1 && s.found.lines[0] === noStrongIssueLine(true), 'it says so honestly — "' + s.found.lines[0] + '"');
  ok(/do not invent one/.test(s.found.note ?? ''), 'and the rep is told not to invent one');
  ok(s.opener[1] === "I had a look into why they were being named and you weren't.", 'no "I found a few potential reasons" when nothing was found');
  invariants('electrician', s, [], rivals, 'Bright Electrics');
}

console.log('── 3. NO COMPETITOR IN THE RESULT ──');
{
  const p = buildColdCallPlaybook(input({ name: 'Canterbury Locks', trade: 'Locksmith', town: 'Canterbury', website: 'https://example-trade.co.uk', rivals: [], signals: ISSUES }));
  const s = p.script;
  ok(s.opener[0] === "Hi mate, I was looking for a locksmith in Canterbury, so I asked Google AI, and you didn't come up in the answer it gave.", 'no names → a line that needs none: ' + s.opener[0]);
  ok(!/mentioned/.test(s.opener.join(' ')) && /I had a look into why you weren't coming up/.test(s.opener[1] ?? ''), '…and "why you weren\'t coming up", never "why they were being named"');
  invariants('no competitor', s, p.findings.map((x) => spokenFinding(x)), [], 'Canterbury Locks');
}

console.log('── 4. ONLY ONE COMPETITOR ──');
{
  const p = buildColdCallPlaybook(input({ name: 'Dover Driving School', trade: 'Driving instructors', town: 'Dover', website: 'https://example-trade.co.uk', rivals: ['Pass First Dover'], signals: CLEAN }));
  ok(/it mentioned Pass First Dover, but not you\.$/.test(p.script.opener[0]), 'one name, said once, no "and": ' + p.script.opener[0]);
  invariants('one competitor', p.script, [], ['Pass First Dover'], 'Dover Driving School');
}

console.log('── 5. NO WEBSITE ──');
{
  const rivals = ['Shrewsbury Accountants', 'Taylor & Co'];
  const p = buildColdCallPlaybook(input({ name: 'Smith Accounts', trade: 'Accountants', town: 'Shrewsbury', website: null, rivals, signals: null }));
  const s = p.script;
  ok(/the first thing I noticed is I couldn't find a website for you\.$/.test(s.opener[1] ?? ''), 'the opener says there is no website: ' + s.opener[1]);
  ok(s.found.lines.length === 1 && /a lot less for AI to go on/.test(s.found.lines[0]) && !/can'?t|cannot|never/.test(s.found.lines[0]), 'never "AI cannot name a business without a website"');
  ok(/Findable Build conversation/.test(s.firstQuestion.hint ?? ''), 'the first question is still asked, with a Build hint for the rep');
  ok(s.price.routes.map((r) => r.route).join() === 'build', 'only Build is priced (Optimise needs their own site)');
  invariants('no website', s, [], rivals, 'Smith Accounts');
}

console.log('── 6. THE AGENCY PATH ──');
{
  const a = afterFirstQuestion('agency');
  ok(a.say[0] === AGENCY_CONTRACT_QUESTION && a.say[1] === AGENCY_COST_QUESTION, 'agency → "Are you still tied into a contract…" then "roughly what are you paying them?"');
  ok(AGENCY_CONTRACT_QUESTION === 'Are you still tied into a contract with them?' && AGENCY_COST_QUESTION === "If you don't mind me asking, roughly what are you paying them?", 'in Paul\'s words');
  ok(a.priceAngle === null && a.next === 'discovery', 'no price angle until a figure is known; then on to discovery');
  const s = buildColdCallPlaybook(input({ name: 'X', trade: 'Plumbers', town: 'Rugby', website: 'https://example-trade.co.uk', rivals: ['A Plumbing'], signals: CLEAN })).script;
  ok(s.ifAgency.questions.join('|') === [AGENCY_CONTRACT_QUESTION, AGENCY_COST_QUESTION].join('|'), 'the script\'s agency section asks the same two');
  ok(s.ifAgency.coaching.some((l) => /Never knock their agency/.test(l)) && s.ifAgency.coaching.some((l) => /lightly/.test(l)), '…with coaching: ask lightly, never knock the agency');
}

console.log('── 7. HIGH AGENCY COST → THE PRICE ANGLE ──');
{
  ok(AGENCY_PRICE_ANGLE_OVER_GBP === 100, 'the threshold is about £100 a month');
  ok(afterFirstQuestion('agency', 250).priceAngle === PRICE_ANGLE_LINE, '£250 a month → the price angle is offered');
  ok(PRICE_ANGLE_LINE === "That's useful to know. Depending on what they're actually doing for you, we may be able to improve the AI side and still come in cheaper than what you're paying now.", '…in Paul\'s words, with "may", never a claim of cheaper');
  ok(afterFirstQuestion('agency', 100).priceAngle === null && afterFirstQuestion('agency', 60).priceAngle === null, '£100 or less → no price angle');
  ok(afterFirstQuestion('agency', Number.NaN).priceAngle === null && !priceAngleApplies(null), 'an unreadable figure → no price angle (absence never means yes)');
  ok(!priceAngleApplies(FINDABLE_MONTHLY_GBP), 'never at or below our own monthly — the angle can never claim cheaper when it is not');
  ok(afterFirstQuestion('self', 500).priceAngle === null, 'a self-managed site never gets the price angle');
  ok(!/disappoint|rip|overcharg|useless|bad agency|cowboy/i.test(PRICE_ANGLE_LINE), 'no disparaging of the agency');
}

console.log('── 8. THE SELF-MANAGED PATH ──');
{
  const a = afterFirstQuestion('self');
  ok(a.say.length === 1 && /with your access we can work on the site directly/.test(a.say[0]) && a.next === 'discovery', 'self-managed → straight to discovery: "' + a.say[0] + '"');
  ok(!a.say.some((l) => /contract|paying/.test(l)), '…and never the agency questions');
}

console.log('── 9. AN EARLIER WHATSAPP NEVER REACHES THE WORDS ──');
{
  const messages: PlaybookMessage[] = [
    { id: 'm1', created_at: new Date(NOW - 4 * DAY).toISOString(), direction: 'outbound', body: 'Hi, quick one', template_name: null, status: 'read', message_type: 'text' },
    { id: 'm2', created_at: new Date(NOW - 3 * DAY).toISOString(), direction: 'inbound', body: "who's this?", template_name: null, status: 'received', message_type: 'text' },
  ];
  const rivals = ['Brian Slattery Plumbers', 'Sunnybank Plumbing'];
  const p = buildColdCallPlaybook(input({ name: 'Halifax Pipeworks', trade: 'Plumbers', town: 'Halifax', website: 'https://example-trade.co.uk', rivals, signals: ISSUES, messages }));
  ok(p.mode === 'follow_up' && /been in touch with them before/.test(p.script.openerNote ?? ''), 'the rep is told in a note that they have been in touch');
  invariants('after a WhatsApp', p.script, p.findings.map((x) => spokenFinding(x)), rivals, 'Halifax Pipeworks');
  ok(!NEVER.test(p.gatekeeper + ' ' + p.voicemail), 'gatekeeper and voicemail never mention Findable by "from Findable" or an earlier message either');
}

console.log('── 10. THE PRICE AND OBJECTIONS SAY v4 ──');
{
  const s = buildColdCallPlaybook(input({ name: 'X', trade: 'Plumbers', town: 'Rugby', website: 'https://example-trade.co.uk', rivals: ['A Plumbing'], signals: CLEAN })).script;
  const opt = s.price.routes.find((r) => r.route === 'optimise')!;
  const bld = s.price.routes.find((r) => r.route === 'build')!;
  ok(/6 payments in total, then they stop/.test(opt.summary) && /After the 6th payment the payments stop/.test(opt.spoken.join(' ')) && !/29\.99/.test(opt.summary + opt.spoken.join(' ')), 'Optimise: £99 today, then £99/month, 6 payments in total, then the payments stop — no £29.99');
  ok(/12 payments in total, then £29\.99\/month/.test(bld.summary) && /the site is yours, and it carries on at £29\.99 a month for hosting and monitoring until you cancel/.test(bld.spoken.join(' ')), 'Build: 12 payments, the site is theirs, then £29.99 for hosting and monitoring');
  ok(s.price.timing.join(' ') === '£99 today. Once we\'ve got the access we need, we measure where you are, do the work and send your results at about four weeks. You then have 14 days to claim the £99 back if the number hasn\'t gone up. The first monthly £99 is the day after that.', 'the timing: £99 → access → results → 14-day refund window → first monthly the day after');
  ok(/30 days/.test(s.price.fallbackNote) && /six weeks|6 weeks/.test(s.price.fallbackNote) && /Only if they ask/.test(s.price.fallbackNote), 'the no-access fallback is kept separate, for if they ask');
  ok(s.price.guarantee === "We measure how many of those answers name you before we start, then run the same questions again. If that number hasn't increased, you can claim the initial £99 back within the refund window.", 'the guarantee in Paul\'s plain words');
  ok(!/±|plus or minus|5 ?(pp|percentage points)|noise band/i.test(spokenScriptText(s)), 'no ±5 rule anywhere');
  ok(!/guarantee (you|that you)|will (rank|be named|be recommended|show up)|you'll (definitely|be named)/i.test(spokenScriptText(s)), 'no guaranteed AI recommendation');
  const ans = (q: string) => s.objections.find((o) => o.objection === q)?.answer ?? '';
  ok(/after the 6th there's no ongoing charge/.test(ans('Why six payments?')), 'Why six? — measure, fix, re-measure; no ongoing charge after the sixth');
  ok(/build the new website, host it and look after it through the minimum term/.test(ans('Why twelve payments?')), 'Why twelve? — build, host and maintain through the minimum term');
  ok(/On Optimise, nothing — after the 6th £99 payment the payments stop\. On Build, it's £29\.99 a month after that for hosting and monitoring, until you cancel\./.test(ans('What happens after?')), 'What happens after? — Optimise nothing; Build £29.99');
  ok(/^Fair enough — what do they look after for you at the moment\? Are you still in a contract with them, and roughly what does it cost\?/.test(ans('I already have an agency')), 'I already have an agency — asks before answering');
  ok(ans('I need to think about it') === "Of course — is it mainly the price, the timing, or you're just not sure what we'd actually be doing?", 'I need to think about it — no pressure, Paul\'s line');
  ok(/written agreement before you pay/.test(ans('Is this a scam?')) && !/registered|accredited|certified|ICO|Companies House|award/i.test(ans('Is this a scam?')), 'Is this a scam? — only verifiable things, no invented credentials');
  ok(/6 payments on Optimise, 12 on Build, including today/.test(ans('Can I cancel?')) && /Optimise just stops/.test(ans('Can I cancel?')), 'Can I cancel? — the accurate minimum term per plan');
  ok(s.whatWeDo.say === "We measure where you're showing up now, fix the public evidence around the business and the website, then ask the same customer-style questions again after four weeks.", 'WHAT WE DO in one sentence');
  ok(/20 approved customer-style questions/.test(s.whatWeDo.ifAsked.join(' ')) && /exactly the same questions again/.test(s.whatWeDo.ifAsked.join(' ')), '…the 20 questions and the same questions at re-measure, only if they ask');
}

console.log('── 11. THE SCREEN ──');
{
  const ui = readFileSync(new URL('../src/components/ColdCallPlaybook.tsx', import.meta.url), 'utf8');
  const ids = ['call-step-open', 'call-step-found', 'call-step-first', 'call-step-agency', 'call-step-ask', 'call-step-explain', 'call-step-close', 'call-step-objections'];
  const at = ids.map((id) => ui.indexOf(`data-testid="${id}"`));
  ok(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1])), 'sections in order: OPENER → WHAT WE FOUND → FIRST QUESTION → IF THEY USE AN AGENCY → DISCOVERY → WHAT WE DO → PRICE → OBJECTIONS');
  for (const label of ['Opener', 'What we found', 'First question', 'If they use an agency', 'Discovery', 'What we do', 'Price', 'Objections', 'Price angle']) ok(ui.includes(`>${label}<`), 'labelled: ' + label);
  ok(/afterFirstQuestion\(manager, /.test(ui) && /data-testid="agency-monthly"/.test(ui), 'the agency answer and the £ figure drive the price angle through the one tested function');
  const src = ui.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/invoke|\.insert\(|\.update\(|\.upsert\(|fetch\(/.test(src.slice(src.indexOf('function CallFlow'), src.indexOf('function CallCard'))), 'the call flow saves, sends and charges nothing');
}

if (f > 0) { console.log('\n' + f + ' FAILURE' + (f === 1 ? '' : 'S')); process.exit(1); }
console.log('\nALL PASS');
