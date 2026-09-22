/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HOOK REPORT LAYOUT — restored toward page 1 of the old baseline audit PDF (2026-09-21).

   Scope: the report shows ONLY the failed search (never the earlier successful one(s), never a
   list of every question tested), the verdict headline is a strong, non-overstated customer-facing
   line (never the old "We found a visibility gap." technical wording, never "AI never recommends
   you" when an earlier question succeeded), and the process/execution-count wording ("Visibility
   gap found after N searches", "N of up to M") is gone entirely — that count is internal
   methodology, not something a prospect needs to see.

   Does NOT touch hook progression, adaptive Q1→Q2→Q3 decision logic, or audit scoring — this file
   only renders pre-built HookReportSummary objects and inspects HTML. */
import { buildHookReportSummary, type HookState } from '../src/lib/hookAudit.ts';
import { renderHookSection } from '../src/lib/aiAuditReportHtml.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const ENGINES = ['chatgpt', 'gemini'] as const;
const label = (e: string) => e === 'chatgpt' ? 'ChatGPT' : e === 'gemini' ? 'Gemini' : e;
const Q1 = 'Can you recommend a good driving instructor in Wolverhampton?';
const Q2 = 'driving lessons for beginners in Wolverhampton UK';

/** Q1 named (Gemini), Q2 missed (Gemini) — the real shape a Q2 gap takes: two settled rows, one
 *  successful, one not, exactly as `evaluateHookQuestion`/`advanceHookState` would leave it. */
const gapOnQ2State: HookState = {
  version: 1,
  planned: [Q1, Q2],
  next_index: 2,
  executed: 2,
  stop_reason: 'visibility_gap_found',
  named_in: [{ question_index: 0, question: Q1, engines: ['chatgpt', 'gemini'] }],
  gap: {
    question_index: 1, question: Q2, engine: 'gemini', target_named: false,
    named_instead: [], citations: [], named_on_engines: ['chatgpt'],
    answer_excerpt: 'Some driving schools you could try...',
  },
};
const gapOnQ2Rows = [
  { question: Q1, status: 'done', result: { chatgpt: { named: true, answer_text: 'Yes, Pass4fun is great.', competitors: [] }, gemini: { named: true, answer_text: 'Yes, Pass4fun is great.', competitors: [] } } },
  { question: Q2, status: 'done', result: { chatgpt: { named: true, answer_text: 'Try J10, Pass4fun...', competitors: ['Driving School J10'] }, gemini: { named: false, answer_text: 'Try J10 or Beginner’s Wheel...', competitors: ['Driving School J10', 'Beginner’s Wheel'] } } },
];
const summaryQ2Gap = buildHookReportSummary({
  state: gapOnQ2State, rows: gapOnQ2Rows, engineOrder: ENGINES, engineLabel: label,
  namedInstead: (c) => c,
})!;
const html = renderHookSection(summaryQ2Gap, 'Pass4fun');

console.log('── 1/2: only the actual gap question renders — the earlier successful Q1 does not ──');
{
  ok(html.includes(Q2), '1: the failed question (Q2) is shown');
  ok(!html.includes(Q1), '2: the earlier, successful question (Q1) is never shown');
  ok(!html.includes('Yes, Pass4fun is great'), '2: Q1’s successful answer text never appears');
}

console.log('── 6/7/8/9: verdict wording, no "gap" technical language, no process/execution-count wording ──');
{
  ok(!html.includes('We found a visibility gap'), '7: the old generic/technical "We found a visibility gap" heading is gone');
  ok(html.includes('recommending you consistently yet.'), '6: a Q2 gap (named earlier) uses the non-overstated "consistently yet" verdict');
  ok(!/Visibility gap found/i.test(html), '8: the "Visibility gap found on/after..." search-count sentence is gone entirely');
  ok(!/\d+ of up to \d+/.test(html) && !html.includes('search tested') && !html.includes('searches tested'), '9: "N of up to M" / "search(es) tested" wording never appears');
  ok(!html.includes('did name') && !html.includes('this gap is specific to'), 'the cross-engine qualifier ("ChatGPT did name them... specific to Gemini") is gone, not just the question list');
}

console.log('── 12: the old-page-style verdict hierarchy renders in order (eyebrow → "the verdict" → headline) ──');
{
  const eyebrowAt = html.indexOf('Quick AI Visibility Check');
  const vkAt = html.indexOf('hook-vk');
  const headAt = html.indexOf('hook-head');
  ok(eyebrowAt >= 0 && vkAt > eyebrowAt && headAt > vkAt, '12: eyebrow, then "the verdict" label, then the headline, in that order');
  /* ⚠️ The card's class became "chatcard evcard" on 2026-09-22 when the replica engine chrome was
     replaced by Findable's own evidence card. The ORDER is what this test is about and is unchanged;
     matched on the evidence class so it cannot pass on some other card appearing first. */
  ok(html.indexOf('evcard') > headAt, '12: the evidence card follows the verdict, not before it');
}

console.log('── A Q1 gap (nothing named yet) earns the stronger, still-truthful headline ──');
{
  const q1GapState: HookState = { version: 1, planned: [Q1], next_index: 1, executed: 1, stop_reason: 'visibility_gap_found', named_in: [], gap: { question_index: 0, question: Q1, engine: 'gemini', target_named: false, named_instead: ['Driving School J10'], citations: [], named_on_engines: [], answer_excerpt: '' } };
  const q1Rows = [{ question: Q1, status: 'done', result: { gemini: { named: false, answer_text: 'Try J10.', competitors: ['Driving School J10'] } } }];
  const q1Summary = buildHookReportSummary({ state: q1GapState, rows: q1Rows, engineOrder: ENGINES, engineLabel: label, namedInstead: (c) => c })!;
  const q1Html = renderHookSection(q1Summary, 'Pass4fun');
  ok(q1Html.includes('recommending you for this search yet.'), 'a Q1 miss (no earlier success) uses the stronger "for this search yet" wording');
  ok(!q1Html.includes('consistently'), 'a Q1 miss never claims "inconsistency" — there is nothing to be inconsistent with yet');
}

console.log('── the fully-named ("ok") branch keeps its green verdict treatment ──');
{
  const namedState: HookState = { version: 1, planned: [Q1, Q2], next_index: 2, executed: 2, stop_reason: 'max_questions_reached', gap: null, named_in: [{ question_index: 0, question: Q1, engines: ['gemini'] }, { question_index: 1, question: Q2, engines: ['gemini'] }] };
  const namedRows = [
    { question: Q1, status: 'done', result: { gemini: { named: true, answer_text: 'x', competitors: [] } } },
    { question: Q2, status: 'done', result: { gemini: { named: true, answer_text: 'x', competitors: [] } } },
  ];
  const namedSummary = buildHookReportSummary({ state: namedState, rows: namedRows, engineOrder: ENGINES, engineLabel: label, namedInstead: (c) => c })!;
  const namedHtml = renderHookSection(namedSummary, 'Pass4fun');
  ok(namedHtml.includes('hook-head ok'), 'the fully-named headline carries the .ok class (green treatment, unchanged)');
  ok(!namedHtml.includes('class="chatcard"'), 'the fully-named branch never shows the not-named evidence card');
}

if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
