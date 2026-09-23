/* ============================================================
   WEBSITE BUILD V1 — the command centre's rules, end to end on realistic client data.

   TEMPLATE MODE   the MCL template is available; MCL's claims never carry over; missing facts are
                   removed, never adapted; verified facts reach the prompt.
   EXISTING SITE   replica route, copy ownership, the capture prompt.
   FACTS           verified usable, unverified prohibited, decisions persist through the save rule.
   ARCHITECTURE    pages/redirects persist; no fake pages; chains, loops and homepage floods caught.
   BUILD PACK      all nine outputs; exact commands; nothing destructive; production refused until
                   the Cloudflare project, the preview and the domain are recorded.
   SAFETY          the page reads one action and writes one action; no audit, crawl or message.

   Run: npx tsx scripts/website-build-v1.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import { normaliseWebsiteBuild, parseWebsiteBuild, websiteBuildStages, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import { MCL_TEMPLATE, WEBSITE_TEMPLATES, templateById } from '../src/lib/websiteTemplates.ts';
import { candidateFacts, factsSummary, mapTemplateClaims, mergeFacts, parseFactLines, type FactsContext } from '../src/lib/buildFacts.ts';
import { applyAction, checkArchitecture, parsePageLines, parseRedirectText, redirectsFromPages, seedFromCited, seedFromCrawl, seedFromTemplate } from '../src/lib/buildArchitecture.ts';
import { buildPack, FORBIDDEN_COMMAND_PATTERNS, MARK, suggestCloudflareProject, suggestRepoName } from '../src/lib/buildPack.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';
import { PAGE_ACTIONS, PAGE_FAMILIES } from '../src/lib/websiteBuildState.ts';

let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

/* A plumber, shaped as paid-client-hub returns it — the SC Plumbing record's real crawl shape. */
const ctx = (over: Partial<RebuildContextPayload> = {}): RebuildContextPayload => ({
  lead: { id: 'lead-sc', business_name: 'SC Plumbing & Gas Ltd', website: 'https://www.scplumbing.co.uk/', phone: '07852 130513', email: 'scgasplumbing@gmail.com', address: '7 Lowdham, Tamworth', derived_town: 'Tamworth', category: 'Plumber', website_build: {} },
  onboarding: {
    business_name: 'SC Plumbing & Gas Ltd', confirmed_location: 'Tamworth',
    services_list: ['Boiler repair', 'Boiler servicing', 'Emergency plumbing'], areas_list: ['Tamworth', 'Lichfield'],
    contact_name: 'Steve', contact_email: 'scgasplumbing@gmail.com', accreditations: 'Gas Safe registered', must_not_say: 'Do not say 24/7',
  },
  baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null, discovery_audit: null,
  crawl: {
    url: 'https://www.scplumbing.co.uk/', created_at: '2026-09-10T00:00:00Z',
    result: {
      siteInfo: { email: 'scgasplumbing@gmail.com', phone: '07852 130 513', address: '7 Lowdham, Wilnecote, Tamworth B77 4LX', openingHours: null, companyNumber: null, builtBy: { credit: null, platform: 'WordPress', footerLinks: [] }, socialLinks: [], services: ['Services', 'Boiler Repair', 'Helpful info'], towns: [], directories: ['Checkatrade'], staleness: { copyrightYear: 2023, lastDatePublished: null } } as never,
      signals: { homeUrl: 'https://www.scplumbing.co.uk/', fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot', clientRendered: null, missingH1: true, noJsonLd: false, duplicates: null, thinPages: 0,
        checkedPages: [{ url: 'https://www.scplumbing.co.uk/', kind: 'other', words: 1300, hasH1: false, readable: true }, { url: 'https://www.scplumbing.co.uk/helpful-info/pipe-sizing', kind: 'other', words: 900, hasH1: false, readable: true }] } as never,
    },
  },
  pages: [],
  ...over,
});

