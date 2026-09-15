/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CAPTURING GOOGLE ORGANIC MUST CHANGE NOTHING THAT ALREADY EXISTS.

   The organic block was dropped on 2026-07-21 for a good reason: raw SERP titles are not an AI
   engine naming a firm. Re-storing it under its old key `google_organic` would have put it back
   inside DISPLAY_ENGINES and silently changed four surfaces nobody asked to change — the client
   report's per-engine table, `namedOn`, page-generator's `namedAnywhere` hold/build decision, and
   market-view's niche fold. So the capture is DATA under a leading-underscore meta key, and the
   first property below is the one that keeps it that way.

   The second half is the shape the analysis needs: a real position, first-page depth, and an
   absent/empty distinction that cannot be collapsed.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { captureGoogleSerp, normalizeAiSearch, buildAiSearchInput } from '../supabase/functions/_shared/enrichment/ai-search.ts';
import { DISPLAY_ENGINES, SCORED_ENGINES } from '../src/lib/auditReport.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const KEY = '_google_serp';
const item = (organic: unknown[], extra: Record<string, unknown> = {}) => [{ organicResults: organic, ...extra }];
const res = (n: number) => Array.from({ length: n }, (_, i) => ({ position: i + 1, url: `https://firm${i + 1}.co.uk/`, title: `Firm ${i + 1} — Plumbers` }));

console.log('-- the inertness property: this can never be read as an engine --');
ok(KEY.startsWith('_'), 'the stored key is a leading-underscore meta key');
ok(!(DISPLAY_ENGINES as readonly string[]).includes(KEY), 'DISPLAY_ENGINES does not contain it, so no report/niche loop reaches it');
ok(!(SCORED_ENGINES as readonly string[]).includes(KEY), 'SCORED_ENGINES does not contain it, so no named rate can move');
/* ⛔ THE REGRESSION THIS PINS: re-emitting the old key would add a "Google" row to the client
   report. normalizeAiSearch must keep returning engines ONLY. */
const norm = normalizeAiSearch(item(res(3)), 'Firm 1') as Record<string, unknown>;
ok(!('google_organic' in norm), 'normalizeAiSearch still does NOT emit google_organic');
ok(Object.keys(norm).every((k) => (DISPLAY_ENGINES as readonly string[]).includes(k)), 'every key normalizeAiSearch returns is a known engine');

console.log('\n-- the actor input is untouched, which is what makes this free --');
const a = JSON.stringify(buildAiSearchInput('best plumbers in Leeds', 'gb'));
const b = JSON.stringify(buildAiSearchInput('best plumbers in Leeds', 'gb'));
ok(a === b, 'input builder is deterministic');
ok(!a.includes('organic'), 'the input carries no organic toggle — organic is the actor base output, not an add-on we requested');
ok(JSON.parse(a).maxPagesPerQuery === 1, 'still one page per query — the capture does not widen the scrape');

console.log('\n-- the shape the analysis needs --');
const cap = captureGoogleSerp(item(res(5)))!;
ok(cap.results.length === 5 && cap.count === 5, 'five results kept, count 5');
ok(cap.results[0].position === 1 && cap.results[4].position === 5, "the actor's own position is preserved");
ok(cap.results[0].url === 'https://firm1.co.uk/' && !!cap.results[0].title, 'url and title are both kept, so matching can be by domain OR name later');

console.log('\n-- first page only, and a truncated capture says so --');
const big = captureGoogleSerp(item(res(87)))!;
ok(big.results.length === 10, 'capped at the first page (10)');
ok(big.count === 87, 'count records what the actor really returned, so 10-of-87 can never read as a short SERP');
ok(big.results[9].position === 10, 'the tenth kept result is position 10');

console.log('\n-- a missing position falls back to rank order, never to null --');
const noPos = captureGoogleSerp(item([{ url: 'https://a.co.uk/', title: 'A' }, { url: 'https://b.co.uk/', title: 'B' }]))!;
ok(noPos.results[0].position === 1 && noPos.results[1].position === 2, 'index+1 when the actor omits position');
const strPos = captureGoogleSerp(item([{ position: '3', url: 'https://a.co.uk/', title: 'A' }]))!;
ok(strPos.results[0].position === 1, 'a non-numeric position is not trusted — falls back to order');

console.log('\n-- absent and empty are DIFFERENT answers and must not collapse --');
ok(captureGoogleSerp([{ chatGptResults: {} }]) === null, 'no organic block at all -> null (we did not get the data)');
ok(captureGoogleSerp([]) === null, 'no dataset item -> null');
ok(captureGoogleSerp(undefined as unknown as unknown[]) === null, 'undefined items -> null, no throw');
const empty = captureGoogleSerp(item([]))!;
ok(empty !== null && empty.count === 0 && empty.results.length === 0, 'an EMPTY organic block -> count 0 (Google returned nothing), not null');

console.log('\n-- junk in the results list is dropped, not stored as a blank rank --');
const junk = captureGoogleSerp(item([{}, null, { url: 'https://real.co.uk/', title: 'Real' }]))!;
ok(junk.results.length === 1 && junk.results[0].title === 'Real', 'entries with neither url nor title are skipped');
ok(junk.count === 3, 'count still reports what the actor returned');
/* The alternative source key the old normaliser also read — kept so a shape change in the actor
   does not silently stop capture. */
const alt = captureGoogleSerp([{ results: res(2) }])!;
ok(alt.results.length === 2, 'the `results` key is read as well as `organicResults`');

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) process.exitCode = 1;
