/* Room to improve the website — the site score (v1 2026-10-23; v2 2026-10-30, feat/site-score-v2; docs/site-score.md,
   src/lib/siteScore.ts). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  PARTIAL_LINE, SITE_SCORE_CAP, SITE_SCORE_CATEGORY_POINTS, SITE_SCORE_CHECKS, SITE_SCORE_GROUP_LABELS, SITE_SCORE_VERSION, siteScoreBand,
  siteScoreCheckOf, siteScoreColumns, siteScoreForRow, siteScoreFromSummary, siteScoreGroupOf, siteScoreSortKey, siteScoreViewFor, type SiteScoreCategory,
} from '../src/lib/siteScore.ts';
import type { WebsiteCheckSummary, WebsiteIssue } from '../src/lib/websiteCheck.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const issue = (id: string, severity: WebsiteIssue['severity'], over: Partial<WebsiteIssue> = {}): WebsiteIssue =>
  ({ id, severity, title: id, saw: `saw ${id}`, meaning: '', count: 1, pages: [`https://example.co.uk/${id}`], ...over });
const summary = (over: Partial<WebsiteCheckSummary> = {}): WebsiteCheckSummary => ({
  version: 1, depth: 'deep', checkedAt: '2026-10-20T10:00:00Z', pagesRead: 30, pagesFound: 30, capped: false,
  issues: [], strengths: [], notChecked: [], failure: null, ...over,
});
const SITE = { url: 'https://example.co.uk/' };

/* ── the rubric: Paul's seven categories ── */
ok(SITE_SCORE_VERSION === 3, 'rubric version 3 (v2 weights + the severity cap)');
ok(JSON.stringify(SITE_SCORE_CATEGORY_POINTS) === JSON.stringify({ reachable: 20, identity: 15, services: 20, content: 15, structured: 10, consistency: 10, basics: 10 }),
  'Reachable 20, Identity 15, Services 20, Content 15, Structured data 10, Consistency 10, Basics 10');
ok(Object.values(SITE_SCORE_CATEGORY_POINTS).reduce((a, b) => a + b, 0) === 100, 'the categories make 100');
for (const c of Object.keys(SITE_SCORE_CATEGORY_POINTS) as SiteScoreCategory[]) {
  const sum = SITE_SCORE_CHECKS.filter((k) => k.category === c).reduce((t, k) => t + k.points, 0);
  ok(sum === SITE_SCORE_CATEGORY_POINTS[c], `${c}: its checks make its ${SITE_SCORE_CATEGORY_POINTS[c]} points (${sum})`);
}
const ids = SITE_SCORE_CHECKS.flatMap((c) => c.issues);
ok(new Set(ids).size === ids.length, 'every issue id belongs to ONE check');

