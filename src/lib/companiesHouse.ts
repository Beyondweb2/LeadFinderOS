/* ══ HOW OLD IS THIS BUSINESS? — the Companies House check, as rules (2026-10-02) ═════════════════
   docs/companies-house-age.md. Find Leads asks Companies House about every UK result with NO website,
   so a salesperson can spot a business that is weeks old and has not built a site yet.
   This file is the ONE place that says: which results are checked, how a Companies House search
   result is matched to the Google listing (strong / possible / none — never invented certainty), how
   old a company is and how that reads in a cell, which filter a result falls under, and when a stored
   check is still good. Pure and edge-safe (no imports): fn companies-house-check and the screen share it.

   ⛔ A MISSING MATCH IS NEVER "NOT REGISTERED". Sole traders, partnerships and companies trading under
      another name have no findable record; the cell says "Not found", never more.
   ⛔ This is the MACHINE's match. It lives only in companies_house_checks and never writes a lead. */

/* ── Version and cache ──────────────────────────────────────────────────────────────────────────── */

/** Bump when the matching rules change: every stored check on an older version is looked up again. */
export const CH_CHECK_VERSION = 1;
/** A strong match: an incorporation date never changes, so it is kept a long time. */
export const CH_STRONG_CACHE_DAYS = 90;
/** A possible match: kept shorter — the listing may gain a postcode or a better name. */
export const CH_POSSIBLE_CACHE_DAYS = 30;
/** Not found: kept shortest — the newest businesses are exactly the ones that register next week. */
export const CH_NOT_FOUND_CACHE_DAYS = 14;
/** Results checked at once from one screen (Companies House allows 600 requests per 5 minutes per key). */
export const CH_CONCURRENCY = 6;
/** Under this many whole months old = NEW. */
export const CH_NEW_MONTHS = 3;

export type ChMatch = 'strong' | 'possible' | 'none';

/** One stored check (companies_house_checks), keyed by the Google place id. */
export interface CompaniesHouseCheckRow {
  place_id: string;
  fingerprint: string;
  business_name: string;
  postcode: string | null;
  town: string | null;
  match: ChMatch;
  company_number: string | null;
  company_name: string | null;
  company_status: string | null;
  company_type: string | null;
  incorporated_on: string | null;
  registered_locality: string | null;
  registered_postcode: string | null;
  evidence: string[];
  candidates_seen: number;
  requests?: number;
  duration_ms?: number;
  version: number;
  checked_at: string;
}

/* ── Which results are checked ──────────────────────────────────────────────────────────────────── */

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

/** "pe131ab" / "PE13 1AB" → "PE13 1AB"; null when there is none. */
export function postcodeOf(text: string | null | undefined): string | null {
  const m = String(text ?? '').match(POSTCODE_RE);
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null;
}
/** "PE13 1AB" → "PE13". */
export function outwardCode(postcode: string | null | undefined): string | null {
  const p = postcodeOf(postcode);
  return p ? p.split(' ')[0] : null;
}

/** A UK address: a UK postcode in it, or it ends in UK / United Kingdom. Companies House is UK-only. */
export function isUkAddress(address: string | null | undefined): boolean {
  const a = String(address ?? '').trim();
  if (!a) return false;
  return !!postcodeOf(a) || /(,|^)\s*(uk|united kingdom|england|scotland|wales|northern ireland)\s*$/i.test(a);
}

