/* RELATIVE path with an explicit .ts extension, NOT the "@/" alias. This file is imported by
   supabase/functions/market-view, and Deno cannot resolve the Vite alias — there is no deno.json in
   this repo. Same convention as directoryHosts.ts and auditReport.ts. Keep it dependency-light for
   the same reason: everything it imports lands in that edge bundle too. */
import { EVIDENCE_MIN_AUDITS } from './buildPlaybook.ts';

/* ============================================================
   MARKET VIEW — shared shapes and thresholds for "a trade in a town".

   Types and numbers only: the fold itself lives in the edge function, because it needs the service
   role to read ai_audit_queue at all and needs pagination to read it correctly. This file exists so
   the page and the function cannot disagree about what a field means.
   ============================================================ */

export { EVIDENCE_MIN_AUDITS };

/** Distinct competitor names per audit, above which the fold is probably RAW REGEX JUNK rather
 *  than a genuinely fragmented market.
 *
 *  WHY A RATIO AND NOT A NAME BLACKLIST. extract-competitors replaces the regex-scraped names with
 *  AI-judged firms, but it only started running automatically at the end of a run — the older
 *  audits never had it. Those folds contain section headings and stray capitalised words: Wisbech
 *  accountants yields thousands of "names" topped by "hmrc", Stamford plumbers is topped by
 *  "stamford". Measured on real data BEFORE spelling variants were merged: clean markets sat at
 *  4–9 distinct names per audit, junk ones at 30–970, and 15 sits in the empty gap between them.
 *
 *  ⚠️ MERGING LOWERED THE CLEAN END and no post-merge band has been measured. Wisbech locksmiths
 *  went 48 distinct to 34 — 3.4 per audit to 2.4 — so a healthy market now scores BELOW the old
 *  "normal". The THRESHOLD is unaffected, because junk folds sit an order of magnitude above it
 *  either way. But do not quote a "normal is 4–9" range on screen: it describes a correctly merged
 *  market as abnormal, which is exactly what it did until this was corrected.
 *
 *  It is a SUSPICION, shown with the ratio beside it, never a verdict and never auto-corrected —
 *  re-extraction costs an LLM call per run and nothing meters that. */
export const JUNK_RATIO_PER_AUDIT = 15;

/* ══ IS THIS LIST CLEAN? MEASURED 2026-08-10, AND THE RATIO IS NOT THE ANSWER ══════════════════
   The queued plan was to re-measure distinct names per QUESTION and put the threshold in the empty
   band. It was re-measured, against every market, and the band had closed:

     perQ   junk words   market                       verdict by eye
     27.8       39       locksmiths / rowley regis    DIRTY  ("they", "ask", "always", "check")
     25.1       39       locksmiths / wakefield       DIRTY  ("here", "why", "i'd", "good")
     17.9       33       locksmiths / eastbourne      DIRTY  ("give", "particularly", "another")
      9.6       24       locksmiths / chorley         DIRTY  ("fully", "call", "always", "ask")
      5.8       18       accountant / chichester      DIRTY  ("their", "you", "many")
      4.8        0       mobile mechanics / wisbech   clean
      4.4        0       electricians / portsmouth    clean
      3.9 … 2.1  0       the other 13 markets         clean

   ⛔ A THRESHOLD OF 10 WOULD HAVE MISSED TWO PROVABLY DIRTY MARKETS, one of them the accountant /
   Chichester fold the derivation test and the winnability question both rest on. The recorded
   "nothing at all between 5.4 and 17.9" gap is gone: chorley (9.6) arrived inside it, and the real
   dirty/clean boundary on the ratio is now 5.8 vs 4.8 — a 1.2× band, which is not a gap, it is a
   coincidence. Any number placed in it would be the fifth constant in §4 that looked plausible.

   ⛔ SO THE GATE IS A FACT, NOT A RATIO. A SINGLE-TOKEN English function word cannot be the name of
   a firm, and the LLM cleaner would never return one — so one of these in the fold PROVES the list
   is raw regex output. It partitions all 20 markets with nothing in between: 39/39/33/24/18 on the
   five dirty ones, and EXACTLY ZERO across 793 distinct names in the other fifteen.

   ⚠️ SINGLE TOKEN ONLY, so "One Call Locksmiths", "Always Secure Ltd" and "First Pick Locksmiths"
   are untouched — every real multi-word firm passes by construction. The 793-name clean sweep is the
   evidence that there are no single-token false positives to worry about either.
   ⚠️ AND THE RATIO IS STILL REPORTED, per QUESTION, as context beside the flag. It is a real signal
   about fragmentation; it just cannot carry a yes/no about cleanliness. Per QUESTION rather than per
   AUDIT because an audit is 3 questions or 8 depending on how it was started, so the per-audit
   figure moves with the question count and JUNK_RATIO_PER_AUDIT has never separated anything. */
export const UNCLEANED_MARKER_WORDS: ReadonlySet<string> = new Set([
  "a", "about", "above", "after", "again", "all", "already", "also", "although", "always", "am", "an",
  "and", "another", "any", "anyone", "are", "as", "ask", "asked", "at", "available", "back", "based",
  "be", "because", "been", "before", "being", "below", "best", "better", "between", "both", "but",
  "by", "call", "called", "can", "cannot", "check", "come", "could", "did", "do", "does", "doing",
  "done", "down", "during", "each", "either", "else", "enough", "even", "ever", "every", "few",
  "find", "first", "for", "found", "from", "fully", "further", "get", "getting", "give", "given",
  "go", "going", "good", "got", "had", "has", "have", "having", "he", "help", "her", "here", "hers",
  "him", "his", "how", "however", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "it",
  "it's", "its", "just", "keep", "know", "known", "last", "less", "let", "like", "likely", "look",
  "looking", "made", "make", "many", "may", "maybe", "me", "might", "mine", "more", "most", "much",
  "must", "my", "need", "needed", "needs", "never", "new", "next", "no", "none", "nor", "not",
  "note", "now", "of", "off", "often", "on", "once", "one", "only", "or", "other", "others", "our",
  "ours", "out", "over", "own", "particularly", "per", "perhaps", "please", "prices", "provide",
  "quite", "rather", "really", "right", "said", "same", "say", "see", "seen", "several", "shall",
  "she", "should", "since", "so", "some", "someone", "something", "still", "such", "sure", "take",
  "than", "that", "the", "their", "theirs", "them", "then", "there", "these", "they", "this",
  "those", "though", "through", "thus", "to", "too", "typically", "under", "until", "up", "upon",
  "us", "use", "used", "usually", "very", "via", "want", "was", "we", "well", "were", "what",
  "when", "where", "whether", "which", "while", "who", "whom", "why", "will", "with", "within",
  "without", "work", "worth", "would", "yes", "yet", "you", "your", "yours",
]);

/** One extracted "competitor" that proves the fold was never cleaned. */
export function isUncleanedName(name: string): boolean {
  const t = String(name ?? "").trim().toLowerCase().replace(/[.,;:!?]+$/, "");
  if (!t || t.includes(" ")) return false;
  return UNCLEANED_MARKER_WORDS.has(t);
}

/** Every distinct marker in a fold, sorted — so the flag can show its working rather than assert. */
export function uncleanedNames(names: Iterable<string>): string[] {
  const found = new Set<string>();
  for (const n of names) {
    const t = String(n ?? "").trim().toLowerCase().replace(/[.,;:!?]+$/, "");
    if (isUncleanedName(t)) found.add(t);
  }
  return [...found].sort();
}

/** How many markers are shown on screen. Enough to be convincing, short enough to read. */
export const UNCLEANED_EXAMPLES_SHOWN = 6;

/** extract-competitors' MAX_PER_ENGINE. An engine block holding exactly this many competitors was
 *  probably cut short, so a fragmented market reads as less fragmented than it is. Mirrored here to
 *  caption the concentration figures; the cap itself is owned by that function. */
export const MAX_PER_ENGINE_CAP = 8;

export interface MarketConcentration {
  /** Audits for this trade + town, whatever their run outcome. */
  audits: number;
  /** Of those, runs that actually completed — the only ones contributing competitor names. */
  completeRuns: number;
  distinctBusinesses: number;
  totalMentions: number;
  topName: string | null;
  /** Share of ALL mentions held by the single most-mentioned business, 1 d.p. */
  topSharePct: number;
  topThreeSharePct: number;
  /** Fewer audits than EVIDENCE_MIN_AUDITS — the same bar the playbook uses to call evidence thin. */
  thin: boolean;
  distinctPerAudit: number;
  /** distinctPerAudit >= JUNK_RATIO_PER_AUDIT. Flag, not fact, and it has never separated anything —
   *  see UNCLEANED_MARKER_WORDS. Kept so an older cached view still renders. */
  likelyJunk: boolean;
  /** Deduped questions behind the fold — the denominator that does not move with how an audit was
   *  started. Optional: a view cached before this shipped does not carry it. */
  questions?: number;
  /** Distinct extracted names per QUESTION. Reported, never a gate. */
  distinctPerQuestion?: number;
  /** ⛔ THE GATE. How many single-token function words are in the fold; one is proof it was never
   *  cleaned. Optional, and absent means UNKNOWN — see marketNamesUncleaned. */
  uncleanedCount?: number;
  /** The first few markers found, so the refusal shows its working instead of asserting. */
  uncleanedExamples?: string[];
  /** Engine blocks that came back sitting exactly on MAX_PER_ENGINE_CAP. */
  truncatedBlocks: number;
  engineBlocks: number;
  /** Completed run ids for this market — what the re-extract button iterates. */
  runIds: string[];
  /** Of `audits`, how many are MARKET audits (no business attached, 8 questions). They carry more
   *  evidence weight than a business audit — see MARKET_AUDIT_MIN_AUDITS. */
  marketAudits?: number;
  /** Of those, how many have a COMPLETED run. The evidence gate reads these, never the audit
   *  counts: two audits with one completed run must not pass a two-audit bar. */
  marketAuditsComplete?: number;
  businessAuditsComplete?: number;
}

/**
 * Is this market's competitor list KNOWN to be uncleaned?
 *
 * ⛔ THE ABSENT CASE IS "NO", AND THAT IS A DECISION, NOT AN OVERSIGHT. `uncleanedCount` arrives from
 * market-view; a view cached in sessionStorage before this shipped, or an older deploy of the
 * function, carries neither field. Refusing to grade a shape on absence would blank the verdict on
 * every market at once — including the fifteen measured to be clean — so absence keeps the previous
 * behaviour and only a count we have actually read refuses. Deploy market-view BEFORE the SPA and
 * the window is a 10-minute stale cache, nothing more.
 *
 * ⚠️ NOT `?? 0 > 0`, WHICH READS THE SAME AND MEANS SOMETHING ELSE: that would let a missing field
 * assert cleanliness rather than admit ignorance. Here the two both return false, but they say
 * different things, and the next person to add a third state needs the difference to be visible.
 */
export function marketNamesUncleaned(conc: Pick<MarketConcentration, "uncleanedCount"> | null | undefined): boolean {
  const n = conc?.uncleanedCount;
  if (typeof n !== "number" || !Number.isFinite(n)) return false;   // not known — see above
  return n > 0;
}