/* Every issue id the live website check made on 2026-10-30 (1,615 rows) has a check, or is a state, or is the retired impostor id. */
const LIVE_IDS = `broken_pages canonical_mismatch canonical_off_site client_rendered ct_accreditations_unnamed ct_ai_images ct_area_coverage
ct_areas_not_stated ct_conflicting_facts ct_dead_links ct_generic_copy ct_identical_dates ct_image_alt ct_link_mismatch ct_logo_alt_mismatch
ct_missing_entity_facts ct_mixed_audience ct_no_accreditations ct_no_people ct_no_proof ct_placeholder_content ct_robots_blocks_ai
ct_schema_incomplete ct_schema_mismatch ct_schema_unverified ct_unsourced_claims ct_vague_headings deep_pages duplicate_titles internal_linking
internal_redirects location_unclear long_titles missing_description missing_h1 missing_title multiple_h1 name_unclear near_duplicate_pages
no_about_page no_address no_breadcrumbs no_business_schema no_contact_details no_contact_page no_contact_route no_https no_phone
no_questions_answered no_reviews no_robots no_service_pages no_sitemap no_viewport noindex_home noindex_important_page noindex_pages
one_page_site redirects_to_other_domain robots_blocks_all robots_blocks_oai-searchbot robots_blocks_pages_bingbot robots_blocks_pages_googlebot
robots_blocks_pages_oai-searchbot robots_blocks_pages_perplexitybot robots_blocks_perplexitybot robots_disallowed_pages schema_malformed
schema_wrong_domain search_crawler_refused service_page_gaps services_on_one_page sitemap_off_site sitemap_only_pages slow_pages some_slow_pages
thin_key_pages thin_pages town_missing unreachable_pages vs_address_not_on_key_pages vs_business_schema vs_duplicate_faq_pages
vs_duplicate_homepage vs_faq_no_schema vs_key_page_basics vs_name_inconsistent vs_raw_link_markup vs_town_swapped_pages`.split(/\s+/);
const STATE_OR_RETIRED = new Set(['client_rendered', 'robots_blocks_all', 'search_crawler_refused']);
const unmapped = LIVE_IDS.filter((id) => !STATE_OR_RETIRED.has(id) && !siteScoreCheckOf(id));
ok(unmapped.length === 0, `every live issue id has a check (unmapped: ${unmapped.join(', ') || 'none'})`);
ok(siteScoreCheckOf('robots_blocks_oai-searchbot')?.id === 'robots' && siteScoreCheckOf('robots_blocks_pages_googlebot')?.id === 'robots', 'a real crawler blocked in robots.txt counts against robots');
ok(siteScoreCheckOf('search_crawler_refused') === null, 'the old impostor-crawl finding takes nothing (never verified)');

/* ── states: never a number, never a zero ── */
const st = (s: ReturnType<typeof siteScoreFromSummary>) => `${s.state}:${s.score}`;
ok(st(siteScoreFromSummary(summary({ depth: 'failed', pagesRead: 0, failure: 'The website did not respond in time.' }), SITE)) === 'unreachable:null', 'did not answer → Couldn’t reach');
ok(st(siteScoreFromSummary(summary({ issues: [issue('client_rendered', 'medium'), issue('thin_pages', 'medium')] }), SITE)) === 'js_only:null', 'browser-built homepage → JavaScript-only');
ok(st(siteScoreFromSummary(summary({ issues: [issue('robots_blocks_all', 'high')] }), SITE)) === 'robots_blocked:null', 'robots.txt blocks everything → Blocked by robots.txt');
ok(st(siteScoreFromSummary(summary({ pagesRead: 0 }), SITE)) === 'unreachable:null', 'no page read → Couldn’t reach');
const quick = siteScoreFromSummary(summary({ depth: 'quick', pagesRead: 9 }), SITE);
ok(st(quick) === 'partial:null' && quick.reasons[0].text === PARTIAL_LINE, 'a quick check → Quick check only');
ok(st(siteScoreFromSummary(summary(), { url: 'https://www.facebook.com/somebiz' })) === 'profile_only:null', 'a Facebook page on file → Social / directory only');

/* ── the number, with its evidence ── */
const clean = siteScoreFromSummary(summary(), SITE);
ok(clean.state === 'scored' && clean.score === 100 && clean.evidence?.losses.length === 0, 'a deep check with nothing found → 100');
const one = siteScoreFromSummary(summary({ issues: [issue('no_https', 'medium')] }), SITE);
ok(one.score === 96 && one.evidence?.losses[0].points === 4 && one.evidence.losses[0].url === 'https://example.co.uk/no_https', 'no HTTPS (graded medium, so no cap) → its 4 points, with the page');
const low = siteScoreFromSummary(summary({ issues: [issue('no_viewport', 'low')] }), SITE);
ok(low.score === 99 && low.evidence?.losses[0].points === 0.8, 'a low finding takes 40% of its check');
const stack = siteScoreFromSummary(summary({ issues: [issue('no_phone', 'medium'), issue('no_contact_page', 'medium'), issue('no_contact_details', 'medium')] }), SITE);
ok(stack.detail.categories?.identity === 10 && stack.evidence!.losses.reduce((t, l) => t + l.points, 0) === 5, 'a check never loses more than its points');
ok(stack.evidence!.losses.every((l) => l.quote && l.url), 'every point lost carries a page and a quote');
const quoted = siteScoreFromSummary(summary({ issues: [issue('ct_link_mismatch', 'medium')] }),
  { url: SITE.url, contentTrust: { issues: [{ kind: 'link_mismatch', evidence: ['“EV INSTALLATION” goes to /get-a-quote'] }] } } as never);
