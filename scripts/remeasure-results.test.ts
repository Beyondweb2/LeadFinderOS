/* The four-week results: the send decision, the "gone up" verdict, the 14-day window and the words.
   Pins Paul's 2026-09-13 spec: pooled engines; inside the noise band is NOT gone up; a replay that
   gave up or a thin question holds; the copy is gated until approved; the claim sentence is the
   guarantee's own second sentence. */
import { compareMeasurements, MIN_CELLS_FOR_QUESTION_CLAIM, NOISE_BAND_PP } from '../src/lib/measurementCompare.ts';
import type { QueueRowLite } from '../src/lib/baselineView.ts';
import {
  remeasureResultsDecision, numberWentUp, claimWindowCloseIso, resultsEmailParagraphs, resultsDocumentMeaning, resultsClaimParagraph,
  currentTermsVerdict, LEGACY_TERMS_LABEL, monthlyStartIso,
  resultsEmailSubject, REMEASURE_RESULTS_COPY_APPROVED, REMEASURE_CLAIM_WINDOW_DAYS,
} from '../src/lib/remeasureResults.ts';
import { FINDABLE_GUARANTEE, FINDABLE_MONTHLY_GBP, REMEASURE_CLAIM_SENTENCE, CARD_SAVED_NOTICE, monthlyStartingSoonEmail } from '../src/lib/findableOffer.ts';
import { renderRemeasureResultsHtml } from '../src/lib/remeasureResultsHtml.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/* Build queue rows: `runs` runs × questions, each question named on `namedOf[q]` of the runs, on both engines. */
function rows(questions: string[], runs: number, namedOf: number[]): QueueRowLite[] {
  const out: QueueRowLite[] = [];
  for (let r = 0; r < runs; r++) for (let q = 0; q < questions.length; q++) {
    const named = r < namedOf[q];
    out.push({ run_id: `run${r}`, question: questions[q], engines: ['chatgpt', 'gemini'], status: 'done',
      result: { chatgpt: { named, citations: [] }, gemini: { named, citations: [] } } });
  }
  return out;
}
const QS = ['a in town', 'b in town', 'c in town', 'd in town'];
const three = (...n: number[]) => ({ replayRuns: Array.from({ length: n.length }, () => ({ status: 'complete' })), replayTarget: n.length });

console.log('── The claim sentence is the guarantee\'s own second sentence ──');
ok(FINDABLE_GUARANTEE.endsWith(REMEASURE_CLAIM_SENTENCE), 'FINDABLE_GUARANTEE ends with REMEASURE_CLAIM_SENTENCE (one promise, one wording)');
ok(/14 days/.test(REMEASURE_CLAIM_SENTENCE) && REMEASURE_CLAIM_WINDOW_DAYS === 14, 'the sentence says 14 days and the window constant is 14');

console.log('── Gone up means beyond the band, pooled ──');
{
  const before = rows(QS, 3, [1, 0, 0, 0]);   // 6 of 24 = 25%
  const after = rows(QS, 3, [3, 3, 0, 0]);    // 12 of 24 = 50%
  const c = compareMeasurements(before, after, { businessName: 'X' });
  ok(c.movement === 'improved' && numberWentUp(c), 'a 25-point rise is gone up');
}
{
  const before = rows(QS, 3, [1, 1, 0, 0]);   // 8/24 = 33.3%
  const after = rows(QS, 3, [1, 1, 0, 0]);
  after[0].result = { chatgpt: { named: true }, gemini: { named: true } }; // +2 cells → 10/24 = 41.7? no: a[0] was already named; use a different row
  const c = compareMeasurements(before, rows(QS, 3, [1, 1, 0, 0]), { businessName: 'X' });
  ok(c.movement === 'unchanged' || c.movement === 'within_noise', `identical sides read ${c.movement}`);
  ok(!numberWentUp(c), 'and are NOT gone up');
}
{
  /* RG's shape: a rise inside ±5 points (31.9% → 32.3%) — the case Paul named. */
  const before = rows(QS, 6, [6, 6, 2, 0]);   // 28/48 → mix to get 31.9%-ish; exactness is not the point
  const after = rows(QS, 6, [6, 6, 2, 1]);    // one more named cell pair
  const c = compareMeasurements(before, after, { businessName: 'X' });
  ok(c.ratePpDelta !== null && c.ratePpDelta > 0 && Math.abs(c.ratePpDelta) <= NOISE_BAND_PP, `a small rise (${c.ratePpDelta?.toFixed(1)} pp) sits inside the band`);
  ok(c.withinNoise && !numberWentUp(c), 'inside the band is NOT gone up — the client would qualify for the refund (Paul, 2026-09-13)');
}

