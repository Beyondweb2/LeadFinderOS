/* ════════════════════════════════════════════════════════════════════════════════════════════════
   API COST ACCURACY (2026-09-30, docs/sales-workflow-nav.md §Release B; ownership cutoffs
   docs/api-cost-ownership.md). Paul: "when the dashboard reports expenditure, it must clearly
   distinguish real Findable costs from estimates, promotional credits and unrelated historical usage."
   ⛔ FOUR DIFFERENT THINGS, NEVER ONE NUMBER:
   1. RECORDED USAGE VALUE — what our own code logged when it spent (api_usage_log). An ESTIMATE:
      Google = calls × list price; OpenAI = measured tokens × list price; Apify = the cost Apify
      reported for each run.
   2. GOOGLE AFTER ITS FREE MONTHLY ALLOWANCE — calls above each SKU's free cap × that SKU's price.
      Still an ESTIMATE, and NOT a bill: Google counts the cap across every project on the billing
      account, and trial / promotional credits are not visible here.
   3. CONFIRMED CHARGES — only from real billing data. None is connected, so it reads "not available".
   4. WHO PAID AND WHOSE WORK IT WAS — below.
   ⛔ NOTHING IS DELETED OR ZEROED: every recorded row is counted in exactly one ownership bucket.
   Pure and edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { costProviderOf, type CostProvider } from './apiCostLabels.ts';

/* ── WHO PAID: each provider's move from Move37's credentials to Paul's own ───────────────────────
   Paul, 2026-09-30: "Any API usage paid for by Move37 before the migration is NOT a Findable business
   expense." Each provider moved on its OWN day. The instant is the moment the Supabase secret the code
   reads was replaced (Management API /secrets `updated_at`, read 2026-09-30); earlier sessions' secret
   listings show every one of these three held a single value from June/July until that instant, so
   there is exactly one change per provider and no other candidate date.
   ⛔ Usage BEFORE the instant: Move37 paid — kept for audit, never in a Findable total.
   ⛔ Usage AT or AFTER it: Findable's own account.
   ⛔ A provider not listed here has NO known funder → Unallocated, never assumed Findable's.
   The SQL (admin_api_cost_seg / admin_api_cost_detail_seg) is told only the instants (MIGRATION_BOUNDS)
   and reports which interval each row fell in; the decision is made here and nowhere else. */
export type FundedProvider = Extract<CostProvider, 'Apify' | 'Google Maps' | 'OpenAI'>;
export interface ProviderMigration { provider: FundedProvider; switchedAt: string; evidence: string }
export const PROVIDER_MIGRATIONS: Record<FundedProvider, ProviderMigration> = {
  Apify: {
    provider: 'Apify', switchedAt: '2026-09-17T11:21:43.847Z',
    evidence: 'APIFY_TOKEN replaced (held one value since 2026-06-30); Apify\'s own account reading changed between 11:13 and 11:28 UTC that day — new billing cycle, limits and a total starting from $0 (apify_account_usage); Paul entered his own Apify account token that session',
  },
  'Google Maps': {
    provider: 'Google Maps', switchedAt: '2026-09-18T06:26:02.374Z',
    evidence: 'GOOGLE_MAPS_API_KEY replaced (held one value since 2026-07-01); the only change to the key every Google caller reads',
  },
  OpenAI: {
    provider: 'OpenAI', switchedAt: '2026-09-21T05:56:45.336Z',
    evidence: 'OPENAI_API_KEY replaced (held one value since 2026-06-30); Paul: "The OpenAI API key has now been replaced" (06:10 UTC), credits added to it minutes later',
  },
};
/** The distinct switch instants, oldest first — what the SQL is given as _bounds. */
export const MIGRATION_BOUNDS: readonly string[] = [...new Set(Object.values(PROVIDER_MIGRATIONS).map((m) => m.switchedAt))].sort();

/** How many switch instants are at or before this moment — the same number the SQL returns as `seg`. */
export const segmentOf = (iso: string): number => MIGRATION_BOUNDS.filter((b) => Date.parse(b) <= Date.parse(iso)).length;

/** 'findable' = Paul's own account paid; 'move37' = before that provider's switch; 'free' = no provider
 *  charges it (a plain website fetch); 'unknown' = no known funder. */
