/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIND LEADS FINDS MOST OF A TOWN (2026-10-23, feat/find-leads-coverage). Fixtures only, no network.

   Pinned here:
     A. Australia's in-town rule (src/lib/inTown.ts): √population ÷ 50, a suburb of the town IN (Lavington under
        Albury), a separate urban centre OUT (Wodonga, Bargara), the wrong-state guard first.
     B. Singapore has its own rule, never the UK branch.
     C. The town box (src/lib/townSearchArea.ts): a small Australian box widened from the population, every other
        box unchanged.
     D. Thorough: at most THOROUGH_MAX_TILES tiles over the box, the per-town and per-press call ceilings, the
        server enforcing the ceiling as a reservation, Thorough for Australia by default.
     E. The words: the price derived from the billed rate, money for admins only.
     F. "Found" counts only what the screen shows (the in-town rows).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { inTownVerdict, townRadiusKm, outsideSearchedTown } from '../src/lib/inTown.ts';
import {
  AU_SMALL_BOX_KM2, THOROUGH_MAX_CALLS_PER_PRESS, THOROUGH_MAX_CALLS_PER_TOWN, THOROUGH_MAX_TILES, THOROUGH_MAX_TOWNS_PER_PRESS,
  THOROUGH_MAX_USD_PER_TOWN, TEXT_SEARCH_USD_PER_PAGE, GEOCODE_USD, boxAreaKm2, defaultSearchDepth, parseSearchDepth, usableSearchDepth, THOROUGH_SEARCH_ENABLED,
  squareBox, thoroughTiles, townSearchBox,
} from '../src/lib/townSearchArea.ts';
import { depthButtonSuffix, depthNote, gbpWords } from '../src/lib/searchDepthWords.ts';
import { findLeadsHref } from '../src/lib/coverageState.ts';
import { manyTownsHref } from '../src/lib/manyTowns.ts';

let failures = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  ok  ' + m); else { failures++; console.error('  FAIL ' + m); } };

const ALBURY = { lat: -36.0737, lng: 146.9135 };
console.log('A. Australia: the wider radius, suburbs in, neighbouring towns out');
ok(Math.abs(townRadiusKm(53677, 'Australia') - 4.63) < 0.05, 'Albury (53,677) → 4.6 km in Australia');
ok(Math.abs(townRadiusKm(53677) - 2.9) < 0.05 && Math.abs(townRadiusKm(53677, 'UK') - 2.9) < 0.05, 'the UK / default radius is unchanged (÷80)');
ok(townRadiusKm(4_900_000, 'Australia') === 15 && townRadiusKm(500, 'Australia') === 2 && townRadiusKm(null, 'Australia') === 3, 'same 2–15 km bounds, 3 km unknown');
const lav = inTownVerdict({ town: 'Albury NSW', country: 'Australia', address: '12 Urana Rd, Lavington NSW 2641, Australia', lat: -36.0418, lng: 146.9339, centre: ALBURY, population: 53677 });
ok(lav.inTown === true && lav.reason === 'distance', `Lavington (a suburb of Albury, ~3.8 km) is IN: ${lav.reason} ${lav.km} km`);
const wod = inTownVerdict({ town: 'Albury NSW', country: 'Australia', address: '5 High St, Wodonga VIC 3690, Australia', lat: -36.1227, lng: 146.8824, centre: ALBURY, population: 53677 });
ok(wod.inTown === false && wod.reason === 'other_state', 'Wodonga VIC under Albury NSW: the wrong-state guard still fires first');
const barg = inTownVerdict({ town: 'Bundaberg QLD', country: 'Australia', address: '1 See St, Bargara QLD 4670, Australia', lat: -24.88, lng: 152.40, centre: { lat: -24.8661, lng: 152.3489 }, population: 52370 });
ok(barg.inTown === false && barg.reason === 'other_town', 'Bargara (its own urban centre) is OUT of Bundaberg even inside the radius');
const own = inTownVerdict({ town: 'Bundaberg QLD', country: 'Australia', address: '3 Bourbong St, Bundaberg Central QLD 4670, Australia', lat: -24.866, lng: 152.349, centre: { lat: -24.8661, lng: 152.3489 }, population: 52370 });
ok(own.inTown === true, 'Bundaberg Central is IN Bundaberg');

