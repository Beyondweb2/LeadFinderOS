/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE COVERAGE TOWN IS THE QUESTION'S TOWN (2026-10-20, fix/coverage-town-strict).

   Pinned here (fixtures only — no Google call, no audit):
     1. The in-the-town rule (src/lib/inTown.ts): names first (post town, London district, address part), a different
        post town is out, a London area search is decided by the district, otherwise distance scaled to size.
     2. UK and Malaysia address shapes.
     3. Find Leads: out-of-town rows hidden behind one grey line, never added (row, Add all, Add all with emails),
        outsideTown kept; the Coverage town is saved only for a verified in-town result.
     4. The audit: the Coverage town with no distance cap; never a bare "London" when the postcode gives the area;
        otherwise marked broad. Older leads keep the 25 km found-under rule.
     5. The crawl's town issue names the question's town.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  inTownVerdict, parseAddress, areaFromAddress, londonAreaFor, townRadiusKm, sameTown, isBroadTown,
  outsideSearchedTown, verifiedInSearchedTown, leadQuestionTown, BROAD_TOWN_NOTE,
} from '../src/lib/inTown.ts';
import { coverageTownFor, addRowFor } from '../src/lib/findLeadsBulkAdd.ts';

let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log('  PASS ' + label);
  else { failures++; console.log('  FAIL ' + label); }
}
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const CHESHUNT = { lat: 51.7074, lng: -0.0441 };
const MWAY = 'Selby centre, Selby Rd, London N17 8JL, UK';

console.log('\n── 1. the rule ──');
const mway = inTownVerdict({ town: 'Cheshunt', country: 'UK', address: MWAY, lat: 51.6069585, lng: -0.0788016, centre: CHESHUNT, population: 43680 });
ok(mway.inTown === false && mway.reason === 'too_far' && mway.area === 'Tottenham' && (mway.km ?? 0) > 10, `Mway (N17) is not in Cheshunt: ${mway.reason}, ${mway.km} km, area ${mway.area}`);
ok(inTownVerdict({ town: 'Cheshunt', address: '12 High St, Cheshunt, Waltham Cross EN8 0BX, UK' }).inTown === true, 'an address part naming the town → in');
ok(inTownVerdict({ town: 'Cheshunt', address: '12 Eleanor Rd, Cheshunt EN8 0BX, UK' }).reason === 'post_town', 'the post town → in (post_town)');
ok(inTownVerdict({ town: 'Cheshunt', address: '3 Monarchs Way, Waltham Cross EN8 7SB, UK', lat: 51.69, lng: -0.03, centre: CHESHUNT, population: 43680 }).reason === 'other_town', 'a different ordinary post town → out, even when close');
ok(inTownVerdict({ town: 'Tottenham', address: MWAY }).reason === 'postcode_district', 'London N17 searched as Tottenham → in by the district');
ok(inTownVerdict({ town: 'Haringey', address: MWAY }).inTown === true, 'the district\'s borough matches too');
ok(inTownVerdict({ town: 'Pimlico', address: '5 Warwick Way, London SW1V 1QT, UK' }).inTown === true, 'SW1V → Pimlico');
ok(inTownVerdict({ town: 'Pimlico', address: '1 Horseferry Rd, London SW1P 2AF, UK' }).reason === 'other_district', 'a London area search: another district → out');
ok(inTownVerdict({ town: 'London', address: MWAY }).inTown === true, 'a London search keeps every London post town');
const crouch = inTownVerdict({ town: 'Crouch End', address: '2 Park Rd, London N8 8TE, UK', lat: 51.579, lng: -0.123, centre: { lat: 51.5796, lng: -0.1236 } });
ok(crouch.inTown === true && crouch.reason === 'distance', 'a London neighbourhood not in the table → distance decides, not "other district"');
ok(inTownVerdict({ town: 'Hastings', address: 'Somewhere' }).inTown === null, 'nothing to judge on → null (outsideTown decides)');
ok(inTownVerdict({ town: 'Bexhill', address: '1 Sea Rd, Bexhill-on-Sea TN40 1EE, UK' }).inTown === true && sameTown('Bexhill', 'Bexhill-on-Sea'), 'Bexhill = Bexhill-on-Sea');
ok(!sameTown('Newport', 'Newport Pagnell'), 'Newport ≠ Newport Pagnell');
ok(Math.abs(townRadiusKm(43680) - 2.61) < 0.05 && townRadiusKm(5000) === 2 && townRadiusKm(5_000_000) === 15 && townRadiusKm(null) === 3, 'radius = √pop ÷ 80, 2–15 km, 3 km unknown');

