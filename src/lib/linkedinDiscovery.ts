/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LINKEDIN DECISION-MAKER DISCOVERY — THE CONTRACT (2026-09-30).

   The isolated module the Social Enrichment work plugs into later (docs/linkedin-decision-maker.md has
   the integration note). It answers ONE question per lead: who most likely runs this business, and
   what is their public LinkedIn profile — with how sure we are and why.

     BUSINESS LEAD → identify the person (decisionMaker.ts, free sources first)
                   → free LinkedIn evidence (a profile linked from their own site, one already held)
                   → only then, if still needed, ONE paid public search per person (linkedinProviders.ts)
                   → score every profile (linkedinMatch.ts) → one clear match, a review list, or nothing
                   → a salesperson opens it and contacts them BY HAND.

   ⛔ DISCOVERY ONLY. Nothing here signs in to LinkedIn, holds a LinkedIn cookie or session, views a
      profile as a user, connects, follows, messages or touches Sales Navigator. The only credential is
      APIFY_TOKEN, server-side.
   ⛔ UNVERIFIED NEVER BECOMES CANONICAL. `canonical_candidate` is set only for a single CONFIRMED or a
      single LIKELY; a person's Confirm is what promotes anything else (the Enrichment branch's table
      already encodes that rule — this module only proposes).
   ⛔ OPENING A VIEW NEVER SPENDS (CLAUDE.md §6): the edge function's `peek` mode reads the cache only.

   Pure — no network, no Supabase. Imported by the edge service: relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { DecisionMakerCandidate, DecisionRole, PersonEvidence } from './decisionMaker.ts';
import {
  canonicalLinkedInUrl, manualLinkedInSearchLinks, nameMatch,
  type DiscoveryCountry, type MatchConfidence, type ScoredProfile,
} from './linkedinMatch.ts';

export const LINKEDIN_DISCOVERY_VERSION = 1;

/* ── Limits (named, never written as numbers in prose — CLAUDE.md §4) ───────────────────────────── */

/** A found / review answer is reused this long: people change jobs slowly and a re-search costs. */
export const CACHE_FOUND_MS = 90 * 86_400_000;
/** "No person named" / "no profile found" is reused this long — a site rewrite or a new director is
 *  the only thing that changes it, and the input fingerprint catches a manually entered person. */
export const CACHE_EMPTY_MS = 30 * 86_400_000;
/** A provider error may be retried after this. */
export const CACHE_ERROR_MS = 60 * 60_000;
/** A `running` row older than this is a crashed run, not a live one. */
export const RUNNING_STALE_MS = 5 * 60_000;
/** Paid searches per run: the top people only. Two directors of a small company is common; five is a
 *  list for a human, not a search budget. */
export const MAX_SEARCHES_PER_RUN = 2;
/** Fresh (spending) runs one SALESPERSON may start per rolling 24 h. The admin is not counted. */
export const SALES_RUNS_PER_DAY = 20;
/** Every LinkedIn discovery, all users, per rolling 24 h, in USD (real cost where Apify reported it). */
export const DAILY_SPEND_CAP_USD = 1.0;
/** Refuse to spend when the Apify ACCOUNT is this full — the audits share the same monthly cap and
 *  must never be starved by a sales convenience. Stricter than the guard's own apify_warn_pct. */
export const APIFY_ACCOUNT_REFUSE_PCT = 0.75;
/** The account snapshot must be at least this fresh to be believed (it refreshes every 15 min). */
export const APIFY_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60_000;

/* ── The result shape ───────────────────────────────────────────────────────────────────────────── */

export type DiscoveryStatus =
  | 'held'       // a person already confirmed / pasted a profile — nothing was searched
  | 'found'      // at least one person has a single CONFIRMED or LIKELY profile
  | 'review'     // profiles were found but a human must choose
  | 'no_person'  // nobody could be identified as the decision maker — nothing was searched
  | 'not_found'  // a person was identified, no LinkedIn profile carried their name
  | 'error';     // the provider failed; retry after CACHE_ERROR_MS

export interface PersonLinkedIn {
  status: 'match' | 'review' | 'none' | 'not_searched';
  /** Set only when status = 'match'. */
  linkedin_url: string | null;
  confidence: MatchConfidence | null;
  confidence_reasons: string[];
  cautions: string[];
  /** Everything a human may want to look at (the match's alternatives, or the review list). */
  candidates: ScoredProfile[];
  /** Why not searched / why none. */
  note: string | null;
}

export interface DecisionMakerResult {
  person_name: string;
  person_partial: boolean;
  role: DecisionRole | null;
  role_label: string | null;
  /** Where the person was identified. Every entry has the quote and the URL. */
  person_evidence: PersonEvidence[];
  linkedin: PersonLinkedIn;
  /** For the salesperson to search by hand when nothing was found. */
  manual_search: { linkedin: string; google: string };
}