/** The town in a Google formatted address — "4 Market St, Wisbech PE13 1AB, UK" → "Wisbech". */
export function townOf(address: string | null | undefined): string | null {
  const parts = String(address ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    .filter((s) => !/^(uk|united kingdom|england|scotland|wales|northern ireland)$/i.test(s));
  if (!parts.length) return null;
  const withPc = parts.find((s) => POSTCODE_RE.test(s));
  const raw = (withPc ? withPc.replace(POSTCODE_RE, '') : parts[parts.length - 1]).replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
  if (raw.length >= 2) return raw;
  // "…, Wisbech, PE13 1AB" — the postcode stands alone, the town is the part before it.
  const i = withPc ? parts.indexOf(withPc) : -1;
  const prev = i > 0 ? parts[i - 1].replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return prev.length >= 2 && !/\b(st|street|road|rd|lane|ln|avenue|ave|way|close|drive|unit)\b/i.test(prev) ? prev : null;
}

/** Is a Find Leads result one we check? No own website (NO_WEBSITE, or the legacy DIRECTORY_ONLY), a
 *  place id to key it by, and a UK address. UNCERTAIN (a possible site) and HAS_OWN_WEBSITE are not. */
export function isCompaniesHouseTarget(lead: { id?: string | null; websiteStatus?: string | null; address?: string | null }): boolean {
  const s = lead.websiteStatus;
  return !!lead.id && (s === 'NO_WEBSITE' || s === 'DIRECTORY_ONLY') && isUkAddress(lead.address);
}

/* ── Names ──────────────────────────────────────────────────────────────────────────────────────── */

const LEGAL_SUFFIX = new Set(['ltd', 'limited', 'llp', 'plc', 'cic', 'lp', 'inc', 'incorporated', 'company', 'co', 'uk', 'gb']);
const STOP = new Set(['and', 'the', 'of', 'ta', 't', 'a', 'at', 'in', 'by', 'for']);
/** Words that say WHAT a business does, not WHICH one it is. A name made only of these and the town
 *  ("Wisbech Plumbing") matches dozens of companies, so it needs a postcode to be a strong match. */
const GENERIC = new Set([
  'service', 'services', 'solution', 'solutions', 'group', 'enterprise', 'enterprises', 'holding', 'holdings', 'trading',
  'contractor', 'contractors', 'contracting', 'contract', 'contracts', 'property', 'properties', 'maintenance', 'repair', 'repairs',
  'plumbing', 'plumber', 'plumbers', 'heating', 'gas', 'boiler', 'boilers', 'electrical', 'electric', 'electrician', 'electricians',
  'building', 'builder', 'builders', 'construction', 'roofing', 'roofer', 'roofers', 'locksmith', 'locksmiths', 'security',
  'cleaning', 'cleaner', 'cleaners', 'carpet', 'carpets', 'window', 'windows', 'garage', 'motor', 'motors', 'auto', 'autos', 'car', 'cars',
  'tyre', 'tyres', 'mot', 'landscaping', 'landscapes', 'garden', 'gardening', 'gardens', 'tree', 'trees', 'decorating', 'decorators',
  'painting', 'painter', 'painters', 'carpentry', 'carpenter', 'joinery', 'joiner', 'joiners', 'kitchen', 'kitchens', 'bathroom', 'bathrooms',
  'flooring', 'tiling', 'plastering', 'plasterer', 'fencing', 'driveways', 'paving', 'removals', 'removal', 'storage', 'transport',
  'hair', 'hairdresser', 'hairdressers', 'salon', 'barber', 'barbers', 'beauty', 'nails', 'spa', 'cafe', 'coffee', 'restaurant', 'takeaway',
  'bakery', 'shop', 'store', 'stores', 'studio', 'studios', 'centre', 'center', 'clinic', 'care', 'dental', 'physio', 'fitness', 'gym',
  'driving', 'drive', 'drives', 'motoring', 'instructor', 'instructors', 'lessons', 'school', 'tuition', 'tutor', 'tutors', 'accountant', 'accountants', 'accounting', 'solicitor', 'solicitors', 'law', 'estate', 'agent', 'agents',
  'lettings', 'pet', 'pets', 'dog', 'grooming', 'vets', 'florist', 'flowers', 'print', 'printing', 'signs', 'media', 'design', 'digital',
  'local', 'professional', 'quality', 'premier', 'express', 'mobile', 'home', 'homes', 'house', 'shoe', 'shoes', 'key', 'keys', 'cutting',
  'independent', 'family', 'sons', 'son', 'brothers', 'bros', 'partners',
]);

/** Lower-case word tokens, '&' read as 'and', apostrophes dropped, legal suffixes and stop words gone. */
export function nameTokens(name: string | null | undefined): string[] {
  const words = String(name ?? '').toLowerCase().replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.filter((w) => !LEGAL_SUFFIX.has(w) && !STOP.has(w));
}
const stem = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
/** The name as one comparable string — "Smith & Sons Plumbing Ltd" and "SMITH AND SONS PLUMBING LIMITED" agree. */
export function normName(name: string | null | undefined): string {
  return nameTokens(name).map(stem).join(' ');
}
/** The words that identify WHICH business: not a trade word, not the town. */
export function distinctiveTokens(name: string | null | undefined, town: string | null | undefined): string[] {
  const townWords = new Set(nameTokens(town).map(stem));
  return [...new Set(nameTokens(name).filter((w) => !GENERIC.has(w)).map(stem).filter((w) => !townWords.has(w) && w.length > 1))];
}

export type NameTier = 'exact' | 'exact_generic' | 'close' | 'partial' | 'none';
export const NAME_TIER_WORDS: Record<Exclude<NameTier, 'none'>, string> = {
  exact: 'Business name matches exactly',
  exact_generic: 'Business name matches, but names like this are common',
  close: 'Business name closely matches',
  partial: 'Business name partly matches',
};

/** How well a Companies House name matches the Google listing's name. */
export function nameTier(listing: string, company: string, town: string | null): NameTier {
  const a = normName(listing), b = normName(company);
  if (!a || !b) return 'none';
  const da = distinctiveTokens(listing, town), db = new Set(distinctiveTokens(company, town));
  if (a === b) return da.length ? 'exact' : 'exact_generic';
  // The listing often adds the town ("Ronnie's Shoe Repairs Wisbech"); the company often drops it.
  const townWords = new Set(nameTokens(town).map(stem));
  const sa = a.split(' ').filter((w) => !townWords.has(w)).join(' '), sb = b.split(' ').filter((w) => !townWords.has(w)).join(' ');
  if (sa && sa === sb) return da.length ? 'exact' : 'exact_generic';
  if (!da.length) return 'none';
  const shared = da.filter((w) => db.has(w)).length;
  if (!shared) return 'none';
  const ta = new Set(a.split(' ')), tb = new Set(b.split(' '));
  const inter = [...ta].filter((w) => tb.has(w)).length;
  const dice = (2 * inter) / (ta.size + tb.size);
  // Close = every identifying word of the listing is there AND most of the words overall. Measured
  // 2026-10-02: a looser rule matched "Meopham Locksmiths" to MEOPHAM LIMITED and "UA Gas Service" to
  // UA CONSTRUCTION SERVICES.
  if (shared === da.length && dice >= 0.75) return 'close';
  return dice >= 0.4 ? 'partial' : 'none';
}

/* ── Places ─────────────────────────────────────────────────────────────────────────────────────── */

export type PlaceTier = 'postcode' | 'district' | 'town' | 'none';
export const PLACE_TIER_WORDS: Record<Exclude<PlaceTier, 'none'>, string> = {
  postcode: 'Same postcode',
  district: 'Same postcode district',
  town: 'Same town',
};

/** Where the company's registered office is, against the listing. A registered office is often an
 *  accountant's address, so a different place is NOT evidence against — only the absence of evidence for. */
export function placeTier(listing: { postcode: string | null; town: string | null }, office: { postcode: string | null; text: string }): PlaceTier {
  if (listing.postcode && office.postcode && listing.postcode === office.postcode) return 'postcode';
  if (listing.postcode && office.postcode && outwardCode(listing.postcode) === outwardCode(office.postcode)) return 'district';
  const t = String(listing.town ?? '').trim().toLowerCase();
  if (t.length >= 3) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, 'i').test(office.text)) return 'town';
  }
  return 'none';
}