/* The terms gate has its own block below; these cases are about the NUMBERS, so they are
   driven with a client who is provably on the current offer. */
const OK = { current: true } as const;
console.log('── The decision: holds when the number cannot be proven, sends when it can ──');
{
  const before = rows(QS, 3, [1, 0, 0, 0]), after = rows(QS, 3, [3, 3, 0, 0]);
  const c = compareMeasurements(before, after, { businessName: 'X' });
  ok(remeasureResultsDecision({ ...three(1, 1, 1), comparison: c , terms: OK }).send === false, 'HELD while the copy is not approved (the default)');
  ok(REMEASURE_RESULTS_COPY_APPROVED === false, 'REMEASURE_RESULTS_COPY_APPROVED is false — nothing goes to a client until Paul approves the words');
  const d = remeasureResultsDecision({ ...three(1, 1, 1), comparison: c, copyApproved: true , terms: OK });
  ok(d.send === true, 'sends once approved, three complete runs, 6 cells a side per question');
  const gaveUp = remeasureResultsDecision({ replayRuns: [{ status: 'complete' }, { status: 'complete' }, { status: 'failed' }], replayTarget: 3, comparison: c, copyApproved: true , terms: OK });
  ok(gaveUp.send === false && gaveUp.kind === 'replay_gave_up', 'a failed run holds: replay gave up');
  const short = remeasureResultsDecision({ replayRuns: [{ status: 'complete' }, { status: 'complete' }], replayTarget: 3, comparison: c, copyApproved: true , terms: OK });
  ok(short.send === false && short.kind === 'replay_gave_up', 'two of three runs holds');
  const thinAfter = compareMeasurements(before, rows(QS, 1, [1, 1, 0, 0]), { businessName: 'X' });  // 2 cells a side after
  const thin = remeasureResultsDecision({ replayRuns: [{ status: 'complete' }], replayTarget: 1, comparison: thinAfter, copyApproved: true , terms: OK });
  ok(thin.send === false && thin.kind === 'unproven' && new RegExp(String(MIN_CELLS_FOR_QUESTION_CLAIM)).test(thin.reason), 'a side with fewer than MIN_CELLS_FOR_QUESTION_CLAIM cells on a question holds as unproven');
  const disjoint = compareMeasurements(before, rows(['other q'], 3, [0]), { businessName: 'X' });
  const inc = remeasureResultsDecision({ ...three(1, 1, 1), comparison: disjoint, copyApproved: true , terms: OK });
  ok(inc.send === false && inc.kind === 'incomparable', 'no shared question holds as incomparable');
}

console.log('── The window is derived from the stamp ──');
ok(claimWindowCloseIso('2026-10-06T09:00:00.000Z') === '2026-10-20T09:00:00.000Z', 'sent 6 Oct 09:00 → closes 20 Oct 09:00');
ok(claimWindowCloseIso(null) === null && claimWindowCloseIso('junk') === null, 'no stamp / unreadable stamp → no window');

/* ══ THE TERMS GATE ══════════════════════════════════════════════════════════════════════════════
   A POSITIVE test for today's offer. Paul, 2026-09-13: the document would have been wrong three
   ways for RG Locksmiths on 6 October — £99 back on a £19.99 sale, four weeks against his eight,
   an outcome refund against his stored WORK guarantee — and his real numbers read 23 of 72 both
   sides, so it would have offered him a refund he was never sold. Absence refuses: Ronnie has no
   contract at all, so any test phrased as "is this client legacy?" would have let him through. */