console.log('B. Singapore: its own rule');
const SG = { lat: 1.3521, lng: 103.8198 };
const far = inTownVerdict({ town: 'Singapore', country: 'Singapore', address: '1 Tampines Central 5, #01-01, Singapore 529508', lat: 1.354, lng: 103.944, centre: SG, population: null });
ok(far.inTown === true, 'a business 14 km from the centre is IN a search for Singapore itself (it is one city)');
const jb = inTownVerdict({ town: 'Singapore', country: 'Singapore', address: '10 Jalan Wong Ah Fook, 80000 Johor Bahru, Johor, Malaysia', lat: 1.46, lng: 103.76, centre: SG, population: null });
ok(jb.inTown === false, 'a Malaysian address is OUT of a Singapore search');
const tam = inTownVerdict({ town: 'Tampines', country: 'Singapore', address: 'Blk 201 Tampines Street 21, #01-1100, Singapore 521201', lat: 1.36, lng: 103.95, centre: { lat: 1.3496, lng: 103.9568 }, population: 274_000 });
ok(tam.inTown === true && tam.reason === 'address_part', 'Tampines Street 21 is IN Tampines (named by the address)');
const bed = inTownVerdict({ town: 'Tampines', country: 'Singapore', address: '50 Bedok North Ave 3, Singapore 460050', lat: 1.333, lng: 103.92, centre: { lat: 1.3496, lng: 103.9568 }, population: 274_000 });
ok(bed.inTown === false && bed.reason === 'too_far', `Bedok (4.4 km away) is OUT of Tampines: ${bed.km} km — a planning area is never sized from its resident count`);
const searchSrc = readFileSync('supabase/functions/search-leads/index.ts', 'utf8');
ok(/country && country !== 'UK'\) return \{ town, population: null \}/.test(searchSrc), 'search-leads: Singapore (and any non-UK country) never takes a uk_towns population');

console.log('C. The town box');
const bund = { latMin: -24.873, latMax: -24.86, lngMin: 152.341, lngMax: 152.357 }; // ~1.6 × 1.4 km
ok(boxAreaKm2(bund) < AU_SMALL_BOX_KM2, 'Bundaberg\'s Google box is under the small-box line');
const w = townSearchBox(bund, { lat: -24.8661, lng: 152.3489 }, 'Australia', townRadiusKm(52370, 'Australia'));
ok(w.widened && boxAreaKm2(w.box) > 70 && w.box.latMin <= bund.latMin && w.box.lngMax >= bund.lngMax, `widened to ${boxAreaKm2(w.box).toFixed(0)} km², Google's box kept inside it`);
ok(!townSearchBox(bund, { lat: -24.8661, lng: 152.3489 }, 'UK', 4).widened, 'a UK box is never widened');
ok(!townSearchBox(bund, { lat: -24.8661, lng: 152.3489 }, 'Australia', null).widened, 'no population → Google\'s box unchanged');
const big = squareBox({ lat: -37.56, lng: 143.85 }, 4);
ok(!townSearchBox(big, { lat: -37.56, lng: 143.85 }, 'Australia', 9).widened, 'an Australian box already 25 km²+ is unchanged');

