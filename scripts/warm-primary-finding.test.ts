/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WARM REPLY — THE STRONGEST FINDING MUST SHAPE THE REPLY (Paul, 2026-09-25).

   The live drafts on Ryli Heat said "the opening hours aren't consistent" and "mixed signals about
   where you operate" with "9AM–9PM / 9AM–9AM / Open 24 hours" and "nationwide across England" vs
   "Scunthorpe-based" in front of them. Pinned here:
     1. RANKING — specific, measured, sales-relevant findings outrank vague or trivial ones, whatever
        source they came from (live site, full crawl, crawl check, model reading).
     2. PRIMARY FINDING — chosen before the model writes, 1 primary + at most 2 secondary.
     3. VALIDATION — a draft that does not carry the primary's substance is a problem: rewritten once
        with Paul's instruction, then shown as CHECK THIS DRAFT.
     4. The Ryli Heat regression and cases A–E from the brief.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  assembleResearch, extractPageFacts, findingScore, rankFindings, KIND_RELEVANCE,
  type AuditContext, type CrawlRowInput, type ResearchFinding, type WarmLeadResearch,
} from '../src/lib/warmLeadResearch.ts';
import {
  selectReplyFindings, findingMentioned, buildReplyContext, buildReplyPrompt, checkReply, latestInbound,
  PRIMARY_MISSING_PROBLEM, PRIMARY_REWRITE_INSTRUCTION, MAX_SECONDARY_FINDINGS, type ThreadMessage,
} from '../src/lib/warmReply.ts';
import { FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_TOTAL_PAYMENTS } from '../src/lib/findableOffer.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FN = read('supabase/functions/warm-lead-reply/index.ts');
const UI = read('src/components/WarmReplyAssistant.tsx');

const NOW = Date.parse('2026-09-25T12:00:00Z');
const NOW_ISO = new Date(NOW).toISOString();
const MIN = 60_000;
const at = (m: number) => new Date(NOW - m * MIN).toISOString();
const page = (html: string, url: string) => extractPageFacts(html, url, url, 200, true);
const research = (html: string, url: string, extra: Partial<Parameters<typeof assembleResearch>[0]> = {}): WarmLeadResearch => assembleResearch({
  nowIso: NOW_ISO, website: url, businessName: 'Test Co', trade: 'plumber', town: 'Scunthorpe', pages: [page(html, url)],
  crawl: null, audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026, ...extra,
});
const auditGap: AuditContext = { auditId: 'a', reportUrl: 'https://findable.live/r/ABC123', createdAt: at(200), trade: 'plumber', town: 'Scunthorpe',
  competitors: ['JC Plumbing & Heating', "Paul's plumbing services", 'James Broadbent Plumbing and Heating'], namedEverywhere: false, namedDatapoints: 0, totalDatapoints: 3, unavailableReason: null };
const HOOK = "Hi mate, i was looking for a plumber in Scunthorpe so i asked AI and it mentioned JC Plumbing & Heating, Paul's plumbing services and James Broadbent Plumbing and Heating";
const threadFor = (question: string, extra: ThreadMessage[] = []): ThreadMessage[] => [
  { id: 'o1', direction: 'outbound', text: 'Hey, are you taking on more jobs atm? Cheers', at: at(300) },
  { id: 'i1', direction: 'inbound', text: 'Yeah', at: at(280) },
  { id: 'h1', direction: 'outbound', text: HOOK, at: at(240) },
  ...extra,
  { id: 'i2', direction: 'inbound', text: question, at: at(30) },
];
const ctxFor = (r: WarmLeadResearch | null, question = 'How much', extra: ThreadMessage[] = [], audit: AuditContext | null = auditGap) => {
  const thread = threadFor(question, extra);
  return buildReplyContext({ businessName: 'Ryli Heat', contactFirstName: null, trade: 'Plumbers', town: 'Scunthorpe', website: 'https://www.ryliheat.co.uk/',
    latest: latestInbound(thread)!, thread, research: r, audit, salesFacts: {}, reportUrl: audit?.reportUrl ?? null, hookTemplate: 'audit_followup_call', hookAt: at(240), variant: 0, avoidText: null });
};

