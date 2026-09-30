/* ════════════════════════════════════════════════════════════════════════════════════════════
   SEARCH PERFORMANCE — the rules that decide what the Performance screen says (2026-09-22).

   Four things are pinned here, and each is pinned because getting it wrong produces a number that
   LOOKS RIGHT:

     1. URL identity. If the sync and the read normalise differently, the join matches nothing and
        every page reads "untracked" — which is indistinguishable from "Google returned unfamiliar
        URLs". Both sides import this module; these tests are what say it behaves.
     2. CTR and average position. Averaging CTRs, or plain-averaging positions, gives a plausible
        wrong answer that nobody catches by eye.
     3. Comparison. A missing baseline must be "—", never +100%.
     4. Direction. Average position improving means the number going DOWN.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  BACKFILL_CHUNK_DAYS,
  PERFORMANCE_PERIODS,
  SETTLED_LAG_DAYS,
  addDays,
  buildPageRows,
  changeHigherIsBetter,
  changePosition,
  chunkWindow,
  comparisonSuppressed,
  finaliseTotals,
  indexTrackedPages,
  isPageType,
  isPerformancePeriod,
  normaliseUrl,
  pageLabel,
  pagePath,
  periodWindows,
  resolvePerformanceState,
  sumTotals,
  syncWindow,
  toISODate,
  totalsFromAggregate,
  totalsFromRow,
  type Totals,
} from '../src/lib/searchPerformance.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const T = (clicks: number, impressions: number, positionImpressions: number): Totals => ({ clicks, impressions, positionImpressions });

console.log('── URL NORMALISATION: one rule, both runtimes ──');
const D = 'mc-locksmiths.com';
ok(normaliseUrl('http://mc-locksmiths.com/car-keys/', D) === 'https://mc-locksmiths.com/car-keys', 'http → https');
ok(normaliseUrl('https://mc-locksmiths.com/car-keys/', D) === 'https://mc-locksmiths.com/car-keys', 'trailing slash removed');
ok(normaliseUrl('https://mc-locksmiths.com/car-keys', D) === 'https://mc-locksmiths.com/car-keys', 'no trailing slash is already canonical');
ok(normaliseUrl('https://www.mc-locksmiths.com/car-keys/', D) === 'https://mc-locksmiths.com/car-keys', 'www folds to the configured apex');
ok(normaliseUrl('https://mc-locksmiths.com/car-keys/?utm_source=gbp', D) === 'https://mc-locksmiths.com/car-keys', 'query string dropped for page identity');
ok(normaliseUrl('https://mc-locksmiths.com/car-keys/#book', D) === 'https://mc-locksmiths.com/car-keys', 'fragment dropped');
ok(normaliseUrl('https://MC-Locksmiths.COM/car-keys/', D) === 'https://mc-locksmiths.com/car-keys', 'host lowercased');
ok(normaliseUrl('https://mc-locksmiths.com/', D) === 'https://mc-locksmiths.com/', 'the root keeps its single slash');
ok(normaliseUrl('https://mc-locksmiths.com', D) === 'https://mc-locksmiths.com/', 'a bare origin IS the root');
ok(normaliseUrl('/car-keys/', D) === 'https://mc-locksmiths.com/car-keys', 'a bare path resolves against the configured domain');
/* 🔴 THE SAME FOUR FORMS MUST COLLAPSE TO ONE STRING, because that string is the join key. */
const forms = ['http://mc-locksmiths.com/commercial/', 'https://www.mc-locksmiths.com/commercial', 'https://mc-locksmiths.com/commercial/?gclid=x', 'https://mc-locksmiths.com/commercial/#top'];
ok(new Set(forms.map((u) => normaliseUrl(u, D))).size === 1, 'http/www/query/fragment variants all produce ONE key');

console.log('── …and the configured domain governs, so a www-canonical client is not broken ──');
const W = 'www.scplumbing.co.uk';
ok(normaliseUrl('https://scplumbing.co.uk/boilers', W) === 'https://www.scplumbing.co.uk/boilers', 'apex folds UP to a www canonical');
ok(normaliseUrl('https://www.scplumbing.co.uk/boilers/', W) === 'https://www.scplumbing.co.uk/boilers', 'www stays www when that is the canonical');
ok(normaliseUrl('https://www.other.co.uk/x', W) === 'https://other.co.uk/x', 'a different host is NOT rewritten to the client domain');

