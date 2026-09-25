/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WARM REPLY — the draft, the window, the sales memory, and the things it must never do (2026-09-25).

   Pinned here:
     1. IT NEVER SENDS. The function and the component have no send path; the draft only ever reaches
        the composer, through the same remount a quick reply uses.
     2. THE WINDOW. A closed 24h window gets no draft and no spend; the sender's own check is unchanged.
     3. ANSWER THEIR MESSAGE FIRST. The latest inbound leads the prompt; a price question must be
        answered in the first paragraph with both figures, from findableOffer.ts.
     4. THE RYLI HEAT FIXTURE ("How much"): price first, the four-week first-payment guarantee, a few
        specific findings, findable.live, the ownership question — and no report link, no invented
        problem, nothing sent.
     5. SALES MEMORY. "Yeah I own the site" is remembered from THEIR words and the question is not
        asked again; nothing is believed that they did not say.
   The model itself cannot run here (no key, no network); what it is TOLD and what is CHECKED on the
   way back are both pure, and both are driven below.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  classifyInbound, reportUrlAllowed, ruleSalesFacts, mergeSalesFacts, shouldAskOwnership, buildReplyContext,
  buildReplyPrompt, checkReply, fallbackReply, parseModelReply, latestInbound, REPLY_SYSTEM_PROMPT, FINDABLE_DETAILS_URL,
  type ThreadMessage, type SalesFacts,
} from '../src/lib/warmReply.ts';
import { assembleResearch, extractPageFacts, type WarmLeadResearch, type AuditContext } from '../src/lib/warmLeadResearch.ts';
import { serviceWindowState, WHATSAPP_SERVICE_WINDOW_MS } from '../src/lib/serviceWindow.ts';
import { FINDABLE_OFFER_SUMMARY, FINDABLE_GUARANTEE, FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP } from '../src/lib/findableOffer.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const FN = read('supabase/functions/warm-lead-reply/index.ts');
const UI = read('src/components/WarmReplyAssistant.tsx');
const INBOX = read('src/pages/Inbox.tsx');
const SENDER = read('supabase/functions/send-whatsapp-message/index.ts');
const LIB = read('src/lib/warmReply.ts');
const NOW = Date.parse('2026-09-25T12:00:00Z');
const HOUR = 3_600_000;

