/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WARM REPLY — the funnel gate and the reuse of a full crawl (Paul, 2026-09-25, before shipping).

     1. THE FUNNEL. Opener → "Yeah" → the competitor/audit hook → "How much". The drafter is NOT the
        answer to "Yeah" (the hook is); it becomes available only once they reply to the hook, and a
        hook with nothing after it is not a question to answer. Server and Inbox read one rule.
     2. THE FULL CRAWL. A recent exhaustive crawl of THIS site replaces the menu-page fetches and its
        measured findings reach the reply; stale, capped, failed or other-domain crawls do not.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { warmStage, isAuditHookSend, WARM_STAGE_LABELS, type StageMessage } from '../src/lib/warmStage.ts';
import { WA_TEMPLATE_REQS } from '../src/lib/whatsappTemplates.ts';
import { buildReplyContext, buildReplyPrompt, checkReply, fallbackReply, latestInbound, PRIMARY_MISSING_PROBLEM, type ThreadMessage } from '../src/lib/warmReply.ts';
import { assembleResearch, extractPageFacts, usableFullCrawl, fullCrawlFindings, WARM_RESEARCH_FRESH_MS, type CrawlRowInput, type AuditContext } from '../src/lib/warmLeadResearch.ts';
import { FINDABLE_OFFER_SUMMARY, FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_TOTAL_PAYMENTS } from '../src/lib/findableOffer.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FN = read('supabase/functions/warm-lead-reply/index.ts');
const UI = read('src/components/WarmReplyAssistant.tsx');
const INBOX = read('src/pages/Inbox.tsx');

const NOW = Date.parse('2026-09-25T12:00:00Z');
const MIN = 60_000;
const at = (minsAgo: number) => new Date(NOW - minsAgo * MIN).toISOString();
const out = (t: string | null, body: string, minsAgo: number, status = 'read'): StageMessage & { body: string } =>
  ({ direction: 'outbound', message_type: t ? 'template' : 'text', template_name: t, status, created_at: at(minsAgo), body });
const inn = (body: string, minsAgo: number): StageMessage & { body: string } =>
  ({ direction: 'inbound', message_type: 'text', template_name: null, status: 'received', created_at: at(minsAgo), body });

/* ─────────── 1. the rule ─────────── */
const hookNames = Object.entries(WA_TEMPLATE_REQS).filter(([, r]) => r.needsAudit).map(([n]) => n);
ok(hookNames.includes('competitor_hook') && hookNames.includes('audit_reply_warm') && hookNames.includes('audit_followup'), `the hook is every audit-built template (${hookNames.join(', ')})`);
ok(!isAuditHookSend(out('initial_contact', 'Hey, are you taking on more jobs atm? Cheers', 10)), 'the cold opener is not a hook');
ok(isAuditHookSend(out('competitor_hook', 'i asked AI…', 10)), 'competitor_hook that went out is a hook');
ok(!isAuditHookSend(out('competitor_hook', 'i asked AI…', 10, 'failed')), 'a FAILED hook never reached them — not a hook');
ok(!isAuditHookSend(out('competitor_hook', 'i asked AI…', 10, 'simulated')), 'a simulated hook is not a hook');
ok(!isAuditHookSend(out('competitor_hook', 'x', 10, null as unknown as string)), 'an unknown status is not a send (positive test)');
ok(!isAuditHookSend({ ...inn('x', 1), template_name: 'competitor_hook' }), 'an inbound row is never a hook');
ok(!isAuditHookSend(out(null, 'I asked AI and it mentioned…', 10)), 'a free-typed message is not detectable as a hook (safe direction: withheld)');
ok(warmStage([]).stage === 'no_reply', 'no messages → NO REPLY YET');