ok(quoted.evidence?.losses[0].quote === '“EV INSTALLATION” goes to /get-a-quote', 'the crawl’s own verbatim evidence is the quote where it kept one');
const unknown = siteScoreFromSummary(summary({ issues: [issue('something_new', 'high')] }), SITE);
ok(unknown.score === 100, 'an id with no check takes nothing (the live-id test above notices a new one)');

/* ── only what the crawl verified ── */
const capCrawl = summary({ capped: true, issues: [issue('no_about_page', 'low', { absence: true, pages: [] }), issue('town_missing', 'medium', { absence: true, pages: ['https://example.co.uk/'] }), issue('no_sitemap', 'medium', { absence: true, pages: [] })] });
const cs = siteScoreFromSummary(capCrawl, SITE);
ok(!cs.evidence!.losses.some((l) => l.issueId === 'no_about_page') && cs.evidence!.notJudged.some((n) => n.startsWith('no_about_page')), 'a site-wide "not found" on a capped crawl is not judged');
ok(cs.evidence!.losses.some((l) => l.issueId === 'town_missing') && cs.evidence!.losses.some((l) => l.issueId === 'no_sitemap'), 'a "not found" on a page it read, or a site file it fetched, still counts');
ok(cs.evidence!.notJudged.some((n) => /OAI-SearchBot/.test(n)), 'real crawler visits are said as not judged (the crawl does not record them)');

/* ── the calibration cap ── */
const onePage = siteScoreFromSummary(summary({ issues: [issue('one_page_site', 'medium')] }), SITE);
ok(onePage.score === SITE_SCORE_CAP && onePage.detail.capped === true && onePage.evidence?.cap?.uncapped === 80 && siteScoreBand(onePage.score!) === 'big',
  'a one-page site loses all of Services and is capped in Big gains, with its evidence');
const crammed = siteScoreFromSummary(summary({ issues: [issue('services_on_one_page', 'medium')] }), SITE);
ok(crammed.score === SITE_SCORE_CAP && siteScoreBand(crammed.score!) === 'big', 'services crammed on one page → capped in Big gains');
const lowAnyway = siteScoreFromSummary(summary({ issues: ['one_page_site', 'no_https', 'no_contact_route', 'name_unclear', 'town_missing', 'ct_placeholder_content', 'no_business_schema'].map((id) => issue(id, 'high')) }), SITE);
ok(lowAnyway.score! < SITE_SCORE_CAP && lowAnyway.evidence?.cap === null, 'a site already below the cap keeps its own number');

/* ── the severity cap (v3, Paul 2026-10-30): any verified HIGH finding caps in Big gains ── */
const placeholder = siteScoreFromSummary(summary({ issues: [issue('ct_placeholder_content', 'high')] }), SITE);
ok(placeholder.score === SITE_SCORE_CAP && placeholder.evidence?.cap?.kind === 'severity' && placeholder.evidence.cap.uncapped === 97
  && placeholder.evidence.cap.quote === 'saw ct_placeholder_content' && placeholder.reasons[0].text === 'ct_placeholder_content',
  'live placeholder text (HIGH) on an otherwise strong site → capped in Big gains, with its evidence and first reason');
