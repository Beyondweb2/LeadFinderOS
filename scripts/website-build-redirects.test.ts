/* WEBSITE BUILD — OLD PAGES / RANKING PROTECTION (2026-10-10, docs/website-build-redirects.md). The real
   functions on fixture data (no network, no database; the live fetch runs against a fake site):
     A. finding the old pages (important by rule, nothing found ever dropped)
     B. mapping (same path kept, merged → owner, retired never blindly to the home page)
     C. the verdict — LeadFinderOS and the gate script, ONE table: missing, wrong target, 302, chain, home dump,
        noindex target, soft 404, off-site, a stale mapping, absent flags
     D. the gate script's own fetch (--url) against a fake preview / live site, and its --dist _redirects check
     E. "Old pages protected: X of Y", the hand-typed report, another address, a check for an older mapping
     F. the launch rule, the live rule, the server's save refusal, the no-old-site exemption
     G. the simple flow: Prepare records them, Needs you stops the prompt, the prompt and the expect file carry them */

import { parseWebsiteBuild, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import {
  EMPTY_OLD_PAGES, addOldUrl, autoMapOldUrls, inventoryFromCrawl, judgeOldUrlResult, mapOldUrl, mergeOldUrls, noOldSiteRefusal, oldPagesProblems,
  oldPagesSaveRefusal, oldPagesSummary, readOldPages, readOldUrlCheck, recordNoOldSite, removeOldUrl, setOldUrlImportant, unmappedOldUrls,
  type CrawlPageRow, type OldPagesState, type OldUrlResult,
} from '../src/lib/oldPages.ts';
import { productionGateProblems, productionReadiness, websiteBuildSaveRefusal } from '../src/lib/websiteLaunch.ts';
import { readSiteGateReport, siteIntentMap } from '../src/lib/siteGate.ts';
import { applyBuildResult, correctionPrompt, parseBuildResult } from '../src/lib/buildExecution.ts';
import { auditSite, checkOldUrls, judgeOldUrl } from './site-quality-gate.mjs';
import { clearedForProduction } from './lib/website-launch-ready.ts';
import { candidateFacts, mergeFacts } from '../src/lib/buildFacts.ts';
import { templateById } from '../src/lib/websiteTemplates.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';
import type { BuildPackInput } from '../src/lib/buildPack.ts';
import { websiteServiceRoute } from '../src/lib/websiteRoute.ts';
import { domainAuthority, domainInputFromRow, DOMAIN_REASON_TEXT } from '../src/lib/domainAuthority.ts';
import { computeMapping } from '../src/lib/templateMapping.ts';
import { applyBuildType, blockers, currentWebsite, masterBuildPrompt, oldPagesView, prepareWebsite, simpleIssues, technicalCheck, type SimpleInput } from '../src/lib/simpleBuild.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; }
const section = (t: string) => console.log('\n── ' + t + ' ──');

const SITE = 'https://brookfootplumbing.example';
const PREVIEW = 'https://preview.brookfoot-plumbing.pages.dev';
const row = (path: string, over: Partial<CrawlPageRow> = {}): CrawlPageRow => ({ url: SITE + path, source: 'link', inbound: 2, http_status: 200, status: 'done', ...over });

/* ── A. finding the old pages ─────────────────────────────────────────────────────────────────────── */
section('A. finding the old pages');
const found = inventoryFromCrawl({ siteUrl: SITE, services: ['Boiler repairs', 'Radiator installation'], rows: [
  row('/', { source: 'seed' }), row('/boiler-repairs/'), row('/services/'), row('/contact-us'), row('/blog/winter-tips/', { source: 'sitemap', inbound: 3 }),
  row('/news/old-post/', { source: 'sitemap', inbound: 0 }), row('/gallery/', { inbound: 1 }), row('/wp-admin/'), row('/images/van.jpg'), row('/gone/', { http_status: 404 }),
  { url: 'https://other.example/page/', source: 'link', inbound: 1, http_status: 200, status: 'done' }, row('/orphan/', { inbound: 0 }), row('/unknown-links/', { source: 'sitemap', inbound: null }),
] });
const f = (p: string) => found.find((x) => x.path === p);
ok(!!f('/') && f('/')!.reasons.includes('homepage'), 'A: the home page is always recorded and is a must-keep page');
ok(f('/boiler-repairs/')!.reasons.includes('service') && f('/services/')!.reasons.includes('service'), 'A: a page naming a confirmed service, and a services page, are must-keep service pages');
ok(f('/contact-us')!.reasons.includes('contact'), 'A: contact is a must-keep page');
ok(f('/blog/winter-tips/')!.reasons.includes('sitemap_linked'), 'A: a sitemap page with inbound links is a must-keep page');
ok(f('/news/old-post/')!.reasons.includes('sitemap') && !f('/news/old-post/')!.reasons.includes('sitemap_linked'), 'A: a sitemap page nothing links to is recorded, not must-keep');
ok(f('/unknown-links/')!.reasons.includes('sitemap_linked'), 'A: a sitemap page whose links are unknown is treated as linked (default to important when unsure)');
ok(!f('/wp-admin/') && !f('/images/van.jpg') && !f('/gone/') && !found.some((x) => x.path === '/page/'), 'A: admin paths, assets, a 404 on the old site and another host are not old pages');
const op0 = mergeOldUrls(EMPTY_OLD_PAGES, found, { siteUrl: SITE, readFrom: 'full_crawl', now: '2026-10-10T10:00:00Z' });
ok(op0.urls.every((u) => u.important), 'A: everything found starts important (default to important when unsure)');
const opMarked = setOldUrlImportant(op0, '/orphan/', false);
ok(!opMarked.urls.find((u) => u.path === '/orphan/')!.important, 'A: a page with no must-keep reason may be marked not important');
ok(setOldUrlImportant(op0, '/contact-us', false).urls.find((u) => u.path === '/contact-us')!.important, 'A: a must-keep page cannot be marked not important');
const reread = mergeOldUrls(mapOldUrl(opMarked, '/gallery/', '/about/'), [{ path: '/', source: 'crawl', reasons: ['homepage'] }], { siteUrl: SITE, readFrom: 'quick_crawl', now: '2026-10-11T10:00:00Z' });
ok(reread.urls.length === op0.urls.length && reread.urls.find((u) => u.path === '/gallery/')!.target === '/about/' && !reread.urls.find((u) => u.path === '/orphan/')!.important && reread.read_from === 'full_crawl',
  'A: a later, smaller read drops nothing found and keeps every decision (and the better read)');
ok(removeOldUrl(op0, '/gallery/').urls.length === op0.urls.length, 'A: a found page cannot be removed (only a hand-added one)');
const added = addOldUrl(op0, 'https://brookfootplumbing.example/boiler-repair-leeds?x=1');
ok(!added.error && added.state.urls.some((u) => u.path === '/boiler-repair-leeds' && u.source === 'person' && u.important), 'A: Paul can add an address by hand (the path is kept; important by default)');
ok(removeOldUrl(added.state, '/boiler-repair-leeds').urls.length === op0.urls.length, 'A: …and remove his own');
ok(!!addOldUrl(op0, '/contact-us/').error, 'A: an address already listed is not added twice');
ok(mergeOldUrls(op0, [], { siteUrl: 'https://another-site.example', readFrom: 'homepage_only', now: 'x' }).urls.length === 0, 'A: a DIFFERENT old site starts a new list');

/* ── B. mapping ───────────────────────────────────────────────────────────────────────────────────── */
section('B. mapping');
const NEW = [
  { path: '/', family: 'homepage', title: 'Home' }, { path: '/services/', family: 'services_index', title: 'Services' },
  { path: '/services/boiler-repairs/', family: 'service', title: 'Boiler repairs' }, { path: '/services/radiator-installation/', family: 'service', title: 'Radiator installation' },
  { path: '/about/', family: 'about', title: 'About' }, { path: '/contact/', family: 'contact', title: 'Contact' }, { path: '/privacy/', family: 'legal', title: 'Privacy policy' },
];
const auto = autoMapOldUrls(op0, NEW);
const t = (p: string) => auto.urls.find((u) => u.path === p)!.target;
ok(t('/') === '/' && t('/services/') === '/services/', 'B: the same address on the new site is kept (no redirect)');
ok(t('/boiler-repairs/') === '/services/boiler-repairs/', 'B: a moved service page goes to the service page that shares its words (a 301)');
ok(t('/contact-us') === '/contact/', 'B: contact goes to contact');
ok(t('/blog/winter-tips/') === '' && t('/gallery/') === '', 'B: a retired page with no close match stays UNMAPPED — never blindly to the home page');
ok(unmappedOldUrls(auto).some((u) => u.path === '/blog/winter-tips/'), 'B: an unmapped important page is listed for Paul');
const homeNoReason = mapOldUrl(auto, '/gallery/', '/');
ok(unmappedOldUrls(homeNoReason).some((u) => u.path === '/gallery/'), 'B: the home page for a non-home page with no written reason does not count as mapped');
const homeReason = mapOldUrl(auto, '/gallery/', '/', 'The gallery is now the photo strip on the home page');
ok(!unmappedOldUrls(homeReason).some((u) => u.path === '/gallery/'), 'B: …with a written reason it does');
ok(mapOldUrl(homeReason, '/gallery/', '/about/').urls.find((u) => u.path === '/gallery/')!.home_reason === '', 'B: moving it off the home page clears the reason');

/* ── C. the verdict: LeadFinderOS and the gate, one table ─────────────────────────────────────────── */
section('C. the verdict (LeadFinderOS = the gate)');
const R = (o: Partial<OldUrlResult>): OldUrlResult => ({ path: '/old/', target: '/new/', hops: [301], final_status: 200, final_path: '/new/', soft_404: false, noindex: false, problem: '', ...o });
const TABLE: Array<[string, OldUrlResult, string, boolean, RegExp]> = [
  ['kept at the same address', R({ path: '/new/', hops: [] }), '/new/', true, /still answers/],
  ['one 301 to the target', R({}), '/new/', true, /redirects once \(301\)/],
  ['one 308 (trailing slash) to the target', R({ path: '/new', hops: [308] }), '/new/', true, /redirects once \(308\)/],
  ['missing redirect (404)', R({ hops: [], final_status: 404, final_path: '/old/' }), '/new/', false, /404: the page is gone/],
  ['wrong target', R({ final_path: '/services/' }), '/new/', false, /lands on \/services\/, not on \/new\//],
  ['302 where a 301 is needed', R({ hops: [302] }), '/new/', false, /temporary redirect \(302\)/],
  ['a chain', R({ hops: [301, 301] }), '/new/', false, /2 redirects \(a chain\)/],
  ['home-page dump', R({ final_path: '/' }), '/new/', false, /home page instead of \/new\//],
  ['noindex target', R({ noindex: true }), '/new/', false, /carries noindex/],
  ['soft 404', R({ soft_404: true }), '/new/', false, /soft 404/],
  ['off the site', R({ problem: 'redirects off the site, to elsewhere.example', final_status: 0, final_path: null }), '/new/', false, /off the site/],
  ['checked for an older mapping', R({ target: '/services/' , final_path: '/services/' }), '/new/', false, /now goes to \/new\/ — run the check again/],
  ['no new page chosen', R({}), '', false, /no new page chosen/],
  ['home page with a reason (mapped there on purpose)', R({ final_path: '/', target: '/' }), '/', true, /redirects once/],
];
for (const [name, r, target, pass, re] of TABLE) {
  const a = judgeOldUrlResult(r, target), b = judgeOldUrl(r, target);
  ok(a.passed === pass && re.test(a.detail), 'C: ' + name + ' → ' + (pass ? 'pass' : 'fail') + ' (' + a.detail + ')');
  ok(a.passed === b.passed && a.detail === b.detail, 'C: the gate script says the same for "' + name + '"');
}
const absent = readOldUrlCheck({ base: PREVIEW, results: [{ path: '/old/', target: '/new/', hops: [301], final_status: 200, final_path: '/new/' }] });
ok(!judgeOldUrlResult(absent.results[0], '/new/').passed, 'C: a result that does not SAY "not a soft 404" / "not noindex" is not a pass (absent = bad)');
ok(!judgeOldUrlResult(readOldUrlCheck({ base: PREVIEW, results: [{ path: '/old/', target: '/new/', passed: true }] }).results[0], '/new/').passed, 'C: a result that only says "passed": true is not a pass');

/* ── D. the gate script: the live fetch and the --dist check ─────────────────────────────────────── */
section('D. the gate script fetches each old address');
type Route = { status: number; location?: string; body?: string; robots?: string };
const page = (h1: string, extra = '') => '<html><head><title>' + h1 + ' | Brookfoot</title>' + extra + '</head><body><h1>' + h1 + '</h1><p>Plumbing in Brighouse.</p></body></html>';
const SPA = '<html><head><title>Brookfoot Plumbing</title></head><body><h1>Brookfoot Plumbing</h1><p>Home.</p></body></html>';
function fakeSite(base: string, routes: Record<string, Route>, fallbackSpa = false) {
  return async (url: string) => {
    const u = new URL(url);
    if (u.origin !== base) throw new Error('fetched off the site: ' + url);
    const r = routes[u.pathname] ?? (fallbackSpa ? { status: 200, body: SPA } : { status: 404, body: '<h1>Not found</h1>' });
    const headers = new Headers();
    if (r.location) headers.set('location', r.location);
    if (r.robots) headers.set('x-robots-tag', r.robots);
    return { status: r.status, headers, text: async () => r.body ?? '' } as unknown as Response;
  };
}
const ROUTES: Record<string, Route> = {
  '/': { status: 200, body: SPA, robots: 'noindex' },
  '/kept/': { status: 200, body: page('Kept page'), robots: 'noindex' },
  '/moved': { status: 301, location: '/new/' },
  '/new/': { status: 200, body: page('New page'), robots: 'noindex' },
  '/temp': { status: 302, location: '/new/' },
  '/chain': { status: 301, location: '/mid' }, '/mid': { status: 301, location: '/new/' },
  '/dump': { status: 301, location: '/' },
  '/to-noindex': { status: 301, location: '/hidden/' }, '/hidden/': { status: 200, body: page('Hidden', '<meta name="robots" content="noindex">') },
  '/soft': { status: 200, body: page('Page not found') },
  '/away': { status: 301, location: 'https://elsewhere.example/' },
};
const LIST = [
  { path: '/kept/', target: '/kept/' }, { path: '/moved', target: '/new/' }, { path: '/temp', target: '/new/' }, { path: '/chain', target: '/new/' }, { path: '/dump', target: '/new/' },
  { path: '/to-noindex', target: '/hidden/' }, { path: '/soft', target: '/soft' }, { path: '/missing', target: '/new/' }, { path: '/away', target: '/new/' },
];
const live = await checkOldUrls({ base: PREVIEW, list: LIST, preview: true, fetchImpl: fakeSite(PREVIEW, ROUTES) as typeof fetch });
const v = (p: string) => judgeOldUrl(live.results.find((x: OldUrlResult) => x.path === p), LIST.find((x) => x.path === p)!.target);
ok(live.base === PREVIEW, 'D: the check records the address it ran on');
ok(v('/kept/').passed && v('/moved').passed, 'D: a kept page and one 301 pass (the preview\'s own noindex HEADER does not count against the target)');
ok(/302/.test(v('/temp').detail) && /chain/.test(v('/chain').detail) && /home page instead/.test(v('/dump').detail), 'D: a 302, a chain and a home-page dump fail');
ok(/noindex/.test(v('/to-noindex').detail) && /soft 404/.test(v('/soft').detail) && /404/.test(v('/missing').detail) && /off the site/.test(v('/away').detail), 'D: a noindex target, a soft 404, a missing redirect and an off-site redirect fail');
const spa = await checkOldUrls({ base: PREVIEW, list: [{ path: '/old-service/', target: '/old-service/' }], preview: true, fetchImpl: fakeSite(PREVIEW, { '/': { status: 200, body: SPA } }, true) as typeof fetch });
ok(spa.results[0].soft_404 === true, 'D: a page identical to what a made-up address gets (an SPA fallback, HTTP 200) is a soft 404');
const LIVE = 'https://brookfootplumbing.example';
const prodHeader = await checkOldUrls({ base: LIVE, list: [{ path: '/kept/', target: '/kept/' }], preview: false, fetchImpl: fakeSite(LIVE, { '/kept/': { status: 200, body: page('Kept'), robots: 'noindex' } }) as typeof fetch });
ok(prodHeader.results[0].noindex === true, 'D: on the LIVE site a noindex header on the target counts');

const site = (redirects: string, pages: string[]) => ({ mode: 'dist', pages: new Map(pages.map((p) => [p, page('P ' + p)])), files: new Set<string>(), sizes: new Map(), sitemaps: new Map(), robots: 'User-agent: *\nAllow: /', headers: null, redirects, llms: false, live: null });
const dist = (redirects: string, pages: string[], oldUrls: Array<{ path: string; target: string }> | undefined) => auditSite(site(redirects, pages), { domain: 'brookfootplumbing.example', expect: { domain: 'brookfootplumbing.example', oldUrls } }).checks.find((c: { id: string }) => c.id === 'old_urls');
ok(dist('/boilers /services/boiler-repairs/ 301', ['/', '/services/boiler-repairs/'], [{ path: '/boilers', target: '/services/boiler-repairs/' }]).level === 'pass', 'D: --dist: a 301 line straight to a built page passes');
ok(/no status written = 302/.test(dist('/boilers /services/boiler-repairs/', ['/', '/services/boiler-repairs/'], [{ path: '/boilers', target: '/services/boiler-repairs/' }]).details.join(' ')), 'D: --dist: a _redirects line with no status is a 302 on Cloudflare and fails');
ok(/no redirect/.test(dist('', ['/'], [{ path: '/boilers', target: '/services/boiler-repairs/' }]).details.join(' ')), 'D: --dist: a missing redirect fails');
ok(/no page is built/.test(dist('', ['/'], [{ path: '/about/', target: '/about/' }]).details.join(' ')), 'D: --dist: a kept address with no page fails');
ok(/without the trailing slash/.test(dist('/boilers /services/boiler-repairs 301', ['/', '/services/boiler-repairs/'], [{ path: '/boilers', target: '/services/boiler-repairs/' }]).details.join(' ')), 'D: --dist: a redirect without the trailing slash (a second hop) fails');
ok(dist('', ['/'], undefined).level === 'skip', 'D: an expect file with no oldUrls SKIPS (and says so) — never passes');
ok(dist('', ['/'], []).level === 'pass', 'D: an empty list (no old site recorded) passes');
const urlRun = auditSite({ ...site('', ['/']), mode: 'url', live: { homeRobotsHeader: 'noindex', botFetch: [], transport: [], formPreflight: null, oldUrls: live } }, { domain: 'brookfootplumbing.example', preview: true, expect: { domain: 'brookfootplumbing.example', oldUrls: LIST } });
ok(urlRun.checks.find((c: { id: string }) => c.id === 'old_urls').level === 'fail' && urlRun.oldUrls?.results?.length === LIST.length, 'D: a --url run fails old_urls and carries the raw facts as "oldUrls" in the report');

/* ── E. the summary and the pasted report ─────────────────────────────────────────────────────────── */
section('E. "Old pages protected: X of Y" and the pasted report');
const OP: OldPagesState = readOldPages({ site_url: SITE, recorded_at: 'x', read_from: 'full_crawl', urls: [
  { path: '/', source: 'crawl', important: true, reasons: ['homepage'], target: '/' },
  { path: '/boilers', source: 'sitemap', important: true, reasons: ['service'], target: '/services/boiler-repairs/' },
  { path: '/contact-us', source: 'crawl', important: true, reasons: ['contact'], target: '/contact/' },
  { path: '/old-news/', source: 'crawl', important: false, reasons: ['unsure'], target: '' },
] });
const good = { base: PREVIEW, results: [
  { path: '/', target: '/', hops: [], final_status: 200, final_path: '/', soft_404: false, noindex: false, problem: '' },
  { path: '/boilers', target: '/services/boiler-repairs/', hops: [301], final_status: 200, final_path: '/services/boiler-repairs/', soft_404: false, noindex: false, problem: '' },
  { path: '/contact-us', target: '/contact/', hops: [301], final_status: 200, final_path: '/contact/', soft_404: false, noindex: false, problem: '' },
] };
const sGood = oldPagesSummary(OP, readOldUrlCheck(good), PREVIEW);
ok(sGood.line === 'Old pages protected: 3 of 3' && !sGood.missing.length, 'E: three important pages, all fetched and judged a pass → "Old pages protected: 3 of 3" (the not-important one is not counted)');
const s302 = oldPagesSummary(OP, readOldUrlCheck({ ...good, results: good.results.map((r) => (r.path === '/boilers' ? { ...r, hops: [302], passed: true } : r)) }), PREVIEW);
ok(s302.line === 'Old pages protected: 2 of 3' && /temporary redirect \(302\)/.test(s302.missing.join(' ')), 'E: a report that calls a 302 fine is judged a failure from its own raw facts');
ok(/not in the check/.test(oldPagesSummary(OP, readOldUrlCheck({ ...good, results: good.results.slice(0, 2) }), PREVIEW).missing.join(' ')), 'E: an important address the report left out is not protected');
ok(/was checked on/.test(oldPagesSummary(OP, readOldUrlCheck({ ...good, base: 'https://another.pages.dev' }), PREVIEW).missing.join(' ')), 'E: a check run on another address does not count');
const remapped = mapOldUrl(OP, '/contact-us', '/about/');
ok(/run the check again/.test(oldPagesSummary(remapped, readOldUrlCheck(good), PREVIEW).missing.join(' ')), 'E: changing a mapping after the check needs a new check');
const handTyped = readSiteGateReport({ siteGateVersion: 1, domain: 'brookfootplumbing.example', mode: 'url', preview: true, passed: true, checks: [{ id: 'x', label: 'x', level: 'pass' }] });
ok(!handTyped.oldUrls.reported && /has not been checked yet/.test(oldPagesSummary(OP, handTyped.oldUrls, PREVIEW).missing.join(' ')), 'E: a hand-typed "passed" report with no old-address results protects nothing');
ok(oldPagesSummary(OP, null, PREVIEW).line === 'Old pages protected: 0 of 3', 'E: before any check: 0 of 3');

/* ── F. launch, live, save, exemption ─────────────────────────────────────────────────────────────── */
section('F. the launch rule, the live rule, the save refusal, no old site');
const base = clearedForProduction({ route: 'bespoke', cloudflare_project: 'brookfoot-plumbing', preview_url: PREVIEW, canonical_domain: 'brookfootplumbing.example', local_repo_path: 'C:\\x\\Brookfoot', source_site_url: SITE }, { existingSite: true });
const launch = (raw: Record<string, unknown>) => productionReadiness({ state: parseWebsiteBuild(raw), route: 'build', hasExistingSite: true, domain: null });
const withPages = (op: unknown, check: unknown) => ({ ...base, old_pages: op, build_execution: { ...(base.build_execution as object), old_urls: check } });
ok(launch(withPages(OP, good)).every((p) => !/^Old pages/.test(p)), 'F: every important old page protected on the preview → the launch rule has no old-page problem');
ok(launch(withPages(OP, { ...good, results: good.results.slice(0, 2) })).some((p) => /^Old pages protected: 2 of 3 on the preview/.test(p)), 'F: one not protected → the launch is blocked, in one plain line');
ok(launch(withPages(EMPTY_OLD_PAGES, undefined)).some((p) => /Old pages not recorded/.test(p)), 'F: neither old pages nor "no old site" recorded → the launch is blocked');
const exempt = recordNoOldSite(EMPTY_OLD_PAGES, 'The client told us they have never had a website', '2026-10-10T10:00:00Z');
ok(launch(withPages(exempt, undefined)).every((p) => !/[Oo]ld pages/.test(p)), 'F: the no-old-site exemption, recorded explicitly → nothing to protect');
ok(!!noOldSiteRefusal(EMPTY_OLD_PAGES, true, 'they never had one, honestly'), 'F: "no old site" is refused when a current website is on record');
ok(!!noOldSiteRefusal(OP, false, 'they never had one, honestly') && !!noOldSiteRefusal(EMPTY_OLD_PAGES, false, 'none'), 'F: …and while old pages are listed, and without a real reason');
ok(!noOldSiteRefusal(EMPTY_OLD_PAGES, false, 'The client told us they have never had a website'), 'F: …and allowed otherwise');

const prev = withPages(OP, good);
const tryLaunch = (next: Record<string, unknown>) => websiteBuildSaveRefusal(prev, { ...next, production_url: 'https://brookfootplumbing.example', production_status: 'deployed' }, { route: 'build', domain: null, ended: false });
ok(tryLaunch(prev) === '', 'F: the server allows recording the launch when every old page is protected');
ok(/old-page|Old pages protected/i.test(tryLaunch(withPages(OP, { ...good, results: good.results.slice(0, 2) }))), 'F: the server REFUSES recording the launch while an old page is not protected');
ok(/remove 1 old page/.test(websiteBuildSaveRefusal(prev, withPages({ ...OP, urls: OP.urls.filter((u) => u.path !== '/boilers') }, good), { route: 'build', domain: null, ended: false })), 'F: the server refuses a save that quietly removes a found page');
ok(/must stay important/.test(oldPagesSaveRefusal(OP, { ...OP, urls: OP.urls.map((u) => (u.path === '/contact-us' ? { ...u, important: false } : u)) })), 'F: …or un-marks a must-keep page (stored raw)');
ok(/no old site/.test(oldPagesSaveRefusal(OP, { ...OP, none_at: 'x', none_reason: 'nothing at all here' })), 'F: …or records "no old site" while old pages are listed');

const G = (old_urls: unknown) => ({ imported_at: 'x', version: 1, domain: 'brookfootplumbing.example', mode: 'url', preview: false, passed: true, fails: [], warns: [], old_urls: readOldUrlCheck(old_urls) });
const liveGood = { ...good, base: 'https://www.brookfootplumbing.example' };
ok(productionGateProblems(G(liveGood), 'brookfootplumbing.example', OP).length === 0, 'F: the live check repeats it on the real domain (www ignored) — all protected → verified');
ok(productionGateProblems(G({ ...liveGood, results: liveGood.results.map((r) => (r.path === '/boilers' ? { ...r, final_path: '/' } : r)) }), 'brookfootplumbing.example', OP).some((p) => /on the live site/.test(p) && /home page instead/.test(p)), 'F: a home-page dump on the live site stops "Production checked"');
ok(productionGateProblems(G(good), 'brookfootplumbing.example', OP).some((p) => /was checked on/.test(p)), 'F: the PREVIEW\'s results pasted as the live check do not verify the live site');
ok(productionGateProblems(G(undefined), 'brookfootplumbing.example', exempt).length === 0, 'F: no old site recorded → the live check needs no old pages');
ok(oldPagesProblems(OP, null, { stage: 'production', base: 'brookfootplumbing.example' }).length === 1, 'F: a live check without the old pages does not verify the live site');

/* ── G. the simple flow ───────────────────────────────────────────────────────────────────────────── */
section('G. the simple flow');
const payload = { lead: { id: '1e000000-0000-0000-0000-00000000b001', business_name: 'Brookfoot Plumbing & Heating', phone: '01632 960482', email: 'dean@brookfootplumbing.example', category: 'Plumber', website: SITE, services_included: [], website_build: {} },
  onboarding: { business_name: 'Brookfoot Plumbing & Heating', confirmed_location: 'Brighouse', confirmed_phone: '01632 960482', contact_email: 'dean@brookfootplumbing.example', services_list: ['Boiler repairs', 'Radiator installation'],
    areas_list: ['Brighouse'], plan_tier: 'new_site', website_addon: true, business_website: SITE, domain_status: 'existing', domain_owned: 'yes', domain_third_party: 'no', domain_access: 'yes', authority_confirmed: true, dns_permission: true, materials_confirmed: true },
  baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null, discovery_audit: null, crawl: null, pages: [] } as unknown as RebuildContextPayload;
function packFor(state: WebsiteBuildState): BuildPackInput {
  const template = state.route === 'template_rebuild' ? templateById(state.template_id) : null;
  const rows = mergeFacts(candidateFacts(payload as never, state.canonical_domain), state.facts, template);
  const evidence = toRebuildPromptInput(payload);
  const route = websiteServiceRoute(payload.onboarding as never, payload.lead as never);
  const d = domainAuthority(domainInputFromRow(payload.onboarding as never));
  const ob = payload.onboarding as Record<string, unknown>;
  return { state, template, facts: rows, evidence, businessName: 'Brookfoot Plumbing & Heating', existingSiteUrl: currentWebsite(state.source_site_url, rows.find((r) => r.key === 'website')).url,
    mustNotSay: '', serviceRoute: route.route, routeSource: route.source, domain: { applies: d.applies, ready: d.ready, reasons: d.reasons.map((r) => DOMAIN_REASON_TEXT[r]) },
    clientTruth: { onboardingList: ob.services_list, onboardingText: ob.services, notOffered: ob.services_not_offered, leadServices: [] } };
}
const simple = (s: WebsiteBuildState): SimpleInput => ({ pack: packFor(s), onboarding: payload.onboarding, leadId: '1e000000-0000-0000-0000-00000000b001', oldUrls: [], domain: null, ended: false });
let st = applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', payload.onboarding);
const prep = prepareWebsite({ pack: packFor(st), onboarding: payload.onboarding, active: true, now: '2026-10-10T10:00:00Z',
  oldSite: { readFrom: 'full_crawl', rows: [row('/', { source: 'seed' }), row('/boiler-repairs/'), row('/contact-us'), row('/blog/winter-tips/', { source: 'sitemap', inbound: 3 })] } });
st = prep.state;
ok(st.old_pages.site_url === SITE && st.old_pages.urls.length === 4 && prep.changes.some((c) => /^Old pages: 4 recorded/.test(c)), 'G: Prepare records the current site\'s pages from the stored crawl');
ok(st.old_pages.urls.find((u) => u.path === '/boiler-repairs/')!.target === '/services/boiler-repairs/', 'G: …and maps what it sensibly can to the new page plan');
const iss = simpleIssues(simple(st));
ok(blockers(iss).some((b) => b.id === 'old-pages-unmapped' && /\/blog\/winter-tips\//.test(b.detail)), 'G: an important old page with no new page is a "Needs you" blocker');
ok(masterBuildPrompt(simple(st)).blockedBy.some((b) => /important old page/.test(b)), 'G: …and the Master Build Prompt waits for it');
st = { ...st, old_pages: mapOldUrl(st.old_pages, '/blog/winter-tips/', '/', 'Seasonal tips now live on the home page') };
const mp = masterBuildPrompt(simple(st));
ok(!mp.blockedBy.length && /4b\. OLD ADDRESSES/.test(mp.text) && /\/boiler-repairs\/ -> \/services\/boiler-repairs\//.test(mp.text) && /home page on purpose: Seasonal tips/.test(mp.text), 'G: the prompt lists each 301 (and the home page only with its reason)');
ok(/public\/_redirects/.test(mp.text) && /Never a 302/.test(mp.text), 'G: the prompt tells the builder to write the host-level redirects file, one 301 each');
const m = computeMapping(st, null, packFor(st).facts, 'Brookfoot Plumbing & Heating');
ok(siteIntentMap(packFor(st), m).oldUrls.length === 4, 'G: the gate\'s expect file carries every important old address');
const noOld = applyBuildType(parseWebsiteBuild({}), 'template', payload.onboarding);
ok(oldPagesView(noOld).mode === 'not_recorded', 'G: before Prepare, the old pages read as not recorded');

/* The pasted result: the preview gate's oldUrls become the build's check; LeadFinderOS judges them. */
const res = (results: unknown[]) => JSON.stringify({ buildResultVersion: 1, status: 'preview_ready', cloudflare: { projectName: st.cloudflare_project, previewUrl: PREVIEW, noindexConfirmed: true },
  quality: { siteGatePreview: { siteGateVersion: 1, domain: st.canonical_domain, mode: 'url', preview: true, passed: true, checks: [{ id: 'old_urls', label: 'old', level: 'pass' }], oldUrls: { base: PREVIEW, results } } } });
const parsed = parseBuildResult(res([{ path: '/boiler-repairs/', target: '/services/boiler-repairs/', hops: [302], final_status: 200, final_path: '/services/boiler-repairs/', soft_404: false, noindex: false }]));
if (parsed.ok) {
  const after = applyBuildResult(st, parsed.result, { now: '2026-10-10T12:00:00Z' }).state;
  ok(after.build_execution.old_urls.reported && technicalCheck(after, true).failures.some((x) => /Old page: \/boiler-repairs\/ uses a temporary redirect \(302\)/.test(x)), 'G: an imported preview check with a 302 shows in the technical check, in plain English');
  ok(/"oldUrls" in qa\/findable-expect\.json to EXACTLY this list/.test(correctionPrompt({ ...packFor(after), state: { ...after, corrections: 'x' } }).text), 'G: the correction prompt refreshes the old-address list in the expect file');
} else ok(false, 'G: the result parses');

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
if (failures) process.exit(1);
