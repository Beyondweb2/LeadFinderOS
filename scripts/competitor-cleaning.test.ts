/* Tests for src/lib/competitorCleaning.ts — the read-time "were these names cleaned?" guard.
 * Run: npx tsx scripts/competitor-cleaning.test.ts
 *
 * The fixtures are REAL strings out of Solene's 27 Aug run (audit c2be3e5d, run 1657ab75) and real
 * one-word brand names, because the whole risk here is a structural test that also eats real firms.
 */
import {
  assessCompetitorCleanliness, isProvableJunkName, readCleaningStamp, collectCompetitorNames,
} from '../src/lib/competitorCleaning';

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) pass++;
  else fails.push(`${name}${extra ? ` — ${extra}` : ''}`);
};

/* ── the code-like ids that reached Solene's headline (all 48 distinct, verbatim) ───────────── */
const REAL_JUNK_IDS = [
  'G1f5H8B8ToY', 'Xdaj6AH7genL7KP9o', 'PhefeP9n7An8u', 'M7RY0SrUu', 'EuRt53PDPpdIZFhg7ezaa',
  'Bkd9T5v4v1zm7v0', 'DSbRVk7ZLfS7d85', 'KWproFBw9vfjt', 'UCq7G3YHvOZ', 'LDZ6M0WR2',
  'ZVoDh2qeWKHccq72U', 'TTZ9hDDP5', 'JRBn3WGzLSNLX', 'WPySFHs9', 'PVkzue1716ag',
  'T5bcJZJv4sRUs', 'DMaVvEJl483zmrzby9TC01YMh', 'C9F8JL1ivjXs00fOVu7l', 'OizapOHV4', 'I10pCoei',
  'LQQh8ASwfJpl', 'HgEW7UoyM4Yha3bs9D60e9u', 'Sc1g9QytkB8FIc4Tz0bH9h8S', 'QljGu9vmYi', 'P3DMQmIn',
  'AAAAABqkCA',
];
for (const id of REAL_JUNK_IDS) {
  ok(`code-like id rejected: ${id}`, isProvableJunkName(id));
}

/* ── real firms and brands MUST survive. A false positive here silently deletes a competitor. ── */
const REAL_NAMES = [
  // one-word brands, the risky class
  'Crunch', 'Mazuma', 'Azets', 'IRIS', 'TaxAssist', 'Checkatrade', 'Timpson', 'Superdrug',
  'B&Q', 'O2', 'EE', '3M', 'Move37', 'Fix4U', 'Screwfix', 'Boots',
  // the real Solene competitors that must reach the headline
  'Newson Health', 'Menopause Care', 'My Menopause Centre', 'Balance My Hormones',
  'The Online Clinic', 'British Menopause Society', 'The LUNA Clinic', 'The Schoeman Clinic',
  'The Harper Clinic', 'Coombe Menopause Clinic', 'Medical Prime Menopause Clinic',
  'Dr Shashi Prasad - Menopause & Functional Medicine Clinic', 'Imperial Reproductive Endocrinology',
  'Kenwood Health', "The Men's Health Clinic", "Women's Hormone Clinic", 'balancemyhormones.co.uk',
  'Superdrug Online Doctor', 'Dr Louise Newson',
  // multi-word names containing marker words — the marker test is single-token by design
  'Always Secure Ltd', 'One Call Locksmiths', 'First Pick Locksmiths', 'The Best Clinic',
];
for (const n of REAL_NAMES) {
  ok(`real name kept: ${n}`, !isProvableJunkName(n), 'flagged as junk');
}

/* ── more real names, aimed straight at the upper-heavy clause added for the last three ids ─── */
for (const n of ['GlaxoSmithKline', 'AstraZeneca', 'McDonalds', 'NatWest', 'PwC', 'eBay', 'KPMG', 'HSBC', 'IKEA', 'GenderGP', 'BioTe', 'MyOva']) {
  ok(`upper-heavy clause spares real brand: ${n}`, !isProvableJunkName(n), 'flagged as junk');
}