/* ─────────── 1. the Ryli Heat fixture (the real site's words) ─────────── */
const RYLI = `<html><head><title>Home - Ryli Heat</title></head><body>
<div>ECO Grant Resources 9AM - 9PM admin@ryliheat.co.uk 07908 046839</div>
<nav><a href="https://www.ryliheat.co.uk/heating-grants/">Heating Grants</a><a href="https://www.ryliheat.co.uk/insulation-grants/">Insulation Grants</a>
<a href="https://www.ryliheat.co.uk/air-source-heat-pumps/">Heat Pumps</a><a href="https://www.ryliheat.co.uk/solar-pv/">Solar PV</a><a href="https://www.ryliheat.co.uk/contact-us/">Contact Us</a></nav>
<h1>Quality Heating &amp; Plumbing  Service</h1>
<p>Reliable Heating &amp; Plumbing Solutions. We ensure that your heating/boiling and plumbing systems nationwide across England are operating at peak performance.</p>
<footer>Business Hours Open 24 hours. Ryli Heat is a Scunthorpe-based heating and plumbing specialist offering boiler installation.
44 Churchfield Rd, Ashby, Scunthorpe DN16 3DH 9AM - 9AM 2023 © Copyright - Ryli Heat | Website Designed and Hosted by Keyhole IT Solutions ltd</footer></body></html>`;
const ryli = research(RYLI, 'https://www.ryliheat.co.uk/', { businessName: 'Ryli Heat', trade: 'Plumbers', audit: auditGap });
const sel = selectReplyFindings(ryli, threadFor('How much'), 'Scunthorpe', at(240));
ok(sel.primary?.kind === 'positioning_conflict' || sel.primary?.kind === 'hours_conflict', `Ryli: the primary is the positioning or hours conflict (got ${sel.primary?.id})`);
ok(sel.secondary.length <= MAX_SECONDARY_FINDINGS && sel.secondary.some((x) => x.kind === 'hours_conflict' || x.kind === 'positioning_conflict'), 'Ryli: the other conflict is a supporting finding');
ok(!sel.primary || !['ai_visibility', 'provider_attribution'].includes(sel.primary.kind), 'Ryli: the vague AI-visibility result and the Keyhole credit are never the primary');
const vis = [...ryli.localVisibilityFindings].find((x) => x.kind === 'ai_visibility')!;
const hours = [...ryli.contentFindings].find((x) => x.kind === 'hours_conflict')!;
const pos = [...ryli.localVisibilityFindings].find((x) => x.kind === 'positioning_conflict')!;
ok(findingScore(hours) > findingScore(vis) && findingScore(pos) > findingScore(vis), `specific evidence outranks "low AI visibility" (${findingScore(pos)}, ${findingScore(hours)} > ${findingScore(vis)})`);
ok(JSON.stringify(hours.keyDetails) === JSON.stringify(['9AM - 9PM', '9AM - 9AM', 'Open 24 hours']), 'the hours finding keeps the three actual claims');
ok(pos.keyDetails?.[0] === 'nationwide across England' && pos.keyDetails?.[1] === 'Scunthorpe-based', `the positioning finding keeps the two actual phrases (${JSON.stringify(pos.keyDetails)})`);

const ctx = ctxFor(ryli);
const prompt = buildReplyPrompt(ctx);
ok(ctx.primaryRequired === true, 'a price question with strong evidence requires the primary finding');
ok(/PRIMARY FINDING — YOU MUST REFER TO THIS IN THE RESPONSE/.test(prompt), 'the model is told it MUST refer to the primary finding');
ok(prompt.includes(`[${sel.primary!.id}]`) && sayableDetailsIn(prompt, sel.primary!), 'the primary finding and its concrete details are in the prompt');
ok(/ORDER: price → guarantee → "I had a look through your site as well\. The biggest thing I noticed is …"/.test(prompt), 'price first, guarantee, then the primary finding — never opening with the issue');
ok(/Never water it down to "a few inconsistencies"/.test(prompt), 'the prompt forbids watering it down');
ok(!prompt.includes('https://findable.live/r/ABC123'), 'the report link is still withheld for a price question');

