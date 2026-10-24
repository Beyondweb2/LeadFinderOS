/* THE QUICK REPORT'S v3 LAYOUT (2026-10-23, Paul approved the mockup) — the parts the older Concept 4 suites do not pin:
   the order (hero band → engine tiles → what we found → the questions → what to fix first), the neutral site card where the
   homepage picture will go, and the "what to fix first" lines (siteFixLines.ts): only for findings the crawl made, at most
   three, deduplicated, never a number we do not measure, never a promise. */
import { renderQuickCheckReport, type QuickWebsite } from '../src/lib/aiAuditReportHtml.ts';
import { FIX_ALIASES, FIX_LINES, FIX_LINES_MAX, fixLinesFor } from '../src/lib/siteFixLines.ts';
import type { HookReportSummary } from '../src/lib/hookAudit.ts';

let failures = 0;
function ok(cond: unknown, label: string) { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); }

const eng = (engine: string, label: string, named: boolean, names: string[]) => ({ engine, label, named, names, answerText: `People often mention ${names.join(', ')}.` });
const hook = {
  shape: 'six', questionsTested: 3, maxQuestions: 3, stopReason: 'complete', gap: null, rivalsNamedInstead: 3,
  score: { named: 2, total: 6, percent: 33, googleAiInScore: false, questions: 3, perEngine: [{ engine: 'chatgpt', label: 'ChatGPT', named: 1, total: 3 }, { engine: 'gemini', label: 'Gemini', named: 1, total: 3 }] },
  overviews: [],
  tested: ['Q one?', 'Q two?', 'Q three?'].map((question, i) => ({ question, isGap: false, perEngine: [eng('chatgpt', 'ChatGPT', i === 1, ['Rival A']), eng('gemini', 'Gemini', i === 1, ['Rival B'])] })),
} as unknown as HookReportSummary;

const issues = (kinds: Array<string | undefined>): QuickWebsite => ({
  state: 'issues',
  issues: kinds.map((kind, i) => ({ title: `Finding ${i + 1}`, detail: `Detail ${i + 1}.`, minor: i > 1, kind })),
});
const html = (w: QuickWebsite, host: string | null = 'example-school.co.uk') => renderQuickCheckReport(hook, 'Example School', w, false, host);

/* ── A. the order ── */
{
  const h = html(issues(['search_blocked', 'thin_pages', 'missing_h1', 'unsourced_claims']));
  const at = (s: string) => h.indexOf(s);
  ok(at('class="q4-hero2"') >= 0 && at('class="q4-hero2"') < at('class="q4-engs"'), 'A: the hero band comes first, then the engine tiles');
  ok(at('class="q4-engs"') < at('class="q4-found"') && at('class="q4-found"') < at('class="q4-chats"'), 'A: tiles → what we found → the questions');
  ok(!/q4-fix|What to fix first/.test(h), 'A: there is no "What to fix first" section (removed at Paul\'s request, 2026-10-23)');
  ok(/How visible is <em>Example School<\/em> in AI search\?/.test(h) && /class="q4-ring" style="--pct:33"/.test(h), 'A: the hero asks the question and the ring carries the real percentage');
}

/* ── B. the site card — neutral, nothing drawn ── */
{
  const h = html(issues(['search_blocked', 'thin_pages']));
  ok(/class="q4-site-host">example-school\.co\.uk</.test(h) && /2 things found/.test(h), 'B: the card names their address and counts what was found');
  ok(!/<img\b/i.test(h), 'B: no picture of any kind unless a real capture was handed in');
  const withShot = renderQuickCheckReport(hook, 'Example School', issues(['search_blocked', 'thin_pages']), false, 'example-school.co.uk', { url: 'https://x.example/sign/a.jpg?token=t&x=1', at: '2026-10-23T10:00:00Z' });
  ok(/<img src="https:\/\/x\.example\/sign\/a\.jpg\?token=t&amp;x=1" alt=""/.test(withShot) && /class="q4-site q4-site--shot"/.test(withShot), 'B: a handed-in capture is shown (link escaped), as the card\'s picture');
  ok(/Your homepage, as we saw it on 23 Oct 2026/.test(withShot) && /2 things found/.test(withShot), 'B: the picture is captioned with its DATE and still counts what was found');
  ok(/class="q4-site-bar"/.test(withShot) && !/q4-site-body/.test(withShot.slice(withShot.indexOf('q4-site--shot'), withShot.indexOf('q4-panel--site'))), 'B: the picture card carries the address bar and caption, and never the neutral body beside the picture');
  ok(!/<img\b/i.test(renderQuickCheckReport(hook, 'Example School', { state: 'clean' }, false, 'example-school.co.uk', { url: 'https://x.example/a.jpg', at: null })), 'B: a clean site (no issues, no split) never shows the card or the picture');
  const none = html(issues(['search_blocked']), null);
  ok(/class="q4-site-host">Your website</.test(none) && /1 thing found/.test(none), 'B: no address known → the card says only "Your website"; one finding is singular');
}

