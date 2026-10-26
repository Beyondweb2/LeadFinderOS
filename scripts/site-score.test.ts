/* The site score (2026-10-23, feat/site-score; docs/site-score.md, src/lib/siteScore.ts). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  PARTIAL_LINE, SITE_SCORE_AREA_POINTS, SITE_SCORE_RAW_MAX, SITE_SCORE_VERSION, siteScoreAreaOf, siteScoreBand, siteScoreColumns,
  siteScoreForRow, siteScoreFromSummary, siteScoreView, type SiteScoreArea,
} from '../src/lib/siteScore.ts';
import type { WebsiteCheckSummary, WebsiteIssue } from '../src/lib/websiteCheck.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const issue = (id: string, severity: WebsiteIssue['severity'], title = id): WebsiteIssue => ({ id, severity, title, saw: '', meaning: '', count: 1, pages: [] });
const summary = (over: Partial<WebsiteCheckSummary> = {}): WebsiteCheckSummary => ({
  version: 1, depth: 'deep', checkedAt: '2026-10-20T10:00:00Z', pagesRead: 30, pagesFound: 30, capped: false,
  issues: [], strengths: [], notChecked: [], failure: null, ...over,
});

/* ── the rubric ── */
ok(Object.values(SITE_SCORE_AREA_POINTS).reduce((a, b) => a + b, 0) === SITE_SCORE_RAW_MAX && SITE_SCORE_RAW_MAX === 90, 'v1 areas sum to 90 points');
ok(SITE_SCORE_VERSION === 1, 'rubric version 1');

/* Every issue id the live website check made on 2026-10-23 (1,419 rows) counts against an area. */
const LIVE_IDS = `broken_pages canonical_mismatch canonical_off_domain canonical_off_site client_rendered ct_accreditations_unnamed ct_ai_images
ct_area_coverage ct_areas_not_stated ct_broken_links ct_conflicting_facts ct_dead_links ct_generic_copy ct_identical_dates ct_image_alt ct_link_mismatch
ct_logo_alt_mismatch ct_missing_entity_facts ct_mixed_audience ct_no_accreditations ct_no_https ct_no_people ct_no_proof ct_no_sitemap ct_no_viewport
ct_placeholder_content ct_robots_blocks_ai ct_schema_incomplete ct_schema_mismatch ct_schema_unverified ct_unsourced_claims ct_vague_headings deep_pages
duplicate_titles internal_linking internal_redirects location_unclear long_titles missing_description missing_h1 missing_title multiple_h1 name_unclear
near_duplicate_pages no_about_page no_address no_breadcrumbs no_business_schema no_contact_details no_contact_page no_contact_route no_https no_phone
no_questions_answered no_reviews no_robots no_service_pages no_sitemap no_viewport noindex_home noindex_important_page noindex_pages one_page_site
redirects_to_other_domain robots_blocks_all robots_blocks_oai-searchbot robots_blocks_pages_bingbot robots_blocks_pages_googlebot
robots_blocks_pages_oai-searchbot robots_blocks_pages_perplexitybot robots_blocks_perplexitybot robots_disallowed_pages schema_malformed
robots_blocks_ai_search schema_wrong_domain service_page_gaps services_on_one_page sitemap_off_site sitemap_only_pages slow_pages some_slow_pages
thin_key_pages thin_pages town_missing unreachable_pages vs_address_not_on_key_pages vs_business_schema vs_duplicate_faq_pages vs_duplicate_homepage
vs_faq_no_schema vs_key_page_basics vs_name_inconsistent vs_raw_link_markup vs_town_swapped_pages`.split(/\s+/);
const unmapped = LIVE_IDS.filter((id) => id !== 'client_rendered' && !siteScoreAreaOf(id));
ok(unmapped.length === 0, `every live issue id has an area (unmapped: ${unmapped.join(', ') || 'none'})`);

