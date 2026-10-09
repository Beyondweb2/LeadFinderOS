/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HOW OLD IS THIS BUSINESS? — the Companies House check (2026-10-02, docs/companies-house-age.md).
   A fake Companies House only: no network, no key. The match (src/lib/companiesHouse.ts), the lookup's
   request budget and failure answers (_shared/companies-house.ts), the cache rules, the cell/filter
   states, and the Find Leads wiring (including that the agency check is untouched).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  ageStateOf, ageText, businessAge, classifyCompaniesHouse, candidateFromSearchItem, isChCheckFresh, isCompaniesHouseTarget,
  isNewStrongMatch, listingFingerprint, nameTier, passesAgeFilter, postcodeOf, searchQueries, townOf, CH_CHECK_VERSION,
  CH_STRONG_CACHE_DAYS, CH_NOT_FOUND_CACHE_DAYS, type CompaniesHouseCheckRow,
} from '../src/lib/companiesHouse.ts';
import { lookUpCompany, CH_MAX_REQUESTS } from '../supabase/functions/_shared/companies-house.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const NOW = new Date('2026-10-02T10:00:00Z');
const item = (title: string, number: string, created: string, snippet: string, status = 'active', postal?: string) =>
  ({ title, company_number: number, date_of_creation: created, company_status: status, company_type: 'ltd', address_snippet: snippet, address: { postal_code: postal ?? postcodeOf(snippet) ?? undefined, locality: snippet.split(',').slice(-2, -1)[0]?.trim() } });
const profile = (name: string, number: string, created: string, postcode: string, locality: string, status = 'active') =>
  ({ company_name: name, company_number: number, date_of_creation: created, company_status: status, type: 'ltd', registered_office_address: { postal_code: postcode, locality } });

type Route = (url: string) => { status: number; body?: unknown } | 'throw' | 'timeout';
function fakeFetch(route: Route) {
  const calls: string[] = [];
  const fn = async (url: string, init: { headers: Record<string, string> }) => {
    calls.push(url);
    if (!/^Basic /.test(init.headers.Authorization ?? '')) throw new Error('no auth header');
    const r = route(url);
    if (r === 'throw') throw new TypeError('network down');
    if (r === 'timeout') { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; }
    return { status: r.status, json: async () => { if (r.body === '<<bad>>') throw new SyntaxError('bad json'); return r.body; } };
  };
  return { fn, calls };
}
const searchOnly = (items: unknown[], prof?: unknown): Route => (url) =>
  url.includes('/search/companies') ? { status: 200, body: { items } } : prof ? { status: 200, body: prof } : { status: 404 };

console.log('── 1. ONLY NO-WEBSITE UK RESULTS ARE CHECKED ──');
{
  ok(!isCompaniesHouseTarget({ id: 'p1', websiteStatus: 'HAS_OWN_WEBSITE', address: '1 High St, Wisbech PE13 1AB, UK' }), 'has a website → not a target (no Companies House call)');
  ok(!isCompaniesHouseTarget({ id: 'p1', websiteStatus: 'UNCERTAIN', address: '1 High St, Wisbech PE13 1AB, UK' }), 'possible website (UNCERTAIN) → not a target');
  ok(isCompaniesHouseTarget({ id: 'p1', websiteStatus: 'NO_WEBSITE', address: '1 High St, Wisbech PE13 1AB, UK' }), 'no website, UK → target');
  ok(isCompaniesHouseTarget({ id: 'p1', websiteStatus: 'DIRECTORY_ONLY', address: '1 High St, Wisbech PE13 1AB, UK' }), 'directory-only (legacy no website) → target');
  ok(!isCompaniesHouseTarget({ id: 'p1', websiteStatus: 'NO_WEBSITE', address: '12 Main St, Dublin, Ireland' }), 'not UK → not a target');
  ok(ageStateOf(false, null, false, NOW) === 'skipped', 'a non-target reads "skipped" (the "—" cell)');
  // The hook only ever sends targets: the table builds its items with isCompaniesHouseTarget.
  const table = code('src/components/LeadsTable.tsx');
  ok(!/isCompaniesHouseTarget|useCompaniesHouseChecks|BusinessAgeCell|AGE_FILTERS/.test(table), 'Find Leads no longer uses Companies House at all (Business age removed 2026-10-09)');
  ok(/chTargetsOf\(items\.filter\(\(i\) => i\.isTarget\)\)/.test(code('src/hooks/useCompaniesHouseChecks.ts')) && /if \(i\.id && !m\.has\(i\.id\)\)/.test(code('src/lib/companiesHouseRunner.ts')),
    'the hook drops every non-target (and the runner every id-less row) before any lookup');
}

