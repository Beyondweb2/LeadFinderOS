/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CRAWL IN THE AUDIT + THE CALL SCREEN (2026-10-19, feat/crawl-in-audit-callscreen).

   Pinned here:
     1. The AI-visibility page checks (visibilityChecks.ts) find each of Paul's issues from the page itself, with the page
        it was read on — and find nothing on a clean site (no invented fault).
     2. A site check starts at the site's own homepage, never the deep page a listing linked to (crawlStartUrl).
     3. The call screen's one-time start (callScreenCrawl.ts): only when the check is MISSING, one at a time, rate limited.
     4. The voice note is built from the call script's playbook: same AI result, same website line, no report offer.
     5. Google AI scoring is versioned: older audits keep their score; newer ones count Google AI only where shown.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { processPage } from '../src/lib/fullCrawl.ts';
import { buildVisibilityChecks, footerName, titleBrand } from '../src/lib/visibilityChecks.ts';
import { crawlStartUrl } from '../src/lib/crawlUrl.ts';
import { callScreenCrawlRefusal, CALL_SCREEN_CRAWL_COOLDOWN_MS, CALL_SCREEN_CRAWL_PER_PERSON } from '../src/lib/callScreenCrawl.ts';
import { voiceNoteFromCall, VOICE_NOTE_IN_TOUCH_NOTE } from '../src/lib/voiceNoteFromCall.ts';
import { CONFIDENCE_LINE } from '../src/lib/offerFactSheet.ts';
import { ISSUES_FOUND_MANY_LINE, ISSUES_FOUND_ONE_LINE } from '../src/lib/callScript.ts';
import { scoringMethodFor, GOOGLE_AI_SCORED_SINCE, AI_OVERVIEW_LABEL, NO_OVERVIEW_TEXT } from '../src/lib/aiOverview.ts';
import { scoreHookRun, initialHookStateV2 } from '../src/lib/hookScore.ts';

let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log('  PASS ' + label);
  else { failures++; console.log('  FAIL ' + label); }
}

/* ── fixtures: a small site, built from HTML exactly as the crawl reads it ── */
const O = 'https://example-driving.co.uk';
const para = (s: string) => Array(8).fill(s).join(' ');
const page = (o: { title: string; h1?: string | null; desc?: string | null; body: string; schema?: unknown; footer?: string; nav?: string[] }) =>
  `<html><head><title>${o.title}</title>${o.desc === null ? '' : `<meta name="description" content="${o.desc ?? 'd'}">`}`
  + (o.schema ? `<script type="application/ld+json">${JSON.stringify(o.schema)}</script>` : '')
  + `</head><body><nav>${(o.nav ?? []).map((h) => `<a href="${h}">${h}</a>`).join('')}</nav>${o.h1 === null ? '' : `<h1>${o.h1 ?? o.title}</h1>`}<p>${o.body}</p>`
  + `<footer>${o.footer ?? ''}</footer></body></html>`;
const ev = (path: string, html: string) => processPage({ url: O + path, finalUrl: O + path, status: 200, xRobotsTag: null, html, isHome: path === '/' }, O + '/');
const vis = (pages: Array<ReturnType<typeof ev>>) => buildVisibilityChecks({ servedUrl: O + '/', partial: false, pages: pages.map((p) => ({ url: p.d.finalUrl, d: p.d, b: p.b, t: p.t, footer: p.footer, nav: p.nav })) });
const ids = (r: ReturnType<typeof vis>) => r.findings.map((f) => f.id);

const ORG = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Driving Lessons Margate' };
const NAV = ['/driving-lessons-margate/', '/driving-lessons-ramsgate/', '/prices/'];
const FAQ_Q = '<h2>How much are driving lessons in TOWN?</h2><p>From £35.</p><h2>How many lessons will I need in TOWN?</h2><p>Most need 40.</p><h2>Which areas do you cover?</h2><p>All of Thanet.</p>';

