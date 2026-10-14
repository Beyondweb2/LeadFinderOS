import { SUGGESTED_LOCATIONS } from './locationPicker.ts';
import { coverageTownKey } from './coverageState.ts';

/* ══ COVERAGE OUTSIDE THE UK: MALAYSIA AND SINGAPORE (2026-10-14) ═══════════════════════════════════════════════
   The UK list is uk_towns (ONS Built-Up Areas, with populations) and is unchanged. Malaysia and Singapore have no
   such table here, so their towns are THIS list: Find Leads' own suggestions for each country (SUGGESTED_LOCATIONS,
   reused, never copied) plus a few towns the first imported lead file named. ⛔ No population figures: we have no
   source for them in the app, so none is shown and the population filter does not apply — never an invented number.

   A lead counts for a country only when its OWN `country` says so (Google's address or the import's country), and
   its town is read through resolveCoverageTown — imported city text is messy ("Kuala Lumpur (Cheras)", "Ipoh, Perak",
   "Penang", "Skudai (Johor Bahru)"). A Malaysian town that is not on the list still shows, as its own row, so no
   lead is lost; a Singapore lead whose area is not on the list counts under Singapore itself (it is one city).
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type CoverageCountry = 'UK' | 'Malaysia' | 'Singapore';
export const COVERAGE_COUNTRIES: readonly CoverageCountry[] = ['UK', 'Malaysia', 'Singapore'];
export const DEFAULT_COVERAGE_COUNTRY: CoverageCountry = 'UK';
export const COVERAGE_COUNTRY_LABEL: Record<CoverageCountry, string> = { UK: 'United Kingdom', Malaysia: 'Malaysia', Singapore: 'Singapore' };

/** A URL / stored value read back as a Coverage country; anything else is the UK (the default, as before). */
export function normaliseCoverageCountry(v: unknown): CoverageCountry {
  return (COVERAGE_COUNTRIES as readonly unknown[]).includes(v) ? (v as CoverageCountry) : DEFAULT_COVERAGE_COUNTRY;
}

export interface AbroadTown {
  /** Shown, searched and keyed — the same name Find Leads suggests. */
  name: string;
  /** Malaysian state / Singapore region. */
  region: string | null;
  /** Another name people use for it, shown small beside it ("Penang", "Malacca"). */
  aka?: string;
  /** Other ways a lead's city may be written (matched after normalising). */
  aliases?: string[];
}

/* Region per town: Malaysian states / federal territories, Singapore's URA regions. Facts, not figures. */
const MY_INFO: Record<string, Omit<AbroadTown, 'name'>> = {
  'Kuala Lumpur': { region: 'Kuala Lumpur', aliases: ['kl', 'wilayah persekutuan kuala lumpur'] },
  'Petaling Jaya': { region: 'Selangor', aliases: ['pj'] },
  'Shah Alam': { region: 'Selangor' },
  'Subang Jaya': { region: 'Selangor', aliases: ['subang'] },
  'Klang': { region: 'Selangor' },
  'Johor Bahru': { region: 'Johor', aliases: ['johor baharu', 'jb'] },
  'George Town': { region: 'Penang', aka: 'Penang', aliases: ['georgetown', 'penang', 'pulau pinang', 'penang island'] },
  'Ipoh': { region: 'Perak' },
  'Seremban': { region: 'Negeri Sembilan' },
  'Melaka': { region: 'Melaka', aka: 'Malacca', aliases: ['malacca', 'melaka city', 'malacca city', 'bandar melaka'] },
  'Kuching': { region: 'Sarawak' },
  'Kota Kinabalu': { region: 'Sabah', aliases: ['kk'] },
  'Kuantan': { region: 'Pahang' },
  'Alor Setar': { region: 'Kedah', aliases: ['alor star'] },
  'Kuala Terengganu': { region: 'Terengganu' },
  'Kota Bharu': { region: 'Kelantan' },
  'Cyberjaya': { region: 'Selangor' },
  'Putrajaya': { region: 'Putrajaya' },
};
/* Towns the first imported file (Ethan's language schools, 2026-10-14) named that Find Leads does not suggest. */
const MY_EXTRA: AbroadTown[] = [
  { name: 'Kajang', region: 'Selangor' },
  { name: 'Puchong', region: 'Selangor' },
  { name: 'Batu Pahat', region: 'Johor' },
  { name: 'Kluang', region: 'Johor' },
  { name: 'Kulai', region: 'Johor' },
  { name: 'Muar', region: 'Johor' },
  { name: 'Sibu', region: 'Sarawak' },
  { name: 'Bintulu', region: 'Sarawak' },
  { name: 'Taiping', region: 'Perak' },
  { name: 'Sungai Petani', region: 'Kedah' },
];
const SG_REGION: Record<string, string> = {
  'Orchard': 'Central', 'Marina Bay': 'Central', 'Bukit Timah': 'Central',
  'Jurong East': 'West', 'Clementi': 'West',
  'Tampines': 'East', 'Bedok': 'East', 'Changi': 'East',
  'Woodlands': 'North', 'Ang Mo Kio': 'North-East',
};

