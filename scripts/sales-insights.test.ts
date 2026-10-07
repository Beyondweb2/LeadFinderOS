/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES INSIGHTS (2026-10-07, branch improve/site-crawl-sales-insights; docs/site-crawl-sales-insights.md).

   Drives src/lib/salesInsights.ts with pages built by the REAL page processor (fullCrawl.processPage), so
   a fixture is what a crawl would have stored, not a hand-made digest. Pinned here — a FAIL means the
   analysis invented a problem, missed an obvious one, or lost the evidence that backs it:
     · dedicated service pages are recognised, and a site that has them is NEVER told it needs them;
     · services crammed on one page, listed with no page, and only-some-covered are each found, with the
       page and the words they were read on;
     · entity (name, phone), location and internal-linking issues are found where real and ONLY where real;
     · proof is judged on the pages read, in those words;
     · a strong site is a RESULT: state `strong_site`, no manufactured fault, an honest opportunity or none;
     · a short page is not a finding; a capped crawl never judges a page it did not read;
     · ranking is one fixed order and the stored list is at most MAX_INSIGHT_FINDINGS.
   Run: npx tsx scripts/sales-insights.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import { processPage } from '../src/lib/fullCrawl.ts';
import { insightsFromFetchedPages } from '../src/lib/salesInsightsInline.ts';
import { crawlFindings } from '../src/lib/warmLeadResearch.ts';
import type { SiteAuditPage } from '../src/lib/siteAudit.ts';
import {
  buildSalesInsights, mergePoints, rankFindings, stem, usableInsights, servicePagesLine,
  MAX_INSIGHT_FINDINGS, SALES_INSIGHTS_VERSION, SERVICE_PAGES_OPPORTUNITY_LINE, STRONG_SITE_LINE,
  type InsightInput, type SalesInsights,
} from '../src/lib/salesInsights.ts';

let failures = 0;
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };

const O = 'https://rglocks.example';
const words = (n: number) => 'we fit and repair locks for homes and businesses across the area '.repeat(Math.ceil(n / 12));
interface PageSpec { path: string; title: string; h1?: string | null; h2?: string[]; h3?: string[]; body?: string; links?: string[]; nav?: Array<[string, string]> }
function page(spec: PageSpec, isHome = false): { p: SiteAuditPage; nav: Array<{ label: string; url: string }> } {
  const navHtml = (spec.nav ?? []).map(([label, href]) => `<a href="${href}">${label}</a>`).join('');
  const html = `<html><head><title>${spec.title}</title><meta name="description" content="d"><meta name="viewport" content="width=device-width"></head><body>`
    + `<nav>${navHtml}</nav>${spec.h1 === null ? '' : `<h1>${spec.h1 ?? spec.title}</h1>`}`
    + (spec.h2 ?? []).map((h) => `<h2>${h}</h2><p>${words(40)}</p>`).join('')
    + (spec.h3 ?? []).map((h) => `<h3>${h}</h3><p>${words(40)}</p>`).join('')
    + `<p>${spec.body ?? words(260)}</p>${(spec.links ?? []).map((l) => `<a href="${l}">x</a>`).join('')}</body></html>`;
  const url = O + spec.path;
  const ev = processPage({ url, finalUrl: url, status: 200, xRobotsTag: null, html, isHome }, O + '/');
  return { p: { url, finalUrl: url, status: 'done', httpStatus: 200, d: ev.d, b: ev.b, l: ev.l ?? [] }, nav: (ev.nav ?? []).map((n) => ({ label: n.label, url: n.url })) };
}
function run(specs: Array<PageSpec & { home?: boolean }>, over: Partial<InsightInput> = {}): SalesInsights {
  const built = specs.map((s) => page(s, !!s.home));
  const nav = built.find((_, i) => specs[i].home)?.nav ?? [];
  return buildSalesInsights({
    servedUrl: O + '/', pages: built.map((b) => b.p), nav,
    lead: { name: 'RG Locksmiths', town: 'Bath', trade: 'locksmith' }, ...over,
  });
}
const ids = (i: SalesInsights) => i.findings.map((f) => f.id);
const MENU: Array<[string, string]> = [['Home', '/'], ['Emergency Locksmith', '/emergency-locksmith'], ['Lock Changes', '/lock-changes'], ['uPVC Door Repairs', '/upvc-door-repairs'], ['About', '/about'], ['Contact', '/contact']];
const GOOD_HOME: PageSpec & { home: true } = { home: true, path: '/', title: 'RG Locksmiths | Locksmith in Bath', h1: 'RG Locksmiths — locksmith in Bath', nav: MENU, links: ['/emergency-locksmith', '/lock-changes', '/upvc-door-repairs'], body: `Call 01225 123456. Fully insured and Master Locksmiths Association member. ${words(300)} "Highly recommended" — Jane` };
const SERVICE_PAGES: PageSpec[] = [
  { path: '/emergency-locksmith', title: 'Emergency Locksmith in Bath', nav: MENU, body: words(320) },
  { path: '/lock-changes', title: 'Lock Changes in Bath', nav: MENU, body: words(320) },
  { path: '/upvc-door-repairs', title: 'uPVC Door Repairs in Bath', nav: MENU, body: words(320) },
  { path: '/about', title: 'About RG Locksmiths', nav: MENU, body: `Run by the owner Ray since 2009. ${words(200)}` },
  { path: '/contact', title: 'Contact', nav: MENU, body: 'Call 01225 123456. BA1 1AA' },
];

