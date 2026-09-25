/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WARM LEAD RESEARCH — what we read off a prospect's site, when we re-read it, and what we refuse to
   believe (2026-09-25).

   Pinned here:
     1. REUSE. Fresh research is reused; stale research is revalidated by ONE homepage hash; a changed
        website, a failed pass or Refresh research re-reads. Nothing else re-reads.
     2. THE RYLI HEAT FIXTURE. Built from the words on the real site (read 2026-09-25): conflicting
        local/nationwide positioning, three opening-hours claims, no core plumbing/boiler/emergency
        pages in the menu, and a footer crediting another company with building AND hosting it. Those
        four are the strongest findings, and nothing else is invented.
     3. NO HALLUCINATION. A model finding whose quote is not on the page is dropped and the operator
        is told. A failed crawl yields no site finding at all. A clean site says it is clean.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  WARM_RESEARCH_FRESH_MS, WARM_RESEARCH_VERSION, MAX_STRONGEST_FINDINGS, MIN_SALES_STRENGTH,
  planResearch, researchFreshness, contentHash, extractPageFacts, pickResearchPages, assembleResearch,
  verifyModelFindings, verifyQuote, normaliseForMatch, normaliseWebsite, noWebsiteResearch, auditFinding,
  type PageFacts, type WarmLeadResearch, type StoredResearchRow, type AuditContext,
} from '../src/lib/warmLeadResearch.ts';
import { CRAWL_FRESH_MS } from '../src/lib/crawlCheck.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const NOW = Date.parse('2026-09-25T12:00:00Z');
const NOW_ISO = new Date(NOW).toISOString();
const DAY = 86_400_000;

/* ─────────── the Ryli Heat fixture: the real site's words, trimmed ─────────── */
const RYLI_HOME = `<!doctype html><html><head><title>Home - Ryli Heat</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script></head><body>
<div class="top">ECO Grant Resources 9AM - 9PM admin@ryliheat.co.uk 07908 046839</div>
<nav><a href="https://www.ryliheat.co.uk/">Home</a><a href="#">Free Boiler</a>
<a href="https://www.ryliheat.co.uk/heating-grants/">Heating Grants</a><a href="https://www.ryliheat.co.uk/insulation-grants/">Insulation Grants</a>
<a href="https://www.ryliheat.co.uk/air-source-heat-pumps/">Air Source Heat Pumps</a><a href="https://www.ryliheat.co.uk/warm-roof/">Warm Roof</a>
<a href="https://www.ryliheat.co.uk/solar-pv/">Solar PV</a><a href="https://www.ryliheat.co.uk/landlords/">Landlords</a>
<a href="https://www.ryliheat.co.uk/apply-for-grant/">Apply For Grant</a><a href="https://www.ryliheat.co.uk/contact-us/">Contact Us</a>
<a href="https://www.ryliheat.co.uk/request-a-quote/">Request A Quote</a><a href="https://www.ryliheat.co.uk/wp-json/">api</a>
<a href="https://www.ryliheat.co.uk/wp-content/uploads/logo.png">logo</a></nav>
<h1>Quality Heating &amp; Plumbing  Service</h1>
<p>Reliable Heating &amp; Plumbing Solutions. We ensure that your heating/boiling and plumbing systems nationwide across England are operating at peak performance.</p>
<p>24/7 Emergency Response. Available 24/7 for all your heating and plumbing emergencies.</p>
<p>For over two decades, Ryli Heat has been a trusted name in heating and plumbing services across Lincolnshire, Yorkshire, and Humberside.</p>
<form><select><option>Air Conditioning Repair</option><option>Furnace installation</option></select></form>
<footer>Business Hours Open 24 hours. Ryli Heat is a Scunthorpe-based heating and plumbing specialist offering boiler installation, wall insulation, and 24-hour emergency call outs.
44 Churchfield Rd, Ashby, Scunthorpe DN16 3DH 9AM - 9AM 2023 © Copyright - Ryli Heat | Website Designed and Hosted by Keyhole IT Solutions ltd Get A Quote</footer>
</body></html>`;
const RYLI_CONTACT = `<html><head><title>Contact Us - Ryli Heat</title></head><body><h1>Contact Us</h1><p>Call us on 07908 046839 or email admin@ryliheat.co.uk. Website Designed and Hosted by Keyhole IT Solutions ltd</p></body></html>`;