console.log("-- The terms gate: only the current offer passes --");
{
  /* Today's shape: contract v2 with no guarantee key, full price, the cycle the filler computes. */
  const current = { contract: { version: 2, mainTown: 'Newcastle upon tyne' }, amountPaid: 99, baselineFrozenAt: '2026-09-13T05:50:34.177+00:00', remeasureDueDate: '2026-10-11' };
  ok(currentTermsVerdict(current).current === true, 'v2 + full price + the current cycle → current terms');

  const refused = (f: Parameters<typeof currentTermsVerdict>[0], what: string) => {
    const v = currentTermsVerdict(f);
    ok(v.current === false, `REFUSES: ${what}`);
    return v.current === false ? v.reason : '';
  };
  refused({ ...current, contract: null }, 'no contract at all (Ronnie)');
  refused({ ...current, contract: undefined }, 'an undefined contract');
  refused({ ...current, contract: {} }, 'a contract with no version');
  refused({ ...current, contract: [] }, 'an array where an object belongs');
  refused({ ...current, contract: 'v2' }, 'a string where an object belongs');
  refused({ ...current, contract: { version: 1 } }, 'a v1 contract even with no guarantee key');
  refused({ ...current, contract: { version: 3 } }, 'a schema version nobody has written yet');
  refused({ ...current, contract: { version: 2, guarantee: 'work' } }, 'v2 carrying a work guarantee');
  refused({ ...current, contract: { version: 2, guarantee: 'outcome' } }, 'v2 carrying an outcome guarantee');
  refused({ ...current, amountPaid: 49.99 }, 'a price below the current one');
  refused({ ...current, amountPaid: 98.99 }, 'a penny below the current price');
  refused({ ...current, amountPaid: null }, 'no amount recorded');
  refused({ ...current, amountPaid: '' }, 'a blank amount');
  refused({ ...current, amountPaid: 'free' }, 'an unreadable amount');
  refused({ ...current, baselineFrozenAt: null }, 'no baseline completion date');
  refused({ ...current, baselineFrozenAt: 'not a date' }, 'an unreadable completion date');
  refused({ ...current, remeasureDueDate: null }, 'no stored due date');
  refused({ ...current, remeasureDueDate: '2026-10-12' }, 'a due date one day off the current cycle');
  ok(currentTermsVerdict({ ...current, amountPaid: 109.97 }).current === true, 'ALLOWS a price ABOVE the current one (the hosting add-on)');
  ok(currentTermsVerdict({ ...current, amountPaid: '99' }).current === true, 'ALLOWS the amount as a string, the shape PostgREST returns');

  /* ⛔ THE FOUR REAL ROWS, read from the live database on 2026-09-13. This is the confirmation
     Paul asked for: refuse RG and Ronnie, refuse SC Plumbing twice over, allow AD on 11 October. */
  const RG = { contract: { version: 1, guarantee: 'work', guaranteeReason: 'no recorded payment below the current £99 — work guarantee (the default)' }, amountPaid: 19.99, baselineFrozenAt: '2026-08-11T15:26:28.878+00:00', remeasureDueDate: '2026-10-06' };
  const RONNIE = { contract: null, amountPaid: 49.99, baselineFrozenAt: '2026-08-18T13:41:55.789+00:00', remeasureDueDate: '2026-10-13' };
  const SC = { contract: { version: 1, guarantee: 'work' }, amountPaid: 49.99, baselineFrozenAt: '2026-08-22T04:23:05.616+00:00', remeasureDueDate: null };
  const AD = { contract: { version: 2 }, amountPaid: 99, baselineFrozenAt: '2026-09-13T05:50:34.177+00:00', remeasureDueDate: '2026-10-11' };
  ok(currentTermsVerdict(RG).current === false, 'REAL ROW: RG Locksmiths is refused');
  ok(currentTermsVerdict(RONNIE).current === false, 'REAL ROW: Ronnie is refused (no contract — never finished the questionnaire)');
  ok(currentTermsVerdict(SC).current === false, 'REAL ROW: SC Plumbing is refused');
  ok(currentTermsVerdict(AD).current === true, "REAL ROW: AD Locksmithing is ALLOWED - the one client on the current terms");
  ok(currentTermsVerdict({ ...SC, contract: { version: 2 }, amountPaid: 99 }).current === false, '…and SC is refused a second way: no due date either');

  /* The gate is IN FRONT of every other test, so a legacy client never even reaches the numbers. */
  const c = compareMeasurements(rows(QS, 3, [1, 1, 0, 0]), rows(QS, 3, [1, 1, 0, 0]), { businessName: 'X' });
  const legacy = remeasureResultsDecision({ replayRuns: [{ status: 'complete' }], replayTarget: 1, comparison: c, copyApproved: true, terms: currentTermsVerdict(RG) });
  ok(legacy.send === false && legacy.kind === 'terms_differ', 'the decision refuses a legacy client with kind terms_differ');
  ok(legacy.send === false && legacy.reason.startsWith(LEGACY_TERMS_LABEL), '…and the reason opens with the operator label the card shows');
  const brokenToo = remeasureResultsDecision({ replayRuns: [{ status: 'failed' }], replayTarget: 3, comparison: c, copyApproved: true, terms: currentTermsVerdict(RG) });
  ok(brokenToo.send === false && brokenToo.kind === 'terms_differ', 'terms are reported BEFORE a broken replay — the terminal reason wins');
  ok(remeasureResultsDecision({ replayRuns: [{ status: 'complete' }], replayTarget: 1, comparison: c, copyApproved: false, terms: currentTermsVerdict(AD) }).send === false, 'the copy gate still refuses even a current-terms client');
}

