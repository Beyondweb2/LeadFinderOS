/* THE FINDABLE WEBSITE QUALITY STANDARD (websiteQuality.ts, Paul 2026-09-25) — the second half of
   Preview Ready. Sections:
     A. the saved shape (allowlist, caps, round trip)
     B. the no-downgrade rule (strengths)
     C. content completeness (one primary page per intent)
     D. the old-vs-new upgrade review, and the ONE Preview Ready gate
     E. the build result contract (quality.oldVsNew)
     F. recon strengths (parsed, merged, decisions survive a re-import)
     G. the prompts carry the standard
     H. there is only one gate (the page never calls the technical-only gate) */

import { readFileSync } from 'node:fs';
import {
  EMPTY_QUALITY, intentProblems, mergeStrengths, proposeIntents, qualityGateProblems, readQuality, readUpgradeReview,
  strengthProblems, strengthId, upgradeProblems, CONTENT_INTENTS, QUALITY_STANDARD_LINES, type QualityState,
} from '../src/lib/websiteQuality.ts';
import { buildExecutionStatus, normaliseWebsiteBuild, parseWebsiteBuild, previewReadyProblems, QA_ITEMS, type WebsiteBuildState } from '../src/lib/websiteBuildState.ts';
import { parseBuildResult, applyBuildResult, executionBlockers, type BuildResult } from '../src/lib/buildExecution.ts';
import { parseReconText, applyRecon, reconPrompt } from '../src/lib/recon.ts';
import { RECON_SCHEMA_LINES } from '../src/lib/reconSchema.ts';
import { FINDABLE_STANDARD } from '../src/lib/buildPack.ts';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const SITE = 'https://www.example-electrical.co.uk/';
const allNeeded = (page = 'section on /') => Object.fromEntries(CONTENT_INTENTS.map((k) => [k, { need: 'needed', page, note: '' }]));
const decided = (over: Partial<QualityState> = {}): QualityState => readQuality({ strengths_reviewed: true, strengths: [], intents: allNeeded(), ...over });
const TECH_OK = {
  result_imported_at: '2026-09-25T12:00:00Z', result_status: 'preview_ready', preview_url: 'https://preview.x.pages.dev', noindex_confirmed: true,
  qa: { buildPassed: true, seedContaminationPassed: true, linksPassed: true, responsivePassed: true, schemaPassed: true },
  pages: ['/', '/services/', '/faqs/', '/areas/', '/contact/'],
};
const state = (over: Record<string, unknown> = {}): WebsiteBuildState => parseWebsiteBuild({ version: 2, route: 'bespoke', source_site_url: SITE, ...over });

/* ── A. the saved shape ── */
{
  const q = readQuality({
    strengths: [
      { category: 'photography', label: '20 genuine job photos', disposition: 'preserve', where: '/our-work/' },
      { category: 'not_a_category', label: 'odd one', disposition: 'burn_it' },
      { category: 'reviews', label: '' },
      { category: 'photography', label: '20 genuine job photos' },
    ],
    strengths_reviewed: 'yes',
    intents: { faq_hub: { need: 'needed', page: '/faqs/' }, bogus_intent: { need: 'needed' }, areas_hub: { need: 'maybe' } },
  });
  ok(q.strengths.length === 2, 'A: an empty label is dropped, a duplicate id kept once');
  ok(q.strengths[1].category === 'other' && q.strengths[1].disposition === '', 'A: an unknown category / disposition falls to other / undecided — never stored as itself');
  ok(q.strengths_reviewed === false, 'A: strengths_reviewed is true only for true');
  ok(q.intents.faq_hub?.page === '/faqs/' && !('bogus_intent' in q.intents) && q.intents.areas_hub === undefined, 'A: intents are an allowlist; an unknown need is dropped');
  const s = state({ quality: { strengths: [{ category: 'reviews', label: 'Google reviews widget', disposition: 'improve', where: '/' }], strengths_reviewed: true, intents: { faq_hub: { need: 'needed', page: '/faqs/' } } },
    build_execution: { ...TECH_OK, upgrade: { verdict: 'upgrade', widths: [1440, 390, 99999], still_stronger: ['hero'] } } });
  const round = parseWebsiteBuild(normaliseWebsiteBuild(s));
  ok(round.quality.strengths[0].disposition === 'improve' && round.quality.strengths_reviewed && round.quality.intents.faq_hub?.page === '/faqs/', 'A: quality survives the server normalise round trip');
  ok(round.build_execution.upgrade.verdict === 'upgrade' && round.build_execution.upgrade.widths.join() === '1440,390' && round.build_execution.upgrade.still_stronger[0] === 'hero', 'A: the upgrade review survives it too (an impossible width dropped)');
  ok(parseWebsiteBuild({}).quality.strengths.length === 0 && parseWebsiteBuild({}).build_execution.upgrade.verdict === '', 'A: an old row reads as nothing decided — never as a pass');
}

