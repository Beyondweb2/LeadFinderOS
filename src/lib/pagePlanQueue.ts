/* ════════════════════════════════════════════════════════════════════════════════════════════
   PAGE-PLAN QUEUE — pure logic for the £500-tier page plan (Stage 1, 2026-08-28, Paul's spec).

   Turns a client's measured questions into an ordered queue of DISTINCT-JOB pages:
     cluster (AI proposes, THIS MODULE verifies) → score (winnability + engine gap + client
     absence) → waves (siblings stay together — "publish complete clusters") → near-dup flags.

   ⛔ THE MODEL PROPOSES, CODE DISPOSES (the Q&A-mode safety shape). The AI clustering call returns
   question INDICES, not echoed strings — and validateClusters() checks a perfect partition: every
   index exactly once, nothing unknown. Any violation falls back to singleton clusters LOUDLY
   (partitionOk=false) rather than silently dropping a question.

   ⛔ Waves are EVIDENCE BANDS, not quotas — and each page's OWN SCORE decides its wave (wave 1 =
   top priorities; Paul's rule 2026-08-28, superseding the earlier topic-grouped waves — a low-score
   page must never ride wave 1 on a sibling's strength). `topic` survives as the hub grouping.
   Holds are itemised with reasons, never silent; the operator can un-hold anything.

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
  /** The incumbent firms classifyWinnability saw on the majority-verdict run — who a locked
   *  market is actually held by, for the locked-hold wording. */
  incumbents?: string[];
  /** How many runs triggered the AUTHORITY-LOCK test (see questionIsAuthorityLocked), and the
   *  authority domains those runs cited — for the hold wording. */
  authorityLockRuns?: number;
  authorityDomains?: string[];
  /** Per scored engine: named-in-N-of-M-runs counts; null = engine never answered. */
  named: { chatgpt: EngineNamed | null; gemini: EngineNamed | null };
  /** Business-type sources cited (a business page can plausibly rank there). */
  businessSources: boolean;
}

/* ⛔ AUTHORITY-LOCKED (Paul's spec, 2026-08-28; thresholds MEASURED over 3,233 stored question-runs
   before building — §4's constants rule). A question is authority-locked when the engines answer it
   ONLY from official bodies (NHS/NICE/CQC/gov.uk-class domains): in a run, the client is absent,
   there are ≥AUTHORITY_LOCK_MIN_CITES citations, the authority share is ≥AUTHORITY_LOCK_SHARE, and —
   THE DEFINING CLAUSE — **not one commercial/business site is cited**. If even one commercial site
   is cited, the question stays open: a commercial page IS winning a citation slot there, so a young
   site can plausibly win one too (proven on Solene's "are online clinics legitimate?" — CQC dominates
   but privatedoc.com/themenopausedirectory.co.uk are cited, and it must NOT lock). The run test is
   computed engine-side (edge fn) from the stored citations; ≥AUTHORITY_LOCK_MIN_RUNS runs must agree
   (single-run winnability flips 17.9% — never hold on one run). Measured 2026-08-28: this holds
   NOTHING in the current book (0 majority questions at every threshold 70–90%) — it is deliberately
   a safety net for future authority-owned questions (e.g. "tax return help" → 12/12 gov.uk). */
export const AUTHORITY_LOCK_SHARE = 0.7;
export const AUTHORITY_LOCK_MIN_CITES = 3;
export const AUTHORITY_LOCK_MIN_RUNS = 2;