console.log('\n── 2. address shapes ──');
const p = parseAddress(MWAY, 'UK');
ok(p.postTown === 'London' && p.district === 'N17', 'UK: post town + district');
ok(londonAreaFor('SW1A')?.area === 'Westminster' && londonAreaFor('N1C')?.area === "King's Cross", 'sub-district → parent unless listed');
ok(areaFromAddress(MWAY) === 'Tottenham' && areaFromAddress('1 Mill Rd, Cambridge CB1 2AD, UK') === 'Cambridge', 'finest area');
const pj = '12, Jalan SS 2/24, SS 2, 47300 Petaling Jaya, Selangor, Malaysia';
ok(parseAddress(pj, 'Malaysia').postTown === 'Petaling Jaya', 'Malaysia: "47300 Petaling Jaya"');
ok(inTownVerdict({ town: 'PJ', country: 'Malaysia', address: pj }).inTown === true, 'Malaysia: another name of the town (PJ) matches');
ok(inTownVerdict({ town: 'Petaling Jaya', country: 'Malaysia', address: '3, Jalan USJ 9/5Q, 47620 Subang Jaya, Selangor, Malaysia' }).reason === 'other_town', 'Malaysia: Subang Jaya is not Petaling Jaya');
const bb = 'Lot 1, Jalan Bukit Bintang, Bukit Bintang, 55100 Kuala Lumpur, Wilayah Persekutuan Kuala Lumpur, Malaysia';
ok(inTownVerdict({ town: 'Bukit Bintang', country: 'Malaysia', address: bb }).inTown === true, 'Malaysia: a neighbourhood named in the address');
ok(inTownVerdict({ town: 'Kuala Lumpur', country: 'Malaysia', address: bb }).reason === 'post_town', 'Malaysia: the city itself');
ok(inTownVerdict({ town: 'Cheras', country: 'Malaysia', address: '9, Jalan Cheras, 56100 Kuala Lumpur, Malaysia', lat: 3.3, lng: 101.9, centre: { lat: 3.1, lng: 101.74 }, population: 300000 }).reason === 'too_far', 'Malaysia: a city post town goes to distance');

console.log('\n── 3. Find Leads ──');
ok(outsideSearchedTown({ townCheck: { inTown: false } }) && !outsideSearchedTown({ townCheck: { inTown: true }, outsideTown: true }), 'the verdict decides when it was judged (even over the boundary flag)');
ok(outsideSearchedTown({ townCheck: { inTown: null }, outsideTown: true }) && !outsideSearchedTown({ townCheck: { inTown: null } }), 'not judged → Google\'s boundary decides');
ok(outsideSearchedTown({ outsideTown: true }) && !outsideSearchedTown({}), 'results from before the rule: outsideTown as before');
ok(verifiedInSearchedTown({ townCheck: { inTown: true } }) && !verifiedInSearchedTown({ townCheck: { inTown: null } }) && !verifiedInSearchedTown({}), 'verified only on a judged IN');
const base = { id: 'p1', name: 'A Plumber', googleMapsUrl: 'https://maps.google.com/?cid=1', websiteStatus: 'NO_WEBSITE' };
ok(coverageTownFor({ ...base, townCheck: { inTown: true } }, 'Kuala Lumpur, Malaysia') === 'Kuala Lumpur', 'Coverage town saved, cleaned (no ", Malaysia")');
ok(coverageTownFor({ ...base, townCheck: { inTown: null } }, 'Cheshunt') === null && coverageTownFor(base, 'Cheshunt') === null, 'never saved unless verified');
ok((addRowFor({ ...base, townCheck: { inTown: true } }, { trade: 'plumber', town: 'Cheshunt', country: 'UK' }, null, null, null) as { coverage_town?: string }).coverage_town === 'Cheshunt', 'the add row carries coverage_town');
const ix = read('../src/pages/Index.tsx');
ok(/const sel = selAll\.filter\(\(l\) => !outsideSearchedTown\(l\)\)/.test(ix) && /!isInOutreach\(l\.name, l\.googleMapsUrl\) && !outsideSearchedTown\(l\)/.test(ix), 'every add path refuses them (one door + Add all with emails)');
const sl = read('../supabase/functions/search-leads/index.ts');
ok((sl.match(/places\.formattedAddress,places\.location,nextPageToken/g) ?? []).length === 3, 'places.location asked on every text search (free at the billed tier)');
ok(/outsideTown: true/.test(sl) && /townOnly && !region \? await attachTownChecks/.test(sl) && /if \(townOnly && !regionMeta\) leads = await attachTownChecks/.test(sl), 'town-only answers marked, cached or fresh; outsideTown kept');
const mig = read('../supabase/migrations/20261111090000_coverage_town.sql');
ok(/add column if not exists coverage_town text/.test(mig) && /town_fetch_note, coverage_town\)/.test(mig) && /o ->> 'coverage_town'\)/.test(mig) && !/drop |delete from|update public\.outreach_leads/i.test(mig), 'additive: one column, written on insert only');

