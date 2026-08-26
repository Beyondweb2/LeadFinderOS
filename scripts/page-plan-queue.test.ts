/* Tests for src/lib/pagePlanQueue.ts — the guards Stage 1 stands on:
   the AI partition is VERIFIED (nothing dropped/duplicated, fallback loud), TOWN IS A HARD SPLIT
   (a cluster never spans towns), holds are PER QUESTION from real run counts (a named sibling never
   holds an absent page), waves keep a topic's pages together, near-dups flag.
   Run: npx tsx scripts/page-plan-queue.test.ts */
import {
  preMergeQuestions, validateClusters, scoreCluster, buildQueue, topSources,
  enforceTownSplit, majorityVerdict, questionDefends, questionIsGeminiGap, namedCountsLabel,
  WAVE1_MIN_SCORE, NEAR_DUP_JACCARD,
  type ClusterProposal, type QuestionSignals, type WinnVerdict, type EngineNamed,
} from '../src/lib/pagePlanQueue.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const en = (named: number, runs: number): EngineNamed => ({ named, runs });
const sig = (q: string, w: WinnVerdict, cg: EngineNamed | null, gm: EngineNamed | null, biz = false): QuestionSignals =>
  ({ question: q, winnability: w, winnabilityReason: 'test', named: { chatgpt: cg, gemini: gm }, businessSources: biz });

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
}

console.log('── ⛔ TOWN IS A HARD SPLIT (the RG cross-town merge fault) ──');
{
  // The exact fault: one "Emergency lockouts" cluster spanning 4 towns.
  const qs = [
    'emergency lockouts locksmiths in Huntingdon UK', 'emergency lockouts locksmiths in Peterborough UK',
    'emergency lockouts locksmiths in Cambridge UK', 'emergency lockouts locksmiths in St neots UK',
    'window locks locksmiths in Huntingdon UK', 'upvc door locksmiths in Huntingdon UK',
  ];
  const towns = ['Huntingdon', 'St Neots', 'Peterborough', 'Cambridge'];
  const proposed: ClusterProposal[] = [
    { job: 'Emergency lockouts', topic: 'emergencies', primaryIndex: 0, questionIndices: [0, 1, 2, 3], rationale: 'same service' },
    { job: 'uPVC and window locks — Huntingdon', topic: 'locks', primaryIndex: 4, questionIndices: [4, 5], rationale: 'one service in the questionnaire' },
  ];
  const { clusters, splits } = enforceTownSplit(qs, proposed, towns);
  ok(clusters.length === 5, `4-town cluster split into 4 + within-town merge kept (${clusters.length} clusters)`);
  ok(splits.length === 1 && splits[0].includes('4 towns'), '  the split is REPORTED, never silent');
  const jobs = clusters.map((c) => c.job).sort();
  ok(jobs.some((j) => j.includes('Peterborough')) && jobs.some((j) => j.includes('Cambridge')), '  split pages carry their town in the job');
  const within = clusters.find((c) => c.questionIndices.length === 2 && c.questionIndices.includes(4));
  ok(!!within && within.questionIndices.includes(5), '  window+upvc BOTH-Huntingdon merge survives (within-town merging allowed)');
  // Partition preserved: every index exactly once.
  const all = clusters.flatMap((c) => c.questionIndices).sort();
  ok(JSON.stringify(all) === JSON.stringify([0, 1, 2, 3, 4, 5]), '  split preserves the perfect partition');
  // National client: no towns -> untouched.
  const nat = enforceTownSplit(qs, proposed, []);
  ok(nat.clusters === proposed && nat.splits.length === 0, '  national client (no towns) is untouched');
}

console.log('── MAJORITY VERDICT + PER-QUESTION NAMED ──');
{
  ok(majorityVerdict(['open', 'open', 'contested']) === 'open', 'majority across runs wins');
  ok(majorityVerdict(['named', 'open', 'open']) === 'open', '  1-of-3 named does not read as named');
  ok(majorityVerdict(['named', 'open']) === 'named', '  ties break toward named (never under-claims presence)');
  ok(majorityVerdict([]) === 'unmeasured', '  no runs -> unmeasured, never confident');
  ok(questionDefends(sig('q', 'open', en(0, 3), en(2, 3))), 'Gemini 2/3 -> defends');
  ok(!questionDefends(sig('q', 'open', en(3, 3), en(0, 3))), '  ChatGPT 3/3 with Gemini 0/3 does NOT defend (Gemini-first)');
  ok(!questionDefends(sig('q', 'open', en(0, 3), en(1, 3))), '  Gemini 1/3 is not named');
  ok(!questionDefends(sig('q', 'open', null, en(1, 1))), '  a single-run fluke never defends (needs >=2 runs)');
  ok(questionIsGeminiGap(sig('q', 'named', en(3, 3), en(0, 3))), 'ChatGPT-named + Gemini-absent = Gemini gap');
  ok(!questionIsGeminiGap(sig('q', 'open', en(1, 3), en(0, 3))), '  ChatGPT 1/3 is not a gap (not strong)');
  ok(!questionIsGeminiGap(sig('q', 'named', en(3, 3), en(2, 3))), '  Gemini-named is a defend, not a gap');
  ok(namedCountsLabel(sig('q', 'open', en(3, 3), en(0, 3))) === 'ChatGPT 3/3 · Gemini 0/3', 'counts label is the verifiable numbers');
  ok(namedCountsLabel(sig('q', 'open', null, en(1, 3))) === 'ChatGPT — · Gemini 1/3', '  absent engine shows as —');
}

