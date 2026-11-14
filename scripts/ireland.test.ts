/* ============================================================
   IRELAND (2026-11-11, feat/add-ireland) — a country you can add leads in, see in Coverage, call, link to WhatsApp and
   audit. Pins:
     · Irish numbers reach WhatsApp / tel links as 353… on an Ireland lead (08x mobiles, Dublin 01, +353, 00353, bare 353…);
       a mistyped number answers null — never bare digits another country owns; UK numbers are unchanged;
     · the number view shows "+353 85 123 4567" and offers the WhatsApp link;
     · a typed Irish number is stored the way Google stores one ("+353 85 123 4567");
     · audit questions name the country: "Westport, Ireland" (never "UK");
     · Coverage: Ireland is a country with counties, no invented populations, "Northern Ireland" stays UK;
     · Ireland is NOT a cold-messaging market: no WhatsApp/SMS/call market for 353 numbers.
   Run: npx tsx scripts/ireland.test.ts
   ============================================================ */
import { toWhatsAppDigits } from '../src/lib/waNumber.ts';
import { internationalPhone } from '../src/lib/lineType.ts';
import { callNumberView } from '../src/lib/callNumber.ts';
import { formatPhoneForWhatsApp, generateWhatsAppUrl } from '../src/lib/leadUtils.ts';
import { hookPlaceFor, placeSuffixForCountry } from '../src/lib/seedGuard.ts';
import { ABROAD_TOWNS, abroadCountryOfLead, abroadCountryOfLocation, COVERAGE_COUNTRIES, resolveCoverageTown } from '../src/lib/coverageCountries.ts';
import { townPopulation, populationFilterShown } from '../src/lib/abroadTownPopulation.ts';
import { mobileMarketOf, callMarketOf } from '../src/lib/outreachMarkets.ts';

let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label}`); }
}
const eq = (a: unknown, b: unknown, label: string) => ok(a === b, `${label}${a === b ? '' : ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`}`);

// Phones on an Ireland lead
for (const n of ['085 123 4567', '+353 85 123 4567', '00353 85 123 4567', '353851234567', '85 123 4567', '(085) 123-4567'])
  eq(toWhatsAppDigits(n, 'Ireland'), '353851234567', `Ireland mobile "${n}"`);
eq(toWhatsAppDigits('01 234 5678', 'Ireland'), '35312345678', 'Dublin landline 01 234 5678');
eq(toWhatsAppDigits('021 123 4567', 'Ireland'), '353211234567', 'Cork landline 021 123 4567');
eq(toWhatsAppDigits('12345', 'Ireland'), null, 'a mistyped Irish number is null');
eq(toWhatsAppDigits('0044 7700 900123', 'Ireland'), '447700900123', 'a +44 number keeps its code on an Ireland lead');
// UK unchanged
eq(toWhatsAppDigits('07700 900123', 'UK'), '447700900123', 'UK 07… unchanged');
eq(toWhatsAppDigits('+44 7700 900123', null), '447700900123', 'UK +44 unchanged');
eq(formatPhoneForWhatsApp('085 123 4567', 'Ireland'), '353851234567', 'formatPhoneForWhatsApp on an Ireland lead');
eq(generateWhatsAppUrl('085 123 4567', 'hi', 'Ireland'), 'https://wa.me/353851234567?text=hi', 'wa.me link');

// Call view
const v = callNumberView('085 123 4567', 'Ireland');
eq(v?.display, '+353 85 123 4567', 'display grouped');
eq(v?.copy, '+353851234567', 'copy is E.164');
eq(v?.whatsappUrl, 'https://wa.me/353851234567', 'WhatsApp link offered');
eq(callNumberView('01 234 5678', 'Ireland')?.copy, '+35312345678', 'landline copy');

// Stored form
eq(internationalPhone('085 123 4567', 'Ireland'), '+353 85 123 4567', 'stored the way Google stores it');
eq(internationalPhone('12345', 'Ireland'), null, 'invalid refused');

// Audit wording
eq(placeSuffixForCountry('Ireland'), 'Ireland', 'place suffix');
eq(hookPlaceFor('Westport', 'Ireland'), 'Westport, Ireland', 'Westport, Ireland');
eq(hookPlaceFor('Mayo, Ireland', 'Ireland'), 'Mayo, Ireland', 'not pinned twice');
ok(!/united kingdom|\buk\b/i.test(hookPlaceFor('Cork', 'Ireland')), 'no UK in an Irish question');
eq(hookPlaceFor('Leeds', 'UK'), 'Leeds UK', 'UK wording unchanged');

// Coverage
ok(COVERAGE_COUNTRIES.includes('Ireland'), 'Ireland is a Coverage country');
ok(ABROAD_TOWNS.Ireland.length >= 30, 'Ireland has towns');
ok(ABROAD_TOWNS.Ireland.every((t) => t.region), 'every Irish town has a county');
eq(ABROAD_TOWNS.Ireland.find((t) => t.name === 'Westport')?.region, 'Mayo', 'Westport is in Mayo');
eq(abroadCountryOfLead('Ireland'), 'Ireland', 'an Ireland lead counts in Ireland');
eq(abroadCountryOfLocation('Westport, Ireland'), 'Ireland', 'run location "Westport, Ireland"');
eq(abroadCountryOfLocation('Belfast, Northern Ireland'), null, 'Northern Ireland stays UK');
eq(resolveCoverageTown('Ireland', 'Westport, Co. Mayo')?.name, 'Westport', 'messy town resolves');
eq(resolveCoverageTown('Ireland', 'Lahinch, Ireland')?.listed, false, 'unlisted town is its own row');
eq(townPopulation('Ireland', 'Dublin').population, null, 'no invented population');
eq(populationFilterShown('Ireland'), false, 'no population filter without figures');

// Forced-local prompt: "ireland" is not a banned word for an Irish audit (its place is "Westport, Ireland"); still banned otherwise
{
  const src = (await import("node:fs")).readFileSync("supabase/functions/create-ai-audit/index.ts", "utf8");
  ok(src.includes('.filter((w) => !(abroadQ === "Ireland" && w === "ireland"))') && src.includes('NEVER use country/region/national terms (${FORCED_LOCAL_BANNED})'), "forced-local ban list drops ireland only for an Irish audit");
}

// Not a messaging market
eq(mobileMarketOf('353851234567'), null, 'no cold WhatsApp market for 353');
eq(callMarketOf('353851234567'), null, 'not callable from the browser');

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall ok');