const page = (html: string, url: string, ok = true): PageFacts => extractPageFacts(html, url, url, ok ? 200 : 0, ok);
const ryliHome = page(RYLI_HOME, 'https://www.ryliheat.co.uk/');
const ryliPages = [ryliHome, page(RYLI_CONTACT, 'https://www.ryliheat.co.uk/contact-us')];

const assemble = (pages: PageFacts[], extra: Partial<Parameters<typeof assembleResearch>[0]> = {}) => assembleResearch({
  nowIso: NOW_ISO, website: 'https://www.ryliheat.co.uk/', businessName: 'Ryli Heat', trade: 'Plumbers', town: 'Scunthorpe',
  pages, crawl: null, audit: null, model: null, modelError: null, fetchMs: 10, analyseMs: null, researchMs: 20, nowYear: 2026, ...extra,
});

/* ─────────── 1. page reading ─────────── */
ok(ryliHome.title === 'Home - Ryli Heat', 'title is read and entity-decoded');
ok(ryliHome.h1s[0]?.startsWith('Quality Heating & Plumbing'), 'H1 is read with &amp; decoded');
ok(ryliHome.links.every((u) => !/wp-json|wp-content|\.png$/.test(u)), 'API, upload and image links are not treated as pages');
ok(ryliHome.links.includes('https://www.ryliheat.co.uk/heating-grants'), 'menu pages are collected (trailing slash dropped)');
ok(!ryliHome.links.includes('https://www.ryliheat.co.uk'), 'the homepage is not its own link');
ok(ryliHome.jsonLdTypes.includes('WebPage'), 'structured data types are read');
const picks = pickResearchPages(ryliHome, 5);
ok(picks[0] === 'https://www.ryliheat.co.uk/contact-us', 'the contact page is read first (it carries the hours, phone and credits)');
ok(picks.length === 5, 'a targeted pass reads at most the configured number of inner pages');

/* ─────────── 2. the Ryli fixture findings ─────────── */
const ryli = assemble(ryliPages);
const kinds = ryli.strongestFindings.map((x) => x.kind);
ok(ryli.status === 'complete', 'a readable site with no model call is still a complete rule-based record when no model was attempted');
ok(kinds.includes('positioning_conflict'), 'Ryli: local vs nationwide positioning is found');
ok(kinds.includes('hours_conflict'), 'Ryli: inconsistent opening hours are found');
ok(kinds.includes('missing_core_service_pages'), 'Ryli: no core plumbing/boiler/emergency pages is found');
ok(kinds.includes('provider_attribution'), 'Ryli: the external website-provider credit is found');
ok(ryli.strongestFindings.length === 4 && kinds.length === new Set(kinds).size, `Ryli: exactly the four brief findings lead, one per kind (got ${kinds.join(', ')})`);
ok(!kinds.some((k) => ['crawl_indexing', 'thin_or_duplicate', 'contact_conflict', 'structured_data', 'outdated_content'].includes(k)),
  'Ryli: no other problem is invented into the strongest findings');
const pos = ryli.strongestFindings.find((x) => x.kind === 'positioning_conflict')!;
ok(pos.evidence.some((e) => /nationwide across England/.test(e)) && pos.evidence.some((e) => /Scunthorpe-based/.test(e)),
  'the positioning finding quotes both sides, from the page');
const hours = ryli.strongestFindings.find((x) => x.kind === 'hours_conflict')!;
ok(hours.evidence.includes('9AM - 9PM') && hours.evidence.includes('9AM - 9AM') && hours.evidence.some((e) => /Open 24 hours/i.test(e)),
  'the hours finding carries all three claims verbatim');