console.log('D. Thorough');
for (const [name, b] of [['Albury widened', squareBox(ALBURY, 4.63)], ['a UK town', squareBox({ lat: 52.6, lng: 0.16 }, 3.2)], ['Kuala Lumpur', squareBox({ lat: 3.14, lng: 101.69 }, 15)], ['a tiny box', squareBox(ALBURY, 0.5)]] as const) {
  const g = thoroughTiles(b);
  ok(g.tiles.length >= 1 && g.tiles.length <= THOROUGH_MAX_TILES, `${name}: ${g.cols}×${g.rows} tiles of ~${g.tileKm} km (≤ ${THOROUGH_MAX_TILES})`);
}
const tg = thoroughTiles(squareBox(ALBURY, 4.63));
const area = tg.tiles.reduce((n, t) => n + boxAreaKm2(t), 0);
ok(Math.abs(area - boxAreaKm2(squareBox(ALBURY, 4.63))) < 0.5, 'the tiles cover the box exactly (no gaps, no overlap)');
ok(THOROUGH_MAX_CALLS_PER_TOWN === 16 && THOROUGH_MAX_TILES <= THOROUGH_MAX_CALLS_PER_TOWN, 'per-town ceiling 16 calls, room for page 1 of every tile');
ok(THOROUGH_MAX_TOWNS_PER_PRESS * THOROUGH_MAX_CALLS_PER_TOWN <= THOROUGH_MAX_CALLS_PER_PRESS, `per-press ceiling: ${THOROUGH_MAX_TOWNS_PER_PRESS} towns × 16 ≤ ${THOROUGH_MAX_CALLS_PER_PRESS} calls`);
ok(/const take = \(\) => \(reserved < THOROUGH_MAX_CALLS_PER_TOWN/.test(searchSrc) && /if \(!take\(\)\) return null;/.test(searchSrc), 'search-leads reserves a call BEFORE each Thorough request (concurrent tiles cannot pass the ceiling)');
ok(/townOnly && depthAsked === 'thorough' \? 'thorough' : 'standard'/.test(searchSrc), 'Thorough only on a town-only search; anything else runs Standard');
ok(/##thorough/.test(searchSrc) && /##aubox2/.test(searchSrc), 'Thorough has its own cache pool; an Australian centre-only pool is not replayed');
const ctx = readFileSync('src/contexts/LeadSearchContext.tsx', 'utf8');
ok(/townsForPress\(towns, usableSearchDepth\(base\.depth\) === 'thorough' \? THOROUGH_MAX_TOWNS_PER_PRESS/.test(ctx), 'many towns on Thorough searches at most the press ceiling of towns');
ok(THOROUGH_SEARCH_ENABLED === false, 'Thorough is switched off (docs/thorough-search-off.md)');
ok(defaultSearchDepth('Australia') === 'standard' && defaultSearchDepth('UK') === 'standard' && defaultSearchDepth('Malaysia') === 'standard', 'Standard is the default everywhere while Thorough is off');
ok(parseSearchDepth('thorough') === 'standard' && usableSearchDepth('thorough') === 'standard' && usableSearchDepth(undefined) === 'standard', 'a saved / linked thorough falls back to Standard');
ok(parseSearchDepth('deep') === null && parseSearchDepth(null) === null, 'an unknown depth is never read as one');
const covSrc = readFileSync('src/pages/Coverage.tsx', 'utf8');
ok(/THOROUGH_SEARCH_ENABLED && <div[^>]*data-testid="coverage-search-depth"/.test(covSrc) && /THOROUGH_SEARCH_ENABLED && <div className="pt-1">/.test(readFileSync('src/components/SearchForm.tsx', 'utf8')), 'both Thorough buttons sit behind the one switch');
ok(findLeadsHref('locksmiths', 'Albury NSW, Australia', 'Australia', 'thorough').includes('depth=thorough') && !findLeadsHref('locksmiths', 'Hastings').includes('depth='), 'the Coverage link carries the depth; an old call is byte-identical');
ok((manyTownsHref('locksmiths', ['A', 'B'], 'Australia', 'standard') ?? '').includes('depth=standard'), 'many towns carries it too');
const sf = readFileSync('src/components/SearchForm.tsx', 'utf8');
ok(!/usePersistedState\([^)]*depth/i.test(sf) && !/usePersistedState\([^)]*depth/i.test(readFileSync('src/pages/Coverage.tsx', 'utf8')), 'the depth is never persisted (Thorough is never carried silently)');

console.log('E. The words');
ok(Math.abs(THOROUGH_MAX_USD_PER_TOWN - (GEOCODE_USD + 16 * TEXT_SEARCH_USD_PER_PAGE)) < 1e-9, 'the ceiling price is derived from the billed rates');
ok(gbpWords(THOROUGH_MAX_USD_PER_TOWN) === '45p' && gbpWords(THOROUGH_MAX_USD_PER_TOWN * 3) === '£1.34', 'up to 45p a town; £1.34 for three');
ok(depthButtonSuffix('thorough', 1, true) === ' · up to 45p' && depthButtonSuffix('thorough', 1, false) === ' · Thorough' && depthButtonSuffix('standard', 3, true) === '', 'money for admins only; Standard unpriced');
ok(!/£|\dp\b/.test(depthNote('thorough', false)) && /45p/.test(depthNote('thorough', true)), 'the note shows no money to sales');

console.log('F. Found = what the screen shows');
const rows = [{ townCheck: { inTown: true } }, { townCheck: { inTown: false } }, { outsideTown: true }, { townCheck: { inTown: null }, outsideTown: false }];
ok(rows.filter((l) => !outsideSearchedTown(l)).length === 2, 'the in-town rows are the ones counted');
ok((ctx.match(/inTownShown/g) ?? []).length >= 6 && /found: inTownShown\.length/.test(ctx), 'both the one-town and many-towns runs record and show the in-town count');

console.log('G. The country box never flips on an empty value');
ok(/onValueChange=\{\(v\) => \{ if \(v\) changeCountry\(normaliseSearchCountry\(v\)\); \}\}/.test(sf), 'Find Leads ignores the Select\'s empty onValueChange (it used to read as UK and drop Thorough)');

console.log('H. The town lists');
const mig = readFileSync('supabase/migrations/20261023120000_uk_towns_scotland_ni_london.sql', 'utf8');
const migRows = [...mig.matchAll(/^ {2}\('([SNE]\d+)', '((?:[^']|'')+)', (\d+), '([^']+)'/gm)];
ok(migRows.length === 109, `109 Scotland / Northern Ireland / London rows (${migRows.length})`);
ok(migRows.every((m) => Number(m[3]) >= 12000), 'every row 12,000+ (the England & Wales rule)');
ok(/on conflict \(ons_code\) do nothing;/.test(mig) && !/suppressed_|delete |update /i.test(mig.replace(/^--.*$/gm, '')), 'additive only: no update, no delete, suppression never written');
const names = migRows.map((m) => m[2]);
ok(['Glasgow', 'Edinburgh', 'Belfast', 'Londonderry', 'Croydon', 'Tower Hamlets', 'Bangor, County Down'].every((n) => names.includes(n)) && !names.includes('Greater Glasgow') && !names.includes('City of London'), 'searchable names; the City of London (under 12,000) left out');
ok(new Set(names).size === names.length, 'no name twice');
const { MALAYSIA_COVERAGE_TOWNS } = await import('../src/data/malaysiaCoverageTowns.ts');
const myNames = MALAYSIA_COVERAGE_TOWNS.map((t) => t[1]);
ok(myNames.length === 66 && ['Sandakan', 'Tawau', 'Miri', 'Teluk Intan', 'Pasir Gudang'].every((n) => myNames.includes(n)), `66 Malaysian towns of 50,000+ (${myNames.length}), Sandakan, Tawau, Miri… on the list`);
ok(!myNames.some((n) => /^(kampung|kampong|taman|mukim)\b/i.test(n)) && !['Setapak', 'Bukit Bintang', 'Subang Jaya', 'Skudai'].some((n) => myNames.includes(n)), 'no kampung, no suburb (PPLX) and no Kuala Lumpur neighbourhood');
const cc = readFileSync('src/lib/coverageCountries.ts', 'utf8');
ok(!/malaysiaCoverageTowns/.test(cc), 'the new towns are NOT in ABROAD_TOWNS (the name cleaner on every sending path reads it)');
ok(/MALAYSIA_COVERAGE_TOWNS/.test(readFileSync('src/hooks/useCoverage.ts', 'utf8')), 'Coverage lists them');

console.log(failures ? `\nFAILED: ${failures}` : '\nAll passed.');
if (failures) process.exit(1);