console.log('\n── 4. the audit ──');
ok(leadQuestionTown({ coverage_town: 'Cheshunt', derived_town: 'Waltham Cross' }).town === 'Cheshunt', 'Coverage town first');
ok(leadQuestionTown({ derived_town: 'London', address: MWAY }).town === 'Tottenham', 'never bare London when the postcode names the area');
const broad = leadQuestionTown({ derived_town: 'London', address: 'London, UK' });
ok(broad.town === 'London' && broad.broad, 'only London possible → kept, marked broad');
ok(leadQuestionTown({ coverage_town: 'London', address: MWAY }).town === 'Tottenham', 'a broad Coverage town is narrowed too');
ok(isBroadTown('London') && !isBroadTown('Tottenham') && !isBroadTown('Kuala Lumpur'), 'broad = London / a nation, not a city like KL');
const ca = read('../supabase/functions/create-ai-audit/index.ts');
ok(/coverageTown && !isBroadTown\(coverageTown\)\) \{[\s\S]{0,400}townFixed = true;/.test(ca) && /if \(townFixed\) \{[\s\S]{0,200}distance not checked/.test(ca), 'Coverage town used with no distance cap');
ok(/else if \(!ukGazetteerApplies\(country, derived\.address\)\)[\s\S]{0,1500}foundUnder && foundUnder\.toLowerCase\(\) !== locationText\.toLowerCase\(\)/.test(ca), 'older leads keep the 25 km found-under rule');
ok(/isBroadTown\(locationText\)\) \{[\s\S]{0,200}areaFromAddress\(derived\.address/.test(ca) && /BROAD_TOWN_NOTE\]/.test(ca) && BROAD_TOWN_NOTE.startsWith('Broad town'), 'broad → finer area, else the audit is marked broad in location_note');

console.log('\n── 5. the crawl names the question\'s town ──');
const qt = read('../supabase/functions/_shared/question-town.ts');
ok(/from\("ai_audits"\)\.select\("location_text"\)\.eq\("lead_id", leadId\)/.test(qt) && /leadQuestionTown\(/.test(qt), 'the newest audit\'s asked town, else the town an audit would ask');
const cc = read('../supabase/functions/crawl-check/index.ts');
ok(/town = \(\(await questionTownForLead\(service, leadId\)\)/.test(cc) && (cc.match(/town: \(insightTown \|\| \(leadRow\?\.derived_town/g) ?? []).length === 2, 'quick check: question town before Google\'s');
const cj = read('../supabase/functions/_shared/crawl-job.ts');
ok((cj.match(/await questionTownForLead\(service, job\.lead_id\)/g) ?? []).length === 2, 'deep crawl: question town before Google\'s');

console.log(failures ? `\nFAILED: ${failures}` : '\nAll passed.');
if (failures) process.exit(1);
