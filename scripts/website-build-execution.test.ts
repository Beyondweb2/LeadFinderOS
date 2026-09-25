/* ============================================================
   WEBSITE BUILD — PHASE 4: BUILD EXECUTION + CLOUDFLARE PREVIEW.

   WORDMARK    no approved logo → a text wordmark of the verified name; never blocks.
   PROMPT      refused while blocked; the seed template is read-only and can never be the
               destination; the generated config, the assets, the scrub, pages, SEO, GitHub,
               Cloudflare PREVIEW, QA, real-build URL coverage and the JSON result.
   RESULT      raw / markdown / malformed / wrong kind; URLs validated; conflicts kept unless
               accepted; failure preserves the last good build; preview-ready needs noindex,
               a clean scrub, passing checks and a pages.dev URL.
   COVERAGE    source URLs against the REAL build's routes.
   RETRY       delta only. REVIEW prompts. STATUS transitions. COMPAT and round trip.

   Run: npx tsx scripts/website-build-execution.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import { buildExecutionStatus, normaliseWebsiteBuild, parseWebsiteBuild, previewGateProblems, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import { MCL_TEMPLATE, templateById } from '../src/lib/websiteTemplates.ts';
import { candidateFacts, mergeFacts, type FactsContext } from '../src/lib/buildFacts.ts';
import { stagePrompts } from '../src/lib/stagePrompts.ts';
import { applyRecon, parseReconText, type ReconResult } from '../src/lib/recon.ts';
import { autoAssign, computeMapping, urlDecisions } from '../src/lib/templateMapping.ts';
import { redirectMatcher } from '../src/lib/buildArchitecture.ts';
import { applyBuildResult, builtCoverage, sameDomainRebuild, configVersion, executionPrompt, parseBuildResult, projectConflicts, retryPrompt, reviewPrompt, type BuildResult } from '../src/lib/buildExecution.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

const SITE = 'https://www.harbourlocks.co.uk/';
const ctx = (): RebuildContextPayload => ({
  lead: { id: 'lead-h', business_name: 'Harbour Locks Ltd', website: SITE, phone: '07700 900123', email: 'hello@harbourlocks.co.uk', address: '3 Quay St, Whitby', derived_town: 'Whitby', category: 'Locksmith', website_build: {} },
  onboarding: { business_name: 'Harbour Locks Ltd', confirmed_location: 'Whitby', services_list: ['Lock changes'], areas_list: ['Whitby'], contact_name: 'Dan', contact_email: 'hello@harbourlocks.co.uk' },
  baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null, discovery_audit: null, crawl: null, pages: [],
} as unknown as RebuildContextPayload);
const rowsFor = (s: WebsiteBuildState) => mergeFacts(candidateFacts(ctx() as unknown as FactsContext, s.canonical_domain), s.facts, s.route === 'template_rebuild' ? templateById(s.template_id) : null);

const RECON = {
  reconVersion: 1, sourceUrl: SITE, capturedAt: '2026-09-25T09:00:00Z',
  pages: [
    { url: SITE, pageType: 'home' }, { url: SITE + 'services/', pageType: 'services' },
    { url: SITE + 'emergency-locksmith/', pageType: 'service', title: 'Locked out? Emergency entry' },
    { url: SITE + 'upvc-repairs/', pageType: 'service', title: 'UPVC lock repairs' },
    { url: SITE + 'areas/scarborough/', pageType: 'location' }, { url: SITE + 'contact/', pageType: 'contact' }, { url: SITE + 'old-offers/', pageType: 'other' },
  ],
  facts: [{ field: 'phone', value: '07700 900123', sourceUrl: SITE, confidence: 'high', evidence: 'visible' }],
  assets: [
    { sourceUrl: SITE + 'img/van-hero.jpg', type: 'hero', purpose: 'van outside a job', suggestedFilename: 'van-hero.jpg', ownership: 'client_owned' },
    { sourceUrl: SITE + 'img/dan.jpg', type: 'team', purpose: 'owner portrait', suggestedFilename: 'owner-dan.jpg', ownership: 'client_owned' },
    { sourceUrl: SITE + 'img/other.jpg', type: 'image', purpose: 'stock image', suggestedFilename: 'other.jpg' },
  ],
};
const parsedRecon = parseReconText(JSON.stringify(RECON)) as { result: ReconResult };

/** The quality standard, fully decided — for fixtures that test something else (websiteQuality.ts). */
const DECIDED_QUALITY = { strengths_reviewed: true, strengths: [], intents: Object.fromEntries(['services_hub', 'service_pages', 'areas_hub', 'location_pages', 'faq_hub', 'quotes_pricing', 'about', 'our_work', 'contact', 'customer_types', 'urgent_services'].map((k) => [k, { need: 'needed', page: 'section on /', note: '' }])) };
const BASE = {
  version: 2, route: 'template_rebuild', template_id: 'mcl-local-trades', repo_name: 'HarbourLocks', github_owner: 'Beyondweb2',
  local_repo_path: 'C:\\Users\\paulj\\HarbourLocks', cloudflare_project: 'harbour-locks', cloudflare_mode: 'direct_upload', canonical_domain: 'harbourlocks.co.uk',
  pages: [{ id: 'h', family: 'homepage', path: '/', title: 'Home', action: 'keep', old_url: SITE }],
  redirects: [{ from: '/emergency-locksmith/', to: '/services/emergency-lockouts/', reason: 'moved' }], qa: { visual_qa: true },
  mapping: { fields: { mobile_or_premises: 'mobile' } },
  quality: DECIDED_QUALITY,
};
function ready(b: Record<string, unknown> = BASE): WebsiteBuildState {
  const s0 = parseWebsiteBuild(b);
  const s1 = applyRecon(s0, parsedRecon.result, rowsFor(s0), '2026-09-25T10:00:00.000Z').state;
  const s2 = { ...s1, manifest: { ...s1.manifest, assets: s1.manifest.assets.map((a) => (a.source_url.endsWith('other.jpg') ? a : { ...a, approval: 'approved' as const })) } };
  const tpl = s2.route === 'template_rebuild' ? MCL_TEMPLATE : null;
  return { ...s2, mapping: { ...s2.mapping, assets: autoAssign(tpl ? tpl.assetSlots : computeMapping(s2, null, rowsFor(s2), '').slots.map((x) => x.slot), s2) } };
}
const input = (s: WebsiteBuildState) => ({ state: s, template: s.route === 'template_rebuild' ? MCL_TEMPLATE : null, facts: rowsFor(s), evidence: toRebuildPromptInput(ctx()), businessName: 'Harbour Locks Ltd', existingSiteUrl: SITE, mustNotSay: '', generatedAt: '2026-09-25T00:00:00Z' });
const mapOf = (s: WebsiteBuildState) => computeMapping(s, s.route === 'template_rebuild' ? MCL_TEMPLATE : null, rowsFor(s), 'Harbour Locks Ltd');

