// Geocode country-bias resolution — pure, side-effect-free, and unit-tested
// (geobias.test.ts). Kept out of search-leads/index.ts so it can be imported by a
// test without triggering that module's top-level Deno.serve().
//
// The rule (worldwide-safe):
//   • A BARE place name ("Reading") → default GB soft bias, so bare UK town names
//     resolve to the UK without the user typing a country.
//   • ANY location detail beyond a bare name — a comma, a US state code/name, a
//     Canadian province, an Australian state, or a country word — means the user has
//     disambiguated it: DON'T force GB. Trust the fuller string. When a foreign state
//     is detected without an explicit country word, we append the country so Google
//     resolves it unambiguously ("Reading, PA" → geocode "Reading, PA, USA").
//   • An explicit `country` field on the request overrides the default for bare names.

// Country names/codes → ISO-3166-1 alpha-2. Only what we plausibly serve; anything
// unmapped falls through to the raw 2-letter check, else no bias.
const COUNTRY_ALIASES: Record<string, string> = {
  UK: 'GB', GB: 'GB', GREATBRITAIN: 'GB', UNITEDKINGDOM: 'GB', ENGLAND: 'GB', SCOTLAND: 'GB', WALES: 'GB', EIRE: 'IE',
  US: 'US', USA: 'US', UNITEDSTATES: 'US', AMERICA: 'US',
  AU: 'AU', AUS: 'AU', AUSTRALIA: 'AU',
  CA: 'CA', CANADA: 'CA', IE: 'IE', IRELAND: 'IE', NZ: 'NZ', NEWZEALAND: 'NZ',
};

// Multi-word country phrases to detect inside a location string (checked first).
const COUNTRY_PHRASES: [RegExp, string][] = [
  [/\bUNITED STATES( OF AMERICA)?\b/, 'US'],
  [/\bUNITED KINGDOM\b/, 'GB'],
  [/\bGREAT BRITAIN\b/, 'GB'],
  [/\bNEW ZEALAND\b/, 'NZ'],
  [/\bNORTHERN IRELAND\b/, 'GB'],
];

// Single-token country words (whole-word match). Derived from COUNTRY_ALIASES minus
// the concatenated multi-word keys (those are handled by COUNTRY_PHRASES).
const COUNTRY_WORDS: Record<string, string> = {
  UK: 'GB', GB: 'GB', ENGLAND: 'GB', SCOTLAND: 'GB', WALES: 'GB', EIRE: 'IE',
  US: 'US', USA: 'US', AMERICA: 'US',
  AU: 'AU', AUS: 'AU', AUSTRALIA: 'AU',
  CANADA: 'CA', IRELAND: 'IE', NZ: 'NZ',
};

// State/province CODE → country. US takes precedence on any 2-letter collision (it's
// the common case); AU uses its unambiguous 3-letter codes to avoid the WA/SA/NT
// clash with US/CA. Canadian provinces fill the remaining 2-letter slots.
const STATE_CODES: Record<string, 'US' | 'CA' | 'AU'> = {
  // US states + DC
  AL: 'US', AK: 'US', AZ: 'US', AR: 'US', CA: 'US', CO: 'US', CT: 'US', DE: 'US', FL: 'US', GA: 'US',
  HI: 'US', ID: 'US', IL: 'US', IN: 'US', IA: 'US', KS: 'US', KY: 'US', LA: 'US', ME: 'US', MD: 'US',
  MA: 'US', MI: 'US', MN: 'US', MS: 'US', MO: 'US', MT: 'US', NE: 'US', NV: 'US', NH: 'US', NJ: 'US',
  NM: 'US', NY: 'US', NC: 'US', ND: 'US', OH: 'US', OK: 'US', OR: 'US', PA: 'US', RI: 'US', SC: 'US',
  SD: 'US', TN: 'US', TX: 'US', UT: 'US', VT: 'US', VA: 'US', WA: 'US', WV: 'US', WI: 'US', WY: 'US', DC: 'US',
  // Canadian provinces/territories (2-letter codes not used by US)
  ON: 'CA', QC: 'CA', BC: 'CA', AB: 'CA', MB: 'CA', SK: 'CA', NS: 'CA', NB: 'CA', NL: 'CA', PE: 'CA', YT: 'CA', NU: 'CA', NT: 'CA',
  // Australian states (unambiguous 3-letter codes)
  NSW: 'AU', VIC: 'AU', QLD: 'AU', TAS: 'AU', ACT: 'AU',
};

