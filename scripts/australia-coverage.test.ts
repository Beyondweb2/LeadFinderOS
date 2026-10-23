/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AUSTRALIA: FIND, AUDIT AND CALL — PROSPECT-ONLY (2026-10-21, feat/australia-coverage). Fixtures only, no network.

   Pinned here:
     A. The ABS town list (src/data/australiaTowns.ts): 1,000+ urban centres, state, population, a point in Australia.
     B. The state rules (src/lib/australiaTowns.ts): "Name STATE" parsing, the address shape, postcode → state.
     C. Coverage: Australia in the picker, every town named WITH its state, same-name towns never mixed, the
        10,000–250,000 default band, the ABS figure shown exact, the Find Leads search words carry the state.
     D. The in-town check (src/lib/inTown.ts): state first, then a name, then distance; the stored Coverage town and the
        audit question's town keep the state.
     E. The wrong-town guard for an Australian audit (_shared/town-distance.ts australianTownCheck).
     F. Prospect-only (src/lib/prospectOnly.ts): no price, guarantee or sign-up button on the report; Quick Close,
        checkout and the link templates refuse; a sign-up-link template is refused to a +61 number.
     G. Cold WhatsApp to Australia goes ONLY through its own market switch (2026-10-22, feat/australia-whatsapp — pinned in
        scripts/australia-whatsapp.test.ts): +61 is still not a UK cold destination, and texts to it are never on.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { AUSTRALIA_TOWNS } from '../src/data/australiaTowns.ts';
import {
  AU_TOWNS, AU_BAND_DEFAULT_MIN, AU_BAND_DEFAULT_MAX, AU_METRO_POPULATION, auStateOfPostcode, findAuTown, parseAuAddress,
  parseAuTown, withAuState, sameAuTown, isAustralianLead,
} from '../src/lib/australiaTowns.ts';
import {
  COVERAGE_COUNTRIES, ABROAD_TOWNS, resolveCoverageTown, abroadCountryOfLocation, abroadCountryOfLead, pairsForCountry, abroadTownKey,
} from '../src/lib/coverageCountries.ts';
import { townPopulation, populationFilterShown, filterByPopulationBand, populationSourcesFor } from '../src/lib/abroadTownPopulation.ts';
import { quickLocationValue } from '../src/lib/locationPicker.ts';
import { findLeadsHref } from '../src/lib/coverageState.ts';
import { inTownVerdict, areaFromAddress, leadQuestionTown, isBroadTown } from '../src/lib/inTown.ts';
import { coverageTownFor } from '../src/lib/findLeadsBulkAdd.ts';
import { australianTownCheck } from '../supabase/functions/_shared/town-distance.ts';
import { prospectOnlyLead, prospectOnlyNumber, prospectOnlyTemplateRefusal } from '../src/lib/prospectOnly.ts';
import { UK_WORDED_TEMPLATES } from '../src/lib/reportOfferTemplate.ts';
import { WA_TEMPLATES } from '../supabase/functions/_shared/whatsapp-send.ts';
import { isUkColdDestination } from '../src/lib/ukColdDestination.ts';
import { channelOn, countrySettingsFrom, MARKETS, mobileMarketOf } from '../src/lib/outreachMarkets.ts';
import { buildReportData } from '../src/lib/auditReport.ts';
import { renderReportHtml } from '../src/lib/aiAuditReportHtml.ts';
import { initialHookStateV2 } from '../src/lib/hookScore.ts';

let failures = 0;
function ok(cond: unknown, label: string) {
  if (cond) console.log('  PASS ' + label);
  else { failures++; console.log('  FAIL ' + label); }
}
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const label = (n: string, s?: string | null) => { const r = findAuTown(n, (s ?? null) as never); return r === 'ambiguous' ? r : r?.label ?? null; };

