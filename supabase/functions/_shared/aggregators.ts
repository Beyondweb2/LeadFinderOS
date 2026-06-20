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
  "linkedin.com", "youtube.com", "pinterest.com", "snapchat.com",
  "yell.com", "yell.co.uk", "yelp.com", "yelp.co.uk", "tripadvisor.com",
  "tripadvisor.co.uk", "google.com", "maps.google.com", "business.google.com",
]);

/** Platform OWN social handles — a facebook.com/<handle> or instagram.com/<handle>
 *  whose handle is one of these is the PLATFORM's account, never the business's. */
const PLATFORM_SOCIAL_HANDLES = new Set<string>([
  "fresha", "booksy", "treatwell", "vagaro", "styleseat", "setmore",
  "gettimely", "timely", "squareup", "square", "schedulicity",
  "acuityscheduling", "ovatu", "simplybook", "mindbody", "calendly", "phorest",
]);

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
  return inSet(d, BOOKING_PLATFORM_DOMAINS) || inSet(d, SOCIAL_AND_DIRECTORY_DOMAINS);
}

/** True when a facebook.com / instagram.com URL points at a PLATFORM's own account
 *  (e.g. facebook.com/fresha) rather than the business — defensive social denylist. */
export function isPlatformSocialUrl(url: string): boolean {
  const d = domainOf(url);
  if (!/(?:^|\.)(?:facebook|instagram)\.com$/.test(d)) return false;
  try {
    const path = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).pathname;
    const handle = path.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
    return PLATFORM_SOCIAL_HANDLES.has(handle);
  } catch {
    return false;
  }
}
