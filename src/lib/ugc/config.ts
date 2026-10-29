/* UGC BRAND FINDER — the one place for its choices, actors, caps and cost estimates (docs/ugc-brand-finder.md).
 * Pure: imported by the SPA, the tests and fn ugc-brands (relative imports with .ts only).
 *
 * ⛔ SEPARATE FROM FINDABLE. Nothing here is a Findable price, cap or audit budget.
 * ⛔ The per-result rates are ESTIMATES from Apify's public price list at the FREE-plan rate (the highest), so
 *    the shown figure is a ceiling, not a bill. The run's real cost is Apify's own usageTotalUsd, recorded on
 *    ugc_runs.actual_cost_usd when it finishes. A rate stays a guess until a billed run agrees with it. */

export const JESS_PORTFOLIO_URL = 'https://www.jesscousin.com/';

export const UGC_NICHES = ['lifestyle', 'travel', 'tech', 'beauty', 'wellness'] as const;
export type UgcNiche = (typeof UGC_NICHES)[number];

/** Search words per niche for the ad library and Google (a brand advertising in the niche, not a creator). */
export const NICHE_KEYWORDS: Record<UgcNiche, readonly string[]> = {
  lifestyle: ['home decor', 'lifestyle brand', 'homeware'],
  travel: ['travel gear', 'luggage', 'boutique hotel'],
  tech: ['gadget', 'phone accessories', 'smart home'],
  beauty: ['skincare', 'makeup', 'haircare'],
  wellness: ['supplements', 'wellness', 'fitness'],
};

/** ISO-2 codes as the Meta Ad Library and Google take them. UK is GB to both. */
export const UGC_COUNTRIES = [
  { code: 'GB', label: 'UK' }, { code: 'US', label: 'US' }, { code: 'CA', label: 'Canada' }, { code: 'AU', label: 'Australia' },
  { code: 'SG', label: 'Singapore' }, { code: 'MY', label: 'Malaysia' }, { code: 'PH', label: 'Philippines' },
  { code: 'HK', label: 'Hong Kong' }, { code: 'TH', label: 'Thailand' },
] as const;
export type UgcCountry = (typeof UGC_COUNTRIES)[number]['code'];
export const isUgcCountry = (v: unknown): v is UgcCountry => UGC_COUNTRIES.some((c) => c.code === v);
export const isUgcNiche = (v: unknown): v is UgcNiche => (UGC_NICHES as readonly string[]).includes(String(v));

/** Thailand venue types for the Google Maps source (hotels, resorts, wellness, cafes). */
export const THAILAND_PLACE_TYPES = ['hotel', 'resort', 'wellness spa', 'cafe'] as const;
/** The local track starts in Chiang Mai (Jess). */
export const THAILAND_AREAS = ['Chiang Mai', 'Bangkok', 'Phuket', 'Koh Samui', 'Krabi'] as const;

export type UgcSource = 'fb_ads' | 'creator_collabs' | 'places' | 'google_search' | 'contacts' | 'named_contacts' | 'page_details';

export const UGC_ACTORS: Record<UgcSource, string> = {
  fb_ads: 'apify~facebook-ads-scraper',
  creator_collabs: 'apify~brand-collaboration-scraper',
  places: 'compass~crawler-google-places',
  google_search: 'apify~google-search-scraper',
  contacts: 'vdrmota~contact-info-scraper',
  /* The same actor with its Business Leads Enrichment switched on (named people + verified emails). */
  named_contacts: 'vdrmota~contact-info-scraper',
  /* The ads actor again, on each brand's OWN Ad Library page with its About tab: page age + admin countries. */
  page_details: 'apify~facebook-ads-scraper',
};

export const UGC_SOURCE_LABEL: Record<UgcSource, string> = {
  fb_ads: 'Brands running video ads',
  creator_collabs: 'Brands that paid other UGC creators',
  places: 'Thailand hotels, resorts, wellness & cafes',
  google_search: '"UGC creator wanted" searches',
  contacts: 'Find contacts',
  named_contacts: 'Find named marketing contacts',
  page_details: 'Check pages for dropshipping signs',
};

