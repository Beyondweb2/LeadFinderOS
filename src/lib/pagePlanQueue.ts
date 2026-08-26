/* ════════════════════════════════════════════════════════════════════════════════════════════
   PAGE-PLAN QUEUE — pure logic for the £500-tier page plan (Stage 1, 2026-08-28, Paul's spec).

   Turns a client's measured questions into an ordered queue of DISTINCT-JOB pages:
     cluster (AI proposes, THIS MODULE verifies) → score (winnability + engine gap + client
     absence) → waves (siblings stay together — "publish complete clusters") → near-dup flags.

   ⛔ THE MODEL PROPOSES, CODE DISPOSES (the Q&A-mode safety shape). The AI clustering call returns
   question INDICES, not echoed strings — and validateClusters() checks a perfect partition: every
   index exactly once, nothing unknown. Any violation falls back to singleton clusters LOUDLY
   (partitionOk=false) rather than silently dropping a question.

   ⛔ Waves are EVIDENCE BANDS, not quotas. A topic's pages share ONE wave (the doc's "publish
   complete clusters"): the topic sits in the wave its best page earns. Holds are itemised with
   reasons, never silent; the operator can un-hold anything.

   Pure + dependency-free (edge fn AND SPA import it); scripts/page-plan-queue.test.ts drives it.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface QuestionSignals {
  question: string;
  /** computeWinnability label across the measurement repeats. */
  winnability: 'wide_open' | 'locked' | 'informational' | 'unclear';
  winnabilityReason: string;
  /** Per scored engine: fraction of answered cells naming the client (0..1), null = engine absent. */
  namedRate: { chatgpt: number | null; gemini: number | null };
  /** Business-type sources cited (a business page can plausibly rank there). */
  businessSources: boolean;
}

export interface ClusterProposal {
  job: string;                 // the distinct customer job, the AI's merge/split judgment
  topic: string;               // hub grouping — pages sharing a topic publish together
  primaryIndex: number;        // index into the question list of the page's primary question
  questionIndices: number[];   // EVERY variant this page answers (must include primaryIndex)
  rationale: string;           // why these merged (or stayed split)
}

export interface PlannedQueuePage {
  job: string;
  topic: string;
  primaryQuestion: string;
  questions: string[];         // all variants, primary first
  rationale: string;
  score: number;               // 0..100
  scoreReasons: string[];      // every point-worth of reasoning, itemised
  winnability: QuestionSignals['winnability'];
  wave: number;                // 1..N; held pages keep their computed wave for un-holding
  position: number;            // order within the wave
  status: 'planned' | 'held';
  heldReason: string | null;
  nearDupOf: string | null;    // another page's primaryQuestion when the two look near-identical
  /** The domains the engines actually cited answering this page's questions — "where the engines
   *  are looking", i.e. where to get listed. Top recurring, most-cited first. */
  topSources?: { domain: string; count: number }[];
}

/** Top recurring cited source domains: count every citation, most-cited first (ties alphabetical),
 *  top `limit`. Pure counting over what the audit already captured — no new data collection. */
export function topSources(domains: string[], limit = 5): { domain: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const d of domains) {
    const clean = String(d ?? '').trim().toLowerCase();
    if (clean) tally.set(clean, (tally.get(clean) ?? 0) + 1);
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count }));
}

/* ── tokenising (same light stem as pagePlan.ts, kept local so this module stays leaf) ─────── */
const norm = (s: string): string => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const stem = (t: string): string => (t.length >= 4 && t.endsWith('s') ? t.slice(0, -1) : t);
const STOP = new Set(['in', 'the', 'and', 'uk', 'a', 'an', 'for', 'of', 'to', 'do', 'i', 'my', 'is', 'it', 'on', 'can', 'how', 'what', 'who', 'where', 'which', 'much', 'doe', 'are', 'get', 'me', 'without', 'with']);
export const tokensOf = (s: string): string[] => norm(s).split(' ').filter(Boolean).map(stem).filter((t) => !STOP.has(t));

/** Deterministic pre-merge: questions whose significant token SETS are identical are one question.
 *  Returns [keptQuestions, mergedInto] where mergedInto maps a dropped duplicate → its keeper. */