/* ── Candidates (the Companies House search API's items, read defensively) ─────────────────────── */

export interface ChCandidate {
  number: string;
  name: string;
  status: string | null;
  type: string | null;
  incorporatedOn: string | null;
  officeText: string;
  officePostcode: string | null;
  officeLocality: string | null;
}

const isoDate = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** One item of GET /search/companies → a candidate, or null when it is not a usable company record. */
export function candidateFromSearchItem(item: unknown): ChCandidate | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const number = typeof o.company_number === 'string' ? o.company_number.trim() : '';
  const name = typeof o.title === 'string' ? o.title.trim() : '';
  if (!number || !name) return null;
  const addr = (o.address && typeof o.address === 'object' ? o.address : {}) as Record<string, unknown>;
  const snippet = typeof o.address_snippet === 'string' ? o.address_snippet : '';
  const parts = [addr.premises, addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code].filter((x) => typeof x === 'string' && x.trim()) as string[];
  const officeText = snippet || parts.join(', ');
  return {
    number, name,
    status: typeof o.company_status === 'string' ? o.company_status : null,
    type: typeof o.company_type === 'string' ? o.company_type : null,
    incorporatedOn: isoDate(o.date_of_creation),
    officeText,
    officePostcode: postcodeOf(typeof addr.postal_code === 'string' ? addr.postal_code : officeText),
    officeLocality: typeof addr.locality === 'string' ? addr.locality : null,
  };
}