function sayableDetailsIn(p: string, x: ResearchFinding) { return (x.keyDetails ?? []).every((d) => p.includes(d)); }

// The regression the brief names: generic words FAIL when stronger evidence exists.
const price = `£${FINDABLE_SETUP_PRICE_GBP} to start mate, then £${FINDABLE_MONTHLY_GBP} a month from week 6, ${FINDABLE_TOTAL_PAYMENTS} payments in total. If your measured AI visibility hasn't gone up at the four-week re-measure, you can claim the first £${FINDABLE_SETUP_PRICE_GBP} back.`;
const tail = `Full details: https://findable.live/\n\nDo you own the site yourself, or is it managed by Keyhole who built it?`;
const GENERIC = `${price}\n\nI had a look through your site as well and there are a few inconsistencies on your site.\n\n${tail}`;
ok(checkReply(GENERIC, ctx).problems.includes(PRIMARY_MISSING_PROBLEM), '"there are a few inconsistencies on your site" FAILS');
const LIVE_DRAFT = `${price}\n\nI noticed that your website gives mixed signals about where you operate, and the opening hours aren't consistent either.\n\n${tail}`;
const live = checkReply(LIVE_DRAFT, ctx);
ok(sel.primary!.kind !== 'positioning_conflict' || live.problems.includes(PRIMARY_MISSING_PROBLEM), 'the actual live draft ("mixed signals about where you operate") FAILS — it lost the specifics');
const GOOD = `${price}\n\nI had a look through your site as well. The biggest thing I noticed is it says you cover "nationwide across England" in one place and calls you Scunthorpe-based in another, so it's not clear where you actually work. It also gives 9AM–9PM, 9AM–9AM and "open 24 hours" in different places.\n\n${tail}`;
const good = checkReply(GOOD, ctx);
ok(good.problems.length === 0, `a concrete, price-first Ryli reply passes (${good.problems.join(' | ') || 'no problems'})`);
ok(!new RegExp('JC Plumbing|James Broadbent').test(GOOD) && !GOOD.includes('findable.live/r/'), 'the good reply repeats no competitor and carries no report link');
ok(checkReply(GOOD.replace('I had a look through your site as well.', 'Also AI can’t read your site.'), ctx).problems.some((p) => /how an AI model decides/.test(p)), 'an absolute AI claim is caught — curly apostrophe included ("AI can’t read")');

// The substance check itself.
ok(findingMentioned('Your site says 9am-9pm in one place and 9am-9am in the footer, and also says open 24 hours.', hours), 'hours: the actual times count as the substance');
ok(!findingMentioned("Your opening hours aren't completely consistent.", hours), 'hours: "aren\'t completely consistent" is NOT the substance');
ok(findingMentioned('Parts of the site say nationwide while other bits say Scunthorpe-based.', pos, 'Scunthorpe'), 'positioning: nationwide + Scunthorpe counts');
ok(!findingMentioned('Your location signals could be clearer.', pos, 'Scunthorpe'), 'positioning: "location signals could be clearer" is NOT the substance');

// "Explain here" / "Tell me more": the primary features prominently.
for (const q of ['Explain here', 'Tell me more', 'How does it work?', 'What would you change?']) {
  const c = ctxFor(ryli, q);
  ok(c.primaryRequired && /make the PRIMARY FINDING the centre of the reply/.test(buildReplyPrompt(c)), `"${q}": the primary finding is the centre of the reply`);
}
ok(!ctxFor(ryli, 'Not interested thanks').primaryRequired, 'a refusal is not forced to carry a website finding');
// Paul has already told them about the primary since the hook → the next best leads.
const toldPos: ThreadMessage = { id: 'p', direction: 'outbound', text: 'Your site says nationwide in one place and Scunthorpe-based in another.', at: at(100) };
const moved = selectReplyFindings(ryli, threadFor('How much', [toldPos]), 'Scunthorpe', at(240));
ok(moved.alreadyMentioned.some((x) => x.kind === 'positioning_conflict') && moved.primary?.kind !== 'positioning_conflict', 'a finding Paul already put to them is not asked for again — the next strongest leads');

