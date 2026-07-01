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

export type RegionDensity = 'fine' | 'medium' | 'coarse';

export interface SearchFilters {
  keyword: string;
  location: string;
  radius: number;
  minRating?: number;
  minReviews?: number;
  requirePhone?: boolean;
  country?: Country;
  /** List-builder "cast wide" mode → search-leads returns the full discovered pool. */
  broad?: boolean;
  /** Region tiling mode → tile the area's bbox into a grid, merge + dedupe. */
  region?: boolean;
  /** Tile density for region mode (finer = more tiles = more coverage/cost). */
  density?: RegionDensity;
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
}
