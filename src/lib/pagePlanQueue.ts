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

/* Winnability in the AUDIT'S OWN VOCABULARY (classifyWinnability verdicts), so the queue's label
   matches what the audit page shows for the same question. 'unmeasured' is the absent-value case —
   never a confident label. Computed PER RUN and folded by majorityVerdict() (single-run winnability
   is noise — measured 17.9% flip). */
export type WinnVerdict = 'named' | 'open' | 'contested' | 'locked' | 'no_local_race' | 'unmeasured';

/** Named counts for one engine: how many of the runs named the client. Counts, not a rate, so a
 *  hold reason can print the verifiable "ChatGPT 3/3 · Gemini 0/3". */
export interface EngineNamed { named: number; runs: number }

export interface QuestionSignals {
  question: string;
  /** Majority classifyWinnability verdict across the measurement runs. */
  winnability: WinnVerdict;
  winnabilityReason: string;
  /** Per scored engine: named-in-N-of-M-runs counts; null = engine never answered. */
  named: { chatgpt: EngineNamed | null; gemini: EngineNamed | null };
  /** Business-type sources cited (a business page can plausibly rank there). */
  businessSources: boolean;
}

/** Majority verdict across a question's runs; ties break toward the FIRST in priority order
 *  (named beats open beats contested… so a tie never under-claims the client's presence).
 *  Empty input → 'unmeasured', never a confident label. */
const VERDICT_PRIORITY: WinnVerdict[] = ['named', 'open', 'contested', 'locked', 'no_local_race'];
export function majorityVerdict(verdicts: WinnVerdict[]): WinnVerdict {
  const real = verdicts.filter((v) => v !== 'unmeasured');
  if (real.length === 0) return 'unmeasured';
  const tally = new Map<WinnVerdict, number>();
  for (const v of real) tally.set(v, (tally.get(v) ?? 0) + 1);
  let best: WinnVerdict = 'unmeasured', bestN = -1;
  for (const v of VERDICT_PRIORITY) {
    const n = tally.get(v) ?? 0;
    if (n > bestN) { best = v; bestN = n; }
  }
  return best;
}

/** A question reads as ALREADY NAMED when some engine named the client in at least half its runs,
 *  with ≥2 runs measured (a single-run fluke never defends). Counts-based so the reason can show
 *  the exact numbers. */
export function questionIsNamed(s: QuestionSignals): boolean {
  for (const e of [s.named.chatgpt, s.named.gemini]) {
    if (e && e.runs >= 2 && e.named / e.runs >= DEFEND_NAMED_RATE) return true;
  }
  return false;
}