console.log('── 1. The page checks: each finding from the page, with its page ──');
{
  const messy = [
    ev('/', page({ title: 'Driving Lessons | Learning Curve Driving Lessons', h1: 'Driving Lessons in Margate', body: para('Friendly patient driving lessons for learners of every age.'), schema: ORG, nav: NAV, footer: '© 2025 PassFirstTimeInKent. All rights reserved.' })),
    ev('/driving-lessons-margate/', page({ title: 'Margate | Learning Curve Driving Lessons', body: para('We teach learners in Margate with calm lessons and mock tests.') + ' <a href="/x"', schema: ORG })),
    ev('/driving-lessons-ramsgate/', page({ title: 'Ramsgate | Learning Curve Driving Lessons', body: para('We teach learners in Ramsgate with calm lessons and mock tests.'), schema: ORG })),
    ev('/prices/', page({ title: 'Prices | Learning Curve Driving Lessons', h1: null, desc: null, body: para('Lesson prices start at thirty five pounds an hour for learners.') + ' 39 Devonshire Gardens, Margate CT9 3AD. Also in: a href="/driving-lessons-birchington/" Birchington', schema: ORG })),
    ev('/margate-faqs/', page({ title: 'Margate FAQs | Learning Curve Driving Lessons', body: FAQ_Q.replace(/TOWN/g, 'Margate') + para('Answers to common questions from learners.'), schema: ORG })),
    ev('/ramsgate-faqs/', page({ title: 'Ramsgate FAQs | Learning Curve Driving Lessons', body: FAQ_Q.replace(/TOWN/g, 'Ramsgate') + para('More answers to common learner questions here.'), schema: ORG })),
    ev('/homepage-design/', page({ title: 'Home design | Learning Curve Driving Lessons', h1: 'Driving lessons in Margate. Learn and pass.', body: para('A different draft of the homepage text for testing layouts.'), schema: ORG })),
  ];
  const r = vis(messy);
  const got = ids(r);
  const f = (id: string) => r.findings.find((x) => x.id === id);
  ok(got.includes('vs_business_schema') && /generic “Organization”/.test(f('vs_business_schema')!.title) && /no phone number or address/.test(f('vs_business_schema')!.title), 'only a generic Organization schema, no telephone or address');
  ok(f('vs_business_schema')!.severity === 'low', '…and it is a MINOR point (schema was tested negative as a lever — CLAUDE.md §5)');
  ok(got.includes('vs_faq_no_schema') && f('vs_faq_no_schema')!.urls.some((u) => u.endsWith('/margate-faqs/')), 'FAQs on the page, no FAQPage markup — with the page');
  ok(got.includes('vs_address_not_on_key_pages') && /homepage/.test(f('vs_address_not_on_key_pages')!.title) && /CT9 3AD/.test(f('vs_address_not_on_key_pages')!.saw), 'the address exists (on /prices) but not on the homepage — quoted');
  const name = f('vs_name_inconsistent');
  ok(!!name && /Learning Curve Driving Lessons/.test(name.saw) && /Driving Lessons Margate/.test(name.saw) && /PassFirstTimeInKent/.test(name.saw) && /three/.test(name.title), 'the business name written three ways: titles, markup and footer');
  ok(got.includes('vs_town_swapped_pages') && f('vs_town_swapped_pages')!.urls.length >= 2, 'area pages that are the same text with only the town swapped');
  ok(got.includes('vs_duplicate_faq_pages'), 'FAQ pages that repeat each other');
  ok(got.includes('vs_duplicate_homepage') && f('vs_duplicate_homepage')!.urls.some((u) => u.endsWith('/homepage-design/')), 'an indexable second version of the homepage');
  ok(got.includes('vs_key_page_basics') && /\/prices: no H1, no meta description/.test(f('vs_key_page_basics')!.saw), 'a key page (in the menu) with no H1 and no meta description');
  ok(got.includes('vs_raw_link_markup') && /a href="\/driving-lessons-birchington\/"/.test(f('vs_raw_link_markup')!.saw), 'link code showing as text, quoted from the page');
  ok(r.findings.every((x) => x.saw && (x.urls.length > 0 || x.id === 'vs_name_inconsistent')), 'every finding says what was seen, and where');
}
{
  const LB = { '@context': 'https://schema.org', '@type': 'DrivingSchool', name: 'Clean Driving School', telephone: '01843 000000', address: { streetAddress: '1 High St', postalCode: 'CT9 1AA' } };
  const clean = [
    ev('/', page({ title: 'Clean Driving School | Driving lessons in Margate', body: para('Patient lessons for nervous learners across Margate and Broadstairs.') + ' 1 High St, Margate CT9 1AA', schema: LB, nav: ['/manual/', '/automatic/'], footer: '© 2025 Clean Driving School' })),
    ev('/manual/', page({ title: 'Manual lessons | Clean Driving School', body: para('Manual gearbox lessons cover clutch control, hill starts and roundabouts.') + ' CT9 1AA', schema: LB })),
    ev('/automatic/', page({ title: 'Automatic lessons | Clean Driving School', body: para('Automatic cars suit learners who want to focus on the road and hazards.') + ' CT9 1AA', schema: LB })),
  ];
  const r = vis(clean);
  ok(r.findings.length === 0, 'a clean site → no finding at all, nothing invented (' + ids(r).join() + ')');
}
ok(titleBrand(['A | Brand Name', 'B | Brand Name', 'C | Brand Name', 'D – Other'])?.brand === 'Brand Name', 'the title brand is the part most titles share');
ok(footerName('© 2024 Smith & Sons Ltd. All rights reserved') === 'Smith & Sons Ltd' && footerName('no name here') === null, 'the footer name is read from the copyright line only');
{
  /* The address is judged on the WHOLE page: a postcode past the kept-text cut is still "shown". */
  const longBody = para('x '.repeat(600)) + ' Our office is at 1 Long Road, Margate CT9 2BB';
  const home = ev('/', page({ title: 'Long Site | Long Site', body: longBody, nav: ['/a/'] }));
  const a = ev('/a/', page({ title: 'A | Long Site', body: para('Some other text about the service offered here.') + ' 1 Long Road, Margate CT9 2BB' }));
  ok(home.t.length >= 4900 && (home.d.postcodes ?? []).includes('CT9 2BB'), 'the postcodes are read from the whole page, before the kept text is cut');
  ok(!ids(vis([home, a])).includes('vs_address_not_on_key_pages'), '…so a footer address past the cut is never reported missing');
}

