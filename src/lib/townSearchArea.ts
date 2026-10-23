/* ══ WHERE A TOWN SEARCH LOOKS, AND HOW HARD (2026-10-23, feat/find-leads-coverage) ═══════════════════════════════
   Two rules for a "this town only" search (search-leads), and the prices the screens print for them. Pure, no I/O.
   Edge-reachable: relative imports with .ts only.

   1. THE TOWN BOX. A town search sends Google a hard rectangle: Google's own bounds for the town. In the UK those
      are 25–60 km². Several Australian ones are only the city centre (Bundaberg 1.6 × 1.4 km, Albury 9 km²,
      Rockhampton 5 km², Albany 5 km² — measured 2026-10-23 from geocode_cache), so most of the town was never asked
      about. Where an AUSTRALIAN box is under AU_SMALL_BOX_KM2, it is widened to a square of the in-town radius
      (inTown.ts townRadiusKm, √population ÷ 50) round the town's centre, joined with Google's own box so nothing
      Google counted is lost. No population (an unlisted place) → Google's box, unchanged. Other countries unchanged.

   2. STANDARD / THOROUGH. Standard is today's search: the box, up to 3 pages of 20, plus one nearby page.
      Thorough lays a grid of ~THOROUGH_TILE_KM tiles over the same box (at most THOROUGH_MAX_TILES), asks each tile
      for one page, and a second page only for a tile whose first page came back full — never more than
      THOROUGH_MAX_CALLS_PER_TOWN Google calls for one town, whatever the caller sends. Results are merged and
      de-duplicated by Google place id. Each tile is a hard rectangle too, so nothing comes from outside the box.

   ⛔ PRICES ARE DERIVED FROM THE BILLED RATE, NEVER TYPED: a page bills at Text Search (Enterprise), $0.035
      (marketView.ts MARKET_SEARCH_USD records the measurement); a geocode $0.005. The button prints the CAP for
      Thorough ("up to"), because how many second pages a town needs is only known after the search. */

export interface TownBox { latMin: number; latMax: number; lngMin: number; lngMax: number }

/** Google Text Search (Enterprise tier — the field mask asks for websiteUri), per page. */
export const TEXT_SEARCH_USD_PER_PAGE = 0.035;
/** Google Geocoding, per call. */
export const GEOCODE_USD = 0.005;

/** An Australian town box smaller than this (km²) is only the centre: widened from the population. */
export const AU_SMALL_BOX_KM2 = 25;

export const THOROUGH_TILE_KM = 3.5;
export const THOROUGH_MAX_TILES = 9;
/** The hard ceiling on Google text-search calls for ONE town on Thorough. Enforced server-side. */
export const THOROUGH_MAX_CALLS_PER_TOWN = 16;
/** The hard ceiling on Google text-search calls for ONE press of Find leads on Thorough (many towns). */
export const THOROUGH_MAX_CALLS_PER_PRESS = 100;
/** Towns one Thorough press may search: as many as fit under the press ceiling at the per-town ceiling. */
export const THOROUGH_MAX_TOWNS_PER_PRESS = Math.floor(THOROUGH_MAX_CALLS_PER_PRESS / THOROUGH_MAX_CALLS_PER_TOWN);

export type SearchDepth = 'standard' | 'thorough';
export const SEARCH_DEPTHS: readonly SearchDepth[] = ['standard', 'thorough'];
export const SEARCH_DEPTH_LABEL: Record<SearchDepth, string> = { standard: 'Standard', thorough: 'Thorough' };
export const SEARCH_DEPTH_PARAM = 'depth';

/** The depth a country starts on: Thorough for Australia (its towns are spread out), Standard everywhere else. */
export function defaultSearchDepth(country: string | null | undefined): SearchDepth {
  return /^(australia|au|aus)$/i.test(String(country ?? '').trim()) ? 'thorough' : 'standard';
}

