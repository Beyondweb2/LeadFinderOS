/* Generated-question guard (Paul, 2026-11-15): real trade only, real towns/counties from the service
   area (Hybrid and Ireland respected), natural wording. Pins the stored-audit faults ("who should I
   switch to for reliable electrical maintenance in Shrewsbury UK", "plumber for stove maintenance in
   Gloucester UK", "best plumbing service for boiler maintenance in Southport UK") and the good set
   ("emergency plumber in Hackney", "boiler service in Bow", "EICR certificate for landlords in
   London", "wedding content creator in Galway").
   Run: npm test generated-question-guard */
import {
  unnaturalWordingReason, unrelatedTradeReason, placeOutsideAreaReason, generatedQuestionReason,
  dropUnfitQuestions, balanceHybrid, namesAreaPlace, tradeFamiliesIn,
} from '../src/lib/generatedQuestionGuard.ts';
import { serviceAreaQuestionDirective, serviceAreasFromDirective } from '../src/lib/auditQuestionContext.ts';
import { moneyFallbackQuestions, moneyQuestionDirective } from '../src/lib/moneyQuestions.ts';
import { hybridAllocation } from '../src/lib/marketModel.ts';
import { readFileSync } from 'node:fs';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('── Wording: the stored-audit faults are dropped ──');
for (const q of [
  'who should I switch to for reliable electrical maintenance in Shrewsbury UK',
  'plumber for stove maintenance in Gloucester UK',
  'best plumbing service for boiler maintenance in Southport UK',
  'electrician for seasonal maintenance in Leeds UK',
  'electrician for all your electrical needs in Leeds UK',
  'best affordable plumber in Hackney UK',
  'reliable and trusted electrician in Bow UK',
  'plumber plumber in Bow',
]) ok(unnaturalWordingReason(q) !== null, `unnatural: "${q}"`);

console.log('── Wording: natural searches pass ──');
for (const q of [
  'emergency plumber in Hackney', 'boiler service in Bow', 'EICR certificate for landlords in London',
  'wedding content creator in Galway', 'best local electrician in Leeds UK', 'top rated plumber in Hackney UK',
  'highly rated locksmith in Wisbech UK', 'best seo services for small businesses uk',
  'who should I switch to if my plumber never gets back to me', 'boiler maintenance in Southport UK',
  'Can you recommend a reliable plumber in Hackney, UK?', 'most reliable plumber in Hackney UK for important work',
  'servicing and maintenance in Hackney',
]) ok(unnaturalWordingReason(q) === null, `natural: "${q}"`);

console.log('── Trade: only the business\'s own trade(s) ──');
ok(unrelatedTradeReason('roofer in Hackney', 'plumber') !== null, 'a plumber is not asked about roofing');
ok(unrelatedTradeReason('emergency electrician in Hackney', 'plumber') !== null, 'a plumber is not asked about an electrician');
ok(unrelatedTradeReason('boiler service in Bow', 'plumber') === null, 'boiler service is plumbing');
ok(unrelatedTradeReason('EICR certificate for landlords in London', 'electrician') === null, 'EICR is electrical');
ok(unrelatedTradeReason('gas safety certificate in Bow', 'electrician') !== null, 'an electrician is not asked for a gas safety certificate');
ok(unrelatedTradeReason('electric boiler installation in Bow', 'plumber') === null, 'a question naming the own trade AND another is not judged off-trade');
ok(unrelatedTradeReason('boiler service in Bow', 'domestic maintenance', ['plumbing', 'electrical', 'gas']) === null, 'multi-trade: a listed trade (plumbing) is allowed');
ok(unrelatedTradeReason('EICR certificate in Bow', 'domestic maintenance', ['plumbing', 'electrical']) === null, 'multi-trade: a listed trade (electrical) is allowed');
ok(unrelatedTradeReason('roof repair in Bow', 'domestic maintenance', ['plumbing', 'electrical']) !== null, 'multi-trade: an unlisted trade (roofing) is not');
ok(unrelatedTradeReason('roof repair in Bow', 'domestic maintenance') === null, 'a trade in no family with no listed services is not judged (absence is not an answer)');
ok(unrelatedTradeReason('wedding content creator in Galway', 'wedding content creator') === null, 'a question with no trade family is never off-trade');
ok(unrelatedTradeReason('car key replacement in Wisbech UK', 'locksmiths') === null, 'locksmith car keys pass');
ok(tradeFamiliesIn('drain cleaning').has('plumbing'), 'drain cleaning carries plumbing (so a plumber keeps it)');

