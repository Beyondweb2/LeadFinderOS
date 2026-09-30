/* ════════════════════════════════════════════════════════════════════════════════════════════════
   API COST ACCURACY (2026-09-30) — usage value vs Google after its free allowance vs confirmed charges
   vs not-Findable. Run: npx tsx scripts/api-cost-accounting.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { costOwnerOf, foldCostAccounting, googleAllowance, googleSkuOf, GOOGLE_SKUS, FINDABLE_START_ISO, type CostDetailRow } from '../src/lib/apiCostAccounting.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TEST = new Set(['test-user']);
const row = (o: Partial<CostDetailRow>): CostDetailRow => ({ month: '2026-09', user_id: 'paul', function_name: 'google-place-details', api_type: 'place_details', pre_findable: false, usd: 1, calls: 50, ...o });

console.log('── who owns a cost ──');
{
  ok(costOwnerOf(row({ function_name: 'generate-barber-site' }), TEST) === 'legacy', 'the barber-site generator → Legacy project · Not Findable (verified by name)');
  ok(costOwnerOf(row({ function_name: 'enrichment', api_type: 'apify_business_enrich' }), TEST) === 'unallocated', 'retired contact enrichment with no lead recorded → Unallocated, never assumed Findable');
  ok(costOwnerOf(row({ function_name: 'search-leads', api_type: 'text_search', pre_findable: true }), TEST) === 'unallocated', 'lead finding before Findable began → Unallocated');
  ok(costOwnerOf(row({ user_id: 'test-user' }), TEST) === 'testing', 'a test account\'s spend → Findable testing / development (visible, not discarded)');
  ok(costOwnerOf(row({ user_id: null, function_name: 'conversation-triage', api_type: 'openai_reply_triage' }), TEST) === 'findable', 'a background job doing Findable work → Findable, though no person is attached');
  ok(costOwnerOf(row({}), TEST) === 'findable', 'ordinary Findable work → Findable');
  ok(FINDABLE_START_ISO === '2026-07-11T00:00:00Z', 'the Findable start is the first AI visibility audit on record');
  const rows = [row({ usd: 10 }), row({ function_name: 'generate-barber-site', usd: 1.04 }), row({ pre_findable: true, usd: 2.5 }), row({ user_id: 'test-user', usd: 0.22 })];
  const a = foldCostAccounting(rows, [], TEST, null);
  const sum = Object.values(a.byOwner).reduce((s, v) => s + v, 0);
  ok(Math.abs(sum - 13.76) < 0.001, 'every recorded dollar lands in exactly one bucket — nothing deleted or zeroed');
  ok(a.confirmedCharges === null, 'confirmed charges stay empty without real billing data');
}

console.log('\n── Google SKUs and free allowances (verified 2026-09-30 on Google\'s pricing page) ──');
{
  ok(GOOGLE_SKUS.place_details_enterprise.freeCallsPerMonth === 1000 && GOOGLE_SKUS.place_details_enterprise.usdPer1000 === 20, 'Place Details Enterprise: 1,000 free, $20 / 1,000');
  ok(GOOGLE_SKUS.place_details_essentials.freeCallsPerMonth === 10000 && GOOGLE_SKUS.place_details_essentials.usdPer1000 === 5, 'Place Details Essentials: 10,000 free, $5 / 1,000');
  ok(GOOGLE_SKUS.text_search_enterprise.freeCallsPerMonth === 1000 && GOOGLE_SKUS.text_search_enterprise.usdPer1000 === 35, 'Text Search Enterprise: 1,000 free, $35 / 1,000');
  ok(GOOGLE_SKUS.text_search_pro.freeCallsPerMonth === 5000 && GOOGLE_SKUS.text_search_pro.usdPer1000 === 32, 'Text Search Pro: 5,000 free, $32 / 1,000');
  ok(GOOGLE_SKUS.geocoding.freeCallsPerMonth === 10000, 'Geocoding: 10,000 free');
  ok(googleSkuOf('google-place-details', 'place_details')?.key === 'place_details_enterprise' && googleSkuOf('enrichment', 'apify_place_details')?.key === 'place_details_essentials', 'Place Details by the fields each caller asks for');
  ok(googleSkuOf('search-leads', 'text_search')?.key === 'text_search_enterprise' && googleSkuOf('enrichment', 'apify_place_search')?.key === 'text_search_pro', 'Text Search likewise');
  ok(googleSkuOf('extract-competitors', 'openai_competitor_clean') === null, 'a non-Google row is never given a Google allowance');
  const months = googleAllowance([
    row({ month: '2026-09', calls: 3310, usd: 65.66 }),
    row({ month: '2026-09', function_name: 'search-leads', api_type: 'text_search', calls: 697, usd: 24.4 }),
    row({ month: '2026-09', function_name: 'enrichment', api_type: 'apify_place_details', calls: 738, usd: 3.69 }),
    row({ month: '2026-08', calls: 900, usd: 17 }),
  ]);
  const sep = months.find((m) => m.month === '2026-09')!;
  const pd = sep.skus.find((s) => s.sku.key === 'place_details_enterprise')!;
  ok(pd.aboveFree === 2310 && pd.estimateAfterAllowanceUsd === 46.2, 'September: 3,310 Place Details − 1,000 free = 2,310 above the cap → $46.20');
  ok(sep.skus.find((s) => s.sku.key === 'text_search_enterprise')!.estimateAfterAllowanceUsd === 0, '697 text searches are inside the 1,000 free → $0');
  ok(sep.skus.find((s) => s.sku.key === 'place_details_essentials')!.estimateAfterAllowanceUsd === 0, '738 Essentials calls are inside the 10,000 free → $0');
  ok(months.find((m) => m.month === '2026-08')!.estimateAfterAllowanceUsd === 0, 'a month under every cap → $0 after the allowance');
  ok(months[0].month === '2026-09', 'newest month first');
}

console.log('\n── the page and the loader say what each figure is ──');
{
  const panel = read('src/components/admin/controlCentre.tsx');
  ok(/1 · Recorded usage value/.test(panel) && /3 · Confirmed charges/.test(panel) && /Not available/.test(panel), 'recorded usage value and confirmed charges are separate, and confirmed reads "Not available"');
  ok(/not a bill and not a confirmed future charge/.test(panel), 'the after-allowance figure is never called a bill or a confirmed future charge');
  ok(/Google counts the allowance across every project on the billing account/.test(panel) && /trial or promotional credits are not visible/.test(panel), 'the account-level allowance and invisible credits are said out loud');
  ok(!/API spend"/.test(panel) && /Recorded API usage value \(US dollars\)/.test(panel), 'the Money overview no longer calls an estimate "spend"');
  const loader = read('supabase/functions/_shared/admin-overview-load.ts');
  ok(/admin_api_cost_detail/.test(loader) && /apify_account_usage/.test(loader) && /costAccounting,/.test(loader), 'the loader reads the detail function and the Apify account figure');
  const mig = read('supabase/migrations/20261001180000_api_cost_detail.sql');
  ok(/revoke all on function public\.admin_api_cost_detail\(timestamptz, timestamptz, timestamptz\) from anon, authenticated;/.test(mig) && /to service_role;/.test(mig), 'the detail function is service-role only — no browser can read cost rows');
  ok(/cache_hit is not true/.test(mig) && /at time zone 'Europe\/London'/.test(mig), 'billable calls exclude cache hits; months are London months');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
