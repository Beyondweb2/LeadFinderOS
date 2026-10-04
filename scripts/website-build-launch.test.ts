/* WEBSITE BUILD — LAUNCH, SEPARATION AND TRUTH (fix workstream 6, 2026-10-04). Session D's two truth sets
   (D1 Pengwern Lock & Key — template route; D2 Brookfoot Plumbing & Heating — bespoke route) run through
   the REAL functions: the Site Intent Map, the site gate, the launch rule, the prompts.
     A. "section on /" is a valid owner: the parser, the gate's own copy, both routes passing the WHOLE gate
     B. production: a failed / unticked / wrong-project preview never unlocks it; a cleared Build client does
     C. Build / Optimise: every Build tool refused for Optimise, in the prompts AND the server's save
     D. client assets: the no-asset case and the supplied-asset case
     E. intent safety: unsupported questions never own a page; the home page owns "<trade> in <home town>"
     F. location pages: no thin / home-duplicating town page by default
     G. operator control: the Corrections prompt; the build prompt's DO NOT INVENT list
     H. post-launch: the live gate report is what verifies "Production checked" */

import { readFileSync } from 'node:fs';
import { parseWebsiteBuild, QA_ITEMS, requiredPreviewQa, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import { MCL_TEMPLATE } from '../src/lib/websiteTemplates.ts';
import { candidateFacts, mergeFacts, type FactsContext } from '../src/lib/buildFacts.ts';
import { computeMapping } from '../src/lib/templateMapping.ts';
import { assetsToDownload, correctionPrompt, executionBlockers, executionPrompt, retryPrompt, reviewPrompt } from '../src/lib/buildExecution.ts';
import { stagePrompts } from '../src/lib/stagePrompts.ts';
import { buildPack, finalQaPrompt, launchProblems, PRODUCTION_GATE_REPORT_FILE, type BuildPackInput } from '../src/lib/buildPack.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';
import { parseIntentPage, siteIntentMap, type SiteIntentMap } from '../src/lib/siteGate.ts';
import { productionGateProblems, websiteBuildSaveRefusal } from '../src/lib/websiteLaunch.ts';
import { OPTIMISE_BUILD_REFUSAL } from '../src/lib/websiteRoute.ts';
import { auditSite, intentPage } from './site-quality-gate.mjs';
import { clearedForProduction } from './lib/website-launch-ready.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

/* ── the two truth sets (Session D, docs/pre-sales-certification/site-generation.md) ───────────────── */

const D1_QUESTIONS = ['locksmith shrewsbury', 'car key replacement Shrewsbury', 'auto locksmith near Wem', '24 hour locksmith in Shrewsbury', 'safe opening Shropshire',
  'locksmith Telford', 'cheapest locksmith Shrewsbury', 'Who can change the locks on my house', 'anti snap lock upgrade', 'Who fixes uPVC door locks', 'emergency locksmith',
  'best locksmith near me', 'locked out of my house', 'key safe fitted', 'lock repair after a burglary'];
const D2_QUESTIONS = ['boiler installation Brighouse', 'new combi boiler cost', 'landlord gas safety certificate', 'emergency plumber Brighouse 24 hours', 'blocked drain Elland',
  'bathroom fitter', 'plumber Halifax', 'cheapest boiler service', 'Who can repair my boiler', 'plumber in Brighouse', 'radiator replacement', 'leaking tap repair'];

const ctxFor = (who: 'd1' | 'd2'): RebuildContextPayload => (who === 'd1' ? {
  lead: { id: '1d000000-0000-0000-0000-0000000000d1', business_name: 'Pengwern Lock & Key', phone: '01632 960471', email: 'gareth@pengwernlocks.example', category: 'Locksmith', website_build: {} },
  onboarding: { business_name: 'Pengwern Lock & Key', confirmed_location: 'Shrewsbury', confirmed_phone: '01632 960471', contact_email: 'gareth@pengwernlocks.example', contact_name: 'Gareth',
    services_list: ['Emergency lockouts', 'Lock changes and upgrades', 'Anti-snap cylinder upgrades', 'uPVC door mechanism and multipoint repairs', 'Lock repairs after a burglary', 'Key safe installation'],
    areas_list: ['Shrewsbury', 'Bayston Hill', 'Pontesbury', 'Wem', 'Church Stretton'],
    must_not_say: 'No car keys / auto locksmith. No safe opening. No 24-hour call-outs. Not DBS checked. Not an MLA member. Not "approved". No reviews. No commercial work.',
    baseline_questions: D1_QUESTIONS, plan_tier: 'new_site', website_addon: true },
  baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null, discovery_audit: null, crawl: null, pages: [],
} : {
  lead: { id: '1d000000-0000-0000-0000-0000000000d2', business_name: 'Brookfoot Plumbing & Heating', phone: '01632 960482', email: 'dean@brookfootplumbing.example', category: 'Plumber', website_build: {} },
  onboarding: { business_name: 'Brookfoot Plumbing & Heating', confirmed_location: 'Brighouse', confirmed_phone: '01632 960482', contact_email: 'dean@brookfootplumbing.example', contact_name: 'Dean',
    services_list: ['Gas boiler servicing', 'Boiler repairs and breakdowns', 'Radiator installation and replacement', 'Leak, tap and toilet repairs'],
    areas_list: ['Brighouse', 'Rastrick', 'Elland', 'Hipperholme', 'Lightcliffe'],
    must_not_say: 'Does NOT fit new boilers. No drains. No bathroom fitting. No 24-hour or weekend call-outs. No landlord gas safety certificates.',
    baseline_questions: D2_QUESTIONS, plan_tier: 'new_site', website_addon: true },
  baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null, discovery_audit: null, crawl: null, pages: [],
}) as unknown as RebuildContextPayload;

const fact = (key: string, label: string, value: string) => ({ key, label, value, status: 'verified', source: 'added by Paul', source_url: '', notes: '', basis: 'operator' });
const notNeeded = (k: string) => [k, { need: 'not_needed', page: '', note: 'not needed for this client' }];
const D1_RAW = {
  version: 2, route: 'template_rebuild', template_id: 'mcl-local-trades', repo_name: 'PengwernLockKey', github_owner: 'Beyondweb2', local_repo_path: 'C:\\Users\\paulj\\PengwernLockKey',
  cloudflare_project: 'pengwern-lock-key', cloudflare_mode: 'direct_upload', canonical_domain: 'pengwernlocks.example',
  facts: [fact('trade', 'Trade / category', 'Locksmith'), fact('years_experience', 'Years in business / experience', 'Trading since 2019'),
    fact('insurance', 'Insurance', 'Public liability insurance, £2 million cover'), fact('guarantee', 'Guarantees / warranties', '12-month guarantee on parts and labour for locks we supply and fit'),
    fact('availability', 'Availability (e.g. 24/7)', 'Within opening hours only (not 24/7)'), fact('opening_hours', 'Opening hours / availability', 'Mon–Fri 7am–7pm, Sat 8am–4pm, closed Sunday'),
    fact('standout', 'What makes them different', 'TS007 3-star anti-snap cylinders as standard on every lock change; a fixed price before any work starts')],
  mapping: { fields: { mobile_or_premises: 'mobile' },
    services: { 'emergency-lockouts': true, 'lock-changes': true, 'upvc-door-mechanism': true, 'high-security-upgrades': true, 'burglary-repair': true, 'key-safe-installation': true, commercial: false, 'safe-opening': false, 'garage-locks': false },
    locations: { shrewsbury: { serves: true }, 'bayston hill': { serves: true }, pontesbury: { serves: true }, wem: { serves: true }, 'church stretton': { serves: true } } },
  pages: [{ id: 'h', family: 'homepage', path: '/', title: 'Home', action: 'create' }],
  quality: { strengths_reviewed: true, strengths: [], intents: Object.fromEntries([
    ['faq_hub', { need: 'needed', page: '/faqs/', note: '' }], ['urgent_services', { need: 'needed', page: 'section on /', note: '' }], ['customer_types', { need: 'needed', page: 'section on /', note: '' }],
    ['services_hub', { need: 'needed', page: '/services/', note: '' }], ['contact', { need: 'needed', page: '/contact/', note: '' }], ['about', { need: 'needed', page: '/about/', note: '' }],
    notNeeded('service_pages'), notNeeded('areas_hub'), notNeeded('location_pages'), notNeeded('quotes_pricing'), notNeeded('our_work')]) },
};
const D2_RAW = {
  version: 2, route: 'bespoke', repo_name: 'BrookfootPlumbing', github_owner: 'Beyondweb2', local_repo_path: 'C:\\Users\\paulj\\BrookfootPlumbing',
  cloudflare_project: 'brookfoot-plumbing', cloudflare_mode: 'direct_upload', canonical_domain: 'brookfootplumbing.example',
  facts: [fact('trade', 'Trade / category', 'Plumber and heating engineer'), fact('accreditations', 'Accreditations / credentials / checks', 'Gas Safe registered'),
    fact('prices', 'Prices', '£85 annual gas boiler service'), fact('opening_hours', 'Opening hours / availability', 'Mon–Fri 8am–6pm; no evening, weekend or 24-hour call-outs'),
    fact('standout', 'What makes them different', 'Same engineer every visit; dust sheets and shoe covers on every job; written quote before work starts')],
  form: { enabled: true, site_key: 'brookfoot', recipient: 'dean@brookfootplumbing.example' },
  pages: [
    { id: 'p1', family: 'homepage', path: '/', title: 'Home', action: 'create' },
    { id: 'p2', family: 'services_index', path: '/services/', title: 'Plumbing and heating services', action: 'create' },
    { id: 'p3', family: 'service', path: '/services/gas-boiler-servicing/', title: 'Gas boiler servicing', action: 'create' },
    { id: 'p4', family: 'service', path: '/services/boiler-repairs/', title: 'Boiler repairs and breakdowns', action: 'create' },
    { id: 'p5', family: 'service', path: '/services/radiators/', title: 'Radiator installation and replacement', action: 'create' },
    { id: 'p6', family: 'service', path: '/services/leaks-taps-toilets/', title: 'Leak, tap and toilet repairs', action: 'create' },
    { id: 'p7', family: 'locations_index', path: '/areas/', title: 'Areas we cover', action: 'create' },
    { id: 'p8', family: 'location', path: '/areas/brighouse/', title: 'Plumber in Brighouse', action: 'create' },
    { id: 'p9', family: 'about', path: '/about/', title: 'About', action: 'create' },
    { id: 'p10', family: 'faq', path: '/faqs/', title: 'FAQs', action: 'create' },
    { id: 'p11', family: 'contact', path: '/contact/', title: 'Contact', action: 'create' },
    { id: 'p12', family: 'legal', path: '/privacy/', title: 'Privacy', action: 'create' },
  ],
  quality: { strengths_reviewed: true, strengths: [], intents: Object.fromEntries([
    ['faq_hub', { need: 'needed', page: '/faqs/', note: '' }], ['urgent_services', { need: 'needed', page: 'section on /', note: '' }], ['quotes_pricing', { need: 'needed', page: 'section on /services/gas-boiler-servicing/', note: '' }],
    ['services_hub', { need: 'needed', page: '/services/', note: '' }], ['contact', { need: 'needed', page: '/contact/', note: '' }], ['about', { need: 'needed', page: '/about/', note: '' }],
    ['areas_hub', { need: 'needed', page: '/areas/', note: '' }], notNeeded('service_pages'), notNeeded('location_pages'), notNeeded('our_work'), notNeeded('customer_types')]) },
};

/** D2 with the Brighouse page's local note recorded — ready to build (the note rule is section F). */
const D2_READY = { ...D2_RAW, pages: (D2_RAW.pages as Array<Record<string, unknown>>).map((p) => (p.id === 'p8' ? { ...p, notes: 'Victorian terraces off Bradford Road: older back boilers and narrow lofts — what Dean sees most there' } : p)) };
const rowsFor = (s: WebsiteBuildState, who: 'd1' | 'd2') => mergeFacts(candidateFacts(ctxFor(who) as unknown as FactsContext, s.canonical_domain), s.facts, s.route === 'template_rebuild' ? MCL_TEMPLATE : null);
function input(raw: Record<string, unknown>, who: 'd1' | 'd2', extra: Partial<BuildPackInput> = {}): BuildPackInput {
  const s = parseWebsiteBuild(raw);
  const ev = toRebuildPromptInput(ctxFor(who));
  return { state: s, template: s.route === 'template_rebuild' ? MCL_TEMPLATE : null, facts: rowsFor(s, who), evidence: ev,
    businessName: who === 'd1' ? 'Pengwern Lock & Key' : 'Brookfoot Plumbing & Heating', existingSiteUrl: '', mustNotSay: ev.facts.mustNotSay.value ?? '', generatedAt: '2026-10-04T00:00:00Z', serviceRoute: 'build', ...extra };
}
const mapFor = (i: BuildPackInput) => computeMapping(i.state, i.template, i.facts, i.businessName);

/* ── a built site that honours an expect file: what a careful executor makes ──────────────────── */
const WORDS = ['door', 'frame', 'visit', 'call', 'home', 'street', 'morning', 'quote', 'parts', 'van', 'window', 'family', 'garden', 'route', 'neighbour', 'kitchen', 'stairs', 'porch'];
const prose = (seed: string, n = 150) => { let h = 11; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return Array.from({ length: n }, () => { h = (h * 1103515245 + 12345) >>> 0; return WORDS[h % WORDS.length] + (h % 4 ? '' : ' ' + seed.replace(/[^a-z]/g, '')); }).join(' '); };
function siteFromExpect(x: SiteIntentMap, trade: string, extraHome = '') {
  const O = 'https://' + x.domain;
  const BIZ = { '@type': trade, '@id': O + '/#business', name: x.businessName, telephone: x.phone, url: O + '/', areaServed: [x.homeTown] };
  const paths = new Set<string>(['/', '/contact/', '/privacy/']);
  for (const it of x.intents) { const p = intentPage(it.page).path; if (p) paths.add(p); }
  const nav = '<header><nav>' + [...paths].map((p) => '<a href="' + p + '">' + p + '</a>').join(' ') + ' <a href="tel:' + x.phone.replace(/\s/g, '') + '">' + x.phone + '</a></nav></header>';
  const foot = '<footer><p>' + x.businessName + ' · <a href="mailto:' + x.email + '">' + x.email + '</a></p></footer>';
  const pages = new Map<string, string>();
  for (const p of paths) {
    const owned = x.intents.filter((it) => intentPage(it.page).path === p && !intentPage(it.page).section && !it.section);
    const svc = owned.find((it) => it.service)?.service ?? '', town = owned.find((it) => it.town)?.town ?? '';
    const subject = [svc, town ? 'in ' + town : ''].filter(Boolean).join(' ') || (p === '/' ? trade + ' in ' + x.homeTown : 'Page ' + p);
    const h1 = p === '/' ? x.businessName + ' — ' + trade + ' in ' + x.homeTown : subject + (svc || town ? '' : '');
    const lead = '<p>' + x.businessName + ' provides ' + (svc || trade.toLowerCase()) + ' for homes in ' + (town || x.homeTown) + ' and nearby, with a clear answer to what customers ask before they call us today.</p>';
    const crumbs = p === '/' ? [] : [{ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: O + '/' }, { '@type': 'ListItem', position: 2, name: h1, item: O + p }] }];
    const ld = { '@context': 'https://schema.org', '@graph': [p === '/' ? BIZ : { '@id': BIZ['@id'] }, ...crumbs] };
    const form = p === '/contact/' && x.form ? '<form action="' + x.form.endpoint + '?site=' + x.form.siteKey + '" method="post"><input name="name"><input name="company_website" hidden></form>' : '';
    pages.set(p, '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + (p === '/' ? trade + ' in ' + x.homeTown + ' | ' + x.businessName : subject + ' | ' + x.businessName) + '</title>' +
      '<meta name="description" content="' + x.businessName + ': ' + subject + ' — plain answers, the verified details and how to get in touch (' + p + ').">' +
      '<link rel="canonical" href="' + O + p + '"><script type="application/ld+json">' + JSON.stringify(ld) + '</script></head><body>' + nav + '<main><h1>' + h1 + '</h1>' + lead + (p === '/' ? extraHome : '') + '<p>' + prose(p) + '</p>' + form + '</main>' + foot + '</body></html>');
  }
  const sitemaps = new Map([['/sitemap-index.xml', '<sitemapindex><sitemap><loc>' + O + '/sitemap-0.xml</loc></sitemap></sitemapindex>'], ['/sitemap-0.xml', '<urlset>' + [...paths].map((p) => '<url><loc>' + O + p + '</loc></url>').join('') + '</urlset>']]);
  return { mode: 'dist', pages, files: new Set<string>(), sizes: new Map(), sitemaps, robots: 'User-agent: *\nAllow: /\n\nSitemap: ' + O + '/sitemap-index.xml\n', headers: 'https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n', redirects: '', llms: false, live: null };
}
const fails = (r: { checks: Array<{ id: string; level: string; details: string[] }> }) => r.checks.filter((c) => c.level === 'fail').map((c) => c.id + ': ' + c.details.slice(0, 3).join(' / '));
const check = (r: { checks: Array<{ id: string; level: string; details: string[] }> }, id: string) => r.checks.find((c) => c.id === id);