/* ─────────── 2. the funnel, step by step ─────────── */
const HOOK_BODY = "Hi mate, i was looking for a plumber in Scunthorpe so i asked AI and it mentioned JC Plumbing & Heating, Paul's plumbing services and James Broadbent Plumbing and Heating\n\nI know how to get you showing up more in those answers so people are more likely to find you\n\nHappy to explain it here or jump on a quick call if you'd rather\n\nPaul✌️";
const step1 = [out('initial_contact', 'Are you taking on more jobs atm?', 120)];
ok(warmStage(step1).stage === 'no_reply', 'step 1 (opener only): no reply yet');
const step2 = [...step1, inn('Yeah', 100)];
ok(warmStage(step2).stage === 'hook_not_sent', 'step 2 ("Yeah"): HOOK NOT SENT — the competitor hook is the next step, not the drafter');
const step3 = [...step2, out('competitor_hook', HOOK_BODY, 90)];
const s3 = warmStage(step3);
ok(s3.stage === 'waiting_for_hook_reply' && s3.hookTemplate === 'competitor_hook', 'hook sent, nothing after it: WAITING FOR REPLY TO HOOK');
ok(s3.replyAfterHookAt === null, '…and "Yeah" (before the hook) is not treated as a reply to it');
const step4 = [...step3, inn('How much', 30)];
const s4 = warmStage(step4);
ok(s4.stage === 'warm' && s4.replyAfterHookAt === at(30), 'step 3 ("How much" after the hook): WARM CONVERSATION');
ok(warmStage([...step4].reverse()).stage === 'warm', 'order of the rows does not matter');
ok(warmStage([...step2, out('competitor_hook', HOOK_BODY, 90, 'failed'), inn('How much', 30)]).stage === 'hook_not_sent', 'a hook that failed to send leaves the drafter closed even if they write again');
ok(WARM_STAGE_LABELS.hook_not_sent === 'HOOK NOT SENT' && WARM_STAGE_LABELS.waiting_for_hook_reply === 'WAITING FOR REPLY TO HOOK' && WARM_STAGE_LABELS.warm === 'WARM CONVERSATION', 'the internal stage labels');

