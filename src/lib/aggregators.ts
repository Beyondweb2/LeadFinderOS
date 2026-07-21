// Aggregator / directory detection for the FRONTEND (own-site vs Yell-type listing).
//
// PORT of supabase/functions/_shared/aggregators.ts (isAggregatorUrl + its domain sets). Deno edge
// code can't be imported into the Vite app, so the domain lists are DUPLICATED here deliberately —
// keep them identical to the edge source so they don't drift. Only the isAggregatorUrl surface is
// ported (the SPA has no need for the booking-platform / social-canonicalisation helpers).
// Source of truth: supabase/functions/_shared/aggregators.ts.

/** Booking / scheduling platforms (salon/barber/trades + general). Mirror of the edge set. */
const BOOKING_PLATFORM_DOMAINS = new Set<string>([
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

/** Social + common directories that are also "not an own website". Mirror of the edge set. */
const SOCIAL_AND_DIRECTORY_DOMAINS = new Set<string>([
  "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com",
  "fb.com", "fb.me", "fb.watch", "m.me", "instagr.am",
  "linkedin.com", "youtube.com", "pinterest.com", "snapchat.com",
  "yell.com", "yell.co.uk", "yelp.com", "yelp.co.uk", "tripadvisor.com",
  "tripadvisor.co.uk", "google.com", "maps.google.com", "business.google.com",
]);

/** Directories, review sites, government records, and aggregator listings ABOUT a business but not
 *  its own website. Mirror of the edge set (DIRECTORY_AND_RECORD_DOMAINS). */
const DIRECTORY_AND_RECORD_DOMAINS = new Set<string>([
  "company-information.service.gov.uk", "companieshouse.gov.uk",
  "endole.co.uk", "companycheck.co.uk", "company-check.co.uk", "companieslist.co.uk",
  "opencorporates.com", "globaldatabase.com", "datanyze.com",
  "trustpilot.com", "trustpilot.co.uk", "reviews.io", "feefo.com",
  "checkatrade.com", "bark.com", "mybuilder.com", "ratedpeople.com",
  "trustatrader.com", "trustmark.org.uk", "which.co.uk",
  "thomsonlocal.com", "cylex.co.uk", "cylex-uk.co.uk", "scoot.co.uk",
  "freeindex.co.uk", "192.com", "hotfrog.co.uk", "hotfrog.com", "brownbook.net",
  "misterwhat.co.uk", "findopen.co.uk", "opendi.co.uk", "tupalo.net",
  "nextdoor.co.uk", "nextdoor.com", "bizify.co.uk", "uk.locanto",
  "thebestof.co.uk", "freeola.com",
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

/** True when the URL is a directory / booking platform / social listing — NOT a business's own
 *  website. Used to read how much AI leans on directory listings vs firms' own sites. */
export function isAggregatorUrl(url: string): boolean {
  const d = domainOf(url);
  return inSet(d, BOOKING_PLATFORM_DOMAINS)
    || inSet(d, SOCIAL_AND_DIRECTORY_DOMAINS)
    || inSet(d, DIRECTORY_AND_RECORD_DOMAINS);
}
