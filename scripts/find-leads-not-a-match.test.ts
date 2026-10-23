/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIND LEADS "NOT A MATCH" (src/lib/nicheMatch.ts, Paul 2026-10-23). Pins the cases from Paul's cached searches (the
   30 days to 2026-10-23, docs/find-leads-not-a-match.md): what is hidden, what must never be, and the wiring — one grey
   line with Show, never added or counted in found while hidden, reversible.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { heldNotMatch, nicheProfile, notNicheMatch, stem } from '../src/lib/nicheMatch.ts';

let failures = 0;
function ok(cond: unknown, label: string) { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); }
const hides = (kw: string, name: string, primaryType: string | null) => notNicheMatch({ name, primaryType }, nicheProfile(kw));

console.log('── hidden: clearly not the niche ──');
for (const [kw, name, t] of [
  ['driving instructors', 'Mackay Hyundai', 'car_dealer'],
  ['driving instructors', 'Department of Transport and Main Roads Customer Service Centre Mackay', 'local_government_office'],
  ['driving instructors', 'VicRoads - Warrnambool Customer Service Centre', 'local_government_office'],
  ['driving instructors', 'Kwik Fit - Taunton', 'tire_shop'],
  ['driving instructors', 'Hallgrove Garage', 'car_repair'],
  ['driving instructors', 'Panshanger Golf Complex', 'golf_course'],
  ['driving instructors', 'St Francis Xavier Primary School', 'school'],
  ['language schools', 'Bethel Prayer Fellowship Stevenage', 'church'],
  ['language school', 'Books Kinokuniya Singapore Main Store', 'book_store'],
  ['plumbers', 'Wolseley Maintence', 'manufacturer'],
  ['locksmiths', 'Lorenz Eyewear Services', 'manufacturer'],
  ['accountants', 'Hamilton Reiss Ltd', 'real_estate_agency'],
] as const) ok(hides(kw, name, t), `${kw}: "${name}" [${t}] is not a match`);

console.log('\n── kept: the niche, however Google files it ──');
for (const [kw, name, t] of [
  ['driving instructors', 'Dave Hitchen Driving School', 'educational_institution'],
  ['driving instructors', 'Furness School Of Motoring', 'educational_institution'],
  ['driving instructors', 'Top Gear Driving School', 'corporate_office'],
  ['driving instructors', 'IAM RoadSmart', 'association_or_organization'],
  ['driving instructors', 'DVSA (Newcastle under Lyme)', null],
  ['plumbers', 'A P Plumbing Solutions', 'service'],
  ['plumbers', 'Byrnes Gas services', 'general_contractor'],
  ['plumbers', 'Home Exeter Limited', 'electrician'],
  ['plumber', 'Plumbworld D.I.Y LTD', 'home_goods_store'],
  ['electricians', 'Edmundson Electrical', 'wholesaler'],
  ['electricians', 'H2Ohms Plumbing and Electrical Specialists Limited', 'plumber'],
  ['locksmiths', 'Lansdowne Hardware & Key Cutting', 'hardware_store'],
  ['locksmiths', 'A-Z Security Solutions', 'supplier'],
  ['locksmiths', 'South Benfleet Plumbing And Locks Services', 'plumber'],
  ['roofers', 'Burton Roofing Merchants - Hull', 'building_materials_store'],
  ['painter', 's8 handyman', 'general_contractor'],
  ['gym', 'Olympia Health & Fitness', 'fitness_center'],
  ['gym', 'Olympus fight club-gym', 'sports_coaching'],
  ['restaurant', 'Mulino Birmingham', 'coffee_shop'],
  ['restaurant', 'Lucarelli Italian Restaurant', 'italian_restaurant'],
  ['accountants', 'ZP Chartered Accountants', 'consultant'],
  ['accountants', 'Seymour & Inman Ltd', 'accounting'],
  ['language schools', 'English Zone (Philolingual Education)', 'educational_institution'],
  ['language schools', 'Goro Language School', 'consultant'],
  ['video editor', 'Edinburgh Sound News', 'store'],
] as const) ok(!hides(kw, name, t), `${kw}: "${name}" [${t}] is kept`);

console.log('\n── absent is never a mismatch ──');
ok(!hides('driving instructors', 'Mackay Hyundai', null), 'no Google category → kept');
ok(!hides('', 'Mackay Hyundai', 'car_dealer') && nicheProfile('') === null && nicheProfile(null) === null, 'no keyword → nothing is judged');
ok(!notNicheMatch({ name: 'Mackay Hyundai', primaryType: 'car_dealer' }, null), 'no profile → kept');
ok(stem('electricians') === 'electric' && stem('plumbing') === 'plumb' && stem('roofers') === 'roof' && stem('accountants') === 'account', 'stems');

console.log('\n── reversible: Show makes them ordinary rows ──');
const p = nicheProfile('driving instructors');
const hy = { name: 'Mackay Hyundai', primaryType: 'car_dealer' };
ok(heldNotMatch(hy, p, false) && !heldNotMatch(hy, p, true), 'held while hidden, an ordinary row once shown');

console.log('\n── wiring ──');
{
  const read = (f: string) => readFileSync(f, 'utf8');
  const table = read('src/components/LeadsTable.tsx');
  const ctx = read('src/contexts/LeadSearchContext.tsx');
  const index = read('src/pages/Index.tsx');
  ok(/data-testid="not-a-match-line"/.test(table) && /not a match for \{nicheWords\}/.test(table) && /setShowNotMatch\(\(v\) => !v\)/.test(table), 'one grey "Not a match" line with Show / Hide');
  ok(/showNotMatch \|\| !isNotMatch\(l\)/.test(table), 'hidden from the rows (and so from the shown count) until Show');
  ok(/heldNotMatch\(lead, niche, showNotMatch\)\) return/.test(table) && !/heldOutOfTown\(lead, showOutside\)\}/.test(table), 'never added from its row while hidden');
  ok(/!checkIsInOutreach\(l\.name, l\.googleMapsUrl\) && !held\(l\)/.test(table), 'never in Select all while hidden');
  ok((ctx.match(/!outsideSearchedTown\(l\) && !notNicheMatch\(l, niche\)/g) ?? []).length === 2, 'never counted in found — one search and many towns');
  ok(/!notNicheMatch\(l, niche\)\) \|\| shownIdsRef\.current\.has\(l\.id\)/.test(index), 'the one add door refuses a hidden one too');
  ok(/searchedNiche=\{lastSearchKeyword\}/.test(index), 'the table is told the niche searched');
  ok(/setShowNotMatch\(false\)/.test(table), 'a new search starts hidden again');
  ok(!/delete|\.remove\(/.test(read('src/lib/nicheMatch.ts').replace(/\/\*[\s\S]*?\*\//g, '')), 'nothing is deleted');
}

if (failures) { console.log(`\n${failures} FAILURE${failures === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