console.log("-- The delayed monthly: one clock, not two --");
{
  /* ⛔ THE PROPERTY THAT MAKES THE MODEL SAFE: the first charge lands exactly when the right to
     claim ends, because both come from the SAME function. Asserting the reference identity, not
     just equal outputs — two functions that agree today drift the first time either is edited. */
  ok(monthlyStartIso === claimWindowCloseIso, 'the billing anchor IS the claim-window function, not a copy of it');
  const sent = '2026-10-11T09:00:00.000Z';
  ok(monthlyStartIso(sent) === '2026-10-25T09:00:00.000Z', 'results sent 11 Oct -> monthly starts 25 Oct');
  ok(monthlyStartIso(null) === null && monthlyStartIso('junk') === null, 'no stamp / unreadable stamp -> no billing date');

  const base = { businessName: 'RG Locksmiths', town: 'Huntingdon', beforeNamed: 23, beforeAnswered: 72, afterNamed: 31, afterAnswered: 96, questions: 12, documentUrl: 'https://findable.live/results/x', wentUp: true, withinNoise: false };
  const withMonthly = resultsEmailParagraphs({ ...base, monthlyStartsOn: '25 October 2026' });
  ok(withMonthly.some((p) => p.includes('25 October 2026') && p.includes(String(FINDABLE_MONTHLY_GBP))), 'the results email names the date AND the amount');
  ok(withMonthly.some((p) => /cancel/i.test(p)), '...and says how to stop it');
  const noMonthly = resultsEmailParagraphs({ ...base, monthlyStartsOn: null });
  ok(!noMonthly.some((p) => /monthly/i.test(p)), 'a client with no monthly is told nothing about billing');
  ok(noMonthly.length === withMonthly.length - 1, 'exactly one paragraph is added, never a reshuffle');

  const rem = monthlyStartingSoonEmail({ businessName: 'RG Locksmiths', startsOn: '25 October 2026', cancelUrl: null });
  ok(rem.subject.includes('25 October 2026'), 'the three-day reminder names the date in its subject');
  ok(rem.paragraphs[1].includes(String(FINDABLE_MONTHLY_GBP)) && rem.paragraphs[1].includes('25 October 2026'), '...and the amount and date in its first line');

  /* ⛔ PAUL'S STANDING RULE: maintenance is the first thing anyone cuts. */
  for (const text of [...withMonthly, ...rem.paragraphs, CARD_SAVED_NOTICE]) {
    ok(!/maintain|maintenance/i.test(text), `no "maintain": "${text.slice(0, 44)}"`);
  }
  ok(/99/.test(CARD_SAVED_NOTICE) && /nothing else is taken/i.test(CARD_SAVED_NOTICE), 'the card notice says what is taken today and what is not');
}

