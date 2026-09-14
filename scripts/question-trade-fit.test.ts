/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THE QUESTION ABOUT THE TRADE, AND DID THE ENGINES ANSWER IT ABOUT THE TRADE?

   🔴 THE INCIDENT, 2026-09-13. White Sparks Electrical's full measure asked "fault diagnosis
   services in thetford UK". The engines answered it accurately, naming Gorse Motors Garage, Vickers
   Motors, Cunningham Motors and M & S Breckland Motors — car garages. One of twelve firms was an
   electrician. It filed under ABSENT, which the product defines as "the race exists and you are
   invisible", and would have sent Paul to build a page for a race that was never his.

   Every guard passed it: buying intent, names the town, carries the country marker. Three guards
   for intent, place and country — and the only trade check in the codebase, seedRejectionReason's,
   had NO CALLERS and had not run since 2026-09-12.

   ⛔ THIS PINS THREE THINGS, AND THE THIRD IS THE ONE THAT CANNOT BE RECOVERED FROM BY HAND:
     1. the generation guard rejects off-trade questions WITHOUT rejecting good ones;
     2. the measurement-time check flags a question whose answers were about another trade, and
        REFUSES to judge a trade it cannot read;
     3. neither ever reaches a customer.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offTradeReason, dropOffTrade, stripRepeatedWords, seedRejectionReason } from '../src/lib/seedGuard';
import {
  assessTradeFit, OFF_TRADE_MAX_SHARE, MIN_FIRMS_TO_JUDGE, MIN_QUESTIONS_TO_CALIBRATE,
} from '../src/lib/questionTradeFit';
import type { BaselineQuestion } from '../src/lib/baselineView';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('-- 1. the question that started this --');
/* 🔴 THE REGRESSION IN ONE LINE. */
ok(!!offTradeReason('fault diagnosis services in thetford UK', 'electrician'),
   '"fault diagnosis services in thetford UK" is rejected for an electrician');
/* ⛔ AND NOT BY ACCIDENT. The electrician intent list contains "fault finding"; if intents matched
   on ANY single token, "fault" would rescue "fault diagnosis" and the guard would let through the
   exact question it was built for. Every token of one alternative has to be present. */
ok(!offTradeReason('fault finding in thetford UK', 'electrician'),
   '"fault finding" — the real electrician phrasing — still passes');
ok(!!offTradeReason('automotive diagnostics for vehicles basingstoke uk', 'Locksmiths'),
   'car diagnostics is not a locksmith question');

console.log('\n-- the OR is the whole design: a good question with no trade word must survive --');
/* Each of these was measured against the real book: the engines answered every one with firms in
   the right trade. A guard that rejects them is worse than no guard. */
for (const [q, trade] of [
  ['emergency lockout service in Burnley UK', 'Locksmiths'],
  ['key cutting in Halifax', 'Locksmiths'],
  ['lock installation in Portsmouth UK', 'Locksmiths'],
  ['key duplication services in Spalding UK', 'Locksmiths'],
  ['rekeying services in Manchester UK', 'Locksmiths'],
  ['learn to drive in Wisbech', 'driving instructors'],
  ['plumbing services in Melton Mowbray UK', 'Plumbers'],
  ['accounting services for small businesses in Reading UK', 'accountants'],
  ['tax preparation services for individuals in Lancing UK', 'accountants'],
  ['residential electrical repairs in Wrexham UK', 'electrician'],
  ['drain cleaning for homes in Kettering UK', 'plumber'],
  ['installing gas appliances for homes in Watford UK', 'Plumbers'],
] as const) {
  ok(!offTradeReason(q, trade), `kept: "${q}" [${trade}]`);
}

console.log('\n-- the stem, because plumbing is not plumber --');
/* Measured: matching the trade word by exact-plural only threw away 259 good questions on the real
   corpus, and singularising the STORED plural ("accountants" -> "accounta") was 28 more. */
ok(!offTradeReason('plumbing repairs for homeowners in Loughborough UK', 'Plumbers'), 'plumbing ~ plumber');
ok(!offTradeReason('accounting services in Bourne UK', 'accountants'), 'accounting ~ accountant');
ok(!offTradeReason('electrical installation services in Wrexham UK', 'electricians'), 'electrical ~ electrician');
ok(!offTradeReason('lock replacement in Newcastle upon tyne UK', 'Locksmith'), 'lock ~ locksmith (reverse stem)');

console.log('\n-- absence is not an answer --');
/* ⛔ A blank trade must pass everything. Refusing on absence would empty the question set for every
   lead whose business_type was never captured — and 24 distinct values is all the book has. */
ok(!offTradeReason('best plumber in Wisbech UK', ''), 'a blank trade rejects nothing');
ok(!offTradeReason('best plumber in Wisbech UK', '   '), 'whitespace too');
ok(offTradeReason('', 'plumber') === 'empty question', 'an empty question is named, not silently kept');