console.log('A. The ABS town list');
ok(AUSTRALIA_TOWNS.length > 700 && AUSTRALIA_TOWNS.length < 800, `about 726 urban centres (${AUSTRALIA_TOWNS.length})`);
ok(AU_TOWNS.every((t) => t.population >= 1000), 'every town has 1,000+ residents');
ok(AU_TOWNS.every((t) => ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'].includes(t.state)), 'every town has a real state');
ok(AU_TOWNS.every((t) => t.lat < -9 && t.lat > -44 && t.lng > 112 && t.lng < 154), 'every point is inside Australia');
ok(AU_TOWNS.every((t) => !/\((L|NSW|Vic\.|Qld|SA|WA|Tas\.)\)/.test(t.name) && !/^Remainder|Migratory|No usual/.test(t.name)), 'no ABS bracket or bookkeeping row in a name');
ok(new Set(AU_TOWNS.map((t) => t.label)).size === AU_TOWNS.length, 'every "Name STATE" is unique');
ok(label('Ballarat') === 'Ballarat VIC' && AU_TOWNS.find((t) => t.label === 'Ballarat VIC')!.population > 100_000, 'Ballarat VIC, 100k+');
ok(label('Albury') === 'Albury NSW' && label('Wodonga') === 'Wodonga VIC', 'a cross-border ABS centre is split by its own parts');
ok(AU_TOWNS.find((t) => t.label === 'Forster NSW')?.abs === 'Forster - Tuncurry', 'a joined ABS name keeps the full name as aka');

console.log('B. The state rules');
ok(JSON.stringify(parseAuTown('Ballarat VIC')) === '{"name":"Ballarat","state":"VIC"}', 'parse "Ballarat VIC"');
ok(JSON.stringify(parseAuTown('Ballarat VIC, Australia')) === '{"name":"Ballarat","state":"VIC"}', 'parse "Ballarat VIC, Australia"');
ok(JSON.stringify(parseAuTown('Mount Gambier, South Australia')) === '{"name":"Mount Gambier","state":"SA"}', '"South Australia" is a state, not the country');
ok(parseAuTown('Sydney').state === null, 'a bare name has no state');
const rich = parseAuAddress('12 Smith St, Richmond VIC 3121, Australia');
ok(rich.suburb === 'Richmond' && rich.state === 'VIC' && rich.postcode === '3121', 'the address shape: suburb, state, postcode');
ok(parseAuAddress('1 Mitchell St, Darwin City 0800, Australia').state === 'NT', 'no state word → the postcode gives it');
ok(auStateOfPostcode('2600') === 'ACT' && auStateOfPostcode('2620') === 'NSW' && auStateOfPostcode('0800') === 'NT' && auStateOfPostcode('7000') === 'TAS' && auStateOfPostcode('6000') === 'WA', 'postcode → state ranges');
ok(label('Perth') === 'ambiguous' && label('Perth', 'WA') === 'Perth WA' && label('Perth', 'TAS') === 'Perth TAS', 'Perth is ambiguous until a state is given');
ok(withAuState('Perth', '1 Main Rd, Perth TAS 7300, Australia') === 'Perth TAS', 'a bare town takes the state from the address');
ok(withAuState('Perth', null) === 'Perth', 'an ambiguous bare town with nothing to go on is left as written (never guessed)');
ok(withAuState('Ballarat', null) === 'Ballarat VIC', 'a bare town in one state only takes that state');
ok(!sameAuTown('Richmond VIC', 'Richmond NSW') && sameAuTown('Richmond VIC', 'Richmond'), 'same name in two states is not the same town');
ok(isAustralianLead('Australia', null) && isAustralianLead(null, '1 X St, Ballarat VIC 3350, Australia') && !isAustralianLead('UK', '1 High St, Perth PH1 5AA, UK'), 'an Australian lead: its country, or its address');

console.log('C. Coverage');
ok(COVERAGE_COUNTRIES.includes('Australia'), 'Australia is in the Coverage country picker');
ok(ABROAD_TOWNS.Australia.length === AU_TOWNS.length && ABROAD_TOWNS.Australia.every((t) => / (NSW|VIC|QLD|SA|WA|TAS|NT|ACT)$/.test(t.name)), 'every Australian Coverage town is named WITH its state');
ok(ABROAD_TOWNS.Australia.find((t) => t.name === 'Ballarat VIC')?.region === 'Victoria', 'the state is the Region filter');
ok(abroadTownKey('Perth WA') !== abroadTownKey('Perth TAS'), 'Perth WA and Perth TAS have different Coverage keys');
ok(resolveCoverageTown('Australia', 'Ballarat VIC, Australia')?.name === 'Ballarat VIC', 'a search location resolves to its row');
ok(resolveCoverageTown('Australia', 'Ballarat')?.name === 'Ballarat VIC', 'a bare one-state name resolves to its row');
ok(resolveCoverageTown('Australia', 'Perth')?.listed === false && resolveCoverageTown('Australia', 'Perth')?.name === 'Perth', 'a bare ambiguous name is its own row, never merged into Perth WA');
ok(resolveCoverageTown('Australia', 'Wendouree VIC')?.listed === false, 'an unlisted suburb is its own row');
ok(abroadCountryOfLocation('Ballarat VIC, Australia') === 'Australia' && abroadCountryOfLocation('Perth WA') === 'Australia' && abroadCountryOfLocation('Perth') === null, 'a search run is Australian by its words (bare "Perth" stays UK)');
ok(abroadCountryOfLead('Australia') === 'Australia', 'an Australian lead counts in the Australia view');
const pairs = pairsForCountry('Australia', { leads: [
  { trade: 'plumber', town: 'Perth WA', country: 'Australia' }, { trade: 'plumber', town: 'Perth TAS', country: 'Australia' },
  { trade: 'plumber', town: 'Perth', country: 'UK' },
], worked: [] });
ok(pairs.leads.length === 2 && pairs.leads[0].town === 'Perth WA' && pairs.leads[1].town === 'Perth TAS', 'Perth WA and Perth TAS leads count apart; the UK Perth lead is not here');
ok(pairsForCountry('UK', { leads: [{ trade: 'plumber', town: 'Perth WA', country: 'Australia' }], worked: [] }).leads.length === 0, 'an Australian lead never counts in the UK view');
ok(quickLocationValue('Ballarat VIC', 'Australia') === 'Ballarat VIC, Australia', 'the Find Leads search words carry the state');
ok(findLeadsHref('plumber', 'Ballarat VIC, Australia', 'Australia').includes('location=Ballarat+VIC%2C+Australia'), 'the Find leads link carries the state');
const pop = townPopulation('Australia', 'Ballarat VIC');
ok(pop.population === AU_TOWNS.find((t) => t.label === 'Ballarat VIC')!.population && /Census 2021/.test(pop.basis ?? ''), 'the ABS figure is the population, with its basis');
ok(townPopulation('Australia', 'Wendouree').population === null, 'an unlisted place has no figure (blank, never 0)');
ok(populationFilterShown('Australia') && populationSourcesFor('Australia')[0].url.includes('abs.gov.au'), 'the population filter is offered and credits the ABS');
ok(AU_BAND_DEFAULT_MIN === 10_000 && AU_BAND_DEFAULT_MAX === 250_000, 'the default band is 10,000–250,000');
const inBand = filterByPopulationBand(ABROAD_TOWNS.Australia.map((t) => ({ ...t, population: townPopulation('Australia', t.name).population })), { min: AU_BAND_DEFAULT_MIN, max: AU_BAND_DEFAULT_MAX });
ok(inBand.length === 120 && !inBand.some((t) => t.name === 'Sydney NSW'), `the default band shows the 120 mid-size centres (${inBand.length}), not Sydney`);
const cov = read('../src/pages/Coverage.tsx');
ok(/'coverage-population-band-au', \{ min: AU_BAND_DEFAULT_MIN, max: AU_BAND_DEFAULT_MAX \}/.test(cov), 'Coverage keeps Australia’s band as its own remembered setting, starting at the default');
ok(/approxPop \? '≈ ' : ''/.test(cov) && /approxPop = country === 'Malaysia' \|\| country === 'Singapore'/.test(cov), 'the ABS figure is shown exact (no ≈)');
ok(cov.includes('Australia is\n        prospect-only'), 'the Australia footer says prospect-only and credits the ABS');
const covFn = read('../supabase/functions/coverage/index.ts');
ok(/isAustralianLead\(country, l\.address\)\s*\? withAuState\(String\(l\.coverage_town \|\| l\.derived_town \|\| l\.search_location/.test(covFn), 'the coverage endpoint gives an Australian lead its town WITH its state');

console.log('D. The in-town check, the stored town, the question town');
const BALLARAT = AU_TOWNS.find((t) => t.label === 'Ballarat VIC')!;
const v1 = inTownVerdict({ town: 'Richmond VIC', country: 'Australia', address: '5 Bridge St, Richmond NSW 2753, Australia' });
ok(v1.inTown === false && v1.reason === 'other_state', 'Richmond VIC searched, a Richmond NSW business → OUT (other state)');
const v2 = inTownVerdict({ town: 'Richmond VIC', country: 'Australia', address: '12 Smith St, Richmond VIC 3121, Australia' });
ok(v2.inTown === true && v2.reason === 'post_town' && v2.area === 'Richmond VIC', 'Richmond VIC address → IN');
const v3 = inTownVerdict({ town: 'Ballarat VIC', country: 'Australia', address: '3 Howitt St, Wendouree VIC 3355, Australia', lat: -37.535, lng: 143.83, centre: { lat: BALLARAT.lat, lng: BALLARAT.lng }, population: BALLARAT.population });
ok(v3.inTown === true && v3.reason === 'distance', `a different suburb inside Ballarat is IN by distance (${v3.km} km), never OUT by name`);
const v4 = inTownVerdict({ town: 'Ballarat VIC', country: 'Australia', address: '1 Main St, Bendigo VIC 3550, Australia', lat: -36.757, lng: 144.279, centre: { lat: BALLARAT.lat, lng: BALLARAT.lng }, population: BALLARAT.population });
/* 2026-10-23: Bendigo is its own urban centre, so it is OUT by name before distance is asked (inTown.ts step 3). */
ok(v4.inTown === false && v4.reason === 'other_town', 'Bendigo is not Ballarat (its own urban centre)');
ok(inTownVerdict({ town: 'Cheshunt', country: 'UK', address: '1 High St, Cheshunt, Waltham Cross EN8 9AA, UK' }).reason !== 'other_state', 'the UK rule is untouched');
ok(areaFromAddress('12 Smith St, Richmond VIC 3121, Australia', 'Australia') === 'Richmond VIC', 'the area from an address carries the state');
ok(isBroadTown('Australia'), '"Australia" alone is too broad to be a town');
ok(leadQuestionTown({ derived_town: 'Perth', address: '9 Hay St, Perth WA 6000, Australia', country: 'Australia' }).town === 'Perth WA', 'the audit question’s town gets its state (Perth WA, never a bare Perth)');
ok(leadQuestionTown({ coverage_town: 'Ballarat VIC', country: 'Australia' }).town === 'Ballarat VIC', 'a stored Coverage town is kept as it is');
ok(leadQuestionTown({ derived_town: 'Cheshunt', country: 'UK' }).town === 'Cheshunt', 'a UK question town is untouched');
const lead = { id: 'x', name: 'A', address: '3 Howitt St, Wendouree VIC 3355, Australia', townCheck: { inTown: true } };
ok(coverageTownFor(lead, 'Ballarat VIC, Australia', 'Australia') === 'Ballarat VIC', 'the stored Coverage town keeps its state');
ok(coverageTownFor(lead, 'Ballarat', 'Australia') === 'Ballarat VIC', 'a town searched bare is stored with its state');
ok(coverageTownFor({ ...lead, townCheck: { inTown: null } }, 'Ballarat VIC', 'Australia') === null, 'never stored unless verified in town');
const sl = read('../supabase/functions/search-leads/index.ts');
ok(/country === 'Australia'\) \{[\s\S]{0,400}findAuTownText\(town\)/.test(sl), 'search-leads sizes an Australian town from the ABS list, never uk_towns');

console.log('E. The wrong-town guard for an Australian audit');
const e1 = australianTownCheck({ town: 'Richmond VIC', address: '5 Bridge St, Richmond NSW 2753, Australia', businessLat: -33.6, businessLng: 150.75 });
ok(e1?.verdict === 'block' && /New South Wales/.test(e1.message) && /Victoria/.test(e1.message), 'wrong state → BLOCK (overridable), naming both states');
ok(australianTownCheck({ town: 'Ballarat VIC', address: '3 Howitt St, Wendouree VIC 3355, Australia', businessLat: -37.535, businessLng: 143.83 })?.verdict === 'ok', 'a Wendouree business audited about Ballarat VIC → ok');
const e3 = australianTownCheck({ town: 'Ballarat VIC', address: '1 Main St, Geelong VIC 3220, Australia', businessLat: -38.15, businessLng: 144.36 });
ok(e3?.verdict === 'block' && (e3.km ?? 0) > 25, `a Geelong business audited about Ballarat → BLOCK (${Math.round(e3?.km ?? 0)} km)`);
const e4 = australianTownCheck({ town: 'Sydney NSW', address: '1 George St, Penrith NSW 2750, Australia', businessLat: -33.75, businessLng: 150.69 });
ok(e4?.verdict === 'unknown' && e4.unknownReason === 'metro_area' && AU_TOWNS.find((t) => t.label === 'Sydney NSW')!.population >= AU_METRO_POPULATION, 'a metropolitan area is never measured (its own suburbs would block)');
ok(australianTownCheck({ town: 'Ballarat VIC', address: '3 Howitt St, Wendouree VIC 3355, Australia', businessLat: null, businessLng: null, stateOnly: true }) === null, 'a verified Coverage town: same state → nothing to say');
ok(australianTownCheck({ town: 'Perth', address: null, businessLat: -31.95, businessLng: 115.86 })?.verdict === 'unknown', 'an ambiguous bare town is unknown, never a guess');
const cai = read('../supabase/functions/create-ai-audit/index.ts');
ok(/const auLead = isAustralianLead\(country, auAddress\);/.test(cai) && /locationText = withAuState\(locationText, auAddress\)/.test(cai), 'create-ai-audit puts the state on an Australian question town');
ok(/\} else if \(auLead\) \{\n\s+distance = australianTownCheck\(/.test(cai) && /stateOnly: true/.test(cai), 'create-ai-audit runs the Australian guard (and the state check on a Coverage town)');
ok(cai.indexOf('} else if (auLead) {') < cai.indexOf('} else if (!ukGazetteerApplies(country, derived.address)) {'), 'the Australian guard runs before the "no gazetteer" skip');
ok(/distance_km: distance\.km === null \? null : Math\.round\(distance\.km\)/.test(cai), 'a wrong-state block sends no made-up 0 km');

console.log('F. Prospect-only');
ok(prospectOnlyLead({ country: 'Australia' }) && prospectOnlyLead({ address: '1 X St, Ballarat VIC 3350, Australia' }) && !prospectOnlyLead({ country: 'UK' }) && !prospectOnlyLead({ country: 'Malaysia' }) && !prospectOnlyLead(null), 'Australia is prospect-only; the UK and Malaysia are not');
ok(prospectOnlyNumber('61412345678') && prospectOnlyNumber('+61 412 345 678') && !prospectOnlyNumber('447700900123') && !prospectOnlyNumber('0412345678'), '+61 numbers are Australian; a national 04… is not judged here');
const signup = WA_TEMPLATES['findable_signup_link'];
ok(!!signup && !!prospectOnlyTemplateRefusal({ name: 'findable_signup_link', vars: signup.vars }, '61412345678', UK_WORDED_TEMPLATES), 'the sign-up link template is refused to +61');
ok(prospectOnlyTemplateRefusal({ name: 'findable_signup_link', vars: signup.vars }, '447700900123', UK_WORDED_TEMPLATES) === null, '…and still goes to a UK number');
const linkTemplates = Object.entries(WA_TEMPLATES).filter(([, t]) => t.vars.some((v: string) => ['onboarding_url', 'signup_url', 'onboarding_form_url'].includes(v)));
ok(linkTemplates.length >= 3 && linkTemplates.every(([n, t]) => prospectOnlyTemplateRefusal({ name: n, vars: t.vars }, '61412345678', UK_WORDED_TEMPLATES)), `every template carrying a sign-up / onboarding link is refused to +61 (${linkTemplates.map(([n]) => n).join(', ')})`);
ok([...UK_WORDED_TEMPLATES].every((n) => prospectOnlyTemplateRefusal({ name: n, vars: [] }, '61412345678', UK_WORDED_TEMPLATES)), 'every £-priced template is refused to +61');
ok(prospectOnlyTemplateRefusal({ name: 'audit_reply', vars: WA_TEMPLATES['audit_reply']?.vars ?? ['name', 'audit_url'] }, '61412345678', UK_WORDED_TEMPLATES) === null, 'a report-link template is not refused here (the report itself is prospect-only)');

/* The report: render it both ways, with the offer ON and a sign-up URL, and read the text. */
const BIZ = 'Acme Plumbing';
const Q = ['plumber in Ballarat VIC', 'best plumber in Ballarat VIC', 'emergency plumber Ballarat VIC'];
const ans = { named: false, self_named: false, answer_text: 'Try Rival Plumbing and Other Co.', competitors: ['Rival Plumbing', 'Other Co'], citations: [] };
const rows = Q.map((question, i) => ({ id: `q${i}`, question, status: 'done', result: { chatgpt: ans, gemini: ans } }));
const strip = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, '');
function render(prospectOnly: boolean, hook: boolean) {
  const run = { id: 'r1', run_number: 1, status: 'complete', mention_rate: 0, created_at: '2026-10-21T10:00:00Z', results: { ...(hook ? { hook: initialHookStateV2(Q) } : {}), competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } };
  const d = buildReportData(rows as never, run as never, { businessName: BIZ, businessType: 'plumber', locationText: 'Ballarat VIC', specialisms: '', isAggregatorUrl: () => false, hasWebsite: false });
  return strip(renderReportHtml({ ...(d as object), generatedAtLabel: '21 October 2026', showOffer: true, offerUrl: 'https://findable.live/onboarding/acme/?lead=L1', auditId: 'a1', requestCallUrl: 'https://x/request-call', prospectOnly } as never));
}
for (const hook of [true, false]) {
  const kind = hook ? 'quick (hook) report' : 'ordinary report';
  const uk = render(false, hook), au = render(true, hook);
  ok(/£|&pound;/.test(uk) && uk.includes('findable.live/onboarding'), `${kind}: the UK version still carries the price and the sign-up link (the control)`);
  ok(!/£|&pound;|GBP/.test(au), `${kind}: the Australian version names NO price`);
  ok(!au.includes('findable.live/onboarding') && !au.includes('/agree/'), `${kind}: …and NO sign-up link`);
  ok(!/refund/i.test(au) && !/payments in total/i.test(au), `${kind}: …no refund line and no payment count`);
  ok(au.includes('Request a call') && au.includes('Ask me anything'), `${kind}: Request a call and Ask me anything stay`);
}
const rar = read('../supabase/functions/render-audit-report/index.ts');
ok(/leadProspectOnly = prospectOnlyLead\(l\)/.test(rar) && /data\.prospectOnly = leadProspectOnly;/.test(rar) && /data\.showOffer = !leadProspectOnly && showOffer\(/.test(rar) && /offerOrigin && !leadProspectOnly/.test(rar), 'render-audit-report reads the lead’s country and turns the offer and its link off');
const qc = read('../supabase/functions/quick-close/index.ts');
ok(/prospectOnlyLead\(lead as never\) && \["save", "approve_review", "generate_link", "share_link", "share_setup"\]\.includes\(mode\)/.test(qc), 'Quick Close refuses the close answers, review and every link / share for an Australian lead');
ok(/linkUsable\(cur, nowMs\) && !closedNow && !prospectOnlyLead\(lead as never\)/.test(qc), 'Quick Close never hands an Australian lead an existing link');
ok(/LEAD_COLS = "[^"]*\bcountry\b[^"]*\baddress\b/.test(qc), 'Quick Close reads the lead’s country and address (the guard is not blind)');
const fc = read('../supabase/functions/findable-checkout/index.ts');
ok(/service_terminated_at, country, address"\)/.test(fc) && /prospectOnlyLead\(lead as/.test(fc) && /error: "prospect_only_country" \}, 403/.test(fc), 'findable-checkout refuses an Australian lead before Stripe');
const ltv = read('../supabase/functions/_shared/link-template-vars.ts');
ok(/service_terminated_at,country,address"\)/.test(ltv) && /if \(prospectOnlyLead\(lead as never\)\) return \{ ok: false, reason: PROSPECT_ONLY_DETAIL \}/.test(ltv), 'no sign-up / set-up link variable is ever built for an Australian lead');
const swm = read('../supabase/functions/send-whatsapp-message/index.ts');
ok(/prospectOnlyTemplateRefusal\(\{ name: templateName, vars: WA_TEMPLATES\[templateName\]\.vars \}, to, UK_WORDED_TEMPLATES\)/.test(swm) && /error: "prospect_only_country"/.test(swm), 'send-whatsapp-message refuses a sign-up-link / £ template to +61');

console.log('G. Cold WhatsApp to Australia only through its own switch; never by text');
ok(!isUkColdDestination('61412345678'), 'an Australian mobile is not a UK cold destination');
ok(mobileMarketOf('61412345678') === 'AU' && (MARKETS as readonly string[]).includes('AU'), 'Australia is a WhatsApp market of its own (2026-10-22)');
ok(!channelOn(countrySettingsFrom([{ country: 'AU', whatsapp_on: true, sms_on: true, call_on: true }]), 'AU', 'sms'), 'texts to Australia are never on, whatever is stored');

console.log(failures ? `\nFAILED: ${failures}` : '\nAll passed.');
if (failures) process.exit(1);
