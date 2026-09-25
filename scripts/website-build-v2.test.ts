/* ============================================================
   WEBSITE BUILD V2 — versioned data, build routes, route-aware stages, stage prompts.

   V1 RECORDS     a V1 row (no version) opens: its build_mode becomes the route, its deploy_status
                  becomes the preview / production status, nothing else is lost.
   ROUTE          saved and reloaded; never inferred on a V2 row; the Template card's
                  "recommended" label is advice only.
   STAGES         the checklists change per route; tick keys are an allowlist.
   TEMPLATE       the MCL template still loads, now with version, sections, images and forbidden
                  seed values that belong to IT, not to the code.
   PROMPTS        eight stage prompts, route-aware, only the context their stage needs, and never a
                  NEEDS APPROVAL value presented as confirmed.
   MANIFEST / VISUAL / PROMOTION  the V2 shapes survive the save rule.

   Run: npx tsx scripts/website-build-v2.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import {
  compareFamilies, normaliseWebsiteBuild, parseCompareReply, parseManifest, parseWebsiteBuild, websiteBuildStages,
  DEFAULT_COMPARE_WIDTHS, MAX_MANIFEST_PAGES, WEBSITE_BUILD_VERSION, type WebsiteBuildState,
} from '../src/lib/websiteBuildState.ts';
import { ALL_ROUTE_CHECK_IDS, checkId, routeChecks, templateSuitsTrade } from '../src/lib/buildRoutes.ts';
import { findForbiddenSeedValues, MCL_TEMPLATE, templateById, templatePageTypes, WEBSITE_TEMPLATES } from '../src/lib/websiteTemplates.ts';
import { annotate, candidateFacts, decide, mergeFacts, type FactsContext } from '../src/lib/buildFacts.ts';
import { buildPack, masterPrompt } from '../src/lib/buildPack.ts';
import { stagePrompts, STAGE_PROMPT_IDS } from '../src/lib/stagePrompts.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

/* The same plumber the V1 suite uses: onboarding services VERIFIED, the lead-row phone DETECTED. */
const ctx = (): RebuildContextPayload => ({
  lead: { id: 'lead-sc', business_name: 'SC Plumbing & Gas Ltd', website: 'https://www.scplumbing.co.uk/', phone: '07852 130513', email: 'scgasplumbing@gmail.com', address: '7 Lowdham, Tamworth', derived_town: 'Tamworth', category: 'Plumber', website_build: {} },
  onboarding: {
    business_name: 'SC Plumbing & Gas Ltd', confirmed_location: 'Tamworth',
    services_list: ['Boiler repair', 'Boiler servicing', 'Emergency plumbing'], areas_list: ['Tamworth', 'Lichfield'],
    contact_name: 'Steve', contact_email: 'scgasplumbing@gmail.com', accreditations: 'Gas Safe registered', must_not_say: 'Do not say 24/7',
  },
  baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null, discovery_audit: null,
  crawl: null, pages: [],
} as unknown as RebuildContextPayload);

const BASE = {
  cloudflare_mode: 'direct_upload',
  version: 2, template_id: 'mcl-local-trades', repo_name: 'SCPlumbingGas', github_owner: 'Beyondweb2',
  local_repo_path: 'C:\\Users\\paulj\\SCPlumbingGas', canonical_domain: 'scplumbing.co.uk',
  pages: [
    { id: 'a', family: 'homepage', path: '/', title: 'Home', action: 'keep', old_url: 'https://www.scplumbing.co.uk/' },
    { id: 'b', family: 'service', path: '/services/boiler-repair/', title: 'Boiler repair', action: 'create' },
  ],
};