/* ─────────── 3. where the gate lives ─────────── */
const body = (name: string) => FN.match(new RegExp(`async function ${name}[\\s\\S]*?\\n}\\n`))?.[0] ?? '';
const research = body('handleResearch');
const draft = body('handleDraft');
ok(research.includes('if (conv.stage.stage !== "warm") return notWarm(conv.stage);') && research.indexOf('notWarm(') < research.indexOf('fetchSitePage('), 'research refuses a not-warm conversation BEFORE any site fetch');
ok(draft.includes('if (conv.stage.stage !== "warm") return notWarm(conv.stage);') && draft.indexOf('notWarm(') < draft.indexOf('callModel('), 'draft refuses a not-warm conversation BEFORE any model call');
ok(/error: "not_warm_yet"/.test(FN) && /Send the hook first/.test(FN), 'the refusal says to send the hook first');
ok(/warmStage\(rows\)/.test(FN) && /status"\)\s*\.eq\("user_id", operatorId\)|status"\)\.eq\("user_id"/.test(FN.replace(/\n\s*/g, '')), 'the server reads the stage from the stored rows, with their send status');
ok(/if \(stage !== 'warm'\) \{/.test(UI) && /Warm reply · \{WARM_STAGE_LABELS\[stage\]\}/.test(UI), 'the Inbox shows only a quiet stage line, no button, until warm');
ok(/if \(!windowOpen \|\| stage !== 'warm'\) return;/.test(UI), '…and makes no call at all until warm');
ok((INBOX.match(/stage=\{warmStage\(thread\)\.stage\}/g) ?? []).length === 2, 'the Inbox passes the same rule\'s stage in both window states');

/* ─────────── 4. the funnel's "How much" reply ─────────── */
const RYLI_HOME = `<html><head><title>Home - Ryli Heat</title></head><body>
<nav><a href="https://www.ryliheat.co.uk/heating-grants/">Heating Grants</a><a href="https://www.ryliheat.co.uk/insulation-grants/">Insulation Grants</a>
<a href="https://www.ryliheat.co.uk/solar-pv/">Solar PV</a><a href="https://www.ryliheat.co.uk/contact-us/">Contact Us</a></nav>
<h1>Quality Heating &amp; Plumbing Service</h1><p>9AM - 9PM. We ensure that your heating and plumbing systems nationwide across England are operating at peak performance.</p>
<footer>Business Hours Open 24 hours. Ryli Heat is a Scunthorpe-based heating and plumbing specialist. 9AM - 9AM | Website Designed and Hosted by Keyhole IT Solutions ltd</footer></body></html>`;
const research0 = assembleResearch({ nowIso: new Date(NOW).toISOString(), website: 'https://www.ryliheat.co.uk/', businessName: 'Ryli Heat', trade: 'Plumbers', town: 'Scunthorpe',
  pages: [extractPageFacts(RYLI_HOME, 'https://www.ryliheat.co.uk/', 'https://www.ryliheat.co.uk/', 200, true)], crawl: null, audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026 });
const audit: AuditContext = { auditId: 'a', reportUrl: 'https://findable.live/r/RYL123', createdAt: at(95), trade: 'plumber', town: 'Scunthorpe',
  competitors: ['JC Plumbing & Heating', "Paul's plumbing services", 'James Broadbent Plumbing and Heating'], namedEverywhere: false, namedDatapoints: 0, totalDatapoints: 3, unavailableReason: null };
const thread: ThreadMessage[] = step4.map((m, i) => ({ id: `m${i}`, direction: m.direction as 'inbound' | 'outbound', text: m.body, at: m.created_at }));
const ctx = buildReplyContext({ businessName: 'Ryli Heat', contactFirstName: null, trade: 'Plumbers', town: 'Scunthorpe', website: 'https://www.ryliheat.co.uk/',
  latest: latestInbound(thread)!, thread, research: research0, audit, salesFacts: {}, reportUrl: audit.reportUrl, hookTemplate: s4.hookTemplate, variant: 0, avoidText: null });
const prompt = buildReplyPrompt(ctx);
ok(ctx.latest.text === 'How much' && ctx.question.primary === 'price', 'the drafter answers "How much" — their reply to the hook, not "Yeah"');
ok(/STAGE: Paul has already sent them the AI check[\s\S]*Do NOT repeat that message or list those businesses again/.test(prompt), 'the prompt says the hook has gone and must not be resent');
ok(/THEY ASKED THE PRICE: do not give one at this stage/.test(prompt) && !/£\s?\d/.test(prompt), 'this stage gives no price, even to "How much" (Paul, 2026-09-25)');
const GOOD = `depends which route suits you mate, so i'll go through that once i know how the site's set up.

i asked google ai who it recommends for a plumber in scunthorpe and it brought up other businesses instead of you. i checked your site to see why and it says "nationwide across england" in one place and scunthorpe-based in another, so ai gets mixed signals about where you actually work.

that's the sort of thing we fix, either on the site you've already got or we can build you a new one that's properly set up for ai visibility and seo.

are you currently with an agency or do you own/manage the website yourself?`;
const good = checkReply(GOOD, ctx);
ok(good.problems.length === 0, `a stage reply (AI search, the finding, both routes, the website question, no price) passes (${good.problems.join(' | ') || 'no problems'})`);
const RESEND = `i asked ai and it mentioned JC Plumbing & Heating and James Broadbent Plumbing and Heating instead of you.\n\nwe can fix it on the site you've already got or build you a new one.\n\nare you with an agency or do you manage the website yourself?`;
ok(checkReply(RESEND, ctx).problems.some((p) => /repeats the competitor hook/.test(p)), 'a draft that re-lists the hook\'s competitors is caught');
const fb = fallbackReply(ctx)!;
ok(!fb.includes('JC Plumbing') && !/£\s?\d|findable\.live/.test(fb) && checkReply(fb, ctx).problems.length === 0,
  `the rule-built fallback: no hook resend, no price, passes its checks (${checkReply(fb, ctx).problems.join(' | ') || 'ok'})`);

/* The live drafts of the PRICE-stage version (Adcock Heat, 2026-09-25) are now wrong for this stage:
   they led with the price. Each is refused for exactly that. */
const LIVE_1 = "£99 to start, then £99 a month from week 6, with 12 payments in total.\n\nI had a look through your site and noticed a few things that could be improved. The site gives mixed signals about where you operate, and the opening hours listed are inconsistent.\n\nQuick one: do you own/control the current website, or is it owned/managed by Keyhole IT?";
const live1 = checkReply(LIVE_1, ctx);
ok(live1.problems.some((p) => /carries no price/.test(p)), 'the old price-first live draft is refused: price at this stage');
ok(live1.problems.includes(PRIMARY_MISSING_PROBLEM), '…and for its generic "mixed signals about where you operate"');
ok(live1.problems.some((p) => /AI search/.test(p)) && live1.problems.some((p) => /both routes/.test(p)), '…and for no AI search and no routes');
// Paul had already answered "How much" by hand at 10:52 in that thread.
const answered = [...thread, { id: 'paul', direction: 'outbound' as const, text: 'depends on the route mate…', at: at(10) }];
const ctxAnswered = buildReplyContext({ ...ctx, thread: answered });
ok(ctxAnswered.alreadyAnswered === true && ctx.alreadyAnswered === false, 'a thread Paul has already answered since their message is recognised');
ok(/ALREADY ANSWERED: Paul has already replied after their latest message/.test(buildReplyPrompt(ctxAnswered)), '…the model is told not to repeat him');
ok(checkReply(GOOD, ctxAnswered).warnings.some((w) => /already replied since their last message/.test(w)), '…and Paul is warned in Why this reply?');

/* ─────────── 5. the full crawl ─────────── */
const W = 'https://gilesplumbingservices.com/';
const fullRow = (over: Partial<CrawlRowInput> = {}, ev: Record<string, unknown> = {}): CrawlRowInput => ({
  created_at: at(3 * 24 * 60), mode: 'full', result: null,
  full_evidence: {
    version: 2, completeness: 'complete_with_failures', servedUrl: W, requestedUrl: W,
    navigation: [{ label: 'Home', url: W }, { label: 'Boiler Services', url: `${W}services/boiler-installation` }, { label: 'Plumbing', url: `${W}services/plumbing` }, { label: 'Contact', url: `${W}contact` }],
    families: [{ family: 'service', count: 21, examples: [`${W}services/boiler-installation`] }],
    footerExcerpt: '© 2026 Giles Plumbing Services. All rights reserved.',
    technical: [
      { kind: 'noindex', count: 4, urls: [`${W}worcester-bosch`, `${W}baxi`, `${W}privacy-policy`, `${W}book-now`] },
      { kind: 'missing_description', count: 16, urls: [`${W}services/boiler-servicing`] },
      { kind: 'duplicate_title', count: 8, urls: [W, `${W}about-us`, `${W}services`, `${W}reviews`] },
      { kind: 'unreachable', count: 9, urls: [`${W}images/gallery/48816-blob`] },
      { kind: 'no_sitemap', count: 0, urls: [] },
    ],
    ...ev,
  }, ...over,
});
ok(!!usableFullCrawl(fullRow(), W, NOW), 'a recent exhaustive crawl of this site is used');
ok(!!usableFullCrawl(fullRow(), 'gilesplumbingservices.com', NOW), '…whatever the scheme / www / slash');
ok(!usableFullCrawl(fullRow({ created_at: new Date(NOW - WARM_RESEARCH_FRESH_MS - MIN).toISOString() }), W, NOW), 'a stale full crawl is not used');
ok(!usableFullCrawl(fullRow({}, { servedUrl: 'https://old-domain.co.uk/', requestedUrl: 'https://old-domain.co.uk/' }), W, NOW), 'a crawl of a different website is not used');
ok(!usableFullCrawl(fullRow({}, { version: 1 }), W, NOW), 'the old capped (v1) crawl is not a full crawl');
ok(!usableFullCrawl(fullRow({}, { completeness: 'failed' }), W, NOW), 'a failed crawl is not used');
ok(!usableFullCrawl(fullRow({ mode: 'standard' }), W, NOW), 'a standard crawl row is not a full crawl');
const ff = fullCrawlFindings(usableFullCrawl(fullRow(), W, NOW), 'plumber', 'Giles Plumbing Services');
const noidx = ff.find((x) => x.id === 'full:noindex');
ok(!!noidx && noidx.evidence.length === 2 && !noidx.evidence.some((u) => /privacy|book-now/.test(u)), 'noindex on main pages is a finding; privacy / booking pages are not a sales point');
ok(noidx?.strength === 4 && noidx.source === 'crawl' && noidx.verified, '…a strong, measured finding');
ok(ff.some((x) => x.id === 'full:duplicate_title' && x.strength === 3), '8 pages sharing one title is a finding');
ok(!ff.some((x) => /description|unreachable|sitemap|robots/i.test(x.id)), 'trivia (meta descriptions, image timeouts, no sitemap) is left out');
ok(!ff.some((x) => x.kind === 'missing_core_service_pages'), 'a site WITH boiler/plumbing pages is not told it lacks them');
const ffWeak = fullCrawlFindings(usableFullCrawl(fullRow({}, {
  navigation: [{ label: 'Grants', url: `${W}heating-grants` }, { label: 'Solar', url: `${W}solar-pv` }, { label: 'Contact', url: `${W}contact-us` }],
  families: [{ family: 'other', count: 5, examples: [`${W}warm-roof`] }],
  technical: [{ kind: 'canonical_off_site', count: 2, urls: [`${W}a → https://other.example/a`] }, { kind: 'sitemap_off_site', count: 30, urls: ['https://other.example/x'] }],
  robots: { disallowsAll: true },
  footerExcerpt: '2023 © Copyright | Website Designed and Hosted by Keyhole IT Solutions ltd',
}), W, NOW), 'plumber', 'Giles');
for (const id of ['full:robots_all', 'full:canonical_off_site', 'full:sitemap_off_site', 'full:missing_core_service_pages', 'full:provider_attribution']) {
  ok(ffWeak.some((x) => x.id === id), `full crawl → ${id}`);
}
ok(ffWeak.find((x) => x.id === 'full:provider_attribution')?.category === 'ownership', 'the full crawl\'s footer credit becomes an ownership clue');
const withFull = assembleResearch({ nowIso: new Date(NOW).toISOString(), website: W, businessName: 'Giles Plumbing Services', trade: 'plumber', town: 'Worcester',
  pages: [extractPageFacts('<html><head><title>Plumber Worcester | Giles</title></head><body><h1>Plumber in Worcester</h1><p>Based in Worcester.</p></body></html>', W, W, 200, true)],
  crawl: fullRow(), audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026 });
ok(withFull.sources.some((s) => s.kind === 'full_crawl'), 'the record names the full crawl as a source');
ok(withFull.strongestFindings[0]?.id === 'full:noindex', `the full crawl's strongest finding leads (${withFull.strongestFindings.map((x) => x.id).join(', ')})`);
ok(withFull.strongestFindings.length <= 4, 'still only 2–4 findings reach a reply');
ok(/const full = usableFullCrawl\(crawl, homeUrl, started\);/.test(research) && /if \(home\.ok && !full\) \{\s*const targets = pickResearchPages/.test(research),
  'with a usable full crawl the menu-page fetches are skipped (homepage only)');
ok(/used_full_crawl: !!full/.test(research), 'the research answer says whether the full crawl was used');
ok(!/mode: "full"|crawl-worker|createCrawlJob/.test(FN), 'the drafter never starts a crawl job itself');

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
