/* ══ IS THIS BUSINESS ACTUALLY IN THE TOWN THAT WAS SEARCHED? (2026-10-20, fix/coverage-town-strict) ═══════════════
   Find Leads with a town (Coverage, "This town only") must return and add only businesses IN that town, and the audit
   question must name that town. Mway Driving School was found under "Cheshunt", sits at Selby Rd, London N17
   (Tottenham, ~11 km away) and was audited about "London" — too broad, with Pimlico competitors.

   THE RULE, in order (the first that decides wins):
     1. A NAME MATCH from the address → IN. The post town ("Cheshunt EN8"), the London postcode district's area or
        borough (N17 = Tottenham, Haringey), or a whole address part ("…, Bukit Bintang, 55100 Kuala Lumpur").
     2. A DIFFERENT, ordinary post town → OUT ("Waltham Cross EN8" is not Cheshunt).
     3. A London address whose district is known, when the searched town is itself a London area / borough → the
        district decides (searching Tottenham: N17 in, SW1V out).
     4. Otherwise DISTANCE from the searched town's centre, scaled to the town's size: radius = √population ÷ 80 km,
        never under 2 km or over 15 km (3 km when the size is unknown). Cheshunt (43,680) → 2.6 km; Hastings (~92k)
        → 3.8 km; Kuala Lumpur → 15 km. Inside → IN, outside → OUT.
     5. Nothing to judge on (no address, no coordinates) → null: the caller falls back to Google's town boundary
        (the existing outsideTown flag), never to "in".
   A big city's post town (London, Birmingham, Kuala Lumpur…) is never step 2: it covers many neighbourhoods, so a
   search for one of them goes to steps 3–4.

   UK and Malaysia read their own address shapes (UK "Town POSTCODE", Malaysia "12345 Town"). Pure, no I/O.

   AUSTRALIA (2026-10-21, src/lib/australiaTowns.ts) reads "Suburb STATE 1234" and has its OWN order:
     1. The STATE first: a searched town that names a state ("Richmond VIC") and an address in another state
        ("Richmond NSW 2753") → OUT ('other_state'). The postcode gives the state when the word is missing.
     2. A name match (the suburb, or a whole address part) → IN.
     3. ANOTHER URBAN CENTRE (2026-10-23): the suburb is itself a different ABS urban centre in the same state
        ("Wodonga VIC" under an Albury search, "Bargara QLD" under Bundaberg) → OUT ('other_town'). It is its own
        Coverage row, so it is never counted twice.
     4. Distance from the searched town's centre, with the WIDER Australian radius: √population ÷ 50 km
        (AU_TOWN_RADIUS_DIVISOR), same 2–15 km bounds. Albury (53,677) → 4.6 km, so Lavington (3.4–3.8 km, a suburb
        of Albury, not an urban centre of its own) is IN. ÷80 gave 2.9 km and hid it (measured 2026-10-23).
     5. Otherwise null (Google's boundary decides).
   ⚠️ No "different suburb → OUT" step: an Australian urban centre is many suburbs (Ballarat is Wendouree,
   Sebastopol, Ballarat Central…), so a different suburb name is not evidence of being outside it. Step 3 is
   narrower: only a suburb that is a separate listed urban centre. */
import { LONDON_POSTCODE_AREAS, type LondonArea } from '../data/londonPostcodeAreas.ts';
import { resolveCoverageTown } from './coverageCountries.ts';
import { auTownLabel, findAuTown, isAustralianLead, parseAuAddress, parseAuTown, sameAuTown, withAuState } from './australiaTowns.ts';

export type InTownReason = 'post_town' | 'postcode_district' | 'address_part' | 'other_town' | 'other_district' | 'other_state' | 'distance' | 'too_far' | 'unknown';

export interface InTownVerdict {
  /** true = in the town; false = outside it; null = could not be judged (fall back to outsideTown). */
  inTown: boolean | null;
  reason: InTownReason;
  /** The finest place name the address gives (Tottenham for N17, else the post town), or null. */
  area: string | null;
  /** Kilometres from the town centre, when the distance was used. */
  km: number | null;
}

export interface InTownInput {
  town: string;
  country?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  centre?: { lat: number; lng: number } | null;
  population?: number | null;
}

/** Post towns that cover a whole city of neighbourhoods: never proof a business is NOT in a neighbourhood. */
const CITY_POST_TOWNS = new Set([
  'london', 'birmingham', 'manchester', 'glasgow', 'liverpool', 'leeds', 'sheffield', 'bristol', 'edinburgh', 'cardiff',
  'newcastle upon tyne', 'nottingham', 'leicester', 'belfast',
  'kuala lumpur', 'johor bahru', 'petaling jaya', 'shah alam', 'george town',
]);