export function preMergeQuestions(questions: string[]): { kept: string[]; mergedInto: Map<string, string> } {
  const byKey = new Map<string, string>();
  const kept: string[] = [];
  const mergedInto = new Map<string, string>();
  for (const q of questions) {
    const key = [...new Set(tokensOf(q))].sort().join(' ');
    const existing = byKey.get(key);
    if (existing === undefined) { byKey.set(key, q); kept.push(q); }
    else mergedInto.set(q, existing);
  }
  return { kept, mergedInto };
}

/** Validate the AI's clustering as a PERFECT PARTITION of 0..n-1. On any violation, fall back to
 *  one-cluster-per-question so nothing is ever silently dropped or duplicated. */
export function validateClusters(
  questions: string[], proposals: ClusterProposal[],
): { partitionOk: boolean; clusters: ClusterProposal[]; problems: string[] } {
  const n = questions.length;
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const c of proposals) {
    if (!Array.isArray(c.questionIndices) || c.questionIndices.length === 0) { problems.push(`cluster "${c.job}" has no questions`); continue; }
    for (const i of c.questionIndices) {
      if (!Number.isInteger(i) || i < 0 || i >= n) problems.push(`cluster "${c.job}" references unknown question index ${i}`);
      else if (seen.has(i)) problems.push(`question ${i} appears in more than one cluster`);
      else seen.add(i);
    }
    if (!c.questionIndices.includes(c.primaryIndex)) problems.push(`cluster "${c.job}" primary ${c.primaryIndex} not among its own questions`);
  }
  for (let i = 0; i < n; i++) if (!seen.has(i)) problems.push(`question ${i} ("${questions[i]}") missing from every cluster`);

  if (problems.length === 0) return { partitionOk: true, clusters: proposals, problems };
  // Fallback: singleton clusters — every question survives as its own page, loudly.
  const singles: ClusterProposal[] = questions.map((q, i) => ({
    job: q, topic: 'unclustered', primaryIndex: i, questionIndices: [i],
    rationale: 'clustering failed validation — kept as its own page',
  }));
  return { partitionOk: false, clusters: singles, problems };
}

/* ── scoring — winnability first (evidence-led), then engine gap + client absence + demand ─── */
const WINNABILITY_BASE: Record<QuestionSignals['winnability'], number> = {
  wide_open: 70, informational: 55, unclear: 35, locked: 10,
};
/** A question where the client is already named this often reads "defend", not "build new". */
export const DEFEND_NAMED_RATE = 0.5;
/** Wave 1 = topics whose best page clears this; everything else planned lands in wave 2. */
export const WAVE1_MIN_SCORE = 55;
/** Near-duplicate flag threshold: token Jaccard between two pages' primary questions. */
export const NEAR_DUP_JACCARD = 0.8;

export function scoreCluster(signals: QuestionSignals[]): {
  score: number; reasons: string[]; winnability: QuestionSignals['winnability']; defend: boolean;
} {
  // Best winnability among variants — a cluster is as winnable as its most winnable question.
  const order: QuestionSignals['winnability'][] = ['wide_open', 'informational', 'unclear', 'locked'];
  const best = order.find((w) => signals.some((s) => s.winnability === w)) ?? 'unclear';
  const reasons: string[] = [];
  let score = WINNABILITY_BASE[best];
  reasons.push(`${best.replace('_', ' ')} (${signals.find((s) => s.winnability === best)?.winnabilityReason ?? ''})`);

  const rates = signals.flatMap((s) => [s.namedRate.chatgpt, s.namedRate.gemini]).filter((r): r is number => r !== null);
  const maxRate = rates.length ? Math.max(...rates) : 0;
  const defend = maxRate >= DEFEND_NAMED_RATE;
  if (defend) reasons.push(`already named in ${Math.round(maxRate * 100)}% of answers — defend, not a new page`);
  else if (maxRate === 0 && rates.length > 0) { score += 10; reasons.push('client absent from every answer (+10)'); }
  else if (maxRate > 0) {
    // Engine gap: named somewhere but not everywhere — the page targets the absent engine.
    const gapEngine = signals.some((s) => (s.namedRate.chatgpt ?? 0) > 0) && !signals.some((s) => (s.namedRate.gemini ?? 0) > 0)
      ? 'Gemini' : signals.some((s) => (s.namedRate.gemini ?? 0) > 0) && !signals.some((s) => (s.namedRate.chatgpt ?? 0) > 0)
      ? 'ChatGPT' : null;
    if (gapEngine) { score += 5; reasons.push(`engine gap — absent on ${gapEngine} (+5)`); }
  }
  if (signals.some((s) => s.businessSources)) { score += 5; reasons.push('business-type sources cited (+5)'); }
  const extra = Math.min(5, signals.length - 1);
  if (extra > 0) { score += extra * 2; reasons.push(`${signals.length} question variants merged — demand signal (+${extra * 2})`); }

  return { score: Math.max(0, Math.min(100, score)), reasons, winnability: best, defend };
}