console.log('── 2. ADDRESS READING ──');
ok(postcodeOf('4 Market St, Wisbech PE13 1AB, UK') === 'PE13 1AB', 'postcode read from a Google address');
ok(townOf('4 Market St, Wisbech PE13 1AB, UK') === 'Wisbech', 'town read from a Google address');
ok(townOf('Unit 3, Fen Rd, March, PE15 8AA, United Kingdom') === 'March', 'town read when the postcode stands alone');
ok(searchQueries("Ronnie's Shoe Repairs Wisbech", 'Wisbech').length === 2, 'a name with the town in it gets a second, town-less query');

console.log('── 3. STRONG MATCHES ──');
{
  const listing = { name: 'Fenland Heating Ltd', postcode: 'PE13 1AB', town: 'Wisbech' };
  const v = classifyCompaniesHouse(listing, [candidateFromSearchItem(item('FENLAND HEATING LIMITED', '11111111', '2026-08-12', '9 Elm Rd, Wisbech, England, PE13 2XY'))!]);
  ok(v.match === 'strong' && v.candidate?.number === '11111111', 'exact name + same town → strong');
  ok(v.evidence.includes('Business name matches exactly') && v.evidence.includes('Same postcode district'), '…with the evidence in plain words');
}
{
  const listing = { name: 'Bloggs Plumbing & Heating', postcode: 'PE13 1AB', town: 'Wisbech' };
  const v = classifyCompaniesHouse(listing, [candidateFromSearchItem(item('J BLOGGS PLUMBING AND HEATING LTD', '22222222', '2025-01-03', '1 High St, Wisbech, PE13 1AB'))!]);
  ok(v.match === 'strong' && v.evidence.includes('Same postcode'), 'close name + same postcode → strong');
}
{
  const listing = { name: 'Wisbech Plumbing', postcode: 'PE13 1AB', town: 'Wisbech' };
  const strong = classifyCompaniesHouse(listing, [candidateFromSearchItem(item('WISBECH PLUMBING LTD', '33333333', '2024-01-01', '1 High St, Wisbech, PE13 1AB'))!]);
  const weak = classifyCompaniesHouse(listing, [candidateFromSearchItem(item('WISBECH PLUMBING LTD', '33333333', '2024-01-01', '7 Other Rd, Wisbech, PE14 9ZZ'))!]);
  ok(strong.match === 'strong', 'a trade+town name with the SAME postcode → strong');
  ok(weak.match === 'possible', 'a trade+town name with only the same town → possible, never strong');
}