/** GET /company/{number} → the fields we keep, or null when malformed. */
export function profileFromApi(body: unknown): Partial<ChCandidate> | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  if (typeof o.company_number !== 'string' || typeof o.company_name !== 'string') return null;
  const ro = (o.registered_office_address && typeof o.registered_office_address === 'object' ? o.registered_office_address : {}) as Record<string, unknown>;
  return {
    number: o.company_number, name: o.company_name,
    status: typeof o.company_status === 'string' ? o.company_status : null,
    type: typeof o.type === 'string' ? o.type : null,
    incorporatedOn: isoDate(o.date_of_creation),
    officePostcode: postcodeOf(typeof ro.postal_code === 'string' ? ro.postal_code : ''),
    officeLocality: typeof ro.locality === 'string' ? ro.locality : null,
  };
}

/** Statuses that mean the company is trading as a company today. Anything else (dissolved, liquidation,
 *  administration, removed, closed…) or an absent status can never be a strong match. */
const LIVE_STATUS = new Set(['active']);
export const isLiveStatus = (s: string | null | undefined) => !!s && LIVE_STATUS.has(s);

/* ── The verdict ────────────────────────────────────────────────────────────────────────────────── */

export interface ChListing { name: string; postcode: string | null; town: string | null }
export interface ChVerdict {
  match: ChMatch;
  candidate: ChCandidate | null;
  evidence: string[];
  candidatesSeen: number;
}

type Scored = { c: ChCandidate; name: NameTier; place: PlaceTier; tier: ChMatch; rank: number };

/* ⛔ A company that is not trading (dissolved, liquidation, administration…) is never a match of any kind:
   its age says nothing about the business on Google today. Measured 2026-10-02: 9 of 21 "possible"
   matches in the first sample were dissolved companies. They are named in the "Not found" evidence. */
function tierFor(name: NameTier, place: PlaceTier, live: boolean): ChMatch {
  if (!live) return 'none';
  const strongShape =
    (name === 'exact' && place !== 'none') ||
    (name === 'close' && (place === 'postcode' || place === 'district')) ||
    (name === 'exact_generic' && place === 'postcode');
  if (strongShape) return 'strong';
  // A part-matching name at the same postcode is only possible: "HARRY LOCKS SUPPLIERS" and HARRY
  // CONCRETE SUPPLIERS share a building, not a business (measured 2026-10-02).
  const possibleShape =
    name === 'exact' ||
    (name === 'close' && place === 'town') ||
    (name === 'close' && place === 'none') ||
    (name === 'exact_generic' && (place === 'district' || place === 'town')) ||
    (name === 'partial' && place !== 'none');
  return possibleShape ? 'possible' : 'none';
}
const NAME_RANK: Record<NameTier, number> = { exact: 4, close: 3, exact_generic: 2, partial: 1, none: 0 };
const PLACE_RANK: Record<PlaceTier, number> = { postcode: 3, district: 2, town: 1, none: 0 };

/** Match a Google listing against Companies House search candidates. Strong only when the evidence is
 *  there AND no other company matches as well; two equally good candidates are a possible match. */