/** USD per billed unit at Apify's free-plan rate (ceiling). Unit: one ad / post / place / result page / scraped page. */
export const UGC_RATE_USD_PER_UNIT: Record<UgcSource, number> = {
  fb_ads: 5.80 / 1000,
  creator_collabs: 5.80 / 1000,
  places: 4.00 / 1000,
  google_search: 3.50 / 1000,
  contacts: 2.00 / 1000,
  named_contacts: 2.00 / 1000,
  page_details: 5.80 / 1000,
};

/* ── Named marketing contacts (the contact scraper's Business Leads Enrichment) ───────────────────────────────
   ⛔ UNCONFIRMED RATES. The actor's page does not publish the per-lead or per-verification price (2026-10-29), so
   these are deliberately high ceilings. Apify enforces the shown estimate as maxTotalChargeUsd, so a run can never
   cost more than it says — it may simply stop early. Replace both with the billed figure after the first run. */
export const ENRICH_LEAD_USD_CEILING = 0.02;
export const ENRICH_VERIFY_USD_CEILING = 0.005;
/** Named people asked for per brand (the actor's maximumLeadsEnrichmentRecords, per domain). */
export const ENRICH_LEADS_PER_BRAND = 3;
/** Top-ranked brands per run: default and ceiling. */
export const ENRICH_DEFAULT_TOP = 50;
export const ENRICH_MAX_TOP = 100;
/** The actor's department filter; job titles are then filtered again by MARKETING_TITLE. */
export const ENRICH_DEPARTMENTS = ['marketing'] as const;
/** Marketing / partnerships / social / brand roles only (Jess). */
export const MARKETING_TITLE = /\b(marketing|partnerships?|partner manager|influencer|creators?|ugc|social|brand|content|community|pr|public relations|communications|growth|ecommerce|e-commerce|digital)\b/i;
/** Each run also pays a small start charge on most pay-per-event actors; counted once per run. */
export const UGC_RUN_START_USD = 0.01;

/** Contacts: at most this many pages per website (the home page + two), plus the Linktree page and what it links to. */
export const CONTACT_PAGES_PER_SITE = 3;
/** Ceiling for the pages a Linktree adds (its own page and the sites it links to, each one hop). */
export const CONTACT_LINKTREE_EXTRA_PAGES = 4;

/** The item cap Jess picks per run, and the hard ceiling the server enforces whatever the browser sends. */
export const UGC_DEFAULT_ITEM_CAP = 50;
export const UGC_MAX_ITEM_CAP = 200;
/** Contacts: at most this many brands per press. */
export const UGC_MAX_CONTACT_BRANDS = 25;

/** AI pitch drafts per member per day (each is one small model call). */
export const UGC_MAX_PITCHES_PER_DAY = 100;
/** Writer, reviewer and research model (Paul, 2026-10-29: Claude Sonnet 5.5 if an Anthropic key is set server-side,
 *  else gpt-4o — no Anthropic key is set, so gpt-4o; gpt-4o-mini approved a draft that broke her rules). */
export const UGC_PITCH_MODEL = 'gpt-4o';

/** Page details (dropshipping signs) per run: default and ceiling, one result per brand. */
export const PAGE_DETAILS_DEFAULT = 25;
export const PAGE_DETAILS_MAX = 50;

/** UGC never runs when the shared Apify account is at or past this share of its monthly cap — stricter than
 *  Findable's own prospecting stop, so Jess's searches can never be what pushes Findable's client work to the cap. */
export const UGC_APIFY_STOP_PCT = 0.80;

/** The lowest maxTotalChargeUsd some Apify actors accept (contact scraper, live 400 on 2026-10-29). */
export const APIFY_MIN_CHARGE_USD = 0.5;

/** How many billed units a run can produce at most, for the estimate. */
export function billedUnits(source: UgcSource, itemCap: number, opts: { queries?: number; sites?: number } = {}): number {
  const cap = clampCap(itemCap);
  if (source === 'google_search') return Math.max(1, opts.queries ?? 1) * Math.max(1, Math.ceil(cap / 10));
  if (source === 'contacts' || source === 'named_contacts') return Math.max(0, opts.sites ?? 0) * (CONTACT_PAGES_PER_SITE + CONTACT_LINKTREE_EXTRA_PAGES);
  return cap;
}