/** A URL / stored value read back as a depth; anything else is null (the caller uses the country's default). */
export function parseSearchDepth(v: unknown): SearchDepth | null {
  return v === 'standard' || v === 'thorough' ? v : null;
}

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG = 111.320;

export function boxSizeKm(b: TownBox): { w: number; h: number } {
  const mid = (b.latMin + b.latMax) / 2;
  return {
    h: Math.max(0, (b.latMax - b.latMin) * KM_PER_DEG_LAT),
    w: Math.max(0, (b.lngMax - b.lngMin) * KM_PER_DEG_LNG * Math.cos((mid * Math.PI) / 180)),
  };
}
export function boxAreaKm2(b: TownBox): number { const s = boxSizeKm(b); return s.w * s.h; }

/** A square of ± halfKm round a point. */
export function squareBox(centre: { lat: number; lng: number }, halfKm: number): TownBox {
  const dLat = halfKm / KM_PER_DEG_LAT;
  const dLng = halfKm / (KM_PER_DEG_LNG * Math.cos((centre.lat * Math.PI) / 180));
  return { latMin: centre.lat - dLat, latMax: centre.lat + dLat, lngMin: centre.lng - dLng, lngMax: centre.lng + dLng };
}

const isAu = (c: string | null | undefined) => /^(australia|au|aus)$/i.test(String(c ?? '').trim());

/**
 * The box a town search sends (rule 1). `radiusKm` is the town's in-town radius (inTown.ts townRadiusKm for this
 * country and population), or null when the population is unknown. Answers Google's box unchanged unless it is an
 * Australian box under AU_SMALL_BOX_KM2 and a radius is known.
 */
export function townSearchBox(
  google: TownBox, centre: { lat: number; lng: number }, country: string | null | undefined, radiusKm: number | null,
): { box: TownBox; widened: boolean } {
  if (!isAu(country) || !radiusKm || !(radiusKm > 0) || boxAreaKm2(google) >= AU_SMALL_BOX_KM2) return { box: google, widened: false };
  const sq = squareBox(centre, radiusKm);
  const box = {
    latMin: Math.min(google.latMin, sq.latMin), latMax: Math.max(google.latMax, sq.latMax),
    lngMin: Math.min(google.lngMin, sq.lngMin), lngMax: Math.max(google.lngMax, sq.lngMax),
  };
  return { box, widened: boxAreaKm2(box) > boxAreaKm2(google) + 0.01 };
}

/** Thorough's tiles over a box: ~THOROUGH_TILE_KM squares, the spacing grown 10% at a time until at most
 *  THOROUGH_MAX_TILES fit. Each tile is a rectangle of the box (no gaps, no overlap). */
export function thoroughTiles(b: TownBox): { tiles: TownBox[]; cols: number; rows: number; tileKm: number } {
  const { w, h } = boxSizeKm(b);
  let s = THOROUGH_TILE_KM;
  let cols = Math.max(1, Math.ceil(w / s)), rows = Math.max(1, Math.ceil(h / s));
  while (cols * rows > THOROUGH_MAX_TILES) {
    s *= 1.1;
    cols = Math.max(1, Math.ceil(w / s)); rows = Math.max(1, Math.ceil(h / s));
  }
  const tiles: TownBox[] = [];
  const dLat = (b.latMax - b.latMin) / rows, dLng = (b.lngMax - b.lngMin) / cols;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      tiles.push({ latMin: b.latMin + j * dLat, latMax: b.latMin + (j + 1) * dLat, lngMin: b.lngMin + i * dLng, lngMax: b.lngMin + (i + 1) * dLng });
    }
  }
  return { tiles, cols, rows, tileKm: Math.round(Math.max(w / cols, h / rows) * 10) / 10 };
}

/** The most one Thorough town can cost (USD): one geocode + the per-town call ceiling. */
export const THOROUGH_MAX_USD_PER_TOWN = GEOCODE_USD + THOROUGH_MAX_CALLS_PER_TOWN * TEXT_SEARCH_USD_PER_PAGE;
