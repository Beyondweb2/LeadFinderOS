/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE BEFORE/AFTER EXPORTS — the properties that stop a small swing reading as a real result.

   Run: npx tsx scripts/measurement-export.test.ts

   ⛔ THE ONE THIS EXISTS FOR: a number can leave the app only with its qualification attached.
   Per-question movement is almost never provable (two engines × one run = 2 cells; the ±5-point
   swing was measured over 60), and the two sides routinely have different denominators. A CSV of
   bare deltas is precisely where that gets forgotten, so the flags are asserted as hard
   properties, not checked by eye.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  compareMeasurements,
  sortMeasurementQuestions,
  NOISE_BAND_PP,
  MEASUREMENT_ORDERS,
  MEASUREMENT_ORDER_LABELS,
} from '../src/lib/measurementCompare.ts';
import {
  comparisonToCsv,
  comparisonToTsv,
  comparisonToPrintableHtml,
  exportRows,
  exportFilename,
  exportHeaderLines,
  type ExportMeta,
} from '../src/lib/measurementExport.ts';
import type { QueueRowLite } from '../src/lib/baselineView.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const BIZ = 'ABLM Associates';
/** One queue row. `named` per engine is what buildBaselineView scores. */
const row = (runId: string, question: string, named: [boolean, boolean]): QueueRowLite => ({
  run_id: runId,
  question,
  engines: ['chatgpt', 'gemini'],
  status: 'complete',
  result: {
    chatgpt: { named: named[0], answer_text: named[0] ? `${BIZ} are great` : 'Someone else', citations: [] },
    gemini: { named: named[1], answer_text: named[1] ? `${BIZ} are great` : 'Someone else', citations: [] },
  },
});

const META: ExportMeta = {
  businessName: BIZ,
  beforeMeasuredAt: '2026-07-21T10:00:00Z',
  afterMeasuredAt: '2026-08-18T10:00:00Z',
  exportedAt: '2026-09-08 06:00 UTC',
};

/* Three questions asked in a deliberate order, so "as asked" is checkable. Q3 improves hard, Q1
   is flat, Q2 is only in the after side. */
const before: QueueRowLite[] = [
  row('b1', 'accountant in wisbech', [false, false]),
  row('b1', 'best bookkeeper whittlesey', [false, false]),
  row('b2', 'accountant in wisbech', [false, false]),
  row('b2', 'best bookkeeper whittlesey', [false, false]),
];
const after: QueueRowLite[] = [
  row('a1', 'accountant in wisbech', [false, false]),
  row('a1', 'best bookkeeper whittlesey', [true, true]),
  row('a1', 'tax return help chatteris', [true, false]),
];

console.log('── ORDER: "as asked" is stable and independent of the results ──');
const c = compareMeasurements(before, after, { businessName: BIZ });
const askedOrder = sortMeasurementQuestions(c.questions, 'asked').map((q) => q.question);
ok(askedOrder[0] === 'accountant in wisbech', 'the first question asked comes first');
ok(askedOrder[1] === 'best bookkeeper whittlesey', 'the second comes second');
ok(askedOrder[2] === 'tax return help chatteris', 'and a question only in the AFTER side is appended, not interleaved');
/* The property: the order must not depend on the numbers. Same questions, better results, same
   sequence — which is what makes two exports of one audit diffable. */
const betterAfter: QueueRowLite[] = [
  row('a1', 'accountant in wisbech', [true, true]),
  row('a1', 'best bookkeeper whittlesey', [false, false]),
  row('a1', 'tax return help chatteris', [true, true]),
];
const c2 = compareMeasurements(before, betterAfter, { businessName: BIZ });
ok(JSON.stringify(sortMeasurementQuestions(c2.questions, 'asked').map((q) => q.question)) === JSON.stringify(askedOrder),
  'a completely different set of RESULTS produces the identical row order');
/* And the fold's own default is asked order, so a consumer that does not sort gets the stable one. */
ok(JSON.stringify(c.questions.map((q) => q.question)) === JSON.stringify(askedOrder),
  'the fold returns asked order by default — a caller cannot accidentally inherit movement order');