/* ── B. the no-downgrade rule ── */
{
  const base = { category: 'photography', label: '20 genuine job photos', evidence: '', source_url: '', where: '', reason: '' };
  ok(strengthProblems(EMPTY_QUALITY, true).some((p) => /not inventoried/.test(p)), 'B: an existing site with no reviewed inventory is a problem');
  ok(strengthProblems(EMPTY_QUALITY, false).length === 0, 'B: no existing site → nothing to inventory');
  const q = (x: object) => readQuality({ strengths_reviewed: true, strengths: [{ ...base, ...x }] });
  ok(strengthProblems(q({}), true).some((p) => /without a decision/.test(p)), 'B: an undecided strength blocks');
  ok(strengthProblems(q({ disposition: 'preserve' }), true).some((p) => /no place on the new site/.test(p)), 'B: a kept strength must say where it now lives');
  ok(strengthProblems(q({ disposition: 'remove' }), true).some((p) => /removed without a reason/.test(p)), 'B: a strength removed without a reason blocks (no-downgrade)');
  ok(strengthProblems(q({ disposition: 'remove', reason: '1,460 thin town pages' }), true).length === 0, 'B: removed WITH a reason is fine');
  ok(strengthProblems(q({ disposition: 'improve', where: '/our-work/' }), true).length === 0, 'B: improved, with a place, is fine');
}

/* ── C. content completeness ── */
{
  ok(intentProblems(EMPTY_QUALITY, []).some((p) => /not assessed for: Services hub/.test(p)), 'C: nothing assessed → every intent named');
  const q = readQuality({ intents: { ...allNeeded(), faq_hub: { need: 'needed', page: '/faqs/' }, areas_hub: { need: 'needed', page: '' }, about: { need: 'not_needed' } } });
  const p = intentProblems(q, ['/', '/services/']);
  ok(p.some((x) => /FAQ hub → \/faqs\/ is not in the build/.test(x)), 'C: a needed intent whose page was not built is a problem');
  ok(p.some((x) => /Areas hub is needed but has no primary page/.test(x)), 'C: needed with no page is a problem');
  ok(p.some((x) => /About marked not needed without a reason/.test(x)), 'C: a core intent dropped needs a reason');
  ok(intentProblems(q, ['/', '/services/', '/faqs']).every((x) => !/faqs/.test(x)), 'C: a path matches with or without its trailing slash');
  const proposed = proposeIntents(EMPTY_QUALITY, [
    { family: 'faq', path: '/faqs/', action: 'create' }, { family: 'services_index', path: '/services/', action: 'keep' },
    { family: 'service', path: '/eicrs/', action: 'keep' }, { family: 'location', path: '/electrician-bath/', action: 'redirect' },
  ]);
  ok(proposed.faq_hub?.page === '/faqs/' && proposed.services_hub?.page === '/services/' && proposed.service_pages?.page === '/services/', 'C: the proposal reads the page plan');
  ok(!proposed.location_pages, 'C: a redirected page is not proposed as a primary page');
  const kept = proposeIntents(readQuality({ intents: { faq_hub: { need: 'not_needed', note: 'covered on service pages' } } }), [{ family: 'faq', path: '/faqs/', action: 'create' }]);
  ok(kept.faq_hub?.need === 'not_needed', 'C: a proposal never overwrites a decision');
}