/** "ChatGPT 3/3 · Gemini 0/3" — the verifiable named-counts line for one question. */
export function namedCountsLabel(s: QuestionSignals): string {
  const one = (name: string, e: EngineNamed | null) => (e ? `${name} ${e.named}/${e.runs}` : `${name} —`);
  return `${one('ChatGPT', s.named.chatgpt)} · ${one('Gemini', s.named.gemini)}`;
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
  winnability: WinnVerdict;
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

/* ── TOWN HARD SPLIT — for local/service clients, each town is a distinct provider-selection job
   (the £500 doc): a cluster is NEVER allowed to span towns, whatever the model proposed. Model
   proposes, code disposes. Merging variants WITHIN one town stays allowed. National clients pass
   an empty town list and are untouched. ────────────────────────────────────────────────────── */
function firstTownOf(question: string, towns: string[]): string {
  const qToks = tokensOf(question);
  const contains = (needle: string[]): boolean => {
    if (needle.length === 0 || needle.length > qToks.length) return false;
    outer: for (let i = 0; i + needle.length <= qToks.length; i++) {
      for (let j = 0; j < needle.length; j++) if (qToks[i + j] !== needle[j]) continue outer;
      return true;
    }
    return false;
  };
  for (const t of towns) if (contains(tokensOf(t))) return t;
  return '';
}

export function enforceTownSplit(
  questions: string[], clusters: ClusterProposal[], towns: string[],
): { clusters: ClusterProposal[]; splits: string[] } {
  if (towns.length === 0) return { clusters, splits: [] };
  const out: ClusterProposal[] = [];
  const splits: string[] = [];
  for (const c of clusters) {
    const byTown = new Map<string, number[]>();
    for (const i of c.questionIndices) {
      const t = firstTownOf(questions[i] ?? '', towns);
      (byTown.get(t) ?? byTown.set(t, []).get(t)!).push(i);
    }
    if (byTown.size <= 1) { out.push(c); continue; }
    splits.push(`"${c.job}" spanned ${byTown.size} towns — split (each town is its own local job)`);
    for (const [town, idxs] of byTown) {
      const primaryIndex = idxs.includes(c.primaryIndex) ? c.primaryIndex : idxs[0];
      const jobHasTown = town && tokensOf(c.job).join(' ').includes(tokensOf(town).join(' '));
      out.push({
        job: town && !jobHasTown ? `${c.job} — ${town}` : c.job,
        topic: c.topic,
        primaryIndex,
        questionIndices: idxs,
        rationale: `${c.rationale ? `${c.rationale} ` : ''}(town split enforced: each town is a distinct local job)`,
      });
    }
  }
  return { clusters: out, splits };
}

/* ── scoring — winnability first (evidence-led), then engine gap + client absence + demand ─── */
const WINNABILITY_BASE: Record<WinnVerdict, number> = {
  open: 70, no_local_race: 55, contested: 50, named: 30, unmeasured: 20, locked: 10,
};
/** Named in at least this share of runs (≥2 runs) on some engine = "already named" for that question. */
export const DEFEND_NAMED_RATE = 0.5;
/** Wave 1 = topics whose best page clears this; everything else planned lands in wave 2. */
export const WAVE1_MIN_SCORE = 55;
/** Near-duplicate flag threshold: token Jaccard between two pages' primary questions. */
export const NEAR_DUP_JACCARD = 0.8;

export function scoreCluster(signals: QuestionSignals[]): {
  score: number; reasons: string[]; winnability: WinnVerdict; defend: boolean; defendReason: string | null;
} {
  /* Defend is PER QUESTION, from the actual run counts — and a page holds only when EVERY measured
     question is already named. One named variant must never hold a page whose other variants are
     absent (the lock-changes-Peterborough fault: held on a sibling's 100% while itself at 0/3). */
  const measured = signals.filter((s) => s.winnability !== 'unmeasured' || s.named.chatgpt || s.named.gemini);
  const namedQs = signals.filter((s) => questionIsNamed(s));
  const defend = measured.length > 0 && namedQs.length === measured.length;
  const defendReason = defend
    ? `client already named on every question here — ${signals.map((s) => `"${s.question}": ${namedCountsLabel(s)}`).join('; ')}`
    : null;

  // Best winnability among the NOT-already-named variants — that's what the page can win.
  const winnable = signals.filter((s) => !questionIsNamed(s));
  const pool = winnable.length ? winnable : signals;
  const order: WinnVerdict[] = ['open', 'contested', 'no_local_race', 'unmeasured', 'named', 'locked'];
  const best = order.find((w) => pool.some((s) => s.winnability === w)) ?? 'unmeasured';
  const bestSig = pool.find((s) => s.winnability === best);
  const reasons: string[] = [];
  let score = WINNABILITY_BASE[best];
  reasons.push(`${best.replace(/_/g, ' ')}${bestSig?.winnabilityReason ? ` (${bestSig.winnabilityReason})` : ''}`);

  if (defend) reasons.push(defendReason!);
  else {
    const anyNamed = signals.some((s) => (s.named.chatgpt?.named ?? 0) + (s.named.gemini?.named ?? 0) > 0);
    if (!anyNamed && measured.length > 0) { score += 10; reasons.push('client absent from every answer (+10)'); }
    else if (anyNamed) {
      const onCg = signals.some((s) => (s.named.chatgpt?.named ?? 0) > 0);
      const onGm = signals.some((s) => (s.named.gemini?.named ?? 0) > 0);
      const gap = onCg && !onGm ? 'Gemini' : onGm && !onCg ? 'ChatGPT' : null;
      if (gap) { score += 5; reasons.push(`engine gap — absent on ${gap} (+5)`); }
    }
  }
  if (signals.some((s) => s.businessSources)) { score += 5; reasons.push('business-type sources cited (+5)'); }
  const extra = Math.min(5, signals.length - 1);
  if (extra > 0) { score += extra * 2; reasons.push(`${signals.length} question variants merged — demand signal (+${extra * 2})`); }

  return { score: Math.max(0, Math.min(100, score)), reasons, winnability: best, defend, defendReason };
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
    const { score, reasons, winnability, defend, defendReason } = sig.length
      ? scoreCluster(sig)
      : { score: 0, reasons: ['no measured answers for any variant'], winnability: 'unmeasured' as const, defend: false, defendReason: null };
    let status: PlannedQueuePage['status'] = 'planned';
    let heldReason: string | null = null;
    if (defend) { status = 'held'; heldReason = `defend, not a new page — ${defendReason}`; }
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