console.log('── ⛔ GEMINI-FIRST THREE-WAY: build / build-with-gap-tag / defend ──');
{
  // 1. BUILD (best): Gemini absent, ChatGPT absent -> full scoring, wide-open ranks highest.
  const absent = scoreCluster([sig('lock changes peterborough', 'open', en(0, 3), en(0, 3), true)]);
  ok(!absent.defend && !absent.geminiGap, 'neither engine named -> plain build');
  ok(absent.reasons.some((r) => r.includes('absent from every answer')), '  and scores the absence bonus');
  ok(absent.score >= WAVE1_MIN_SCORE, `  wide-open build clears wave 1 (${absent.score})`);
  // 2. BUILD (Gemini gap): ChatGPT 3/3, Gemini 0/3 -> BUILDS, tagged, scored below the wide-open build.
  const gap = scoreCluster([sig('lock changes huntingdon', 'named', en(3, 3), en(0, 3), true)]);
  ok(!gap.defend, 'ChatGPT-named + Gemini-absent BUILDS (never holds)');
  ok(gap.geminiGap, '  and carries the Gemini-gap flag');
  ok(gap.reasons.some((r) => r.includes('Already strong on ChatGPT') && r.includes('Gemini gap')), '  with the client-safe tag line');
  ok(gap.score < absent.score, `  gap build (${gap.score}) ranks below the wide-open build (${absent.score})`);
  // 3. DEFEND: ONLY Gemini named (>= 2 of 3) holds.
  const named = scoreCluster([sig('emergency lockouts huntingdon', 'named', en(3, 3), en(3, 3))]);
  ok(named.defend, 'Gemini 3/3 defends');
  ok((named.defendReason ?? '').includes('ChatGPT 3/3 · Gemini 3/3'), '  reason carries the verifiable counts');
  ok((named.defendReason ?? '').includes('this question') && !(named.defendReason ?? '').includes('every question'),
    '  single-question hold says "this question", never "every question"');
  const gmOnly = scoreCluster([sig('q', 'named', en(0, 3), en(2, 3))]);
  ok(gmOnly.defend, '  Gemini 2/3 alone defends (ChatGPT irrelevant to the hold)');
  const namedMulti = scoreCluster([
    sig('q one', 'named', en(3, 3), en(2, 3)), sig('q two', 'named', en(2, 3), en(3, 3)),
  ]);
  ok(namedMulti.defend && (namedMulti.defendReason ?? '').includes('all 2 questions') && (namedMulti.defendReason ?? '').includes('"q one"'),
    '  multi-question hold itemises each question\'s counts');
  // Mixed page: one Gemini-defended variant + one absent variant -> NOT held.
  const mixed = scoreCluster([
    sig('window locks huntingdon', 'named', en(3, 3), en(3, 3)),
    sig('upvc door huntingdon', 'open', en(0, 3), en(0, 3)),
  ]);
  ok(!mixed.defend, 'one defended sibling never holds a page with an absent variant');
  ok(mixed.winnability === 'open', '  and the page winnability comes from the winnable variant');
  // locked no longer auto-holds — it builds with its low score.
  const locked = buildQueue(['q'], [{ job: 'q', topic: 't', primaryIndex: 0, questionIndices: [0], rationale: '' }],
    new Map([['q', sig('q', 'locked', en(0, 3), en(0, 3))]]));
  ok(locked[0].status === 'planned' && locked[0].score < WAVE1_MIN_SCORE, 'locked BUILDS low (only the Gemini defend holds)');
}

console.log('── WINNABILITY LABELS MAP THROUGH ──');
{
  const open = scoreCluster([sig('q', 'open', en(0, 3), en(0, 3), true)]);
  ok(open.winnability === 'open' && open.score >= WAVE1_MIN_SCORE, `open + absent + biz clears wave 1 (${open.score})`);
  const locked = scoreCluster([sig('q', 'locked', en(0, 3), en(0, 3))]);
  ok(locked.winnability === 'locked' && locked.score < WAVE1_MIN_SCORE, `locked maps through and scores low (${locked.score})`);
  const nlr = scoreCluster([sig('q', 'no_local_race', en(0, 3), en(0, 3))]);
  ok(nlr.winnability === 'no_local_race', 'no_local_race maps through');
}