// State/province/territory FULL NAME → country (whole-word match). Includes the
// ambiguous 2-letter AU codes as names so "Perth, Western Australia" etc. resolve.
const STATE_NAMES: Record<string, 'US' | 'CA' | 'AU'> = {
  ALABAMA: 'US', ALASKA: 'US', ARIZONA: 'US', ARKANSAS: 'US', CALIFORNIA: 'US', COLORADO: 'US', CONNECTICUT: 'US',
  DELAWARE: 'US', FLORIDA: 'US', GEORGIA: 'US', HAWAII: 'US', IDAHO: 'US', ILLINOIS: 'US', INDIANA: 'US', IOWA: 'US',
  KANSAS: 'US', KENTUCKY: 'US', LOUISIANA: 'US', MAINE: 'US', MARYLAND: 'US', MASSACHUSETTS: 'US', MICHIGAN: 'US',
  MINNESOTA: 'US', MISSISSIPPI: 'US', MISSOURI: 'US', MONTANA: 'US', NEBRASKA: 'US', NEVADA: 'US', OHIO: 'US',
  OKLAHOMA: 'US', OREGON: 'US', PENNSYLVANIA: 'US', TENNESSEE: 'US', TEXAS: 'US', UTAH: 'US', VERMONT: 'US',
  VIRGINIA: 'US', WISCONSIN: 'US', WYOMING: 'US',
  ONTARIO: 'CA', QUEBEC: 'CA', MANITOBA: 'CA', SASKATCHEWAN: 'CA', ALBERTA: 'CA',
  NSW: 'AU', VICTORIA: 'AU', QUEENSLAND: 'AU', TASMANIA: 'AU',
};

const COUNTRY_APPEND: Record<string, string> = { US: 'USA', CA: 'Canada', AU: 'Australia' };

/** Normalise an explicit `country` field to an ISO alpha-2 code, or null. */
export function normCountry(country?: string): string | null {
  const c = (country ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!c) return null;
  if (COUNTRY_ALIASES[c]) return COUNTRY_ALIASES[c];
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/** Detect a country word/phrase anywhere in the string → ISO2, else null. */
function detectCountryWord(upper: string): string | null {
  for (const [re, cc] of COUNTRY_PHRASES) if (re.test(upper)) return cc;
  const tokens = upper.split(/[^A-Z]+/).filter(Boolean);
  for (const t of tokens) if (COUNTRY_WORDS[t]) return COUNTRY_WORDS[t];
  return null;
}

/**
 * Detect a US state / CA province / AU state → its country, else null.
 * Guard: only for MULTI-TOKEN locations. A lone word that happens to equal a state
 * name (e.g. "Washington", "Georgia") stays a bare name so the GB default still
 * applies — a real US search always includes the city ("Reading, Pennsylvania").
 */
function detectStateCountry(upper: string): 'US' | 'CA' | 'AU' | null {
  const tokens = upper.split(/[^A-Z]+/).filter(Boolean);
  if (tokens.length < 2) return null;
  // Full name anywhere (whole word).
  for (const [name, cc] of Object.entries(STATE_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(upper)) return cc;
  }
  // Trailing token as a code ("Reading PA", "Reading, PA").
  const last = tokens[tokens.length - 1];
  if (last && STATE_CODES[last]) return STATE_CODES[last];
  return null;
}

export interface QualifierInfo {
  /** The user gave a disambiguating detail (comma / state / country) → don't force GB. */
  hasQualifier: boolean;
  /** Country implied by the string (from a country word or a state), ISO2, else null. */
  country: string | null;
  /** Country NAME to append for Google when a state was seen without a country word. */
  appendCountry: string | null;
}

/** Analyse a raw location string for qualifiers. Pure. */
export function qualifierInfo(location: string): QualifierInfo {
  const raw = (location ?? '').trim();
  if (!raw) return { hasQualifier: false, country: null, appendCountry: null };
  const upper = raw.toUpperCase();
  const hasComma = raw.includes(',');
  const wordCountry = detectCountryWord(upper);
  const stateCountry = detectStateCountry(upper);
  const country = wordCountry ?? stateCountry ?? null;
  const hasQualifier = hasComma || country !== null;
  // Append a country only when a STATE was detected but no explicit country word,
  // so "Reading, PA" / "Reading PA" geocode as "…, USA" unambiguously.
  const appendCountry = (!wordCountry && stateCountry) ? (COUNTRY_APPEND[stateCountry] ?? null) : null;
  return { hasQualifier, country, appendCountry };
}

/**
 * Decide the geocode country bias (a SOFT region hint, applied as region=<cc>):
 *   1. Location carries any qualifier → null (no forced bias, trust the string).
 *   2. Bare name + explicit `country` field → that country.
 *   3. Bare name, nothing else → default GB.
 * Returns an ISO alpha-2 code, or null for "no bias".
 */
export function resolveGeoBias(location: string, country?: string): string | null {
  if (qualifierInfo(location).hasQualifier) return null;
  return normCountry(country) ?? 'GB';
}