/* ── D. the upgrade review and THE gate ── */
{
  ok(upgradeProblems(readUpgradeReview({}), true).some((p) => /not reported/.test(p)), 'D: no old-vs-new verdict → not preview ready');
  ok(upgradeProblems(readUpgradeReview({ verdict: 'not_upgrade', widths: [1440, 390] }), true).some((p) => /not visually complete/.test(p)), 'D: "not an upgrade" → Preview is not visually complete');
  ok(upgradeProblems(readUpgradeReview({ verdict: 'upgrade', widths: [1440] }), true).some((p) => /not compared at 390/.test(p)), 'D: mobile must be compared too');
  ok(upgradeProblems(readUpgradeReview({ verdict: 'upgrade', widths: [1440, 390], still_stronger: ['reviews'] }), true).some((p) => /still looks stronger at: reviews/.test(p)), 'D: anything the old site still wins blocks');
  ok(upgradeProblems(readUpgradeReview({ verdict: 'upgrade', widths: [1440, 375] }), true).length === 0, 'D: 1440 + a phone width = compared');
  ok(upgradeProblems(readUpgradeReview({}), false).length === 0, 'D: no old site → no comparison required (completeness still is)');

  const good = state({ quality: decided(), build_execution: { ...TECH_OK, upgrade: { verdict: 'upgrade', widths: [1440, 390] } } });
  ok(previewReadyProblems(good).length === 0 && buildExecutionStatus(good, true) === 'preview_ready', 'D: technical + quality + upgrade → PREVIEW READY');
  const notUp = state({ quality: decided(), build_execution: { ...TECH_OK, upgrade: { verdict: 'not_upgrade', widths: [1440, 390], still_stronger: ['old hero photo'] } } });
  ok(buildExecutionStatus(notUp, true) === 'needs_attention', 'D: technically perfect but not an upgrade → NEEDS ATTENTION, whatever Claude claimed');
  const undecided = state({ build_execution: { ...TECH_OK, upgrade: { verdict: 'upgrade', widths: [1440, 390] } } });
  ok(buildExecutionStatus(undecided, true) === 'needs_attention' && previewReadyProblems(undecided).some((p) => /Content completeness/.test(p)), 'D: an unassessed standard is never read as a pass');
  const newBiz = parseWebsiteBuild({ version: 2, route: 'bespoke', quality: decided({ strengths_reviewed: false }), build_execution: TECH_OK });
  ok(buildExecutionStatus(newBiz, true) === 'preview_ready', 'D: a new business (no old site) needs completeness, not a comparison');
  ok(buildExecutionStatus(newBiz, true, true) === 'needs_attention', 'D: …but the caller who KNOWS there is an old site gets the full gate');
  ok(qualityGateProblems({ quality: decided(), upgrade: readUpgradeReview({ verdict: 'upgrade', widths: [1440, 390] }), hasExistingSite: true, paths: ['/'] }).length === 0, 'D: qualityGateProblems is the sum of the three rules');
  for (const k of ['old_new_upgrade', 'strengths_kept', 'nothing_sparse']) ok(QA_ITEMS.some((q) => q.key === k && q.group === 'preview'), 'D: the Definition of Done has ' + k);
}

/* ── E. the build result contract ── */
{
  const base = { buildResultVersion: 1, status: 'preview_ready', cloudflare: { previewUrl: 'https://preview.x.pages.dev', noindexConfirmed: true }, qa: TECH_OK.qa, build: { pages: TECH_OK.pages } };
  const r1 = parseBuildResult(JSON.stringify({ ...base, quality: { oldVsNew: { verdict: 'not_upgrade', widths: [1440, 390], stillStronger: ['Google reviews'] } } }));
  ok(r1.ok && r1.result.upgrade.verdict === 'not_upgrade' && r1.result.upgrade.still_stronger[0] === 'Google reviews', 'E: quality.oldVsNew is read');
  ok(r1.ok && !r1.summary.ignoredKeys.includes('quality'), 'E: "quality" is a known key, not reported as ignored');
  const r2 = parseBuildResult(JSON.stringify({ ...base, quality: { oldVsNew: { verdict: 'looks great' } } }));
  ok(r2.ok && r2.result.upgrade.verdict === '' && r2.summary.dropped.some((d) => /looks great/.test(d)), 'E: a made-up verdict is dropped and named');
  const r3 = parseBuildResult(JSON.stringify(base));
  ok(r3.ok && r3.result.upgrade.verdict === '', 'E: an old-format result (no quality block) still imports — as not reported');
  const s = state({ quality: decided() });
  const applied = applyBuildResult(s, (r1 as { result: BuildResult }).result, { now: '2026-09-25T13:00:00Z' }).state;
  ok(applied.build_execution.upgrade.verdict === 'not_upgrade' && buildExecutionStatus(applied, true) === 'needs_attention', 'E: an imported "not_upgrade" keeps the preview out of Preview Ready');
}

