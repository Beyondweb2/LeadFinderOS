/* ============================================================
   AUSTRALIA ON THE PROSPECTING PATH + THE FIND LEADS LOCATION PICKER (2026-10-07, improve/au-location-parity).

   Pins:
     · the picker (src/lib/locationPicker.ts): COUNTRY → LOCATION → RADIUS; countries by NAME (no flag emoji);
       suggestions for the selected country only, collapsed to SUGGESTED_COLLAPSED_COUNT; a suggestion sends
       the same string as before (UK bare, others "City, Country"); a country change clears an old-country
       location, keeps a typed suburb, never touches the radius; the persisted keys are unchanged;
     · the geocode bias: with Australia picked, "Perth WA" / "Darwin NT" are Australian (not Washington /
       the Northwest Territories) and get their own cache key; "New South Wales" is never read as Wales;
       UK / US readings unchanged;
     · search-leads: the country field accepts every picker value; a neutral not-found hint; Australian
       directories are not a business's own website;
     · audit place strings: "Sydney NSW" / "Sydney AU" are already pinned (no "Sydney Australia NSW"); bare
       Australian towns get " Australia"; UK questions unchanged ("Rugby UK", "Leeds UK");
     · the wrong-town guard reads uk_towns only for a UK lead;
     · CSV import: the row's country (explicit column or derived), the function otherwise identical.

   Run: npx tsx scripts/au-location-parity.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  SEARCH_COUNTRY_OPTIONS, SUGGESTED_LOCATIONS, SUGGESTED_COLLAPSED_COUNT, DEFAULT_SEARCH_COUNTRY,
  countryName, normaliseSearchCountry, suggestedLocationsFor, quickLocationValue, isQuickLocationSelected,
  locationTiedToCountry, locationAfterCountryChange,
} from '../src/lib/locationPicker.ts';
import { qualifierInfo, resolveGeoBias, pickedCountryKeySuffix } from '../supabase/functions/_shared/geobias.ts';
import { qualifyPlace, placeNamesCountry, placeSuffixForCountry } from '../src/lib/seedGuard.ts';
import { ukGazetteerApplies } from '../src/lib/leadCountry.ts';
import { IMPORT_FIELDS, autoMapColumns, buildImportRows, parseCsv, reasonText } from '../src/lib/csvLeadImport.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log('\n── the country dropdown ──');
ok(DEFAULT_SEARCH_COUNTRY === 'UK' && SEARCH_COUNTRY_OPTIONS[0].value === 'UK' && SEARCH_COUNTRY_OPTIONS[1].value === 'Australia', 'UK is the default and first; Australia second');
ok(countryName('UK') === 'United Kingdom' && countryName('Australia') === 'Australia' && countryName('NewZealand') === 'New Zealand', 'countries are shown by name ("United Kingdom", "New Zealand")');
ok(SEARCH_COUNTRY_OPTIONS.every((o) => /^[A-Z]{2}$/.test(o.code) && !/[\u{1F1E6}-\u{1F1FF}]/u.test(o.name)), 'a compact ISO code beside each name — no flag emoji anywhere');
ok(new Set(SEARCH_COUNTRY_OPTIONS.map((o) => o.value)).size === SEARCH_COUNTRY_OPTIONS.length && SEARCH_COUNTRY_OPTIONS.length === 20, 'all 20 Country values, once each');
ok(normaliseSearchCountry('Australia') === 'Australia' && normaliseSearchCountry('Narnia') === 'UK' && normaliseSearchCountry(undefined) === 'UK' && normaliseSearchCountry(null) === 'UK',
  'a stored value outside the list reads as the default (never sent as a bias)');
ok(Math.max(...SEARCH_COUNTRY_OPTIONS.map((o) => o.value.length)) <= 20, 'every value fits search-leads\' country schema (max 20)');

console.log('\n── suggested locations: the selected country only ──');
{
  const au = SUGGESTED_LOCATIONS.Australia;
  const must = ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra', 'Newcastle', 'Wollongong', 'Geelong', 'Hobart', 'Townsville', 'Cairns', 'Toowoomba', 'Darwin'];
  ok(must.every((c) => au.includes(c)), 'the Australian list has all fifteen named places');
  ok(au.slice(0, 6).join(',') === 'Sydney,Melbourne,Brisbane,Perth,Adelaide,Gold Coast', 'ordered by size: Sydney, Melbourne, Brisbane, Perth, Adelaide, Gold Coast first');
  ok(new Set(au).size === au.length && new Set(SUGGESTED_LOCATIONS.UK).size === SUGGESTED_LOCATIONS.UK.length, 'no place listed twice');
  ok(SUGGESTED_LOCATIONS.UK.slice(0, 7).join(',') === 'London,Manchester,Birmingham,Leeds,Sheffield,Bristol,Liverpool', 'UK starts London, Manchester, Birmingham, Leeds, Sheffield, Bristol, Liverpool');
  const c = suggestedLocationsFor('Australia', false);
  ok(c.visible.length === SUGGESTED_COLLAPSED_COUNT && SUGGESTED_COLLAPSED_COUNT === 12 && c.hiddenCount === au.length - 12, 'collapsed: the first 12, the rest behind "Show all"');
  const e = suggestedLocationsFor('Australia', true);
  ok(e.visible.length === au.length && e.hiddenCount === 0, 'expanded: every one');
  ok(suggestedLocationsFor('Belgium', false).hiddenCount === 0 && suggestedLocationsFor('Belgium', false).visible.length === 12, 'a short list shows whole, no "Show all"');
  ok(!suggestedLocationsFor('UK', true).visible.includes('Sydney') && !suggestedLocationsFor('Australia', true).visible.includes('Leeds'), 'never another country\'s places');
}

console.log('\n── what a suggestion puts in the box (unchanged strings) ──');
ok(quickLocationValue('Leeds', 'UK') === 'Leeds', 'UK: bare ("Leeds")');
ok(quickLocationValue('Perth', 'Australia') === 'Perth, Australia', 'Australia: "Perth, Australia"');
ok(quickLocationValue('Auckland', 'NewZealand') === 'Auckland, New Zealand' && quickLocationValue('Durban', 'SouthAfrica') === 'Durban, South Africa', 'NZ / South Africa spelled as before');
ok(quickLocationValue('Dubai', 'UAE') === 'Dubai, UAE' && quickLocationValue('Austin', 'USA') === 'Austin, USA', 'UAE / USA as before');
ok(isQuickLocationSelected('Perth, Australia', 'Perth', 'Australia') && isQuickLocationSelected('perth', 'Perth', 'Australia') && !isQuickLocationSelected('Perth WA', 'Perth', 'Australia'), 'the chip shows selected for its own value');

console.log('\n── changing the country ──');
ok(locationAfterCountryChange('Leeds', 'UK', 'Australia') === '', 'UK quick location "Leeds" → Australia: cleared');
ok(locationAfterCountryChange('Perth, Australia', 'Australia', 'UK') === '', 'Australian quick location → UK: cleared (would have searched Perth, Scotland… or WA with a GB bias)');
ok(locationAfterCountryChange('Leeds UK', 'UK', 'Australia') === '' && locationAfterCountryChange('Bondi, NSW, Australia', 'Australia', 'UK') === '', 'text naming the old country: cleared');
ok(locationAfterCountryChange('Ashgrove', 'UK', 'Australia') === 'Ashgrove', 'a typed suburb tied to no country: kept');
ok(locationAfterCountryChange('4064', 'UK', 'Australia') === '4064' && locationAfterCountryChange('SW1A 1AA', 'Australia', 'UK') === 'SW1A 1AA', 'a typed postcode: kept');
ok(locationAfterCountryChange('Sydney, New South Wales', 'UK', 'Australia') === 'Sydney, New South Wales', '"New South Wales" is not tied to the UK (it ends in "Wales")');
ok(locationAfterCountryChange('Leeds', 'UK', 'UK') === 'Leeds', 'same country: unchanged');
ok(locationAfterCountryChange('', 'UK', 'Australia') === '', 'empty stays empty');
ok(locationTiedToCountry('Newcastle', 'UK') && locationTiedToCountry('Newcastle', 'Australia'), 'a name on both lists belongs to whichever country was picked — cleared on change, pick the chip again');
{
  const sf = read('src/components/SearchForm.tsx');
  const fn = sf.slice(sf.indexOf('const changeCountry = (next: Country) => {'), sf.indexOf('};', sf.indexOf('const changeCountry = (next: Country) => {')));
  ok(/setLocation\(locationAfterCountryChange\(location, selectedCountry, next\)\);/.test(fn) && /setSelectedCountry\(next\);/.test(fn) && !/setRadius|setTownOnly/.test(fn),
    'the form\'s country change sets ONLY the location (by the rule) and the country — never the radius or "This town only"');
  for (const key of ["'find-leads-keyword'", "'find-leads-location'", "'find-leads-radius'", "'find-leads-country'", "'find-leads-town-only'"])
    ok(sf.includes(`usePersistedState${key === "'find-leads-country'" ? '<Country>' : ''}(${key}`), `persisted key ${key} unchanged`);
  ok(/onPick=\{\(city\) => setLocation\(quickLocationValue\(city, selectedCountry\)\)\}/.test(sf), 'a suggestion sets the location and leaves the country as picked');
  ok(/placeholder="Town, suburb or postcode"/.test(sf), 'the Location placeholder is country-neutral');
  const iCountry = sf.indexOf('data-testid="find-leads-country"'), iLoc = sf.indexOf('id="location"'), iSug = sf.indexOf('<SuggestedLocations'), iRad = sf.indexOf('Radius: {radius} km');
  ok(iCountry > 0 && iCountry < iLoc && iLoc < iSug && iSug < iRad, 'the order on the page: Country → Location → its suggestions → Radius');
  ok(!/QuickLocationsList|quick-locations/.test(sf) && !fs.existsSync(path.join(ROOT, 'src/components/QuickLocationsList.tsx')), 'the old Quick Locations cloud is gone');
  ok(!/[\u{1F1E6}-\u{1F1FF}]/u.test(sf) && !/[\u{1F1E6}-\u{1F1FF}]/u.test(read('src/components/SuggestedLocations.tsx')), 'no flag emoji on the form');
  const sl = read('src/components/SuggestedLocations.tsx');
  ok(/flex flex-wrap/.test(sl) && !/overflow-y-auto|max-h-|ScrollArea/.test(sl), 'suggestions wrap — no inner scrollbox');
  ok(/lg:grid-cols-12/.test(sf) && /min-w-0 space-y-3 lg:col-span-5/.test(sf), 'one column on a phone; business type | country + location | radius on a wide screen');
}

console.log('\n── geocode bias: Australian states when Australia is picked ──');
{
  const q = qualifierInfo('Perth WA', 'Australia');
  ok(q.country === 'AU' && q.appendCountry === 'Australia', '"Perth WA" (Australia picked) → Australia, geocoded "Perth WA, Australia"');
  ok(qualifierInfo('Perth WA').country === 'US' && qualifierInfo('Perth WA', 'USA').country === 'US' && qualifierInfo('Perth WA', 'UK').country === 'US', '"Perth WA" with any other pick → Washington, as before');
  ok(qualifierInfo('Darwin NT', 'Australia').country === 'AU' && qualifierInfo('Darwin NT').country === 'CA', '"Darwin NT": Australia when picked, Canada otherwise (unchanged)');
  ok(qualifierInfo('Adelaide SA', 'Australia').country === 'AU' && qualifierInfo('Bondi NSW', 'Australia').country === 'AU' && qualifierInfo('Hobart TAS', 'Australia').country === 'AU', 'SA / NSW / TAS with Australia picked → Australia');
  ok(qualifierInfo('Sydney, New South Wales').country === 'AU' && qualifierInfo('Sydney, New South Wales', 'Australia').appendCountry === null, '"New South Wales" → Australia, never Great Britain (Wales)');
  ok(qualifierInfo('Darwin, Northern Territory').country === 'AU' && qualifierInfo('Perth, Western Australia').country === 'AU', 'territory / state names → Australia whatever is picked');
  ok(resolveGeoBias('Ashgrove', 'Australia') === 'AU' && resolveGeoBias('Surry Hills', 'Australia') === 'AU', 'a bare suburb with Australia picked → AU bias');
  ok(qualifierInfo('Cardiff, Wales').country === 'GB' && qualifierInfo('Reading, PA').country === 'US' && qualifierInfo('Reading, PA', 'Australia').country === 'US', 'UK / US unchanged ("Cardiff, Wales" GB; "Reading, PA" US even with Australia picked — PA is no Australian state)');
  for (const [loc, c, want] of [['Reading', 'UK', 'GB'], ['Reading', undefined, 'GB'], ['Manchester', 'UK', 'GB'], ['Reading', 'USA', 'US'], ['Sydney', 'Australia', 'AU']] as const)
    ok(resolveGeoBias(loc, c) === want, `bias unchanged: ${loc} (${String(c)}) → ${want}`);
  ok(pickedCountryKeySuffix('Perth WA', 'Australia') === '@AU', 'a reading the pick changed gets its own cache key ("@AU")');
  for (const [loc, c] of [['Reading', 'UK'], ['Leeds', undefined], ['Reading, PA', 'USA'], ['Sydney NSW', 'Australia'], ['Perth', 'Australia'], ['Perth WA', 'USA'], ['Pune', 'India']] as const)
    ok(pickedCountryKeySuffix(loc, c) === '', `no extra key when the pick changes nothing: ${loc} (${String(c)})`);
}

console.log('\n── search-leads ──');
{
  const s = read('supabase/functions/search-leads/index.ts');
  ok(/country: z\.string\(\)\.max\(20\)\.optional\(\),/.test(s) && !/country: z\.string\(\)\.max\(10\)/.test(s), 'the country field accepts the longest picker value (max 20)');
  ok(!/e\.g\. "Reading, UK"/.test(s) && /try adding the region or country/.test(s), 'the not-found hint no longer assumes the UK');
  for (const d of ['hipages.com.au', 'oneflare.com.au', 'truelocal.com.au', 'yellowpages.com.au', 'localsearch.com.au', 'serviceseeking.com.au', 'startlocal.com.au', 'wordofmouth.com.au', 'airtasker.com', 'productreview.com.au'])
    ok(s.includes(`'${d}'`), `${d} is not a business's own website`);
  ok(/const q = qualifierInfo\(location, country\);/.test(s), 'the geocoder reads the location with the picked country');
  ok(/normalizeLocationKey\(location\) \+ \(bias \? `@\$\{bias\}` : ''\) \+ pickedCountryKeySuffix\(location, country\)/.test(s), 'geocode cache key: + the picked-country suffix');
  ok(/const pickSuffix = region \? '' : pickedCountryKeySuffix\(location, country\);/.test(s), 'results cache key: + the picked-country suffix');
}

console.log('\n── audit place strings ──');
const AU = placeSuffixForCountry('Australia');
ok(AU === 'Australia' && placeSuffixForCountry('UK') === 'UK' && placeSuffixForCountry(null) === 'UK', 'the suffix: Australia → "Australia"; UK / blank → "UK"');
function pin(q: string, town: string, suffix: string): string { return qualifyPlace([q], town, suffix).questions[0]; }
for (const [q, town, want] of [
  ['Who are trusted plumbers in Sydney?', 'Sydney', 'Who are trusted plumbers in Sydney Australia?'],
  ['Can you recommend an electrician in Melbourne?', 'Melbourne', 'Can you recommend an electrician in Melbourne Australia?'],
  ['best locksmith in Brisbane', 'Brisbane', 'best locksmith in Brisbane Australia'],
  ['plumber in Gold Coast', 'Gold Coast', 'plumber in Gold Coast Australia'],
  ['who is a good dentist in Surry Hills', 'Surry Hills', 'who is a good dentist in Surry Hills Australia'],
  ['plumber in Sydney NSW', 'Sydney', 'plumber in Sydney NSW'],
  ['plumber in Sydney AU', 'Sydney', 'plumber in Sydney AU'],
  ['electrician in Perth WA', 'Perth', 'electrician in Perth WA'],
  ['electrician in Perth Western Australia', 'Perth', 'electrician in Perth Western Australia'],
  ['roofer in Melbourne Australia', 'Melbourne', 'roofer in Melbourne Australia'],
] as const) ok(pin(q, town, AU) === want, `AU: "${q}" → "${want}" (got "${pin(q, town, AU)}")`);
for (const [q, town, want] of [
  ['locksmith in Rugby', 'Rugby', 'locksmith in Rugby UK'],
  ['Who are trusted plumbers in Leeds?', 'Leeds', 'Who are trusted plumbers in Leeds UK?'],
  ['who can act for me in Leeds', 'Leeds', 'who can act for me in Leeds UK'],
  ['plumber in Leeds UK', 'Leeds', 'plumber in Leeds UK'],
] as const) ok(pin(q, town, 'UK') === want, `UK unchanged: "${q}" → "${want}" (got "${pin(q, town, 'UK')}")`);
ok(pin('chartered accountant in Pune', 'Pune', 'India') === 'chartered accountant in Pune India' && pin('dentist in Pune India', 'Pune', 'India') === 'dentist in Pune India', 'India unchanged');
ok(placeNamesCountry('Sydney NSW', 'Australia') && placeNamesCountry('Sydney AU', 'Australia') && !placeNamesCountry('Sydney', 'Australia'), 'placeNamesCountry: a state / AU pins an Australian place; a bare town does not');
ok(!placeNamesCountry('Leeds WA', 'UK') && !placeNamesCountry('Pune NSW', 'India'), '…and only for Australia');
{
  const c = read('supabase/functions/create-ai-audit/index.ts');
  ok(/function mentionsCountryWord\(text: string, word: string\): boolean \{\n\s+return placeNamesCountry\(text, word\);\n\}/.test(c), 'create-ai-audit\'s place strings (locQ, the fallback\'s town) ask placeNamesCountry — no "Sydney NSW Australia", no "Sydney AU Australia"');
  ok(/abroadQ && !mentionsCountryWord\(locationText, abroadQ\) \? `\$\{locationText\}, \$\{abroadQ\}` : locationText/.test(c), 'the customer-style place is never "Sydney, Australia, Australia"');
  ok(/const locQ = isUK && locationText && !\/\\b\(uk\|united kingdom\|england\|scotland\|wales\)\\b\/i\.test\(locationText\) \? `\$\{locationText\} UK`/.test(c), 'the UK place string is unchanged ("<town> UK")');
}

console.log('\n── the wrong-town guard reads uk_towns only for a UK lead ──');
ok(ukGazetteerApplies('UK', '1 High St, Leeds LS1 1AA, UK') && ukGazetteerApplies(null, null) && ukGazetteerApplies('', '1 High St, Rugby CV21 2AA, UK') && ukGazetteerApplies('GB', null), 'UK / blank / GB → the gazetteer applies (unchanged)');
ok(!ukGazetteerApplies('Australia', null) && !ukGazetteerApplies('Australia', '1 George St, Sydney NSW 2000, Australia'), 'an Australia lead → not checked (would have been measured to Newcastle upon Tyne / Perth, Scotland)');
ok(!ukGazetteerApplies('UK', '12 King St, Newcastle NSW 2300, Australia') && !ukGazetteerApplies(null, '1 Hay St, Perth WA 6000, Australia'), 'a lead labelled UK (or blank) whose Google address is Australian → not checked');
ok(!ukGazetteerApplies('India', null) && !ukGazetteerApplies('USA', null), 'any other country → not checked');
{
  const c = read('supabase/functions/create-ai-audit/index.ts');
  const at = c.indexOf('if (!ukGazetteerApplies(country, derived.address)) {');
  ok(at > 0 && c.indexOf('.from("uk_towns")', at) > at && c.indexOf('.from("uk_towns")') > at, 'create-ai-audit reads uk_towns ONLY inside the UK branch');
  ok(/import \{ ukGazetteerApplies \} from "\.\.\/\.\.\/\.\.\/src\/lib\/leadCountry\.ts";/.test(c), '…imported by relative path with .ts (edge-safe)');
  ok(/if \(distance\?\.verdict === "block"\)/.test(c), 'the block itself is unchanged (a null distance never blocks)');
}

console.log('\n── CSV import: the row\'s country ──');
{
  ok((IMPORT_FIELDS as readonly string[]).includes('country') && IMPORT_FIELDS.length === 13, 'an optional Country column (13 fields)');
  const parsed = parseCsv('Business,Phone,Address,Country\nBondi Plumbing,0412 345 678,"1 Campbell Pde, Bondi Beach NSW 2026",Australia\nLeeds Plumbing,07700 900123,"1 High St, Leeds LS1 1AA",\n');
  const { mapping } = autoMapColumns(parsed.headers);
  ok(mapping.country === 3, 'a "Country" header maps automatically');
  const rows = buildImportRows(parsed, mapping);
  ok(rows[0].country === 'Australia' && rows[1].country === undefined, 'the country is sent when given; a blank cell is not sent (the server derives it)');
  ok(/UK or Australia/.test(reasonText('invalid_country', {}, true)), 'an unrecognised country is explained');

  const OLD = read('supabase/migrations/20261010170000_csv_lead_import.sql');
  const NEW = read('supabase/migrations/20261014100200_csv_import_country.sql');
  const fnOf = (s: string) => s.slice(s.indexOf('create or replace function public.import_leads('), s.indexOf('-- Read back:'));
  const oldFn = fnOf(OLD), newFn = fnOf(NEW);
  const newLines = new Set(newFn.split('\n'));
  const removed = oldFn.split('\n').filter((l) => !newLines.has(l));
  ok(removed.length === 13, `the new function keeps every line of the old one except the 13 it replaces (removed: ${removed.length})`);
  ok(removed.filter((l) => /'UK'/.test(l)).length === 3 && removed.some((l) => /'not_contacted', 'none', 'UK', 'manual'/.test(l)) && removed.some((l) => /'google_maps_url', 'UK', o ->> 'phone'/.test(l)),
    '…the three literal UKs among them (the insert, the history row, the same-name filter)');
  ok(/'not_contacted', 'none', o ->> 'country', 'manual'\)/.test(newFn) && /o ->> 'google_maps_url', o ->> 'country', o ->> 'phone'\)/.test(newFn), 'the lead and its history row store the row\'s country');
  ok(/c_nk := c_country \|\| ':' \|\|/.test(newFn) && /coalesce\(l\.country, 'UK'\) \|\| ':' \|\|/.test(newFn), 'a same-name match is looked for within the row\'s own country (null = UK)');
  ok(/if c_country = 'Australia' then[\s\S]*?'\^\\\+\?61\\s\*\\\(0\\\)\\s\*', '\+61 '\)[\s\S]*?else\n\s+c_phone := regexp_replace\(c_phone, '\^\\\+\?44\\s\*\\\(0\\\)\\s\*', '\+44 '\);/.test(newFn),
    'the phone repair follows the country — the UK rule never touches an Australian number');
  const keys = [...newFn.matchAll(/x ->> '([a-z_]+)'/g)].map((m) => m[1]);
  ok(keys.every((k) => (IMPORT_FIELDS as readonly string[]).includes(k) || k === 'row'), `the function still reads only the allowlist (${[...new Set(keys)].join(', ')})`);
  ok(/security definer/.test(newFn) && /set search_path to 'public'/.test(newFn) && /revoke all on function public\.import_leads\(jsonb, boolean, text, boolean\) from public, anon;/.test(newFn), 'security definer, search_path and grants unchanged');

  /* The derivation, run with the SQL's own patterns (PostgreSQL \m \M are word boundaries). */
  const pat = (re: RegExp) => { const m = newFn.match(re); if (!m) throw new Error('pattern not found: ' + re); return m[1].replace(/\\m|\\M/g, '\\b'); };
  const phoneRe = new RegExp(pat(/when coalesce\(c_phone, ''\) ~ '([^']+)' then 'Australia'/));
  const addrRe = new RegExp(pat(/when coalesce\(c_addr, ''\) ~\* '([^']+)' then 'Australia'/), 'i');
  const stateRe = new RegExp(pat(/coalesce\(x ->> 'postcode', ''\)\) ~ '([^']+)' then 'Australia'/));
  const derive = (phone: string, addr: string, post = '') =>
    phoneRe.test(phone) || addrRe.test(addr) || stateRe.test((addr + ' ' + post).toUpperCase()) ? 'Australia' : 'UK';
  ok(derive('+61 412 345 678', '') === 'Australia' && derive('0061 412 345 678', '') === 'Australia', 'a +61 / 0061 phone → Australia');
  ok(derive('0412 345 678', '1 Campbell Pde, Bondi Beach NSW 2026') === 'Australia' && derive('', '1 Hay St, Perth WA 6000') === 'Australia', 'an address naming a state + postcode → Australia');
  ok(derive('', '1 George St, Sydney, Australia') === 'Australia', 'an address ending in Australia → Australia');
  ok(derive('', 'Unit 2', 'NSW 2000') === 'Australia', 'a state + postcode in the Postcode column → Australia');
  ok(derive('07700 900123', '1 High St, Leeds LS1 1AA') === 'UK' && derive('', '') === 'UK' && derive('+44 20 7946 0000', '10 Downing St, London SW1A 2AA, UK') === 'UK', 'everything else → UK, as before');
  ok(derive('', '12 Wallace St, Swansea SA1 1AA') === 'UK', 'a UK postcode starting SA (Swansea) is not an Australian state');
  ok(/when lower\(c_country_in\) in \('australia', 'au', 'aus'\) then 'Australia'/.test(newFn) && /else 'invalid' end;\n\s+if c_country = 'invalid' then c_errs := c_errs \|\| 'invalid_country'::text;/.test(newFn),
    'an explicit country must be UK / Australia words — anything else is refused, never guessed');
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
