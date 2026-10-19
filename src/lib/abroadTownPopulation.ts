/* ══ APPROXIMATE POPULATIONS FOR THE MALAYSIA AND SINGAPORE COVERAGE TOWNS (2026-10-15) ═══════════════════════════
   A FIXED table, typed in from the sources below and checked against them by hand (the per-figure record is
   docs/coverage-my-sg-population.md). No live API is called, ever.

   ⛔ NEVER AN INVENTED NUMBER. A town with no clean source figure is `null` and shows blank — never 0, never a
      neighbour's figure, never the district a town only sits inside (Cyberjaya is one corner of Sepang district;
      Puchong is split between two councils; "Marina Bay" is not a planning area).
   ⛔ EVERY FIGURE IS APPROXIMATE. Malaysia's are the local-authority (council) area or, where that is not listed, the
      district — boundaries wider than the town people mean. Singapore's are RESIDENTS only (citizens + PRs), so a
      business district (Orchard, Changi) reads small.
   ⛔ SINGAPORE AS A WHOLE HAS NO FIGURE HERE and no population filter: it is one city, its row is the catch-all for
      leads that give no area, and a 4.2 million figure beside ten planning areas would read as one more town.
   The table holds only the towns Coverage already lists (coverageCountries.ts ABROAD_TOWNS). Since 2026-10-19 a
   Malaysian town the table leaves blank, or does not list, falls back to GeoNames' figure for the place itself
   (townPopulation below; the dataset is src/data/malaysiaPlaces.ts).
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

import { datasetPlace, MALAYSIA_PLACES_SOURCE } from './malaysiaPlaces.ts';

export type PopulationCountry = 'Malaysia' | 'Singapore';

export interface PopulationSource {
  /** Shown beside the table. */
  label: string;
  /** The year the figures describe. */
  year: number;
  url: string;
}

export const MY_COUNCIL_SOURCE: PopulationSource = {
  label: 'DOSM Population and Housing Census of Malaysia 2020, local-authority areas (via Wikipedia, List of cities and towns in Malaysia by population)',
  year: 2020,
  url: 'https://en.wikipedia.org/wiki/List_of_cities_and_towns_in_Malaysia_by_population',
};
export const MY_DISTRICT_SOURCE: PopulationSource = {
  label: 'DOSM Population and Housing Census of Malaysia 2020, districts (via Wikipedia, List of districts in Malaysia)',
  year: 2020,
  url: 'https://en.wikipedia.org/wiki/List_of_districts_in_Malaysia',
};
export const SG_SOURCE: PopulationSource = {
  label: 'Singapore Department of Statistics, Singapore Residents by Planning Area / Subzone, June 2026',
  year: 2026,
  url: 'https://www.singstat.gov.sg/find-data/explore-data-themes/population/geographic-distribution/latest-news-data',
};

export interface TownPopulation {
  /** Approximate; null = no source figure (shown blank). */
  population: number | null;
  /** What the figure covers ("Petaling Jaya City Council area", "Sibu District", "Tampines planning area"). */
  basis: string | null;
  source: PopulationSource | null;
}

const council = (population: number, basis: string): TownPopulation => ({ population, basis, source: MY_COUNCIL_SOURCE });
const district = (population: number, basis: string): TownPopulation => ({ population, basis, source: MY_DISTRICT_SOURCE });
const area = (population: number, name: string): TownPopulation => ({ population, basis: `${name} planning area, residents`, source: SG_SOURCE });
const blank = (basis: string): TownPopulation => ({ population: null, basis, source: null });