const OK_RESULT = {
  buildResultVersion: 1, status: 'preview_ready',
  repository: { url: 'https://github.com/Beyondweb2/HarbourLocks', name: 'HarbourLocks', branch: 'main', commitHash: 'a1b2c3d4e5f6' },
  local: { path: 'C:\\Users\\paulj\\HarbourLocks', devCommand: 'npm run dev', buildCommand: 'npm run build', outputDirectory: 'dist' },
  cloudflare: { projectName: 'harbour-locks', previewUrl: 'https://preview.harbour-locks.pages.dev', deploymentId: 'dep-123', status: 'success', noindexConfirmed: true },
  build: { pages: ['/', '/services/', '/services/lock-changes/', '/services/emergency-lockouts/', '/contact/'], services: ['Lock changes & upgrades', 'Emergency lockouts'], locations: ['Whitby'], assets: [SITE + 'img/van-hero.jpg -> public/images/van-hero.webp'], unsupportedFields: [] },
  redirects: { kept: 3, redirected: 1, retired: 0, unresolved: ['/old-offers/'], issues: [] },
  qa: { buildPassed: true, seedContaminationPassed: true, linksPassed: true, responsivePassed: true, schemaPassed: true },
  quality: { oldVsNew: { verdict: 'upgrade', widths: [1440, 390], stillStronger: [], notes: '' } },
  seedHits: [], warnings: ['Link the Pages project to GitHub in the dashboard (operator step).'], errors: [],
};
const parse = (o: unknown) => parseBuildResult(typeof o === 'string' ? o : JSON.stringify(o));
const resultOf = (o: unknown) => (parse(o) as { result: BuildResult }).result;
const importInto = (s: WebsiteBuildState, o: unknown, accept = false, now = '2026-09-25T12:00:00.000Z') => applyBuildResult(s, resultOf(o), { now, acceptConflicts: accept });

