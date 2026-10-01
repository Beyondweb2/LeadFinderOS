/* ══ THE AGENCY CHECK, AS THE SCREENS USE IT (2026-10-01) ═════════════════════════════════════════
   One stored row per website domain (website_agency_checks, written by fn agency-check). This file is
   the one place that says which sites are checked, when a row is fresh, how a row reads in a table
   cell, which rows are "high-confidence agency" (flagged, sorted last, not pre-selected in Find Leads)
   and how the Find Leads site-management filter matches. Edge-safe (relative imports only). */
import { AGENCY_CACHE_DAYS, AGENCY_CHECK_VERSION, AGENCY_CLASS_LABEL, AGENCY_DEPRIORITISE_CONFIDENCE, AGENCY_FAILED_CACHE_DAYS, type AgencyClass } from './agencyDetect.ts';
import { registrableDomain } from './siteEvidence.ts';
import { isAggregatorUrl } from './aggregators.ts';

export interface AgencyCheckRow {
  domain: string;
  website: string;
  classification: AgencyClass;
  confidence: number;
  agency: string | null;
  agency_domain: string | null;
  evidence: string[];
  platform: string | null;
  status: 'ok' | 'failed';
  failure_reason: string | null;
  pages_checked: number;
  requests?: number;
  duration_ms?: number;
  version: number;
  checked_at: string;
}

/** The domain a website is checked (and cached) under — null when it is not the business's own site
 *  (a directory, a social profile, a link shortener) or not a usable address. */
export function agencyCheckDomain(website: string | null | undefined): string | null {
  const raw = String(website ?? '').trim();
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (isAggregatorUrl(url)) return null;
  const d = registrableDomain(url);
  return d && d.includes('.') ? d : null;
}

/** Is a stored check still good to show and reuse? Same rules version, inside its window. */
export function isCheckFresh(row: Pick<AgencyCheckRow, 'version' | 'checked_at' | 'status'>, nowMs: number): boolean {
  if (Number(row.version) !== AGENCY_CHECK_VERSION) return false;
  const days = row.status === 'failed' ? AGENCY_FAILED_CACHE_DAYS : AGENCY_CACHE_DAYS;
  const t = Date.parse(row.checked_at);
  return Number.isFinite(t) && nowMs - t < days * 86_400_000;
}

/** Agency likely, high confidence: the ones a salesperson should not be steered towards. */
export function isHighConfidenceAgency(row: Pick<AgencyCheckRow, 'classification' | 'confidence'> | null | undefined): boolean {
  return !!row && row.classification === 'agency_likely' && row.confidence >= AGENCY_DEPRIORITISE_CONFIDENCE;
}

/** The cell's words: "Agency likely · 92%", "No agency evidence · 78%", "Unknown". `short` (a phone row):
 *  "Agency · 92%", "No agency · 78%" — the confidence must never be the part that is cut off. */
export function agencyCellText(row: Pick<AgencyCheckRow, 'classification' | 'confidence'>, short = false): string {
  if (row.classification === 'unknown') return AGENCY_CLASS_LABEL.unknown;
  const words = short ? (row.classification === 'agency_likely' ? 'Agency' : 'No agency') : AGENCY_CLASS_LABEL[row.classification];
  return `${words} · ${row.confidence}%`;
}

/** The Find Leads site-management filter. 'all' shows everything; the rest match one state. */
export type SiteFilter = 'all' | 'no_evidence' | 'agency_likely' | 'unknown' | 'no_website';
export const SITE_FILTERS: { value: SiteFilter; label: string }[] = [
  { value: 'all', label: 'All sites' },
  { value: 'no_evidence', label: 'No agency evidence' },
  { value: 'agency_likely', label: 'Agency likely' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'no_website', label: 'No website' },
];
/** What one result is, for the filter: no own website; checked (its class); or not checked yet (null). */
export function siteStateOf(hasOwnWebsite: boolean, row: Pick<AgencyCheckRow, 'classification'> | null | undefined): Exclude<SiteFilter, 'all'> | null {
  if (!hasOwnWebsite) return 'no_website';
  return row ? row.classification : null;
}
/** Does a result pass the filter? A result still being checked shows only under All. */
export function passesSiteFilter(filter: SiteFilter, state: Exclude<SiteFilter, 'all'> | null): boolean {
  return filter === 'all' || state === filter;
}
