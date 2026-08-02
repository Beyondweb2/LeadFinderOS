export type WebsiteStatus = 
  | 'NO_WEBSITE' 
  | 'DIRECTORY_ONLY' // kept for backward compat, treated as NO_WEBSITE everywhere
  | 'HAS_OWN_WEBSITE' 
  | 'UNCERTAIN';

export interface Lead {
  id: string;
  name: string;
  category?: string;
  address?: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  googleMapsUrl: string;
  websiteUrl?: string;
  websiteStatus: WebsiteStatus;
  confidence: number;
  reason: string;
  businessStatus?: string;
  isExpanded?: boolean;
}

export type Country = 'UK' | 'Australia' | 'USA' | 'Canada' | 'Germany' | 'France' | 'Spain' | 'Italy' | 'Netherlands' | 'Belgium' | 'Ireland' | 'NewZealand' | 'SouthAfrica' | 'India' | 'Singapore' | 'UAE' | 'Brazil' | 'Mexico' | 'Japan' | 'Sweden';

export interface SearchFilters {
  keyword: string;
  location: string;
  radius: number;
  minRating?: number;
  minReviews?: number;
  requirePhone?: boolean;
  country?: Country;
  /** Region tiling mode (radius slider past 50km) → tile a bbox of centre ± radius,
   *  merge + dedupe. Density defaults server-side (medium 8km, auto-coarsened). */
  region?: boolean;
  /** "This town only" → the server swaps the soft locationBias circle for a HARD
   *  locationRestriction rectangle built from the town's geocoded bounds. The radius
   *  is IGNORED in this mode, and the no-website expansion sweep is skipped (it would
   *  search outside the town). Absent/false = today's radius behaviour, unchanged. */
  townOnly?: boolean;
}

/** Grid the region search actually used (echoed back for the results banner). */
export interface RegionMeta {
  area: string;
  tilesTotal: number;
  tilesSucceeded: number;
  cols: number;
  rows: number;
  spacingKm: number;
  effectiveSpacingKm: number;
  coarsened: boolean;
  totalResults: number;
  cappedAt: number | null;
}

export interface SearchResponse {
  leads: Lead[];
  totalFound: number;
  searchId: string;
  source?: string;
  cached?: boolean;
  expanded?: boolean;
  gated?: boolean;
  /** Present when the search ran in region tiling mode. */
  region?: RegionMeta;
  /** Present when region mode was downgraded to a single search (daily budget). */
  downgraded?: { reason: string; spentUsd: number };
  /** Present ONLY when townOnly was requested. `applied: false` means the town had no
   *  geocoded boundary and the search silently widened to the radius — it always carries
   *  a `reason`, and it must be shown, not swallowed. */
  townFilter?: { requested: true; applied: boolean; reason?: string };
  /** Handled "couldn't resolve that location" — empty leads + a friendly notice
   *  (a clean 2xx, not an error). */
  notFound?: boolean;
  /** Handled "map lookup temporarily unavailable" — empty leads + a try-again notice. */
  serviceIssue?: boolean;
  /** Friendly message to show for notFound / serviceIssue (in place of results). */
  notice?: string;
}