export type Funding = 'findable' | 'move37' | 'free' | 'unknown';
export function fundingOf(apiType: string | null | undefined, seg: number | null | undefined): Funding {
  const p = costProviderOf(apiType);
  if (p === 'Website fetch (free)') return 'free';
  const m = (PROVIDER_MIGRATIONS as Partial<Record<CostProvider, ProviderMigration>>)[p];
  if (!m) return 'unknown';
  if (typeof seg !== 'number' || !Number.isInteger(seg) || seg < 0) return 'unknown';
  return seg > MIGRATION_BOUNDS.indexOf(m.switchedAt) ? 'findable' : 'move37';
}

/* ── WHOSE WORK IT WAS (the project), separate from who paid ─────────────────────────────────────── */

/** Findable's work began with its first AI visibility audit: the first apify_ai_search row in
 *  api_usage_log is 2026-07-11 (read 2026-09-30). Lead finding before it cannot be shown to be
 *  Findable's — it is Unallocated, never assumed. */
export const FINDABLE_START_ISO = '2026-07-11T00:00:00Z';

/** Functions that belong to the earlier barber product — verified by name, nothing guessed. */
export const LEGACY_FUNCTIONS: ReadonlySet<string> = new Set(['generate-barber-site']);
/** Retired contact-enrichment call types (June–August): no lead id was recorded against any of them,
 *  so which product they served cannot be shown. */
export const UNATTRIBUTABLE_TYPES: ReadonlySet<string> = new Set(['apify_business_enrich', 'apify_maps_enrich', 'apify_facebook', 'apify_website_check', 'apify_services']);

export type CostProject = 'findable' | 'testing' | 'legacy' | 'unallocated';
export const COST_PROJECT_LABEL: Record<CostProject, string> = {
  findable: 'Findable work',
  testing: 'Test accounts',
  legacy: 'Barber product (legacy)',
  unallocated: 'Project not identifiable',
};
export function costProjectOf(r: { user_id: string | null; function_name: string | null; api_type: string | null; pre_findable?: boolean | null }, testUserIds: ReadonlySet<string>): CostProject {
  if (LEGACY_FUNCTIONS.has(String(r.function_name ?? ''))) return 'legacy';
  if (UNATTRIBUTABLE_TYPES.has(String(r.api_type ?? ''))) return 'unallocated';
  if (r.pre_findable === true) return 'unallocated';
  if (r.user_id && testUserIds.has(r.user_id)) return 'testing';
  return 'findable';
}

/* ── THE FOUR BUCKETS: funding first, then the project ───────────────────────────────────────────── */

export type CostOwner = 'findable' | 'testing' | 'move37' | 'unallocated';
export const COST_OWNERS: readonly CostOwner[] = ['findable', 'testing', 'move37', 'unallocated'];
export const COST_OWNER_LABEL: Record<CostOwner, string> = {
  findable: 'Findable usage',
  testing: 'Findable testing / development',
  move37: 'Move37-funded (historical)',
  unallocated: 'Unallocated',
};
export const COST_OWNER_RULE: Record<CostOwner, string> = {
  findable: 'On your own provider accounts, after each switch — Findable work, including background jobs with no person attached',
  testing: 'On your own accounts, spent by the test sales accounts — a real Findable cost, kept out of sales performance',
  move37: 'Before each provider moved to your own account, so Move37 paid — kept for the record, never in a Findable total',
  unallocated: 'Funder or project cannot be shown: a provider with no known switch, or usage on your accounts that is not identifiably Findable work',
};

export interface CostSegRow { user_id: string | null; function_name: string | null; api_type: string | null; seg: number; pre_findable?: boolean | null }

/** One bucket per row. Move37 paid → move37 whatever the project; unknown funder → unallocated. */
export function costOwnerOf(r: CostSegRow, testUserIds: ReadonlySet<string>): CostOwner {
  const f = fundingOf(r.api_type, r.seg);
  if (f === 'move37') return 'move37';
  if (f === 'unknown') return 'unallocated';
  const p = costProjectOf(r, testUserIds);
  return p === 'findable' || p === 'testing' ? p : 'unallocated';
}
/** Is this row a Findable business expense? The ONE test every Findable total uses (operating cost,
 *  contribution, per person, today / week / month, trends). Testing counts: Findable paid for it. */
export const isFindableCost = (r: CostSegRow, testUserIds: ReadonlySet<string>): boolean => {
  const o = costOwnerOf(r, testUserIds);
  return o === 'findable' || o === 'testing';
};