/* ── GRADED, NOT BINARY ────────────────────────────────────────────────────────────────────────
   "Named" and "not named" hid the best prospects: in Hastings, Titanium Locksmiths (25 mentions
   across 6 of 6 audits) and Mr Locks (1 mention in 1 audit) both counted as named, so both were
   subtracted from the prospect list. One is the market leader; the other is a firm AI barely
   knows exists, which is exactly who to sell to.

   WHERE THE LINE SITS, AND WHY IT IS NOT A ROUND NUMBER PICKED IN ADVANCE. Measured on the two
   markets with real depth:
     Hastings (6 audits)   weakest established: Battle Locksmiths, 8 mentions = 32% of the leader
                           strongest thin:      A1 Locksmiths,     3 mentions = 12% of the leader
     Wisbech  (14 audits)  weakest established: THE LOCK TEAM,    26 mentions = 30% of the leader
                           strongest thin:      Timpson Security, 10 mentions = 12% of the leader
   The SAME empty band appears in both: 12% -> ~30%. 20% sits inside it in both markets, which is
   why it is the threshold rather than a number chosen first and justified later.

   The audit-share half of the test is the guard the mention count cannot provide: 32 mentions all
   from ONE audit is one opinion, not a market position (the trap playbook-evidence also guards).
   Both conditions must hold. */

/** Minimum share of the market's audits an entry must appear in to count as established. */
export const ESTABLISHED_MIN_AUDIT_SHARE = 0.5;
/** Minimum share of the LEADER's mentions an entry must hold to count as established. */
export const ESTABLISHED_MIN_MENTION_SHARE = 0.2;

/** 'established' = AI names it consistently. 'thin' = named, but barely — a prospect.
 *  'unknown' = the market has fewer than EVIDENCE_MIN_AUDITS audits, so nothing is established
 *  yet and claiming otherwise would dress 2 audits up as a market position. */
export type MarketTier = "established" | "thin" | "unknown";

export interface MarketNamedRow {
  /** businessCore merge key. Stable across spellings; the join key against the pool. */
  key: string;
  name: string;
  /** Every spelling that folded into this one firm, so a wrong merge is visible, not hidden. */
  variants: string[];
  mentions: number;
  audits: number;
  /** Graded standing in THIS market. See the thresholds above. */
  tier: MarketTier;
  /** audits / total audits in the market, 0-1. Rendered so the grade shows its working. */
  auditShare: number;
  /** mentions / leader's mentions, 0-1. */
  mentionShare: number;
  /** Other TOWNS of the same trade where this same name is cited. >0 is the only evidence-based
   *  signal available that a name is a national brand rather than a local firm: Able Group,
   *  Rapid Secure UK and E-Locksmiths all show up in both Hastings and Wisbech. Derived from
   *  citations, never from a hardcoded brand list. */
  otherTowns: number;
}

/** The market leader's mention count, needed to render "against N for the leader". */
export interface MarketLeader { name: string; mentions: number }

/** An UNFINISHED market audit: what it is doing, and the raw reason if a question failed.
 *  Only unfinished ones are reported — a finished audit needs no explanation. */
export interface MarketAuditProgress {
  auditId: string;
  /** The run's own status: pending, running, failed, or 'no_run' when none was created. */
  status: string;
  questionsDone: number;
  questionsTotal: number;
  questionsFailed: number;
  /** When the run was created, so "still running" can be told apart from "stuck for an hour". */
  startedAt?: string | null;
  /** The RAW error off the queue row, never a wrapper. Null when nothing has errored. */
  error: string | null;
}

/** How long a market audit can legitimately take before silence is a problem. An Apify question can
 *  run ~9 minutes and the queue's own timeout is 12, so a run older than this has stopped moving. */
export const MARKET_AUDIT_STALE_MS = 20 * 60 * 1000;

/** A cited host and whether it is a directory/marketplace rather than a business's own site.
 *  Position 1 in this list is the whole basis of the marketplace-led read — see marketShape. */
export interface MarketCitationHost { host: string; citations: number; isAggregator: boolean }

/* ── THE TARGET RULE — Paul's, 2026-08-14, replacing the tier subtraction ─────────────────────
   A pool business is scored DIRECTLY: nameMatches (the same function that decides the report
   verdict and the week-8 guarantee comparison, reused byte-for-byte) against every stored
   chatgpt/gemini answer_text in the market's completed runs. named-share = answers naming it /
   scored answers. At or below this share it is a TARGET; above it, it is already winning and is
   excluded (itemised, never silent).

   ⛔ WHY THIS REPLACED THE ESTABLISHED-TIER SUBTRACTION. The tier was computed over EXTRACTED
   competitor names, which meant three compounding faults: raw-regex junk polluted the counts
   ("Here" 17/37 answers in Aylesbury); junk fragments BRIDGED real firms in the union-find (the
   single mention "Lock" welded Lockforce, LockFit, Lock Around The Clock and Aylesbury Lock and
   Key Centre into one 23-name blob scored as one firm); and the thresholds were LEADER-relative,
   so Chester subtracted Saltney Locksmiths as "established" while AI named it in 16% of answers.
   Scoring the scraped list against the answer text needs no extraction, no cleaning and no
   manual step — junk cannot enter, because no extracted name is ever an input.

   ⚠️ THE BOUNDARY IS INCLUSIVE (<= counts as a target) and the number is Paul's to tune once he
   has seen real lists. It is a named export so nothing can drift from it. */
export const TARGET_MAX_NAMED_SHARE = 0.4;

/** What one pool business's score means.
 *  ⛔ THE ABSENT CASE IS EXPLICIT: with zero scored answers nothing has been measured, so nobody
 *  is a target — every share would be 0/0 and "everyone is invisible" would be a prospect list
 *  built on no data (the Soham failure, CLAUDE.md §6). */
export function poolTargetVerdict(answersNamed: number, answersTotal: number): 'unmeasured' | 'target' | 'winning' {
  if (!Number.isFinite(answersTotal) || answersTotal <= 0) return 'unmeasured';
  return answersNamed / answersTotal <= TARGET_MAX_NAMED_SHARE ? 'target' : 'winning';
}

/* ── THE FRAGMENTATION VERDICT — Paul's spec, 2026-08-15: one pass/fail signal per market ────────
   FRAGMENTED = lots of real businesses absent from AI answers = worth mass-outreaching.
   CONCENTRATED = a few winners dominate = probably skip.

   ⛔ JUNK-IMMUNE BY CONSTRUCTION. Computed ONLY from the deterministic pool scores (nameMatches
   over stored answer text — the same verdict the report and the guarantee use) and Google's own
   Places categories. No extracted competitor name is an input, so this verdict never waits for
   the LLM cleaner and cannot be corrupted by raw scraper output.

   THE METRIC: targets ÷ gradeable entries.
     gradeable = right-trade pool entries, CHAINS INCLUDED (a dominant chain is real
                 concentration), off-trade excluded (a shoe-repair counter is not this market).
     targets   = non-chain gradeable entries named in ≤ TARGET_MAX_NAMED_SHARE of scored answers —
                 exactly the panel's target list, so the verdict and the rows cannot disagree.

   ⛔ THRESHOLDS MEASURED, NOT PICKED (§4's constants rule). The shipped formula was run over all
   20 pool-bearing measured markets on 2026-08-15. Target-share distribution:
     80, 80, 77, 71, 70, 63, 61, 58, 57, 55, 54, 50, 50, 45, 44, 43, 38 │ 29, 14, 0
   The break sits between 38% (locksmiths/Darlington, workable) and 29% (locksmiths/Southport),
   with the known-skip markets — Nuneaton 14% (1 target, 5 winners), Aylesbury 0% — below it.
   0.35 is mid-gap. The known-work markets (accountants/Wakefield 77%, Halifax 80%) sit far above.
   ⚠️ Both constants are Paul's to tune; the verdict prints its numbers beside the word so a
   marginal call is visible rather than trusted. */

/** Below this many gradeable entries no confident verdict is printed — Aylesbury's THREE real
 *  locksmiths must never grade as "concentrated": that is a fact about the Places pool's size,
 *  not about the market. Measured floor: the three smallest pools (2, 3, 4 entries) are exactly
 *  the ones whose verdicts would be noise. */
export const FRAG_MIN_GRADEABLE_ENTRIES = 5;
/** Target share at or above which a market is FRAGMENTED. Mid the measured 29% → 38% break. */
export const FRAG_MIN_TARGET_SHARE = 0.35;

export type FragmentationKind = 'fragmented' | 'concentrated' | 'pool_too_small' | 'unmeasured';

/** One gradeable-or-not pool entry, as the fold computed it. `share` = answersNamed/answersTotal. */
export interface FragmentationEntry {
  share: number;
  isChain: boolean;
  offTrade: boolean;
}

export interface FragmentationVerdict {
  kind: FragmentationKind;
  /** Non-chain right-trade entries at or under TARGET_MAX_NAMED_SHARE — the mass-outreach supply. */
  targets: number;
  /** Right-trade entries, chains included. The denominator. */
  gradeable: number;
  /** targets / gradeable, 0 when gradeable is 0. */
  targetShare: number;
  /** Mean of the three highest named-shares among gradeable entries — "how loud are the winners". */
  top3Share: number;
  /** Scored answers behind the shares — the confidence figure, printed on the verdict's face. */
  answersTotal: number;
}

export function fragmentationVerdict(entries: FragmentationEntry[], answersTotal: number): FragmentationVerdict {
  const gradeableEntries = entries.filter((e) => !e.offTrade);
  const gradeable = gradeableEntries.length;
  /* ⛔ ZERO SCORED ANSWERS = UNMEASURED, before anything else. Every share would be 0/0, every
     entry would read "never named", and the market would grade FRAGMENTED on no data — the
     Soham failure wearing a verdict. Eleventh instance of the absent-value shape. */
  if (!Number.isFinite(answersTotal) || answersTotal <= 0) {
    return { kind: 'unmeasured', targets: 0, gradeable, targetShare: 0, top3Share: 0, answersTotal: 0 };
  }
  const targets = gradeableEntries.filter((e) => !e.isChain && e.share <= TARGET_MAX_NAMED_SHARE).length;
  const targetShare = gradeable > 0 ? targets / gradeable : 0;
  const topShares = gradeableEntries.map((e) => e.share).sort((a, b) => b - a).slice(0, 3);
  const top3Share = topShares.length ? topShares.reduce((s, x) => s + x, 0) / topShares.length : 0;
  const kind: FragmentationKind = gradeable < FRAG_MIN_GRADEABLE_ENTRIES
    ? 'pool_too_small'
    : targetShare >= FRAG_MIN_TARGET_SHARE ? 'fragmented' : 'concentrated';
  return { kind, targets, gradeable, targetShare, top3Share, answersTotal };
}

/** A pool business EXCLUDED from the target list because AI already names it in more than
 *  TARGET_MAX_NAMED_SHARE of answers. Itemised rather than merely counted: a silent exclusion is
 *  how a real prospect disappears, and the score beside the name is what lets the operator
 *  disagree with the cut. */
export interface MarketPoolExcluded {
  name: string;
  /** Places rows that folded into this entry (chain branches). 1 when nothing collapsed. */
  branches: number;
  /** Scored answers (chatgpt + gemini) in which nameMatches finds this business. */
  answersNamed: number;
  /** Scored answers in the market fold — the denominator, same for every row. */
  answersTotal: number;
}