const facts = (state: WebsiteBuildState, c = ctx()) => mergeFacts(candidateFacts(c as unknown as FactsContext, state.canonical_domain), state.facts, state.build_mode === 'template' ? templateById(state.template_id) : null);
const pack = (build: Record<string, unknown>, c = ctx()) => {
  const state = parseWebsiteBuild(build);
  const rows = facts(state, c);
  const evidence = toRebuildPromptInput(c);
  return buildPack({ state, template: state.build_mode === 'template' ? templateById(state.template_id) : null, facts: rows, evidence,
    businessName: 'SC Plumbing & Gas Ltd', existingSiteUrl: evidence.facts.website.value ?? '', mustNotSay: evidence.facts.mustNotSay.value ?? '', generatedAt: '2026-09-23T00:00:00Z' });
};
const text = (build: Record<string, unknown>, id: string, c = ctx()) => pack(build, c).find((p) => p.id === id)!;
const section = (t: string, from: string, to: string) => t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from) + 1));

const READY = {
  build_mode: 'template', template_id: 'mcl-local-trades', repo_name: 'SCPlumbingGas', github_owner: 'Beyondweb2',
  local_repo_path: 'C:\\Users\\paulj\\SCPlumbingGas', canonical_domain: 'scplumbing.co.uk',
  pages: [{ id: 'a', family: 'homepage', path: '/', title: 'Home', action: 'create' }],
};

console.log('\n── TEMPLATE MODE ──');
{
  ok(WEBSITE_TEMPLATES.length >= 1 && WEBSITE_TEMPLATES[0].id === 'mcl-local-trades', 'the MCL Local Trades Template is in the registry');
  ok(templateById('mcl-local-trades')?.name === 'MCL Local Trades Template', 'and is found by id');
  ok(templateById('nope') === null, 'an unknown template id resolves to none, never to the first one');
  const t = MCL_TEMPLATE;
  ok(t.devUrl === 'http://localhost:4321' && t.buildOutputDir === 'dist' && t.buildCommand === 'npm run build', 'the profile carries the real dev / build config');
  ok(t.claims.length >= 15 && t.leftoverNeedles.includes('Morgan') && t.leftoverNeedles.includes('Canterbury'), 'the profile lists the MCL claims and leftover needles');

  const master = text(READY, 'master').text;
  const verified = section(master, '## D.', '## E.');
  for (const needle of ['Morgan', 'Canterbury', '07395', 'morganbusiness1', 'DBS', 'NCFE', 'Hiscox', '15-30', 'Walden']) {
    ok(!verified.includes(needle), `no MCL fact "${needle}" is in the VERIFIED facts for a new client`);
  }
  ok(verified.includes('Boiler repair') && verified.includes('Gas Safe registered') && verified.includes('Tamworth'), 'the new client\u2019s verified facts ARE in the prompt');
  const mapping = mapTemplateClaims(t, facts(parseWebsiteBuild(READY)));
  ok(mapping.find((m) => m.id === 'response')!.verdict === 'missing', 'a template response-time claim with no client fact is MISSING → removed');
  ok(mapping.find((m) => m.id === 'insurance')!.verdict === 'missing', 'template insurance with no evidence is removed');
  ok(mapping.find((m) => m.id === 'services')!.verdict === 'verified', 'the services claim maps to the client\u2019s own verified services');
  ok(mapping.find((m) => m.id === 'owner')!.verdict === 'needs_approval', 'the owner name is held for approval, not assumed');
  ok(/NEVER swap the client name into a template claim/.test(master), 'the prompt forbids name-swapping across unsupported claims');
  ok(/MISSING — remove the section \/ claim/.test(master), 'missing claims are marked for removal in the prompt');
  ok(/LEFTOVER CHECK/.test(master) && master.includes('morganbusiness1'), 'the prompt carries the MCL leftover search list');
  ok(/STRIP EVERY TRACE OF MC LOCKSMITHS/.test(master), 'the prompt tells Claude to strip the source client');
  const visual = text(READY, 'visual_qa').text;
  ok(/NO MC LOCKSMITHS \(MORGAN, CANTERBURY\) CONTENT SURVIVED/.test(visual), 'template visual QA checks no MCL content survived');
  ok(text(READY, 'capture').applicable === true, 'with an existing site, the template route still offers a (light) capture');
  ok(!/design\.md/.test(text(READY, 'capture').text), 'and that capture skips the design capture — the old design is not kept');
  const noSite = ctx({ lead: { ...ctx().lead!, website: null }, onboarding: { ...ctx().onboarding!, business_website: null }, crawl: null });
  ok(text(READY, 'capture', noSite).applicable === false, 'no current website → no capture step');
}