console.log('── 4. AMBIGUOUS → POSSIBLE ──');
{
  const listing = { name: 'Apex Roofing', postcode: 'LS1 4AB', town: 'Leeds' };
  const v = classifyCompaniesHouse(listing, [
    candidateFromSearchItem(item('APEX ROOFING LTD', '44444444', '2019-05-01', '2 Park Row, Leeds, LS1 5AA'))!,
    candidateFromSearchItem(item('APEX ROOFING LIMITED', '55555555', '2021-02-01', '8 Briggate, Leeds, LS1 6BB'))!,
  ]);
  ok(v.match === 'possible' && v.evidence.some((e) => /match equally well/.test(e)), 'two equally good companies → possible, says so');
}
{
  const v = classifyCompaniesHouse({ name: 'Apex Roofing', postcode: 'LS1 4AB', town: 'Leeds' }, [candidateFromSearchItem(item('APEX ROOFING LTD', '44444444', '2019-05-01', '1 Strand, London, WC2N 5HR'))!]);
  ok(v.match === 'possible' && v.evidence.some((e) => /Nothing in the address confirms/.test(e)), 'exact name, office elsewhere → possible');
}
{
  const v = classifyCompaniesHouse({ name: 'Fenland Heating', postcode: 'PE13 1AB', town: 'Wisbech' }, [candidateFromSearchItem(item('FENLAND HEATING LTD', '66666666', '2010-01-01', '1 High St, Wisbech, PE13 1AB', 'dissolved'))!]);
  ok(v.match === 'none' && v.evidence.some((e) => /no longer trading \(dissolved\)/.test(e)), 'a dissolved company is never a match — named in the Not found evidence');
}
console.log('── 4b. FALSE MATCHES FOUND IN THE 2026-10-02 SAMPLE (regressions) ──');
{
  const harry = classifyCompaniesHouse({ name: 'HARRY LOCKS SUPPLIERS LTD', postcode: 'DA11 0RQ', town: 'Gravesend' }, [candidateFromSearchItem(item('HARRY CONCRETE SUPPLIERS LTD', '15000001', '2025-01-09', '17a Dover Road East, Gravesend, England, DA11 0RQ'))!]);
  ok(harry.match === 'possible', 'a part-matching name in the same building → possible, never strong');
  const meo = classifyCompaniesHouse({ name: 'Meopham locksmiths', postcode: 'DA13 0QS', town: 'Gravesend' }, [candidateFromSearchItem(item('MEOPHAM LIMITED', '15000002', '2025-03-18', '128 City Road, London, EC1V 2NX'))!]);
  ok(meo.match === 'none', '"Meopham locksmiths" is not MEOPHAM LIMITED in London');
  const ua = classifyCompaniesHouse({ name: 'Ua Gas Service', postcode: 'RG2 8PW', town: 'Reading' }, [candidateFromSearchItem(item('UA CONSTRUCTION SERVICES LTD', '15000003', '2022-06-14', '135 Watling Street, St. Albans, AL2 2NN'))!]);
  ok(ua.match === 'none', '"Ua Gas Service" is not UA CONSTRUCTION SERVICES');
  const di = classifyCompaniesHouse({ name: 'Driving Instructor', postcode: 'DT4 0PQ', town: 'Weymouth' }, [candidateFromSearchItem(item('DRIVING INSTRUCTOR LIMITED', '15000004', '2020-03-05', 'Waterside Drive, Wigan, WN3 5BA'))!]);
  ok(di.match === 'none', 'a name that is only trade words, office elsewhere → not found');
}

console.log('── 5. NOT FOUND (never "unregistered") ──');
{
  const v = classifyCompaniesHouse({ name: "Dave's Window Cleaning", postcode: 'PE13 1AB', town: 'Wisbech' }, []);
  ok(v.match === 'none', 'no results → not found');
  const v2 = classifyCompaniesHouse({ name: 'Joe Smith Carpentry', postcode: 'PE13 1AB', town: 'Wisbech' }, [candidateFromSearchItem(item('SMITHFIELD HOLDINGS LTD', '77777777', '2001-01-01', 'London, EC1A 1BB'))!]);
  ok(v2.match === 'none', 'sole-trader-like name with only unrelated companies → not found');
  ok(nameTier('Joe Smith Carpentry', 'SMITHFIELD HOLDINGS LTD', 'Wisbech') === 'none', '…the unrelated name does not even partly match');
  const words = [...v.evidence, ...v2.evidence].join(' ');
  ok(!/\bunregistered\b/i.test(words.replace(/this is not "unregistered"/g, '')) && /not "unregistered"/.test(words), 'the evidence says it is NOT "unregistered", and never claims it is');
  const cell = read('src/components/BusinessAgeCell.tsx');
  ok(/'Not found'/.test(cell) && !/Not registered/i.test(cell), 'the cell says "Not found", never "Not registered"');
}