const prov = ryli.strongestFindings.find((x) => x.kind === 'provider_attribution')!;
ok(prov.evidence[0] === 'Website Designed and Hosted by Keyhole IT Solutions ltd', `the provider credit stops at the company suffix ("${prov.evidence[0]}")`);
ok(ryli.ownershipClues.length > 0 && /Keyhole IT Solutions/.test(ryli.ownershipClues[0]), 'the credit becomes an ownership clue');
ok(ryli.providerClues[0] === prov.evidence[0], 'and a provider clue');
ok(ryli.strongestFindings.every((x) => x.verified), 'every strongest finding is verified');
ok(ryli.strongestFindings.every((x) => !/\bAI (?:can'?t|cannot|doesn'?t|ignores|reads)\b/i.test(x.detail)),
  'no finding asserts how an AI model decides');
ok(ryli.technicallyClean === true, 'Ryli has no serious technical fault, and the record says so (the brief: do not invent problems)');
ok(ryli.contentHash === contentHash(ryliHome.text), 'the homepage hash is stored for later revalidation');

/* ─────────── 3. freshness and the plan ─────────── */
const row = (r: WarmLeadResearch, agoMs: number, extra: Partial<StoredResearchRow> = {}): StoredResearchRow =>
  ({ research: r, generated_at: new Date(NOW - agoMs).toISOString(), website: r.website, research_status: r.status, ...extra });
const W = 'https://www.ryliheat.co.uk/';
ok(planResearch({ row: null, leadWebsite: W, refresh: false, nowMs: NOW }).action === 'research', 'first warm reply, no research → research');
ok(researchFreshness(null, W, NOW) === 'none', '…and the button reads "Research & draft reply"');
ok(planResearch({ row: row(ryli, 2 * DAY), leadWebsite: W, refresh: false, nowMs: NOW }).action === 'reuse', 'existing fresh research → reuse, fetch nothing');
ok(researchFreshness(row(ryli, 2 * DAY), W, NOW) === 'fresh', '…and the button reads "Draft reply"');
ok(planResearch({ row: row(ryli, 2 * DAY), leadWebsite: 'ryliheat.co.uk', refresh: false, nowMs: NOW }).action === 'reuse', 'www/scheme/slash differences are not a changed website');
ok(planResearch({ row: row(ryli, WARM_RESEARCH_FRESH_MS + DAY), leadWebsite: W, refresh: false, nowMs: NOW }).action === 'revalidate', 'stale research → revalidate (one homepage fetch), not a full re-read');
ok(planResearch({ row: row(ryli, WARM_RESEARCH_FRESH_MS + DAY, { revalidated_at: new Date(NOW - DAY).toISOString() }), leadWebsite: W, refresh: false, nowMs: NOW }).action === 'reuse',
  'stale research revalidated recently counts as fresh');
ok(planResearch({ row: row(ryli, 2 * DAY), leadWebsite: W, refresh: true, nowMs: NOW }).action === 'research', 'Refresh research re-reads even fresh research');
ok(planResearch({ row: row(ryli, 2 * DAY), leadWebsite: 'https://another-site.co.uk', refresh: false, nowMs: NOW }).action === 'research', 'a changed lead website → research');
ok(planResearch({ row: row({ ...ryli, status: 'failed' }, 2 * DAY, { research_status: 'failed' }), leadWebsite: W, refresh: false, nowMs: NOW }).action === 'research', 'a failed pass is retried');
ok(planResearch({ row: row({ ...ryli, version: WARM_RESEARCH_VERSION - 1 }, 2 * DAY), leadWebsite: W, refresh: false, nowMs: NOW }).action === 'research', 'an older research version is re-read');
ok(planResearch({ row: null, leadWebsite: '', refresh: false, nowMs: NOW }).action === 'no_website', 'no website → no fetch at all');
ok(WARM_RESEARCH_FRESH_MS === CRAWL_FRESH_MS, 'research freshness is the same horizon as a crawl check');
ok(contentHash('Hello   World') === contentHash('hello world'), 'the hash ignores whitespace and case');
ok(contentHash('Open 9am - 5pm') !== contentHash('Open 9am - 6pm'), 'a real change changes the hash');
ok(normaliseWebsite('HTTPS://WWW.Example.co.uk/') === 'example.co.uk', 'website normalisation');