export function questionIsAuthorityLocked(s: QuestionSignals): boolean {
  return (s.authorityLockRuns ?? 0) >= AUTHORITY_LOCK_MIN_RUNS;
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

/* ⛔ GEMINI-FIRST BUILD/HOLD RULE (Paul's call, 2026-08-28). Pages on the client's own site are
   the GEMINI lever — §5's measured model: ChatGPT reads directories, Gemini reads the business's
   own website (ABLM's own-site pages moved Gemini 0→3 and ChatGPT not at all). So being named on
   ChatGPT is directory-driven and does NOT justify holding a page; only Gemini presence does.
   Three-way outcome per question:
     - Gemini named (≥half of ≥2 runs)                → DEFEND (the only hold)
     - ChatGPT named but Gemini absent                → BUILD, tagged "Gemini gap" — still shown,
                                                        so nobody builds blind to existing strength
     - neither                                        → BUILD (best; wide-open ranks highest)
   Engine presence is counts-based (≥2 runs — a single-run fluke never decides) so every reason
   can print the verifiable numbers. */
function engineNamed(e: EngineNamed | null): boolean {
  return !!e && e.runs >= 2 && e.named / e.runs >= DEFEND_NAMED_RATE;
}
/** The ONLY condition that defends/holds: Gemini named the client in ≥half of ≥2 runs. */
export function questionDefends(s: QuestionSignals): boolean {
  return engineNamed(s.named.gemini);
}
/** Named on ChatGPT but absent on Gemini — a BUILD with the "Gemini gap" tag, never a hold. */
export function questionIsGeminiGap(s: QuestionSignals): boolean {
  return engineNamed(s.named.chatgpt) && !engineNamed(s.named.gemini);
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
  /** BUILD tagged "Gemini gap": already strong on ChatGPT, absent on Gemini — never a hold. */
  geminiGap: boolean;
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
  geminiGap: boolean; lockedHold: boolean; lockedReason: string | null;
  authorityHold: boolean; authorityReason: string | null;
} {
  /* ⛔ THE PAGE'S OUTCOME IS EVALUATED IN THIS ORDER (Paul's rule, 2026-08-28):
       1. FIRM-locked (every winnable question's majority verdict is 'locked') → HOLD — strong
          incumbents dominate regardless of the client's own counts; own wording, names the
          incumbents. Takes priority over everything.
       2. AUTHORITY-locked (every measured question authority-locked — see the rule block above:
          only-official-bodies citations, zero commercial sites, ≥2 runs) → HOLD, own wording
          naming the authority domains; a Q&A-style page can be tested later.
       3. Gemini named (≥2 of ≥2 runs, every measured question) → HOLD as defend (Gemini-first:
          pages are the Gemini lever; already-named wording with real counts).
       4. ChatGPT named but Gemini absent → BUILD, tagged "Gemini gap".
       5. else → BUILD (best; wide-open ranks highest). */
  const measured = signals.filter((s) => s.winnability !== 'unmeasured' || s.named.chatgpt || s.named.gemini);
  const defend = measured.length > 0 && measured.every((s) => questionDefends(s));
  /* Client-safe wording that claims ONLY what it measured: a single-question page must talk about
     "this question", never "every question". Multi-question pages itemise each question's counts. */
  const defendReason = defend
    ? (signals.length === 1
      ? `Already named for this question (${namedCountsLabel(signals[0])}) — defend the existing page rather than build a new one.`
      : `Already named for all ${signals.length} questions on this page — ${signals.map((s) => `"${s.question}": ${namedCountsLabel(s)}`).join('; ')} — defend rather than build new.`)
    : null;
  /* The Gemini-gap BUILD: strong on ChatGPT (directory-driven), absent on Gemini (what a page
     moves). Builds, tagged, and scored below the wide-open builds — the tag exists so nobody
     builds blind to existing ChatGPT strength. */
  const geminiGap = !defend && signals.some((s) => questionIsGeminiGap(s));

  // Best winnability among the NOT-defended variants — that's what the page can win.
  const winnable = signals.filter((s) => !questionDefends(s));
  const pool = winnable.length ? winnable : signals;
  const order: WinnVerdict[] = ['open', 'contested', 'no_local_race', 'unmeasured', 'named', 'locked'];
  const best = order.find((w) => pool.some((s) => s.winnability === w)) ?? 'unmeasured';
  const bestSig = pool.find((s) => s.winnability === best);
  const reasons: string[] = [];
  let score = WINNABILITY_BASE[best];
  reasons.push(`${best.replace(/_/g, ' ')}${bestSig?.winnabilityReason ? ` (${bestSig.winnabilityReason})` : ''}`);

  /* Priority 1 — LOCKED market. 'locked' is last in the order above, so best === 'locked' means
     every winnable question is locked: strong incumbents dominate whatever the client's own counts
     say. Own wording, deliberately different from the defend wording, naming the incumbents. */
  const lockedHold = best === 'locked';
  const incumbents = [...new Set(signals.flatMap((s) => (s.winnability === 'locked' ? s.incumbents ?? [] : [])))].slice(0, 3);
  const lockedReason = lockedHold
    ? `Held — market locked: ${incumbents.length ? incumbents.join(', ') : 'a small, consistent set of incumbents'} dominate${incumbents.length === 1 ? 's' : ''} the answers here and a new page's win chance is low right now. Revisit as the site's authority grows.`
    : null;

  /* Priority 2 — AUTHORITY-locked: every measured question is answered only from official bodies
     (zero commercial citations, ≥2 runs each). Own wording, names the actual domains. */
  const authorityHold = !lockedHold && measured.length > 0 && measured.every((s) => questionIsAuthorityLocked(s));
  const authDomains = [...new Set(signals.flatMap((s) => s.authorityDomains ?? []))].slice(0, 4);
  const authorityReason = authorityHold
    ? `Held — the engines answer this only from official bodies (${authDomains.length ? authDomains.join(', ') : 'e.g. NHS/NICE/CQC/gov.uk'}). A normal business page is unlikely to displace them. A Q&A-style page could be tested here later.`
    : null;

  if (lockedHold) reasons.push(lockedReason!);
  else if (authorityHold) reasons.push(authorityReason!);
  else if (defend) reasons.push(defendReason!);
  else if (geminiGap) {
    /* Deliberately NO absence/gap bonus: these rank below the wide-open builds (later wave) —
       the client already has ChatGPT presence here, so fresh ground comes first. */
    const g = signals.find((s) => questionIsGeminiGap(s))!;
    reasons.push(`Already strong on ChatGPT (${namedCountsLabel(g)}) — this page targets the Gemini gap.`);
  } else {
    const anyNamed = signals.some((s) => (s.named.chatgpt?.named ?? 0) + (s.named.gemini?.named ?? 0) > 0);
    if (!anyNamed && measured.length > 0) { score += 10; reasons.push('client absent from every answer (+10)'); }
  }
  if (signals.some((s) => s.businessSources)) { score += 5; reasons.push('business-type sources cited (+5)'); }
  const extra = Math.min(5, signals.length - 1);
  if (extra > 0) { score += extra * 2; reasons.push(`${signals.length} question variants merged — demand signal (+${extra * 2})`); }

  return { score: Math.max(0, Math.min(100, score)), reasons, winnability: best, defend, defendReason, geminiGap, lockedHold, lockedReason, authorityHold, authorityReason };
}

/** Assemble the queue: score each cluster, flag near-dups, hold locked/defend (in that priority),
 *  and assign waves BY SCORE — wave 1 means "top priorities". */
export function buildQueue(
  questions: string[], clusters: ClusterProposal[], signalsByQuestion: Map<string, QuestionSignals>,
): PlannedQueuePage[] {
  const pages: PlannedQueuePage[] = clusters.map((c) => {
    const qs = c.questionIndices.map((i) => questions[i]);
    const primary = questions[c.primaryIndex];
    const ordered = [primary, ...qs.filter((q) => q !== primary)];
    const sig = qs.map((q) => signalsByQuestion.get(q)).filter((s): s is QuestionSignals => !!s);
    const { score, reasons, winnability, defend, defendReason, geminiGap, lockedHold, lockedReason, authorityHold, authorityReason } = sig.length
      ? scoreCluster(sig)
      : { score: 0, reasons: ['no measured answers for any variant'], winnability: 'unmeasured' as const, defend: false, defendReason: null, geminiGap: false, lockedHold: false, lockedReason: null, authorityHold: false, authorityReason: null };
    /* Holds, in priority order (see scoreCluster's rule block): 1. LOCKED market (own wording,
       names the incumbents), 2. Gemini DEFEND (already-named wording, real counts). Everything
       else builds — ChatGPT-named pages build with the Gemini-gap tag. */
    let status: PlannedQueuePage['status'] = 'planned';
    let heldReason: string | null = null;
    if (lockedHold) { status = 'held'; heldReason = lockedReason; }
    else if (authorityHold) { status = 'held'; heldReason = authorityReason; }
    else if (defend) { status = 'held'; heldReason = defendReason; }
    return {
      job: c.job, topic: c.topic || 'general', primaryQuestion: primary, questions: ordered,
      rationale: c.rationale, score, scoreReasons: reasons, winnability,
      wave: 2, position: 0, status, heldReason, geminiGap, nearDupOf: null,
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

  /* Waves BY SCORE (Paul's rule, 2026-08-28): wave 1 means "top priorities", so each page's OWN
     score decides its wave — a score-35 gap page must never sit in wave 1 next to a score-85
     wide-open page just because they share a topic. (This supersedes the earlier topic-grouped
     waves; `topic` survives as the hub grouping for display and later hub pages.) */
  const ranked = [...pages].sort((x, y) => y.score - x.score);
  let pos1 = 0, pos2 = 0;
  for (const p of ranked) {
    p.wave = p.score >= WAVE1_MIN_SCORE ? 1 : 2;
    p.position = p.wave === 1 ? pos1++ : pos2++;
  }

  /* ⛔ ROW LABELS MUST BE UNAMBIGUOUS. The job label is model-written; nothing stops it producing
     the same generic label for two different questions ("Locksmith Services in Cambridge" twice —
     one build, one hold — reading as the tool contradicting itself). Any label shared by more than
     one page is replaced, on EVERY page in the collision, by that page's own primary question —
     unique by construction, and it says exactly which question the row is about. */
  const byJob = new Map<string, PlannedQueuePage[]>();
  for (const p of pages) {
    const k = p.job.trim().toLowerCase();
    (byJob.get(k) ?? byJob.set(k, []).get(k)!).push(p);
  }
  for (const group of byJob.values()) {
    if (group.length > 1) for (const p of group) p.job = p.primaryQuestion;
  }
  return pages;
}