export interface LinkedInDiscoveryResult {
  version: number;
  lead_id: string;
  status: DiscoveryStatus;
  /** Did this answer come from the cache, from data we already held, or from a fresh run? */
  served_from: 'fresh' | 'cache' | 'held';
  people: DecisionMakerResult[];
  /** The single profile the Enrichment branch MAY make canonical without a human (single CONFIRMED,
   *  else single LIKELY, across all people). null whenever a human must choose. */
  canonical_candidate: { person_name: string; role_label: string | null; linkedin_url: string; confidence: MatchConfidence } | null;
  company_name: string;
  company_linkedin_url: string | null;
  company_linkedin_confidence: MatchConfidence | null;
  location: { town: string | null; country: DiscoveryCountry | null };
  /** Sources checked before any spend, for the "how do we know" line. */
  sources_checked: string[];
  checked_at: string;
  provider: string | null;
  provider_calls: number;
  /** Real USD where Apify reported it, else the estimate (then `provider_cost_is_estimate`). */
  provider_cost_usd: number;
  provider_cost_is_estimate: boolean;
  /** For the business when no person is known. */
  manual_search: { linkedin: string; google: string };
  error?: string | null;
}

/* ── What we already hold ───────────────────────────────────────────────────────────────────────── */

export interface HeldLinkedIn {
  url: string;
  kind: 'person' | 'company';
  /** A person pasted it or pressed Confirm. */
  humanConfirmed: boolean;
  rejected: boolean;
  personName?: string | null;
}

/* ── The cache / spend decision ─────────────────────────────────────────────────────────────────── */

export interface PriorRun {
  id: string;
  status: DiscoveryStatus | 'running';
  input_fingerprint: string;
  created_at: string;
  expires_at: string | null;
  result: LinkedInDiscoveryResult | null;
}

export type DiscoveryPlan =
  | { action: 'return_held'; held: HeldLinkedIn[] }
  | { action: 'return_cached'; run: PriorRun }
  | { action: 'in_progress'; run: PriorRun }
  | { action: 'nothing_cached' }  // peek mode, no usable run
  | { action: 'run' };

/** The newest run decides. ⛔ Order is structural: held → running → fresh cache → run. `force` (admin
 *  only, enforced by the caller) skips the cache but never a held human-confirmed profile. */
export function planDiscovery(args: {
  held: HeldLinkedIn[];
  latestRun: PriorRun | null;
  fingerprint: string;
  now: number;
  mode: 'peek' | 'run';
  force?: boolean;
}): DiscoveryPlan {
  const heldPeople = args.held.filter((h) => h.kind === 'person' && h.humanConfirmed && !h.rejected);
  if (heldPeople.length) return { action: 'return_held', held: heldPeople };
  const r = args.latestRun;
  if (r && r.status === 'running' && args.now - Date.parse(r.created_at) < RUNNING_STALE_MS) return { action: 'in_progress', run: r };
  const fresh = !!r && r.status !== 'running' && !!r.result && !!r.expires_at && Date.parse(r.expires_at) > args.now;
  if (fresh && (args.mode === 'peek' || (!args.force && r!.input_fingerprint === args.fingerprint))) return { action: 'return_cached', run: r! };
  if (args.mode === 'peek') return { action: 'nothing_cached' };
  return { action: 'run' };
}

export function cacheTtlMs(status: DiscoveryStatus): number {
  if (status === 'found' || status === 'review' || status === 'held') return CACHE_FOUND_MS;
  if (status === 'no_person' || status === 'not_found') return CACHE_EMPTY_MS;
  return CACHE_ERROR_MS;
}

/** What the answer depends on. Change any of it (a salesperson types the owner's name, the website
 *  changes) and the cache no longer applies. Stable ordering; lowercased. */
