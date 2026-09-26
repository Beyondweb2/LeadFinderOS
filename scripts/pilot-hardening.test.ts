/* ============================================================
   WEBSITE BUILD — PILOT HARDENING (BS4 Electrical, 2026-09-25).

   A BS4-like fixture: an electrician, BESPOKE route (no electrician template), a manual onboarding row
   with 6 towns, a recon naming 20 towns and 12 genuine job photos (2 placed in slots), badges held
   for review, stock images ignored, a Git-connected Cloudflare project, an imported recon.

   F11  recon towns are SERVICE-AREA CANDIDATES: found ≠ verified; Add / Approve / Ignore; a verified
        list is never overwritten; case-insensitive dedupe; no page is created.
   F12  the Build Execution + Asset Download prompts carry the slot assignments AND every other USE
        asset; never REVIEW / IGNORE.
   F17  Git-connected mode: no Wrangler; push + dashboard steps + re-push; branches and account stored;
        the mode is required; direct upload still works; manual refuses to deploy.
   F1   the locksmith template is recommended to a locksmith only; an electrician → Bespoke.
   F14  one readiness: the Build pack stage and the Ready badge read the build blockers.
   F15  an imported recon is shown as captured, never "Capture: not started".

   Run: npx tsx scripts/pilot-hardening.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import { parseWebsiteBuild, normaliseWebsiteBuild, websiteBuildStages, captureSummary, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import { candidateFacts, mergeFacts, type FactsContext } from '../src/lib/buildFacts.ts';
import { applyRecon, parseReconText, type ReconResult } from '../src/lib/recon.ts';
import { computeMapping } from '../src/lib/templateMapping.ts';
import { assetsToDownload, executionBlockers, executionPrompt } from '../src/lib/buildExecution.ts';
import { stagePrompts } from '../src/lib/stagePrompts.ts';
import { buildPack, setupProblems } from '../src/lib/buildPack.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';
import { serviceAreaView, withAreas, withServes } from '../src/lib/serviceAreaCandidates.ts';
import { cloudflareBranches, cloudflareModeProblem, stablePreviewUrl } from '../src/lib/cloudflareDeploy.ts';
import { MCL_TEMPLATE, recommendedRoute, recommendedTemplates, tradeFit } from '../src/lib/websiteTemplates.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const SITE = 'https://www.bs4electricalservices.co.uk/';
const TOWNS = ['Bristol', 'Bath', 'Keynsham', 'Portishead', 'Clevedon', 'Yate', 'Thornbury', 'Longwell Green', 'Kingswood', 'Hanham', 'Filton', 'Patchway', 'Bradley Stoke', 'Winterbourne', 'Saltford', 'Nailsea', 'Backwell', 'Pensford', 'Chew Magna', 'Whitchurch'];
const ctx = (): RebuildContextPayload => ({
  lead: { id: 'lead-bs4', business_name: 'BS4 Electrical Services Ltd', website: 'https://bs4electricalservices.co.uk/', phone: '+44 7950 399604', email: 'info@bs4electricalservices.co.uk', address: '172 Novers Ln, Bristol', derived_town: 'Bristol', category: 'Electricians', website_build: {} },
  onboarding: { business_name: 'BS4 Electrical Services Ltd', client_source: 'manual', confirmed_location: 'Bristol', services_list: ['Rewiring', 'EICRs'], areas_list: ['Bath', 'keynsham', 'Portishead', 'Clevedon', 'Nailsea', 'Weston-super-Mare'] },
  baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null, discovery_audit: null, crawl: null, pages: [],
} as unknown as RebuildContextPayload);
const cands = candidateFacts(ctx() as unknown as FactsContext);
const rowsFor = (s: WebsiteBuildState) => mergeFacts(cands, s.facts, null);

const photo = (n: number) => ({ sourceUrl: SITE + 'media/job-' + n + '.jpg', type: 'gallery', purpose: 'genuine job photo ' + n, suggestedFilename: 'job-' + n + '.jpg', ownership: 'client_owned' });
const RECON = {
  reconVersion: 1, sourceUrl: SITE, capturedAt: '2026-09-25T09:00:00Z', platform: 'Wix',
  pages: [{ url: SITE, pageType: 'homepage' }, { url: SITE + 'eicrs', pageType: 'service' }, ...TOWNS.map((t) => ({ url: SITE + 'eicrs-locations/' + t.toLowerCase().replace(/ /g, '-'), pageType: 'location' }))],
  facts: TOWNS.map((t) => ({ field: 'service_areas', value: t, sourceUrl: SITE + 'eicrs', sourceContext: 'town list on every service page' })),
  assets: [
    ...Array.from({ length: 12 }, (_, i) => photo(i + 1)),
    { sourceUrl: SITE + 'media/logo.png', type: 'logo', purpose: 'text logo', suggestedFilename: 'logo.png', ownership: 'client_owned' },
    { sourceUrl: SITE + 'media/niceic.jpg', type: 'certification', purpose: 'NICEIC badge', suggestedFilename: 'niceic.jpg', ownership: 'third_party' },
    { sourceUrl: SITE + 'media/stock.jpg', type: 'image', purpose: 'stock', suggestedFilename: 'stock.jpg', ownership: 'third_party' },
  ],
};
const parsed = parseReconText(JSON.stringify(RECON)) as { result: ReconResult };
/** The quality standard, fully decided — for fixtures that test something else (websiteQuality.ts). */
const DECIDED_QUALITY = { strengths_reviewed: true, strengths: [], intents: Object.fromEntries(['services_hub', 'service_pages', 'areas_hub', 'location_pages', 'faq_hub', 'quotes_pricing', 'about', 'our_work', 'contact', 'customer_types', 'urgent_services'].map((k) => [k, { need: 'needed', page: 'section on /', note: '' }])) };
const BASE = {
  version: 2, route: 'bespoke', repo_name: 'BS4ElectricalServices', github_owner: 'Beyondweb2', local_repo_path: 'C:\\Users\\paulj\\BS4ElectricalServices',
  cloudflare_project: 'bs4-electrical-services', canonical_domain: 'bs4electricalservices.co.uk', cloudflare_mode: 'git_connected', cloudflare_account: 'beyondwebcraft',
  pages: [{ id: 'h', family: 'homepage', path: '/', title: 'Home', action: 'keep', old_url: SITE }, { id: 'e', family: 'service', path: '/eicrs/', title: 'EICRs', action: 'keep', old_url: SITE + 'eicrs' }],
  redirects: [{ from: '/eicrs-locations/*', to: '/eicrs/', reason: 'town clones' }],
  checks: {},
  quality: DECIDED_QUALITY,
};
function bs4(over: Record<string, unknown> = {}): WebsiteBuildState {
  const s0 = parseWebsiteBuild({ ...BASE, ...over });
  const s1 = applyRecon(s0, parsed.result, rowsFor(s0), '2026-09-25T09:14:00.000Z').state;
  const assets = s1.manifest.assets.map((a) => ({ ...a, approval: /job-/.test(a.source_url) ? 'approved' as const : /stock/.test(a.source_url) ? 'rejected' as const : 'pending' as const }));
  const s2 = { ...s1, manifest: { ...s1.manifest, assets } };
  const verify = (k: string, value: string) => ({ key: k, label: k, value, status: 'verified' as const, source: 'test', source_url: '', notes: '', basis: 'operator' as const });
  const facts = [...s2.facts.filter((f) => !['business_name', 'trade', 'phone', 'email', 'primary_town', 'service_areas', 'services'].includes(f.key)),
    verify('business_name', 'BS4 Electrical Services Ltd'), verify('trade', 'Electricians'), verify('phone', '07950 399604'), verify('email', 'info@bs4electricalservices.co.uk'),
    verify('primary_town', 'Bristol'), verify('service_areas', 'Bath, Keynsham'), verify('services', 'EICRs (electrical inspections), Rewiring')];
  const slots = computeMapping({ ...s2, facts }, null, rowsFor({ ...s2, facts }), '').slots.map((x) => x.slot);
  const hero = slots.find((x) => /hero/i.test(x.label))!, gallery = slots.find((x) => /gallery/i.test(x.label))!;
  return { ...s2, facts, mapping: { ...s2.mapping, assets: { [hero.id]: [SITE + 'media/job-7.jpg'], [gallery.id]: [SITE + 'media/job-1.jpg'] } } };
}
const input = (s: WebsiteBuildState) => ({ state: s, template: null, facts: rowsFor(s), evidence: toRebuildPromptInput(ctx()), businessName: 'BS4 Electrical Services Ltd', existingSiteUrl: SITE, mustNotSay: '', generatedAt: '2026-09-25T00:00:00Z' });