console.log('\n── service coverage ──');
{
  const i = run([GOOD_HOME, ...SERVICE_PAGES]);
  ok(i.services.filter((s) => s.coverage === 'dedicated').length === 3, `1. three named services each map to their own page (got ${i.services.map((s) => s.name + ':' + s.coverage).join(', ')})`);
  ok(!ids(i).some((x) => ['no_service_pages', 'services_on_one_page', 'service_page_gaps'].includes(x)), '2. a site that already has dedicated service pages is NEVER told it needs them');
  ok(i.strengths.some((s) => /Dedicated pages for 3 services/.test(s)), '2. the dedicated pages are reported as a strength');
}
{
  const i = run([
    { ...GOOD_HOME, nav: [['Home', '/'], ['Services', '/services'], ['About', '/about'], ['Contact', '/contact']], links: ['/services'] },
    { path: '/services', title: 'Our Services', h1: 'Our Services', h2: ['Emergency Locksmith', 'Lock Changes', 'uPVC Door Repairs'], nav: [['Home', '/']] },
    ...SERVICE_PAGES.slice(3),
  ]);
  const f = i.findings.find((x) => x.id === 'services_on_one_page');
  ok(!!f, `3. emergency, lock changes and uPVC repairs all on one general Services page → services_on_one_page (got ${ids(i)})`);
  ok(f?.evidence.urls[0] === O + '/services' && f.evidence.quotes.some((q) => /Lock Changes/.test(q)) && /3 services listed/.test(f.evidence.signal), '3. it carries the page and the headings it was read on');
  ok(f && /Emergency Locksmith/.test(f.spoken) && /Lock Changes/.test(f.spoken) && /described together on one page, rather than each having a page of its own/.test(f.spoken), '3. the spoken line names the actual services');
  ok(f?.confidence === 'high' && f.improvement.length > 20 && f.why.length > 20, '3. confidence, why and the Findable improvement are all present');
}
{
  const i = run([
    { ...GOOD_HOME, nav: [['Home', '/'], ['About', '/about'], ['Contact', '/contact']], links: [], h2: ['Emergency Locksmith', 'Lock Changes', 'uPVC Door Repairs'] },
    ...SERVICE_PAGES.slice(3),
  ]);
  ok(ids(i).includes('no_service_pages'), `4. services named on the homepage with no page for any → no_service_pages (got ${ids(i)})`);
  ok(i.findings[0].evidence.quotes.length >= 2, '4. quotes the headings it read');
}
{
  const i = run([
    { ...GOOD_HOME, nav: [...MENU, ['Services', '/services']], links: [...(GOOD_HOME.links ?? []), '/services'] },
    { path: '/services', title: 'Our Services', h2: ['Emergency Locksmith', 'Lock Changes', 'uPVC Door Repairs', 'Safe Opening', 'Key Cutting'], nav: MENU },
    ...SERVICE_PAGES,
  ]);
  const f = i.findings.find((x) => x.id === 'service_page_gaps');
  ok(!!f && /Safe Opening/.test(f.observed) && /Key Cutting/.test(f.observed) && /3 of 5/.test(f.observed), `5. some services covered, two not → service_page_gaps naming them and the 3-of-5 count (got ${ids(i)}: ${f?.observed})`);
}
{
  const i = run([{ ...GOOD_HOME, h2: ['Domestic', 'Why Choose Us', 'Areas We Cover', 'Testimonials', 'Get a Quote'], nav: [['Home', '/'], ['About', '/about'], ['Contact', '/contact'], ['Blog', '/blog']] }, ...SERVICE_PAGES.slice(3)]);
  ok(!ids(i).includes('no_service_pages') && i.services.length === 0, '6. generic headings and menu items ("Why Choose Us", "Areas We Cover", "Blog") are never read as services');
}
{
  const i = run([{ ...GOOD_HOME, h2: ['Lock Changes', 'Locksmith'] , nav: [['Home', '/']]}, ...SERVICE_PAGES.slice(3)]);
  ok(!ids(i).some((x) => /service/.test(x)), '7. two named services (below the claim threshold) are never reported as missing pages');
}

