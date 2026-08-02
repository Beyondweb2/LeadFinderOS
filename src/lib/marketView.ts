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
 *  "stamford". Measured on real data: clean markets sit at 4–9 distinct names per audit, junk ones
 *  at 30–970. 15 sits in the empty gap between them.
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
}

export interface MarketNamedRow {
  /** businessCore merge key. Stable across spellings; the join key against the pool. */
  key: string;
  name: string;
  /** Every spelling that folded into this one firm, so a wrong merge is visible, not hidden. */
  variants: string[];
  mentions: number;
  audits: number;
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
  /** Pool businesses that ARE already named — shown so the subtraction is auditable. */
  poolMatchedNamed: number;
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
