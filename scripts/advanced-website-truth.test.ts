/* ADVANCED WEBSITE TRUTH (fix/advanced-website-truth, 2026-10-05). The simple Website Build flow refused to
   treat a website URL that only a Discovery scan offered as the client's current website; the Advanced view
   (?view=advanced) took ANY non-rejected Current website fact. Both now read ONE rule —
   simpleBuild.currentWebsite — and this suite drives the REAL derivation on fixture clients (no network,
   no database):
     A. trusted sources accepted       B. Discovery-only is research      C. Discovery never overwrites
     D. Simple and Advanced agree       E. build types                     F. historical records (BS4, MCL)
     G. wiring (the page reads the one rule)                                                              */

import { readFileSync } from 'node:fs';
import { parseWebsiteBuild, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import { candidateFacts, decide, mergeFacts, type FactRow } from '../src/lib/buildFacts.ts';
import { templateById } from '../src/lib/websiteTemplates.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';
import type { BuildPackInput } from '../src/lib/buildPack.ts';
import { executionBlockers } from '../src/lib/buildExecution.ts';
import { computeMapping } from '../src/lib/templateMapping.ts';
import { websiteServiceRoute } from '../src/lib/websiteRoute.ts';
import {
  applyBuildType, blockers, currentWebsite, masterBuildPrompt, prepareWebsite, researchSiteNote, simpleIssues, trustedOldSite, trustedPack,
  type SimpleInput,
} from '../src/lib/simpleBuild.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }
const section = (t: string) => console.log('\n── ' + t + ' ──');

/* ── fixtures (QA clients only — example.* domains, 01632 96xxxx drama numbers) ────────────────────── */
const SITE = 'https://brookfootplumbing.example';
const GUESS = 'https://brookfoot-guess.example';
const domainReady = { domain_status: 'existing', domain_owned: 'yes', domain_third_party: 'no', domain_access: 'yes', authority_confirmed: true, dns_permission: true, materials_confirmed: true };

function client(over: { onboarding?: Record<string, unknown> | null; lead?: Record<string, unknown>; discovery?: Record<string, unknown> | null; baseline?: Record<string, unknown> | null } = {}): RebuildContextPayload {
  return {
    lead: { id: '1e000000-0000-0000-0000-00000000b0a1', business_name: 'Brookfoot Plumbing & Heating', phone: '01632 960482', email: 'dean@brookfootplumbing.example', category: 'Plumber', website: SITE,
      services_included: ['Gas boiler servicing'], website_build: {}, ...over.lead },
    onboarding: over.onboarding === null ? null : { business_name: 'Brookfoot Plumbing & Heating', confirmed_location: 'Brighouse', confirmed_phone: '01632 960482', contact_email: 'dean@brookfootplumbing.example',
      services_list: ['Gas boiler servicing', 'Boiler repairs and breakdowns'], areas_list: ['Brighouse', 'Rastrick', 'Elland'], plan_tier: 'new_site', website_addon: true,
      business_website: SITE, ...domainReady, ...over.onboarding },
    baseline_audit: over.baseline ?? null, baseline_audit_id: null, baseline_completed_at: null, report: null,
    discovery_audit: over.discovery === undefined ? { business_name: 'Brookfoot Plumbing', location_text: 'Brighouse', website: GUESS } : over.discovery,
    crawl: null, pages: [],
  } as unknown as RebuildContextPayload;
}
/** A client whose ONLY website on record is the one a Discovery scan offered. */
const discoveryOnly = () => client({ onboarding: { business_website: '' }, lead: { website: '' } });

/** The ADVANCED page's derivation, exactly as src/pages/WebsiteBuild.tsx now writes it. */
function advancedPack(payload: RebuildContextPayload, state: WebsiteBuildState): BuildPackInput {
  const template = state.route === 'template_rebuild' ? templateById(state.template_id) : null;
  const rows = mergeFacts(candidateFacts(payload as never, state.canonical_domain), state.facts, template);
  const evidence = toRebuildPromptInput(payload);
  const websiteRow = rows.find((r) => r.key === 'website');
  const existingSiteUrl = currentWebsite(state.source_site_url, websiteRow).url;
  const route = websiteServiceRoute(payload.onboarding as never, payload.lead as never);
  const ob = (payload.onboarding ?? {}) as Record<string, unknown>;
  return {
    state, template, facts: rows, evidence, businessName: 'Brookfoot Plumbing & Heating', existingSiteUrl, mustNotSay: '',
    serviceRoute: route.route, routeSource: route.source, domain: null,
    clientTruth: { onboardingList: ob.services_list, onboardingText: ob.services, notOffered: ob.services_not_offered, leadServices: (payload.lead as Record<string, unknown>).services_included },
  };
}
/** The OLD Advanced derivation (before this fix) — kept only to prove the inconsistency existed. */
function oldAdvancedUrl(payload: RebuildContextPayload, state: WebsiteBuildState): string {
  const rows = mergeFacts(candidateFacts(payload as never, state.canonical_domain), state.facts, null);
  const w = rows.find((r) => r.key === 'website');
  return state.source_site_url || (w && w.status !== 'rejected' && w.status !== 'not_applicable' ? w.value : '');
}
const websiteRowOf = (payload: RebuildContextPayload, state: WebsiteBuildState) => advancedPack(payload, state).facts.find((r) => r.key === 'website');
const simpleIn = (payload: RebuildContextPayload, state: WebsiteBuildState): SimpleInput => ({ pack: advancedPack(payload, state), onboarding: payload.onboarding, leadId: 'x', oldUrls: [], domain: null, ended: false });
const blank = () => parseWebsiteBuild({});
const visual = (p: RebuildContextPayload) => applyBuildType(blank(), 'visual_rebuild', p.onboarding);
const execBlocks = (p: RebuildContextPayload, s: WebsiteBuildState) => { const pk = advancedPack(p, s); return executionBlockers(pk, computeMapping(s, pk.template, pk.facts, pk.businessName)); };

/* ══ A. TRUSTED SOURCES ═════════════════════════════════════════════════════════════════════════════ */
section('A. a trusted current website is accepted');
{
  const P = client();
  const PC = client({ discovery: null });
  const cw = currentWebsite('', websiteRowOf(PC, blank()));
  ok(cw.url === SITE && cw.basis === 'confirmed_fact', 'client-confirmed URL (their onboarding answer, nothing disagreeing) is accepted as confirmed: ' + cw.basis);
  const cw2 = currentWebsite('', websiteRowOf(P, blank()));
  ok(cw2.url === SITE && cw2.basis === 'client_record', 'client-confirmed URL with a Discovery scan disagreeing is still accepted (the lower source loses): ' + cw2.basis);
  ok(advancedPack(P, blank()).existingSiteUrl === SITE, 'Advanced uses it as the source site');

  const PR = client({ onboarding: { business_website: '' } });
  const rec = currentWebsite('', websiteRowOf(PR, blank()));
  ok(rec.url === SITE && rec.basis === 'client_record', 'verified current-site record (the paid lead row) is accepted, even with a Discovery scan disagreeing: ' + rec.basis);

  const recorded = { ...blank(), source_site_url: SITE };
  const r2 = currentWebsite(recorded.source_site_url, websiteRowOf(discoveryOnly(), recorded));
  ok(r2.url === SITE && r2.basis === 'recorded_source', 'a source URL recorded on the build (Paul typed it / Prepare wrote it) is accepted');

  const crawlRow: FactRow = { key: 'website', label: 'Current website', value: SITE, status: 'detected', source: "client's current website (stored crawl)", note: '', decided: false, required: false, source_url: '', notes: '', basis: '' };
  const cr = currentWebsite('', crawlRow);
  ok(cr.url === SITE && cr.basis === 'client_record', 'a trusted crawl of the client’s own site is accepted');

  const D = discoveryOnly();
  const row = websiteRowOf(D, blank())!;
  const approved = { ...blank(), facts: [decide(row, 'verified')] };
  ok(currentWebsite('', websiteRowOf(D, approved)).url === GUESS && advancedPack(D, approved).existingSiteUrl === GUESS, 'a Discovery URL Paul has APPROVED is the client’s site (a human confirmed it)');
}

/* ══ B. DISCOVERY-ONLY ══════════════════════════════════════════════════════════════════════════════ */
section('B. a Discovery-only URL is research, never authoritative');
{
  const D = discoveryOnly();
  const row = websiteRowOf(D, blank());
  ok(row?.value === GUESS && /Discovery scan/.test(row.source) && row.status === 'detected', 'fixture: the only website on record came from the Discovery scan (' + row?.source + ')');
  ok(oldAdvancedUrl(D, blank()) === GUESS, 'the inconsistency existed: the OLD Advanced derivation took the Discovery guess as the source site');
  const cw = currentWebsite('', row);
  ok(cw.url === '' && cw.basis === '', 'currentWebsite: not trusted');
  ok(advancedPack(D, blank()).existingSiteUrl === '', 'Advanced: no source site from a Discovery-only URL');
  ok(cw.research === GUESS && !cw.contested, 'it is kept as research (shown, not used)');
  const note = researchSiteNote(cw);
  ok(/^Research only: /.test(note) && note.includes(GUESS) && note.includes('Discovery scan') && /not confirmed as the client’s current website/.test(note), 'the research wording names the URL, where it came from, and that it is not confirmed: ' + note);
  const B = client({ onboarding: { business_website: '' }, lead: { website: '' }, discovery: null, baseline: { website: GUESS } });
  const b = currentWebsite('', websiteRowOf(B, blank()));
  ok(b.url === '' && b.research === GUESS && /baseline/.test(b.researchSource), 'a baseline-context-only URL is research too (' + b.researchSource + ')');
  const rejected = { ...blank(), facts: [decide(row!, 'rejected')] };
  ok(currentWebsite('', websiteRowOf(D, rejected)).research === '' && !researchSiteNote(currentWebsite('', websiteRowOf(D, rejected))), 'a URL Paul rejected is neither trusted nor shown as research');
  const none = client({ onboarding: { business_website: '' }, lead: { website: '' }, discovery: null });
  const n = currentWebsite('', websiteRowOf(none, blank()));
  ok(n.url === '' && n.research === '' && researchSiteNote(n) === '', 'no website anywhere: nothing trusted, no research line');
}

/* ══ C. DISCOVERY NEVER OVERWRITES ═══════════════════════════════════════════════════════════════════ */
section('C. a Discovery URL cannot overwrite a confirmed one');
{
  const P = client();
  ok(advancedPack(P, blank()).existingSiteUrl === SITE && websiteRowOf(P, blank())?.value === SITE, 'client onboarding beats the Discovery scan (' + GUESS + ' loses)');
  const typed = { ...blank(), source_site_url: SITE };
  ok(currentWebsite(SITE, websiteRowOf(discoveryOnly(), typed)).url === SITE, 'a recorded source URL beats a Discovery-only fact');
  const PR = client({ onboarding: { business_website: '' } });
  ok(advancedPack(PR, blank()).existingSiteUrl === SITE, 'the paid lead row beats the Discovery scan');
  const prep = prepareWebsite({ pack: advancedPack(P, visual(P)), onboarding: P.onboarding, active: true }).state;
  ok(prep.source_site_url === SITE && prep.canonical_domain === 'brookfootplumbing.example', 'Prepare records the CONFIRMED site and its domain, never the Discovery one');
  const prepD = prepareWebsite({ pack: advancedPack(discoveryOnly(), visual(discoveryOnly())), onboarding: discoveryOnly().onboarding, active: true }).state;
  ok(!prepD.source_site_url && !prepD.canonical_domain, 'Prepare on a Discovery-only client writes no source site and no web address from the guess');
}

/* ══ D. SIMPLE AND ADVANCED AGREE ════════════════════════════════════════════════════════════════════ */
section('D. Simple and Advanced use the same truth decision');
{
  const cases: Array<[string, RebuildContextPayload, WebsiteBuildState]> = [
    ['client-confirmed', client(), blank()],
    ['lead record only', client({ onboarding: { business_website: '' } }), blank()],
    ['Discovery only', discoveryOnly(), blank()],
    ['baseline only', client({ onboarding: { business_website: '' }, lead: { website: '' }, discovery: null, baseline: { website: GUESS } }), blank()],
    ['nothing', client({ onboarding: { business_website: '' }, lead: { website: '' }, discovery: null }), blank()],
    ['recorded source', discoveryOnly(), { ...blank(), source_site_url: SITE }],
    ['operator-entered onboarding', client({ onboarding: { client_source: 'manual' } }), blank()],
    ['no onboarding at all', client({ onboarding: null }), blank()],
  ];
  for (const [name, p, s] of cases) {
    const adv = advancedPack(p, s);
    ok(adv.existingSiteUrl === trustedOldSite(adv) && trustedPack(adv) === adv, name + ': Advanced’s source site = the simple flow’s trusted site (' + (adv.existingSiteUrl || 'none') + ')');
  }
  ok(trustedPack({ ...advancedPack(discoveryOnly(), blank()), existingSiteUrl: GUESS }).existingSiteUrl === '', 'the simple flow still corrects a broader URL handed to it (defence in depth)');
}

/* ══ E. BUILD TYPES ═════════════════════════════════════════════════════════════════════════════════ */
section('E. build types: rebuilds need a trusted site, a template does not, Optimise unchanged');
{
  const D = discoveryOnly();
  const sv = visual(D);
  const iss = simpleIssues(simpleIn(D, sv));
  const noOld = iss.find((x) => x.id === 'no-old-site');
  ok(!!noOld && noOld.level === 'blocker', 'Simple: a Visual rebuild with only a Discovery URL is blocked (no trusted current site)');
  ok(!!noOld && noOld.detail.includes('Research only: ' + GUESS), 'Simple: the blocker shows the Discovery URL as research, in the same words as Advanced');
  ok(execBlocks(D, sv).includes('Source website URL'), 'Advanced: the build execution blocker asks for a source website (it used to take the Discovery guess)');
  ok(!execBlocks(client(), visual(client())).includes('Source website URL'), 'Advanced: a client-confirmed site satisfies the same blocker');
  const close = applyBuildType(blank(), 'close_recreation', { ...D.onboarding, site_rights: 'yes' });
  ok(simpleIssues(simpleIn(D, close)).some((x) => x.id === 'no-old-site'), 'a close recreation also needs a trusted current site');
  const tmpl = applyBuildType(blank(), 'template', D.onboarding);
  const ti = simpleIssues(simpleIn(D, tmpl));
  ok(!ti.some((x) => x.id === 'no-old-site'), 'a new Findable-template build does not require an old website');
  ok(!execBlocks(D, tmpl).includes('Source website URL'), 'Advanced: a template build has no source-website blocker');
  const noSite = client({ onboarding: { business_website: '' }, lead: { website: '' }, discovery: null });
  ok(!simpleIssues(simpleIn(noSite, applyBuildType(blank(), 'template', noSite.onboarding))).some((x) => x.id === 'no-old-site'), 'a client with no website at all can still have a template build');
  const O = client({ onboarding: { plan_tier: null, website_addon: null, website_route: 'optimise_existing' } });
  const oi = simpleIssues(simpleIn(O, visual(O)));
  const route = advancedPack(O, visual(O)).serviceRoute;
  if (route === 'optimise') {
    ok(oi.length === 1 && oi[0].id === 'optimise-client' && blockers(oi).length === 1, 'Optimise: one blocker, the Optimise refusal, nothing about websites');
    ok(masterBuildPrompt(simpleIn(O, visual(O))).blockedBy.length > 0, 'Optimise: no Master Build Prompt');
    ok(advancedPack(O, blank()).existingSiteUrl === SITE, 'Optimise: their own (confirmed) site is still their current website');
  } else ok(false, 'fixture: a keep-site client should read as Optimise (got ' + route + ')');
}

/* ══ F. HISTORICAL RECORDS ═══════════════════════════════════════════════════════════════════════════ */
section('F. historical Website Build records load and keep their site (shapes of the 2 live records)');
{
  /* BS4 (live, 2026-10-05): bespoke route, no source_site_url, a VERIFIED Current website fact. */
  const BS4_SITE = 'https://bs4electrical.example/';
  const bs4 = parseWebsiteBuild({ version: 2, route: 'bespoke', repo_name: 'BS4ElectricalServices', canonical_domain: 'bs4electrical.example',
    facts: [{ key: 'website', label: 'Current website', value: BS4_SITE, status: 'verified', source: 'client onboarding', source_url: '', notes: '', basis: 'client' }] });
  const PB = client({ onboarding: { business_website: BS4_SITE }, lead: { website: BS4_SITE } });
  ok(bs4.route === 'bespoke' && bs4.facts.length === 1, 'BS4-shaped record parses unchanged');
  ok(advancedPack(PB, bs4).existingSiteUrl === BS4_SITE && currentWebsite('', websiteRowOf(PB, bs4)).basis === 'confirmed_fact', 'BS4: its verified website is still the source site');
  ok(oldAdvancedUrl(PB, bs4) === advancedPack(PB, bs4).existingSiteUrl, 'BS4: same answer before and after the fix');
  ok(parseWebsiteBuild(JSON.parse(JSON.stringify(bs4))).facts[0].value === BS4_SITE, 'BS4: the stored URL is untouched (nothing rewritten)');
  /* MCLocksmiths (live): no route, nothing stored, onboarding + lead row both hold the site. */
  const MCL = 'https://mclocks.example/';
  const PM = client({ onboarding: { business_website: MCL }, lead: { website: MCL } });
  ok(advancedPack(PM, blank()).existingSiteUrl === MCL && oldAdvancedUrl(PM, blank()) === MCL, 'MCL-shaped: the client’s site is trusted, same answer before and after');
  const empty = parseWebsiteBuild(null);
  ok(currentWebsite(empty.source_site_url, undefined).url === '', 'an empty / missing record loads with no source site and no crash');
}

/* ══ G. WIRING ══════════════════════════════════════════════════════════════════════════════════════ */
section('G. the Advanced page reads the one rule');
{
  const page = readFileSync('src/pages/WebsiteBuild.tsx', 'utf8');
  ok(page.includes('currentWebsite(state?.source_site_url, websiteRow).url'), 'WebsiteBuild.tsx derives the source site with currentWebsite');
  ok(!/source_site_url \|\| factSiteUrl/.test(page), 'the old "typed URL || any non-rejected fact" derivation is gone');
  ok(!/websiteRow\.status !== 'rejected'/.test(page), 'no second copy of the website rule on the page');
  ok((page.match(/researchNote && </g) ?? []).length >= 2 && page.includes('{researchNote ?'), 'Advanced shows the research line in Project details, Source website and the rebuild warning');
  ok(page.includes('No confirmed current website'), 'Advanced says "No confirmed current website" when none is trusted');
  for (const needle of ['Existing site URL', 'Existing website URL', 'Open source website', 'Copy Recon Prompt', 'Import Recon Result', 'Back to the simple view'])
    ok(page.includes(needle), 'existing control kept: ' + needle);
  const lib = readFileSync('src/lib/simpleBuild.ts', 'utf8');
  ok((lib.match(/isPublishable\(row\)/g) ?? []).length === 1 && /export function trustedOldSite[\s\S]{0,200}currentWebsite\(/.test(lib), 'trustedOldSite is a thin wrapper over currentWebsite (one rule, not two)');
}

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'ALL PASSED'));
if (failures) process.exit(1);
