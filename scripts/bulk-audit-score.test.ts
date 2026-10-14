/* A BULK AUDIT HAS THE QUICK CHECK'S SCORE (2026-10-14, docs/bulk-audit-score.md).
   Outreach "Run AI audits" (bulk-jobs → create-ai-audit) asks the same shape as the quick check — N questions, each on
   ChatGPT + Gemini — but stored no score marker, so ai_visibility_report_offer refused every bulk-audited lead with
   "no visibility score". The fix is a marker, not a new number: bulk-jobs sends bulk_score, create-ai-audit stamps
   results.hook (version 2) with the questions AS QUEUED, and scoreHookRun — the quick check's own ruler — scores it.
   This pins: the wiring (and that it changes nothing asked or spent), the score on 3- and 5-question audits, no score
   when an answer failed, the all-named refusal at any size, rivals only from missed answers, and the % format. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOOK_ENGINES, initialHookStateV2, scoreHookRun, type HookScoreRow } from '../src/lib/hookScore.ts';
import { buildHookReportSummary } from '../src/lib/hookAudit.ts';
import { sixResultHookForbidsAbsenceCopy } from '../supabase/functions/_shared/audit-reply.ts';
import { formatVisibilityScore, REPORT_OFFER_REFUSAL_WORDS, reportOfferRefusal } from '../src/lib/reportOfferTemplate.ts';

let failures = 0;
function ok(value: unknown, message: string) {
  if (value) console.log(`PASS ${message}`);
  else { failures++; console.error(`FAIL ${message}`); }
}
const read = (p: string) => readFileSync(resolve(p), 'utf8').replace(/\r\n/g, '\n');

/* ── Wiring ─────────────────────────────────────────────────────────────────────────────────── */
{
  const bulk = read('supabase/functions/bulk-jobs/index.ts');
  ok(/bulk_score: true,/.test(bulk), 'bulk-jobs asks create-ai-audit for the score marker');
  const caa = read('supabase/functions/create-ai-audit/index.ts');
  ok(/const bulkScoreRequested: boolean = body\.bulk_score === true && isInternal;/.test(caa), 'create-ai-audit honours bulk_score from internal callers only');
  const branch = caa.slice(caa.indexOf('} else if (bulkScoreRequested'), caa.indexOf('} else if (bulkScoreRequested') + 600);
  ok(/ORDINARY_AUDIT_PURPOSE/.test(branch) && /initialHookStateV2\(questions, AUDIT_ENGINES\)/.test(branch), 'the marker is the queued questions × the queued engines, ordinary audits only');
  ok(!/finalHookPlan|topUpHookQuestions|questions\s*=/.test(branch), 'the marker never changes the questions (no hook plan, no top-up): nothing extra is asked or spent');
  ok(!/bulkScoreRequested/.test(caa.slice(caa.indexOf('const isHookAudit'), caa.indexOf('const isHookAudit') + 200)), 'a bulk audit is not a hook (no one-in-flight rule, no person guard)');
}

/* ── The score ──────────────────────────────────────────────────────────────────────────────── */
const BIZ = 'Bright English Academy';
const TOWN = 'Petaling Jaya';
const CTX = { named: { businessName: BIZ, trade: 'language school', town: TOWN }, town: TOWN, trade: 'language school' };
const Q5 = [1, 2, 3, 4, 5].map((i) => `Question ${i}: which English language school in ${TOWN}?`);
const cell = (named: boolean, rivals: string[]) => ({
  named, self_named: named,
  answer_text: named ? `Try ${BIZ}, ${rivals.join(', ')}.` : `Try ${rivals.join(', ')}.`,
  competitors: named ? [BIZ, ...rivals] : rivals,
});
function rows(qs: string[], grid: Array<[boolean | null, boolean | null]>): HookScoreRow[] {
  return grid.map(([c, g], i) => ({
    question: qs[i], status: 'done', engines: [...HOOK_ENGINES],
    result: {
      chatgpt: c === null ? { answer_text: '', competitors: [], error: 'timeout' } : cell(c, [`Named-${i}-c`, 'Shared Rival']),
      gemini: g === null ? { answer_text: '', competitors: [], error: 'timeout' } : cell(g, [`Missed-${i}-g`, 'Other Rival']),
    },
  }));
}
{
  const q3 = Q5.slice(0, 3);
  const s3 = scoreHookRun(initialHookStateV2(q3), rows(q3, [[true, false], [true, true], [false, false]]), CTX);
  ok(s3.complete && s3.named === 3 && s3.expected === 6 && s3.percent === 50, 'a 3-question bulk audit: 3 of 6 answers named = 50%');
  ok(formatVisibilityScore(s3.percent) === '50%', '{{4}} is a whole-number percentage with a % sign');
  const s5 = scoreHookRun(initialHookStateV2(Q5), rows(Q5, [[true, false], [true, true], [false, false], [true, false], [false, false]]), CTX);
  ok(s5.complete && s5.named === 4 && s5.expected === 10 && s5.percent === 40, 'a 5-question bulk audit is scored on its own 10 answers (4 named = 40%)');
  const failed = scoreHookRun(initialHookStateV2(q3), rows(q3, [[true, false], [null, true], [false, false]]), CTX);
  ok(!failed.complete && failed.percent === null && formatVisibilityScore(failed.percent) === '', 'one failed answer: no score, never a guess');
  ok(reportOfferRefusal({ hasAudit: true, competitors: 'A and B', score: formatVisibilityScore(failed.percent), link: 'https://findable.live/r/ABC123', namedInAnswers: false }) === 'no_score', '…and the report offer refuses it as no_score');
  ok(/answer failed or is missing/.test(REPORT_OFFER_REFUSAL_WORDS.no_score), 'the refusal says why in plain words');
  const short = scoreHookRun(initialHookStateV2(Q5.slice(0, 2)), rows(Q5.slice(0, 2), [[true, false], [false, false]]), CTX);
  ok(short.percent === null, 'fewer than three questions queued: no score');
}

/* ── Named everywhere: refused at any size; rivals only from missed answers ───────────────────── */
{
  const all5 = rows(Q5, Q5.map(() => [true, true] as [boolean, boolean]));
  ok(sixResultHookForbidsAbsenceCopy(initialHookStateV2(Q5), all5, CTX) === true, 'named in all 10 answers of a 5-question bulk audit: no absence to claim (refused as named)');
  const q3 = Q5.slice(0, 3);
  const sum = buildHookReportSummary({
    state: initialHookStateV2(q3), rows: rows(q3, [[true, true], [true, false], [true, true]]),
    engineOrder: ['chatgpt', 'gemini'], engineLabel: (e) => e, namedInstead: (c) => c, namedCtx: CTX.named, town: TOWN, trade: 'language school',
  });
  ok(sum?.gap?.engine === 'gemini' && sum.gap.question === q3[1], 'the rivals come from the one missed answer');
  ok(!!sum?.gap && !sum.gap.namedInstead.includes(BIZ) && !sum.gap.namedInstead.some((n) => n.startsWith('Named-')), '…never from an answer that named the lead');
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nbulk-audit-score: all passed');
