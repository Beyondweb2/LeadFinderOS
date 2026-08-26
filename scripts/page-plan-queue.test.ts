/* Tests for src/lib/pagePlanQueue.ts — the guards Stage 1 stands on:
   the AI partition is VERIFIED (nothing dropped/duplicated, fallback loud), waves keep a topic's
   pages together, defend/locked hold with reasons, near-dups flag. Run: npx tsx scripts/page-plan-queue.test.ts */
import {
  preMergeQuestions, validateClusters, scoreCluster, buildQueue,
  WAVE1_MIN_SCORE, NEAR_DUP_JACCARD, type ClusterProposal, type QuestionSignals,
} from '../src/lib/pagePlanQueue.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const sig = (q: string, w: QuestionSignals['winnability'], cg: number | null, gm: number | null, biz = false): QuestionSignals =>
  ({ question: q, winnability: w, winnabilityReason: 'test', namedRate: { chatgpt: cg, gemini: gm }, businessSources: biz });

console.log('── PRE-MERGE ──');
{
  const { kept, mergedInto } = preMergeQuestions([
    'lock changes in Huntingdon UK', 'Lock change in huntingdon, UK!', 'emergency lockouts Huntingdon',
  ]);
  ok(kept.length === 2, `stem-identical variants merge (kept ${kept.length})`);
  ok(mergedInto.get('Lock change in huntingdon, UK!') === 'lock changes in Huntingdon UK', '  merged variant remembers its keeper');
}

console.log('── PARTITION VALIDATION (model proposes, code disposes) ──');
{
  const qs = ['q0', 'q1', 'q2'];
  const good: ClusterProposal[] = [
    { job: 'a', topic: 't', primaryIndex: 0, questionIndices: [0, 1], rationale: '' },
    { job: 'b', topic: 't', primaryIndex: 2, questionIndices: [2], rationale: '' },
  ];
  ok(validateClusters(qs, good).partitionOk, 'a perfect partition passes');

  const missing = validateClusters(qs, [{ job: 'a', topic: 't', primaryIndex: 0, questionIndices: [0, 1], rationale: '' }]);
  ok(!missing.partitionOk && missing.clusters.length === 3, 'a DROPPED question fails loudly -> singleton fallback keeps all 3');
  const dup = validateClusters(qs, [
    { job: 'a', topic: 't', primaryIndex: 0, questionIndices: [0, 1], rationale: '' },
    { job: 'b', topic: 't', primaryIndex: 1, questionIndices: [1, 2], rationale: '' },
  ]);
  ok(!dup.partitionOk, 'a question in TWO clusters fails');
  const unknown = validateClusters(qs, [{ job: 'a', topic: 't', primaryIndex: 0, questionIndices: [0, 1, 2, 9], rationale: '' }]);
  ok(!unknown.partitionOk, 'an unknown index fails');
  const badPrimary = validateClusters(qs, [
    { job: 'a', topic: 't', primaryIndex: 2, questionIndices: [0, 1], rationale: '' },
    { job: 'b', topic: 't', primaryIndex: 2, questionIndices: [2], rationale: '' },
  ]);
  ok(!badPrimary.partitionOk, 'a primary outside its own cluster fails');
}

console.log('── SCORING ──');
{
  const open = scoreCluster([sig('q', 'wide_open', 0, 0, true)]);
  ok(open.score >= WAVE1_MIN_SCORE, `wide_open + absent + biz sources clears wave 1 (${open.score})`);
  const defendS = scoreCluster([sig('q', 'wide_open', 0.7, 0)]);
  ok(defendS.defend, 'named in 70% of answers -> defend');
  const gap = scoreCluster([sig('q', 'unclear', 0.3, 0)]);
  ok(gap.reasons.some((r) => r.includes('absent on Gemini')), 'named on ChatGPT only -> Gemini gap reason');
  const locked = scoreCluster([sig('q', 'locked', 0, 0)]);
  ok(locked.score < WAVE1_MIN_SCORE, `locked scores low (${locked.score})`);
  const noAnswers = buildQueue(['q'], [{ job: 'q', topic: 't', primaryIndex: 0, questionIndices: [0], rationale: '' }], new Map());
  ok(noAnswers[0].scoreReasons[0].includes('no measured answers'), 'absent signals -> honest zero, never a confident score');
}

console.log('── WAVES KEEP TOPICS TOGETHER + HOLDS + NEAR-DUP ──');
{
  const qs = ['strong testosterone q', 'weak testosterone q', 'hrt monthly cost q', 'locked incumbent q', 'defended q', 'the monthly hrt cost q'];
  const clusters: ClusterProposal[] = [
    { job: 'testo strong', topic: 'testosterone', primaryIndex: 0, questionIndices: [0], rationale: '' },
    { job: 'testo weak', topic: 'testosterone', primaryIndex: 1, questionIndices: [1], rationale: '' },
    { job: 'hrt cost', topic: 'cost', primaryIndex: 2, questionIndices: [2], rationale: '' },
    { job: 'locked one', topic: 'locked-topic', primaryIndex: 3, questionIndices: [3], rationale: '' },
    { job: 'defended one', topic: 'defend-topic', primaryIndex: 4, questionIndices: [4], rationale: '' },
    { job: 'hrt cost dup', topic: 'cost', primaryIndex: 5, questionIndices: [5], rationale: '' },
  ];
  const signals = new Map<string, QuestionSignals>([
    [qs[0], sig(qs[0], 'wide_open', 0, 0, true)],   // high — pulls its topic into wave 1
    [qs[1], sig(qs[1], 'unclear', 0, 0)],           // low — but same topic, must ride along
    [qs[2], sig(qs[2], 'unclear', 0, 0)],           // low topic — wave 2
    [qs[3], sig(qs[3], 'locked', 0, 0)],
    [qs[4], sig(qs[4], 'wide_open', 0.8, 0.8)],
    [qs[5], sig(qs[5], 'unclear', 0, 0)],
  ]);
  const pages = buildQueue(qs, clusters, signals);
  const p = (job: string) => pages.find((x) => x.job === job)!;
  ok(p('testo strong').wave === 1 && p('testo weak').wave === 1, 'siblings share the strong page\'s wave (complete clusters)');
  ok(p('hrt cost').wave === 2, 'a weak topic lands in wave 2');
  ok(p('locked one').status === 'held' && !!p('locked one').heldReason, 'locked -> held WITH a reason');
  ok(p('defended one').status === 'held' && p('defended one').heldReason!.includes('defend'), 'already-named -> held as defend');
  ok(p('hrt cost dup').nearDupOf === qs[2], `near-identical primaries flag as duplicates (J>=${NEAR_DUP_JACCARD})`);
  const w1 = pages.filter((x) => x.wave === 1).map((x) => x.position);
  ok(new Set(w1).size === w1.length, 'positions unique within a wave');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f > 0) process.exit(1);