export interface MarketPoolRow {
  key: string;
  name: string;
  /** How many pool rows folded into this entry. >1 means a chain, by repetition alone. */
  branches: number;
  isChain: boolean;
  placeIds: string[];
  noWebsite: boolean;
  googleMapsUrl: string;
  websiteUrl: string | null;
  /** Nearby, but OUTSIDE the town boundary the pool was searched with. Shown separately and never
   *  counted as a business in the town: the rectangle is 6x11km for Hastings and Battle Locksmiths
   *  sits 10km north of it, so "in the pool" and "in the town" are not the same claim. */
  outsideTown?: boolean;
  /** GOOGLE DOES NOT FILE THIS BUSINESS UNDER THE SEARCHED TRADE. Carries the label Google does use
   *  ("Hardware Store"), so the row can say what it is rather than only what it is not.
   *  ⚠️ A MARK, NOT A FILTER, and deliberately: a radius search legitimately returns a hardware shop
   *  that cuts keys, and Google mis-files real traders often enough that filtering on this would
   *  silently drop prospects. The operator skips it or does not. */
  offTrade?: { label: string };
  /** Scored answers (chatgpt + gemini answer_text, deduped questions) in which nameMatches finds
   *  this business — the SAME verdict the report and the week-8 guarantee use, applied to a pool
   *  row. 0 = never named, the strongest pitch there is. */
  answersNamed: number;
  /** Scored answers in the market fold. The denominator every row shares; 0 means nothing has
   *  been measured yet, and poolTargetVerdict refuses to call anybody a target off that. */
  answersTotal: number;
}

/** The pool states, which MUST read differently on screen. An empty prospect list and a search
 *  that was never run are completely different facts about a market, and conflating them is how an
 *  operator concludes "AI names everyone here" about a town nobody has searched.
 *
 *  ⛔ `stale` IS A FOURTH STATE, NOT A FLAG ON `ready`, and the distinction is a spend guard: every
 *  gate that treats a pool as "fresh enough to skip the paid search" keys on state === 'ready'
 *  (MeasureMarket's poolCount, the measure flow's search skip). A stale pool DISPLAYS its
 *  businesses — Places listings do not churn in days, and hiding them was how 113 of 123 measured
 *  markets showed no prospect at all — but it never satisfies a freshness gate, so re-searching
 *  still charges and still refreshes. `expired` survives for the searched-but-cache-row-gone case
 *  (pools deleted before 2026-08-14, when cron-run stopped destroying them). */
export type MarketPoolState =
  | { state: 'never_searched' }
  | { state: 'expired'; keyword: string; searchedAt: string; ttlHours: number }
  | {
    state: 'ready' | 'stale';
    /** 'town' = the pool came from a townOnly search (a hard boundary). 'radius' = it came from a
     *  radius search, so it may include neighbouring towns the audits never covered. */
    scope: 'town' | 'radius';
    keyword: string;
    radiusM: number;
    searchedAt: string;
    total: number;
  };

export interface MarketViewResult {
  ok: boolean;
  error?: string;
  trade: string;
  town: string;
  concentration: MarketConcentration;
  named: MarketNamedRow[];
  pool: MarketPoolRow[];
  poolState: MarketPoolState;
  /* ⛔ THESE THREE WERE OPTIONAL, AND ALL THREE WERE COMPUTED BY market-view AND THEN LEFT OUT OF
     ITS RESPONSE — from the commit that introduced them until 2026-08-06. Optional meant tsc had
     nothing to say, and every consumer defends with `?? []`, so three features read as "nothing to
     show" rather than as broken:
       marketProgress — the measure bar could not survive a reload, which was the entire point of
                        deriveRun, and the running/stalled/failed grading never rendered once
       poolNearby     — businesses just outside the town boundary (Battle Locksmiths) never listed
       citationHosts  — the most-cited hosts in the market never rendered
     REQUIRED NOW, ON PURPOSE. market-view builds its success payload as a typed
     MarketViewResult, so leaving any of them out is a compile error rather than a silent
     absence. Do not make them optional again to "simplify" a caller — an empty array is how you
     say there is nothing, and it is not the same statement as omitting the key. */
  /** The most-cited hosts in this market, biggest first, with the aggregator flag the shape read
   *  needs. Folded from citations already stored on the queue rows - no extra queries. */
  citationHosts: MarketCitationHost[];
  /** Total citations behind citationHosts, so a share can be shown next to the leader.
   *  ⛔ REQUIRED, and it is the fourth field of this group. The other three were made required on
   *  2026-08-06 and this one was left optional in the same pass — so it kept being computed and
   *  dropped, and the shape read printed "lockrite.org (47 of 0)": a real numerator over a
   *  denominator that never arrived. Nothing divides by it (every ratio is guarded), which is why
   *  no error surfaced — it was only ever PRINTED. A missing denominator is as wrong as a division
   *  by zero and considerably more convincing. */
  citationTotal: number;
  /** Market audits that have NOT finished, with progress and the raw error if any. */
  marketProgress: MarketAuditProgress[];
  /** Businesses the radius pass found JUST OUTSIDE the town boundary. Visible, tagged, and never
   *  merged into `pool` — see MarketPoolRow.outsideTown. */
  poolNearby: MarketPoolRow[];
  /** The market leader, for the "against N for the leader" comparison on thin rows. */
  leader?: MarketLeader | null;
  /** True when the cross-town scan for national brands hit its read cap, so `otherTowns` is a
   *  floor rather than a count. Surfaced on screen — a silent cap reads as "covered everything". */
  otherTownsCapped?: boolean;
  /** Pool businesses that ARE already named — shown so the subtraction is auditable. */
  poolMatchedNamed: number;
  /** Which ones, and what each matched. Rendered, not just counted. */
  poolExcluded: MarketPoolExcluded[];
  auditedBusinesses: string[];
  /** The one-line mass-outreach verdict, computed from the deterministic pool scores — see
   *  fragmentationVerdict. REQUIRED so the typed payload cannot silently drop it (the
   *  marketProgress lesson); the SPA still guards for an older cached payload. */
  fragmentation: FragmentationVerdict;
}

export interface MarketOption { trade: string; town: string; audits: number }

/* ── ARRIVING FROM COVERAGE WITH `confirm=search` ──────────────────────────────────────────────
   Coverage's "Find leads" button can ask the market panel to open the lead-search confirm on
   arrival, so a town read off that page does not have to be retyped into Find Leads. That intent
   used to be obeyed unconditionally, which put a "Run the lead search? ~$0.14" modal over the
   numbers of every market that had already been measured.

   ⛔ THE SUPPRESSION NEEDS A KNOWN POSITIVE. serveGate's rule, and the one this codebase has now
   broken six times in the other direction: `audits` is null when the view has not loaded or failed
   to load, and an unknown market is NOT a measured one. Null therefore OPENS the confirm — the
   pre-existing behaviour, cancellable, costing nothing until the operator presses Run. Only a
   count we have actually read, and read as above zero, closes it.

   ⚠️ `audits`, NOT `completeRuns`. A market with two failed audits has been worked at, and the
   operator arriving there is looking rather than searching. That is deliberately a wider net than
   Coverage's own `measured` rung, which needs a completed run — see wantsSearchConfirm. */

/** True only when we KNOW this market already has audits. Null = not loaded = not known. */
export function suppressArrivalSearchConfirm(auditsInMarket: number | null): boolean {
  return typeof auditsInMarket === "number" && Number.isFinite(auditsInMarket) && auditsInMarket > 0;
}

/** The whole decision: obey the URL's one-shot intent unless the market is known to have audits. */
export function openArrivalSearchConfirm(intent: boolean, auditsInMarket: number | null): boolean {
  return intent && !suppressArrivalSearchConfirm(auditsInMarket);
}

/** How many audits the freshly loaded view reports, or null when that cannot be read.
 *  ⛔ A MISSING FIELD READS AS null, NEVER 0. `?? 0` here would turn a payload from an older
 *  market-view deploy into "this market has no audits" and re-open the modal it exists to stop. */