export function classifyCompaniesHouse(listing: ChListing, candidates: ChCandidate[]): ChVerdict {
  const seen = new Map<string, ChCandidate>();
  for (const c of candidates) if (c && !seen.has(c.number)) seen.set(c.number, c);
  const all: Scored[] = [...seen.values()].map((c) => {
    const name = nameTier(listing.name, c.name, listing.town);
    const place = placeTier(listing, { postcode: c.officePostcode, text: `${c.officeText} ${c.officeLocality ?? ''}` });
    const live = isLiveStatus(c.status);
    const tier = tierFor(name, place, live);
    return { c, name, place, tier, rank: (tier === 'strong' ? 100 : tier === 'possible' ? 50 : 0) + NAME_RANK[name] * 10 + PLACE_RANK[place] * 2 + (live ? 1 : 0) };
  });
  const closedNamesake = all.find((s) => !isLiveStatus(s.c.status) && (s.name === 'exact' || s.name === 'close'));
  const scored = all.filter((s) => s.tier !== 'none').sort((x, y) => y.rank - x.rank);

  if (!scored.length) {
    return { match: 'none', candidate: null, candidatesSeen: seen.size, evidence: [
      seen.size ? `${seen.size} Companies House record${seen.size === 1 ? '' : 's'} looked at — none matched this business` : 'No Companies House record matched this name',
      ...(closedNamesake ? [`A company with this name exists but is no longer trading (${statusWords(closedNamesake.c.status)}): ${closedNamesake.c.name}`] : []),
      'Sole traders and businesses trading under another name have no record to find — this is not "unregistered"',
    ] };
  }
  const best = scored[0];
  const evidence: string[] = [];
  if (best.name !== 'none') evidence.push(NAME_TIER_WORDS[best.name]);
  if (best.place !== 'none') evidence.push(PLACE_TIER_WORDS[best.place]);
  else evidence.push('Registered office is somewhere else (often an accountant’s address)');
  let match = best.tier;
  if (match === 'strong') {
    const rivals = scored.filter((s) => s !== best && s.tier === 'strong' && s.c.number !== best.c.number);
    if (rivals.length) {
      match = 'possible';
      evidence.push(`${rivals.length + 1} companies match equally well — cannot tell which`);
    }
  }
  if (match === 'possible' && best.tier === 'possible') {
    if (best.name === 'exact' && best.place === 'none') evidence.push('Nothing in the address confirms it is the same business');
    else if (best.name === 'exact_generic') evidence.push('Many businesses share a name like this — needs the same postcode to be sure');
  }
  return { match, candidate: best.c, evidence, candidatesSeen: seen.size };
}

/** "voluntary-arrangement" → "voluntary arrangement". */
export function statusWords(s: string | null | undefined): string {
  return s ? s.replace(/-/g, ' ') : 'not given';
}

/** The search phrases to try, in order (at most two): the listing's name, then — only when it differs —
 *  the name without its town words ("Ronnie's Shoe Repairs Wisbech" → "Ronnie's Shoe Repairs"). */
export function searchQueries(name: string, town: string | null): string[] {
  const first = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!first) return [];
  const townWords = new Set(nameTokens(town));
  const words = first.split(' ');
  const second = words.filter((w) => !townWords.has(w.toLowerCase().replace(/[^a-z0-9]/g, ''))).join(' ').replace(/[\s,–-]+$/, '').trim();
  return second && second.toLowerCase() !== first.toLowerCase() && nameTokens(second).length ? [first, second] : [first];
}

/* ── Age ────────────────────────────────────────────────────────────────────────────────────────── */

export type AgeBucket = 'new' | 'months' | 'years';
export interface BusinessAge { days: number; weeks: number; months: number; years: number; bucket: AgeBucket }

/** How old a company is from its incorporation date ('YYYY-MM-DD'), in whole calendar months and days.
 *  A date in the future (bad data) reads as zero days old. Null when there is no usable date. */
export function businessAge(incorporatedOn: string | null | undefined, now: Date): BusinessAge | null {
  const m = String(incorporatedOn ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const start = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(start)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.max(0, Math.floor((today - start) / 86_400_000));
  let months = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() - (mo - 1));
  if (now.getUTCDate() < d) months -= 1;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);
  const bucket: AgeBucket = months < CH_NEW_MONTHS ? 'new' : months < 12 ? 'months' : 'years';
  return { days, weeks: Math.floor(days / 7), months, years, bucket };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** The age as the cell says it: "NEW · 3 weeks", "NEW · 2 months", "8 months", "2 years". */