for (const id of ['noindex_home', 'no_https', 'canonical_off_site', 'ct_robots_blocks_ai']) {
  ok(siteScoreFromSummary(summary({ issues: [issue(id, 'high')] }), SITE).score === SITE_SCORE_CAP, `HIGH ${id} → capped in Big gains`);
}
const medium = siteScoreFromSummary(summary({ issues: [issue('ct_placeholder_content', 'medium')] }), SITE);
ok(medium.score! > SITE_SCORE_CAP && medium.evidence?.cap === null, 'the same finding graded MEDIUM by the check does not cap (the grade decides, not the id)');
const unverified = siteScoreFromSummary(summary({ capped: true, issues: [issue('no_contact_route', 'high', { absence: true, pages: [] })] }), SITE);
ok(unverified.score! > SITE_SCORE_CAP && unverified.evidence?.cap === null, 'a HIGH "not found" the crawl could not verify (capped crawl, no page) does not cap');
const highUnmapped = siteScoreFromSummary(summary({ issues: [issue('something_new_and_unmapped', 'high')] }), SITE);
ok(highUnmapped.score === 100 && highUnmapped.evidence?.cap === null, 'a HIGH finding that takes no points here is not seen by the score, so does not cap');
const both = siteScoreFromSummary(summary({ issues: [issue('one_page_site', 'medium'), issue('no_https', 'high')] }), SITE);
ok(both.score === SITE_SCORE_CAP && both.evidence?.cap?.kind === 'structure', 'a one-page site with a HIGH finding is capped once, for the structure');

/* ── same site, same number ── */
const many = ['no_reviews', 'missing_h1', 'no_sitemap', 'ct_areas_not_stated', 'slow_pages', 'service_page_gaps', 'vs_business_schema', 'no_phone'].map((id, n) => issue(id, (['high', 'medium', 'low'] as const)[n % 3]));
const a = siteScoreFromSummary(summary({ issues: many }), SITE);
const b = siteScoreFromSummary(summary({ issues: [...many].reverse() }), SITE);
ok(JSON.stringify(a) === JSON.stringify(b), 'the order the check stored things in changes nothing');
ok(JSON.stringify(a) === JSON.stringify(siteScoreFromSummary(summary({ issues: many }), SITE)), 'scoring twice gives the same result');
ok(a.reasons.length === 3 && a.reasons.every((r) => r.kind === 'down'), 'three biggest losses are kept for the row');

/* ── the row path ── */
const row = siteScoreForRow({ result: { url: SITE.url, websiteCheck: summary({ issues: [issue('no_https', 'medium')] }) } as never, created_at: '2026-10-20T10:00:00Z' } as never);
ok(row?.score === 96, 'a row with a stored summary is scored from it');
ok(siteScoreForRow(null) === null, 'no row → no score');

/* ── the columns ── */
const cols = siteScoreColumns(null, '2026-10-30T00:00:00Z');
ok(Object.values(cols).every((v) => v === null) && Object.keys(cols).length === 7, 'no score → every column null (never an old score beside a new check)');
ok(!('site_score_v1' in cols), 'the crawls never write site_score_v1 (the v1 number is kept)');
const c2 = siteScoreColumns(one, '2026-10-30T00:00:00Z');
ok(c2.site_score === 96 && c2.site_score_state === 'scored' && c2.site_score_version === SITE_SCORE_VERSION && Array.isArray((c2.site_score_evidence as { losses: unknown[] }).losses), 'a score → number, state, version, reasons, evidence');

/* ── the view: website first, then the stored score ── */
const stored = (o: Partial<{ site_score: number | null; site_score_state: string | null; site_score_version: number | null }>) =>
  ({ site_score: null, site_score_state: null, site_score_version: null, site_score_reasons: null, site_score_detail: null, ...o });