export function auditsInView(view: { concentration?: { audits?: number } } | null | undefined): number | null {
  const n = view?.concentration?.audits;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/* Per-question audit cost. Measured, never guessed — see CLAUDE.md §8.
   ⛔ RE-MEASURED 2026-08-06 against 60 completed runs / 206 questions of real
   ai_audit_runs.actor_cost_usd: mean $0.01095, median $0.01038, range $0.0052–$0.0135.
   It was 0.0125, which over-stated every estimate in the app by about 20%.
   ⚠️ THE MEDIAN, NOT THE MEAN, and deliberately: 8 × 0.0104 = $0.083, which is exactly the measured
   cost of a market audit ($0.083 on 3 of the 4 ever run). Market audits are now the dominant use of
   this constant, so the figure that reproduces them is the one to carry. The mean would put it at
   0.0110; on a 25-audit outreach batch the difference is 8p, which is not worth the inconsistency.
   Do not "correct" this upward without re-measuring — both figures are recorded here so the next
   person does not have to guess which was intended. */
export const AUDIT_EST_USD_PER_QUESTION = 0.0104;

/** Questions per audit for a market top-up. Matches the outreach-hook default: enough to measure,
 *  cheap enough to run 5 of them without thinking about it. */
export const MARKET_AUDIT_QUESTIONS = 3;

/** bulk-jobs' JOB_CAPS.audit. A market run cannot exceed it, so the picker stops there. */
export const MARKET_AUDIT_MAX = 25;

/** Questions in a STANDALONE market audit (one audit of a trade and town, no business attached).
 *  Top of the 5-8 range Paul scoped: it is the only audit of that market, so breadth is the point,
 *  and 8 x $0.0125 = $0.10 against ~$0.28 for the five-business batch it replaces. */
export const MARKET_AUDIT_QUESTION_COUNT = 8;

/* ── WHAT A MARKET BATCH ACTUALLY COSTS ────────────────────────────────────────────────────────
   The confirm used to quote questions ONLY and understated the bill by ~4x: 5 audits x 3
   questions read as $0.19 while the real spend was $0.75-0.80. The two missing lines were the
   per-business SEO scan (the single biggest item, ~60% of it) and the Places lookup that fires
   when a business is added to the CRM. Every figure here is itemised on screen for that reason —
   an estimate the operator cannot break down is an estimate they cannot check. */

/** Apify on-page SEO scan, per audited business that HAS a website.
 *  ⛔ WAS 0.12, AND THAT WAS THE ONLY CONSTANT IN THE APP DERIVED FROM A PRICE LIST RATHER THAN
 *  FROM SPEND: "$40 per 1,000 pages x MAX_PAGES=3". Measured 2026-08-06 against 218 real
 *  enrichment_usage rows, the actual figures Apify reported are $0.02 (x65), $0.04 (x41),
 *  $0.08 (x4) and $0.20 (x1) — plus 57 rows at exactly $0.12, which is this constant echoed back
 *  by the fallback in process-ai-audit-queue when Apify returns no usage figure.
 *  ⚠️ THE TWO CANNOT BE SEPARATED IN THE DATA, so the honest reading is a RANGE, not a number: a
 *  typical scan costs $0.02-$0.04. Set to the top of that band rather than the $0.031 mean, because
 *  this figure also reserves headroom in the cap pre-check and under-reserving is the worse error.
 *  The tell that $0.12 is the constant and not a measurement: $0.06, $0.10 and $0.14 never occur
 *  once in 218 rows, so the values are not landing on a per-page ladder that passes through $0.12.
 *  A market batch SKIPS these (see MARKET_SKIP_SEO), so this mostly shows what skipping them saves. */
export const SEO_SCAN_USD = 0.04;

/** Google Place Details, charged once per business added to the CRM (the phone/address/rating
 *  lookup in useOutreach.addLead).
 *  ⛔ WAS 0.017, AN INHERITED CONSTANT MATCHING NO PUBLISHED RATE. Corrected 2026-08-06 against
 *  Google's own pricing table: that call requests a phone number, phone is an ENTERPRISE field, and
 *  a request bills ONCE at the highest tier it touches. Place Details (Enterprise) is $20 per 1,000
 *  = $0.020. 18% under, and the same class of error as MARKET_SEARCH_USD: a rate copied from the
 *  wrong tier of the right product. Verified against the price list, not against a bill — Google
 *  itemises by SKU, not by call, so a bill cannot confirm a single request. */
export const PLACE_DETAILS_USD = 0.020;

/** Market-populating audits skip the SEO scan. The point of a market batch is who AI names in a
 *  town, not a website grade for five businesses nobody has sold to — and the scan was ~60% of
 *  the spend. Implemented WITHOUT a schema change: create-ai-audit seeds the run's results.seo
 *  with a skip marker, which is the same field the queue already treats as "already graded".
 *  The marker carries no categories, so isRenderableSeo / isReusableSeo both reject it and no
 *  report ever renders a fabricated grade from it. */
export const MARKET_SKIP_SEO = true;

export interface MarketCostLine { label: string; detail: string; usd: number; unverified?: boolean }

/** The itemised estimate the confirm renders. `withWebsite` counts only the businesses that would
 *  have been SEO-scanned, so the saving line is honest about which ones it applies to. */
export function marketBatchCost(
  audits: number,
  questionsEach: number,
  withWebsite: number,
): { lines: MarketCostLine[]; total: number; seoSaved: number } {
  const lines: MarketCostLine[] = [
    {
      label: "AI question runs",
      detail: `${audits} audit${audits === 1 ? "" : "s"} x ${questionsEach} question${questionsEach === 1 ? "" : "s"} at $${AUDIT_EST_USD_PER_QUESTION}`,
      usd: audits * questionsEach * AUDIT_EST_USD_PER_QUESTION,
    },
    {
      label: "Google Places lookup",
      detail: `${audits} business${audits === 1 ? "" : "es"} added to the CRM at ~$${PLACE_DETAILS_USD}`,
      usd: audits * PLACE_DETAILS_USD,
      unverified: true,
    },
  ];
  const seoSaved = MARKET_SKIP_SEO ? withWebsite * SEO_SCAN_USD : 0;
  if (!MARKET_SKIP_SEO) {
    lines.push({
      label: "Website SEO scans",
      detail: `${withWebsite} of them have a website, at $${SEO_SCAN_USD}`,
      usd: withWebsite * SEO_SCAN_USD,
    });
  }
  return { lines, total: lines.reduce((s, l) => s + l.usd, 0), seoSaved };
}

/* -- THE SHAPE OF A MARKET ---------------------------------------------------------------------
   The panel gave numbers and left the operator to read three market shapes by eye. This names the
   shape and says what it means for working the town. It is a READ on top of figures that already
   exist: it changes no grading, no pool and no subtraction.

   AGGREGATOR SHARE IS USELESS AS A SIGNAL - DO NOT REINTRODUCE IT. Measured 2026-08-04 across the
   six markets with enough depth: aggregator citations were 10% (locksmiths/Hastings), 10%
   (locksmiths/Wisbech), 11% (locksmiths/Spalding), 13% (plumber/Kettering), 19%
   (electrician/Wrexham) and 25% (plumber/Loughborough). The HIGHEST share belongs to Loughborough,
   the one market a marketplace genuinely dominates, and the LOWEST to markets that are perfectly
   healthy - the spread is so narrow and so evenly distributed that no threshold separates them.
   What discriminates is whether an aggregator holds the #1 HOST POSITION: Checkatrade is the single
   most-cited source in Loughborough (210 of 1,325, ahead of every business's own website), while
   every healthy market's top host is a local firm's own site. Position, never share.

   THE TWO SHAPE-1 SIGNALS ARE COMPLEMENTARY, NOT REDUNDANT - each catches a case the other misses,
   also measured:
     plumber/Loughborough - the named leader is a LOCAL firm, so the cross-town test says healthy,
                            but Checkatrade leads the citations. Only the citation test sees it.
     plumber/Kettering    - the top host is able-group.co.uk, not a classified aggregator, but the
                            named LEADER is Able Group, cited in three other towns. Only the
                            cross-town test sees it.
   So either firing means shape 1, and when they DISAGREE the verdict says so out loud rather than
   resolving it: "a local firm leads the naming, but a marketplace leads the sources" is the read
   that stops someone walking into Loughborough on fragmentation alone. */

export type MarketShapeKind =
  | "unmeasured"
  /** ⛔ A REFUSAL, NOT A SHAPE. The names this verdict would be computed from are raw regex output,
   *  so every figure downstream — who leads, the top share, the concentration — is about fragments
   *  rather than firms. Grading it anyway is how a market gets skipped or worked on arithmetic
   *  performed over the word "always". */
  | "names_uncleaned"
  /** ⛔ WAS `marketplace_led`, AND THE RENAME IS THE FINDING. It used to fire when an aggregator was
   *  the most-CITED host, which is measured to predict nothing about who gets NAMED (see
   *  NATIONAL_TOP_N). It now means one thing only: every firm at the top of the naming is a national
   *  brand. */
  | "national_led"
  | "local_leader" | "thin_market";

export interface MarketShape {
  kind: MarketShapeKind;
  /** The verdict line: the shape, then what it means for working the market. */
  headline: string;
  /** Every claim the verdict rests on, with its numbers, so the operator can disagree with the
   *  sentence by reading the figures beside it. Never a black box. */
  reasoning: string[];
}

/* THE POOL NO LONGER DECIDES THE MARKET SHAPE, AND MUST NOT BE REINTRODUCED HERE.
   It did, and it was wrong: Hastings has 26 businesses named, a local leader on 13.8% of mentions,
   no marketplace in its citations and no national brand on top - the strongest "worth working" read
   there is - and it reported "probably not worth a pass" purely because Places returned 3
   contactable firms and a chain exclusion took that to 2.

   THE POOL IS KNOWN-INCOMPLETE: Surelock Homes takes 23 mentions across 6 of 6 Hastings audits and
   is not in the pool at all, having no Places listing in the town. A read resting on that was
   overruling two stronger reads resting on citations and naming.

   So they are separate statements now: the SHAPE comes from citations and naming, and the
   CONTACTABLE COUNT is its own line in marketPlainRead which never changes the verdict. */

/* -- HOW MUCH EVIDENCE BEFORE A SHAPE IS CALLED ------------------------------------------------
   EVIDENCE_MIN_AUDITS (5) was built for PER-BUSINESS audits: five businesses sampling one market
   with 3 questions each. A market audit is a single 8-question direct measurement of the market
   itself, so one of them is stronger evidence than one business audit ever was. Measured
   2026-08-04:

     one MARKET audit (Colchester, 8 questions)  -> 31 distinct businesses named, 153 citations
     one BUSINESS audit (mean of 6, Hastings)    -> 16.5 distinct businesses, ~61 citations
     SIX business audits together (18 questions) -> 26 distinct businesses

   One market audit surfaced MORE distinct businesses than six business audits of the same trade
   did, because its questions are chosen for the market rather than for one firm's specialisms, and
   the coverage directive makes a second one ask NEW intents rather than repeating.

   SO WHY TWO AND NOT ONE. Not breadth - breadth is already there. The reason is structural: with a
   single audit, `auditShare` is degenerate. Every named firm appears in 1 of 1 audits = 100%, so the
   established/thin test collapses onto its mention-share half and the audit-share guard - the one
   that stops "32 mentions from one answer" reading as a market position - does nothing at all. Two
   audits is the minimum at which that guard carries information (1 of 2 = 50% vs 2 of 2 = 100%).
   Two market audits is 16 non-overlapping questions and ~300 citations, for ~16p. */

/** Market audits needed before a shape is called. See above: two is where audit-share starts to
 *  mean anything, not a round number. */
export const MARKET_AUDIT_MIN_AUDITS = 2;

/* ══ THE ONE-BUTTON MEASURE RUN ═══════════════════════════════════════════════════════════════
   Trade, town, one press: lead search, then two market audits, then results. Five clicks and two
   dialogs became one button because every step of the old flow was friction on a thing used daily.

   ⛔ THE SEARCH RUNS FIRST, AND NOT IN PARALLEL, THOUGH IT COULD. A market audit reads nothing from
   the pool — create-ai-audit with market_only takes only business_type and location_text — so the
   two are technically independent. They are still sequential, because the search is the ONLY typo
   detector that exists: a mistyped town returns zero businesses in ~15 seconds for 8p, and if the
   audits are already away that mistake has cost 13p and left two audit rows for a town that does
   not exist. Parallelising saves ~20 seconds of a ~5½ minute run. Not worth the guard.

   ⛔ THE TWO AUDITS ARE CREATED ONE AFTER THE OTHER, and this is the subtle one. create-ai-audit
   builds its `coverage` directive by reading ai_audit_queue for questions already asked of that
   trade and town, and it inserts its queue rows BEFORE returning. Fire both at once and the second
   lookup runs before the first's rows exist, so both get no coverage hint and ask overlapping
   questions — destroying the only reason to run two: non-overlapping breadth, and an auditShare
   that is not degenerate. Sequential creation is load-bearing, not tidiness. */

/** Measured wall time for a market audit, from real queue rows: 3.3, 4.3, 5.4 and 17.8 minutes (the
 *  last a retry). Shown beside the progress bar as context, never used to drive it. */
export const MARKET_AUDIT_TYPICAL_MS = 5 * 60 * 1000;

/** Google geocode + text search for one town. Measured from api_usage_log: $0.005 geocode plus 3
 *  pages at the Text Search rate.
 *  ⛔ RE-PRICED 2026-08-06 AGAINST THE SKU TABLE, and it was under-stated. The code logs $0.032,
 *  which is Text Search PRO — but the field mask requests `websiteUri`, an ENTERPRISE field, and a
 *  request bills ONCE at the highest tier any requested field touches (CLAUDE.md §8). Enterprise is
 *  $35.00/1000, so a page is $0.035 and a typical three-page search is $0.110, not $0.101.
 *  Nobody had checked the constant against the tier — the same fault as the audit estimate being
 *  20% out. Range across recent searches $0.040 to $0.145. */
export const MARKET_SEARCH_USD = 0.110;

/** ⛔ 72 HOURS, and it is why the button quotes two prices. search-leads short-circuits on a cache
 *  hit within this window and charges NOTHING, so a second measure of the same trade and town is
 *  audits only. Mirrors CACHE_TTL_MS in search-leads and POOL_TTL_MS in market-view. */
export const MARKET_POOL_FRESH_MS = 72 * 60 * 60 * 1000;

/** One market audit: 8 questions at the measured per-question rate = $0.083, which is what the four
 *  real market audits actually cost. */
export const MARKET_ONE_AUDIT_USD = MARKET_AUDIT_QUESTION_COUNT * AUDIT_EST_USD_PER_QUESTION;

/** Markets per press of Coverage's batch-measure button — Paul's cap, 2026-08-15. Five markets is
 *  ~80 queue rows ≈ 66p worst case, small enough that a paid customer's baseline landing behind the
 *  batch waits minutes, not hours, and the $12/day audit ceiling keeps ample headroom. The button is
 *  EXPLICIT and priced; nothing on Coverage ever measures on navigation (the free-on-click rule). */
export const MEASURE_BATCH_CAP = 5;

/** ⛔ THE SERVER OWNS THIS TOO. create-ai-audit refuses a second market audit for the same trade and
 *  town inside this window and returns `market_cooldown`. Client state resets on reload, and
 *  "pressed it repeatedly" almost always means reload-and-press, so a client-side guard is the one
 *  that does not hold. Matches findable-onboarding's SUBMIT_COOLDOWN_MS, and is longer than the
 *  ~5 minute typical run so it cannot fire against a run that has already finished. */
export const MARKET_COOLDOWN_MS = 10 * 60 * 1000;

/* ⛔ THE AI CLEANER, AND WHEN IT IS WORTH 6p. extract-competitors re-reads every answer of a run
   with one gpt-4o call and rewrites the competitor names, which is what fixes a market whose
   extraction produced junk.
   MEASURED on the real Norwich run, not estimated: 8 queue rows, ~79,600 characters of answers,
   ~19,900 input tokens at $2.50/M plus ~2k output at $10.00/M = $0.070 per run.
   ⚠️ 6p AGAINST AN 8.3p AUDIT IS A 72% SURCHARGE, so it does NOT run on every measurement. It runs
   when the fold is PROVEN uncleaned — which is exactly when the figures cannot be trusted, and a
   market whose figures cannot be trusted is worth 6p to fix.
   ⛔ IT USED TO RUN ON distinctPerAudit > 15 AND THAT WAS BOTH TOO LOOSE AND TOO TIGHT. Too loose
   because a genuinely fragmented clean market can exceed it (an 8-question audit naming 20 real
   firms scores 20); too tight because chorley's fold of "always"/"i'd"/"vat" scores 9.6 per question
   and would never have fired. Now keyed on the marker words, which is a fact about the list. */
export const CLEANER_USD_PER_RUN = 0.070;

/**
 * Should a finished measurement be cleaned automatically?
 *
 * ⛔ THE RUN COUNT IS LOAD-BEARING and stays: with no completed run there is nothing to re-read, and
 * cleaning would pay for zero LLM calls that change nothing. That half of the old guard was always
 * right — see scripts/auto-clean.test.ts, where it was the guard's correctness that hid the fact
 * that it was being handed the PRE-measurement view and so could never fire.
 */
export function shouldAutoClean(namesUncleaned: boolean, runs: number): boolean {
  return runs > 0 && namesUncleaned;
}

/** What one press costs, stated on the button rather than in a dialog nobody reads twice. */
export function measureRunCost(poolIsFresh: boolean, audits: number): number {
  return (poolIsFresh ? 0 : MARKET_SEARCH_USD) + audits * MARKET_ONE_AUDIT_USD;
}

/** Pence, rounded, for the button label. Dollars on a button aimed at a UK operator reads as noise.
 *  ⚠️ A DISPLAY RATE, not an accounting one — the bill is in dollars and this is a label. */
export const USD_TO_GBP_DISPLAY = 0.79;
export const asPence = (usd: number): string => `${Math.round(usd * USD_TO_GBP_DISPLAY * 100)}p`;

export type MeasurePhase = 'idle' | 'searching' | 'starting' | 'answering' | 'stalled' | 'done' | 'blocked' | 'failed';

/* ⛔ THE RUN IS DERIVED FROM THE DATABASE, NOT OWNED BY THE COMPONENT. The first version kept the
   phase in React state, so any reload or navigation lost the bar and the operator was back to
   reading a sentence in a paragraph — the exact problem the rebuild existed to fix, and one that
   fires constantly, because five minutes is long enough to go and do something else.
   What is actually running lives in ai_audits and ai_audit_queue, and market-view already reports it
   as marketProgress. So: marketProgress supplies IDENTITY and ORIGIN (which audits, how many
   questions, when they started) and the 5-second queue poll supplies MOVEMENT. Each for the thing it
   is good at.
   ⚠️ ONE CONSEQUENCE, ACCEPTED: the bar now appears without anyone pressing the button — including
   for an audit started from the AI Audit page, which previously had no visibility here at all.
   ⚠️ ONE LIMIT, STATED RATHER THAN FAKED: the SEARCH phase cannot survive a reload. Nothing records
   "a search is in progress", so a refresh during those 10-30 seconds shows the idle button until it
   finishes. Inventing a marker for it would be a row written to make a bar look better. */
export interface DerivedRun {
  phase: MeasurePhase;
  auditIds: string[];
  /** Earliest start across the unfinished audits, so elapsed resumes from the real beginning. */
  startedMs: number | null;
  /** Questions across all of them, as the VIEW last saw them. The queue poll refines this. */
  questionsDone: number;
  questionsTotal: number;
  /** The raw error off the queue row, when one of them has stalled. Never a wrapper. */
  error: string | null;
}

/**
 * What the panel should be showing on mount, from the view alone.
 *
 * ⛔ STALE MEANS STALLED, NOT SLOW. An Apify question can legitimately run ~9 minutes and the queue
 * times a run out at 12, so past MARKET_AUDIT_STALE_MS the audit has stopped moving. A bar that
 * keeps implying progress on a dead audit is worse than no bar, because the operator sits and waits
 * for it. Past the threshold the phase becomes `stalled` and the raw error is surfaced.
 */
export function deriveRun(progress: MarketAuditProgress[] | undefined, nowMs: number): DerivedRun {
  const live = progress ?? [];
  if (live.length === 0) {
    return { phase: 'idle', auditIds: [], startedMs: null, questionsDone: 0, questionsTotal: 0, error: null };
  }
  const starts = live
    .map((p) => (p.startedAt ? new Date(p.startedAt).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  const startedMs = starts.length ? Math.min(...starts) : null;
  const questionsDone = live.reduce((n, p) => n + (p.questionsDone ?? 0), 0);
  const questionsTotal = live.reduce((n, p) => n + (p.questionsTotal ?? 0), 0);
  const error = live.find((p) => p.error)?.error ?? null;

  const age = startedMs === null ? 0 : nowMs - startedMs;
  if (startedMs !== null && age > MARKET_AUDIT_STALE_MS) {
    return { phase: 'stalled', auditIds: live.map((p) => p.auditId), startedMs, questionsDone, questionsTotal, error };
  }
  /* No queue rows yet means create-ai-audit has written the audit but the questions are still being
     inserted — `starting`, not `answering`, so the bar does not divide by zero and does not claim a
     count it has not got. */
  const phase: MeasurePhase = questionsTotal === 0 ? 'starting' : 'answering';
  return { phase, auditIds: live.map((p) => p.auditId), startedMs, questionsDone, questionsTotal, error };
}

/** How long a stalled run has been silent, for the message. */
export function stalledPhrase(startedMs: number, nowMs: number): string {
  const mins = Math.max(1, Math.round((nowMs - startedMs) / 60000));
  return `No progress for ${mins} minutes. An audit that has stopped moving will not restart on its own.`;
}

export interface MeasureProgress {
  phase: MeasurePhase;
  /** 0-100. Real, derived from state counts, never interpolated from a timer. */
  percent: number;
  label: string;
  questionsDone: number;
  questionsTotal: number;
  businessesFound: number | null;
}

/* ⛔ THE BAR IS SCORED PER QUESTION-STATE, NOT PER QUESTION. Measured on a real market audit: all
   eight questions finished within ONE SECOND of each other, because the queue claims up to
   START_BATCH (12) rows on a single tick and Apify runs them in parallel. A done/not-done bar
   therefore sits at 0% for five minutes and then jumps to 100%, which is a worse spinner than a
   spinner.
   Scoring pending=0, running=1, done=2 gives three real movements instead of one: rows claimed, all
   rows claimed, rows finished. Every point of it is a state that actually exists.
   ⛔ NOTHING HERE IS DRIVEN BY ELAPSED TIME. A bar advancing smoothly while nothing happens is a lie
   the operator would then trust, and the first time it sat at 90% for four minutes it would cost the
   credibility of every progress indicator in the app. Elapsed time is shown BESIDE the bar, as text,
   next to the measured median. */
export const QUESTION_STATE_SCORE: Record<string, number> = {
  pending: 0, queued: 0, running: 1, done: 2, failed: 2,
};

const PHASE_FLOOR = { searching: 8, starting: 20, answering: 30, done: 100 } as const;

export function measureProgress(
  phase: MeasurePhase,
  questions: Array<{ status: string | null }>,
  businessesFound: number | null,
): MeasureProgress {
  const total = questions.length;
  const done = questions.filter((q) => q.status === 'done').length;
  const failed = questions.filter((q) => q.status === 'failed').length;

  if (phase === 'searching') {
    return { phase, percent: PHASE_FLOOR.searching, label: 'Searching for businesses...', questionsDone: 0, questionsTotal: 0, businessesFound };
  }
  if (phase === 'starting' || (phase === 'answering' && total === 0)) {
    return {
      phase: 'starting',
      percent: PHASE_FLOOR.starting,
      label: businessesFound !== null
        ? `${businessesFound} businesses found - starting the questions`
        : 'Starting the questions...',
      questionsDone: 0, questionsTotal: total, businessesFound,
    };
  }
  if (phase === 'answering') {
    const score = questions.reduce((n, q) => n + (QUESTION_STATE_SCORE[q.status ?? 'pending'] ?? 0), 0);
    const span = PHASE_FLOOR.done - PHASE_FLOOR.answering;
    /* Capped below the top until the VIEW says the audits completed. The queue can show every row
       done a moment before the run is folded, and a bar that reaches 100% while the screen still
       says "measuring" is the same broken promise as a fake one. */
    const pct = PHASE_FLOOR.answering + Math.min(0.98, total ? score / (total * 2) : 0) * span;
    return {
      phase,
      percent: Math.round(pct),
      label: `${done} of ${total} questions answered${failed ? ` - ${failed} failed` : ''}`,
      questionsDone: done, questionsTotal: total, businessesFound,
    };
  }
  if (phase === 'done') {
    return { phase, percent: 100, label: 'Measured', questionsDone: done, questionsTotal: total, businessesFound };
  }
  /* ⛔ A STALLED BAR MUST NOT LOOK LIKE A MOVING ONE. It keeps the progress it genuinely reached —
     hiding that would throw away the only information about how far it got — but the caller renders
     it in a warning colour with the raw error beside it, and the label says stopped rather than
     answering. */
  if (phase === 'stalled') {
    const score = questions.reduce((n, q) => n + (QUESTION_STATE_SCORE[q.status ?? 'pending'] ?? 0), 0);
    const pct = total ? PHASE_FLOOR.answering + Math.min(0.98, score / (total * 2)) * (PHASE_FLOOR.done - PHASE_FLOOR.answering) : PHASE_FLOOR.starting;
    return {
      phase,
      percent: Math.round(pct),
      label: `Stopped at ${done} of ${total} questions${failed ? ` - ${failed} failed` : ''}`,
      questionsDone: done, questionsTotal: total, businessesFound,
    };
  }
  return { phase, percent: 0, label: '', questionsDone: done, questionsTotal: total, businessesFound };
}

/** Elapsed against the measured median, as TEXT beside the bar. Never fills it. */
export function elapsedPhrase(startedMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - startedMs) / 1000));
  const mmss = `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${mmss} - usually about ${Math.round(MARKET_AUDIT_TYPICAL_MS / 60000)} minutes`;
}