console.log('── …and a non-URL is null, never a false match ──');
ok(normaliseUrl('', D) === null, 'empty is null');
ok(normaliseUrl(null, D) === null, 'null is null');
ok(normaliseUrl('   ', D) === null, 'whitespace is null');
ok(normaliseUrl('not a url', D) === null, 'prose is null');
ok(normaliseUrl('/car-keys/') === null, 'a bare path with NO configured domain is unresolvable, not a guess');
ok(pagePath('https://mc-locksmiths.com/car-keys/') === '/car-keys', 'pagePath is the path');
ok(pagePath('https://mc-locksmiths.com/') === '/', 'the root path is /');
ok(pageLabel('  ', 'https://mc-locksmiths.com/car-keys') === '/car-keys', 'a blank label falls back to the path');
ok(pageLabel('Car keys', 'https://mc-locksmiths.com/car-keys') === 'Car keys', 'a real label wins');

console.log('── PERIOD WINDOWS: settled, abutting, no overlap ──');
ok(SETTLED_LAG_DAYS === 2, 'display stops at today-2');
const w = periodWindows(7, '2026-09-22');
ok(!!w && w.current.to === '2026-09-20', 'the current window ends at today-2');
ok(!!w && w.current.from === '2026-09-14', 'a 7-day window is 7 days inclusive');
ok(!!w && w.previous.to === '2026-09-13', 'the previous window ends the day before the current one starts');
ok(!!w && w.previous.from === '2026-09-07', 'the previous window is the same length');
/* ⛔ A one-day overlap would double-count a day into both sides of every comparison on the page. */
ok(!!w && w.previous.to < w.current.from, 'the windows do not overlap');
ok(!!w && addDays(w.previous.to, 1) === w.current.from, '…and they do not gap either');
const w90 = periodWindows(90, '2026-09-22');
ok(!!w90 && w90.current.from === '2026-06-23' && w90.current.to === '2026-09-20', '90-day window');
ok(!!w90 && w90.previous.from === '2026-03-25' && w90.previous.to === '2026-06-22', '90-day previous window');
ok(periodWindows(28, 'not-a-date') === null, 'a bad today yields null, never a window of NaN');

console.log('── …and UTC, so a stored day does not drift a day under BST ──');
ok(addDays('2026-10-24', 3) === '2026-10-27', 'crossing the BST→GMT switch keeps the day exact');
ok(addDays('2026-02-28', 1) === '2026-03-01', 'month boundary (2026 is not a leap year)');
ok(toISODate(new Date('2026-09-22T23:30:00Z')) === '2026-09-22', 'late-evening UTC is still that day');

console.log('── SYNC WINDOW: rolling, reaching past the settled boundary ──');
const sw = syncWindow('2026-09-22');
ok(!!sw && sw.from === '2026-09-16' && sw.to === '2026-09-20', 'the sync re-fetches today-6 … today-2');
/* The point of re-fetching a settled day is that Google revises it; the upsert corrects it. */
ok(!!sw && !!w && sw.to === w.current.to, 'the sync reaches at least as far forward as the display does');

console.log('── BACKFILL CHUNKING: bounded, complete, ordered ──');
const chunks = chunkWindow({ from: '2026-06-23', to: '2026-09-20' }, BACKFILL_CHUNK_DAYS);
ok(chunks.length === 3, '90 days in 30-day chunks is 3 calls');
ok(chunks[0].from === '2026-06-23' && chunks[0].to === '2026-07-22', 'first chunk is exactly 30 days');
ok(chunks[chunks.length - 1].to === '2026-09-20', 'the last chunk stops at the window end, never past it');
ok(chunks.every((c, i) => i === 0 || c.from > chunks[i - 1].to), 'chunks are ordered and do not overlap');
ok(chunkWindow({ from: '2026-09-20', to: '2026-09-20' }, 30).length === 1, 'a single-day window is one chunk');

console.log('── ROLLUPS: CTR FROM TOTALS, NOT AN AVERAGE OF CTRs ──');
/* 🔴 THE CASE THAT CATCHES THE WRONG IMPLEMENTATION. Day A: 1 impression, 1 click (CTR 100%).
   Day B: 1000 impressions, 10 clicks (CTR 1%). The true CTR is 11/1001 = 1.1%. Averaging the two
   daily CTRs gives 50.5% — a plausible-looking number that is wrong by a factor of 46. */
const dayA = totalsFromRow({ clicks: 1, impressions: 1, position: 3 });
const dayB = totalsFromRow({ clicks: 10, impressions: 1000, position: 12 });
const both = finaliseTotals(sumTotals([dayA, dayB]));
ok(both.clicks === 11 && both.impressions === 1001, 'clicks and impressions are plain sums');
ok(Math.abs((both.ctr ?? 0) - 11 / 1001) < 1e-12, 'CTR is sum(clicks)/sum(impressions) = 1.1%');
ok((both.ctr ?? 0) < 0.02, '…and emphatically NOT the 50.5% an average of CTRs would give');

console.log('── …and average position is IMPRESSION-WEIGHTED ──');
/* One impression at position 3 must not outweigh a thousand at position 12. True weighted
   position is (3×1 + 12×1000)/1001 = 11.99; a plain mean of the two rows gives 7.5. */