const g = (w: string | null, o: Parameters<typeof stored>[0] | null) => siteScoreGroupOf(siteScoreViewFor(w, o ? stored(o) : null));
ok(siteScoreBand(80) === 'little' && siteScoreBand(79) === 'some' && siteScoreBand(60) === 'some' && siteScoreBand(59) === 'big', 'bands: under 60 big gains, 60–79 some gains, 80+ little to gain');
ok(SITE_SCORE_GROUP_LABELS.big === 'Big gains' && SITE_SCORE_GROUP_LABELS.some === 'Some gains' && SITE_SCORE_GROUP_LABELS.little === 'Little to gain', 'the band words');
ok(g(null, null) === 'no_website' && g('', null) === 'no_website', 'no website on file → No website');
ok(g('https://www.facebook.com/x', null) === 'profile_only', 'a social page on file → Social / directory only, even with no crawl');
ok(g('https://example.co.uk', null) === 'not_checked', 'a website with no crawl row → Not checked');
ok(g('https://example.co.uk', { site_score: null, site_score_state: 'scored', site_score_version: 2 }) === 'not_checked', 'scored with no number → Not checked, never a made-up number');
ok(g('https://example.co.uk', { site_score_state: 'mystery', site_score_version: 2 }) === 'not_checked', 'an unknown state → Not checked, never guessed');
ok(g('https://example.co.uk', { site_score_state: 'unreadable', site_score_version: 1 }) === 'unreachable', 'a v1 "unreadable" row reads as Couldn’t reach until re-scored');
ok(g('https://example.co.uk', { site_score: 42, site_score_state: 'scored', site_score_version: 2 }) === 'big', 'a number → its band');
ok(siteScoreSortKey(siteScoreViewFor('https://a.co.uk', stored({ site_score: 30, site_score_state: 'scored', site_score_version: 2 })))
  < siteScoreSortKey(siteScoreViewFor('https://a.co.uk', stored({ site_score: 90, site_score_state: 'scored', site_score_version: 2 })))
  && siteScoreSortKey(siteScoreViewFor('https://a.co.uk', stored({ site_score: 90, site_score_state: 'scored', site_score_version: 2 }))) < siteScoreSortKey(siteScoreViewFor(null, null)),
  'sort: most room to improve first, the states after');