/** Too broad to be an audit question's town: one name for a whole capital, or a country / nation. */
const BROAD_TOWNS = new Set(['london', 'greater london', 'england', 'scotland', 'wales', 'northern ireland', 'united kingdom', 'uk', 'great britain', 'malaysia', 'australia']);

export const TOWN_RADIUS_MIN_KM = 2;
export const TOWN_RADIUS_MAX_KM = 15;
export const TOWN_RADIUS_UNKNOWN_KM = 3;
/** √population ÷ this = the in-town radius (km). The UK / Malaysia figure. */
export const TOWN_RADIUS_DIVISOR = 80;
/** Australia's: its urban centres are spread out (low-density suburbs), so ÷80 hid real suburbs (header, step 4). */
export const AU_TOWN_RADIUS_DIVISOR = 50;

/** Lowercase, brackets / accents / punctuation gone, "-" as a space. */
export function townKey(s: string | null | undefined): string {
  return String(s ?? '').replace(/\([^)]*\)/g, ' ').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Written into ai_audits.location_note when only a broad name ("London") was possible: the audit is a BROAD TOWN audit. */
export const BROAD_TOWN_NOTE = 'Broad town: only a city-wide name could be found for this business';

export function isBroadTown(name: string | null | undefined): boolean {
  return BROAD_TOWNS.has(townKey(name));
}

function isMalaysia(country: string | null | undefined): boolean {
  return /^(malaysia|my)$/i.test(String(country ?? '').trim());
}

/** One spelling per place: Malaysia's listed towns and their other names ("KL", "Penang") collapse to one. */
function canon(name: string, country: string | null | undefined): string {
  if (isMalaysia(country)) {
    const r = resolveCoverageTown('Malaysia', name);
    if (r?.listed) return townKey(r.name);
  }
  return townKey(name).replace(/^st /, 'saint ').replace(/ st /, ' saint ');
}

/** Same place: equal, or one is the other plus "on Sea" / "upon Thames" ("Bexhill" = "Bexhill-on-Sea"). */
export function sameTown(a: string, b: string, country?: string | null): boolean {
  const x = canon(a, country), y = canon(b, country);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return l.startsWith(s + ' ') && /^(on|upon|in) /.test(l.slice(s.length + 1));
}

export interface ParsedAddress { postTown: string | null; district: string | null; parts: string[] }

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)(?:\s*(\d[A-Z]{2}))?\s*$/i;

/** The post town, postcode district and the other parts of a Google formattedAddress. */
export function parseAddress(address: string | null | undefined, country?: string | null): ParsedAddress {
  if (isAustralianLead(country, null)) {
    const a = parseAuAddress(address);
    return { postTown: a.suburb, district: null, parts: a.parts };
  }
  const parts = String(address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  while (parts.length && /^(uk|united kingdom|great britain|england|scotland|wales|malaysia)$/i.test(parts[parts.length - 1])) parts.pop();
  let postTown: string | null = null, district: string | null = null, at = -1;
  if (isMalaysia(country)) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const m = parts[i].match(/^(?:.*\s)?(\d{5})\s+(.+)$/);
      if (m) { postTown = m[2].trim(); at = i; break; }
    }
  } else {
    for (let i = parts.length - 1; i >= 0; i--) {
      const m = parts[i].match(UK_POSTCODE);
      if (m && /[a-z]/i.test(parts[i].slice(0, m.index))) {
        postTown = parts[i].slice(0, m.index).trim(); district = m[1].toUpperCase(); at = i; break;
      }
    }
  }
  return { postTown: postTown || null, district, parts: parts.filter((_, i) => i !== at) };
}

/** A London postcode district's area: exact (SW1V, N1C), else its parent (SW1A → SW1, EC1A → EC1). */
export function londonAreaFor(district: string | null | undefined): LondonArea | null {
  const d = String(district ?? '').toUpperCase().trim();
  if (!d) return null;
  return LONDON_POSTCODE_AREAS[d] ?? (/[A-Z]$/.test(d) ? LONDON_POSTCODE_AREAS[d.slice(0, -1)] ?? null : null);
}

const LONDON_NAMES = new Set(Object.values(LONDON_POSTCODE_AREAS).flatMap((a) => [townKey(a.area), townKey(a.borough)]));
export function isLondonAreaName(name: string): boolean { return LONDON_NAMES.has(townKey(name)); }

/** The finest place an address names: the London district's area, else the post town. */
export function areaFromAddress(address: string | null | undefined, country?: string | null): string | null {
  if (isAustralianLead(country, null)) {
    /* The suburb WITH its state ("Richmond VIC"), never a bare name another state shares. */
    const a = parseAuAddress(address);
    return a.suburb ? (a.state ? auTownLabel(a.suburb, a.state) : a.suburb) : null;
  }
  const p = parseAddress(address, country);
  if (p.postTown && townKey(p.postTown) === 'london') return londonAreaFor(p.district)?.area ?? p.postTown;
  return p.postTown;
}