console.log('\n── ORDER: "biggest movers" still exists, and is total ──');
const moveOrder = sortMeasurementQuestions(c.questions, 'movement').map((q) => q.question);
ok(moveOrder.length === 3, 'all rows are present in movement order');
ok(moveOrder[moveOrder.length - 1] !== undefined, 'and none is dropped');
/* Ties must not be left to the sort engine, or two exports of identical data differ. */
const flat = compareMeasurements(before, before, { businessName: BIZ });
const t1 = sortMeasurementQuestions(flat.questions, 'movement').map((q) => q.question);
const t2 = sortMeasurementQuestions([...flat.questions].reverse(), 'movement').map((q) => q.question);
ok(JSON.stringify(t1) === JSON.stringify(t2),
  'an all-ties comparison sorts identically whatever the input order — the tiebreak is total');
ok(MEASUREMENT_ORDERS.every((o) => (MEASUREMENT_ORDER_LABELS[o] ?? '').length > 0),
  'every order has a label, so the control cannot render a raw slug');
console.log('\n── SORTING IS PURE ──');
const snapshot = c.questions.map((q) => q.question);
sortMeasurementQuestions(c.questions, 'movement');
ok(JSON.stringify(c.questions.map((q) => q.question)) === JSON.stringify(snapshot),
  'sorting does not mutate the comparison — so the screen and an export in another order agree');

console.log('\n── THE FLAGS SURVIVE THE EXPORT ──');
const rows = exportRows(c, 'asked');
ok(rows.length === c.questions.length, 'every question is exported, including the unmatched ones');
const whittlesey = rows.find((r) => r.question === 'best bookkeeper whittlesey')!;
ok(whittlesey.namedDelta === 2, 'the improved question carries its named change (+2)');
ok(whittlesey.proven === false,
  'and is NOT marked proven — 2 after-cells is below the per-question bar, however big the jump');
ok(whittlesey.unevenSampling === true,
  'and its uneven sampling is flagged (4 cells before, 2 after)');
const chatteris = rows.find((r) => r.question === 'tax return help chatteris')!;
ok(chatteris.verdict === 'new question', 'a question only asked after is labelled, not shown as improvement');
ok(chatteris.proven === false, 'and an unmatched question is never proven');
ok(chatteris.beforeNamed === null && chatteris.beforeAnswered === null,
  'with an EMPTY before side rather than a zero — a fake 0 would read as "asked and never named"');
ok(rows.every((r) => r.beforeAnswered !== 0 || r.beforeNamed !== null),
  'no row carries a count without its denominator');

console.log('\n── THE HEADER CARRIES THE CLAIM AND THE CAVEAT ──');
const head = exportHeaderLines(c, META).join('\n');
ok(head.includes(`+/-${NOISE_BAND_PP} points`), 'the noise band is stated in the file');
ok(/NOT proven/i.test(head), 'and what it means is spelled out');
ok(head.includes('2026-07-21') && head.includes('2026-08-18'), 'both measurement dates are absolute');
ok(/run\(s\)/.test(head), 'the run counts are there — a rate over 2 runs is not a rate over 8');
ok(head.includes('Questions asked both times: 2'), 'the matched count is stated');
ok(/WARNING: the two sides asked their questions a different number of times/.test(head),
  'and uneven sampling gets an explicit warning, not a silent asterisk');

