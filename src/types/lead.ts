export type WebsiteStatus = 
  | 'NO_WEBSITE' 
  | 'DIRECTORY_ONLY' 
  | 'HAS_OWN_WEBSITE' 
  | 'UNCERTAIN';

export interface Lead {
  id: string;
  name: string;
  category?: string;
  address: string;
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

export type Country = 'UK' | 'AUS';

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
}