console.log('── Place: town, service areas, counties ──');
const hackney = { town: 'Hackney', areas: ['Bow', 'Shoreditch'], country: 'UK' };
ok(placeOutsideAreaReason('emergency plumber in Hackney', hackney) === null, 'the town');
ok(placeOutsideAreaReason('boiler service in Bow', hackney) === null, 'a service area');
ok(placeOutsideAreaReason('plumber in Hackney UK with great reviews', hackney) === null, 'the town + UK + a trailing qualifier');
ok(placeOutsideAreaReason('emergency plumber in Hackney, London', hackney) === null, 'a qualifier after the town ("Hackney, London")');
ok(placeOutsideAreaReason('plumber in Hackney and Bow', hackney) === null, 'two places both in the area');
ok(placeOutsideAreaReason('plumber in Manchester UK', hackney) !== null, 'a town outside the area is dropped');
ok(placeOutsideAreaReason('plumber in Hackney and Camden', hackney) !== null, 'a second place outside the area is dropped');
ok(placeOutsideAreaReason('Which plumber in Hackney, UK can replace a mortice lock?', hackney) === null, 'customer style: the place ends at the verb');
ok(placeOutsideAreaReason('plumber available in an emergency', hackney) === null, '"in an emergency" is not a place');
ok(placeOutsideAreaReason('plumber who works in the evenings', hackney) === null, '"in the evenings" is not a place');
ok(placeOutsideAreaReason('who is best for seo vs doing it in house uk', { town: '', country: 'UK', marketWords: ['uk'] }) === null, '"in house" is not a place');
ok(placeOutsideAreaReason('seo agency in Manchester', { town: '', country: 'UK', marketWords: ['uk'] }) !== null, 'national: a town is dropped');
ok(placeOutsideAreaReason('seo agency in the uk', { town: '', country: 'UK', marketWords: ['uk'] }) === null, 'national: the market word passes');
ok(placeOutsideAreaReason('plumber in Pune India', { town: 'Mumbai', country: 'India' }) === null, 'other markets are not judged here (unchanged)');

console.log('── Place: Ireland ──');
const mayo = { town: 'Westport', areas: ['Mayo', 'Galway'], country: 'Ireland' };
ok(placeOutsideAreaReason('wedding content creator in Galway', mayo) === null, 'a service area in the Republic');
ok(placeOutsideAreaReason('wedding content creator in Westport, Co. Mayo', mayo) === null, '"Westport, Co. Mayo"');
ok(placeOutsideAreaReason('wedding content creator in Westport, Ireland', mayo) === null, '"Westport, Ireland"');
ok(placeOutsideAreaReason('wedding content creator in Galway UK', mayo) !== null, 'an Ireland business is never qualified with UK');
ok(placeOutsideAreaReason('wedding content creator in Belfast', mayo) !== null, 'Belfast (Northern Ireland) is not in a Mayo business\'s area');
ok(placeOutsideAreaReason('wedding videographer near Newry', mayo) !== null, 'Newry (NI) dropped');
ok(placeOutsideAreaReason('wedding content creator in County Down', mayo) !== null, 'County Down (NI) dropped');
ok(placeOutsideAreaReason('wedding content creator in Belfast', { town: 'Dundalk', areas: ['Belfast', 'Newry'], country: 'Ireland' }) === null, 'Belfast IS allowed when it is in the stated area');
ok(placeOutsideAreaReason('wedding content creator in Cork', mayo) !== null, 'a Republic town outside the area is dropped too');
ok(placeOutsideAreaReason('wedding content creator ireland', { town: '', country: 'Ireland', marketWords: ['ireland'] }) === null, 'national Ireland: the market word');