export interface CostDetailRow extends CostSegRow { month: string; pre_findable: boolean; usd: number; calls: number }

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
   same — the request did not change, only our estimate of its price.
   ⛔ The allowance is per BILLING ACCOUNT: calls made on Move37's key were on Move37's account and never
   use up Findable's free calls, so foldCostAccounting passes only Findable-paid rows. */
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

/** Per calendar month, per SKU: every call in the rows given (one billing account's), the free cap, the
 *  calls above it and their list-price value. */
export function googleAllowance(rows: Pick<CostDetailRow, 'month' | 'function_name' | 'api_type' | 'usd' | 'calls'>[]): GoogleMonth[] {
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

/** Apify's own figure for the account's billing cycle beside what we recorded on THAT account (rows on
 *  or after the Apify switch only — the new account's first cycle began at midnight, its first run at
 *  the switch). The gap is Unallocated: provider-reported, not in our log. */
export interface ApifyAccountCheck { cycleStart: string; cycleEnd: string; accountUsd: number; capUsd: number | null; recordedUsd: number; notInOurLogUsd: number; capturedAt: string }

export interface OwnerTotals { byOwner: Record<CostOwner, number>; move37ByProject: Record<CostProject, number>; totalUsd: number }
export interface ProviderSplit { provider: FundedProvider; switchedAt: string; evidence: string; move37Usd: number; findableUsd: number; testingUsd: number; unallocatedUsd: number }

export interface CostAccounting {
  /** The reporting period. */
  period: OwnerTotals;
  /** Everything ever recorded — the historical breakdown. Sums to every recorded dollar. */
  allTime: OwnerTotals;
  byProvider: ProviderSplit[];
  migrations: ProviderMigration[];
  googleMonths: GoogleMonth[];
  apify: ApifyAccountCheck | null;
  confirmedCharges: null;
  findableStart: string;
}

function ownerTotals(rows: CostDetailRow[], testUserIds: ReadonlySet<string>): OwnerTotals {
  const byOwner: Record<CostOwner, number> = { findable: 0, testing: 0, move37: 0, unallocated: 0 };
  const move37ByProject: Record<CostProject, number> = { findable: 0, testing: 0, legacy: 0, unallocated: 0 };
  let total = 0;
  for (const r of rows) {
    const v = Number(r.usd) || 0; total += v;
    const o = costOwnerOf(r, testUserIds); byOwner[o] += v;
    if (o === 'move37') move37ByProject[costProjectOf(r, testUserIds)] += v;
  }
  for (const k of COST_OWNERS) byOwner[k] = round2(byOwner[k]);
  for (const k of Object.keys(move37ByProject) as CostProject[]) move37ByProject[k] = round2(move37ByProject[k]);
  return { byOwner, move37ByProject, totalUsd: round2(total) };
}

export function foldCostAccounting(period: CostDetailRow[], allTime: CostDetailRow[], recentMonths: readonly string[], testUserIds: ReadonlySet<string>, apify: ApifyAccountCheck | null): CostAccounting {
  const byProvider: ProviderSplit[] = Object.values(PROVIDER_MIGRATIONS).map((m) => {
    const s = { ...m, move37Usd: 0, findableUsd: 0, testingUsd: 0, unallocatedUsd: 0 };
    for (const r of allTime) {
      if (costProviderOf(r.api_type) !== m.provider) continue;
      const o = costOwnerOf(r, testUserIds); const v = Number(r.usd) || 0;
      if (o === 'move37') s.move37Usd += v; else if (o === 'findable') s.findableUsd += v; else if (o === 'testing') s.testingUsd += v; else s.unallocatedUsd += v;
    }
    return { ...s, move37Usd: round2(s.move37Usd), findableUsd: round2(s.findableUsd), testingUsd: round2(s.testingUsd), unallocatedUsd: round2(s.unallocatedUsd) };
  });
  const months = new Set(recentMonths);
  return {
    period: ownerTotals(period, testUserIds),
    allTime: ownerTotals(allTime, testUserIds),
    byProvider,
    migrations: Object.values(PROVIDER_MIGRATIONS),
    googleMonths: googleAllowance(allTime.filter((r) => months.has(r.month) && isFindableCost(r, testUserIds))),
    apify, confirmedCharges: null, findableStart: FINDABLE_START_ISO,
  };
}