/* ─────────── 4. no hallucinated problem ─────────── */
const modelOut = [
  { kind: 'off_trade_content', category: 'content', title: 'US heating terms in the quote form', detail: 'The quote form offers Furnace installation and Air Conditioning Repair, which reads like a template from a different market.', evidence_quotes: ['Air Conditioning Repair Furnace installation'], strength: 3 },
  { kind: 'crawl_indexing', category: 'technical', title: 'Site is very slow', detail: 'The site takes 12 seconds to load.', evidence_quotes: ['takes 12 seconds to load'], strength: 5 },
  { kind: 'weak_evidence', category: 'trust', title: 'No Gas Safe number', detail: 'No Gas Safe registration is shown.', evidence_quotes: [], strength: 4 },
];
const v = verifyModelFindings(modelOut, ryliPages);
ok(v.kept.length === 1 && v.kept[0].kind === 'off_trade_content', 'a model finding with a real quote is kept');
ok(v.dropped.includes('Site is very slow'), 'a model finding quoting text that is not on the page is dropped');
ok(v.dropped.includes('No Gas Safe number'), 'a model finding with no quote is dropped');
ok(v.kept[0].strength <= 4, 'a model finding can never outrank what code measured (ceiling 4)');
const withModel = assemble(ryliPages, { model: { findings: modelOut, business_summary: 'Scunthorpe heating firm.', positioning: 'mixed' } });
ok(withModel.warnings.some((w) => /Site is very slow/.test(w)), 'the operator is told which finding was dropped');
ok(![...withModel.technicalFindings, ...withModel.contentFindings].some((x) => /slow/i.test(x.title)), 'the dropped finding appears nowhere in the record');
ok(!verifyQuote('slow', normaliseForMatch(ryliHome.text)), 'a very short quote never verifies');
ok(verifyQuote('Heating & Plumbing Solutions', normaliseForMatch(ryliHome.text)), 'a quote verifies across &amp; / punctuation differences');
ok(verifyModelFindings([{ kind: 'ai_visibility', category: 'local_visibility', title: 'x', detail: 'y', evidence_quotes: ['Quality Heating & Plumbing Service'], strength: 3 }], ryliPages).kept.length === 0,
  'the model cannot author an AI-visibility finding — only the audit can');

/* ─────────── 5. failed crawl ─────────── */
const failed = assemble([page('', 'https://www.ryliheat.co.uk/', false)]);
ok(failed.status === 'failed', 'an unreadable homepage → status failed');
ok(failed.strongestFindings.length === 0, 'a failed crawl yields no site findings');
ok(failed.warnings.some((w) => /could not be read/.test(w) && /Nothing about the site should be claimed/.test(w)), 'and tells the operator not to claim anything about the site');
ok(failed.technicallyClean === false, 'a failed crawl is never reported as a clean site');
const failedWithAudit = assemble([page('', W, false)], { audit: { auditId: 'a1', reportUrl: 'https://findable.live/r/ABC123', createdAt: NOW_ISO, trade: 'plumber', town: 'Scunthorpe', competitors: ['A Plumbing', 'B Heating'], namedEverywhere: false, namedDatapoints: 0, totalDatapoints: 6, unavailableReason: null } });
ok(failedWithAudit.strongestFindings.length === 1 && failedWithAudit.strongestFindings[0].kind === 'ai_visibility', 'with a failed crawl the audit finding still stands (safe, measured)');