console.log('\n-- the rule is shared, not restated --');
/* seedRejectionReason claimed in a COMMENT to be the rule behind the live guards and was not; that
   is how its trade clause stopped running unnoticed. It calls offTradeReason now. */
ok(!!seedRejectionReason('fault diagnosis services in thetford UK', 'electrician', 'thetford'),
   'seedRejectionReason refuses it too — one rule, two callers');
const guard = read('src/lib/seedGuard.ts');
ok(/offTradeReason\(question, businessType\)/.test(guard.slice(guard.indexOf('export function seedRejectionReason'))),
   'and it does so by CALLING it, not by a second copy of the clause');

console.log('\n-- 2. dropOffTrade tops up like its two siblings --');
{
  const generated = ['fault diagnosis services in thetford UK', 'rewiring in thetford UK'];
  const fallback = ['best electrician in thetford UK', 'top rated electrician in thetford UK'];
  const r = dropOffTrade(generated, fallback, 3, 'electrician');
  ok(r.rejected.length === 1 && r.rejected[0].question === generated[0], 'the off-trade one is rejected and named');
  ok(r.questions.length === 3, 'and the count is topped back up from the templates');
  ok(r.questions.includes('rewiring in thetford UK'), 'the good generated question is kept');
  /* ⛔ COMES UP SHORT RATHER THAN FABRICATING. Filler to hit a number is how the LLM playbook
     happened; the other two guards make the same choice. */
  const short = dropOffTrade(['fault diagnosis services in thetford UK'], [], 5, 'electrician');
  ok(short.questions.length === 0, 'with nothing to top up from it returns short, never invented');
  /* The top-up can never be rejected by this filter because every template embeds the trade word.
     If that stops being true the sets go short and the reason will not be obvious. */
  const tpl = read('supabase/functions/create-ai-audit/index.ts');
  ok(/base = \[[\s\S]{0,400}\$\{t\}\$\{where\}/.test(tpl), 'the local templates still embed the trade word');
}

console.log('\n-- 3. a word repeated back to back --');
{
  /* 🔴 IN WHITE SPARKS' FROZEN BASELINE, one of twelve questions a refund is judged on. */
  const r = stripRepeatedWords(['electrician electrician in thetford UK']);
  ok(r.questions[0] === 'electrician in thetford UK', 'the repeat is collapsed');
  ok(r.repaired.length === 1, 'and reported, not silently changed');
  const keep = stripRepeatedWords(['lock repair and lock replacement in Leeds UK']);
  ok(keep.repaired.length === 0, 'a word repeated NON-adjacently is left alone');
  ok(stripRepeatedWords(['best Locksmiths in Halifax UK']).repaired.length === 0, 'a clean question is untouched');
  /* Casing is the engines' input and day 28 replays it verbatim, so this may only delete. */
  ok(stripRepeatedWords(['Best BEST plumber in York']).questions[0] === 'Best plumber in York',
     'case-insensitive match, original casing kept');
  ok(stripRepeatedWords(['']).questions[0] === '', 'an empty string does not throw');
}

console.log('\n-- 4. the measurement-time check flags what generation cannot --');
const q = (question: string, firms: Array<[string, number]>): BaselineQuestion => ({
  question,
  engines: { chatgpt: { named: 0, answered: 3, runs: 3 }, gemini: { named: 0, answered: 3, runs: 3 } } as never,
  band: 'absent',
  competitors: firms.map(([name, times]) => ({ name, times, of: 6 })),
  topCompetitorTimes: firms[0]?.[1] ?? 0,
});
const ELECTRICIAN_OK = [
  q('rewiring in thetford UK', [['Spark Electrical Ltd', 3], ['Thetford Electricians', 2], ['AB Electrical', 1]]),
  q('lighting installation in thetford UK', [['Spark Electrical Ltd', 3], ['Norfolk Electrical', 2], ['AB Electrical', 1]]),
  q('fuse board replacement in thetford UK', [['Spark Electrical Ltd', 3], ['AB Electrical', 2], ['Volt Electricians', 1]]),
  q('pat testing in thetford UK', [['Spark Electrical Ltd', 2], ['AB Electrical', 2], ['Volt Electricians', 1]]),
];
{
  const real = q('fault diagnosis services in thetford UK',
    [['Gorse Motors Garage', 3], ['Cunningham Motors Ltd', 2], ['Vickers Motors', 2], ['YDS Automotive', 1]]);
  const r = assessTradeFit({ questions: [...ELECTRICIAN_OK, real] }, 'electrician');
  ok(r.readable, 'the electrician audit is readable');
  ok(r.offTrade.length === 1 && r.offTrade[0].question === real.question, 'the car-garage question is the one flagged');
  ok(r.questions.find((x) => x.question === 'rewiring in thetford UK')?.state === 'in_trade',
     'and a genuinely absent question is NOT flagged — absent is still a real answer');
}

console.log('\n-- and it refuses a trade it cannot read, rather than flagging everything --');
{
  /* ⛔ THE SELF-CHECK. A cocktail bar is not called "hospitality" and Deloitte is not called
     "accountants". Without this gate every question in such an audit reads as measuring the wrong
     trade — which is not a finding about the questions, it is the checker admitting it is blind.
     Measured on the real book: hospitality medians 0%, Ronnie's shoe-repair audit 9%. */
  const bar = [
    q('best cocktail bar in Chiang Mai', [['Noir cmi', 3], ['Gladwell', 2], ['Euphoria Lounge', 1]]),
    q('where to find live music in Chiang Mai', [['North Gate Jazz Co-Op', 3], ['Boy Blues Bar', 2], ['Crossroad', 1]]),
    q('top place for brunch in Chiang Mai', [['KLĀY cafe', 3], ['Bella Goose', 2], ['Me & Bacon', 1]]),
    q('restaurants in Chiang Mai', [['Oxygen Dining Room', 3], ["L'éléphant", 2], ['Le Crystal', 1]]),
  ];
  const r = assessTradeFit({ questions: bar }, 'hospitality');
  ok(!r.readable, 'an unreadable trade is refused');
  ok(r.offTrade.length === 0, 'and NOTHING is flagged — silence beats four wrong accusations');
  ok(r.questions.every((x) => x.state === 'not_assessed'), 'every question says so explicitly');
}

console.log('\n-- the absent cases are named, never defaulted --');
{
  const thin = assessTradeFit({ questions: [...ELECTRICIAN_OK, q('safes in thetford UK', [['Motors Ltd', 1]])] }, 'electrician');
  ok(thin.questions.find((x) => x.question === 'safes in thetford UK')?.state === 'too_few_firms',
     `under ${MIN_FIRMS_TO_JUDGE} named firms is its own state, not "off trade"`);
  ok(assessTradeFit({ questions: [] }, 'electrician').readable === false, 'no questions at all is unreadable');
  ok(assessTradeFit({ questions: ELECTRICIAN_OK.slice(0, MIN_QUESTIONS_TO_CALIBRATE - 1) }, 'electrician').readable === false,
     `fewer than ${MIN_QUESTIONS_TO_CALIBRATE} gradeable questions cannot calibrate, so nothing is judged`);
  ok(assessTradeFit({ questions: ELECTRICIAN_OK }, null).readable === false, 'a null business_type judges nothing');
  ok(assessTradeFit({ questions: ELECTRICIAN_OK }, '  ').offTrade.length === 0, 'blank business_type flags nothing');
}
/* The boundary, stated: at exactly the threshold a question is still off-trade (inclusive). */
{
  const edge = q('edge in thetford UK', [['Motors A', 1], ['Motors B', 1], ['AB Electrical', 1]]);
  const r = assessTradeFit({ questions: [...ELECTRICIAN_OK, edge] }, 'electrician');
  ok((1 / 3) <= OFF_TRADE_MAX_SHARE && r.offTrade.some((x) => x.question === 'edge in thetford UK'),
     `${Math.round(OFF_TRADE_MAX_SHARE * 100)}% is inclusive — one in three is off-trade`);
}

console.log('\n══ 5. AND IT NEVER REACHES A CUSTOMER ══');
/* 🔴 THE STRUCTURAL GATE. buildBaselineView feeds measurementCompare, which feeds the four-week
   results document a client reads. This flag says a measurement was wrong; a customer meeting it
   would read it as us grading our own work mid-refund-window. The gate is that it lives in its own
   module and hangs nothing on BaselineQuestion — so the ONLY way it travels is an import, and this
   is the assertion that stops one. */
const CLIENT_FACING: Array<[string, string]> = [
  ['four-week results document', 'src/lib/remeasureResultsHtml.ts'],
  ['four-week results words', 'src/lib/remeasureResults.ts'],
  ['the comparison the client document is built from', 'src/lib/measurementCompare.ts'],
  ['audit report (prospect + client)', 'src/lib/aiAuditReportHtml.ts'],
  ['welcome pack', 'src/lib/welcomePackHtml.ts'],
  ['client request form', 'src/lib/clientRequestDoc.ts'],
  ['before/after export', 'src/lib/measurementExport.ts'],
  ['free-check result email', 'supabase/functions/_shared/free-check-result.ts'],
];
for (const [label, file] of CLIENT_FACING) {
  ok(!/questionTradeFit/.test(read(file)), `${label} does not import the flag (${file})`);
}
/* And the band enum is untouched: a sixth band would change every band total in the client's
   comparison silently. */
const bv = read('src/lib/baselineView.ts');
ok(/export const BANDS = \['absent', 'one_engine', 'fragile', 'held', 'no_race'\] as const;/.test(bv),
   'BANDS still has exactly the five counting bands');
ok(!/questionTradeFit|tradeFit/.test(bv), 'and baselineView knows nothing about trade fit');
/* The operator screen is the one place it is allowed. */
ok(/questionTradeFit/.test(read('src/pages/Baseline.tsx')), 'the operator Baseline screen does read it');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
