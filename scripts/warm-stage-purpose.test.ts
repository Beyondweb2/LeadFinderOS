/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WARM REPLY — WHAT THIS STAGE IS FOR (Paul, 2026-09-25, third pass).

        PROVE THERE IS A REAL ISSUE → SAY WHAT WE CAN DO ABOUT IT → FIND OUT WHO CONTROLS THE WEBSITE

   Pinned here: no price of any kind; it leads from the AI search; it uses the strongest finding with
   its specifics; it offers both routes; it ENDS with the agency/ownership question unless they have
   already told us; it reads like Paul on WhatsApp. The Addlestone electrician case is the regression.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { assembleResearch, extractPageFacts, type AuditContext, type CrawlRowInput } from '../src/lib/warmLeadResearch.ts';
import {
  buildReplyContext, buildReplyPrompt, checkReply, fallbackReply, latestInbound, ruleSalesFacts, mergeSalesFacts,
  aiSearchContext, routeLean, websiteControlKnown, usesDash, REPLY_SYSTEM_PROMPT, PRIMARY_MISSING_PROBLEM,
  type ThreadMessage, type SalesFacts,
} from '../src/lib/warmReply.ts';
import { FINDABLE_SETUP_PRICE_GBP, FINDABLE_OFFER_SUMMARY } from '../src/lib/findableOffer.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FN = read('supabase/functions/warm-lead-reply/index.ts');

const NOW = Date.parse('2026-09-25T12:00:00Z');
const at = (m: number) => new Date(NOW - m * 60_000).toISOString();

/* ─────────── the Addlestone electrician, as Paul described it ─────────── */
const W = 'https://www.example-electrics.co.uk/';
const HOME = `<html><head><title>Electrician Addlestone | Example Electrics</title><script type="application/ld+json">{"@type":"Electrician"}</script></head><body>
<nav><a href="/rewiring">Rewiring</a><a href="/fuse-boards">Fuse boards</a><a href="/eicr-testing">EICR</a><a href="/contact">Contact</a></nav>
<h1>Electrician in Addlestone</h1><p>Example Electrics is based in Addlestone. Call 01932 123456.</p></body></html>`;
const blocked: CrawlRowInput = { created_at: at(60 * 24), result: { version: 99, signals: {
  homeUrl: W, fetchFailed: false, searchBlocked: ['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot'], readableAs: null,
  clientRendered: null, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0,
} } } as never;
const research = assembleResearch({ nowIso: new Date(NOW).toISOString(), website: W, businessName: 'Example Electrics', trade: 'Electricians', town: 'Addlestone',
  pages: [extractPageFacts(HOME, W, W, 200, true)], crawl: blocked, audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026 });
const audit: AuditContext = { auditId: 'a', reportUrl: 'https://findable.live/r/ADD123', createdAt: at(300), trade: 'electrician', town: 'Addlestone',
  competitors: ['Addlestone Electricians', 'Pennington’s Electrical', 'Helsdown Electrical Contractors Ltd'], namedEverywhere: false, namedDatapoints: 0, totalDatapoints: 3, unavailableReason: null };
const HOOK = "Hi mate, i was looking for an electrician in Addlestone so i asked AI and it mentioned Addlestone Electricians, Pennington’s Electrical and Helsdown Electrical Contractors Ltd\n\nI know how to get you showing up more in those answers so people are more likely to find you\n\nHappy to explain it here or jump on a quick call if you'd rather\n\nPaul✌️";
const INBOUND = 'Ahhh ok, so do you need an electrician?\n\nHave you asked who the best electrician in addlestone is?';
const thread: ThreadMessage[] = [
  { id: 'o1', direction: 'outbound', text: 'Hey, are you taking on more jobs atm? Cheers', at: at(400) },
  { id: 'i1', direction: 'inbound', text: 'Yeah', at: at(380) },
  { id: 'h1', direction: 'outbound', text: HOOK, at: at(240) },
  { id: 'i2', direction: 'inbound', text: INBOUND, at: at(30) },
];
const mk = (facts: SalesFacts = {}, t = thread) => buildReplyContext({ businessName: 'Example Electrics', contactFirstName: null, trade: 'Electricians', town: 'Addlestone', website: W,
  latest: latestInbound(t)!, thread: t, research, audit, salesFacts: facts, reportUrl: audit.reportUrl, hookTemplate: 'audit_followup_call', hookAt: at(240), variant: 0, avoidText: null });
const ctx = mk();
const prompt = buildReplyPrompt(ctx);