console.log('\n── A. "section on /" is a valid intent owner ──');
{
  const table: Array<[string, string, boolean]> = [['/faqs/', '/faqs/', false], ['section on /', '/', true], ['section on /about/', '/about/', true], ['/#reviews', '/', true], ['homepage section', '/', true], ['/contact', '/contact/', false], ['the about page', '', false], ['', '', false]];
  for (const [raw, path, section] of table) {
    const a = parseIntentPage(raw), b = intentPage(raw);
    ok(a.path === path && a.section === section && b.path === a.path && b.section === a.section, 'A: "' + raw + '" → ' + (path || '(not a page)') + (section ? ' (section)' : '') + ' — LeadFinderOS and the gate read it the same');
  }
  const i1 = input(D1_RAW, 'd1'), i2 = input(D2_RAW, 'd2');
  const x1 = siteIntentMap(i1, mapFor(i1)), x2 = siteIntentMap(i2, mapFor(i2));
  for (const [x, name] of [[x1, 'template (D1)'], [x2, 'bespoke (D2)']] as const) {
    ok(!x.intents.some((it) => /section on/i.test(it.page)), 'A: ' + name + ' — the Site Intent Map never writes "section on …" as a page');
    ok(x.intents.some((it) => it.source === 'content' && it.page === '/' && it.section === true), 'A: ' + name + ' — a section-served intent owns "/" (section: true)');
  }
  const r1 = auditSite(siteFromExpect(x1, 'Locksmith', '<p>Trading since 2019, with £2 million public liability insurance and a 12-month guarantee on parts and labour for locks we supply and fit. TS007 3-star anti-snap cylinders as standard.</p>'), { domain: x1.domain, expect: x1 });
  ok(r1.passed === true, 'A: TEMPLATE route (D1) — the whole site gate PASSES with section-served intents' + (r1.passed ? '' : ' — ' + fails(r1).join(' | ')));
  ok(check(r1, 'intents')?.level !== 'fail' && !(check(r1, 'intents')?.details ?? []).some((d) => /section on/.test(d)), 'A: …the intents check never reports "section on /" as a missing page');
  const r2 = auditSite(siteFromExpect(x2, 'Plumber', '<p>Gas Safe registered. An annual gas boiler service is £85.</p>'), { domain: x2.domain, expect: x2 });
  ok(r2.passed === true, 'A: BESPOKE route (D2) — the whole site gate PASSES with section-served intents' + (r2.passed ? '' : ' — ' + fails(r2).join(' | ')));
  /* An OLD expect file that still says "section on /" is read the same way by the gate. */
  const legacy = { ...x1, intents: x1.intents.map((it) => (it.section ? { ...it, page: 'section on /', section: undefined } : it)) };
  const rl = auditSite(siteFromExpect(x1, 'Locksmith', '<p>Trading since 2019, £2 million public liability insurance, a 12-month guarantee on parts and labour for locks we supply and fit.</p>'), { domain: x1.domain, expect: legacy });
  ok(check(rl, 'intents')?.level !== 'fail', 'A: an expect file written before the fix ("section on /" verbatim) also passes — the gate itself reads it');
}