/** What the one button should say and do, given what the market already has.
 *  ⛔ REFRESH, NOT "ALREADY MEASURED", once the bar is cleared. A stale read is the commonest reason
 *  to press again; telling the operator it is measured answers a question they did not ask. The
 *  expensive action stops being the default the moment the question has been answered. */
export type MeasureAction = 'measure' | 'finish' | 'refresh' | 'running';

/* ⛔ IN-FLIGHT AUDITS COUNT. The first version took only the COMPLETED count, so a market with one
   audit running read as zero measured and the button offered "Measure this market", which would have
   created two MORE on top of it. The label was telling the operator to trigger the runaway the
   cooldown exists to stop. Observed on Norwich, 2026-08-06.
   An audit in flight is neither nothing nor finished, and the button has to know the difference:
   what matters is how many audits this market will HAVE once the dust settles, not how many it has
   already banked. */
export function measureAction(completedMarketAudits: number, inFlightMarketAudits = 0): MeasureAction {
  const eventual = completedMarketAudits + inFlightMarketAudits;
  /* Something running AND enough on the way: there is nothing to press. Say so rather than offering
     an action that would over-spend, and rather than a disabled button with no reason on it. */
  if (inFlightMarketAudits > 0 && eventual >= MARKET_AUDIT_MIN_AUDITS) return 'running';
  if (eventual >= MARKET_AUDIT_MIN_AUDITS) return 'refresh';
  if (eventual === 1) return 'finish';
  return 'measure';
}