console.log('\n── TEMPLATE SEEDING — NO FAKE PAGES ──');
{
  const rows = facts(parseWebsiteBuild(READY));
  const seeded = seedFromTemplate(MCL_TEMPLATE, rows);
  const services = seeded.filter((p) => p.family === 'service');
  ok(services.length === 3, `one service page per VERIFIED service (3), not the template\u2019s 22 — got ${services.length}`);
  ok(!seeded.some((p) => p.family === 'location'), 'no location detail pages are generated');
  ok(!seeded.some((p) => p.family === 'pricing'), 'no pricing page without verified prices');
  ok(!seeded.some((p) => p.family === 'gallery'), 'no gallery without verified photos');
  ok(seeded.some((p) => p.family === 'locations_index'), 'an areas page because service areas ARE verified');
  ok(services.every((p) => /^\/services\/[a-z0-9-]+\/$/.test(p.path)), 'service paths are clean slugs with a trailing slash');
}

console.log('\n── EXISTING SITE MODE ──');
{
  const base = { ...READY, build_mode: 'rebuild', template_id: '', rebuild_style: 'replica', copy_ownership: 'unknown' };
  const cap = text(base, 'capture');
  ok(cap.applicable && cap.blockedBy.length === 0, 'the capture prompt is generated for a replica rebuild');
  for (const p of ['sitemap', 'robots.txt', 'canonical', 'meta description', 'H1', 'JSON-LD', 'screenshots/desktop-1440', 'mobile-375', 'design.md', 'fonts', 'colours as hex', 'gradients', 'sticky bars', 'mobile menu', 'logo', 'favicon', 'manufacturer logos', 'review-platform logos', 'manifest.csv']) {
    ok(cap.text.includes(p), `capture covers "${p}"`);
  }
  ok(/Download genuine assets LOCALLY/.test(cap.text) && /Never hotlink/.test(cap.text), 'assets are captured locally, never hotlinked');
  ok(/REFERENCE ONLY/.test(cap.text), 'unknown ownership → page text captured as reference only');
  const master = text(base, 'master').text;
  ok(/Do NOT reproduce the old site's marketing passages verbatim/.test(master), 'unknown ownership → the master prompt demands a fresh rewrite');
  ok(/THE CAPTURED EXISTING SITE IS THE SOURCE OF TRUTH/.test(master), 'replica → the captured site is the source of truth');
  ok(/1440x900 and 375x812/.test(master), 'replica → rendered comparison at matching widths');
  const dev = text({ ...base, copy_ownership: 'previous_developer' }, 'master').text;
  ok(/Do NOT reproduce/.test(dev), 'previous developer → rewrite as well');
  const own = text({ ...base, copy_ownership: 'client_wrote' }, 'master').text;
  ok(/MAY be preserved/.test(own) && !/Do NOT reproduce/.test(own), 'client-owned copy → may be preserved');
  ok(text({ ...base, copy_ownership: '' }, 'capture').blockedBy.includes('Copy ownership'), 'a rebuild with no ownership answer is flagged');
  const vqa = text(base, 'visual_qa').text;
  ok(/REPLICA CHECK/.test(vqa) && /section by section/.test(vqa) && /SAME widths/.test(vqa), 'replica visual QA compares side by side at the same widths');
  const setup = text(base, 'setup').text;
  ok(/npm create astro@latest/.test(setup) && /astro add tailwind sitemap/.test(setup), 'a rebuild starts from a fresh Astro project');
}

console.log('\n── FACTS ──');
{
  const state = parseWebsiteBuild(READY);
  const rows = facts(state);
  const get = (k: string) => rows.find((r) => r.key === k)!;
  ok(get('services').status === 'verified', 'onboarding services start VERIFIED (the client stated them)');
  ok(get('phone').status === 'detected', 'the lead-row phone starts as NEEDS APPROVAL');
  ok(get('directory_profiles').status === 'detected' && get('directory_profiles').source.includes('crawl'), 'crawl-detected facts are NEEDS APPROVAL and name their source');
  ok(get('response_time').status === 'missing', 'a template fact nobody has is MISSING');
  const master = text(READY, 'master').text;
  const D = section(master, '## D.', '## E.'), E = section(master, '## E.', '## F.');
  ok(!D.includes('07852') && E.includes('07852'), 'a detected fact is in the FORBIDDEN list, not the verified list');
  ok(/VERIFIED FACTS MAY BE USED/.test(master) && /UNVERIFIED FACTS MUST NOT BE PUBLISHED/.test(master), 'both rules are stated verbatim');
  ok(E.includes('Do not say 24/7') || master.includes('MUST NOT SAY: Do not say 24/7'), 'the client\u2019s must-not-say reaches the prompt');

  /* Paul approves the phone, rejects the directory, edits the owner — then it is saved and reloaded. */
  const decided = { ...READY, facts: [
    { key: 'phone', label: 'Phone number', value: '07852 130513', status: 'verified', source: 'paid client record' },
    { key: 'directory_profiles', label: 'Third-party / directory profiles', value: 'Checkatrade', status: 'rejected', source: 'crawl' },
    { key: 'owner_name', label: 'Owner', value: 'Steve Cooper', status: 'verified', source: 'added by Paul' },
    { key: 'custom_gas_safe_number', label: 'Gas Safe number', value: '123456', status: 'verified', source: 'added by Paul' },
  ] };
  const roundTrip = parseWebsiteBuild(JSON.parse(JSON.stringify(normaliseWebsiteBuild(decided))));
  ok(roundTrip.facts.length === 4 && roundTrip.facts.find((f) => f.key === 'owner_name')!.value === 'Steve Cooper', 'edits persist through the server\u2019s save rule');
  const m2 = text(decided, 'master').text;
  const D2 = section(m2, '## D.', '## E.'), E2 = section(m2, '## E.', '## F.');
  ok(D2.includes('07852 130513') && D2.includes('Steve Cooper') && D2.includes('Gas Safe number: 123456'), 'approved and added facts become usable');
  ok(!D2.includes('Checkatrade') && /Rejected[\s\S]*Checkatrade/.test(E2), 'a rejected fact is forbidden');
  const s = factsSummary(facts(roundTrip));
  ok(s.verified >= 6 && s.awaiting >= 1, `the summary counts verified (${s.verified}) and awaiting (${s.awaiting})`);
  const pasted = parseFactLines('Services: Boiler repair\nResponse time: within 2 hours\nnot a fact line', MCL_TEMPLATE, 'capture');
  ok(pasted.length === 2 && pasted.every((f) => f.status === 'detected'), 'pasted capture facts arrive as NEEDS APPROVAL, never verified');
  ok(pasted[1].key === 'response_time', 'a pasted label matching a template fact reuses its key');
  const drift = mergeFacts(candidateFacts(ctx() as unknown as FactsContext), [{ key: 'services', label: 'Services', value: 'Boiler repair', status: 'verified', source: 'x' }], MCL_TEMPLATE);
  ok(/Since you approved this/.test(drift.find((r) => r.key === 'services')!.note), 'a source that changed after approval is flagged');
}

console.log('\n── ARCHITECTURE ──');
{
  const pages = parsePageLines([
    'action | family | /new-path/ | Title | old url | target | note',
    'keep | homepage | / | Home | https://www.scplumbing.co.uk/ | |',
    'create | service | /services/boiler-repair/ | Boiler repair | | |',
    'consolidate | other | | Pipe sizing | https://www.scplumbing.co.uk/helpful-info/pipe-sizing | /services/boiler-repair/ | merged',
    'bogus | whatever | /x/ | X | | |',
  ].join('\n'), PAGE_ACTIONS, PAGE_FAMILIES);
  ok(pages.length === 4, 'pasted page lines parse (header row skipped)');
  ok(pages[3].action === 'undecided' && pages[3].family === 'other', 'an unknown action is UNDECIDED, never guessed');
  const redirects = redirectsFromPages(pages, []);
  ok(redirects.length === 1 && redirects[0].from === '/helpful-info/pipe-sizing' && redirects[0].to === '/services/boiler-repair/', 'a consolidated page yields its one-hop redirect');
  const state = parseWebsiteBuild(JSON.parse(JSON.stringify(normaliseWebsiteBuild({ pages, redirects }))));
  ok(state.pages.length === 4 && state.redirects.length === 1, 'pages and redirects persist through the save rule');
  const issues = checkArchitecture(state.pages, state.redirects);
  ok(issues.some((i) => i.level === 'error' && /need a decision/.test(i.message)), 'an undecided page blocks the step');
  const chain = checkArchitecture([], parseRedirectText('/a -> /b/ | x\n/b/ -> /c/ | y'));
  ok(chain.some((i) => i.level === 'error' && /Chain/.test(i.message)), 'a redirect chain is an error');
  ok(checkArchitecture([], parseRedirectText('/a -> /a | x')).some((i) => /itself/.test(i.message)), 'a self-redirect is an error');
  const shadow = checkArchitecture([{ id: '1', family: 'service', title: '', path: '/boilers/', action: 'keep', old_url: '', target: '', notes: '' }], parseRedirectText('/boilers -> /services/ | x'));
  ok(shadow.some((i) => /live page in the plan AND redirected/.test(i.message)), 'redirecting a kept page is an error');
  const flood = checkArchitecture([], parseRedirectText('/a -> / | x\n/b -> / | x\n/c -> / | x\n/d -> /e/ | x'));
  ok(flood.some((i) => i.level === 'warning' && /homepage/.test(i.message)), 'a flood of redirects to the homepage is flagged');
  ok(parseRedirectText('/old /new/ 301').length === 1 && parseRedirectText('/old /new/ 301')[0].to === '/new/', '_redirects style lines are accepted');
  const crawlSeed = seedFromCrawl(ctx().crawl!.result!.signals!.checkedPages, []);
  ok(crawlSeed.length === 2 && crawlSeed.every((p) => p.action === 'undecided'), 'old URLs from the stored crawl are seeded UNDECIDED');
  const master = text({ ...READY, pages: state.pages, redirects: state.redirects }, 'master').text;
  ok(master.includes('/helpful-info/pipe-sizing  /services/boiler-repair/  301'), 'the approved redirect map is in the master prompt');
  ok(/Do not add pages that are not on this list/.test(master), 'the prompt forbids pages beyond the plan');
}

console.log('\n── BUILD PACK ──');
{
  const all = pack(READY);
  ok(all.map((p) => p.id).join(',') === 'setup,capture,master,local,preview,visual_qa,seo_qa,production,final_qa', 'all nine outputs, in order');
  const setup = all.find((p) => p.id === 'setup')!;
  ok(setup.blockedBy.length === 0, 'setup is ready once repo, owner and folder are recorded');
  for (const c of ['git clone --branch main https://github.com/Beyondweb2/MCLocksmiths.git', 'robocopy', '/XD .git node_modules dist .astro', 'git init -b main', 'git remote add origin https://github.com/Beyondweb2/SCPlumbingGas.git', 'git push -u origin main', 'https://github.com/new', 'npm install']) {
    ok(setup.text.includes(c), `setup includes: ${c}`);
  }
  ok(/already exists/.test(setup.text), 'setup refuses to copy over an existing folder');
  ok(setup.text.includes('"C:\\Users\\paulj\\_templates\\mcl-local-trades"'), 'the template cache sits beside the client folder, quoted for PowerShell');
  const master = all.find((p) => p.id === 'master')!;
  const heads = ['A. PROJECT MISSION', 'B. BUILD MODE', 'C. SOURCE OF TRUTH', 'D. VERIFIED BUSINESS FACTS', 'E. UNVERIFIED / FORBIDDEN CLAIMS', 'F. EXISTING SITE INVENTORY', 'G. VISUAL REQUIREMENTS', 'H. APPROVED PAGE ARCHITECTURE', 'I. REDIRECT MAP', 'J. CONTENT REQUIREMENTS', 'K. SEO / GEO REQUIREMENTS', 'L. ASSET RULES', 'M. TECHNICAL REQUIREMENTS', 'N. GIT RULES', 'O. PREVIEW / DEPLOYMENT PROCESS', 'P. QA', 'Q. DEFINITION OF DONE'];
  const idx = heads.map((h) => master.text.indexOf('## ' + h));
  ok(idx.every((n) => n > 0) && idx.every((n, k) => k === 0 || n > idx[k - 1]), 'the master prompt has sections A–Q in order');
  ok(/Work autonomously[\s\S]{0,300}without stopping after each file/.test(master.text), 'the master prompt tells Opus to work through without stopping');
  for (const w of ['CRAWLABLE', 'OAI-SearchBot', 'no accidental noindex', 'fake reviews', 'llms.txt']) ok(master.text.includes(w), `the Findable standard includes "${w}"`);
  ok(/PRODUCTION: never/.test(master.text), 'Claude may never deploy production');

  const local = all.find((p) => p.id === 'local')!;
  ok(local.text.includes('Set-Location "C:\\Users\\paulj\\SCPlumbingGas"') && local.text.includes('npm run dev') && local.text.includes('http://localhost:4321'), 'local preview: folder, command and expected URL');
  const preview = all.find((p) => p.id === 'preview')!;
  ok(preview.blockedBy.some((b) => /Cloudflare project/.test(b)) && preview.text.includes(MARK.project), 'no Cloudflare project → flagged, and the name is NOT invented');
  const prod = all.find((p) => p.id === 'production')!;
  ok(prod.blockedBy.length > 0 && !/wrangler/.test(prod.text), 'production is REFUSED (no command at all) until project, preview and domain exist');

  const ready = pack({ ...READY, cloudflare_project: 'sc-plumbing-gas', preview_url: 'https://preview.sc-plumbing-gas.pages.dev' });
  const pv = ready.find((p) => p.id === 'preview')!, pr = ready.find((p) => p.id === 'production')!;
  ok(pv.blockedBy.length === 0 && pv.text.includes('npx wrangler pages deploy dist --project-name sc-plumbing-gas --branch preview'), 'preview deploys to the recorded project on the preview branch');
  ok(pv.text.includes('https://preview.sc-plumbing-gas.pages.dev') && pv.text.includes('RESEND_API_KEY'), 'preview names the expected URL and the form secrets');
  ok(pr.blockedBy.length === 0 && pr.text.includes('--project-name sc-plumbing-gas --branch main') && pr.text.includes('git status'), 'production is generated once everything is recorded');
  ok(pack({ ...READY, cloudflare_project: 'Bad Name!' }).find((p) => p.id === 'preview')!.blockedBy.some((b) => /lowercase/.test(b)), 'a malformed project name is refused');
  ok(ready.find((p) => p.id === 'master')!.text.includes('--project-name sc-plumbing-gas --branch preview'), 'with a project, Claude is told the exact preview command');

  const cmds = [...all, ...ready, ...pack({ ...READY, build_mode: 'rebuild', rebuild_style: 'replica', copy_ownership: 'unknown' })].filter((p) => p.kind === 'commands');
  const bad = cmds.flatMap((p) => p.text.split('\n').filter((l) => !l.trim().startsWith('#')).filter((l) => FORBIDDEN_COMMAND_PATTERNS.some((re) => re.test(l))));
  ok(bad.length === 0, `no generated command force-pushes, resets, rebases, amends, cleans or deletes${bad.length ? ': ' + bad.join(' | ') : ''}`);
  ok(suggestRepoName('SC Plumbing & Gas Ltd') === 'SCPlumbingGas', 'repo-name suggestion');
  ok(suggestCloudflareProject('SCPlumbingGas') === 'sc-plumbing-gas', 'project-name suggestion');
  ok(text(READY, 'seo_qa').text.includes('OAI-SearchBot') && text(READY, 'final_qa').text.includes('one 301 straight to a 200'), 'the SEO/GEO and final QA prompts carry their checks');
}

console.log('\n── PROGRESS IS DERIVED ──');
{
  const s = parseWebsiteBuild({});
  const st = websiteBuildStages({ state: s, hasExistingSite: true, factsAwaiting: 0, architectureErrors: 0, setupMissing: ['Repository name'] });
  ok(st.length === 7 && st.every((x) => !x.done || x.stage === 'capture' && !x.applicable), 'an empty build has nothing done');
  const live = websiteBuildStages({ state: parseWebsiteBuild({ production_url: 'https://x.co.uk', qa: { production_checked: true } }), hasExistingSite: false, factsAwaiting: 0, architectureErrors: 0, setupMissing: [] });
  ok(live.find((x) => x.stage === 'live')!.done, 'live = a production URL AND the production check ticked');
  ok(!websiteBuildStages({ state: parseWebsiteBuild({ production_url: 'https://x.co.uk' }), hasExistingSite: false, factsAwaiting: 0, architectureErrors: 0, setupMissing: [] }).find((x) => x.stage === 'live')!.done, 'a URL alone is not "live verified"');
}

console.log('\n── THE SAVE RULE ──');
{
  const n = normaliseWebsiteBuild({ build_mode: 'template', evil: 'x', status: 'qa', qa: { visual_qa: true, rogue: true }, facts: [{ key: 'a', value: 'b', status: 'hacked' }], notes: 'n'.repeat(20000) });
  ok(!('evil' in n) && !('status' in n), 'unknown keys (and the retired status token) are dropped');
  ok(JSON.stringify(n.qa) === '{"visual_qa":true}', 'only known QA keys survive');
  ok((n.facts as Array<{ status: string }>)[0].status === 'detected', 'an unknown fact status falls to NEEDS APPROVAL, never verified');
  ok((n.notes as string).length === 8000, 'lengths are capped');
  ok(parseWebsiteBuild({ pages: Array.from({ length: 500 }, (_, k) => ({ title: 'p' + k })) }).pages.length === 200, 'page count is capped');
}

console.log('\n── PASS 2 — FOUND ON THE FIRST PRODUCTION RUN (SC Plumbing, 2026-09-23) ──');
{
  const c = ctx({ onboarding: { ...ctx().onboarding!, gbp_exists: 'yes_all' } });
  const rows = facts(parseWebsiteBuild(READY), c);
  ok(!rows.some((r) => r.key === 'gbp' || /yes_all/.test(r.value)), 'the onboarding GBP consent answer is never offered as a website fact');
  const order = rows.map((r) => r.status);
  const firstVerified = order.indexOf('verified'), lastDetected = order.lastIndexOf('detected');
  ok(lastDetected < firstVerified, 'facts awaiting a decision are listed first');

  const cited = seedFromCited([{ url: 'https://scplumbing.co.uk/emergency-plumber', questions: ['best emergency plumber in Tamworth UK'] }, { url: 'https://scplumbing.co.uk', questions: [] }], []);
  ok(cited.length === 2 && cited.every((p) => p.action === 'undecided'), 'URLs AI engines cited are seeded, undecided');
  ok(/AI engines cited this URL for "best emergency plumber in Tamworth UK"/.test(cited[0].notes), 'and each says which question it was cited for');
  ok(seedFromCited([{ url: 'https://scplumbing.co.uk/emergency-plumber' }], cited).length === 0, 'a URL already in the plan is not added twice');

  const kept = applyAction(cited[0], 'keep');
  ok(kept.path === '/emergency-plumber' && kept.action === 'keep', 'choosing Keep fills the new path from the old URL');
  ok(!/keep it, or redirect/.test(kept.notes) && /AI engines cited/.test(kept.notes), 'the "decide" hint is spent, the evidence stays');
  const crawlRow = seedFromCrawl([{ url: 'https://x.co.uk/a', kind: 'other' }], [])[0];
  ok(applyAction(crawlRow, 'remove').notes === '', 'a crawl seeding hint is cleared once decided');
  ok(applyAction({ ...crawlRow, path: '/custom/' }, 'keep').path === '/custom/', 'Keep never overwrites a path Paul typed');

  const removed = checkArchitecture([applyAction(crawlRow, 'remove')], []);
  ok(removed.some((i) => i.level === 'warning' && /no redirect, so they will show "not found"/.test(i.message)), 'removing an old page with no redirect is flagged');
  ok(!checkArchitecture([applyAction(crawlRow, 'remove')], parseRedirectText('/a -> /b/ | moved')).some((i) => /not found/.test(i.message)), 'and the flag clears once a redirect exists');
}

console.log('\n── SAFETY — the page reads one action and writes one ──');
{
  const page = readFileSync(new URL('../src/pages/WebsiteBuild.tsx', import.meta.url), 'utf8');
  const actions = [...page.matchAll(/call\(\{ action: '([a-z_]+)'/g)].map((m) => m[1]);
  ok(actions.length > 0 && actions.every((a) => a === 'rebuild_context' || a === 'save_website_build'), `only rebuild_context and save_website_build are called (${[...new Set(actions)].join(', ')})`);
  ok(!/create-ai-audit|crawl-check|run-seo-scan|send-whatsapp|whatsapp|notify-|functions\.invoke|sendEmail|resend/i.test(page.replace(/\/\*[\s\S]*?\*\//g, '')), 'no audit, crawl, WhatsApp or email is reachable from the page');
  ok(/invokeEdge<Record<string, any>>\('paid-client-hub'/.test(page), 'and it talks only to paid-client-hub');
  const hub = readFileSync(new URL('../supabase/functions/paid-client-hub/index.ts', import.meta.url), 'utf8');
  ok(/import \{ normaliseWebsiteBuild \} from "\.\.\/\.\.\/\.\.\/src\/lib\/websiteBuildState\.ts"/.test(hub), 'the server saves through the SAME shape module the browser reads with');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