console.log('── 6. AGE ──');
{
  const a = businessAge('2026-09-11', NOW)!;
  ok(a.days === 21 && a.bucket === 'new' && ageText(a) === 'NEW · 3 weeks', '21 days → NEW · 3 weeks');
  ok(ageText(businessAge('2026-08-01', NOW)!) === 'NEW · 2 months', '2 months → NEW · 2 months');
  ok(ageText(businessAge('2026-08-20', NOW)!) === 'NEW · 6 weeks', '43 days → NEW · 6 weeks');
  ok(ageText(businessAge('2026-09-30', NOW)!) === 'NEW · 2 days', '2 days → NEW · 2 days');
  const m = businessAge('2026-01-15', NOW)!;
  ok(m.bucket === 'months' && ageText(m) === '8 months', '8½ months → "8 months", not NEW');
  ok(businessAge('2026-07-02', NOW)!.bucket === 'months', 'exactly 3 months → no longer NEW');
  ok(businessAge('2026-07-03', NOW)!.bucket === 'new', 'one day under 3 months → NEW');
  ok(ageText(businessAge('2024-06-01', NOW)!) === '2 years', '2 years 4 months → "2 years"');
  ok(ageText(businessAge('2025-10-02', NOW)!) === '1 year', 'exactly a year → "1 year"');
  ok(businessAge('2027-01-01', NOW)!.days === 0, 'a future date (bad data) → 0 days, never negative');
  ok(businessAge('not a date', NOW) === null, 'an unusable date → no age');
}

console.log('── 7. CELL STATES AND FILTERS ──');
{
  const row = (match: 'strong' | 'possible' | 'none', inc: string | null): CompaniesHouseCheckRow => ({
    place_id: 'p', fingerprint: 'x', business_name: 'B', postcode: null, town: null, match, company_number: '1', company_name: 'B LTD',
    company_status: 'active', company_type: 'ltd', incorporated_on: inc, registered_locality: null, registered_postcode: null,
    evidence: [], candidates_seen: 1, version: CH_CHECK_VERSION, checked_at: NOW.toISOString(),
  });
  ok(ageStateOf(true, null, true, NOW) === 'checking', 'in flight → checking');
  ok(ageStateOf(true, null, false, NOW) === 'unavailable', 'target, nothing came back → Not checked (never Not found)');
  ok(ageStateOf(true, row('strong', '2026-09-11'), false, NOW) === 'new', 'strong + 3 weeks → new');
  ok(ageStateOf(true, row('strong', '2026-01-15'), false, NOW) === 'months', 'strong + 8 months → months');
  ok(ageStateOf(true, row('strong', '2020-01-15'), false, NOW) === 'years', 'strong + 6 years → years');
  ok(ageStateOf(true, row('possible', '2026-09-11'), false, NOW) === 'possible', 'possible never shows an age as fact');
  ok(ageStateOf(true, row('none', null), false, NOW) === 'not_found', 'none → not found');
  ok(passesAgeFilter('all', 'years') && passesAgeFilter('all', 'checking'), 'Any age shows everything');
  ok(passesAgeFilter('new', 'new') && !passesAgeFilter('new', 'months'), 'New filter = new only');
  ok(passesAgeFilter('not_checked', 'skipped') && passesAgeFilter('not_checked', 'unavailable') && !passesAgeFilter('not_checked', 'not_found'), 'Not checked / has website = skipped + unavailable');
  ok(isNewStrongMatch(true, row('strong', '2026-09-11'), NOW) && !isNewStrongMatch(true, row('possible', '2026-09-11'), NOW), 'the boost needs a STRONG match');
}