/** How many audits a press starts. Refresh and running start none. */
export function auditsToRun(action: MeasureAction): number {
  if (action === 'measure') return MARKET_AUDIT_MIN_AUDITS;
  if (action === 'finish') return 1;
  return 0;
}

/** What one market audit is worth in business-audit terms, for a market measured by both.
 *  ⚠️ THIS FOLLOWS FROM THE TWO THRESHOLDS (2 market audits and 5 business audits both being
 *  "enough"), not from an independent measurement. It credits a market audit slightly above the
 *  measured breadth ratio of 1.9x, which is deliberate: a market audit's questions are chosen for
 *  the market and are non-overlapping by design, so its 8 questions reach more distinct intent than
 *  8 questions spread across three business audits would. If that turns out to be generous, this is
 *  the number to lower. */
export const MARKET_AUDIT_EVIDENCE_WEIGHT = 2.5;

/** ⛔ COMPLETED audits only. Counting audits that merely EXIST let two market audits with one
 *  completed run pass a two-audit bar, so the view called a shape on a single audit's data — the
 *  degeneracy the bar exists to prevent, reintroduced by the gate itself. An audit in flight or
 *  failed contributes nothing until it finishes. */
export interface MarketEvidence { marketAudits: number; businessAudits: number }

/** Is there enough to call a shape? Either bar on its own, or a weighted mix reaching the
 *  business-audit bar. */
export function hasShapeEvidence(e: MarketEvidence): boolean {
  if (e.marketAudits >= MARKET_AUDIT_MIN_AUDITS) return true;
  if (e.businessAudits >= EVIDENCE_MIN_AUDITS) return true;
  return (e.businessAudits + e.marketAudits * MARKET_AUDIT_EVIDENCE_WEIGHT) >= EVIDENCE_MIN_AUDITS;
}

/** The shortfall, in words, for the "not measured enough" verdict. */
export function evidenceShortfall(e: MarketEvidence): string {
  const parts: string[] = [];
  if (e.marketAudits > 0) parts.push(`${e.marketAudits} market audit${e.marketAudits === 1 ? "" : "s"}`);
  if (e.businessAudits > 0) parts.push(`${e.businessAudits} business audit${e.businessAudits === 1 ? "" : "s"}`);
  const have = parts.length ? `${parts.join(" and ")} finished` : "nothing finished yet";
  if (e.marketAudits === 1 && e.businessAudits === 0) {
    return `${have}. One more market audit and this view will call the shape - and because repeat market audits cover NEW intents rather than repeating, the second one widens the picture as well as confirming it.`;
  }
  return `${have}. This view needs ${MARKET_AUDIT_MIN_AUDITS} market audits, or ${EVIDENCE_MIN_AUDITS} business audits, before it will call a market's shape.`;
}

/** A market with almost nothing named in it - no competitive picture to show a client.
 *
 *  NOT DERIVED FROM DATA, BECAUSE THERE IS NONE TO DERIVE IT FROM. Every market measured to the
 *  5-audit minimum names at least 23 distinct businesses (Spalding 23, Hastings 26, Wisbech 34,
 *  Kettering 53, Loughborough 87, Wrexham 334). No genuinely thin market has ever been observed, so
 *  there is no gap to fit a threshold to and one has not been invented.
 *
 *  What this number is: the point below which there is no "who is winning" picture at all - fewer
 *  named firms than the audit minimum itself. Deliberately far below every observed market, so it
 *  cannot misfire on real data. It exists so the vocabulary is complete, not to classify anything
 *  today. If it ever fires, look at that market by hand before trusting it. */
export const THIN_MARKET_MAX_NAMED = EVIDENCE_MIN_AUDITS;

export interface MarketShapeInput {
  audits: number;
  completeRuns: number;
  leader: MarketLeader | null;
  /** The leader's row, for its national flag and audit share. */
  leaderRow: MarketNamedRow | null;
  /** ⛔ THE TOP OF THE NAMING, most-mentioned first — the list the national test reads. The leader
   *  alone was not enough: a market whose leader is a franchise but whose #2 and #3 are local firms
   *  is a market with local firms in it, and it was being skipped.
   *  Absent (an older caller) falls back to the leader alone, i.e. the previous behaviour. */
  topNamed?: MarketNamedRow[];
  citationHosts: MarketCitationHost[];
  citationTotal: number;
  /** Distinct businesses AI names here - the only size signal the shape uses. */
  distinctBusinesses: number;
  /** Audits of this market with no business attached (8 questions each) that have a COMPLETED run.
   *  ⛔ COMPLETED, not created. Named that way because the bug was passing the audit count: two
   *  market audits with one finished run cleared a two-audit bar. */
  marketAuditsComplete: number;
  /** Per-business audits of this trade and town with a COMPLETED run. */
  businessAuditsComplete: number;
  /** ⛔ THE COMPETITOR LIST IS PROVEN RAW. Read from the fold via marketNamesUncleaned, so an older
   *  view that cannot answer the question passes `false` and the verdict behaves as it always did. */
  namesUncleaned?: boolean;
  /** The markers found, for the refusal's own reasoning lines. */
  uncleanedExamples?: string[];
  /** Completed runs the cleaner would re-read, so the refusal can price its own fix. */
  runsToClean?: number;
  /* NO POOL FIELDS, DELIBERATELY. The shape is decided by citations and naming alone, so an
     incomplete Places pool cannot overrule them. The contactable count lives in marketPlainRead. */
}