export const ABROAD_TOWNS: Record<Exclude<CoverageCountry, 'UK'>, readonly AbroadTown[]> = {
  Malaysia: [
    ...SUGGESTED_LOCATIONS.Malaysia.map((name) => ({ name, region: null, ...MY_INFO[name] })),
    ...MY_EXTRA,
  ],
  /* Singapore itself first: most Singapore businesses give the city, not an area. */
  Singapore: [
    { name: 'Singapore', region: null },
    ...SUGGESTED_LOCATIONS.Singapore.map((name) => ({ name, region: SG_REGION[name] ?? null })),
  ],
};

/** Lowercase, accents and punctuation gone, spaces collapsed. */
function key(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const INDEX: Record<Exclude<CoverageCountry, 'UK'>, Map<string, string>> = { Malaysia: new Map(), Singapore: new Map() };
for (const c of ['Malaysia', 'Singapore'] as const) {
  for (const t of ABROAD_TOWNS[c]) {
    INDEX[c].set(key(t.name), t.name);
    for (const a of t.aliases ?? []) INDEX[c].set(key(a), t.name);
  }
}

/** A city as written, in pieces: outside brackets first (split on , ; /), then what was in brackets. */
function pieces(raw: string): string[] {
  const s = String(raw ?? '');
  const inBrackets = [...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const outside = s.replace(/\([^)]*\)/g, ' ');
  return [...outside.split(/[,;/]/), ...inBrackets.flatMap((b) => b.split(/[,;/]/))].map((p) => p.trim()).filter(Boolean);
}

export interface ResolvedTown {
  /** The Coverage row this counts under. */
  name: string;
  /** false = not on the list: a row of its own, named as the lead names it. */
  listed: boolean;
}

/**
 * The Coverage town a Malaysian / Singapore lead's city counts under. The first piece that is a listed town (or
 * one of its other names) wins: "Kuala Lumpur (Cheras)" → Kuala Lumpur, "Ipoh, Perak" → Ipoh, "Penang" → George
 * Town, "Skudai (Johor Bahru)" → Johor Bahru, "Kuala Lumpur, Malaysia" (a Find Leads search) → Kuala Lumpur.
 * Nothing listed: Singapore → Singapore itself; Malaysia → the first piece as written ("Pasir Gudang (Masai)" →
 * Pasir Gudang). Blank → null (counted nowhere, like a UK lead with no town).
 */
export function resolveCoverageTown(country: Exclude<CoverageCountry, 'UK'>, raw: string | null | undefined): ResolvedTown | null {
  const ps = pieces(raw ?? '').filter((p) => key(p) && key(p) !== 'malaysia');
  for (const p of ps) {
    const hit = INDEX[country].get(key(p));
    if (hit) return { name: hit, listed: true };
  }
  if (country === 'Singapore') return String(raw ?? '').trim() ? { name: 'Singapore', listed: true } : null;
  const first = ps.find((p) => key(p) !== 'singapore');
  return first ? { name: first.replace(/\s+/g, ' '), listed: false } : null;
}

/**
 * Which of the two countries a SEARCH RUN's location is in (runs store no country). Find Leads writes
 * "Kuala Lumpur, Malaysia" / "Orchard, Singapore"; a bare listed town ("Kuala Lumpur") counts too. Anything else
 * is null — a UK run stays in the UK view exactly as before.
 */
export function abroadCountryOfLocation(location: string | null | undefined): Exclude<CoverageCountry, 'UK'> | null {
  const k = key(String(location ?? ''));
  if (!k) return null;
  if (k === 'malaysia' || k.endsWith(' malaysia')) return 'Malaysia';
  if (k === 'singapore' || k.endsWith(' singapore')) return 'Singapore';
  const first = pieces(String(location ?? ''))[0] ?? '';
  if (INDEX.Malaysia.has(key(first))) return 'Malaysia';
  if (INDEX.Singapore.has(key(first))) return 'Singapore';
  return null;
}

/** A lead's stored country as one of the two (exact words the app stores), else null. */
export function abroadCountryOfLead(country: string | null | undefined): Exclude<CoverageCountry, 'UK'> | null {
  return country === 'Malaysia' || country === 'Singapore' ? country : null;
}

/** The Coverage key a row is joined on — the same normalisation as the UK rows. */
export const abroadTownKey = (name: string) => coverageTownKey(name);

/* ══ THE PAIRS, PER COUNTRY ═════════════════════════════════════════════════════════════════════════════════════
   The coverage endpoint sends every lead pair with the lead's own country. Before the existing folds run
   (countLeadsByPair, workersByPair, foundAddedByPair — unchanged), the pairs are cut to the chosen country:
   · UK: every pair EXCEPT a Malaysia / Singapore lead's — exactly what the UK view always counted (no UK town
     can match those), and every search run, as before.
   · Malaysia / Singapore: only that country's leads, and only runs whose location is in it, each town rewritten
     to the Coverage row it counts under (resolveCoverageTown). Towns not on the list come back as extra rows. */
export interface CountryPair { trade: string; town: string; country?: string | null }
export interface CountryWorkedBy { trade: string; town: string; country?: string | null; users: ReadonlyArray<{ id: string; n?: number }> }
export interface CountryRun { trade: string; town: string; found: Record<string, boolean> | null; added: Record<string, boolean> | null }
export interface CountryPairsIn { leads: CountryPair[]; worked: CountryPair[]; workedBy?: CountryWorkedBy[]; runs?: CountryRun[] }
export interface CountryPairsOut {
  leads: CountryPair[]; worked: CountryPair[]; workedBy?: CountryWorkedBy[]; runs?: CountryRun[];
  /** Malaysian towns named by leads / searches that are not on the list, in first-seen order. */
  extraTowns: AbroadTown[];
}

export function pairsForCountry(country: CoverageCountry, p: CountryPairsIn): CountryPairsOut {
  if (country === 'UK') {
    const uk = <T extends { country?: string | null }>(xs: readonly T[]) => xs.filter((x) => abroadCountryOfLead(x.country) === null);
    return { leads: uk(p.leads), worked: uk(p.worked), workedBy: p.workedBy ? uk(p.workedBy) : undefined, runs: p.runs, extraTowns: [] };
  }
  const extras = new Map<string, AbroadTown>();
  const place = <T extends { town: string }>(x: T): T | null => {
    const r = resolveCoverageTown(country, x.town);
    if (!r) return null;
    if (!r.listed && !extras.has(abroadTownKey(r.name))) extras.set(abroadTownKey(r.name), { name: r.name, region: null });
    return { ...x, town: r.name };
  };
  const mine = <T extends { town: string; country?: string | null }>(xs: readonly T[]) =>
    xs.filter((x) => abroadCountryOfLead(x.country) === country).map(place).filter((x): x is T => x !== null);
  const runs = p.runs
    ? p.runs.filter((r) => abroadCountryOfLocation(r.town) === country).map(place).filter((x): x is CountryRun => x !== null)
    : undefined;
  return {
    leads: mine(p.leads), worked: mine(p.worked), workedBy: p.workedBy ? mine(p.workedBy) : undefined, runs,
    extraTowns: [...extras.values()],
  };
}