console.log('\n── A. LOGO OR TEXT WORDMARK ──');
{
  const s = ready();
  const m = mapOf(s);
  ok(!m.config.assets.logo && m.config.brand.mark === 'text_wordmark' && m.config.brand.wordmark === 'Harbour Locks Ltd', 'no approved logo → config.brand is a TEXT WORDMARK of the verified business name');
  ok(m.readiness.ok, `…and the template is READY TO BUILD without a logo (${m.readiness.blockers.join('; ') || 'no blockers'})`);
  ok(MCL_TEMPLATE.assetSlots.find((x) => x.id === 'logo')!.requirement === 'optional', 'the logo slot is optional');
  const p = executionPrompt(input(s)).text;
  ok(/TEXT WORDMARK of "Harbour Locks Ltd"/.test(p) && /Do not create, generate or trace a logo image/.test(p) && /no logo file is downloaded or created/.test(p), 'the build prompt renders a wordmark and forbids inventing a logo');
  const withLogo = { ...s, manifest: { ...s.manifest, assets: [...s.manifest.assets, { source_url: SITE + 'img/logo.svg', type: 'logo' as const, purpose: 'logo', location: '', approval: 'approved' as const, page_url: SITE, suggested_filename: 'logo.svg', ownership: 'client_owned' as const }] } };
  const wl = { ...withLogo, mapping: { ...withLogo.mapping, assets: { ...withLogo.mapping.assets, logo: [SITE + 'img/logo.svg'] } } };
  ok(mapOf(wl).config.brand.mark === 'logo' && mapOf(wl).config.brand.logo === 'logo.svg', 'an approved logo in the slot → brand is that logo');
  const noName = mapOf({ ...s, facts: [...s.facts.filter((f) => f.key !== 'business_name'), { key: 'business_name', label: 'Business name', value: 'x', status: 'rejected' as const, source: 'Paul', source_url: '', notes: '', basis: '' as const }] });
  ok(noName.config.brand.mark === 'none' && noName.readiness.blockers.some((b) => /Brand identity/.test(b)), 'no logo AND no verified name → brand identity blocks (the one genuinely required thing)');
}