console.log('\n── B. production gating ──');
{
  const base = { ...D2_RAW, preview_url: 'https://preview.brookfoot-plumbing.pages.dev' };
  /* 1. a preview whose gate FAILED (needs_attention) */
  const failed = { ...clearedForProduction(base, { existingSite: false }), build_execution: { ...(clearedForProduction(base, { existingSite: false }).build_execution as Record<string, unknown>), result_status: 'needs_attention', errors: ['Site quality gate FAILED: Every approved intent has one crawlable, linked owning page (its page section on / is not in the build)'] } };
  const fi = input(failed, 'd2');
  ok(launchProblems(fi).some((p) => /needs attention, not preview ready/.test(p)), 'B: a needs-attention preview (gate failed) is NOT cleared for production');
  ok(stagePrompts(fi).find((p) => p.id === 'production_deploy')!.refused === true && !/wrangler pages deploy/.test(stagePrompts(fi).find((p) => p.id === 'production_deploy')!.text), 'B: …no production prompt is generated');
  ok(buildPack(fi).find((p) => p.id === 'production')!.blockedBy.length > 0 && !/--branch main/.test(buildPack(fi).find((p) => p.id === 'production')!.text), 'B: …and no production commands');
  ok(/not cleared for production/.test(websiteBuildSaveRefusal(parseWebsiteBuild(failed), { ...failed, production_url: 'https://brookfootplumbing.example' }, { route: 'build', ended: false })), 'B: …and the SERVER refuses a save that records a production URL');
  /* 2. preview_ready claimed, but LeadFinderOS's own gate disagrees (an error recorded) */
  const claimed = { ...clearedForProduction(base, { existingSite: false }), build_execution: { ...(clearedForProduction(base, { existingSite: false }).build_execution as Record<string, unknown>), errors: ['Preview site gate FAILED: claims'] } };
  ok(launchProblems(input(claimed, 'd2')).some((p) => /Preview not ready/.test(p)), 'B: a result that SAYS preview_ready but carries a gate error is not cleared (LeadFinderOS\u2019s word, not Claude\u2019s)');
  /* 3. QA ticks missing */
  const unticked = { ...clearedForProduction(base, { existingSite: false }), qa: { visual_qa: true } };
  ok(launchProblems(input(unticked, 'd2')).some((p) => /preview QA tick\(s\) not done/.test(p) && /No unverified claim published/.test(p) || /preview QA tick/.test(p)), 'B: missing preview QA ticks block production');
  /* 4. a preview on another project / a different reported preview (wrong client) */
  const wrong = { ...clearedForProduction(base, { existingSite: false }), preview_url: 'https://preview.other-client.pages.dev' };
  ok(launchProblems(input(wrong, 'd2')).some((p) => /not on the recorded Cloudflare project/.test(p)) && launchProblems(input(wrong, 'd2')).some((p) => /not the one the build reported/.test(p)), 'B: a preview on another Cloudflare project / not the reported one blocks production (wrong client)');
  /* 5. route not recorded */
  ok(launchProblems(input(clearedForProduction(base, { existingSite: false }), 'd2', { serviceRoute: null, routeSource: 'not recorded' })).some((p) => /Client route is not Build/.test(p)), 'B: an unrecorded route blocks production (absent is never Build)');
  /* 6. domain authority */
  ok(launchProblems(input(clearedForProduction(base, { existingSite: false }), 'd2', { domain: { applies: true, ready: false, reasons: ['Permission to connect the domain not given'] } })).some((p) => /Domain ownership \/ authority/.test(p)), 'B: an unsettled domain-authority answer blocks production');
  /* 7. the site HAS a form, but it is not switched on */
  ok(launchProblems(input({ ...clearedForProduction(base, { existingSite: false }), form: {} }, 'd2')).some((p) => /enquiry form but it is not switched on/.test(p)), 'B: a site-enquiry form that is not switched on blocks production (the live form would not deliver)');
  /* 8. cleared */
  const cleared = input(clearedForProduction(base, { existingSite: false }), 'd2');
  ok(launchProblems(cleared).length === 0, 'B: a Build client whose preview cleared every gate IS cleared (' + launchProblems(cleared).join(' | ') + ')');
  const prod = stagePrompts(cleared).find((p) => p.id === 'production_deploy')!;
  ok(!prod.refused && /ask Paul in chat/.test(prod.text) && /--branch main/.test(prod.text), 'B: …the production prompt is generated, and still asks Paul before deploying');
  ok(websiteBuildSaveRefusal(parseWebsiteBuild(clearedForProduction(base, { existingSite: false })), { ...clearedForProduction(base, { existingSite: false }), production_url: 'https://brookfootplumbing.example', production_status: 'deployed' }, { route: 'build', ended: false }) === '', 'B: …and the server records the launch');
  ok(requiredPreviewQa(false).length === QA_ITEMS.filter((q) => q.group === 'preview').length - 3 && requiredPreviewQa(true).length === QA_ITEMS.filter((q) => q.group === 'preview').length, 'B: the old-site comparisons are not required when there is no old site — one list for QA and production');
  /* an OLD row with production already recorded is never locked by a rule it predates */
  const old = { ...D2_RAW, production_url: 'https://brookfootplumbing.example', production_status: 'deployed' };
  ok(websiteBuildSaveRefusal(old, { ...old, notes: 'changed a note' }, { route: 'build', ended: false }) === '', 'B: a save that does not newly record production is never refused');
}

