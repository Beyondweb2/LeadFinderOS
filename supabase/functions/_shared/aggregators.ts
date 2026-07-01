/**
 * Aggregator / booking-platform detection — shared by search-leads (website
 * classification) and enrich-business (crawl/social exclusion).
 *
 * A business's Maps "website" is often a BOOKING-PLATFORM page (Fresha, Booksy,
 * Treatwell, …) or a directory/social link — NOT their own site. Treating those as
 * the business's website is wrong: crawling them pulls the PLATFORM's socials +
 * marketing images, not the business's. So we never crawl them, never store them
 * as the business's website, and classify such leads as having no own website.
 */

/** Booking / scheduling platforms (salon/barber/trades + general). Extend freely. */
export const BOOKING_PLATFORM_DOMAINS = new Set<string>([
  "fresha.com", "fresha.me",
  "booksy.com",
  "treatwell.com", "treatwell.co.uk",
  "vagaro.com",
  "styleseat.com",
  "setmore.com",
  "gettimely.com", "timely.com",
  "squareup.com", "square.site",
  "schedulicity.com",
  "acuityscheduling.com",
  "ovatu.com",
  "simplybook.me",
  "mindbodyonline.com",
  "calendly.com",
  "phorest.com",
]);

/** Social + common directories that are also "not an own website". */
const SOCIAL_AND_DIRECTORY_DOMAINS = new Set<string>([
  "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com",
  // Short/alt social domains — a listing "website" of one of these is a social
  // link, NOT an own website (so the lead stays no-website for targeting).
  "fb.com", "fb.me", "fb.watch", "m.me", "instagr.am",
  "linkedin.com", "youtube.com", "pinterest.com", "snapchat.com",
  "yell.com", "yell.co.uk", "yelp.com", "yelp.co.uk", "tripadvisor.com",
  "tripadvisor.co.uk", "google.com", "maps.google.com", "business.google.com",
]);

/** Directories, review sites, GOVERNMENT RECORDS, and aggregator LISTINGS that are
 *  ABOUT a business but are NOT its own website (e.g. Companies House). Same
 *  treatment as booking platforms: never crawled, never stored/shown as their site;
 *  if the only "website" found is one of these → treat as NO own website. Subdomain
 *  matching (inSet endsWith) covers e.g. find-and-update.company-information.service.gov.uk. */
export const DIRECTORY_AND_RECORD_DOMAINS = new Set<string>([
  // UK government company register (Companies House) + variants/subdomains
  "company-information.service.gov.uk", "companieshouse.gov.uk",
  // Company-data / credit-record aggregators
  "endole.co.uk", "companycheck.co.uk", "company-check.co.uk", "companieslist.co.uk",
  "opencorporates.com", "globaldatabase.com", "datanyze.com",
  // Review sites
  "trustpilot.com", "trustpilot.co.uk", "reviews.io", "feefo.com",
  // Trades directories / lead marketplaces
  "checkatrade.com", "bark.com", "mybuilder.com", "ratedpeople.com",
  "trustatrader.com", "trustmark.org.uk", "which.co.uk",
  // General business directories
  "thomsonlocal.com", "cylex.co.uk", "cylex-uk.co.uk", "scoot.co.uk",
  "freeindex.co.uk", "192.com", "hotfrog.co.uk", "hotfrog.com", "brownbook.net",
  "misterwhat.co.uk", "findopen.co.uk", "opendi.co.uk", "tupalo.net",
  "nextdoor.co.uk", "nextdoor.com", "bizify.co.uk", "uk.locanto",
  "thebestof.co.uk", "freeola.com",
]);

/** Exact platform social handles (covers short/ambiguous tokens safely). */
const PLATFORM_SOCIAL_HANDLES = new Set<string>([
  "fresha", "booksy", "treatwell", "vagaro", "styleseat", "setmore",
  "gettimely", "timely", "squareup", "square", "schedulicity",
  "acuityscheduling", "ovatu", "simplybook", "mindbody", "calendly", "phorest",
]);

/** Distinctive platform tokens — matched as a SUBSTRING of the handle so variant
 *  accounts (facebook.com/freshabeauty, /fresha.salon, /booksyapp) are caught too.
 *  Excludes short/ambiguous tokens ("square", "timely") that could appear in a real
 *  business handle — those stay exact-match only. */
const PLATFORM_SOCIAL_TOKENS = [
  "fresha", "booksy", "treatwell", "vagaro", "styleseat", "schedulicity",
  "acuityscheduling", "simplybook", "phorest", "ovatu", "setmore", "gettimely",
  "calendly", "mindbody",
];

/** Lowercased registrable-ish domain (strip scheme, port, leading www.). */
export function domainOf(url: string): string {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function inSet(domain: string, set: Set<string>): boolean {
  if (!domain) return false;
  if (set.has(domain)) return true;
  for (const d of set) if (domain === d || domain.endsWith(`.${d}`)) return true;
  return false;
}

/** True when the URL is a booking platform. */
export function isBookingPlatformUrl(url: string): boolean {
  return inSet(domainOf(url), BOOKING_PLATFORM_DOMAINS);
}

/** True when the URL is NOT a business's own website (booking platform, social, or
 *  directory) — so it must not be crawled or stored as the business's website. */
export function isAggregatorUrl(url: string): boolean {
  const d = domainOf(url);
  return inSet(d, BOOKING_PLATFORM_DOMAINS)
    || inSet(d, SOCIAL_AND_DIRECTORY_DOMAINS)
    || inSet(d, DIRECTORY_AND_RECORD_DOMAINS);
}

/** True when a facebook.com / instagram.com URL points at a PLATFORM's own account
 *  (e.g. facebook.com/fresha) rather than the business — defensive social denylist. */
export function isPlatformSocialUrl(url: string): boolean {
  const d = domainOf(url);
  if (!/(?:^|\.)(?:facebook|instagram)\.com$/.test(d)) return false;
  try {
    const path = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).pathname;
    const handle = path.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
    if (!handle) return false;
    // Exact match (covers short/ambiguous tokens), OR the handle CONTAINS a
    // distinctive platform token (catches variants like freshabeauty / fresha.salon).
    if (PLATFORM_SOCIAL_HANDLES.has(handle)) return true;
    return PLATFORM_SOCIAL_TOKENS.some((t) => handle.includes(t));
  } catch {
    return false;
  }
}