console.log('\n── C/D/E. THE BUILD EXECUTION PROMPT ──');
{
  const s = ready();
  const p = executionPrompt(input(s));
  ok(p.blockedBy.length === 0, `a ready template build generates the prompt (${p.blockedBy.join('; ') || 'no blockers'})`);
  const m = mapOf(s);
  ok(p.text.includes('## E2. GENERATED CLIENT CONFIG') && p.text.includes('"name": "Harbour Locks Ltd"') && p.configVersion === configVersion(m) && p.text.includes('fingerprint: ' + configVersion(m)), 'the generated config (and its fingerprint) is in the prompt');
  ok(p.text.includes(MCL_TEMPLATE.sourceRepoUrl) && /READ-ONLY/.test(p.text) && /Never commit, push or open a branch in the template repository/.test(p.text), 'the seed template is named READ-ONLY');
  ok(p.text.includes('https://github.com/Beyondweb2/HarbourLocks.git') && /git remote -v/.test(p.text) && /STOP and report/.test(p.text), 'one destination repository, verified with git remote -v before writing');
  ok(/Never write to: the template repository, the MCL \/ any other client's production repository, the Findable website repository/.test(p.text), 'other clients\u2019 and the Findable repositories are forbidden');
  ok(/gh repo create/.test(p.text) && /STOP and report the operator action/.test(p.text), 'no GitHub CLI → stop with the exact operator action');
  const intoTemplate = executionPrompt(input(ready({ ...BASE, repo_name: 'MCLocksmiths' })));
  ok(intoTemplate.blockedBy.some((b) => /TEMPLATE\u2019s own repository/.test(b)) && /NOT READY TO BUILD/.test(intoTemplate.text) && !/X1\. DESTINATION/.test(intoTemplate.text), 'a destination that IS the template repository refuses the prompt outright');
  for (const w of ['Do NOT invent missing claims', 'Selected services ONLY', 'Location pages ONLY for: Whitby', 'Use the template architecture', 'REAL config / content layer', 'build.unsupportedFields', 'Never scatter a client detail into a component'])
    ok(p.text.includes(w), `  config / architecture rule: "${w}"`);
  ok(p.text.includes('img/van-hero.jpg') && p.text.includes('img/dan.jpg') && !p.text.includes('img/other.jpg'), 'assets: only USE assets assigned to a slot (the REVIEW stock image is out)');
  for (const w of ['capture/assets/original/', 'never edited', 'safe lowercase filenames', 'each URL once', 'Never hotlink', 'source URL -> local file']) ok(p.text.includes(w), `  asset rule: "${w}"`);
  ok(/AFTER building, search the WHOLE source/.test(p.text) && p.text.includes('dist/') && p.text.includes('morganbusiness1') && /DO NOT deploy the preview/.test(p.text), 'post-build seed scrub of source AND build output blocks the preview');
  for (const w of ['XML sitemap', 'robots.txt allowing OAI-SearchBot', 'BreadcrumbList', 'LocalBusiness schema', 'Do NOT add: llms.txt', 'fake citations', 'review / rating schema', 'mass FAQs']) ok(p.text.includes(w), `  SEO / AI: "${w}"`);
  for (const w of ['--branch preview', 'https://preview.harbour-locks.pages.dev', 'X-Robots-Tag noindex', 'tracking OFF', 'Never deploy to the production branch (main), never add a custom domain, never touch DNS', 'do NOT guess credentials', 'wrangler pages project create harbour-locks'])
    ok(p.text.includes(w), `  Cloudflare preview: "${w}"`);
  for (const w of ['1440, 1024, 768, 390 and iPhone SE', 'no horizontal overflow', 'no placeholder copy', 'selected services only', 'Targeted checks on the built client site only']) ok(p.text.includes(w), `  QA: "${w}"`);
  ok(/OLD URL COVERAGE — on the REAL build/.test(p.text) && p.text.includes('/old-offers/') && /redirect target that does not exist/.test(p.text), 'real-build old-URL coverage lists every source path');
  ok(p.text.includes('"buildResultVersion": 1') && /ONE ```json block/.test(p.text), 'it ends by demanding the structured JSON result');
  ok(!/"reconVersion"/.test(p.text), 'the raw recon is not in the prompt');
  const blocked = executionPrompt(input(ready({ ...BASE, canonical_domain: '' })));
  ok(blocked.blockedBy.some((b) => /Domain is missing/.test(b)) && /^Build route: Template rebuild\n\nNOT READY TO BUILD/.test(blocked.text) && !/X3\. ASSETS/.test(blocked.text), 'a blocked build gets NO build instructions — only the blockers');
  const sp = stagePrompts(input(s)).find((x) => x.id === 'build_execution')!;
  ok(sp.label === 'Copy Build Execution Prompt' && sp.stage === 'build_pack' && sp.text === p.text, 'the stage prompt is this prompt');
}

console.log('\n── N. FAITHFUL / BESPOKE ──');
{
  const f = ready({ ...BASE, route: 'faithful_rebuild', rebuild_style: 'replica', copy_ownership: 'client_wrote' });
  const fp = executionPrompt(input(f));
  ok(fp.blockedBy.length === 0 && /approved source architecture/.test(fp.text) && /OLD PLATFORM/.test(fp.text) && !/E2\. GENERATED CLIENT CONFIG/.test(fp.text), 'faithful (same domain): source architecture, old-platform scrub, no template config');
  ok(fp.text.includes('img/other.jpg') === false && fp.text.includes('img/dan.jpg'), 'faithful: every USE asset (the REVIEW one still out)');
  const noPlan = executionPrompt(input(ready({ ...BASE, route: 'bespoke', pages: [] })));
  ok(noPlan.blockedBy.includes('Page architecture (no pages planned)'), 'bespoke without an approved architecture is blocked');
  const bp = executionPrompt(input(ready({ ...BASE, route: 'bespoke' })));
  ok(bp.blockedBy.length === 0 && /approved Architecture/.test(bp.text), 'bespoke: follows the approved Architecture, no template required');
  /* Rebuild IN PLACE (old site www.harbourlocks.co.uk, new canonical harbourlocks.co.uk): the old domain is the
     canonical one, so the scrub must not forbid it — it hunts the old platform's leftovers instead. */
  ok(sameDomainRebuild(SITE, 'harbourlocks.co.uk') && !sameDomainRebuild(SITE, 'harbour-locks.com') && !sameDomainRebuild('', 'harbourlocks.co.uk'), 'same-domain detection ignores www and never matches a blank');
  ok(!/for the OLD domain/.test(bp.text) && /share the domain harbourlocks\.co\.uk/.test(bp.text) && /hotlinked from the old site/.test(bp.text) && /no hotlinked old-site file anywhere/.test(bp.text), 'same-domain bespoke: the scrub does not forbid the production domain');
  const moved = executionPrompt(input(ready({ ...BASE, route: 'bespoke', canonical_domain: 'harbour-locks.com' })));
  ok(/for the OLD domain \(https:\/\/www\.harbourlocks\.co\.uk\/\)/.test(moved.text) && /no old domain anywhere/.test(moved.text), 'a move to a NEW domain still forbids the old one');
}

console.log('\n── Q/R. PARSING THE BUILD RESULT ──');
{
  ok('result' in parse(OK_RESULT), 'raw JSON imports');
  const md = parse('Done. Summary…\n\n```json\n' + JSON.stringify(OK_RESULT, null, 2) + '\n```\n');
  ok('result' in md && md.result.repository.commitHash === 'a1b2c3d4e5f6', 'a Claude reply wrapped in markdown imports the same');
  const bad = parse('```json\n{ "buildResultVersion": 1, "status": "preview_ready", }\n```');
  ok('error' in bad && /could not be read/.test(bad.error), 'malformed JSON → a clear error');
  ok('error' in parse({ reconVersion: 1, pages: [] }) && /Import Recon Result/.test((parse({ reconVersion: 1, pages: [] }) as { error: string }).error), 'a recon result pasted here is refused with a pointer to the right place');
  ok('error' in parse({ ...OK_RESULT, status: 'awesome' }), 'an unknown status is refused');
  ok('error' in parse({ ...OK_RESULT, buildResultVersion: 9 }), 'an unknown version is refused');
  ok('error' in parse({ ...OK_RESULT, qa: [true] }), 'a wrong-shaped section is refused');
  ok('error' in parse('x'.repeat(700_000)), 'oversized input is refused');
  const odd = parse({ ...OK_RESULT, repository: { ...OK_RESULT.repository, url: 'javascript:alert(1)', commitHash: 'not-a-hash' }, cloudflare: { ...OK_RESULT.cloudflare, previewUrl: 'https://harbourlocks.co.uk' }, extra: 1 });
  ok('result' in odd && odd.result.repository.url === '' && odd.result.repository.commitHash === '' && odd.summary.dropped.some((d) => /not an http/.test(d)) && odd.summary.dropped.some((d) => /not a git hash/.test(d)), 'bad URLs / hashes are dropped and NAMED');
  ok('result' in odd && odd.summary.notes.some((n) => /not a pages\.dev address/.test(n)) && odd.summary.ignoredKeys.includes('extra'), 'a non-pages.dev preview and unknown keys are called out');
  ok('result' in parse({ ...OK_RESULT, build: { ...OK_RESULT.build, pages: ['https://preview.harbour-locks.pages.dev/about/', 'services'] } }) && resultOf({ ...OK_RESULT, build: { ...OK_RESULT.build, pages: ['https://x.pages.dev/about/', 'services'] } }).build.pages.join() === '/about/,/services', 'built pages are normalised to paths');
}

console.log('\n── IMPORT: SUCCESS, NOINDEX, CONTAMINATION, FAILURE, CONFLICTS ──');
{
  const s = ready();
  const { state: ok1 } = importInto(s, OK_RESULT);
  ok(buildExecutionStatus(ok1, true) === 'preview_ready' && previewGateProblems(ok1.build_execution).length === 0, 'a clean, noindexed pages.dev result → PREVIEW READY');
  ok(ok1.preview_url === 'https://preview.harbour-locks.pages.dev' && ok1.preview_status === 'deployed' && ok1.preview_noindex_confirmed && ok1.latest_commit === 'a1b2c3d4e5f6' && ok1.repo_url === 'https://github.com/Beyondweb2/HarbourLocks', 'project fields are filled: repo, commit, preview URL, preview status, noindex');
  ok(ok1.build_execution.deployment_id === 'dep-123' && ok1.build_execution.redirects.unresolved.join() === '/old-offers/' && ok1.build_execution.warnings.length === 1, 'the build record keeps deployment, redirect status and warnings');
  ok(JSON.stringify(ok1.facts) === JSON.stringify(s.facts) && JSON.stringify(ok1.mapping) === JSON.stringify(s.mapping) && ok1.route === s.route && ok1.pages.length === 1 && ok1.redirects.length === 1 && ok1.qa.visual_qa, 'import preserves facts, mapping, route, page plan, redirects and QA');
  const noNoindex = importInto(s, { ...OK_RESULT, cloudflare: { ...OK_RESULT.cloudflare, noindexConfirmed: false } }).state;
  ok(buildExecutionStatus(noNoindex, true) === 'needs_attention' && previewGateProblems(noNoindex.build_execution).includes('Preview noindex not confirmed') && !noNoindex.preview_noindex_confirmed, 'claimed preview_ready WITHOUT noindex → NEEDS ATTENTION');
  const dirty = importInto(s, { ...OK_RESULT, qa: { ...OK_RESULT.qa, seedContaminationPassed: false }, seedHits: ['Morgan', '07395'] }).state;
  ok(buildExecutionStatus(dirty, true) === 'needs_attention' && previewGateProblems(dirty.build_execution).some((g) => /Morgan/.test(g)), 'a seed-contamination hit blocks PREVIEW READY, whatever Claude claimed');
  const claimedClean = importInto(s, { ...OK_RESULT, seedHits: ['Canterbury'] }).state;
  ok(buildExecutionStatus(claimedClean, true) === 'needs_attention', 'a listed seed hit blocks even if the check was marked passed');
  ok(buildExecutionStatus(importInto(s, { ...OK_RESULT, cloudflare: { ...OK_RESULT.cloudflare, previewUrl: 'https://harbourlocks.co.uk/' } }).state, true) === 'needs_attention', 'a preview that is not on pages.dev can never be PREVIEW READY');
  ok(buildExecutionStatus(importInto(s, { ...OK_RESULT, status: 'built', cloudflare: { projectName: '', previewUrl: '', deploymentId: '', status: '', noindexConfirmed: false } }).state, true) === 'result_ready', 'built but not deployed → RESULT READY');

  /* failure never erases the last good build */
  const failed = importInto(ok1, { ...OK_RESULT, status: 'failed', repository: { ...OK_RESULT.repository, commitHash: 'ffff0000aaaa' }, cloudflare: { ...OK_RESULT.cloudflare, previewUrl: 'https://preview.other.pages.dev', noindexConfirmed: false }, qa: { buildPassed: false }, errors: ['astro build: Cannot find module src/lib/siteConfig'] }, false, '2026-09-26T09:00:00.000Z').state;
  ok(buildExecutionStatus(failed, true) === 'failed' && failed.build_execution.errors[0].includes('siteConfig'), 'a failed result → FAILED, with its errors');
  ok(failed.preview_url === 'https://preview.harbour-locks.pages.dev' && failed.preview_status === 'deployed' && failed.latest_commit === 'a1b2c3d4e5f6' && failed.preview_noindex_confirmed, 'the previous preview, status, noindex and commit are kept');
  ok(failed.build_execution.previous?.commit_hash === 'a1b2c3d4e5f6' && failed.build_execution.previous?.preview_url === 'https://preview.harbour-locks.pages.dev', 'the last good build is kept as "previous"');

  /* conflicting project values */
  const mine = { ...s, repo_url: 'https://github.com/Beyondweb2/HarbourLocksSite', cloudflare_project: 'harbour-locks' };
  const other = { ...OK_RESULT, repository: { ...OK_RESULT.repository, url: 'https://github.com/someone/else' } };
  const cs = projectConflicts(mine, resultOf(other));
  ok(cs.length === 1 && cs[0].label === 'Repository URL', 'a conflicting repository is detected (matching values are not conflicts)');
  const kept = importInto(mine, other).state;
  ok(kept.repo_url === 'https://github.com/Beyondweb2/HarbourLocksSite' && kept.build_execution.warnings.some((w) => /Kept your Repository URL/.test(w)), 'without consent YOUR value is kept, and the difference is recorded');
  ok(importInto(mine, other, true).state.repo_url === 'https://github.com/someone/else', 'with consent the imported value replaces it');
}

console.log('\n── P. OLD URL COVERAGE ON THE REAL BUILD ──');
{
  const s = { ...ready(), redirects: [{ from: '/emergency-locksmith/', to: '/services/emergency-lockouts/', reason: '' }, { from: '/upvc-repairs/', to: '/services/upvc/', reason: '' }, { from: '/areas/scarborough/', to: '/upvc-repairs/', reason: '' }],
    pages: [{ id: 'h', family: 'homepage' as const, path: '/', title: 'Home', action: 'keep' as const, old_url: SITE, target: '', notes: '' }, { id: 'o', family: 'other' as const, path: '', title: 'Offers', action: 'remove' as const, old_url: SITE + 'old-offers/', target: '', notes: '' }] };
  ok(!builtCoverage(s).assessed, 'no build imported → no real-build coverage claimed');
  const b = importInto(s, OK_RESULT).state;
  const c = builtCoverage(b);
  const r = (p: string) => c.rows.find((x) => x.path === p)!;
  ok(r('/').decision === 'kept' && r('/contact/').decision === 'kept' && r('/services/').decision === 'kept', 'KEPT = the route exists in the build');
  ok(r('/emergency-locksmith/').decision === 'redirected' && r('/emergency-locksmith/').flags.length === 0, 'REDIRECTED to a built page — clean');
  ok(r('/upvc-repairs/').flags.includes('redirect target does not exist in the build'), 'a redirect whose target was not built is flagged');
  ok(r('/areas/scarborough/').flags.includes('redirect chain'), 'a redirect into another redirect is flagged as a chain');
  ok(r('/old-offers/').decision === 'retired', 'RETIRED = removed in the plan');
  const loop = importInto({ ...s, redirects: [{ from: '/a/', to: '/b/', reason: '' }, { from: '/b/', to: '/a/', reason: '' }], manifest: { ...s.manifest, pages: [...s.manifest.pages, { url: SITE + 'a/', type: 'other' as const, title: '', h1: '', purpose: '', screenshots: [], status_code: null, sections: [] }] } }, OK_RESULT).state;
  ok(builtCoverage(loop).rows.find((x) => x.path === '/a/')!.flags.includes('redirect loop'), 'a redirect loop is flagged');
  const unres = importInto({ ...s, pages: s.pages.slice(0, 1) }, OK_RESULT).state;
  ok(builtCoverage(unres).rows.find((x) => x.path === '/old-offers/')!.decision === 'unresolved', 'UNRESOLVED = not built, not redirected, not retired');
  ok(JSON.stringify(b.redirects) === JSON.stringify(s.redirects), 'coverage never changes the redirect map');
}

console.log('\n── P2. PATTERN (SPLAT) REDIRECTS COVER A DOORWAY FAMILY ──');
{
  const m = redirectMatcher([{ from: '/eicrs-locations/*', to: '/eicrs/' }, { from: '/sub-services/*', to: '/' }, { from: '/sub-services/rcbo-upgrades/*', to: '/consumer-unit-upgrade/' }, { from: '/eicrs-locations/bath', to: '/bath-special/' }]);
  ok(m('/eicrs-locations/yate')?.to === '/eicrs/' && m(SITE + 'eicrs-locations/yate/')?.to === '/eicrs/', 'a URL under /prefix/* is covered, full URL or path, with or without a trailing slash');
  ok(m('/eicrs-locations/bath')?.to === '/bath-special/', 'an exact rule wins over a splat');
  ok(m('/sub-services/rcbo-upgrades/bristol')?.to === '/consumer-unit-upgrade/', 'the longest matching prefix wins');
  ok(!m('/eicrs-locations') && !m('/eicrs-locations-old/yate') && !m('/eicrs'), 'the prefix itself and look-alike paths are NOT covered');
  ok(m('/sub-services/burning-smells-%26-sparks/bath')?.to === '/', 'encoded characters match as the manifest stores them');

  const pages = ['eicrs-locations/yate', 'eicrs-locations/bath', 'mystery/page'].map((x) => ({ url: SITE + x, type: 'location' as const, title: '', h1: '', purpose: '', screenshots: [], status_code: null, sections: [] }));
  const s = { ...ready(), manifest: { ...ready().manifest, pages: [...ready().manifest.pages, ...pages] },
    redirects: [{ from: '/eicrs-locations/*', to: '/contact/', reason: 'town clones → the one page' }] };
  const d = urlDecisions(s);
  const row = (p: string) => d.rows.find((x) => x.path === p)!;
  ok(row('/eicrs-locations/yate').decision === 'redirected' && row('/eicrs-locations/yate').target === '/contact/', 'the decision view counts a splat-covered URL as REDIRECTED');
  ok(row('/mystery/page').decision === 'unresolved', 'a URL no rule covers stays UNRESOLVED');
  const c = builtCoverage(importInto(s, OK_RESULT).state);
  const cr = (p: string) => c.rows.find((x) => x.path === p)!;
  ok(cr('/eicrs-locations/bath').decision === 'redirected' && !cr('/eicrs-locations/bath').flags.includes('redirect target does not exist in the build'), 'real-build coverage counts it REDIRECTED to a built page');
  ok(cr('/mystery/page').decision === 'unresolved', 'real-build coverage keeps an uncovered URL UNRESOLVED');
}

console.log('\n── V. RETRY (DELTA ONLY) ──');
{
  const s = ready();
  ok(retryPrompt(input(s)).blockedBy.length === 1, 'no failed build → no retry prompt');
  const failed = importInto(s, { ...OK_RESULT, status: 'failed', qa: { buildPassed: false, linksPassed: false }, errors: ['astro build: Cannot find module src/lib/siteConfig'], seedHits: ['Morgan'] }).state;
  const rp = retryPrompt(input(failed));
  const full = executionPrompt(input(s)).text;
  ok(rp.blockedBy.length === 0 && rp.text.includes('Cannot find module src/lib/siteConfig') && /FAILED CHECKS: buildPassed, linksPassed/.test(rp.text) && rp.text.includes('Morgan'), 'the retry names the errors, failed checks and seed hits');
  ok(/Do NOT rebuild it from scratch/.test(rp.text) && rp.text.includes('"name": "Harbour Locks Ltd"') && rp.text.includes('"buildResultVersion": 1'), '…with the current config and the result contract');
  ok(!/## A\. PROJECT MISSION|X5\. PAGES|X10\. OLD URL COVERAGE|## K\. SEO/.test(rp.text) && rp.text.length < full.length / 3, `…and NOTHING of the full build brief (${rp.text.length} vs ${full.length} chars)`);
  ok(retryPrompt(input(importInto(s, { ...OK_RESULT, cloudflare: { ...OK_RESULT.cloudflare, noindexConfirmed: false } }).state)).text.includes('Preview noindex not confirmed'), 'a claimed-ready build that fails the gate can be retried, and says why');
}

console.log('\n── S/T/U. PREVIEW STAGE PROMPTS ──');
{
  const b = importInto(ready(), OK_RESULT).state;
  const tr = reviewPrompt(input(b));
  ok(tr.kind === 'template' && /TEMPLATE REVIEW/.test(tr.text) && /Do NOT redesign the MCL Local Trades Template because of taste/.test(tr.text) && tr.text.includes('https://preview.harbour-locks.pages.dev'), 'Template Review: inspects the deployed preview; no redesign for taste');
  for (const w of ['Client identity', 'Services: exactly', 'Location pages: exactly', 'Proof: only what the config holds', 'No template contamination', 'mobile quality', 'internal linking']) ok(tr.text.includes(w), `  review checks "${w}"`);
  const bs = importInto(ready({ ...BASE, route: 'bespoke' }), OK_RESULT).state;
  ok(reviewPrompt(input(bs)).kind === 'design' && /DESIGN REVIEW/.test(reviewPrompt(input(bs)).text), 'Bespoke → Design Review');
  const fs = importInto(ready({ ...BASE, route: 'faithful_rebuild', rebuild_style: 'replica', copy_ownership: 'client_wrote' }), OK_RESULT).state;
  const vc = stagePrompts(input(fs)).find((p) => p.id === 'visual_compare')!;
  ok(vc.text.includes('SOURCE: ' + SITE) && vc.text.includes('PREVIEW: https://preview.harbour-locks.pages.dev') && vc.text.includes('1440, 1024, 768, 390') && vc.blockedBy.length === 0, 'Faithful: the visual comparison uses the source URL and the IMPORTED preview automatically');
}

console.log('\n── STATUS, ROUND TRIP, COMPATIBILITY ──');
{
  const notReady = ready({ ...BASE, canonical_domain: '' });
  ok(buildExecutionStatus(notReady, executionPrompt(input(notReady)).blockedBy.length === 0) === 'not_started', 'blocked → NOT STARTED');
  const s = ready();
  ok(buildExecutionStatus(s, executionPrompt(input(s)).blockedBy.length === 0) === 'prompt_ready', 'ready → PROMPT READY');
  const started = { ...s, build_execution: { ...s.build_execution, started_at: '2026-09-25T11:00:00Z', config_version: 'c1' } };
  ok(buildExecutionStatus(started, true) === 'building', 'prompt copied → BUILDING');
  const done = importInto(started, OK_RESULT).state;
  const saved = parseWebsiteBuild(normaliseWebsiteBuild(done));
  ok(saved.route === 'template_rebuild' && buildExecutionStatus(saved, true) === 'preview_ready', 'route and build status survive the autosave round trip');
  ok(JSON.stringify(saved.build_execution) === JSON.stringify(done.build_execution), 'the whole build record survives the save rule exactly');
  ok(saved.build_execution.started_at === '2026-09-25T11:00:00Z' && saved.build_execution.config_version === 'c1', 'the prompt-copied time and config fingerprint are kept');
  const evil = parseWebsiteBuild({ version: 2, build_execution: { result_status: 'hacked', noindex_confirmed: 'yes', qa: { buildPassed: 'true', schemaPassed: true, rogue: true }, errors: [1, 'e'], extra: 'x' } });
  ok(evil.build_execution.result_status === '' && evil.build_execution.noindex_confirmed === null && JSON.stringify(evil.build_execution.qa) === '{"schemaPassed":true}' && evil.build_execution.errors.join() === '1,e' && !('extra' in evil.build_execution), 'the save rule keeps only known build fields and real booleans');
  const v1 = parseWebsiteBuild({ build_mode: 'template', template_id: 'mcl-local-trades', deploy_status: 'preview', preview_url: 'https://preview.x.pages.dev' });
  ok(v1.route === 'template_rebuild' && v1.build_execution.result_imported_at === '' && buildExecutionStatus(v1, false) === 'not_started', 'a V1 row opens with an empty build record');
  const p3 = parseWebsiteBuild({ version: 2, route: 'template_rebuild', mapping: { services: { 'lock-changes': true } }, recon: { imported_at: 'x', services: [{ name: 'Lock changes' }] } });
  ok(p3.mapping.services['lock-changes'] === true && p3.recon.services.length === 1 && p3.build_execution.previous === null, 'a Phase 3 row keeps its mapping and candidates and gains an empty build record');
}

console.log('\n── THE PAGE ──');
{
  const page = readFileSync(new URL('../src/pages/WebsiteBuild.tsx', import.meta.url), 'utf8');
  ok(/<BuildExecutionPanel /.test(page) && /<PreviewResultPanel /.test(page), 'Build Pack shows the Build website panel; Preview shows the build preview');
  ok(/parseBuildResult\(text\)/.test(page) && /applyBuildResult\(state, res\.result/.test(page) && /Replace my values with the imported ones/.test(page), 'import is checked and summarised before merge; replacing project values needs a tick');
  ok(/disabled=\{blocked\}/.test(page), 'the Copy Build Execution button is disabled while blocked');
  ok(!/dangerouslySetInnerHTML/.test(page), 'nothing imported is rendered as markup');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
