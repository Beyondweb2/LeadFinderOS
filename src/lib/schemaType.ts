// Frontend JSON-LD schema helper for the AI-audit "Schema markup" section.
//
// MIRRORS the edge fn's national/local determination (generate-playbook/index.ts →
// isNationalBusiness). Deno edge code can't be imported into the Vite app, so this
// duplication is accepted — the SAME pattern as src/lib/lineType.ts mirroring the edge
// _shared/line-type.ts. Keep the fallback in sync if the edge heuristic changes.
//
// Nothing here invents facts: every JSON-LD field is built ONLY from values passed in;
// any field with no value is OMITTED (no empty strings, no placeholder text).

export type BusinessScope = "national" | "local" | "hybrid";
export type SchemaType = "AccountingService" | "ProfessionalService" | "Organization";

/** Country enum / raw → display name for areaServed / addressCountry. */
const COUNTRY_DISPLAY: Record<string, string> = {
  UK: "United Kingdom", GB: "United Kingdom", "United Kingdom": "United Kingdom",
  USA: "United States", US: "United States", Ireland: "Ireland", Australia: "Australia",
  Canada: "Canada", NewZealand: "New Zealand",
};
function countryName(country: string): string {
  const c = (country || "").trim();
  if (!c) return "United Kingdom"; // UK-first product default when unspecified
  return COUNTRY_DISPLAY[c] ?? c;
}

// A business type that reads as accountancy → AccountingService; other professional-services
// signals → ProfessionalService; anything else → Organization.
const ACCOUNTANCY_RE = /\b(?:account(?:ant|ants|ancy|ing)?|bookkeep(?:er|ers|ing)?|payroll|audit(?:or|ors|ing|s)?|tax|taxation)\b/i;
const PROFESSIONAL_RE = /\b(?:solicitor\w*|lawyer\w*|barrister\w*|law|legal\w*|consult\w*|advis\w*|agenc\w*|architect\w*|survey\w*|financ\w*|mortgage\w*|insur\w*|recruit\w*|marketing\w*|design\w*|software\w*|engineer\w*|it services)\b/i;

/** Decide the schema.org @type from the business type. Scope does NOT change the @type
 *  (per spec) — it only affects areaServed / address below. */
export function decideSchemaType(businessType: string): SchemaType {
  const t = businessType || "";
  if (ACCOUNTANCY_RE.test(t)) return "AccountingService";
  if (PROFESSIONAL_RE.test(t)) return "ProfessionalService";
  return "Organization";
}

/** Fallback national/local guess when no model businessScope exists — ports the CORE of the
 *  edge isNationalBusiness (national if location is just a country/region or the type reads
 *  national; else local). Binary only (no hybrid). */
export function fallbackScope(locationText: string, businessType: string): "national" | "local" {
  const loc = (locationText || "").toLowerCase().replace(/[.,]/g, " ").replace(/\bthe\b/g, " ").replace(/\s+/g, " ").trim();
  const type = (businessType || "").toLowerCase();
  const NATIONWIDE = /\b(nationwide|national|uk[-\s]?wide|country[-\s]?wide|countrywide|online|remote|e-?commerce|virtual)\b/;
  if (NATIONWIDE.test(loc) || NATIONWIDE.test(type)) return "national";
  const REGIONS = new Set([
    "uk", "u k", "united kingdom", "great britain", "britain", "gb", "gbr",
    "england", "scotland", "wales", "northern ireland", "n ireland",
  ]);
  if (loc && REGIONS.has(loc)) return "national";
  const noLoc = !loc || loc.includes("not given") || loc.includes("n/a");
  const NATIONAL_TYPE = /\b(chartered|accountanc|accountant|solicitor|law firm|lawyer|barrister|consultanc|consultant|agency|software|saas|fintech)\b/;
  if (noLoc && NATIONAL_TYPE.test(type)) return "national";
  return "local";
}

export interface SchemaInput {
  name: string;
  url?: string;
  businessType?: string;
  businessScope?: BusinessScope; // model determination if a playbook exists
  locationText?: string;
  country?: string;
  phone?: string;
  address?: string;
  email?: string;
  specialism?: string;
}

/** Split a free-text specialism into distinct topics for knowsAbout
 *  ("CIS / construction, VAT" → ["CIS", "construction", "VAT"]). */
function splitSpecialism(specialism: string): string[] {
  return specialism.split(/\s*(?:,|\/|;|\band\b|&)\s*/i).map((s) => s.trim()).filter(Boolean);
}

/**
 * Build the JSON-LD object for a business. Returns a plain object; the caller
 * JSON.stringifies it (2-space) inside the <script type="application/ld+json"> wrapper.
 * OMITS every field that has no value — never emits empty strings or placeholders.
 */
export function buildSchema(input: SchemaInput): Record<string, unknown> {
  const name = (input.name || "").trim() || "This business";
  const businessType = (input.businessType || "").trim();
  const locationText = (input.locationText || "").trim();
  // Normalise to a valid absolute URL — a stored value like "ablm.co.uk" isn't a valid schema
  // URL; prefix https:// when no scheme is present. Already-valid http(s) URLs are untouched.
  const rawUrl = (input.url || "").trim();
  const url = rawUrl ? (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`) : "";
  const phone = (input.phone || "").trim();
  const address = (input.address || "").trim();
  const email = (input.email || "").trim();
  const specialism = (input.specialism || "").trim();

  const scope: BusinessScope = input.businessScope ?? fallbackScope(locationText, businessType);
  const nationalish = scope === "national" || scope === "hybrid";
  const type = decideSchemaType(businessType);
  const cName = countryName(input.country || "");

  const obj: Record<string, unknown> = { "@context": "https://schema.org", "@type": type, name };
  if (url) obj.url = url;

  const topics = specialism ? splitSpecialism(specialism) : [];
  if (topics.length) obj.knowsAbout = topics;

  // Area / address: national|hybrid → country-level areaServed, NO geo. local → PostalAddress
  // (when provided) + the locality text as areaServed.
  if (nationalish) {
    obj.areaServed = { "@type": "Country", name: cName };
  } else {
    if (address) obj.address = { "@type": "PostalAddress", streetAddress: address, ...(cName ? { addressCountry: cName } : {}) };
    if (locationText) obj.areaServed = locationText;
  }

  if (phone) obj.telephone = phone;
  if (email) obj.email = email;

  // Description — a plain sentence from KNOWN facts only (type + specialism + area).
  // Type label from business_type, first-letter-lowercased (a common noun mid-sentence)
  // UNLESS the first word is an acronym like "IT"/"SEO"; falls back to a sensible default.
  const rawLabel = businessType.trim();
  const firstWord = rawLabel.split(/\s+/)[0] ?? "";
  const isAcronym = /^[A-Z0-9&]{2,}$/.test(firstWord);
  const typeLabel = rawLabel
    ? (isAcronym ? rawLabel : rawLabel.charAt(0).toLowerCase() + rawLabel.slice(1))
    : (type === "AccountingService" ? "accountancy firm" : type === "ProfessionalService" ? "professional services firm" : "business");
  // "a" vs "an" from the label's leading vowel (simple a/e/i/o/u rule).
  const article = /^[aeiou]/i.test(typeLabel.trim()) ? "an" : "a";
  const specPhrase = specialism ? ` specialising in ${specialism}` : "";
  const areaPhrase = nationalish ? ` serving clients across ${cName}` : (locationText ? ` based in ${locationText}` : "");
  obj.description = `${name} is ${article} ${typeLabel}${specPhrase}${areaPhrase}.`.replace(/\s+/g, " ").trim();

  return obj;
}