export function marketShape(input: MarketShapeInput): MarketShape {
  const {
    audits, completeRuns, leader, leaderRow, citationHosts, citationTotal, distinctBusinesses,
    marketAuditsComplete: marketAudits, businessAuditsComplete: businessAudits,
  } = input;

  /* NEVER MORE CONFIDENT THAN THE EVIDENCE. Below the same bar the playbook uses, this names no
     shape at all - a market read off two audits is a guess wearing a verdict's clothes. */
  if (!hasShapeEvidence({ marketAudits, businessAudits }) || completeRuns === 0 || !leader) {
    return {
      kind: "unmeasured",
      headline: "Not measured enough to judge",
      reasoning: [
        evidenceShortfall({ marketAudits, businessAudits }),
        completeRuns === 0
          ? `${audits} audit${audits === 1 ? "" : "s"} exist${audits === 1 ? "s" : ""} but none has finished, so nothing has been measured yet.`
          : `${completeRuns} completed run${completeRuns === 1 ? "" : "s"} behind it so far.`,
      ],
    };
  }

  /* ⛔ SECOND, AND BEFORE ANYTHING THAT READS A NAME. The evidence gate above comes first because
     "not measured enough" is the more basic statement and needs no names at all. Everything BELOW
     this point — who leads, which host dominates, how many firms are named — is arithmetic over the
     extracted list, so if that list is raw regex output the verdict is about fragments.
     Eastbourne is the case that proves it matters: 287 names over 16 questions, 33 of them function
     words, Checkatrade top-cited at 14% — and it was SKIPPED on a marketplace-led verdict computed
     over that fold. A refusal Paul can act on beats a verdict he cannot audit. */
  if (input.namesUncleaned) {
    const examples = (input.uncleanedExamples ?? []).slice(0, UNCLEANED_EXAMPLES_SHOWN);
    const runs = input.runsToClean ?? 0;
    return {
      kind: "names_uncleaned",
      headline: "Names not cleaned · no verdict until they are",
      reasoning: [
        examples.length > 0
          ? `The extracted competitor list contains ${examples.map((e) => `"${e}"`).join(", ")} — words, not firms, so it is raw scraper output rather than businesses.`
          : "The extracted competitor list contains single words rather than business names, so it is raw scraper output.",
        `Every figure a verdict would rest on — who leads, the top share, how many firms are named — would be counted over that list, so it is not being graded.`,
        runs > 0
          ? `Re-read the ${runs} completed run${runs === 1 ? "" : "s"} with the AI cleaner (about ${asPence(runs * CLEANER_USD_PER_RUN)}, no re-auditing) and this market will grade itself.`
          : "There is no completed run to re-read, so the names cannot be cleaned yet.",
      ],
    };
  }

  const topHost = citationHosts[0] ?? null;
  /* ⛔ CITED IS NOT NAMED, AND THIS IS NOW A FACT ON SCREEN RATHER THAN HALF A VERDICT.
     MEASURED 2026-08-10 across every market with a completed run. 17 have an aggregator as the
     most-cited host, and in ALL SEVENTEEN AI names local firms anyway:
       * in 15 of 17 the aggregator's own brand is not in the named list at all;
       * in the other 2 it is named far behind the local leader — Stamford 9 mentions against 68,
         Eastbourne 13 against 32;
       * local firms hold all three top spots in 10 of the 17, two of three in another 4.
     The clearest case is plumber/Wisbech: Checkatrade takes 27% of citations, the highest share in
     the book, and the three most-named firms are Fen Property Services (52), DC Plumbing (49) and
     Mr Gas and Heating (37) — every one of them local. That is the town Paul has actually worked.
     Five markets — Eastbourne, Chichester, Portsmouth, Loughborough, Kettering — were skipped on
     this signal. It is not a signal. It is now stated as intelligence, in the reasoning of whatever
     shape the naming actually supports. */
  const aggregatorTopCited = !!topHost?.isAggregator;
  /* ⛔ THE SURVIVING HALF, WIDENED FROM THE LEADER TO THE TOP THREE. Paul's own proposal, and the
     data supports it: locksmiths/Colchester is led by LockRite, Lockforce and LockFit — three
     national franchises and no local firm anywhere near the top — which the leader-only test called
     the same thing as a market whose leader is a franchise and whose #2 is a local firm. Those are
     different markets, and only one of them is unworkable. */
  const topNamed = (input.topNamed ?? (leaderRow ? [leaderRow] : [])).slice(0, NATIONAL_TOP_N);
  const localAtTheTop = topNamed.filter((n) => (n.otherTowns ?? 0) < NATIONAL_MIN_OTHER_TOWNS);
  const nationalDominated = topNamed.length > 0 && localAtTheTop.length === 0;
  const leaderIsNational = (leaderRow?.otherTowns ?? 0) >= NATIONAL_MIN_OTHER_TOWNS;
  const hostShare = topHost && citationTotal > 0 ? Math.round((topHost.citations / citationTotal) * 100) : 0;
  /* ⛔ THE DENOMINATOR IS PRINTED, NOT JUST DIVIDED BY, AND THAT IS WHERE IT WENT WRONG.
     Every ratio in this file is guarded (`citationTotal > 0`), so nothing ever divided by zero and
     nothing ever threw — but the reasoning lines interpolated the raw total straight into the
     sentence, and produced "lockrite.org (47 of 0)". One helper for all three, so a total of zero
     states the count alone rather than a fraction of nothing. A guard on the arithmetic is not a
     guard on the sentence. */
  const ofTotal = (n: number) => (citationTotal > 0 ? `${n} of ${citationTotal}` : `${n}`);

  /* THE CITATION FACT, AS INTELLIGENCE. Said in every shape, never deciding one \u2014 the same rule \u00a76
     already applies to unknown hosts: they route to who's-winning, never to a task. */
  const citationLine = topHost
    ? aggregatorTopCited
      ? `${topHost.host} is the most-cited source here: ${ofTotal(topHost.citations)} citations${citationTotal > 0 ? ` (${hostShare}%)` : ""}. Worth knowing, but measured across 17 markets it does not predict who gets named.`
      : `The most-cited source is ${topHost.host} (${ofTotal(topHost.citations)}), a business's own site rather than a directory.`
    : null;

  // -- SHAPE 1: every firm at the top of the naming is a national brand.
  if (nationalDominated) {
    const reasoning: string[] = [];
    reasoning.push(
      topNamed.length === 1
        ? `The only business AI names here, ${topNamed[0].name}, is cited in ${topNamed[0].otherTowns} other towns for this trade, so it is a national brand rather than a local firm.`
        : `All ${topNamed.length} of the most-named businesses here \u2014 ${topNamed.map((n) => n.name).join(", ")} \u2014 are cited in ${NATIONAL_MIN_OTHER_TOWNS}+ other towns for this trade, so they are national brands rather than local firms.`,
    );
    reasoning.push("A local business would be competing with a franchise's national footprint, not with another local firm.");
    if (citationLine) reasoning.push(citationLine);
    return { kind: "national_led", headline: "National brands hold the naming \u00b7 probably skip this market", reasoning };
  }

  /* -- SHAPE 3: the MARKET is thin, not the pool. See THIN_MARKET_MAX_NAMED - this has never fired
     on real data and is not expected to. */
  if (distinctBusinesses < THIN_MARKET_MAX_NAMED) {
    return {
      kind: "thin_market",
      headline: "Barely a market \u00b7 almost nothing is named here",
      reasoning: [
        `AI names only ${distinctBusinesses} business${distinctBusinesses === 1 ? "" : "es"} across ${audits} audits of this trade and town.`,
        "There is no competitive picture to show a client, and nobody established to displace.",
        "This read has never fired on a measured market - check the audits by hand before acting on it.",
      ],
    };
  }

  // -- SHAPE 2: a beatable local firm is named at the top. The one worth working.
  /* \u26d4 AND IT NO LONGER MATTERS WHETHER A DIRECTORY OWNS THE SOURCES. A market can reach here with
     Checkatrade top-cited \u2014 plumber/Wisbech does, at 27% \u2014 because what a client competes for is
     being NAMED, and the naming in these markets is local. */
  const localLeader = localAtTheTop[0] ?? null;
  const reasoning = [
    leaderIsNational && localLeader
      ? `${leader.name} is named most but is a national brand; the best-named LOCAL firm is ${localLeader.name} (${localLeader.mentions} mentions across ${localLeader.audits} of ${audits} audits), which is what a client would be compared against.`
      : `${leader.name} takes ${leader.mentions} mentions across ${leaderRow?.audits ?? 0} of ${audits} audits and is a local firm, not a national brand.`,
    "A local firm at the top is beatable, and this is the comparison to sell with.",
  ];
  if (citationLine) reasoning.push(citationLine);
  return { kind: "local_leader", headline: "Local leader \u00b7 the best shape to work", reasoning };
}

/* -- THE TEN-SECOND READ -----------------------------------------------------------------------
   The panel was accurate and unreadable: a verdict, concentration figures, 26 names in three
   groups, prospects, nearby, exclusions. This renders the SAME decision marketShape already made
   into two plain sentences a non-technical person can take in over a video call.

   IT ADDS NO LOGIC AND NO THRESHOLD. Every number comes from the fold that already produced it -
   distinctBusinesses, topName, topSharePct, the top cited host, the prospect count. Nothing here is
   hand-written: an early draft of this said the Hastings leader takes "a quarter" of the mentions
   when the measured figure is 13%, which is exactly the kind of invented number this comment exists
   to prevent. If a sentence cannot be built from the fold, it is not said. */

export interface MarketPlainRead {
  /** One sentence: is this market worth working, and why. */
  market: string;
  /** One sentence: who to contact here. */
  contact: string;
}

export function marketPlainRead(
  shape: MarketShape,
  conc: MarketConcentration,
  trade: string,
  town: string,
  leader: MarketLeader | null,
  citationHosts: MarketCitationHost[],
  /** Contactable businesses: never-named plus thinly-named, CHAINS EXCLUDED. The same list the
   *  panel renders, so the count and the rows can never disagree. */
  prospects: number,
  poolSearched: boolean,
  /** Places rows found, before chain folding. */
  poolFound: number,
  /** Entries after chain folding. */
  poolEntries: number,
  /** Chain entries inside poolEntries — folded branches, never prospects. */
  chainEntries: number,
  /** Runs that actually COMPLETED. With none, nothing has been measured, so nobody can have been
   *  named and no business can be called a prospect. */
  completeRuns: number,
  /** Audits that exist but have not finished, so the wait can be stated. */
  pendingAudits: number,
  /** Of `prospects`, how many have NO WEBSITE. They are not a smaller prospect list — they are a
   *  DIFFERENT one: the AI-visibility pitch is the wrong opening for a business AI has nothing of to
   *  read, and Gemini cannot name them at all (measured: MK Plumbing, 0/10). Stated here so the
   *  sentence and the two lists under it cannot disagree about the total. */
  noWebsiteProspects: number,
): MarketPlainRead {
  const topHost = citationHosts[0] ?? null;
  const plural = trade.trim().toLowerCase();

  let market: string;
  switch (shape.kind) {
    case "unmeasured":
      /* Uses the SAME shortfall wording the verdict does, so the sentence and the bullets cannot
         quote different minimums - it said "5 is the minimum" to someone who had run one MARKET
         audit, where the bar is two. */
      market = `Not enough measured yet to say. ${evidenceShortfall({
        marketAudits: conc.marketAuditsComplete ?? 0,
        businessAudits: conc.businessAuditsComplete ?? 0,
      })}`;
      break;
    case "names_uncleaned":
      /* ⛔ SAYS WHAT IS WRONG AND WHAT FIXES IT, and never a number off the dirty fold. Quoting
         "AI names 239 firms in Eastbourne" here would be repeating the very count the refusal
         exists to distrust. */
      market = `No verdict yet — the competitor names for ${plural} in ${town} were never cleaned, so `
        + 'every figure would be counted over scraped words rather than firms. Re-read them with the '
        + 'AI cleaner and this market grades itself. Nothing needs re-auditing.';
      break;
    case "national_led":
      /* ⛔ NO LONGER MENTIONS THE CITED HOST AT ALL. It used to say "Checkatrade is the source AI
         trusts most, so skip" — a sentence measured to be wrong about 17 markets, including the one
         Paul has worked. The skip is now about the naming, which is the thing a client competes for. */
      market = `Skip this one. Every ${plural.replace(/s$/, "")} AI names at the top in ${town} is a national brand`
        + ` rather than a local firm, so a local business is competing with a franchise's footprint.`;
      break;
    case "thin_market":
      market = `Barely a market. AI names only ${conc.distinctBusinesses} ${plural} in ${town} across ${conc.audits} audits, so there is no competitive picture to show anybody.`;
      break;
    default:
      market = leader
        ? `Worth working. AI names ${conc.distinctBusinesses} different ${plural} in ${town}, and even the most-named one, ${leader.name}, takes only ${conc.topSharePct}% of the mentions - so there is room for another name.`
        : `Worth working. AI names ${conc.distinctBusinesses} different ${plural} in ${town}, and no single firm dominates the answers.`;
  }

  /* THE CONTACT SENTENCE. Counted from the prospect list as rendered, so it can never disagree with
     the rows underneath it. With no pool it says what to do rather than leaving the top blank. */
  /* EVERY NUMBER SAYS WHAT IT IS. "from a pool of 3" conflated the prospect count with the pool:
     Hastings is 13 rows found in Places, 8 entries after chain branches fold together, and 3 worth
     contacting. Three different figures, and the sentence now names each one. */
  const poolLine = poolFound > poolEntries
    ? `${poolFound} found in Places, ${poolEntries} after chain branches fold together`
    : `${poolEntries} found in Places`;
  const chainLine = chainEntries > 0
    ? (chainEntries === 1
      ? ", one of them a chain entry that is not a prospect"
      : `, ${chainEntries} of them chain entries that are not prospects`)
    : "";

  /* ⛔ NOTHING MEASURED MEANS NO PROSPECTS. WITH ZERO COMPLETED RUNS NOBODY CAN HAVE BEEN NAMED, so
     every business in the pool looks invisible whatever AI actually says — and calling 13 of them
     "worth contacting" is a prospect list built on no data. The collapsed detail already refused to
     do this; the summary now defers to the SAME rule (completeRuns > 0) instead of ignoring it. */
  const contact = !poolSearched
    ? "No lead search has been run for this town yet - run it to see who to contact."
    : completeRuns === 0
      ? `Nobody can be called a prospect yet: ${poolLine}${chainLine}, but no audit has finished, so nothing has been measured and there is nothing to subtract. ${
        pendingAudits > 0
          ? `${pendingAudits} audit${pendingAudits === 1 ? "" : "s"} still running - this becomes a prospect list when ${pendingAudits === 1 ? "it finishes" : "they finish"}.`
          : "Run an audit of this market first."
      }`
      /* ⛔ AN EMPTY POOL IS ENUMERATED BEFORE THE ZERO-PROSPECTS TEST, NOT AFTER IT.
         "of 0 found in Places, every one is already named by AI" is what this said, and it is
         two false claims in one sentence: nothing was found, and therefore nothing was measured
         against. Zero prospects out of zero businesses and zero prospects out of twelve are
         opposite findings that happen to share an arithmetic result — the market is EMPTY, not
         closed. Fifth instance of an absent value read as an answer (CLAUDE.md §6), and the fix is
         the same one every time: name the absent case explicitly instead of letting it fall into a
         branch written for a different state. */
      : poolFound === 0
        ? `Places found no ${trade} inside the ${town} boundary at all, so there is nothing here to contact and nothing for the audits to have been measured against. That is a fact about the SEARCH, not about the market: a town this size may genuinely have none of this trade, or Places may not list them. The AI answers above name firms from other towns, which is the real finding.`
      : prospects === 0
        ? `Nobody left to contact: of ${poolLine}, every one is already named by AI in more than ${Math.round(TARGET_MAX_NAMED_SHARE * 100)}% of answers. The list can't be complete though - it is only what Places returned inside the town boundary.`
        : `${prospects} worth contacting: of ${poolLine}${chainLine}, ${prospects} ${prospects === 1 ? "is" : "are"} named in ${Math.round(TARGET_MAX_NAMED_SHARE * 100)}% of AI answers or fewer, most of them never.${
        noWebsiteProspects > 0
          ? ` ${noWebsiteProspects} of them ${noWebsiteProspects === 1 ? "has" : "have"} no website, so ${noWebsiteProspects === 1 ? "it needs" : "they need"} a different opening - listed separately below.`
          : ""
      } Places may be missing firms, so treat it as a floor.`;

  return { market, contact };
}