/* ─────────── 1. it never sends ─────────── */
for (const [name, src] of [['warm-lead-reply function', FN], ['WarmReplyAssistant', UI]] as const) {
  ok(!/send-whatsapp-message['"]/.test(src.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')), `${name}: never invokes send-whatsapp-message`);
  ok(!/graph\.facebook\.com|sendViaGraph|whatsapp-send\.ts/.test(src), `${name}: no Graph call, no import of the sender module`);
  ok(!/from\(["']whatsapp_(?:messages|sends)["']\)\s*\.(?:insert|upsert|update)/.test(src), `${name}: never writes a message row`);
}
ok(!/onSend|doSend/.test(UI), 'the assistant has no send callback at all — only onDraft');
const insertFn = INBOX.match(/const insertWarmDraft = useCallback\(\(key: string, draft: string\) => \{([\s\S]*?)\}, \[setDrafts\]\);/)?.[1] ?? '';
ok(/setDraft\(prev, key, draft\)/.test(insertFn) && /setComposerSeed/.test(insertFn), 'the draft enters the composer: written as that thread\'s draft, composer remounted');
ok(!/doSend|invoke|send/i.test(insertFn.replace(/setDraft|setDrafts|setComposerSeed/g, '')), 'inserting a draft sends nothing');
ok(/onDraft=\{\(draft\) => insertWarmDraft\(active\.key, draft\)\}/.test(INBOX), 'the Inbox wires onDraft to insertWarmDraft, keyed by the conversation');
ok(/<WarmReplyAssistant[\s\S]*?key=\{active\.key\}/.test(INBOX), 'the assistant is keyed by conversation (a draft cannot follow Paul to another thread)');
ok(/useEffect\(\(\) => \{\s*const p = pendingWarmDraft\.current;[\s\S]*?setDraft\(prev, p\.key, p\.draft\)[\s\S]*?\}, \[composerSeed, setDrafts\]\);/.test(INBOX),
  'the draft is re-saved after the remount, so the outgoing composer\'s unmount flush cannot revert it (found in the UI harness)');
ok(/current && current !== \(lastReply \?\? ''\)\.trim\(\) && !window\.confirm/.test(UI), 'a draft replaces Paul\'s own typing only after he confirms; our untouched draft is replaced freely');

/* ─────────── 2. the window ─────────── */
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
ok(serviceWindowState(at(23 * HOUR), NOW).open === true, 'active window: 23h after their message is open');
ok(serviceWindowState(at(23 * HOUR), NOW).hoursLeft === 1, '…with about an hour left');
ok(serviceWindowState(at(24 * HOUR + 1), NOW).open === false, 'expired window: 24h after their message is closed');
ok(serviceWindowState(null, NOW).open === false, 'no inbound at all → no window (absence is never open)');
ok(serviceWindowState('not a date', NOW).open === false, 'an unreadable timestamp → closed');
ok(WHATSAPP_SERVICE_WINDOW_MS === 24 * HOUR && /const WINDOW_MS = 24 \* 60 \* 60 \* 1000;/.test(SENDER), 'the drafter and the sender both use 24 hours; the sender is unchanged');
const draftBody = FN.match(/async function handleDraft[\s\S]*?\n}\n/)?.[0] ?? '';
ok(draftBody.length > 0, 'handleDraft is found');
ok(draftBody.indexOf('if (!win.open)') > 0 && draftBody.indexOf('if (!win.open)') < draftBody.indexOf('callModel('), 'a closed window returns BEFORE any model call — no spend');
ok(/error: "window_closed"[\s\S]{0,300}approved template/.test(draftBody), 'the closed-window answer says an approved template is required');
ok(/Research &amp; draft reply needs the 24h window — only an approved Meta template can be sent now\./.test(UI), 'the Inbox says so when the window is closed');

/* ─────────── 3. regenerate never crawls; refresh does ─────────── */
ok(!/fetchSitePage|pickResearchPages|handleResearch/.test(draftBody), 'the draft action has no site-fetch path at all');
ok(/mode === 'refresh' \|\| \(mode === 'draft' && freshness !== 'fresh'\)/.test(UI), 'the UI asks for research only on Refresh, or a first draft with nothing fresh');
ok(/refresh: mode === 'refresh'/.test(UI), 'Refresh research sends refresh: true (the only re-read of fresh research)');
ok(/run\(hasDraft \? 'regenerate' : 'draft'\)/.test(UI), 'after a draft the main button is Regenerate');
ok(/avoid: mode === 'regenerate' \? lastReply : null/.test(UI), 'Regenerate passes the previous draft so the next one differs');

/* ─────────── 4. what they asked ─────────── */
const cls = (t: string) => classifyInbound(t).primary;
ok(cls('How much') === 'price' && cls('how much is it?') === 'price' && cls("What's the cost") === 'price', 'price questions');
ok(cls('How does it work?') === 'how_it_works' && cls('what do you actually do') === 'how_it_works', 'how-it-works questions');
ok(cls('Tell me more') === 'tell_me_more' && cls('sounds interesting, go on') === 'tell_me_more', '"tell me more"');
ok(cls('I already have someone doing SEO') === 'existing_provider' && cls('we pay an agency for our website') === 'existing_provider', 'existing SEO-provider objection');
ok(cls("Can you show me what you'd change?") === 'show_changes', 'show-me-what-you-would-change');
ok(cls('Not interested thanks') === 'not_interested' && !classifyInbound('not interested').all.includes('tell_me_more'), 'a refusal is a refusal, not "interested"');
ok(cls('Yeah I own the site') === 'ownership_answer', 'an ownership answer');
ok(classifyInbound('How much? I already have someone doing my SEO').all.join() === 'price,existing_provider', 'a message can ask two things; both reach the model');
ok(reportUrlAllowed('How much', ['price']) === false, 'a price question does not get the report link');
ok(reportUrlAllowed('can you send the report again?', ['other']) === true && reportUrlAllowed('x', ['show_changes']) === true, 'asking for the report, or what we found, does');

/* ─────────── 5. sales memory ─────────── */
const msg = (id: string, direction: 'inbound' | 'outbound', text: string, hAgo: number): ThreadMessage => ({ id, direction, text, at: at(hAgo * HOUR) });
const ownThread = [
  msg('o1', 'outbound', 'Do you own the current website, or is it managed by the company that built it?', 3),
  msg('i1', 'inbound', 'Yeah I own the site', 2),
];
const facts1 = mergeSalesFacts({}, ruleSalesFacts(ownThread), ownThread);
ok(facts1.facts.owns_website?.value === 'yes' && /I own the site/.test(facts1.facts.owns_website.quote), 'ownership answer persists as owns_website = yes, with their words');
ok(facts1.facts.owns_website?.messageId === 'i1', '…tied to the message it came from');
const later = [...ownThread, msg('i2', 'inbound', "Actually we don't own it, Keyhole do", 1)];
ok(mergeSalesFacts(facts1.facts, ruleSalesFacts(later), later).facts.owns_website?.value === 'no', 'a later explicit answer replaces an earlier one');
const earlierOnly = mergeSalesFacts({ owns_website: { value: 'no', quote: "we don't own it", messageId: 'i2', at: at(1 * HOUR), source: 'rule' } }, ruleSalesFacts(ownThread), ownThread);
ok(earlierOnly.facts.owns_website?.value === 'no', 'an older message never overwrites a newer fact');
const invented = mergeSalesFacts({}, [{ key: 'interested_in_rebuild', value: 'yes', quote: 'we want a brand new website', source: 'model' }], ownThread);
ok(!invented.facts.interested_in_rebuild && invented.rejected.length === 1, 'a model fact whose quote they never sent is rejected');
const ours = mergeSalesFacts({}, [{ key: 'owns_website', value: 'yes', quote: 'Do you own the current website', source: 'model' }], ownThread.filter((m) => m.direction === 'inbound'));
ok(!ours.facts.owns_website, 'a fact can never rest on OUR message');
const tooShort = mergeSalesFacts({}, [{ key: 'owns_website', value: 'yes', quote: 'Yes', source: 'model' }], [msg('i9', 'inbound', 'Yes', 1)]);
ok(!tooShort.facts.owns_website && /too short/.test(tooShort.rejected[0]), 'an ambiguous one-word "Yes" is not turned into a fact');
const notKept = mergeSalesFacts({}, [{ key: 'annual_turnover', value: 'yes', quote: 'Yeah I own the site', source: 'model' }], ownThread);
ok(Object.keys(notKept.facts).length === 0, 'only the allow-listed fact keys are ever stored');
const seoThread = [msg('s1', 'inbound', 'I already have someone doing SEO for us', 1)];
ok(mergeSalesFacts({}, ruleSalesFacts(seoThread), seoThread).facts.has_existing_provider?.value === 'yes', 'existing provider is remembered');
const priceThread = [msg('p1', 'inbound', 'How much', 1)];
ok(mergeSalesFacts({}, ruleSalesFacts(priceThread), priceThread).facts.requested_price?.value === 'yes', 'a price request is remembered');
ok(/sales_facts: merged\.facts/.test(FN) && !/from\("outreach_leads"\)\s*\.(?:update|upsert)/.test(FN), 'facts are saved on the research row and never written onto the lead');

/* ─────────── 6. the Ryli Heat fixture: "How much" ─────────── */
const RYLI_HOME = `<html><head><title>Home - Ryli Heat</title></head><body>
<nav><a href="https://www.ryliheat.co.uk/heating-grants/">Heating Grants</a><a href="https://www.ryliheat.co.uk/insulation-grants/">Insulation Grants</a>
<a href="https://www.ryliheat.co.uk/solar-pv/">Solar PV</a><a href="https://www.ryliheat.co.uk/warm-roof/">Warm Roof</a><a href="https://www.ryliheat.co.uk/contact-us/">Contact Us</a></nav>
<h1>Quality Heating &amp; Plumbing Service</h1><p>9AM - 9PM. We ensure that your heating and plumbing systems nationwide across England are operating at peak performance.</p>
<footer>Business Hours Open 24 hours. Ryli Heat is a Scunthorpe-based heating and plumbing specialist. 9AM - 9AM 2023 © Copyright - Ryli Heat | Website Designed and Hosted by Keyhole IT Solutions ltd</footer></body></html>`;
const ryliResearch: WarmLeadResearch = assembleResearch({
  nowIso: new Date(NOW).toISOString(), website: 'https://www.ryliheat.co.uk/', businessName: 'Ryli Heat', trade: 'Plumbers', town: 'Scunthorpe',
  pages: [extractPageFacts(RYLI_HOME, 'https://www.ryliheat.co.uk/', 'https://www.ryliheat.co.uk/', 200, true)],
  crawl: null, audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026,
});
const REPORT = 'https://findable.live/r/RYL123';
const ryliAudit: AuditContext = { auditId: 'a-ryli', reportUrl: REPORT, createdAt: new Date(NOW - 48 * HOUR).toISOString(), trade: 'plumber', town: 'Scunthorpe', competitors: ['Scunthorpe Plumbing Co'], namedEverywhere: false, namedDatapoints: 0, totalDatapoints: 3, unavailableReason: null };
const ryliThread = [msg('out1', 'outbound', 'Hi, I checked whether AI recommends Ryli Heat for plumbers in Scunthorpe…', 5), msg('in1', 'inbound', 'How much', 1)];
const ryliLatest = latestInbound(ryliThread)!;
const ctxFor = (over: Partial<Parameters<typeof buildReplyContext>[0]> = {}) => buildReplyContext({
  businessName: 'Ryli Heat', contactFirstName: null, trade: 'Plumbers', town: 'Scunthorpe', website: 'https://www.ryliheat.co.uk/',
  latest: ryliLatest, thread: ryliThread, research: ryliResearch, audit: ryliAudit, salesFacts: {}, reportUrl: REPORT, variant: 0, avoidText: null, ...over,
});
const ryli = ctxFor();
ok(ryliLatest.text === 'How much', 'the latest inbound is theirs, newest first');
ok(ryli.question.primary === 'price', 'Ryli: "How much" is a price question');
ok(ryli.askOwnership === true, 'Ryli: the provider credit is a reason to ask about ownership');
ok(ryli.allowReportUrl === false, 'Ryli: the report link is NOT allowed for "How much"');
const prompt = buildReplyPrompt(ryli);
ok(prompt.startsWith('THEIR LATEST MESSAGE — answer this first:\n"""How much"""'), 'the prompt opens with their message, to be answered first');
ok(prompt.indexOf('THEIR LATEST MESSAGE') < prompt.indexOf('CONVERSATION SO FAR'), '…before the history');
ok(/PRICE: their message asks about price — the FIRST sentence must give it, with both figures/.test(prompt), 'the price must come first');
ok(/OWNERSHIP: the research suggests another company may build\/host\/manage their site\. Ask/.test(prompt), 'the ownership question is asked for');
ok(/REPORT LINK: do NOT include/.test(prompt) && !prompt.includes(REPORT), 'the report link is withheld — the URL is not even in the prompt');
for (const k of ['positioning_conflict', 'hours_conflict', 'missing_core_service_pages', 'provider_attribution']) {
  ok(prompt.includes(`[rule:${k}]`), `the prompt offers the ${k} finding`);
}
ok(!/crawl_indexing|contact_conflict/.test(prompt), 'no other finding is offered for Ryli');
ok(REPLY_SYSTEM_PROMPT.includes(FINDABLE_OFFER_SUMMARY) && REPLY_SYSTEM_PROMPT.includes(FINDABLE_GUARANTEE), 'the offer and guarantee come verbatim from findableOffer.ts');
ok(REPLY_SYSTEM_PROMPT.includes(FINDABLE_DETAILS_URL) && FINDABLE_DETAILS_URL === 'https://findable.live/', 'findable.live is the details link');
ok(!/£\s?\d/.test(LIB.replace(/\$\{[^}]+\}/g, '')), 'warmReply.ts writes no price as a literal — every figure is a findableOffer constant');
ok(/never suggest Findable can take over, take down or own a client's existing site/i.test(REPLY_SYSTEM_PROMPT), 'the two commercial models are stated, and taking over an existing site is ruled out');
ok(/guaranteed rankings, recommendations, citations, leads/.test(REPLY_SYSTEM_PROMPT), 'guaranteed rankings / recommendations / citations / leads are ruled out');

// A Paul-style draft for Ryli — what the model is asked to produce — passes the checks.
const GOOD = `£${FINDABLE_SETUP_PRICE_GBP} to start mate, then £${FINDABLE_MONTHLY_GBP} a month from six weeks after sign-up — 12 payments in total.

If your measured AI visibility hasn't gone up at the four-week re-measure, you can claim the first £${FINDABLE_SETUP_PRICE_GBP} back.

I had a look through your site as well. It says nationwide across England in one place and Scunthorpe-based in another, the opening hours say three different things, and there's no page for the core plumbing and boiler work — the menu is all grants and insulation.

Full details: https://findable.live/

Do you own and control the site yourself, or is it managed by Keyhole who built it?`;
const good = checkReply(GOOD, ryli);
ok(good.problems.length === 0, `the Ryli model answer passes (problems: ${good.problems.join(' | ') || 'none'})`);
ok(good.warnings.length === 0, `…with no warnings (${good.warnings.join(' | ') || 'none'})`);

const BAD = `Hi! Findable guarantees you'll rank top on Google and get more leads. Here's your report ${REPORT} — AI can't read your site because it is really slow. Cancel any time, £29.99 a month.`;
const bad = checkReply(BAD, ryli);
ok(bad.problems.some((p) => /guaranteed rankings/.test(p)), 'a guaranteed-ranking claim is caught');
ok(bad.problems.some((p) => /first paragraph does not give it/.test(p)), 'not leading with the price is caught');
ok(bad.problems.some((p) => /report link/.test(p)), 'an uninvited report link is caught');
ok(bad.problems.some((p) => /how an AI model decides/.test(p)), 'an absolute claim about AI is caught');
ok(bad.problems.some((p) => /12-month minimum/.test(p)), '"cancel any time" is caught');
ok(bad.problems.some((p) => /£29\.99/.test(p)), 'a retired price is caught');

// No model? The rule-built fallback still answers the price correctly.
const fb = fallbackReply(ryli)!;
ok(!!fb && fb.split('\n\n')[0] === FINDABLE_OFFER_SUMMARY, 'fallback: the price, from the constant, is the first paragraph');
ok(/four-week re-measure, you can claim the first £99 back/.test(fb), 'fallback: the four-week first-payment guarantee');
ok(fb.includes('https://findable.live/') && !fb.includes(REPORT), 'fallback: findable.live, and no report link');
ok(/own and control the current website/.test(fb), 'fallback: asks who owns the site (Ryli has a provider credit)');
ok(checkReply(fb, ryli).problems.length === 0, `fallback passes its own checks (${checkReply(fb, ryli).problems.join(' | ') || 'none'})`);
ok(fallbackReply(ctxFor({ latest: msg('x', 'inbound', 'I already have someone doing SEO', 1), thread: [msg('x', 'inbound', 'I already have someone doing SEO', 1)] })) === null,
  'an objection is never answered by a canned fallback — the operator is told the model is unavailable');

/* ─────────── 7. ownership answered → never asked again ─────────── */
const owned: SalesFacts = { owns_website: { value: 'yes', quote: 'Yeah I own the site', messageId: 'i1', at: at(HOUR), source: 'rule' } };
const followUp = ctxFor({ latest: msg('i1', 'inbound', 'Yeah I own the site', 1), thread: [...ryliThread, msg('i1', 'inbound', 'Yeah I own the site', 1)], salesFacts: owned });
ok(shouldAskOwnership(ryliResearch, owned) === false && followUp.askOwnership === false, 'once they have answered, ownership is not asked again');
ok(/OWNERSHIP: already answered \(owns_website = yes\)\. Do NOT ask about it again/.test(buildReplyPrompt(followUp)), 'the prompt says it was answered');
ok(checkReply('Great, that makes it simple. Do you own the site outright?', followUp).problems.some((p) => /already answered/.test(p)), 'a draft that re-asks is caught');
ok(shouldAskOwnership({ ...ryliResearch, ownershipClues: [] }, {}) === false, 'no ownership clue → no reason to ask');

/* ─────────── 8. failed crawl / clean site / regenerate prompts ─────────── */
const failedCtx = ctxFor({ research: { ...ryliResearch, status: 'failed', strongestFindings: [] } });
ok(/Their website could NOT be read\. Do NOT mention any website problem/.test(buildReplyPrompt(failedCtx)), 'failed crawl: the model is told not to mention the site');
ok(checkReply(`£99 to start, then £99 a month. Your website has a problem with its pages. Keen?`, failedCtx).problems.some((p) => /not researched/.test(p)), 'failed crawl: a site problem in the draft is caught');
const noResearch = ctxFor({ research: null });
ok(/No website research is available\. Do NOT mention anything about their website/.test(buildReplyPrompt(noResearch)), 'no evidence: a simple answer, nothing personalised invented');
const cleanCtx = ctxFor({ research: { ...ryliResearch, technicallyClean: true, strongestFindings: [], ownershipClues: [] } });
const cleanPrompt = buildReplyPrompt(cleanCtx);
ok(/technically fine — no technical fault was found/.test(cleanPrompt) && /none strong enough to mention\. Do not invent any/.test(cleanPrompt), 'clean site: the model is told it is fine and to invent nothing');
const regen = ctxFor({ variant: 1, avoidText: GOOD });
ok(/regenerate #1\. Write a genuinely different version/.test(buildReplyPrompt(regen)) && buildReplyPrompt(regen).includes('Full details: https://findable.live/'), 'regenerate: a different version of the same facts is asked for');
const showCtx = ctxFor({ latest: msg('q', 'inbound', "Can you show me what you'd change?", 1), thread: [msg('q', 'inbound', "Can you show me what you'd change?", 1)] });
ok(showCtx.allowReportUrl === true && buildReplyPrompt(showCtx).includes(REPORT), 'show-me-what-you-would-change: the report link is allowed');
const provCtx = ctxFor({ latest: msg('s', 'inbound', 'I already have someone doing SEO', 1), thread: [msg('s', 'inbound', 'I already have someone doing SEO', 1)] });
ok(provCtx.question.primary === 'existing_provider' && /"I already have someone doing SEO" gets a straight answer/.test(REPLY_SYSTEM_PROMPT), 'SEO-provider objection: the prompt says how to answer it');

/* ─────────── 9. parsing the model ─────────── */
ok(parseModelReply({ reply: '   ' }, []) === null, 'an empty model reply is a failure, never an empty draft');
const parsed = parseModelReply({ question_type: 'price', reply: 'a\n\n\n\nb', findings_used: ['rule:hours_conflict', 'made:up'], sales_facts: [{ key: 'requested_price', value: 'yes', quote: 'How much' }] }, ['rule:hours_conflict']);
ok(parsed?.findingsUsed.join() === 'rule:hours_conflict', 'finding ids the research does not hold are dropped');
ok(parsed?.reply === 'a\n\nb', 'runs of blank lines are collapsed');
ok(parseModelReply({ question_type: 'nonsense', reply: 'x' }, [])?.questionType === 'other', 'an unknown question type is "other"');

/* ─────────── 10. config + table ─────────── */
const CONFIG = read('supabase/config.toml');
ok(/\[functions\.warm-lead-reply\]\s*\nverify_jwt = true/.test(CONFIG), 'config.toml lists warm-lead-reply (explicit verify_jwt)');
const MIG = read('supabase/migrations/20260925120000_warm_lead_research.sql');
ok(/enable row level security/.test(MIG) && !/create policy/i.test(MIG), 'warm_lead_research: RLS on, no policies (service role only)');
ok(/revoke all on table public\.warm_lead_research from anon, authenticated/.test(MIG), '…and the table grants are revoked from anon/authenticated');
ok(/lead_id uuid not null unique/.test(MIG), 'one research row per lead');
ok(/resolveOperator\(req\)/.test(FN) && /l\.user_id === operatorId/.test(FN), 'the function requires a signed-in operator who owns the lead');

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