console.log('── 8. CACHE ──');
{
  const fp = listingFingerprint('Fenland Heating Ltd', '4 Market St, Wisbech PE13 1AB, UK');
  const base = { version: CH_CHECK_VERSION, fingerprint: fp, match: 'strong' as const, checked_at: new Date(NOW.getTime() - 10 * 86_400_000).toISOString() };
  ok(isChCheckFresh(base, fp, NOW.getTime()), 'a 10-day-old strong match is reused (no new call)');
  ok(!isChCheckFresh({ ...base, checked_at: new Date(NOW.getTime() - (CH_STRONG_CACHE_DAYS + 1) * 86_400_000).toISOString() }, fp, NOW.getTime()), `strong expires after ${CH_STRONG_CACHE_DAYS} days`);
  ok(!isChCheckFresh({ ...base, match: 'none', checked_at: new Date(NOW.getTime() - (CH_NOT_FOUND_CACHE_DAYS + 1) * 86_400_000).toISOString() }, fp, NOW.getTime()), `not found is re-asked after ${CH_NOT_FOUND_CACHE_DAYS} days`);
  ok(!isChCheckFresh(base, listingFingerprint('Fenland Heating Ltd', '4 Market St, March PE15 8AA, UK'), NOW.getTime()), 'a changed postcode → fresh lookup');
  ok(!isChCheckFresh(base, listingFingerprint('Fenland Gas & Heating', '4 Market St, Wisbech PE13 1AB, UK'), NOW.getTime()), 'a changed name → fresh lookup');
  ok(listingFingerprint('FENLAND HEATING LIMITED', 'Wisbech PE13 1AB') === listingFingerprint('Fenland Heating Ltd', 'pe131ab'), 'cosmetic differences keep the same identity');
  ok(!isChCheckFresh({ ...base, version: CH_CHECK_VERSION - 1 }, fp, NOW.getTime()), 'an older rules version is looked up again');
  const fn = code('supabase/functions/companies-house-check/index.ts');
  ok(fn.indexOf('isChCheckFresh(cached') < fn.indexOf('lookUpCompany('), 'the function answers from the cache BEFORE any Companies House call');
  ok(/onConflict: "place_id"/.test(fn), 'one row per Google place id');
  ok(!/outreach_leads/.test(fn), 'the function never writes a lead (machine match ≠ confirmed fact)');
}

console.log('── 9. THE LOOKUP — requests, failures ──');
await (async () => {
  const input = { name: 'Fenland Heating Ltd', address: '4 Market St, Wisbech PE13 1AB, UK' };
  {
    const ff = fakeFetch(searchOnly([item('FENLAND HEATING LIMITED', '11111111', '2026-08-12', '9 Elm Rd, Wisbech, England, PE13 2XY')], profile('FENLAND HEATING LIMITED', '11111111', '2026-08-12', 'PE13 2XY', 'Wisbech')));
    const r = await lookUpCompany(input, { apiKey: 'k', fetchImpl: ff.fn });
    ok(r.ok && r.verdict.match === 'strong' && r.requests === 2, 'strong: one search + the profile = 2 requests');
    ok(ff.calls.some((u) => /\/company\/11111111$/.test(u)), '…the profile is fetched for the strong match');
  }
  {
    const ff = fakeFetch(searchOnly([]));
    const r = await lookUpCompany({ name: "Ronnie's Shoe Repairs Wisbech", address: '1 High St, Wisbech PE13 1AB, UK' }, { apiKey: 'k', fetchImpl: ff.fn });
    ok(r.ok && r.verdict.match === 'none' && r.requests === 2 && r.requests <= CH_MAX_REQUESTS, 'not found: two searches, no profile, within the ceiling');
  }
  {
    const ff = fakeFetch(() => ({ status: 429 }));
    const r = await lookUpCompany(input, { apiKey: 'k', fetchImpl: ff.fn });
    ok(!r.ok && r.error === 'rate_limited' && ff.calls.length === 1, '429 → rate_limited, stops at once (no retry storm)');
  }
  {
    const ff = fakeFetch((u) => (u.includes('/search/') ? { status: 200, body: { items: [item('FENLAND HEATING LIMITED', '11111111', '2026-08-12', '9 Elm Rd, Wisbech, PE13 2XY')] } } : { status: 429 }));
    const r = await lookUpCompany(input, { apiKey: 'k', fetchImpl: ff.fn });
    ok(!r.ok && r.error === 'rate_limited', '429 on the profile is still a rate limit (nothing half-stored)');
  }
  for (const [label, route] of [['5xx', () => ({ status: 503 })], ['network down', () => 'throw'], ['timeout', () => 'timeout'], ['malformed JSON', () => ({ status: 200, body: '<<bad>>' })], ['wrong shape', () => ({ status: 200, body: { nope: 1 } })]] as [string, Route][]) {
    const r = await lookUpCompany(input, { apiKey: 'k', fetchImpl: fakeFetch(route).fn });
    ok(!r.ok && r.error === 'unavailable', `API ${label} → unavailable, no throw`);
  }
  {
    const ff = fakeFetch(() => ({ status: 200, body: { items: [] } }));
    const r = await lookUpCompany(input, { apiKey: '', fetchImpl: ff.fn });
    const r2 = await lookUpCompany(input, { apiKey: undefined, fetchImpl: ff.fn });
    ok(!r.ok && r.error === 'not_configured' && !r2.ok && r2.error === 'not_configured' && ff.calls.length === 0, 'no API key → not_configured, ZERO requests');
  }
  {
    const ff = fakeFetch(() => ({ status: 401 }));
    const r = await lookUpCompany(input, { apiKey: 'wrong', fetchImpl: ff.fn });
    ok(!r.ok && r.error === 'not_configured', 'a refused key (401) → not_configured');
  }
  {
    const ff = fakeFetch(searchOnly([]));
    await lookUpCompany(input, { apiKey: 'secret-key', fetchImpl: ff.fn });
    ok(ff.calls.every((u) => u.startsWith('https://api.company-information.service.gov.uk/') && !u.includes('secret-key')), 'the key travels only in the Authorization header, never the URL');
  }
})();