/** First path-segment handle of a facebook.com / instagram.com URL, lowercased
 *  (e.g. "facebook.com/GFM.Barbers" → "gfm.barbers"; "/pages/Name/123" → "name").
 *  Empty when it isn't a FB/IG URL or has no handle. */
export function socialHandle(url: string): string {
  const d = domainOf(url);
  if (!/(?:^|\.)(?:facebook|instagram)\.com$/.test(d)) return "";
  try {
    const segs = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).pathname
      .split("/").filter(Boolean);
    let h = segs[0]?.toLowerCase() ?? "";
    if (h === "pages" && segs[1]) h = segs[1].toLowerCase(); // facebook.com/pages/Name/123
    return h.replace(/^@/, "");
  } catch {
    return "";
  }
}

/** Reduce a facebook.com / instagram.com URL to its PAGE ROOT so deep links don't
 *  break the page/photo scrapers (which expect a page, not a /reels/ or /posts/ view):
 *    facebook.com/MrMGCB/reels/         → https://www.facebook.com/MrMGCB
 *    facebook.com/MrMGCB/posts/123      → https://www.facebook.com/MrMGCB
 *    facebook.com/pages/Magic/123/about → https://www.facebook.com/pages/Magic/123
 *    facebook.com/profile.php?id=99/x   → https://www.facebook.com/profile.php?id=99
 *  Handle CASE is preserved (FB handles are case-insensitive but nicer kept as-is).
 *  Non-FB/IG URLs, and handle-less (bare-domain) URLs, are returned unchanged. */
export function canonicalSocialUrl(url: string): string {
  if (!url) return url;
  const d = domainOf(url);
  const isFb = /(?:^|\.)facebook\.com$/.test(d);
  const isIg = /(?:^|\.)instagram\.com$/.test(d);
  if (!isFb && !isIg) return url;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const segs = u.pathname.split("/").filter(Boolean);
    const host = isFb ? "www.facebook.com" : "www.instagram.com";
    const first = segs[0]?.toLowerCase() ?? "";
    if (!first) return url; // bare domain, no handle → leave as-is
    // Numeric profile links: the ?id=… IS the identity, so keep it.
    if (isFb && first === "profile.php") {
      const id = u.searchParams.get("id");
      return id ? `https://${host}/profile.php?id=${id}` : url;
    }
    // facebook.com/pages/Name/123 → keep both the Name and the numeric id.
    if (isFb && first === "pages" && segs[1] && segs[2]) {
      return `https://${host}/pages/${segs[1]}/${segs[2]}`;
    }
    return `https://${host}/${segs[0].replace(/^@/, "")}`;
  } catch {
    return url;
  }
}

// Website BUILDERS / hosts whose OWN social account gets linked in their site
// TEMPLATE (a Wix-built barber site's footer links facebook.com/wix). These are
// NEVER the business's real social, so a social DISCOVERED BY CRAWLING the site
// must be rejected when its handle is one of these.
const SITE_BUILDER_SOCIAL_HANDLES = new Set<string>([
  "wix", "wixcom", "wixsite", "wixcommunity",
  "squarespace", "godaddy", "shopify", "weebly",
  "wordpress", "wordpressdotcom", "wordpresscom",
  "site123", "jimdo", "webador", "strikingly", "carrd", "duda", "yola", "webflow",
]);
const SITE_BUILDER_TOKENS = ["wix", "squarespace", "godaddy", "shopify", "weebly", "wordpress", "webflow", "jimdo", "strikingly"];

/** True when a FB/IG URL points at a website-builder's own account (facebook.com/wix). */
export function isSiteBuilderSocialUrl(url: string): boolean {
  const h = socialHandle(url);
  if (!h) return false;
  if (SITE_BUILDER_SOCIAL_HANDLES.has(h)) return true;
  return SITE_BUILDER_TOKENS.some((t) => h.includes(t)); // catches wixsite / wix.salon etc.
}

/** A FB/IG URL that came from a Google Maps LISTING is the business's own social —
 *  TRUSTED WITHOUT a name-match, because Google already tied it to THIS business pin
 *  (so opaque handles like facebook.com/MrMGCB for "Magic Hands Barber" are fine). We
 *  still reject a PLATFORM's own account (facebook.com/fresha) and a website-BUILDER's
 *  account (facebook.com/wix) — those get linked but are never the business's. The
 *  strict name-gate still applies to website-crawl + web-results, which mix companies. */
export function isUsableMapsListingSocial(url: string): boolean {
  if (!url) return false;
  const d = domainOf(url);
  if (!/(?:^|\.)(?:facebook|instagram)\.com$/.test(d)) return false;
  return !isPlatformSocialUrl(url) && !isSiteBuilderSocialUrl(url);
}
