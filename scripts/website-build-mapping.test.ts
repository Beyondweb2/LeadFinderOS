/* ============================================================
   WEBSITE BUILD — PHASE 3: TEMPLATE MAPPING + BUILD PREPARATION.

   RISK        low-risk identity / links auto-accept from the source; commercial / proof / legal /
               coverage / tracking claims and strong-claim wording always need approval; verified
               facts win; services arrive as SOURCE-DERIVED CANDIDATES.
   MAPPING     fields by priority with their source; services against the template catalogue
               (high / medium / unmapped, never fabricated); towns (serves ≠ dedicated page);
               asset slots (suggest / assign / unassign, USE only).
   READINESS   required blocks, optional is omitted, seed values block.
   CONFIG      only ready values; omitted list.
   URLS        every old URL kept / redirected / retired / unresolved, with flags; read-only.
   PROMPTS     the Template Build prompt consumes the config; the Asset Download prompt.
   COMPAT      V1 rows, Phase 2 rows, autosave round trip, Faithful / Bespoke.

   Run: npx tsx scripts/website-build-mapping.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import { normaliseWebsiteBuild, parseWebsiteBuild, websiteBuildStages, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import { MCL_TEMPLATE, templateById, CORE_BUILD_MODEL } from '../src/lib/websiteTemplates.ts';
import { candidateFacts, decide, mergeFacts, type FactRow, type FactsContext } from '../src/lib/buildFacts.ts';
import { masterPrompt } from '../src/lib/buildPack.ts';
import { stagePrompts } from '../src/lib/stagePrompts.ts';
import { applyRecon, isHighRiskFact, parseReconText, type ReconResult } from '../src/lib/recon.ts';
import { autoAssign, computeMapping, scanSeedValues, scoreService, urlDecisions } from '../src/lib/templateMapping.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const SITE = 'https://www.harbourlocks.co.uk/';
const ctx = (over: Record<string, unknown> = {}): RebuildContextPayload => ({
  lead: { id: 'lead-h', business_name: 'Harbour Locks Ltd', website: SITE, phone: '07700 900123', email: 'hello@harbourlocks.co.uk', address: '3 Quay St, Whitby', derived_town: 'Whitby', category: 'Locksmith', website_build: {} },
  onboarding: { business_name: 'Harbour Locks Ltd', confirmed_location: 'Whitby', services_list: ['Lock changes'], areas_list: ['Whitby'], contact_name: 'Dan', contact_email: 'hello@harbourlocks.co.uk', ...over },
  baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null, discovery_audit: null, crawl: null, pages: [],
} as unknown as RebuildContextPayload);
const rowsFor = (s: WebsiteBuildState, c = ctx()) => mergeFacts(candidateFacts(c as unknown as FactsContext, s.canonical_domain), s.facts, s.route === 'template_rebuild' ? templateById(s.template_id) : null);

const RECON = {
  reconVersion: 1, sourceUrl: SITE, capturedAt: '2026-09-25T09:00:00Z', platform: 'Wix', siteStatus: 'live',
  pages: [
    { url: SITE, pageType: 'home', title: 'Harbour Locks' },
    { url: SITE + 'services/', pageType: 'services', title: 'Services' },
    { url: SITE + 'emergency-locksmith/', pageType: 'service', title: 'Locked out? Emergency entry', h1: 'Locked out? Emergency entry' },
    { url: SITE + 'upvc-repairs/', pageType: 'service', title: 'UPVC lock repairs' },
    { url: SITE + 'office-security/', pageType: 'service', title: 'Office & shop security' },
    { url: SITE + 'car-keys/', pageType: 'service', title: 'Car key programming' },
    { url: SITE + 'areas/scarborough/', pageType: 'location', title: 'Locksmith Scarborough' },
    { url: SITE + 'areas/pickering/', pageType: 'location', title: 'Locksmith Pickering' },
    { url: SITE + 'about/', pageType: 'about' }, { url: SITE + 'contact/', pageType: 'contact' }, { url: SITE + 'privacy/', pageType: 'privacy' },
  ],
  facts: [
    { field: 'business_name', value: 'Harbour Locks Ltd', sourceUrl: SITE, confidence: 'high', evidence: 'visible' },
    { field: 'phone', value: '07700 900123', sourceUrl: SITE, sourceContext: 'header', confidence: 'high', evidence: 'visible' },
    { field: 'email', value: 'info@harbourlocks.co.uk', sourceUrl: SITE + 'contact/', confidence: 'high', evidence: 'visible' },
    { field: 'website', value: SITE, sourceUrl: SITE, confidence: 'high', evidence: 'visible' },
    { field: 'social_profiles', value: 'https://facebook.com/harbourlocks', sourceUrl: SITE, confidence: 'high', evidence: 'visible' },
    { field: 'opening_hours', value: '24/7 emergency call-outs', sourceUrl: SITE, confidence: 'high', evidence: 'visible' },
    { field: 'insurance', value: '£2m public liability', sourceUrl: SITE + 'about/', confidence: 'high', evidence: 'visible' },
    { field: 'dbs', value: 'DBS checked', sourceUrl: SITE + 'about/', confidence: 'high', evidence: 'visible' },
    { field: 'prices', value: '£65 call-out', sourceUrl: SITE, confidence: 'high', evidence: 'visible' },
    { field: 'review_rating', value: '4.9 from 120 reviews', sourceUrl: SITE, confidence: 'high', evidence: 'visible' },
    { field: 'service_areas', value: 'Scarborough', sourceUrl: SITE, confidence: 'high', evidence: 'visible' },
    { field: 'service_areas', value: 'Pickering', sourceUrl: SITE, confidence: 'high', evidence: 'visible' },
    { field: 'services', value: 'Locked out? Emergency entry', sourceUrl: SITE + 'services/', confidence: 'high', evidence: 'visible' },
  ],
  assets: [
    { sourceUrl: SITE + 'img/logo.svg', type: 'logo', purpose: 'site logo', pageUrl: SITE, suggestedFilename: 'logo.svg', ownership: 'client_owned' },
    { sourceUrl: SITE + 'img/van-hero.jpg', type: 'hero', purpose: 'van outside a job, homepage hero', pageUrl: SITE, suggestedFilename: 'van-hero.jpg', ownership: 'client_owned' },
    { sourceUrl: SITE + 'img/dan.jpg', type: 'team', purpose: 'owner portrait', pageUrl: SITE + 'about/', suggestedFilename: 'owner-dan.jpg', ownership: 'client_owned' },
    { sourceUrl: SITE + 'img/lock-job.jpg', type: 'gallery', purpose: 'uPVC lock repair job', pageUrl: SITE, suggestedFilename: 'lock-job.jpg', ownership: 'client_owned' },
    { sourceUrl: SITE + 'img/mla.png', type: 'certification', purpose: 'MLA member badge', pageUrl: SITE + 'about/', suggestedFilename: 'mla.png', ownership: 'third_party' },
  ],
  tracking: { analytics: ['G-ABC1234'], tagManager: 'GTM-XYZ9', adsIds: ['AW-123456'] },
  redirectCandidates: [{ from: '/car-keys/', to: '', reason: 'service not in template' }],
};
const parsed = parseReconText(JSON.stringify(RECON)) as { result: ReconResult };

const BASE = { version: 2, route: 'template_rebuild', template_id: 'mcl-local-trades', repo_name: 'HarbourLocks', local_repo_path: 'C:\\Users\\paulj\\HarbourLocks',
  cloudflare_project: 'harbour-locks', preview_url: 'https://preview.harbour-locks.pages.dev', qa: { visual_qa: true },
  pages: [{ id: 'h', family: 'homepage', path: '/', title: 'Home', action: 'keep', old_url: SITE }], redirects: [{ from: '/old', to: '/', reason: 'r' }] };
const imported = (b: Record<string, unknown> = BASE, c = ctx()) => { const s = parseWebsiteBuild(b); return applyRecon(s, parsed.result, rowsFor(s, c), '2026-09-25T10:00:00.000Z').state; };
const mapOf = (s: WebsiteBuildState, c = ctx(), name = 'Harbour Locks Ltd') => computeMapping(s, s.route === 'template_rebuild' ? MCL_TEMPLATE : null, rowsFor(s, c), name);
const row = (s: WebsiteBuildState, k: string) => rowsFor(s).find((r) => r.key === k) as FactRow;

console.log('\n── A. RISK-BASED APPROVAL ──');
{
  const s = imported();
  ok(row(s, 'phone').status === 'verified' && row(s, 'phone').basis === 'source_site', 'phone (low-risk, verbatim, consistent) is auto-accepted — basis: the source website');
  ok(row(s, 'social_profiles').status === 'verified' && row(s, 'social_profiles').basis === 'source_site', 'a social profile link is auto-accepted');
  ok(row(s, 'website').status === 'verified' && row(s, 'website').basis === 'source_site', 'the website / domain is auto-accepted');
  for (const k of ['opening_hours', 'insurance', 'dbs', 'prices', 'review_rating', 'analytics_ids', 'ads_ids'])
    ok(row(s, k)?.status === 'detected' && /always needs your approval/.test(row(s, k).notes), `${k} is a commercial / proof claim → NEEDS APPROVAL even though the site states it`);
  ok(row(s, 'analytics_ids').value.includes('G-ABC1234') && row(s, 'analytics_ids').value.includes('GTM-XYZ9') && row(s, 'ads_ids').value === 'AW-123456', 'tracking IDs are captured as facts to approve');
  ok(row(s, 'email').status === 'verified' && row(s, 'email').value === 'hello@harbourlocks.co.uk', 'a verified client value is never overwritten (the site\u2019s different email)');
  ok(row(s, 'services').status === 'verified' && row(s, 'services').value === 'Lock changes', 'verified onboarding services stay as they are');
  ok(s.recon.services.map((c) => c.name).join('|') === 'Locked out? Emergency entry|UPVC lock repairs|Office & shop security|Car key programming', 'site services become SOURCE-DERIVED CANDIDATES (facts + service pages)');
  ok(s.recon.towns.some((c) => c.name === 'Scarborough') && s.recon.towns.some((c) => c.name === 'Pickering'), 'towns on the site become candidates');
  ok(row(s, 'service_areas').status === 'verified' && row(s, 'service_areas').value === 'Whitby', 'the client’s verified service area is kept (the site’s extra towns become candidates)');
  {
    const noAreas = ctx({ areas_list: [] });
    const b0 = parseWebsiteBuild(BASE);
    const sa = applyRecon(b0, parsed.result, rowsFor(b0, noAreas), '2026-09-25T10:00:00.000Z').state;
    const ra = rowsFor(sa, noAreas).find((r) => r.key === 'service_areas')!;
    ok(ra.status === 'detected' && /always needs your approval/.test(ra.notes), 'service-area claims from the site → NEEDS APPROVAL');
  }
  ok(isHighRiskFact('business_name', ['Best Locksmiths Ltd']) && !isHighRiskFact('business_name', ['Harbour Locks Ltd']), 'a strong-claim word ("best") makes even a low-risk field need approval');
  ok(isHighRiskFact('custom_anything', ['x']), 'an unrecognised key is high-risk (positive allowlist)');
  const svcOnly = parseWebsiteBuild({ ...BASE, route: 'faithful_rebuild' });
  const noOnb = ctx({ services_list: [] });
  const s2 = applyRecon(svcOnly, parsed.result, rowsFor(svcOnly, noOnb), '2026-09-25T10:00:00.000Z').state;
  ok(rowsFor(s2, noOnb).find((r) => r.key === 'services')!.status === 'detected', 'with no verified services, the site\u2019s services never auto-verify — they need approval');
}

console.log('\n── B/D. THE FIELD MODEL AND AUTOMATIC MAPPING ──');
{
  ok(MCL_TEMPLATE.fields.some((f) => f.requirement === 'required') && MCL_TEMPLATE.fields.some((f) => f.requirement === 'conditional') && MCL_TEMPLATE.fields.some((f) => f.requirement === 'optional'), 'template fields declare REQUIRED / OPTIONAL / CONDITIONAL');
  ok(['identity', 'business', 'proof', 'commerce', 'tracking'].every((g) => MCL_TEMPLATE.fields.some((f) => f.group === g)) && MCL_TEMPLATE.serviceCatalogue.length === 9 && MCL_TEMPLATE.locations.primaryLocationPage && MCL_TEMPLATE.assetSlots.length === 7, 'the template declares identity / business / proof / commerce / tracking fields, a 9-service catalogue, a location policy and 7 asset slots');
  ok(CORE_BUILD_MODEL.serviceCatalogue.length === 0 && CORE_BUILD_MODEL.fields.every((f) => !/lock/i.test(f.label)), 'the core model is trade-agnostic — nothing locksmith-specific outside the MCL definition');
  const src = readFileSync(new URL('../src/lib/templateMapping.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/\blocksmith|\bupvc|safe opening|\bmcl\b|morgan|canterbury/i.test(src), 'the mapping engine contains no trade- or template-specific values');
  const s = imported();
  const m = mapOf(s);
  const f = (id: string) => m.fields.find((x) => x.field.id === id)!;
  ok(f('business_name').status === 'ready' && f('business_name').rank === 1 && /verified client fact/.test(f('business_name').source), 'business name: rank 1, verified client fact');
  ok(f('phone').status === 'ready' && f('phone').rank === 3 && /source website/.test(f('phone').source), 'phone: rank 3, auto-accepted from the source website — and says so');
  ok(f('hours').status === 'needs_approval' && f('hours').rank === 4 && f('hours').value === '24/7 emergency call-outs', 'hours: rank 4, source value needing approval');
  ok(f('email').value === 'hello@harbourlocks.co.uk', 'the higher-confidence value wins (verified email, not the site\u2019s)');
  ok(f('domain').status === 'missing' && f('domain').required, 'domain comes from project details — missing until set');
  ok(f('address').required === false, 'address is conditional: not required until the business is set as premises');
  const prem = mapOf({ ...s, mapping: { ...s.mapping, fields: { mobile_or_premises: 'premises' } } });
  ok(prem.fields.find((x) => x.field.id === 'address')!.required, '…and required once it is');
  const approved = { ...s, facts: [...s.facts.filter((x) => x.key !== 'insurance'), decide(row(s, 'insurance'), 'verified')] };
  const fi = mapOf(approved).fields.find((x) => x.field.id === 'insurance')!;
  ok(fi.status === 'ready' && fi.rank === 2 && /recon fact you approved/.test(fi.source), 'a recon claim Paul approved: rank 2, "recon fact you approved"');
}

console.log('\n── E. SERVICE MAPPING ──');
{
  const s = imported();
  const m = mapOf(s);
  const sv = (id: string) => m.services.find((x) => x.service.id === id)!;
  ok(sv('emergency-lockouts').status === 'preselected' && sv('emergency-lockouts').include && sv('emergency-lockouts').confidence === 'high', '"Locked out? Emergency entry" → emergency-lockouts, high confidence, pre-selected');
  ok(sv('upvc-door-mechanism').include && sv('upvc-door-mechanism').matches[0].candidate.name === 'UPVC lock repairs', '"UPVC lock repairs" → upvc-door-mechanism');
  ok(sv('lock-changes').status === 'ready' && sv('lock-changes').include, 'the verified "Lock changes" → lock-changes, included');
  ok(sv('commercial').status === 'needs_review' && !sv('commercial').include && sv('commercial').confidence === 'medium', '"Office & shop security" is only a weak match for Commercial → NEEDS REVIEW, not included');
  ok(sv('safe-opening').status === 'not_found', 'Safe opening is not named anywhere → not found');
  ok(sv('key-safe-installation').status === 'not_found' && !sv('key-safe-installation').include && sv('garage-locks').status === 'not_found', 'services nobody names are NOT FOUND and not included — never fabricated');
  ok(scoreService({ name: 'Safes', source_url: '' }, MCL_TEMPLATE.serviceCatalogue.find((x) => x.id === 'safe-opening')!).confidence === 'high', 'a candidate that IS a synonym ("Safes") matches with high confidence');
  ok(m.unmapped.map((u) => u.candidate.name).join() === 'Car key programming', 'a source service with no template match is listed for review (not silently dropped)');
  ok(scoreService({ name: 'Key safe fitting', source_url: '' }, MCL_TEMPLATE.serviceCatalogue.find((x) => x.id === 'key-safe-installation')!).confidence === 'high'
    && scoreService({ name: 'Key safe fitting', source_url: '' }, MCL_TEMPLATE.serviceCatalogue.find((x) => x.id === 'safe-opening')!).score < scoreService({ name: 'Key safe fitting', source_url: '' }, MCL_TEMPLATE.serviceCatalogue.find((x) => x.id === 'key-safe-installation')!).score, 'the longest synonym wins ("key safe" beats "safes")');
  const decided = mapOf({ ...s, mapping: { ...s.mapping, services: { 'emergency-lockouts': false, commercial: true }, candidate_map: { 'car key programming': 'ignore' } } });
  const d = (id: string) => decided.services.find((x) => x.service.id === id)!;
  ok(!d('emergency-lockouts').include && d('emergency-lockouts').status === 'excluded', 'a pre-selected service is easy to deselect');
  ok(d('commercial').include && d('commercial').status === 'ready', 'a needs-review service can be included by Paul');
  ok(decided.unmapped.every((u) => u.byOperator), 'an unmapped candidate marked "ignore" no longer needs review');
  ok(!decided.config.services.some((x) => x.id === 'emergency-lockouts') && decided.config.services.some((x) => x.id === 'commercial'), 'the config carries only the included services');
  const mapped = mapOf({ ...s, mapping: { ...s.mapping, candidate_map: { 'car key programming': 'key-safe-installation' } } });
  ok(mapped.services.find((x) => x.service.id === 'key-safe-installation')!.include && mapped.unmapped.length === 0, 'Paul can map an unmatched candidate to a catalogue service');
}

console.log('\n── F. LOCATIONS — SERVES ≠ DEDICATED PAGE ──');
{
  const s = imported();
  const m = mapOf(s);
  const t = (n: string) => m.towns.find((x) => x.name === n)!;
  ok(t('Whitby').isBase && t('Whitby').serves && t('Whitby').page, 'the verified base town is served and gets the template\u2019s base-location page');
  ok(!t('Scarborough').serves && !t('Scarborough').page && t('Scarborough').status === 'needs_review', 'a town the site mentions is NOT assumed served — needs review');
  const served = mapOf({ ...s, mapping: { ...s.mapping, locations: { scarborough: { serves: true } } } });
  ok(served.towns.find((x) => x.name === 'Scarborough')!.serves && !served.towns.find((x) => x.name === 'Scarborough')!.page, 'marking it served does NOT create a page (default OFF)');
  ok((served.config.locations.served as string[]).includes('Scarborough') && !(served.config.locations.pages as string[]).includes('Scarborough'), '…it is coverage in the config, not a page');
  const paged = mapOf({ ...s, mapping: { ...s.mapping, locations: { scarborough: { serves: true, page: true } } } });
  ok((paged.config.locations.pages as string[]).join() === 'Whitby,Scarborough', 'a dedicated page only when Paul turns it on');
  const unserved = mapOf({ ...s, mapping: { ...s.mapping, locations: { scarborough: { serves: false, page: true } } } });
  ok(!(unserved.config.locations.pages as string[]).includes('Scarborough'), 'a page can never exist for a town not served');
}

console.log('\n── G. ASSET ASSIGNMENT ──');
{
  let s = imported();
  const slot = (m: ReturnType<typeof mapOf>, id: string) => m.slots.find((x) => x.slot.id === id)!;
  let m = mapOf(s);
  ok(slot(m, 'logo').suggestions[0]?.source_url.endsWith('logo.svg'), 'logo image → Logo slot suggestion');
  ok(slot(m, 'van').suggestions[0]?.source_url.endsWith('van-hero.jpg') && slot(m, 'hero').suggestions.some((a) => a.source_url.endsWith('van-hero.jpg')), 'van photo → Van (and Hero) candidate');
  ok(slot(m, 'owner').suggestions[0]?.source_url.endsWith('dan.jpg'), 'portrait → Owner candidate');
  ok(slot(m, 'gallery').suggestions.some((a) => a.source_url.endsWith('lock-job.jpg')) && slot(m, 'credentials').suggestions[0]?.source_url.endsWith('mla.png'), 'job photo → Gallery; badge → Credentials');
  ok(Object.keys(autoAssign(MCL_TEMPLATE.assetSlots, s)).length === 0, 'auto-assign assigns NOTHING while every asset is still REVIEW');
  s = { ...s, manifest: { ...s.manifest, assets: s.manifest.assets.map((a) => (a.source_url.endsWith('mla.png') ? a : { ...a, approval: 'approved' as const })) } };
  const auto = autoAssign(MCL_TEMPLATE.assetSlots, s);
  ok(auto.logo?.[0].endsWith('logo.svg') && auto.owner?.[0].endsWith('dan.jpg') && !auto.credentials, 'auto-assign fills empty slots with USE suggestions only (the REVIEW badge is not assigned)');
  s = { ...s, mapping: { ...s.mapping, assets: { ...auto, credentials: [SITE + 'img/mla.png'] } } };
  m = mapOf(s);
  ok(slot(m, 'credentials').assigned.length === 1 && slot(m, 'credentials').publishable.length === 0 && !m.config.assets.credentials, 'manually assigning a REVIEW asset keeps it OUT of the config');
  ok(m.omitted.some((o) => /Credentials — 1 assigned asset\(s\) not marked USE/.test(o)), '…and says so');
  ok(m.config.assets.logo?.[0].file === 'logo.svg', 'a USE asset in a slot reaches the config with its local filename');
  const un = mapOf({ ...s, mapping: { ...s.mapping, assets: { ...s.mapping.assets, logo: [] } } });
  ok(!un.config.assets.logo && !un.readiness.blockers.some((b) => /Logo/.test(b)) && un.config.brand.mark === 'text_wordmark' && un.config.brand.wordmark === 'Harbour Locks Ltd', 'Phase 4: with no logo the brand falls back to a TEXT WORDMARK of the verified name — it does not block');
}

console.log('\n── I/J. READINESS AND THE GENERATED CONFIG ──');
{
  const s = imported();
  const m = mapOf(s);
  ok(!m.readiness.ok && m.readiness.blockers.some((b) => /Domain is missing/.test(b)) && m.readiness.blockers.some((b) => /Mobile or premises is missing/.test(b)) && !m.readiness.blockers.some((b) => /Logo/.test(b)), 'missing REQUIRED data blocks (domain, mobile/premises) — a missing logo does not (Phase 4 wordmark)');
  ok(!m.readiness.blockers.some((b) => /DBS|Insurance|Owner/.test(b)), 'missing / unapproved OPTIONAL proof never blocks');
  ok(m.readiness.notes.some((n) => /DBS check is left out until approved/.test(n)), '…it is left out until approved, and says so');
  ok(m.readiness.ready > 0 && m.readiness.needsApproval > 0 && m.readiness.optionalMissing > 0, `counts: ready ${m.readiness.ready} · needs approval ${m.readiness.needsApproval} · missing required ${m.readiness.missingRequired} · optional missing ${m.readiness.optionalMissing}`);
  const ready = { ...s, canonical_domain: 'harbourlocks.co.uk', mapping: { ...s.mapping, fields: { mobile_or_premises: 'mobile', consent: 'banner' } },
    manifest: { ...s.manifest, assets: s.manifest.assets.map((a) => ({ ...a, approval: 'approved' as const })) } };
  const r2 = { ...ready, mapping: { ...ready.mapping, assets: autoAssign(MCL_TEMPLATE.assetSlots, ready) } };
  const m2 = mapOf(r2);
  ok(m2.readiness.ok, `with the required data in place the template is READY TO BUILD (${m2.readiness.blockers.join('; ') || 'no blockers'})`);
  const c = m2.config;
  ok((c.business as Record<string, unknown>).name === 'Harbour Locks Ltd' && (c.business as Record<string, unknown>).phone === '07700 900123' && (c.business as Record<string, unknown>).domain === 'harbourlocks.co.uk' && (c.business as Record<string, unknown>).mode === 'mobile', 'config.business carries the ready values');
  ok(!('hours' in (c.business as object)) && !('insurance' in c.proof) && !('prices' in c.pricing) && !('analytics' in c.tracking), 'needs-approval values are NOT in the config');
  ok(m2.omitted.some((o) => /Opening hours — needs approval/.test(o)), '…they are listed as left out');
  ok(c.services.map((x) => x.id).sort().join() === 'emergency-lockouts,lock-changes,upvc-door-mechanism' && c.services.find((x) => x.id === 'upvc-door-mechanism')!.evidence[0] === 'UPVC lock repairs', 'config.services = the included services, with their evidence');
  ok((c.locations as Record<string, unknown>).primary === 'Whitby' && JSON.stringify((c.locations as Record<string, unknown>).pages) === '["Whitby"]', 'config.locations: primary and pages');
  ok(Array.isArray((mapOf({ ...r2, facts: [...r2.facts.filter((x) => x.key !== 'insurance'), decide(row(r2, 'insurance'), 'verified')] }).config.proof as Record<string, unknown>).insurance), 'list values become arrays in the config');
  const stages = websiteBuildStages({ state: r2, hasExistingSite: true, factsAwaiting: 0, architectureErrors: 0, setupMissing: [], buildBlockers: m.readiness.blockers });
  ok(!stages.find((x) => x.stage === 'build_pack')!.done && /Not ready to build/.test(stages.find((x) => x.stage === 'build_pack')!.detail), 'the Build Pack stage is not done while the mapping has blockers');
}

console.log('\n── K. CONTAMINATION GUARD ──');
{
  const s = imported();
  const seedPhone = { ...s, facts: [...s.facts.filter((x) => x.key !== 'phone'), { key: 'phone', label: 'Phone', value: '07395 351094', status: 'verified' as const, source: 'Paul', source_url: '', notes: '', basis: 'operator' as const }] };
  const m = mapOf(seedPhone);
  ok(m.guard.hits.some((h) => h.value.value === '07395' && h.blocking) && !m.readiness.ok && m.readiness.blockers.some((b) => /07395/.test(b)), 'an MCL seed phone in the config BLOCKS readiness and names the value');
  const autoTown = scanSeedValues(JSON.stringify({ locations: { primary: 'Canterbury' } }), MCL_TEMPLATE, [{ key: 'primary_town', value: 'Canterbury', status: 'verified', basis: 'source_site' } as FactRow], 'Harbour Locks Ltd');
  ok(autoTown.hits[0]?.blocking, 'a seed town that was only auto-accepted from a site blocks');
  const confirmedTown = scanSeedValues(JSON.stringify({ locations: { primary: 'Canterbury' } }), MCL_TEMPLATE, [{ key: 'primary_town', value: 'Canterbury', status: 'verified', basis: 'client' } as FactRow], 'Harbour Locks Ltd');
  ok(confirmedTown.hits.length === 1 && !confirmedTown.hits[0].blocking, 'the same town CONFIRMED by the client is allowed (a real Canterbury business)');
  const word = scanSeedValues(JSON.stringify({ services: ['Emergency locksmith'] }), MCL_TEMPLATE, [], 'Harbour Locks Ltd');
  ok(word.hits.some((h) => h.value.value === 'locksmith' && !h.blocking), 'the trade word "locksmith" only warns');
  ok(scanSeedValues('{"x":"Kentish Town"}', MCL_TEMPLATE, [], 'X').hits.length === 0, 'whole-word matching: "Kent" is not found in "Kentish"');
  ok(/seed client/.test(scanSeedValues('Morgan, Canterbury, 07395', MCL_TEMPLATE, [], 'MC Locksmiths').skipped), 'the seed client\u2019s own build skips the guard and says why');
  ok(mapOf({ ...s, route: 'faithful_rebuild' }).guard.hits.length === 0, 'no template, no seed guard');
}

console.log('\n── L. OLD URL → NEW PAGE PLAN ──');
{
  const s0 = imported();
  const s = { ...s0,
    pages: [...s0.pages,
      { id: 'u', family: 'service' as const, path: '/services/upvc/', title: 'uPVC', action: 'keep' as const, old_url: SITE + 'upvc-repairs/', target: '', notes: '' },
      { id: 'c', family: 'service' as const, path: '', title: 'Car keys', action: 'remove' as const, old_url: SITE + 'car-keys/', target: '', notes: '' },
      { id: 's', family: 'service' as const, path: '', title: 'Office', action: 'consolidate' as const, old_url: SITE + 'office-security/', target: '/services/upvc/', notes: '' },
      { id: 'p', family: 'legal' as const, path: '/privacy/', title: 'Privacy', action: 'keep' as const, old_url: '', target: '', notes: '' }],
    redirects: [...s0.redirects, { from: '/emergency-locksmith/', to: '/', reason: 'x' }, { from: '/areas/pickering/', to: '/privacy/', reason: 'y' }, { from: '/about/', to: '/old', reason: 'chain' }] };
  const before = JSON.stringify(s.redirects);
  const d = urlDecisions(s);
  const r = (p: string) => d.rows.find((x) => x.path === p)!;
  ok(r('/upvc-repairs/').decision === 'kept' && r('/').decision === 'kept' && r('/privacy/').decision === 'kept', 'KEPT: a kept plan page, and a source path that is still a live page');
  ok(r('/car-keys/').decision === 'retired' && r('/car-keys/').flags.some((f) => /not found/.test(f)), 'RETIRED: removed, flagged as a future "not found"');
  ok(r('/office-security/').decision === 'redirected' && r('/office-security/').flags.some((f) => /not in the redirect map yet/.test(f)), 'a consolidated page is REDIRECTED (planned) and flagged until it is in the map');
  ok(r('/emergency-locksmith/').decision === 'redirected' && r('/emergency-locksmith/').flags.some((f) => /homepage/.test(f)), 'a service page redirected to the homepage is flagged');
  ok(r('/areas/pickering/').flags.some((f) => /unrelated page/.test(f)), 'a location page redirected to the privacy page is flagged as unrelated');
  ok(r('/about/').flags.some((f) => /chain/.test(f)) && d.issues.some((i) => /Chain/.test(i)), 'a redirect chain is flagged');
  ok(r('/areas/scarborough/').decision === 'unresolved' && r('/areas/scarborough/').flags.includes('no decision') && r('/contact/').decision === 'unresolved', 'UNRESOLVED: old URLs with no decision');
  ok(d.rows[0].decision === 'unresolved', 'unresolved rows are listed first');
  ok(JSON.stringify(s.redirects) === before, 'the comparison never changes the redirect map');
  const many = { ...s0, pages: [...s0.pages, { id: 'z', family: 'service' as const, path: '/services/all/', title: 'All', action: 'keep' as const, old_url: '', target: '', notes: '' }],
    redirects: ['/a/', '/b/', '/c/'].map((f) => ({ from: f, to: '/services/all/', reason: '' })) };
  ok(urlDecisions({ ...many, manifest: { ...many.manifest, pages: [...many.manifest.pages, ...['a', 'b', 'c'].map((x) => ({ url: SITE + x + '/', type: 'service' as const, title: '', h1: '', purpose: '', screenshots: [], status_code: null, sections: [] }))] } })
    .rows.filter((x) => x.flags.some((f) => /same page/.test(f))).length === 3, 'three old URLs into one ordinary page are flagged as suspicious');
}

console.log('\n── H/M. PROMPTS ──');
{
  const s0 = imported();
  const s = { ...s0, canonical_domain: 'harbourlocks.co.uk', mapping: { ...s0.mapping, fields: { mobile_or_premises: 'mobile', consent: 'banner' } },
    manifest: { ...s0.manifest, assets: s0.manifest.assets.map((a) => (a.source_url.endsWith('mla.png') ? a : { ...a, approval: 'approved' as const })) } };
  const withSlots = { ...s, mapping: { ...s.mapping, assets: autoAssign(MCL_TEMPLATE.assetSlots, s) } };
  const input = (st: WebsiteBuildState) => ({ state: st, template: st.route === 'template_rebuild' ? MCL_TEMPLATE : null, facts: rowsFor(st), evidence: toRebuildPromptInput(ctx()), businessName: 'Harbour Locks Ltd', existingSiteUrl: SITE, mustNotSay: '', generatedAt: '2026-09-25T00:00:00Z' });
  const b = masterPrompt(input(withSlots), { lean: true });
  ok(/## E2\. GENERATED CLIENT CONFIG/.test(b.text) && /READY TO BUILD: yes/.test(b.text) && b.text.includes('"name": "Harbour Locks Ltd"'), 'the Template Build prompt carries the generated config and its readiness');
  for (const w of ['Do NOT invent missing claims', 'Optional proof that is not in the config is OMITTED', 'Use the template architecture', 'Selected services ONLY', 'Location pages ONLY for: Whitby', 'Derive the LocalBusiness schema from this config', 'NO street address', 'No MC Locksmiths']) ok(b.text.includes(w), `  …"${w}"`);
  ok(/REMOVE every other template service/.test(b.text) && b.text.includes('Garage locks'), '  …and names the template services to remove');
  ok(!b.text.includes('"reconVersion"') && !b.text.includes('Car key programming"') , 'the raw recon is not dumped into the prompt');
  ok(!b.blockedBy.includes('Template mapping not ready to build'), 'a ready mapping does not block the prompt');
  ok(masterPrompt(input(s0), { lean: true }).blockedBy.includes('Template mapping not ready to build'), 'an unready mapping is flagged on the Build prompt');
  const ps = stagePrompts(input(withSlots));
  const ad = ps.find((p) => p.id === 'asset_download')!;
  ok(ad.label === 'Copy Asset Download Prompt' && ad.stage === 'build_pack', 'the Asset Download prompt is on the Build Pack stage');
  ok(ad.text.includes('img/logo.svg') && ad.text.includes('img/dan.jpg') && !ad.text.includes('img/mla.png'), 'template: only USE assets assigned to a slot are listed (the REVIEW badge is not)');
  for (const w of ['capture/assets/original', 'Never edit an original', 'Safe local filenames', 'downloaded ONCE', 'Never hotlink', 'Do NOT download anything that is not on this list', 'If a download fails', 'downloads.csv']) ok(ad.text.includes(w), `  asset prompt: "${w}"`);
  ok(/1 asset\(s\) are still REVIEW/.test(ad.text), '  …REVIEW assets are counted, not listed');
  const unassigned = { ...s, mapping: { ...s.mapping, assets: { logo: [SITE + 'img/logo.svg'] } } };
  ok(!stagePrompts(input(unassigned)).find((p) => p.id === 'asset_download')!.text.includes('dan.jpg'), 'template: a USE asset NOT assigned to a slot is not downloaded');
  const faithful = { ...s, route: 'faithful_rebuild' as const, rebuild_style: 'replica' as const, copy_ownership: 'client_wrote' as const };
  const fa = stagePrompts(input(faithful)).find((p) => p.id === 'asset_download')!.text;
  ok(fa.includes('dan.jpg') && fa.includes('lock-job.jpg') && /every asset of the authorised site/.test(fa), 'faithful: every USE asset is downloaded, assigned or not');
  ok(stagePrompts(input(s0)).find((p) => p.id === 'asset_download')!.blockedBy.includes('Approved assets'), 'with no USE assets the asset prompt says so');
}

console.log('\n── N. FAITHFUL / BESPOKE ──');
{
  for (const route of ['faithful_rebuild', 'bespoke'] as const) {
    const s = imported({ ...BASE, route });
    const m = mapOf(s);
    ok(!m.isTemplate && m.services.length === 0 && m.towns.length === 0, `${route}: no template service / location mapping is forced`);
    ok(m.fields.some((f) => f.field.id === 'phone') && m.slots.some((x) => x.slot.id === 'logo') && !m.slots.some((x) => x.slot.id === 'van'), `${route}: core business data + core asset slots (no locksmith van slot)`);
    ok(m.readiness.blockers.some((b) => /Domain/.test(b)), `${route}: missing required core data is still reported`);
    ok(urlDecisions(s).rows.length === 11, `${route}: the old-URL decision view works without a template`);
  }
}

console.log('\n── COMPATIBILITY, AUTOSAVE, ROUTE ──');
{
  const s = imported();
  const decided = { ...s, mapping: { services: { 'emergency-lockouts': false }, candidate_map: { 'car key programming': 'ignore' }, locations: { scarborough: { serves: true } }, assets: { logo: [SITE + 'img/logo.svg'] }, fields: { mobile_or_premises: 'mobile' } } };
  const saved = parseWebsiteBuild(normaliseWebsiteBuild(decided));
  ok(saved.route === 'template_rebuild' && saved.template_id === 'mcl-local-trades', 'the route survives the autosave round trip');
  ok(JSON.stringify(saved.mapping) === JSON.stringify(decided.mapping), 'every mapping decision survives the save rule exactly');
  ok(saved.facts.find((f) => f.key === 'phone')!.basis === 'source_site', 'the verification basis survives');
  ok(saved.recon.services.length === 4 && saved.recon.towns.length >= 2, 'the service / town candidates survive');
  ok(saved.redirects.length === 1 && saved.pages.length === 1 && saved.qa.visual_qa === true && saved.preview_url === BASE.preview_url, 'redirects, page plan, QA and preview are untouched');
  const evil = parseWebsiteBuild({ version: 2, mapping: { services: { 'x y': true, ok: 'yes', fine: true }, assets: { logo: ['javascript:alert(1)', 'https://a.co.uk/l.svg'] }, fields: { '<script>': 'x' }, extra: 1 } });
  ok(!('x y' in evil.mapping.services) && !('ok' in evil.mapping.services) && evil.mapping.services.fine === true && evil.mapping.assets.logo.join() === 'https://a.co.uk/l.svg' && Object.keys(evil.mapping.fields).length === 0, 'the save rule keeps only well-formed mapping keys, booleans and http(s) asset URLs');
  const v1 = parseWebsiteBuild({ build_mode: 'template', template_id: 'mcl-local-trades', facts: [{ key: 'phone', label: 'Phone', value: '01234', status: 'verified', source: 'Paul' }] });
  const v1m = mapOf(v1);
  ok(v1.route === 'template_rebuild' && v1m.fields.find((f) => f.field.id === 'phone')!.status === 'ready' && v1m.fields.find((f) => f.field.id === 'phone')!.rank === 1, 'a V1 row opens, maps, and its verified fact ranks as a verified client fact');
  const p2 = parseWebsiteBuild({ version: 2, route: 'faithful_rebuild', recon: { imported_at: '2026-09-25T10:00:00Z', review: [{ kind: 'conflict', key: 'address', label: 'Address', detail: 'x', resolved: false }] }, manifest: { pages: [{ url: SITE, type: 'homepage' }] } });
  ok(p2.recon.review.length === 1 && p2.recon.services.length === 0 && p2.manifest.pages.length === 1 && mapOf(p2).fields.length > 0, 'a Phase 2 row (no candidates, no basis) still opens and maps');
}

console.log('\n── THE PAGE ──');
{
  const page = readFileSync(new URL('../src/pages/WebsiteBuild.tsx', import.meta.url), 'utf8');
  ok(/computeMapping\(state, template, rows, businessName\)/.test(page) && /<MappingPanel /.test(page) && /<UrlDecisionsPanel /.test(page), 'the page derives the mapping and shows the Mapping and Old URL panels');
  ok(/View generated config/.test(page) && !/<Textarea[^>]*JSON\.stringify\(mapping\.config/.test(page), 'the config is a read-only disclosure, not a JSON editor');
  ok(!/dangerouslySetInnerHTML/.test(page), 'nothing imported is rendered as markup');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
