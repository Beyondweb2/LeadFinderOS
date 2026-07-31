/* RELATIVE path with an explicit .ts extension, NOT the "@/" alias. This file is imported by
   supabase/functions/check-directory-listings, and Deno cannot resolve the Vite alias — there is no
   deno.json in this repo. Same convention as auditReport.ts, which process-ai-audit-queue imports. */
import { factFor, type Actor } from './directoryFacts.ts';

/* ============================================================
   HOSTNAME MATCHING AND GATING — shared by the edge function and the SPA.

   Deliberately dependency-light: directoryFacts only. It is imported by
   supabase/functions/check-directory-listings, so it must not pull in anything browser-only.

   ── WHY THE MATCHER IS WRITTEN THE WAY IT IS ──────────────────────────────────────────────────
   NEVER string.includes(). Two days have been lost in this codebase to exactly that:
     • "bing"  matched  plum·BING·          (99 false hits across the citation hosts)
     • "acca"  matched  ACCA·ce.co.uk  and  M·acca·-Gas
   A substring test also cannot tell "yell.com" from "notyell.com" or, worse, from
   "yell.com.evil.net" — a domain an attacker can register. So: parse the URL properly, take the
   hostname, strip ONE leading "www.", then accept only an exact match or a suffix match with a
   preceding dot. "business.yell.com" matches; "notyell.com" and "yell.com.evil.net" do not.
   ============================================================ */

/** Operator-facing gating status. Derived ONLY from directoryFacts — the single hand-maintained
 *  source. Never inferred per trade, never defaulted to self-serve. */
export type Gating = 'self-serve' | 'client-gated' | 'unclassified';

export interface HostGating {
  host: string;
  gating: Gating;
  /** The raw actor from directoryFacts, kept so the three-label rendering loses no information:
   *  'operator-start' means we can submit but the business must confirm ownership, which is a real
   *  distinction the three labels alone cannot carry. Null when the host has no entry. */
  actor: Actor | null;
  /** Display label, hand-mapped so the UI cannot drift from the stored value. */
  label: string;
}

/**
 * Gating for one host, from the existing classification.
 *
 * 'operator'       → SELF-SERVE   (start to finish, ours)
 * 'operator-start' → SELF-SERVE   (we can submit; the business confirms ownership — carried in
 *                                  `actor` and shown as a qualifier, not flattened away)
 * 'client-only'    → CLIENT-GATED (paid and/or identity-vetted; NOT FOUND here is not our job)
 * no entry         → UNCLASSIFIED (said plainly; never assumed actionable)
 */
export function gatingFor(host: string): HostGating {
  const f = factFor(host);
  if (!f) return { host, gating: 'unclassified', actor: null, label: 'UNCLASSIFIED' };
  if (f.actor === 'client-only') return { host, gating: 'client-gated', actor: f.actor, label: 'CLIENT-GATED' };
  return {
    host,
    gating: 'self-serve',
    actor: f.actor,
    label: f.actor === 'operator-start' ? 'SELF-SERVE · client confirms' : 'SELF-SERVE',
  };
}

/** Hostname from a URL, lowercased, with ONE leading "www." removed. Null when unparseable —
 *  a result we cannot parse is never silently treated as a match. */
export function hostnameOf(rawUrl: string): string | null {
  const s = (rawUrl ?? '').trim();
  if (!s) return null;
  try {
    // Tolerate protocol-relative and bare-host inputs; the actor normally returns absolute URLs.
    const withScheme = /^https?:\/\//i.test(s) ? s : s.startsWith('//') ? `https:${s}` : `https://${s}`;
    const h = new URL(withScheme).hostname.toLowerCase();
    return h.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Does `resultHost` belong to `targetHost`?
 *
 * Exact match, or a subdomain — which requires the dot to be part of the match, so a host that
 * merely ENDS with the target string ("notyell.com") and a host that merely CONTAINS it as a
 * left-hand label ("yell.com.evil.net") are both rejected.
 */
export function hostMatches(resultHost: string, targetHost: string): boolean {
  const r = (resultHost ?? '').trim().toLowerCase().replace(/^www\./, '');
  const t = (targetHost ?? '').trim().toLowerCase().replace(/^www\./, '');
  if (!r || !t) return false;
  if (r === t) return true;
  return r.endsWith(`.${t}`);
}

/** Convenience: does this URL belong to this host? */
export function urlMatchesHost(url: string, targetHost: string): boolean {
  const h = hostnameOf(url);
  return h ? hostMatches(h, targetHost) : false;
}

/* ── STORED SHAPES ───────────────────────────────────────────────────────────────────────────────
   Mirrors the live lead_directory_checks columns, read from PostgREST rather than assumed. */

export interface DirectoryFoundRow { host: string; url: string; title: string | null }
export interface DirectoryNotFoundRow { host: string }
/** What goes in hosts_checked: the host plus its gating, so the status is STORED and not only drawn. */
export interface DirectoryHostRow { host: string; gating: Gating; actor: Actor | null }

/** status values this feature writes. Distinct states, never collapsed into one failure. */
export type DirectoryCheckStatus = 'ok' | 'no_results' | 'refused_cap' | 'error';

export interface DirectoryCheck {
  id: string;
  lead_id: string;
  trade: string | null;
  town: string | null;
  status: DirectoryCheckStatus;
  queries_run: string[];
  hosts_checked: DirectoryHostRow[];
  found: DirectoryFoundRow[];
  not_found: DirectoryNotFoundRow[];
  cost_estimate_usd: number | null;
  error: string | null;
  checked_at: string | null;
  created_at: string;
}

/** What the fold needs from a stored check: what was found, and what was looked at. */
export interface DirectoryCheckFold {
  /** host (lowercased) → the listing we found. Drives ALREADY LISTED suppression. */
  found: Map<string, DirectoryFoundRow>;
  /** Every host the check actually tested, lowercased. Lets the fold PROMOTE an unclassified host
   *  into a visible row: before a check it is only "who keeps getting named" intelligence; once we
   *  have searched for it, we know something about it and it deserves a line. */
  checked: Set<string>;
}

/** Build the fold input from a stored check. Only an 'ok' check counts: a refused, errored or empty
 *  search proves nothing, and suppressing work on the strength of a failed search would hide real
 *  jobs — so everything else yields an empty fold and the playbook behaves exactly as before. */
export function directoryCheckFold(check: DirectoryCheck | null | undefined): DirectoryCheckFold {
  const found = new Map<string, DirectoryFoundRow>();
  const checked = new Set<string>();
  if (!check || check.status !== 'ok') return { found, checked };
  for (const h of check.hosts_checked ?? []) {
    if (h?.host) checked.add(h.host.toLowerCase());
  }
  for (const f of check.found ?? []) {
    if (f?.host) found.set(f.host.toLowerCase(), f);
  }
  return { found, checked };
}