/** Assemble the queue: score each cluster, flag near-dups, hold defend/locked, and assign waves
 *  with SIBLINGS KEPT TOGETHER — a topic's pages all take the wave its best page earns. */
export function buildQueue(
  questions: string[], clusters: ClusterProposal[], signalsByQuestion: Map<string, QuestionSignals>,
): PlannedQueuePage[] {
  const pages: PlannedQueuePage[] = clusters.map((c) => {
    const qs = c.questionIndices.map((i) => questions[i]);
    const primary = questions[c.primaryIndex];
    const ordered = [primary, ...qs.filter((q) => q !== primary)];
    const sig = qs.map((q) => signalsByQuestion.get(q)).filter((s): s is QuestionSignals => !!s);
    const { score, reasons, winnability, defend } = sig.length
      ? scoreCluster(sig)
      : { score: 0, reasons: ['no measured answers for any variant'], winnability: 'unclear' as const, defend: false };
    let status: PlannedQueuePage['status'] = 'planned';
    let heldReason: string | null = null;
    if (defend) { status = 'held'; heldReason = 'client already named here — defend the position, a new page is not the move'; }
    else if (winnability === 'locked') { status = 'held'; heldReason = 'locked — a small consistent incumbent set holds this; low odds for a new page'; }
    return {
      job: c.job, topic: c.topic || 'general', primaryQuestion: primary, questions: ordered,
      rationale: c.rationale, score, scoreReasons: reasons, winnability,
      wave: 2, position: 0, status, heldReason, nearDupOf: null,
    };
  });

  // Near-dup flags between PAGES (cheap stage-1 gate): token Jaccard on primary questions.
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const a = new Set(tokensOf(pages[i].primaryQuestion));
      const b = new Set(tokensOf(pages[j].primaryQuestion));
      const inter = [...a].filter((t) => b.has(t)).length;
      const uni = new Set([...a, ...b]).size;
      if (uni > 0 && inter / uni >= NEAR_DUP_JACCARD) pages[j].nearDupOf = pages[i].primaryQuestion;
    }
  }

  // Waves: group by topic; a topic's wave = the band of its BEST planned page (complete clusters).
  const byTopic = new Map<string, PlannedQueuePage[]>();
  for (const p of pages) { const arr = byTopic.get(p.topic) ?? []; arr.push(p); byTopic.set(p.topic, arr); }
  const topicBest = new Map<string, number>();
  for (const [t, arr] of byTopic) {
    const planned = arr.filter((p) => p.status === 'planned');
    topicBest.set(t, planned.length ? Math.max(...planned.map((p) => p.score)) : Math.max(...arr.map((p) => p.score)));
  }
  const topicsOrdered = [...topicBest.entries()].sort((x, y) => y[1] - x[1]).map(([t]) => t);
  let pos1 = 0, pos2 = 0;
  for (const t of topicsOrdered) {
    const wave = (topicBest.get(t) ?? 0) >= WAVE1_MIN_SCORE ? 1 : 2;
    const members = (byTopic.get(t) ?? []).sort((x, y) => y.score - x.score);
    for (const p of members) {
      p.wave = wave;
      p.position = wave === 1 ? pos1++ : pos2++;
    }
  }
  return pages;
}
