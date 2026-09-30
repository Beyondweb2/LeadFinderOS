/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT A COST ROW IS — provider and feature (Admin control centre, 2026-09-30).
   The spend ledger is api_usage_log (estimated_cost_usd per row). Its api_type names were never a
   provider list: Google Places and one OpenAI call are routed through the Apify runner and so are
   logged as apify_place_details / apify_place_search / apify_site_details. The SQL usage_provider()
   files those under Apify; this leaf files them under the provider that actually bills them.
   ⛔ 'guard' rows are the usage guard's ESTIMATES, not charges — never summed as spend.
   ⛔ Costs are what the code ESTIMATED when it ran (the ledger's own figure). Real invoices can
   differ; the dashboard says so. Pure and edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type CostProvider = 'OpenAI' | 'Google Maps' | 'Apify' | 'Website fetch (free)' | 'Other';

/** Is this row a real (estimated) charge? Guard rows are the usage guard's pre-flight estimates. */
export const isChargeRow = (apiType: string | null | undefined): boolean => String(apiType ?? '') !== 'guard';

export function costProviderOf(apiType: string | null | undefined): CostProvider {
  const t = String(apiType ?? '');
  if (t.startsWith('openai')) return 'OpenAI';
  if (t === 'apify_site_details') return 'OpenAI'; // scan-site-details: an OpenAI call routed through the runner
  if (t === 'place_details' || t === 'text_search' || t === 'geocode' || t === 'apify_place_details' || t === 'apify_place_search') return 'Google Maps';
  if (t.startsWith('apify')) return 'Apify';
  if (t === 'website_scrape') return 'Website fetch (free)';
  return 'Other';
}

/** The feature a cost row paid for, in Paul's words. Falls back to the function's name. */
export function costFeatureOf(functionName: string | null | undefined, apiType: string | null | undefined): string {
  const f = String(functionName ?? ''); const t = String(apiType ?? '');
  if (t.startsWith('apify_ai_search')) return 'AI visibility audits';
  if (t === 'apify_seo_audit') return 'SEO scans';
  if (t === 'apify_business_enrich' || t === 'apify_website_check' || t === 'apify_maps_enrich') return 'Paid Enrich';
  if (t === 'apify_place_details' || t === 'apify_place_search' || t === 'apify_site_details' || t === 'apify_trade_site' || t === 'apify_services') return 'Business details (enrichment)';
  if (f === 'extract-competitors') return 'Competitor names (audits)';
  if (f === 'search-leads') return 'Find Leads search';
  if (f === 'google-place-details') return 'Town & place details';
  if (f === 'niche-sample') return 'Niche Check';
  if (f === 'generate-report') return 'Audit report writing';
  if (f === 'voice-note-script') return 'Voice-note scripts';
  if (f === 'warm-lead-reply') return 'Reply drafts & research';
  if (f === 'page-generator') return 'Page generator';
  if (f === 'extract-email') return 'Find email';
  if (f === 'social-profiles') return 'Find socials';
  if (f === 'generate-barber-site' || f === 'enrich-lead') return 'Retired features';
  return f || 'Unlabelled';
}

/** Spend the code does not record anywhere (audited 2026-09-30) — shown beside the cost figures so
 *  the total is never read as complete. */
export const UNRECORDED_SPEND: readonly string[] = [
  'audit question writing (OpenAI, every audit)',
  'SEO scans run outside the shared runner',
  'directory checks (recorded on their own run rows)',
  'WhatsApp conversation charges from Meta',
  'email sending, hosting and Stripe fees',
];

/** ⚠️ A FIXED ESTIMATE, not a live rate: API spend is recorded in US dollars and revenue in pounds, so
 *  the contribution line converts at this rate and SAYS so. Update it if the pound moves a lot. */
export const USD_TO_GBP_ESTIMATE = 0.75;
export const usdToGbp = (usd: number): number => Math.round(usd * USD_TO_GBP_ESTIMATE * 100) / 100;
