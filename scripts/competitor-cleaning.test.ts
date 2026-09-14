/* Tests for src/lib/competitorCleaning.ts — the read-time "were these names cleaned?" guard.
 * Run: npx tsx scripts/competitor-cleaning.test.ts
 *
 * The fixtures are REAL strings out of Solene's 27 Aug run (audit c2be3e5d, run 1657ab75) and real
 * one-word brand names, because the whole risk here is a structural test that also eats real firms.
 */
import {
  assessCompetitorCleanliness, isProvableJunkName, readCleaningStamp, collectCompetitorNames,
  countAnsweredCells,
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
  const a = assessCompetitorCleanliness(['Newson Health', 'You', 'AAAAABqkCA', 'However']);
  ok('junk at/over the threshold → dirty', a.verdict === 'dirty', a.verdict);
  ok('dirty warning names the count', a.warning.includes('3 of 4'), a.warning);
  ok('dirty warning says do not send', a.warning.includes('do not send to client'));
  ok('junk examples listed', a.junkExamples.length === 3, JSON.stringify(a.junkExamples));
}
{
  /* ⛔ ONE OR TWO AMBIGUOUS NAMES MUST NOT CONDEMN A CLEANED RUN. The live case: gpt-4o
     correctly returned "Hers" (forhers.com, a real brand) on Solene's cleaned run 3, and "hers"
     is a pronoun in the marker list. At a threshold of 1 that blanked every rival on a run cleaned
     60/60. The name is still reported, and still filtered out of display by isRealCompetitor. */
  const a = assessCompetitorCleanliness(['Newson Health', 'Menopause Care', 'Hers'],
    { competitor_cleaning: { complete: true, items_total: 60, items_cleaned: 60 } });
  ok('one ambiguous single-word brand → still clean', a.verdict === 'clean', a.verdict);
  ok('but it is still reported', a.junkExamples.includes('Hers'), JSON.stringify(a.junkExamples));
  ok('clean → no warning even with a straggler', a.warning === '');
  const b = assessCompetitorCleanliness(['Newson Health', 'Hers', 'You'],
    { competitor_cleaning: { complete: true, items_total: 60, items_cleaned: 60 } });
  ok('two stragglers → still clean', b.verdict === 'clean', b.verdict);
}
{
  // ⛔ THE STAMP MUST NOT OVERRIDE THE EVIDENCE once the junk is provable.
  const a = assessCompetitorCleanliness(['You', 'However', 'Once', 'Newson Health'],
    { competitor_cleaning: { complete: true, items_total: 10, items_cleaned: 10 } });
  ok('a "complete" stamp over provable junk is still dirty', a.verdict === 'dirty', a.verdict);
}
{
  /* ⛔ AN INCOMPLETE STAMP WARNS ALWAYS AND SUPPRESSES ONLY WITH JUNK BESIDE IT (2026-09-14).
     It suppressed unconditionally until then, which blanked the rivals on real clients' reports:
     measured over the 147 newest lead-linked audits, all 6 withheld lists came from this branch and
     every one had ZERO junk — AD Locksmithing 25/25 items cleaned, 106 real names, withheld on a
     receipt reading "model omitted 1 of 25 ids". The receipt cannot tell "the model returned no
     entry for that id" from "an answer that named nobody", so on its own it is not evidence. */
  const a = assessCompetitorCleanliness(['Newson Health'],
    { competitor_cleaning: { complete: false, items_total: 137, items_cleaned: 60 } });
  ok('incomplete stamp → still DIRTY at zero junk, so the operator is told',
    a.verdict === 'dirty', a.verdict);
  ok('  but the client report is NOT blanked on the receipt alone',
    a.suppressNames === false, String(a.suppressNames));
  ok('incomplete warning shows coverage', a.warning.includes('60 of 137'), a.warning);
  ok('  and says the names are still shown', /still shown/.test(a.warning), a.warning);
  ok('  and does not tell the operator not to send', !/do not send/.test(a.warning), a.warning);

  /* ⛔ THE CASE THE ORIGINAL RULE WAS WRITTEN FOR IS UNCHANGED: part of the run was never read AND
     what we can see is already raw, so unprovable junk in the unread part is a real risk. One
     marker is enough here — below the standalone threshold of 3, on purpose. */
  const b = assessCompetitorCleanliness(['Newson Health', 'However'],
    { competitor_cleaning: { complete: false, items_total: 137, items_cleaned: 60 } });
  ok('incomplete stamp + ANY provable junk → suppressed',
    b.verdict === 'dirty' && b.suppressNames === true, `${b.verdict}/${b.suppressNames}`);
  ok('  and that warning DOES say not to send', /do not send/.test(b.warning), b.warning);

  /* The junk rule itself is untouched: at or over the threshold it suppresses whatever any receipt
     says, including a complete one. */
  const c = assessCompetitorCleanliness(['You', 'However', 'Once', 'Newson Health'],
    { competitor_cleaning: { complete: false, items_total: 10, items_cleaned: 4 } });
  ok('provable junk at the threshold still suppresses under an incomplete stamp',
    c.suppressNames === true, String(c.suppressNames));
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

/* ── EMPTY IS AMBIGUOUS NOW THAT THE REGEX SCRAPER IS DELETED (2026-08-28) ──────────────────
 *  A run with answers and no names is EITHER "AI named nobody" OR "the cleaner never ran", and
 *  only a completed receipt tells them apart. Getting this wrong turns a silent cleaning failure
 *  into a confident "no competitors" — the same absent-value fault the scraper caused, inverted. */
{
  const a = assessCompetitorCleanliness([], { competitor_cleaning: { complete: true, items_total: 6, items_cleaned: 6 } }, { answeredCells: 6 });
  ok('empty + COMPLETE receipt → clean (AI really named nobody)', a.verdict === 'clean', a.verdict);
  ok('and it says nothing alarming', a.warning === '');

  const b = assessCompetitorCleanliness([], undefined, { answeredCells: 6 });
  ok('empty + NO receipt + answers exist → dirty, not "no competitors"', b.verdict === 'dirty', b.verdict);
  ok('warning names the ambiguity', b.warning.includes('may be') && b.warning.includes('cleaner not having run'), b.warning);
  ok('warning counts the unread answers', b.warning.includes('6 answers'), b.warning);

  const c = assessCompetitorCleanliness([], { competitor_cleaning: { complete: false, items_total: 6, items_cleaned: 0 } }, { answeredCells: 6 });
  ok('empty + FAILED receipt → dirty', c.verdict === 'dirty', c.verdict);

  const d = assessCompetitorCleanliness([], undefined, { answeredCells: 0 });
  ok('empty with NO answers at all → unknown (nothing to get wrong)', d.verdict === 'unknown', d.verdict);
  const e = assessCompetitorCleanliness([], undefined);
  ok('no answeredCells passed → old behaviour, unknown', e.verdict === 'unknown', e.verdict);
}
{
  const rows = [
    { status: 'done', result: { chatgpt: { answer_text: 'a' }, gemini: { answer_text: '' }, ai_overview: { answer_text: 'c' } } },
    { status: 'done', result: { chatgpt: { answer_text: '   ' } } },
    { status: 'failed', result: { chatgpt: { answer_text: 'x' } } },
    { status: 'done', result: null },
    null,
  ];
  ok('countAnsweredCells counts only done rows with real answer text',
    countAnsweredCells(rows as never) === 2, String(countAnsweredCells(rows as never)));
}
/* ── SUPPRESSION IS NARROWER THAN THE VERDICT ────────────────────────────────────────────────
 *  The report withholds names only when we HOLD names we cannot trust. "No names and no receipt"
 *  still warns the operator, but suppressing there would blank the gut-punch on historic reports
 *  whose regex list was simply empty — changing documents already sent. */
{
  const junky = assessCompetitorCleanliness(['You', 'However', 'Once', 'Newson Health']);
  ok('provable junk → suppress', junky.verdict === 'dirty' && junky.suppressNames === true);

  /* ⚠️ CHANGED 2026-09-14, AND THIS IS THE ASSERTION THAT MOVED: partly cleaned WITH NOTHING RAW
     IN IT warns but no longer suppresses. See the measured note on the incomplete-stamp block
     above — all six withheld lists in the live book came from here with zero junk, including two
     paying clients' own reports. Junk beside the incomplete receipt still suppresses (next case). */
  const partial = assessCompetitorCleanliness(['Newson Health'],
    { competitor_cleaning: { complete: false, items_total: 137, items_cleaned: 60 } });
  ok('partly cleaned, nothing raw → warn but do NOT suppress',
    partial.verdict === 'dirty' && partial.suppressNames === false);
  const partialJunky = assessCompetitorCleanliness(['Newson Health', 'However'],
    { competitor_cleaning: { complete: false, items_total: 137, items_cleaned: 60 } });
  ok('partly cleaned WITH raw text → suppress',
    partialJunky.verdict === 'dirty' && partialJunky.suppressNames === true);

  const emptyNoReceipt = assessCompetitorCleanliness([], undefined, { answeredCells: 6 });
  ok('empty + no receipt → warn but DO NOT suppress',
    emptyNoReceipt.verdict === 'dirty' && emptyNoReceipt.suppressNames === false,
    `${emptyNoReceipt.verdict}/${emptyNoReceipt.suppressNames}`);

  const fine = assessCompetitorCleanliness(['Newson Health', 'Menopause Care']);
  ok('clean → never suppress', fine.verdict === 'clean' && fine.suppressNames === false);
}
console.log(`\ncompetitor-cleaning: ${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1); }
console.log('✓ all green');