/* ─────────── 2. the other regression cases (A–E) ─────────── */
const W = 'https://site.example/';
const CLEAN = `<html><head><title>Emergency Plumber Scunthorpe | Smith Plumbing</title><script type="application/ld+json">{"@type":"Plumber"}</script></head><body>
<nav><a href="/boiler-repair">Boiler repair</a><a href="/emergency-plumber">Emergency</a><a href="/central-heating">Heating</a><a href="/contact">Contact</a></nav>
<h1>Plumber in Scunthorpe</h1><p>Smith Plumbing is based in Scunthorpe. Open 8am - 6pm Monday to Friday. Call 01724 123456.</p></body></html>`;
const full = (tech: Array<{ kind: string; count: number; urls: string[] }>, extra: Record<string, unknown> = {}): CrawlRowInput => ({
  created_at: at(60 * 24), mode: 'full', result: null,
  full_evidence: { version: 2, completeness: 'complete', servedUrl: W, requestedUrl: W, navigation: [{ label: 'Boiler repair', url: `${W}boiler-repair` }, { label: 'Emergency', url: `${W}emergency-plumber` }, { label: 'Contact', url: `${W}contact` }], families: [], technical: tech, ...extra },
});

// A. Wrong canonical domain outranks missing meta descriptions (and any trivia).
const a = research(CLEAN, W, { crawl: full([
  { kind: 'missing_description', count: 30, urls: [`${W}boiler-repair`] },
  { kind: 'canonical_off_site', count: 3, urls: [`${W}boiler-repair → https://old-agency-site.co.uk/boiler-repair`] },
]) });
const sa = selectReplyFindings(a, [], 'Scunthorpe');
ok(sa.primary?.id === 'full:canonical_off_site', `A: the wrong canonical domain is primary (got ${sa.primary?.id})`);
ok(![...a.technicalFindings, ...a.contentFindings].some((x) => /description/i.test(x.title)), 'A: missing meta descriptions are not even a finding');
ok(sa.primary?.keyDetails?.includes('old-agency-site.co.uk') === true, 'A: the other domain is the concrete detail');

// B. Crawlers blocked → primary.
const b = research(CLEAN, W, { crawl: { created_at: at(60), result: { version: 99, signals: { homeUrl: W, fetchFailed: false, searchBlocked: ['OAI-SearchBot', 'PerplexityBot'], readableAs: 'ChatGPT-User', clientRendered: null, missingH1: false, noJsonLd: true, duplicates: null, thinPages: 0 } } } as never });
const sb = selectReplyFindings(b, [], 'Scunthorpe');
ok(sb.primary?.kind === 'crawl_indexing' && sb.primary.strength === 5, `B: blocked crawlers are primary (got ${sb.primary?.id})`);
ok(JSON.stringify(sb.primary?.keyDetails) === JSON.stringify(['OAI-SearchBot', 'PerplexityBot']), 'B: the blocked crawlers are named as the detail');
ok(findingMentioned('Your site is blocking the crawlers ChatGPT search uses.', sb.primary!), 'B: "blocking the crawlers" is the substance');

// C. Technically healthy, weak service architecture → service architecture is primary.
const WEAK = `<html><head><title>Plumber Scunthorpe | Weak Co</title><script type="application/ld+json">{"@type":"Plumber"}</script></head><body>
<nav><a href="/about">About</a><a href="/gallery-page">Gallery</a><a href="/testimonials">Reviews</a><a href="/contact">Contact</a></nav>
<h1>Plumber in Scunthorpe</h1><p>We are based in Scunthorpe. Call 01724 123456.</p></body></html>`;
const c = research(WEAK, W);
const sc = selectReplyFindings(c, [], 'Scunthorpe');
ok(c.technicallyClean && sc.primary?.kind === 'missing_core_service_pages', `C: healthy site, weak service architecture → that is primary (got ${sc.primary?.id})`);