ok(ctx.latest.text === INBOUND, 'the reply answers their actual message');
ok(ctx.searchContext === 'electrician in Addlestone' && aiSearchContext({ audit: null, trade: 'Electricians', town: 'Addlestone' }) === 'electrician in Addlestone', 'AI search context: "electrician in Addlestone"');
ok(ctx.selection.primary?.kind === 'crawl_indexing' && JSON.stringify(ctx.selection.primary.keyDetails) === JSON.stringify(['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot']), 'primary issue: the four blocked AI crawlers, named');
ok(ctx.primaryRequired, 'the crawler issue must be in the reply');
ok(ctx.askOwnership && ctx.route === 'fix_existing', 'nothing known about the site → the website question; a healthy-looking site → fix-first route');
ok(/AI SEARCH CONTEXT: AI was asked for "electrician in Addlestone"/.test(prompt), 'the prompt carries the AI search context');
ok(/"OAI-SearchBot" \/ "ChatGPT-User" \/ "Claude-User" \/ "PerplexityBot"/.test(prompt), 'the prompt carries the crawler names as details to keep');
ok(/put them right in a friendly way: "nah mate, i was checking what google ai recommends/.test(REPLY_SYSTEM_PROMPT), 'a misread hook ("do you need an electrician?") is put right, friendly');
ok(/LAST LINE: end with the website question/.test(prompt), 'the website question ends it');
ok(!/£\s?\d|refund|guarantee|findable\.live|payments/i.test(prompt.replace(/findable\.live\/r\/ADD123/, '')), 'no price, guarantee or pricing link anywhere in the prompt');

const EXPECTED = `nah mate, i was checking what google ai recommends when someone is looking for an electrician in addlestone and it brought up your competitors instead.

i checked your site to see why and one of the main issues is oai-searchbot, chatgpt-user, claude-user and perplexitybot are blocked from fetching your pages, so a lot of the ai tools can't properly access and understand the site.

that's the sort of thing we fix, either on the site you've already got or we can build you a new one that's properly set up for ai visibility and seo.

are you currently with an agency or do you own/manage the website yourself?`;
const good = checkReply(EXPECTED, ctx);
ok(good.problems.length === 0, `REGRESSION: Paul's expected Addlestone reply passes (${good.problems.join(' | ') || 'no problems'})`);
ok(good.warnings.length === 0, `…with no warnings (${good.warnings.join(' | ') || 'none'})`);
const fb = fallbackReply(ctx)!;
const fbc = checkReply(fb, ctx);
ok(fbc.problems.length === 0 && /OAI-SearchBot/.test(fb) && fb.trim().endsWith('are you currently with an agency or do you own/manage the website yourself?'),
  `the rule-built fallback has the same shape (${fbc.problems.join(' | ') || 'ok'})`);

// Every requirement, broken one at a time.
const breaks: Array<[string, string, RegExp]> = [
  ['mentions the price', EXPECTED.replace('that\'s the sort of thing we fix,', `it's £${FINDABLE_SETUP_PRICE_GBP} to start, that's the sort of thing we fix,`), /carries no price/],
  ['mentions the guarantee', EXPECTED.replace('that\'s the sort of thing', 'and if it doesn\'t work you get a refund, that\'s the sort of thing'), /carries no price/],
  ['quotes the offer', `${FINDABLE_OFFER_SUMMARY}\n\n${EXPECTED}`, /carries no price/],
  ['links findable.live', EXPECTED.replace('seo.', 'seo. https://findable.live/'), /pricing\/details page/],
  ['goes generic on the issue', EXPECTED.replace(/one of the main issues is[^.]*\./, 'there are a few technical issues.'), new RegExp(PRIMARY_MISSING_PROBLEM.replace('.', '\\.'))],
  ['blocks without naming the crawlers', EXPECTED.replace('oai-searchbot, chatgpt-user, claude-user and perplexitybot are', 'some crawlers are'), new RegExp(PRIMARY_MISSING_PROBLEM.replace('.', '\\.'))],
  ['forgets the AI search', EXPECTED.replace(/^nah mate[^\n]*\n\n/, 'nah mate.\n\n'), /AI search/],
  ['offers only a rebuild', EXPECTED.replace('either on the site you\'ve already got or we can build you a new one', 'we can build you a new one'), /both routes/],
  ['does not end with the website question', EXPECTED.replace(/\n\nare you currently[^\n]*$/, '\n\nlet me know.'), /website question/],
  ['uses an em dash', EXPECTED.replace('so a lot of', '— so a lot of'), /dash/],
  ['sounds like a script', `great question! ${EXPECTED}`, /sales-script/],
  ['uses a list', EXPECTED.replace('i checked your site', '- i checked your site'), /list/],
  ['re-lists the hook', EXPECTED.replace('your competitors instead', 'addlestone electricians and helsdown electrical contractors ltd instead'), /repeats the competitor hook/],
];
for (const [label, text, want] of breaks) {
  ok(checkReply(text, ctx).problems.some((p) => want.test(p)), `a draft that ${label} is refused`);
}
ok(!usesDash('open 9AM - 9PM') && usesDash('fine - really') && usesDash('a—b'), 'a hyphen in a quoted time range is not a dash; a dash is');

/* ─────────── ownership already known ─────────── */
const told = [...thread.slice(0, 3), { id: 'i2', direction: 'inbound' as const, text: 'our agency looks after the website, why?', at: at(30) }];
const facts = mergeSalesFacts({}, ruleSalesFacts(told.filter((m) => m.direction === 'inbound')), told).facts;
ok(facts.has_existing_provider?.value === 'yes' && websiteControlKnown(facts), '"our agency looks after the website" is remembered as the answer');
const k = mk(facts, told);
ok(k.askOwnership === false && /WEBSITE QUESTION: they have ALREADY told us \(they said: "our agency looks after the website/.test(buildReplyPrompt(k)), 'the prompt says they already told us, in their words');
ok(checkReply(EXPECTED, k).problems.some((p) => /already told us/.test(p)), 'asking the agency question again is refused');
const noQ = EXPECTED.replace(/\n\nare you currently[^\n]*$/, '\n\nhappy to go through what we’d change on here or on a quick call, whichever suits?');
ok(checkReply(noQ, k).problems.length === 0, `…and a reply that builds on it instead passes (${checkReply(noQ, k).problems.join(' | ') || 'ok'})`);
ok(websiteControlKnown({ owns_website: { value: 'yes', quote: 'i own it', messageId: 'x', at: at(1), source: 'rule' } }), '"i own it" closes the question too');

// The real E.E.S Electrical reply (live, 2026-09-25): the website question is already answered.
const ees = [...thread.slice(0, 3), { id: 'i3', direction: 'inbound' as const, text: 'Someone manages the website for me massive marketing. How did you get my details', at: at(20) }];
const eesFacts = mergeSalesFacts({}, ruleSalesFacts(ees.filter((m) => m.direction === 'inbound')), ees).facts;
ok(eesFacts.has_existing_provider?.value === 'yes' && /Someone manages the website for me/.test(eesFacts.has_existing_provider.quote), '"Someone manages the website for me" is remembered — the agency question is not asked again');
const eesCtx = buildReplyContext({ ...mk(eesFacts, ees), numberSource: 'their number is on their public google business listing, which is where Paul found them' });
ok(eesCtx.askOwnership === false, '…so the reply builds on it instead of asking');
ok(/THEY ASKED HOW YOU GOT THEIR DETAILS: answer it plainly and first: their number is on their public google business listing/.test(buildReplyPrompt(eesCtx)), '"How did you get my details" is answered from the lead row (a Google listing)');
ok(/THEY ASKED HOW YOU GOT THEIR DETAILS: we do not have a recorded source/.test(buildReplyPrompt(mk(eesFacts, ees))), '…and never guessed when the lead row does not prove it');

/* ─────────── the three live drafts of 2026-09-25, as regressions ─────────── */
// (1) E.E.S: today's read got HTTP 429, but the earlier crawl check MEASURED the blocked crawlers.
const failedToday = { ...research, status: 'failed' as const };
const e1 = buildReplyContext({ ...mk(), research: failedToday });
ok(e1.selection.primary?.id.startsWith('crawl:crawler_blocked') === true, 'E.E.S: a failed read today keeps the crawl-measured blocked-crawler finding');
ok(/could not be read today, but an earlier crawl check MEASURED the finding below\. Use ONLY that finding/.test(buildReplyPrompt(e1)), '…and the model is told to use only that');
const failedRules = { ...failedToday, strongestFindings: failedToday.strongestFindings.filter((x) => x.source !== 'crawl'), technicalFindings: failedToday.technicalFindings.filter((x) => x.source !== 'crawl') };
ok(buildReplyContext({ ...mk(), research: failedRules }).selection.primary === null, '…but nothing read (or not read) TODAY is used after a failed read');
const LIVE_EES = "i found your number on your public google business listing, that’s how i got in touch.\n\nwhen i asked AI for an electrician in Addlestone, it mentioned you in one of the answers, but it also highlighted some competitors. one issue is that ai tools can’t properly access your site, which can make it harder for you to show up.\n\nthat’s the sort of thing we fix, either on the site you've already got or we can build you a new one that's properly set up for ai visibility and seo.\n\nif you’re interested in exploring this further, let me know what works for you.";
const noFindingCtx = buildReplyContext({ ...mk(eesFacts, ees), research: failedRules });
ok(checkReply(LIVE_EES, noFindingCtx).problems.some((p) => /cannot access the site, but no finding shows that/.test(p)), 'E.E.S live draft: "ai tools can’t properly access your site" with no finding behind it is refused');
ok(!checkReply(LIVE_EES, buildReplyContext({ ...mk(eesFacts, ees), research: failedToday })).problems.some((p) => /no finding shows that/.test(p)), '…and allowed when the blocked-crawler finding is the primary');
// (2) First Call: a MODEL-authored "conflict" from a normal service-area sentence.
const modelConflict: typeof research = { ...cleanResearchFor(), localVisibilityFindings: [{ id: 'model:0', kind: 'positioning_conflict', category: 'local_visibility', title: 'Conflicting Service Areas', detail: 'Based in St Albans but covers Hertfordshire.', evidence: ['We are based in St Albans and cover areas across Hertfordshire including; Harpenden'], pageUrl: W, strength: 4, source: 'model', verified: true }] };
ok(buildReplyContext({ ...mk(), research: modelConflict }).selection.primary === null, 'First Call: a model-authored location "conflict" is never used — conflicts are the rules\' call');
// (3) Adcock: no "i asked ai…" at all.
const LIVE_ADCOCK = "hey mate, it really depends on which route makes sense for you. when i checked your site, i noticed it says you're based in Scunthorpe but also claims to be nationwide across England. that mixed messaging can make it harder for AI tools to connect you clearly with local searches.\n\nwe can fix that on your existing site or build you a new one.\n\nare you currently with an agency or do you own/manage the website yourself?";
ok(checkReply(LIVE_ADCOCK, ctx).problems.some((p) => /AI search that started/.test(p)), 'Adcock live draft: no "i asked ai…" is refused (a passing "AI tools … searches" is not the search)');

function cleanResearchFor() {
  return assembleResearch({ nowIso: new Date(NOW).toISOString(), website: W, businessName: 'Example Electrics', trade: 'Electricians', town: 'Addlestone',
    pages: [extractPageFacts(HOME, W, W, 200, true)], crawl: null, audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026 });
}

/* ─────────── no finding: nothing invented ─────────── */
const cleanResearch = assembleResearch({ nowIso: new Date(NOW).toISOString(), website: W, businessName: 'Example Electrics', trade: 'Electricians', town: 'Addlestone',
  pages: [extractPageFacts(HOME, W, W, 200, true)], crawl: null, audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026 });
const c = buildReplyContext({ ...mk(), research: cleanResearch });
ok(c.selection.primary === null && c.primaryRequired === false, 'a healthy site with nothing strong → no primary, none invented');
ok(/The site itself is not badly built: say so honestly, then use the strongest true point you have: AI still isn't linking them strongly enough with electrician in Addlestone/.test(buildReplyPrompt(c)), 'the no-finding reply leans on the AI search result');
const NOFIND = `nah mate, i was checking what google ai recommends for an electrician in addlestone and it brought up your competitors instead.\n\nyour site itself isn't badly built, but ai still isn't linking you strongly enough with electrician searches in addlestone, while it is with those other businesses.\n\nthat's the sort of thing we'd work on, either on the site you've already got or we can build you a new one that's properly set up for ai visibility and seo.\n\nare you currently with an agency or do you own/manage the website yourself?`;
const nf = checkReply(NOFIND, c);
ok(nf.problems.length === 0, `the honest no-finding reply passes (${nf.problems.join(' | ') || 'ok'})`);
ok(nf.warnings.some((w) => /No website finding was strong enough/.test(w)), 'Paul is told internally that no site finding was used');

/* ─────────── routes ─────────── */
ok(routeLean({ ...cleanResearch, status: 'no_website' }) === 'new_only', 'no website → the build route only');
const jsOnly = assembleResearch({ nowIso: new Date(NOW).toISOString(), website: W, businessName: 'X', trade: 'Electricians', town: 'Addlestone',
  pages: [extractPageFacts('<html><head><title>X</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>', W, W, 200, true)], crawl: null, audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026 });
ok(routeLean(jsOnly) === 'consider_new', 'a site that is nearly empty without javascript leans to the rebuild route');

/* ─────────── the Why panel data ─────────── */
for (const key of ['aiSearchContext: ctx.searchContext', 'proposedSolution: ROUTE_LABELS[ctx.route]', 'websiteOwnership:', 'finalQuestion:', 'noFindingNote:']) {
  ok(FN.includes(key), `Why this reply? carries ${key.split(':')[0]}`);
}

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