function inputs(build: Record<string, unknown>, c = ctx(), siteOverride?: string) {
  const state = parseWebsiteBuild(build);
  const template = state.route === 'template_rebuild' ? templateById(state.template_id) : null;
  const facts = mergeFacts(candidateFacts(c as unknown as FactsContext, state.canonical_domain), state.facts, template);
  const evidence = toRebuildPromptInput(c);
  const existingSiteUrl = siteOverride ?? (state.source_site_url || (evidence.facts.website.value ?? ''));
  return { state, template, facts, evidence, businessName: 'SC Plumbing & Gas Ltd', existingSiteUrl, mustNotSay: evidence.facts.mustNotSay.value ?? '', generatedAt: '2026-09-25T00:00:00Z' };
}
const prompts = (build: Record<string, unknown>, c = ctx(), site?: string) => stagePrompts(inputs(build, c, site));
const P = (build: Record<string, unknown>, id: string, site?: string) => prompts(build, ctx(), site).find((p) => p.id === id)!;

console.log('\n── V1 RECORDS STILL OPEN ──');
{
  const v1 = {
    build_mode: 'template', template_id: 'mcl-local-trades', repo_name: 'X', deploy_status: 'production', notes: 'n',
    capture: { status: 'captured', url_count: 12, asset_count: 4, notes: 'c' },
    facts: [{ key: 'phone', label: 'Phone number', value: '07852 130513', status: 'verified', source: 'Paul' }],
    pages: [{ id: 'a', family: 'homepage', path: '/', title: 'Home', action: 'keep' }],
    redirects: [{ from: '/old', to: '/', reason: 'r' }], qa: { visual_qa: true },
  };
  const s = parseWebsiteBuild(v1);
  ok(s.version === 2, 'a V1 row reads as a V2 state');
  ok(s.route === 'template_rebuild' && s.template_id === 'mcl-local-trades', 'V1 build_mode template → route Template rebuild, template kept');
  ok(s.preview_status === 'deployed' && s.production_status === 'deployed', 'V1 deploy_status production → preview and production both deployed');
  ok(parseWebsiteBuild({ deploy_status: 'preview' }).preview_status === 'deployed' && parseWebsiteBuild({ deploy_status: 'preview' }).production_status === 'not_live', 'V1 deploy_status preview → preview deployed only');
  ok(s.facts.length === 1 && s.facts[0].status === 'verified' && s.facts[0].source_url === '' && s.facts[0].notes === '', 'V1 facts keep their decision and gain empty source URL / notes');
  ok(s.pages.length === 1 && s.redirects.length === 1 && s.qa.visual_qa === true && s.capture.url_count === 12 && s.notes === 'n', 'pages, redirects, QA ticks, capture and notes survive');
  const r = parseWebsiteBuild({ build_mode: 'rebuild', rebuild_style: 'modernised', copy_ownership: 'client_wrote' });
  ok(r.route === 'faithful_rebuild' && r.rebuild_style === 'modernised' && r.copy_ownership === 'client_wrote', 'V1 build_mode rebuild → Faithful rebuild with its style and ownership');
  ok(parseWebsiteBuild({ repo_url: 'x' }).route === '', 'a V1 row with no build_mode gets NO route — absent stays absent');
  ok(parseWebsiteBuild({}).route === '' && parseWebsiteBuild(null).version === 2, 'the column default {} reads as an empty V2 state');
  const n = normaliseWebsiteBuild(v1);
  ok(n.version === 2 && n.route === 'template_rebuild' && !('build_mode' in n) && !('deploy_status' in n), 'the next save writes V2 and drops the V1-only keys');
  ok(JSON.stringify(parseWebsiteBuild(n).pages) === JSON.stringify(s.pages), 'and nothing is lost across that save');
}