console.log('\n── F11. SERVICE-AREA CANDIDATES ──');
{
  const s = bs4();
  const v = serviceAreaView(s, rowsFor(s));
  ok(v.candidates.length === 20, 'all 20 recon towns are listed as candidates (deduplicated)');
  ok(v.candidates.find((c) => c.name === 'Bristol')?.status === 'base', 'the base town is marked as the base, not a candidate');
  ok(v.candidates.filter((c) => c.status === 'verified').map((c) => c.name).join() === 'Bath,Keynsham', 'towns already in the VERIFIED list read as verified');
  ok(v.candidates.filter((c) => c.status === 'candidate').length === 17 && v.action === 'approve', 'the other 17 are candidates, awaiting an operator decision (list verified → Approve)');
  const fact = rowsFor(s).find((r) => r.key === 'service_areas')!;
  ok(withAreas(fact, ['Yate'], 'add') === null, 'Add is refused on a VERIFIED list — it would un-verify the towns already verified');
  const next = withAreas(fact, ['Yate', 'KEYNSHAM', 'yate'], 'approve')!;
  ok(next.status === 'verified' && next.value === 'Bath, Keynsham, Yate', 'Approve adds one town; the verified towns stay verified; case-insensitive dedupe');
  /* an UNVERIFIED list: Add proposes, still needs approval */
  const unv = { ...s, facts: s.facts.map((f) => (f.key === 'service_areas' ? { ...f, status: 'detected' as const, value: 'Bath, Weston-super-Mare' } : f)) };
  const uf = rowsFor(unv).find((r) => r.key === 'service_areas')!;
  const added = withAreas(uf, ['Thornbury'], 'add')!;
  ok(added.status === 'detected' && added.value === 'Bath, Weston-super-Mare, Thornbury', 'Add on an unverified list proposes the town — it stays needs-approval');
  ok(withAreas(uf, ['Thornbury'], 'approve') === null, 'Approve is only for a verified list');
  ok(serviceAreaView(unv, rowsFor(unv)).candidates.find((c) => c.name === 'Bath')?.status === 'listed', 'a town in an unverified list reads "needs approval", not verified');
  /* Ignore */
  const ign = withServes(s, ['yate'], false);
  ok(serviceAreaView(ign, rowsFor(ign)).candidates.find((c) => c.name === 'Yate')?.status === 'ignored', 'Ignore = does not serve (the same decision the Locations panel reads)');
  ok(Object.values(ign.mapping.locations).every((l) => l.page === undefined), 'nothing sets a dedicated page — serving an area is not a page');
  ok(!rowsFor(s).some((r) => r.key === 'service_areas' && /Yate/.test(r.value)), 'found is never verified: no recon town reaches the fact without an operator action');
  /* BS4's live record: the recon also named the base as "Bristol (Knowle West)" */
  const noted = { ...s, recon: { ...s.recon, towns: [...s.recon.towns, { name: 'Bristol (Knowle West)', source_url: SITE + 'about', context: 'Based in Knowle West' }, { name: 'Kingswood (South Glos)', source_url: '', context: '' }] } };
  const nv = serviceAreaView(noted, rowsFor(noted));
  ok(nv.candidates.find((c) => c.name === 'Bristol (Knowle West)')?.status === 'base', 'a town with a bracketed note is recognised as the base town');
  ok(nv.candidates.find((c) => c.name === 'Kingswood (South Glos)')?.status === 'candidate' && serviceAreaView(withServes(noted, [], undefined), rowsFor(noted)).candidates.filter((c) => c.status === 'base').length === 2, 'and only the base — other noted towns stay candidates');
  const round = parseWebsiteBuild(JSON.parse(JSON.stringify(normaliseWebsiteBuild(ign))));
  ok(round.mapping.locations.yate?.serves === false && round.recon.towns.length === 20, 'Ignore and the candidates survive the save rule');
}