console.log('── WAVES KEEP TOPICS TOGETHER + NEAR-DUP + QUEUE ASSEMBLY ──');
{
  const qs = ['strong testosterone q', 'weak testosterone q', 'hrt monthly cost q', 'locked incumbent q', 'defended q', 'the monthly hrt cost q'];
  const clusters: ClusterProposal[] = qs.map((q, i) => ({
    job: ['testo strong', 'testo weak', 'hrt cost', 'locked one', 'defended one', 'hrt cost dup'][i],
    topic: ['testosterone', 'testosterone', 'cost', 'locked-topic', 'defend-topic', 'cost'][i],
    primaryIndex: i, questionIndices: [i], rationale: '',
  }));
  const signals = new Map<string, QuestionSignals>([
    [qs[0], sig(qs[0], 'open', en(0, 3), en(0, 3), true)],
    [qs[1], sig(qs[1], 'contested', en(0, 3), en(0, 3))],
    [qs[2], sig(qs[2], 'contested', en(1, 3), en(1, 3))],   // partial presence on BOTH engines: no absence bonus, no gap -> stays under WAVE1_MIN
    [qs[3], sig(qs[3], 'locked', en(0, 3), en(0, 3))],
    [qs[4], sig(qs[4], 'named', en(3, 3), en(2, 3))],
    [qs[5], sig(qs[5], 'contested', en(1, 3), en(1, 3))],
  ]);
  const pages = buildQueue(qs, clusters, signals);
  const p = (job: string) => pages.find((x) => x.job === job)!;
  ok(p('testo strong').wave === 1 && p('testo weak').wave === 1, 'siblings share the strong page\'s wave (complete clusters)');
  ok(p('hrt cost').wave === 2, 'a weak topic lands in wave 2');
  ok(p('locked one').status === 'planned' && p('locked one').wave === 2, 'locked builds low in wave 2 (only the Gemini defend holds)');
  ok(p('defended one').status === 'held' && p('defended one').heldReason!.includes('ChatGPT 3/3'), 'defend hold cites the real counts');
  ok(p('hrt cost dup').nearDupOf === qs[2], `near-identical primaries flag as duplicates (J>=${NEAR_DUP_JACCARD})`);
  const noSig = buildQueue(['q'], [{ job: 'q', topic: 't', primaryIndex: 0, questionIndices: [0], rationale: '' }], new Map());
  ok(noSig[0].winnability === 'unmeasured' && noSig[0].scoreReasons[0].includes('no measured answers'), 'absent signals -> unmeasured, never confident');
}

console.log('── ⛔ ROW LABELS ARE UNAMBIGUOUS (the same-title build-vs-hold fault) ──');
{
  // The fault: two different questions both labelled "Locksmith Services in Cambridge" — one
  // build, one hold — reading as the tool contradicting itself about one page.
  const qs = ['emergency lockouts locksmiths in Cambridge UK', 'lock changes locksmiths in Cambridge UK', 'burglary repairs in Cambridge UK'];
  const clusters: ClusterProposal[] = [
    { job: 'Locksmith Services in Cambridge', topic: 'cambridge', primaryIndex: 0, questionIndices: [0], rationale: '' },
    { job: 'Locksmith Services in Cambridge', topic: 'cambridge', primaryIndex: 1, questionIndices: [1], rationale: '' },
    { job: 'Burglary repairs in Cambridge', topic: 'cambridge', primaryIndex: 2, questionIndices: [2], rationale: '' },
  ];
  const signals = new Map<string, QuestionSignals>([
    [qs[0], sig(qs[0], 'named', en(2, 3), en(0, 3))],
    [qs[1], sig(qs[1], 'open', en(0, 3), en(0, 3))],
    [qs[2], sig(qs[2], 'open', en(0, 3), en(0, 3))],
  ]);
  const pages = buildQueue(qs, clusters, signals);
  const jobs = pages.map((p) => p.job);
  ok(new Set(jobs.map((j) => j.toLowerCase())).size === jobs.length, 'no two rows share a label');
  ok(jobs.includes(qs[0]) && jobs.includes(qs[1]), '  colliding labels are replaced by each page\'s own primary question');
  ok(jobs.includes('Burglary repairs in Cambridge'), '  a unique label is left alone');
}

console.log('── TOP SOURCES ──');
{
  const t = topSources(['nhs.uk', 'healthline.com', 'NHS.UK ', 'menopausedirectory.com', 'nhs.uk', 'healthline.com', '', 'a.com', 'b.com', 'c.com', 'd.com']);
  ok(t[0].domain === 'nhs.uk' && t[0].count === 3, 'most-cited domain first (case/space-folded)');
  ok(t.length === 5, '  capped at 5');
  ok(topSources([]).length === 0, '  no citations -> empty, never invented');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
if (f > 0) process.exit(1);