console.log('\n── C. Build / Optimise separation ──');
{
  const base = { ...D2_RAW, preview_url: 'https://preview.brookfoot-plumbing.pages.dev' };
  const oi = input(clearedForProduction(base, { existingSite: false }), 'd2', { serviceRoute: 'optimise', routeSource: 'the onboarding plan (keep their site)' });
  const sp = stagePrompts(oi);
  ok(sp.every((p) => p.refused === true && p.text === OPTIMISE_BUILD_REFUSAL), 'C: Optimise — EVERY stage prompt is refused with the reason (' + sp.filter((p) => !p.refused).map((p) => p.id).join(', ') + ')');
  ok(buildPack(oi).every((p) => p.refused === true && !/wrangler|git push/.test(p.text)), 'C: Optimise — every command and prompt in the pack is refused (no deploy text at all)');
  ok(executionBlockers(oi, mapFor(oi)).includes(OPTIMISE_BUILD_REFUSAL) && /NOT READY TO BUILD/.test(executionPrompt(oi).text), 'C: Optimise — the Build Execution prompt is blocked');
  ok(retryPrompt(oi).blockedBy.includes(OPTIMISE_BUILD_REFUSAL) && reviewPrompt(oi).blockedBy.includes(OPTIMISE_BUILD_REFUSAL) && correctionPrompt(oi).blockedBy.includes(OPTIMISE_BUILD_REFUSAL), 'C: Optimise — retry, review and corrections prompts are refused too');
  ok(launchProblems(oi)[0] === OPTIMISE_BUILD_REFUSAL, 'C: Optimise — production readiness says so in one sentence');
  const prev = parseWebsiteBuild(D2_RAW);
  ok(websiteBuildSaveRefusal({ ...D2_RAW, form: {} }, { ...D2_RAW, production_url: 'https://their-own-site.example' }, { route: 'optimise', ended: false }) === OPTIMISE_BUILD_REFUSAL, 'C: SERVER — an Optimise client\u2019s save that records production is refused');
  ok(websiteBuildSaveRefusal({ ...D2_RAW, form: {} }, D2_RAW, { route: 'optimise', ended: false }) === OPTIMISE_BUILD_REFUSAL, 'C: SERVER — switching the enquiry-form registry on for an Optimise client is refused');
  void prev;
  /* Build can */
  const bi = input(clearedForProduction(base, { existingSite: false }), 'd2');
  ok(stagePrompts(bi).every((p) => !p.refused) && !buildPack(bi).some((p) => p.refused), 'C: Build — every tool is available');
  /* the wiring: the page and the server both read the route */
  const page = readFileSync('src/pages/WebsiteBuild.tsx', 'utf8'), hub = readFileSync('supabase/functions/paid-client-hub/index.ts', 'utf8');
  ok(/websiteServiceRoute\(/.test(page) && /Website Build is switched off/.test(page) && /serviceRoute: routeVerdict\.route/.test(page), 'C: the Website Build page reads the client\u2019s route and shows the Optimise refusal');
  const save = hub.slice(hub.indexOf('action === "save_website_build"'), hub.indexOf('action === "submit_delivery"'));
  ok(save.indexOf('websiteBuildSaveRefusal(') > 0 && save.indexOf('websiteBuildSaveRefusal(') < save.indexOf('.update({ website_build: patch })') && /launch_refused/.test(save), 'C: paid-client-hub refuses BEFORE it writes (409 launch_refused)');
}

console.log('\n── D. client assets ──');
{
  const none = input({ ...D2_READY, preview_url: '' }, 'd2');
  ok(executionPrompt(none).blockedBy.length === 0, 'D: the no-asset D2 build is READY TO BUILD (' + executionPrompt(none).blockedBy.join(' | ') + ')');
  const p0 = assetsToDownload(none);
  ok(p0.list.length === 0 && /none — build without images; never a stock or seed image/.test(executionPrompt(none).text), 'D: NO assets — the build goes ahead without images, never a stock image');
  ok(/No stock, AI-generated or seed-client image is ever presented as the client/.test(executionPrompt(none).text) && /OpenStreetMap/.test(executionPrompt(none).text), 'D: …and the prompt forbids stock/generated work passed off as theirs and names a licensed map source');
  const supplied = { ...D2_READY, manifest: { assets: [
    { source_url: 'file:///C:/Users/paulj/Clients/brookfoot/van.jpg', type: 'photo', purpose: 'Dean\u2019s van outside a job in Rastrick', approval: 'approved', ownership: 'client_owned', suggested_filename: 'van.jpg', origin: 'client' },
    { source_url: 'https://drive.example/logo.png', type: 'logo', purpose: 'Brookfoot logo', approval: 'approved', ownership: 'client_owned', suggested_filename: 'logo.png', origin: 'client' },
    { source_url: 'https://stock.example/plumber.jpg', type: 'photo', purpose: 'stock plumber', approval: 'approved', ownership: 'unknown', origin: 'client' },
  ] }, mapping: { assets: { logo: ['https://drive.example/logo.png'], hero: ['file:///C:/Users/paulj/Clients/brookfoot/van.jpg'] } } };
  const si = input(supplied, 'd2');
  const p1 = assetsToDownload(si);
  ok(parseWebsiteBuild(supplied).manifest.assets.filter((a) => a.origin === 'client').length === 3, 'D: client-supplied assets are kept by the save rule (origin: client)');
  ok(p1.list.some((x) => x.asset.source_url.startsWith('file:///')) && p1.list.some((x) => x.asset.source_url === 'https://drive.example/logo.png'), 'D: SUPPLIED assets (a file on the build machine, a shared link) are in the download list');
  ok(!p1.list.some((x) => x.asset.source_url.includes('stock.example')) && p1.notClientOwned === 1, 'D: …but never one not recorded as the client\u2019s own');
  ok(JSON.stringify(parseWebsiteBuild(supplied).mapping.assets.hero) === '["file:///C:/Users/paulj/Clients/brookfoot/van.jpg"]', 'D: a supplied local file can fill a template slot (file:/// kept)');
  ok(/\[client-supplied\]/.test(executionPrompt({ ...si, state: { ...si.state } }).text) || /\[client-supplied\]/.test(stagePrompts(si).find((p) => p.id === 'asset_download')!.text), 'D: the build prompt marks them client-supplied');
}

console.log('\n── E. intent safety (Session D truth sets) ──');
{
  const i1 = input(D1_RAW, 'd1'), i2 = input(D2_RAW, 'd2');
  const x1 = siteIntentMap(i1, mapFor(i1)), x2 = siteIntentMap(i2, mapFor(i2));
  const owner = (x: SiteIntentMap, q: string) => x.intents.find((it) => it.question === q)?.page ?? '';
  const why = (x: SiteIntentMap, q: string) => x.unownedWhy.find((w) => w.question === q)?.reason ?? '';
  for (const q of ['car key replacement Shrewsbury', 'auto locksmith near Wem', '24 hour locksmith in Shrewsbury', 'safe opening Shropshire', 'locksmith Telford', 'cheapest locksmith Shrewsbury'])
    ok(x1.unowned.includes(q) && !owner(x1, q), 'E: D1 "' + q + '" is UNOWNED — ' + why(x1, q));
  for (const q of ['boiler installation Brighouse', 'new combi boiler cost', 'landlord gas safety certificate', 'emergency plumber Brighouse 24 hours', 'blocked drain Elland', 'bathroom fitter', 'plumber Halifax'])
    ok(x2.unowned.includes(q) && !owner(x2, q), 'E: D2 "' + q + '" is UNOWNED — ' + why(x2, q));
  ok(owner(x1, 'Who can change the locks on my house') === '/services/lock-changes-upgrades/' && owner(x1, 'anti snap lock upgrade') === '/services/high-security-upgrades/' && owner(x1, 'Who fixes uPVC door locks') === '/services/upvc-door-mechanism/', 'E: D1 service questions own their SERVICE page, not the town page (D-02)');
  ok(owner(x2, 'Who can repair my boiler') === '/services/boiler-repairs/' && owner(x2, 'cheapest boiler service') === '/services/gas-boiler-servicing/', 'E: D2 "repair my boiler" → repairs (not servicing); a price question is owned only because £85 is verified');
  ok(owner(x1, 'locksmith shrewsbury') === '/' && owner(x2, 'plumber in Brighouse') === '/', 'E: "<trade> in <home town>" is owned by the HOME page — even with a Brighouse location page in the plan (D-10)');
  ok(![...x1.intents, ...x2.intents].some((it) => it.source === 'baseline' && !it.page), 'E: no baseline intent has a blank owner');
  const ex = executionPrompt({ ...i1 }).text;
  ok(/names something the client does NOT offer/.test(ex) && /Do NOT create pages for them, and do NOT write copy that answers/.test(ex), 'E: the build prompt lists each unowned question WITH its reason and forbids answering it');
}

console.log('\n── F. location pages ──');
{
  const thin = { ...D2_RAW };
  const i = input(thin, 'd2');
  ok(executionBlockers(i, mapFor(i)).some((b) => /Location page "Plumber in Brighouse" has no local-content note/.test(b) && /HOME town/.test(b)), 'F: a bespoke plan\u2019s home-town location page with no local note BLOCKS the build');
  const noted = { ...D2_RAW, pages: (D2_RAW.pages as Array<Record<string, unknown>>).map((p) => (p.id === 'p8' ? { ...p, notes: 'Victorian terraces off Bradford Road: older back boilers and narrow lofts — what Dean sees most there' } : p)) };
  ok(!executionBlockers(input(noted, 'd2'), mapFor(input(noted, 'd2'))).some((b) => /Location page/.test(b)), 'F: …with a genuinely local note it is allowed');
  /* the gate: a town page that is the home page again, or thin */
  const i2 = input(D2_RAW, 'd2');
  const x2 = siteIntentMap(i2, mapFor(i2));
  const s = siteFromExpect(x2, 'Plumber', '<p>Gas Safe registered. An annual gas boiler service is £85.</p>');
  const homeHtml = s.pages.get('/')!;
  s.pages.set('/areas/brighouse/', homeHtml.replace(/<title>[^<]*<\/title>/, '<title>Plumber in Brighouse | Brookfoot Plumbing &amp; Heating</title>').replace(/<h1>[^<]*<\/h1>/, '<h1>Plumber in Brighouse</h1>').replace(/href="https:\/\/brookfootplumbing\.example\/"/, 'href="https://brookfootplumbing.example/areas/brighouse/"').replace(/content="[^"]*\(\/\)\."/, 'content="Brookfoot Plumbing: plumber in Brighouse — local page."'));
  const r = auditSite(s, { domain: x2.domain, expect: x2 });
  const loc = check(r, 'locations');
  ok(loc?.level === 'warn' && (loc.details.join(' ')).includes('HOME town') && /repeats \d+% of the home page/.test(loc.details.join(' ')), 'F: the gate WARNS on a home-town page that repeats the home page with the town name swapped');
  const thinSite = siteFromExpect(x2, 'Plumber');
  thinSite.pages.set('/areas/brighouse/', thinSite.pages.get('/areas/brighouse/')!.replace(/<p>[^<]{200,}<\/p>/, '<p>We cover Brighouse.</p>'));
  ok((check(auditSite(thinSite, { domain: x2.domain, expect: x2 }), 'locations')?.details ?? []).some((d) => /thin location page/.test(d)), 'F: …and on a thin location page');
}

console.log('\n── G. operator control + the build prompt ──');
{
  const built = { ...clearedForProduction({ ...D2_RAW, preview_url: 'https://preview.brookfoot-plumbing.pages.dev' }, { existingSite: false }),
    corrections: '- Remove "the same engineer is there next year" from /about/\n- Contact page: lead with the phone number', primary_cta: 'Call Dean on 01632 960482',
    pages: [...(D2_RAW.pages as Array<Record<string, unknown>>).map((p) => (p.id === 'p3' ? { ...p, meta: 'Gas boiler servicing in Brighouse for £85 — Gas Safe registered, same engineer every visit.' } : p)), { id: 'p13', family: 'other', path: '/emergency/', title: 'Emergency plumber', action: 'remove' }] };
  (built.build_execution as Record<string, unknown>).pages = ['/', '/emergency/', '/services/', '/faqs/'];
  const c = correctionPrompt(input(built, 'd2'));
  ok(c.blockedBy.length === 0 && /Remove "the same engineer is there next year"/.test(c.text) && /PAGES TO REMOVE/.test(c.text) && /\/emergency\//.test(c.text), 'G: the Corrections prompt carries Paul\u2019s list and the page he removed that the build still has');
  ok(/meta description \(Paul's, use as written\): Gas boiler servicing in Brighouse for £85/.test(c.text) && /MAIN CALL TO ACTION \(Paul's words, every page\): Call Dean/.test(c.text), 'G: …his meta descriptions and main call to action');
  ok(/DO NOT INVENT/.test(c.text) && /Never production/.test(c.text) && /findable-site-gate\.mjs/.test(c.text), 'G: …the DO NOT INVENT list, preview only, and the gate re-run');
  ok(correctionPrompt(input(D2_RAW, 'd2')).blockedBy.some((b) => /built preview/.test(b)), 'G: no built preview → no Corrections prompt (a failed build uses Retry)');
  const ex = executionPrompt(input({ ...D2_READY, preview_url: '' }, 'd2')).text;
  for (const w of ['DO NOT INVENT', 'services · service areas · prices · insurance · qualifications', 'response or arrival times', 'reviews, ratings or star counts · awards · memberships', 'projects, jobs or customer counts', 'Paul still reads every page'])
    ok(ex.includes(w), 'G: the build prompt says "' + w + '"');
  ok(/The form is REGISTERED \(site key "brookfoot"\)/.test(ex) && /no code change and no deploy/.test(ex) && !/CLIENT_SITES/.test(ex), 'G: the form section names the registered key — no CLIENT_SITES code edit or deploy');
  ok(/NOT switched on in LeadFinderOS yet/.test(executionPrompt(input({ ...D2_READY, form: {}, preview_url: '' }, 'd2')).text), 'G: …and says plainly when the form is not switched on');
}

console.log('\n── H. post-launch verification ──');
{
  const fq = finalQaPrompt(input(D2_RAW, 'd2')).text;
  ok(fq.includes(PRODUCTION_GATE_REPORT_FILE) && /OAI-SearchBot/.test(fq) && /sitemap/.test(fq) && /canonicals/.test(fq) && /schema/.test(fq) && /no noindex/.test(fq) && /enquiry backend/.test(fq) && /HTTPS/.test(fq), 'H: the Final production QA prompt runs the live gate (HTTPS, pages, robots/OAI-SearchBot, sitemap, canonicals, schema, noindex, form backend) and hands back its report');
  ok(/No llms\.txt/.test(fq), 'H: …and adds no llms.txt / AI-ranking gimmick');
  const G = (o: Record<string, unknown>) => parseWebsiteBuild({ production_gate: { imported_at: '2026-10-04T12:00:00Z', version: 1, domain: 'brookfootplumbing.example', mode: 'url', preview: false, passed: true, fails: [], warns: [], ...o } }).production_gate;
  ok(productionGateProblems(G({}), 'brookfootplumbing.example').length === 0, 'H: a passing --url run on the live domain verifies the launch');
  ok(productionGateProblems(G({ preview: true }), 'brookfootplumbing.example').length > 0 && productionGateProblems(G({ mode: 'dist' }), 'brookfootplumbing.example').length > 0, 'H: a preview or a dist run does not');
  ok(productionGateProblems(G({ domain: 'preview.brookfoot-plumbing.pages.dev' }), 'brookfootplumbing.example').some((p) => /not brookfootplumbing\.example/.test(p)), 'H: a run on another domain does not');
  ok(productionGateProblems(G({ passed: false, fails: ['robots.txt blocks OAI-SearchBot'] }), 'brookfootplumbing.example').some((p) => /FAILED: robots\.txt blocks OAI-SearchBot/.test(p)), 'H: a failed live gate (OAI-SearchBot blocked) does not');
  const live = { ...clearedForProduction({ ...D2_RAW, preview_url: 'https://preview.brookfoot-plumbing.pages.dev' }, { existingSite: false }), production_url: 'https://brookfootplumbing.example', production_status: 'deployed' };
  ok(/Production checked" needs the live site gate/.test(websiteBuildSaveRefusal(live, { ...live, qa: { ...(live.qa as object), production_checked: true } }, { route: 'build', ended: false })), 'H: SERVER — "Production checked" is refused with no live gate report');
  const passed = { ...live, production_gate: { imported_at: '2026-10-04T12:00:00Z', version: 1, domain: 'brookfootplumbing.example', mode: 'url', preview: false, passed: true, fails: [], warns: [] } };
  ok(websiteBuildSaveRefusal(passed, { ...passed, qa: { ...(passed.qa as object), production_checked: true } }, { route: 'build', ended: false }) === '', 'H: …and allowed once the live gate passed');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
if (failures) process.exit(1);
