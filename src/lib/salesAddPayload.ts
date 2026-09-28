/* ══ WHAT A SALESPERSON'S "ADD TO CRM" SENDS (2026-09-28) ═══════════════════════════════════════
   ⛔ ONE MAPPING from a Find Leads result (+ the Place Details lookup + the search behind it) to the
   sales_add_lead payload, so the phone cannot be dropped by one caller and kept by another. Every
   value is one the search or Google actually returned — nothing is invented: an absent field is
   sent as null and the database stores null.
   The lookup wins over the search result for the fields it owns (the search never carries a phone or
   an address today); the search result wins for the website and the listing category, which the
   admin's add also takes from the result. */

export interface SearchResultForAdd {
  id?: string | null;
  name: string;
  phone?: string | null;
  address?: string | null;
  category?: string | null;
  googleMapsUrl?: string | null;
  websiteUrl?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
}

/** google-place-details' answer (the fields this payload reads). */
export interface PlaceDetailsForAdd {
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  category?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  derivedTown?: string | null;
  /** null = a town was found; a string = why not; ABSENT = an old deploy that never looked. */
  townNote?: string | null;
}

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
};
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function salesAddPayload(a: {
  lead: SearchResultForAdd;
  details: PlaceDetailsForAdd | null;
  email?: string | null;
  searchKeyword: string;
  searchLocation: string | null;
  country: string;
  listType: string;
  campaignId: string | null;
}): Record<string, unknown> {
  const d = a.details ?? {};
  const townChecked = !!a.details && d.townNote !== undefined;
  return {
    business_name: a.lead.name,
    phone: str(a.lead.phone) ?? str(d.phone),
    google_maps_url: str(a.lead.googleMapsUrl),
    address: str(a.lead.address) ?? str(d.address),
    category: str(a.lead.category) ?? str(d.category),
    search_keyword: a.searchKeyword,
    search_location: str(a.searchLocation),
    website: str(a.lead.websiteUrl) ?? str(d.website),
    email: str(a.email),
    country: a.country,
    list_type: a.listType,
    campaign_id: a.campaignId,
    place_id: str(a.lead.id),
    rating: num(a.lead.rating) ?? num(d.rating),
    review_count: num(a.lead.reviewCount) ?? num(d.reviewCount),
    derived_town: townChecked ? str(d.derivedTown) : null,
    town_checked: townChecked,
    town_fetch_note: townChecked ? str(d.townNote) : null,
  };
}
