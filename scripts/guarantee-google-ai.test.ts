/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE GUARANTEE COUNTS GOOGLE AI FOR NEW BASELINES — LIKE WITH LIKE (Paul, 2026-10-19).

   Pinned here:
     1. A baseline created BEFORE GOOGLE_AI_SCORED_SINCE is judged exactly as before (ChatGPT + Gemini) on both sides.
     2. A baseline created on or after it counts Google AI on BOTH sides, only on answers where Google showed one — a
        search with none is left out, never a miss.
     3. The method is the BASELINE's, never the replay's (remeasure-results passes the baseline audit's created_at).
     4. A new client's baseline figure (the report / welcome pack) IS the comparison's before side.
     5. The approved email wording is byte-identical for every method-1 client; method 2 names Google AI.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { compareMeasurements } from '../src/lib/measurementCompare.ts';
import { buildReportData } from '../src/lib/auditReport.ts';
import { GOOGLE_AI_SCORED_SINCE, scoringMethodFor } from '../src/lib/aiOverview.ts';
import { resultsEmailParagraphs } from '../src/lib/remeasureResults.ts';

let failures = 0;
function ok(cond: unknown, label: string) { if (cond) console.log('  PASS ' + label); else { failures++; console.log('  FAIL ' + label); } }

const BIZ = 'Acme Plumbing';
const cell = (named: boolean) => ({ answer_text: named ? `Try ${BIZ} for that.` : 'Try Other Co for that.', competitors: named ? [] : ['Other Co'], self_named: named, citations: [] });
/** One run: per question, ChatGPT / Gemini named?, and Google AI: true / false = shown and named / not, null = none shown. */
const run = (runId: string, spec: Array<[boolean, boolean, boolean | null]>) => spec.map(([gpt, gem, ga], i) => ({
  run_id: runId, question: `Who is the best plumber in Bath for job ${i}?`, engines: ['chatgpt', 'gemini'], status: 'done',
  result: { chatgpt: cell(gpt), gemini: cell(gem), ...(ga === null ? { _ai_overview: 'not_shown' } : { _ai_overview: 'shown', ai_overview: cell(ga) }) },
}));
const before = run('b1', [[false, false, false], [true, false, null], [false, false, false]]);
const after = run('a1', [[false, true, true], [true, false, null], [false, false, true]]);
const opts = { businessName: BIZ, trade: 'plumber', town: 'Bath' };

console.log('── 1. Method 1 (every baseline before the switch) is unchanged ──');
const m1 = compareMeasurements(before as never, after as never, opts);
const legacy = compareMeasurements(before as never, after as never, { ...opts, scoringMethod: 1 });
ok(m1.scoringMethod === 1 && JSON.stringify(m1) === JSON.stringify(legacy), 'absent = method 1, identical to an explicit 1');
ok(m1.before.named === 1 && m1.before.answered === 6 && m1.after.named === 2 && m1.after.answered === 6, `ChatGPT + Gemini only: 1 of 6 → 2 of 6 (${m1.before.named}/${m1.before.answered} → ${m1.after.named}/${m1.after.answered})`);

console.log('── 2. Method 2 counts Google AI on both sides, only where shown ──');
const m2 = compareMeasurements(before as never, after as never, { ...opts, scoringMethod: 2 });
ok(m2.scoringMethod === 2, 'the comparison says which method judged it');
ok(m2.before.answered === 8 && m2.after.answered === 8, `two shown Google AI answers per side are added; the "none shown" search adds nothing (${m2.before.answered}, ${m2.after.answered})`);
ok(m2.before.named === 1 && m2.after.named === 4, `Google AI named counted on both sides: 1 of 8 → 4 of 8 (${m2.before.named} → ${m2.after.named})`);
ok(m2.questions.every((q) => (q.before?.answered ?? 0) <= 3), 'per question, one more answer at most (the shown Google AI one)');

console.log('── 3. The BASELINE\'s method decides, never the replay\'s ──');
ok(scoringMethodFor('2026-10-01T00:00:00Z') === 1 && scoringMethodFor(GOOGLE_AI_SCORED_SINCE) === 2, 'the switch is the baseline audit\'s created_at');
{
  const rr = readFileSync(new URL('../supabase/functions/_shared/remeasure-results.ts', import.meta.url), 'utf8');
  ok(/select\("baseline_contract, baseline_completed_at, created_at"\)\s*\.eq\("id", lead\.baseline_audit_id\)/.test(rr), 'the sender reads the BASELINE audit\'s created_at');
  ok(/scoringMethod: scoringMethodFor\(\(bl as \{ created_at\?: string \| null \} \| null\)\?\.created_at \?\? null\)/.test(rr), '…and judges both sides by it');
  ok(/googleAiInScore: comparison\.scoringMethod === 2/.test(rr), '…and the email says which engines were counted');
  for (const f of ['src/components/ReportBeforeAfter.tsx', 'src/pages/CompareMeasurements.tsx']) {
    ok(/scoringMethod: scoringMethodFor\(/.test(readFileSync(new URL('../' + f, import.meta.url), 'utf8')), f + ': the operator comparison uses the before side\'s method too');
  }
}

console.log('── 4. A new client\'s baseline figure IS the guarantee\'s before side ──');
{
  const ctx = { businessName: BIZ, businessType: 'plumber', locationText: 'Bath', specialisms: '', isAggregatorUrl: () => false };
  const old = buildReportData(before as never, null, { ...ctx, auditCreatedAt: '2026-10-01T00:00:00Z' })!;
  const neu = buildReportData(before as never, null, { ...ctx, auditCreatedAt: GOOGLE_AI_SCORED_SINCE })!;
  ok(old.named === m1.before.named && old.total === m1.before.answered && !old.googleAiInScore, `method 1 report: ${old.named} of ${old.total} = the method-1 before side`);
  ok(neu.named === m2.before.named && neu.total === m2.before.answered && neu.googleAiInScore === true, `method 2 report: ${neu.named} of ${neu.total} = the method-2 before side`);
  for (const f of ['supabase/functions/_shared/welcome-pack-render.ts', 'supabase/functions/render-audit-report/index.ts', 'supabase/functions/paid-client-hub/index.ts']) {
    ok(/auditCreatedAt: /.test(readFileSync(new URL('../' + f, import.meta.url), 'utf8')), f + ': passes the audit\'s created_at');
  }
}

console.log('── 5. The email wording ──');
{
  const base = { businessName: BIZ, town: 'Bath', beforeNamed: 1, beforeAnswered: 6, afterNamed: 2, afterAnswered: 6, questions: 3, wentUp: true, withinNoise: false, documentUrl: 'https://findable.live/x' };
  const p1 = resultsEmailParagraphs(base);
  const p2 = resultsEmailParagraphs({ ...base, googleAiInScore: true });
  ok(/we measured how often ChatGPT and Gemini named Acme Plumbing/.test(p1[1]) && !/Google AI/.test(p1.join(' ')), 'method 1: the approved "ChatGPT and Gemini" wording, unchanged');
  ok(/ChatGPT, Gemini and Google AI \(where Google showed an AI answer\) named Acme Plumbing/.test(p2[1]), 'method 2: names Google AI and the shown-only rule');
  ok(p1.slice(2).join('|') === p2.slice(2).join('|'), 'everything else in the email is identical');
}

if (failures) throw new Error(`${failures} guarantee / Google AI checks failed`);
console.log('\nAll guarantee / Google AI checks passed.');