ok(Math.abs((both.position ?? 0) - (3 * 1 + 12 * 1000) / 1001) < 1e-9, 'position is Σ(position×impressions)/Σ(impressions)');
ok((both.position ?? 0) > 11.9, '…and NOT the 7.5 a plain average of row positions would give');

console.log('── …and zero impressions is UNKNOWN, not zero ──');
const none = finaliseTotals(T(0, 0, 0));
ok(none.ctr === null, 'no impressions → CTR is null, never 0%');
ok(none.position === null, 'no impressions → position is null, never 0 (which would sort best)');
ok(none.clicks === 0 && none.impressions === 0, 'the counts themselves are still 0');
/* Clicks with no impressions cannot happen, but if Google ever says so we must not divide by 0. */
ok(finaliseTotals(T(5, 0, 0)).ctr === null, 'clicks with no impressions does not produce Infinity');

console.log('── …and the SQL aggregate shape (bigint/numeric arrive as strings) ──');
const agg = totalsFromAggregate({ clicks: '11', impressions: '1001', position_impressions: '12003' });
ok(agg.clicks === 11 && agg.impressions === 1001 && agg.positionImpressions === 12003, 'string-encoded sums are read as numbers');
ok(totalsFromAggregate({}).impressions === 0, 'a missing field is 0, never NaN');

console.log('── COMPARISON: no manufactured percentages ──');
ok(changeHigherIsBetter(100, 50)?.pct === 1, 'doubling is +100%');
ok(changeHigherIsBetter(50, 100)?.improved === false, 'halving is not an improvement');
/* ⛔ A baseline of zero has no percentage. "Up 100%" from nothing is not a measurement. */
ok(changeHigherIsBetter(100, 0)?.pct === null, 'growth from a zero baseline has NO percentage');
ok(changeHigherIsBetter(100, 0)?.delta === 100, '…but the absolute delta is still reported');
ok(changeHigherIsBetter(100, null) === null, 'a missing previous period is null (the screen shows —)');
ok(changeHigherIsBetter(null, 100) === null, 'a missing current value is null');
ok(changeHigherIsBetter(0, 0)?.improved === false, 'nothing to nothing is not an improvement');

console.log('── …and POSITION IMPROVES WHEN THE NUMBER GOES DOWN ──');
/* 🔴 The single most common bug in this kind of screen. */
const better = changePosition(3, 8);
ok(!!better && better.delta === -5, 'position 8 → 3 is a delta of −5');
ok(!!better && better.improved === true, '…and it IS an improvement, despite the negative sign');
const worse = changePosition(8, 3);
ok(!!worse && worse.improved === false, 'position 3 → 8 is a decline, despite the positive sign');
ok(changePosition(4, 4)?.improved === false, 'no movement is not an improvement');
ok(changePosition(3, null) === null, 'no previous position is null');
ok(changePosition(3, 8)?.pct === null, 'position offers no percentage — "62% better position" means nothing');

console.log('── PAGE ROWS: an unknown URL is SURFACED, never dropped ──');
const tracked = indexTrackedPages([
  { canonical_url: 'https://mc-locksmiths.com/car-keys/', label: 'Car keys', page_type: 'service' },
  { canonical_url: 'https://mc-locksmiths.com/', label: 'Home', page_type: 'home' },
], D);
const current = new Map<string, Totals>([
  ['https://mc-locksmiths.com/car-keys', T(10, 400, 400 * 6)],
  ['https://mc-locksmiths.com/', T(30, 900, 900 * 4)],
  ['https://mc-locksmiths.com/a-page-nobody-told-us-about', T(2, 50, 50 * 20)],
]);
const previous = new Map<string, Totals>([['https://mc-locksmiths.com/car-keys', T(5, 200, 200 * 9)]]);
const rows = buildPageRows(current, previous, tracked, { from: '2026-08-10', to: '2026-09-06' });
ok(rows.length === 3, 'every URL with traffic produces a row');
const unknown = rows.find((r) => r.url.endsWith('a-page-nobody-told-us-about'));
ok(!!unknown && unknown.tracked === false, 'a URL not in the inventory is marked untracked…');
ok(!!unknown && unknown.current.clicks === 2, '…and KEEPS its traffic — dropping it would hide both real clicks and a broken normaliser');
ok(!!unknown && unknown.pageType === 'other', 'an untracked page types as other');
ok(!!unknown && unknown.label === '/a-page-nobody-told-us-about', 'an untracked page labels as its path');
ok(rows[0].url === 'https://mc-locksmiths.com/', 'rows sort by clicks, highest first');
const carKeys = rows.find((r) => r.url.endsWith('/car-keys'));
ok(!!carKeys && carKeys.tracked && carKeys.label === 'Car keys' && carKeys.pageType === 'service', 'a tracked page carries its label and type');
/* The tracked row was written with a trailing slash and matched a key without one — proof the
   index and the totals went through the same normaliser. */