export const TOWN_POPULATION: Record<PopulationCountry, Readonly<Record<string, TownPopulation>>> = {
  Malaysia: {
    'Kuala Lumpur': council(1_982_112, 'Federal Territory of Kuala Lumpur'),
    'Petaling Jaya': council(771_687, 'Petaling Jaya City Council area'),
    'Shah Alam': council(812_327, 'Shah Alam City Council area'),
    'Subang Jaya': council(902_086, 'Subang Jaya City Council area'),
    'Klang': council(902_025, 'Klang Royal City Council area'),
    'Johor Bahru': council(858_118, 'Johor Bahru City Council area'),
    'George Town': council(794_313, 'Penang Island City Council area'),
    'Ipoh': council(759_952, 'Ipoh City Council area'),
    'Seremban': council(681_541, 'Seremban City Council area'),
    'Melaka': council(453_904, 'Malacca City Council area'),
    'Kuching': council(349_147, 'Kuching North and South councils'),
    'Kota Kinabalu': council(500_425, 'Kota Kinabalu City Hall area'),
    'Kuantan': council(548_014, 'Kuantan City Council area'),
    'Alor Setar': council(423_868, 'Alor Setar City Council area'),
    'Kuala Terengganu': council(375_424, 'Kuala Terengganu City Council area'),
    'Kota Bharu': council(396_193, 'Kota Bharu Municipal Council area'),
    'Cyberjaya': blank('No figure of its own: part of Sepang district'),
    'Putrajaya': district(109_202, 'Federal Territory of Putrajaya'),
    'Kajang': council(1_047_356, 'Kajang Municipal Council area'),
    'Puchong': blank('No figure of its own: split between Subang Jaya and Petaling Jaya councils'),
    'Batu Pahat': council(401_210, 'Batu Pahat Municipal Council area'),
    'Kluang': district(323_762, 'Kluang District'),
    'Kulai': council(294_156, 'Kulai Municipal Council area'),
    'Muar': council(314_776, 'Muar Municipal Council area'),
    'Sibu': district(248_064, 'Sibu District'),
    'Bintulu': district(178_646, 'Bintulu District'),
    'Taiping': district(304_023, 'Larut, Matang and Selama District'),
    'Sungai Petani': council(545_053, 'Sungai Petani Municipal Council area'),
  },
  Singapore: {
    'Singapore': blank('The whole city: no town figure'),
    'Orchard': area(1_550, 'Orchard'),
    'Marina Bay': blank('Not a planning area: spans Downtown Core and Marina South'),
    'Jurong East': area(72_160, 'Jurong East'),
    'Tampines': area(296_060, 'Tampines'),
    'Woodlands': area(255_280, 'Woodlands'),
    'Ang Mo Kio': area(159_330, 'Ang Mo Kio'),
    'Bedok': area(272_120, 'Bedok'),
    'Clementi': area(104_350, 'Clementi'),
    'Bukit Timah': area(86_720, 'Bukit Timah'),
    'Changi': area(1_950, 'Changi'),
  },
};

/* ══ MALAYSIA'S SECOND SOURCE: GEONAMES (2026-10-19) ══════════════════════════════════════════════════════════════
   The council / district table above stays first and unchanged. A Malaysian town it has no figure for (Cyberjaya,
   Puchong, every town only a lead named) takes GeoNames' own figure for a place of exactly that name — in the state
   the row names when it names one (malaysiaPlaces.ts datasetPlace). Two same-named places with no state to choose
   between, or no place at all → still blank. Never a district, never a neighbour. */
export const MY_GEONAMES_SOURCE: PopulationSource = {
  label: `${MALAYSIA_PLACES_SOURCE.label} (downloaded ${MALAYSIA_PLACES_SOURCE.downloaded})`,
  year: Number(MALAYSIA_PLACES_SOURCE.downloaded.slice(0, 4)),
  url: MALAYSIA_PLACES_SOURCE.url,
};

/** The approximate figure for a town: the fixed table first; for Malaysia, GeoNames' figure for the place itself
 *  when the table has none (`state` = the row's state, to tell same-named places apart); otherwise blank. */
export function townPopulation(country: PopulationCountry, name: string, state?: string | null): TownPopulation {
  const tabled = TOWN_POPULATION[country][name];
  if (tabled && tabled.population !== null) return tabled;
  if (country === 'Malaysia') {
    const d = datasetPlace(name, state ?? null);
    if (d && d !== 'ambiguous') return { population: d.population, basis: `GeoNames figure for ${d.name} (${d.state}), the place itself`, source: MY_GEONAMES_SOURCE };
  }
  return tabled ?? { population: null, basis: null, source: null };
}

/** The sources a country's figures come from, for the note under the table. */
export function populationSourcesFor(country: PopulationCountry): PopulationSource[] {
  const seen = new Map<string, PopulationSource>();
  for (const t of Object.values(TOWN_POPULATION[country])) if (t.source) seen.set(t.source.url, t.source);
  if (country === 'Malaysia') seen.set(MY_GEONAMES_SOURCE.url, MY_GEONAMES_SOURCE);
  return [...seen.values()];
}

/** The population filter is offered for the UK and Malaysia only — never for Singapore (one city). */
export function populationFilterShown(country: 'UK' | PopulationCountry): boolean {
  return country !== 'Singapore';
}

/** Malaysia's population filter: a blank bound is no bound; with no bound at all every town shows (blank figures
 *  included). Once a bound is set, a town with no figure is left out — the UK rule (coverageState applyFilters):
 *  an unknown size is never treated as fitting. */
export function filterByPopulationBand<T extends { population: number | null }>(
  rows: readonly T[], band: { min: number | null; max: number | null },
): T[] {
  if (band.min === null && band.max === null) return [...rows];
  return rows.filter((r) => r.population !== null
    && (band.min === null || r.population >= band.min)
    && (band.max === null || r.population <= band.max));
}