export function ageText(age: BusinessAge): string {
  if (age.bucket === 'new') {
    if (age.days < 7) return `NEW · ${plural(age.days, 'day')}`;
    if (age.months < 2) return `NEW · ${plural(Math.max(1, age.weeks), 'week')}`;
    return `NEW · ${plural(age.months, 'month')}`;
  }
  if (age.bucket === 'months') return plural(age.months, 'month');
  return plural(age.years, 'year');
}

/* ── The cell and the filter ────────────────────────────────────────────────────────────────────── */

/** What one result is. 'skipped' = has a website (or not UK) — never checked, shown as "—".
 *  'unavailable' = we tried and Companies House could not answer (no key, busy, down) — "Not checked".
 *  'checking' = in flight. null row + not checking + target = also "Not checked" (nothing ran yet). */
export type AgeState = 'skipped' | 'checking' | 'unavailable' | 'new' | 'months' | 'years' | 'possible' | 'not_found';

export function ageStateOf(isTarget: boolean, row: CompaniesHouseCheckRow | null | undefined, checking: boolean, now: Date): AgeState {
  if (!isTarget) return 'skipped';
  if (!row) return checking ? 'checking' : 'unavailable';
  if (row.match === 'possible') return 'possible';
  if (row.match === 'none') return 'not_found';
  if (row.match === 'strong') {
    const age = businessAge(row.incorporated_on, now);
    return age ? age.bucket : 'possible';
  }
  return 'unavailable';
}

export type AgeFilter = 'all' | 'new' | 'months' | 'years' | 'possible' | 'not_found' | 'not_checked';
export const AGE_FILTERS: { value: AgeFilter; label: string }[] = [
  { value: 'all', label: 'Any age' },
  { value: 'new', label: `New: under ${CH_NEW_MONTHS} months` },
  { value: 'months', label: `${CH_NEW_MONTHS}–12 months` },
  { value: 'years', label: '1+ years' },
  { value: 'possible', label: 'Possible match' },
  { value: 'not_found', label: 'Not found' },
  { value: 'not_checked', label: 'Not checked / has website' },
];
/** Does a result pass the business-age filter? Age is context, never an exclusion: 'all' shows every
 *  result, and a result still being checked shows only under 'all' (agency-filter precedent). */
export function passesAgeFilter(filter: AgeFilter, state: AgeState): boolean {
  if (filter === 'all') return true;
  if (filter === 'not_checked') return state === 'skipped' || state === 'unavailable';
  return state === filter;
}

/** The small boost: no website + a STRONG match + NEW. Never added, never contacted — only sorted up. */
export function isNewStrongMatch(isTarget: boolean, row: CompaniesHouseCheckRow | null | undefined, now: Date): boolean {
  return isTarget && !!row && row.match === 'strong' && businessAge(row.incorporated_on, now)?.bucket === 'new';
}

/* ── Freshness ──────────────────────────────────────────────────────────────────────────────────── */

/** What identifies the listing for matching. A different name or postcode = a fresh lookup. */
export function listingFingerprint(name: string | null | undefined, address: string | null | undefined): string {
  return `${normName(name)}|${postcodeOf(address) ?? ''}`;
}

export function cacheDaysFor(match: ChMatch): number {
  return match === 'strong' ? CH_STRONG_CACHE_DAYS : match === 'possible' ? CH_POSSIBLE_CACHE_DAYS : CH_NOT_FOUND_CACHE_DAYS;
}

/** Is a stored check still good to show and reuse? Same rules version, same listing, inside its window. */
export function isChCheckFresh(row: Pick<CompaniesHouseCheckRow, 'version' | 'checked_at' | 'match' | 'fingerprint'>, fingerprint: string, nowMs: number): boolean {
  if (Number(row.version) !== CH_CHECK_VERSION) return false;
  if (row.fingerprint !== fingerprint) return false;
  const t = Date.parse(row.checked_at);
  return Number.isFinite(t) && nowMs - t < cacheDaysFor(row.match) * 86_400_000;
}

/** The public Companies House page for a company number. */
export function companyProfileUrl(number: string): string {
  return `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(number)}`;
}