/* ── C. what to fix first is not rendered in ANY state ── */
{
  const states: QuickWebsite[] = [issues(['search_blocked', 'thin_pages', 'missing_h1']), { state: 'clean' }, { state: 'none' }, { state: 'unknown' }];
  ok(states.every((w) => !/q4-fix|What to fix first/.test(html(w))), 'C: no state of the website section prints a fix row');
  ok(/class="q4-panel q4-panel--site"/.test(html({ state: 'clean' })) && !/class="q4-split"/.test(html({ state: 'clean' })), 'C: a clean site keeps its own panel, no split with the card');
}

/* ── D. the fix lines themselves ── */
{
  const all = Object.entries(FIX_LINES).filter(([, v]) => v) as Array<[string, { title: string; detail: string }]>;
  ok(all.length >= 25, `D: ${all.length} kinds carry a line; the rest are deliberately silent`);
  ok(all.every(([, v]) => v.title.length <= 60 && v.detail.length <= 100 && /[.]$/.test(v.detail)), 'D: every line is short, plain and a full sentence');
  ok(all.every(([, v]) => !/\d/.test(v.title + v.detail)), 'D: no figure in any line — nothing we do not measure');
  ok(all.every(([, v]) => !/guarantee|refund|£|\bwill (get|make|rank|name)\b|\bensure\b|\bAI (will|decides)\b/i.test(v.title + v.detail)), 'D: no promise, price, guarantee or claim about how AI decides');
  ok(fixLinesFor(['search_blocked', 'robots_blocks_ai', 'thin_pages']).length === 2, 'D: two kinds with the same line print it once');
  ok(fixLinesFor(['nonsense', null, undefined, 'toString']).length === 0, 'D: an unknown key (even an Object.prototype name) prints nothing');
}

/* ── E. the website check's own names (the live path: websiteCheck.ts hands its siteAudit ids through as the kind) ── */
{
  ok(Object.entries(FIX_ALIASES).every(([from, to]) => !(from in FIX_LINES) && FIX_LINES[to]), 'E: every alias points at an existing approved line, and is not itself a kind (no second rule for one thing)');
  const t = (ids: string[]) => fixLinesFor(ids).map((l) => l.title);
  ok(t(['ct_unsourced_claims'])[0] === FIX_LINES.unsourced_claims!.title && t(['ct_areas_not_stated'])[0] === FIX_LINES.areas_not_stated!.title, 'E: a content check arrives as ct_<kind> and finds its line');
  ok(t(['missing_h1', 'town_missing', 'ct_unsourced_claims', 'thin_pages']).length === FIX_LINES_MAX, 'E: the live shape (siteAudit ids) fills the three slots');
  ok(t(['robots_blocks_gptbot', 'robots_blocks_pages_gptbot', 'no_business_schema', 'schema_malformed', 'no_service_pages', 'one_page_site', 'vs_key_page_basics']).length === 0, 'E: a training-bot block, generic schema and ids with no honest equivalent print nothing');
  ok(t(['robots_blocks_all', 'search_crawler_refused']).length === 1, 'E: two ids with the same fix print it once');
}

if (failures) throw new Error(`${failures} v3 layout checks failed`);
console.log('all passed');