ok(!!carKeys && carKeys.previous?.clicks === 5, 'the previous period is attached to the right page');
const home = rows.find((r) => r.url === 'https://mc-locksmiths.com/');
ok(!!home && home.previous === null, 'a page with no previous-period data has previous = null, not zeroes');

console.log('── …and a page rebuilt inside the window has its comparison SUPPRESSED ──');
const prevWindow = { from: '2026-08-10', to: '2026-09-06' };
ok(comparisonSuppressed('2026-08-20', prevWindow) === true, 'built inside the compared span → suppress');
ok(comparisonSuppressed('2026-08-10', prevWindow) === true, 'built on the first day of the previous window → suppress (it was not there for all of it)');
ok(comparisonSuppressed('2026-08-09', prevWindow) === false, 'built the day before the span → compare');
ok(comparisonSuppressed('2026-01-01', prevWindow) === false, 'built long ago → compare');
/* ⛔ NULL IS UNKNOWN, NOT "TODAY". We never record a build date we cannot establish, and suppressing
   every comparison forever because a date is unrecorded would make the feature useless. */
ok(comparisonSuppressed(null, prevWindow) === false, 'an unrecorded build date does not suppress');
ok(comparisonSuppressed(undefined, prevWindow) === false, 'an absent build date does not suppress');
const rebuilt = buildPageRows(
  new Map([['https://mc-locksmiths.com/x', T(9, 90, 90 * 5)]]),
  new Map([['https://mc-locksmiths.com/x', T(1, 10, 10 * 30)]]),
  indexTrackedPages([{ canonical_url: 'https://mc-locksmiths.com/x', built_or_rebuilt_on: '2026-08-20' }], D),
  prevWindow,
);
ok(rebuilt[0].comparisonSuppressed === true, 'buildPageRows carries the suppression onto the row');
ok(rebuilt[0].previous !== null, '…and still returns the previous totals, so the UI decides how to say it');

console.log('── THE FIVE STATES, each reached positively ──');
ok(resolvePerformanceState(null, 0) === 'not_connected', 'no connection row → not_connected');
ok(resolvePerformanceState(undefined, 99) === 'not_connected', 'an absent connection is never populated, even with rows');
ok(resolvePerformanceState({ status: 'not_connected', gsc_property: null }, 0) === 'property_missing', 'no property → property_missing');
ok(resolvePerformanceState({ status: 'connected', gsc_property: '   ' }, 5) === 'property_missing', 'a whitespace property is no property');
ok(resolvePerformanceState({ status: 'not_connected', gsc_property: 'sc-domain:x.com' }, 0) === 'not_connected', 'a property with status not_connected → not_connected');
ok(resolvePerformanceState({ status: 'connected', gsc_property: 'sc-domain:x.com' }, 0) === 'no_data', 'connected with no rows in the period → no_data');
ok(resolvePerformanceState({ status: 'connected', gsc_property: 'sc-domain:x.com' }, 3) === 'populated', 'connected with rows → populated');
ok(resolvePerformanceState({ status: 'error', gsc_property: 'sc-domain:x.com' }, 3) === 'error', 'an error wins over rows — the operator must see it');
ok(resolvePerformanceState({ status: 'error', gsc_property: null }, 0) === 'error', 'an error wins over a missing property too');
/* 🔴 The absent-value rule. An unknown status must NOT fall through to populated — that would
   render an empty dashboard as a real measurement (CLAUDE.md §4, 16 recorded instances). */
ok(resolvePerformanceState({ status: 'syncing', gsc_property: 'sc-domain:x.com' }, 7) === 'not_connected', 'an UNKNOWN status resolves to not_connected, never populated');
ok(resolvePerformanceState({ status: null, gsc_property: 'sc-domain:x.com' }, 7) === 'not_connected', 'a null status resolves to not_connected');

console.log('── Guards ──');
ok(isPerformancePeriod(7) && isPerformancePeriod(28) && isPerformancePeriod(90), 'the three periods are valid');
ok(!isPerformancePeriod(30) && !isPerformancePeriod('28') && !isPerformancePeriod(null), 'anything else is not');
ok(PERFORMANCE_PERIODS.length === 3, 'there are exactly three periods in Phase 1 — no custom range');
ok(isPageType('home') && isPageType('service') && isPageType('location') && isPageType('commercial') && isPageType('other'), 'the five page types');
ok(!isPageType('qa'), "client_pages' page_type vocabulary is NOT this one — the two tables are deliberately separate");
ok(!isPageType(null) && !isPageType(undefined), 'an absent page type is not a page type');

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
