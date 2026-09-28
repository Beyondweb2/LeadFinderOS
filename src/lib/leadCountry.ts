/* ══ WHICH COUNTRY A LEAD IS IN — READ FROM GOOGLE, NEVER FROM A HIDDEN SETTING (2026-09-28) ═══════════
   🔴 THE BUG THIS EXISTS FOR. `outreach_leads.country` was written from Find Leads' persisted country
   choice, which only a Quick Locations click ever changed and which the form never showed. Measured on
   the live book the day this shipped: 349 leads stored as USA were UK businesses (UK address, +44
   phone, added 17-18 Sep after one click on a US city), 22 Florida businesses and 2 Chiang Mai ones
   were stored as UK. The address Google returned was right every time; the label was not.
   ⛔ SO THE ADDRESS DECIDES. Google's formattedAddress always ENDS with the country
   ("…, Pune, Maharashtra 411001, India", "…, Grimsby DN34 5BT, UK", "…, FL 33880, USA"), which is
   true of fresh AND cached Place Details rows and of the geocoded search location. An address whose
   last segment is not a country we list answers null — the caller keeps its own value; absence is
   never guessed into a country.
   ⛔ PURE, NO IMPORTS: edge functions import this by relative path (search-leads). */

/** Google's trailing country segment → the lead `country` enum (src/types/outreach.ts `Country`). */
const ADDRESS_COUNTRY: Record<string, string> = {
  'uk': 'UK', 'united kingdom': 'UK',
  'india': 'India',
  'usa': 'USA', 'united states': 'USA', 'united states of america': 'USA',
  'australia': 'Australia', 'canada': 'Canada', 'germany': 'Germany', 'france': 'France',
  'spain': 'Spain', 'italy': 'Italy', 'netherlands': 'Netherlands', 'belgium': 'Belgium',
  'ireland': 'Ireland', 'new zealand': 'NewZealand', 'south africa': 'SouthAfrica',
  'singapore': 'Singapore', 'united arab emirates': 'UAE', 'uae': 'UAE', 'brazil': 'Brazil',
  'mexico': 'Mexico', 'japan': 'Japan', 'sweden': 'Sweden', 'thailand': 'Thailand',
};

/** The lead-enum country an address is in, from its LAST comma segment; null when it names none. */
export function countryFromAddress(address: string | null | undefined): string | null {
  const parts = String(address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;              // a bare word is not an address
  const last = parts[parts.length - 1].toLowerCase().replace(/\s+/g, ' ');
  return ADDRESS_COUNTRY[last] ?? null;
}

/** The country to STORE on a lead: the address's country when it names one, else the fallback. */
export function leadCountryFor(address: string | null | undefined, fallback: string): string {
  return countryFromAddress(address) ?? fallback;
}

/* ══ STATE / REGION ═══════════════════════════════════════════════════════════════════════════════
   There is no state column: the state lives inside the stored address. For India the segment before
   the country is "Maharashtra 411001" — the state, then the 6-digit PIN. Derived on read, never stored. */
export function indiaStateFromAddress(address: string | null | undefined): string | null {
  const parts = String(address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3 || parts[parts.length - 1].toLowerCase() !== 'india') return null;
  const seg = parts[parts.length - 2].replace(/\s*\d{6}\s*$/, '').trim();
  return seg && !/\d/.test(seg) ? seg : null;
}