console.log('\n── F12. APPROVED ASSETS ──');
{
  const s = bs4();
  const plan = assetsToDownload(input(s));
  ok(plan.assigned.length === 2 && plan.approvedAdditional.length === 10 && plan.list.length === 12, '12 USE photos: 2 assigned to slots + 10 additional approved');
  ok(plan.assigned.some((x) => /job-7/.test(x.asset.source_url) && /hero/i.test(x.slot)) && plan.assigned.some((x) => /job-1/.test(x.asset.source_url) && /gallery/i.test(x.slot)), 'the slot assignments are named');
  ok(!plan.list.some((x) => /niceic|stock|logo/.test(x.asset.source_url)), 'REVIEW, IGNORE and an unassigned logo are never downloaded');
  const text = executionPrompt(input(s)).text;
  const x3 = text.slice(text.indexOf('X3. ASSETS'), text.indexOf('X4.'));
  ok(/12 approved \(USE\): 2 assigned to a slot, 10 additional/.test(x3), 'the Build Execution prompt says 12 = 2 assigned + 10 additional');
  ok((x3.match(/job-\d+\.jpg/g) ?? []).length >= 12 && /Additional approved assets \(10\)/.test(x3), 'and lists every one of them');
  ok(/2 REVIEW asset\(s\), 1 IGNORE asset\(s\)/.test(x3), 'and names what it must not download (the badge and logo held for review, the stock image ignored)');
  const dl = stagePrompts(input(s)).find((p) => p.id === 'asset_download')!.text;
  ok(/Download ONLY the 12 asset\(s\)/.test(dl) && /Additional approved assets \(10\)/.test(dl), 'the Asset Download prompt carries the same 12');
}

