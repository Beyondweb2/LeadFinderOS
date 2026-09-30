/* ════════════════════════════════════════════════════════════════════════════════════════════════
   API COST ACCURACY (2026-09-30, docs/sales-workflow-nav.md §Release B). Paul: "when the dashboard
   reports expenditure, it must clearly distinguish real Findable costs from estimates, promotional
   credits and unrelated historical usage."
   ⛔ FOUR DIFFERENT THINGS, NEVER ONE NUMBER:
   1. RECORDED USAGE VALUE — what our own code logged when it spent (api_usage_log). An ESTIMATE:
      Google = calls × list price; OpenAI = measured tokens × list price; Apify = the cost Apify
      reported for each run.
   2. GOOGLE AFTER ITS FREE MONTHLY ALLOWANCE — calls above each SKU's free cap × that SKU's price.
      Still an ESTIMATE, and NOT a bill: Google counts the cap across every project on the billing
      account, and trial / promotional credits are not visible here.
   3. CONFIRMED CHARGES — only from real billing data. None is connected, so it reads "not available".
   4. NOT FINDABLE / UNALLOCATED — historical usage that cannot be shown to be Findable's.
   ⛔ NOTHING IS DELETED OR ZEROED: every recorded row is counted in exactly one ownership bucket.
   Pure and edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Findable's work began with its first AI visibility audit: the first apify_ai_search row in
 *  api_usage_log is 2026-07-11 (read 2026-09-30). Lead finding before it cannot be shown to be
 *  Findable's — it is Unallocated, never assumed. */
export const FINDABLE_START_ISO = '2026-07-11T00:00:00Z';

export type CostOwner = 'findable' | 'testing' | 'legacy' | 'unallocated';
export const COST_OWNER_LABEL: Record<CostOwner, string> = {
  findable: 'Findable',
  testing: 'Findable testing / development',
  legacy: 'Legacy project · Not Findable',
  unallocated: 'Unallocated',
};
export const COST_OWNER_RULE: Record<CostOwner, string> = {
  findable: 'Findable work from its first audit on, including background jobs with no person attached',
  testing: 'Spent by the test sales accounts — real spend, kept out of sales performance',
  legacy: 'The barber-site generator (generate-barber-site) — the earlier barber product',
  unallocated: 'Cannot be shown to be Findable: lead finding before Findable began, and the retired contact-enrichment tools (no lead recorded against them)',
};

/** Functions that belong to the earlier barber product — verified by name, nothing guessed. */
export const LEGACY_FUNCTIONS: ReadonlySet<string> = new Set(['generate-barber-site']);
/** Retired contact-enrichment call types (June–August): no lead id was recorded against any of them,
 *  so which product they served cannot be shown. */
export const UNATTRIBUTABLE_TYPES: ReadonlySet<string> = new Set(['apify_business_enrich', 'apify_maps_enrich', 'apify_facebook', 'apify_website_check', 'apify_services']);

export interface CostDetailRow { month: string; user_id: string | null; function_name: string | null; api_type: string | null; pre_findable: boolean; usd: number; calls: number }

/** One bucket per row, by a fixed order of rules. */
export function costOwnerOf(r: Pick<CostDetailRow, 'user_id' | 'function_name' | 'api_type' | 'pre_findable'>, testUserIds: ReadonlySet<string>): CostOwner {
  if (LEGACY_FUNCTIONS.has(String(r.function_name ?? ''))) return 'legacy';
  if (UNATTRIBUTABLE_TYPES.has(String(r.api_type ?? ''))) return 'unallocated';
  if (r.pre_findable) return 'unallocated';
  if (r.user_id && testUserIds.has(r.user_id)) return 'testing';
  return 'findable';
}

/* ── Google Maps Platform: SKU and free monthly allowance ─────────────────────────────────────────
   Verified 2026-09-30 against developers.google.com/maps/billing-and-pricing/pricing: free cap per
   SKU per month, and the first paid band's price per 1,000. The SKU is set by the FIELDS a request
   asks for (Google bills once, at the highest tier any field touches), read from each caller:
   - google-place-details: asks for the phone → Place Details Enterprise.
   - generate-barber-site (legacy, source deleted — its mask cannot be read): counted at Enterprise,
     the tier its logged 0.017 price sat nearest; 61 calls in June–July, far inside any free cap.
   - search-leads / niche-sample text search: the mask asks for websiteUri → Text Search Enterprise.
   - enrichment apify_place_details (place-town.ts): ESSENTIALS_FIELDS (address, components, location) → Place Details Essentials.
   - enrichment apify_place_search (place-resolve.ts): id, name, address → Text Search Pro.
   - search-leads geocode → Geocoding.
   ⚠️ Rows before 2026-08-07 were logged at an older, lower constant (0.017 / 0.032); their SKU is the
   same — the request did not change, only our estimate of its price. */