// D. No meaningful website issue → nothing invented; the audit gap is the story.
const d = research(CLEAN, W, { audit: auditGap });
const cd = ctxFor(d);
ok(cd.selection.primary === null && cd.primaryRequired === false, 'D: a clean site has no primary finding — none is invented');
ok(/No website finding is specific enough to lead with\. Do NOT invent one\. If it helps, explain the gap using the AI VISIBILITY result instead\./.test(buildReplyPrompt(cd)), 'D: the reply explains the gap from the AI audit instead');
ok(!checkReply(`${price}\n\nWhen we asked AI for a plumber in Scunthorpe you weren't named in any of the 3 answers.\n\n${tail}`, cd).problems.includes(PRIMARY_MISSING_PROBLEM), 'D: no "finding not used" problem when there is no finding');

// E. Multiple strong issues → the strongest + at most two supporting, the rest listed as not used.
const MANY = RYLI.replace('<head>', '<head><meta name="robots" content="noindex">').replace('07908 046839', '07908 046839 01724 111222 01724 333444');
const e = research(MANY, 'https://www.ryliheat.co.uk/', { businessName: 'Ryli Heat', trade: 'Plumbers' });
const se = selectReplyFindings(e, [], 'Scunthorpe');
ok(se.primary?.id === 'rule:noindex', `E: the strongest (noindex homepage) leads (got ${se.primary?.id})`);
ok(se.secondary.length === MAX_SECONDARY_FINDINGS, 'E: exactly two supporting findings');
ok(se.strongNotUsed.length >= 1, `E: the other strong findings are listed as not used (${se.strongNotUsed.map((x) => x.id).join(', ')})`);
ok(new Set([se.primary!.kind, ...se.secondary.map((x) => x.kind)]).size === 1 + se.secondary.length, 'E: primary and supporting findings are different kinds');

// A full-crawl finding is not out-ranked by a weaker issue on today's homepage.
const g = research(`<html><head><title>Home</title></head><body><nav><a href="/boiler-repair">B</a><a href="/emergency">E</a><a href="/contact">C</a></nav><h1>Welcome</h1></body></html>`, W,
  { crawl: full([{ kind: 'noindex', count: 3, urls: [`${W}boiler-repair`, `${W}emergency-plumber`, `${W}privacy-policy`] }]) });
const sg = selectReplyFindings(g, [], 'Scunthorpe');
ok(sg.primary?.id === 'full:noindex', `the full crawl's noindexed service pages beat today's weak homepage title (got ${sg.primary?.id})`);
ok(findingScore(rankFindings([...g.technicalFindings])[0]) >= findingScore(g.technicalFindings.find((x) => x.kind === 'title_h1')!), 'ranking is by score across sources');
ok(KIND_RELEVANCE.structured_data < KIND_RELEVANCE.crawl_indexing && KIND_RELEVANCE.outdated_content === 1, 'trivia sits at the bottom of the relevance table');

/* ─────────── 3. the function and the panel ─────────── */
ok(FN.includes('PRIMARY_REWRITE_INSTRUCTION') && PRIMARY_REWRITE_INSTRUCTION.startsWith('The previous response ignored the strongest evidence. Rewrite it while keeping it conversational and explicitly include the primary website finding'),
  'a draft that ignored the primary is rewritten once with Paul\'s instruction');
ok(/const used = \(f: ResearchFinding\) => findingMentioned\(reply!, f, ctx\.town\);/.test(FN), '"used" is checked against the draft text, never taken from the model\'s claim');
ok(/primaryFinding: sel\.primary \?/.test(FN) && /strongNotUsed: sel\.strongNotUsed\.map\(card\)/.test(FN) && /researchSources:/.test(FN), 'the Why data carries primary, secondary, strong-not-used and sources');
ok(/CHECK THIS DRAFT<\/span> — \{why\.problems\.includes\(PRIMARY_MISSING_PROBLEM\) \? PRIMARY_MISSING_PROBLEM/.test(UI) && PRIMARY_MISSING_PROBLEM === 'Strong website finding was not used.', 'the Inbox shows CHECK THIS DRAFT — Strong website finding was not used.');
for (const label of ['Question detected', 'Primary finding', 'Evidence', 'Secondary findings', 'Strong findings not used', 'Research source']) {
  ok(UI.includes(`label="${label}"`), `Why this reply? shows "${label}"`);
}

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