/* ── content-word junk is DELIBERATELY not detectable — pins the documented limit.
 *    "Private" belongs here too: it is NOT in UNCLEANED_MARKER_WORDS, and that list's measured
 *    zeros only hold for the list AS IT STANDS (knownEntities.ts header) — adding a word means
 *    re-running the 20-market sweep, which is not this change's job. ───────────────────────── */
for (const n of ['Testosterone', 'Estrogen', 'Sleep', 'Perimenopause', 'Private']) {
  ok(`content word not claimed as provable junk: ${n}`, !isProvableJunkName(n),
    'the structural test must not pretend to classify medical nouns');
}

/* ── function-word markers (delegated to isUncleanedName) ───────────────────────────────────── */
for (const n of ['You', 'The', 'Yes', 'However', 'Ask', 'Once', 'Keep']) {
  ok(`marker word rejected: ${n}`, isProvableJunkName(n));
}

/* ── verdicts ───────────────────────────────────────────────────────────────────────────────── */
{
  const a = assessCompetitorCleanliness(['Newson Health', 'Menopause Care']);
  ok('clean names with no stamp → clean', a.verdict === 'clean', a.verdict);
  ok('clean → no warning', a.warning === '');
}
{
  const a = assessCompetitorCleanliness(['Newson Health', 'You', 'AAAAABqkCA']);
  ok('junk present → dirty', a.verdict === 'dirty', a.verdict);
  ok('dirty warning names the count', a.warning.includes('2 of 3'), a.warning);
  ok('dirty warning says do not send', a.warning.includes('do not send to client'));
  ok('junk examples listed', a.junkExamples.length === 2, JSON.stringify(a.junkExamples));
}
{
  // ⛔ THE STAMP MUST NOT OVERRIDE THE EVIDENCE.
  const a = assessCompetitorCleanliness(['You', 'Newson Health'],
    { competitor_cleaning: { complete: true, items_total: 10, items_cleaned: 10 } });
  ok('a "complete" stamp over junk names is still dirty', a.verdict === 'dirty', a.verdict);
}
{
  // An incomplete stamp is dirty even with no PROVABLE junk — unprovable content junk may lurk.
  const a = assessCompetitorCleanliness(['Newson Health'],
    { competitor_cleaning: { complete: false, items_total: 137, items_cleaned: 60 } });
  ok('incomplete stamp → dirty', a.verdict === 'dirty', a.verdict);
  ok('incomplete warning shows coverage', a.warning.includes('60 of 137'), a.warning);
}
{
  // ABSENT STAMP MUST NOT READ AS CLEAN OR AS DIRTY on its own (absent-value rule).
  const a = assessCompetitorCleanliness([], undefined);
  ok('no names at all → unknown, not clean', a.verdict === 'unknown', a.verdict);
  ok('unknown → no scary warning', a.warning === '');
  const b = assessCompetitorCleanliness(['Newson Health'], { questions: [] });
  ok('names but no stamp key → judged on names alone', b.verdict === 'clean', b.verdict);
  ok('missing stamp reads as null', b.stamp === null);
}
{
  const s = readCleaningStamp({ competitor_cleaning: { at: '2026-08-28T10:00:00Z', model: 'gpt-4o', items_total: 137, items_cleaned: 137, complete: true, errors: [] } });
  ok('stamp parsed', s?.items_total === 137 && s?.complete === true);
  ok('junk shapes → null', readCleaningStamp(null) === null && readCleaningStamp('x') === null
    && readCleaningStamp({ competitor_cleaning: 'nope' }) === null);
  const partial = readCleaningStamp({ competitor_cleaning: { items_total: 'ten' } });
  ok('non-numeric count → null, never NaN', partial?.items_total === null);
}
{
  const rows = [
    { result: { chatgpt: { competitors: ['Newson Health'] }, gemini: { competitors: ['You'] } } },
    { result: null },
    null,
    { result: { ai_overview: { competitors: [] } } },
  ];
  const names = collectCompetitorNames(rows as never);
  ok('collect gathers across engines, tolerates nulls', names.length === 2 && names.includes('You'),
    JSON.stringify(names));
}

console.log(`\ncompetitor-cleaning: ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1); }
console.log('✓ all green');