console.log('\n── BUILD ROUTE — saved, reloaded, never inferred ──');
{
  for (const route of ['faithful_rebuild', 'template_rebuild', 'bespoke']) {
    const saved = normaliseWebsiteBuild({ ...parseWebsiteBuild({}), route });
    ok(parseWebsiteBuild(saved).route === route, `route ${route} survives save → reload`);
  }
  ok(parseWebsiteBuild({ version: 2, build_mode: 'template' }).route === '', 'on a V2 row a stray build_mode is NOT turned into a route');
  ok(parseWebsiteBuild({ version: 2, route: 'bespoke', template_id: 'mcl-local-trades' }).route === 'bespoke', 'a saved route is never changed by other data (a template id on a bespoke build)');
  /* F1 (BS4 pilot): "recommended" reads the template's primary / supported TRADES only — the
     descriptive "could be adapted for" list (plumbers, electricians…) never recommends. */
  ok(templateSuitsTrade('Locksmiths', [MCL_TEMPLATE.primaryTrade, ...MCL_TEMPLATE.supportedTrades]), 'the MCL template is recommended to a locksmith');
  ok(!templateSuitsTrade('Plumber', [MCL_TEMPLATE.primaryTrade, ...MCL_TEMPLATE.supportedTrades]), 'but NOT to a plumber — the adapted-for list is not a recommendation');
  ok(!templateSuitsTrade('Shoe repairs & key cutting', [MCL_TEMPLATE.primaryTrade, ...MCL_TEMPLATE.supportedTrades]), 'nor a shoe repairer → Bespoke is suggested instead');
  ok(!templateSuitsTrade('', MCL_TEMPLATE.supportedBusinessTypes), 'an unknown trade recommends nothing');
  const page = readFileSync(new URL('../src/pages/WebsiteBuild.tsx', import.meta.url), 'utf8');
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/const choose = \(r: BuildRoute\) => update\(\(s\) => \(\{ \.\.\.s, route: r,/.test(code) && (code.match(/route: /g) ?? []).length === 1, 'the page sets route in exactly one place — the operator\u2019s click');
  ok(/Recommended/.test(code) && /name="route"/.test(code), 'the route selector is on the page with its recommended label');
}

console.log('\n── STAGES CHANGE WITH THE ROUTE ──');
{
  const cap = (r: 'faithful_rebuild' | 'template_rebuild' | 'bespoke') => routeChecks(r, 'capture').map((c) => c.label).join(' | ');
  ok(/screenshots/i.test(cap('faithful_rebuild')) && /Fonts/.test(cap('faithful_rebuild')) && /Sticky/.test(cap('faithful_rebuild')) && /Schema/.test(cap('faithful_rebuild')), 'faithful capture asks for screenshots, fonts, sticky elements, schema');
  ok(/Genuine services/.test(cap('template_rebuild')) && /Legal/.test(cap('template_rebuild')) && !/Fonts/.test(cap('template_rebuild')), 'template capture asks for facts, services, legal — not fonts');
  ok(/discovery/i.test(cap('bespoke')), 'bespoke capture is business discovery');
  ok(/preserved/.test(routeChecks('faithful_rebuild', 'architecture').map((c) => c.label).join()), 'faithful architecture preserves the existing IA');
  ok(/Location strategy/.test(routeChecks('bespoke', 'architecture').map((c) => c.label).join()), 'bespoke architecture has a location strategy');
  ok(routeChecks('', 'capture').length === 0, 'no route → no checklist');
  ok(new Set(ALL_ROUTE_CHECK_IDS).size === ALL_ROUTE_CHECK_IDS.length, 'every stored check id is unique');
  const id = checkId('faithful_rebuild', 'capture', 'fonts');
  const s = parseWebsiteBuild({ version: 2, checks: { [id]: true, 'faithful_rebuild.capture.rogue': true, [checkId('bespoke', 'capture', 'discovery')]: 'yes' } });
  ok(s.checks[id] === true && Object.keys(s.checks).length === 1, 'only known check ids, ticked with true, survive the save rule');
  const st = (route: string, site: boolean) => websiteBuildStages({ state: parseWebsiteBuild({ version: 2, route }), hasExistingSite: site, factsAwaiting: 0, architectureErrors: 0, setupMissing: [] }).find((x) => x.stage === 'capture')!;
  ok(st('faithful_rebuild', true).applicable && st('bespoke', false).applicable && !st('template_rebuild', false).applicable, 'capture applies: faithful always, bespoke always (discovery), template only with an old site');
  ok(websiteBuildStages({ state: parseWebsiteBuild({ version: 2, route: 'bespoke' }), hasExistingSite: false, factsAwaiting: 0, architectureErrors: 0, setupMissing: [] })[0].done, 'bespoke intake completes without a template or a style');
}

console.log('\n── THE MCL TEMPLATE STILL LOADS ──');
{
  ok(WEBSITE_TEMPLATES.length === 1 && templateById('mcl-local-trades') === MCL_TEMPLATE, 'the registry still holds exactly the MCL template, found by id');
  ok(MCL_TEMPLATE.version === '1.0' && MCL_TEMPLATE.trade === 'Locksmith', 'it carries a version and a trade');
  ok(templatePageTypes(MCL_TEMPLATE).includes('service') && MCL_TEMPLATE.optionalSections.length > 0 && MCL_TEMPLATE.imageRequirements.some((x) => x.id === 'logo' && x.required), 'page types, optional sections and image requirements');
  const old = ['Morgan', 'MC Locksmiths', 'MCLocksmiths', 'mc-locksmiths', 'Canterbury', 'Kent', 'Whitstable', 'Herne Bay', '07395', '07848', '447395351094', '447848426374', 'morganbusiness1', 'Walden Court', 'CT2 7JQ', 'DBS', 'NCFE', 'City & Guilds', 'Hiscox', 'Public Liability', 'APECS', 'Checkatrade', 'MyBuilder', 'MyJobQuote', 'MPL', 'Yale', 'Chubb', 'Mul-T-Lock', 'locksmith', '24/7', '15-30 minutes', '£65', '£75'];
  ok(JSON.stringify(MCL_TEMPLATE.leftoverNeedles) === JSON.stringify(old), 'the leftover list is DERIVED from the forbidden seed values and equals the V1 list exactly');
  ok(MCL_TEMPLATE.forbiddenSeedValues.every((v) => v.kind && v.value), 'every seed value has a kind');
  const hits = findForbiddenSeedValues('Call Morgan on 07395 351 094 in Canterbury', MCL_TEMPLATE);
  ok(hits.map((h) => h.kind).join(',') === 'owner,town,phone', 'a generated page with seed values is caught, with what kind each is');
  ok(findForbiddenSeedValues('Gas Safe registered in Tamworth', MCL_TEMPLATE).length === 0, 'a clean page is clean');
  ok(findForbiddenSeedValues('We are Checkatrade members', MCL_TEMPLATE, ['Checkatrade']).length === 0, 'a seed value the new client has VERIFIED is allowed');
  const src = readFileSync(new URL('../src/lib/stagePrompts.ts', import.meta.url), 'utf8') + readFileSync(new URL('../src/lib/buildPack.ts', import.meta.url), 'utf8');
  ok(!/Morgan|Canterbury|07395|morganbusiness1/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'no MCL value is hard-coded in the prompt code — they belong to the template definition');
}

console.log('\n── FACT LEDGER ──');
{
  const s = parseWebsiteBuild({ version: 2, facts: [{ key: 'phone', label: 'Phone', value: '07852', status: 'verified', source: 'Paul', source_url: 'https://x.co.uk/contact', notes: 'confirmed on call' }] });
  ok(s.facts[0].source_url === 'https://x.co.uk/contact' && s.facts[0].notes === 'confirmed on call', 'a fact records its source URL / context and notes');
  const rows = mergeFacts(candidateFacts(ctx() as unknown as FactsContext), s.facts, null);
  const phone = rows.find((r) => r.key === 'phone')!;
  ok(phone.source_url === 'https://x.co.uk/contact' && phone.notes === 'confirmed on call', 'and they reach the ledger row');
  ok(decide(phone, 'rejected').notes === 'confirmed on call', 'deciding a fact keeps its notes');
  const missing = rows.find((r) => r.status === 'missing')!;
  const a = annotate(missing, { notes: 'ask the client' });
  ok(a.status === 'detected' && a.value === '' && a.notes === 'ask the client', 'annotating a MISSING fact stores a note without approving anything');
  ok(mergeFacts([], [a], null).find((r) => r.key === a.key)!.status === 'missing', 'and it still reads as missing');
}

console.log('\n── STAGE PROMPTS ──');
{
  const T = { ...BASE, route: 'template_rebuild' }, F = { ...BASE, route: 'faithful_rebuild', rebuild_style: 'replica', copy_ownership: 'unknown' }, B = { ...BASE, route: 'bespoke', design_references: 'findable.live typography' };
  const all = prompts(T);
  ok(all.map((p) => p.id).join(',') === STAGE_PROMPT_IDS.join(',') && all.length === 10, 'ten stage prompts (Phase 3 Asset Download, Phase 4 Build Execution), in stage order');
  ok(all.map((p) => p.label).join('|') === 'Copy Recon Prompt|Copy Capture Prompt|Copy Architecture Prompt|Copy Asset Download Prompt|Copy Build Prompt|Copy Build Execution Prompt|Copy Preview Deployment Prompt|Copy Visual Comparison Prompt|Copy QA Prompt|Copy Production Deployment Prompt', 'with the ten button labels');
  for (const [name, b] of [['faithful', F], ['template', T], ['bespoke', B]] as const) ok(prompts(b).every((p) => p.text.includes('Build route: ')), `every ${name} prompt states its route`);

  ok(/PRESERVE the existing information architecture/.test(P(F, 'architecture').text), 'architecture — faithful preserves the IA');
  ok(/map the verified facts onto the template/.test(P(T, 'architecture').text) && P(T, 'architecture').text.includes('/services/<service-slug>/'), 'architecture — template maps into the template page families');
  ok(/design a NEW architecture/.test(P(B, 'architecture').text) && /findable\.live typography/.test(P(B, 'architecture').text), 'architecture — bespoke designs new, with its references');
  ok(/design\.md/.test(P(F, 'capture').text) && /interactions\.md/.test(P(F, 'capture').text), 'capture — faithful captures design and interactions');
  ok(!/design\.md/.test(P(T, 'capture').text), 'capture — template skips the design capture');
  ok(P(F, 'capture').text.includes('capture/recon.json') && P(T, 'capture').text.includes('"reconVersion": 1'), 'capture — writes the recon result (Phase 2: one import format), in the shape Import Recon Result reads');
  const disc = P(B, 'capture', '');
  ok(/BUSINESS DISCOVERY/.test(disc.text) && /QUESTIONS FOR THE CLIENT/.test(disc.text) && disc.blockedBy.every((b) => !/website URL/.test(b)), 'capture — bespoke with no site is discovery, not blocked on a website');
  ok(/Crawl the ENTIRE site/.test(P(F, 'recon').text) && /NOT AUTOMATICALLY THE TARGET DESIGN/.test(P(T, 'recon').text) && /BESPOKE \/ NEW TRADE \(existing site\)/.test(P(B, 'recon').text), 'recon — asks different things per route (Phase 2 detail in website-build-recon.test.ts)');

  const vc = P({ ...F, preview_url: 'https://preview.sc.pages.dev' }, 'visual_compare');
  ok(/SOURCE: https:\/\/www\.scplumbing\.co\.uk\//.test(vc.text) && /PREVIEW: https:\/\/preview\.sc\.pages\.dev/.test(vc.text), 'visual comparison — faithful: source vs preview');
  ok(vc.text.includes('Widths: 1440, 1024, 768, 390 px') && /- homepage/.test(vc.text) && /- service/.test(vc.text), 'at the four default widths, per page family');
  ok(P(F, 'visual_compare').blockedBy.includes('Preview URL'), 'blocked (with a marker) until there is a preview');
  ok(/leftover|seed-client|MC Locksmiths|Morgan/.test(P({ ...T, preview_url: 'https://p.pages.dev' }, 'visual_compare').text), 'visual check — template looks for seed-client content');

  const pd = P({ ...T, cloudflare_project: 'sc-plumbing-gas' }, 'preview_deploy');
  ok(/Localhost .* is for development/.test(pd.text) && /stable review/.test(pd.text), 'preview deployment — says what localhost and the Cloudflare preview are each for');
  ok(pd.text.includes('--project-name sc-plumbing-gas --branch preview') && /Never deploy to the production branch \(main\)/.test(pd.text) && /noindex/.test(pd.text), 'deploys the preview branch only and checks noindex');
  ok(P(T, 'preview_deploy').blockedBy.some((b) => /Cloudflare project/.test(b)), 'no project → blocked, never invented');
  const prodNo = P(T, 'production_deploy');
  ok(prodNo.blockedBy.length > 0 && !/wrangler/.test(prodNo.text), 'production deployment is REFUSED until project, preview and domain are recorded');
  const prod = P({ ...T, cloudflare_project: 'sc-plumbing-gas', preview_url: 'https://preview.sc-plumbing-gas.pages.dev' }, 'production_deploy');
  ok(prod.blockedBy.length === 0 && /ask Paul in chat/.test(prod.text) && prod.text.includes('--branch main') && /www\.scplumbing\.co\.uk/.test(prod.text), 'then: asks Paul first, deploys main, connects the domain and www');
  ok(/SEED-CLIENT CHECK/.test(P(T, 'qa').text) && !/SEED-CLIENT CHECK/.test(P(F, 'qa').text), 'QA — the seed-client check is on the template route only');

  const lean = P(T, 'build').text, master = masterPrompt(inputs(T)).text;
  ok(lean.length < master.length && !/wrangler pages deploy/.test(lean) && /Do not deploy/.test(lean), 'the Build prompt is the lean brief: no deployment, shorter than the V1 master');
  ok(/ARCHITECTURE[\s\S]*Verified services: Boiler repair/.test(P(T, 'architecture').text), 'architecture carries only the verified services it needs');
  ok(P(T, 'qa').text.length < master.length && P(T, 'recon').text.length < master.length && !/## D\. VERIFIED BUSINESS FACTS|## K\. SEO/.test(P(T, 'recon').text), 'QA and Recon do not repeat the whole build handover');

  /* ⛔ NEEDS APPROVAL is never presented as confirmed. The lead-row phone is DETECTED. */
  for (const p of prompts(T)) {
    const verifiedBlock = p.text.split(/UNVERIFIED FACTS|Detected but NOT approved|## E\./)[0];
    ok(!verifiedBlock.includes('07852'), `${p.label}: the needs-approval phone is not in any verified / context block`);
  }
  for (const id of ['recon', 'architecture', 'preview_deploy', 'visual_compare']) ok(!P(T, id).text.includes('07852'), `${id} does not carry unapproved values at all`);
  const b = P(T, 'build').text;
  ok(/Detected but NOT approved[\s\S]*07852/.test(b), 'the Build prompt names the detected phone only under NOT approved');
}

console.log('\n── MANIFEST, VISUAL COMPARISON, PROMOTION — the V2 shapes survive the save rule ──');
{
  const m = parseManifest({ pages: [{ url: 'https://a/', type: 'service', title: 'T', h1: 'H', purpose: 'p', screenshots: ['s.png'] }, { url: '' }, { url: 'https://b/', type: 'bogus' }],
    assets: [{ source_url: 'https://a/logo.svg', type: 'logo', approval: 'hacked' }], interactions: [{ kind: 'form', where: '/contact/' }],
    design: { fonts: 'Inter' }, seo: { schema: 'LocalBusiness' }, evil: 1 });
  ok(m.pages.length === 2 && m.pages[1].type === 'other' && m.pages[0].screenshots[0] === 's.png', 'manifest pages: empty rows dropped, unknown types fall to other');
  ok(m.assets[0].approval === 'pending', 'an unknown asset approval falls to pending, never approved');
  ok(m.interactions[0].kind === 'form' && m.design.fonts === 'Inter' && m.seo.schema === 'LocalBusiness' && !('evil' in m), 'interactions, design and SEO are kept; unknown keys vanish');
  ok(parseManifest({ pages: Array.from({ length: 900 }, (_, k) => ({ url: 'u' + k })) }).pages.length === MAX_MANIFEST_PAGES, 'manifest pages are capped');
  const round = parseWebsiteBuild(normaliseWebsiteBuild({ version: 2, manifest: m }));
  ok(round.manifest.pages.length === 2 && round.manifest.assets.length === 1, 'the manifest survives save → reload');

  ok(JSON.stringify(parseWebsiteBuild({}).visual.widths) === JSON.stringify([...DEFAULT_COMPARE_WIDTHS]) && DEFAULT_COMPARE_WIDTHS.join() === '1440,1024,768,390', 'default comparison widths are 1440, 1024, 768, 390');
  ok(parseWebsiteBuild({ visual: { widths: [5, 1280, 1280, 'x'] } }).visual.widths.join() === '1280', 'widths are cleaned and de-duplicated');
  const res = parseCompareReply('homepage: approved\n- service: differences — card spacing\nnonsense: approved\nabout nothing', []);
  ok(res.length === 2 && res[0].family === 'homepage' && res[0].status === 'approved' && res[1].notes === 'card spacing', 'the comparison reply is recorded per page family; unknown lines ignored');
  const vs = parseWebsiteBuild(normaliseWebsiteBuild({ version: 2, visual: { source_url: 'https://old/', results: res } }));
  ok(vs.visual.results.length === 2 && vs.visual.source_url === 'https://old/', 'results survive save → reload');
  ok(compareFamilies(parseWebsiteBuild(BASE)).join() === 'homepage,service', 'the families compared are those of the pages being built');

  const pr = parseWebsiteBuild(normaliseWebsiteBuild({ version: 2, route: 'bespoke', promotion: { candidate: true, proposed_name: 'Shoe Repair Template', extract: 'now' } }));
  ok(pr.promotion.candidate && pr.promotion.proposed_name === 'Shoe Repair Template' && !('extract' in pr.promotion), 'promote-to-template intent is recorded; nothing else is accepted');

  const pj = parseWebsiteBuild(normaliseWebsiteBuild({ version: 2, source_still_live: 'yes', source_platform: 'WordPress', preview_status: 'deployed', preview_noindex_confirmed: true,
    production_status: 'verified', custom_domain_status: 'active', www_redirect_status: 'working', dev_command: 'npm run dev -- --port 4400', build_output_dir: 'build', last_captured_at: '2026-09-25' }));
  ok(pj.source_still_live === 'yes' && pj.source_platform === 'WordPress' && pj.preview_noindex_confirmed && pj.production_status === 'verified' && pj.custom_domain_status === 'active' && pj.www_redirect_status === 'working' && pj.last_captured_at === '2026-09-25', 'every new project field survives save → reload');
  ok(parseWebsiteBuild({ version: 2, preview_status: 'live!!' }).preview_status === 'not_deployed' && parseWebsiteBuild({ version: 2, preview_noindex_confirmed: 'yes' }).preview_noindex_confirmed === false, 'unknown tokens and non-boolean ticks fall to the safe default');
  const cmds = buildPack(inputs({ ...BASE, route: 'faithful_rebuild', rebuild_style: 'replica', copy_ownership: 'unknown', dev_command: 'npm run dev -- --port 4400', build_output_dir: 'build', cloudflare_project: 'sc' }));
  ok(cmds.find((p) => p.id === 'local')!.text.includes('npm run dev -- --port 4400') && cmds.find((p) => p.id === 'preview')!.text.includes('pages deploy build --project-name sc'), 'the recorded dev command and output directory reach the generated commands');
}

console.log('\n── THE SERVER SAVE RULE IS STILL THE SHARED ONE ──');
{
  const hub = readFileSync(new URL('../supabase/functions/paid-client-hub/index.ts', import.meta.url), 'utf8');
  ok(/normaliseWebsiteBuild\(body\.website_build\)/.test(hub) && /\.update\(\{ website_build: patch \}\)/.test(hub), 'paid-client-hub still writes only website_build, through normaliseWebsiteBuild');
  const s: WebsiteBuildState = parseWebsiteBuild({ version: WEBSITE_BUILD_VERSION, route: 'template_rebuild' });
  ok(normaliseWebsiteBuild(s).version === 2, 'every save carries the version');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