export function inputFingerprint(input: { businessName: string; website: string | null; town: string | null; country: string | null; manualPerson?: string | null; contactName?: string | null }): string {
  return [
    `v${LINKEDIN_DISCOVERY_VERSION}`,
    input.businessName, input.website ?? '', input.town ?? '', input.country ?? '',
    input.manualPerson ?? '', input.contactName ?? '',
  ].map((s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ')).join('|');
}

/* ── Spend gate (pure part) ─────────────────────────────────────────────────────────────────────── */

export type SpendRefusal =
  | 'apify_account_unknown' | 'apify_account_near_cap' | 'daily_spend_cap' | 'sales_daily_runs' | 'ledger_unreadable';

/** ⛔ FAILS CLOSED: an unreadable ledger or a missing / stale account snapshot refuses. */
export function spendGate(args: {
  now: number;
  role: 'admin' | 'sales';
  apifySnapshot: { captured_at: string; monthly_usage_usd: number | null; max_monthly_usage_usd: number | null } | null;
  spentLast24hUsd: number | null;
  userRunsLast24h: number | null;
  estimateUsd: number;
}): { ok: true } | { ok: false; reason: SpendRefusal } {
  if (args.spentLast24hUsd === null || (args.role === 'sales' && args.userRunsLast24h === null)) return { ok: false, reason: 'ledger_unreadable' };
  const s = args.apifySnapshot;
  const used = s?.monthly_usage_usd;
  const cap = s?.max_monthly_usage_usd;
  if (!s || typeof used !== 'number' || typeof cap !== 'number' || cap <= 0 || args.now - Date.parse(s.captured_at) > APIFY_SNAPSHOT_MAX_AGE_MS) {
    return { ok: false, reason: 'apify_account_unknown' };
  }
  if (used / cap >= APIFY_ACCOUNT_REFUSE_PCT) return { ok: false, reason: 'apify_account_near_cap' };
  if (args.spentLast24hUsd + args.estimateUsd > DAILY_SPEND_CAP_USD) return { ok: false, reason: 'daily_spend_cap' };
  if (args.role === 'sales' && (args.userRunsLast24h ?? 0) >= SALES_RUNS_PER_DAY) return { ok: false, reason: 'sales_daily_runs' };
  return { ok: true };
}

/** What a salesperson reads. ⛔ Never a cost or a provider (docs/abuse-cost-protection.md). */
export function spendRefusalText(reason: SpendRefusal, role: 'admin' | 'sales'): string {
  if (role === 'sales') {
    return reason === 'sales_daily_runs'
      ? 'You have used today’s LinkedIn lookups. Try again tomorrow, or search LinkedIn yourself with the link below.'
      : 'LinkedIn lookup is paused right now — search LinkedIn yourself with the link below.';
  }
  switch (reason) {
    case 'apify_account_near_cap': return 'Apify account is close to its monthly cap — LinkedIn lookups are held so the audits keep running.';
    case 'apify_account_unknown': return 'Apify account usage has not been read recently — refusing to spend blind.';
    case 'daily_spend_cap': return 'Today’s LinkedIn lookup budget is used up.';
    case 'ledger_unreadable': return 'Could not read the LinkedIn lookup ledger — refusing to spend.';
    default: return 'LinkedIn lookup refused.';
  }
}

/* ── Free LinkedIn evidence: a profile linked from their own website ───────────────────────────── */

/** "sarah-jones-4b2a1b9" → "sarah jones". Trailing id segments (digits / hex) are dropped. */
export function nameFromSlug(slug: string): string {
  const parts = decodeURIComponent(slug || '').toLowerCase().split(/[-_]+/).filter(Boolean);
  while (parts.length > 1 && /\d/.test(parts[parts.length - 1])) parts.pop();
  return parts.filter((p) => /^[a-z'’]+$/.test(p)).join(' ');
}

/** Split the links a business's own site carries into personal profiles and company pages. */
export function splitSiteLinkedIn(links: string[]): { people: string[]; companies: string[] } {
  const people = new Set<string>();
  const companies = new Set<string>();
  for (const l of links) {
    const c = canonicalLinkedInUrl(l);
    if (!c) continue;
    (c.kind === 'person' ? people : companies).add(c.url);
  }
  return { people: [...people], companies: [...companies] };
}

/** Which site-linked personal profile belongs to this person (by the name in its slug)? */
export function siteProfileFor(personName: string, partial: boolean, sitePeople: string[]): string | null {
  const hits = sitePeople.filter((u) => {
    const slug = canonicalLinkedInUrl(u)?.slug ?? '';
    const m = nameMatch(personName, nameFromSlug(slug), partial);
    return m === 'exact' || m === 'short_form';
  });
  return hits.length === 1 ? hits[0] : null;
}

/* ── Assembly ───────────────────────────────────────────────────────────────────────────────────── */

export function personResult(p: DecisionMakerCandidate, linkedin: PersonLinkedIn, businessName: string, town: string | null): DecisionMakerResult {
  return {
    person_name: p.name, person_partial: p.partial, role: p.role, role_label: p.roleLabel,
    person_evidence: p.evidence, linkedin,
    manual_search: manualLinkedInSearchLinks({ personName: p.name, businessName, town }),
  };
}

/** The overall status and the one profile the Enrichment branch may adopt without a human. */
export function summarise(people: DecisionMakerResult[], identified: boolean): { status: DiscoveryStatus; canonical: LinkedInDiscoveryResult['canonical_candidate'] } {
  if (!identified || !people.length) return { status: 'no_person', canonical: null };
  const matches = people.filter((p) => p.linkedin.status === 'match' && p.linkedin.linkedin_url);
  const confirmed = matches.filter((p) => p.linkedin.confidence === 'confirmed');
  const likely = matches.filter((p) => p.linkedin.confidence === 'likely');
  const pick = confirmed.length === 1 ? confirmed[0] : confirmed.length === 0 && likely.length === 1 ? likely[0] : null;
  const canonical = pick
    ? { person_name: pick.person_name, role_label: pick.role_label, linkedin_url: pick.linkedin.linkedin_url!, confidence: pick.linkedin.confidence! }
    : null;
  if (matches.length) return { status: 'found', canonical };
  if (people.some((p) => p.linkedin.status === 'review')) return { status: 'review', canonical: null };
  return { status: 'not_found', canonical: null };
}