console.log('\n── F17. CLOUDFLARE DEPLOYMENT MODES ──');
{
  const s = bs4();
  ok(cloudflareBranches(s).production === 'live' && cloudflareBranches(s).preview === 'preview' && stablePreviewUrl(s) === 'https://preview.bs4-electrical-services.pages.dev', 'Git-connected defaults: production live (placeholder), preview preview, stable preview alias');
  const t = executionPrompt(input(s)).text;
  const x8 = t.slice(t.indexOf('X8.'), t.indexOf('X9.'));
  ok(!/wrangler (whoami|pages)/.test(x8) && /Do not use Wrangler/.test(x8), 'Git mode: no Wrangler command, and says not to ask for a Wrangler sign-in');
  ok(/git push origin main main:preview/.test(x8) && /PLACEHOLDER/.test(x8) && /\[CI Skip\]/.test(x8), 'push main + the preview branch; a README-only production placeholder');
  ok(/STOP/.test(x8) && /Import an existing Git repository/.test(x8) && /beyondwebcraft/.test(x8) && /Production branch: live/.test(x8), 'not linked yet → STOP with the exact dashboard steps (account, repo, branch)');
  ok(/allow-empty/.test(x8) && /does not build/.test(x8), 'after the operator links it: push again (empty commit) — a push before the link does not build');
  ok(executionBlockers(input(s), computeMapping(s, null, rowsFor(s), '')).length === 0, 'the BS4-like fixture is Ready to Build in Git mode');
  const round = parseWebsiteBuild(JSON.parse(JSON.stringify(normaliseWebsiteBuild({ ...s, cloudflare_production_branch: 'live', cloudflare_preview_branch: 'preview' }))));
  ok(round.cloudflare_mode === 'git_connected' && round.cloudflare_account === 'beyondwebcraft' && round.cloudflare_production_branch === 'live', 'mode, account label and branches survive the save rule');
  ok(parseWebsiteBuild({ cloudflare_mode: 'api_token_xyz' }).cloudflare_mode === '', 'an unknown mode token is dropped, never stored as itself');
  ok(!/token|secret|password|api.?key/i.test(Object.keys(round).filter((k) => k.startsWith('cloudflare')).join(' ')), 'no credential field exists');
  /* not chosen → refused */
  const none = bs4({ cloudflare_mode: '' });
  ok(cloudflareModeProblem(none) !== '' && executionBlockers(input(none), computeMapping(none, null, rowsFor(none), '')).some((b) => /deployment mode not chosen/.test(b)), 'no mode chosen → the build is blocked, never a default mode');
  /* guard: git mode with production = main would publish every push */
  ok(/must not be main/.test(cloudflareModeProblem(bs4({ cloudflare_production_branch: 'main' }))), 'Git mode refuses main as the production branch');
  /* direct upload still works */
  const du = bs4({ cloudflare_mode: 'direct_upload' });
  const dx = executionPrompt(input(du)).text;
  ok(/npx wrangler pages deploy dist --project-name bs4-electrical-services --branch preview/.test(dx) && /--production-branch main/.test(dx), 'Direct upload: the Wrangler steps, production branch main');
  /* manual */
  const mx = executionPrompt(input(bs4({ cloudflare_mode: 'manual' }))).text;
  ok(/Do NOT deploy anything/.test(mx) && !/wrangler pages deploy/.test(mx), 'Manual: no deployment at all');
  /* the other deploy texts follow the mode too */
  const prompts = stagePrompts(input(s));
  const prev = prompts.find((p) => p.id === 'preview_deploy')!.text;
  ok(!/npx wrangler/.test(prev) && /git push origin main main:preview/.test(prev), 'the Preview Deployment prompt follows the mode');
  const pack = buildPack(input(s)).find((p) => p.id === 'preview')!.text;
  ok(!/npx wrangler/.test(pack) && /git push origin main main:preview/.test(pack), 'the Cloudflare preview PowerShell follows the mode');
  const prodState = { ...s, preview_url: 'https://preview.bs4-electrical-services.pages.dev' };
  const prod = stagePrompts(input(prodState)).find((p) => p.id === 'production_deploy')!.text;
  ok(!/wrangler pages deploy/.test(prod) && /Branch control → Production branch: main/.test(prod) && !/--force|force-with-lease/.test(prod), 'Production (Git): switch the production branch in the dashboard — no Wrangler, no force push');
}