console.log('── 2. A site check starts at the homepage ──');
ok(crawlStartUrl('https://learningcurvedrivinglessons.co.uk/driving-lessons-canterbury/') === 'https://learningcurvedrivinglessons.co.uk/', 'a deep page → the site\'s own homepage');
ok(crawlStartUrl('passfastinkent.co.uk/?utm_campaign=gmb') === 'https://passfastinkent.co.uk/', 'tracking parameters dropped, scheme added');
ok(crawlStartUrl('https://sites.google.com/view/mybiz/contact') === 'https://sites.google.com/view/mybiz/' && crawlStartUrl('https://joe.wixsite.com/plumbing/about') === 'https://joe.wixsite.com/plumbing/', 'a site hosted under a path keeps its own path');
{
  const cc = readFileSync(new URL('../supabase/functions/crawl-check/index.ts', import.meta.url), 'utf8');
  ok(/homeUrl = crawlStartUrl\(u\.href\)/.test(cc), 'crawl-check uses it for every crawl');
  ok(/buildVisibilityChecks\(/.test(cc) && /\.\.\.\(visibility \? \{ visibility \} : \{\}\)/.test(cc), 'the quick check runs the page checks on the pages it already fetched and stores them');
  const cj = readFileSync(new URL('../supabase/functions/_shared/crawl-job.ts', import.meta.url), 'utf8');
  ok(/buildVisibilityChecks\(/.test(cj) && /mergeVisibilityChecks\(full\.audit, visibility\)/.test(cj), 'the deep check runs them too and merges them into its stored audit');
}

console.log('── 3. The call screen starts a MISSING check, once ──');
{
  const base = { leadId: 'L', website: 'https://x.co.uk', hasCompletedAudit: true, hasCrawlRow: false, jobRunning: false, lastStartMs: null, startsByPersonInWindow: 0, nowMs: 1_000_000_000 };
  ok(callScreenCrawlRefusal(base) === null, 'audit done, website, no check → start it');
  ok(callScreenCrawlRefusal({ ...base, hasCrawlRow: true }) === 'already_checked', 'a stored check (any age) → never re-crawled by opening a screen');
  ok(callScreenCrawlRefusal({ ...base, website: '' }) === 'no_website' && callScreenCrawlRefusal({ ...base, hasCompletedAudit: false }) === 'no_audit', 'no website / no completed audit → nothing');
  ok(callScreenCrawlRefusal({ ...base, jobRunning: true }) === 'running', 'a crawl already running → nothing (one at a time)');
  ok(callScreenCrawlRefusal({ ...base, lastStartMs: base.nowMs - 1000 }) === 'recently_started' && callScreenCrawlRefusal({ ...base, lastStartMs: base.nowMs - CALL_SCREEN_CRAWL_COOLDOWN_MS - 1 }) === null, 'two screens opening at once start one');
  ok(callScreenCrawlRefusal({ ...base, startsByPersonInWindow: CALL_SCREEN_CRAWL_PER_PERSON }) === 'rate_limited', 'rate limited per person');
  const cc = readFileSync(new URL('../supabase/functions/crawl-check/index.ts', import.meta.url), 'utf8');
  ok(/const callScreen = !internal && body\?\.requested_from === CALL_SCREEN_CRAWL_SOURCE/.test(cc) && /if \(refusal\) return json\(\{ ok: true, skipped: refusal \}\)/.test(cc), 'crawl-check asks the rule and skips quietly');
  const hook = readFileSync(new URL('../src/hooks/useCallScreenCrawl.ts', import.meta.url), 'utf8');
  ok(/STARTED\.has\(leadId\)/.test(hook) && /findingsStatus === 'not_crawled'/.test(hook) && /audit\.state === 'ready'/.test(hook), 'the screen asks once per lead, only with a ready AI result and no check');
}

console.log('── 4. The voice note is the call script, spoken ──');
{
  const issue = (id: string, title: string) => ({ id, severity: 'medium' as const, title, saw: 's', meaning: 'm', count: 1, pages: [O + '/'] });
  const check = (serious: ReturnType<typeof issue>[]) => ({ state: serious.length ? 'issues' : 'clean', summary: null, serious, minor: [], headline: '', coverageLine: null, stale: false, ageDays: 1, checkedDay: '18 Oct' }) as never;
  const p = (findingsStatus: string, serious: ReturnType<typeof issue>[], mode = 'cold') => ({
    evidence: { kind: 'gap', competitors: ['A Ltd', 'B Ltd', 'C Ltd'] } as never,
    script: { opener: ['Hi mate, I was looking for a driving instructor in Margate, so I asked Gemini and it mentioned A Ltd, B Ltd and C Ltd, but not you.'] } as never,
    site: { source: 'own_site', label: null } as never, websiteCheck: check(serious), findingsStatus: findingsStatus as never, mode: mode as never,
    context: { caller: 'Sam Jones' },
  });
  const two = voiceNoteFromCall(p('findings', [issue('vs_name_inconsistent', 'x'), issue('vs_duplicate_homepage', 'y')]));
  ok(two.lines[0] === "Hi mate, it's Sam from Findable." && /asked Gemini and it mentioned A Ltd, B Ltd and C Ltd, but not you\./.test(two.text), 'who is speaking, then the same AI result and names as the call script');
  ok(two.lines.includes(ISSUES_FOUND_MANY_LINE) && /business name is written different ways/.test(two.text), 'the same website-issues line, then the issues in plain words');
  ok(voiceNoteFromCall(p('findings', [issue('vs_raw_link_markup', 'z')])).lines.includes(ISSUES_FOUND_ONE_LINE), 'one issue → "an issue"');
  const clean = voiceNoteFromCall(p('clean', []));
  ok(!/website|site/i.test(clean.lines.slice(0, -1).join(' ')) && /look after the website yourself/.test(clean.text), 'no serious issue → nothing about the site (only the closing question)');
  ok(!/report|audit|show you|link|£/i.test(two.text.replace(CONFIDENCE_LINE, '')) && two.lines.includes(CONFIDENCE_LINE) && (two.text.match(/guarantee/gi) ?? []).length === 1, 'no report offer, no link, no price; the guarantee only as the fact sheet confidence line (Paul, 2026-10-20)');
  ok(voiceNoteFromCall(p('findings', [issue('a', 'b')], 'follow_up')).note === VOICE_NOTE_IN_TOUCH_NOTE && !/messaged|in touch/i.test(voiceNoteFromCall(p('findings', [issue('a', 'b')], 'follow_up')).text), 'already in touch → a note for the person recording, never said');
  const ui = readFileSync(new URL('../src/components/VoiceNoteScriptButton.tsx', import.meta.url), 'utf8');
  ok(!/invokeEdge|functions\.invoke/.test(ui), 'no model call and no edge function: nothing to generate');
}

console.log('── 5. Google AI scoring is versioned ──');
{
  ok(AI_OVERVIEW_LABEL === 'Google AI' && NO_OVERVIEW_TEXT === 'No AI answer shown', 'renamed "Google AI"; none shown says "No AI answer shown"');
  ok(scoringMethodFor('2026-10-01T00:00:00Z') === 1 && scoringMethodFor(null) === 1 && scoringMethodFor(GOOGLE_AI_SCORED_SINCE) === 2, 'older audits keep method 1; new audits are method 2');
  const Q = ['q1', 'q2', 'q3'];
  const state = initialHookStateV2(Q);
  const cell = (named: boolean) => ({ answer_text: named ? 'Try Acme Driving.' : 'Try Other Co.', competitors: [], self_named: named });
  const rows = Q.map((question, i) => ({ question, status: 'done', result: {
    chatgpt: cell(false), gemini: cell(i === 0),
    ...(i === 2 ? { _ai_overview: 'not_shown' } : { _ai_overview: 'shown', ai_overview: cell(i === 1) }),
  } }));
  const ctx = { named: { businessName: 'Acme Driving', trade: null, town: null } };
  const v1 = scoreHookRun(state, rows, ctx);
  const v2 = scoreHookRun(state, rows, { ...ctx, scoringMethod: 2 });
  ok(v1.scored.method === 1 && v1.scored.named === v1.named && v1.scored.expected === 6 && v1.scored.googleAi.inScore === false, 'method 1: the stored score, unchanged, Google AI not in it');
  ok(v2.scored.expected === 8 && v2.scored.googleAi.shown === 2 && v2.scored.googleAi.notShown === 1, 'method 2: Google AI counted only where Google showed an AI answer (the "none shown" search is left out, not a penalty)');
  ok(v2.named === v1.named && v2.expected === v1.expected && v2.allNamed === v1.allNamed && JSON.stringify(v2.hook) === JSON.stringify(v1.hook), 'the send gates, the hook pick and the 6/6 rule are untouched (method 1 fields)');
  /* The guarantee follows the BASELINE's method (Paul, 2026-10-19): scripts/guarantee-google-ai.test.ts. */
}

if (failures) throw new Error(`${failures} crawl / call screen checks failed`);
console.log('\nAll crawl / call screen checks passed.');