/* ── states: never a zero for "could not read" ── */
const failed = siteScoreFromSummary(summary({ depth: 'failed', pagesRead: 0, failure: 'The website did not respond in time.' }));
ok(failed.state === 'unreadable' && failed.score === null && failed.reasons[0].text === 'The website did not respond in time.', 'a site that did not answer → unreadable, no number, the reason kept');
const js = siteScoreFromSummary(summary({ issues: [issue('client_rendered', 'medium'), issue('thin_pages', 'medium')] }));
ok(js.state === 'unreadable' && js.score === null && /builds its text in the browser/.test(js.reasons[0].text), 'a JavaScript-built homepage → unreadable, never a low score');
ok(siteScoreFromSummary(summary({ pagesRead: 0 })).state === 'unreadable', 'no page read → unreadable');
const quick = siteScoreFromSummary(summary({ depth: 'quick', pagesRead: 9 }));
ok(quick.state === 'partial' && quick.score === null && quick.reasons[0].text === PARTIAL_LINE, 'a quick check → partial, no number (quick checks scored ~30 points high live)');

/* ── the number ── */
const clean = siteScoreFromSummary(summary({ strengths: [{ id: 'service_pages', title: 'Service pages found' }] }));
ok(clean.state === 'scored' && clean.score === 100 && clean.reasons.length === 1 && clean.reasons[0].kind === 'up', 'a deep check with nothing found → 100, one strength said');
const one = siteScoreFromSummary(summary({ issues: [issue('no_reviews', 'medium', 'No reviews')] }));
// trust 12 pts × 35% = 4.2 lost → 85.8 / 90 → 95
ok(one.score === 95 && one.reasons[0].text === 'No reviews' && one.reasons[0].points === 5, 'one medium trust issue → 95, said with what it took off');
const whole = siteScoreFromSummary(summary({ issues: [issue('no_contact_route', 'high')] }));
ok(whole.score === Math.round((90 - 12) * 100 / 90) && whole.detail.areas?.contact === 0, 'no way to contact at all → the whole Contact area');
const capped = siteScoreFromSummary(summary({ issues: ['no_phone', 'no_contact_details', 'no_contact_page', 'ct_link_mismatch'].map((id) => issue(id, 'high')) }));
ok(capped.detail.areas?.contact === 0 && capped.score === whole.score, 'an area never goes below zero');
const unknown = siteScoreFromSummary(summary({ issues: [issue('something_new', 'high')] }));
ok(unknown.score === 100, 'an id with no area takes nothing off (the live-id test above notices a new one)');

/* ── same site, same number ── */
const many = ['no_reviews', 'missing_h1', 'no_sitemap', 'ct_areas_not_stated', 'slow_pages', 'no_service_pages', 'vs_business_schema'].map((id, n) => issue(id, (['high', 'medium', 'low'] as const)[n % 3]));
const a = siteScoreFromSummary(summary({ issues: many, strengths: [{ id: 'phone_shown', title: 'Phone number shown' }, { id: 'reviews_shown', title: 'Reviews' }] }));
const b = siteScoreFromSummary(summary({ issues: [...many].reverse(), strengths: [{ id: 'reviews_shown', title: 'Reviews' }, { id: 'phone_shown', title: 'Phone number shown' }] }));
ok(JSON.stringify(a) === JSON.stringify(b), 'the order the check stored things in changes nothing (score, reasons, areas)');
ok(JSON.stringify(a) === JSON.stringify(siteScoreFromSummary(summary({ issues: many, strengths: [{ id: 'phone_shown', title: 'Phone number shown' }, { id: 'reviews_shown', title: 'Reviews' }] }))), 'scoring twice gives the same result');
ok(a.reasons.filter((r) => r.kind === 'down').length === 3, 'three biggest losses are kept as reasons');
ok(!a.reasons.some((r) => r.kind === 'up' && r.text === 'Reviews'), 'no strength is said from an area that lost points (reviews shown, but no_reviews charged)');

/* ── the row path: the stored summary, or the same summary built ── */
const row = siteScoreForRow({ result: { websiteCheck: summary({ issues: [issue('no_reviews', 'medium')] }) } as never, created_at: '2026-10-20T10:00:00Z' } as never);
ok(row?.score === 95, 'a row with a stored summary is scored from it');
ok(siteScoreForRow(null) === null, 'no row → no score');

/* ── the columns ── */
const cols = siteScoreColumns(null, '2026-10-23T00:00:00Z');
ok(Object.values(cols).every((v) => v === null) && Object.keys(cols).length === 6, 'no score → every column written as null (never an old score beside a new check)');
const c2 = siteScoreColumns(one, '2026-10-23T00:00:00Z');
ok(c2.site_score === 95 && c2.site_score_state === 'scored' && c2.site_score_version === 1 && Array.isArray(c2.site_score_reasons), 'a score → number, state, version, reasons');
ok(siteScoreColumns(failed, 'x').site_score === null && siteScoreColumns(failed, 'x').site_score_state === 'unreadable', 'unreadable is stored as a state with a null number');