/** The extra a named-contacts run can cost on top of its pages: every brand's leads, each verified. */
export function enrichmentExtraUsd(brands: number): number {
  return Math.max(0, brands) * ENRICH_LEADS_PER_BRAND * (ENRICH_LEAD_USD_CEILING + ENRICH_VERIFY_USD_CEILING);
}

export function clampCap(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return UGC_DEFAULT_ITEM_CAP;
  return Math.min(v, UGC_MAX_ITEM_CAP);
}

/** The most this run can cost, in USD (a ceiling, rounded up to the cent). Also sent to Apify as maxTotalChargeUsd. */
export function estimateRunUsd(source: UgcSource, itemCap: number, opts: { queries?: number; sites?: number } = {}): number {
  const extra = source === 'named_contacts' ? enrichmentExtraUsd(opts.sites ?? 0) : 0;
  const usd = billedUnits(source, itemCap, opts) * UGC_RATE_USD_PER_UNIT[source] + extra + UGC_RUN_START_USD;
  return Math.ceil(usd * 100) / 100;
}

export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '—';
  return `$${usd.toFixed(2)}`;
}

/** Why a run must not start, or null. Absent numbers fail closed: no Apify reading = no run. */
export function ugcSpendRefusal(a: { estUsd: number; spentThisMonthUsd: number; budgetUsd: number; apifyPct: number | null | undefined }): string | null {
  if (a.apifyPct == null || !Number.isFinite(a.apifyPct)) return 'apify_usage_unknown';
  if (a.apifyPct >= UGC_APIFY_STOP_PCT) return 'apify_account_near_cap';
  if (!(a.budgetUsd > 0)) return 'no_budget';
  if (a.spentThisMonthUsd + a.estUsd > a.budgetUsd) return 'over_monthly_budget';
  return null;
}

export const UGC_REFUSAL_TEXT: Record<string, string> = {
  apify_usage_unknown: 'Searches are paused: the shared Apify account usage could not be read. Try again later or ask Paul.',
  apify_account_near_cap: 'Searches are paused: the shared Apify account is close to its monthly limit. Ask Paul.',
  no_budget: 'No monthly search budget is set. Ask Paul.',
  over_monthly_budget: 'This run would go over your monthly search budget. Lower the item cap or ask Paul.',
  all_stop: 'Paid searches are paused by the admin right now.',
  not_ugc_member: 'This account does not have access to the UGC page.',
  bad_input: 'Something in the search was not valid. Check the fields and try again.',
  no_websites: 'None of the chosen brands has a website or Linktree to read.',
  apify_failed: 'Apify did not accept the run. Nothing was charged for it.',
};

export const UGC_STATUSES = ['new', 'researching', 'pitch_ready', 'needs_jess', 'contacted', 'replied', 'negotiating', 'won', 'not_interested', 'not_a_fit'] as const;
export type UgcStatus = (typeof UGC_STATUSES)[number];
export const UGC_STATUS_LABEL: Record<UgcStatus, string> = {
  new: 'New', researching: 'Researching', pitch_ready: 'Pitch ready', needs_jess: 'Needs Jess', contacted: 'Contacted', replied: 'Replied',
  negotiating: 'Negotiating', won: 'Won', not_interested: 'Not interested', not_a_fit: 'Not a fit',
};
/** Tones follow the app: information blue, waiting amber, money/positive green (teal), dead grey. */
export const UGC_STATUS_TONE: Record<UgcStatus, 'blue' | 'amber' | 'green' | 'purple' | 'grey' | 'red'> = {
  new: 'grey', researching: 'blue', pitch_ready: 'purple', needs_jess: 'amber', contacted: 'blue', replied: 'amber',
  negotiating: 'amber', won: 'green', not_interested: 'grey', not_a_fit: 'grey',
};