/** How far from the centre still counts as the town, from its population. */
export function townRadiusKm(population: number | null | undefined, country?: string | null): number {
  if (!population || !(population > 0)) return TOWN_RADIUS_UNKNOWN_KM;
  const divisor = isAustralianLead(country, null) ? AU_TOWN_RADIUS_DIVISOR : TOWN_RADIUS_DIVISOR;
  return Math.min(TOWN_RADIUS_MAX_KM, Math.max(TOWN_RADIUS_MIN_KM, Math.sqrt(population) / divisor));
}

export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const real = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n !== 0;

/** Australia's own order (header): the state, then a name, then distance. */
function auInTownVerdict(i: InTownInput): InTownVerdict {
  const t = parseAuTown(i.town);
  const a = parseAuAddress(i.address);
  const area = a.suburb ? (a.state ? auTownLabel(a.suburb, a.state) : a.suburb) : null;
  if (!t.name) return { inTown: null, reason: 'unknown', area, km: null };
  // 1. the state
  if (t.state && a.state && t.state !== a.state) return { inTown: false, reason: 'other_state', area, km: null };
  // 2. a name match
  if (a.suburb && sameAuTown(a.suburb, t.name)) return { inTown: true, reason: 'post_town', area, km: null };
  if (a.parts.some((x) => !/\d/.test(x) && sameAuTown(x, t.name))) return { inTown: true, reason: 'address_part', area, km: null };
  // 3. the suburb is another urban centre of its own (its own Coverage row)
  const state = t.state ?? a.state;
  if (a.suburb && state) {
    const other = findAuTown(a.suburb, state);
    if (other && other !== 'ambiguous' && !sameAuTown(other.label, i.town)) return { inTown: false, reason: 'other_town', area, km: null };
  }
  // 4. distance, scaled to the town's size (Australia's wider radius)
  if (real(i.lat) && real(i.lng) && i.centre && real(i.centre.lat) && real(i.centre.lng)) {
    const km = kmBetween({ lat: i.lat, lng: i.lng }, i.centre);
    const r = townRadiusKm(i.population, 'Australia');
    return { inTown: km <= r, reason: km <= r ? 'distance' : 'too_far', area, km: Math.round(km * 10) / 10 };
  }
  return { inTown: null, reason: 'unknown', area, km: null };
}

function isSingapore(country: string | null | undefined): boolean {
  return /^(singapore|sg)$/i.test(String(country ?? '').trim());
}

/* ── SINGAPORE (2026-10-23) ─────────────────────────────────────────────────────────────────────────────────────
   Until now Singapore fell into the UK branch: a UK postcode parser that never matches "Singapore 238858", and a
   3 km circle round the city centre — so a search for "Singapore" itself hid every business more than 3 km from the
   middle of a 50 km island. Its own order:
     1. An address that is not in Singapore (no "Singapore 123456" / "Singapore" at the end) → OUT ('other_town').
     2. The search is Singapore itself → IN: it is one city.
     3. A planning area ("Tampines") named by an address part, whole words from the start ("Tampines Street 81",
        "Blk 123 Ang Mo Kio Ave 3") → IN.
     4. Distance from the area's centre, TOWN_RADIUS_UNKNOWN_KM: a planning area is ~10–30 km², and its RESIDENT count
        (abroadTownPopulation.ts) is far denser than a UK town's, so √population would draw a circle across half
        the island. 5. Otherwise null. */