console.log('\n── entity, location, linking, proof ──');
{
  const i = run([{ ...GOOD_HOME, title: 'Locksmith Services', h1: 'Locksmith Services', body: `Call 01225 123456. ${words(300)}` }, ...SERVICE_PAGES.map((s) => ({ ...s, title: s.title.replace('RG Locksmiths', 'Us') }))]);
  const f = i.findings.find((x) => x.id === 'name_unclear');
  ok(!!f && f.evidence.quotes.some((q) => /Locksmith Services/.test(q)) && f.evidence.urls[0] === O + '/', `8. business name missing from the homepage → name_unclear with the title it found (got ${ids(i)})`);
  ok(f?.confidence === 'medium', '8. a name check is MEDIUM confidence (a logo-only name is invisible to us)');
}
{
  const i = run([GOOD_HOME, ...SERVICE_PAGES]);
  ok(!ids(i).includes('name_unclear'), '9. a name that is stated is not flagged');
}
{
  const noPhone = (s: PageSpec): PageSpec => ({ ...s, body: (s.body ?? '').replace(/01225 123456/g, 'our number'), });
  const i = run([noPhone(GOOD_HOME) as PageSpec & { home: true }, ...SERVICE_PAGES.map(noPhone)]);
  const f = i.findings.find((x) => x.id === 'no_contact_details');
  ok(!!f && /No phone number appears/.test(f.observed) && f.evidence.signal.includes('0 phone numbers'), `10. no phone anywhere in 6 pages read → no_contact_details (got ${ids(i)})`);
  const one = run([noPhone(GOOD_HOME) as PageSpec & { home: true }]);
  ok(!ids(one).includes('no_contact_details'), '10. two pages or fewer is not enough to say a phone number is absent');
}
{
  const i = run([{ ...GOOD_HOME, title: 'RG Locksmiths | Lock experts', h1: 'RG Locksmiths', body: `Call 01225 123456. ${words(300)}` }, ...SERVICE_PAGES.map((s) => ({ ...s, title: s.title.replace(' in Bath', '') }))]);
  const f = i.findings.find((x) => x.id === 'location_unclear');
  ok(!!f && /Bath does not appear/.test(f.observed), `11. the home town stated nowhere → location_unclear (got ${ids(i)})`);
}
{
  const i = run([GOOD_HOME, ...SERVICE_PAGES.map((s) => ({ ...s, title: s.title.replace(' in Bath', ' for homes') }))]);
  const f = i.findings.find((x) => x.id === 'location_unclear');
  ok(!!f && f.confidence === 'medium' && /homepage, but none of the 3 service pages/.test(f.observed), `12. town on the homepage but on no service page → medium location_unclear (got ${ids(i)}: ${f?.observed})`);
}
{
  const i = run([{ ...GOOD_HOME, links: [], nav: [['Home', '/']], h2: ['Emergency Locksmith', 'Lock Changes', 'uPVC Door Repairs'] }, ...SERVICE_PAGES]);
  const f = i.findings.find((x) => x.id === 'internal_linking');
  ok(!!f && f.evidence.urls.length === 3 && /3 of 3/.test(f.observed), `13. service pages the homepage and menu never link to → internal_linking, 3 of 3 (got ${ids(i)}: ${f?.observed})`);
  const j = run([GOOD_HOME, ...SERVICE_PAGES]);
  ok(!ids(j).includes('internal_linking'), '13. linked from the menu and homepage → no internal-linking finding');
  const g = buildSalesInsights({ servedUrl: O + '/', pages: [page({ ...GOOD_HOME, links: [], nav: [['Home', '/']] }, true).p, ...SERVICE_PAGES.map((s) => { const x = page(s).p; x.l = undefined; return x; })], nav: [], lead: { town: 'Bath' } });
  ok(!ids(g).includes('internal_linking'), '13. links not recorded → never judged (an absent value is not "no links")');
}
{
  const bare = (s: PageSpec): PageSpec => ({ ...s, body: words(300) });
  const i = run([bare(GOOD_HOME) as PageSpec & { home: true }, ...SERVICE_PAGES.map(bare)]);
  const f = i.findings.find((x) => x.id === 'no_proof');
  ok(!!f && f.confidence === 'medium' && /widget loaded by script/.test(f.observed), `14. no review / accreditation / past-work anywhere → no_proof, MEDIUM, with the widget caveat (got ${ids(i)})`);
  ok(!ids(run([GOOD_HOME, ...SERVICE_PAGES])).includes('no_proof'), '14. a credential and a testimonial → no proof finding');
}