console.log('\n── CSV MECHANICS ──');
const csv = comparisonToCsv(c, META, 'asked');
const lines = csv.split('\r\n');
ok(lines[0].startsWith('# AI visibility'), 'the header block leads, as comment lines');
const headerRow = lines.find((l) => l.startsWith('Question,'))!;
ok(headerRow.includes('Before rate %') && headerRow.includes('After rate %'), 'rates are columns');
ok(headerRow.includes('Proven') && headerRow.includes('Uneven sampling'), 'so are the two flags');
ok(csv.split('\r\n').filter((l) => /^(''|")?[a-z]/.test(l) && l.includes(',') && !l.startsWith('#')).length >= 3,
  'every question is a data row');
{
  /* Excel executes a cell beginning = + - or @. Questions are free text out of search results. */
  const nasty = compareMeasurements(
    [row('b1', '=cmd|calc', [false, false])],
    [row('a1', '=cmd|calc', [true, false])],
    { businessName: BIZ },
  );
  const out = comparisonToCsv(nasty, META, 'asked');
  ok(out.includes("'=cmd|calc") || out.includes('"\'=cmd|calc"'),
    'a formula-shaped question is neutralised with a leading apostrophe');
}
{
  const quoted = compareMeasurements(
    [row('b1', 'who is "best", locksmith', [false, false])],
    [row('a1', 'who is "best", locksmith', [true, true])],
    { businessName: BIZ },
  );
  const out = comparisonToCsv(quoted, META, 'asked');
  ok(out.includes('"who is ""best"", locksmith"'), 'commas and quotes inside a question are escaped properly');
}

console.log('\n── CLIPBOARD TEXT ──');
const tsv = comparisonToTsv(c, META, 'asked');
ok(tsv.includes('\t'), 'it is tab separated, so it pastes into a cell grid');
ok(!/\t[^\n]*\t[^\n]*"\t/.test(tsv), 'and does not try to quote fields — a paste has no escaping convention');
ok(tsv.split('\n').filter((l) => l.split('\t').length > 5).length >= 4,
  'header row plus every question');
ok(tsv.includes('Sampling swing'), 'the caveat comes along with the paste');

console.log('\n── THE PDF DOCUMENT ──');
const html = comparisonToPrintableHtml(c, META, 'asked');
ok(html.startsWith('<!doctype html>'), 'a self-contained document');
ok(html.includes('<title>Before and after</title>'), 'with a title (the default Save-as-PDF filename)');
ok(html.includes('@page') && html.includes('landscape'), 'landscape A4 — nine columns do not fit portrait');
ok(html.includes('break-inside: avoid'), 'a question row is never split across pages');
ok(html.includes('thead { display: table-header-group; }'), 'and the header repeats on every page');
ok(html.includes(c.headline), 'the headline with its qualification is in the document');
ok(html.includes(`±${NOISE_BAND_PP} points`), 'so is the noise band');
ok(html.includes('unproven on its own'), 'and thin rows say so on the page');
ok(html.includes('accountant in wisbech') && html.includes('tax return help chatteris'),
  'every question appears');
{
  /* The PDF must not be able to inject markup from a question string. */
  const xss = compareMeasurements(
    [row('b1', '<script>alert(1)</script>', [false, false])],
    [row('a1', '<script>alert(1)</script>', [true, true])],
    { businessName: '<img src=x onerror=alert(1)>' },
  );
  const out = comparisonToPrintableHtml(xss, { ...META, businessName: '<img src=x onerror=alert(1)>' }, 'asked');
  ok(!out.includes('<script>alert(1)</script>'), 'a script-shaped question is escaped');
  ok(!out.includes('<img src=x onerror'), 'and so is the business name');
}

console.log('\n── FILENAMES ──');
ok(exportFilename('RG Locksmiths', '2026-09-08 06:00 UTC', 'csv') === 'RG-Locksmiths-before-after-2026-09-08.csv',
  'a readable, dated filename');
ok(exportFilename('', '2026-09-08 06:00 UTC', 'csv').startsWith('business-before-after'),
  'and a missing business name still yields a valid one');

console.log('\n── AN INCOMPARABLE PAIR EXPORTS AS INCOMPARABLE, NOT AS "NO CHANGE" ──');
{
  const inc = compareMeasurements(
    [row('b1', 'accountant in wisbech', [false, false])],
    [row('a1', 'Best accountants in Wisbech?', [true, true])],
    { businessName: BIZ },
  );
  ok(inc.movement === 'incomparable', 'the fold says incomparable');
  const h = exportHeaderLines(inc, META).join('\n');
  ok(/incomparable/.test(h), 'and the export header says so too');
  ok(/asked both times: 0/.test(h), 'with zero matched questions stated plainly');
  const r = exportRows(inc, 'asked');
  ok(r.length === 2 && r.every((x) => x.proven === false),
    'both questions still export, neither claiming anything');
}

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