console.log('\n── F1. TEMPLATE RECOMMENDATION ──');
{
  ok(tradeFit('Locksmiths', MCL_TEMPLATE) === 'compatible' && recommendedRoute('Locksmith') === 'template_rebuild', 'locksmith → the locksmith template is recommended');
  ok(tradeFit('Electricians', MCL_TEMPLATE) === 'weak' && recommendedTemplates('Electricians').length === 0, 'electrician → the locksmith template is NOT recommended');
  ok(recommendedRoute('Electricians') === 'bespoke', 'electrician with no electrician template → Bespoke / new trade recommended');
  ok(recommendedRoute('Plumbers / heating engineers') === 'bespoke', 'a trade only in the "could be adapted for" list is not a recommendation either');
  ok(recommendedRoute('') === '' && tradeFit('', MCL_TEMPLATE) === 'unknown', 'no trade → nothing recommended');
  const src = readFileSync('src/pages/WebsiteBuild.tsx', 'utf8');
  ok(/const suits = recommendedTemplates\(trade\)/.test(src) && !/templateSuitsTrade\(trade, \[t\.trade, \.\.\.t\.supportedBusinessTypes\]\)/.test(src), 'the route card reads the one compatibility rule, not the descriptive list');
  ok(/weakChoice &&/.test(src), 'choosing a weak-fit template deliberately shows a warning (never blocked)');
}

