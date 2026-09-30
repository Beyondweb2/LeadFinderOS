/* ════════════════════════════════════════════════════════════════════════════════════════════════
   API COST ACCURACY (2026-09-30) — usage value vs Google after its free allowance vs confirmed charges
   vs who paid (each provider's move from Move37 to Paul's own account, docs/api-cost-ownership.md).
   Run: npx tsx scripts/api-cost-accounting.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  costOwnerOf, costProjectOf, foldCostAccounting, fundingOf, googleAllowance, googleSkuOf, isFindableCost, segmentOf,
  GOOGLE_SKUS, FINDABLE_START_ISO, MIGRATION_BOUNDS, PROVIDER_MIGRATIONS, COST_OWNERS, type CostDetailRow,
} from '../src/lib/apiCostAccounting.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TEST = new Set(['test-user']);
const AFTER_ALL = '2026-09-25T12:00:00Z';
const row = (o: Partial<CostDetailRow> & { at?: string }): CostDetailRow => {
  const { at, ...rest } = o;
  return { month: '2026-09', user_id: 'paul', function_name: 'google-place-details', api_type: 'place_details', pre_findable: false, seg: segmentOf(at ?? AFTER_ALL), usd: 1, calls: 50, ...rest };
};

console.log('── when each provider moved to Paul\'s own account (evidence: docs/api-cost-ownership.md) ──');
{
  ok(PROVIDER_MIGRATIONS.Apify.switchedAt === '2026-09-17T11:21:43.847Z', 'Apify moved 2026-09-17 11:21:43 UTC (APIFY_TOKEN replaced; the account reading changed that quarter-hour)');
  ok(PROVIDER_MIGRATIONS['Google Maps'].switchedAt === '2026-09-18T06:26:02.374Z', 'Google Maps moved 2026-09-18 06:26:02 UTC (GOOGLE_MAPS_API_KEY replaced)');
  ok(PROVIDER_MIGRATIONS.OpenAI.switchedAt === '2026-09-21T05:56:45.336Z', 'OpenAI moved 2026-09-21 05:56:45 UTC (OPENAI_API_KEY replaced)');
  ok(MIGRATION_BOUNDS.length === 3 && [...MIGRATION_BOUNDS].sort().join() === MIGRATION_BOUNDS.join(), 'three distinct switch instants, oldest first — what the SQL is given');
  ok(segmentOf('2026-09-17T11:21:43.846Z') === 0 && segmentOf('2026-09-17T11:21:43.847Z') === 1, 'the switch instant itself counts as after (same rule as the SQL: bound <= created_at)');
}

console.log('\n── who paid: each provider on its own date ──');
{
  ok(fundingOf('apify_ai_search', segmentOf('2026-09-17T11:00:00Z')) === 'move37', 'Apify before its switch → Move37 paid');
  ok(fundingOf('apify_ai_search', segmentOf('2026-09-17T12:00:00Z')) === 'findable', 'Apify after its switch → Findable');
  const mid = segmentOf('2026-09-19T12:00:00Z'); // after Apify and Google, before OpenAI
  ok(fundingOf('apify_seo_audit', mid) === 'findable' && fundingOf('place_details', mid) === 'findable' && fundingOf('openai_competitor_clean', mid) === 'move37',
    'on 19 Sep: Apify and Google are Findable\'s, OpenAI is still Move37\'s — not one shared date');
  const between = segmentOf('2026-09-17T20:00:00Z'); // after Apify, before Google
  ok(fundingOf('apify_ai_search', between) === 'findable' && fundingOf('text_search', between) === 'move37', 'on the evening of 17 Sep Apify is Findable\'s but Google is still Move37\'s');
  ok(fundingOf('apify_place_details', between) === 'move37', 'a Google call routed through the Apify runner follows GOOGLE\'s date, not Apify\'s');
  ok(fundingOf('apify_site_details', segmentOf('2026-09-20T00:00:00Z')) === 'move37', 'an OpenAI call routed through the runner follows OpenAI\'s date');
  ok(fundingOf('openai_generate_report', segmentOf(AFTER_ALL)) === 'findable', 'OpenAI after 21 Sep → Findable');
  ok(fundingOf('some_new_vendor', segmentOf(AFTER_ALL)) === 'unknown', 'a provider with no known switch → unknown funder, never assumed Findable');
  ok(fundingOf('website_scrape', 0) === 'free', 'a plain website fetch has no funder — free');
  ok(fundingOf('place_details', null) === 'unknown' && fundingOf('place_details', Number.NaN) === 'unknown', 'a row with no interval reported → unknown, never Findable');
}

console.log('\n── the four buckets ──');
{
  ok(costOwnerOf(row({ at: '2026-09-01T00:00:00Z' }), TEST) === 'move37', 'Google before 18 Sep → Move37-funded historical');
  ok(costOwnerOf(row({ at: '2026-06-20T00:00:00Z', function_name: 'generate-barber-site' }), TEST) === 'move37', 'the barber product, before any switch → Move37-funded (Move37 paid, whatever the project)');
  ok(costProjectOf(row({ function_name: 'generate-barber-site' }), TEST) === 'legacy', '…and its project is still recorded as the barber product');
  ok(costOwnerOf(row({ at: '2026-06-20T00:00:00Z', pre_findable: true }), TEST) === 'move37', 'lead finding before Findable began → Move37-funded');
  ok(costOwnerOf(row({}), TEST) === 'findable', 'ordinary Findable work after the switch → Findable usage');
  ok(costOwnerOf(row({ user_id: null, function_name: 'conversation-triage', api_type: 'openai_reply_triage' }), TEST) === 'findable', 'a background job doing Findable work after the switch → Findable, though no person is attached');
  ok(costOwnerOf(row({ user_id: 'test-user' }), TEST) === 'testing', 'a test account after the switch → Findable testing (visible, distinguishable)');
  ok(costOwnerOf(row({ user_id: 'test-user', at: '2026-09-01T00:00:00Z' }), TEST) === 'move37', 'a test account before the switch → Move37 paid for it');
  ok(costOwnerOf(row({ api_type: 'some_new_vendor', function_name: 'x' }), TEST) === 'unallocated', 'unknown funding → Unallocated');
  ok(costOwnerOf(row({ api_type: 'apify_business_enrich', function_name: 'enrichment' }), TEST) === 'unallocated', 'a retired, unattributable tool on Findable\'s account → Unallocated, not Findable');
  ok(isFindableCost(row({}), TEST) && isFindableCost(row({ user_id: 'test-user' }), TEST), 'Findable usage and Findable testing are Findable expenses');
  ok(!isFindableCost(row({ at: '2026-09-01T00:00:00Z' }), TEST) && !isFindableCost(row({ api_type: 'some_new_vendor' }), TEST), 'Move37-funded and Unallocated are never Findable expenses');
  ok(FINDABLE_START_ISO === '2026-07-11T00:00:00Z', 'the Findable start is the first AI visibility audit on record');
}

console.log('\n── totals reconcile; nothing is dropped ──');
{
  const rows: CostDetailRow[] = [
    row({ usd: 10 }),                                                               // findable
    row({ user_id: 'test-user', usd: 0.22 }),                                       // testing
    row({ at: '2026-09-10T00:00:00Z', usd: 5 }),                                    // move37, findable work
    row({ at: '2026-06-20T00:00:00Z', function_name: 'generate-barber-site', usd: 1.04 }), // move37, legacy
    row({ api_type: 'some_new_vendor', usd: 0.5 }),                                 // unallocated
    row({ at: '2026-09-18T01:00:00Z', function_name: 'enrichment', api_type: 'apify_ai_search', usd: 2 }), // apify after its switch → findable
  ];
  const a = foldCostAccounting(rows, rows, ['2026-09'], TEST, null);
  const sum = COST_OWNERS.reduce((s, k) => s + a.allTime.byOwner[k], 0);
  ok(Math.abs(sum - 18.76) < 0.001 && a.allTime.totalUsd === 18.76, 'every recorded dollar lands in exactly one bucket — the four add up to the total');
  ok(a.allTime.byOwner.findable === 12 && a.allTime.byOwner.testing === 0.22 && a.allTime.byOwner.move37 === 6.04 && a.allTime.byOwner.unallocated === 0.5, 'each bucket holds exactly its rows');
  ok(a.allTime.move37ByProject.findable === 5 && a.allTime.move37ByProject.legacy === 1.04, 'Move37-funded usage keeps whose work it was, for the record');
  const g = a.byProvider.find((p) => p.provider === 'Google Maps')!;
  ok(g.findableUsd === 10 && g.testingUsd === 0.22 && g.move37Usd === 6.04, 'per provider: Google split at its own date');
  ok(a.byProvider.find((p) => p.provider === 'Apify')!.findableUsd === 2, 'per provider: Apify split at its own date');
  ok(a.confirmedCharges === null, 'confirmed charges stay empty without real billing data');
  ok(rows.length === 6, 'the input rows are untouched (the fold reads, never rewrites)');
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
  // The allowance belongs to a billing account: Move37's calls never use up Findable's free calls.
  const acc = foldCostAccounting([], [
    row({ at: '2026-09-10T00:00:00Z', calls: 2500, usd: 50 }),  // Move37's account
    row({ at: AFTER_ALL, calls: 1200, usd: 24 }),                // Findable's account
  ], ['2026-09'], TEST, null);
  const fsep = acc.googleMonths.find((m) => m.month === '2026-09')!.skus[0];
  ok(fsep.calls === 1200 && fsep.aboveFree === 200 && fsep.estimateAfterAllowanceUsd === 4, 'September allowance counts only calls on Findable\'s own billing account (1,200, not 3,700)');
}

console.log('\n── the page, the loader and the SQL ──');
{
  const panel = read('src/components/admin/controlCentre.tsx');
  ok(/1 · Findable usage value/.test(panel) && /3 · Confirmed charges/.test(panel) && /Not available/.test(panel), 'Findable usage value and confirmed charges are separate, and confirmed reads "Not available"');
  ok(/Historical breakdown/.test(panel) && /<details/.test(panel) && /COST_OWNERS\.map/.test(panel), 'a collapsible historical breakdown shows all four buckets');
  ok(/The four add up to every recorded dollar/.test(panel), 'the breakdown shows its own reconciliation');
  ok(/provider-reported/.test(panel) && /an estimate, not a bill/.test(panel), 'provider-reported usage and estimates are labelled apart');
  ok(/not a bill and not a confirmed future charge/.test(panel), 'the after-allowance figure is never called a bill or a confirmed future charge');
  ok(/Google counts the allowance across every project on the billing account/.test(panel) && /trial or promotional credits are not visible/.test(panel), 'the account-level allowance and invisible credits are said out loud');
  ok(!/API spend"/.test(panel) && /Recorded API usage value \(US dollars\)/.test(panel), 'the Money overview no longer calls an estimate "spend"');
  const loader = read('supabase/functions/_shared/admin-overview-load.ts');
  ok(/admin_api_cost_seg/.test(loader) && /_bounds: MIGRATION_BOUNDS/.test(loader) && /\.filter\(\(r\) => isFindableCost\(r, testUserIds\)\)/.test(loader),
    'every headline cost row (period, today, yesterday, week, month → contribution, per person, trends) is Findable-paid only');
  ok(!/rpc\("admin_api_cost",/.test(loader) && !/rpc\("admin_api_cost_detail",/.test(loader), 'the loader no longer reads the unsplit cost functions');
  ok(/costProviderOf\(r\.api_type\) === "Apify" && fundingOf\(r\.api_type, r\.seg\) === "findable"/.test(loader), 'the Apify account check compares only Apify-billed rows on the new account');
  ok(/apify_account_usage/.test(loader) && /costAccounting,/.test(loader), 'the loader still reads the Apify account figure');
  const mig = read('supabase/migrations/20261001210000_api_cost_funding.sql');
  ok(/where b <= u\.created_at/.test(mig), 'the SQL interval rule matches segmentOf (bound <= created_at)');
  ok(/revoke all on function public\.admin_api_cost_seg\(timestamptz, timestamptz, timestamptz\[\]\) from anon, authenticated;/.test(mig) && /revoke all on function public\.admin_api_cost_detail_seg\(timestamptz, timestamptz, timestamptz, timestamptz\[\]\) from anon, authenticated;/.test(mig),
    'the new cost functions are service-role only — no browser can read cost rows');
  ok(!/\b(update|delete|insert|drop|truncate)\b/i.test(mig.replace(/--.*$/gm, '')), 'the migration changes no row and drops nothing — historical usage stays intact');
  ok(/cache_hit is not true/.test(mig) && /at time zone 'Europe\/London'/.test(mig), 'billable calls exclude cache hits; months are London months');
  // The emergency controls read the raw usage log and are not touched by the reporting cutoff.
  const guard = read('supabase/functions/_shared/protection.ts');
  ok(!/isFindableCost|MIGRATION_BOUNDS|PROVIDER_MIGRATIONS|apiCostAccounting/.test(guard), 'the spend guard and emergency stop do not read the reporting cutoff');
  ok(!/guard_action|record_denial/.test(mig), 'the migration leaves the guard functions alone');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
