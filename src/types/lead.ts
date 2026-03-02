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
}

export interface SearchResponse {
  leads: Lead[];
  totalFound: number;
  searchId: string;
  source?: string;
  cached?: boolean;
}
