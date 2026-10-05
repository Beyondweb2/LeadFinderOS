/* WEBSITE BUILD — SIMPLE (2026-10-05). The simple operator flow run through the REAL functions on fixture
   clients (no network, no database): choose a build type → Prepare Website → ONE Master Build Prompt →
   import Claude's result → the automatic technical gate → Paul's eight review checks → corrections → launch.
     A. simple workflow      B. truth          C. build types      D. assets
     E. technical gate       F. domain         G. corrections      H. legacy records (BS4)      I. one owner per tick */

import { readFileSync } from 'node:fs';
import { GATE_ANSWERED_QA, QA_ITEMS, SIMPLE_REVIEW_ITEMS, gateAnsweredQa, outstandingPreviewQa, parseWebsiteBuild, requiredPreviewQa, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import { candidateFacts, mergeFacts } from '../src/lib/buildFacts.ts';
import { templateById } from '../src/lib/websiteTemplates.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';
import type { BuildPackInput } from '../src/lib/buildPack.ts';
import { applyBuildResult, correctionPrompt, parseBuildResult } from '../src/lib/buildExecution.ts';
import { websiteServiceRoute } from '../src/lib/websiteRoute.ts';
import { domainAuthority, domainInputFromRow, DOMAIN_REASON_TEXT } from '../src/lib/domainAuthority.ts';
import { productionReadiness, websiteBuildSaveRefusal } from '../src/lib/websiteLaunch.ts';
import { siteIntentMap } from '../src/lib/siteGate.ts';
import { computeMapping } from '../src/lib/templateMapping.ts';
import {
  applyBuildType, autoAcceptFacts, blockers, clientServices, correctionsWithFailures, currentWebsite, isPrepared, masterBuildPrompt, prepareWebsite, recreationRights,
  resolveBuildType, setReviewItem, simpleIssues, simpleProgress, technicalCheck, terminalSteps, type SimpleInput,
} from '../src/lib/simpleBuild.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }
const section = (t: string) => console.log('\n── ' + t + ' ──');

/* ── fixtures (QA clients only — example.* domains, 01632 96xxxx drama numbers) ────────────────────── */

const D2_QUESTIONS = ['boiler installation Brighouse', 'boiler repair Brighouse', 'plumber in Brighouse', 'radiator replacement Elland', 'emergency plumber Brighouse 24 hours', 'plumber Leeds'];
const SITE = 'https://brookfootplumbing.example';
const domainReady = { domain_status: 'existing', domain_owned: 'yes', domain_third_party: 'no', domain_access: 'yes', authority_confirmed: true, dns_permission: true, materials_confirmed: true };

function brookfoot(over: { onboarding?: Record<string, unknown>; lead?: Record<string, unknown>; build?: Record<string, unknown>; discovery?: Record<string, unknown> | null } = {}): RebuildContextPayload {
  return {
    lead: { id: '1e000000-0000-0000-0000-00000000b001', business_name: 'Brookfoot Plumbing & Heating', phone: '01632 960482', email: 'dean@brookfootplumbing.example', category: 'Plumber', website: SITE,
      services_included: ['Bathroom fitting', 'Gas boiler servicing'], website_build: over.build ?? {}, ...over.lead },
    onboarding: { business_name: 'Brookfoot Plumbing & Heating', confirmed_location: 'Brighouse', confirmed_phone: '01632 960482', contact_email: 'dean@brookfootplumbing.example', contact_name: 'Dean',
      services_list: ['Gas boiler servicing', 'Boiler repairs and breakdowns', 'Radiator installation and replacement', 'Leak, tap and toilet repairs'],
      areas_list: ['Brighouse', 'Rastrick', 'Elland', 'Hipperholme', 'Lightcliffe'], services_not_offered: 'New boiler installation, Drain unblocking',
      baseline_questions: D2_QUESTIONS, plan_tier: 'new_site', website_addon: true, business_website: SITE, ...domainReady, ...over.onboarding },
    baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null,
    discovery_audit: over.discovery === undefined ? { business_name: 'Brookfoot Plumbing', business_type: 'Roofer', location_text: 'Leeds', website: 'https://other.example' } : over.discovery,
    crawl: null, pages: [],
  } as unknown as RebuildContextPayload;
}

/** The page's own derivation (WebsiteBuild.tsx), from a payload and a state. */
function packFor(payload: RebuildContextPayload, state: WebsiteBuildState): BuildPackInput {
  const template = state.route === 'template_rebuild' ? templateById(state.template_id) : null;
  const rows = mergeFacts(candidateFacts(payload as never, state.canonical_domain), state.facts, template);
  const evidence = toRebuildPromptInput(payload);
  const web = rows.find((r) => r.key === 'website');
  const existingSiteUrl = currentWebsite(state.source_site_url, web).url;
  const route = websiteServiceRoute(payload.onboarding as never, payload.lead as never);
  const d = payload.onboarding ? domainAuthority(domainInputFromRow(payload.onboarding as never)) : null;
  const ob = (payload.onboarding ?? {}) as Record<string, unknown>;
  return {
    state, template, facts: rows, evidence, businessName: rows.find((r) => r.key === 'business_name')?.value || String((payload.lead as { business_name?: string }).business_name ?? ''),
    existingSiteUrl, mustNotSay: evidence.facts.mustNotSay.value ?? '', serviceRoute: route.route, routeSource: route.source,
    domain: d ? { applies: d.applies, ready: d.ready, reasons: d.reasons.map((r) => DOMAIN_REASON_TEXT[r]) } : null,
    clientTruth: { onboardingList: ob.services_list, onboardingText: ob.services, notOffered: ob.services_not_offered, leadServices: (payload.lead as Record<string, unknown>).services_included },
  };
}
const simpleFor = (payload: RebuildContextPayload, state: WebsiteBuildState): SimpleInput => {
  const pack = packFor(payload, state);
  return { pack, onboarding: payload.onboarding, leadId: String((payload.lead as { id: string }).id), oldUrls: [{ url: SITE + '/' }, { url: SITE + '/boilers.html' }, { url: SITE + '/contact-us' }], domain: pack.domain ?? null, ended: false };
};
const prepared = (payload: RebuildContextPayload, state: WebsiteBuildState) => prepareWebsite({ pack: packFor(payload, state), onboarding: payload.onboarding, active: true });

const gate = (mode: 'dist' | 'url', domain: string, pass = true) => ({ siteGateVersion: 1, domain, mode, preview: mode === 'url', pages: 9, passed: pass,
  checks: [{ id: 'links', label: 'Every internal link resolves', level: 'pass', details: [] }, { id: 'claims', label: 'Every trust claim is backed', level: pass ? 'pass' : 'fail', details: pass ? [] : ['"NICEIC approved" on /about/ has no verified fact'] }] });
function result(s: WebsiteBuildState, over: Record<string, unknown> = {}) {
  const pages = s.pages.filter((p) => p.action === 'create' || p.action === 'keep').map((p) => p.path);
  return JSON.stringify({
    buildResultVersion: 1, status: 'preview_ready',
    repository: { url: 'https://github.com/' + s.github_owner + '/' + s.repo_name, name: s.repo_name, branch: 'main', commitHash: 'abc1234' },
    local: { path: s.local_repo_path, devCommand: 'npm run dev', buildCommand: 'npm run build', outputDirectory: 'dist' },
    cloudflare: { projectName: s.cloudflare_project, previewUrl: 'https://preview.' + s.cloudflare_project + '.pages.dev', deploymentId: '', status: 'success', noindexConfirmed: true },
    build: { pages, services: [], locations: [], assets: [], unsupportedFields: [] },
    redirects: { kept: 1, redirected: 2, retired: 0, unresolved: [], issues: [] },
    qa: { buildPassed: true, seedContaminationPassed: true, linksPassed: true, responsivePassed: true, schemaPassed: true },
    quality: {
      oldVsNew: { verdict: 'upgrade', widths: [1440, 390], stillStronger: [], notes: '' },
      strengths: [{ category: 'photography', label: '12 genuine job photos', evidence: 'home + gallery', disposition: 'preserve', where: '/' }],
      siteGate: gate('dist', s.canonical_domain), siteGatePreview: gate('url', s.canonical_domain),
      standard: { heroImage: 'genuine', mobileHero: 'integrated', areasVisual: 'map', reviews: 'none_available', rating: 'none_available', form: 'site_enquiry', formTest: 'passed', credentialsProminent: true, photosUsed: 6, photographyPreserved: true, repeatedImages: [] },
    },
    seedHits: [], warnings: ['ASSET CHECK: ' + SITE + '/img/worcester-boiler.jpg — manufacturer product image', 'FACT CHECK: "Gas Safe registered" — /about/'], errors: [],
    ...over,
  });
}
const importInto = (s: WebsiteBuildState, json: string) => { const r = parseBuildResult(json); if (!r.ok) throw new Error('parse: ' + (r as { error: string }).error); return applyBuildResult(s, r.result, { now: '2026-10-05T12:00:00Z' }).state; };
const tickAll = (s: WebsiteBuildState, hasOld: boolean) => SIMPLE_REVIEW_ITEMS.reduce((acc, it) => setReviewItem(acc, it.key, true, hasOld), s);

/* ══ A. THE SIMPLE WORKFLOW ═════════════════════════════════════════════════════════════════════════ */
section('A. choose → prepare → one prompt → steps → review after the build');
const P = brookfoot();
let s = parseWebsiteBuild({});
ok(resolveBuildType(s) === '', 'a new record has no build type until Paul clicks one');
s = applyBuildType(s, 'visual_rebuild', P.onboarding);
ok(s.route === 'faithful_rebuild' && s.rebuild_style === 'new_design' && resolveBuildType(s) === 'visual_rebuild', 'choosing Visual rebuild records it (faithful route, new design)');
ok(!isPrepared(s), 'not prepared before Prepare Website');
const before = simpleIssues(simpleFor(P, s));
ok(blockers(before).length === 0 || blockers(before).every((b) => b.id === 'domain-unknown'), 'nothing but the web address could stop it before Prepare (got: ' + blockers(before).map((b) => b.id).join(', ') + ')');
const prep = prepared(P, s);
s = prep.state;
ok(isPrepared(s), 'Prepare Website leaves the record prepared');
ok(s.repo_name === 'BrookfootPlumbingHeating' && s.github_owner === 'Beyondweb2' && s.local_repo_path === 'C:\\Users\\paulj\\BrookfootPlumbingHeating', 'project defaults filled (repo, owner, folder): ' + s.repo_name + ' ' + s.local_repo_path);
ok(s.cloudflare_project === 'brookfoot-plumbing-heating' && s.cloudflare_mode === 'git_connected' && s.canonical_domain === 'brookfootplumbing.example', 'Cloudflare project / mode and the web address from the current site');
ok(s.source_site_url === SITE, 'the current website recorded as the rebuild source');
const confirmedCount = clientServices(packFor(P, s)).services.length;
ok(confirmedCount >= 4 && s.pages.some((p) => p.path === '/') && s.pages.some((p) => p.path === '/services/') && s.pages.filter((p) => p.family === 'service').length === confirmedCount, 'automatic page plan: home, services hub, one page per confirmed service (' + confirmedCount + ')');
ok(s.pages.every((p) => p.action === 'create'), 'no undecided pages in the automatic plan');
ok(s.quality.intents.contact?.need === 'needed' && s.quality.intents.location_pages?.need === 'not_needed', 'every content intent assessed automatically');
ok(s.form.enabled && s.form.recipient === 'dean@brookfootplumbing.example' && s.form.site_key === 'brookfoot-plumbing-heating', 'enquiry form switched on to the VERIFIED email, no manual routing');
ok(prepareWebsite({ pack: packFor(P, s), onboarding: P.onboarding, active: true }).changes.length === 0, 'Prepare twice changes nothing the second time (never overwrites)');
const X = simpleFor(P, s);
const issues = simpleIssues(X);
ok(blockers(issues).length === 0, 'no unnecessary pre-build checklist: zero blockers for an ordinary client (got: ' + blockers(issues).map((b) => b.title).join(' | ') + ')');
ok(!issues.some((i) => /photo|cms|google|checkatrade|home-town page|location page/i.test(i.title)), 'harmless things are not flagged (photos, CMS, Google profile, Checkatrade, home-town page)');
const M = masterBuildPrompt(X);
ok(M.blockedBy.length === 0 && M.text.startsWith('# MASTER BUILD — Brookfoot Plumbing & Heating'), 'ONE Master Build Prompt is generated');
for (const needle of ['## 1. THE CLIENT', '## 2. NOT TO BE PUBLISHED', '## 3. WHAT YOU ARE BUILDING', '## 4. THE CURRENT WEBSITE', '## 5. ASSETS', '## 6. SITE PLAN', '## 7. CONTENT', '## 8. AI VISIBILITY AND TECHNICAL', '## 9. DESIGN', '## 10. FUNCTIONAL', '## 11. QUALITY GATE', '## 12. SET UP, BUILD AND DEPLOY THE PREVIEW', '## 13. OPEN BOTH SITES AND COMPARE', '## 14. QA AND THE FINDABLE SITE GATE', '## 15. REPORT'])
  ok(M.text.includes(needle), 'master prompt carries ' + needle);
ok(/OAI-SearchBot/.test(M.text) && /robots\.txt/.test(M.text) && /sitemap/i.test(M.text) && /canonical/i.test(M.text) && /BreadcrumbList/.test(M.text), 'AI visibility requirements: OAI-SearchBot, robots, sitemap, canonicals, breadcrumbs');
ok(M.text.includes('"buildResultVersion": 1') && M.text.includes('findable-site-gate.mjs'), 'it ends in the importable result and runs the Findable site gate');
ok(M.text.includes(SITE) && M.text.includes('https://preview.brookfoot-plumbing-heating.pages.dev') && /Open the CURRENT LIVE SITE/.test(M.text), 'Claude is told to open the OLD site and the NEW preview');
ok(/branding · layout · missing content · business facts · service coverage · imagery · navigation · contact information/.test(M.text), 'the comparison names every dimension');
ok(!M.text.replace(/```json|```/g, '').includes('`'), 'no stray backtick in the prompt (only the json fences Claude reads)');
const PDisc = brookfoot({ onboarding: { business_website: '' }, lead: { website: '' } });
const sDisc = prepared(PDisc, applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', PDisc.onboarding)).state;
ok(!sDisc.canonical_domain && !sDisc.source_site_url && simpleIssues(simpleFor(PDisc, sDisc)).some((i) => i.id === 'no-old-site'), 'a website only a Discovery scan offered is never treated as the client’s site');
const steps = terminalSteps(X);
const cmd = steps.find((x) => x.command)?.command ?? '';
ok(cmd === 'New-Item -ItemType Directory -Force -Path "C:\\Users\\paulj\\BrookfootPlumbingHeating" | Out-Null; Set-Location "C:\\Users\\paulj\\BrookfootPlumbingHeating"; claude', 'exact PowerShell command shown: ' + cmd);
ok(steps.some((x) => /github\.com\/new/.test(x.link?.href ?? '')) && steps.some((x) => /side by side/i.test(x.title)) && steps.length <= 7, 'a few numbered steps: GitHub repo, PowerShell, paste, build, result, side by side, review');
ok(!steps.some((x) => /configure the environment/i.test(x.detail)), 'never "configure the environment"');
let prog = simpleProgress(X, productionReadiness({ state: s, route: 'build', hasExistingSite: true, domain: X.domain }));
ok(prog.done.gather && prog.done.prepare && !prog.done.build && !prog.done.review && prog.current === 'build', 'progress: Gather + Prepare done, Build next (' + prog.status + ')');
ok(technicalCheck(s).state === 'not_run' && !prog.done.review, 'review happens AFTER the build: nothing to review before a result');

/* ══ E. THE AUTOMATIC TECHNICAL GATE ═══════════════════════════════════════════════════════════════ */
section('E. technical gate: enforced, failures shown, a pass is one line');
const noGate = importInto(s, result(s, { quality: { oldVsNew: { verdict: 'upgrade', widths: [1440, 390], stillStronger: [] } } }));
const tNo = technicalCheck(noGate);
ok(tNo.state === 'failed' && tNo.failures.some((f) => /site gate not run|Site quality gate not run/i.test(f)), 'a result without the gate report FAILS the technical check: ' + tNo.failures[0]);
const failGate = importInto(s, result(s, { quality: { oldVsNew: { verdict: 'upgrade', widths: [1440, 390], stillStronger: [] }, strengths: [], siteGate: gate('dist', 'brookfootplumbing.example', false), siteGatePreview: gate('url', 'brookfootplumbing.example') } }));
const tFail = technicalCheck(failGate);
ok(tFail.state === 'failed' && tFail.failures.some((f) => /NICEIC/.test(f)), 'a failing gate check is shown to Paul (claim without evidence)');
ok(gateAnsweredQa(failGate).length === 0, 'a failed gate answers no technical tick');
s = importInto(s, result(s));
const tech = technicalCheck(s);
ok(tech.state === 'passed' && tech.failures.length === 0, 'a clean result + passing gate = TECHNICAL CHECK passed (' + tech.failures.join('; ') + ')');
ok(tech.assetChecks.length === 1 && tech.factChecks.length === 1 && tech.warnings.length === 0 || tech.warnings.every((w) => !/^ASSET|^FACT/.test(w)), 'ASSET CHECK / FACT CHECK lines are lifted out for Paul, not buried in warnings');
ok(s.quality.strengths_reviewed && s.quality.strengths.length === 1 && s.quality.strengths[0].disposition === 'preserve', 'the build\u2019s strength inventory fills the record (Paul decided none)');
ok(gateAnsweredQa(s).length === Object.keys(GATE_ANSWERED_QA).length, 'the gate answers every technical tick (' + gateAnsweredQa(s).length + ')');
const owed = outstandingPreviewQa(s, true).map((q) => q.key).sort();
const human = [...new Set(SIMPLE_REVIEW_ITEMS.flatMap((x) => x.qa))].sort();
ok(JSON.stringify(owed) === JSON.stringify(human), 'only Paul\u2019s review ticks are still owed: ' + owed.join(', '));
prog = simpleProgress(simpleFor(P, s), productionReadiness({ state: s, route: 'build', hasExistingSite: true, domain: X.domain }));
ok(prog.done.build && !prog.done.review && prog.status === 'Ready for review', 'status reads Ready for review');
let launch = productionReadiness({ state: s, route: 'build', hasExistingSite: true, domain: X.domain });
ok(launch.length === 1 && /preview QA tick/.test(launch[0]), 'production waits only for Paul\u2019s review: ' + launch.join(' | '));
s = tickAll(s, true);
launch = productionReadiness({ state: s, route: 'build', hasExistingSite: true, domain: X.domain });
ok(launch.length === 0, 'eight review ticks + the passed gate = cleared for production (' + launch.join(' | ') + ')');
prog = simpleProgress(simpleFor(P, s), launch);
ok(prog.done.review && prog.status === 'Ready to launch', 'status reads Ready to launch');
const prodNext = { ...s, production_url: 'https://brookfootplumbing.example', production_status: 'deployed' as const, qa: { ...s.qa, production_deployed: true } };
ok(websiteBuildSaveRefusal(s, prodNext, { route: 'build', domain: X.domain, ended: false }) === '', 'the server accepts the launch save once cleared');
const unticked = setReviewItem(s, 'claims', false, true);
ok(productionReadiness({ state: unticked, route: 'build', hasExistingSite: true, domain: X.domain }).length === 1 && websiteBuildSaveRefusal(unticked, { ...prodNext, qa: { ...unticked.qa, production_deployed: true } }, { route: 'build', domain: X.domain, ended: false }) !== '', 'one review tick undone → production refused again, browser AND server');
const staleGate = importInto(s, result(s, { status: 'needs_attention', errors: ['Link check failed on /services/'] }));
ok(gateAnsweredQa(staleGate).length === 0 && productionReadiness({ state: staleGate, route: 'build', hasExistingSite: true, domain: X.domain }).some((p) => /needs attention/.test(p)), 'a later needs-attention build takes the gate\u2019s answers away (no stale pass)');

/* ══ F. DOMAIN ═════════════════════════════════════════════════════════════════════════════════════ */
section('F. domain: preview now, handoff before launch');
const PD = brookfoot({ onboarding: { domain_owned: 'not_sure', domain_access: 'no', authority_confirmed: null } });
let sd = prepared(PD, applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', PD.onboarding)).state;
const XD = simpleFor(PD, sd);
const di = simpleIssues(XD);
ok(blockers(di).length === 0 && masterBuildPrompt(XD).blockedBy.length === 0, 'an unresolved domain does NOT stop the preview build');
ok(di.some((i) => i.level === 'launch' && i.title === 'Preview can be built now. Domain handoff required before launch.'), 'it says: Preview can be built now. Domain handoff required before launch.');
ok(/never take over a domain without the owner/.test(di.find((i) => i.id === 'domain-handoff')?.detail ?? ''), 'the resolutions never imply a takeover without authority');
sd = tickAll(importInto(sd, result(sd)), true);
const dl = productionReadiness({ state: sd, route: 'build', hasExistingSite: true, domain: XD.domain });
ok(dl.length === 1 && /Domain ownership/.test(dl[0]), 'production stays blocked until the domain handoff is resolved: ' + dl.join(' | '));
ok(websiteBuildSaveRefusal(sd, { ...sd, production_url: 'https://brookfootplumbing.example' }, { route: 'build', domain: XD.domain, ended: false }) !== '', 'the server refuses the launch save too');

/* ══ G. CORRECTIONS ═════════════════════════════════════════════════════════════════════════════════ */
section('G. corrections: one prompt, context kept');
const withFix = { ...s, corrections: '- Remove the Elland page\n- Use the older logo' };
const cp = correctionPrompt({ ...packFor(P, withFix), state: correctionsWithFailures(withFix, technicalCheck(withFix)) });
ok(cp.blockedBy.length === 0 && cp.text.includes('Remove the Elland page') && cp.text.includes('Use the older logo'), 'Paul\u2019s plain-English changes become ONE correction prompt');
ok(cp.text.includes('C:\\Users\\paulj\\BrookfootPlumbingHeating') && cp.text.includes('https://preview.brookfoot-plumbing-heating.pages.dev') && cp.text.includes('"buildResultVersion": 1'), 'it keeps the build context (folder, preview) and ends in a new result to import');
const failFix = correctionsWithFailures({ ...failGate, corrections: '- Darker header' }, technicalCheck(failGate));
ok(/Darker header/.test(failFix.corrections) && /Fix the technical check: .*NICEIC/.test(failFix.corrections), 'technical failures join the correction prompt automatically');
const again = importInto(withFix, result(withFix));
ok(again.facts.length === withFix.facts.length && again.pages.length === withFix.pages.length && again.route === withFix.route && again.qa.mobile_qa === true, 'importing the corrected result keeps facts, page plan, route and Paul\u2019s ticks');

/* ══ B. TRUTH ═══════════════════════════════════════════════════════════════════════════════════════ */
section('B. truth hierarchy');
const services = s.pages.filter((p) => p.family === 'service').map((p) => p.title);
ok(services.includes('Gas boiler servicing') && !services.includes('Bathroom fitting'), 'the client-confirmed list wins over the sales notes (no Bathroom fitting page)');
ok(!services.some((x) => /installation of new|new boiler|drain/i.test(x)), 'a not-offered service gets no page');
ok(/does NOT offer: New boiler installation, Drain unblocking/.test(M.text), 'the prompt names what the client does NOT offer');
ok(!prep.state.facts.some((f) => /discovery/i.test(f.source)) && !packFor(P, s).facts.some((f) => isPub(f) && /discovery/i.test(f.source)), 'Discovery never becomes a business fact');
ok(!autoAcceptFacts(packFor(brookfoot({ lead: { category: '' } }), applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', null)).facts).some((f) => f.key === 'trade' && /Roofer/.test(f.value)), 'a Discovery trade guess is never accepted');
const map = siteIntentMap(packFor(P, s), computeMapping(s, null, packFor(P, s).facts, 'Brookfoot Plumbing & Heating'));
ok(map.unowned.includes('boiler installation Brighouse') && !map.intents.some((x) => /boiler installation/i.test(x.question ?? '')), 'an unsupported baseline question (a not-offered service) owns no page');
ok(map.unowned.includes('plumber Leeds'), 'a town they do not serve owns no page');
ok(!s.pages.some((p) => p.family === 'location'), 'no town page is created automatically');
const PA = brookfoot({ onboarding: { areas_list: [] }, lead: { service_areas: ['Halifax', 'Huddersfield', 'Leeds'] } });
const sa = prepared(PA, applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', PA.onboarding)).state;
ok(!sa.pages.some((p) => p.family === 'locations_index' || p.family === 'location'), 'areas that are not approved (sales notes only, not verified) never become pages');
ok(!sa.facts.some((f) => f.key === 'service_areas'), 'and are not accepted as facts');
const PC = brookfoot({ onboarding: { confirmed_phone: '01632 960999' } });
const sc = applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', PC.onboarding);
const cIssues = simpleIssues(simpleFor(PC, prepared(PC, sc).state));
ok(cIssues.some((i) => i.level === 'blocker' && i.id === 'conflict-phone' && i.fixes.some((f) => f.kind === 'fact' && f.options.length >= 2)), 'a phone the records disagree on is a blocker with both values to choose from');
ok(!prepared(PC, sc).state.facts.some((f) => f.key === 'phone'), 'and Prepare never settles it on its own');
const PX = brookfoot({ onboarding: { services_not_offered: 'Gas boiler servicing' } });
ok(simpleIssues(simpleFor(PX, prepared(PX, applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', PX.onboarding)).state)).some((i) => i.id === 'service-contradiction' && i.level === 'blocker'), 'a service listed as offered AND not offered blocks');
const PN = brookfoot({ onboarding: { business_name: '' }, lead: { business_name: '' }, discovery: null });
ok(simpleIssues(simpleFor(PN, applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', PN.onboarding))).some((i) => i.id === 'business_name' && i.level === 'blocker'), 'no business name blocks');
const PE = brookfoot({ onboarding: { confirmed_phone: '', contact_email: '' }, lead: { phone: '', email: '' } });
ok(simpleIssues(simpleFor(PE, prepared(PE, applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', PE.onboarding)).state)).some((i) => i.id === 'contact' && i.level === 'blocker'), 'no contact destination blocks');
const credRow = { key: 'accreditations', label: 'Accreditations / credentials / checks', value: 'NICEIC approved', status: 'detected', source: 'paid baseline context', source_url: '', notes: '', basis: '' };
const sCred = { ...s, facts: [...s.facts.filter((f) => f.key !== 'accreditations'), credRow as never] };
const credIssue = simpleIssues(simpleFor(P, sCred)).find((i) => i.id === 'claim-accreditations');
ok(!!credIssue && credIssue.level === 'decide', 'an uncertain credential is flagged for Paul but does not stop the preview');

/* ══ C. BUILD TYPES ═════════════════════════════════════════════════════════════════════════════════ */
section('C. build types');
const PT = brookfoot({ onboarding: { business_website: '' }, lead: { website: '' } });
let st = applyBuildType(parseWebsiteBuild({}), 'template', PT.onboarding);
ok(st.route === 'template_rebuild' && st.template_id === 'mcl-local-trades', 'the template type selects the (only) Findable template in the same click');
st = prepared(PT, st).state;
const tIssues = simpleIssues(simpleFor(PT, st));
ok(tIssues.some((i) => i.id === 'domain-unknown' && i.level === 'blocker'), 'a new site with no web address asks for one (needed for canonicals)');
st = { ...st, canonical_domain: 'brookfootplumbing.example' };
const XT = simpleFor(PT, st);
ok(simpleIssues(XT).some((i) => i.id === 'template-fit' && i.level === 'decide'), 'a template built for another trade is a warning, not a stop');
const MT = masterBuildPrompt(XT);
ok(MT.blockedBy.length === 0 || MT.blockedBy.every((b) => /has no pages for this client/.test(b)), 'template build: no CMS, no old site needed (' + MT.blockedBy.join(' | ') + ')');
const PL = brookfoot({ onboarding: { business_website: '', services_list: ['Emergency lockouts', 'Lock changes and upgrades', 'uPVC door mechanism and multipoint repairs'], services_not_offered: '' }, lead: { website: '', category: 'Locksmith', services_included: [] } });
let sl = prepared(PL, applyBuildType(parseWebsiteBuild({}), 'template', PL.onboarding)).state;
sl = { ...sl, canonical_domain: 'pengwernlocks.example' };
const ML = masterBuildPrompt(simpleFor(PL, sl));
ok(ML.blockedBy.length === 0 && ML.text.includes('NEW SITE — FINDABLE TEMPLATE: MCL Local Trades Template') && ML.text.includes('GENERATED CLIENT CONFIG'), 'template works end to end: the prompt names the template and carries its client config (' + ML.blockedBy.join(' | ') + ')');
ok(ML.text.includes('clone https://github.com/') && /checkout --detach/.test(ML.text), 'the template is cloned at its pinned commit, read-only');
ok(!/## 4\. THE CURRENT WEBSITE/.test(ML.text) && !/## 13\.[^\n]*\n\nOpen the CURRENT LIVE SITE/.test(ML.text), 'no old site → no old-site section, no side-by-side');
ok(s.route === 'faithful_rebuild' && !s.facts.some((f) => /cms|wordpress|login/i.test(f.key)) && blockers(simpleIssues(X)).length === 0, 'visual rebuild works with no CMS access');
const PR = brookfoot();
let sr = prepared(PR, applyBuildType(parseWebsiteBuild({}), 'close_recreation', PR.onboarding)).state;
ok(resolveBuildType(sr) === 'close_recreation' && recreationRights(sr, PR.onboarding) === 'unclear', 'close recreation with no rights answer reads as unclear');
const rIssue = simpleIssues(simpleFor(PR, sr)).find((i) => i.id === 'rights');
ok(!!rIssue && rIssue.level === 'blocker' && masterBuildPrompt(simpleFor(PR, sr)).blockedBy.length > 0, 'close recreation requires rights confirmation before any prompt');
ok(!!rIssue && rIssue.fixes[0].kind === 'switch_type' && (rIssue.fixes[0] as { to: string }).to === 'visual_rebuild', 'unclear rights → the safer Visual rebuild is suggested first');
const PRn = brookfoot({ onboarding: { site_rights: 'no' } });
const rNo = simpleIssues(simpleFor(PRn, prepared(PRn, applyBuildType(parseWebsiteBuild({}), 'close_recreation', PRn.onboarding)).state)).find((i) => i.id === 'rights');
ok(!!rNo && !rNo.fixes.some((f) => f.kind === 'confirm_rights'), 'an agency-owned site cannot be "confirmed" with a click — only switched to a visual rebuild');
const PRy = brookfoot({ onboarding: { site_rights: 'yes' } });
const sy = prepared(PRy, applyBuildType(parseWebsiteBuild({}), 'close_recreation', PRy.onboarding)).state;
ok(sy.copy_ownership === 'client_permission' && !simpleIssues(simpleFor(PRy, sy)).some((i) => i.id === 'rights') && /CLOSE RECREATION/.test(masterBuildPrompt(simpleFor(PRy, sy)).text), 'the client\u2019s own "yes" lets the close recreation through, recorded as their permission');
ok(/Never copy a third party.s proprietary template code/.test(masterBuildPrompt(simpleFor(PRy, sy)).text), 'never a pixel copy of third-party template code');
const PO = brookfoot({ onboarding: { plan_tier: 'keep', website_addon: false } });
const so = applyBuildType(parseWebsiteBuild({}), 'template', PO.onboarding);
ok(applyBuildType(so, 'optimise', PO.onboarding) === so, 'choosing Improve existing site changes no build record');
const XO = simpleFor(PO, so);
ok(XO.pack.serviceRoute === 'optimise' && simpleIssues(XO).some((i) => i.id === 'optimise-client') && masterBuildPrompt(XO).blockedBy.length > 0, 'an Optimise client leaves the new-site flow: no master prompt at all');
const PU = brookfoot({ onboarding: { plan_tier: '', website_addon: null, website_route: '' } });
ok(simpleIssues(simpleFor(PU, applyBuildType(parseWebsiteBuild({}), 'visual_rebuild', PU.onboarding))).some((i) => i.id === 'route' && i.level === 'blocker'), 'an unsettled Build / Optimise route blocks the build');

/* ══ D. ASSETS ══════════════════════════════════════════════════════════════════════════════════════ */
section('D. assets');
ok(/the business.s own logo; their own photos/.test(M.text), 'business-owned logo and photos may be reused');
ok(/DO NOT ASSUME OWNERSHIP of: stock photography, manufacturer/.test(M.text) && /ASSET CHECK/.test(M.text), 'stock / manufacturer / platform badges are not assumed owned — flagged instead');
ok(/badges .*ONLY when section 1 verifies that membership/.test(M.text) && /Never a fake, redrawn or generic badge/.test(M.text), 'an accreditation badge needs a verified membership');
const withAssets = { ...s, manifest: { ...s.manifest, assets: [
  { source_url: 'file:///C:/Users/paulj/Clients/van.jpg', type: 'photo', purpose: 'their van', location: '', approval: 'approved', page_url: '', suggested_filename: 'van.jpg', ownership: 'client_owned', origin: 'client' },
  { source_url: SITE + '/stock-plumber.jpg', type: 'photo', purpose: 'hero', location: '', approval: 'approved', page_url: '', suggested_filename: 'stock.jpg', ownership: 'third_party' },
] } } as WebsiteBuildState;
const MA = masterBuildPrompt(simpleFor(P, withAssets)).text;
ok(MA.includes('file:///C:/Users/paulj/Clients/van.jpg') && /client-supplied/.test(MA), 'client-supplied photos are carried into the build');
ok(!MA.includes(SITE + '/stock-plumber.jpg'), 'an approved image NOT recorded as client-owned is never downloaded');
ok(!/Accreditations \/ credentials \/ checks: NICEIC/.test(masterBuildPrompt(simpleFor(P, sCred)).text.split('## 2.')[0]), 'an unverified credential is not in the publishable facts');

/* ══ H. LEGACY RECORDS ═══════════════════════════════════════════════════════════════════════════════ */
section('H. existing records keep working (BS4 shape)');
const bs4Raw = { version: 2, route: 'bespoke', template_id: 'mcl-local-trades', repo_name: 'BS4ElectricalServices', github_owner: 'Beyondweb2', local_repo_path: 'C:\\Users\\paulj\\BS4ElectricalServices',
  cloudflare_project: 'bs4-electrical-services', cloudflare_mode: 'git_connected', canonical_domain: 'bs4electricalservices.co.uk', preview_url: 'https://preview.bs4-electrical-services.pages.dev',
  pages: [{ id: 'h', family: 'homepage', path: '/', title: 'Home', action: 'keep' }, { id: 's', family: 'service', path: '/services/eicr/', title: 'EICR', action: 'create' }],
  facts: [{ key: 'phone', label: 'Phone number', value: '01632 960000', status: 'verified', source: 'operator', source_url: '', notes: '', basis: 'operator' }],
  build_execution: { result_imported_at: '2026-09-30T10:00:00Z', result_status: 'preview_ready', preview_url: 'https://preview.bs4-electrical-services.pages.dev', commit_hash: 'cb5e08e' } };
const bs4 = parseWebsiteBuild(bs4Raw);
ok(resolveBuildType(bs4) === 'legacy_bespoke', 'BS4 (bespoke) loads as an earlier Bespoke build — its type is not changed silently');
const PB = brookfoot();
const bp = prepareWebsite({ pack: packFor(PB, bs4), onboarding: PB.onboarding, active: true }).state;
ok(bp.route === 'bespoke' && bp.pages.length === 2 && bp.repo_name === 'BS4ElectricalServices' && bp.facts.find((f) => f.key === 'phone')?.value === '01632 960000', 'Prepare never overwrites its route, plan, project or Paul\u2019s facts');
ok(masterBuildPrompt(simpleFor(PB, bp)).text.includes('BESPOKE BUILD (set up before the simple flow)'), 'a bespoke record still gets a master prompt');
ok(parseWebsiteBuild(JSON.parse(JSON.stringify(bp))).route === 'bespoke', 'the record round-trips through the server\u2019s one parser');

/* ══ I. ONE OWNER PER TICK ═══════════════════════════════════════════════════════════════════════════ */
section('I. every preview QA tick has exactly one owner (a review item OR the gate)');
const owners = new Map<string, number>();
for (const it of SIMPLE_REVIEW_ITEMS) for (const k of it.qa) owners.set(k, (owners.get(k) ?? 0) + 1);
for (const k of Object.keys(GATE_ANSWERED_QA)) owners.set(k, (owners.get(k) ?? 0) + 1);
for (const q of QA_ITEMS.filter((x) => x.group === 'preview')) ok(owners.get(q.key) === 1, q.key + ' has one owner');
ok(SIMPLE_REVIEW_ITEMS.length === 8, 'eight review checks, not forty');
ok(requiredPreviewQa(false).every((q) => owners.has(q.key)), 'no orphan tick for a client with no old site');

/* ══ wiring ═══════════════════════════════════════════════════════════════════════════════════════════ */
section('wiring: the page, the Advanced view, the launch rule');
const page = readFileSync('src/pages/WebsiteBuild.tsx', 'utf8');
const ui = readFileSync('src/components/SimpleWebsiteBuild.tsx', 'utf8');
ok(/params\.get\('view'\) !== 'advanced'/.test(page) && page.includes('<SimpleWebsiteBuild'), 'the simple screen is the default view');
ok(page.includes('Back to the simple view') && ui.includes('Advanced — view build details'), 'the command centre stays one click away (Advanced)');
for (const needle of ['COPY MASTER BUILD PROMPT', 'PREPARE WEBSITE', 'OPEN OLD SITE', 'OPEN PREVIEW', 'REVIEW SIDE BY SIDE', 'TECHNICAL CHECK', 'View technical details', 'COPY CORRECTION PROMPT', 'READY TO LAUNCH', 'COPY LAUNCH PROMPT', 'What to do'])
  ok(ui.includes(needle), 'the screen shows ' + needle);
ok(/outstandingPreviewQa\(s, i\.hasExistingSite\)/.test(readFileSync('src/lib/websiteLaunch.ts', 'utf8')), 'the one launch rule reads the gate-answered ticks (server and browser alike)');

function isPub(f: { status: string; value: string }) { return f.status === 'verified' && !!f.value; }

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'ALL PASSED'));
if (failures) process.exit(1);