console.log('\n── F14. ONE READINESS ──');
{
  const s = bs4();
  const i = input(s), m = computeMapping(s, null, rowsFor(s), '');
  const blockers = executionBlockers(i, m);
  const awaiting = rowsFor(s).filter((r) => r.status === 'detected').length;
  const stage = websiteBuildStages({ state: s, hasExistingSite: true, factsAwaiting: awaiting, architectureErrors: 0, setupMissing: setupProblems(s).map((p) => p.label), buildBlockers: blockers }).find((x) => x.stage === 'build_pack')!;
  ok(awaiting > 0 && blockers.length === 0, 'fixture: claims still held for approval, and nothing blocks the build (held claims are left out)');
  ok(stage.done && stage.detail === 'Ready to build', 'Ready to build → the stage says Ready to build (not "Finish intake and architecture first")');
  const blocked = bs4({ cloudflare_mode: '' });
  const bb = executionBlockers(input(blocked), computeMapping(blocked, null, rowsFor(blocked), ''));
  const st2 = websiteBuildStages({ state: blocked, hasExistingSite: true, factsAwaiting: 0, architectureErrors: 0, setupMissing: [], buildBlockers: bb }).find((x) => x.stage === 'build_pack')!;
  ok(!st2.done && st2.detail === 'Not ready to build: ' + bb.length + ' blocker(s)', 'blocked → the stage names the real blocker count');
  const st3 = websiteBuildStages({ state: s, hasExistingSite: true, factsAwaiting: 0, architectureErrors: 2, setupMissing: [], buildBlockers: [] }).find((x) => x.stage === 'build_pack')!;
  ok(!st3.done && /1 blocker/.test(st3.detail), 'page-plan errors block too');
  const src = readFileSync('src/pages/WebsiteBuild.tsx', 'utf8');
  ok(/executionBlockers\(packInput, mapping\)/.test(src) && /const ready = buildBlockers\.length === 0;/.test(src) && !/r\.ok \? 'Ready to build'/.test(src), 'the stage and the Ready badge both read executionBlockers');
  ok(!readFileSync('src/lib/websiteBuildState.ts', 'utf8').includes("'Finish intake and architecture first'"), 'the contradictory wording is gone');
}

console.log('\n── F15. CAPTURE STATUS ──');
{
  const s = bs4();
  ok(s.capture.status === 'not_started' && /^Recon imported 2026-09-25 · 22 URLs · 15 assets$/.test(captureSummary(s)), 'an imported recon reads as captured (no manual tick needed)');
  const text = executionPrompt(input(s)).text;
  ok(!/Capture: not started/i.test(text) && /Capture: Recon imported 2026-09-25/.test(text), 'the build prompt no longer says "Capture: not started"');
  const cap = websiteBuildStages({ state: s, hasExistingSite: true, factsAwaiting: 0, architectureErrors: 0, setupMissing: [] }).find((x) => x.stage === 'capture')!;
  ok(cap.done && /Recon imported/.test(cap.detail), 'the Capture stage is done, with the same wording');
  const none = parseWebsiteBuild({ route: 'bespoke' });
  ok(captureSummary(none) === 'Not started', 'no recon, no capture → Not started');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