console.log('── The words ──');
{
  const base = { businessName: 'RG Locksmiths', town: 'Huntingdon', beforeNamed: 23, beforeAnswered: 72, afterNamed: 31, afterAnswered: 96, questions: 12, documentUrl: 'https://findable.live/results/x' };
  const notUp = resultsEmailParagraphs({ ...base, wentUp: false, withinNoise: true });
  ok(notUp.some((p) => p.includes(REMEASURE_CLAIM_SENTENCE)), 'not gone up → the email carries the locked claim sentence verbatim');
  ok(notUp.some((p) => p.includes('has not gone up')), '…and says so plainly');
  ok(notUp.some((p) => p.includes(`${NOISE_BAND_PP}-point swing`)), '…and explains the band when the change was inside it');
  /* ⛔ PAUL'S ORDER, 2026-09-13: verdict, then entitlement, then mechanism — never the offer first.
     The lead-in is ours; the sentence it introduces is the locked one, whole and unedited. */
  const verdictAt = notUp.findIndex((p) => p.includes('has not gone up'));
  const claimAt = notUp.findIndex((p) => p.includes(REMEASURE_CLAIM_SENTENCE));
  ok(verdictAt >= 0 && claimAt > verdictAt, 'the verdict comes BEFORE the claim paragraph');
  ok(notUp[claimAt] === `That means the guarantee applies. ${REMEASURE_CLAIM_SENTENCE}`, 'the claim paragraph is the lead-in plus the locked sentence, nothing else');
  ok(resultsClaimParagraph().endsWith(REMEASURE_CLAIM_SENTENCE), 'the locked sentence is never shortened or reworded');
  const up = resultsEmailParagraphs({ ...base, wentUp: true, withinNoise: false });
  ok(!up.some((p) => p.includes(REMEASURE_CLAIM_SENTENCE)) && up.some((p) => p.includes('has gone up')), 'gone up → no claim sentence, says it went up');
  ok(up.some((p) => p.includes('23 of 72')) && up.some((p) => p.includes('31 of 96')), 'both counts, each with its denominator');
  ok(resultsEmailSubject(base as never) === 'Your four-week results — RG Locksmiths', 'the subject');
  ok(resultsDocumentMeaning({ ...base, wentUp: false, withinNoise: false }).some((p) => p.includes(REMEASURE_CLAIM_SENTENCE)), 'the document says the same sentence');
  /* ⛔ "guarantee" AS A BARE NOUN IS ALLOWED IN EXACTLY ONE PLACE — Paul's approved lead-in, which
     names the refund policy the client was sold. What must never appear is a PROMISE built on the
     word, or the hedges CLAUDE.md §1 deleted. A blanket ban on the noun failed his own wording. */
  for (const p of [...notUp, ...up]) {
    ok(!/eight|8 weeks|promise|we guarantee|guaranteed/i.test(p), `no hedge, no old cycle: "${p.slice(0, 50)}"`);
    ok(!/guarantee/i.test(p) || p === resultsClaimParagraph(), `"guarantee" only in the approved claim paragraph: "${p.slice(0, 50)}"`);
  }
}

console.log('── The document renders both counts and the sentence, and no competitor names ──');
{
  const before = rows(QS, 3, [1, 0, 0, 0]), after = rows(QS, 3, [1, 0, 0, 0]);
  const c = compareMeasurements(before, after, { businessName: 'RG Locksmiths' });
  const html = renderRemeasureResultsHtml({ businessName: 'RG Locksmiths', town: 'Huntingdon', comparison: c, beforeDate: '2026-08-11T10:00:00Z', afterDate: '2026-09-08T10:00:00Z', sentAtLabel: '8 Sep 2026' });
  // esc() entity-escapes the apostrophe in "we'll", so match the sentence's unambiguous clause.
  ok(html.includes('email us within 14 days of your four week results'), 'unchanged → the document carries the claim sentence');
  ok(html.includes('2 <span class="rr-of">of 24</span>'), 'before count with denominator (1 named run × 2 engines = 2 of 24)');
  ok(/Four-week results/.test(html) && /<table class="rr">/.test(html), 'band and the per-question table');
  ok(!/competitor|rival/i.test(html), 'no competitor language on the client document');
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) process.exit(1);