export interface GoogleSku { key: string; name: string; freeCallsPerMonth: number; usdPer1000: number }
export const GOOGLE_SKUS: Record<string, GoogleSku> = {
  place_details_enterprise: { key: 'place_details_enterprise', name: 'Place Details Enterprise', freeCallsPerMonth: 1000, usdPer1000: 20 },
  place_details_essentials: { key: 'place_details_essentials', name: 'Place Details Essentials', freeCallsPerMonth: 10000, usdPer1000: 5 },
  text_search_enterprise: { key: 'text_search_enterprise', name: 'Text Search Enterprise', freeCallsPerMonth: 1000, usdPer1000: 35 },
  text_search_pro: { key: 'text_search_pro', name: 'Text Search Pro', freeCallsPerMonth: 5000, usdPer1000: 32 },
  geocoding: { key: 'geocoding', name: 'Geocoding', freeCallsPerMonth: 10000, usdPer1000: 5 },
};
export function googleSkuOf(functionName: string | null, apiType: string | null): GoogleSku | null {
  const t = String(apiType ?? '');
  if (t === 'place_details') return GOOGLE_SKUS.place_details_enterprise;
  if (t === 'text_search') return GOOGLE_SKUS.text_search_enterprise;
  if (t === 'apify_place_details') return GOOGLE_SKUS.place_details_essentials;
  if (t === 'apify_place_search') return GOOGLE_SKUS.text_search_pro;
  if (t === 'geocode') return GOOGLE_SKUS.geocoding;
  void functionName;
  return null;
}

export interface GoogleMonthSku { sku: GoogleSku; calls: number; recordedUsd: number; freeCalls: number; aboveFree: number; estimateAfterAllowanceUsd: number }
export interface GoogleMonth { month: string; skus: GoogleMonthSku[]; recordedUsd: number; estimateAfterAllowanceUsd: number }

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Per calendar month, per SKU: every recorded call (whatever its owner — the allowance is shared across
 *  the billing account), the free cap, the calls above it and their list-price value. */
export function googleAllowance(rows: CostDetailRow[]): GoogleMonth[] {
  const byMonth = new Map<string, Map<string, { sku: GoogleSku; calls: number; usd: number }>>();
  for (const r of rows) {
    const sku = googleSkuOf(r.function_name, r.api_type);
    if (!sku) continue;
    const m = byMonth.get(r.month) ?? new Map();
    const cur = m.get(sku.key) ?? { sku, calls: 0, usd: 0 };
    cur.calls += Number(r.calls) || 0; cur.usd += Number(r.usd) || 0;
    m.set(sku.key, cur); byMonth.set(r.month, m);
  }
  return [...byMonth].sort(([a], [b]) => b.localeCompare(a)).map(([month, m]) => {
    const skus = [...m.values()].map(({ sku, calls, usd }) => {
      const aboveFree = Math.max(0, calls - sku.freeCallsPerMonth);
      return { sku, calls, recordedUsd: round2(usd), freeCalls: Math.min(calls, sku.freeCallsPerMonth), aboveFree, estimateAfterAllowanceUsd: round2((aboveFree * sku.usdPer1000) / 1000) };
    }).sort((a, b) => b.recordedUsd - a.recordedUsd);
    return { month, skus, recordedUsd: round2(skus.reduce((s, x) => s + x.recordedUsd, 0)), estimateAfterAllowanceUsd: round2(skus.reduce((s, x) => s + x.estimateAfterAllowanceUsd, 0)) };
  });
}

/** What each provider's recorded figure actually is. */
export const COST_BASIS: Record<string, string> = {
  'Google Maps': 'calls × Google list price — an estimate; free allowances and credits are not in it',
  OpenAI: 'measured tokens × OpenAI list price — an estimate from real usage',
  Apify: 'the cost Apify reported for each run — measured usage, not an invoice',
};

export interface ApifyAccountCheck { cycleStart: string; cycleEnd: string; accountUsd: number; capUsd: number | null; recordedUsd: number; notInOurLogUsd: number; capturedAt: string }

export interface CostAccounting {
  byOwner: Record<CostOwner, number>;
  googleMonths: GoogleMonth[];
  apify: ApifyAccountCheck | null;
  confirmedCharges: null;
  findableStart: string;
}

export function foldCostAccounting(period: CostDetailRow[], months: CostDetailRow[], testUserIds: ReadonlySet<string>, apify: ApifyAccountCheck | null): CostAccounting {
  const byOwner: Record<CostOwner, number> = { findable: 0, testing: 0, legacy: 0, unallocated: 0 };
  for (const r of period) byOwner[costOwnerOf(r, testUserIds)] += Number(r.usd) || 0;
  for (const k of Object.keys(byOwner) as CostOwner[]) byOwner[k] = round2(byOwner[k]);
  return { byOwner, googleMonths: googleAllowance(months), apify, confirmedCharges: null, findableStart: FINDABLE_START_ISO };
}