console.log('── The filter: drops, then tops up to the same count ──');
{
  const generated = [
    'emergency plumber in Hackney UK',
    'plumber for stove maintenance in Hackney UK',
    'best plumbing service for boiler maintenance in Hackney UK',
    'roofer in Hackney UK',
    'boiler repair in Manchester UK',
    'boiler service in Bow UK',
  ];
  const fallback = ['best plumber in Hackney UK', 'top rated plumber in Hackney UK', 'which plumber in Hackney UK do people recommend', 'affordable plumber in Hackney UK'];
  const r = dropUnfitQuestions(generated, fallback, 6, { businessType: 'plumber', town: 'Hackney', areas: ['Bow'], country: 'UK' });
  ok(r.questions.length === 6, `count unchanged (6 asked, ${r.questions.length} returned)`);
  ok(r.rejected.length === 4, `four unfit dropped (${r.rejected.map((x) => x.question).join(' | ')})`);
  ok(r.questions[0] === 'emergency plumber in Hackney UK' && r.questions.includes('boiler service in Bow UK'), 'the good ones are kept, in order');
  ok(r.questions.every((q) => generatedQuestionReason(q, { businessType: 'plumber', town: 'Hackney', areas: ['Bow'], country: 'UK' }) === null), 'every returned question passes');
}
{
  // the money fallback templates must survive the guard they top up
  const money = moneyFallbackQuestions('plumber', 'Hackney UK', 6);
  const bad = money.filter((q) => generatedQuestionReason(q, { businessType: 'plumber', town: 'Hackney', country: 'UK' }) !== null);
  ok(bad.length === 0, `money fallback templates pass the guard${bad.length ? ` — failing: ${bad.join(' | ')}` : ''}`);
}

console.log('── Hybrid: a real mix ──');
{
  const town = 'Leeds';
  const allLocal = Array.from({ length: 8 }, (_, i) => `service ${i} seo agency in Leeds UK`);
  const fallback = ['seo agency in Leeds UK', 'best seo agency in Leeds UK', 'who offers seo uk', 'seo for small businesses uk', 'who can help with seo uk', 'seo companies uk', 'seo specialists uk'];
  const b = balanceHybrid(allLocal, fallback, 8, (q) => namesAreaPlace(q, town));
  const want = hybridAllocation(8);
  ok(b.questions.length === 8, 'count unchanged');
  ok(b.local === want.local && b.wider === want.national, `held at ${want.local} local / ${want.national} wider (got ${b.local}/${b.wider})`);
  ok(b.questions[0] === allLocal[0], 'the model\'s order is kept for what survives');
  const dry = balanceHybrid(allLocal, [], 8, (q) => namesAreaPlace(q, town));
  ok(dry.questions.length === 8, 'with no templates, the other side fills the gap so the count still holds');
  ok(namesAreaPlace('boiler service in Bow UK', 'Hackney', ['Bow']), 'a service-area question counts as local');
}

console.log('── The service areas round-trip through the prompt directive ──');
{
  const d = serviceAreaQuestionDirective('Hackney', ['Hackney', 'Bow', 'St. Albans', 'Shoreditch']);
  const back = serviceAreasFromDirective(`${d}\n\nALREADY MEASURED IN THIS MARKET — x`);
  ok(JSON.stringify(back) === JSON.stringify(['Bow', 'St. Albans', 'Shoreditch']), `areas read back (${JSON.stringify(back)})`);
  ok(serviceAreasFromDirective('').length === 0 && serviceAreasFromDirective('COVER NEW GROUND.').length === 0, 'no directive, no areas');
  ok(d.includes('Do not repeat the same intent for every area'), 'the directive keeps its anti-town-swap line');
}

console.log('── The prompt and the money directive say it too ──');
{
  const src = readFileSync('supabase/functions/create-ai-audit/index.ts', 'utf8');
  ok(src.includes('never "who should I switch to for'), 'prompt bans "who should I switch to for"');
  ok(src.includes('NEVER "[trade] for [something] maintenance"'), 'prompt bans "<trade> for <x> maintenance"');
  ok(src.includes('NEVER ask about a different trade'), 'prompt bans other trades');
  ok(src.includes('NEVER name a Northern Ireland place'), 'prompt carries the Ireland rule');
  ok(/dropUnfitQuestions\(onTrade\.questions/.test(src), 'generateQuestions runs the guard on the generated set');
  ok(/balanceHybrid\(spread\.questions/.test(src), 'the hybrid branch holds the mix');
  const md = moneyQuestionDirective(2, 10, 'Hackney UK');
  ok(md.includes('NEVER "who should I switch to for [service]"') && md.includes('at most 14 words'), 'money directive bans the shape and caps the length');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
