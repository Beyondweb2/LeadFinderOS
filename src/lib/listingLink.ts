/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DOES THE GOOGLE LISTING LINK TO THE SITE WE CHECKED? (Paul, 2026-10-23, website-check rules)

   Read from data we already hold: Google's own record of the business (phone_cache, written by
   google-place-details) against the site the crawl read. No paid call. The one network request is a
   plain follow of the listing's link when its domain differs (an old domain that forwards to the new
   site is NOT a wrong link), done by the caller (_shared/listing-website.ts).

   ⛔ ABSENT IS NOT AN ISSUE. No place id, no Google record, a record from before the website was kept,
      or a link we could not follow → null (not judged). Only a record that says "no website", or a link
      that lands somewhere else, is an issue.
   Pure and edge-reachable: relative imports with .ts, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { registrableDomain } from './siteEvidence.ts';

export type ListingVerdict = 'links' | 'no_link' | 'other_site';

/** google-place-details' cache shape that records the website field. A v1 row (before 2026-07-30) has website NULL on
 *  every row (865 of 865 on 2026-10-23) because it was never asked for, so a v1 "no website" means nothing. */
export const LISTING_WEBSITE_SINCE_VERSION = 2;
/** A listing can be fixed after we read it: an older record is not judged. */
export const LISTING_RECORD_FRESH_DAYS = 90;

/** May this phone_cache row be judged at all? */
export function listingRecordUsable(row: { details_version?: number | null; created_at?: string | null } | null | undefined, nowMs: number): boolean {
  if (!row || !(Number(row.details_version) >= LISTING_WEBSITE_SINCE_VERSION)) return false;
  const at = Date.parse(String(row.created_at ?? ''));
  return Number.isFinite(at) && nowMs - at <= LISTING_RECORD_FRESH_DAYS * 86_400_000;
}

/** A listing "website" that is a social profile or a directory page, never a site of the business's own. */
const NOT_OWN_SITE = /(?:^|\.)(?:facebook\.com|fb\.com|fb\.me|m\.me|instagram\.com|instagr\.am|linkedin\.com|x\.com|twitter\.com|tiktok\.com|youtube\.com|linktr\.ee|yell\.com|checkatrade\.com|trustatrader\.com|mybuilder\.com|bark\.com|ratedpeople\.com|nextdoor\.co\.uk|nextdoor\.com|business\.site|google\.com)$/i;

const domainOf = (u: string | null | undefined): string | null => {
  const s = String(u ?? '').trim();
  if (!s) return null;
  return registrableDomain(/^https?:\/\//i.test(s) ? s : `https://${s}`);
};

/** Is this listing link a social profile / directory page rather than a website of the business's own? */
export function isNotOwnSite(url: string | null | undefined): boolean {
  const s = String(url ?? '').trim();
  if (!s) return false;
  try { return NOT_OWN_SITE.test(new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname); } catch { return false; }
}

/** Does the listing link need following before it can be judged (a different domain that is not a social / directory page)? */
export function listingNeedsFollow(listingWebsite: string | null, checkedUrl: string): boolean {
  const l = domainOf(listingWebsite), c = domainOf(checkedUrl);
  return !!l && !!c && l !== c && !isNotOwnSite(listingWebsite);
}

/**
 * The verdict, or null when it cannot be judged.
 * @param known     Google's record of the business was read AND it records the website field (null website = it has none).
 * @param landedUrl Where the listing's link ended up after redirects; undefined = not followed, null = following it failed.
 */
export function listingLinkVerdict(i: { known: boolean; listingWebsite: string | null; checkedUrl: string; landedUrl?: string | null }): ListingVerdict | null {
  if (!i.known) return null;
  const c = domainOf(i.checkedUrl);
  if (!c) return null;
  const site = String(i.listingWebsite ?? '').trim();
  if (!site) return 'no_link';
  if (domainOf(site) === c) return 'links';
  if (isNotOwnSite(site)) return 'no_link';
  if (i.landedUrl === undefined || i.landedUrl === null) return null;
  const landed = domainOf(i.landedUrl);
  if (landed === c) return 'links';
  return isNotOwnSite(i.landedUrl) ? 'no_link' : 'other_site';
}