const SG_TAIL = /^singapore(\s+\d{6})?$/i;
function sgInTownVerdict(i: InTownInput): InTownVerdict {
  const t = townKey(String(i.town ?? '').replace(/,?\s*singapore\s*$/i, '')) || 'singapore';
  const parts = String(i.address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const inSg = parts.length > 0 && SG_TAIL.test(parts[parts.length - 1]);
  if (parts.length && !inSg) return { inTown: false, reason: 'other_town', area: null, km: null };
  if (t === 'singapore') return inSg ? { inTown: true, reason: 'address_part', area: 'Singapore', km: null } : { inTown: null, reason: 'unknown', area: null, km: null };
  const named = parts.slice(0, -1).some((p) => {
    const k = townKey(p.replace(/^(blk|block)\s+\d+[a-z]?\s+/i, '').replace(/^\d+[a-z]?\s+/i, ''));
    return k === t || k.startsWith(t + ' ');
  });
  if (named) return { inTown: true, reason: 'address_part', area: i.town, km: null };
  if (real(i.lat) && real(i.lng) && i.centre && real(i.centre.lat) && real(i.centre.lng)) {
    const km = kmBetween({ lat: i.lat, lng: i.lng }, i.centre);
    return { inTown: km <= TOWN_RADIUS_UNKNOWN_KM, reason: km <= TOWN_RADIUS_UNKNOWN_KM ? 'distance' : 'too_far', area: null, km: Math.round(km * 10) / 10 };
  }
  return { inTown: null, reason: 'unknown', area: null, km: null };
}

export function inTownVerdict(i: InTownInput): InTownVerdict {
  if (isAustralianLead(i.country, null)) return auInTownVerdict(i);
  if (isSingapore(i.country)) return sgInTownVerdict(i);
  const town = String(i.town ?? '').trim();
  const p = parseAddress(i.address, i.country);
  const ldn = p.postTown && townKey(p.postTown) === 'london' ? londonAreaFor(p.district) : null;
  const area = ldn?.area ?? p.postTown ?? null;
  if (!town) return { inTown: null, reason: 'unknown', area, km: null };
  // 1. a name match
  if (p.postTown && sameTown(p.postTown, town, i.country)) return { inTown: true, reason: 'post_town', area, km: null };
  if (ldn && (sameTown(ldn.area, town) || sameTown(ldn.borough, town))) return { inTown: true, reason: 'postcode_district', area, km: null };
  if (p.parts.some((x) => !/\d/.test(x) && sameTown(x, town, i.country))) return { inTown: true, reason: 'address_part', area, km: null };
  // 2. a different ordinary post town
  if (p.postTown && !CITY_POST_TOWNS.has(canon(p.postTown, i.country))) return { inTown: false, reason: 'other_town', area, km: null };
  // 3. London, searched for one of its own areas: the district decides
  if (ldn && isLondonAreaName(town)) return { inTown: false, reason: 'other_district', area, km: null };
  // 4. distance, scaled to the town's size
  if (real(i.lat) && real(i.lng) && i.centre && real(i.centre.lat) && real(i.centre.lng)) {
    const km = kmBetween({ lat: i.lat, lng: i.lng }, i.centre);
    return { inTown: km <= townRadiusKm(i.population), reason: km <= townRadiusKm(i.population) ? 'distance' : 'too_far', area, km: Math.round(km * 10) / 10 };
  }
  return { inTown: null, reason: 'unknown', area, km: null };
}

/** Hidden from a town search: judged outside, or not judged and outside Google's town boundary. */
export function outsideSearchedTown(lead: { townCheck?: { inTown: boolean | null } | null; outsideTown?: boolean }): boolean {
  if (lead.townCheck && lead.townCheck.inTown !== null) return lead.townCheck.inTown === false;
  return !!lead.outsideTown;
}

/** Verified IN the searched town — the only case whose town is stored on the lead as its Coverage town. */
export function verifiedInSearchedTown(lead: { townCheck?: { inTown: boolean | null } | null }): boolean {
  return lead.townCheck?.inTown === true;
}

/* ── THE AUDIT QUESTION'S TOWN FOR A LEAD WITH NO STORED QUESTION ────────────────────────────────────────────── */

export interface LeadTownRow {
  coverage_town?: string | null;
  derived_town?: string | null;
  search_location?: string | null;
  address?: string | null;
  country?: string | null;
}

/**
 * The town an audit question would use, without the network: the Coverage town (verified in town when added) unless
 * broad; else a finer area than a broad one when the address gives it (London N17 → Tottenham); else Google's town;
 * else the searched location. `broad` = only a broad name was possible.
 */
export function leadQuestionTown(row: LeadTownRow): { town: string | null; broad: boolean } {
  const r = questionTownOf(row);
  /* ⛔ AN AUSTRALIAN TOWN ALWAYS CARRIES ITS STATE ("Perth WA", never a bare "Perth" — australiaTowns.ts). */
  if (r.town && isAustralianLead(row.country, row.address)) return { ...r, town: withAuState(r.town, row.address) };
  return r;
}

function questionTownOf(row: LeadTownRow): { town: string | null; broad: boolean } {
  const cov = String(row.coverage_town ?? '').trim();
  if (cov && !isBroadTown(cov)) return { town: cov, broad: false };
  const derived = String(row.derived_town ?? '').trim() || cov || String(row.search_location ?? '').trim();
  if (derived && !isBroadTown(derived)) return { town: derived, broad: false };
  const finer = areaFromAddress(row.address, row.country);
  if (finer && !isBroadTown(finer)) return { town: finer, broad: false };
  return { town: derived || null, broad: !!derived };
}

/** A result that is judged outside the searched town AND whose "outside" line is still on Hide. Once the person presses
 *  Show, those rows are ordinary rows: selected, added, emailed and exported like any other. */
export function heldOutOfTown(lead: { townCheck?: { inTown: boolean | null } | null; outsideTown?: boolean }, showOutside: boolean): boolean {
  return !showOutside && outsideSearchedTown(lead);
}