/* ─────────── 6. clean website / genuine fault ─────────── */
const CLEAN = `<html><head><title>Emergency Plumber Scunthorpe | Smith Plumbing</title><script type="application/ld+json">{"@type":"Plumber"}</script></head><body>
<nav><a href="/boiler-repair">Boiler repair</a><a href="/emergency-plumber">Emergency</a><a href="/central-heating">Heating</a><a href="/contact">Contact</a></nav>
<h1>Plumber in Scunthorpe</h1><p>Smith Plumbing is based in Scunthorpe. Open 8am - 6pm Monday to Friday. Call 01724 123456.</p></body></html>`;
const clean = assembleResearch({ nowIso: NOW_ISO, website: 'https://smith.example', businessName: 'Smith Plumbing', trade: 'plumber', town: 'Scunthorpe', pages: [page(CLEAN, 'https://smith.example/')], crawl: null, audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026 });
ok(clean.technicallyClean === true, 'a clean site is recorded as technically clean');
ok(clean.strongestFindings.length === 0, `a clean site gets no invented findings (got ${clean.strongestFindings.map((x) => x.kind).join(', ') || 'none'})`);
const NOINDEX = CLEAN.replace('<head>', '<head><meta name="robots" content="noindex, nofollow">');
const faulty = assembleResearch({ nowIso: NOW_ISO, website: 'https://smith.example', businessName: 'Smith Plumbing', trade: 'plumber', town: 'Scunthorpe', pages: [page(NOINDEX, 'https://smith.example/')], crawl: null, audit: null, model: null, modelError: null, fetchMs: 1, analyseMs: null, researchMs: 1, nowYear: 2026 });
ok(faulty.strongestFindings[0]?.kind === 'crawl_indexing' && faulty.strongestFindings[0]?.strength === 5, 'a genuine technical fault (noindex homepage) leads');
ok(faulty.technicallyClean === false, '…and the site is not called clean');

/* ─────────── 7. crawl + audit reuse, trivia line ─────────── */
const crawlRow = { created_at: new Date(NOW - 3 * DAY).toISOString(), result: { version: 99, signals: { homeUrl: W, fetchFailed: false, searchBlocked: ['OAI-SearchBot'], readableAs: 'ChatGPT-User', clientRendered: null, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 0 } } };
const withCrawl = assemble(ryliPages, { crawl: crawlRow as never });
ok(withCrawl.technicalFindings.some((x) => x.source === 'crawl' && x.strength === 5), 'a fresh crawl-check row is reused as a finding (no re-crawl)');
ok(withCrawl.sources.some((s) => s.kind === 'crawl_check'), '…and listed as a source');
const oldCrawl = assemble(ryliPages, { crawl: { ...crawlRow, created_at: new Date(NOW - CRAWL_FRESH_MS - DAY).toISOString() } as never });
ok(!oldCrawl.technicalFindings.some((x) => x.source === 'crawl'), 'a stale crawl row is not believed');
ok([...ryli.contentFindings].some((x) => x.kind === 'outdated_content' && x.strength < MIN_SALES_STRENGTH), 'the old copyright year is recorded as trivia…');
ok(!ryli.strongestFindings.some((x) => x.strength < MIN_SALES_STRENGTH), '…and trivia never reaches the strongest findings');
ok(ryli.strongestFindings.length <= MAX_STRONGEST_FINDINGS, 'at most MAX_STRONGEST_FINDINGS are offered');
const audit: AuditContext = { auditId: 'a', reportUrl: null, createdAt: NOW_ISO, trade: 'plumber', town: 'Scunthorpe', competitors: ['X'], namedEverywhere: true, namedDatapoints: 6, totalDatapoints: 6, unavailableReason: null };
ok(auditFinding(audit) === null, 'an audit that named them everywhere produces no "AI is missing you" finding');
ok(auditFinding({ ...audit, namedEverywhere: false, namedDatapoints: 5, totalDatapoints: 6 }) === null, 'a strong audit result is not presented as a gap');
ok(auditFinding({ ...audit, namedEverywhere: false, namedDatapoints: 0, totalDatapoints: 6 })?.strength === 4, 'a zero result is a strong local-visibility finding');
const nw = noWebsiteResearch(NOW_ISO, null);
ok(nw.status === 'no_website' && nw.strongestFindings.length === 0 && /no website/i.test(nw.warnings[0]), 'no website: nothing is critiqued, and the operator is told why');

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