/* ── both crawls write it beside the result ── */
const cc = read('supabase/functions/crawl-check/index.ts');
ok(/siteScoreColumns\(siteScoreForRow\(\{ result: storedResult/.test(cc) && /last_failed_attempt: null,\n\s+\.\.\.scoreCols,\n\s+\}, \{ onConflict: "lead_id" \}\)/.test(cc), 'crawl-check stores the score with the result it scored');
const cj = read('supabase/functions/_shared/crawl-job.ts');
ok(/siteScoreColumns\(siteScoreForRow\(\{ result, full_evidence/.test(cj) && /last_failed_attempt: null,\n\s+\.\.\.scoreCols,\n\s+\}, \{ onConflict: "lead_id" \}\)/.test(cj), 'the deep crawl stores the score with the result it scored');
ok(!/\.update\(\{[^}]*site_score/.test(cc + cj), 'the failed-attempt note never touches the score (the last good check keeps its score)');

/* ── the lists never read the evidence ── */
const lists = read('src/hooks/useLeadCrawls.ts');
ok(/LEAD_CRAWL_LIST_SELECT = '[^']*site_score_detail'/.test(lists) && !/LEAD_CRAWL_LIST_SELECT = '[^']*site_score_evidence/.test(lists), 'the list select leaves the evidence out (one lead’s detail reads it)');

/* ── the Inbox: the pill at the right of the status line, never shrinking (Paul chose "Inbox 1", 2026-10-30) ── */
const inbox = read('src/pages/Inbox.tsx');
ok(!/site-score-status-line/.test(inbox) && (inbox.match(/<SiteScorePill /g) ?? []).length === 1, 'Inbox list card: ONE website score pill, in the AI Visibility row, not also on the status line');
ok(/data-testid="ai-visibility-line">[\s\S]{0,400}<SiteScorePill/.test(inbox), 'Inbox: the pill is in the AI Visibility row');
ok(/afterEngines=\{<LeadSiteScore /.test(inbox), 'Inbox detail: the pill is beside the Google AI pill in the AI visibility card');

/* ── Outreach: its own Website column, number + band + bar (Paul chose "B", 2026-10-30) ── */
const outreach = read('src/components/OutreachTable.tsx');
ok(/>Website<\/TableHead>\n\s+<TableHead className="w-\[160px\] text-center">Actions<\/TableHead>/.test(outreach), 'Outreach: a Website column just before Actions');
ok(/colSpan=\{readOnly \? 5 : 8\}/.test(outreach), 'Outreach: the empty row spans the extra column');
ok(/<SiteScoreBar score=/.test(outreach) && !/<SiteScorePill /.test(outreach), 'Outreach: the bar in its column, no pill among the action icons');

/* ── words: room to improve, never a prediction ── */
const badge = read('src/components/SiteScoreBadge.tsx');
ok(/Room to improve the website/.test(badge) && /Not a prediction of AI visibility/.test(badge), 'labelled "Room to improve the website", said not to be a prediction of AI visibility');
ok(!/will (be|get) (named|found|visible)|predict(s|ed)? (your|their)/i.test(badge.replace(/\/\*[\s\S]*?\*\//g, '')), 'no prediction wording on the screen');

/* ── team only: who may import it ── */
const ALLOWED = new Set([
  'src/components/SiteScoreBadge.tsx', 'src/lib/crawlResult.ts', 'src/hooks/useLeadCrawls.ts', 'src/pages/Inbox.tsx', 'src/components/OutreachTable.tsx',
  'src/components/LeadDetailDialog.tsx', 'supabase/functions/crawl-check/index.ts', 'supabase/functions/_shared/crawl-job.ts',
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
const outsiders = importers.filter((f) => !ALLOWED.has(f));
ok(outsiders.length === 0, `only the team's rows, the lead detail and the two crawl writers reach the score — no sender, template, report or client page (outside: ${outsiders.join(', ') || 'none'})`);
ok(['src/components/OutreachTable.tsx', 'src/pages/Inbox.tsx', 'src/components/LeadDetailDialog.tsx'].every((f) => importers.includes(f)), 'Outreach, the Inbox and the lead detail show it');
ok(!/Master Standard|Findable AI Visibility/i.test(read('src/lib/siteScore.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') + badge), 'no Master Standard wording in anything the team sees');

/* ── the migrations: additive ── */
const mig1 = read('supabase/migrations/20261125090000_site_score.sql').replace(/--.*$/gm, '');
ok(!/\b(drop|delete|truncate|update|rename|generated)\b/i.test(mig1), 'v1 migration drops, rewrites and deletes nothing');
const mig2 = read('supabase/migrations/20261130150000_site_score_v2.sql').replace(/--.*$/gm, '');
ok(!/\b(delete|truncate|rename|generated|drop (table|column))\b/i.test(mig2), 'v2 migration deletes no row, table or column');
ok((mig2.match(/\bdrop\b/gi) ?? []).length === 2 && /drop constraint if exists lead_crawl_checks_site_score_state_check/.test(mig2) && /drop policy if exists admin_select_crawl_checks/.test(mig2),
  'v2 drops only the state check it widens and its own policy (re-run safe)');
ok((mig2.match(/\bupdate\b/gi) ?? []).length === 1 && /set site_score_v1 = jsonb_build_object[\s\S]*where site_score_version = 1 and site_score_v1 is null/.test(mig2), 'the one update copies v1 into site_score_v1 where it is empty');
ok(/'unreadable', 'js_only', 'robots_blocked', 'unreachable', 'profile_only'/.test(mig2), 'the state check keeps v1’s unreadable and adds the v2 states');
ok(/create policy admin_select_crawl_checks on public\.lead_crawl_checks for select to authenticated\n\s+using \(\(select public\.my_role\(\)\) = 'admin'\)/.test(mig2), 'the admin reads crawl rows by role (my_role), select only');
ok(/alter publication supabase_realtime add table public\.lead_crawl_checks/.test(mig2), 'crawl rows are published, so the Inbox hears a crawl finish');

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall site score checks passed');
