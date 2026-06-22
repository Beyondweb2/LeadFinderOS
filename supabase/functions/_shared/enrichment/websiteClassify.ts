// Shared own-website classifier.
//
// Given the signals we have for a business (a manually-entered website, the Maps
// listing's own website pin, and the Google "web results" links), decide whether
// the business has a REAL OWN website — carefully, without ever mistaking a social
// page, directory, gov record, or booking platform for their site.
//
// Layered rule (agreed):
//   • Exclude hard: social / aggregator / directory / gov / booking (aggregators.ts).
//   • A URL is theirs (HAS_OWN_WEBSITE) when EITHER the business name appears in the
//     domain (name-match BOOSTER) OR the result text location-matches the lead.
//   • Any other non-excluded candidate → UNCERTAIN ("possible website, verify"),
//     with the URL surfaced — never silently called HAS, never silently NO.
//   • No non-excluded candidate → NO_WEBSITE.
// Name-match is a booster, NOT a requirement: a differently-named real site still
// passes via location-match, or lands in UNCERTAIN for the operator to verify.

import { isAggregatorUrl, isPlatformSocialUrl } from "../aggregators.ts";

export type OwnWebsiteStatus = "HAS_OWN_WEBSITE" | "UNCERTAIN" | "NO_WEBSITE";

export interface WebsiteVerdict {
  status: OwnWebsiteStatus;
  /** The confirmed own-website (HAS only). */
  website: string | null;
  /** A possible-but-unconfirmed site to verify (UNCERTAIN only). */
  candidate: string | null;
  /** What clinched it: 'manual' | 'maps' | 'name' | 'location' | null. */
  signal: string | null;
  reason: string;
}

interface PlaceLike {
  city?: string | null;
  postalCode?: string | null;
  address?: string | null;
}

function rootDomain(u: string): string {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).origin;
  } catch {
    return u;
  }
}

function hostname(u: string): string {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// UK postcode outward code (e.g. "B12 9AA" → "b12") for the location guard.
function postcodeOutward(pc: string): string | null {
  const m = (pc || "").trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return m ? m[1].toLowerCase() : null;
}

// A web-result is trusted as the business's only if its own text (title/snippet/
// url) contains the lead's city / postcode-outward / a town from its address.
function locationMatch(candidateText: string, place: PlaceLike | null): string | null {
  const t = (candidateText || "").toLowerCase();
  if (!t || !place) return null;
  const needles: string[] = [];
  if (place.city) needles.push(place.city.toLowerCase().trim());
  const pcOut = postcodeOutward(place.postalCode ?? "");
  if (pcOut) needles.push(pcOut);
  if (place.address) {
    for (const part of place.address.split(",").map((s) => s.trim().toLowerCase())) {
      if (part.length > 2 && !/^\d/.test(part)) needles.push(part);
    }
  }
  for (const n of needles) {
    if (n.length > 2 && t.includes(n)) return n;
  }
  return null;
}

// Generic words that don't identify a specific business, so they don't count as a
// name→domain match (avoids "barber" in any barber's domain triggering a match).
const NAME_STOPWORDS = new Set([
  "the", "and", "for", "ltd", "limited", "co", "company", "inc", "llc", "plc",
  "services", "service", "shop", "store", "studio", "salon", "barber", "barbers",
  "barbershop", "hair", "hairdresser", "hairdressers", "beauty", "mobile", "uk", "gb",
  "turkish", "gents", "unisex", "mens", "ladies",
]);

const TLD_LABELS = new Set([
  "com", "co", "uk", "net", "org", "io", "biz", "info", "shop", "site", "online",
  "gb", "eu", "me", "store", "agency", "studio",
]);

/** Significant, business-identifying tokens from the name (len ≥ 3, not stopwords). */
function nameTokens(businessName: string): string[] {
  return (businessName || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !NAME_STOPWORDS.has(w));
}

/** The registrable brand label of a domain, alnum-collapsed (drops www + TLDs). */
function domainBrand(url: string): string {
  const host = hostname(url);
  if (!host) return "";
  const labels = host.split(".");
  while (labels.length > 1 && TLD_LABELS.has(labels[labels.length - 1])) labels.pop();
  return (labels[labels.length - 1] || "").replace(/[^a-z0-9]/g, "");
}

/** True if any significant name token appears in the domain's brand label. */
function domainMatchesName(url: string, businessName: string): boolean {
  const brand = domainBrand(url);
  if (!brand) return false;
  return nameTokens(businessName).some((tok) => brand.includes(tok));
}

export interface ClassifyInput {
  /** Manually-entered / already-stored website (highest trust). */
  existingWebsite?: string | null;
  /** The Maps listing's own website pin. */
  mapsWebsite?: string | null;
  /** Google web-results links + text (from includeWebResults). */
  webResults?: { url: string; text: string }[];
  place?: PlaceLike | null;
  businessName?: string;
}

export function classifyOwnWebsite(input: ClassifyInput): WebsiteVerdict {
  const name = input.businessName ?? "";
  const usable = (u?: string | null): u is string =>
    !!u && !isAggregatorUrl(u) && !isPlatformSocialUrl(u);

  // 1) Manual/stored website wins (operator-trusted).
  if (usable(input.existingWebsite)) {
    return { status: "HAS_OWN_WEBSITE", website: rootDomain(input.existingWebsite!), candidate: null, signal: "manual", reason: "Manually-entered website" };
  }
  // 2) Maps listing's own website pin — strong.
  if (usable(input.mapsWebsite)) {
    return { status: "HAS_OWN_WEBSITE", website: rootDomain(input.mapsWebsite!), candidate: null, signal: "maps", reason: "Own website on the Maps listing" };
  }

  // 3) Web-results: exclude socials/aggregators/directories/gov/booking first.
  const candidates = (input.webResults ?? []).filter((w) => usable(w.url));
  if (!candidates.length) {
    return { status: "NO_WEBSITE", website: null, candidate: null, signal: null, reason: "No own-website candidate found" };
  }

  // 3a) Name-match BOOSTER — business name appears in the domain.
  const byName = candidates.find((w) => domainMatchesName(w.url, name));
  if (byName) {
    return { status: "HAS_OWN_WEBSITE", website: rootDomain(byName.url), candidate: null, signal: "name", reason: "Business name matches the domain" };
  }
  // 3b) Location-match — the result text mentions the lead's city/postcode/town.
  const byLoc = candidates.find((w) => locationMatch(w.text, input.place ?? null));
  if (byLoc) {
    return { status: "HAS_OWN_WEBSITE", website: rootDomain(byLoc.url), candidate: null, signal: "location", reason: "Web result location-matches the lead" };
  }
  // 3c) A real-looking site exists but neither name nor location confirms it → verify.
  return { status: "UNCERTAIN", website: null, candidate: rootDomain(candidates[0].url), signal: null, reason: "Possible website found — verify it's theirs" };
}