console.log('\n── strong site, opportunity, limits ──');
{
  const i = run([GOOD_HOME, ...SERVICE_PAGES]);
  ok(i.state === 'strong_site' && i.findings.length === 0, `15. a site with nothing real wrong is state strong_site with NO finding (got ${i.state}: ${ids(i)})`);
  ok(i.opportunity === null && i.strengths.length >= 3, `15. dedicated, substantial pages → NO service-page opportunity is claimed (got ${i.opportunity?.kind})`);
}
{
  const few = run([{ ...GOOD_HOME, nav: [['Home', '/'], ['Emergency Locksmith', '/emergency-locksmith'], ['About', '/about'], ['Contact', '/contact']], links: ['/emergency-locksmith'] }, SERVICE_PAGES[0], SERVICE_PAGES[3], SERVICE_PAGES[4]]);
  ok(few.state === 'strong_site' && few.opportunity?.kind === 'service_pages', `16. a clean site with few service pages → the service-page opportunity (got ${few.state}/${few.opportunity?.kind}: ${ids(few)})`);
  ok(few.opportunity?.spoken.startsWith("Your site's actually in decent shape. What we'd mainly do is build stronger dedicated pages around each of your services") && /Google and AI systems have a much clearer understanding of everything you offer and where you offer it\.$/.test(few.opportunity!.spoken), '16. the fallback is Paul\'s sentence');
  ok(servicePagesLine([]) === SERVICE_PAGES_OPPORTUNITY_LINE && /like Emergency Locksmith, Lock Changes and uPVC Door Repairs, so Google/.test(servicePagesLine(['Emergency Locksmith', 'Lock Changes', 'uPVC Door Repairs'])), '16. it names the prospect\'s own services when it knows them, and is the plain sentence when it does not');
}
{
  const light = (s: PageSpec): PageSpec => ({ ...s, body: words(150) });
  const i = run([GOOD_HOME, ...SERVICE_PAGES.slice(0, 3).map(light), ...SERVICE_PAGES.slice(3)]);
  ok(i.state === 'strong_site' && i.opportunity?.kind === 'deepen_services' && !/build stronger dedicated pages/.test(i.opportunity.spoken), `17. dedicated but light service pages → "make them more detailed", never "build the pages" (got ${i.opportunity?.kind})`);
  ok(!ids(i).includes('thin_pages') && i.findings.length === 0, '17. a short page is not a finding');
}
{
  const bare = (s: PageSpec): PageSpec => ({ ...s, body: words(300) });
  const i = run([bare(GOOD_HOME) as PageSpec & { home: true }, ...SERVICE_PAGES.map(bare)].filter((_, k) => k !== 1 && k !== 2));
  ok(i.state === 'strong_site' || i.state === 'issues', '18. fewer pages never throws');
  const g = run([GOOD_HOME, ...SERVICE_PAGES]);
  ok(STRONG_SITE_LINE.length > 40 && !/AI can't|isn't optimi|SEO is|can't find you/i.test(STRONG_SITE_LINE + g.strengths.join(' ')), '18. the strong-site line never says the vague things the brief bans');
}
{
  const built = [GOOD_HOME, ...SERVICE_PAGES.slice(0, 1)].map((s) => page(s, !!(s as { home?: boolean }).home));
  const i = buildSalesInsights({
    servedUrl: O + '/', pages: built.map((b) => b.p), nav: built[0].nav, capped: true,
    knownUrls: [O + '/lock-changes', O + '/upvc-door-repairs'], lead: { name: 'RG Locksmiths', town: 'Bath', trade: 'locksmith' },
  });
  ok(!ids(i).includes('no_service_pages') && i.services.every((s) => s.coverage === 'dedicated'), `19. capped crawl: pages found but not read still count as covered, never as missing (got ${i.services.map((s) => s.name + ':' + s.coverage)})`);
  const j = buildSalesInsights({ servedUrl: O + '/', pages: built.map((b) => b.p), nav: [['Emergency Locksmith', '/x-a'], ['Lock Changes', '/x-b'], ['uPVC Repairs', '/x-c']].map(([label, url]) => ({ label, url })), capped: true, lead: { town: 'Bath', trade: 'locksmith' } });
  ok(j.services.filter((s) => s.name !== 'Emergency Locksmith').length === 2 && j.services.filter((s) => s.name !== 'Emergency Locksmith').every((s) => s.coverage === 'unknown') && !ids(j).includes('no_service_pages'), '19. capped crawl: a menu item pointing at a page nobody read is "unknown", never "no page"');
  ok(j.basis.capped === true && j.basis.pagesRead === 2, '19. the basis says how much was read');
}
{
  const dead = buildSalesInsights({ servedUrl: O + '/', pages: [], nav: [], lead: null });
  ok(dead.state === 'unreadable' && dead.findings.length === 0 && dead.opportunity === null, '20. nothing readable → unreadable, nothing said');
}

console.log('\n── ranking and the stored shape ──');
{
  const messy = run([
    { ...GOOD_HOME, title: 'Locksmith Services', h1: 'Locksmith Services', links: [], body: words(300), nav: [['Home', '/'], ['Services', '/services']], h2: ['Emergency Locksmith', 'Lock Changes', 'uPVC Door Repairs'] },
    ...SERVICE_PAGES.slice(3).map((s) => ({ ...s, body: words(300), title: s.title.replace(' in Bath', '') })),
  ]);
  ok(messy.findings.length <= MAX_INSIGHT_FINDINGS && messy.findings.length >= 3, `21. a site with several problems keeps at most ${MAX_INSIGHT_FINDINGS}, strongest first (got ${ids(messy)})`);
  ok(messy.findings.every((f, k, a) => k === 0 || a[k - 1].priority >= f.priority), '21. stored findings are in priority order');
  ok(messy.findings.every((f) => f.evidence.urls.length >= 1 && f.observed && f.why && f.improvement && f.spoken && (f.confidence === 'high' || f.confidence === 'medium')), '21. every finding carries its page, observation, reason, Findable improvement and a confidence');
  ok(messy.findings[0].id === 'no_service_pages' || messy.findings[0].id === 'services_on_one_page', `21. the service-page finding outranks entity and linking points (got ${messy.findings[0].id})`);
  ok(JSON.stringify(messy).length < 9000, `21. it stays small enough to ride on the crawl row (${JSON.stringify(messy).length} bytes)`);
  ok(usableInsights(JSON.parse(JSON.stringify(messy)))?.version === SALES_INSIGHTS_VERSION && usableInsights({ version: 99, state: 'issues', findings: [] }) === null && usableInsights(null) === null && usableInsights({ version: 1, state: 'weird', findings: [] }) === null, '21. a stored value is read back only when current and well-formed');
  const again = run([
    { ...GOOD_HOME, title: 'Locksmith Services', h1: 'Locksmith Services', links: [], body: words(300), nav: [['Home', '/'], ['Services', '/services']], h2: ['Emergency Locksmith', 'Lock Changes', 'uPVC Door Repairs'] },
    ...SERVICE_PAGES.slice(3).map((s) => ({ ...s, body: words(300), title: s.title.replace(' in Bath', '') })),
  ]);
  ok(JSON.stringify(again) === JSON.stringify(messy), '21. the same pages always give the same insights (deterministic)');
}
{
  const merged = mergePoints([{ kind: 'thin_pages' }, { kind: 'crawler_blocked' }, { kind: 'duplicate_pages' }], run([
    { ...GOOD_HOME, nav: [['Home', '/']], links: [], h2: ['Emergency Locksmith', 'Lock Changes', 'uPVC Door Repairs'] }, ...SERVICE_PAGES.slice(3),
  ]));
  ok(merged.length === 2 && merged[0].from === 'legacy' && merged[1].from === 'insight', `22. one ordering across technical and content points: a blocked crawler first, then the service-page gap (got ${JSON.stringify(merged)})`);
  const same = mergePoints([{ kind: 'canonical_off_domain' }, { kind: 'noindex_important_page' }, { kind: 'sitemap_wrong_domain' }], null, 3);
  ok(same.length === 3 && new Set(same.map((s) => s.index)).size === 3, '22. different technical themes are all kept when asked for three');
  ok(mergePoints([], null).length === 0, '22. nothing in, nothing out');
  ok(rankFindings([{ priority: 1 }, { priority: 5 }, { priority: 3 }]).map((x) => x.priority).join() === '5,3,1', '22. rankFindings sorts by priority');
}
{
  ok(stem('repairs') === stem('repair') && stem('changes') === stem('change') && stem('plumber') === stem('plumbing'), '23. "repairs/repair", "changes/change" and "plumber/plumbing" meet');
}

console.log('\n── the inline (standard) crawl, the research layer, and what the code is allowed to do ──');
{
  const raw = (title: string, body: string, nav = '') => '<html><head><title>' + title + '</title><meta name="viewport" content="width=device-width"></head><body><nav>' + nav + '</nav><h1>' + title + '</h1>' + body + '</body></html>';
  const nav = '<a href="/services">Services</a><a href="/about">About</a><a href="/contact">Contact</a>';
  const page = (path: string, title: string, body: string) => ({ url: O + path, finalUrl: O + path, status: 200, xRobotsTag: null as string | null, html: raw(title, body, nav) });
  const filler = '<p>' + words(300) + ' Call 01225 123456. Gas Safe registered.</p>';
  const home = page('/', 'RG Locksmiths | Locksmith in Bath', filler + '<a href="/services">services</a>');
  const samples = [page('/services', 'Our Services', '<h2>Emergency Locksmith</h2><p>' + words(50) + '</p><h2>Lock Changes</h2><p>' + words(50) + '</p><h2>uPVC Door Repairs</h2><p>' + words(50) + '</p>' + filler), page('/about', 'About RG Locksmiths', filler), page('/contact', 'Contact', filler)];
  const known = [O + '/services', O + '/about', O + '/contact', O + '/blog/a', O + '/blog/b'];
  const i = insightsFromFetchedPages({ servedUrl: O + '/', home, samples, knownUrls: known, lead: { name: 'RG Locksmiths', town: 'Bath', trade: 'locksmith' } });
  ok(i.findings.some((f) => f.id === 'services_on_one_page') && i.basis.pagesRead === 4 && i.basis.capped === true, '24. the inline crawl turns the SAME fetched pages into the same finding, and says it read a sample (capped) — got ' + i.findings.map((f) => f.id).join() + '/' + JSON.stringify(i.basis));
  const full = insightsFromFetchedPages({ servedUrl: O + '/', home, samples, knownUrls: [O + '/services', O + '/about', O + '/contact'], lead: { name: 'RG Locksmiths', town: 'Bath', trade: 'locksmith' } });
  ok(full.basis.capped === false, '24. every known page sampled → not capped');
  ok(insightsFromFetchedPages({ servedUrl: O + '/', home: { ...home, html: '' }, samples: [], knownUrls: [] }).state === 'unreadable', '24. an empty homepage → unreadable, nothing said');
}
{
  const ins = run([{ ...GOOD_HOME, nav: [['Home', '/']], links: [], h2: ['Emergency Locksmith', 'Lock Changes', 'uPVC Door Repairs'] }, ...SERVICE_PAGES]);
  const rows = crawlFindings({ created_at: new Date().toISOString(), result: { version: 2, insights: ins } as never }, Date.now()).findings.filter((f) => f.id.startsWith('insight:'));
  ok(rows.length >= 1 && rows[0].kind === 'missing_core_service_pages' || rows.some((r) => r.kind === 'other'), '25. the warm-lead research (voice note / reply) reads the same insights');
  ok(rows.every((r) => r.verified && r.source === 'crawl' && r.evidence.length >= 1), '25. each carries its evidence and is marked as read off the crawl');
}
{
  const src = (p: string) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const mod = src('src/lib/salesInsights.ts'), inline = src('src/lib/salesInsightsInline.ts');
  ok(!/\bfetch\(|openai|anthropic|createClient|Deno\./i.test(mod + inline), '26. the analysis makes no request and no model call — deterministic, free');
  const cc = src('supabase/functions/crawl-check/index.ts'), job = src('supabase/functions/_shared/crawl-job.ts');
  ok(/insightsFromFetchedPages\(/.test(cc) && /\.\.\.\(insights \? \{ insights \} : \{\}\)/.test(cc), '26. the inline crawl builds and stores the insights on the result');
  ok(/buildSalesInsights\(/.test(job) && /full\.audit\.insights = insights/.test(job) && /\.\.\.\(insights \? \{ insights \} : \{\}\)/.test(job), '26. the background crawl builds them at finalize and stores them on the result AND the audit');
  ok(/planCappedBatch\(rows, servedUrl\)/.test(job) && /skip_reason: "low_value"/.test(job), '26. a capped crawl chooses its pages by priority and records junk as skipped');
  ok(!/questionCount|create-ai-audit|audit_purpose|baseline/i.test(mod + inline), '26. nothing in the insight layer touches the paid baseline or the audit methodology');
  const spokenAll = [mod.match(/spoken: [^\n]*/g)?.join('\n') ?? '', SERVICE_PAGES_OPPORTUNITY_LINE, STRONG_SITE_LINE].join('\n');
  ok(!/guarantee|will (rank|recommend|cite)|keyword|llms\.txt|GPTBot|SEO score|number one|#1/i.test(spokenAll), '26. no promise, no keyword talk, no llms.txt or GPTBot in anything the insights can say');
  ok(/Findable would improve|improvement/.test(mod) && !/\bschema\b/i.test(spokenAll.replace(/structured/g, '')), '26. no schema pitch in the spoken lines');
}

if (failures) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall passed');