console.log('── 10. THE KEY STAYS ON THE SERVER ──');
{
  const fn = code('supabase/functions/companies-house-check/index.ts');
  ok(/Deno\.env\.get\("COMPANIES_HOUSE_API_KEY"\)/.test(fn), 'the function reads COMPANIES_HOUSE_API_KEY from the environment');
  ok(fn.indexOf('"not_configured"') > 0 && fn.indexOf('"not_configured"') < fn.indexOf('guardAction('), 'missing key answers not_configured before anything else spends');
  for (const p of ['src/lib/companiesHouse.ts', 'src/hooks/useCompaniesHouseChecks.ts', 'src/components/BusinessAgeCell.tsx', 'src/components/LeadsTable.tsx']) {
    ok(!/COMPANIES_HOUSE_API_KEY|api\.company-information/.test(code(p)), `${p} never names the key or calls the API`);
  }
  ok(/\[functions\.companies-house-check\]\nverify_jwt = true/.test(read('supabase/config.toml')), 'config.toml lists the function (verify_jwt = true)');
  const sql = read('supabase/migrations/20261004130000_companies_house_checks.sql');
  ok(/enable row level security/.test(sql) && /revoke insert, update, delete, truncate on public\.companies_house_checks from anon, authenticated/.test(sql), 'table: RLS on, only the function writes');
}

console.log('── 11. FIND LEADS WIRING — and the agency check is untouched ──');
{
  const t = code('src/components/LeadsTable.tsx');
  ok(/const agency = useAgencyChecks\(agencyItems\)/.test(t) && /hasOwnWebsite: hasOwnSite\(l\)/.test(t), 'the agency check still runs for every own-website result');
  ok(/passesSiteFilter\(siteFilter/.test(t) && /SITE_FILTERS\.map/.test(t), 'the site-management filter is still there');
  ok(/if \(agency\.pending > 0\) return shown;/.test(t), 'rows never jump while the agency checks are still running');
  ok(/\.\.\.last\]/.test(t), 'high-confidence agency sites still sort last');
  ok(!/Business age/.test(t) && !/age-filter/.test(t) && !/passesAgeFilter|ageFilter/.test(t), 'no Business age column, filter or sort remains in Find Leads');
  ok(/colSpan=\{bulkAllowed \? 6 : 5\}/.test(t), 'the empty row spans the remaining columns');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