/* ── F. recon strengths ── */
{
  const recon = { reconVersion: 1, sourceUrl: SITE, pages: [{ url: SITE, pageType: 'homepage' }], facts: [],
    strengths: [
      { category: 'reviews', label: 'Google reviews widget: 5 stars, 138 reviews', evidence: 'homepage, drawn by JavaScript', sourceUrl: SITE, disposition: 'remove' },
      { category: 'photography', label: '14 genuine job photos', sourceUrl: 'javascript:alert(1)' },
    ] };
  const parsed = parseReconText(JSON.stringify(recon));
  ok(parsed.ok && parsed.result.strengths.length === 2 && !parsed.summary.ignoredKeys.includes('strengths'), 'F: strengths are parsed, not ignored');
  ok(parsed.ok && parsed.result.strengths[0].disposition === '', 'F: a decision the recon sends is ignored — only Paul decides');
  ok(parsed.ok && parsed.result.strengths[1].source_url === '', 'F: a non-http URL is dropped');
  const s0 = state();
  const s1 = applyRecon(s0, (parsed as { result: never }).result, [], '2026-09-25T10:00:00Z').state;
  ok(s1.quality.strengths.length === 2, 'F: applyRecon puts them in the inventory');
  const id = strengthId('reviews', 'Google reviews widget: 5 stars, 138 reviews');
  const s2 = { ...s1, quality: { ...s1.quality, strengths: s1.quality.strengths.map((x) => (x.id === id ? { ...x, disposition: 'improve' as const, where: '/' } : x)) } };
  const again = parseReconText(JSON.stringify({ ...recon, strengths: [recon.strengths[0]] }));
  const s3 = applyRecon(s2, (again as { result: never }).result, [], '2026-09-26T10:00:00Z').state;
  ok(s3.quality.strengths.find((x) => x.id === id)?.disposition === 'improve', 'F: Paul\'s decision survives a re-import');
  ok(s3.quality.strengths.length === 2, 'F: a strength the new recon omits is kept, never forgotten');
  ok(mergeStrengths([], []).length === 0, 'F: merge of nothing is nothing');
  ok(RECON_SCHEMA_LINES.join('\n').includes('"strengths"'), 'F: the recon schema asks for strengths');
}

/* ── G. the prompts carry the standard ── */
{
  const s = state({ route: 'bespoke', repo_name: 'X', github_owner: 'o', local_repo_path: 'C:\\x', cloudflare_project: 'x', cloudflare_mode: 'git_connected', canonical_domain: 'x.co.uk' });
  const rp = reconPrompt({ state: s, template: null, facts: [], evidence: {} as never, businessName: 'X', existingSiteUrl: SITE, mustNotSay: '' } as never).text;
  ok(/RENDERED page/.test(rp) && /EXISTING-SITE STRENGTHS/.test(rp), 'G: the recon prompt asks for strengths from the rendered page');
  const blockers = executionBlockers({ state: s, template: null, facts: [], evidence: {} as never, businessName: 'X', existingSiteUrl: SITE, mustNotSay: '' } as never, { readiness: { blockers: [] } } as never);
  ok(blockers.some((b) => /strengths not inventoried/.test(b)) && blockers.some((b) => /Content completeness/.test(b)), 'G: the build prompt is blocked until the standard is decided');
  ok(QUALITY_STANDARD_LINES.join(' ').includes('NO-DOWNGRADE') && QUALITY_STANDARD_LINES.join(' ').includes('Urgent does NOT mean 24/7'), 'G: the standard names the no-downgrade rule and the 24/7 rule');
  ok(FINDABLE_STANDARD.join(' ').includes('OAI-SearchBot'), 'G: the technical standard still requires OAI-SearchBot access');
  const buildPackSrc = readFileSync('src/lib/buildPack.ts', 'utf8');
  ok(/\.\.\.QUALITY_STANDARD_LINES/.test(buildPackSrc), 'G: the master prompt prints the quality standard');
  const execSrc = readFileSync('src/lib/buildExecution.ts', 'utf8');
  ok(/X5b\. THE FINDABLE QUALITY STANDARD/.test(execSrc) && /\.\.\.UPGRADE_QA_LINES/.test(execSrc), 'G: the build prompt prints the standard and the old-vs-new QA');
}

/* ── H. only one gate ── */
{
  const page = readFileSync('src/pages/WebsiteBuild.tsx', 'utf8');
  ok(!/previewGateProblems\(/.test(page), 'H: the page never calls the technical-only gate — it uses previewReadyProblems');
  const exec = readFileSync('src/lib/buildExecution.ts', 'utf8');
  ok(!/previewGateProblems\(/.test(exec), 'H: nor does the retry prompt');
  ok(/buildExecutionStatus\(state, !blocked, !!input\.existingSiteUrl\)/.test(page) && /buildExecutionStatus\(state, true, !!existingSiteUrl\)/.test(page), 'H: both status reads pass what the page knows about the old site');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
if (failures) process.exit(1);
