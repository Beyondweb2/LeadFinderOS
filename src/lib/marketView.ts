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
  /** distinctPerAudit >= JUNK_RATIO_PER_AUDIT. Flag, not fact. */
  likelyJunk: boolean;
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

/** A pool business REMOVED from the prospect list because AI already names it, and the entry it
 *  matched. Itemised rather than merely counted: a silent exclusion is how a real prospect
 *  disappears, and this is the row that makes a wrong merge visible instead of invisible. */
export interface MarketPoolExcluded {
  name: string;
  /** Places rows that folded into this entry (chain branches). 1 when nothing collapsed. */
  branches: number;
  matchedNamed: string;
  matchedMentions: number;
  matchedAudits: number;
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
  /** Present when this business IS named, but only thinly — so it stays a PROSPECT instead of
   *  being subtracted. Carries its own thinness so the row can show how thin: "1 mention in 1 of
   *  6 audits, against 25 for the leader". Absent = never named at all. */
  thin?: { mentions: number; audits: number; matchedNamed: string };
}

/** The three states, which MUST read differently on screen. An empty prospect list and a search
 *  that was never run are completely different facts about a market, and conflating them is how an
 *  operator concludes "AI names everyone here" about a town nobody has searched. */
export type MarketPoolState =
  | { state: 'never_searched' }
  | { state: 'expired'; keyword: string; searchedAt: string; ttlHours: number }
  | {
    state: 'ready';
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
  /** The most-cited hosts in this market, biggest first, with the aggregator flag the shape read
   *  needs. Folded from citations already stored on the queue rows - no extra queries. */
  citationHosts?: MarketCitationHost[];
  /** Total citations behind citationHosts, so a share can be shown next to the leader. */
  citationTotal?: number;
  /** Market audits that have NOT finished, with progress and the raw error if any. */
  marketProgress?: MarketAuditProgress[];
  /** Businesses the radius pass found JUST OUTSIDE the town boundary. Visible, tagged, and never
   *  merged into `pool` — see MarketPoolRow.outsideTown. */
  poolNearby?: MarketPoolRow[];
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
}

export interface MarketOption { trade: string; town: string; audits: number }

/** Per-question audit cost, mirroring SOURCES.ai_search.estCostUsd and AiAudit.tsx's
 *  RE_AUDIT_EST_USD_PER_QUESTION so the confirm here quotes the same figure the audit page does.
 *  Measured, not guessed — see CLAUDE.md §8. */
export const AUDIT_EST_USD_PER_QUESTION = 0.0125;

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

/** Apify on-page SEO scan, per audited business that HAS a website. From
 *  process-ai-audit-queue's own costing comment ($0.12 per scan, re-costed against billed spend).
 *  A market batch now SKIPS these (see MARKET_SKIP_SEO), so this is only used to show the
 *  operator what skipping them saves. */
export const SEO_SCAN_USD = 0.12;

/** Google Place Details, charged once per business added to the CRM (the phone/address/rating
 *  lookup in useOutreach.addLead).
 *  ⚠️ INHERITED CONSTANT, NEVER VERIFIED AGAINST A BILL — it is google-place-details' own
 *  logUsage figure. Shown on screen labelled as unverified rather than quietly folded in. */
export const PLACE_DETAILS_USD = 0.017;

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

export type MarketShapeKind = "unmeasured" | "marketplace_led" | "local_leader" | "thin_market";

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

  const topHost = citationHosts[0] ?? null;
  const aggregatorLeads = !!topHost?.isAggregator;
  const leaderIsNational = (leaderRow?.otherTowns ?? 0) > 0;
  const hostShare = topHost && citationTotal > 0 ? Math.round((topHost.citations / citationTotal) * 100) : 0;

  // -- SHAPE 1: a marketplace or a national platform owns the market.
  if (aggregatorLeads || leaderIsNational) {
    const reasoning: string[] = [];
    if (aggregatorLeads && topHost) {
      reasoning.push(
        `${topHost.host} is the most-cited source here: ${topHost.citations} of ${citationTotal} citations (${hostShare}%), ahead of every business's own site.`,
      );
    }
    if (leaderIsNational && leaderRow) {
      reasoning.push(
        `The most-named business, ${leader.name}, is cited in ${leaderRow.otherTowns} other town${leaderRow.otherTowns === 1 ? "" : "s"} for this trade, so it is a national brand rather than a local firm.`,
      );
    }
    /* THE DISAGREEMENT, SPELLED OUT. Resolving it in favour of one signal would hide the read that
       matters: Loughborough looks fragmented and healthy on the naming alone. */
    if (aggregatorLeads && !leaderIsNational) {
      reasoning.push(
        `A local firm leads the naming (${leader.name}, ${leader.mentions} mentions) but a marketplace leads the sources - so getting a local business named competes with the platform, not with that firm.`,
      );
    }
    if (!aggregatorLeads && leaderIsNational && topHost) {
      reasoning.push(`The top cited host is ${topHost.host} (${topHost.citations} of ${citationTotal}).`);
    }
    return { kind: "marketplace_led", headline: "Marketplace-led \u00b7 probably skip this market", reasoning };
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

  // -- SHAPE 2: a beatable local firm leads. The one worth working.
  const reasoning = [
    `${leader.name} takes ${leader.mentions} mentions across ${leaderRow?.audits ?? 0} of ${audits} audits and is a local firm, not a national brand or a platform.`,
    "A local leader is beatable, and this is the comparison to sell with.",
  ];
  if (topHost) {
    reasoning.push(`The most-cited source is ${topHost.host} (${topHost.citations} of ${citationTotal}), a business's own site rather than a directory.`);
  }
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
    case "marketplace_led":
      market = topHost?.isAggregator
        ? `Skip this one. ${topHost.host} is the source AI trusts most for ${plural} in ${town}, so a local business is competing with a platform rather than with other ${plural}.`
        : `Skip this one. The business AI names most here, ${leader?.name ?? "the leader"}, is a national brand rather than a local firm, so a local business is competing with a chain.`;
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
      : prospects === 0
        ? `Nobody left to contact: of ${poolLine}, every one is already named by AI. The list can't be complete though - it is only what Places returned inside the town boundary.`
        : `${prospects} worth contacting: of ${poolLine}${chainLine}, ${prospects} ${prospects === 1 ? "either never shows up" : "either never show up"} in AI answers or barely ${prospects === 1 ? "does" : "do"}.${
        noWebsiteProspects > 0
          ? ` ${noWebsiteProspects} of them ${noWebsiteProspects === 1 ? "has" : "have"} no website, so ${noWebsiteProspects === 1 ? "it needs" : "they need"} a different opening - listed separately below.`
          : ""
      } Places may be missing firms, so treat it as a floor.`;

  return { market, contact };
}

/** How invisible one prospect is, in words. "never mentioned in 6 audits" reads to anybody;
 *  "0 mentions / 6 audits" needs decoding. Built from the row's own thin data, so it cannot
 *  disagree with the grading. */
export function invisibilityPhrase(row: MarketPoolRow, audits: number): string {
  if (!row.thin) return `never mentioned in ${audits} audit${audits === 1 ? "" : "s"}`;
  const { mentions, audits: inAudits } = row.thin;
  if (mentions === 1) return `mentioned once, in 1 of ${audits} audits`;
  return `mentioned ${mentions} times, in ${inAudits} of ${audits} audits`;
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