/** How invisible one prospect is, in words. "never mentioned in 6 audits" reads to anybody;
 *  "0 mentions / 6 audits" needs decoding. Built from the row's own thin data, so it cannot
 *  disagree with the grading. */
/* ── WHICH POOL ROWS ARE NOT THE TRADE YOU SEARCHED FOR ────────────────────────────────────────
   Norwich returned a hardware shop and a shoe-repair counter in a locksmith pool. Both are real
   businesses that do touch keys, so neither is a bug in the search — but neither is a locksmith,
   and they sat in the prospect list with nothing saying so.

   ⛔ THE EXPECTED TYPE IS DERIVED FROM THE POOL, NEVER HARDCODED. There is no trade -> Google-type
   table anywhere in this file and there must not be one, for the same reason DirectoryFact may not
   carry a `trade` (see CLAUDE.md §6): the moment the code asserts "locksmiths are type locksmith"
   it is a hand-maintained list that is wrong for every trade nobody thought about. What Google
   calls MOST of the businesses a search for that trade returned is the answer, and it costs no
   maintenance because it is recomputed from each pool.

   ⚠️ ABSENCE IS NEVER AN ANSWER (CLAUDE.md, three instances and counting). A row with no
   primaryType — every row cached before the field mask changed — is NEVER marked. The assertion is
   on the grade we WANT (a known type that differs from a known modal type), never on the one we
   want to exclude. Getting this backwards is what made the tier subtraction drop 15 Norwich
   prospects, and it would here mark every historic row as not-a-locksmith. */

/** Below this share of typed rows the modal type is not a consensus, so nothing is marked. A pool
 *  genuinely split between two types has no "expected" type and guessing one would mark half the
 *  market as off-trade. */
/* ⛔ HOW MANY OTHER TOWNS MAKE A NAME A NATIONAL BRAND. Was `> 0` — ONE other town — which called
   Ely Locksmiths a national chain in Soham and produced a "Skip this one" verdict on a market whose
   leader is a firm in the next town along. A neighbouring firm appearing in a neighbouring town is
   expected, not evidence.

   MEASURED 2026-08-07 across every audit in the database — 5,263 distinct trade+name pairs:
     1 town   5,141  (97.7%)
     2 towns     93  ( 1.8%)
     3 towns     15  ( 0.3%)
     4 towns      4     5 towns  4     6 towns  4     7 towns  1     8 towns  1
   The break is unmistakable: 97.7% of names are seen in exactly one town, and the whole tail above
   two is 0.6% of the population. At 3+ the list is Timpson (8), Dyno-Rod (7), SOS Leak Detection
   (6), ADI Leak Detection (6), Able Group (6), LockRite (6), Keytek (4), TaxAssist (5), Azets (3) —
   the chains, by name. At 2 you would still flag 93 pairs that are overwhelmingly firms serving a
   neighbouring town, which is the Ely case exactly.

   ⚠️ 4 would be cleaner still (14 pairs, every one an unambiguous chain) but risks missing a real
   regional chain, and 3 already matches Paul's own read: "Timpson and Able Group appear in many
   towns; a neighbouring firm appears in one or two."
   ⚠️ A FIXED number is right and does not need to scale with how many towns get measured: a local
   firm does not gain towns as more markets are added, only a chain does. */
export const NATIONAL_MIN_OTHER_TOWNS = 3;

/** How many of the most-named firms the national test looks at. THREE, because that is the width of
 *  the list Paul reads off the panel and quotes to a prospect — and because the leader alone called
 *  Colchester (LockRite, Lockforce, LockFit: no local firm anywhere) the same thing as a market whose
 *  #2 is local. A market with a local firm in the top three has somebody to be compared against. */
export const NATIONAL_TOP_N = 3;

export const OFF_TRADE_MIN_SHARE = 0.5;
/** Fewer typed rows than this and the mode is noise — 2 of 3 is not a consensus. */
export const OFF_TRADE_MIN_TYPED = 4;

export interface TypedPoolEntry { primaryType?: string; primaryTypeLabel?: string }

/** The type Google gives most of this pool, or null when there is no clear consensus. Exported so
 *  the behaviour is testable without a market-view round trip. */
export function expectedPrimaryType(rows: TypedPoolEntry[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.primaryType) continue;               // untyped rows do not vote, and are never marked
    counts.set(r.primaryType, (counts.get(r.primaryType) ?? 0) + 1);
  }
  const typed = [...counts.values()].reduce((a, b) => a + b, 0);
  if (typed < OFF_TRADE_MIN_TYPED) return null;
  let best: string | null = null, bestN = 0;
  for (const [t, n] of counts) {
    // Ties resolve alphabetically so the same pool always gives the same answer. A tie at or above
    // the share bar is possible only with exactly two types at 50% each, which the >= below admits;
    // determinism matters more than which of the two wins, because neither is marked as off-trade.
    if (n > bestN || (n === bestN && best !== null && t < best)) { best = t; bestN = n; }
  }
  return bestN / typed >= OFF_TRADE_MIN_SHARE ? best : null;
}

/** The mark for one row, or undefined. Undefined for: no consensus, no type on the row, or a match.
 *  ⚠️ Never returns a mark for an untyped row, whatever the consensus is. */
export function offTradeMark(
  row: TypedPoolEntry,
  expected: string | null,
): { label: string } | undefined {
  if (!expected || !row.primaryType || row.primaryType === expected) return undefined;
  /* The label Google itself shows, falling back to the raw type made readable. Saying "Google lists
     this as a Hardware Store" is actionable; "not a locksmith" alone is not, because it does not
     tell the operator whether it is a near-miss worth keeping. */
  return { label: row.primaryTypeLabel || row.primaryType.replace(/_/g, " ") };
}

/** The mark for a GROUP of pool rows (a chain's branches folded into one entry). Marked only when
 *  a consensus exists, at least one branch is typed, and NO typed branch matches the consensus —
 *  so one on-trade branch keeps the whole entry on-trade (Chester's Timpson has branches Google
 *  files as both "Services" and "Locksmith"; a firm Google half-agrees about is not excluded).
 *  ⚠️ Untyped branches never vote, in either direction — the same absence rule as offTradeMark. */
export function offTradeMarkForGroup(
  rows: TypedPoolEntry[],
  expected: string | null,
): { label: string } | undefined {
  if (!expected) return undefined;
  const typed = rows.filter((r) => !!r.primaryType);
  if (typed.length === 0) return undefined;
  if (typed.some((r) => r.primaryType === expected)) return undefined;
  return offTradeMark(typed[0], expected);
}

/** The row's score in words, built from the same two counts the verdict uses so the sentence and
 *  the grading cannot disagree. Never renders a percentage of zero answers. */
export function invisibilityPhrase(row: Pick<MarketPoolRow, 'answersNamed' | 'answersTotal'>): string {
  const { answersNamed: named, answersTotal: total } = row;
  if (total <= 0) return 'not measured yet — no completed answers to score against';
  if (named === 0) return `never named in ${total} AI answer${total === 1 ? '' : 's'}`;
  const pct = Math.round((named / total) * 100);
  return `named in ${named} of ${total} answers (${pct}%)`;
}

/** One unfinished market audit, in words, with the RAW error when there is one.
 *  Severity drives the colour on the panel; a run inside its normal window is information, not an
 *  alarm. The last incident was a healthy 3.9-minute-old run that looked like a silent failure
 *  purely because nothing on screen said it was still going. */
export function marketAuditProgressPhrase(
  p: MarketAuditProgress,
  nowMs: number,
): { severity: "running" | "stalled" | "failed"; text: string } {
  const progress = p.questionsTotal > 0
    ? `${p.questionsDone} of ${p.questionsTotal} questions done`
    : "no questions queued";
  const ageMs = p.startedAt ? nowMs - Date.parse(p.startedAt) : 0;
  const mins = Math.max(0, Math.round(ageMs / 60000));
  const age = p.startedAt ? `, started ${mins} minute${mins === 1 ? "" : "s"} ago` : "";
  const stale = ageMs > MARKET_AUDIT_STALE_MS;

  if (p.status === "failed" || (p.error && (stale || p.questionsDone === 0))) {
    return { severity: "failed", text: `This market audit failed: ${p.error ?? "no error was recorded on the run."} (${progress}${age}.)` };
  }
  if (p.status === "no_run") {
    return { severity: "failed", text: "This market audit was created but no run was ever started for it, so nothing is measuring." };
  }
  if (p.error) {
    return { severity: "stalled", text: `A question in this market audit errored and it is retrying: ${p.error} (${progress}${age}.)` };
  }
  if (p.questionsFailed > 0) {
    return {
      severity: stale ? "failed" : "stalled",
      text: `${p.questionsFailed} question${p.questionsFailed === 1 ? "" : "s"} in this market audit failed with no error recorded (${progress}${age}.)`,
    };
  }
  if (stale) {
    return {
      severity: "stalled",
      text: `This market audit has not moved for a while: ${progress}${age}. A question takes about nine minutes at most, so this one is stuck rather than working.`,
    };
  }
  return {
    severity: "running",
    text: `This market audit is still running: ${progress}${age}. A question can take up to about nine minutes, so give it a few and reload.`,
  };
}