/* ── the view ── */
ok(siteScoreBand(75) === 'strong' && siteScoreBand(74) === 'fair' && siteScoreBand(50) === 'fair' && siteScoreBand(49) === 'weak', 'bands: 75+ strong, 50–74 fair, under 50 weak');
ok(siteScoreView(null).kind === 'none' && siteScoreView({ site_score: null, site_score_state: null, site_score_version: null, site_score_reasons: null, site_score_detail: null }).kind === 'none', 'nothing stored → none');
ok(siteScoreView({ site_score: null, site_score_state: 'scored', site_score_version: 1, site_score_reasons: [], site_score_detail: null }).kind === 'none', 'scored with no number → none, never a made-up number');
ok(siteScoreView({ site_score: null, site_score_state: 'mystery', site_score_version: 1, site_score_reasons: [], site_score_detail: null }).kind === 'none', 'an unknown state → none, never guessed as unreadable');
ok(siteScoreView({ site_score: null, site_score_state: 'unreadable', site_score_version: 1, site_score_reasons: [{ kind: 'down', text: 'x' }], site_score_detail: null }).kind === 'unreadable', 'unreadable → its own state');

/* ── both crawls write it beside the result ── */
const cc = read('supabase/functions/crawl-check/index.ts');
ok(/siteScoreColumns\(siteScoreForRow\(\{ result: storedResult/.test(cc) && /last_failed_attempt: null,\n\s+\.\.\.scoreCols,\n\s+\}, \{ onConflict: "lead_id" \}\)/.test(cc), 'crawl-check stores the score with the result it scored');
const cj = read('supabase/functions/_shared/crawl-job.ts');
ok(/siteScoreColumns\(siteScoreForRow\(\{ result, full_evidence/.test(cj) && /last_failed_attempt: null,\n\s+\.\.\.scoreCols,\n\s+\}, \{ onConflict: "lead_id" \}\)/.test(cj), 'the deep crawl stores the score with the result it scored');
ok(!/\.update\(\{[^}]*site_score/.test(cc + cj), 'the failed-attempt note never touches the score (the last good check keeps its score)');

/* ── team only: who may import it ── */
const ALLOWED = new Set([
  'src/components/SiteScoreBadge.tsx', 'src/lib/crawlResult.ts', 'src/hooks/useLeadCrawls.ts', 'src/pages/Inbox.tsx',
  'supabase/functions/crawl-check/index.ts', 'supabase/functions/_shared/crawl-job.ts',
]);
const importers: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) { if (name !== 'node_modules') walk(rel); continue; }
    if (!/\.(ts|tsx)$/.test(name) || rel === 'src/lib/siteScore.ts') continue;
    if (/from ['"][^'"]*\/siteScore(\.ts)?['"]|from ['"]@\/lib\/siteScore['"]|SiteScoreBadge['"]/.test(read(rel)) && !/SiteScoreBadge\.tsx$/.test(rel)) importers.push(rel);
  }
};
walk('src'); walk('supabase/functions');
const outsiders = importers.filter((f) => !ALLOWED.has(f) && f !== 'src/components/OutreachTable.tsx');
ok(outsiders.length === 0, `only the two rows and the two crawl writers reach the score — no sender, template, report or client page (outside: ${outsiders.join(', ') || 'none'})`);
ok(importers.includes('src/components/OutreachTable.tsx') && importers.includes('src/pages/Inbox.tsx'), 'the Outreach row and the Inbox row show it');
ok(!/Master Standard|Findable AI Visibility/i.test(read('src/lib/siteScore.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') + read('src/components/SiteScoreBadge.tsx')), 'no Master Standard wording in anything the team sees');

/* ── the migration: additive only ── */
const mig = read('supabase/migrations/20261125090000_site_score.sql').replace(/--.*$/gm, '');
ok(!/\b(drop|delete|truncate|update|rename|generated)\b/i.test(mig), 'the migration drops, rewrites and deletes nothing');
ok((mig.match(/add column if not exists site_score/g) ?? []).length === 6, 'six nullable score columns');

/* ── the area labels stay plain ── */
const areas = Object.keys(SITE_SCORE_AREA_POINTS) as SiteScoreArea[];
ok(areas.length === 9, 'nine areas');

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall site score checks passed');
